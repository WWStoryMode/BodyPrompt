"""
Where a model lives — one contract, several hosts.

v1 fused three questions into a single class: *where does this model live*, *which model
does this request go to*, and *is this model real*. `KimodoGenerator` answered all three,
and answered the last one by hard-coding "kimodo is real, the other two are fixtures". A
second real model cannot exist until they come apart.

This module owns the first question only. A **provider** knows how to reach exactly one
model and nothing about any other; the router in `generators.py` decides which one a
request goes to.

The two implementations that matter:

- `WorkerProvider` — HTTP against a worker that returns canonical motion. **Local and
  remote are the same class.** A worker in a Compose container on this machine and a worker
  on someone else's GPU differ by a URL and an optional token, and by nothing else. That is
  deliberate: the memory ceiling on one laptop is a fact about a laptop, not something the
  architecture should be shaped around.
- `FixtureProvider` — the hand-authored stub, for a model that is not real yet. It exists so
  that "not real yet" is a configuration rather than a branch inside the code.

Provenance is written here, from **what the worker reported**, never from what was asked.
That rule predates this refactor and does not move with it.
"""

from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol
from urllib import error, parse, request


def utc_now() -> str:
    """When something happened, in UTC, to the second.

    Lives here because provenance is written here. A motion has to be able to say *when* it
    was generated, not only how long it took, or the store in `store.py` cannot serve it
    again without the moment collapsing into the moment it was served.
    """
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class GenerationRequest:
    """One request for movement, in the terms every provider understands.

    The public `Generator.generate(...)` keyword signature is the service's contract with
    `main.py` and does not change; the router packs it into this on the way through, so a
    provider takes one argument instead of nine.
    """

    model: str
    prompt: str | None = None
    variants: int = 1
    duration_seconds: float = 5.0
    seed: int | None = None
    post_processing: bool = True
    denoising_steps: int | None = None
    lines: list[dict] | None = None
    transition_frames: int = 5

    @property
    def is_poem(self) -> bool:
        return self.lines is not None


class ModelProvider(Protocol):
    """Everything the router needs to know about one model."""

    model: str
    #: What produced the motion — a model name, or "fixture". The frontend reads this to
    #: decide whether a dropdown entry says "real" or "stub", so it must never flatter.
    source: str
    #: "local", "remote", or "in-process". Descriptive; also decides default concurrency.
    hosting: str
    #: How many generations may run at once. One local GPU can serve one at a time.
    concurrency: int

    def ready(self) -> bool: ...

    def describe(self) -> dict: ...

    def generate(self, req: GenerationRequest) -> dict: ...


# Hosts that are this machine. A Compose service name has no dots, which is the other half
# of the rule below.
_LOOPBACK = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def infer_hosting(url: str) -> str:
    """
    Guess whether a worker URL is on this machine.

    The rule, stated so it can be argued with: loopback is local, and so is a bare hostname
    with no dots, because that is what a Compose service name looks like
    (`http://kimodo-worker:8010`). Anything with a dotted host is remote. It is a heuristic
    and it only decides a default — `..._HOSTING` overrides it, and nothing but the default
    concurrency depends on being right.
    """
    host = parse.urlsplit(url).hostname or ""
    if host in _LOOPBACK or "." not in host:
        return "local"
    return "remote"


