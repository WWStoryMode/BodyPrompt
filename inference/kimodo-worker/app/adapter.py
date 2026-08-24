"""
Reduce a Kimodo SOMA motion into BodyPrompt's canonical 22-joint skeleton.

The adapter maps by names, never indices. Kimodo changed its SOMA output skeleton once
already; an index map could keep returning plausible-looking but anatomically false bodies
after another change. Unknown names therefore stop the worker at its honesty boundary.

Only the MAP lives here. Everything around it — resolving names, converting rotations,
centring a sample, assembling the schema — is the same work whichever model produced the
motion, and lives in `bodyprompt_motion` so that two workers cannot drift apart on it.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from bodyprompt_motion import (
    EDGES,
    JOINTS,
    canonical_motion,
    centre_and_ground,
    matrix_to_quaternion,
    resolve_joint_indices as _resolve,
)

__all__ = [
    "EDGES",
    "JOINTS",
    "SKELETON_MAPS",
    "SOMA_JOINT_MAP",
    "adapt_motion",
    "matrix_to_quaternion",
    "resolve_joint_indices",
]

# Kimodo's SOMA skeletons (somaskel30, and the somaskel77 its SOMA models convert their
# output to) get an exact map rather than an alias search — they have to, because SOMA's
# mocap-style names collide head-on with the Mixamo-style ones below. In SOMA, "LeftLeg"
# is the hip and "LeftShin" the knee; in Mixamo, "LeftUpLeg" is the hip and "LeftLeg" the
# knee. The same string means two different joints, so no single alias table can serve
# both without silently returning an anatomically false body.
SOMA_JOINT_MAP = {
    "pelvis": "Hips",
    "left_hip": "LeftLeg", "right_hip": "RightLeg",
    "spine1": "Spine1",
    "left_knee": "LeftShin", "right_knee": "RightShin",
    "spine2": "Spine2",
    "left_ankle": "LeftFoot", "right_ankle": "RightFoot",
    "spine3": "Chest",
    "left_foot": "LeftToeBase", "right_foot": "RightToeBase",
    "neck": "Neck1",
    "left_collar": "LeftShoulder", "right_collar": "RightShoulder",
    "head": "Head",
    "left_shoulder": "LeftArm", "right_shoulder": "RightArm",
    "left_elbow": "LeftForeArm", "right_elbow": "RightForeArm",
    "left_wrist": "LeftHand", "right_wrist": "RightHand",
}

SKELETON_MAPS = {
    "somaskel77": SOMA_JOINT_MAP,
    "somaskel30": SOMA_JOINT_MAP,
}

def resolve_joint_indices(
    source_names: Sequence[str], skeleton_name: str | None = None
) -> list[int]:
    """Resolve canonical joints against Kimodo's runtime names.

    A skeleton we have an exact map for is resolved by that map; anything else falls back
    to the shared alias search, which reports collisions rather than guessing.
    """
    exact = SKELETON_MAPS.get(str(skeleton_name or "").lower())
    label = "Kimodo skeleton" if exact else f"Kimodo skeleton {skeleton_name!r}"
    return _resolve(source_names, exact, label=label)


def adapt_motion(
    positions: np.ndarray,
    local_rotations: np.ndarray,
    source_names: Sequence[str],
    *,
    fps: int,
    prompt: str,
    seed: int,
    skeleton_name: str | None = None,
) -> dict:
    """Return one non-nesting `bodyprompt.motion/v0` motion."""
    if positions.ndim != 3 or positions.shape[-1] != 3:
        raise ValueError(f"expected positions [T,J,3], got {positions.shape}")
    if local_rotations.shape != (*positions.shape[:2], 3, 3):
        raise ValueError(
            f"expected rotations [T,J,3,3] matching positions, got {local_rotations.shape}"
        )

    indices = resolve_joint_indices(source_names, skeleton_name)
    pos = np.asarray(positions[:, indices, :], dtype=np.float64).copy()
    rot = np.asarray(local_rotations[:, indices, :, :], dtype=np.float64)
    if not np.isfinite(pos).all() or not np.isfinite(rot).all():
        raise ValueError("Kimodo returned NaN or infinite motion values")

    # Kimodo positions are already metres/Y-up, so no scaling is needed here.
    centre_and_ground(pos)

    frames = []
    for frame_pos, frame_rot in zip(pos, rot, strict=True):
        frames.append({
            "positions": np.round(frame_pos, 5).tolist(),
            "rotations": [matrix_to_quaternion(matrix) for matrix in frame_rot],
        })

    return canonical_motion(frames, fps=fps, prompt=prompt, model="kimodo", seed=seed)
