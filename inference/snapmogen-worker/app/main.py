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

from .adapter import HEAD_HEIGHT_M, adapt_motion, scale_for

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


# Which trained transformer to use. SnapMoGen ships two; this is the one its own eval
# config names, and the one the paper's numbers were produced with.
TRANS_NAME = os.environ.get(
    "SNAPMOGEN_TRANS_NAME", "momaskplus_hrvq3_nlayer8_cdp0.1_ca_bm"
)
GMR_NAME = os.environ.get("SNAPMOGEN_GMR_NAME", "gmr_d292")
# SnapMoGen's own defaults for masked-transformer refinement and classifier-free guidance.
DEFAULT_TIMESTEPS = 16
COND_SCALE = 4


class Loaded:
    """Everything one generation needs, held together so it is loaded exactly once."""

    def __init__(self, vq, transformer, skeleton, joint_names, mean, std, joint_num,
                 scale, rest_head_units):
        self.vq = vq
        self.transformer = transformer
        self.skeleton = skeleton
        self.joint_names = joint_names
        self.mean = mean
        self.std = std
        self.joint_num = joint_num
        #: The rig's unit in metres, measured from its own rest pose at load time.
        self.scale = scale
        self.rest_head_units = rest_head_units


@lru_cache(maxsize=1)
def get_model() -> Loaded:
    """Load SnapMoGen once. Raises with a usable message when the weights are absent."""
    install_numpy_shim()
    if SNAPMOGEN_DIR not in sys.path:
        sys.path.insert(0, SNAPMOGEN_DIR)

    import pathlib

    import torch

    root = pathlib.Path(CHECKPOINT_DIR) / "snapmogen"
    meta = pathlib.Path(META_DIR)
    missing = [
        str(p) for p in (meta / "mean.npy", meta / "std.npy", root) if not p.exists()
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

    from config.load_config import load_config
    from model.transformer.transformer import MoMaskPlus
    from model.vq.rvq_model import HRVQVAE

    # Paths are built here rather than from the checkpoints' own configs: those carry the
    # authors' machine in them (`/mnt/local-disk/...`), and their `data.name` says
    # "snapmotion" while the directory the download script creates is "snapmogen" — so
    # following them would look in the wrong place.
    trans_dir = root / "momask_plus" / TRANS_NAME
    trans_cfg = load_config(str(trans_dir / "train_momaskplus.yaml"))
    vq_dir = root / "vq" / trans_cfg.vq_name
    vq_cfg = load_config(str(vq_dir / "residual_vqvae.yaml"))
    trans_cfg.vq = vq_cfg.quantizer

    vq = HRVQVAE(
        vq_cfg, vq_cfg.data.dim_pose, vq_cfg.model.down_t, vq_cfg.model.stride_t,
        vq_cfg.model.width, vq_cfg.model.depth, vq_cfg.model.dilation_growth_rate,
        vq_cfg.model.vq_act, vq_cfg.model.use_attn, vq_cfg.model.vq_norm,
    )
    # `vq_ckpt` names which VQ checkpoint this transformer was trained against — it is
    # net_best_mpjpe, not the net_best_fid sitting beside it. Loading the other one would
    # pair the transformer with a codebook it never saw.
    vq_ckpt = torch.load(vq_dir / "model" / trans_cfg.vq_ckpt, map_location="cuda",
                         weights_only=True)
    vq.load_state_dict(vq_ckpt["vq_model" if "vq_model" in vq_ckpt else "model"])
    vq.to("cuda").eval()

    transformer = MoMaskPlus(
        code_dim=trans_cfg.vq.code_dim,
        latent_dim=trans_cfg.model.latent_dim,
        ff_size=trans_cfg.model.ff_size,
        num_layers=trans_cfg.model.n_layers,
        num_heads=trans_cfg.model.n_heads,
        dropout=trans_cfg.model.dropout,
        text_dim=trans_cfg.text_embedder.dim_embed,
        cond_drop_prob=trans_cfg.training.cond_drop_prob,
        device="cuda",
        cfg=trans_cfg,
        full_length=trans_cfg.data.max_motion_length // 4,
        scales=vq_cfg.quantizer.scales,
    )
    ckpt = torch.load(trans_dir / "model" / "net_best_fid.tar", map_location="cuda",
                      weights_only=True)
    weights = ckpt["t2m_transformer"]
    transformer.load_state_dict(
        weights if isinstance(weights, dict) else weights.state_dict()
    )
    transformer.to("cuda").eval()

    # The skeleton comes from A_Pose.bvh in SnapMoGen's own repository rather than from the
    # 3.51 GB BVH corpus its reference script reads one file out of. Whether its proportions
    # match the training rig is what the bone-rigidity check answers.
    from common.skeleton import Skeleton
    from utils import bvh_io

    anim = bvh_io.load(os.path.join(SNAPMOGEN_DIR, "utils", "A_Pose.bvh"))
    skeleton = Skeleton(anim.offsets, anim.parents, device="cuda")

    # The rig is not metric — its rest head joint is at 93.08 units — so the unit is
    # measured here from the rig itself rather than assumed. Walking the parent chain
    # rather than trusting a constant means a rig change moves the scale with it.
    names = list(anim.names)
    heights: dict[int, float] = {}
    for i, parent in enumerate(anim.parents):
        heights[i] = float(anim.offsets[i][1]) + (heights[parent] if parent >= 0 else 0.0)
    rest_head_units = heights[names.index("C_head_bind_JNT")]

    return Loaded(
        vq=vq,
        transformer=transformer,
        skeleton=skeleton,
        joint_names=list(anim.names),
        mean=np.load(meta / "mean.npy"),
        std=np.load(meta / "std.npy"),
        joint_num=trans_cfg.data.joint_num,
        scale=scale_for(rest_head_units),
        rest_head_units=rest_head_units,
    )


def _sample(model: Loaded, prompt: str, frames: int, count: int, timesteps: int):
    """Generate `count` samples of one prompt and return their joint positions and rotations.

    One batch, not a loop: SnapMoGen conditions on a batch of texts, so N copies of one
    prompt cost a single forward pass. That also fixes the ghost-cloud's contract — the
    batch is reproducible from the seed, but the siblings inside it are not separately
    addressable the way Kimodo's consecutive seeds are.
    """
    import torch
    from einops import rearrange
    from utils.motion_process_bvh import recover_bvh_from_rot

    m_lens = torch.tensor([frames] * count, device="cuda").long()
    with torch.no_grad():
        mids = model.transformer.generate(
            [prompt] * count, m_lens // 4, timesteps, COND_SCALE,
            temperature=1, topk_filter_thres=0.9, gsample=True,
        )
        pred = model.vq.forward_decoder(mids, m_lens)
        std = torch.from_numpy(model.std[: pred.shape[-1]]).float().cuda()
        mean = torch.from_numpy(model.mean[: pred.shape[-1]]).float().cuda()
        feats = pred * std + mean
        b = feats.shape[0]
        _, local_quats, r_pos = recover_bvh_from_rot(
            feats, model.joint_num, model.skeleton, keep_shape=False
        )
        _, global_pos = model.skeleton.fk_local_quat(local_quats, r_pos)
        global_pos = rearrange(global_pos, "(b l) j d -> b l j d", b=b)
        local_quats = rearrange(local_quats, "(b l) j d -> b l j d", b=b)
    return global_pos.cpu().numpy(), local_quats.cpu().numpy()


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
        "rig_head_height_m": HEAD_HEIGHT_M,
        "error": load_error,
    }


