# The architecture that supports the research

> Moved out of the README so the README can stay about the research. Nothing here has been
> deleted — but the build-state markers **have been corrected**: the README carried this
> section unchanged since v0.5 and still described the per-model adapters as *not built* and
> the service as a fixture stub. Both stopped being true in v3.

An *adapter pattern* — **model → adapter → canonical skeleton → notation renderer** — chosen
so that the research, not any one model, stays at the centre.

- ✓ **Canonical motion schema** — a reduced 22-joint SMPL-family skeleton (positions +
  rotations per frame). Every model *down-maps* into it, so each model is a reduction, not
  a re-invention — which is what makes cross-model comparison meaningful.
  → [`motion-schema.md`](motion-schema.md), [`../fixtures/`](../fixtures/).
- ✓ **Stick-figure renderer** (three.js) — plays a canonical motion as notation (joints,
  bones, trails, orbit camera), with the variance **ghost-cloud** overlaid.
  → [`../frontend/app/`](../frontend/app/).
- ✓ **The research instruments** — the **poem** (each line a prompt, each keeping its own
  revisions rather than being replaced), and the **legible reduction**: four notation
  registers — a Marey chronophotograph, a per-limb notation strip, a top-down floor path,
  and a Laban-inspired score — all derived from the joint trajectories, none of them
  complete on its own.
  → [`src/poem.ts`](../frontend/app/src/poem.ts),
  [`src/notation.ts`](../frontend/app/src/notation.ts).
- ✓ **Inference service** (FastAPI) — `POST /generate {model, prompt} → canonical motion`.
  Since v3 this is a **router**, not a stub: it holds a registry of providers and delegates.
  The fixtures are still there and still serve any model that is not configured.
  → [`../service/`](../service/).
- ✓ **Per-model adapters** — SnapMoGen, Language of Motion and Kimodo → canonical. All three
  built; each worker owns its own adapter and returns canonical motion rather than
  model-native tensors. → [`../inference/`](../inference/).
- ✓ **Three models behind the service** — all real as of v3 (2026-08-24), each behind its own
  worker, each anatomically verified. → [`v3-models.md`](v3-models.md),
  [`v1-implementation.md`](v1-implementation.md).

## The v3 split — hosting, routing, remembering

Three concerns that were fused inside the original `KimodoGenerator` and now are not:

| Concern | Question it answers |
|---|---|
| **Hosting** | *where does this model live* — a local container, or a remote endpoint |
| **Routing** | *which model does this request go to* — the dropdown, the triptych |
| **Remembering** | *what do we keep* — independent of which model is loaded, or whether any is |

The reason for the split is not tidiness. Building the architecture around one laptop's
memory ceiling would bake a temporary limitation into a permanent structure; a local worker
and a GPU somewhere else now differ by a URL and nothing else.

**Remembering is separate from hosting.** The service keeps every generation, keyed by
everything that decided it, so a seeded request replays *with its model's worker stopped*. A
motion served that way is the same generation, not a new one: it carries
`served_from_store: true`, keeps its original `generated_at`, and its `inference_ms` is
never refreshed into a lie about how fast the model is.

## Layout

```
docs/abstract.md              the accepted abstract — the canonical framing
docs/architecture.md          this file
docs/roadmap.md               versions, parked items, open questions
docs/lecture-performance.md   the live performance this is all built for
docs/motion-schema.md         the exchange-format spec
docs/session-schema.md        the exported session file
docs/usage.md                 how to use the tool — every view, control and shortcut
docs/v0-stub.md               what is still faked — the complete honesty inventory
docs/v1-implementation.md     Kimodo: local-GPU setup and measurements
docs/v3-models.md             SnapMoGen and Language of Motion: verification and findings
docs/screenshots/             the four screenshots in the README (real model output)
fixtures/                     canonical motion JSON (hand-authored) + generator
service/                      FastAPI /generate router (uv)
inference/                    the three model workers, one directory each
frontend/app/                 Vite + three.js — the live instrument
frontend/mockups/             the original static mockups (reference)
```

**Stack:** three.js + TypeScript + Vite (frontend, pnpm); Python + FastAPI (service and
workers, uv); Docker Compose for the GPU workers; the canonical motion JSON as the exchange
format. React is deliberately deferred.

