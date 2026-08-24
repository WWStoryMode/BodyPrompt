# Using BodyPrompt

The complete guide to the running app: every view, every control, every keyboard shortcut.

**Before you start, one thing.** The app does not read your prompt. It hashes it, and returns
one of five hand-authored motions. Everything below describes a working *instrument* pointed
at *fake data* — see [`v0-stub.md`](v0-stub.md) for exactly what is faked and where. Nothing
you see in this tool is yet a finding about a model.

---

## Running it

Two processes. Needs **Python 3.10+ with [uv](https://docs.astral.sh/uv/)** and **Node 18+
with [pnpm](https://pnpm.io/)**.

```bash
# 1) the service — serves motions on http://localhost:8000
cd service
uv run uvicorn app.main:app --port 8000

# 2) the app — http://localhost:5173  (second terminal)
cd frontend/app
pnpm install
pnpm dev
```

Check the service is alive: `curl localhost:8000/health` →
`{"ok":true,"backend":"stub","ml":false,"ready":true}`. The `"ml":false` is the tell — no
model is running.

If the app can't reach the service it says so on the stage rather than failing silently, and
prints the command to start it.

---

## Keyboard shortcuts

Every shortcut, in one table. **Shortcuts are ignored while you are typing in the poem** —
otherwise the letter "p" would drop you into performance mode mid-sentence. Now that the
instrument is an editor that is most of the time, so <kbd>esc</kbd> unfocuses the line you
are on and hands the keys back. <kbd>esc</kbd> always works, because you do not want to be
hunting for a mouse in front of an audience.

| Key | Does |
|---|---|
| <kbd>D</kbd> | **Draft** the selected line, on its own |
| <kbd>B</kbd> | **Bake** the whole poem in one pass |
| <kbd>L</kbd> | loop the selected line alone / release it |
| <kbd>N</kbd> | **one line** / the **whole poem** — the triptych's scope when comparing, the registers' otherwise |
| <kbd>R</kbd> | **Read** — open / close the four notation registers |
| <kbd>C</kbd> | **Compare** — open / close the multi-model triptych |
| <kbd>P</kbd> | **Perform** — enter / leave performance mode |
| <kbd>space</kbd> | play / pause |
| <kbd>T</kbd> | cycle tempo: 0.5× → 0.25× → 1× |
| <kbd>G</kbd> | ghost-cloud on / off |
| <kbd>esc</kbd> | leave the current mode; from a line, unfocus it |

**In the poem:** <kbd>enter</kbd> starts a new line, <kbd>backspace</kbd> at the start of a
line merges it upward, <kbd>↑</kbd><kbd>↓</kbd> move between lines.

**Mouse, on the 3D stage:** drag to orbit, scroll to zoom, right-drag to pan. Standard
three.js orbit controls.

## Boot flags

Append to the URL. Useful for projectors and for scripted screenshots — you don't want to be
clicking through chrome in front of a room.

| URL | Opens |
|---|---|
| `localhost:5173/` | the Lab Bench |
| `localhost:5173/?registers=1` | straight into the four notation registers |
| `localhost:5173/?compare=1` | straight into the triptych |
| `localhost:5173/?perform=1` | straight into the projectable performance stage |

---

## The Lab Bench (the default view)

Type a phrase, press <kbd>enter</kbd> or click **Generate**. A 3D stick figure plays the
returned motion.

**Deliberately not a realistic avatar.** A realistic body sells an illusion and invites you to
read a *character*; a stick figure exposes the computational body directly — joints,
trajectories, timing, weight. See the README on why.

Around the stage:

- **Telemetry** (top left) — model, prompt, seed, joint count, how many other seeds are in the
  cloud, and an amber `stub · hand-authored fixture (no ML)` line. That last line is there so
  that no screenshot of this app can be honestly mistaken for model output.
- **Poem rail** (left) — the score you are writing. See below.
- **Notation rail** (right) — two of the four registers, small: the notation strip and the
  floor path. <kbd>R</kbd> opens all four, large.
- **Transport** (bottom) — play/pause, a scrub bar, the ghost-cloud toggle, and a frame
  counter. Scrubbing moves the figure, the ghosts, and every open register together.

### The poem — the core contribution

**Each line is a prompt, and the poem is the score.** Write on the left; the body answers
line by line and carries from one into the next.

- **Enter** starts a new line, **Backspace** at the start of a line merges it into the one
  above, **↑↓** move between lines — it behaves like a text editor, because that is what
  writing a poem needs.
- **Draft line** (`D`) generates the selected line **on its own**. Fast, and blind to its
  neighbours: the body will visibly jump where one drafted line meets the next.
- **Bake** (`B`) generates the **whole poem in one pass**, each line conditioned on the body
  the previous line left behind. This is the real reading, and the only one that is
  continuous.
- **Double-click** a line to jump the playhead to it; **↻** loops that line alone so you can
  watch it while you rewrite it.
- **Duration** sits at the end of each line. Leave it blank and it follows the line's length;
  type a number to fix it.

The dot at the left of each line says what it is: hollow = not generated, faint amber =
drafted alone, solid amber = baked and carrying through, dashed red = edited since it was
generated.

**Editing a line changes the future, not the past.** Because each baked line is generated
from the body the line before it left, changing one line invalidates it *and every line
after it* — the lines above stay solid. That is not caution; it is what the model does, and
watching it happen is part of what the instrument is for.

A banner appears whenever what is playing is not the baked poem — either because the lines
were drafted separately, or because the poem has been edited since. It is there so a draft
can never quietly pass for the finished reading.

Where the poem shows *the search across time*, the ghost-cloud shows *the possibilities
at one moment*. It belongs to **one line**: switch it on and drafting a line generates four
readings of that line, shown around it. A baked poem carries no cloud — four readings of a
five-line poem would take minutes, and the model cannot re-roll a single line on its own. It is hidden in the triptych and the registers view, because there it would
only add noise — the ghost-cloud compares **seeds**, the triptych compares **models**.

*(In v0 this is a seeded perturbation, not a model sampling. See [`v0-stub.md`](v0-stub.md).)*

### Keeping the poem — the session bar

At the foot of the poem rail: **Export**, **Import**, **New**, and a line saying whether
anything is being kept.

- **The browser keeps a copy automatically.** A reload no longer destroys the poem. The
  status line says `session · kept 14:32` after each save, and it saves about a second after
  you stop typing. On a restored session the instrument re-opens what was there and
  **generates nothing** — the motions were in the copy.
- **Export** writes a session file: every line, every line's history, the bake, and the
  motions themselves. It is yours, it is self-contained, and it opens on another machine
  with the service switched off. Put it beside your notes.
- **Import** opens one. A file that is not a session says so rather than half-loading.
- **New** starts an empty poem. It asks first, and Export is right there.

If the browser refuses storage — a private window, blocked site data — the status line turns
red and says so. Nothing pretends to have been saved. The format is documented in
[`session-schema.md`](session-schema.md).

---

## The four notation registers — <kbd>R</kbd>

The same motion, made legible four ways at once. A stick figure lets you *watch* movement; it
does not let you **read** it.

**1 · Chronophotograph.** Marey's plate: seven exposures fading from past to present, so the
whole phrase is visible at once instead of streaming past. The lit pose is *now*.
The horizontal axis is **time, not distance** — as on Marey's *moving* plate. Each pose is
centred on its own pelvis, so the body's travel is dropped (otherwise a motion that slides a
metre sideways walks its last exposure clean off the plate). Seen from a quarter-turn, because
dead-on the hips are only 9 cm apart and the two legs collapse onto a single line.

**2 · Notation strip.** A time-scored staff, one row per limb — L arm, R arm, spine, weight,
feet. Each glyph's **angle** is the direction that limb travelled, its **length** is how far,
and its **height in the row** is the level. Limbs are read *relative to their anchor* (a wrist
against its shoulder is the arm's gesture; the wrist's absolute position would just re-tell you
where the body is). "Weight" is the exception — the pelvis in absolute terms *is* where the
weight is. A bucket in which nothing moved still gets a dot, so the score never lies by
omission.

Level and magnitude are normalised **per track**, so "high" means high *for that limb* — right
for reading one motion closely, but it means two strips are not directly comparable.

**3 · Floor path.** The movement from above: the weight's trace, the feet faint behind it, a
marker where it began and a dot where it is now. Never zoomed in past 0.7 m — a body that
barely travels should *look* like a body that barely travels.

**4 · Laban-inspired score.** A vertical staff read **bottom → top**. It is a **designed
reduction, not strict Labanotation** — designing that reduction is itself part of the research.

| Element | Means |
|---|---|
| The central column pair | **support** — which foot is bearing weight. Read from the foot joint; if both feet leave the floor the column goes empty, and the *gap* is the notation. |
| Support shading | how deep the body is sitting (a crouch shades it solid) |
| Outer columns | the limb **gestures** — the body's own left and right, as the performer would read them, not as you watching would |
| Glyph **fill** | **level**: solid = low · hatched = middle · hollow = high |
| Glyph **lean** | which way it went, sideways |
| Glyph **width** | how far it went |

Unlike the notation strip, levels here are read **anatomically, not statistically** — a hanging
wrist sits ~0.57 m below its shoulder (*low*), level with the shoulder is *middle*, above is
*high*; a standing ankle rests ~0.09 m up (*low*). That means "high" means the same thing in
every motion, so two Laban scores **can** be compared. This is a real difference in kind
between register 2 and register 4, and it is deliberate.

### Reading one line — <kbd>N</kbd>

All four registers divide whatever they are given by a fixed count — 16 buckets, 7
exposures, 6 beats — and normalise against its range. Give them a five-line poem and that is
still true, but it stops being *readable*: each line gets about one and a half exposures, and
the loudest line sets the scale the quiet ones are drawn against. A held breath between two
big phrases reads as nothing at all, which is a failure of the register, not of the line.

So the score rail has a switch: **whole poem** or **this line**. Press <kbd>N</kbd>, or click
the button next to the rail's title.

**"This line" means the line the body is playing**, not the line your cursor is in. The score
is a reading of the movement, so it says what the body is doing now — and while you write,
your cursor is usually somewhere else. It follows the playhead across each boundary. If you
want the score to stay on one line, **loop that line** (<kbd>L</kbd>): pin the body and the
score stays with it.

**This is not a zoom.** A narrowed register re-reads one line at full resolution against its
own range — the same 16 buckets, the same 7 exposures, renormalised. The held breath gets a
whole plate to itself and becomes legible. The cost is the obvious one, and it is worth
stating plainly:

> Two registers set to different ranges **cannot be compared with each other**. A gesture
> that looks large in one line and large in the whole poem is not the same size. The rail
> title says which reading is on screen (`notation · line 2` versus `notation · the score`)
> for exactly that reason.

Narrowing needs a **baked** poem of more than one line; the button is disabled otherwise. A
drafted line is already its own separate clip, so the registers are already reading it alone
— and there they follow the **selected** line, because that is what the ghost-cloud is
showing you and what you are rewriting.

Which means a register can be holding a line the body is not in: a drafted line while another
plays. When that happens it **hides its "now" marker** rather than parking it at an edge. The
register cannot see where the body is, so it says nothing rather than something false.

**Where the lines meet.** In the whole-poem reading, the notation strip draws a dashed rule
and the floor path a tick across the trace at every line boundary — so you can see which part
of the score belongs to which sentence, and where the body was standing when it changed
sentence. Only a **bake** gets these marks. Drafted lines have joins, not seams: they were
generated apart and the body jumps between them, and dressing that break as a transition is
exactly the kind of thing this project does not do.

### No register is complete — that is the point

Each one throws information away, and **which** thing it throws away is the argument. The floor
path cannot show you a raised arm. The chronophotograph drops the body's travel. The Laban
score leaves forward/back to the floor path. Reading them *against* each other — and noticing
what falls *between* them — is the instrument. All four playheads walk the phrase together, so
that reading-against is possible at all.

**Try this:** the only fixture in which an arm rises above the shoulder is `reach-and-return`,
so on most prompts the Laban score's level shading is honestly, monotonously "low". To see the
fill actually change (solid → hatched → hollow), find a prompt that lands on that fixture — with
model **snapmogen**, the phrase "slip away" does it. (Yes, really. That is fake #1 in
[`v0-stub.md`](v0-stub.md), and it is exactly as arbitrary as it sounds.)

---

## The triptych — <kbd>C</kbd>

Three models side by side: SnapMoGen, Language of Motion, Kimodo. Each keeps its **native way
of authoring** — write / voice / sculpt — because the difference in *how you author* is itself
part of the research. (Only *write* is wired up; the others are labelled, not built.) Each
panel has its own accent colour, and all three play in step.

The banner at the top is **built from `/health`**, not written into the page, so it always
says how many of the three panels are actually model output. As of v3 that is two of three —
Language of Motion is still a hand-authored fixture and its panel says so.

### One line, or the whole poem — <kbd>N</kbd>

The scope button at the top right switches between two genuinely different questions.

**One line** — how do three models read the same sentence? This is the original triptych. It
generates the moment you open the view, because one line is cheap.

**The whole poem** — which of these models can carry a body from one sentence into the next
at all? This one **waits to be asked**: every line through every model, with each local
worker serialised to one generation at a time, is minutes of GPU, so the panels clear and say
`press D to read N lines in three models`. Press <kbd>D</kbd> when you mean it.

In whole-poem scope the three panels are **not the same kind of thing**, and each one says
which it is:

- `3 lines carried through` — the model generated the poem as one motion, each line
  conditioned on the body the line before it left. Only Kimodo can do this.
- `3 lines generated apart` — the lines were generated separately and laid end to end. The
  body jumps between them, and nothing smooths it: no interpolation, no pelvis slid across
  a join. It is the same thing a drafted poem is on the bench, and it is labelled with the
  same words on purpose.

Nothing is forced into a common shape to make the columns match. Making Kimodo concatenate
too would be a fairer comparison of *interpretation*, and it would switch off the only real
continuity in the system to do it. The asymmetry **is** the comparison.

A panel may also say `asked for 180 frames, moved for 384`. That is the model declining the
length it was given — SnapMoGen will not go below a 128-frame floor, so a 2 s line becomes
4.27 s of movement, and a fixture does not resize to a requested duration at all. Small
differences are not reported: SnapMoGen quantises to whole units, so 150 frames becoming 152
is a rounding artefact and saying so in every panel would bury the case that matters.

### The transport, while comparing

Play/pause and the scrub bar drive all three panels together. The counter reads something
like `kimodo · line 2/3 · 48%`, and the model name is not decoration — **there is no shared
clock**. A three-line poem is 180 frames of Kimodo and 384 of SnapMoGen, so a frame count
would be one panel's clock presented as everyone's. A percentage and a line number are what
the panels actually have in common, and the name says whose playhead you are reading.

Each panel separately names the sentence *its* body is on, because they diverge: SnapMoGen
floors every line to the same length while Kimodo honours the durations it was given, so
halfway through a poem two panels can be on different lines.

On the bench the counter carries the line number too — `line 2/5 · frame 200 / 449 · 30 fps`.

> ⚠️ **Read the labels before drawing a conclusion.** Two of three panels are real models;
> the third is a fixture. In whole-poem scope one panel is continuous and two are not. A
> screenshot of this view is not evidence of three models interpreting a theme, and the
> per-panel labels are what make that checkable rather than something you have to remember.

---

## Performance mode — <kbd>P</kbd>

The projectable stage, for the lecture performance. Not a separate page: the **same session,
the same poem.** The performer keeps working — writing, drafting, baking — while the
room sees only the body, the phrase and the score.

What changes: the instrument chrome falls away, the background darkens, a spotlight gathers the
eye onto the body, the phrase goes large beneath it, and **playback drops to half speed** —
because a human has to be able to *follow and re-embody it*. The score gets thicker strokes and
bigger labels: it has to be readable by a body, from across a room. The poem keeps growing in
the corner — research log as set.

<kbd>T</kbd> cycles the tempo, <kbd>space</kbd> plays and pauses, <kbd>esc</kbd> gets you out.
`?perform=1` boots straight into it, for plugging into a projector.

---

## Changing the movement itself

The five motions are hand-authored keyframes in
[`fixtures/_generate.py`](../fixtures/_generate.py). Edit the keyframe lists and re-compile:

```bash
python3 fixtures/_generate.py
```

**One trap, and it has drawn blood.** The fixture authoring uses **translation-only forward
kinematics**: a joint's total offset is the sum of its own delta and all its ancestors'. So
**dropping the pelvis drags the legs down with it** — a crouch needs compensating `+y` knee and
ankle deltas or the feet sink through the floor. `gather` shipped with its feet 7 cm
underground before a foot-plant check caught it. If you author a crouch, check the feet.

The service loads fixtures at startup, so restart it after re-compiling.

## Where each model comes from

Routing is **per model**, not per backend. Each model is pointed at whatever serves it, and
the three can differ:

```bash
BODYPROMPT_MODEL_KIMODO=http://kimodo-worker:8010          # a worker on this machine
BODYPROMPT_MODEL_SNAPMOGEN=https://gpu.example.com/snap    # a worker somewhere else
BODYPROMPT_MODEL_LANGUAGE_OF_MOTION=fixture                # not real yet
```

A **URL is a worker**, and that is the only thing that distinguishes a container on this
laptop from a GPU in another building. Local and remote are the same code path, because the
memory ceiling on one machine is a fact about that machine and not something the architecture
should be built around. Unset, or `fixture`, means the hand-authored stub — so "not real yet"
is configuration rather than a branch in the code.

Optional companions, for the remote case:

| Variable | Does |
|---|---|
| `..._TOKEN` | sent as `Authorization: Bearer …` |
| `..._HOSTING` | `local` or `remote`, overriding the guess below |
| `..._CONCURRENCY` | how many generations may run at once |

Local or remote is **guessed** from the URL — loopback, or a bare hostname with no dots (a
Compose service name), is local; a dotted host is remote. It only sets the default
concurrency: a local worker gets 1, because one GPU serves one generation at a time and the
triptych asks for three at once. Say `..._HOSTING` when the guess is wrong.

## What the service remembers

The service keeps every motion it generates, on disk, keyed by everything that decided it —
model, prompt or lines, seed, and the sampling settings. Compose points it at a named volume,
so it survives rebuilds:

```bash
BODYPROMPT_STORE_DIR=/var/lib/bodyprompt/motions   # "off" keeps nothing
BODYPROMPT_STORE_LIMIT=500                         # motions, evicted least-recently-used
```

`GET /health` reports whether it is on and how much is in it; `GET /motions` lists what is
kept — metadata only, never the frames.

**A request that names a seed replays instead of running the model.** That is the point of
keeping them, and it is easiest to see by stopping the model first:

```bash
REQ='{"model":"snapmogen","prompt":"a body remembers","seed":7,"duration_seconds":5}'
curl -s localhost:8000/generate -H 'content-type: application/json' -d "$REQ" | head -c 200
docker compose stop snapmogen-worker
curl -s localhost:8000/generate -H 'content-type: application/json' -d "$REQ" | head -c 200
```

The second call returns the same motion with `"served_from_store": true`, the original
`generated_at`, and the original `inference_ms` — because it **is** the original generation,
served again, not a fast one. A prompt that was never generated still fails, honestly, with
the worker's address in the message.

A request with **no seed** is never answered from the store: it is asking for a new roll, and
the ghost-cloud is entirely a claim about seeds. The instrument itself never sends a seed, so
in ordinary use the store records and does not replay; a UI for reaching it comes with the
triptych. The store is *not* a backup of your poem — [the session file](session-schema.md)
is, and it is the copy that matters.

`/health` reports what each model actually resolved to, including the model version **the
worker reported about itself** — the service never states which checkpoint is loaded
somewhere else.

`BODYPROMPT_BACKEND=stub|kimodo` still works and is translated into the per-model form, so
older commands and `.env` files keep running. Being explicit wins over it.

Adding a model means implementing a worker that speaks the canonical contract and pointing a
variable at it. **Nothing else in the system changes** — not the frontend, not the renderer,
not one of the four registers. That is the whole reason v0 was built in this order. See
[`motion-schema.md`](motion-schema.md) for the format a worker must emit.

## Running the v1 Kimodo backend (experimental)

This is optional: fixture mode above remains the recommended first run and needs no GPU or
model account. The v1 path isolates Kimodo in a CUDA worker so the main service remains
runnable without CUDA.

### Prerequisites

- Linux with an NVIDIA GPU (target: 8–16 GB VRAM).
- Working NVIDIA drivers and NVIDIA Container Toolkit.
- Docker with Compose support.
- Access, on the same Hugging Face account used by the token, to the gated
  `meta-llama/Meta-Llama-3-8B-Instruct` repository.
- A fine-grained Hugging Face token with read access.

First confirm that the GPU is available inside a container:

```bash
nvidia-smi
docker run --rm --gpus all \
  nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

Both commands must show the GPU before starting BodyPrompt.

### Configure and start

Copy the example environment, select Kimodo, and add the token:

```bash
cp .env.example .env
chmod 600 .env
```

```dotenv
BODYPROMPT_BACKEND=kimodo
HF_TOKEN=hf_replace_with_a_fine_grained_read_token
BODYPROMPT_DIFFUSION_STEPS=100
```

`BODYPROMPT_DIFFUSION_STEPS` is the fallback when a request does not name one — the prompt
bar has a `steps` box, and `POST /generate` takes `denoising_steps`. It is an absolute
count of DDIM sampling steps, not a fraction: 100 is Kimodo's own default, not a ceiling.
Four variants take ~19 s at 100 and ~15 s at 75; below 75 the step count starts shifting
the motion by a sizeable fraction of what changing the seed does, so it stops being a free
speed dial. Whichever number produced a motion is recorded in its provenance.

Keep the token in `.env`, which is ignored by Git. Do not put it directly in a shell command
where it may be retained in shell history. Then build and start the service and GPU worker:

```bash
docker compose --profile local-gpu up --build
```

The first build and startup can be slow: CUDA-enabled PyTorch, Kimodo, the text encoder and
model weights must be downloaded. Hugging Face downloads persist in the named
`huggingface-cache` volume. `docker compose down` preserves it; `docker compose down -v`
deletes it.

The frontend is not currently included in Compose. Start it in another terminal:

```bash
cd frontend/app
pnpm install
pnpm dev
```

### Verify it

Check the public service:

```bash
curl http://localhost:8000/health
```

The response must report `"backend":"kimodo"`, `"ml":true` and `"ready":true`; the Kimodo
capability must have `"source":"kimodo"` and `"ready":true`. In the app, only a generated
motion whose provenance says `source: kimodo` is a real Kimodo result. SnapMoGen and
Language of Motion continue to return fixtures.

If readiness is false, inspect both services:

```bash
docker compose logs kimodo-worker
docker compose logs service
```

Common causes are a missing NVIDIA Container Toolkit, insufficient VRAM, a token without
access to the gated repository, gated access accepted under a different Hugging Face
account, or a change in Kimodo's upstream API.

The GPU checks in [`v1-implementation.md`](v1-implementation.md) have now passed on an
RTX 5080: the motion is real and the skeleton is anatomically verified. Expect about six
seconds for a single motion and around twenty-five for a prompt plus its ghost-cloud, which
is over the intended budget — the UI will sit and wait for it. In every mode, `/health` and
the model selector state whether an output is real, a fixture, or unavailable.
