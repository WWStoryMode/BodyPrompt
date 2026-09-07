# Day 2 — every prompt, verbatim

The complete prompt record behind [Day 2](2026-09-03-day-2.md): four choreographic
practices, twenty-seven cues, five ladder levels each — **135 distinct prompt strings**,
each generated at three seeds across three models for a total of 1,215 motions.

This document exists because Day 2 ships no session files. The motions live outside the
repository; the prompts are the part a reader needs in order to check the reasoning, or to
run the same ladder against a different model.

What the dancers did with the same cues — where that is documented, and how strongly — is
the companion file: [Day 2 — the documented human responses](2026-09-03-day-2-human-responses.md).
**None of it reached the models.**

## How this file was produced

Not by hand. Every string below is read out of `raw.jsonl` — the record of what was
actually sent to each worker — and checked byte for byte against `prompts-extracted.json`,
which was parsed directly from the original briefs rather than retyped. The generator fails
instead of emitting a document if the two disagree, if a prompt was run that is not in the
brief, or if the nine runs behind any one prompt do not carry identical text.

Two invariants are asserted over all 1,215 records and hold:

- `modelPrompt == userPrompt` on every motion.
- `promptRewriteApplied == false` on every motion.

**No rewriting happened anywhere in this dataset.** The prompts below are exactly what the
models received. The ladder is the researcher's own writing — see §9 of the journal.

## The ladder

| level | name | what it carries |
|---|---|---|
| **O** | Original | the cue as the choreographer transmitted it, or the closest source-derived form |
| **S** | Semantic | its meaning, stated plainly, still without a body |
| **Q** | Body quality | how the body feels or organises itself; no action prescribed |
| **A** | Action description | observable movement, described from outside |
| **E** | Explicit instruction | a sequence of named actions, in order |

Every cue was put to all three models at **seeds 42, 1234 and 5678**, at **8.0 s**,
with no manual selection and no regeneration. Kimodo ran at `denoising_steps=75`
with post-processing on.

---

## Stage 2A — Pina Bausch

7 cues · 35 prompts · **315 motions**

