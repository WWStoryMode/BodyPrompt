# Day 2 — the documented human responses

The other half of the comparison. [Day 2 — every prompt, verbatim](2026-09-03-day-2-prompts.md)
records what the models were given; this file records **what the dancers did**, where that is
documented, and how strongly it is documented.

**27 cues · 32 response records.** The counts differ because five of Deborah Hay's records are
second and third performers answering a score another performer had already answered. Those
extra interpretations are the most valuable evidence here, for the reason given in §"Why the
counts differ" below.

## Read this before using anything in this file

**None of this reached the models.** The documented response was withheld from generation
entirely — it travelled through no channel into any prompt, and the instrument has no channel
it could have travelled through: `POST /generate` accepts a prompt string and nothing else.
That is a structural fact about this build, not a discipline the researcher maintained. If a
historical solution had been allowed into a prompt and the AI had then produced it, the
session would have discovered nothing but its own contamination.

**It is comparison evidence, never ground truth.** The human response is not the correct
answer that a model is being scored against. Bausch's dancers were answering Bausch, in a
rehearsal room, with bodies and each other and a stage. Reading a generated motion as *wrong*
because it differs from Brinkmann is a category error the rating tool must be built to resist.

**The researcher established these records; this file transcribes them.** The primary sources
have not been read in the course of writing this document, and no claim below is independently
verified here. What *has* been checked mechanically is that every cue identifier, work,
section and Gaga term below matches the run records in `raw.jsonl` — see "Cross-check" at the
end.

**No source URLs are recorded yet.** The references were supplied as source names with the
links stripped. Naming a source correctly and inventing its URL are very different acts, so
the link column is empty and marked as owed rather than filled in from memory.

## Evidence labels

Every record carries one, so that the strength of documentation is visible at the moment of
comparison rather than buried in a footnote:

| label | means |
|---|---|
| `direct video` | footage of the response itself is available |
| `written rehearsal account` | a researcher's record of what happened in the room |
| `performance review` | a critic's description of a performance |
| `motion-tracking study` | recorded trajectories, with or without a performer account |
| `written participant account` | someone who was present, writing afterwards |
| `work description` | the piece is documented; this response is not separately attested |
| `insufficient detail` | the source names the answer but does not establish the movement |

`insufficient detail` is not a defect in the record. It marks the cases where a comparison
should not be attempted, which is more useful than a comparison made on too little.

---

## Pina Bausch

7 cues · 7 records · from *Wiesenland* (2000), *Viktor* (1986) and *Masurca Fogo* (1998).

Mostly documented in Gabriele Klein's research, which describes rehearsal responses. **It does
not supply video of the exact response**, so no record in this section is `direct video`.

| cue | performer(s) | what the source establishes | evidence |
|---|---|---|---|
| PB1 | Stephan Brinkmann, Ruth Amarante, Michael Strecker | a constructed trio, described | `written rehearsal account` |
| PB2 | Stephan Brinkmann, Aida Vaineri | a described action | `written rehearsal account` |
| PB3 | Stephan Brinkmann | a scene, not a complete sequence | `written rehearsal account` · `insufficient detail` |
| PB4 | Stephan Brinkmann, Nayoung Kim | a described action | `written rehearsal account` |
| PB5 | an unnamed woman, with men | a described stage image | `work description` |
| PB6 | male dancers | a described action; the cue survived as the scene's name | `work description` |
| PB7 | Stephan Brinkmann | the answer is named, the movement is not | `insufficient detail` |

**PB1 — "Trance."** Ruth lies with her feet against a wall. The two men lift her while her
soles remain in contact with it, straighten her legs, then lower her again. *The response is a
constructed trio, not an individual trance-like dance.*

**PB2 — "Something with strength and energy."** Brinkmann throws tulle dresses high into the
air while Vaineri stands behind him cheering or whooping.

**PB3 — "How would you like others to treat you?"** Brinkmann develops a small scene involving
running and interlacing his fingers through his hair. The account does not establish a
complete movement sequence.

