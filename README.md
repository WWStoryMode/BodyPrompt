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

## Core contribution — the poem as score

The single most important idea in BodyPrompt is not a model or a renderer — it is the way
the **search itself is kept**.

In an ordinary tool, revising a prompt *replaces* what came before. In BodyPrompt the search
is written as a **poem**: each line is a prompt, and the body moves continuously from one
line into the next rather than restarting at each one. The poem **becomes the artefact** —
at once research log, score, and set. Every line keeps its own history, so a revision still
never destroys what came before; the expanding landscape of possibilities lives inside each
line, while the poem holds what is being made from them.

The lines are not independent. Each is generated conditioned on the body the previous line
left behind, so **editing a line changes the future and not the past**: the lines before an
edit are untouched, and every line after it legitimately becomes something else. That
causality is the choreography, and the instrument shows it rather than hiding it.

In performance this matters twice over. The audience does not just watch generated
movement — they watch the **evolution of thought**: the phrase the body is answering right
now, lit as the movement reaches it, and the lines still waiting.

> Until v2 this was a **branching lineage tree** — every revision a child node, the search
> spreading outward. The tree answered *what was tried*; the poem answers *what is being
> made*, which is the question the lecture performance actually asks. The retention
> principle is unchanged; only its shape is.

---

## The interfaces — research instruments

The five screens in this repo are **mockups of research instruments**, each answering
"how does this help the search?" — not "what feature is this?"

