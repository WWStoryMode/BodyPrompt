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


---

### 2026-08-24 — Stage B, SnapMoGen (scaffolding; weights pending)

Opened with a spike rather than a Dockerfile, as planned. The spike answered everything
except motion quality; the weights are blocked on a Google Drive rate limit, so what is
built here is everything that does not need them.

#### The joint map, enumerated from the artefact

`utils/A_Pose.bvh` **ships in SnapMoGen's repository**, so the 24-joint hierarchy did not
need the 16.5 GB dataset. The names are Maya bind-joint style — `C_pelvis0001_bind_JNT`,
`L_legUpper0001_bind_JNT` — a **third convention**, which the shared alias table resolves
none of. It gets an exact map, for the reason the SOMA map is exact.

**22 of 24 map cleanly.** Two are dropped: `C_neck0002` (SMPL-22 has one neck joint), and
`ROOT`. The `ROOT` decision was the one real ambiguity — SnapMoGen's `ROOT` parents *both*
the spine and the pelvis, where SMPL-22's pelvis parents the spine *and* the hips, so two
answers were defensible. It dissolved on inspection: **`C_pelvis0001`'s rest offset from
`ROOT` is exactly `[0, 0, 0]`**. They are coincident, so nothing is lost by preferring the
pelvis, which keeps the legs' parent where the canonical edges expect it. Checked, not
assumed.

#### It runs on Blackwell — the largest risk, cleared

SnapMoGen pins `torch==2.4.1` and `numpy==1.24.3`. With both pins lifted, the whole path
runs on **torch 2.9.1+cu128 / numpy 2.2.6 / sm_120**: imports, model construction,
`generate()`, VQ decode, forward kinematics to `(T, 24, 3)`.

It needs exactly one compatibility patch, and it is three lines. `common/animation.py`
imports `numpy.core.umath_tests` — a private *test* module removed in **numpy 1.16**, years
before SnapMoGen's own pinned 1.24.3, so it is broken on their pins too. It is used for one
call to `matrix_multiply`, which is `np.matmul`. The worker installs a shim into
`sys.modules` **before importing**, rather than vendoring a patched fork: a modified copy is
how a repository quietly stops running the model it claims to run.

#### It is far cheaper than Kimodo

| | SnapMoGen | Kimodo |
|---|---|---|
| VRAM | **0.59 GiB** | 1.7 GiB |
| Host RSS | **2.14 GiB** | 16–17.8 GiB |
| Text encoder | T5-base, 109.6M, **on GPU**, 0.20 s | Llama-3-8B, on CPU, 0.8 s |
| One generation | **0.12 – 0.30 s** | ~4.6 s per variant |
| Gated weights | **no** | yes (Llama-3-8B) |

At ~2 GB RSS this worker sits resident beside Kimodo without approaching the ceiling. "Three
models will not fit" was about Kimodo specifically, not about models in general.

The ghost-cloud is nearly free: **four samples of one prompt in one batch, 0.12 s**, and the
siblings differ. The contract differs from Kimodo's though — SnapMoGen seeds globally and
samples stochastically, so one seed gives a reproducible *batch*, not four separately
addressable siblings. Provenance must say that rather than borrow Kimodo's language.

#### Two traps, both guarded

**The decoder always returns the full grid.** Asked for 128 frames or 60, it returns
`(1, 320, 296)` either way; SnapMoGen's own script truncates at the call site. Missed, a
two-second line silently becomes 10.67 seconds and nothing downstream would flag it. The
adapter's `truncate()` does it, and refuses if fewer frames came back than were asked for.

**Below its minimum it degrades rather than refuses.** `min_motion_length` is 128 frames
(4.27 s) and a poem line may be 2 s — but 60 frames generated without error. So the floor is
enforced in the worker where it can be stated, not left to produce quietly untrustworthy
motion. Lengths also quantise to multiples of 8, so a requested 3.0 s can never be exactly
90 frames; `/health` publishes `min_frames`, `max_frames` and `unit_length` so a caller does
not have to guess.

#### A poem is refused, not faked

SnapMoGen has no equivalent of `multi_prompt` — it cannot condition a line on the body the
previous line left. A request carrying `lines` is rejected with a message saying why.
Generating the lines separately and returning them as one motion is exactly the flattery
`segments` and `provenance.multi_prompt` exist to prevent. What the triptych should do with
a poem when only one model can stitch one is **Stage D's** question, and it is a design
question before it is a code one.

#### The shared canonical core

