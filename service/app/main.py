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
from pydantic import BaseModel, Field, model_validator

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


class Line(BaseModel):
    """One sentence of a poem: a prompt, and how long the body has to answer it."""

    prompt: str = Field(min_length=1)
    duration_seconds: float = Field(default=5.0, ge=2.0, le=10.0)


class GenerateRequest(BaseModel):
    model: str = "kimodo"
    # Exactly one of `prompt` or `lines`. `lines` is a poem: the sentences are generated as
    # one continuous motion, each carrying on from where the last one left the body.
    prompt: str | None = Field(default=None, min_length=1)
    lines: list[Line] | None = Field(default=None, min_length=1)
    # >1 asks for a ghost-cloud: the motion plus (variants - 1) seeded siblings.
    variants: int = Field(default=1, ge=1, le=4)
    duration_seconds: float = Field(default=5.0, ge=2.0, le=10.0)
    # The UI deliberately chooses a fresh seed. The API accepts one so a research result
    # can be reproduced without adding a seed control to the instrument.
    seed: int | None = Field(default=None, ge=0, lt=2**31)
    # Kimodo's foot-skate and constraint cleanup; ignored by fixture backends. Which one
    # produced a given motion is recorded in its provenance.
    post_processing: bool = True
    # Kimodo's DDIM sampling steps — an absolute count, not a fraction. Fewer steps is
    # faster and shifts the motion; 75 was calibrated as the highest setting inside the
    # latency budget. None uses the worker's configured default. Meaningless to fixture
    # backends, and recorded in provenance either way.
    denoising_steps: int | None = Field(default=None, ge=1, le=500)
    # Frames overlapped between consecutive lines of a poem; ignored for a single prompt.
    transition_frames: int = Field(default=5, ge=1, le=30)

    @model_validator(mode="after")
    def _one_shape_or_the_other(self) -> "GenerateRequest":
        if (self.prompt is None) == (self.lines is None):
            raise ValueError("send either 'prompt' or 'lines', not both and not neither")
        if self.lines is not None and self.variants != 1:
            # The ghost-cloud is a per-line instrument — see docs/motion-schema.md.
            raise ValueError("variants apply to a single prompt, not to a poem")
        return self


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
                post_processing=req.post_processing,
                denoising_steps=req.denoising_steps,
                lines=[line.model_dump() for line in req.lines] if req.lines else None,
                transition_frames=req.transition_frames,
            )
        )
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
