"""
The boundary between SMPL-X and the canonical skeleton.

The check that matters here is **head height**, and it matters because the usual one does
not work. SMPL-X produces joints by forward kinematics over a template, so bone lengths are
rigid by construction whatever the joint map says — the same trap SnapMoGen set in Stage B,
where only head height against a human body caught a 0.85 m scale error.
"""

import numpy as np
import pytest
from bodyprompt_motion.canonical import JOINTS

from app.adapter import FRAMES_PER_TOKEN, adapt_motion, check_head_height, frames_to_tokens

# SMPL-X's first 22 joints are the canonical ones, in the canonical order.
SMPLX_NAMES = list(JOINTS) + ["jaw", "left_eye_smplhf", "right_eye_smplhf"]


def standing(frames: int = 10, scale: float = 1.0) -> np.ndarray:
    """A crude upright body: pelvis at 0.9 m, head at 1.6 m, feet on the floor."""
    joints = np.zeros((frames, len(SMPLX_NAMES), 3))
    joints[:, :, 1] = 0.9 * scale
    joints[:, JOINTS.index("head"), 1] = 1.6 * scale
    for foot in ("left_foot", "right_foot", "left_ankle", "right_ankle"):
        joints[:, JOINTS.index(foot), 1] = 0.0
    # a little movement, so nothing under test is a constant
    joints[:, JOINTS.index("left_wrist"), 0] = np.linspace(0, 0.4, frames)
    return joints


def test_a_body_of_the_right_size_passes_and_is_grounded():
    motion = adapt_motion(standing(), SMPLX_NAMES, fps=30, prompt="x", seed=7)

    assert motion["schema"] == "bodyprompt.motion/v0"
    assert motion["joints"] == JOINTS
    assert len(motion["frames"]) == 10
    lowest = min(p[1] for p in motion["frames"][0]["positions"])
    assert lowest == pytest.approx(0.0, abs=1e-6)  # feet on the floor at frame zero


def test_a_body_at_the_wrong_scale_is_refused():
    """The check that caught SnapMoGen. A joint map that is wrong produces a body that is
    the wrong size, and nothing else in this file would notice."""
    with pytest.raises(ValueError, match="head height"):
        adapt_motion(standing(scale=0.5), SMPLX_NAMES, fps=30, prompt="x", seed=7)

    with pytest.raises(ValueError, match="head height"):
        adapt_motion(standing(scale=1.6), SMPLX_NAMES, fps=30, prompt="x", seed=7)


def test_bone_rigidity_is_not_a_check_here_and_the_test_says_so():
    """Deliberately asserting the WEAKNESS, so nobody adds a rigidity check later and
    believes it validated something. SMPL-X bones are rigid whatever the map is."""
    wrong = standing()
    scrambled = list(SMPLX_NAMES)
    scrambled[15], scrambled[12] = scrambled[12], scrambled[15]  # head <-> neck

    # Rigidity is unchanged by relabelling; only head height notices.
    with pytest.raises(ValueError, match="head height"):
        adapt_motion(wrong, scrambled, fps=30, prompt="x", seed=7)


def test_truncation_shortens_and_never_pads():
    """A padded tail is a body held still that the model never asked to hold still."""
    motion = adapt_motion(standing(40), SMPLX_NAMES, fps=30, prompt="x", seed=7, frames=12)
    assert len(motion["frames"]) == 12

    # Asking for more than exists returns what exists, not a padded lie.
    longer = adapt_motion(standing(8), SMPLX_NAMES, fps=30, prompt="x", seed=7, frames=99)
    assert len(longer["frames"]) == 8


def test_nan_is_refused_rather_than_rounded_away():
    broken = standing()
    broken[3, JOINTS.index("left_elbow"), 1] = np.nan

    with pytest.raises(ValueError, match="NaN"):
        adapt_motion(broken, SMPLX_NAMES, fps=30, prompt="x", seed=7)


def test_rotations_are_left_identity_on_purpose():
    """The model has rotations, but they are SMPL-X pose parameters relative to a rest pose,
    and the schema's `rotations` field means something else. An empty field is safer than a
    differently-defined one nothing would notice was wrong."""
    motion = adapt_motion(standing(), SMPLX_NAMES, fps=30, prompt="x", seed=7)

    assert motion["frames"][0]["rotations"] == [[0.0, 0.0, 0.0, 1.0]] * 22


def test_frames_and_tokens_convert_the_way_the_model_downsamples():
    assert FRAMES_PER_TOKEN == 4
    assert frames_to_tokens(4) == 1
    assert frames_to_tokens(5) == 2   # rounds up: never ask for less than was wanted
    assert frames_to_tokens(150) == 38
    assert frames_to_tokens(0) == 1   # never zero


def test_head_height_is_returned_so_a_worker_can_log_it():
    assert check_head_height(standing()[:, :22]) == pytest.approx(1.6, abs=1e-6)
