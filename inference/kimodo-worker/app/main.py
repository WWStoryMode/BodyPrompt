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
    # Kimodo's foot-skate and constraint cleanup. On by default, as in Kimodo's own CLI:
    # unplanted feet would corrupt the floor-path and Laban support readings. Ask for
    # False to see the denoiser's raw output; either way the answer is recorded in
    # provenance, so no motion is ambiguous about which one it is.
    post_processing: bool = True
    # DDIM sampling steps. An absolute count, not a fraction: the model walks back along
    # its noise schedule in this many hops, so fewer steps is a coarser path to a fully
    # denoised motion, not a truncated one. None means "use the configured default".
    denoising_steps: int | None = Field(default=None, ge=1, le=500)


# Whether the text-embedding cache is active, reported by /health. A miss here costs speed
# and nothing else, so it must never stop the worker — but it must never be silent either.
EMBEDDING_CACHE_STATE = "model not loaded"


def _cached_text_encoder_class():
    """Kimodo's disk-backed embedding cache, loaded without running its package __init__.

    `kimodo.demo.__init__` imports the viser-based demo UI, and viser is an optional extra
    this worker deliberately does not install — so a plain
    `from kimodo.demo.embedding_cache import ...` would fail on a module that itself needs
    only numpy and torch. Loading it by path skips the parent. Reaching into a private
    submodule is only safe because the Dockerfile pins the Kimodo commit; if that pin is
    ever bumped, check this file still exists before trusting the speed-up.
    """
    import importlib.util
    import pathlib

    import kimodo

    path = pathlib.Path(kimodo.__file__).parent / "demo" / "embedding_cache.py"
    spec = importlib.util.spec_from_file_location("kimodo_embedding_cache", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"no loadable embedding cache at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.CachedTextEncoder


def _enable_embedding_cache(model) -> str:
    """Memoise the text encoder so a repeated prompt skips the CPU Llama-3-8B pass.

    Every sibling in a ghost-cloud encodes the *same* phrase, and the encoder runs on CPU to
    keep VRAM free — so this is most of the per-variant cost. The embedding is a pure
    function of the text, so reusing it changes nothing about what gets generated: each
    variant still seeds itself and stays reproducible alone. That is the whole reason to
    cache rather than batch into one `num_samples=N` call, which would buy the same time by
    dissolving the per-variant seed.
    """
    if not hasattr(model, "text_encoder"):
        return "off: model exposes no text_encoder"
    try:
        cached = _cached_text_encoder_class()
    except Exception as err:  # a missing or moved submodule, or an import-time failure
        return f"off: {type(err).__name__}: {err}"
    model.text_encoder = cached(model.text_encoder, model_name=MODEL_VERSION)
    return "on"


@lru_cache(maxsize=1)
def get_model():
    """Load once. Import lazily so `/health` can explain a missing runtime cleanly."""
    global EMBEDDING_CACHE_STATE
    from kimodo import load_model

    model = load_model(MODEL_VERSION, device="cuda")
    EMBEDDING_CACHE_STATE = _enable_embedding_cache(model)
    return model


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


def _output_skeleton(model):
    """The skeleton the *returned* motion is expressed in.

    Kimodo's SOMA models denoise on somaskel30 but convert their output to somaskel77
    before returning it, so `model.skeleton` names the wrong body: reading joint names
    from it would index a 77-joint motion with a 30-joint name list.
    """
    skeleton = getattr(model, "output_skeleton", None)
    if skeleton is None:
        skeleton = getattr(model, "skeleton", None)
    if skeleton is None:
        raise RuntimeError("Kimodo model did not expose an output skeleton")
    return skeleton


def _joint_names(skeleton) -> list[str]:
    for attr in ("bone_order_names", "joint_names", "names"):
        names = getattr(skeleton, attr, None)
        if names is not None:
            return [str(name) for name in names]
    raise RuntimeError("Kimodo model did not expose skeleton joint names")


def _denoising_steps(req: GenerateRequest) -> int:
    """Per-request steps, else the configured default."""
    if req.denoising_steps is not None:
        return req.denoising_steps
    return int(os.environ.get("BODYPROMPT_DIFFUSION_STEPS", "100"))


def _one(model, req: GenerateRequest, seed: int) -> dict:
    # Kimodo honours torch's generator seed. Keep all seeding here, beside the model.
    import torch

    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    steps = _denoising_steps(req)
    output = model(
        prompts=req.prompt,  # raw on purpose: prompt mediation would change the research
        num_frames=round(req.duration_seconds * FPS),
        num_denoising_steps=steps,
        post_processing=req.post_processing,
        # Required, even though it is the default count: passing a bare prompt with
        # num_samples=None makes Kimodo squeeze the batch dimension before
        # post-processing, which then asserts that the batch dimension is present.
        # Kimodo's own CLI always passes this for the same reason.
        num_samples=1,
    )
    if not isinstance(output, dict):
        raise RuntimeError(f"unexpected Kimodo output type: {type(output).__name__}")

    positions = _numpy(output["posed_joints"])
    rotations = _numpy(output["local_rot_mats"])
    # num_samples=1 above keeps a batch dimension of one; strip it.
    if positions.ndim == 4:
        positions = positions[0]
    if rotations.ndim == 5:
        rotations = rotations[0]
    skeleton = _output_skeleton(model)
    motion = adapt_motion(
        positions,
        rotations,
        _joint_names(skeleton),
        fps=FPS,
        prompt=req.prompt,
        seed=seed,
        skeleton_name=str(getattr(skeleton, "name", "") or ""),
    )
    motion["post_processing"] = req.post_processing
    # Report the count actually used. Step count shifts the motion by a meaningful
    # fraction of sibling variance, so a motion that cannot say which it used is a
    # motion whose ghost-cloud cannot be read.
    motion["denoising_steps"] = steps
    return motion


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
            "text_embedding_cache": EMBEDDING_CACHE_STATE,
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