**PB4 — the Kányádi poem.** Brinkmann pulls the back of his sweater over his head, kneels and
spreads it on the floor. Kim steps onto it, stretches across his shoulders, and he carries her
away. **The cue used in generation is a summary of the poem, not a verified verbatim
quotation** — and the run records agree, marking PB4 `source-derived-summary` where the other
six Bausch cues are `verbatim-cue`.

**PB5 — "Trevi Fountain."** A woman hangs backwards over a chair while men pour water into her
mouth. She repeatedly spits it back out, becoming a human fountain.

**PB6 — "Sharp turn."** Male dancers run, catch one another, and spin the caught dancer around
his own axis at high speed.

**PB7 — "Desperate longing."** The rehearsal notebook records the answer as *"kiss with
saltshaker."* There is not enough movement detail in the source to reconstruct the action.

**Source.** Gabriele Klein, *Pina Bausch's Dance Theater: Company, Artistic Practices and
Reception* — the research book (available via SSOAR) is the main source for PB1–PB4; the book
text carries PB5–PB7. Written documentation; **not** confirmed footage of each rehearsal
response. *URL owed.*

---

## Deborah Hay

5 cues · **10 records** · from *No Time to Fly*, performed by Jeanine Durning, Ros Warby and
Juliette Mapp.

The most useful section in the file, because several performers answer the same score
differently.

| cue | performer | what the source establishes | evidence |
|---|---|---|---|
| DH1 | Jeanine Durning | a described facial process | `written rehearsal account` |
| DH1 | Ros Warby | a described facial transformation | `performance review` |
| DH2 | Jeanine Durning | a decision process, not a sequence | `written rehearsal account` |
| DH2 | Ros Warby | a decision process, not a sequence | `written rehearsal account` |
| DH3 | Jeanine Durning | a perceptual process, not a sequence | `written rehearsal account` |
| DH3 | Ros Warby | a perceptual process, not a sequence | `written rehearsal account` |
| DH4 | Jeanine Durning | a tracked trajectory, plus her own account | `motion-tracking study` |
| DH5 | Jeanine Durning | seven recorded takes | `motion-tracking study` |
| DH5 | Juliette Mapp | seven recorded takes | `motion-tracking study` |
| DH5 | Ros Warby | seven recorded takes | `motion-tracking study` |

**DH1 — Section 10, joy and sorrow across the face.**
*Durning:* remains relatively still while small facial changes appear and disappear, treating
joy and sorrow as simultaneously present rather than alternating between two fixed
expressions. *Warby:* a moment of glee briefly settles on her face before being washed away by
sorrow.

This is the cue the session chose as a representational stress test, and the finding is in the
run data: **no model generated face data at all.** Language of Motion reports
`parts_generated=['upper','lower']`; SnapMoGen and Kimodo have no facial channel and report no
part decomposition. The loss is upstream of the SMPL-22 reduction, not caused by it.

**DH2 — Section 11, a wordless song becomes movement.**
*Durning:* tries not to consciously decide when the singing begins — opens her mouth and lets
the body determine the onset, then disrupts anticipated movement images rather than
reproducing them. *Warby:* lets the song emerge from the whole body and follows its changing
curve until a movement form emerges.

**DH3 — Sections 6–7, unfamiliar stride, broad curve, small curl.**
*Durning:* attempts to perceive the curve as already existing in the space before moving.
*Warby:* absorbs the spatial sweep without fixing an endpoint, letting the trajectory find
itself as she travels.

> **DH2 and DH3 describe decision-making, not reproducible movement.** The source establishes
> how each performer chose, not what her body did. The rating tool must keep this visible: a
> generated motion cannot be compared against a process, and any interface that puts the two
> side by side implies a comparison that the evidence does not support.

**DH4 — Section 12, a straight line while erasing the destination.** Durning's tracked
centre-of-body trajectory travels diagonally across the stage but includes many small
deviations and detours. She remains aware of the diagonal while concealing from the audience
where she is going.

