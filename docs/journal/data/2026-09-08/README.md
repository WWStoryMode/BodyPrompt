# Day 4 — the poem sessions

Every session exported while writing on 2026-09-08, fourteen files, committed byte-identical to
what left the browser. They are the evidence behind
[Day 4](../../2026-09-08-day-4.md); each opens with **IMPORT** in the session bar, or by link:

```
…/app/?session=../journal/data/2026-09-08/poem-writing-007a.json
```

They open with no GPU, no service and no network — the motions are inside them.

## ⚠ `poem-writing-004.json` — the bake is Kimodo's, not SnapMoGen's

**Read this before quoting anything from that file.** It holds SnapMoGen's five lines as
*per-line drafts*, but the whole-poem bake on its stage is **Kimodo's**, carried over from
`003c`. Pressing play shows Kimodo. SnapMoGen's motions are on the lines.

That is the same trap Day 1's session files carried, and it exists for the same reason:
SnapMoGen reports `can_stitch_poems: false` and cannot bake a poem at all, so the bake in the
session was left as whatever Kimodo had last produced. Every SnapMoGen figure in Day 4 §6 comes
from the line drafts.

## The files

| file | seed | length | net travel | what it is evidence for |
|---|---|---|---|---|
| `001` | 1574588694 | 18 s | 0.026 m | the poetic poem; articulation declining 10.4 → 1.4 cm line by line |
| `002` | 1233756094 | 30 s | 0.032 m | rewritten toward the physical; the decline gone |
| `003a` | 945441740 | 50 s | 0.445 m | seated, action-described — this seed goes to the floor at line 3 and stays |
| `003b` | 456501483 | 50 s | 0.019 m | the same poem; **1.9 cm** after fifty seconds |
| `003c` | 290947168 | 50 s | 0.068 m | the third seed; the line-4 collapse in all three |
| `004` | *(drafts)* | 10.1 s × 5 | — | **SnapMoGen** — seated in none of five lines; line 4 travels 0.30 m. ⚠ see above |
| `005` | 1781250075 | 50 s | 0.062 m | the mechanism named — *"places both hands on the floor… scoots"* — and 0.011 m on line 4 |
| `006` | 750436569 | 35 s | 0.020 m | imagistic, **no human body named**: most articulate of the day, and no travel |
| `007a` | 1330880189 | 50 s | 3.627 m | the same imagery made explicit — line 3 runs **9.51 m** of path |
| `007b` | 382025585 | 50 s | 1.069 m | sideways weight transfer rather than running: 4.12 m, the least of the three |
| `007c` | 1958551934 | 50 s | 3.610 m | short running steps: 6.00 m |
| `008a` | 374019914 | 50 s | 4.784 m | `007a` re-baked, lines 1–4 byte-identical: 6.81 m |
| `008b` | 361520248 | 50 s | 0.695 m | `007b` re-baked: 4.39 m — least in both seeds |
| `008c` | 629427053 | 50 s | 1.463 m | `007c` re-baked: 8.04 m |

*Net travel* is the pelvis from the first frame of the poem to the last, in the ground plane. It
is not the same as path length — `007b`'s line 3 covers 4.12 m and ends 4 cm from where it
started, because the wording describes oscillation and the body oscillated.

## Why all fourteen

The day's findings are **comparisons**, and most of them exist only across the variants. One
file per headline would let a reader check the headline and nothing else:

- the seated collapse is reproducible because `003a/b/c` agree,
- the locomotion finding is six bakes — `007a/b/c` against `008a/b/c` — not one,
- `006` against `007a` is the whole point: same imagery, 0.38 m against 9.51 m on line 3,
- `001` and `002` are what "the poem barely moves" means before any of that.

39 MB raw, around 14 MB once git compresses them.

## What these files cannot show you

**One bake was overwritten during the session.** An intermediate version of `002` — seed
1646366110, carrying a prompt-residue bug on line 5 — was replaced by the clean re-bake now in
this directory. Day 4 §3 quotes a wrist span of 0.018 m from it. That figure is real and was
measured, but it **cannot be reproduced from these files**; only two of the three bakes behind
that comparison survive.

**Authorship.** The poems are the researcher's (`001`, `002`, `006`); every action-described
version was written with an LLM (`003`, `005`, `007`, `008`). See
[Day 4 §7](../../2026-09-08-day-4.md).
