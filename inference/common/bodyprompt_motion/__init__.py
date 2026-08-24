"""The canonical skeleton, and the parts of adapting to it that belong to no one model.

Each worker owns its own joint MAP — that is model knowledge and it is where the mistakes
live. Everything around the map is the same work every time: resolving names, converting
rotations, centring a sample, assembling `bodyprompt.motion/v0`. Two copies of that would
drift, and drift here does not crash: it returns a plausible-looking body with false
anatomy.
"""

from .canonical import (
    ALIASES,
    EDGES,
    JOINTS,
    canonical_motion,
    centre_and_ground,
    matrix_to_quaternion,
    normalised,
    resolve_joint_indices,
)

__all__ = [
    "ALIASES",
    "EDGES",
    "JOINTS",
    "canonical_motion",
    "centre_and_ground",
    "matrix_to_quaternion",
    "normalised",
    "resolve_joint_indices",
]
