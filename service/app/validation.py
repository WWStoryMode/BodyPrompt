"""Strict validation at the canonical boundary: plausible-looking wrong bodies do not pass."""

from __future__ import annotations

import math

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


def validate_motion(motion: dict, *, allow_variants: bool = True) -> dict:
    """Return the motion unchanged, or raise a user-safe RuntimeError."""
    try:
        if motion["schema"] != "bodyprompt.motion/v0" or motion["skeleton"] != "smpl-22":
            raise ValueError("unsupported schema or skeleton")
        if motion["joints"] != JOINTS:
            raise ValueError("joint names/order do not match canonical smpl-22")
        if not isinstance(motion["fps"], int) or motion["fps"] <= 0:
            raise ValueError("fps must be a positive integer")
        if motion["edges"] != EDGES:
            raise ValueError("edges do not match canonical smpl-22")
        frames = motion["frames"]
        if not frames:
            raise ValueError("motion contains no frames")
        for frame in frames:
            if len(frame["positions"]) != 22 or len(frame["rotations"]) != 22:
                raise ValueError("every frame must contain 22 positions and rotations")
            if any(
                len(value) != 3
                or any(not isinstance(n, (int, float)) or not math.isfinite(n) for n in value)
                for value in frame["positions"]
            ):
                raise ValueError("frame contains malformed or non-finite positions")
            if any(
                len(value) != 4
                or any(not isinstance(n, (int, float)) or not math.isfinite(n) for n in value)
                for value in frame["rotations"]
            ):
                raise ValueError("frame contains malformed or non-finite rotations")
        variants = motion.get("variants", [])
        if variants and not allow_variants:
            raise ValueError("a variant may not contain nested variants")
        for variant in variants:
            validate_motion(variant, allow_variants=False)
    except (KeyError, TypeError, ValueError) as err:
        raise RuntimeError(f"backend returned invalid canonical motion: {err}") from err
    return motion
