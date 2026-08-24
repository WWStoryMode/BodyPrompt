import math

import numpy as np
import pytest

from app.adapter import (
    CM_TO_M,
    JOINTS,
    SNAPMOGEN_JOINT_MAP,
    adapt_motion,
    resolve_joint_indices,
    truncate,
)

# SnapMoGen's 24-joint rig, verbatim from utils/A_Pose.bvh in its repository (dc6881d),
# in the order the BVH declares them — which is the order its tensors carry.
SNAPMOGEN_JOINTS = [
    "ROOT",
    "C_spine0001_bind_JNT", "C_spine0002_bind_JNT", "C_spine0003_bind_JNT",
    "C_neck0001_bind_JNT", "C_neck0002_bind_JNT", "C_head_bind_JNT",
    "L_clavicle_bind_JNT", "L_armUpper0001_bind_JNT", "L_armLower0001_bind_JNT",
    "L_hand0001_bind_JNT",
    "R_clavicle_bind_JNT", "R_armUpper0001_bind_JNT", "R_armLower0001_bind_JNT",
    "R_hand0001_bind_JNT",
    "C_pelvis0001_bind_JNT",
    "L_legUpper0001_bind_JNT", "L_legLower0001_bind_JNT",
    "L_foot0001_bind_JNT", "L_foot0002_bind_JNT",
    "R_legUpper0001_bind_JNT", "R_legLower0001_bind_JNT",
    "R_foot0001_bind_JNT", "R_foot0002_bind_JNT",
]


def test_the_map_names_only_joints_snapmogen_actually_has():
    """The map was read off A_Pose.bvh, and this is what stops it drifting from it."""
    assert set(SNAPMOGEN_JOINT_MAP) == set(JOINTS)
    unknown = set(SNAPMOGEN_JOINT_MAP.values()) - set(SNAPMOGEN_JOINTS)
    assert unknown == set()


def test_no_two_canonical_joints_share_a_source_joint():
    """A collision would put two limbs in one place and nothing would crash."""
    sources = list(SNAPMOGEN_JOINT_MAP.values())
    assert len(set(sources)) == len(sources)


def test_exactly_the_two_expected_joints_are_dropped():
    """
    ROOT is a world-transform node coincident with the pelvis (rest offset [0,0,0]), and
    C_neck0002 is a second neck joint SMPL-22 does not have. Anything else going missing
    is a mistake, not a reduction.
    """
    assert set(SNAPMOGEN_JOINTS) - set(SNAPMOGEN_JOINT_MAP.values()) == {
        "ROOT", "C_neck0002_bind_JNT",
    }


def test_resolution_puts_each_canonical_joint_at_its_real_index():
    indices = resolve_joint_indices(SNAPMOGEN_JOINTS)

    assert len(indices) == 22
    assert indices[JOINTS.index("pelvis")] == SNAPMOGEN_JOINTS.index("C_pelvis0001_bind_JNT")
    assert indices[JOINTS.index("head")] == SNAPMOGEN_JOINTS.index("C_head_bind_JNT")
    # The pair most likely to be swapped: an ankle and the toe below it.
    assert indices[JOINTS.index("left_ankle")] == SNAPMOGEN_JOINTS.index("L_foot0001_bind_JNT")
    assert indices[JOINTS.index("left_foot")] == SNAPMOGEN_JOINTS.index("L_foot0002_bind_JNT")


def test_a_renamed_joint_stops_the_worker_rather_than_guessing():
    renamed = [n if n != "C_head_bind_JNT" else "C_head_bind_JNT_v2" for n in SNAPMOGEN_JOINTS]

    with pytest.raises(ValueError, match="cannot map canonical joints"):
        resolve_joint_indices(renamed)


# ---- the decoder's full-grid trap ------------------------------------------

def test_truncation_cuts_the_padded_grid_back_to_what_was_asked():
    """
    SnapMoGen's decoder returns max_motion_length frames whatever was requested — 2 seconds
    and 10 seconds both come back as 320. Its own script truncates at the call site; missed,
    a short line silently becomes ten seconds and nothing downstream would flag it.
    """
    padded = np.arange(320 * 24 * 3, dtype=np.float64).reshape(320, 24, 3)

    assert truncate(padded, 60).shape == (60, 24, 3)
    assert np.array_equal(truncate(padded, 60), padded[:60])


