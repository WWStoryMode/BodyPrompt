"""
BodyPrompt inference service.

Exposes the real API contract the frontend talks to:

    POST /generate  { "model": str, "prompt": str }  ->  canonical motion (bodyprompt.motion/v0)

The thing that *produces* the motion is a pluggable backend (see generators.py), chosen by
the BODYPROMPT_BACKEND env var. The default is the no-ML "stub" (hand-authored fixtures);
the v1 "kimodo" backend delegates to an isolated local-GPU worker behind the same contract.
See docs/motion-schema.md and docs/v1-implementation.md.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .generators import make_generator
from .validation import validate_motion

app = FastAPI(
    title="BodyPrompt service",
    description="Turns prompts into canonical motion via a pluggable backend.",
    version="0.1.0",
)

# The Vite dev server (frontend/app) runs on 5173 and calls us from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Build the selected backend once at startup.
GENERATOR = make_generator()


class GenerateRequest(BaseModel):
    model: str = "kimodo"
    prompt: str = Field(min_length=1)
    # >1 asks for a ghost-cloud: the motion plus (variants - 1) seeded siblings.
    variants: int = Field(default=1, ge=1, le=4)
    duration_seconds: float = Field(default=5.0, ge=2.0, le=10.0)
    # The UI deliberately chooses a fresh seed. The API accepts one so a research result
    # can be reproduced without adding a seed control to the instrument.
    seed: int | None = Field(default=None, ge=0, lt=2**31)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "backend": GENERATOR.name,
        "ml": GENERATOR.ml,
        "ready": GENERATOR.ready(),
        "capabilities": GENERATOR.capabilities(),
    }


@app.post("/generate")
def generate(req: GenerateRequest) -> dict:
    """Delegate to the active backend; surface backend errors as a clear message."""
    try:
        return validate_motion(
            GENERATOR.generate(
                req.model,
                req.prompt,
                variants=req.variants,
                duration_seconds=req.duration_seconds,
                seed=req.seed,
            )
        )
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
