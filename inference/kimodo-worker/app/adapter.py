"""
Reduce a Kimodo SOMA motion into BodyPrompt's canonical 22-joint skeleton.

The adapter maps by names, never indices. Kimodo changed its SOMA output skeleton once
already; an index map could keep returning plausible-looking but anatomically false bodies
after another change. Unknown names therefore stop the worker at its honesty boundary.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np

JOINTS = [
    "pelvis", "left_hip", "right_hip", "spine1", "left_knee", "right_knee",
    "spine2", "left_ankle", "right_ankle", "spine3", "left_foot", "right_foot",
    "neck", "left_collar", "right_collar", "head", "left_shoulder",
    "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
]

EDGES = [
    [1, 0], [2, 0], [3, 0], [4, 1], [5, 2], [6, 3], [7, 4], [8, 5], [9, 6],
    [10, 7], [11, 8], [12, 9], [13, 9], [14, 9], [15, 12], [16, 13], [17, 14],
    [18, 16], [19, 17], [20, 18], [21, 19],
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

# Fallback for skeletons we have no exact map for: descriptive and Mixamo-style names.
# Each destination still resolves to exactly one source joint; aliases are compatibility,
# not averaging.
ALIASES = {
    "pelvis": ("pelvis", "root", "hips"),
    "left_hip": ("left_hip", "l_hip", "leftupleg"),
    "right_hip": ("right_hip", "r_hip", "rightupleg"),
    "spine1": ("spine1", "spine_1", "lowerback"),
    "left_knee": ("left_knee", "l_knee", "leftleg"),
    "right_knee": ("right_knee", "r_knee", "rightleg"),
    "spine2": ("spine2", "spine_2", "spine"),
    "left_ankle": ("left_ankle", "l_ankle", "leftfoot"),
    "right_ankle": ("right_ankle", "r_ankle", "rightfoot"),
    "spine3": ("spine3", "spine_3", "chest"),
    "left_foot": ("left_foot", "l_foot", "lefttoe", "lefttoebase"),
    "right_foot": ("right_foot", "r_foot", "righttoe", "righttoebase"),
    "neck": ("neck", "neck1"),
    "left_collar": ("left_collar", "l_collar", "leftclavicle"),
    "right_collar": ("right_collar", "r_collar", "rightclavicle"),
    "head": ("head",),
    "left_shoulder": ("left_shoulder", "l_shoulder", "leftarm"),
    "right_shoulder": ("right_shoulder", "r_shoulder", "rightarm"),
    "left_elbow": ("left_elbow", "l_elbow", "leftforearm"),
    "right_elbow": ("right_elbow", "r_elbow", "rightforearm"),
    "left_wrist": ("left_wrist", "l_wrist", "lefthand"),
    "right_wrist": ("right_wrist", "r_wrist", "righthand"),
}


def _normalized(name: str) -> str:
    return name.lower().replace("-", "").replace("_", "").replace(" ", "")


def resolve_joint_indices(source_names: Sequence[str], skeleton_name: str | None = None) -> list[int]:
    """Resolve canonical joints against runtime names, or report every missing joint.

    A skeleton we have an exact map for is resolved by that map. Anything else falls back
    to the alias search, which is checked for collisions afterwards — two canonical joints
    landing on one source joint means the aliases do not fit this skeleton.
    """
    lookup = {_normalized(name): i for i, name in enumerate(source_names)}
    exact = SKELETON_MAPS.get(str(skeleton_name or "").lower())
    resolved: list[int] = []
    missing: list[str] = []
    for target in JOINTS:
        candidates = (exact[target],) if exact else ALIASES[target]
        found = next(
            (lookup[_normalized(alias)] for alias in candidates if _normalized(alias) in lookup),
            None,
        )
        if found is None:
            missing.append(target)
        else:
            resolved.append(found)
    if missing:
        available = ", ".join(source_names)
        raise ValueError(
            f"Kimodo skeleton cannot map canonical joints {missing}; available: {available}"
        )
    if not exact and len(set(resolved)) != len(resolved):
        collided = sorted({
            JOINTS[i] for i, index in enumerate(resolved) if resolved.count(index) > 1
        })
        raise ValueError(
            f"Kimodo skeleton {skeleton_name!r} maps several canonical joints onto one source "
            f"joint ({collided}); its naming needs an exact map, not aliases"
        )
    return resolved


def matrix_to_quaternion(matrix: np.ndarray) -> list[float]:
    """Convert one 3×3 rotation matrix to a normalized xyzw quaternion."""
    m = matrix
    trace = float(np.trace(m))
    if trace > 0:
        s = math.sqrt(trace + 1.0) * 2
        q = np.array([
            (m[2, 1] - m[1, 2]) / s,
            (m[0, 2] - m[2, 0]) / s,
            (m[1, 0] - m[0, 1]) / s,
            0.25 * s,
        ])
    else:
        i = int(np.argmax(np.diag(m)))
        if i == 0:
            s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
            q = np.array([0.25 * s, (m[0, 1] + m[1, 0]) / s,
                          (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s])
        elif i == 1:
            s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
            q = np.array([(m[0, 1] + m[1, 0]) / s, 0.25 * s,
                          (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s])
        else:
            s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
            q = np.array([(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s,
                          0.25 * s, (m[1, 0] - m[0, 1]) / s])
    q /= max(np.linalg.norm(q), 1e-12)
    return [round(float(value), 7) for value in q]


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

    # Kimodo positions are already metres/Y-up. Centre samples for the ghost-cloud without
    # removing travel: frame zero sits at X/Z origin and its lowest foot point sits at Y=0.
    root_xz = pos[0, 0, [0, 2]].copy()
    pos[:, :, 0] -= root_xz[0]
    pos[:, :, 2] -= root_xz[1]
    foot_indices = [JOINTS.index(name) for name in ("left_ankle", "right_ankle",
                                                    "left_foot", "right_foot")]
    pos[:, :, 1] -= float(pos[0, foot_indices, 1].min())

    frames = []
    for frame_pos, frame_rot in zip(pos, rot, strict=True):
        frames.append({
            "positions": np.round(frame_pos, 5).tolist(),
            "rotations": [matrix_to_quaternion(matrix) for matrix in frame_rot],
        })

    return {
        "schema": "bodyprompt.motion/v0",
        "skeleton": "smpl-22",
        "fps": fps,
        "joints": JOINTS,
        "edges": EDGES,
        "frames": frames,
        "prompt": prompt,
        "model": "kimodo",
        "seed": seed,
        "stub": False,
    }
