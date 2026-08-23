# v2 — the poem as score

Working plan and development log for v2. Follows the repository's documentation rule: say
what is real, say what is a stand-in, and never let a convincing screen outrun the
implementation behind it.

## The decision

The search instrument becomes a **poem**. Each sentence is a prompt; the body moves
continuously from one sentence into the next; a sentence can be looped, jumped to, and
edited in place. The document is the score.

This supersedes the branching lineage tree as the instrument. Nothing is thrown away — each
line keeps its own revision history, so the principle that a revision never overwrites what
came before survives in a new shape. What changes is the axis: the tree recorded *what was
tried*, the poem records *what is being made*.

Kimodo supports this directly. `Kimodo.__call__` takes `multi_prompt=True`, treating
`prompts` as an ordered sequence of segments and stitching them with blended transitions.
NVIDIA's own CLI already splits a prompt on `"."` — one sentence per prompt is how the model
is meant to be driven.

Delivered in three stages, one branch each:

- **A — generation.** Schema, worker, service. No UI change. *(this branch)*
- **B — the instrument.** The editor, the renderer timeline, the tree's removal.
- **C — notation.** Per-line ranges and segment marks in the four registers.

## Public contract changes

`POST /generate` accepts **either** `prompt` (one phrase, exactly as before) **or** `lines`
(a poem), never both and never neither — guessing which wins would make the contract
ambiguous at the point where the answer changes what the body does:

```json
{
  "lines": [
    { "prompt": "a body remembers a place it cannot return to", "duration_seconds": 4.0 },
    { "prompt": "it turns slowly away from the light", "duration_seconds": 4.0 }
  ],
  "transition_frames": 5
}
```

The motion comes back with a `segments` array saying where each line lives in `frames` — see
`docs/motion-schema.md`. Provenance gains `multi_prompt` and `transition_frames`, following
the same rule as `denoising_steps`: they record what the worker actually did.

**A poem carries no `variants`.** The ghost-cloud is a per-line instrument: four readings of
a five-line poem would cost minutes, and the model cannot re-roll one line alone. The
request is refused rather than silently ignored.

## What Kimodo's stitching actually costs

Everything in the design follows from one property of `_multiprompt`: each segment is
generated conditioned on the **decoded tail and heading of the segment before it**, and the
whole sequence draws from one seeded stream. So:

**A line cannot be re-rolled on its own.** Editing line *k* re-runs the poem. Lines before
*k* come back bit-identical — the seed and their inputs are unchanged — and lines after *k*
legitimately differ, because the body they inherit has changed. This is not a limitation to
work around. It is choreographically true: where the body goes next depends on where it just
was. The instrument should say so rather than hide it.

Four of Kimodo's failure modes here are silent, so the worker checks rather than trusts:

- `prompts` and `num_frames` are zipped — a mismatch **drops lines** without complaint.
- A bare `int` for `num_frames` broadcasts across `num_samples`, **not** across prompts.
- A bare `str` for `prompts` iterates per character — one segment per letter.
- `num_samples=None` crashes deep in the loop rather than defaulting.

The worker builds both lists explicitly, passes `num_samples=1`, and asserts the returned
frame count equals the sum of the requested per-line counts before adapting anything.

## Development log

### 2026-08-23 — Stage A, the first poem

Three lines (4 s, 4 s, 3 s) at 75 denoising steps, seed 42: **330 frames, 12.64 s wall**.
Segments tile the motion exactly, and `provenance.multi_prompt` is `true`.

**The seams are the whole question, and they hold.** Measuring pelvis displacement across
each join, against the same three lines generated independently and laid end to end:

| join | baked (`multi_prompt`) | lines generated separately |
|---|---|---|
| after line 0 | **0.002 m** | 0.056 m |
| after line 1 | **0.004 m** | 0.177 m pelvis, **0.346 m** mean across all joints |

Millimetres against centimetres. The body stays sound across the whole poem: maximum
bone-length coefficient of variation **0.008%** over 330 frames, and **zero** frames with a
foot through the floor.

Two things worth recording about the comparison. The independent-line gap is smaller than
expected because the adapter centres every motion at frame 0, so each separate line restarts
at the origin — the gap is proportional to how far a line travels, and these were low-travel
prompts (0.87 m across the whole poem). With walking prompts it would be metres. And the
mean-across-joints figure for the second join (0.346 m against 0.177 m at the pelvis) is the
more telling number: even sliding the root to match would leave the **limbs** in a different
configuration. Continuity cannot be faked by translation.

**Fixture mode exercises the whole path with no GPU.** The stub poem loops a fixture per
line and slides each so the pelvis continues from the last. It records
`provenance.multi_prompt: null` — no model stitched it — alongside `stub: true`, so it can
never be mistaken for a real continuous reading. Its joins move the root but not the limbs,
which is exactly the artefact the table above measures.

### Still to come

- **Stage B** — the editor, per-line duration and history, the renderer timeline with real
  loop modes, and the honesty requirements around drafts.
- **Stage C** — the notation registers, which currently subdivide the whole clip by fixed
  counts (16 buckets, 7 poses, 6 beats) and normalise per clip. A five-line poem would get
  roughly 1.4 chronophotograph poses per line, and the loudest line would set the scale for
  the quiet ones.

Nothing here is persisted. A reload still destroys the poem; that is deliberate and
deferred.
