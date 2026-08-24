"""
What we remember — independent of which model is loaded, or whether any is.

v1 and v2 kept nothing. Every motion existed only for as long as the tab that asked for it,
and a generation that took Kimodo forty seconds on a GPU was thrown away the moment someone
reloaded. That made *remembering* a property of hosting: you could only see a Kimodo motion
while the Kimodo worker was up.

This module takes remembering apart from hosting. A motion is written to disk under a key
derived from **everything that determined it** — the model, the prompt or the lines, the
seed, the sampling settings — so the same request can be answered again without the model
that answered it the first time.

## The honesty rule

A stored motion is **the same generation**, served again. It is not a new one, and nothing
here may let it read as one:

- `provenance.served_from_store` becomes `true`.
- `provenance.generated_at` is the **original** moment, untouched.
- `provenance.inference_ms` is the **original** duration, untouched. Refreshing it to the
  milliseconds a disk read took would be a lie about how fast the model is, and it would be
  a lie that flatters — exactly the kind this repository exists to not tell.
- `provenance.served_at` is added, so the two moments can never be confused for one.

## What is *not* keyed

`denoising_steps: null` means "whatever the worker's default is". Two requests a month apart
can both say `null` and mean different numbers if the worker's configuration changed between
them. The key records the request as it was asked; `provenance.denoising_steps` records the
number that actually ran. So a changed default is *visible in the record* rather than hidden
by it — but a hit on a `null` request is a hit on the older default, and that is a thing to
know when reading a result back.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import threading

from .providers import GenerationRequest, utc_now

#: Bumped when the key's inputs change, so a new format can never collide with an old one.
STORE_FORMAT = 1

#: How many motions to keep. Generous — a motion is a few hundred KB — but not unbounded:
#: an instrument left running for a term should not quietly fill a disk. Eviction is safe
#: because a session file (see docs/session-schema.md) carries its own motions; the store is
#: a convenience, never the only copy of anyone's work.
DEFAULT_LIMIT = 500


def key_for(req: GenerationRequest) -> str:
    """
    The fingerprint of a request: everything that decides what comes back, and nothing else.

    Two knobs are deliberately nulled out when they cannot matter — `duration_seconds` for a
    poem, whose lines carry their own, and `transition_frames` for a single prompt, which has
    nothing to transition into. Letting an irrelevant control split the key would mean two
    identical requests missing each other over a number neither of them used.
    """
    payload = {
        "format": STORE_FORMAT,
        "model": req.model,
        "prompt": req.prompt,
        "lines": (
            [
                {
                    "prompt": line["prompt"],
                    "duration_seconds": float(line["duration_seconds"]),
                }
                for line in req.lines
            ]
            if req.lines is not None
            else None
        ),
        "variants": req.variants,
        "duration_seconds": None if req.is_poem else float(req.duration_seconds),
        "seed": req.seed,
        "post_processing": req.post_processing,
        "denoising_steps": req.denoising_steps,
        "transition_frames": req.transition_frames if req.is_poem else None,
    }
    digest = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(digest).hexdigest()


def mark_fresh(motion: dict) -> dict:
    """Stamp a motion that was just generated. Says `false` out loud rather than by absence."""
    provenance = motion.setdefault("provenance", {})
    provenance["served_from_store"] = False
    return motion


def mark_served(motion: dict) -> dict:
    """
    Stamp a motion that came back off the disk.

    Everything about the original generation is left exactly as it was recorded — see the
    honesty rule at the top of this file. The only additions are the two facts that are
    true of *this* serving.
    """
    provenance = motion.setdefault("provenance", {})
    provenance["served_from_store"] = True
    provenance["served_at"] = utc_now()
    return motion


class MotionStore:
    """
    Motions on disk, keyed by the request that produced them.

    Deliberately a directory of plain JSON rather than a database: a researcher can look at
    what the instrument remembers with `ls` and `cat`, copy one out, or delete one, without
    this repository being involved. Each entry is two files — the motion, and a small
    `.meta.json` beside it so the listing does not have to parse megabytes to say what is
    there.

    Disabled (`enabled == False`) is a supported state, not a failure: with no directory
    configured, or one that cannot be written, every `get` misses and every `put` is a no-op,
    and the service works exactly as it did before this module existed.
    """

    def __init__(self, root: str | os.PathLike | None, *, limit: int = DEFAULT_LIMIT) -> None:
        self.limit = max(0, limit)
        self.error: str | None = None
        self.root: pathlib.Path | None = None
        # Writes are not atomic across two files, and uvicorn serves requests on a thread
        # pool. One lock for the whole store: contention is a non-issue next to the seconds
        # a generation takes.
        self._lock = threading.Lock()

        if root is None:
            return
        path = pathlib.Path(root).expanduser()
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe = path / ".writable"
            probe.write_text("")
            probe.unlink()
        except OSError as err:
            # A store that cannot be written must say so in /health rather than raise on
            # every generation. Remembering is a convenience; hosting is the service's job.
            self.error = f"{path}: {err.strerror or err}"
            return
        self.root = path

    @property
    def enabled(self) -> bool:
        return self.root is not None and self.limit > 0

    # ---- paths --------------------------------------------------------------

    def _motion_path(self, key: str) -> pathlib.Path:
        assert self.root is not None
        return self.root / f"{key}.json"

    def _meta_path(self, key: str) -> pathlib.Path:
        assert self.root is not None
        return self.root / f"{key}.meta.json"

    # ---- the contract -------------------------------------------------------

    def get(self, key: str) -> dict | None:
        """The motion recorded under `key`, or None. Never raises on a damaged entry."""
        if not self.enabled:
            return None
        path = self._motion_path(key)
        try:
            with self._lock:
                with open(path) as fh:
                    motion = json.load(fh)
                # Last use, for eviction: what is being replayed is what is worth keeping.
                os.utime(path, None)
        except (OSError, json.JSONDecodeError):
            return None
        return motion if isinstance(motion, dict) else None

    def put(self, key: str, motion: dict, req: GenerationRequest) -> None:
        """Record a motion. A store that cannot write must never break a generation."""
        if not self.enabled:
            return
        meta = {
            "key": key,
            "recorded_at": utc_now(),
            "model": req.model,
            # A poem's prompt is its lines joined; the motion already carries the joined
            # form, and this is only ever for a human reading the listing.
            "prompt": motion.get("prompt", req.prompt or ""),
            "lines": len(req.lines) if req.lines is not None else None,
            "seed": motion.get("seed", req.seed),
            "frames": len(motion.get("frames", [])),
            "fps": motion.get("fps"),
            "variants": req.variants,
            "source": (motion.get("provenance") or {}).get("source"),
            "model_version": (motion.get("provenance") or {}).get("model_version"),
            "generated_at": (motion.get("provenance") or {}).get("generated_at"),
        }
        try:
            with self._lock:
                self._write(self._motion_path(key), motion)
                self._write(self._meta_path(key), meta)
                self._evict()
        except OSError as err:
            self.error = f"write failed: {err.strerror or err}"

    def entries(self, limit: int = 50) -> list[dict]:
        """What is remembered, most recently recorded first. Metadata only, never motions."""
        if not self.enabled:
            return []
        found: list[dict] = []
        for path in self.root.glob("*.meta.json"):  # type: ignore[union-attr]
            try:
                with open(path) as fh:
                    meta = json.load(fh)
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(meta, dict):
                found.append(meta)
        found.sort(key=lambda meta: str(meta.get("recorded_at", "")), reverse=True)
        return found[:limit]

    def stats(self) -> dict:
        """What /health says about memory. Cheap: stat calls, no parsing."""
        if not self.enabled:
            return {"enabled": False, "error": self.error}
        motions = list(self.root.glob("*.json"))  # type: ignore[union-attr]
        motions = [path for path in motions if not path.name.endswith(".meta.json")]
        return {
            "enabled": True,
            "path": str(self.root),
            "entries": len(motions),
            "limit": self.limit,
            "bytes": sum(path.stat().st_size for path in motions if path.exists()),
            "error": self.error,
        }

    # ---- internals ----------------------------------------------------------

    @staticmethod
    def _write(path: pathlib.Path, payload: dict) -> None:
        """Write via a temporary file so a crash mid-write cannot leave half a motion."""
        tmp = path.with_suffix(path.suffix + ".tmp")
        with open(tmp, "w") as fh:
            json.dump(payload, fh)
        os.replace(tmp, path)

    def _evict(self) -> None:
        """Drop least-recently-used entries until the store is within its limit."""
        assert self.root is not None
        motions = [
            path for path in self.root.glob("*.json") if not path.name.endswith(".meta.json")
        ]
        if len(motions) <= self.limit:
            return
        motions.sort(key=lambda path: path.stat().st_mtime)
        for path in motions[: len(motions) - self.limit]:
            key = path.stem
            path.unlink(missing_ok=True)
            self._meta_path(key).unlink(missing_ok=True)


def make_store() -> MotionStore:
    """
    Build the store from the environment.

        BODYPROMPT_STORE_DIR=service/.motions   # unset disables remembering entirely
        BODYPROMPT_STORE_LIMIT=500

    The default is on, at `service/.motions`, because the failure this stage exists to fix —
    losing a forty-second generation to a reload — is the default experience otherwise.
    """
    configured = os.environ.get("BODYPROMPT_STORE_DIR", "").strip()
    if configured.lower() in {"off", "none", "disabled"}:
        return MotionStore(None)
    root = configured or str(pathlib.Path(__file__).resolve().parents[1] / ".motions")
    raw_limit = os.environ.get("BODYPROMPT_STORE_LIMIT", "").strip()
    try:
        limit = int(raw_limit) if raw_limit else DEFAULT_LIMIT
    except ValueError:
        limit = DEFAULT_LIMIT
    return MotionStore(root, limit=limit)
