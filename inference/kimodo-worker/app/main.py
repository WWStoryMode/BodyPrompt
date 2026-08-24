"""Local GPU worker: Kimodo → SOMA adapter → canonical BodyPrompt motion."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from .adapter import adapt_motion

MODEL_VERSION = "Kimodo-SOMA-RP-v1.1"
FPS = 30


class Line(BaseModel):
    """One sentence of a poem: a prompt, and how long the body has to answer it."""

    prompt: str = Field(min_length=1)
    duration_seconds: float = Field(default=5.0, ge=2.0, le=10.0)


class GenerateRequest(BaseModel):
    # Exactly one of `prompt` (one phrase) or `lines` (a poem) — see the validator below.
    prompt: str | None = Field(default=None, min_length=1)
    lines: list[Line] | None = Field(default=None, min_length=1)
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
    # Frames Kimodo overlaps between consecutive lines to blend them. Its own default is 5.
    # These frames belong to both lines and to neither: with post-processing on they are
    # generated under the *next* line's prompt, so they are reported rather than hidden.
    transition_frames: int = Field(default=5, ge=1, le=30)

    @model_validator(mode="after")
    def _one_shape_or_the_other(self) -> "GenerateRequest":
        """A request is either one phrase or a poem, never both and never neither.

        Guessing which wins would make the contract ambiguous at exactly the point where
        the answer changes what the body does.
        """
        if (self.prompt is None) == (self.lines is None):
            raise ValueError("send either 'prompt' or 'lines', not both and not neither")
        if self.lines is not None:
            if self.variants != 1:
                # The ghost-cloud is a per-line instrument: four readings of a five-line
                # poem would cost minutes, and Kimodo cannot re-roll one line alone.
                raise ValueError("variants apply to a single prompt, not to a poem")
            shortest = min(round(line.duration_seconds * FPS) for line in self.lines)
            if self.transition_frames >= shortest:
                raise ValueError(
                    f"transition_frames ({self.transition_frames}) must be shorter than the "
                    f"shortest line ({shortest} frames)"
                )
        return self


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
    return _adapt(model, output, prompt=req.prompt, seed=seed)


def _adapt(model, output, *, prompt: str, seed: int) -> dict:
    """Turn one Kimodo output dict into canonical motion.

    Shared by the single-phrase and poem paths: `multi_prompt` returns the same keys and
    the same tensor shapes as a single call, just longer, so the SOMA adapter needs no
    knowledge of which one produced it.
    """
    if not isinstance(output, dict):
        raise RuntimeError(f"unexpected Kimodo output type: {type(output).__name__}")

    positions = _numpy(output["posed_joints"])
    rotations = _numpy(output["local_rot_mats"])
    # num_samples=1 keeps a batch dimension of one; strip it.
    if positions.ndim == 4:
        positions = positions[0]
    if rotations.ndim == 5:
        rotations = rotations[0]
    skeleton = _output_skeleton(model)
    return adapt_motion(
        positions,
        rotations,
        _joint_names(skeleton),
        fps=FPS,
        prompt=prompt,
        seed=seed,
        skeleton_name=str(getattr(skeleton, "name", "") or ""),
    )


def _segments(lines: list[Line], transition_frames: int) -> list[dict]:
    """Where each line begins and ends in the stitched motion.

    Kimodo does not report this — it returns one flat motion — but the arithmetic is exact:
    the total frame count equals the sum of the requested per-line counts. The trailing
    `transition_frames` of every line except the last are shared with the line that follows,
    and are recorded rather than quietly attributed to one line or the other.
    """
    segments: list[dict] = []
    start = 0
    for index, line in enumerate(lines):
        frames = round(line.duration_seconds * FPS)
        segments.append({
            "index": index,
            "prompt": line.prompt,
            "start_frame": start,
            "end_frame": start + frames,
            "transition_frames": transition_frames if index < len(lines) - 1 else 0,
            "duration_seconds": line.duration_seconds,
        })
        start += frames
    return segments


def _poem(model, req: GenerateRequest) -> dict:
    """Generate every line as one continuous motion, stitched by Kimodo.

    Each line is conditioned on the decoded tail and heading of the line before it, so the
    body carries from one sentence into the next instead of restarting. That conditioning
    is also why a single line cannot be re-rolled on its own: changing one line changes
    every line after it.
    """
    import torch

    lines = req.lines or []
    torch.manual_seed(req.seed)
    torch.cuda.manual_seed_all(req.seed)
    steps = _denoising_steps(req)
    # Both must be lists of matching length. Kimodo broadcasts a bare int across
    # num_samples rather than across prompts, and zips prompts against frames — so a
    # mismatch silently drops lines instead of failing.
    prompts = [line.prompt for line in lines]
    num_frames = [round(line.duration_seconds * FPS) for line in lines]
    output = model(
        prompts=prompts,  # raw on purpose, as in the single-phrase path
        num_frames=num_frames,
        num_denoising_steps=steps,
        multi_prompt=True,
        num_transition_frames=req.transition_frames,
        post_processing=req.post_processing,
        num_samples=1,
    )
    motion = _adapt(model, output, prompt="\n".join(prompts), seed=req.seed)
    expected = sum(num_frames)
    if len(motion["frames"]) != expected:
        # Silent truncation is Kimodo's failure mode here, so check rather than trust.
        raise RuntimeError(
            f"Kimodo returned {len(motion['frames'])} frames for a poem of {expected}; "
            f"{len(prompts)} lines may not have all been generated"
        )
    motion["segments"] = _segments(lines, req.transition_frames)
    return motion


def _stamp(motion: dict, req: GenerateRequest, *, multi_prompt: bool) -> dict:
    """Record what was actually done, beside the motion it was done to."""
    motion["post_processing"] = req.post_processing
    # Step count shifts the motion by a meaningful fraction of sibling variance, so a
    # motion that cannot say which it used is a motion whose ghost-cloud cannot be read.
    motion["denoising_steps"] = _denoising_steps(req)
    motion["multi_prompt"] = multi_prompt
    motion["transition_frames"] = req.transition_frames if multi_prompt else None
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
            # A CAPABILITY, not a record of anything that happened. `multi_prompt` on a
            # motion says what this worker did to that motion; this says what it is able
            # to do at all, so a caller can decide how to ask before it asks. Kimodo can:
            # `_multiprompt` conditions each line on the decoded tail of the one before it.
            "can_stitch_poems": True,
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
        if req.lines is not None:
            return _stamp(_poem(model, req), req, multi_prompt=True)
        samples = [
            _stamp(_one(model, req, req.seed + i), req, multi_prompt=False)
            for i in range(req.variants)
        ]
        primary = samples[0]
        if len(samples) > 1:
            primary["variants"] = samples[1:]
        return primary
    except (KeyError, RuntimeError, ValueError) as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
