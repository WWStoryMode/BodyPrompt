# Session format — `bodyprompt.session/v1`

A **session** is one writer's work on one poem: every line, every line's history, and the
bake, with the motions themselves inside it.

The README parked persistence with a question rather than a task — *where should a search
live?* — because each answer says something different about whose the search is. A service
that keeps it makes the instrument the owner. A file makes the **researcher** the owner, and
that is the answer v3 takes.

So a session file is **self-contained**. It carries motions, not references to them. It
opens on another machine, with no service running, no GPU, and no network. It is bigger
that way — a worked poem runs to a few MB — and that is the correct trade: a pointer into
somebody else's store is not a copy of your work.

## The object

```json
{
  "schema": "bodyprompt.session/v1",
  "saved_at": "2026-08-24T14:35:09.000Z",
  "poem": {
    "lines": [
      {
        "id": 1,
        "text": "a body remembers a place it cannot return to",
        "durationSeconds": null,
        "state": "draft",
        "motion": { "schema": "bodyprompt.motion/v0", "…": "…" },
        "history": [ { "schema": "bodyprompt.motion/v0", "…": "…" } ],
        "rating": { "value": 3, "at": "2026-09-07T11:02:00.000Z" },
        "historyRatings": [ null ],
        "meta": { "cue": "PB1", "promptLevel": "O", "model": "kimodo", "seed": 42 }
      }
    ],
    "selectedId": 1,
    "baked": null
  }
}
```

| Field | Meaning |
|---|---|
| `schema` | `bodyprompt.session/v1`. A `v0` file is read too, and comes back as v1. Anything else is refused outright, not partly loaded. |
| `saved_at` | When the file was written, ISO 8601. Informational — nothing branches on it. |
| `poem.lines[].id` | Unique within this poem. Ids are reseated on import so a line added afterwards cannot collide with a restored one. |
| `poem.lines[].text` | The prompt this line is. |
| `poem.lines[].durationSeconds` | An explicit duration, or `null` to follow the line's length. |
| `poem.lines[].state` | `empty`, `draft`, `baked`, `stale`. (`generating` can be written but never survives a restore — see below.) |
| `poem.lines[].motion` | This line's own drafted motion, or `null`. A full [canonical motion](motion-schema.md). |
| `poem.lines[].history` | Every earlier generation of this line, oldest first. Nothing is ever overwritten. |
| `poem.lines[].rating` | What a reader judged of *this line's current motion*, or `null` for unrated. `value` is `0`–`4` or `"skip"`; `at` is when the judgement was made. |
| `poem.lines[].historyRatings` | Judgements of `history`, index for index, always the same length. `null` where a take was never rated. |
| `poem.lines[].meta` | What the file this line came from recorded about it — cue, prompt level, seed, model. Opaque: never interpreted, never validated. |
| `poem.selectedId` | The line the writer was working on. Falls back to the first line if it names nothing. |
| `poem.baked` | The whole-poem motion from the last bake, or `null`. |

## Why v1, and what it costs

v1 added `rating`, `historyRatings` and `meta`. The version was bumped rather than quietly
extended, and the direction that matters is not the one you would expect.

Reading old files is the easy half: a v0 file opens and comes back as an unrated v1 poem.
The reason for the bump is the other way round. An older build meeting a v1 file **refuses
it**, loudly, instead of opening it happily and dropping every judgement in it on the way
through. A file that will not open can be fixed. Work that vanished on a round trip cannot.

`meta` arrives under `calibration` in files written by the Day 2 drivers, and both keys are
read. It is the thing that makes a rating mean anything: a judgement with no cue, no prompt
level, no seed and no model is a number attached to nothing.

**A rating belongs to the motion it judged**, not to the line. Drafting a line again pushes
its motion into `history` and its rating into `historyRatings` alongside, and the new motion
arrives unrated — otherwise a re-draft would silently inherit a verdict passed on a body
nobody watched.

**Unrated is not `0`.** `null` means nobody has judged this; `0` means someone judged it and
found no relationship. `"skip"` is a third thing again — the answer for a motion this reader
cannot judge — and keeping it out of the numbers is what stops "I could not tell" being
counted as "there was nothing there".

