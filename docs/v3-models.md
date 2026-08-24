# v3 — three models, honestly

Working plan and development log for v3. Follows the repository's documentation rule: say
what is real, say what is a stand-in, and never let a convincing screen outrun the
implementation behind it.

## The decision

The triptych has been on screen since v0 and has never been a model comparison. Two of its
three panels are hand-authored fixtures, and [`v0-stub.md`](v0-stub.md) records the
embarrassment precisely: `sum(ord(c))` for `"snapmogen"` and for `"kimodo"` are congruent
mod 5, so those two columns are **identical, row for row**. The instrument asks "how do
different models interpret the same poetic theme?" and cannot currently answer it at all.

v3 makes the other two models real: **SnapMoGen** and **Language of Motion**.

### The reframing that shapes it

The obvious v3 is "fit three models onto one 16 GB laptop". That is the wrong architecture,
and the constraint that suggests it is local. Remote hosting removes the parallelism problem
entirely; and most research sessions use **one** model anyway — the triptych is the
exception, not the rule.

So v3 separates three concerns that v1 fused inside `KimodoGenerator`:

| Concern | Question |
|---|---|
| **Hosting** | *where does this model live* — a local container, or a remote endpoint |
| **Routing** | *which model does this request go to* — the dropdown, the triptych |
| **Remembering** | *what do we keep* — independent of which model is loaded, or whether any is |

Delivered in five stages, one branch each:

- **A — the provider split.** Hosting apart from routing. No new model. *(this branch)*
- **B — SnapMoGen.** The second real model.
- **C — memory.** A motion store, and session persistence.
- **D — the triptych takes a poem.** One line or the whole poem, per-panel honesty.
- **E — Language of Motion.** The third model.

## What the two models actually are

Verified against their repositories on 2026-08-24, before any planning:

| | SnapMoGen | Language of Motion |
|---|---|---|
| Repo | `snap-research/SnapMoGen` (NeurIPS 2025) | `Juzezhang/language_of_motion` (CVPR 2025) |
| Licence | **Snap Inc. non-commercial**, research only | **MIT** |
| Weights | `prepare/download_models.sh`, Google Drive | HuggingFace `JuzeZhang/language_of_motion` |
| Skeleton | **24 joints, not SMPL**; 296-dim features | **SMPL-X**, split face / hands / upper / lower |
| fps | **30** — matches the canonical schema | not confirmed |
| Trained lengths | **4–12 s** | not confirmed |
| Text encoder | **T5-base** (~220M) | multimodal LM; HuBERT / GLM-4-Voice for audio |
| Tested env | Python 3.8.20 | Python 3.10, torch 2.4.0 / cu121 |
| Extra gate | dataset statistics needed for inference | **SMPL-X registration** |

**Both tested environments predate Blackwell.** The RTX 5080 is sm_120 and needs torch ≥2.7
with cu128; cu124 builds do not work. The Kimodo worker already solved this (torch
2.9.1+cu128 on Python 3.10) and both new workers inherit that base. This is the largest
technical risk in v3, which is why stages B and E each open with a throwaway spike rather
than a Dockerfile.

SnapMoGen's non-commercial licence is **accepted for this research** and recorded beside the
model. It would constrain v5's "open research platform" if that ever became commercial.

---

### 2026-08-24 — Stage A, the provider split

No new model. The point of the stage is that a second one becomes possible.

**What v1 actually hard-coded.** `KimodoGenerator` answered three questions at once and
answered the last one twice: a literal list of three dicts in `capabilities()`, and an
`if model != "kimodo": return self._stub.generate(...)` as the first statement of
`generate()`. Both were correct exactly once, for exactly one model. Neither could express
"SnapMoGen is real and Language of Motion is not".

**The split.** `providers.py` owns *where a model lives*; `generators.py` owns *which
provider a request goes to*.

- `WorkerProvider` — one model behind HTTP. **Local and remote are the same class.** A
  Compose container on this machine and a GPU in another building differ by a URL and an
  optional bearer token, and by nothing else.
- `FixtureProvider` — a model that is not real yet, so that "not real yet" is configuration
  rather than a branch inside the router.
- `RouterGenerator` — a `dict[str, ModelProvider]`. `capabilities()` is a loop over the
  registry, so it is truthful **by construction** rather than by remembering to edit it.

**Configuration, not code.** `BODYPROMPT_MODEL_<NAME>` is a URL or `fixture`; `_TOKEN`,
`_HOSTING` and `_CONCURRENCY` are optional companions. Every known model always gets a
provider, so `/health` never has a silent hole in it, and a fourth model can be added by
environment alone. `BODYPROMPT_BACKEND` is translated into the new form so no existing
document, `.env` or command breaks — being explicit wins over it.

**Model version now comes from the worker.** v1 declared `model_version =
"Kimodo-SOMA-RP-v1.1"` as a class constant on the service side. The service does not know
which checkpoint is loaded on the far side of an HTTP boundary, and it certainly will not
know for a remote worker, so it asks: `/health` already reports `model_version`, and the
provider records what came back. This is the same rule as `denoising_steps` and
`multi_prompt` — record what was *done*, never what was *asked* — extended to the one field
that had been exempt from it.

**Concurrency belongs to hosting.** The triptych fires all three requests at once
(`Promise.all`), which is right against three remote endpoints and would exhaust one local
GPU. The browser has no business knowing where the models are today, so the limit is
enforced where the answer is known: a provider declares its concurrency and the router holds
a semaphore per provider. A local worker gets 1. The frontend does not change.

**An unknown model is now a 422, not a 503.** Previously any model string was hashed into a
fixture. A model nothing is configured to serve is a bad request; 503 would tell the caller
to retry something that can never work.

#### Verification

All 13 v1 service tests pass **with their assertions unchanged**. Five of them moved class:
the provenance rules they pin used to live in `KimodoGenerator` and now live in
`WorkerProvider`. The rules did not change, only who keeps them — an earlier draft of this
plan claimed the tests would be untouched, which was wrong, and forcing that would have
meant a worse design.

Ten new tests: the registry built from the environment; a model becoming real by
configuration alone; hosting reported per model and overridable; an unknown model rejected
as a bad request; both legacy translation and explicit-wins-over-legacy; the router choosing
a seed so the motion can name it; and the local gate actually serialising four concurrent
generations down to one at a time.

**The remote path is proven against a real socket**, not asserted: a fake worker on
`127.0.0.1` checks that the bearer token arrives, that the payload is what was asked for,
and that the worker's *own* reported model version reaches provenance. 23 service tests pass.

Live, on the RTX 5080:

- `BODYPROMPT_BACKEND=kimodo` (the legacy form, straight from the existing `.env`) →
  `kimodo` resolves to a local worker, `model_version` reads `Kimodo-SOMA-RP-v1.1` **from
  the worker**, and a 3-second prompt returns 90 frames in 3.2 s at 50 steps with
  `source: kimodo`.
- `BODYPROMPT_BACKEND=stub` with `BODYPROMPT_MODEL_KIMODO` set → the same real Kimodo. The
  per-model variable alone makes a model real, which is the whole claim of the stage.
- `snapmogen` still returns `stub: true`; an unknown model returns 422.
