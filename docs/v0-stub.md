# What v0 fakes

**A complete inventory of every stand-in in the system, written down in one place so that
nothing in a screenshot can be mistaken for a finding.**

v0 built the *research instruments* before the model, deliberately: the search loop, the
lineage tree, the ghost-cloud, the four notation registers, the triptych and performance
mode all run end-to-end — on hand-authored data. That was the right order to build in, but
it leaves the repo in a state where **the instrument looks like it is working when in fact
it is not reading your prompt at all.** This document says exactly where the seams are.

The single sentence version:

> **There are five hand-authored motions in the entire system. Every movement you have ever
> seen BodyPrompt produce is one of those five, wearing a little seeded jitter. The prompt
> is not read; it is hashed.**

---

## The five fixtures

Hand-authored keyframes in [`fixtures/_generate.py`](../fixtures/_generate.py), compiled to
canonical motion JSON. All five are 90 frames at 30 fps — exactly 3.0 seconds.

| Fixture | Phrase it was authored *for* | Tagged model | Seed | What the body does |
|---|---|---|---|---|
| `reach-and-return` | "a body remembers a place it cannot return to" | snapmogen | 4021 | The right arm reaches up and forward, then almost — but not quite — returns. A residual 8 cm remains: the memory. **The only fixture in which an arm goes above the shoulder.** |
| `slip-away` | "slip away" | kimodo | 1177 | The whole body drifts 0.46 m sideways and turns, arms trailing behind. **The only fixture that really travels.** |
| `gather` | "coming home" | language-of-motion | 8802 | Both arms sweep inward to the chest; a slight crouch. |
| `fall-and-rise` | "the ground remembers" | snapmogen | 5310 | A fold down toward the floor (the pelvis drops 45 cm), then a rise, ending a little taller than rest — opened out. |
| `turn-away` | "look back, then go" | kimodo | 2287 | The torso twists and the head turns back over the shoulder, one arm sweeping behind; then the body unwinds and leaves. |

The "phrase it was authored for" column is **not** a lookup table. Read on.

---

## Fake #1 — the prompt is hashed, not read

[`StubGenerator.generate`](../service/app/generators.py) picks a fixture like this:

```python
key = f"{model}:{prompt}"
idx = (sum(ord(c) for c in key)) % len(self._fixtures)   # 5 fixtures
```

The sum of the character codes, modulo five. That is the entire "understanding" of language
in v0. It is **stable** (the same prompt always returns the same motion, which is what makes
the lineage tree meaningful) and it is **meaningless** (the mapping carries no relation
whatever between what you typed and what the body does).

Here is the proof, and it is sharper than I expected. These are the five phrases the fixtures
were *authored for*, run through the real hash:

| You type… | snapmogen gives you | language-of-motion gives you | kimodo gives you |
|---|---|---|---|
| "a body remembers a place it cannot return to" | `slip-away` | `gather` | `slip-away` |
| "slip away" | `reach-and-return` | `fall-and-rise` | `reach-and-return` |
| "coming home" | `fall-and-rise` | `slip-away` | `fall-and-rise` |
| "the ground remembers" | `slip-away` | `gather` | `slip-away` |
| "look back, then go" | `turn-away` | `reach-and-return` | `turn-away` |

**Not one phrase returns the motion it was written for.** Type "slip away" and the body
reaches for something. Type "a body remembers a place it cannot return to" — the project's
own signature phrase, the one in the abstract — and you get a body sliding sideways, which
is not what that fixture was authored to express at all.

This is not a bug to be fixed. It is what "the system does not understand what you type"
*looks like* when you write it down honestly. It is fixed by a model, not by a better hash.

## Fake #2 — the triptych's three models

Two models collide. `sum(ord(c))` for `"snapmogen"` and for `"kimodo"` happen to be congruent
modulo 5 — so for **every** prompt, those two panels select the **same base fixture**. Look at
the table above: the snapmogen and kimodo columns are identical, row for row.

What stops the triptych from showing literal twins is this, in `generate()`:

```python
model_sig = sum(ord(c) for c in model) * 7919 if model else 0
seed = int(base.get("seed", 0)) + model_sig
motion = vary(base, seed) if model_sig else dict(base)
```

Each model gets a stable signature, and the motion is jittered by it. So in a two-thirds of
the triptych, **the visible difference between "SnapMoGen" and "Kimodo" is nothing but seeded
noise applied to one identical fixture.** The remaining panel differs only because a modulo
landed elsewhere.

The triptych carries an in-UI banner saying so. **As of v3 that banner is built from
`/health`** rather than written into the page, so it counts the real panels instead of
asserting a number — the hard-coded version it replaced still said "SnapMoGen and Language of
Motion remain labeled fixtures" for the whole of the commit in which SnapMoGen stopped being
one. In fixture mode it still says what this section says, and it is not overstating the case.

**In fixture mode, nothing in that view can be read as a finding about model behaviour.** Do
not put a triptych screenshot in a paper as evidence of models interpreting a theme without
reading its banner and its per-panel labels first.

## Fake #3 — the ghost-cloud is a perturbation, not a sampling

`vary(motion, seed)` gives every joint a smooth, low-frequency sinusoidal wander — amplitude,
frequency and phase drawn from a seeded RNG, amplitude scaled per joint by the `_WANDER`
table (pelvis ~1.2 cm, wrists ~7 cm; vertical wander damped to 0.6 so the figure doesn't bob
off the floor).

That table is a *guess at the shape* of a model's variance — the root and spine barely move
while the extremities vary a lot, so the cloud reads as "the same intention, differently
expressed" rather than as noise. A real model's variance does behave roughly like that. But
this cloud is **not a model sampling different outputs.** It is one motion, wobbled five ways.