A second worker needed everything around the joint map, so it moved to
`inference/common/bodyprompt_motion`: the 22 joints and edges, the alias fallback, name
resolution, matrix→quaternion, centre-and-ground, schema assembly. Each worker keeps its own
**map**, because the map is model knowledge and it is where the mistakes are.

Kimodo's behaviour is unchanged and proven both ways: 21 tests pass untouched, and the
rebuilt image generates real motion with head at **1.567 m** and max bone-length cv
**0.0077%** — the numbers v1 recorded.

#### What the worker needs, and what it does not

Inference reads **about 5 KB** of the 16.5 GB dataset: `meta_data/mean.npy` and `std.npy`
(2,496 bytes each, shape `(296,)`), fetched straight from the HuggingFace dataset and
committed. The only other dataset read is one BVH used purely for skeleton offsets, and the
repo's own `A_Pose.bvh` appears to substitute — it builds a `Skeleton`, the names come out
exactly as mapped, and forward kinematics runs. **Not yet proven** that its *proportions*
match the training rig; bone-length rigidity against real weights is that test.

There is also a **third checkpoint**: a `GlobalRegressor` (`gmr`) that post-processes global
root translation, loaded separately from the VQ-VAE and the transformer and easy to miss.

#### Status

- 23 worker tests pass: the joint map against SnapMoGen's real 24-joint list, the two
  intended drops and no others, ankle-versus-toe resolution, centimetre→metre scaling,
  travel preserved while the start is normalised, bone rigidity through adaptation, the
  wxyz→xyzw reorder, truncation, and the length rules.
- The image builds and the container starts, sees CUDA, and reports `ready: false` naming
  exactly what is missing.
- **`snapmogen` is still routed to `fixture`.** It stays that way until the weights land and
  the bone-rigidity check passes; flipping it is one environment variable, and it must not
  be flipped before then.

