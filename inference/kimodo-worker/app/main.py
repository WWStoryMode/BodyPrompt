"""Local GPU worker: Kimodo → SOMA adapter → canonical BodyPrompt motion."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .adapter import adapt_motion

MODEL_VERSION = "Kimodo-SOMA-RP-v1.1"
FPS = 30


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    duration_seconds: float = Field(default=5.0, ge=2.0, le=10.0)
    variants: int = Field(default=1, ge=1, le=4)
    seed: int = Field(ge=0, lt=2**31)


@lru_cache(maxsize=1)
def get_model():
    """Load once. Import lazily so `/health` can explain a missing runtime cleanly."""
    from kimodo import load_model

    return load_model(MODEL_VERSION, device="cuda")


@asynccontextmanager
async def lifespan(application: FastAPI):
    # Keep the worker alive on failure so `/health` can say whether the problem is CUDA,
    # gated weights, the token, or model loading. It must never claim ready before load.
    application.state.load_error = None
    try:
        get_model()
    except Exception as err:  # third-party loaders raise several environment-specific types
        application.state.load_error = str(err)
    yield
    get_model.cache_clear()


app = FastAPI(
    title="BodyPrompt Kimodo worker",
    description="Private local-GPU provider. Returns canonical motion, never rendered video.",
    version="0.1.0",
    lifespan=lifespan,
)


def _numpy(value) -> np.ndarray:
    if hasattr(value, "detach"):
        value = value.detach().cpu()
    return np.asarray(value)


def _joint_names(model) -> list[str]:
    skeleton = getattr(model, "skeleton", None)
    for attr in ("joint_names", "names"):
        names = getattr(skeleton, attr, None)
        if names is not None:
            return [str(name) for name in names]
    raise RuntimeError("Kimodo model did not expose skeleton joint names")


def _one(model, req: GenerateRequest, seed: int) -> dict:
    # Kimodo honours torch's generator seed. Keep all seeding here, beside the model.
    import torch

    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    output = model(
        prompt=req.prompt,  # raw on purpose: prompt mediation would change the research
        num_frames=round(req.duration_seconds * FPS),
        num_denoising_steps=int(os.environ.get("BODYPROMPT_DIFFUSION_STEPS", "100")),
    )
    if not isinstance(output, dict):
        raise RuntimeError(f"unexpected Kimodo output type: {type(output).__name__}")

    positions = _numpy(output["posed_joints"])
    rotations = _numpy(output["local_rot_mats"])
    # The low-level API may retain a batch dimension for one sample.
    if positions.ndim == 4:
        positions = positions[0]
    if rotations.ndim == 5:
        rotations = rotations[0]
    return adapt_motion(
        positions,
        rotations,
        _joint_names(model),
        fps=FPS,
        prompt=req.prompt,
        seed=seed,
    )


@app.get("/health")
def health() -> dict:
    try:
        import torch
        import kimodo  # noqa: F401

        cuda = torch.cuda.is_available()
        load_error = getattr(app.state, "load_error", "model startup has not run")
        return {
            "ok": True,
            "ready": cuda and load_error is None and get_model.cache_info().currsize == 1,
            "cuda": cuda,
            "model_version": MODEL_VERSION,
            "text_encoder_device": os.environ.get("TEXT_ENCODER_DEVICE", "cuda"),
            "error": load_error,
        }
    except ImportError as err:
        return {"ok": False, "ready": False, "error": str(err)}


@app.post("/generate")
def generate(req: GenerateRequest) -> dict:
    try:
        model = get_model()
        samples = [_one(model, req, req.seed + i) for i in range(req.variants)]
        primary = samples[0]
        if len(samples) > 1:
            primary["variants"] = samples[1:]
        return primary
    except (KeyError, RuntimeError, ValueError) as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
