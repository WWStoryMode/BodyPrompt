# v1 implementation — Kimodo behind the instrument

This is the working plan and development log for v1. It follows the repository's existing
documentation rule: say what is real, say what is a stand-in, and never let a convincing
screen outrun the implementation behind it.

## The decision

v1 puts **Kimodo-SOMA-RP-v1.1** behind the existing service. Kimodo was chosen over
SnapMoGen for the first integration because it exposes joint positions, local rotations,
seeds and multiple samples directly — the material the renderer, notation registers and
ghost-cloud actually need. SnapMoGen remains an important later comparison because its
training language is unusually expressive.

The researcher's phrase is passed to Kimodo **unchanged**. Kimodo recommends prompts shaped
like “A person…”, but silently rewriting a poetic phrase would introduce a second author
while pretending the original prompt produced the motion.

Target: Linux, an NVIDIA GPU with 8–16 GB VRAM, and the text encoder on CPU. The warmed
budget for one primary plus three variants is under 15 seconds. Denoising is calibrated in
the order 100 → 75 → 50 → 25 steps; the highest setting inside the budget wins.

That budget was missed on 2026-08-22 (24.7 s) and is **met at 75 steps as of 2026-08-23**:
14.77 s warm for four variants, against 19.37 s at 100. Two changes got there — caching the
text embedding, and the step calibration itself. The default remains 100 until the studio
judges 75-step motion by eye; `denoising_steps` is selectable per request.

## Shape of the implementation

```
browser
   ↓  POST /generate (canonical contract)
BodyPrompt service ── fixture backend (any machine)
   ↓ provider HTTP
Kimodo worker (CUDA) → SOMA-name adapter → bodyprompt.motion/v0
```

The CUDA worker is isolated because the research instrument should still open, document and
replay fixture sessions on a machine with no NVIDIA runtime. The provider URL is also the
future remote boundary; v1 implements the local worker, not a hosted deployment.

`compose.yaml` has two operating shapes:

- `docker compose up service` — fixture mode, no CUDA.
- `BODYPROMPT_BACKEND=kimodo docker compose --profile local-gpu up --build` — real Kimodo.

Kimodo's text encoder uses gated `meta-llama/Meta-Llama-3-8B-Instruct` weights. The operator
must accept Meta's terms on Hugging Face and provide a fine-grained read token as `HF_TOKEN`.
The token belongs in the environment, never this repository. Model downloads live in the
named `huggingface-cache` volume.

The encoder is the memory constraint, not Kimodo: in bfloat16 it is roughly 16 GB against
Kimodo's 1.13 GB. `TEXT_ENCODER_DEVICE=cpu` keeps it out of VRAM, and
`TEXT_ENCODER_MODE=api` with `TEXT_ENCODER_URL` moves it to a `kimodo_textencoder` server
on another machine entirely. Both are relocations of the same encoder, not substitutions:
Kimodo's denoiser was trained against these embeddings, so a smaller or different language
model would condition on vectors in an unrelated space and the prompt would stop meaning
anything to the model.

## Public contract changes

`POST /generate` retains `model`, `prompt` and `variants`, and adds:

```json
{
  "duration_seconds": 5.0,
  "seed": 4021,
  "post_processing": true,
  "denoising_steps": 75
}
```

- Duration is 2–10 seconds. The UI exposes it; the default is 5.
- Seed is optional and API-only. Omit it for a fresh search; send the returned seed to
  reproduce a result.
- Variants is 1–4. Real Kimodo siblings use consecutive seeds and never nest.
- Post-processing is Kimodo's foot-skate and constraint cleanup. It defaults to on, as in
  Kimodo's own CLI, because unplanted feet corrupt two of the four notation registers —
  the floor path and the Laban support column read the feet directly. Ask for `false` to
  see the denoiser's raw output. Fixture backends ignore it.
- Denoising steps is optional, 1–500, and defaults to the worker's configured value. It is
  an absolute count of DDIM sampling steps, not a fraction — 100 is Kimodo's own CLI
  default, not a ceiling. Fewer steps takes a coarser path to a fully denoised motion, so
  it changes *which* motion arrives rather than degrading it. Fixture backends ignore it.
- Errors now use non-2xx responses with a `detail` message.

Canonical motions gain an additive `provenance` object: `source`, `backend`,
`model_version`, `inference_ms`, `post_processing`, and `denoising_steps`. The old `stub`
boolean remains for
compatibility. The UI reads `/health` before labeling a model real, fixture, or
unavailable.

`provenance.post_processing` records what the worker reports it actually did, not what was
requested, so the two cannot diverge silently. `provenance.denoising_steps` does the same
for the step count, resolving a request of `null` to the number actually used — a motion
that cannot name its step count is a motion whose ghost-cloud cannot be read, because the
setting displaces the body by a real fraction of what a seed change does. Fixtures record
`null` for both: no model ran, so there was nothing to clean up and no schedule to walk,
and no fixture can pass as raw model output.

