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


def _validate_segments(segments, total_frames: int) -> None:
    """A poem's segments must tile its frames exactly, or a line maps to the wrong body.

    The segment table is what lets the instrument say "this movement is that sentence".
    A gap, an overlap or a short count would silently attribute movement to the wrong
    line, which is worse than having no table at all.
    """
    if segments is None:
        return
    if not segments:
        raise ValueError("segments present but empty")
    expected_start = 0
    for index, segment in enumerate(segments):
        if segment["index"] != index:
            raise ValueError(f"segment {index} is out of order")
        if segment["start_frame"] != expected_start:
            raise ValueError(
                f"segment {index} starts at {segment['start_frame']}, expected {expected_start}"
            )
        if segment["end_frame"] <= segment["start_frame"]:
            raise ValueError(f"segment {index} ends before it starts")
        if not str(segment["prompt"]).strip():
            raise ValueError(f"segment {index} has no prompt")
        if segment["transition_frames"] < 0:
            raise ValueError(f"segment {index} has negative transition frames")
        expected_start = segment["end_frame"]
    if expected_start != total_frames:
        raise ValueError(
            f"segments cover {expected_start} frames but the motion has {total_frames}"
        )


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
        _validate_segments(motion.get("segments"), len(frames))
        variants = motion.get("variants", [])
        if variants and not allow_variants:
            raise ValueError("a variant may not contain nested variants")
        for variant in variants:
            validate_motion(variant, allow_variants=False)
    except (KeyError, TypeError, ValueError) as err:
        raise RuntimeError(f"backend returned invalid canonical motion: {err}") from err
    return motion
