# BodyPrompt

**Prompting as Choreographic Search.**
A practice-based artistic research project by William Wong / Into Storymode.

BodyPrompt investigates **prompting as a form of choreographic search**. Rather than
treating a prompt as a one-off instruction for generating movement, the project explores
prompting as an *iterative dialogue* in which human intention and generative AI
progressively search for a movement that resonates with a poetic theme. It is not a new
motion-generation system — it is **a new way of thinking about how humans and generative
AI can search together for expressive movement**. The software in this repository exists
to support that research; it is not the contribution.

> **Research question.** How does prompting become a *choreographic search* — an
> open-ended, embodied dialogue in which human intention and generative AI co-evolve
> toward movement that embodies a poetic theme, rather than a command that retrieves one
> "correct" movement from language?

---

## Research method — an open-ended search

BodyPrompt treats movement-making as a search, not a lookup. The loop is iterative and
deliberately has **no evaluation step — only exploration**:

```
   poetic theme
        ↓
      prompt  ──────────────┐
        ↓                    │
  AI movement generation     │
        ↓                    │  reflection reshapes
   visualisation             │  the next prompt —
   (stick figures /          │  human and AI both
    notation)                │  shape what comes next
        ↓                    │
     reflection ─────────────┘
        ↓
   refined prompt → … → the search continues
```

Three commitments define the method:

- **There is no single correct movement.** The goal is an expression that *resonates*
  with the poetic theme, not one that is "faithful" to the words.
- **Variation is inspiration, not error.** The variability of generative systems is
  treated as a creative resource — each generation is a chance to discover unexpected
  qualities of movement.
- **Human and AI co-evolve.** Reflection on what the machine produced reshapes the next
  prompt; neither the person nor the model fully determines the outcome.

The evolving sequence of prompts becomes a visible record of the creative process —
revealing not a linear workflow but an **expanding landscape of possibilities**.

---

## Why stick figures?

BodyPrompt deliberately **avoids realistic human avatars**. Generated movement is shown
as animated **stick figures and movement notation**, and this is a research decision, not
a placeholder.

A realistic avatar sells an illusion — it invites you to read a *character*. A stick
figure exposes the **computational body directly**: joints, trajectories, timing, weight.
It shows what the machine actually computed, before any body is fitted on top. Like
musical notation or Labanotation, this abstraction doesn't hide the material — it makes it
**legible and comparable**, inviting interpretation rather than illusion. Foregrounding
movement itself, as the primary material of inquiry, is the point.

---

## Core contribution — the Prompt Lineage Tree

The single most important idea in BodyPrompt is not a model or a renderer — it is the way
the **search itself is kept**.

In an ordinary tool, revising a prompt *replaces* what came before. In BodyPrompt, **every
prompt revision is retained as part of the choreography** — each edit spawns a child, the
search branches, and nothing is undone. The branching search **becomes the artefact**: a
map of an expanding landscape of possibilities rather than a single final answer.

In performance this matters twice over. The audience does not just watch generated
movement — they watch the **evolution of thought**: how a phrase mutated, where it
branched, which possibility was followed and which was left open. The lineage tree is at
once research log, score, and set.

---

## The interfaces — research instruments

