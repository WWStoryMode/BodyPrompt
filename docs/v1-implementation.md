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

## Public contract changes

`POST /generate` retains `model`, `prompt` and `variants`, and adds:

```json
{
  "duration_seconds": 5.0,
  "seed": 4021
}
```

- Duration is 2–10 seconds. The UI exposes it; the default is 5.
- Seed is optional and API-only. Omit it for a fresh search; send the returned seed to
  reproduce a result.
- Variants is 1–4. Real Kimodo siblings use consecutive seeds and never nest.
- Errors now use non-2xx responses with a `detail` message.

Canonical motions gain an additive `provenance` object: `source`, `backend`,
`model_version`, and `inference_ms`. The old `stub` boolean remains for compatibility.
The UI reads `/health` before labeling a model real, fixture, or unavailable.

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

### Still requiring a CUDA machine

- Confirm Kimodo's installed low-level output keys and runtime skeleton-name property
  against v1.1. The adapter intentionally fails if the release does not expose a complete
  named mapping.
- Replace the temporary Kimodo `main` installation reference with the exact tested commit.
- Exercise Hugging Face access, model warm-up, GPU/CPU placement and cache persistence.
- Run the 100/75/50/25-step latency calibration and record the selected value and GPU.
- Inspect real motions for facing, grounding, foot contact, notation readability and
  meaningful sibling variance before calling v1 complete.

Until those checks pass, this branch is **an implemented provider boundary and adapter, not
a claim that BodyPrompt has generated a real movement**.
