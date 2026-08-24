"""Local GPU worker: Language of Motion → its adapter → canonical BodyPrompt motion.

Same contract as the Kimodo and SnapMoGen workers — `/health` and `/generate`, canonical
motion out — so the service reaches all three through one `WorkerProvider`.

Where this model differs, the worker says so rather than pretending to match:

- **No poem.** Like SnapMoGen, it cannot condition one line on the body the previous line
  left, so `can_stitch_poems` is false and a request carrying `lines` is refused. The
  triptych reads that from `/health` and asks line by line instead.
- **No denoising steps.** There is no diffusion here at all: a T5 language model emits motion
  tokens and a VQ decodes them. `denoising_steps` is accepted and recorded as `None`,
  because inventing a number for a knob this model does not have would be a lie in the one
  field that exists to prevent them.
- **Length is a request, not a contract.** The model generates until it stops, typically
  20-43 s, with no length conditioning available on this checkpoint. The worker truncates to
  what was asked and records both numbers.
- **Text drives two of four body parts.** The released text-to-motion checkpoint emits no
  face and no hand tokens; those joints are zeroed and provenance says so.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from .adapter import FRAMES_PER_TOKEN, adapt_motion, frames_to_tokens
from .tokens import PARTS_FROM_TEXT, parse_stream, unify

MODEL_VERSION = "LanguageOfMotion-T2M-v1"
FPS = 30

#: What one generation can cover. The cap is ours, not the model's: it will happily run to
#: its 512-token ceiling (~68 s) and a poem line is never that long.
MIN_FRAMES = 60           # 2 s, the shortest line the instrument offers
MAX_FRAMES = 300          # 10 s, the longest
#: The decoder's own ceiling on generated tokens.
MAX_NEW_TOKENS = 512

LOM_DIR = os.environ.get("LOM_DIR", "/opt/language_of_motion")
CHECKPOINT_DIR = os.environ.get("LOM_CHECKPOINT_DIR", "/checkpoints")
SMPLX_DIR = os.environ.get("LOM_SMPLX_DIR", "/smplx")
T5_DIR = os.environ.get("LOM_T5_DIR", "/checkpoints/t5_models/flan-t5-base")


class GenerateRequest(BaseModel):
    prompt: str | None = Field(default=None, min_length=1, max_length=2000)
    lines: list[dict] | None = None
    duration_seconds: float = Field(default=5.0, ge=2.0, le=10.0)
    variants: int = Field(default=1, ge=1, le=4)
    seed: int = Field(ge=0, lt=2**31)
    post_processing: bool = True
    denoising_steps: int | None = None
    transition_frames: int = 5

    @model_validator(mode="after")
    def _no_poem(self) -> "GenerateRequest":
        if self.lines is not None:
            raise ValueError(
                "Language of Motion cannot generate a poem: it has no way to condition a "
                "line on the body the previous line left, so lines would be separate "
                "motions laid end to end. Ask for them one at a time — the triptych does."
            )
        if self.prompt is None:
            raise ValueError("a prompt is required")
        return self


def requested_frames(duration_seconds: float) -> int:
    """Frames for a requested duration, clamped to what this worker will serve."""
    return int(min(MAX_FRAMES, max(MIN_FRAMES, round(duration_seconds * FPS))))


class Loaded:
    """The model, its tokenizers and the body model, held together once."""

    def __init__(self, lm, vq, body, device) -> None:
        self.lm = lm
        self.vq = vq
        self.body = body
        self.device = device
        self.joint_names: list[str] = []


def _missing() -> list[str]:
    """What is absent, named, so /health can say it rather than a stack trace saying it."""
    wanted = {
        "language model checkpoint": f"{CHECKPOINT_DIR}/lom_t2m/Instruct_Mixed_T2M_LM.ckpt",
        "VQ checkpoint": f"{CHECKPOINT_DIR}/lom_vq_ds/lom_vq.ckpt",
        "FLAN-T5": f"{T5_DIR}/config.json",
        # MPI-gated: a human has to register at smpl-x.is.tue.mpg.de and accept the licence.
        # It is not this repository's to redistribute, and the worker must fail with that
        # sentence rather than with a FileNotFoundError from inside smplx.
        "SMPL-X body model": f"{SMPLX_DIR}/smplx/SMPLX_NEUTRAL_2020.npz",
    }
    return [f"{name} ({path})" for name, path in wanted.items() if not os.path.exists(path)]


@lru_cache(maxsize=1)
def get_model() -> Loaded:
    absent = _missing()
    if absent:
        raise RuntimeError("missing required files: " + "; ".join(absent))

    import sys

    import smplx
    import torch
    from omegaconf import OmegaConf

    sys.path.insert(0, LOM_DIR)
    cwd = os.getcwd()
    os.chdir(LOM_DIR)  # its config loader resolves ./configs relative to the process
    try:
        from lom.config import get_module_config, instantiate_from_config

        assets = OmegaConf.load("./configs/assets.yaml")
        cfg = OmegaConf.merge(
            get_module_config(
                OmegaConf.merge(
                    OmegaConf.load(os.path.join(assets.CONFIG_FOLDER, "default.yaml")),
                    OmegaConf.load("./configs/demo_text2motion.yaml"),
                ),
                assets.CONFIG_FOLDER,
            ),
            assets,
        )
        cfg.lm.lom.params.model_path = T5_DIR
        # `turbot5` is a Triton flash backend that also pins transformers<=4.49; the
        # upstream README calls it optional. Vanilla HF T5 is the same maths, slower, and
        # one fewer thing that has to compile against Blackwell.
        cfg.lm.lom.params.flash_attention = False

        device = "cuda" if torch.cuda.is_available() else "cpu"
        lm = instantiate_from_config(OmegaConf.to_container(cfg.lm.lom, resolve=True))
        state = torch.load(
            f"{CHECKPOINT_DIR}/lom_t2m/Instruct_Mixed_T2M_LM.ckpt",
            map_location="cpu", weights_only=False,
        )["state_dict"]
        weights = {
            k.replace("lm.language_model.", ""): v
            for k, v in state.items() if "lm.language_model" in k
        }
        # strict=False because the checkpoint also carries VQ and head tensors; the count
        # is asserted instead, so a checkpoint that matched almost nothing cannot load
        # silently and then generate confident nonsense.
        lm.language_model.load_state_dict(weights, strict=False)
        if len(weights) < 100:
            raise RuntimeError(f"only {len(weights)} LM tensors in the checkpoint")
        lm = lm.to(device).eval()

        tok_cfg = cfg.model.params.modality_tokenizer
        vq_state = torch.load(
            f"{CHECKPOINT_DIR}/lom_vq_ds/lom_vq.ckpt", map_location="cpu", weights_only=False
        )["state_dict"]
        vq = {}
        for name in ("vae_face", "vae_hand", "vae_upper", "vae_lower", "vae_global"):
            module = instantiate_from_config(OmegaConf.to_container(tok_cfg[name], resolve=True))
            module.load_state_dict(
                {k.replace(f"{name}.", ""): v for k, v in vq_state.items() if name in k},
                strict=True,  # a silent mismatch here is a plausible body with false anatomy
            )
            vq[name] = module.to(device).eval().float()

        body = smplx.create(
            SMPLX_DIR, model_type="smplx", gender="NEUTRAL_2020", use_face_contour=False,
            num_betas=300, num_expression_coeffs=100, ext="npz", use_pca=False,
        ).eval().to(device)
    finally:
        os.chdir(cwd)

    loaded = Loaded(lm, vq, body, device)
    # Enumerated from the loaded artefact, not assumed. SMPL-X's first 22 joints happen to
    # match the canonical skeleton exactly, which is the easiest kind of map to get wrong by
    # never checking.
    from smplx.joint_names import JOINT_NAMES
    loaded.joint_names = list(JOINT_NAMES)
    return loaded


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_model()
        app.state.load_error = None
    except Exception as err:  # noqa: BLE001
        app.state.load_error = str(err)
        print(f"[lom-worker] model not loaded: {err}", flush=True)
    yield


app = FastAPI(title="BodyPrompt Language of Motion worker", lifespan=lifespan)


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
        # A CAPABILITY, not a record of anything that happened. This model has no way to
        # carry one line into the next, so the triptych must ask it line by line.
        "can_stitch_poems": False,
        "min_frames": MIN_FRAMES,
        "max_frames": MAX_FRAMES,
        "frames_per_token": FRAMES_PER_TOKEN,
        # Named so an operator can see the gate without reading the logs.
        "missing": _missing(),
        "error": load_error,
    }


def _velocity_to_position(velocity, dt, init):
    """Integrate root velocity into a position.

    Copied verbatim from `lom/utils/other_tools.py:446` rather than imported: that module
    pulls in pandas, matplotlib, librosa and opencv at import time, for nine lines of
    arithmetic. Vendoring the maths is honest; vendoring a *model* would not be.
    """
    import torch

    out = [init.unsqueeze(1)]
    for i in range(1, velocity.shape[1]):
        out.append(velocity[:, i - 1:i] * dt + out[-1])
    return torch.cat(out, dim=1)


@lru_cache(maxsize=1)
def _joint_masks() -> tuple:
    """The upper/lower/hand selections, read out of `data_tools.py` without importing it.

    Importing `lom.data.mixed_dataset` drags in the training dataset, spacy, and a vendored
    BVH parser through relative imports. These are three constant arrays.
    """
    source = open(f"{LOM_DIR}/lom/data/mixed_dataset/data_tools.py").read().splitlines()
    kept = [line for line in source if not line.startswith(("from .", "import spacy"))]
    namespace: dict = {}
    exec("\n".join(kept), namespace)  # noqa: S102 — upstream constants, not user input
    return (
        namespace["JOINT_MASK_UPPER"],
        namespace["JOINT_MASK_LOWER"],
        namespace["JOINT_MASK_HAND"],
    )


def _inverse_selection(filtered, mask, n):
    """Scatter a part's joints back into the full 165-number SMPL-X pose vector."""
    import torch

    mask_t = torch.from_numpy(mask).to(filtered.device)
    full = torch.zeros((n, 165), device=filtered.device)
    full[:, torch.where(mask_t == 1)[0]] = filtered
    return full