The five screens in this repo are **mockups of research instruments**, each answering
"how does this help the search?" — not "what feature is this?" *(These are static pictures
of the vision. Screen 01, the Lab Bench, now also exists as a **functional** version on
stub data — see [Run it](#run-it) and Status below; screens 02–05 stay as mockups.)*

| # | Instrument | What it lets the research do |
|---|-----------|------------------------------|
| 01 | **Lab bench** | The basic search instrument — explore how *different prompts* generate *different interpretations* of the same poetic intention. |
| 02 | **Search instrument** | Visualises the **history of the search** — every prompt revision becomes part of the research (the lineage tree) rather than replacing prior attempts; variance is shown as a ghost-cloud. |
| 03 | **Triptych** | Compares how **different AI models interpret the same poetic intention**, each keeping its own native way of authoring. |
| 04 | **Notation registers** | Makes generated movement **readable and comparable** — four notation registers — without relying on realistic human appearance. |
| 05 | **Performance mode** | Supports **live collaborative search** between performer, audience and AI during a lecture performance. |

```
frontend/mockups/
├── index.html                 ← contact sheet — open this first
├── styles.css                 ← shared design system (one look across all screens)
├── 01-lab-bench.html
├── 02-search-instrument.html
├── 03-triptych.html
├── 04-notation-registers.html
├── 05-performance-mode.html
└── screenshots/               ← pre-rendered PNGs of every screen (for the abstract)
```

No build step, no server — just open the files in a browser:

```bash
open frontend/mockups/index.html   # macOS — the contact sheet links to every screen
```

Each screen is a fixed 1440×900 "device frame", so screenshots come out consistent;
ready-made PNGs already live in `frontend/mockups/screenshots/`.

---

## Planned lecture performance

BodyPrompt is designed to be performed live. The sequence demonstrates the search process
in front of an audience:

1. **Introduce a poetic theme** — a short phrase to search from.
2. **Begin prompting** — turn the theme into a first prompt.
3. **Generate movements** — the models offer several interpretations.
4. **Compare outputs** — read them as notation, side by side.
5. **Discuss discoveries** — what unexpected qualities appeared?
6. **Refine the prompt** — reflection reshapes the next attempt; the lineage branches.
7. **Repeat** — the search continues, live and visible.
8. **Reflect** — on the expanding landscape the search has drawn.

---

## Current research questions

- How does prompt refinement influence the generated movement?
- Which words consistently produce similar movement qualities?
- How do different models interpret the same poetic theme?
- How does visual notation influence how a prompt gets refined?
- When does the search feel "complete"?

---

## Roadmap (framed by research, not features)

| Version | Research milestone | State |
|---------|--------------------|-------|
| **v0** | Research proposition + mock interfaces | ✓ done |
| **v0.5** | First functional slice — the Lab Bench moves on **stub** data (schema + renderer + service, no ML) | ◐ in repo now |
| **v1** | Single-model prompting — the search loop running for real (a model behind the service) | next |
| **v2** | Prompt lineage — the branching search retained and navigable | |
| **v3** | Multi-model comparison — how models diverge on one theme | |
| **v4** | Public lecture performance — the search performed live | |
| **v5** | Open research platform — others can search too | |

The bridge from v0 to v1 is deliberately split: **v0.5 makes the pipeline real without any
ML** (prompt → service → canonical motion → animated stick figure), so v1 only has to swap
the stub for a model.

---

## The architecture that supports the research

An *adapter pattern* — **model → adapter → canonical skeleton → notation renderer** — chosen
so that the research, not any one model, stays at the centre. The v0.5 slice builds the
spine of it (everything except the models):

- ✓ **Canonical motion schema** — a reduced 22-joint SMPL-family skeleton (positions +
  rotations per frame). Every model *down-maps* into it, so each model is a reduction, not
  a re-invention — which is what makes cross-model comparison (screen 03) meaningful.
  → [`docs/motion-schema.md`](docs/motion-schema.md), [`fixtures/`](fixtures/).
- ✓ **Stick-figure renderer** (three.js) — plays a canonical motion as notation (joints,
  bones, trails, orbit camera). → [`frontend/app/`](frontend/app/).
- ◐ **Inference service** (FastAPI) — `POST /generate {model, prompt} → canonical motion`.
  Live as a **fixture stub** (no ML) so the search loop is real before any weights load.
  → [`service/`](service/).
- ✗ **Per-model adapters** — SnapMoGen, Language of Motion, Kimodo → canonical. *Not built.*
- ✗ **A model behind the service** — the v1 step; needs weights + likely a GPU. *Not built.*

```
fixtures/            canonical motion JSON (hand-authored) + generator
docs/motion-schema.md  the exchange-format spec
service/             FastAPI /generate stub (uv)
frontend/app/        Vite + three.js Lab Bench (the live screen)
frontend/mockups/    the original static mockups (reference)
```

**Stack:** three.js + TypeScript + Vite (frontend, pnpm); Python + FastAPI (service, uv);
the canonical motion JSON as the exchange format. React is deliberately deferred.

---

## Run it

Two processes: the service (serves motions) and the app (renders them). Needs
**Python 3.10+ with [uv](https://docs.astral.sh/uv/)** and **Node 18+ with
[pnpm](https://pnpm.io/)**.

```bash
# 1) service — http://localhost:8000
cd service
uv run uvicorn app.main:app --port 8000

# 2) app — http://localhost:5173  (in a second terminal)
cd frontend/app
pnpm install
pnpm dev
```

Open <http://localhost:5173>, type a phrase, click **Generate** — a 3D stick figure
animates; drag to orbit, use play/pause and the scrub bar. To re-author the motions, edit
and re-run `python3 fixtures/_generate.py`.

The original static mockups need no build — just `open frontend/mockups/index.html`.

## Status

**v0.5 — the Lab Bench runs on hand-authored fixture data over the real API contract. No
ML, no model weights, no GPU.** The pipeline is genuinely wired end to end (prompt →
FastAPI → canonical motion → animated three.js stick figure), but the motion is a
**placeholder fixture chosen by the stub, not generated by any model** — so it does not yet
"understand" the prompt. Screens 02–05 remain static mockups. Repo: **Public**.

## Licence

Code: **MIT**. Writing and mockups: **CC BY 4.0**.

---

BodyPrompt investigates prompting as a **collaborative search** through which humans and
generative AI gradually discover expressive movement *together* — reframing prompting
itself as a choreographic practice in which language, movement and computation
continuously shape one another, rather than a command that retrieves a single "correct"
movement from language.
