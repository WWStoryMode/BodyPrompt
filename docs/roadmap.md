# Roadmap and open questions

> Moved out of the README so that the README can stay about the research. Nothing here has
> been deleted or shortened — this is the same material, in a place where build-state does
> not compete with the argument.

Framed by research milestone, not by feature.

| Version | Research milestone | State |
|---------|--------------------|-------|
| **v0** | Research proposition + mock interfaces | ✓ done |
| **v0.5** | First functional slice — the search loop runs on **stub** data (schema + renderer + service, no ML) | ✓ done |
| **v1** | Single-model prompting — Kimodo behind the service | ✓ done |
| **v2** | **The poem as score** — the search composed as a poem, each line a prompt, the body carrying from one into the next | ✓ done — generation, editor, and the registers reading a line |
| **v2.5** | **Variance** (ghost-cloud) + the **notation registers** — all four: chronophotograph, strip, floor path, Laban-inspired score | ✓ done |
| **v3a** | **Multi-model triptych** — the comparison instrument (the *comparison* is real; the models are not yet) | ✓ done |
| **v3** | **Three models, honestly** — SnapMoGen and Language of Motion made real, so the triptych finally compares models rather than hashes | ✓ done — all three models real, the poem is kept, the triptych reads a whole poem |
| **v4a** | **Performance mode** — the projectable stage for the lecture-performance | ✓ done |
| **v4** | The public lecture performance itself — the search performed live | |
| **v5** | Open research platform — others can search too | |

The research instruments were deliberately built **before** the model: the whole loop —
prompt → retained search → variance → readable score — already runs on stub data, so v1
only had to swap the stub for a model.

The bridge from v0 to v1 was deliberately split: **v0.5 makes the pipeline real without any
ML** (prompt → service → canonical motion → animated stick figure), so v1 only had to swap
the stub for a model.

**v4 is the only remaining row that is not software.** The projectable stage shipped in v4a;
v4 is the event. See [`lecture-performance.md`](lecture-performance.md).

---

## Parked, deliberately

Building the instruments raised things worth doing that were **not** worth doing yet. They
are recorded here rather than in a branch, so nothing is quietly forgotten and nothing is
quietly half-built.

**From v1 — real generation asked what the stub could not:**

- **Displacement in the ghost-cloud.** Kimodo's siblings travel different distances for one
  prompt (2.31, 3.12, 3.64, 4.77 m), and roughly 75% of the visible spread between them is
  root travel rather than limb difference. **Displacement is real variance and stays in the
  performance view** — how far a body goes is part of how the model read the prompt, not an
  artefact to be normalised away. What remains open is offering *pelvis-aligned* as an
  optional view, so the ~0.15 m of genuine articulation difference can be examined on its own
  when that is the question being asked. An option, never the default.

**From v2 — the poem's unfinished edges:**

- ~~**Persistence.**~~ **Answered in v3 (2026-08-24.)** The question was never "add saving",
  it was *where should a search live* — and the answer taken is **with the researcher**. The
  browser keeps a copy so a reload stops destroying the poem, and an exported **session
  file** is self-contained: every line, every line's history, the bake, and the motions
  themselves, opening on another machine with nothing running. Separately, the service
  remembers each generation, so a seeded request replays **with its model's worker stopped**.
  See [`session-schema.md`](session-schema.md).
- **The ghost-cloud on a baked poem.** Variance is currently a per-line instrument: switch it
  on and drafting one line gives four readings of that line. A bake carries no cloud, because
  four readings of a five-line poem is minutes of generation, and because the model cannot
  re-roll one line on its own. What a *whole-poem* cloud would even mean — four readings of
  the same score, or four different paths through one line — is a design question before it
  is a cost question.
- **Reusing the unchanged head of a re-bake.** Editing line *k* re-runs the whole poem.
  Lines before *k* should return bit-identical, since their seed and inputs are unchanged —
  but that is reasoning from Kimodo's structure, **not something measured**. If it holds, a
  re-bake could reuse them and the cost of an edit would fall to the lines that actually
  changed. Measuring it is the first step, not optimising.
- ~~**A poem in the triptych.**~~ **Done in v3 (2026-08-24).** <kbd>N</kbd> in the triptych
  switches between one line and the whole poem. The answer to "what should a panel do for a
  model that cannot stitch a poem" is **each model at its best, labelled**: Kimodo carries
  each line into the next, SnapMoGen and Language of Motion generate their lines apart, and
  every panel says which it did. Forcing them into a common shape would have switched off the
  only real continuity in the system to make the columns match — the asymmetry *is* the
  comparison.

**From v3 — what the third model left owed:**

