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
"how does this help the search?" — not "what feature is this?"

***All five screens now exist as a real, running app*** on stub data — the Lab Bench, the
prompt-lineage tree, the variance ghost-cloud, all four notation registers, the multi-model
triptych, and performance mode. See [Run it](#run-it) and Status. The mockups below are kept
as the original statement of intent.

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
| **v0.5** | First functional slice — the search loop runs on **stub** data (schema + renderer + service, no ML) | ✓ done |
| **v2** | **Prompt lineage** — the branching search retained and navigable | ✓ done |
| **v2.5** | **Variance** (ghost-cloud) + the **notation registers** — all four: chronophotograph, strip, floor path, Laban-inspired score | ✓ done |
| **v3a** | **Multi-model triptych** — the comparison instrument (the *comparison* is real; the models are not yet) | ✓ done |
| **v4a** | **Performance mode** — the projectable stage for the lecture-performance | ✓ done |
| **v1** | Single-model prompting — a real model behind the service (needs weights + a GPU) | **next — everything now waits on this** |
| **v4** | The public lecture performance itself — the search performed live | |
| **v5** | Open research platform — others can search too | |

The research instruments were deliberately built **before** the model: the whole loop —
prompt → branching lineage → variance → readable score — already runs on stub data, so v1
only has to swap the stub for a model.

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
  bones, trails, orbit camera), with the variance **ghost-cloud** overlaid.
  → [`frontend/app/`](frontend/app/).
- ✓ **The research instruments** — the **prompt-lineage tree** (every revision branches
  rather than replacing), and the **legible reduction**: four notation registers — a Marey
  chronophotograph, a per-limb notation strip, a top-down floor path, and a Laban-inspired
  score — all derived from the joint trajectories, none of them complete on its own.
  → [`src/lineage.ts`](frontend/app/src/lineage.ts),
  [`src/notation.ts`](frontend/app/src/notation.ts).
- ◐ **Inference service** (FastAPI) — `POST /generate {model, prompt} → canonical motion`.
  Live as a **fixture stub** (no ML) so the search loop is real before any weights load.
  → [`service/`](service/).
- ✗ **Per-model adapters** — SnapMoGen, Language of Motion, Kimodo → canonical. *Not built.*
- ✗ **A model behind the service** — the v1 step; needs weights + likely a GPU. *Not built.*

```
fixtures/              canonical motion JSON (hand-authored) + generator
docs/abstract.md       the accepted abstract — the canonical framing
docs/motion-schema.md  the exchange-format spec
docs/usage.md          how to use the tool — every view, control and shortcut
docs/v0-stub.md        what v0 fakes — the complete honesty inventory
service/               FastAPI /generate stub (uv)
frontend/app/          Vite + three.js Lab Bench (the live screen)
frontend/mockups/      the original static mockups (reference)
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

📖 **[`docs/usage.md`](docs/usage.md) is the full guide** — every view, every control, every
keyboard shortcut, and how to read each of the four notation registers.

### Reading it

Hit **Read** (or press <kbd>R</kbd>) for the four **notation registers** — the same motion
made legible four ways at once:

1. **Chronophotograph** — Marey's plate: successive poses fading from past to present, so
   the whole phrase is visible at once instead of streaming past.
2. **Notation strip** — a time-scored staff, one row per limb (angle = direction, length =
   how far, height in the row = level).
3. **Floor path** — the movement from above: the weight's trace, the feet faint behind it.
4. **Laban-inspired score** — a vertical staff read bottom → top, with a central **support**
   column (which foot bears the weight) and gesture columns for the body's own left and
   right. Fill = level (solid low · hatched middle · hollow high), lean = sideways, width =
   how far. It is a *designed reduction*, **not strict Labanotation** — designing that
   reduction is itself part of the research.

**No register is complete, and that is the point.** Each one throws information away, and
*which* thing it throws away is the argument: the floor path cannot show you a raised arm;
the chronophotograph drops the body's travel; the Laban score leaves forward/back to the
floor path. Reading them together — and noticing what falls between them — is the
instrument.

### Performing it

Hit **Perform** (or press <kbd>P</kbd>) for the projectable stage: the instrument chrome
falls away, the phrase goes large, playback slows to half speed to be followed by a body —
but the **lineage keeps growing** and you can still type and generate live, in front of the
room. <http://localhost:5173/?perform=1> boots straight into it, for plugging into a projector.

| key | |
|---|---|
| <kbd>R</kbd> | read the four notation registers |
| <kbd>C</kbd> | compare models (the triptych) |
| <kbd>P</kbd> | enter / leave performance mode |
| <kbd>space</kbd> | play / pause |
| <kbd>T</kbd> | cycle tempo (0.5× → 0.25× → 1×) |
| <kbd>G</kbd> | ghost-cloud on / off |
| <kbd>esc</kbd> | leave the current mode |

`?compare=1` opens the triptych directly; `?registers=1` opens the notation registers.

The original static mockups need no build — just `open frontend/mockups/index.html`.

## Status

**The research instrument runs — on stub data. No ML, no model weights, no GPU.**

Working today: type a phrase → a 3D stick figure moves; every prompt branches into a
**lineage tree** (nothing is overwritten); one prompt shows **many seeds** as a variance
**ghost-cloud**; and the motion is reduced to four readable **notation registers** — a Marey
**chronophotograph**, a **notation strip**, a **floor path**, and a **Laban-inspired score**.
A pluggable `Generator` backend sits ready for a real model.

Also working: the **multi-model triptych** (one prompt, three models side by side, each
keeping its native way of authoring) and **performance mode** (the projectable stage).

**The honest catch — please read before drawing any conclusion from a screenshot:**

- The motion is a **placeholder fixture chosen by hashing the prompt**, not generated by any
  model. The system does **not understand what you type**.
- The **variance** (ghost-cloud) is a seeded perturbation, not a model sampling different outputs.
- In the **triptych**, the three models differ *only because the stub hashes `(model, prompt)`*.
  **They are not three models interpreting a theme.** Nothing in that view can be read as a
  finding about model behaviour.

> **There are five hand-authored motions in the entire system.** Every movement you have ever
> seen BodyPrompt produce is one of those five, wearing a little seeded jitter.

⚠️ **[`docs/v0-stub.md`](docs/v0-stub.md) is the complete inventory of what v0 fakes** — every
stand-in, written down in one place, so that nothing in a screenshot can be mistaken for a
finding. Read it before citing anything this tool shows you.

Everything above is the research **instrument** — deliberately built first, so that v1 only
has to swap the stub for a model and every one of these views becomes real at once.
Repo: **Public**.

## Licence

Code: **MIT**. Writing and mockups: **CC BY 4.0**.

---

BodyPrompt investigates prompting as a **collaborative search** through which humans and
generative AI gradually discover expressive movement *together* — reframing prompting
itself as a choreographic practice in which language, movement and computation
continuously shape one another, rather than a command that retrieves a single "correct"
movement from language.
