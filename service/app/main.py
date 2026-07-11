"""
BodyPrompt inference service.

Exposes the real API contract the frontend talks to:

    POST /generate  { "model": str, "prompt": str }  ->  canonical motion (bodyprompt.motion/v0)

The thing that *produces* the motion is a pluggable backend (see generators.py), chosen by
the BODYPROMPT_BACKEND env var. Today the default is the no-ML "stub" (hand-authored
fixtures); cloud and local-GPU backends slot in behind the same contract later. See
docs/motion-schema.md.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .generators import make_generator

app = FastAPI(
    title="BodyPrompt service",
    description="Turns prompts into canonical motion via a pluggable backend.",
    version="0.0.2",
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
    model: str = "snapmogen"
    prompt: str = ""
    # >1 asks for a ghost-cloud: the motion plus (variants - 1) seeded siblings.
    variants: int = 1


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "backend": GENERATOR.name,
        "ml": GENERATOR.ml,
        "ready": GENERATOR.ready(),
    }


@app.post("/generate")
def generate(req: GenerateRequest) -> dict:
    """Delegate to the active backend; surface backend errors as a clear message."""
    try:
        return GENERATOR.generate(req.model, req.prompt, variants=max(1, req.variants))
    except RuntimeError as err:
        return {"error": str(err)}
