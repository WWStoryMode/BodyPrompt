#!/usr/bin/env python3
"""
Generate BodyPrompt canonical-motion fixtures (bodyprompt.motion/v0).

These are HAND-AUTHORED KEYFRAMES, interpolated into per-frame joint positions.
They are NOT produced by any AI model — they are placeholder motions that let the
renderer and the API contract be real before a model exists (see docs/motion-schema.md).

Run from anywhere:  python3 fixtures/_generate.py
It (re)writes the *.json fixtures next to this file.

How a motion is authored
------------------------
- We start from a single REST pose (a person standing, arms hanging).
- Each motion is a short list of KEYFRAMES. A keyframe says, at some phase t in [0,1],
  "nudge these joints by these offsets (metres) from rest."
- Offsets propagate DOWN the kinematic chain: nudging a shoulder carries the elbow and
  wrist with it (a cheap translation-only forward-kinematics), so limbs move as units.
- Between keyframes we smoothstep-interpolate, then sample the timeline at `fps`.

Coordinate system: Y up, ground at y=0, metres. Left = +X (subject's left).
"""

import json
import math
import os

# ----------------------------------------------------------------------------
# Skeleton: smpl-22 (index-aligned name list + [child, parent] edges).
# ----------------------------------------------------------------------------
JOINTS = [
    "pelvis", "left_hip", "right_hip", "spine1", "left_knee", "right_knee",
    "spine2", "left_ankle", "right_ankle", "spine3", "left_foot", "right_foot",
    "neck", "left_collar", "right_collar", "head", "left_shoulder",
    "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
]
J = {name: i for i, name in enumerate(JOINTS)}  # name -> index

EDGES = [
    (1, 0), (2, 0), (3, 0), (4, 1), (5, 2), (6, 3), (7, 4), (8, 5), (9, 6),
    (10, 7), (11, 8), (12, 9), (13, 9), (14, 9), (15, 12), (16, 13), (17, 14),
    (18, 16), (19, 17), (20, 18), (21, 19),
]
PARENT = {child: parent for child, parent in EDGES}  # pelvis (0) omitted = root

# ----------------------------------------------------------------------------
# Rest pose: a person standing, arms hanging at their sides. Metres, Y up.
# ----------------------------------------------------------------------------
REST = {
    "pelvis":        (0.00, 0.95, 0.00),
    "left_hip":      (0.09, 0.90, 0.00),
    "right_hip":     (-0.09, 0.90, 0.00),
    "spine1":        (0.00, 1.06, 0.00),
    "left_knee":     (0.10, 0.52, 0.00),
    "right_knee":    (-0.10, 0.52, 0.00),
    "spine2":        (0.00, 1.18, 0.00),
    "left_ankle":    (0.10, 0.09, 0.00),
    "right_ankle":   (-0.10, 0.09, 0.00),
    "spine3":        (0.00, 1.30, 0.00),
    "left_foot":     (0.10, 0.03, 0.13),
    "right_foot":    (-0.10, 0.03, 0.13),
    "neck":          (0.00, 1.45, 0.00),
    "left_collar":   (0.06, 1.43, 0.00),
    "right_collar":  (-0.06, 1.43, 0.00),
    "head":          (0.00, 1.62, 0.00),
    "left_shoulder": (0.18, 1.43, 0.00),
    "right_shoulder": (-0.18, 1.43, 0.00),
    "left_elbow":    (0.22, 1.13, 0.00),
    "right_elbow":   (-0.22, 1.13, 0.00),
    "left_wrist":    (0.24, 0.86, 0.00),
    "right_wrist":   (-0.24, 0.86, 0.00),
}


def smoothstep(t: float) -> float:
    """Ease-in-out on [0,1]."""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def lerp3(a, b, u):
    return tuple(a[k] + (b[k] - a[k]) * u for k in range(3))


def total_offset(joint_idx, deltas):
    """Sum a joint's own authored delta with all its ancestors' — cheap translation FK."""
    off = [0.0, 0.0, 0.0]
    k = joint_idx
    while k is not None:
        d = deltas.get(k)
        if d is not None:
            off[0] += d[0]
            off[1] += d[1]
            off[2] += d[2]
        k = PARENT.get(k)
    return off


def keyframe_deltas(kf):
    """Turn a keyframe's {joint_name: offset} into {joint_index: offset}."""
    return {J[name]: off for name, off in kf.items()}


