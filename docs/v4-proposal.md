# v4 — the landscape, before it is a plan

> **A discussion document.** `roadmap.md` defines v4 as *"the public lecture performance
> itself — the search performed live"*, and notes it is the only remaining row that is not
> software. This page lays out what stands between the working instrument and a performed
> one, with honest costs, and names the decisions rather than pre-empting them. Nothing here
> is committed to. Written 2026-08-25.

Two facts shape everything below:

- **The performance is recurrent research, not a deadline.** A date exists, but the lecture
  performance is done continuously as part of the practice. So v4 is not a countdown to one
  night — it is the work of making the instrument *performable repeatedly*. That target
  favours anything making the second performance cheaper than the first over anything that
  gets one show over the line.
- **`lecture-performance.md` already named the gaps** — latency as dramaturgy, rehearsal
  versus honesty, no memory margin, and the fact that nobody has ever used the instrument by
  hand. That page was written so those would be named before v4 was planned rather than
  discovered on the night.

---

## Two kinds of "use it and see", and they are not the same thing

This distinction was not clear in the first draft of this document, and it matters more than
anything else on the page.

|  | **Functional pass** | **Research session** |
|---|---|---|
| Asks | Does the instrument do what it says? | What does the model do with this language? |
| Produces | A defect list | A log of what was found, and what was preferred |
| A bad result is | A bug | **A finding** |
| Cadence | Once, then on change | Continuous — this is the practice |
| Example | Does <kbd>N</kbd> switch scope? Does the caret behave? | Day 1: can text-to-motion generate *dance*, or only body movement? |

**A research session has no defect list.** A prompt that returns a body standing nearly still
is not a failure of the instrument; it is the instrument working — reporting something true
about how the model reads that language. Preference can be recorded (*this reading is better
than that one*), and preference is data. But nothing in a research log is a bug, and reading
one as a backlog would quietly convert artistic research into QA.

Both are needed. They should never share a document.

---

## Track 1 — The functional pass

Every check in this repository's history has been a test suite or a `curl`. For an instrument
whose screen **is** the artefact, that is the largest unquantified risk in the project.

Never verified by a person: the v2 Stage B caret handling, the Stage C registers against real
motion, the eight keyboard shortcuts (<kbd>P T R C N G space esc</kbd>), performance mode
under an actual projector, and whether the four notation registers are legible at throw
distance rather than at monitor distance.

- **Cost:** an afternoon on the target machine with all three workers up. No code.
- **Output:** a defect list.
- **Cost of skipping:** Tracks 3 and 4 stay guesswork — every fix in them is currently a fix
  for a problem nobody has confirmed exists.

## Track 2 — The performance must not be able to die

Three small pieces, independent of what any other track finds:

- **A pre-flight check.** There is no `scripts/` directory. One command verifying three
  workers `/health`-ready, `can_stitch_poems` as expected per model, free RAM headroom, motion
  store entry count, and that the frontend builds — failing loudly rather than at 19:58.
- **Boot from a prepared session.** `session.ts` already exports and imports a self-contained
  session, and `main.ts` already has boot flags — but only `?perform`, `?compare`,
  `?registers`. There is **no `?session=`**. Adding one is small and it is the whole safety
  net: a rehearsed poem, pre-generated, plays with the GPU down and every motion honestly
  labelled `memory · remembered · not regenerated`.
- **The memory decision.** 19.7 of 23 GB with all three models resident; the failure mode
  mid-performance is the OS killing Kimodo. The triptych is the only moment needing all three.
  Two resident plus a cold load for the compare moment trades a hard failure for a slow one —
  but a cold load mid-show is its own dead air. A rehearsal finding, not a code decision.

## Track 3 — What the room actually sees

Known, all owed from v3, all currently judged on a monitor:

- **SnapMoGen's feet pass 4.5 cm through the floor** — its GlobalRegressor is unwired and
  `provenance.post_processing` says `false` accordingly. On a projector at scale an audience
  reads that as *broken*, not as *honest*.
- **Language of Motion barely travels** — 0.09 m against Kimodo's 2.11 m and SnapMoGen's
  3.89 m. Its panel will look near-static beside two travelling bodies. The repo is careful
  that this is *an observation from three prompts and one scalar, not a defect claim* — so
  measuring it is the first step, not fixing it.
- **`asked 150 frames, moved 800`** is correct and is the honest thing to say. Whether it is
  legible from ten metres, and whether an audience reads it as information or as an error
  message, is a projector question.
- **Performance mode was designed on a monitor** — `PERF_BG = 0x07080b`, type size, contrast,
  all chosen at desk distance.

Most of this should wait on Track 1 rather than be built ahead of it.

## Track 4 — Latency as dramaturgy

One correction to `lecture-performance.md` before this is discussed: **the triptych already
reveals progressively.** Each panel loads inside its own async task, so with the service
serialising per provider, the three panels genuinely land at roughly 3.2 s, 9.8 s and 17.2 s
rather than all at seventeen.

So the gap is narrower than it looks. What is missing is that nothing counts up — the panel
footer says `generating…` and then sits. Making the wait legible turns dead air into three
arrivals, and is cheap. Whether it is *desirable* is dramaturgy: a visible timer may make
seventeen seconds feel longer, not shorter.

The alternative is leaning on the motion store, where a rehearsed phrase returns instantly.
That is Track 2's safety net used as a tempo control, and it collides with the honesty rule
on purpose. **A performance decision, not a build.**

## Track 5 — The three presentation forms

All three are wanted: markdown as the machine-readable base, a published page for an
independent reader, and a small deck to present alongside the performance.

