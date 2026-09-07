# Day 2 — the documented human responses

The other half of the comparison. [Day 2 — every prompt, verbatim](2026-09-03-day-2-prompts.md)
records what the models were given; this file records **what the dancers did**, where that is
documented, how strongly, and where to read the source.

**27 cues · 32 response records · 12 sources.** The counts differ because five of Deborah
Hay's records are second and third performers answering a score another performer had already
answered — see "Why the counts differ".

## Read this before using anything in this file

**None of this reached the models.** The documented response was withheld from generation
entirely — it travelled through no channel into any prompt, and the instrument has no channel
it could have travelled through: `POST /generate` accepts a prompt string and nothing else.
That is a structural fact about this build, not a discipline the researcher maintained. If a
historical solution had been allowed into a prompt and the AI had then produced it, the
session would have discovered nothing but its own contamination.

**It is comparison evidence, never ground truth.** These are reference interpretations, not
the correct answer a model is being scored against, and not the only correct response to the
cue. Bausch's dancers were answering Bausch, in a rehearsal room, with bodies and each other
and a stage. Reading a generated motion as *wrong* because it differs from Brinkmann is a
category error the rating tool must be built to resist.

**The researcher established these records; this file transcribes them.** The primary sources
have not been read in the course of writing this document, and the URLs below are recorded as
supplied — they have not been fetched or checked to resolve. What *has* been checked
mechanically is that every cue identifier, work, section and Gaga term matches the run records
in `raw.jsonl` — see "Cross-check" at the end.

**One attribution is unresolved.** SF6, *See Saw*, has no confirmed source: see the Forti
section. It should not be used as comparison evidence until that is settled.

## Evidence labels

Every record carries one, so that the strength of documentation is visible at the moment of
comparison rather than buried in a footnote:

| label | means |
|---|---|
| `direct video` | footage is available of the movement described |
| `rehearsal account` | a researcher's record of what happened in the room |
| `performer account` | the dancer's own account of what she was doing |
| `review` | a critic's description of a performance |
| `motion-tracking study` | recorded trajectories, with or without a performer account |
| `official account` | the practice's own published description |
| `participant account` | someone who was present, writing afterwards |
| `museum documentation` | the work is documented by the institution holding it |
| `insufficient detail` | the source names the answer but does not establish the movement |
| `source unconfirmed` | the attribution itself is not yet established |

The last two are not defects in the record. They mark the cases where a comparison should not
be attempted, which is more useful than a comparison made on too little.

---

## Pina Bausch

7 cues · 7 records · from *Wiesenland* (2000), *Viktor* (1986) and *Masurca Fogo* (1998).

Documented in Gabriele Klein's research, which describes rehearsal responses. **It does not
supply video of the exact response**, so no record in this section is `direct video`.

| cue | source | performer(s) | what the source establishes | evidence |
|---|---|---|---|---|
| PB1 | *Wiesenland* (2000) | Stephan Brinkmann, Ruth Amarante, Michael Strecker | a constructed trio, described | `rehearsal account` |
| PB2 | *Wiesenland* (2000) | Stephan Brinkmann, Aida Vaineri | a described action | `rehearsal account` |
| PB3 | *Wiesenland* (2000) | Stephan Brinkmann | a scene, not a complete sequence | `rehearsal account` · `insufficient detail` |
| PB4 | *Wiesenland* (2000) | Stephan Brinkmann, Nayoung Kim | a described action | `rehearsal account` |
| PB5 | *Viktor* (1986) | an unnamed woman, with men | a described stage image | `rehearsal account` |
| PB6 | *Masurca Fogo* (1998) | male dancers | a described action; the cue survived as the scene's name | `rehearsal account` |
| PB7 | *Wiesenland* (2000) | Stephan Brinkmann | the answer is named, the movement is not | `insufficient detail` |

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
away. **The cue used in generation is a source-derived summary of the poem, not a verified
verbatim prompt** — and the run records agree, marking PB4 `source-derived-summary` where the
other six Bausch cues are `verbatim-cue`.

**PB5 — "Trevi Fountain."** A woman hangs backwards over a chair while men pour water into her
mouth. She repeatedly spits it back out, becoming a human fountain.