def sample_deltas(keyframes, t):
    """Interpolate the per-joint authored deltas at phase t in [0,1]."""
    times = [k[0] for k in keyframes]
    # clamp to ends
    if t <= times[0]:
        return keyframe_deltas(keyframes[0][1])
    if t >= times[-1]:
        return keyframe_deltas(keyframes[-1][1])
    # find bracketing keyframes
    for i in range(len(keyframes) - 1):
        t0, kf0 = keyframes[i]
        t1, kf1 = keyframes[i + 1]
        if t0 <= t <= t1:
            u = smoothstep((t - t0) / (t1 - t0))
            d0, d1 = keyframe_deltas(kf0), keyframe_deltas(kf1)
            out = {}
            for idx in set(d0) | set(d1):
                a = d0.get(idx, (0.0, 0.0, 0.0))
                b = d1.get(idx, (0.0, 0.0, 0.0))
                out[idx] = lerp3(a, b, u)
            return out
    return {}


def build_motion(prompt, model, seed, keyframes, fps=30, seconds=3.0):
    """Sample a keyframe timeline into a canonical-motion object."""
    n_frames = int(round(fps * seconds))
    frames = []
    identity = [0.0, 0.0, 0.0, 1.0]
    for f in range(n_frames):
        t = f / (n_frames - 1)
        deltas = sample_deltas(keyframes, t)
        positions = []
        for name in JOINTS:
            rest = REST[name]
            off = total_offset(J[name], deltas)
            positions.append([
                round(rest[0] + off[0], 4),
                round(rest[1] + off[1], 4),
                round(rest[2] + off[2], 4),
            ])
        frames.append({
            "positions": positions,
            "rotations": [identity[:] for _ in JOINTS],
        })
    return {
        "schema": "bodyprompt.motion/v0",
        "skeleton": "smpl-22",
        "fps": fps,
        "joints": JOINTS,
        "edges": [list(e) for e in EDGES],
        "frames": frames,
        "prompt": prompt,
        "model": model,
        "seed": seed,
    }


# ----------------------------------------------------------------------------
# The three authored motions. Each keyframe = (phase, {joint: (dx,dy,dz)}).
# Reaching uses the RIGHT arm (-X side). Values are in metres.
# ----------------------------------------------------------------------------

# "a body remembers a place it cannot return to" — reaches up/forward, then almost,
# but not quite, returns (a small residual remains: the memory).
REACH_AND_RETURN = [
    (0.00, {}),
    (0.45, {
        "spine3": (0.0, 0.0, 0.06), "head": (0.0, 0.03, 0.07),
        "right_shoulder": (0.0, 0.03, 0.05),
        "right_elbow": (-0.04, 0.34, 0.24),
        "right_wrist": (0.10, 0.60, 0.34),
        "pelvis": (0.0, 0.0, 0.03),
    }),
    (0.70, {
        "spine3": (0.0, 0.0, 0.05), "head": (0.0, 0.02, 0.06),
        "right_shoulder": (0.0, 0.04, 0.05),
        "right_elbow": (-0.03, 0.38, 0.27),
        "right_wrist": (0.12, 0.68, 0.40),
        "pelvis": (0.0, 0.0, 0.02),
    }),
    (1.00, {
        "head": (0.0, 0.0, 0.02),
        "right_elbow": (0.0, 0.05, 0.03),
        "right_wrist": (0.0, 0.08, 0.04),  # residual — not fully home
    }),
]

# "slip away" — the whole body drifts sideways (+X) and turns, arms trailing behind.
SLIP_AWAY = [
    (0.00, {}),
    (0.50, {
        "pelvis": (0.24, -0.02, 0.0),
        "spine3": (0.06, 0.0, -0.03),
        "left_wrist": (-0.06, 0.0, -0.06),
        "right_wrist": (-0.05, 0.0, -0.11),
        "head": (0.03, 0.0, -0.02),
    }),
    (1.00, {
        "pelvis": (0.46, 0.0, 0.02),
        "spine3": (0.10, 0.0, -0.05),
        "left_wrist": (-0.10, 0.02, -0.10),
        "right_wrist": (-0.09, 0.02, -0.16),
        "head": (0.05, 0.0, -0.03),
    }),
]

# "coming home" — both arms sweep inward to the chest (gathering), a slight crouch.
# The knee/ankle deltas compensate the pelvis drop so the feet stay planted (see FALL_AND_RISE).
GATHER = [
    (0.00, {}),
    (0.50, {
        "pelvis": (0.0, -0.10, 0.0),
        "left_knee": (0.0, 0.06, 0.04), "right_knee": (0.0, 0.06, 0.04),
        "left_ankle": (0.0, 0.04, -0.04), "right_ankle": (0.0, 0.04, -0.04),
        "left_shoulder": (0.0, 0.0, 0.04), "right_shoulder": (0.0, 0.0, 0.04),
        "left_elbow": (-0.14, 0.14, 0.12), "right_elbow": (0.14, 0.14, 0.12),
        "left_wrist": (-0.30, 0.26, 0.16), "right_wrist": (0.30, 0.26, 0.16),
        "head": (0.0, -0.02, 0.02),
    }),
    (1.00, {
        "pelvis": (0.0, -0.04, 0.0),
        "left_knee": (0.0, 0.025, 0.015), "right_knee": (0.0, 0.025, 0.015),
        "left_ankle": (0.0, 0.015, -0.015), "right_ankle": (0.0, 0.015, -0.015),
        "left_elbow": (-0.16, 0.16, 0.14), "right_elbow": (0.16, 0.16, 0.14),
        "left_wrist": (-0.36, 0.30, 0.18), "right_wrist": (0.36, 0.30, 0.18),
    }),
]