## Development log

### 2026-07-28 — implementation started

- Created `feat/v1-kimodo`.
- Added validated duration, seed and variant inputs; canonical response validation; proper
  service errors; provenance; and per-model capability reporting.
- Added hybrid routing: Kimodo goes to the real provider when the `kimodo` backend is
  selected; SnapMoGen and Language of Motion remain fixture outputs.
- Added the isolated Kimodo worker, name-based SOMA reduction, coordinate normalization,
  rotation-matrix conversion, seeded variants, Docker profile and Hugging Face cache.
- Added duration/progress/provenance UI and runtime-derived source labels. The mixed
  triptych now says explicitly that it is not cross-model evidence.
- Added service and adapter tests: all 9 pass. The frontend production build and both
  Python package-install paths also pass in the current workspace.

### 2026-08-22 — first real generation

Ran on the target machine: an RTX 5080 Laptop (16 GB VRAM, Blackwell `sm_120`) under WSL2,
with Kimodo `main` at `1aece8c` — since pinned in the worker Dockerfile, so this remains
the Kimodo every measurement below describes.

**Four assumptions in the 07-28 slice did not survive contact with the release.** Each was
written against the documentation rather than the installed package:

- `Kimodo.__call__` takes `prompts`, not `prompt`.
- Joint names live on `bone_order_names`, not `joint_names`, and must be read from
  `model.output_skeleton` — SOMA models denoise on somaskel30 but return somaskel77, so
  `model.skeleton` names the wrong body.
- `num_samples` must be passed explicitly, even as 1. A bare prompt string with
  `num_samples=None` makes Kimodo squeeze the batch dimension, which `post_process_motion`
  then asserts is present.
- The name aliases did not fit SOMA. Four canonical joints had no resolvable name, and
  three resolved to the *wrong* joint: SOMA's `LeftLeg` is the hip where Mixamo's is the
  knee. One alias table cannot serve both conventions, so SOMA now gets an exact map keyed
  on the skeleton name, and the alias fallback rejects two joints collapsing onto one.

The adapter's honesty boundary did its job here: it refused rather than returning a
plausible-looking wrong body.

**Environment.** cu124 torch has no `sm_120` kernels; the worker is now built on CUDA 12.8
with torch 2.9.1+cu128, verified reporting capability (12, 0). The LLM2Vec text encoder is
Llama-3-8B in bf16 — roughly 16 GB — which fits in neither the card nor WSL's default
memory ceiling, so it runs on CPU with WSL raised to 24 GB. Steady state is ~17 GB RAM and
**1.7 GB VRAM**, confirming Kimodo's "<3 GB with `TEXT_ENCODER_DEVICE=cpu`" claim. Cold
weight download was ~24 minutes for ~18 GB; reload from a warm cache is ~40 seconds.

**The motion is anatomically correct.** Over 150 frames, every one of the 21 canonical
bones holds constant length — maximum coefficient of variation **0.01%**. This is the test
that matters for the joint map: a wrong mapping stretches and shrinks "bones" every frame,
because the pairs are not real skeletal connections. Head height 1.52–1.57 m and travel
along +Z confirm metres, Y-up and Kimodo's default heading, as the adapter assumed.

**Latency at 100 denoising steps**, one 5-second motion: 6.8 s cold, 5.8 s warm — but
**24.7 s for one primary plus three variants, against a 15-second budget**. The cause is
structural, not the step count: `_one()` calls the model once per variant, so the CPU text
encode is paid four times over.

**Resolved on 2026-08-23 by caching the embedding, not by batching.** The obvious fix —
one `model(..., num_samples=4)` call — encodes once but draws all four samples from a single
seeded stream, so a sibling stops being reproducible on its own. Three things already depend
on it not doing that: `docs/motion-schema.md` promises each sibling "its own `seed`",
`lineage.ts` stores that seed per node, and the UI prints it on screen. Trading a true seed
for four seconds would have put a number on the screen that could not reproduce the motion
beside it.

Kimodo ships the alternative. `CachedTextEncoder` (in its `demo` package) wraps the encoder
with an in-memory LRU over a disk cache, and the model calls its encoder at exactly one
place, so it drops in. An embedding is a pure function of its text: reusing it changes
nothing about what is generated. Variants 2–4 skip the CPU encode, and so does any re-run of
a phrase, across restarts — the cache has its own volume. Every seed stays real.

Two details worth keeping: the class lives under `kimodo.demo`, whose `__init__` imports the
viser demo UI that this worker does not install, so it is loaded by file path rather than by
name — safe only because the Kimodo commit is now pinned. And it is a speed-up, so it fails
soft: a worker that cannot cache still generates, and `/health` reports
`text_embedding_cache` beside `text_encoder_device` so a silent fallback cannot pass for a
slow GPU.

**Measured 2026-08-23, and it corrected the diagnosis.** Caching removed ~3 s of a
four-variant run on a new phrase (24.7 s → 20.7 s) and ~6 s on a repeat (18.8 s). Useful,
but not the fix — because the encode was never the dominant cost.

