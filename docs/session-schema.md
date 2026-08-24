# Session format — `bodyprompt.session/v0`

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
  "schema": "bodyprompt.session/v0",
  "saved_at": "2026-08-24T14:35:09.000Z",
  "poem": {
    "lines": [
      {
        "id": 1,
        "text": "a body remembers a place it cannot return to",
        "durationSeconds": null,
        "state": "draft",
        "motion": { "schema": "bodyprompt.motion/v0", "…": "…" },
        "history": [ { "schema": "bodyprompt.motion/v0", "…": "…" } ]
      }
    ],
    "selectedId": 1,
    "baked": null
  }
}
```

| Field | Meaning |
|---|---|
| `schema` | Always `bodyprompt.session/v0`. A file with any other value is refused outright, not partly loaded. |
| `saved_at` | When the file was written, ISO 8601. Informational — nothing branches on it. |
| `poem.lines[].id` | Unique within this poem. Ids are reseated on import so a line added afterwards cannot collide with a restored one. |
| `poem.lines[].text` | The prompt this line is. |
| `poem.lines[].durationSeconds` | An explicit duration, or `null` to follow the line's length. |
| `poem.lines[].state` | `empty`, `draft`, `baked`, `stale`. (`generating` can be written but never survives a restore — see below.) |
| `poem.lines[].motion` | This line's own drafted motion, or `null`. A full [canonical motion](motion-schema.md). |
| `poem.lines[].history` | Every earlier generation of this line, oldest first. Nothing is ever overwritten. |
| `poem.selectedId` | The line the writer was working on. Falls back to the first line if it names nothing. |
| `poem.baked` | The whole-poem motion from the last bake, or `null`. |

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
| **Autosave** | The browser (IndexedDB), one slot | Insurance. A reload used to destroy the poem, and nobody remembers to export before a tab crashes. |
| **Session file** | Wherever the writer puts it | Ownership. Portable, beside their notes, opens with everything switched off. |

`localStorage` is deliberately not used: a session is easily past its ~5 MB ceiling, and it
fails by throwing on write, so the poem would autosave happily for the first few generations
and then silently stop. IndexedDB has no such ceiling and is asynchronous, so a
multi-megabyte write does not freeze the instrument mid-performance.

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
