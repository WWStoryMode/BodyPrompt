"""
Language of Motion → the BodyPrompt canonical skeleton.

## The reduction, stated plainly

SMPL-X has **55 joints**: 22 body, a jaw, two eyes, and 30 for the hands. The canonical
skeleton is the 22 body joints. So this boundary **discards 33 of 55 joints — 60% of the
model's articulation** — from the one model in the triptych whose entire design premise is
decomposing the body into face, hands, upper and lower.

That is a real loss and the docs say so. It is also, for text prompts, mostly theoretical:
the released text-to-motion checkpoint emits **no face and no hand tokens at all**, so those
33 joints were never generated in the first place. They are set to zero here — a neutral
face and open hands — and `provenance` records that nothing produced them.

## The joint map is the identity, and that was checked

SMPL-X's first 22 joints are the SMPL body joints, in the same order, under the same names
as `bodyprompt_motion.canonical.JOINTS`. Verified against the artefact rather than assumed:
`resolve_joint_indices` is still handed the model's own names and still has to agree.

## The trap, again

Bone-length rigidity **cannot validate this map**. SMPL-X produces joints by forward
kinematics over a template, so every bone is rigid by construction whatever the map says —
exactly as with SnapMoGen, where only head height against a human body caught a 0.85 m
error. The worker checks head height for that reason.
"""

from __future__ import annotations

import numpy as np

from bodyprompt_motion.canonical import (
    JOINTS,
    canonical_motion,
    centre_and_ground,
    resolve_joint_indices,
)

#: SMPL-X's 165-number pose vector, by joint block. Copied from the layout `demo.py` uses
#: when it calls the body model (demo.py:190-200), not inferred from the joint count.
GLOBAL_ORIENT = slice(0, 3)
BODY_POSE = slice(3, 66)
JAW_POSE = slice(66, 69)
LEYE_POSE = slice(69, 72)
REYE_POSE = slice(72, 75)
LEFT_HAND = slice(75, 120)
RIGHT_HAND = slice(120, 165)

#: Each motion token covers this many frames. From `lm.lom.params.motion_down_sampling`.
FRAMES_PER_TOKEN = 4

#: What a human body is, roughly, for the one check that can catch a scale error.
PLAUSIBLE_HEAD_M = (1.30, 1.95)


def frames_to_tokens(frames: int) -> int:
    """How many tokens cover at least `frames` frames. Never fewer than one."""
    return max(1, -(-frames // FRAMES_PER_TOKEN))


def check_head_height(positions: np.ndarray) -> float:
    """
    The only check here that can actually fail on a wrong skeleton.

    SMPL-X is metric already, so unlike SnapMoGen there is no scale convention to discover —
    which makes this a guard against a *mapping* error rather than a units one. A head at
    0.85 m or 2.4 m means the joint we are calling `head` is not the head.
    """
    head = float(np.mean(positions[:, JOINTS.index("head"), 1]))
    low, high = PLAUSIBLE_HEAD_M
    if not low <= head <= high:
        raise ValueError(
            f"head height {head:.3f} m is outside {low}-{high} m — the joint map is wrong, "
            "and bone rigidity cannot tell you that because SMPL-X bones are rigid by "
            "construction"
        )
    return head


def adapt_motion(
    joints: np.ndarray,
    source_names: list[str],
    *,
    fps: int,
    prompt: str,
    seed: int,
    frames: int | None = None,
) -> dict:
    """
    Turn SMPL-X joint output into one `bodyprompt.motion/v0` motion.

    `joints` is `[T, >=22, 3]` in **metres** — SMPL-X's native unit, so there is no scale
    factor here and none should be added. `frames` truncates; it never pads, because a
    padded tail is a body held still that the model never asked to hold still.
    """
    if joints.ndim != 3 or joints.shape[-1] != 3:
        raise ValueError(f"expected joints [T,J,3], got {joints.shape}")
    if joints.shape[1] < len(JOINTS):
        raise ValueError(f"need at least {len(JOINTS)} joints, got {joints.shape[1]}")

    indices = resolve_joint_indices(source_names, label="SMPL-X")
    pos = np.asarray(joints[:, indices, :], dtype=np.float64).copy()
    if frames is not None:
        pos = pos[:frames]
    if not len(pos):
        raise ValueError("no frames after truncation")
    if not np.isfinite(pos).all():
        raise ValueError("Language of Motion returned NaN or infinite joint positions")

    centre_and_ground(pos)
    check_head_height(pos)

    # Rotations stay identity. The model does produce per-joint rotations, but they are
    # SMPL-X *pose parameters* relative to a rest pose, and the canonical schema's
    # `rotations` field is reserved and unread by the renderer (docs/motion-schema.md).
    # Writing a differently-defined rotation into a reserved field would be worse than
    # leaving it empty: nothing would notice until something used it.
    identity = [[0.0, 0.0, 0.0, 1.0]] * len(JOINTS)
    frames_out = [
        {"positions": np.round(frame, 5).tolist(), "rotations": identity}
        for frame in pos
    ]
    return canonical_motion(
        frames_out, fps=fps, prompt=prompt, model="language-of-motion", seed=seed
    )