**PB6 — "Sharp turn."** Male dancers run, catch one another, and spin the caught dancer around
his own axis at high speed.

**PB7 — "Desperate longing."** The rehearsal notebook records the answer as *"kiss with
saltshaker."* The available account does not provide sufficient movement detail for reliable
reconstruction.

> **Source.** Gabriele Klein, *Pina Bausch's Dance Theater: Company, Artistic Practices and
> Reception* — scholarly research book, covering rehearsal processes, choreographic questions
> and documented dancer responses. Supports PB1–PB7.
> Open-access PDF: <https://www.ssoar.info/ssoar/bitstream/handle/document/92475/ssoar-2020-klein-Pina_Bauschs_Dance_Theater_Company.pdf?isAllowed=y&lnkname=ssoar-2020-klein-Pina_Bauschs_Dance_Theater_Company.pdf&sequence=1>
> Alternative book text: <https://dokumen.pub/pina-bauschs-dance-theater-company-artistic-practices-and-reception-9783839450550.html>

---

## Deborah Hay

5 cues · **10 records** · 4 sources · from *No Time to Fly*, performed by Jeanine Durning, Ros
Warby and Juliette Mapp.

The most useful section in the file, because several performers answer the same score
differently. The Hay sources are also the most varied in kind — performer accounts, critical
observation and motion-tracking data — and **should not all be treated as direct video
documentation.**

| cue | performer | source | what the source establishes | evidence |
|---|---|---|---|---|
| DH1 | Jeanine Durning | Blades 2015 | a described facial process | `performer account` |
| DH1 | Ros Warby | Fjord Review | a described facial transformation | `review` |
| DH2 | Jeanine Durning | Blades 2015 | a decision process, not a sequence | `performer account` |
| DH2 | Ros Warby | Blades 2015 | a decision process, not a sequence | `performer account` |
| DH3 | Jeanine Durning | Blades 2015 | a perceptual process, not a sequence | `performer account` |
| DH3 | Ros Warby | Blades 2015 | a perceptual process, not a sequence | `performer account` |
| DH4 | Jeanine Durning | Utrecht | a tracked trajectory, plus her own account | `motion-tracking study` |
| DH5 | Jeanine Durning | Fraunhofer | seven recorded takes | `motion-tracking study` |
| DH5 | Juliette Mapp | Fraunhofer | seven recorded takes | `motion-tracking study` |
| DH5 | Ros Warby | Fraunhofer | seven recorded takes | `motion-tracking study` |

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

> **Sources.**
>
> **Blades 2015** — Hetty Blades, doctoral thesis, Coventry University. Detailed analysis of
> *No Time to Fly*, including performer accounts and strategies for interpreting the score.
> Supports DH1–DH3 and related material.
> <https://pure.coventry.ac.uk/ws/portalfiles/portal/41511826/Blades2015_PhD.pdf>
>
> **Fjord Review** — *Ros Warby Returns*, performance review. Written observation of Warby's
> performance, including the visible transformation between glee and sorrow. Supports DH1.
> <https://fjordreview.com/blogs/all/ros-warby-returns>
>
> **Utrecht** — *Worlds, Dances and the Open Work*, Utrecht University repository. Score
> interpretation, spatial trajectory and performer decision-making. Supports DH4.
> <https://dspace.library.uu.nl/bitstream/handle/1874/341336/worlds.pdf?isAllowed=y&sequence=1>
>
> **Fraunhofer** — motion-tracking study of *No Time to Fly*, Fraunhofer Publica. Compares
> seven recorded performances by Durning, Mapp and Warby, including their differing spatial
> trajectories. Supports DH5.
> <https://publica-rest.fraunhofer.de/server/api/core/bitstreams/20efb687-fc0b-462b-8e61-2e76dd311419/content>

---

## Ohad Naharin / Gaga

8 cues · 8 records · 3 sources.

These are demonstrations and class observations, so **the reference is a bodily exploration,
not a fixed choreographic sequence.** There is no "the response" to compare against — there is
a described way of moving. G1–G5 have a documented demonstration video; **G6–G8 are written
accounts and must not be represented as footage of those exact responses.**

