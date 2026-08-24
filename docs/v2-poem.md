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

### 2026-08-23 — Stage B, the instrument

The left rail stops being the lineage tree and becomes the poem: *poem on the left, body in
the centre, notation on the right.* `src/lineage.ts` is gone; `src/poem.ts` holds the lines,
each with its own `history`, so nothing is overwritten.

**What an edit invalidates is the whole design.** Editing a line marks it stale and, if the
poem was baked, every line after it — never the lines before. That is not caution, it is the
model's own causality made visible: each baked line is generated from the body the previous
line left behind. A **draft** behaves differently, because a draft is generated alone: an
edit elsewhere leaves it as valid as it ever was, and only the edited line goes stale.
Encoding both rules is what `poem.ts` is for, and what most of its tests check.

**Playback stopped assuming one clip.** `renderer.ts` held a single motion, reset the
playhead on load, and looped unconditionally — `if (this.frameFloat > last) this.frameFloat
-= last;` was the entire end-of-clip behaviour. It now plays a timeline: one segmented clip
for a bake, one clip per line for a draft, resolved the same way so "which line is the body
answering" falls out of both. Looping became a mode (`whole` / `line` / `none`), which is
what makes "loop this line while I rewrite it" possible.

The timeline lives in `src/timeline.ts` rather than the renderer: it is pure arithmetic, it
is the one piece that silently attributes movement to the wrong line if it is wrong, and
keeping it free of three.js means it can be tested.

**Nothing blends the seams.** There is still no pose interpolation anywhere, deliberately. A
draft's joins are meant to be visible — smoothing them would disguise the exact thing the
draft/bake distinction exists to show.

**Honesty, as built.** A banner appears whenever what is playing is not the baked poem, in
two flavours: lines drafted separately, or a bake the poem has since moved past. The
telemetry says `baked · continuous` or `drafted · lines generated apart` on the stage itself.
A draft is never handed a `segments` array — that field means continuous, and only a bake
earns it. Line state is a dot: hollow, faint amber, solid amber, dashed red.

**Testing needed no new dependencies.** Node 24 runs TypeScript directly, so
`src/poem.test.ts` uses the built-in `node:test` and `npm test` runs it. Test files are
excluded from `tsc` because `@types/node` cannot currently be installed — the dependency tree
has a **pre-existing** `typedoc-plugin-markdown` / `typedoc` / rollup peer conflict, unrelated
to this work, and the app build should not wait on resolving it.

### 2026-08-24 — Stage C, the registers read a line

The four registers each divide whatever they are handed by a fixed count — 16 buckets, 7
exposures, 6 beats — and normalise against its range. Given a five-line poem that stayed
*correct* and stopped being *readable*: about 1.4 chronophotograph exposures per line, and
the loudest line setting the scale the quiet ones are drawn against.

Every `render*` now takes a `RegisterView`:

```ts
interface RegisterView {
  range?: { start: number; end: number };  // read one line instead of the poem
  globalStart?: number;                    // where this register sits in global frames
  boundaries?: number[];                   // global frames where a line begins
}
```

**A narrowed register is a re-reading, not a crop.** The range slices the frames *before*
any register normalises, so one line is drawn at the same resolution the whole poem was —
16 buckets, 7 exposures — against its own range. A held breath between two large phrases,
invisible in the whole-poem reading, gets a whole plate to itself.

The cost is real and is stated on the rail rather than hidden: **two registers at different
ranges are not comparable**. The title says which reading is on screen — `notation · line 2`
versus `notation · the score` — and the button beside it (`N`) says the same thing again.

**A narrowed register follows the body, not the cursor.** The first build had it follow the
*selected* line, which was wrong in use and wrong in principle: while you write, the cursor is
somewhere the body is not, so the score described a line nobody was watching — and until you
clicked a line it described nothing at all. The score is a reading of the movement, so it
reads the line the playhead is inside and re-reads at each boundary (once per line, not per
frame). Pinning a line to study it is what looping already does: pin the body and the score
stays with it.

**The playhead learned to say nothing.** Playheads arrive in global frames; a register that
holds only part of the poem maps them through its own window and **hides** its marker while
the body is somewhere it cannot see. Parking it at an edge would have been the easy thing and
would have claimed the body was at the end of a line it had already left. The chronophotograph
does the same with its lit exposure. Following the body means a narrowed *baked* register is
now always looking at the body — the hiding still matters for a drafted line, where the
register holds the line being rewritten while another one plays.

That mapping also fixed a **Stage B bug**: on a *drafted* poem the registers hold one clip
out of several, but were being fed the whole run's global frame, so the "now" marker walked
off the end of the register it was drawn on. Two neighbouring bugs of the same family went
with it — `poem.written[segmentIndex]` and the two `poem.written.findIndex` calls behind
double-click-to-jump and loop-this-line counted *written* lines, while segment indices count
the lines actually **on the stage**. With three written lines and only the third drafted,
the instrument highlighted line 1 and looped the wrong clip. All three now go through
`playingLines`, which is set to whatever the stage is actually holding.

**Seams, only where they are earned.** In the whole-poem reading the notation strip draws a
dashed rule and the floor path a tick across the trace at each line boundary — the floor's
tick is drawn square to the direction of travel, so it crosses the path instead of lying
along it. A boundary at a window's own first frame is not a seam inside it and is dropped,
or every narrowed register would carry a rule down its left margin.

**Drafts get no seam marks at all.** Drafted lines have joins, not seams: they were generated
apart, the body jumps, and drawing that break as a transition would be precisely the kind of
flattery this repository exists not to do. The banner already says it in words; the score
stays silent rather than saying something else.

**What is tested and what is not.** The windowing arithmetic moved into `src/register-view.ts`
— pure, no DOM — for the same reason `timeline.ts` sits outside the renderer: it is the part
that can be wrong without *looking* wrong, since a mis-mapped playhead sits confidently on
the wrong line. `register-view.test.ts` covers the mapping and the seam filtering;
`notation.test.ts` builds the SVG against a ~40-line DOM stub (no jsdom — a dependency still
cannot be added) and checks that a narrowed register keeps its full glyph count, that seams
appear only on a bake, and that playheads and lit exposures disappear off-window. 23 frontend
tests pass.

What none of that checks is whether any of it is **legible** — whether 7 exposures is right
for a two-second line, whether per-line normalisation flatters a weak line into looking
strong. That is a studio judgement and it stays one; it is the parked "notation readability"
question, and Stage C only makes it askable.

## What v2 left undone

All three stages are merged. Four things were left out on purpose, and are recorded in the
README under **Parked, deliberately** so they are not mistaken for oversights:

- **Persistence** — nothing is saved, so a reload destroys the poem and every line's history
  with it. The open question is *where a search should live* (a file, the browser, the
  service), not how to serialise it.
- **The ghost-cloud on a baked poem** — variance stays a per-line instrument; a whole-poem
  cloud is a design question before it is a cost question.
- **Reusing the unchanged head of a re-bake** — lines before an edit *should* return
  bit-identical, but that is reasoning from Kimodo's structure and has not been measured.
- **A poem in the triptych** — the model comparison still takes one prompt.

And one thing deliberately not done: **nothing blends the seams between drafted lines.**
There is no pose interpolation anywhere in the codebase, on purpose.
