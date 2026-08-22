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

That budget is **not currently met** — 24.7 seconds measured on 2026-08-22, for a reason
the step count cannot fix. See the development log below before treating it as achieved.

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
  "post_processing": true
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
- Errors now use non-2xx responses with a `detail` message.

Canonical motions gain an additive `provenance` object: `source`, `backend`,
`model_version`, `inference_ms`, and `post_processing`. The old `stub` boolean remains for
compatibility. The UI reads `/health` before labeling a model real, fixture, or
unavailable.

`provenance.post_processing` records what the worker reports it actually did, not what was
requested, so the two cannot diverge silently. Fixtures record `null`: no model ran, so
there was nothing to clean up, and no fixture can pass as raw model output.

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
with Kimodo `main` at `1aece8c`.

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
encode is paid four times over. Stepping denoising down would help less than encoding once
and sampling four times, but that would replace the consecutive-seed sibling contract with
batch sampling. Unresolved; the step-count calibration is deferred until it is decided.

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
four ways. Whether the cloud should align siblings at the pelvis is a question about the
instrument, not a bug, and is left open.

### Still requiring work

- Decide whether variants batch into one `num_samples=N` call — the 15-second budget is
  currently missed by 65% — and only then run the 100/75/50/25-step calibration.
- Replace the temporary Kimodo `main` installation reference with `1aece8c`.
- Judge notation readability against real motion, now that the floor path must fit several
  metres of travel and the Laban support column has genuine foot-contact data.
- Decide whether the ghost-cloud aligns siblings at the pelvis.

**v1 has generated real movement, and the canonical motion is anatomically sound.** What
remains is calibration and instrument design, not whether the boundary works. Only output
whose provenance says `source: kimodo` is a model generation; SnapMoGen and Language of
Motion are still fixtures, and the triptych is still not cross-model evidence.