**DH5 — a later section: tiptoeing, space parting, ritual and bouncing.** The motion-tracking
study records **seven takes by each performer**. Durning produces large criss-crossing
diagonals, curves and loops; Mapp a more spatially concentrated family of irregular curves;
Warby large looping sweeps and long traversals. The study shows differences both *between*
performers and *across repeated interpretations by the same performer*.

**Sources.** Blades, 2015 doctoral thesis — performer accounts and analysis of *No Time to
Fly*, the main source for DH1–DH3. *Ros Warby Returns*, Fjord Review — the performance review
documenting Warby's facial transformation. A Utrecht University research paper — Section 12,
the trajectory and the performer's account. A Fraunhofer motion-tracking paper — the seven
recorded trajectories each for Durning, Mapp and Warby. *URLs owed; Blades's given name was
not supplied and is not guessed at here.*

---

## Ohad Naharin / Gaga

8 cues · 8 records.

These are demonstrations and class observations, so **the reference is a bodily exploration,
not a fixed choreographic sequence.** There is no "the response" to compare against — there is
a described way of moving.

| cue | term | what the source establishes | evidence |
|---|---|---|---|
| G1 | Lena | an initiation, explored | `direct video` |
| G2 | Biba | a lengthening, explored | `direct video` |
| G3 | Oba | a quality travelling through the body | `direct video` |
| G4 | Ashi | an initiation and a change of foot contact | `direct video` |
| G5 | Tashi | articulation above planted soles | `direct video` |
| G6 | Float | a change of imagined density | `written participant account` |
| G7 | One long rope | a described exploration | `written participant account` |
| G8 | Quake | a described spread through the body | `written participant account` |

**G1 — Lena.** Dancers initiate movement from an imagined central source between navel and
groin, letting energy travel through the body with fluidity. Not a fixed sequence of steps.

**G2 — Biba.** Dancers lengthen away from the sitting bones, creating space and freedom
through the lower spine rather than holding a fixed elongated pose.

**G3 — Oba.** Dancers generate thickness and let softer movement travel through the body,
combining or alternating these qualities within familiar movement vocabulary.

**G4 — Ashi.** Movement initiated in the knees or pelvis travels downward and changes the
contact of the outer edges of the feet with the ground.

**G5 — Tashi.** The soles remain planted while movement develops above and through them,
including ankle and heel articulation rather than stepping away.

**G6 — floating bones, water and honey.** Participants maintain continuous small movement
while imagining the body floating first in water and then in a thicker liquid. The change in
imagined density alters resistance and movement quality.

**G7 — arms as one long rope.** Participants pull the imagined rope across the spine and
articulate the shoulders and arms while changing palm orientation.

**G8 — a quake in the pelvis or centre.** The observed pelvic quake spreads outward until
legs, torso, shoulders, arms, hands and head are involved in whole-body shaking.

**Sources.** The Guggenheim demonstration and video is the strongest starting point for
G1–G5. The Gaga official account covers the floating imagery (G6). A documented workshop
account provides G7–G8 — **a written participant account, not video of those exact
responses.** *URLs owed.*

---

## Simone Forti

7 cues · 7 records · the *Dance Constructions*.

Forti's works are better understood as **rules that generate physical behaviour**. The
reference is usually the functioning of the whole group and apparatus, not one dancer's
isolated movement — which is precisely the difficulty the session recorded for this batch, and
why every Forti prompt carries a representation warning in the run data.

| cue | work | what the source establishes | evidence |
|---|---|---|---|
| SF1 | Huddle | how the structure behaves | `work description` |
| SF2 | Slant Board | how performers negotiate the incline | `work description` |
| SF3 | Hangers | how movement passes through the arrangement | `work description` |
| SF4 | Roller Boxes | how riders and boxes behave | `work description` |
| SF5 | Platforms | a sonic duet with little visible movement | `work description` |
| SF6 | See Saw | continual negotiation of shared weight | `work description` |
| SF7 | Censor | two simultaneous material and sonic tasks | `work description` |

