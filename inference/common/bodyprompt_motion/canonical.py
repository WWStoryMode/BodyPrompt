"""
The canonical 22-joint skeleton, and the model-independent half of adapting to it.

Mirrored from docs/motion-schema.md. What lives here is everything that is the same
whichever model produced the motion; what does NOT live here is the joint map, because the
map is model knowledge and it is where the mistakes are. Kimodo's SOMA names and
SnapMoGen's Maya bind-joint names collide with each other and with Mixamo's, so each worker
declares its own exact map and passes it in.

Adapters map by NAME, never by index. A model that renames or reorders a bone would not
crash an index map — it would return a plausible-looking body with false anatomy, which is
the one failure this repository must not ship.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

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

#: Joints whose lowest point defines where the floor is.
FOOT_JOINTS = ("left_ankle", "right_ankle", "left_foot", "right_foot")


def normalised(name: str) -> str:
    return name.lower().replace("-", "").replace("_", "").replace(" ", "")


def resolve_joint_indices(
    source_names: Sequence[str],
    exact: Mapping[str, str] | None = None,
    *,
    label: str = "skeleton",
) -> list[int]:
    """Resolve canonical joints against runtime names, or report every missing joint.

    An `exact` map is used verbatim. Without one, the alias search runs and is checked for
    collisions afterwards — two canonical joints landing on one source joint means the
    aliases do not fit this skeleton and it needs a map of its own.
    """
    lookup = {normalised(name): i for i, name in enumerate(source_names)}
    resolved: list[int] = []
    missing: list[str] = []
    for target in JOINTS:
        candidates = (exact[target],) if exact else ALIASES[target]
        found = next(
            (lookup[normalised(alias)] for alias in candidates if normalised(alias) in lookup),
            None,
        )
        if found is None:
            missing.append(target)
        else:
            resolved.append(found)
    if missing:
        available = ", ".join(source_names)
        raise ValueError(
            f"{label} cannot map canonical joints {missing}; available: {available}"
        )
    if not exact and len(set(resolved)) != len(resolved):
        collided = sorted({
            JOINTS[i] for i, index in enumerate(resolved) if resolved.count(index) > 1
        })
        raise ValueError(
            f"{label} maps several canonical joints onto one source joint ({collided}); "
            f"its naming needs an exact map, not aliases"
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


def centre_and_ground(pos: np.ndarray) -> np.ndarray:
    """Put frame zero at the X/Z origin with its lowest foot on the floor.

    Travel is NOT removed — how far a body goes is part of how the model read the prompt,
    and the ghost-cloud shows that difference on purpose. Only the starting point is
    normalised, so that siblings are comparable without being flattened. Modifies in place
    and returns the same array.
    """
    root_xz = pos[0, 0, [0, 2]].copy()
    pos[:, :, 0] -= root_xz[0]
    pos[:, :, 2] -= root_xz[1]
    feet = [JOINTS.index(name) for name in FOOT_JOINTS]
    pos[:, :, 1] -= float(pos[0, feet, 1].min())
    return pos


def canonical_motion(
    frames: list[dict],
    *,
    fps: int,
    prompt: str,
    model: str,
    seed: int,
) -> dict:
    """Assemble one non-nesting `bodyprompt.motion/v0` motion."""
    return {
        "schema": "bodyprompt.motion/v0",
        "skeleton": "smpl-22",
        "fps": fps,
        "joints": JOINTS,
        "edges": EDGES,
        "frames": frames,
        "prompt": prompt,
        "model": model,
        "seed": seed,
        "stub": False,
    }
