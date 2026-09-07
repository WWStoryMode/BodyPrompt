/**
 * Taking the session apart to store it, and putting it back.
 *
 * The browser's copy keeps the poem in pieces — one small record for the lines and their
 * ratings, one record per motion — because cloning a rating corpus whole costs 769 ms of
 * the thread that draws the body, and it was being paid on every keystroke.
 *
 * These are the tests for the seam that split creates. Everything else in `autosave.ts` is
 * a database call that fails loudly and says so; this pair fails quietly, by handing back a
 * poem with somebody's movements missing from it.
 *
 * Run with `npm test` (Node runs TypeScript directly; no test runner is installed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { join, split } from "./autosave.ts";
import { Poem } from "./poem.ts";
import { toSession } from "./session.ts";
import type { CanonicalMotion } from "./types.ts";

function motion(seed = 1, frames = 4): CanonicalMotion {
  return {
    schema: "bodyprompt.motion/v0",
    skeleton: "smpl-22",
    fps: 30,
    joints: [],
    edges: [],
    frames: Array.from({ length: frames }, () => ({ positions: [], rotations: [] })),
    prompt: "x",
    model: "kimodo",
    seed,
  };
}

/** A poem with the shapes that matter: a current motion, a history, a rating, and a bake. */
function worked(): Poem {
  const poem = new Poem(["first", "second"]);
  const [one, two] = poem.all;
  poem.recordDraft(one.id, motion(1));
  poem.setRating(one.id, 3);
  poem.recordDraft(one.id, motion(2)); // the rated take becomes history
  poem.recordDraft(two.id, motion(3));
  poem.recordBake(motion(9, 12));
  return poem;
}

/** Store it and read it back, exactly as a reload does. */
function through(poem: Poem) {
  const { record, motions } = split(toSession(poem));
  return join(record, new Map<string, unknown>(motions));
}

test("every motion comes back where it was", () => {
  const { session } = through(worked());

  assert.equal(session.poem.lines[0].motion?.seed, 2);
  assert.equal(session.poem.lines[0].history[0].seed, 1);
  assert.equal(session.poem.lines[1].motion?.seed, 3);
  assert.equal(session.poem.baked?.seed, 9);
});

test("what is stored beside the poem holds no motions at all", () => {
  // The whole point: this is the record rewritten on every rating, and cloning it must not
  // cost what cloning a corpus costs.
  const { record, motions } = split(toSession(worked()));

  assert.equal(motions.size, 4); // two current, one history, one bake
  assert.equal(JSON.stringify(record).includes('"frames"'), false);
  assert.equal(JSON.stringify(record).includes("$motion"), true);
});

test("ratings and provenance ride with the poem, not with the motions", () => {
  const poem = worked();
  (poem.all[0] as { meta: unknown }).meta = { cue: "PB1", promptLevel: "O" };

  const { session } = through(poem);

  // These are what change while rating, and they must be in the record that is cheap to
  // write — otherwise the split has bought nothing.
  assert.equal(session.poem.lines[0].historyRatings[0]?.value, 3);
  assert.deepEqual(session.poem.lines[0].meta, { cue: "PB1", promptLevel: "O" });
});

test("a line with nothing generated stays a line with nothing generated", () => {
  const poem = new Poem(["written but never drafted"]);

  const { session } = through(poem);

  assert.equal(session.poem.lines[0].motion, null);
  assert.deepEqual(session.poem.lines[0].history, []);
  assert.equal(session.poem.baked, null);
});

test("a record written before the split is read without a migration", () => {
  // Version 1 of the database stored the session whole, motions inline. Those records are
  // still there after the upgrade, and must open rather than come back empty.
  const whole = toSession(worked());

  const { session } = join(whole, new Map());

  assert.equal(session.poem.lines[0].motion?.seed, 2);
  assert.equal(session.poem.lines[0].history[0].seed, 1);
  assert.equal(session.poem.baked?.seed, 9);
});

test("a motion that has gone missing leaves an ungenerated line, not a broken one", () => {
  const { record, motions } = split(toSession(worked()));
  const short = new Map<string, unknown>(motions);
  short.delete("motion:1:current");

  const { session } = join(record, short);

  // Better an honest gap than a line still claiming a body nobody can play.
  assert.equal(session.poem.lines[0].motion, null);
  assert.equal(session.poem.lines[1].motion?.seed, 3); // and its neighbour is untouched
});

test("reading the poem back says which motion is in which slot", () => {
  // This is what stops the first save after a reload rewriting all 210 motions it has just
  // finished reading — the exact stall the split exists to remove.
  const { record, motions } = split(toSession(worked()));

  const { slots } = join(record, new Map<string, unknown>(motions));

  assert.deepEqual([...slots.keys()].sort(), [...motions.keys()].sort());
  for (const [key, motion] of motions) assert.equal(slots.get(key), motion);
});

test("a re-drafted line's slot holds the new take, not the old one", () => {
  const poem = new Poem(["first"]);
  const id = poem.all[0].id;
  poem.recordDraft(id, motion(1));
  const before = split(toSession(poem));

  poem.recordDraft(id, motion(2));
  const after = split(toSession(poem));

  // The key is the same both times. Presence alone would leave the browser holding a body
  // the poem has moved on from, which is why the writer compares the motion itself.
  assert.equal(before.motions.get("motion:1:current")?.seed, 1);
  assert.equal(after.motions.get("motion:1:current")?.seed, 2);
  assert.equal(after.motions.get("motion:1:0")?.seed, 1); // the old take, now history
});