def _generate_tokens(model: Loaded, prompt: str, seed: int) -> dict[str, list[int]]:
    """One prompt in, one stream of motion tokens out."""
    import torch

    torch.manual_seed(seed)
    encoded = model.lm.tokenizer(
        [prompt], padding="max_length", max_length=model.lm.max_length, truncation=True,
        return_attention_mask=True, add_special_tokens=True, return_tensors="pt",
    )
    with torch.no_grad():
        out = model.lm.language_model.generate(
            encoded.input_ids.to(model.device),
            max_length=MAX_NEW_TOKENS, num_beams=1, do_sample=True,
        )
    text = model.lm.tokenizer.batch_decode(out, skip_special_tokens=True)[0]
    return parse_stream(text)


def _tokens_to_joints(model: Loaded, tokens: dict[str, list[int]], count: int):
    """Tokens → SMPL-X pose → joint positions. The assembly follows `demo.py:493-545`."""
    import torch
    import torch.nn.functional as F
    from lom.utils.rotation_conversions import (
        matrix_to_axis_angle, matrix_to_rotation_6d, rotation_6d_to_axis_angle,
        rotation_6d_to_matrix,
    )

    mask_upper, mask_lower, mask_hand = _joint_masks()
    device = model.device
    with torch.no_grad():
        upper_idx = torch.tensor(tokens["upper"][:count], device=device).unsqueeze(0)
        lower_idx = torch.tensor(tokens["lower"][:count], device=device).unsqueeze(0)
        rec_upper = model.vq["vae_upper"].decode(upper_idx.int()).float()
        rec_lower = model.vq["vae_lower"].decode(lower_idx.int()).float()
        bs, n = rec_upper.shape[0], rec_upper.shape[1]

        # Text-to-motion emits no face and no hand tokens, so these are EXPLICITLY zero — a
        # neutral face and open hands — rather than whatever an uninitialised buffer holds.
        # `provenance.parts_generated` records that they were not generated.
        rec_face = torch.zeros(bs, n, 106, device=device)
        rec_hands = torch.zeros(bs, n, 180, device=device)

        pose_upper = rotation_6d_to_axis_angle(rec_upper.reshape(bs, n, 13, 6)).reshape(bs * n, 39)
        upper_full = _inverse_selection(pose_upper, mask_upper, bs * n)

        legs = rec_lower[:, :, :54]
        lower_m = rotation_6d_to_matrix(legs.reshape(bs, n, 9, 6))
        lower_as_global = matrix_to_rotation_6d(lower_m.clone()).reshape(bs, n, 54)
        pose_lower = matrix_to_axis_angle(lower_m).reshape(bs * n, 27)
        lower_full = _inverse_selection(pose_lower, mask_lower, bs * n)

        pose_hands = rotation_6d_to_axis_angle(rec_hands.reshape(bs, n, 30, 6)).reshape(bs * n, 90)
        hands_full = _inverse_selection(pose_hands, mask_hand, bs * n)
        jaw = rotation_6d_to_axis_angle(rec_face[:, :, :6].reshape(bs * n, 6)).reshape(bs * n, 3)

        pose = upper_full + lower_full + hands_full
        pose[:, 66:69] = jaw

        # Root translation comes from the global VQ reading the lower body back.
        to_global = F.pad(rec_lower, (0, 7)) if rec_lower.shape[2] == 54 else rec_lower
        to_global[:, :, 54:57] = 0.0
        to_global[:, :, :54] = lower_as_global
        velocity = model.vq["vae_global"](to_global)["rec_pose"][:, :, 54:57]
        zero = torch.zeros(velocity[:, 0, 0:1].shape, device=device)
        translation = torch.cat(
            [_velocity_to_position(velocity[:, :, 0:1], 1 / FPS, zero),
             velocity[:, :, 1:2],
             _velocity_to_position(velocity[:, :, 2:3], 1 / FPS, zero)], dim=-1)

        out = model.body(
            betas=torch.zeros(bs * n, 300, device=device),
            transl=translation.reshape(bs * n, 3),
            expression=rec_face[:, :, 6:].reshape(bs * n, 100),
            jaw_pose=pose[:, 66:69], global_orient=pose[:, :3], body_pose=pose[:, 3:66],
            left_hand_pose=pose[:, 75:120], right_hand_pose=pose[:, 120:165],
            leye_pose=pose[:, 69:72], reye_pose=pose[:, 72:75],
        )
    return out.joints[:, :22].detach().cpu().numpy()


