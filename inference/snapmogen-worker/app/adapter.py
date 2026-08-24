"""
Reduce a SnapMoGen motion into BodyPrompt's canonical 22-joint skeleton.

SnapMoGen's rig is a **third naming convention** — Maya bind-joint names like
`C_pelvis0001_bind_JNT` — which neither Kimodo's SOMA names nor the shared Mixamo-style
alias table resolves. So it gets an exact map, enumerated from `utils/A_Pose.bvh` in
SnapMoGen's own repository rather than guessed, for the same reason the SOMA map is exact:
a name that resolves to the wrong joint returns a plausible-looking body with false anatomy
and nothing crashes.

Two differences from the Kimodo path, both measured during the Stage B spike:

- **A rig that is not metric.** Its rest-pose head joint sits at 93.08 units. If those were
  centimetres the body would stand 0.85 m tall, which is not a person — and the notation
  registers would read it as a permanent crouch, because their thresholds (a planted foot
  below 0.08 m, a knee-height ankle below 0.6 m) are calibrated in real metres. SnapMoGen
  never claims a unit, so any mapping to metres is a *convention*, and this one is stated
  rather than hidden: scale so the rest-pose head joint lands at `HEAD_HEIGHT_M`. Measured
  from the rig at load time, never a magic constant, and recorded in provenance.
- **Quaternions, not matrices.** Its forward kinematics already produces per-joint local
  quaternions, so there is nothing to convert — only an order to fix.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from bodyprompt_motion import (
    EDGES,
    JOINTS,
    canonical_motion,
    centre_and_ground,
    resolve_joint_indices as _resolve,
)

__all__ = [
    "CM_TO_M",
    "HEAD_HEIGHT_M",
    "scale_for",
    "EDGES",
    "JOINTS",
    "SNAPMOGEN_JOINT_MAP",
    "adapt_motion",
    "resolve_joint_indices",
    "truncate",
]

# Enumerated from SnapMoGen's utils/A_Pose.bvh, and cross-checked against the kinematic
# chain in utils/paramUtil.py and the contact/face joint names in utils/motion_process_bvh.py.
#
# Two of SnapMoGen's 24 joints have no canonical counterpart and are dropped:
#
#   ROOT            a world-transform node whose rest offset from C_pelvis0001 is exactly
#                   [0, 0, 0] — they are coincident, so nothing is lost by preferring the
#                   pelvis, which keeps the legs' parent where the canonical edges expect it.
#   C_neck0002      a second neck joint; SMPL-22 has one.
SNAPMOGEN_JOINT_MAP = {
    "pelvis": "C_pelvis0001_bind_JNT",
    "left_hip": "L_legUpper0001_bind_JNT",
    "right_hip": "R_legUpper0001_bind_JNT",
    "spine1": "C_spine0001_bind_JNT",
    "left_knee": "L_legLower0001_bind_JNT",
    "right_knee": "R_legLower0001_bind_JNT",
    "spine2": "C_spine0002_bind_JNT",
    "left_ankle": "L_foot0001_bind_JNT",
    "right_ankle": "R_foot0001_bind_JNT",
    "spine3": "C_spine0003_bind_JNT",
    "left_foot": "L_foot0002_bind_JNT",
    "right_foot": "R_foot0002_bind_JNT",
    "neck": "C_neck0001_bind_JNT",
    "left_collar": "L_clavicle_bind_JNT",
    "right_collar": "R_clavicle_bind_JNT",
    "head": "C_head_bind_JNT",
    "left_shoulder": "L_armUpper0001_bind_JNT",
    "right_shoulder": "R_armUpper0001_bind_JNT",
    "left_elbow": "L_armLower0001_bind_JNT",
    "right_elbow": "R_armLower0001_bind_JNT",
    "left_wrist": "L_hand0001_bind_JNT",
    "right_wrist": "R_hand0001_bind_JNT",
}

#: If SnapMoGen's rig units were centimetres. Kept because it is the obvious reading, and
#: because the tests below pin what it would give: an 0.85 m body.
CM_TO_M = 0.01

#: Where a standing body's head JOINT sits, in metres — the convention this worker uses to
#: put a non-metric rig into a metric schema.
#:
#: Chosen for comparability rather than anthropometric truth: Kimodo's own output lands its
#: head joint at 1.567 m, so at 1.60 m the two models produce bodies within 2% of each
#: other and the triptych compares movement rather than scale. Not a measurement of
#: anything, which is why it is one named constant and not scattered arithmetic.
HEAD_HEIGHT_M = 1.60


def scale_for(rest_head_units: float, head_height_m: float = HEAD_HEIGHT_M) -> float:
    """The rig's unit in metres, measured from its own rest pose."""
    if rest_head_units <= 0:
        raise ValueError(f"rest head height must be positive, got {rest_head_units}")
    return head_height_m / rest_head_units


