import numpy as np
import pytest

from app.adapter import (
    JOINTS,
    SOMA_JOINT_MAP,
    adapt_motion,
    matrix_to_quaternion,
    resolve_joint_indices,
)

# Kimodo's somaskel30 bone order, verbatim from kimodo.skeleton.definitions.
SOMASKEL30 = [
    "Hips", "Spine1", "Spine2", "Chest", "Neck1", "Neck2", "Head", "Jaw", "LeftEye",
    "RightEye", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "LeftHandThumbEnd",
    "LeftHandMiddleEnd", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "RightHandThumbEnd", "RightHandMiddleEnd", "LeftLeg", "LeftShin", "LeftFoot",
    "LeftToeBase", "RightLeg", "RightShin", "RightFoot", "RightToeBase",
]


def test_soma_skeleton_maps_to_the_named_joint_not_a_lookalike():
    indices = resolve_joint_indices(SOMASKEL30, "somaskel30")

    assert [SOMASKEL30[i] for i in indices] == [SOMA_JOINT_MAP[joint] for joint in JOINTS]
    # The trap the exact map exists to avoid: SOMA's LeftLeg is the hip, not the knee.
    assert SOMASKEL30[indices[JOINTS.index("left_hip")]] == "LeftLeg"
    assert SOMASKEL30[indices[JOINTS.index("left_knee")]] == "LeftShin"


def test_aliases_refuse_to_map_two_joints_onto_one():
    source = ["LeftFoot" if name == "left_ankle" else name for name in JOINTS]

    with pytest.raises(ValueError, match="onto one source joint"):
        resolve_joint_indices(source)


def test_resolves_names_not_source_order():
    source = list(reversed(JOINTS))

    indices = resolve_joint_indices(source)

    assert [source[i] for i in indices] == JOINTS


def test_unknown_skeleton_fails_with_available_names():
    with pytest.raises(ValueError, match="cannot map canonical joints"):
        resolve_joint_indices(["root", "head"])


def test_identity_matrix_is_xyzw_identity_quaternion():
    assert matrix_to_quaternion(np.eye(3)) == [0.0, 0.0, 0.0, 1.0]


def test_adapter_centres_and_grounds_without_removing_travel():
    frames = 2
    positions = np.zeros((frames, len(JOINTS), 3))
    positions[:, :, 0] = 4
    positions[:, :, 1] = 1
    positions[:, :, 2] = -2
    positions[1, :, 0] += 0.5
    rotations = np.broadcast_to(np.eye(3), (frames, len(JOINTS), 3, 3)).copy()

    motion = adapt_motion(
        positions, rotations, JOINTS, fps=30, prompt="slip away", seed=42
    )

    assert motion["frames"][0]["positions"][0] == [0.0, 0.0, 0.0]
    assert motion["frames"][1]["positions"][0][0] == 0.5
    assert motion["frames"][0]["rotations"][0] == [0.0, 0.0, 0.0, 1.0]
    assert motion["seed"] == 42
    assert "variants" not in motion


def test_adapter_rejects_non_finite_output():
    positions = np.zeros((1, len(JOINTS), 3))
    positions[0, 0, 0] = np.nan
    rotations = np.broadcast_to(np.eye(3), (1, len(JOINTS), 3, 3)).copy()

    with pytest.raises(ValueError, match="NaN"):
        adapt_motion(positions, rotations, JOINTS, fps=30, prompt="move", seed=1)
