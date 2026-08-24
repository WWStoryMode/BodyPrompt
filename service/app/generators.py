"""
Pluggable motion generators — the swappable backends behind `POST /generate`.

One interface, many implementations. The API contract and the whole frontend never change;
only the thing that *produces* the canonical motion swaps out.

Two generators live here:

- `StubGenerator` — the no-ML default. Hand-authored fixtures, chosen by a stable hash.
- `RouterGenerator` — **per model**, sends the request to whatever hosts that model: a local
  worker, a remote worker, or the stub. This is the piece that lets one model be real while
  another is still a fixture, without either knowing about the other.

The routing table is configuration, not code (see `make_generator`). Where a model lives is
`providers.py`'s question; this file only decides which provider a request goes to, and
throttles per provider so that three simultaneous requests do not exhaust one local GPU.

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

from .providers import (
    FixtureProvider,
    Gate,
    GenerationRequest,
    ModelProvider,
    WorkerProvider,
)

# The models the instrument names. A model not listed here can still be configured, but
# these three are always present in /health so the dropdown can say what each one is.
KNOWN_MODELS = ("kimodo", "snapmogen", "language-of-motion")

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
        denoising_steps: int | None = None,
        lines: list[dict] | None = None,
        transition_frames: int = 5,
    ) -> dict:
        """
        Return a canonical motion. When `variants` > 1, the motion also carries a
        `variants` list of siblings (same prompt, different seeds) for the ghost-cloud.

        `post_processing` and `denoising_steps` only mean anything to a backend that runs a
        model; a fixture has nothing to clean up and no schedule to walk, and records
        `None` for both.

        `lines` asks for a **poem**: the sentences become one continuous motion, each
        carrying on from where the last left the body, and the result carries a `segments`
        array saying where each line lives in it. `prompt` and `lines` are mutually
        exclusive; the caller has already enforced that.
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
            for model in KNOWN_MODELS
        ]

    @property
    def count(self) -> int:
        return len(self._fixtures)

    def _pick(self, model: str, prompt: str) -> dict:
        """The fixture a given (model, prompt) always resolves to."""
        key = f"{model}:{prompt}"
        return self._fixtures[(sum(ord(c) for c in key) if key else 0) % len(self._fixtures)]

    def _poem(self, model: str, lines: list[dict], transition_frames: int) -> dict:
        """A stand-in poem: one fixture per line, laid end to end.

        HONESTY: a real poem is stitched by the model, which conditions each line on the
        decoded tail of the line before it — the body genuinely carries through. This
        cannot do that. It picks a fixture per line, loops it to the requested length, and
        slides each line so its pelvis starts where the previous line's ended. The joins
        are a translation, not a transition: limbs will jump even though the root does not.
        It exists so the whole poem path — segments, playback, notation — can be exercised
        with no GPU, and every motion it returns says `stub: true`.
        """
        frames: list[dict] = []
        segments: list[dict] = []
        base = self._pick(model, lines[0]["prompt"])
        fps = int(base["fps"])
        carry = [0.0, 0.0]  # where the previous line left the pelvis, in X/Z

        for index, line in enumerate(lines):
            source = self._pick(model, line["prompt"])["frames"]
            wanted = round(float(line["duration_seconds"]) * fps)
            start = len(frames)
            first = source[0]["positions"][0]
            for step in range(wanted):
                frame = source[step % len(source)]  # loop the fixture to fill the line
                positions = [
                    [p[0] - first[0] + carry[0], p[1], p[2] - first[2] + carry[1]]
                    for p in frame["positions"]
                ]
                frames.append({"positions": positions, "rotations": frame["rotations"]})
            carry = [frames[-1]["positions"][0][0], frames[-1]["positions"][0][2]]
            segments.append({
                "index": index,
                "prompt": line["prompt"],
                "start_frame": start,
                "end_frame": len(frames),
                "transition_frames": transition_frames if index < len(lines) - 1 else 0,
                "duration_seconds": float(line["duration_seconds"]),
            })

        motion = dict(base)
        motion["frames"] = frames
        motion["segments"] = segments
        motion["prompt"] = "\n".join(line["prompt"] for line in lines)
        motion["model"] = model or base.get("model", "")
        motion["stub"] = True
        motion.pop("variants", None)  # a poem carries no ghost-cloud; the cloud is per line
        motion["provenance"] = {
            "source": "fixture",
            "backend": self.name,
            "model_version": "bodyprompt-fixtures/v0",
            "inference_ms": 0,
            "post_processing": None,
            "denoising_steps": None,
            # No model stitched this. `segments` says it is a poem; this says nothing
            # generated it, so it can never be mistaken for a real continuous reading.
            "multi_prompt": None,
            "transition_frames": None,
        }
        return motion

    def generate(
        self,
        model: str,
        prompt: str,
        variants: int = 1,
        duration_seconds: float = 5.0,
        seed: int | None = None,
        post_processing: bool = True,
        denoising_steps: int | None = None,
        lines: list[dict] | None = None,
        transition_frames: int = 5,
    ) -> dict:
        if not self._fixtures:
            raise RuntimeError("no fixtures found; run `python3 fixtures/_generate.py`")

        if lines is not None:
            return self._poem(model, lines, transition_frames)

        # Deterministic pick, keyed on BOTH prompt and model: same (prompt, model) always
        # gives the same motion, and the three models give three different ones.
        #
        # HONESTY: this makes the triptych have something to compare, but the differences
        # are an ARBITRARY ARTEFACT OF HASHING — they are not three models interpreting a
        # theme differently. Nothing here can be read as a finding about model behaviour.
        # When a real model lands, these differences become real and this comment goes.
        base = self._pick(model, prompt)

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
            "denoising_steps": None,  # a fixture has no noise schedule to walk
        }

        # The ghost-cloud: siblings of this motion, one per extra seed. Seeds are derived
        # from this motion's seed, so the same (prompt, model) always yields the same cloud.
        if variants > 1:
            motion["variants"] = [
                vary(motion, seed + 1000 * i) for i in range(1, variants)
            ]
        return motion


