"""
Pluggable motion generators — the swappable backends behind `POST /generate`.

One interface, many implementations. The API contract and the whole frontend never
change; only the thing that *produces* the canonical motion swaps out, selected by the
`BODYPROMPT_BACKEND` environment variable (default: "stub").

The default remains the no-ML `StubGenerator`. The v1 "kimodo" backend is deliberately an
HTTP boundary: this small service stays usable without CUDA, while a local Docker worker
owns Kimodo's large model/runtime. Pointing the same boundary at another machine later does
not change the browser or the canonical motion contract.

See docs/motion-schema.md for the format every generator must emit.
"""

from __future__ import annotations

import json
import math
import os
import pathlib
import random
import secrets
import time
from urllib import error, request

# fixtures/ lives at the repo root: service/app/generators.py -> ../../fixtures
FIXTURES_DIR = pathlib.Path(__file__).resolve().parents[2] / "fixtures"

# How far each joint may wander between seeds, in metres.
#
# This is the shape of the ghost-cloud: the root and spine barely move while the
# extremities vary a lot — so a cloud reads as "the same intention, differently
# expressed", not as random noise. A real model's variance behaves the same way:
# it agrees about what the body is doing and disagrees about exactly how.
_WANDER = {
    "pelvis": 0.012,
    "left_hip": 0.012, "right_hip": 0.012,
    "spine1": 0.016, "spine2": 0.018, "spine3": 0.020,
    "left_knee": 0.020, "right_knee": 0.020,
    "left_ankle": 0.016, "right_ankle": 0.016,
    "left_foot": 0.016, "right_foot": 0.016,
    "neck": 0.025,
    "left_collar": 0.020, "right_collar": 0.020,
    "head": 0.035,
    "left_shoulder": 0.030, "right_shoulder": 0.030,
    "left_elbow": 0.050, "right_elbow": 0.050,
    "left_wrist": 0.070, "right_wrist": 0.070,
}
_DEFAULT_WANDER = 0.03


def vary(motion: dict, seed: int) -> dict:
    """
    Produce a sibling of `motion` for a given seed — the same movement, expressed slightly
    differently. Deterministic: the same (motion, seed) always yields the same result.

    NOT a model sampling a different output. Each joint gets a smooth, low-frequency
    sinusoidal wander whose amplitude/frequency/phase come from the seeded RNG, with the
    amplitude scaled per joint by _WANDER. Vertical wander is damped (0.6) so the figure
    doesn't bob off the floor.
    """
    rng = random.Random(seed)
    joints: list[str] = motion["joints"]
    frames: list[dict] = motion["frames"]
    n = len(frames)

    # One (amplitude, frequency, phase-per-axis) triple per joint.
    params = []
    for name in joints:
        amp = _WANDER.get(name, _DEFAULT_WANDER) * rng.uniform(0.55, 1.45)
        freq = rng.uniform(0.6, 1.7)
        phase = [rng.uniform(0.0, math.tau) for _ in range(3)]
        params.append((amp, freq, phase))

    new_frames = []
    for f, frame in enumerate(frames):
        t = f / max(1, n - 1)
        positions = []
        for j, p in enumerate(frame["positions"]):
            amp, freq, phase = params[j]
            angle = math.tau * t * freq
            positions.append([
                round(p[0] + amp * math.sin(angle + phase[0]), 4),
                round(p[1] + amp * 0.6 * math.sin(angle + phase[1]), 4),
                round(p[2] + amp * math.sin(angle + phase[2]), 4),
            ])
        # rotations are reserved/identity in v0 — carry them through untouched
        new_frames.append({"positions": positions, "rotations": frame["rotations"]})

    sibling = dict(motion)
    sibling["frames"] = new_frames
    sibling["seed"] = seed
    sibling.pop("variants", None)  # a variant never carries its own variants
    return sibling


class Generator:
    """Base backend. A generator turns (model, prompt) into a canonical motion dict."""

    name: str = "base"
    ml: bool = False  # does this backend actually run a model?

    def ready(self) -> bool:
        """Is this backend usable right now (fixtures present, API key set, GPU up)?"""
        return True

    def capabilities(self) -> list[dict]:
        """Describe which model labels are real and which are still fixtures."""
        return []

    def generate(
        self,
        model: str,
        prompt: str,
        variants: int = 1,
        duration_seconds: float = 5.0,
        seed: int | None = None,
        post_processing: bool = True,
    ) -> dict:
        """
        Return a canonical motion. When `variants` > 1, the motion also carries a
        `variants` list of siblings (same prompt, different seeds) for the ghost-cloud.

        `post_processing` only means anything to a backend that runs a model; a fixture
        has nothing to clean up and records `None` for it.
        """
        raise NotImplementedError


