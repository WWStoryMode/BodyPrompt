"""Local GPU worker: SnapMoGen → its adapter → canonical BodyPrompt motion.

Same contract as the Kimodo worker — `/health` and `/generate`, canonical motion out — so
the service reaches both through one `WorkerProvider` and neither knows about the other.

Where the two models differ, this worker says so rather than pretending to match:

- **No poem.** SnapMoGen has no equivalent of Kimodo's `multi_prompt`; it cannot condition
  one line on the body the previous line left. A request carrying `lines` is refused,
  because laying independently generated lines end to end and calling the result a poem is
  exactly the flattery `segments` exists to prevent.
- **Iterations, not DDIM steps.** `denoising_steps` maps to SnapMoGen's masked-transformer
  `timesteps`. Same role — how many refinement passes — different mechanism, and provenance
  records the number that was used.
- **A batch, not a seed sequence.** Kimodo gives one sibling per consecutive seed. SnapMoGen
  seeds globally and samples stochastically, so N copies of one prompt in one batch give N
  siblings in a single forward pass. Reproducible as a batch; not addressable one by one.
"""

from __future__ import annotations

import os
import sys
import types
from contextlib import asynccontextmanager
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from .adapter import adapt_motion

MODEL_VERSION = "SnapMoGen-MoMaskPlus"
FPS = 30

# SnapMoGen's own configured bounds (config/eval_momaskplus.yaml). Below the minimum it does
# not refuse — it generates something — so the floor is enforced here, where it can be said
# out loud, rather than left to produce quietly untrustworthy motion.
MIN_FRAMES = 128          # 4.27 s
MAX_FRAMES = 320          # 10.67 s
UNIT_LENGTH = 8           # generated lengths quantise to multiples of this

SNAPMOGEN_DIR = os.environ.get("SNAPMOGEN_DIR", "/opt/SnapMoGen")
CHECKPOINT_DIR = os.environ.get("SNAPMOGEN_CHECKPOINT_DIR", "/checkpoints")
META_DIR = os.environ.get("SNAPMOGEN_META_DIR", "/meta")


def install_numpy_shim() -> None:
    """Make SnapMoGen importable on a modern numpy.

    `common/animation.py` does `import numpy.core.umath_tests as ut` and calls
    `ut.matrix_multiply`. That was a private TEST module removed in numpy 1.16 — years
    before SnapMoGen's own pinned numpy==1.24.3, so this is broken on their pins too and
    not only on ours. `matrix_multiply` is batched matmul, which `np.matmul` has been since
    numpy 1.10.

    A shim rather than a patched fork: vendoring a modified copy of the model's source is
    how a repository quietly stops running the model it claims to run.
    """
    if "numpy.core.umath_tests" in sys.modules:
        return
    shim = types.ModuleType("numpy.core.umath_tests")
    shim.matrix_multiply = np.matmul
    sys.modules["numpy.core.umath_tests"] = shim


class GenerateRequest(BaseModel):
    prompt: str | None = Field(default=None, min_length=1, max_length=2000)
    lines: list[dict] | None = None
    duration_seconds: float = Field(default=5.0, ge=2.0, le=10.0)
    variants: int = Field(default=1, ge=1, le=4)
    seed: int = Field(ge=0, lt=2**31)
    post_processing: bool = True
    # SnapMoGen's masked-transformer refinement passes. Its own default is 16.
    denoising_steps: int | None = Field(default=None, ge=1, le=100)
    transition_frames: int = Field(default=5, ge=1, le=30)

    @model_validator(mode="after")
    def _one_prompt_only(self) -> "GenerateRequest":
        if self.lines is not None:
            raise ValueError(
                "SnapMoGen cannot generate a poem: it has no way to condition a line on "
                "the body the previous line left, so lines would be separate motions laid "
                "end to end rather than one continuous reading. Send 'prompt'."
            )
        if self.prompt is None:
            raise ValueError("send 'prompt'")
        return self


def requested_frames(duration_seconds: float) -> int:
    """Frames to ask SnapMoGen for, and what it can actually honour.

    Two facts, both measured rather than assumed: generated lengths quantise to multiples
    of UNIT_LENGTH, and below MIN_FRAMES the model does not refuse — it returns something.
    Clamping here is a decision, and `/generate` records both the asked-for and the used
    length so no motion is ambiguous about which it is.
    """
    wanted = round(duration_seconds * FPS)
    clamped = max(MIN_FRAMES, min(MAX_FRAMES, wanted))
    return int(round(clamped / UNIT_LENGTH) * UNIT_LENGTH)


@lru_cache(maxsize=1)
def get_model():
    """Load SnapMoGen once. Raises with a usable message when the weights are absent."""
    install_numpy_shim()
    if SNAPMOGEN_DIR not in sys.path:
        sys.path.insert(0, SNAPMOGEN_DIR)

    import pathlib

    import torch

    missing = [
        str(p) for p in (
            pathlib.Path(META_DIR) / "mean.npy",
            pathlib.Path(META_DIR) / "std.npy",
            pathlib.Path(CHECKPOINT_DIR) / "snapmogen",
        ) if not p.exists()
    ]
    if missing:
        raise RuntimeError(
            "SnapMoGen is not set up: missing " + ", ".join(missing) + ". The checkpoints "
            "come from the Google Drive links in SnapMoGen's prepare/download_models.sh "
            "(the snapmogen archive only), and mean.npy/std.npy from the meta_data folder "
            "of its HuggingFace dataset — about 5 KB, not the 16.5 GB corpus."
        )
    if not torch.cuda.is_available():
        raise RuntimeError("no CUDA device visible to the SnapMoGen worker")

    raise NotImplementedError(
        "SnapMoGen model loading is not built yet — Stage B scaffolding. The adapter, the "
        "request contract and the length rules are done and tested; what is missing is the "
        "checkpoint wiring, which is blocked on the weights."
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load at startup so the first request is not the one that pays for it."""
    app.state.load_error = None
    try:
        get_model()
    except Exception as err:  # noqa: BLE001 - reported through /health, never swallowed
        app.state.load_error = f"{type(err).__name__}: {err}"
    yield


app = FastAPI(title="BodyPrompt SnapMoGen worker", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    try:
        import torch
    except ImportError as err:
        return {"ok": False, "ready": False, "error": str(err)}

    cuda = torch.cuda.is_available()
    load_error = getattr(app.state, "load_error", "model startup has not run")
    return {
        "ok": True,
        "ready": cuda and load_error is None and get_model.cache_info().currsize == 1,
        "cuda": cuda,
        "model_version": MODEL_VERSION,
        "min_frames": MIN_FRAMES,
        "max_frames": MAX_FRAMES,
        "unit_length": UNIT_LENGTH,
        "error": load_error,
    }


@app.post("/generate")
def generate(req: GenerateRequest) -> dict:
    try:
        model = get_model()
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(err)) from err
    raise HTTPException(status_code=503, detail=f"unreachable until {model} loads")