@app.post("/generate")
def generate(req: GenerateRequest) -> dict:
    try:
        model = get_model()
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(err)) from err

    from utils.fixseeds import fixseed

    asked = round(req.duration_seconds * FPS)
    frames = requested_frames(req.duration_seconds)
    timesteps = req.denoising_steps or DEFAULT_TIMESTEPS

    fixseed(req.seed)
    try:
        positions, quats = _sample(model, req.prompt, frames, req.variants, timesteps)
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"{type(err).__name__}: {err}") from err

    motions = [
        adapt_motion(
            positions[i], quats[i], model.joint_names,
            fps=FPS, prompt=req.prompt, seed=req.seed, frames=frames,
            scale=model.scale,
        )
        for i in range(req.variants)
    ]
    motion = motions[0]
    if len(motions) > 1:
        motion["variants"] = motions[1:]

    # What the worker DID, never what it was asked for. Three of these differ from the
    # request often enough that echoing the request would be a lie:
    #
    #   frames      SnapMoGen quantises to whole units and will not go below its own floor,
    #               so a 2 s line is answered by 4.27 s of motion and must say so.
    #   post_processing  the GlobalRegressor refinement is not wired up yet, so this is
    #               false whatever was asked.
    #   multi_prompt     always false: this model cannot stitch a poem at all.
    motion["denoising_steps"] = timesteps
    motion["post_processing"] = False
    motion["multi_prompt"] = False
    motion["transition_frames"] = None
    motion["frames_asked"] = asked
    motion["frames_used"] = frames
    # SnapMoGen's rig is not metric. The factor is measured from the rig's own rest pose,
    # so the motion can say what convention put it into metres rather than leaving a
    # reader to assume one.
    motion["rig_scale"] = round(model.scale, 8)
    motion["rig_head_height_m"] = HEAD_HEIGHT_M
    return motion