class WorkerProvider:
    """
    One model behind an HTTP worker, local or remote.

    The worker returns canonical motion rather than model-native tensors. That keeps each
    model's adapter beside the model version that understands it, and makes this boundary
    equally usable for a Compose worker and a hosted GPU.
    """

    def __init__(
        self,
        model: str,
        url: str,
        *,
        token: str | None = None,
        timeout: float = 120.0,
        hosting: str | None = None,
        concurrency: int | None = None,
    ) -> None:
        self.model = model
        self.source = model
        self._url = url.rstrip("/")
        self._token = token
        self._timeout = timeout
        self.hosting = hosting or infer_hosting(self._url)
        # A single local GPU serves one generation at a time; asking it for three at once
        # is how a triptych turns into an out-of-memory error. A remote host has its own
        # capacity and does not need us to throttle on its behalf.
        self.concurrency = concurrency if concurrency is not None else (
            1 if self.hosting == "local" else 8
        )
        # What the worker says it is running. Learned from the worker rather than declared
        # here, for the same reason as everything else in provenance: this file does not
        # know which checkpoint is loaded on the far side, and guessing would be a claim.
        self._model_version: str | None = None

    # ---- transport ----------------------------------------------------------

    def _json(self, path: str, payload: dict | None = None) -> dict:
        body = None if payload is None else json.dumps(payload).encode()
        headers = {"content-type": "application/json"}
        if self._token:
            headers["authorization"] = f"Bearer {self._token}"
        req = request.Request(
            f"{self._url}{path}",
            data=body,
            headers=headers,
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
            raise RuntimeError(f"{self.model} worker rejected generation: {detail}") from err
        except (error.URLError, TimeoutError) as err:
            raise RuntimeError(f"{self.model} worker unavailable at {self._url}: {err}") from err

    def _health(self) -> dict:
        health = self._json("/health")
        version = health.get("model_version")
        if isinstance(version, str) and version:
            self._model_version = version
        return health

    # ---- the contract -------------------------------------------------------

    def ready(self) -> bool:
        try:
            return bool(self._health().get("ready"))
        except RuntimeError:
            return False

    def describe(self) -> dict:
        return {
            "model": self.model,
            "source": self.source,
            "ready": self.ready(),
            "hosting": self.hosting,
            "model_version": self._model_version,
        }

    def generate(self, req: GenerationRequest) -> dict:
        started = time.perf_counter()
        payload: dict = {
            "variants": req.variants,
            "seed": req.seed,
            "post_processing": req.post_processing,
            "denoising_steps": req.denoising_steps,
            "transition_frames": req.transition_frames,
        }
        # One shape or the other: the worker rejects a request carrying both.
        if req.lines is not None:
            payload["lines"] = req.lines
        else:
            payload["prompt"] = req.prompt
            payload["duration_seconds"] = req.duration_seconds

        motion = self._json("/generate", payload)

        # The worker may never rewrite the researcher's phrasing. For a poem the phrase is
        # the whole poem, and the per-line prompts stay in `segments` where they belong.
        motion["prompt"] = (
            "\n".join(line["prompt"] for line in req.lines)
            if req.lines is not None
            else req.prompt
        )
        motion["model"] = self.model
        motion["stub"] = False
        motion["provenance"] = {
            "source": self.source,
            "backend": self.model,
            "model_version": self._model_version or self._version_or_unknown(),
            "hosting": self.hosting,
            # When, and how long. The store replays a motion without touching either.
            "generated_at": utc_now(),
            "inference_ms": round((time.perf_counter() - started) * 1000),
            # Everything below is what the worker reports it actually DID, not what we
            # asked for. A request and its answer are different claims.
            "post_processing": motion.pop("post_processing", None),
            # The count the worker actually used — a request of None resolves to its
            # configured default, and the motion must be able to say which.
            "denoising_steps": motion.pop("denoising_steps", None),
            # Whether the model really stitched this as one continuous motion, rather than
            # whether we asked it to. `segments` alone would not distinguish a stitched
            # poem from lines merely laid end to end.
            "multi_prompt": motion.pop("multi_prompt", None),
            "transition_frames": motion.pop("transition_frames", None),
        }
        return motion

    def _version_or_unknown(self) -> str:
        """Ask the worker what it is running, once. Never guess on its behalf."""
        try:
            self._health()
        except RuntimeError:
            pass
        return self._model_version or "unknown"


class FixtureProvider:
    """
    A model that is not real yet.

    Delegates to the hand-authored `StubGenerator`, which stamps every motion `stub: true`
    and `source: "fixture"`. Making "not real yet" a provider rather than a branch inside
    the router is what lets a model become real by changing one environment variable.
    """

    hosting = "in-process"
    # No GPU, no network — a fixture is a file read and some arithmetic.
    concurrency = 32

    def __init__(self, model: str, stub) -> None:
        self.model = model
        self.source = "fixture"
        self._stub = stub

    def ready(self) -> bool:
        return self._stub.ready()

    def describe(self) -> dict:
        return {
            "model": self.model,
            "source": self.source,
            "ready": self.ready(),
            "hosting": self.hosting,
            "model_version": "bodyprompt-fixtures/v0",
        }

    def generate(self, req: GenerationRequest) -> dict:
        return self._stub.generate(
            self.model,
            req.prompt,
            variants=req.variants,
            duration_seconds=req.duration_seconds,
            seed=req.seed,
            post_processing=req.post_processing,
            denoising_steps=req.denoising_steps,
            lines=req.lines,
            transition_frames=req.transition_frames,
        )


class Gate:
    """
    How many generations a provider may run at once.

    This lives with hosting, not with the UI. The triptych asks for three models at once and
    should keep doing so — that is correct against three remote endpoints, and the browser
    has no business knowing where the models happen to be today. So the limit is enforced
    here, where the answer is actually known.
    """

    def __init__(self, limit: int) -> None:
        self._semaphore = threading.Semaphore(max(1, limit))

    def __enter__(self):
        self._semaphore.acquire()
        return self

    def __exit__(self, *exc) -> None:
        self._semaphore.release()