## Appending, and exporting part of a poem

Two operations that both produce a poem that is not the one on disk, and both have to avoid
claiming otherwise.

**Append** adds another session's lines to the end of this poem. Ids are renumbered, because
they are a per-poem counter and two files both start at 1. The incoming **bake is dropped**
and any incoming `baked` line is demoted, because those lines were generated from the body
that preceded them *in their own poem*, and here something else does. The host poem's own
bake needs nothing done to it: `bakeIsCurrent` already asks whether every line is baked, and
the new ones are not.

**Exporting a selection** writes a normal session file containing only the chosen lines —
with their motions, their ratings and their `meta` — and **no bake**. A bake is one
continuous reading of a whole poem; a handful of lines lifted out of it never were that.

## What a restore is allowed to change

Almost nothing. Two exceptions, and both exist to stop the restored poem making a claim that
is no longer true:

- **`generating` becomes `empty` or `stale`.** It described a request that was in flight when
  the file was written. Nothing is in flight now, and a row that spins forever is a lie told
  by a dot.
- **Line ids are reseated**, so the id counter resumes above the highest id in the file.

Everything else is restored exactly as recorded — including which lines were `baked`.
Whether the bake *is still the poem* is then recomputed from those states, so an imported
session can never claim a continuous reading it did not have. A poem edited after its bake
comes back with the older reading on the stage and the banner saying so, precisely as it was
when it was saved.

Inside a line, a missing or malformed field is repaired to a safe default rather than
rejected: an older or hand-edited file should still open. A motion with no frames is dropped,
because an empty body on the stage under a real line's name is worse than nothing. A motion
that *does* have frames is passed through untouched and is not re-validated — silently
"fixing" one would be the one place this codebase edits a record of what a model produced.

## Two layers, two jobs

| | Kept where | Why |
|---|---|---|
| **Autosave** | The browser (IndexedDB), one session, stored in pieces | Insurance. A reload used to destroy the poem, and nobody remembers to export before a tab crashes. |
| **Session file** | Wherever the writer puts it | Ownership. Portable, beside their notes, opens with everything switched off. |

`localStorage` is deliberately not used: a session is easily past its ~5 MB ceiling, and it
fails by throwing on write, so the poem would autosave happily for the first few generations
and then silently stop. IndexedDB has no such ceiling and is asynchronous, so a
multi-megabyte write does not freeze the instrument mid-performance.

**The session is stored in pieces, and that is not an optimisation for its own sake.** The
sentence above is true of the write. It is not true of the *structured clone* IndexedDB
performs before the write, which happens on the thread drawing the body — and what that
costs is set by the object's shape rather than its size. A rating corpus of two appended Day
2 batches is 210 lines, 50,400 frames and something over two million small arrays.

Measured on exactly that: cloning the session whole takes **828 ms**; cloning the poem with
its motions lifted out takes **0.5 ms**. Rating one line changes a single integer, and it was
paying for all 210 motions every 1.2 seconds.

So the poem — every line, its ratings, and what each line came from — is one small record,
rewritten whenever anything changes. Each motion is a record of its own, written once. A
motion never changes after it is generated, so the only time one is written again is when a
line's slot comes to hold a *different* motion: rating a line rewrites **no** motions, and
re-drafting one rewrites exactly two — the new take, and the old one moving into history.

Where the browser refuses storage entirely — a private window, blocked site data — autosave
is **off and says so** in the session bar. It is a convenience; losing it must never take the
instrument down with it, and a writer who believes their work is being kept and is wrong is
worse off than one who knows it is not.

## Not the same thing as the service's store

They answer different questions and neither replaces the other.

- The **session** is the writer's poem, and it is the only copy that has to survive.
- The **motion store** (`service/app/store.py`) is the service remembering generations so a
  seeded request need not run the model twice — including with the model's worker stopped.
  It evicts least-recently-used entries when it fills, which is safe precisely because a
  session file carries its own motions.