---

## Quick start — fixture mode

This is the recommended first run. It needs no GPU, Hugging Face account or model
downloads. Two processes are used: the service (serves hand-authored fixture motions) and
the app (renders them). Needs **Python 3.10+ with [uv](https://docs.astral.sh/uv/)** and
**Node 18+ with [pnpm](https://pnpm.io/)**.

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

📖 **[`usage.md`](usage.md) is the full guide** — every view, every control, every
keyboard shortcut, and how to read each of the four notation registers.

---

## Running the real models

Real inference requires:

- Linux with an NVIDIA GPU (target: 8–16 GB VRAM), working drivers and NVIDIA Container
  Toolkit;
- for Kimodo, access to the gated `meta-llama/Meta-Llama-3-8B-Instruct` repository on
  Hugging Face and a fine-grained Hugging Face read token;
- for SnapMoGen, its checkpoints under Snap Inc.'s non-commercial research licence;
- for Language of Motion, its checkpoints **and** the MPI-gated SMPL-X body model, which is
  behind a human registration and is not this repository's to redistribute.

Copy `.env.example` to `.env`, point each model at its worker, and add the token as
`HF_TOKEN`. **Do not put the token directly in a shell command or commit `.env`.**

```
BODYPROMPT_MODEL_KIMODO=http://kimodo-worker:8010
BODYPROMPT_MODEL_SNAPMOGEN=http://snapmogen-worker:8011
BODYPROMPT_MODEL_LANGUAGE_OF_MOTION=http://lom-worker:8012
LOM_SMPLX_HOST=/path/to/dir/containing/smplx/SMPLX_NEUTRAL_2020.npz
```

Routing is **per model**: a URL is a worker, `fixture` is the hand-authored stub, and a
worker on this machine and one on a remote GPU are configured identically — so a model stays
a fixture by saying nothing about it. (`BODYPROMPT_BACKEND=kimodo` still works and is
translated into the same thing.) See
[`usage.md`](usage.md#where-each-model-comes-from).

```bash
docker run --rm --gpus all \
  nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi

docker compose --profile local-gpu up --build

# In another terminal:
curl http://localhost:8000/health
```

The frontend is not part of Compose; start it separately with `pnpm dev`. The first worker
start downloads large model files into the persistent `huggingface-cache` Docker volume.
**Avoid `docker compose down -v`** unless you intend to delete that cache.

A usable health response has `"ml":true` and, per model, `"ready":true`. **Only output whose
runtime provenance names a model is real model output** — `source: kimodo`,
`source: snapmogen`, `source: language-of-motion`. `source: fixture` is a hand-authored
stand-in, whatever the dropdown says. Each model is real only when its own worker is
configured and up; `/health` answers that per model rather than for the service as a whole.

### Memory, measured

All three models resident on one 16 GB RTX 5080 workstation, 2026-08-24:

| | RSS | VRAM |
|---|---|---|
| Kimodo | 16.7 GB | *(shares the 3.9 GB total)* |
| SnapMoGen | 1.7 GB | |
| Language of Motion | 1.3 GB | |
| **total** | **19.7 of 23 GB** | **3.9 of 16 GB** |

**RAM is the ceiling, not VRAM,** and there is no room for a fourth thing. Start the two
cheap workers first and Kimodo last, so Kimodo loads into what is left rather than racing
them:

```bash
docker compose up -d service snapmogen-worker lom-worker
docker compose up -d kimodo-worker
```

Latency, same machine, 5 s of motion: SnapMoGen 3.2 s, Kimodo 9.8 s, Language of Motion
17.2 s. One Kimodo prompt plus a ghost-cloud takes about 19 seconds at the default 100
denoising steps, or under 15 at 75 — the step count is a control in the prompt bar, and every
motion records which was used.

This is not a production-supported route: it wants a GPU, gated repositories and roughly
18 GB of downloads. What remains open is written up in
[`v1-implementation.md`](v1-implementation.md) and [`v3-models.md`](v3-models.md). See
[the full usage guide](usage.md#running-the-v1-kimodo-backend-experimental) for setup,
verification and troubleshooting.
