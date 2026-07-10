# BodyPrompt

**Words → Body: prompting as choreographic search.**
A practice-based artistic-research project by William Wong / Into Storymode.

BodyPrompt explores how **poetic and expressive language** generates body movement
through AI motion-generation models (SnapMoGen, Language of Motion, Kimodo), and
renders the result as **stick-figure notation** — not realistic 3D avatars. The
models all ultimately emit *joints on a skeleton over time*, so the stick figure is
the honest form: it shows what the machine actually computed, before any body is
fitted on top. The visual language (movement as notation, as score) matches the
conceptual one.

> word (human) → machine motion → notation / score → human body re-performing → word again…

---

## What's in this repo right now — v0: interface mockups

This first version is **static, non-functional interface mockups**, built for an
**abstract submission**. They picture the whole vision — including features that
won't be built for a while — so the concept reads at a glance. **Nothing here runs
yet**: there is no ML, no renderer, and no backend. The screens are hand-built
HTML + inline SVG; the "controls" are styled but inert.

```
BodyPrompt/
└── frontend/
    └── mockups/
        ├── index.html                 ← contact sheet — open this first
        ├── styles.css                 ← shared design system (one look across all screens)
        ├── 01-lab-bench.html          ← the core loop (type a phrase → a figure moves)
        ├── 02-search-instrument.html  ← lineage tree · ghost-cloud · notation strip · floor path
        ├── 03-triptych.html           ← three models, three native inputs (write / voice / sculpt)
        ├── 04-notation-registers.html ← the four notation registers
        ├── 05-performance-mode.html   ← stripped, projectable lecture-performance stage
        └── screenshots/               ← pre-rendered PNGs of every screen (for the abstract)
```

### How to open / screenshot

No build step, no server — just open the files in a browser:

```bash
open frontend/mockups/index.html        # macOS — the contact sheet links to every screen
```

Each screen is a fixed 1440×900 "device frame", so screenshots come out consistent.
Ready-made PNGs already live in `frontend/mockups/screenshots/` if you'd rather drop
those straight into the abstract.

### The five screens

| # | Screen | What it shows |
|---|--------|---------------|
| 01 | **Lab bench** | The MVP loop: a poetic phrase → a line-figure with fading hand/foot trails (a Marey chronophotograph). |
| 02 | **Search instrument** | The research bench: prompt-**lineage tree** (each edit spawns a child), variance **ghost-cloud** (one prompt, many seeds), **notation strip** + **floor path**. |
| 03 | **Triptych** | Same prompt, three models — but each keeps its **native input**: *write* (SnapMoGen) vs *voice* (Language of Motion) vs *sculpt* (Kimodo). The authoring difference is itself a finding. |
| 04 | **Notation registers** | The same motion made legible four ways: chronophotograph, notation strip, floor path, Laban-inspired score. |
| 05 | **Performance mode** | A projectable stage: slow/looped playback, a readable score to re-embody, and the lineage tree growing live. |

---

## Where the real system will attach (SEAMS — not built yet)

The mockups are deliberately drawn against the architecture we'll build next, so
nothing here boxes it out. The real project is an *adapter pattern*:

> **model → adapter → canonical skeleton → notation renderer**

**Seam (a) — the pipeline (next session):**

1. **Canonical motion JSON schema** — a reduced ~22-joint SMPL-family skeleton
   (bone/edge list + frame rate + per-frame joint positions *and* rotations). All
   three models down-map into it, so every model is a *reduction*, not a re-invention.
2. **three.js stick-figure renderer** — loads a canonical motion and plays it
   (joints, bones, ground grid, orbit camera, play/pause/scrub, fading trails).
   Replaces the static SVG figures in these mockups.
3. **Per-model adapters** — one each for SnapMoGen (24-joint), Kimodo (SOMA 77-joint),
   Language of Motion (SMPL-X whole body) → canonical.
4. **FastAPI inference service** — `POST /generate {model, prompt} → canonical motion`,
   later on a cloud GPU. Starts as a stub returning fixtures, so the frontend contract
   is real before any weights load.

**Seam (b) — later features** (each already has a place in the mockups):
prompt-lineage tree · variance / ghost-cloud overlay · notation strip · floor path ·
Laban-inspired score · multi-model triptych · performance mode.

---

## Stack (intended)

- **Frontend:** React + TypeScript + Vite + three.js
- **Service:** Python + FastAPI (later on a rented cloud GPU)
- **Exchange format:** the canonical motion JSON above (a thin joint-JSON)

## Status

`v0` — abstract-submission mockups only. No ML, no GPU, no backend. Private repo.
