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
| `variants` | *Optional.* The **ghost-cloud**: sibling motions from the same prompt with different seeds (see below). |
| `provenance` | *Optional, v1.* Honest source metadata: where it came from, when, and how long it took (see below). |
| `segments` | *Optional, v2.* Present only on a **poem**: where each line's movement sits in `frames` (see below). |

## The ghost-cloud (`variants`)

Ask `POST /generate` for `{"prompt": …, "variants": 4}` and the returned motion carries a
`variants` array of **3 siblings** — the same prompt, different seeds. The frontend draws them
as translucent figures around the selected one, making the **variability of the search visible**:
*"BodyPrompt embraces the variability of generative systems as a creative resource."*

- The field is **additive and optional**. `variants: 1` (the default) returns exactly what it
  always did, so older clients are unaffected.
- Each sibling is itself a complete, valid canonical motion with its own `seed`. **Siblings never
  nest their own `variants`.**
- Variance is **deterministic**: the same prompt always produces the same cloud.

> **Honesty note.** In v0 the siblings are *not* a model sampling different outputs. They are a
> seeded perturbation of the base fixture (`vary()` in `service/app/generators.py`): each joint
> gets a smooth sinusoidal wander whose amplitude is scaled per joint — the pelvis and spine
> barely move, the wrists and head move most — so a cloud reads as *the same intention,
> differently expressed*. When a real model lands, it replaces this with genuine multi-seed
> sampling and nothing else has to change.

## The poem (`segments`)

Ask `POST /generate` for `{"lines": [{"prompt": …, "duration_seconds": …}, …]}` and the
motion comes back with a `segments` array — one entry per line, saying where that line's
movement lives:

```json
{ "index": 0, "prompt": "a body remembers",
  "start_frame": 0, "end_frame": 150,
  "transition_frames": 5, "duration_seconds": 5.0 }
```

- **Additive and optional.** A single-prompt request returns exactly what it always did.
- **Segments tile the motion exactly**: segment 0 starts at frame 0, each begins where the
  last ended, and the final `end_frame` equals `frames.length`. The service rejects any
  motion where that is not true — a gap or an overlap would attribute movement to the wrong
  sentence, which is worse than having no table at all.
- `transition_frames` are the trailing frames a segment shares with the next one. They
  belong to **both lines and to neither**: with post-processing on, Kimodo generates them
  under the *following* line's prompt. Zero on the last segment.
- `prompt` at the top level is the whole poem, lines joined by newlines. The per-line
  phrasing lives in the segments.
- A poem carries **no `variants`**. The ghost-cloud is a per-line instrument: four readings
  of a five-line poem would cost minutes, and the model cannot re-roll one line alone.

> **Honesty note.** `segments` says *where the lines are*, not that they flow into one
> another. Only `provenance.multi_prompt: true` means the model actually stitched them,
> conditioning each line on the body left by the one before. Lines generated separately and
> laid end to end carry segments too, and the body visibly jumps between them. The fixture
> backend's poem is exactly that: it loops a fixture per line and slides each so the pelvis
> continues, which moves the root but not the limbs. It records
> `provenance.multi_prompt: null` — no model stitched it — and `stub: true`.

## Provenance

Everything here describes **what happened**, never what was requested. The distinction is
load-bearing: a request for post-processing that the worker did not apply must read as
`false`, and a request that named no denoising steps must record the number the worker
actually used.

| Field | Meaning |
|---|---|
| `source` | What produced it — a model name (`kimodo`, `snapmogen`), or `fixture`. Not a closed set: a fourth model becoming real is a configuration change, not a schema change. |
| `backend` | The generator that served it. |
| `model_version` | What the worker reported it is running, learned from its `/health` rather than declared by the service. |
| `hosting` | *v3.* Where the model ran: `local`, `remote`, or `in-process`. |
| `generated_at` | *v3.* When the model produced this motion, ISO 8601 UTC. |
| `inference_ms` | Measured wall-clock time of the generation. |
| `served_from_store` | *v3.* `true` when this motion came back out of the service's store rather than being generated again — see below. |
| `served_at` | *v3.* When this copy was handed over. Present **only** on a stored motion. |
| `post_processing` | What the worker actually did. `null` for a fixture: nothing ran, so there was nothing to clean up. |
| `denoising_steps` | The count that actually ran. `null` for a fixture. |
| `multi_prompt` | Whether the model genuinely stitched a poem as one continuous motion. `null` = nothing generated it. |
| `transition_frames` | Frames overlapped between lines. `null` when this is not a stitched poem. |

### A remembered motion is the same generation

The service keeps motions on disk, keyed by everything that decided them (see
[`v3-models.md`](v3-models.md) and `service/app/store.py`). When a request names a **seed**
and that exact request has been answered before, the stored motion is returned instead of
the model being run again.

Such a motion is **the same generation, served twice** — not a new one, and the schema says
so precisely:

- `served_from_store` becomes `true`.
- `generated_at` and `inference_ms` are the **original** run's. They are never refreshed.
  A replay that reported the milliseconds a disk read took would be a lie about how fast
  the model is, and a flattering one.
- `served_at` is added, so the two moments cannot be confused.

A request with **no seed** is a request for a new roll, and is never answered from the
store — otherwise the ghost-cloud, which is entirely a claim about seeds, would be false.

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
