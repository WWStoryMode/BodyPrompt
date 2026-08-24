/**
 * What a triptych panel is allowed to claim.
 *
 * These matter more than they look. The triptych is the one view whose entire purpose is
 * comparison, so a panel that overstates what its model did does not merely mislabel a
 * clip — it manufactures a finding. Two of the failures pinned here shipped in earlier
 * versions of this view.
 *
 * Run with `npm test` (Node runs TypeScript directly; no test runner is installed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { askFor, continuityLabel, readPanel } from "./triptych.ts";
import type { CanonicalMotion } from "./types.ts";

function clip(
  frames: number,
  provenance?: Partial<NonNullable<CanonicalMotion["provenance"]>>,
): CanonicalMotion {
  return {
    schema: "bodyprompt.motion/v0",
    skeleton: "smpl-22",
    fps: 30,
    joints: [],
    edges: [],
    frames: Array.from({ length: frames }, () => ({ positions: [], rotations: [] })),
    prompt: "x",
    model: "kimodo",
    seed: 1,
    ...(provenance
      ? {
          provenance: {
            source: "kimodo",
            backend: "kimodo",
            model_version: "v1",
            inference_ms: 10,
            ...provenance,
          },
        }
      : {}),
  };
}

test("a poem is only sent whole to a model that says it can carry a line into the next", () => {
  assert.equal(askFor({ can_stitch_poems: true }), "whole");
  assert.equal(askFor({ can_stitch_poems: false }), "line-by-line");
});

test("a model that never said is asked line by line, not sent a poem on a guess", () => {
  // null is not false — but it is not true either, and line-by-line is the request every
  // model can answer. Guessing "whole" would spend a generation discovering a refusal.
  assert.equal(askFor({ can_stitch_poems: null }), "line-by-line");
  assert.equal(askFor({}), "line-by-line");
  assert.equal(askFor(undefined), "line-by-line");
});

test("only a model that actually stitched is described as carrying the poem", () => {
  const stitched = readPanel([clip(450, { multi_prompt: true })], 5);

  assert.equal(stitched.continuity, "carried");
  assert.equal(continuityLabel(stitched), "5 lines carried through");
});

test("lines generated apart say so, however many of them there are", () => {
  const apart = readPanel([clip(90), clip(90), clip(90)].map((c) => c), 3);

  assert.equal(apart.continuity, "apart");
  assert.equal(continuityLabel(apart), "3 lines generated apart");
  assert.equal(apart.frames, 270); // the panel's length is the whole run, not one clip
});

test("a fixture poem is not continuous either", () => {
  // The stub lays fixtures end to end and slides the pelvis to match. It carries segments
  // and reports `multi_prompt: null` precisely so it can never read as a stitched poem.
  const reading = readPanel([clip(300, { source: "fixture", multi_prompt: null })], 4);

  assert.equal(reading.continuity, "apart");
  assert.equal(reading.source, "fixture");
});

test("the label comes from what the model DID, not from what it said it could do", () => {
  // A model may declare `can_stitch_poems: true` and still return unstitched lines. The
  // panel describes the motion in front of it.
  const reading = readPanel([clip(450, { multi_prompt: false })], 5);

  assert.equal(reading.continuity, "apart");
});

test("one line makes no claim about continuity at all", () => {
  const reading = readPanel([clip(150, { multi_prompt: false })], 1);

  assert.equal(reading.continuity, "single");
  assert.equal(continuityLabel(reading), "");
});

test("a model that moved for longer than it was asked to says so", () => {
  // SnapMoGen quantises to whole units and will not go below its own floor, so a 2 s line
  // is answered by 4.27 s of motion. Two panels of different lengths for one poem is a
  // fact about the models, and the panel has to be able to explain itself.
  const reading = readPanel(
    [clip(128, { frames_asked: 60, frames_used: 128 }), clip(128, { frames_asked: 60, frames_used: 128 })],
    2,
  );

  assert.equal(reading.lengthened, true);
  assert.equal(reading.framesAsked, 120);
  assert.equal(reading.framesUsed, 128 + 128);
});

test("a rounding artefact is not reported as the model refusing a length", () => {
  // SnapMoGen quantises to whole units: a 5 s line comes back as 152 frames, not 150.
  // Saying so in every panel would bury the case that actually matters.
  const reading = readPanel([clip(152, { frames_asked: 150, frames_used: 152 })], 1);

  assert.equal(reading.lengthened, false);
});

test("a model that reports no lengths is never described as having honoured one", () => {
  const reading = readPanel([clip(150, { multi_prompt: false })], 2);

  assert.equal(reading.lengthened, false);
  assert.equal(reading.framesAsked, 0);
});

test("an unlabelled motion is 'unknown', never assumed real", () => {
  assert.equal(readPanel([clip(60)], 1).source, "unknown");
  const stub = clip(60);
  stub.stub = true;
  assert.equal(readPanel([stub], 1).source, "fixture");
});