# "the ground remembers" — a fold down toward the floor, then a rise.
# NOTE: offsets propagate down the chain, so dropping the pelvis drags the legs with it.
# The knee/ankle deltas below deliberately COMPENSATE (+y) so the feet stay planted:
#   ankle total dy = pelvis(-0.45) + knee(+0.30) + ankle(+0.15) = 0  -> feet on the ground.
FALL_AND_RISE = [
    (0.00, {}),
    (0.40, {
        "pelvis": (0.0, -0.45, 0.05),
        "left_knee": (0.0, 0.30, 0.18), "right_knee": (0.0, 0.30, 0.18),
        "left_ankle": (0.0, 0.15, -0.18), "right_ankle": (0.0, 0.15, -0.18),
        "spine3": (0.0, -0.02, 0.12), "head": (0.0, -0.05, 0.10),
        "left_wrist": (0.0, -0.05, 0.15), "right_wrist": (0.0, -0.05, 0.15),
    }),
    (0.75, {  # rising — roughly 40% of the fold
        "pelvis": (0.0, -0.18, 0.02),
        "left_knee": (0.0, 0.12, 0.07), "right_knee": (0.0, 0.12, 0.07),
        "left_ankle": (0.0, 0.06, -0.07), "right_ankle": (0.0, 0.06, -0.07),
        "spine3": (0.0, -0.01, 0.05), "head": (0.0, -0.02, 0.04),
        "left_wrist": (0.0, 0.0, 0.06), "right_wrist": (0.0, 0.0, 0.06),
    }),
    (1.00, {  # risen, a little taller than rest — opened out
        "pelvis": (0.0, 0.03, 0.0),
        "head": (0.0, 0.04, -0.02),
        "left_wrist": (-0.04, 0.06, -0.02), "right_wrist": (0.04, 0.06, -0.02),
    }),
]

# "look back, then go" — the torso twists and the head turns back over the shoulder,
# one arm sweeping behind and one across the body, before the body turns away and leaves.
TURN_AWAY = [
    (0.00, {}),
    (0.35, {
        "spine2": (0.04, 0.0, 0.02), "spine3": (0.08, 0.0, 0.04),
        "head": (0.12, 0.01, 0.06),  # looking back
        "left_elbow": (-0.06, 0.06, -0.14), "left_wrist": (-0.10, 0.10, -0.28),
        "right_elbow": (0.10, 0.08, 0.10), "right_wrist": (0.26, 0.12, 0.18),
    }),
    (0.65, {  # the look deepens, held
        "spine2": (0.05, 0.0, 0.03), "spine3": (0.10, 0.0, 0.05),
        "head": (0.15, 0.01, 0.08),
        "left_elbow": (-0.07, 0.05, -0.17), "left_wrist": (-0.12, 0.08, -0.33),
        "right_elbow": (0.11, 0.07, 0.12), "right_wrist": (0.29, 0.10, 0.21),
    }),
    (1.00, {  # unwinds and goes
        "pelvis": (-0.10, 0.0, -0.06),
        "spine3": (-0.02, 0.0, -0.02),
        "head": (-0.04, 0.0, -0.04),
        "left_wrist": (0.0, 0.0, -0.05), "right_wrist": (0.0, 0.0, -0.04),
    }),
]

FIXTURES = {
    "reach-and-return": ("a body remembers a place it cannot return to", "snapmogen", 4021, REACH_AND_RETURN),
    "slip-away":        ("slip away", "kimodo", 1177, SLIP_AWAY),
    "gather":           ("coming home", "language-of-motion", 8802, GATHER),
    "fall-and-rise":    ("the ground remembers", "snapmogen", 5310, FALL_AND_RISE),
    "turn-away":        ("look back, then go", "kimodo", 2287, TURN_AWAY),
}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for name, (prompt, model, seed, keyframes) in FIXTURES.items():
        motion = build_motion(prompt, model, seed, keyframes)
        path = os.path.join(here, f"{name}.json")
        with open(path, "w") as fh:
            json.dump(motion, fh, indent=None, separators=(",", ":"))
            fh.write("\n")
        print(f"wrote {name}.json  ({len(motion['frames'])} frames)")


if __name__ == "__main__":
    main()