class RouterGenerator(Generator):
    """
    One generator, many models — each sent wherever it actually lives.

    v1's generator hard-coded the answer to "which of these models is real" in two places:
    a literal list in `capabilities()` and an `if model != "kimodo"` at the top of
    `generate()`. Both were correct exactly once, for exactly one model. Here the registry
    IS the answer, so `capabilities()` is truthful by construction rather than by
    remembering to edit it.
    """

    name = "router"

    def __init__(self, providers: dict[str, ModelProvider]) -> None:
        self._providers = providers
        self._gates = {
            model: Gate(provider.concurrency) for model, provider in providers.items()
        }

    @property
    def ml(self) -> bool:
        """Does anything here actually run a model?"""
        return any(p.source != "fixture" for p in self._providers.values())

    def ready(self) -> bool:
        """
        Usable if **any** model can generate.

        Not all: a Kimodo worker being down should not make the service report itself dead
        when SnapMoGen is up, and the frontend decides what to show per model from
        `capabilities` anyway.
        """
        return any(p.ready() for p in self._providers.values())

    def capabilities(self) -> list[dict]:
        return [self._providers[model].describe() for model in sorted(self._providers)]

    def provider_for(self, model: str) -> ModelProvider:
        provider = self._providers.get(model)
        if provider is None:
            known = ", ".join(sorted(self._providers))
            raise UnknownModel(f"unknown model {model!r} (configured: {known})")
        return provider

    def generate(
        self,
        model: str,
        prompt: str,
        variants: int = 1,
        duration_seconds: float = 5.0,
        seed: int | None = None,
        post_processing: bool = True,
        denoising_steps: int | None = None,
        lines: list[dict] | None = None,
        transition_frames: int = 5,
    ) -> dict:
        provider = self.provider_for(model)
        spec = GenerationRequest(
            model=model,
            prompt=prompt,
            variants=variants,
            duration_seconds=duration_seconds,
            # A seed of None means "pick one" — but the motion has to be able to say which
            # one produced it, so the choice is made here, once, and travels with the
            # request. Leaving it to the worker would put a fact about this motion
            # somewhere the service cannot see.
            seed=seed if seed is not None else secrets.randbelow(2**31),
            post_processing=post_processing,
            denoising_steps=denoising_steps,
            lines=lines,
            transition_frames=transition_frames,
        )
        with self._gates[model]:
            return provider.generate(spec)


class UnknownModel(ValueError):
    """A model nothing is configured to serve. A bad request, not a broken service."""


def _env_key(model: str) -> str:
    """`language-of-motion` -> `BODYPROMPT_MODEL_LANGUAGE_OF_MOTION`."""
    return "BODYPROMPT_MODEL_" + model.upper().replace("-", "_")


def _provider_for(model: str, stub: StubGenerator) -> ModelProvider:
    """
    Build one model's provider from the environment.

        BODYPROMPT_MODEL_KIMODO=http://kimodo-worker:8010   # a worker, local or remote
        BODYPROMPT_MODEL_SNAPMOGEN=fixture                  # not real yet

    A URL is a worker and nothing else distinguishes a container on this machine from a GPU
    somewhere else. The optional companions — `_TOKEN`, `_HOSTING`, `_CONCURRENCY` — exist
    for the remote case and for overriding the hosting guess in `providers.infer_hosting`.
    """
    key = _env_key(model)
    target = os.environ.get(key, "").strip()
    if not target or target.lower() == "fixture":
        return FixtureProvider(model, stub)

    concurrency = os.environ.get(f"{key}_CONCURRENCY", "").strip()
    return WorkerProvider(
        model,
        target,
        token=os.environ.get(f"{key}_TOKEN") or None,
        timeout=float(os.environ.get("BODYPROMPT_INFERENCE_TIMEOUT", "120")),
        hosting=os.environ.get(f"{key}_HOSTING") or None,
        concurrency=int(concurrency) if concurrency else None,
    )


def _apply_legacy_backend() -> None:
    """
    Keep `BODYPROMPT_BACKEND` working.

    Every existing document, compose file and shell alias in this repository says
    `BODYPROMPT_BACKEND=kimodo`. Breaking them to make a refactor tidier would be a bad
    trade, so the old variable is translated into the new per-model one — and only when the
    new one is not already set, so being explicit always wins.
    """
    backend = os.environ.get("BODYPROMPT_BACKEND", "").strip().lower()
    if backend != "kimodo":
        return
    key = _env_key("kimodo")
    if not os.environ.get(key):
        os.environ[key] = os.environ.get(
            "BODYPROMPT_KIMODO_URL", "http://127.0.0.1:8010"
        )


def make_generator() -> Generator:
    """
    Build the router from the environment.

    Every known model gets a provider, so `/health` always describes all three and the
    dropdown never has a silent hole in it. Models configured beyond the known three are
    added too, which is how a fourth arrives without a code change.
    """
    stub = StubGenerator()
    _apply_legacy_backend()

    configured = {
        key[len("BODYPROMPT_MODEL_"):].lower().replace("_", "-")
        for key in os.environ
        if key.startswith("BODYPROMPT_MODEL_")
        and not key.endswith(("_TOKEN", "_HOSTING", "_CONCURRENCY"))
    }
    models = sorted(set(KNOWN_MODELS) | configured)
    return RouterGenerator({model: _provider_for(model, stub) for model in models})