def _one(model: Loaded, req: GenerateRequest, seed: int) -> tuple[dict, int, int]:
    """One motion, plus how many frames were asked for and how many the model moved for."""
    wanted = requested_frames(req.duration_seconds)
    tokens = _generate_tokens(model, req.prompt, seed)
    usable = unify(tokens)
    if usable == 0:
        raise RuntimeError(
            "the model produced no motion tokens for this prompt "
            f"(parts seen: {', '.join(p for p in PARTS_FROM_TEXT if tokens[p]) or 'none'})"
        )
    joints = _tokens_to_joints(model, tokens, usable)
    generated = joints.shape[0]
    motion = adapt_motion(
        joints, model.joint_names, fps=FPS, prompt=req.prompt, seed=seed, frames=wanted
    )
    return motion, wanted, generated


@app.post("/generate")
def generate(req: GenerateRequest) -> dict:
    try:
        model = get_model()
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(err)) from err

    try:
        results = [_one(model, req, req.seed + i) for i in range(req.variants)]
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err

    motion, asked, generated = results[0]
    if len(results) > 1:
        motion["variants"] = [m for m, _, _ in results[1:]]

    # What the worker DID, never what it was asked for.
    #
    #   frames        this checkpoint has no length conditioning: it generates until it
    #                 stops, typically 20-43 s, and the worker truncates. Both numbers are
    #                 recorded so a 5 s request answered by 20 s of motion is visible rather
    #                 than silently cropped.
    #   denoising_steps  None, always: there is no diffusion here. A number would be a lie
    #                 in the one field that exists to prevent them.
    #   multi_prompt  None: nothing stitched this, and nothing here can.
    motion["post_processing"] = False
    motion["denoising_steps"] = None
    motion["multi_prompt"] = False
    motion["transition_frames"] = None
    motion["frames_asked"] = asked
    motion["frames_used"] = generated
    # Two of the model's four body parts. Face and hands were not generated at all, so the
    # 33 SMPL-X joints they drive are zeroed — see adapter.py on the reduction.
    motion["parts_generated"] = list(PARTS_FROM_TEXT)
    return motion
