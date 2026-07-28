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

Every shortcut, in one table. **Shortcuts are ignored while your cursor is in the prompt box**
— otherwise typing the letter "p" would drop you into performance mode mid-sentence. The one
exception is <kbd>esc</kbd>, which always works, because you do not want to be hunting for a
mouse in front of an audience.

| Key | Does |
|---|---|
| <kbd>R</kbd> | **Read** — open / close the four notation registers |
| <kbd>C</kbd> | **Compare** — open / close the multi-model triptych |
| <kbd>P</kbd> | **Perform** — enter / leave performance mode |
| <kbd>space</kbd> | play / pause |
| <kbd>T</kbd> | cycle tempo: 0.5× → 0.25× → 1× |
| <kbd>G</kbd> | ghost-cloud on / off |
| <kbd>esc</kbd> | leave the current mode; from the prompt box, unfocus it |
| <kbd>enter</kbd> | (in the prompt box) generate |

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
- **Lineage rail** (left) — the search so far. See below.
- **Notation rail** (right) — two of the four registers, small: the notation strip and the
  floor path. <kbd>R</kbd> opens all four, large.
- **Transport** (bottom) — play/pause, a scrub bar, the ghost-cloud toggle, and a frame
  counter. Scrubbing moves the figure, the ghosts, and every open register together.

### The prompt lineage tree — the core contribution

**Every prompt revision is kept.** Generating does not replace what came before; it adds a
child node. The search branches, and nothing is undone.

- **Generate** from the current node → extends the line.
- **Click a past node**, then Generate → **branches** from there. The old line stays.
- Clicking a node **replays its stored motion** — no re-fetch, and it restores that node's own
  ghost-cloud too.

The tree is the artefact, not the leftovers. In performance it is the set: the audience
watches not just generated movement but the *evolution of thought* — how a phrase mutated,
where it branched, which possibility was followed and which was left open.

### The ghost-cloud

One prompt, many seeds. The solid amber figure is the primary motion; the translucent blue
figures around it are three siblings with different seeds. Toggle with <kbd>G</kbd> or the
checkbox.

Where the lineage tree shows *the search across time*, the ghost-cloud shows *the possibilities
at one moment*. It is hidden in the triptych and the registers view, because there it would
only add noise — the ghost-cloud compares **seeds**, the triptych compares **models**.

*(In v0 this is a seeded perturbation, not a model sampling. See [`v0-stub.md`](v0-stub.md).)*

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

One prompt, three models, side by side: SnapMoGen, Language of Motion, Kimodo. Each keeps its
**native way of authoring** — write / voice / sculpt — because the difference in *how you
author* is itself part of the research. (Only *write* is wired up; the others are labelled, not
built.) Each panel has its own accent colour, and all three play in step — comparing motions
that were out of step with each other would tell you nothing.

> ⚠️ **The three models differ only because the stub hashes `(model, prompt)`.** They are not
> three models interpreting a theme. In fact two of the three panels usually show the *same*
> base fixture wearing different seeded jitter. There is a banner in the UI saying so, and it
> is not being coy. **Do not use a triptych screenshot as evidence of model comparison.**

---

## Performance mode — <kbd>P</kbd>

The projectable stage, for the lecture performance. Not a separate page: the **same session,
the same lineage.** The performer keeps working — typing, generating, branching — while the
room sees only the body, the phrase and the score.

What changes: the instrument chrome falls away, the background darkens, a spotlight gathers the
eye onto the body, the phrase goes large beneath it, and **playback drops to half speed** —
because a human has to be able to *follow and re-embody it*. The score gets thicker strokes and
bigger labels: it has to be readable by a body, from across a room. The lineage keeps growing in
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

## Swapping the backend

The generator behind `POST /generate` is chosen by an environment variable:

```bash
BODYPROMPT_BACKEND=stub uv run uvicorn app.main:app --port 8000   # the default; the only one that exists
```

A real backend implements `Generator` (`name`, `ml`, `ready()`, `generate(model, prompt,
variants)`), returns canonical motion, and registers itself in `_BACKENDS`. **Nothing else in
the system changes** — not the frontend, not the renderer, not one of the four registers. That
is the whole reason v0 was built in this order. See
[`motion-schema.md`](motion-schema.md) for the format a backend must emit.