| cue | term | source | what the source establishes | evidence |
|---|---|---|---|---|
| G1 | Lena | Dance In Israel | an initiation, explored | `direct video` |
| G2 | Biba | Dance In Israel | a lengthening, explored | `direct video` |
| G3 | Oba | Dance In Israel | a quality travelling through the body | `direct video` |
| G4 | Ashi | Dance In Israel | an initiation and a change of foot contact | `direct video` |
| G5 | Tashi | Dance In Israel | articulation above planted soles | `direct video` |
| G6 | Float | Gaga People | a change of imagined density | `official account` |
| G7 | One long rope | Parkdale workshop | a described exploration | `participant account` |
| G8 | Quake | Parkdale workshop | a described spread through the body | `participant account` |

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

> **Sources.**
>
> **Dance In Israel** — *Ohad Naharin on Gaga (Video)*. Naharin's Guggenheim demonstration of
> Gaga terminology and movement principles. Supports G1–G5.
> <https://www.danceinisrael.com/2009/02/ohad-naharin-on-gaga-video/>
>
> **Gaga People** — *Gaga and Naharin's Body of Work*, the practice's official article on its
> movement language and somatic imagery, including floating and imagined material resistance.
> Supports G6.
> <https://www.gagapeople.com/en/gaga-and-naharins-body-of-work/>
>
> **Parkdale workshop** — *Free Gaga Dance Workshop at Parkdale Library (16 June 2012)*,
> Breakfast in Scarborough. A first-person participant account of Gaga imagery and movement
> exploration. Supports G7–G8.
> <https://c-raine.com/2012/06/22/gaga-dance-workshop-at-parkdale-library-june-16-2012/>

---

## Simone Forti

7 cues · 7 records · 4 sources · the *Dance Constructions*.

Forti's works are better understood as **rules that generate physical behaviour**. The
reference is usually the functioning of the whole group and apparatus, not one dancer's
isolated movement — which is precisely the difficulty the session recorded for this batch, and
why every Forti prompt carries a representation warning in the run data. These sources
describe rules, apparatus and resulting behaviour; **they are not recordings of the original
1961 performances.**

| cue | work | source | what the source establishes | evidence |
|---|---|---|---|---|
| SF1 | Huddle | MoMA audio guide | how the structure behaves | `museum documentation` |
| SF2 | Slant Board | MoMA audio guide · MoMA collection record | how performers negotiate the incline | `museum documentation` |
| SF3 | Hangers | MoMA Collects | how movement passes through the arrangement | `museum documentation` |
| SF4 | Roller Boxes | MoMA Collects | how riders and boxes behave | `museum documentation` |
| SF5 | Platforms | MoMA Collects | a sonic duet with little visible movement | `museum documentation` |
| SF6 | See Saw | **unresolved** | — | `source unconfirmed` |
| SF7 | Censor | MoMA Magazine | two simultaneous material and sonic tasks | `museum documentation` |

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

**SF6 — See Saw.** *The described response* — two people balance on a plank over a central
support, the movement arising from continual negotiation of shared weight, one person's shift
changing the other's physical conditions — *is recorded, but its source is not.* The original
research table associated See Saw with MoMA's *Slant Board* collection record, and that
pairing has been flagged as needing to be checked before it is used as direct evidence.

> **SF6 is the one cue in this file whose attribution is open.** Until it is settled, See Saw
> has a description with nothing behind it, and it should be excluded from comparison rather
> than allowed to borrow the citation of the work next to it. The generated SF6 motions are
> unaffected — the prompt never depended on this — but the comparison does.

**SF7 — Censor.** The simultaneous tasks produce changing bodily effort, sound and timing. The
action is generated through the material and sonic task rather than prescribed dance steps.

