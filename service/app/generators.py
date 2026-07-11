"""
Pluggable motion generators — the swappable backends behind `POST /generate`.

One interface, many implementations. The API contract and the whole frontend never
change; only the thing that *produces* the canonical motion swaps out, selected by the
`BODYPROMPT_BACKEND` environment variable (default: "stub").

Today only the no-ML `StubGenerator` exists. Future backends slot in here as their own
small classes, each returning the same canonical motion (bodyprompt.motion/v0):

    - "cloud"  -> CloudGenerator   (calls a hosted model API, e.g. Replicate/Modal)
    - "local"  -> LocalGpuGenerator (loads weights, runs on a CUDA GPU)

See docs/motion-schema.md for the format every generator must emit.
"""

from __future__ import annotations

import json
import math
import os
import pathlib
import random

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

    def generate(self, model: str, prompt: str, variants: int = 1) -> dict:
        """
        Return a canonical motion. When `variants` > 1, the motion also carries a
        `variants` list of siblings (same prompt, different seeds) for the ghost-cloud.
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

    @property
    def count(self) -> int:
        return len(self._fixtures)

    def generate(self, model: str, prompt: str, variants: int = 1) -> dict:
        if not self._fixtures:
            raise RuntimeError("no fixtures found; run `python3 fixtures/_generate.py`")

        # Deterministic pick: same prompt -> same motion.
        idx = (sum(ord(c) for c in prompt) if prompt else 0) % len(self._fixtures)
        motion = dict(self._fixtures[idx])  # shallow copy — don't mutate the cache

        # Echo back what the caller asked for; flag honestly that no model ran.
        motion["prompt"] = prompt or motion.get("prompt", "")
        motion["model"] = model or motion.get("model", "")
        motion["stub"] = True

        # The ghost-cloud: siblings of this motion, one per extra seed. Seeds are derived
        # from the base seed, so the same prompt always yields the same cloud.
        if variants > 1:
            base_seed = int(motion.get("seed", 0))
            motion["variants"] = [
                vary(motion, base_seed + 1000 * i) for i in range(1, variants)
            ]
        return motion


# Registry of known backends. Add cloud/local here as they land.
_BACKENDS = {
    "stub": StubGenerator,
}


def make_generator() -> Generator:
    """Build the generator named by BODYPROMPT_BACKEND (default 'stub')."""
    backend = os.environ.get("BODYPROMPT_BACKEND", "stub").lower()
    factory = _BACKENDS.get(backend)
    if factory is None:
        known = ", ".join(sorted(_BACKENDS))
        raise ValueError(f"unknown BODYPROMPT_BACKEND={backend!r} (known: {known})")
    return factory()