Per-stage, measured by differencing cold/warm and post-on/post-off single runs:

| stage | model | cost | paid |
|---|---|---|---|
| text encode | Llama-3-8B (LLM2Vec, CPU) | ~0.8 s | once per unique phrase, then never |
| denoising, 100 steps | Kimodo (GPU) | ~4.6 s | **every variant** |
| post-processing | Kimodo (MotionCorrection) | ~0.17 s | every variant |

**Kimodo's denoiser is 89% of a four-variant generation; the 8-billion-parameter language
model is 4%.** Per-variant cost is perfectly linear (4.72 / 9.45 / 18.75 s for 1 / 2 / 4),
so nothing but the embedding is shared between siblings.

### Step-count calibration — 2026-08-23

Same prompt, same seed 42, warm embedding. The yardstick is sibling variance: two seeds at
100 steps differ by **0.113 m** pelvis-relative, so that is the scale against which a
step-count change has to be judged.

| steps | 4 variants | vs 15 s budget | divergence from 100 | as % of sibling variance |
|---|---|---|---|---|
| 100 | 19.37 s | missed by 29% | — | — |
| **75** | **14.77 s** | **inside** | 0.008 m | 7% |
| 50 | 9.98 s | 33% under | 0.029 m | 26% |
| 25 | 5.12 s | 66% under | 0.072 m | 64% |

**Fewer steps do not corrupt the motion — they change which motion you get.** Physical
soundness holds everywhere: max bone-length cv 0.008–0.009%, zero foot-through-floor
frames, mean jerk 0.19–0.20 mm at every setting. But at 25 steps the step count displaces
the body by two-thirds of what changing the seed does, which makes it a second, hidden
seed — and a ghost-cloud read against it would be reading its own configuration.

75 is the highest setting inside the budget and diverges from full quality by an order of
magnitude less than a seed change. Whether 75-step motion *reads* as well as 100-step is a
judgement for the studio, not a metric.

Caveat: one prompt, one seed. The divergence figures are indicative, not a distribution.

### Steps as a control

`denoising_steps` is now a request parameter on `POST /generate`, defaulting to `None`
(the worker's configured `BODYPROMPT_DIFFUSION_STEPS`, still 100), and a number box in the
prompt bar taking 1–100 — left empty it sends nothing and the worker decides. The API
accepts up to 500; the box stops at 100 because that is Kimodo's own default and nothing
above it has been calibrated here. Typed values are clamped in the UI rather than sent and
refused, so a typo cannot read as a failed generation. It follows `post_processing`
exactly: meaningless to fixture backends, which
record `None`, and always recorded in provenance as **the count the worker actually used**
— never the absence of a request. Without that, a 25-step motion and a 100-step motion
would be indistinguishable in the record, which given the numbers above would have made
the ghost-cloud unreadable.

It is an absolute count, not a fraction: 100 is Kimodo's own CLI default, not a ceiling.

**Post-processing earns its toolchain.** Same prompt, same seed: raw output puts a toe
through the floor on 13 of 150 frames, post-processed on none.

**Sibling variance does not resemble the stub's.** Measured pelvis-relative, so that travel
does not dominate:

| body part | Kimodo | stub `_WANDER` |
|-----------|--------|----------------|
| spine     | 0.012 m | 0.016–0.020 m |
| head/neck | 0.050 m | 0.035 m |
| wrists    | 0.258 m | 0.070 m |
| elbows    | 0.230 m | 0.050 m |
| knees     | 0.217 m | 0.020 m |
| ankles    | 0.322 m | 0.016 m |

The stub's premise — root and spine barely move, extremities vary a lot — is right for
spine and head and wrong for legs by eleven to twenty times. It damps ankles and knees
hardest, assuming planted feet; Kimodo varies legs *more* than arms, because siblings take
different steps at different moments. Fixture mode is a stand-in rather than a simulation,
so this is recorded rather than corrected.

**Three quarters of sibling divergence is root travel.** For one prompt the four siblings
walked 2.31, 3.12, 3.64 and 4.77 metres. World-space divergence averages 0.72 m but only
0.19 m of that is pose. The ghost-cloud renders siblings in world space, so most of what an
audience sees is bodies standing in different places rather than one intention explored
four ways. That is a question about the instrument, not a bug: the displacement is real
variance and stays in the performance view. An optional pelvis-aligned view is parked
against v2.5 — see the roadmap in README.md.

### Still requiring work

- Judge notation readability against real motion, now that the floor path must fit several
  metres of travel and the Laban support column has genuine foot-contact data.

**v1 has generated real movement, and the canonical motion is anatomically sound.** What
remains is calibration and instrument design, not whether the boundary works. Only output
whose provenance says `source: kimodo` is a model generation; SnapMoGen and Language of
Motion are still fixtures, and the triptych is still not cross-model evidence.
