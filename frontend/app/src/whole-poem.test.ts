/**
 * What the whole-poem button is allowed to claim.
 *
 * The stake here is not a cosmetic label. The button names the action, and the action
 * decides whether the result is written into `poem.baked` — which travels into every
 * session file the poem is exported to and is read later by people who were not there. A
 * button that called a batch of independent drafts a "bake" would be the one case in this
 * codebase where the instrument asserts a continuity that never happened.
 *
 * Run with `npm test` (Node runs TypeScript directly; no test runner is installed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { wholePoemAction, wholePoemLabel, wholePoemTitle } from "./whole-poem.ts";

test("a model that can stitch a poem bakes it", () => {
  assert.equal(wholePoemAction({ can_stitch_poems: true }), "bake");
  assert.equal(wholePoemLabel("bake"), "Bake whole poem");
});

test("a model that cannot stitch drafts every line instead", () => {
  assert.equal(wholePoemAction({ can_stitch_poems: false }), "draft-all");
  assert.equal(wholePoemLabel("draft-all"), "Draft all lines");
});

test("a model that never said is not assumed able to stitch", () => {
  // `null` is not `false` — but it is not `true` either, and the whole-poem action is the
  // wrong place to find out. Drafting line by line is something every model can answer.
  assert.equal(wholePoemAction({ can_stitch_poems: null }), "draft-all");
  assert.equal(wholePoemAction({}), "draft-all");
  assert.equal(wholePoemAction(undefined), "draft-all");
});

test("the two actions never share a label", () => {
  // The label is the whole notification. If these ever collapsed into one string, a
  // non-stitching model would silently claim a continuous reading on screen.
  assert.notEqual(wholePoemLabel("bake"), wholePoemLabel("draft-all"));
  assert.notEqual(wholePoemTitle("bake"), wholePoemTitle("draft-all"));
});

test("only the bake label says the lines are carried", () => {
  assert.match(wholePoemTitle("bake"), /carried into the next/);
  assert.match(wholePoemTitle("draft-all"), /cannot carry one line into the next/);
  // And the word "bake" never appears on the action that is not one.
  assert.doesNotMatch(wholePoemLabel("draft-all"), /bake/i);
  assert.doesNotMatch(wholePoemTitle("draft-all"), /\bbake\b/i);
});