> **Sources.**
>
> **MoMA audio guide** — *Simone Forti: Slant Board / Huddle, 1961*. Documentation and
> explanation of the Dance Constructions, their rules and physical tasks. Supports SF1–SF2.
> <https://www.moma.org/audio/playlist/53/775>
>
> **MoMA Collects** — *MoMA Collects: Simone Forti's Dance Constructions*. Historical
> descriptions of the works and their task-based performance conditions. Supports SF3–SF5.
> <https://www.moma.org/explore/inside_out/2016/01/27/moma-collects-simone-fortis-dance-constructions/>
>
> **MoMA collection record** — *Simone Forti. Slant Board. 1961*. Collection documentation.
> Supports SF2. **Its association with SF6 is unverified** — see above.
> <https://www.moma.org/collection/works/200115>
>
> **MoMA Magazine** — *The Everyday Life of Simone Forti's Dance Constructions*. Historical and
> interpretive context, including sound-producing actions and everyday physical activity.
> Supports SF7 and the wider context.
> <https://www.moma.org/magazine/articles/31>

---

## Why the counts differ

| practice | cues | response records | sources |
|---|---|---|---|
| Pina Bausch | 7 | 7 | 1 |
| Deborah Hay | 5 | **10** | 4 |
| Ohad Naharin / Gaga | 8 | 8 | 3 |
| Simone Forti | 7 | 7 | 4 (one pairing unresolved) |
| **total** | **27** | **32** | **12** |

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

## Evidence at a glance

| evidence | records |
|---|---|
| `direct video` | 5 (G1–G5) |
| `motion-tracking study` | 4 (DH4, DH5 × 3) |
| `museum documentation` | 6 (SF1–SF5, SF7) |
| `rehearsal account` | 6 (PB1–PB6) |
| `performer account` | 5 (DH1 Durning, DH2 × 2, DH3 × 2) |
| `participant account` | 2 (G7, G8) |
| `review` | 1 (DH1 Warby) |
| `official account` | 1 (G6) |
| `insufficient detail` | 2 (PB3 also `rehearsal account`; PB7) |
| `source unconfirmed` | 1 (SF6) |

The column sums to 33 because PB3 carries two labels — a rehearsal account that does not
establish a complete sequence.

**Five of thirty-two records are `direct video`**, and all five are Gaga — where what is filmed
is Naharin demonstrating a term, not a dancer answering a cue. Nothing in the Bausch, Hay or
Forti material is footage of the response itself. Any comparison built on this corpus is a
comparison against *descriptions* of movement, and the rating tool should not let that fact
recede.

## What this file is owed

- **Page or section numbers** within Klein, Blades, and the Utrecht and Fraunhofer papers.
- **A source for SF6, See Saw**, or an explicit decision to exclude it from comparison.
- **Verification against the primary sources.** Nothing here has been checked against the
  original documents in the writing of this file, and the URLs are recorded as supplied
  rather than fetched.

## How this should reach the rating tool

The annotation tool proposed in §10 of the journal should show this material in a **historical
reference panel kept separate from the prompt and its five translations**. Per record:

1. **Cue ID and work / year.**
2. **Original cue** — the exact quotation, or a clearly marked source-derived summary.
3. **Documented performer(s).**
4. **Documented bodily response** — and what the source actually establishes.
5. **Full reference name and URL.**
6. **Evidence type**, from the label set above.
7. **Evidence limitations and any uncertainty.**

Separate, because the moment the reference panel sits inside the prompt panel it starts
reading as the answer. The historical response is for the comparison and rating stage only; it
must never be reachable from anything that composes a prompt. And the evidence label has to be
on screen at the moment of rating: a `motion-tracking study` and an `insufficient detail`
record cannot carry the same weight in a judgement, and a rater who cannot see which one they
are looking at will give them the same weight anyway.

## Cross-check

Every cue identifier, work, section and Gaga term in this file was checked against the
`raw.jsonl` run records for all 1,215 motions. All 27 match. The Bausch works and years match
(*Wiesenland* 2000, *Viktor* 1986, *Masurca Fogo* 1998), Hay's five sections match, all eight
Gaga terms match, and all seven Forti works match.

One agreement is worth naming because the two records were made independently: **PB4 is the
only Bausch cue the run data marks `source-derived-summary`** rather than `verbatim-cue`, and
the reference material says, separately, that the Kányádi cue is a source-derived summary of a
poem rather than a verified verbatim prompt.