def test_asking_for_more_frames_than_came_back_is_an_error():
    with pytest.raises(ValueError, match="fewer than"):
        truncate(np.zeros((30, 24, 3)), 60)


# ---- adapting a whole motion ------------------------------------------------

def rig(frames: int = 4, *, travel_cm: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """A rigid synthetic body in centimetres, standing on the floor, optionally walking.

    Rigid on purpose: every bone keeps its length, so if adaptation scrambles joints the
    bone-length check below notices.
    """
    heights = {  # centimetres above the floor
        "C_pelvis0001_bind_JNT": 95.0, "C_spine0001_bind_JNT": 105.0,
        "C_spine0002_bind_JNT": 115.0, "C_spine0003_bind_JNT": 128.0,
        "C_neck0001_bind_JNT": 145.0, "C_neck0002_bind_JNT": 150.0,
        "C_head_bind_JNT": 160.0,
        "L_clavicle_bind_JNT": 140.0, "R_clavicle_bind_JNT": 140.0,
        "L_armUpper0001_bind_JNT": 138.0, "R_armUpper0001_bind_JNT": 138.0,
        "L_armLower0001_bind_JNT": 110.0, "R_armLower0001_bind_JNT": 110.0,
        "L_hand0001_bind_JNT": 85.0, "R_hand0001_bind_JNT": 85.0,
        "L_legUpper0001_bind_JNT": 90.0, "R_legUpper0001_bind_JNT": 90.0,
        "L_legLower0001_bind_JNT": 48.0, "R_legLower0001_bind_JNT": 48.0,
        "L_foot0001_bind_JNT": 9.0, "R_foot0001_bind_JNT": 9.0,
        "L_foot0002_bind_JNT": 3.0, "R_foot0002_bind_JNT": 3.0,
        "ROOT": 95.0,
    }
    sides = {"L_": 8.0, "R_": -8.0}
    positions = np.zeros((frames, 24, 3))
    for f in range(frames):
        z = travel_cm * f
        for j, name in enumerate(SNAPMOGEN_JOINTS):
            x = next((v for prefix, v in sides.items() if name.startswith(prefix)), 0.0)
            positions[f, j] = [x, heights[name], z]
    quats = np.zeros((frames, 24, 4))
    quats[..., 0] = 1.0  # identity, wxyz — w first, as SnapMoGen carries them
    return positions, quats


def test_centimetres_become_metres_and_the_body_stands_on_the_floor():
    positions, quats = rig()

    motion = adapt_motion(positions, quats, SNAPMOGEN_JOINTS,
                          fps=30, prompt="a body remembers", seed=7)

    head = motion["frames"][0]["positions"][JOINTS.index("head")]
    # 160 cm head, 3 cm toes on the floor -> 1.57 m once the toes are grounded.
    assert head[1] == pytest.approx((160.0 - 3.0) * CM_TO_M, abs=1e-6)
    lowest = min(p[1] for p in motion["frames"][0]["positions"])
    assert lowest == pytest.approx(0.0, abs=1e-9)


def test_travel_is_kept_while_the_start_is_normalised():
    """How far a body goes is part of how the model read the prompt, never an artefact."""
    positions, quats = rig(frames=4, travel_cm=50.0)

    motion = adapt_motion(positions, quats, SNAPMOGEN_JOINTS,
                          fps=30, prompt="walking away", seed=1)

    first = motion["frames"][0]["positions"][JOINTS.index("pelvis")]
    last = motion["frames"][-1]["positions"][JOINTS.index("pelvis")]
    assert first[0] == pytest.approx(0.0, abs=1e-9)
    assert first[2] == pytest.approx(0.0, abs=1e-9)
    assert last[2] == pytest.approx(1.5, abs=1e-6)  # 3 frames x 50 cm


def test_the_body_stays_rigid_through_adaptation():
    """
    Bone-length rigidity is the check that caught the SOMA question, and it is the one that
    would catch a wrong SnapMoGen map: a scrambled joint stretches a bone every frame.
    """
    positions, quats = rig(frames=6, travel_cm=20.0)

    motion = adapt_motion(positions, quats, SNAPMOGEN_JOINTS,
                          fps=30, prompt="x", seed=1)

    for child, parent in motion["edges"]:
        lengths = [
            math.dist(f["positions"][child], f["positions"][parent])
            for f in motion["frames"]
        ]
        assert max(lengths) - min(lengths) < 1e-9


def test_quaternions_are_reordered_from_wxyz_to_the_schema_s_xyzw():
    """
    SnapMoGen carries w first (`torch.stack((w, x, y, z))` in common/quaternion.py); the
    canonical schema stores [qx, qy, qz, qw]. A silent w/x swap tilts every joint by
    exactly the amount that still looks like a body.
    """
    positions, quats = rig(frames=1)
    quats[0, :] = [0.5, 0.5, 0.5, 0.5]  # wxyz, already unit length
    quats[0, SNAPMOGEN_JOINTS.index("C_head_bind_JNT")] = [0.0, 1.0, 0.0, 0.0]  # w=0, x=1

    motion = adapt_motion(positions, quats, SNAPMOGEN_JOINTS, fps=30, prompt="x", seed=1)

    head = motion["frames"][0]["rotations"][JOINTS.index("head")]
    assert head == [1.0, 0.0, 0.0, 0.0]  # xyzw: x=1, w=0


def test_nan_from_the_model_stops_the_worker():
    positions, quats = rig()
    positions[1, SNAPMOGEN_JOINTS.index("C_head_bind_JNT"), 1] = np.nan

    with pytest.raises(ValueError, match="NaN"):
        adapt_motion(positions, quats, SNAPMOGEN_JOINTS, fps=30, prompt="x", seed=1)


def test_nan_in_a_dropped_joint_is_not_our_problem():
    """
    The check runs on the joints that survive the reduction, not on the raw output. A NaN
    in C_neck0002 or ROOT never reaches a frame, so refusing on it would reject motions
    that are entirely fine.
    """
    positions, quats = rig()
    positions[1, SNAPMOGEN_JOINTS.index("C_neck0002_bind_JNT"), 1] = np.nan

    motion = adapt_motion(positions, quats, SNAPMOGEN_JOINTS, fps=30, prompt="x", seed=1)

    assert all(np.isfinite(f["positions"]).all() for f in motion["frames"])


def test_the_motion_says_which_model_made_it_and_that_it_is_not_a_stub():
    positions, quats = rig()

    motion = adapt_motion(positions, quats, SNAPMOGEN_JOINTS, fps=30, prompt="x", seed=3)

    assert motion["schema"] == "bodyprompt.motion/v0"
    assert motion["skeleton"] == "smpl-22"
    assert motion["model"] == "snapmogen"
    assert motion["stub"] is False
    assert motion["seed"] == 3
    assert len(motion["joints"]) == 22
    assert all(len(f["positions"]) == 22 and len(f["rotations"]) == 22
               for f in motion["frames"])


# ---- putting a non-metric rig into a metric schema --------------------------

def test_the_rig_scale_is_measured_from_the_rig_not_assumed():
    """
    SnapMoGen's rest-pose head joint sits at 93.08 units. Read as centimetres that is an
    0.85 m body — not a person, and the notation registers would read it as a permanent
    crouch, because their thresholds (a planted foot below 0.08 m, a knee-height ankle
    below 0.6 m) are calibrated in real metres.

    The rig never claims a unit, so the mapping is a convention. It is derived from the
    rig's own rest pose so that a rig change moves it, rather than being a constant that
    silently stops being true.
    """
    from app.adapter import HEAD_HEIGHT_M, CM_TO_M, scale_for

    assert 93.08 * CM_TO_M == pytest.approx(0.9308)          # the naive reading
    assert 93.08 * scale_for(93.08) == pytest.approx(HEAD_HEIGHT_M)
    # A different rig, same convention.
    assert 50.0 * scale_for(50.0) == pytest.approx(HEAD_HEIGHT_M)


def test_a_rig_with_no_height_is_refused_rather_than_dividing_by_zero():
    from app.adapter import scale_for

    with pytest.raises(ValueError, match="must be positive"):
        scale_for(0.0)


def test_the_scale_reaches_the_motion():
    from app.adapter import scale_for

    positions, quats = rig()
    scale = scale_for(93.08)

    motion = adapt_motion(positions, quats, SNAPMOGEN_JOINTS, fps=30, prompt="x", seed=1,
                          scale=scale)

    head = motion["frames"][0]["positions"][JOINTS.index("head")]
    # Positions are stored to 5 decimal places, so the tolerance is that, not tighter.
    assert head[1] == pytest.approx((160.0 - 3.0) * scale, abs=1e-5)
