# Presentation

The deck as delivered, kept as a record rather than as a document that tracks the research.

| | |
|---|---|
| [2026-09-09-lecture-performance-deck.html](2026-09-09-lecture-performance-deck.html) | The lecture-performance deck, presented 2026-09-09 |

The site's landing page is [`../index.html`](../index.html) — deck, instrument and journal.

## Viewing it

It is a single self-contained HTML file — sixteen slides, arrow keys or space to navigate.
Open it locally and it works with nothing running:

```bash
open docs/presentation/2026-09-09-lecture-performance-deck.html    # or xdg-open / start
```

**On the web, GitHub Pages serves it** — enabled 2026-09-12, from `/docs` on `main`:

> https://wwstorymode.github.io/BodyPrompt/presentation/2026-09-09-lecture-performance-deck.html

Without Pages a `.html` file in a repository renders as source rather than as a page, which is
the whole reason it is switched on.

`docs/.nojekyll` disables Jekyll, so every file under `docs/` is served exactly as committed.
That matters here: the deck reaches the browser byte-for-byte as it was presented, with no build
step able to alter it. The cost is that the markdown files in this directory are served as plain
text rather than rendered — they are meant to be read on github.com, where the links between
them work.

The only thing it fetches is two typefaces from Google Fonts. Without a network it falls back to
Georgia and a monospace face and stays entirely readable.

## What it is, and what it is not

**This file is not maintained.** It is what was shown in a room on one evening, and it is kept
that way on purpose. The research moved on the following day, and a deck edited later to match
the current findings would stop being a record of the talk and become a second, quieter version
of the journal — the drift [`../v0-stub.md`](../v0-stub.md) exists to prevent, wearing a
different costume.

So where the deck and the journal disagree, **the journal is the record** and the deck is a
dated artefact. Two places where that already applies:

- The deck presents the five prompt levels without saying who wrote them. The derived rungs —
  Semantic, Body Quality, Action Description, Explicit Instruction — were generated with an
  LLM from the original cue, which [Day 2 §4](../journal/2026-09-03-day-2.md) now states and
  the deck does not. (Slide 10 does say so for the poem variations.)
- The deck's model table lists Language of Motion and a possible fourth model as open
  questions. All three models were real and running by Day 4; the fourth was never added.

## What its figures rest on

The statistics slide is Stage 2A of the Day 2 corpus, rated on Day 3: **315 judgements — 7 cues
× 5 levels × 3 seeds × 3 models**, a complete census with nothing skipped. Every number on that
slide — the five level means, the five ≥3 percentages, and the 1.43-point Q→A step — matches
[Day 3 §6](../journal/2026-09-07-day-3.md) exactly, which was checked before this file was
committed.

What the slide necessarily leaves out, and the entry states: the rating was not blind, level
order was confounded with rating order, there was one rater, and a retest moved 8 of 21
judgements — all upward.