The claim the ghost-cloud is currently entitled to make is only: *here is what a variance
display would look like, and here is the interface for reading one.*

## Fake #4 — rotations are empty, and the FK is translation-only

Every frame carries a `rotations` array, and in v0 it is **entirely identity quaternions** —
reserved space in the schema, filled with nothing. All motion lives in `positions`.

The fixtures themselves are authored by summing per-joint translation offsets down the
kinematic chain (see `total_offset` in `_generate.py`) — not by rotating limbs. This has a
consequence that bit once already: **dropping the pelvis drags the legs down with it**, so
every crouch needs compensating `+y` knee and ankle deltas or the feet sink through the
floor. `gather` shipped with its feet 7 cm underground until a foot-plant check caught it.

A real model will emit rotations. When it does, the renderer and the notation registers keep
working (they read positions), but anything that wants joint *orientation* — a facing
direction, a proper Labanotation front/back symbol — becomes possible for the first time.

---

## What is **not** fake

Everything the fakes are wearing. This is the part that survives v1 untouched, and it is why
building the instrument first was worth doing:

- **The canonical schema** (`bodyprompt.motion/v0`) — the exchange format, and the whole
  reason a model swap is a swap rather than a rewrite. → [`motion-schema.md`](motion-schema.md)
- **The `Generator` interface and the `POST /generate` contract.** A real backend implements
  three methods and registers itself in `_BACKENDS`. Nothing else in the system changes.
- **The stick-figure renderer** — reads canonical motion, knows nothing of where it came from.
- **The prompt lineage tree** — the core contribution. Branching, retention, click-to-replay.
  Real now, real later.
- **All four notation registers** — chronophotograph, notation strip, floor path,
  Laban-inspired score. Every glyph is derived from joint trajectories. They are *real
  readings of fake data*, and the moment the data is real, so are they.
- **The triptych as an instrument** (the comparison is real; the models are not).
- **Performance mode**, the transport, the tempo control, the ghost-cloud *display*.

## Retiring the fakes

The v1 Kimodo backend retired the prompt hash, synthetic variance and empty rotations **for
outputs whose provenance says `source: kimodo`**. **v3 Stage B (2026-08-24)** did the same
for `source: snapmogen`, and **Stage E (2026-08-24)** for `source: language-of-motion`.

**Fake #2 is retired.** The hash collision described above — the one that made the SnapMoGen
and Kimodo panels identical row for row — applies to none of the three any more. The
triptych compares three real models, which is what it claimed to do from v0 and could not do
until today.

Two qualifications remain, and the triptych states both on screen rather than here:

- In **fixture mode** (no worker configured) every panel is still a hash of the prompt, and
  everything in this document applies in full.
- Language of Motion returns real motion but **barely travels** — see the Stage E log in
  [`v3-models.md`](v3-models.md). That is an observation about the model, not a fixture
  artefact, and the difference matters: a fixture is a thing we made up, while this is a
  measurement.

| Fake | Retired by | State |
|---|---|---|
| #1 the prompt hash | the model reading the prompt | ✓ for all three |
| #2 the triptych's model signature | three actual models | ✓ as of Stage E |
| #3 the ghost-cloud perturbation | asking the model for *n* samples | ✓ for all three |

### What is real about SnapMoGen, and what to be careful of

Measured on the RTX 5080, 2026-08-24, and none of it is a stub:

- Bone-length coefficient of variation **0.0075–0.0154%** across all 21 bones — the check
  that validates the joint map.
- "A person is walking confidently" travels **4.20 m** in 5 s and its ghost-cloud siblings
  spread **0.26–1.30 m** apart. That is a model interpreting a prompt, not a hash.

Three things a reader must know before drawing a conclusion from it:

1. **A poetic prompt gets very little movement out of it.** "a body remembers a place it
   cannot return to" returns a body that barely moves — 0.03 m of travel and a **0.03 m**
   wrist span, against 3.95 m and 3.95 m for "A person walks forward and turns around."
   SnapMoGen was trained on literal, expressive descriptions of physical action. It does not
   fail loudly on anything else; it returns a person standing nearly still.

   **This is not a SnapMoGen defect, and the first version of this note wrongly implied it
   was.** Measured across five prompts, *both* real models articulate less for poetic
   phrasing than for literal instruction — Kimodo gives the same phrase a 0.18 m wrist span,
   also nearly nothing. SnapMoGen is the more literal of the two, but the tendency is shared.

   Two scalars over five prompts is an **observation, not a result**. It is exactly the
   question the instrument was built to ask, and answering it properly is research, not
   another commit.
2. **A short line is answered by a longer motion.** SnapMoGen will not generate below 128
   frames (4.27 s), so a 2-second poem line is answered by 4.27 seconds. `frames_asked` and
   `frames_used` are both recorded.
3. **Feet penetrate the floor by up to 4.5 cm** while walking. Kimodo's zero comes from its
   post-processing pass; SnapMoGen's equivalent (its GlobalRegressor) is not wired up yet,
   and `provenance.post_processing` says `false` accordingly.

Its rig is also **not metric** — the rest-pose head joint sits at 93.08 rig units — so the
worker scales it by a stated convention, measured from the rig at load time and recorded in
each motion as `rig_scale`. Read as centimetres it would be an 0.85 m body, which the Laban
score would read as a permanent crouch.
| #4 identity rotations | a model that emits them |

The one thing v1 must not do is return **rendered video**. Several hosted motion-generation
APIs do exactly that, and a video cannot be fed to the renderer, the ghost-cloud, or any of
the four registers — it would throw away the entire instrument this repo is. **v1 needs
joints.**