- **Language of Motion's root translation.** It barely travels: 0.09 m on a phrase where
  Kimodo covers 2.11 m and SnapMoGen 3.89 m. Real articulation, almost no displacement. That
  is an observation from three prompts and one scalar, **not a defect claim**, and it is
  consistent with upstream's own unchecked TODO on rotation-format results. Measuring it
  properly is the first step.
- **SnapMoGen's GlobalRegressor pass**, still unwired.
- **Whether a sub-128-frame request should be refused** rather than silently lengthened. This
  carries more weight now that the triptych shows `asked N, moved M` on every panel — the
  label makes the lengthening visible, which is an argument for fixing it rather than for
  considering it handled.

  **Upgraded from a labelling concern to a research one on 2026-08-25.** The second batch of
  the first research session was nine Bausch cues from *Wiesenland*, and Bausch's cues are
  short — *Trance*, *Budapest*, *Danube*, *Yes*. Seven of the nine lines were asked at **2 s
  (60 frames)**. Kimodo and Language of Motion returned exactly 60. SnapMoGen returned **128
  frames — 4.27 s — on every one**, more than double.

  Two consequences, and the second is the serious one:

  - **The measurements stop comparing.** On those seven lines the SnapMoGen panel's `travel`
    and wrist-`span` are inflated by the window alone, so they cannot be read against the other
    two panels. Only per-second quantities survive. A researcher reading that triptych without
    knowing this would draw a false conclusion about which model moves more.
  - **The poem's rhythm is destroyed on that panel.** A nine-line poem of two-second cues has a
    tempo, and tempo is choreographic material — it is *part of the score*, not a request
    parameter. Answering it at 4.27 s a line is not a longer version of the same reading; it is
    a different piece. The label `asked 60, moved 128` is honest and does not prevent this,
    because the distortion is in the artefact rather than in the description of it.

  So the argument has changed shape. It is no longer "the label makes it visible, therefore fix
  it" — it is that **no label can make a wrong tempo right**, and the instrument silently
  rewrites the score of any poem written in short lines. Refusing the request would at least
  let the poem be rewritten deliberately.

  Evidence: `~/BodyPrompt-research/2026-08-25-day1b-wiesenland/` (not in this repo — motions
  are regenerable and exports belong to the writer).
- **Manual browser verification** of the v2 Stage B caret handling and the Stage C registers.
  Every check so far has been a test suite or a `curl`. For an instrument whose screen *is*
  the artefact, that gap is real.

**From v4 — what the first research session asked for:**

- **The triptych's motions cannot be exported.** Found on 2026-08-25, during the first real
  research session, and it is the one thing that session wanted and could not have.

  Export serialises the **bench poem** — `toSession(poem)` in `session.ts`, every line, each
  line's history, the bake, and the motions themselves. That is one model's reading. The
  triptych's motions never enter the poem at all: they go from `fetch` straight into their
  panel renderers (`r.load` / `r.loadSequence` in `main.ts`) and live nowhere else, so closing
  the triptych discards them. Ten of the fifteen motions generated that day — every SnapMoGen
  and Language of Motion reading of the poem — had no export path.

  **The data is not lost.** The service's motion store holds all of it on disk. The gap is
  that nothing can hand it back: the service has exactly three routes (`/health`, `/motions`,
  `/generate`), `/motions` returns metadata only — key, prompt, model, seed, frame count, no
  joint data — and there is **no fetch-by-key**. Re-issuing a byte-identical `POST /generate`
  does return the stored motion with `served_from_store: true`, but every parameter has to be
  reproduced exactly and the browser offers no way to do it.

  Three fixes, smallest first, and they are not alternatives so much as a sequence:

  1. **Read the store from a shell** — recovers a session after the fact. Not the instrument
     doing it, so it helps once and never again.
  2. **`GET /motions/{key}`.** Small, and it makes the store genuinely readable. A `?session=`
     boot flag would need it too, which is the most reuse of the three.
  3. **The triptych's motions kept in the session file.** The real fix, and the largest,
     because it means deciding what a session *is* when it holds three models' readings of one
     poem. That is the accumulation question in
     [`v4-proposal.md`](v4-proposal.md) arriving early, from the artistic side rather than the
     performance side.

  Worth noting *why* this matters beyond convenience: a comparison you cannot keep is a
  comparison you cannot cite. The triptych is the instrument's answer to "how do different
  models interpret the same poetic theme", and until this is fixed that answer exists only for
  as long as a browser tab does.

**Deliberately not doing** — recorded so it is not mistaken for an oversight:

- **Blending the seams between drafted lines.** There is no pose interpolation anywhere in
  the codebase, on purpose. A draft's joins are meant to be visible: smoothing them would
  disguise the exact thing the draft/bake distinction exists to show.

---

## Questions for the research, not the build

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
