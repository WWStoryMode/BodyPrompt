# Research journal

A continuous record of what the instrument has been asked, and what it did.

These are **research sessions, not test runs.** Each entry logs a question, the prompts put to
the models, what came back, and what was preferred. **There is no defect list.** A prompt that
returns a body standing nearly still is the instrument working — it is reporting something
true about how the model reads that language. Where a session exposes something the software
should do differently, it goes to [`../roadmap.md`](../roadmap.md) and is linked from the
entry; it does not turn the journal into a backlog.

Each entry carries the **session files** it produced, so anyone can import them into their own
copy of BodyPrompt (`IMPORT` in the session bar) and look at the same bodies rather than
taking the measurements on trust. A session file is self-contained — it opens with no GPU, no
network, and nothing running.

| Day | Date | Question |
|---|---|---|
| [Day 1](2026-08-25-day-1.md) | 2026-08-25 | Can text-to-motion AI generate *dance*, or only body movement? |

## How to read a measurement in these entries

Three things distort comparisons between panels, and every entry states which apply:

- **Durations.** A line asked at 2 s and a line asked at 10 s cannot be compared on *travel* or
  *span*. Only per-second and per-frame measures survive — wrist speed, above-shoulder
  fraction, pelvis height.
- **SnapMoGen's 128-frame floor.** It will not generate below 4.27 s, so any shorter request
  comes back longer than asked.
- **Rig scale.** The three models are different sizes — Kimodo's head sits near 1.58 m,
  SnapMoGen's peaks around 1.45 m. Absolute heights do not compare between panels; changes
  within one model do.

And one about grounding: **only Kimodo post-processes** (`provenance.post_processing`), so its
floor contact is exact and the other two are approximate — sometimes by a lot.