def resolve_joint_indices(source_names: Sequence[str]) -> list[int]:
    """Resolve the canonical joints against SnapMoGen's runtime joint names."""
    return _resolve(source_names, SNAPMOGEN_JOINT_MAP, label="SnapMoGen skeleton")


def truncate(array: np.ndarray, frames: int) -> np.ndarray:
    """
    Cut a decoded batch entry down to the frames that were actually asked for.

    SnapMoGen's decoder returns `max_motion_length` frames whatever length was requested —
    a 2-second line and a 10-second line both come back as 320 frames — and its own
    reference script truncates at the call site. Missed, a short line silently becomes ten
    seconds of motion that nothing in the pipeline would flag.
    """
    if frames <= 0:
        raise ValueError(f"asked for {frames} frames")
    if array.shape[0] < frames:
        raise ValueError(
            f"SnapMoGen returned {array.shape[0]} frames, fewer than the {frames} asked for"
        )
    return array[:frames]


def adapt_motion(
    positions: np.ndarray,
    local_quaternions: np.ndarray,
    source_names: Sequence[str],
    *,
    fps: int,
    prompt: str,
    seed: int,
    frames: int | None = None,
    scale: float = CM_TO_M,
) -> dict:
    """Return one non-nesting `bodyprompt.motion/v0` motion.

    `positions` and `local_quaternions` are SnapMoGen's forward-kinematics output for one
    sample: [T, 24, 3] in centimetres and [T, 24, 4] as **wxyz**, which is the convention
    its quaternion utilities use throughout.
    """
    if positions.ndim != 3 or positions.shape[-1] != 3:
        raise ValueError(f"expected positions [T,J,3], got {positions.shape}")
    if local_quaternions.shape != (*positions.shape[:2], 4):
        raise ValueError(
            f"expected quaternions [T,J,4] matching positions, got {local_quaternions.shape}"
        )

    if frames is not None:
        positions = truncate(positions, frames)
        local_quaternions = truncate(local_quaternions, frames)

    indices = resolve_joint_indices(source_names)
    pos = np.asarray(positions[:, indices, :], dtype=np.float64).copy() * scale
    quat = np.asarray(local_quaternions[:, indices, :], dtype=np.float64)
    if not np.isfinite(pos).all() or not np.isfinite(quat).all():
        raise ValueError("SnapMoGen returned NaN or infinite motion values")

    centre_and_ground(pos)

    # SnapMoGen carries quaternions as wxyz; the canonical schema stores xyzw, as three.js
    # reads them. Reordering rather than converting — there is no rotation maths here, and
    # a silent w/x swap would tilt every joint by exactly the amount that looks plausible.
    quat = quat[..., [1, 2, 3, 0]]
    norms = np.linalg.norm(quat, axis=-1, keepdims=True)
    quat = quat / np.maximum(norms, 1e-12)

    frames_out = [
        {
            "positions": np.round(frame_pos, 5).tolist(),
            "rotations": np.round(frame_quat, 7).tolist(),
        }
        for frame_pos, frame_quat in zip(pos, quat, strict=True)
    ]
    return canonical_motion(
        frames_out, fps=fps, prompt=prompt, model="snapmogen", seed=seed
    )