Still needed, all requiring the weights: motion quality, whether sub-128-frame output is
usable, bone-length rigidity (the joint map's real test), head height in metres confirming
the 0.01 scale, and real-weight latency.


### 2026-08-24 — Stage B, SnapMoGen is real

The weights arrived and the worker generates. Measured on the RTX 5080.

#### The A_Pose hypothesis: confirmed, with evidence

Stage B's scaffolding rested on a guess — that the repo's own `utils/A_Pose.bvh` could stand
in for the one BVH the reference script reads out of a 3.51 GB corpus. It can. Rather than
download 3.27 GiB to find out, the archive's central directory was read with HTTP range
requests and the single file pulled out: **212 KiB fetched instead of 3.27 GiB**.

`A_Pose.bvh` and `renamed_bvhs/m_ep2_00086.bvh` have the **same 24 joint names in the same
order**, and their rest offsets agree to within 0.9%. So the worker needs about **5 KB** of
that dataset, and that is now a measurement rather than a hope.

#### The rig is not metric — and bone rigidity could not have told us

Its rest-pose head joint sits at **93.08 rig units**. Read as centimetres — the obvious
reading, and the one the scaffolding shipped with — the body stands **0.85 m** tall. That is
not a person, and the notation registers would read it as a permanent crouch: their
thresholds are calibrated in real metres (a planted foot below 0.08 m, a knee-height ankle
below 0.6 m).

Worth naming the trap: **bone-length rigidity does not validate the skeleton here.** For
Kimodo the positions come from the model, so rigidity proves the joint map. For SnapMoGen
the positions come from forward kinematics over the *template* skeleton, so bones are rigid
by construction whatever scale or template is used. The check still catches a scrambled map;
it cannot catch a wrong-sized rig. Only comparing the head height against a body caught this.

SnapMoGen never claims a unit, so mapping to metres is a **convention**. The worker states
it: scale so the rest-pose head joint lands at `HEAD_HEIGHT_M` (1.60 m, chosen so the two
real models sit within 2% of each other — Kimodo's own output lands at 1.567 m). The factor
is **measured from the rig at load time**, not a constant, and every motion carries it as
`rig_scale`.

#### It works, and it is fast

| | asked | frames | wall clock | bone cv | floor | travel |
|---|---|---|---|---|---|---|
| "A person is walking confidently." | 5 s | 152 | **0.19 s** | 0.0154% | −0.045 m | 4.20 m |
| "a body remembers…" | 5 s | 152 | 0.19 s | 0.0075% | −0.001 m | 0.06 m |
| a 2-second line | 2 s | 128 | 0.19 s | 0.0096% | −0.015 m | 0.04 m |
| ghost-cloud, 4 variants | 5 s | 152 | **0.28 s** | — | — | spread 0.26–1.30 m |

Bone-length cv **0.0075–0.0154%** across all 21 bones, against Kimodo's 0.008% — the joint
map is right. Four ghost-cloud siblings cost 0.28 s in one batch, where Kimodo pays ~4.6 s
per variant.

Two honest imperfections, both recorded rather than hidden:

- **Feet penetrate the floor by up to 4.5 cm** while walking. Kimodo's zero comes from its
  post-processing pass; SnapMoGen's equivalent — the GlobalRegressor that refines root
  translation — is **not wired up**, so `provenance.post_processing` is `false` whatever was
  asked. That is the next piece of work on this worker.
- **A 2-second line is answered by 4.27 seconds** of motion, because the model will not go
  below 128 frames. `frames_asked` and `frames_used` are both in the response.

#### The comparison the triptych was built for, finally real

The same prompts through both models, one service:

| prompt | Kimodo travel / wrist span | SnapMoGen travel / wrist span |
|---|---|---|
| "a body remembers a place it cannot return to" | 0.02 m / 0.18 m | 0.03 m / **0.03 m** |
| "look back, then go" | 0.78 m / 1.21 m | 0.24 m / 0.66 m |
| "the ground remembers" | 0.01 m / 0.24 m | 0.06 m / 0.39 m |
| "A person walks forward and turns around." | 2.11 m / 2.38 m | 3.89 m / **3.95 m** |
| "A person raises both arms above their head." | 0.02 m / 1.15 m | 0.04 m / 0.93 m |

**Both models articulate less for poetic phrasing than for literal instruction**, and
SnapMoGen more so than Kimodo. An earlier draft of this log called that a SnapMoGen defect;
it is not, and the correction matters — the tendency is shared.

It is also **not a result**. Two crude scalars over five prompts is an observation. But it is
the first time this repository has been able to make one at all, because until today two of
the three panels were the same fixture wearing seeded noise.

#### Honesty debt cleared in the same commit

`docs/v0-stub.md` retires fake #1 and #3 for `source: snapmogen`, and downgrades fake #2 from
"the models are not real" to **two of three real**. The README Status section says the same.
`snapmogen` is routed to its worker; **Language of Motion is still a fixture** and says so.

Still owed on this worker: the GlobalRegressor pass, and whether sub-128-frame requests
should be refused rather than silently lengthened.

---

### 2026-08-24 — Stage C, remembering

Hosting and routing came apart in Stage A. This stage takes out the third thing that was
fused with them: **what is kept**.

Until today the instrument kept nothing. A motion existed for as long as the tab that asked
for it, and a generation that took Kimodo forty seconds on a GPU was gone the moment someone
reloaded. That made remembering a property of hosting — you could only ever see a Kimodo
motion while the Kimodo worker was up. Two things now hold it, and they answer different
questions.

#### The motion store — the service remembers a generation

`service/app/store.py`. A motion is written to disk under a key derived from everything that
decided it: model, prompt or lines, seed, variants, duration, denoising steps,
post-processing, transition frames. Plain JSON in a directory, deliberately — a researcher
can `ls` what the instrument remembers, copy one out, or delete one, without this repository
being involved.

Two things are **not** in the key, and both are deliberate. `duration_seconds` is nulled for a
poem, whose lines carry their own; `transition_frames` is nulled for a single prompt, which
has nothing to transition into. Letting an irrelevant control split the key would mean two
identical requests missing each other over a number neither of them used.

**A request with no seed is never served from the store.** It is a request for a new roll, and
a store that answered it would make the ghost-cloud — which is entirely a claim about seeds —
false. Unseeded generations are still recorded; they are just not replayed.

#### The honesty rule, and the lie it forbids

A stored motion is **the same generation, served again**. The flattering lie available here is
specific: a replay reading as a fast model. So `generated_at` and `inference_ms` are the
original run's and are never refreshed, `served_from_store` becomes `true`, and `served_at` is
added so the two moments cannot collapse into one. The stage says `memory · remembered · not
regenerated` beside the seconds, so a screenshot cannot make a disk read look like inference.

`provenance.generated_at` is new in this stage, on every path including the fixtures. Without
it a replay had no original moment to preserve.

#### Measured, with the worker stopped

The verification the plan asked for, run against the real SnapMoGen worker:

| | result |
|---|---|
| First generation, `seed: 7` | 152 frames, `source: snapmogen`, **1451 ms**, `served_from_store: false` |
| Same request again | identical frames, still **1451 ms**, `served_from_store: true`, `served_at` added |
| `docker compose stop snapmogen-worker`, then the same request | **replayed**, still 1451 ms and the original `generated_at` |
| A prompt never generated, worker still stopped | fails honestly: `snapmogen worker unavailable at http://snapmogen-worker:8011` |
| `docker compose restart service`, then the same request | still replayed — the store is a named volume, not a process |

One motion is **262 KB** on disk. The default limit is 500 of them, evicted
least-recently-used; replaying an entry is what makes it worth keeping. Eviction is safe
because a session file carries its own motions, which is the other half of this stage.

#### The session — the writer owns the search

The parked note asked *where a search should live*, and answered nothing, because each answer
says something different about whose it is. v3 answers: **the researcher's**. Two layers,
documented in [`session-schema.md`](session-schema.md):

- **Autosave to the browser**, IndexedDB rather than `localStorage`. Not a preference: one
  five-second motion is a few hundred KB, a poem keeps every line's history, and
  `localStorage` fails by *throwing on write* at ~5 MB — so the poem would autosave happily
  for the first few generations and then silently stop, which is worse than never saving.
- **A session file**, self-contained: every line, every line's history, the bake, and the
  motions themselves. It opens on another machine with nothing running. A pointer into
  someone else's store would not be a copy of anyone's work.

A restore is allowed to change almost nothing. The exceptions exist to stop the restored poem
claiming something untrue: a line caught mid-generation cannot come back spinning forever, and
ids are reseated so a new line cannot collide with a restored one. Whether a bake *is still
the poem* is recomputed from the restored states, so an imported session cannot claim a
continuous reading it did not have.

Two smaller things fell out of it and are worth naming. `StickFigureRenderer.clear()` is new:
replacing the session with one that has nothing generated used to leave the previous poem's
body standing on the stage under the new poem's hint — a body belonging to a sentence nobody
could see. And `renderPoem()` is now the single funnel autosave hangs off, because it is the
one place every mutation of the poem already passes through.

#### What this stage does not do

The instrument does not yet **ask** for a stored motion. Nothing in the UI sends a seed, so
in ordinary use every generation is a fresh roll and the store only ever records. The store is
reachable from the API — `GET /motions` lists what is kept, and re-issuing a request with its
seed replays it — and wiring a UI affordance onto that belongs with the triptych in Stage D,
where showing a stored panel beside a live one is the thing that needs it. Saying so here is
cheaper than a screen that implies a feature nobody can reach.

---

### 2026-08-24 — Stage D, the triptych takes a poem

Stage B left a question open and said so out loud: *what should the triptych do with a poem
when only one model can stitch one?* It called it a design question before a code one, and
it was. The answer taken is **each model at its best, labelled**.

#### The asymmetry is the finding

Kimodo's `_multiprompt` conditions each line on the decoded tail of the line before it, so
its poem is genuinely one continuous motion. SnapMoGen has no equivalent and its worker
refuses a poem outright. Language of Motion is still a fixture.

The alternative was to force everyone to concatenate, so the three columns would be the same
kind of thing. That is a fairer comparison of *interpretation* and it throws away the most
interesting thing in the system: it would switch off the one real capability any of these
models has, to make a table look tidy. **Which model can carry a body from one sentence into
the next is itself the comparison**, and it is close to what the README's parked item
actually asked.

So a model that can stitch is sent the poem; a model that cannot is sent its lines one at a
time and the panel plays them as separate clips — seams visible, nothing interpolated, no
pelvis slid across a join to disguise it. That is deliberately the bench's drafted-poem
behaviour, using deliberately the same words, because it is the same claim.

#### Asked by capability, labelled by provenance

A new `/health` field, `can_stitch_poems`, says whether a poem may be sent to a model at
all. It is a **capability**, and it is carefully not the same thing as `multi_prompt`, which
is a record of what a worker did to one motion. The rule, now pinned by tests:

> **Ask using the capability. Label using the provenance.**

A model that declared it could stitch and then returned unstitched lines is labelled by what
it did. And `null` — a worker that never answered — is asked line by line rather than sent a
poem on a guess: null is not false, but it is not true either, and line-by-line is the
request every model can answer.

The decision lives in `frontend/app/src/triptych.ts`, out of the DOM and under test, for the
same reason `register-view.ts` and `session.ts` do. The triptych is the one view whose entire
purpose is comparison, so a panel that overstates its model does not merely mislabel a clip —
it manufactures a finding.

#### Measured: one poem, three panels

Three lines, 2 s each — 180 frames if honoured exactly:

| panel | continuity | frames | note |
|---|---|---|---|
| Kimodo | **3 lines carried through** | 180 (6.0 s) | exactly what was asked |
| SnapMoGen | 3 lines generated apart | 384 (12.8 s) | asked 180, moved 384 |
| Language of Motion | 3 lines generated apart | 270 (9.0 s) | asked 180, moved 270 · fixture |

SnapMoGen more than doubles the poem's length because each 2 s line is below its 128-frame
floor. The fixture is a third long because **a fixture does not resize to a requested
duration at all** — which was previously invisible, a panel a third longer than its
neighbours with nothing on screen saying why. Both now report `frames_asked` and
`frames_used`, and the panel states the two numbers rather than diagnosing a cause it cannot
know.

The note has a **half-second threshold**, and the threshold is the point: SnapMoGen quantises
to whole units, so a 5 s line comes back as 152 frames instead of 150. Reporting that in
every panel would bury the case that actually matters under a rounding artefact.

#### A stale banner, and why it was stale

The triptych's honesty banner was hard-coded HTML. It read *"SnapMoGen and Language of Motion
remain labeled fixtures"* — and had done for the entire commit in which SnapMoGen stopped
being one. Stage B updated the README and `v0-stub.md` and missed it, because nothing in
TypeScript touched it and nothing could fail.

It is now built from `/health` on every capability refresh, so it says how many of the three
panels are model output and, in poem scope, which models carry a line into the next. A claim
about what is real has to come from the thing that knows.

This is the second time a hard-coded claim has drifted past the code in this repository. The
rule it suggests is worth stating: **a sentence about what the system is must be rendered
from the system, not typed next to it.**

#### Cost is asked for, never triggered

Switching to whole-poem scope does **not** generate. Every line through every model, with
each local worker gated to one at a time, is minutes of GPU; a toggle that spent it would be
a trap. The panels clear and say `press D to read N lines in three models`. One-line scope
still answers the moment the view opens, because it is cheap.

`N` toggles whichever scope is on screen — the triptych's when comparing, the registers'
otherwise.

#### The transport was reporting the wrong body

Found by using it. The transport **controlled** the triptych — play/pause and the scrub bar
both drove all three panels — but **reported the bench**: the counter and the scrub position
came from the hidden bench renderer, which is usually holding a different motion entirely.
With nothing generated on the bench it never emitted at all, so the counter sat blank and the
scrub frozen while three panels visibly played.

There is no shared clock to report instead. A three-line poem is 180 frames of Kimodo and 384
of SnapMoGen, so any frame count is one panel's clock presented as everyone's. What *is*
shared is the **line**: every panel has the same number of them, in the same order. So while
comparing, the transport reads `kimodo · line 2/3 · 48%` — a percentage, a line, and **whose
playhead it is**. The lead panel prefers a real model over a fixture, because a
hand-authored clip's length is an authoring decision and should not put a fixture's clock in
charge of two models.

Each panel also names the sentence its own body is answering, separately, because in poem
scope they genuinely diverge: SnapMoGen floors every line to the same length while Kimodo
honours the durations it was given, so halfway through a poem the two panels can be on
different sentences. One line number across all three would be inventing an agreement they
do not have.

The bench's counter gained the same line number — `line 2/5 · frame 200 / 449 · 30 fps`.

Two smaller faults went with it. Play/pause **toggled each renderer from its own state**, so
a panel that had nothing loaded when the others started would flip to playing exactly when
they stopped; it now sets one state across everything on screen, read from whichever
renderer the transport is reporting, so the button and the counter cannot disagree. And
closing the triptych over a paused bench left a panel's reading on the transport, describing
a body no longer on screen — the bench's last position is now kept and restored on close,
because a renderer only emits while something is moving.

#### `D` did not do what the screen said

The same session found a plainer bug: `D` called `draftLine` directly instead of going
through `draftHere`, so the key never drove the triptych — only the button did. Harmless
while the triptych always generated on open; fatal once poem scope deliberately waits and
puts *press D* on screen, because D was drafting a bench line behind the hidden stage and the
panels stayed blank.

Both keys now route through one path, `B` in the triptych means the whole poem, and the two
bar buttons relabel to **Ask all three** / **Whole poem** so the instruction on screen names
a control that exists. A triptych generation also takes the busy guard the bench has always
had: three models on one line only wasted seconds, but a whole poem is minutes.
