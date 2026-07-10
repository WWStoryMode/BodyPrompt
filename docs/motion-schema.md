# Canonical motion format — `bodyprompt.motion/v0`

This is the **exchange format** at the centre of BodyPrompt: every part of the system
speaks it. The inference service emits it, the three.js renderer consumes it, and (later)
each model's adapter down-maps *into* it. Because it is a reduced, shared skeleton, every
model becomes a *reduction* rather than a re-invention — which is what makes cross-model
comparison meaningful.

> **Honesty note.** In v0 the motions are **hand-authored keyframes**, interpolated by
> [`fixtures/_generate.py`](../fixtures/_generate.py). They are *not* produced by any AI
> model. The format is the real thing; the data behind it is a placeholder until v1 wires
> in a model.

## The object

One motion is one JSON object:

```json
{
  "schema": "bodyprompt.motion/v0",
  "skeleton": "smpl-22",
  "fps": 30,
  "joints": ["pelvis", "left_hip", "right_hip", "..."],
  "edges": [[1, 0], [2, 0], "..."],
  "frames": [
    {
      "positions": [[x, y, z], "... 22 total"],
      "rotations": [[qx, qy, qz, qw], "... 22 total"]
    }
  ],
  "prompt": "a body remembers a place it cannot return to",
  "model": "snapmogen",
  "seed": 4021
}
```

| Field | Meaning |
|-------|---------|
| `schema` | Format id + version. Always `bodyprompt.motion/v0` here. |
| `skeleton` | Skeleton id. `smpl-22` = the 22-joint reduced SMPL-family skeleton below. |
| `fps` | Frames per second for playback. |
| `joints` | 22 joint **names**, index-aligned to everything else. |
| `edges` | Bone connectivity as `[child, parent]` index pairs (21 bones; `pelvis` is the root and has no parent). |
| `frames` | Ordered array of frames. Each has `positions` and `rotations`, one entry per joint. |
| `frames[].positions` | Per-joint world-space `[x, y, z]`, metres, **Y up**, ground at `y = 0`. Drives the renderer in v0. |
| `frames[].rotations` | Per-joint local `[qx, qy, qz, qw]` quaternion. **Reserved** — stored for future 3D/rotation-driven rendering; v0 fixtures fill these with identity `[0, 0, 0, 1]`. |
| `prompt` | The phrase this motion answers. |
| `model` | Which model (nominally) produced it. In v0 this is just an echo. |
| `seed` | Generation seed — part of making variation reproducible. |

## Skeleton `smpl-22`

A reduced SMPL-family skeleton. Index → name → parent:

| # | Joint | Parent |
|---|-------|--------|
| 0 | pelvis | — (root) |
| 1 | left_hip | 0 |
| 2 | right_hip | 0 |
| 3 | spine1 | 0 |
| 4 | left_knee | 1 |
| 5 | right_knee | 2 |
| 6 | spine2 | 3 |
| 7 | left_ankle | 4 |
| 8 | right_ankle | 5 |
| 9 | spine3 | 6 |
| 10 | left_foot | 7 |
| 11 | right_foot | 8 |
| 12 | neck | 9 |
| 13 | left_collar | 9 |
| 14 | right_collar | 9 |
| 15 | head | 12 |
| 16 | left_shoulder | 13 |
| 17 | right_shoulder | 14 |
| 18 | left_elbow | 16 |
| 19 | right_elbow | 17 |
| 20 | left_wrist | 18 |
| 21 | right_wrist | 19 |

The `edges` array is exactly this parent table as `[child, parent]` pairs. The renderer
draws one line segment per edge; joints render as small spheres. "Left" is the subject's
left = `+X`.

## Validity rules

A conforming motion satisfies:

- `joints.length === 22` and matches the names above in order.
- Every `edges` entry is `[child, parent]` with both indices in `0..21`; `parent < child`
  is *not* required but every non-root joint appears exactly once as a `child`.
- Every frame has `positions.length === 22` and `rotations.length === 22`.
- Each position is a 3-number array; each rotation is a 4-number array.