**SF1 — Huddle.** The group continually shifts weight, grips, supports and yields as
individuals climb over the human structure. The sculpture changes in response to each person's
weight and route.

**SF2 — Slant Board.** Performers move sideways, upward and downward, hanging and bracing
while shifting weight and finding possible positions against the incline.

**SF3 — Hangers.** Walkers brush the ropes and bodies; the suspended performers begin rocking,
and movement gradually passes through the arrangement.

**SF4 — Roller Boxes.** The boxes travel unpredictably through the room. Riders sustain vocal
tones, which historically escalated into screaming.

**SF5 — Platforms.** Two performers remain concealed beneath separate boxes. Their breathing
produces alternating silence and overlapping whistles — an unplanned duet with little visible
bodily action.

**SF6 — See Saw.** The movement arises from continual negotiation of shared weight and
balance. One person's shift changes the other person's physical conditions.

**SF7 — Censor.** The simultaneous tasks produce changing bodily effort, sound and timing. The
action is generated through the material and sonic task rather than prescribed dance steps.

**Sources.** The MoMA audio guide (*Slant Board* / *Huddle*) and *MoMA Collects: Simone
Forti's Dance Constructions* are the key starting points; the MoMA magazine essay gives
further context on the tasks and their performance histories. **These document the works and
should not be treated as footage of the original 1961 performances.** *URLs owed.*

---

## Why the counts differ

| practice | cues | response records |
|---|---|---|
| Pina Bausch | 7 | 7 |
| Deborah Hay | 5 | **10** |
| Ohad Naharin / Gaga | 8 | 8 |
| Simone Forti | 7 | 7 |
| **total** | **27** | **32** |

The five extra records are Hay's second and third performers answering a score that another
performer had already answered — and DH5's tracking study goes further, recording *seven takes
each* from three performers.

That surplus is the most argumentative evidence in the file. **The same score does not have
one bodily answer**, and it does not have one even from the same body on the same afternoon.
Any framework that treats the documented human response as the target a model is approaching
has to explain which of Durning's seven takes is the target — and there is no principled
answer. This sits directly under Day 2's finding that specificity is a distribution rather
than a staircase: the variation is not noise around a correct response, it is the thing being
studied.

## What this file is owed

- **Source URLs**, for every reference above. Named but not linked.
- **Blades's given name**, for a correct citation.
- **Page or section numbers** within Klein, Blades and the two tracking papers.
- **Verification against the primary sources.** Nothing here has been checked against the
  original documents in the writing of this file.

## How this should reach the rating tool

The annotation tool proposed in §10 of the journal should show this material in a **historical
reference panel kept separate from the prompt and its five translations** — three fields, in
this order:

1. **Original cue** — the exact quotation, or a clearly marked source-derived summary.
2. **Documented human response** — the movement, the performer, and what the source actually
   establishes.
3. **Evidence and media** — source, page or section, direct video where verified, and the
   evidence label.

Separate, because the moment the reference panel sits inside the prompt panel it starts
reading as the answer. And the evidence label has to be on screen at the moment of rating: a
`motion-tracking study` and an `insufficient detail` record cannot carry the same weight in a
judgement, and a rater who cannot see which one they are looking at will give them the same
weight anyway.

## Cross-check

Every cue identifier, work, section and Gaga term in this file was checked against the
`raw.jsonl` run records for all 1,215 motions. All 27 match. The Bausch works and years match
(`Wiesenland` 2000, `Viktor` 1986, `Masurca Fogo` 1998), Hay's five sections match, all eight
Gaga terms match, and all seven Forti works match.

One agreement is worth naming because the two records were made independently: **PB4 is the
only Bausch cue the run data marks `source-derived-summary`** rather than `verbatim-cue`, and
the reference material says, separately, that the Kányádi cue is a summary of the poem rather
than a verified verbatim quotation.