| cue | source | original cue (level O) | status |
|---|---|---|---|
| [PB1](#pb1--wiesenland-2000) | *Wiesenland* (2000) | Trance | `verbatim-cue` |
| [PB2](#pb2--wiesenland-2000) | *Wiesenland* (2000) | Something with strength and energy | `verbatim-cue` |
| [PB3](#pb3--wiesenland-2000) | *Wiesenland* (2000) | How would you like others to treat you? | `verbatim-cue` |
| [PB4](#pb4--wiesenland-2000) | *Wiesenland* (2000) | Kányádi poem about carrying someone who cannot walk and later growing wings | `source-derived-summary` |
| [PB5](#pb5--viktor-1986) | *Viktor* (1986) | Trevi Fountain | `verbatim-cue` |
| [PB6](#pb6--masurca-fogo-1998) | *Masurca Fogo* (1998) | Sharp turn | `verbatim-cue` |
| [PB7](#pb7--wiesenland-2000) | *Wiesenland* (2000) | Desperate longing | `verbatim-cue` |

### PB1 — *Wiesenland* (2000)

`verbatim-cue`

**O · Original**

> Trance

**S · Semantic**

> A person is in a trance, absorbed in an altered state of awareness and only faintly responsive to the world around them.

**Q · Body quality**

> The body feels absorbed and inward, with a distant focus, suspended attention, softened responsiveness, and an uncanny sense of being drawn elsewhere.

**A · Action description**

> The person moves slowly with a distant gaze, pauses unpredictably, sways gently, and lets the arms drift with delayed reactions.

**E · Explicit instruction**

> Stand upright with an unfocused gaze. Slowly sway the torso from side to side, pause, take two slow steps forward, let both arms drift upward, then gradually lower them while remaining distant and unresponsive.

### PB2 — *Wiesenland* (2000)

`verbatim-cue`

**O · Original**

> Something with strength and energy

**S · Semantic**

> Express a strong sense of physical power and energy through the whole body.

**Q · Body quality**

> The body feels powerful, vigorous, expansive, forceful, and continuously energised, with strong muscular commitment and an outward projection of energy.

**A · Action description**

> The person takes strong grounded steps, drives the arms through large movements, expands the chest, and changes direction with force and momentum.

**E · Explicit instruction**

> Stand with the feet apart and bend the knees slightly. Step strongly forward three times while swinging both arms in large arcs, open the chest and arms wide, turn sharply, then finish in a grounded wide stance.

### PB3 — *Wiesenland* (2000)

`verbatim-cue`

**O · Original**

> How would you like others to treat you?

**S · Semantic**

> Consider the kind of treatment, attention, or relationship you would want from other people, and embody that desire.

**Q · Body quality**

> Let the body communicate wanting something from another person through changing qualities of openness, guardedness, tenderness, tension, vulnerability, and expectation.

**A · Action description**

> The person reaches outward toward an imagined other person, draws the hands back toward the body, shifts between approaching and withdrawing, and repeatedly looks toward them.

**E · Explicit instruction**

> Stand facing forward. Reach both hands outward, take one step forward, pause, draw the hands back toward the chest, take one step backward, look forward again, then slowly reach one hand outward once more.

### PB4 — *Wiesenland* (2000)

`source-derived-summary`

**O · Original**

> Kányádi poem about carrying someone who cannot walk and later growing wings

**S · Semantic**

> Imagine carrying someone who cannot walk, and through carrying them gradually feeling as if you are growing wings.

**Q · Body quality**

> The body begins burdened, supportive, grounded, and weighted, then gradually becomes lighter, more open, lifted, expansive, and wing-like.

**A · Action description**

> The person bends and braces as if supporting another person's weight, moves forward under the imagined load, then gradually straightens, opens both arms, and becomes lighter and more expansive.

**E · Explicit instruction**

> Bend the knees and lean the torso forward as if carrying a heavy person. Take three slow weighted steps forward, gradually straighten the legs and spine, raise both arms outward to the sides, lift the chest, and finish standing tall with the arms spread like wings.

### PB5 — *Viktor* (1986)

`verbatim-cue`

**O · Original**

> Trevi Fountain

**S · Semantic**

> Imagine the Trevi Fountain as a bodily state of flowing water, abundance, splashing, cascading movement, and continuous outward release.

**Q · Body quality**

> The body feels fluid, overflowing, rhythmic, cascading, continuous, and constantly releasing energy outward like moving water.

**A · Action description**

> The person ripples through the torso, lets the arms pour outward in repeated flowing arcs, rises and falls through the legs, and repeatedly releases movement away from the body.

**E · Explicit instruction**

> Stand upright and ripple the torso from the chest downward. Sweep both arms upward and outward in a large arc, lower them in a flowing motion, bend and straighten the knees, then repeat the outward arm motion while lifting the chest.

### PB6 — *Masurca Fogo* (1998)

`verbatim-cue`

**O · Original**

> Sharp turn

**S · Semantic**

> A movement changes direction suddenly and decisively, creating a strong sense of abrupt redirection.

**Q · Body quality**

> The body feels precise, fast, angular, abrupt, decisive, and tightly controlled, with sudden directional changes and very little softness.

**A · Action description**

> The person travels forward, abruptly pivots into a new direction, accelerates, stops sharply, and makes another sudden change of direction.

**E · Explicit instruction**

> Take three quick steps forward, plant one foot and turn sharply 180 degrees, take two quick steps in the new direction, stop suddenly, pivot 90 degrees to the side, and finish facing that direction.

### PB7 — *Wiesenland* (2000)

`verbatim-cue`

**O · Original**

> Desperate longing

**S · Semantic**

> A person intensely desires someone or something that feels absent, distant, or unreachable.

**Q · Body quality**

> The body feels pulled outward by desire while simultaneously held back, with urgency, incompleteness, tension, vulnerability, and repeated yearning.

**A · Action description**

> The person reaches strongly toward an imagined point, steps toward it, recoils, draws the hands toward the chest, then reaches outward again with increasing urgency.

**E · Explicit instruction**

> Stand facing forward. Reach the right arm strongly forward and take one step toward it. Pull the arm back to the chest and step backward. Reach both arms forward, lean the torso toward them, pause, then draw the arms back before reaching forward once more.

---

## Stage 2B — Deborah Hay

5 cues · 25 prompts · **225 motions**

| cue | source | original cue (level O) | status |
|---|---|---|---|
| [DH1](#dh1--section-10--comparison-group-hay-section10) | Section 10 — comparison group `Hay-Section10` | The body remains still while joy and sorrow pass across the face; neither should… | `source-derived-score-summary` |
| [DH2](#dh2--section-11--comparison-group-hay-section11) | Section 11 — comparison group `Hay-Section11` | Produce a wordless song combining joy and sorrow; let its rhythm generate movement and… | `source-derived-score-summary` |
| [DH3](#dh3--sections-67--comparison-group-hay-sections6-7) | Sections 6–7 — comparison group `Hay-Sections6-7` | Choose an entrance and destination; enter with an unfamiliar stride and follow one… | `source-derived-score-summary` |
| [DH4](#dh4--section-12--comparison-group-hay-section12) | Section 12 — comparison group `Hay-Section12` | Move across the stage in a straight line while simultaneously erasing the destination. | `source-derived-score-summary` |
| [DH5](#dh5--later-section--comparison-group-hay-latersection-ritual) | Later section — comparison group `Hay-LaterSection-Ritual` | Return in light, tiptoe without disturbing the already-created space, experience space… | `source-derived-score-summary` |

### DH1 — Section 10 — comparison group `Hay-Section10`

`source-derived-score-summary`

> **Representation warning.** Source instruction primarily concerns facial expression; common SMPL-22 representation cannot encode detailed facial change.

> **What each model actually generated.** This differs by model, not by prompt:
>
> - `kimodo` — no face was generated upstream of the SMPL-22 reduction: this model has no facial channel and reports no part decomposition
> - `snapmogen` — no face was generated upstream of the SMPL-22 reduction: this model has no facial channel and reports no part decomposition
> - `language-of-motion` — no face was generated upstream of the SMPL-22 reduction: the worker reports parts_generated=['upper', 'lower']

**O · Original/source-derived score**

> The body remains still while joy and sorrow pass across the face; neither should settle into a complete expression.

**S · Semantic**

> Remain physically still while allowing joy and sorrow to coexist and continually change without resolving into a clearly happy or sad expression.

**Q · Body quality**

> The body is quiet and still while the face remains subtle, unsettled, inward, and continuously shifting between traces of joy and sorrow without completing either emotion.

**A · Action description**

> The person stays almost completely still, keeping the head quiet while small incomplete changes of expression appear and disappear without becoming a full smile or frown.

**E · Explicit instruction**

> Stand still with the arms relaxed and do not step. Keep the head nearly motionless. Begin a slight smile but stop before completing it, soften the expression, begin a slight frown without completing it, then return toward a neutral expression while the rest of the body remains still.

### DH2 — Section 11 — comparison group `Hay-Section11`

`source-derived-score-summary`

**O · Original/source-derived score**

> Produce a wordless song combining joy and sorrow; let its rhythm generate movement and carry the body toward the stage edge.

**S · Semantic**

> Let an imagined wordless song containing both joy and sorrow determine the rhythm of the body, allowing that rhythm to gradually carry the person through space toward an edge.

**Q · Body quality**

> The body responds to an inner rhythm that shifts between joy and sorrow, moving with changing pulses, phrasing, suspension, release, and an evolving sense of direction.

**A · Action description**

> The person begins with small rhythmic movements, lets different parts of the body respond to changing pulses, gradually increases the movement, and travels forward as the rhythm carries the body through space.

**E · Explicit instruction**

> Stand still, then begin a gentle rhythmic pulse through the torso. Let the pulse travel into the shoulders and arms, shift the rhythm between faster and slower movements, then take several steps forward while continuing the changing rhythm and finish near the edge of the available space.

### DH3 — Sections 6–7 — comparison group `Hay-Sections6-7`

`source-derived-score-summary`

**O · Original/source-derived score**

> Choose an entrance and destination; enter with an unfamiliar stride and follow one broad curved pathway ending in a small curl.

**S · Semantic**

> Enter the space in a way that does not feel like your habitual walk, travel toward a chosen destination along one large curve, and let that curve tighten into a smaller curl at the end.

**Q · Body quality**

> The body travels with an unfamiliar and exploratory gait, following a spacious sweeping curve that gradually becomes smaller, tighter, and more contained.

**A · Action description**

> The person enters with an unusual uneven stride, travels forward along a large curved path, continues following the arc across the space, and gradually tightens the pathway into a small circular curl.

**E · Explicit instruction**

> Enter with an uneven unfamiliar walking rhythm. Take several steps while curving gradually to the left in one broad arc. Continue the curved pathway, then reduce the size of the curve into two small tightening circular steps and finish facing inward toward the curl.

### DH4 — Section 12 — comparison group `Hay-Section12`

`source-derived-score-summary`

**O · Original/source-derived score**

> Move across the stage in a straight line while simultaneously erasing the destination.

**S · Semantic**

> Travel toward a destination along a straight pathway while behaving as though the destination is continually disappearing or becoming unknowable.

**Q · Body quality**

> The body travels with a clear directional intention while simultaneously carrying uncertainty, concealment, hesitation, redirection, and an unstable relationship to where it is going.

**A · Action description**

> The person travels generally forward along a straight route but introduces small hesitations, sideways adjustments, changes of focus, and minor deviations while continuing toward the far side.

**E · Explicit instruction**

> Walk forward toward the opposite side in a generally straight line. After two steps, make one small step sideways and return toward the line. Continue forward, briefly turn the head away from the destination, make another small lateral deviation, then continue forward and stop.

### DH5 — Later section — comparison group `Hay-LaterSection-Ritual`

`source-derived-score-summary`

> **Translation uncertainty.** high — at A, E

**O · Original/source-derived score**

> Return in light, tiptoe without disturbing the already-created space, experience space parting, arrive away from centre, then enter a deliberately peculiar imagined ritual and bouncing sequence.

**S · Semantic**

> Move carefully through a space that feels already occupied by previous movement, imagining that the space opens and parts around you, arrive somewhere away from the centre, and then shift into an unfamiliar personal ritual involving bouncing.

**Q · Body quality**

> The body is light, careful, attentive, and spatially sensitive while travelling, then becomes peculiar, buoyant, rhythmic, repetitive, and ritual-like without becoming completely predictable.

**A · Action description**

> The person tiptoes carefully through the space along a changing path, avoids the centre, pauses at a new location, then begins an unusual sequence of small bounces combined with repeated gestures and directional changes.

**E · Explicit instruction**

> Rise onto the toes and take four careful tiptoe steps forward. Curve away from the centre, take three more light steps, and stop. Bend and straighten the knees in three small bounces, make a small turning gesture with both arms, change direction, perform three more bounces, then finish in an off-centre position.

---

## Stage 2C — Ohad Naharin / Gaga

8 cues · 40 prompts · **360 motions**

| cue | source | original cue (level O) | status |
|---|---|---|---|
| [G1](#g1--lena) | **Lena** | Imagine an energetic source between the navel and groin, with movement able to travel… | `source-derived-cue` |
| [G2](#g2--biba) | **Biba** | Stretch and pull the body away from the sitting bones. | `source-derived-cue` |
| [G3](#g3--oba) | **Oba** | Imagine travelling stuff moving through the body. | `source-derived-cue` |
| [G4](#g4--ashi) | **Ashi** | Work on the outside of the feet and let movement be generated from the knees or pelvis. | `source-derived-cue` |
| [G5](#g5--tashi) | **Tashi** | Imagine your feet are glued to the floor. | `source-derived-cue` |
| [G6](#g6--float) | **Float** | Let your bones float inside your flesh, as if the body were floating in a liquid. | `source-derived-cue` |
| [G7](#g7--one-long-rope) | **One long rope** | Imagine your outstretched arms as one long rope rather than two separate arms. | `source-derived-cue` |
| [G8](#g8--quake) | **Quake** | Find and cultivate a quake in the pelvis or centre of the body. | `source-derived-cue` |

### G1 — **Lena**

`source-derived-cue`

> **Representation warning.** Common SMPL-22 representation cannot encode this cue's subject: an energetic source between the navel and groin has no joint-position correlate in SMPL-22

> **Somatic imagery.** at O, S, Q

**O · Original/source-derived cue**

> Imagine an energetic source between the navel and groin, with movement able to travel upward and outward from this centre.

**S · Semantic**

> Imagine that movement begins from a centre deep in the lower torso and is transmitted from there into the rest of the body.

**Q · Body quality**

> The body feels centrally activated, connected, expansive, and continuously energised, with movement seeming to radiate from deep inside the lower torso.

**A · Action description**

> The person initiates movement from the lower torso, lets the pelvis and torso shift first, then allows the movement to continue outward into the shoulders, arms, and upper body.

**E · Explicit instruction**

> Stand with the knees soft. Begin by moving the pelvis and lower abdomen slightly forward and upward. Let that movement continue through the torso, raise both shoulders, extend the arms outward, then return the arms and torso toward the centre before repeating the expansion.

### G2 — **Biba**

`source-derived-cue`

> **Somatic imagery.** at O, S, Q

**O · Original/source-derived cue**

> Stretch and pull the body away from the sitting bones.

**S · Semantic**

> Imagine the sitting bones as a base and allow the rest of the body to lengthen outward and away from them.

**Q · Body quality**

> The body feels lengthened, spacious, elongated, open, and gently pulled away from its pelvic base without becoming rigid.

**A · Action description**

> The person lengthens upward through the spine, reaches the upper body away from the pelvis, and extends the limbs while maintaining a grounded base.

**E · Explicit instruction**

> Stand with both feet grounded and the knees slightly bent. Lengthen the spine upward from the pelvis, raise the chest, reach both arms outward and slightly upward, extend through the fingertips, then return toward neutral while keeping the pelvis grounded.

### G3 — **Oba**

`source-derived-cue`

> **Representation warning.** Common SMPL-22 representation cannot encode this cue's subject: an internal substance travelling through the body is not a joint and cannot be encoded in SMPL-22

> **Somatic imagery.** at O, S, Q

**O · Original/source-derived cue**

> Imagine travelling stuff moving through the body.

**S · Semantic**

> Imagine some undefined material, energy, or impulse travelling continuously from one place in the body to another.

**Q · Body quality**

> The body feels transmissive, connected, mobile, and continuously changing, as if an internal substance is passing through different regions.

**A · Action description**

> The person begins a movement in one part of the body and lets it continue sequentially through neighbouring regions, creating a travelling wave of motion across the body.

**E · Explicit instruction**

> Begin with a small movement of the pelvis. Let the movement continue upward through the abdomen and chest, then into one shoulder, along the arm, and into the hand. Reverse the sequence so the movement travels back through the arm, shoulder, chest, and pelvis.

### G4 — **Ashi**

`source-derived-cue`

> **Representation warning.** Common SMPL-22 representation cannot encode this cue's subject: weight across the outer edge of the foot is not representable: SMPL-22 has one ankle and one foot joint per side and no sole

> **Somatic imagery.** at O, S, Q

**O · Original/source-derived cue**

> Work on the outside of the feet and let movement be generated from the knees or pelvis.

**S · Semantic**

> Let movement begin higher in the pelvis or knees while paying attention to how that movement changes the body's relationship to the outer edges of the feet.

**Q · Body quality**

> The lower body feels connected, grounded, responsive, and laterally aware, with movement passing from the pelvis and knees toward the outer edges of the feet.

**A · Action description**

> The person shifts the pelvis and knees from side to side while keeping the feet grounded, causing the body's weight to move toward the outer edges of the feet.

**E · Explicit instruction**

> Stand with both feet grounded. Bend the knees slightly. Shift the pelvis to the left and allow the knees to follow so the weight moves toward the outer edge of the left foot. Return through the centre, then repeat to the right and continue alternating slowly.

### G5 — **Tashi**

`source-derived-cue`

> **Somatic imagery.** at O, S, Q

**O · Original/source-derived cue**

> Imagine your feet are glued to the floor.

**S · Semantic**

> Move while imagining that the feet cannot leave or slide away from their current positions on the floor.

**Q · Body quality**

> The body feels strongly rooted through the feet while remaining mobile, elastic, twisting, bending, and responsive above the fixed base.

**A · Action description**

> The person keeps both feet planted while bending the knees, shifting the pelvis, rotating the torso, and moving the upper body in different directions.

**E · Explicit instruction**

> Stand with both feet flat and keep them fixed in place. Bend and straighten the knees, shift the pelvis left and right, rotate the torso to each side, lean forward and return upright, while never lifting or stepping either foot.

### G6 — **Float**

`source-derived-cue`

> **Representation warning.** Common SMPL-22 representation cannot encode this cue's subject: bones floating inside flesh is not representable: SMPL-22 is a skeleton with no soft tissue

> **Somatic imagery.** at O, S, Q

**O · Original/source-derived cue**

> Let your bones float inside your flesh, as if the body were floating in a liquid.

**S · Semantic**

> Imagine that the skeleton is buoyant inside the soft tissue of the body and is supported rather than pulled downward by gravity.

**Q · Body quality**

> The body feels buoyant, suspended, soft, continuously mobile, weightless, and gently supported from within.

**A · Action description**

> The person maintains continuous small movements, softly bends and rises through the joints, lets the arms and torso drift, and avoids settling heavily into a fixed position.

**E · Explicit instruction**

> Stand with the knees soft. Slowly bend and straighten the knees without stopping completely, sway the torso gently from side to side, let both arms rise and drift outward, lower them slowly, and continue shifting the body's weight smoothly without becoming still.

### G7 — **One long rope**

`source-derived-cue`

> **Somatic imagery.** at O, S, Q

**O · Original/source-derived cue**

> Imagine your outstretched arms as one long rope rather than two separate arms.

**S · Semantic**

> Treat both arms as parts of one continuous structure extending across the body instead of controlling them as two independent limbs.

**Q · Body quality**

> The upper body feels continuous, connected, elongated, flexible, and uninterrupted from one hand across the shoulders to the other hand.

**A · Action description**

> The person extends both arms and moves them as one connected horizontal structure, allowing one side to rise as the other lowers and letting the movement pass continuously across the shoulders.

**E · Explicit instruction**

> Extend both arms outward to the sides. Raise the left arm while lowering the right arm, then reverse the motion so the right arm rises and the left lowers. Continue passing the movement smoothly from one hand through the shoulders to the other while keeping both arms extended.

### G8 — **Quake**

`source-derived-cue`

> **Somatic imagery.** at O, S, Q

**O · Original/source-derived cue**

> Find and cultivate a quake in the pelvis or centre of the body.

**S · Semantic**

> Imagine a persistent trembling or vibration beginning in the centre of the body and allow yourself to sustain that sensation.

**Q · Body quality**

> The centre of the body feels vibrating, unstable, pulsing, restless, repetitive, and continuously activated.

**A · Action description**

> The person creates a small continuous shaking movement through the pelvis and lower torso while remaining generally in place.

**E · Explicit instruction**

> Stand with the feet apart and knees slightly bent. Shake the pelvis rapidly from side to side with small repeated movements. Let the lower torso respond to the shaking while keeping the feet planted, and continue the pelvic vibration without travelling.

---

## Stage 2D — Simone Forti

7 cues · 35 prompts · **315 motions**

| cue | source | original cue (level O) | status |
|---|---|---|---|
| [SF1](#sf1--huddle) | *Huddle* | Seven to nine people form a tightly connected structure; one person at a time climbs… | `source-derived-score` |
| [SF2](#sf2--slant-board) | *Slant Board* | Negotiate a forty-five-degree inclined board using hanging ropes. | `source-derived-score` |
| [SF3](#sf3--hangers) | *Hangers* | Three performers stand inside hanging rope loops while four other performers walk… | `source-derived-score` |
| [SF4](#sf4--roller-boxes) | *Roller Boxes* | Sit inside a wheeled box while another performer pulls it by an attached rope,… | `source-derived-score` |
| [SF5](#sf5--platforms) | *Platforms* | Two performers hide separately beneath boxes and whistle tones on their exhalations. | `source-derived-score` |
| [SF6](#sf6--see-saw) | *See Saw* | Two performers balance together on a plank mounted on a central support. | `source-derived-score` |
| [SF7](#sf7--censor) | *Censor* | One performer sings while another performer shakes a pot containing nails or screws. | `source-derived-score` |

Each of Forti's scores carries a recorded warning about what the representation
cannot hold. They are reproduced with the cues.

### SF1 — *Huddle*

`source-derived-score`

> **Representation warning.** Requires multiple interacting bodies, bodily contact, supporting weight, and climbing over other performers. Common SMPL-22 output represents only one body.

> **Single-body projection.** at A, E

> **Translation uncertainty.** high — at E

**O · Original/source-derived score**

> Seven to nine people form a tightly connected structure; one person at a time climbs over the group and then rejoins it.

**S · Semantic**

> A group of connected bodies continually supports one another while one person negotiates their way across and over the shared structure before becoming part of it again.

**Q · Body quality**

> The body feels connected to other bodies, weight-bearing and weight-sharing, continuously adjusting, searching for support, yielding, gripping, climbing, and regaining stability.

**A · Action description**

> The person shifts weight between the feet, reaches forward as if finding support on other bodies, raises one leg as if climbing over an uneven human structure, transfers weight forward, lowers again, and continues carefully across it.

**E · Explicit instruction**

> Stand with the knees bent. Shift the weight forward, reach both hands ahead as if placing them onto a supporting surface, lift the right knee high, step forward and over the imagined structure, transfer the weight onto the right leg, bring the left leg through, lower the body, then repeat one careful climbing action.

### SF2 — *Slant Board*

`source-derived-score`

> **Representation warning.** Requires an inclined physical surface, gravity relative to that surface, ropes, hand contact, and environmental support.

> **Single-body projection.** at A, E

> **Translation uncertainty.** high — at E

**O · Original/source-derived score**

> Negotiate a forty-five-degree inclined board using hanging ropes.

**S · Semantic**

> Move across a steep inclined surface while using suspended ropes for support, continually finding positions that prevent the body from slipping or falling.

**Q · Body quality**

> The body feels gravitationally challenged, suspended, braced, cautious, effortful, and continually reorganised between pulling, leaning, balancing, and resisting a downward slide.

**A · Action description**

> The person leans away from an imagined slope while reaching upward as if holding a rope, shifts weight sideways, pulls with the arms, steps upward, braces, then lowers the body and adjusts position again.

**E · Explicit instruction**

> Lean the torso backward and reach both hands upward as if gripping a hanging rope. Bend the knees, step sideways, pull the arms downward while raising the body, take one step upward, pause in a braced position, then lower slightly and shift sideways again.

### SF3 — *Hangers*

`source-derived-score`

> **Representation warning.** Requires multiple performers, suspended rope loops, body-rope contact, and movement transferred between different people.

> **Single-body projection.** at A, E

> **Translation uncertainty.** high — at E

**O · Original/source-derived score**

> Three performers stand inside hanging rope loops while four other performers walk between them.

**S · Semantic**

> Some bodies remain connected to suspended loops while other bodies move through the spaces between them, allowing movement and contact within the arrangement to affect the whole system.

**Q · Body quality**

> The body feels suspended, gently displaced, responsive to passing contact, unstable but supported, and capable of rocking or swaying in response to forces arriving from outside itself.

**A · Action description**

> The person remains mostly in place as if supported by a hanging loop, receives an imagined sideways contact, rocks away from it, swings gently back through the centre, and continues with small suspended shifts of weight.

**E · Explicit instruction**

> Stand with both feet close together as if the torso is held inside a suspended loop. Shift the torso slowly to the left, allow the body to rock back through the centre to the right, bend the knees slightly, rise again, and continue two gentle side-to-side rocking motions without travelling.

### SF4 — *Roller Boxes*

`source-derived-score`

> **Representation warning.** Requires a wheeled container, external pulling force, another performer, seated riding, environmental translation, and vocal sound.

> **Single-body projection.** at A, E

> **Translation uncertainty.** high — at E

**O · Original/source-derived score**

> Sit inside a wheeled box while another performer pulls it by an attached rope, producing a sustained vocal tone while travelling.

**S · Semantic**

> The body is carried through space by an external force it does not control while remaining seated and sustaining a continuous vocal action.

**Q · Body quality**

> The body feels transported, externally accelerated, unstable, reactive, seated, and continually adjusting to unpredictable changes in direction and momentum.

**A · Action description**

> The person remains in a low seated position while the torso reacts as if the whole body is being pulled unpredictably through space, leaning backward, sideways, and forward in response to changing momentum.

**E · Explicit instruction**

> Hold a low seated posture. Lean the torso backward as if suddenly pulled forward, return toward the centre, tilt sharply to the left, recover, tilt to the right, then brace the torso forward while remaining seated throughout.

### SF5 — *Platforms*

`source-derived-score`

> **Representation warning.** Requires concealment beneath an object, two performers, breathing and whistled sound. Detailed breathing and sound are not represented by common SMPL-22.

> **Single-body projection.** at A, E

> **Translation uncertainty.** high — at E

**O · Original/source-derived score**

> Two performers hide separately beneath boxes and whistle tones on their exhalations.

**S · Semantic**

> A concealed performer remains physically restricted while repeated exhalations produce sound, creating an action organised primarily by breathing rather than by travelling movement.

**Q · Body quality**

> The body feels contained, hidden, quiet, breath-led, minimal, cyclical, and organised through repeated expansion and release rather than large movement.

**A · Action description**

> The person remains crouched in a confined position, makes only small movements through the chest and torso as if breathing deeply, subtly rises during inhalation, and softens downward during exhalation.

**E · Explicit instruction**

> Crouch low and remain in place. Slowly expand the chest and lift the torso slightly as if inhaling. Pause, then soften the chest and lower the torso slightly as if exhaling. Repeat the small rising and lowering cycle three times without standing or travelling.

### SF6 — *See Saw*

`source-derived-score`

> **Representation warning.** Requires two bodies whose weight changes affect one another through a shared balancing apparatus.

> **Single-body projection.** at A, E

> **Translation uncertainty.** high — at E

**O · Original/source-derived score**

> Two performers balance together on a plank mounted on a central support.

**S · Semantic**

> Maintain balance on a shared unstable surface where every shift in one person's weight changes the physical conditions for the other person.

**Q · Body quality**

> The body feels weight-sensitive, reactive, unstable, attentive, suspended between rising and falling, and continually adjusting in response to another person's changing balance.

**A · Action description**

> The person shifts weight carefully from one foot to the other as if standing on an unstable plank, lowers when one side drops, rises as the opposite side lifts, and repeatedly corrects the torso to maintain balance.

**E · Explicit instruction**

> Stand with the feet apart and knees soft. Shift most of the weight onto the left foot and lower the left side of the body, then transfer slowly onto the right foot and allow the right side to lower. Extend the arms for balance and continue two controlled side-to-side weight transfers without stepping.

### SF7 — *Censor*

`source-derived-score`

> **Representation warning.** Requires two simultaneous performers, a sounding object, repetitive object manipulation, and vocal sound.

> **Single-body projection.** at A, E

> **Translation uncertainty.** high — at E

> **Role projection.** object-shaking performer — at E

**O · Original/source-derived score**

> One performer sings while another performer shakes a pot containing nails or screws.

**S · Semantic**

> Two performers carry out simultaneous sound-producing tasks: one through the voice and the other through repeatedly shaking a weighted container.

**Q · Body quality**

> The body feels repetitive, effortful, rhythmically sustained, and task-focused, with physical action continuing alongside an independent sonic activity.

**A · Action description**

> The person holds an imagined container in both hands and repeatedly shakes it from side to side with a sustained rhythm, allowing the repeated effort to move through the arms, shoulders, and torso.

**E · Explicit instruction**

> Stand with both elbows bent and hold both hands together in front of the torso as if gripping a container. Shake the hands rapidly from left to right six times, pause briefly, shake them up and down six times, then continue side to side while allowing the shoulders and torso to respond to the repeated effort.

---

## Stage 1 — calibration prompts

Not choreographic material. Before any artist cue, each model was given sentences drawn
from **its own published examples** — the kind of sentence it was built to answer — to
confirm the instrument is talking to it correctly: right prompt in, valid motion out,
durations honoured, seeds recorded. 23 motions.

### SnapMoGen / MoMask++ — 8 prompts, seed 42

| id | prompt | asked | got |
|---|---|---|---|
| `S1` | Someone pretends to be a bird taking flight. | 8 s | 8.0 s / 240 f |
| `S2` | Jumps like a frog. | 6 s | 5.867 s / 176 f |
| `S3` | Slipping on ice. | 6 s | 5.867 s / 176 f |
| `S4` | A slow, exaggerated zombie walk. | 8 s | 8.0 s / 240 f |
| `S5` | Tiptoeing across a creaky floor. | 8 s | 8.0 s / 240 f |
| `S6` | Walking like a robot. | 6 s | 5.867 s / 176 f |
| `S7` | Walking proudly like a runway model. | 8 s | 8.0 s / 240 f |
| `S8` | A person is nervously checking their watch repeatedly. | 8 s | 8.0 s / 240 f |

### Language of Motion — 8 prompts, seed 42

| id | prompt | asked | got |
|---|---|---|---|
| `L1` | a man is walking in a circle. | 8 s | 8.0 s / 240 f |
| `L2` | A person is walking normally in a circle | 8 s | 8.0 s / 240 f |
| `L3` | a person walks forward and veers to the left, then stops. | 8 s | 6.4 s / 192 f |
| `L4` | a person jumps up and down on their toes | 6 s | 6.0 s / 180 f |
| `L5` | a person walks backwards slowly. | 6 s | 6.0 s / 180 f |
| `L6` | a person puts their hands on their hips then lowers them | 6 s | 6.0 s / 180 f |
| `L7` | a man picks something up from the left and places it on the right. | 8 s | 8.0 s / 240 f |
| `L8` | a person swings both of their arms in circular motions. | 6 s | 6.0 s / 180 f |

### Kimodo — 7 prompts, seed 1514456258

Run by the researcher in the browser rather than by a driver, and therefore different in
three ways that are recorded rather than smoothed over: the seed is the instrument's own
choice (it exposes no seed control), the batch is **one stitched poem** rather than seven
independent generations, and it ran at `denoising_steps=100` where all of Stage 2 ran at 75.
**These are not step-matched with Stage 2 and no comparison is drawn between them.**

| id | prompt | asked | got |
|---|---|---|---|
| `K1` | A person runs forward and then leaps over an obstacle in front of them | 10 s | 10.0 s / 300 f |
| `K2` | A person picks up an object from low on their left side and places it up high | 10 s | 10.0 s / 300 f |
| `K3` | A person standing in a defensive posture executes a left-leg kick | 8 s | 8.0 s / 240 f |
| `K4` | A person walk forward white carrying a box | 6 s | 6.0 s / 180 f |
| `K5` | A person sets a box onto the ground | 6 s | 6.0 s / 180 f |
| `K6` | A person is casually walking forward slowly | 5 s | 5.0 s / 150 f |
| `K7` | A person walking backward points to the right side with their right hand | 9 s | 9.0 s / 270 f |

K4's prompt carries a typo — *"walk forward white carrying a box"*, where *while* was
meant. It is reproduced exactly as it was sent, not silently corrected.

---

## Totals

| stage | practice | cues | prompts | motions |
|---|---|---|---|---|
| 2A | Pina Bausch | 7 | 35 | 315 |
| 2B | Deborah Hay | 5 | 25 | 225 |
| 2C | Ohad Naharin / Gaga | 8 | 40 | 360 |
| 2D | Simone Forti | 7 | 35 | 315 |
| | **Stage 2 total** | **27** | **135** | **1,215** |
| 1 | calibration | — | 23 | 23 |

Each Stage 2 prompt accounts for nine motions: three models × three seeds.

## Where the motions are

Outside this repository, in five directories totalling 870 MB — one per stage. Each keeps
the driver that ran it, the prompts parsed from the brief, the seeds, `raw.jsonl` and a
full execution report, so every motion is regenerable from what is recorded. See
[the journal index](README.md).