***All five screens now exist as a real, running app*** on stub data — the Lab Bench, the
poem editor, the variance ghost-cloud, all four notation registers, the multi-model
triptych, and performance mode. See [Run it](#run-it) and Status. The mockups below are kept
as the original statement of intent.

| # | Instrument | What it lets the research do |
|---|-----------|------------------------------|
| 01 | **Lab bench** | The basic search instrument — explore how *different prompts* generate *different interpretations* of the same poetic intention. |
| 02 | **Search instrument** | Visualises the **history of the search** — the poem retains every line and each line its own revisions, rather than replacing prior attempts; variance is shown as a ghost-cloud. |
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
6. **Refine the line** — reflection reshapes it, and every line after it in turn.
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
| **v2** | **The poem as score** — the search composed as a poem, each line a prompt, the body carrying from one into the next | ✓ done — generation, editor, and the registers reading a line |
| **v2.5** | **Variance** (ghost-cloud) + the **notation registers** — all four: chronophotograph, strip, floor path, Laban-inspired score | ✓ done |
| **v3a** | **Multi-model triptych** — the comparison instrument (the *comparison* is real; the models are not yet) | ✓ done |
| **v4a** | **Performance mode** — the projectable stage for the lecture-performance | ✓ done |
| **v1** | Single-model prompting — Kimodo behind the service | ✓ done |
| **v4** | The public lecture performance itself — the search performed live | |
| **v5** | Open research platform — others can search too | |

The research instruments were deliberately built **before** the model: the whole loop —
prompt → retained search → variance → readable score — already runs on stub data, so v1
only has to swap the stub for a model.

The bridge from v0 to v1 is deliberately split: **v0.5 makes the pipeline real without any
ML** (prompt → service → canonical motion → animated stick figure), so v1 only has to swap
the stub for a model.

### Parked, deliberately

Real generation raised questions the stub could not. They belong to the versions that own
those instruments rather than to v1, and are held until those versions are reopened:

- **v2.5 — displacement in the ghost-cloud.** Kimodo's siblings travel different distances
  for one prompt (2.31, 3.12, 3.64, 4.77 m), and roughly 75% of the visible spread between
  them is root travel rather than limb difference. **Displacement is real variance and stays
  in the performance view** — how far a body goes is part of how the model read the prompt,
  not an artefact to be normalised away. What remains open is offering *pelvis-aligned* as an
  optional view, so the ~0.15 m of genuine articulation difference can be examined on its own
  when that is the question being asked. An option, never the default.
- **Persistence.** Nothing is saved: a reload destroys the poem. The instrument is
  deliberately session-shaped for now, and where a search should live — a file, the browser,
  the service — is an open question rather than an oversight.

### Questions for the research, not the build

Two things are deliberately *not* on this roadmap, because they are findings to be made
with the instrument rather than code still owed. Both wait until the system is fully built:

- **Whether fewer denoising steps read as well.** 75 steps meets the latency budget and
  diverges from 100 by 7% of what a seed change does; whether that costs anything a dancer
  would notice is a studio judgement. The default stays at Kimodo's own 100 until it is
  made, and the step count is a control in the prompt bar for anyone testing it.
- **Whether the four notation registers stay legible against real motion.** They were
  designed against stub data — which turned out to mis-model leg variance by eleven to
  twenty times — and now have several metres of travel and genuine foot-contact data to
  carry. v2 gave them a *scale* to be judged at: a register reads the whole poem coarsely or
  one line at full resolution (<kbd>N</kbd>). Which is the right reading for which question —
  and whether reading a quiet line at its own scale clarifies it or flatters it — is exactly
  the judgement that has to be made with a body in the room, not in code.

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
- ✓ **The research instruments** — the **poem** (each line a prompt, each keeping its own
  revisions rather than being replaced), and the **legible reduction**: four notation
  registers — a Marey chronophotograph, a per-limb notation strip, a top-down floor path,
  and a Laban-inspired score — all derived from the joint trajectories, none of them
  complete on its own.
  → [`src/poem.ts`](frontend/app/src/poem.ts),
  [`src/notation.ts`](frontend/app/src/notation.ts).
- ◐ **Inference service** (FastAPI) — `POST /generate {model, prompt} → canonical motion`.
  Live as a **fixture stub** (no ML) so the search loop is real before any weights load.
  → [`service/`](service/).
- ✗ **Per-model adapters** — SnapMoGen, Language of Motion, Kimodo → canonical. *Not built.*
- ◐ **A model behind the service** — Kimodo generates real motion on the target GPU, and
  the canonical skeleton is anatomically verified. Latency calibration remains.
  → [`docs/v1-implementation.md`](docs/v1-implementation.md)

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

## Quick start — fixture mode

This is the recommended first run. It needs no GPU, Hugging Face account or model
downloads. Two processes are used: the service (serves hand-authored fixture motions) and
the app (renders them). Needs
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

## Optional — real Kimodo inference

The experimental v1 backend runs Kimodo locally instead of returning a fixture when the
Kimodo model is selected. It currently requires:

- Linux with an NVIDIA GPU (target: 8–16 GB VRAM), working drivers and NVIDIA Container
  Toolkit;
- access to the gated
  `meta-llama/Meta-Llama-3-8B-Instruct` repository on Hugging Face; and
- a fine-grained Hugging Face read token.

Copy `.env.example` to `.env`, set `BODYPROMPT_BACKEND=kimodo`, and add the token as
`HF_TOKEN`. Do not put the token directly in a shell command or commit `.env`.

```bash
docker run --rm --gpus all \
  nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi

docker compose --profile local-gpu up --build

# In another terminal:
curl http://localhost:8000/health
```

The frontend is not part of Compose; start it separately with `pnpm dev` as shown in the
fixture quick start. The first worker start downloads large model files into the persistent
`huggingface-cache` Docker volume. Avoid `docker compose down -v` unless you intend to
delete that cache.

A usable health response has `"backend":"kimodo"`, `"ml":true` and `"ready":true`. Only
output labelled with runtime provenance `source: kimodo` is real model output; SnapMoGen and
Language of Motion remain fixtures.

This path has been validated on an RTX 5080: the motion is real, the skeleton is
anatomically sound, and the latency is measured. One prompt plus a ghost-cloud takes about
19 seconds at the default 100 denoising steps, or under 15 at 75 — the step count is a
control in the prompt bar, and every motion records which was used. It is still not a
production-supported route: it wants a GPU, a gated Hugging Face repository and roughly
18 GB of downloads. What is left is written up in
[`docs/v1-implementation.md`](docs/v1-implementation.md). See
[the full usage guide](docs/usage.md#running-the-v1-kimodo-backend-experimental)
for setup, verification and troubleshooting.

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
but the **poem keeps growing** and you can still write and generate live, in front of the
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

**The research instrument runs in fixture mode by default. The v1 Kimodo path generates
real movement on its target GPU, calibrated and inside its latency budget. What remains
are questions for the research to answer with the instrument, not code still owed.**

Working today: type a phrase → a 3D stick figure moves; every prompt branches into a
**poem** whose every line keeps its own history (nothing is overwritten); one line shows
**many seeds** as a variance
**ghost-cloud**; and the motion is reduced to four readable **notation registers** — a Marey
**chronophotograph**, a **notation strip**, a **floor path**, and a **Laban-inspired score**.
A pluggable `Generator` routes either to the five fixtures or to the isolated Kimodo worker.

Also working: the **multi-model triptych** (one prompt, three models side by side, each
keeping its native way of authoring) and **performance mode** (the projectable stage).

**The honest catch — please read before drawing any conclusion from a screenshot:**

- In default fixture mode, the motion is chosen by hashing the prompt; the prompt is not
  understood and the ghost-cloud is seeded perturbation.
- With the v1 backend, only an output whose runtime provenance says `source: kimodo` is a
  model generation. The UI derives that label from `/health`, not from the selected name.
- SnapMoGen and Language of Motion remain fixtures. The mixed triptych is therefore **not
  evidence of cross-model interpretation**, even when its Kimodo panel is real.

> **In fixture mode there are five hand-authored motions in the entire system**, and every
> movement you see is one of those five wearing a little seeded jitter. That is the default,
> and it is what every screenshot in this repository shows. Only an output labelled
> `source: kimodo` escapes it.

⚠️ **[`docs/v0-stub.md`](docs/v0-stub.md) is the complete inventory of what v0 fakes** — every
stand-in, written down in one place, so that nothing in a screenshot can be mistaken for a
finding. Read it before citing anything this tool shows you.

Two findings from the first real generations are worth knowing before reading a Kimodo
ghost-cloud: real siblings vary the **legs** far more than the fixtures do — the stub damps
ankles and knees on an assumption of planted feet that the model does not share — and about
**three quarters** of the difference between siblings is how far each one travels, not how
it moves. See [`docs/v1-implementation.md`](docs/v1-implementation.md) for the measurements,
the local-GPU setup, and what remains open.
Repo: **Public**.

## Licence

Code: **MIT**. Writing and mockups: **CC BY 4.0**.

---

BodyPrompt investigates prompting as a **collaborative search** through which humans and
generative AI gradually discover expressive movement *together* — reframing prompting
itself as a choreographic practice in which language, movement and computation
continuously shape one another, rather than a command that retrieves a single "correct"
movement from language.
