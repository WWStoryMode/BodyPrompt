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
import os
import pathlib

# fixtures/ lives at the repo root: service/app/generators.py -> ../../fixtures
FIXTURES_DIR = pathlib.Path(__file__).resolve().parents[2] / "fixtures"


class Generator:
    """Base backend. A generator turns (model, prompt) into a canonical motion dict."""

    name: str = "base"
    ml: bool = False  # does this backend actually run a model?

    def ready(self) -> bool:
        """Is this backend usable right now (fixtures present, API key set, GPU up)?"""
        return True

    def generate(self, model: str, prompt: str) -> dict:
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

    def generate(self, model: str, prompt: str) -> dict:
        if not self._fixtures:
            raise RuntimeError("no fixtures found; run `python3 fixtures/_generate.py`")

        # Deterministic pick: same prompt -> same motion.
        idx = (sum(ord(c) for c in prompt) if prompt else 0) % len(self._fixtures)
        motion = dict(self._fixtures[idx])  # shallow copy — don't mutate the cache

        # Echo back what the caller asked for; flag honestly that no model ran.
        motion["prompt"] = prompt or motion.get("prompt", "")
        motion["model"] = model or motion.get("model", "")
        motion["stub"] = True
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