class StubGenerator(Generator):
    """
    No-ML backend: returns a hand-authored fixture chosen by a stable hash of the prompt,
    so the same prompt always yields the same motion and different prompts spread across
    fixtures. Lets the whole pipeline be real before any model exists.
    """

    name = "stub"
    ml = False

    def __init__(self) -> None:
        self._fixtures = self._load_fixtures()

    @staticmethod
    def _load_fixtures() -> list[dict]:
        motions: list[dict] = []
        for path in sorted(FIXTURES_DIR.glob("*.json")):
            with open(path) as fh:
                motions.append(json.load(fh))
        return motions

    def ready(self) -> bool:
        return len(self._fixtures) > 0

    def capabilities(self) -> list[dict]:
        return [
            {"model": model, "source": "fixture", "ready": self.ready()}
            for model in ("snapmogen", "language-of-motion", "kimodo")
        ]

    @property
    def count(self) -> int:
        return len(self._fixtures)

    def generate(
        self,
        model: str,
        prompt: str,
        variants: int = 1,
        duration_seconds: float = 5.0,
        seed: int | None = None,
        post_processing: bool = True,
    ) -> dict:
        if not self._fixtures:
            raise RuntimeError("no fixtures found; run `python3 fixtures/_generate.py`")

        # Deterministic pick, keyed on BOTH prompt and model: same (prompt, model) always
        # gives the same motion, and the three models give three different ones.
        #
        # HONESTY: this makes the triptych have something to compare, but the differences
        # are an ARBITRARY ARTEFACT OF HASHING — they are not three models interpreting a
        # theme differently. Nothing here can be read as a finding about model behaviour.
        # When a real model lands, these differences become real and this comment goes.
        key = f"{model}:{prompt}"
        idx = (sum(ord(c) for c in key) if key else 0) % len(self._fixtures)
        base = self._fixtures[idx]

        # There are only a handful of fixtures, so two models can hash to the same one and
        # would then render identically — a triptych of twins. Give each model a stable
        # signature and vary the motion by it, so the three panels always differ.
        model_sig = sum(ord(c) for c in model) * 7919 if model else 0
        seed = int(base.get("seed", 0)) + model_sig
        motion = vary(base, seed) if model_sig else dict(base)

        # Echo back what the caller asked for; flag honestly that no model ran.
        motion["prompt"] = prompt or base.get("prompt", "")
        motion["model"] = model or base.get("model", "")
        motion["stub"] = True
        motion["provenance"] = {
            "source": "fixture",
            "backend": self.name,
            "model_version": "bodyprompt-fixtures/v0",
            "inference_ms": 0,
            "post_processing": None,  # nothing ran, so there was nothing to clean up
        }

        # The ghost-cloud: siblings of this motion, one per extra seed. Seeds are derived
        # from this motion's seed, so the same (prompt, model) always yields the same cloud.
        if variants > 1:
            motion["variants"] = [
                vary(motion, seed + 1000 * i) for i in range(1, variants)
            ]
        return motion


class KimodoGenerator(Generator):
    """
    Hybrid v1 backend: Kimodo is real; the other named models remain honest fixtures.

    The worker returns canonical motion rather than model-native tensors. That keeps the
    SOMA adapter beside the model version it understands and makes this boundary equally
    usable for a local Compose worker or, later, a remote GPU.
    """

    name = "kimodo"
    ml = True
    model_version = "Kimodo-SOMA-RP-v1.1"

    def __init__(self) -> None:
        self._stub = StubGenerator()
        self._url = os.environ.get("BODYPROMPT_KIMODO_URL", "http://127.0.0.1:8010").rstrip("/")
        self._timeout = float(os.environ.get("BODYPROMPT_INFERENCE_TIMEOUT", "120"))

    def _json(self, path: str, payload: dict | None = None) -> dict:
        body = None if payload is None else json.dumps(payload).encode()
        req = request.Request(
            f"{self._url}{path}",
            data=body,
            headers={"content-type": "application/json"},
            method="GET" if body is None else "POST",
        )
        try:
            with request.urlopen(req, timeout=self._timeout) as response:
                return json.load(response)
        except error.HTTPError as err:
            try:
                detail = json.load(err).get("detail", str(err))
            except (json.JSONDecodeError, AttributeError):
                detail = str(err)
            raise RuntimeError(f"Kimodo worker rejected generation: {detail}") from err
        except (error.URLError, TimeoutError) as err:
            raise RuntimeError(f"Kimodo worker unavailable at {self._url}: {err}") from err

    def ready(self) -> bool:
        try:
            return bool(self._json("/health").get("ready"))
        except RuntimeError:
            return False

    def capabilities(self) -> list[dict]:
        return [
            {"model": "kimodo", "source": "kimodo", "ready": self.ready()},
            {"model": "snapmogen", "source": "fixture", "ready": self._stub.ready()},
            {"model": "language-of-motion", "source": "fixture", "ready": self._stub.ready()},
        ]

    def generate(
        self,
        model: str,
        prompt: str,
        variants: int = 1,
        duration_seconds: float = 5.0,
        seed: int | None = None,
        post_processing: bool = True,
    ) -> dict:
        if model != "kimodo":
            return self._stub.generate(
                model, prompt, variants, duration_seconds, seed, post_processing
            )

        chosen_seed = seed if seed is not None else secrets.randbelow(2**31)
        started = time.perf_counter()
        motion = self._json(
            "/generate",
            {
                "prompt": prompt,
                "duration_seconds": duration_seconds,
                "variants": variants,
                "seed": chosen_seed,
                "post_processing": post_processing,
            },
        )
        motion["prompt"] = prompt  # the worker may never rewrite the researcher's phrase
        motion["model"] = "kimodo"
        motion["stub"] = False
        motion["provenance"] = {
            "source": "kimodo",
            "backend": self.name,
            "model_version": self.model_version,
            "inference_ms": round((time.perf_counter() - started) * 1000),
            # What the worker reports it actually did, not what we asked for.
            "post_processing": motion.pop("post_processing", None),
        }
        return motion


def make_generator() -> Generator:
    """Build the generator named by BODYPROMPT_BACKEND (default 'stub')."""
    backend = os.environ.get("BODYPROMPT_BACKEND", "stub").lower()
    factory = {"stub": StubGenerator, "kimodo": KimodoGenerator}.get(backend)
    if factory is None:
        known = "kimodo, stub"
        raise ValueError(f"unknown BODYPROMPT_BACKEND={backend!r} (known: {known})")
    return factory()