The design point that matters more than any of the three: **one source, three renderings.**
`lecture-performance.md` is the source; the page and the deck derive from it. Maintained by
hand as three separate artefacts, in six months the deck claims something the instrument no
longer does — the drift `v0-stub.md` exists to prevent, wearing new clothes. *A screenshot
must never be able to outrun the implementation*, and a slide is a screenshot with ambitions.

## Track 6 — Recurrence, and whether anything accumulates

If the performance recurs, **each performance is a research session that produces data** — the
poem performed, which models answered it, what the room reacted to, which line was rewritten
live and why. Right now nothing accumulates across performances: a session file is exported by
hand and lives wherever the researcher put it. The instrument does not get better for having
been played.

The question is whether v4 keeps a **corpus of performed poems** — and whether that is a
directory of session files with a written log beside them (cheap, honest, no new
architecture) or something the instrument itself knows about (larger, and the natural bridge
to v5's *"others can search too"*). The cheap version is probably right for v4, but the answer
decides whether Track 5's page is a finished document or a growing record.

**The research sessions raise the same question.** Day 1 (below) produces a log; so will Day
2. Whether those accumulate into something readable — a corpus of prompts, readings and
preferences — is the same design decision arriving from the artistic side rather than the
performance side.

**And Day 1 answered part of it immediately.** The triptych's motions cannot be exported —
only the bench poem can, so ten of that day's fifteen motions had no way out of the browser.
The store has them; nothing can hand them back. Recorded in
[`roadmap.md`](roadmap.md#parked-deliberately) with three fixes, the middle one
(`GET /motions/{key}`) being the piece a `?session=` boot flag would need anyway. A comparison
you cannot keep is a comparison you cannot cite.

---

## The decisions to make

1. Does the functional pass go first, alone? Or does code proceed in parallel with it?
2. All three models resident, or two plus a cold load for the compare moment?
3. Does a performance lean on the motion store? Is `remembered · not regenerated` a problem to
   work around, or the best sentence on the screen?
4. Do the three presentation forms derive from one source, or are they three artefacts?
5. Does v4 accumulate — across performances, across research sessions, or neither?
6. Are SnapMoGen's feet and LoM's travel v4 work or v5 work? They are model work; they are also
   the two things most visible on a projector.

## A recommendation, offered as one opinion

Track 1 alone first — an afternoon, no code, and the only thing converting Tracks 3 and 4 from
guesswork into a scoped list. Then Tracks 2 and 5 in parallel; they are independent of each
other and of what Track 1 finds. Track 3 waits on Track 1. Track 4 may cost nothing at all.
Track 6 is decided before Track 5 ships.

Explicitly out of v4: new models, voice and sculpt authoring, and anything resembling v5's
open platform. v4's scarce resource is rehearsal time, not build time.

---

# The research sessions

Running alongside the tracks above, and **not** subordinate to them. These are the reason the
instrument exists.

## Day 1 (2026-08-25) — Can text-to-motion AI generate *dance*, or only body movement?

**Method:** prompts drawn from Pina Bausch's documented rehearsal cues, put to the instrument.

The background reading establishes what makes this a real question rather than a vocabulary
test. From roughly 1978 Bausch stopped giving dancers movement and began **asking questions
and collecting their responses** — around 96 prompts during the creation of *Wiesenland*
(2000) alone. The documented pairs are the interesting part, because of how far the response
sits from the words:

| Bausch's cue | The dancer's response | Distance |
|---|---|---|
| "Sharp turn" | dancers catch and spin one another at speed | low |
| "Trevi Fountain" | a woman hangs backwards over a chair, water poured into her mouth, spat back | medium |
| "Trance" | a trio: one dancer's feet against a wall, two others lifting and lowering her | high |
| "How would you like others to treat you?" | running his fingers through his hair | very high |
| a poem about carrying someone with no feet, who later grows wings | a sweater spread on the floor as a surface to step on; the dancer carried away | very high |

The dancer does not **illustrate the word**. They **make something because of the word**.

That is the hypothesis this session tests, and it sharpens the research question:

> Not *"can the model understand poetic vocabulary?"* but **"what kind of choreographic
> relationship between language and body does the model assume?"** Current text-to-motion
> systems behave as though a sentence describes an observable action. A dancer treats language
> as a question, an attentional device, a sensory fiction, a constraint, a provocation.

The background reading also offers a taxonomy worth keeping, because "poetic prompt" is not
one category — **personal/experiential question** (Bausch), **perceptual question** (Hay),
**somatic metaphor** (Gaga), **stimulus translation** (McGregor), **spatial rule**
(Forsythe), **open score** (Halprin), **real-time editing command** (Nelson). Each changes
something different about the body. The same sentence run through each would produce radically
different movement — from a human. Whether it produces anything different from a model is
exactly the experiment.

**This connects to something the instrument has already reported.** `README.md` records that
both real models move far less for a poetic prompt than a literal one — a 0.03 m wrist span
from SnapMoGen for *"a body remembers a place it cannot return to"* against 3.95 m for *"A
person walks forward and turns around."* That is the same finding approached from the other
side: the model collapses language toward its most statistically recognisable physical action.
Day 1 asks what that means for whether it can make dance at all.

**A candidate measurement**, from the reading: `semantic_distance` — how far the movement sits
from a literal reading of the prompt. Humans routinely score high on it. A model that always
scores low is telling us something specific about its relationship to language, and it is more
interesting than asking whether the motion "matches" the sentence.

**Log:** to be written. No defect list — see the distinction at the top of this page.
