"""
BodyPrompt inference service — v0 STUB.

This is the real API contract the frontend talks to:

    POST /generate  { "model": str, "prompt": str }  ->  canonical motion (bodyprompt.motion/v0)

...but there is NO ML behind it yet. It simply returns one of the hand-authored
fixtures in ../../fixtures/, chosen by a stable hash of the prompt so the same prompt
always yields the same motion and different prompts feel different. This lets the whole
pipeline (prompt -> service -> canonical motion -> animated stick figure) be real before
a model is wired in at v1. See docs/motion-schema.md.
"""

import json
import pathlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# fixtures/ lives at the repo root: service/app/main.py -> ../../fixtures
FIXTURES_DIR = pathlib.Path(__file__).resolve().parents[2] / "fixtures"

app = FastAPI(
    title="BodyPrompt service (v0 stub)",
    description="Serves hand-authored canonical-motion fixtures. No ML yet.",
    version="0.0.1",
)

# The Vite dev server (frontend/app) runs on localhost:5173 and calls us from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_fixtures() -> list[dict]:
    """Read every *.json fixture (skip the _generate.py helper). Sorted for stable order."""
    motions = []
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        with open(path) as fh:
            motions.append(json.load(fh))
    return motions


# Load once at startup — the fixtures are static.
FIXTURES = _load_fixtures()


class GenerateRequest(BaseModel):
    model: str = "snapmogen"
    prompt: str = ""


@app.get("/health")
def health() -> dict:
    return {"ok": True, "fixtures": len(FIXTURES), "ml": False}


@app.post("/generate")
def generate(req: GenerateRequest) -> dict:
    """
    Return a canonical motion for the prompt.

    STUB behaviour: pick a fixture by a stable hash of the prompt, then echo the caller's
    prompt/model back onto it so the client sees what it asked for. No model runs.
    """
    if not FIXTURES:
        # No fixtures on disk — surface it clearly rather than 500 with a KeyError later.
        return {"error": "no fixtures found; run `python3 fixtures/_generate.py`"}

    # Deterministic pick: same prompt -> same motion; different prompts spread across fixtures.
    idx = (sum(ord(c) for c in req.prompt) if req.prompt else 0) % len(FIXTURES)
    motion = dict(FIXTURES[idx])  # shallow copy so we don't mutate the cached fixture

    # Echo back what the caller asked for (the fixture's own prompt/model are placeholders).
    motion["prompt"] = req.prompt or motion.get("prompt", "")
    motion["model"] = req.model or motion.get("model", "")
    motion["stub"] = True  # be honest: this did not come from a model
    return motion
