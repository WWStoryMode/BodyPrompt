/**
 * The poem's rules about what an edit invalidates.
 *
 * These are the tests that stop a stale reading passing for the poem. Everything else in
 * the instrument is visible the moment it is wrong; this is not — a line that should have
 * gone stale and did not looks exactly like a line that is fine.
 *
 * Run with `npm test` (Node runs TypeScript directly; no test runner is installed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { Poem, suggestedDuration } from "./poem.ts";
import { buildTimeline, entryAt } from "./timeline.ts";
import type { CanonicalMotion } from "./types.ts";

function motion(frames = 60, segments?: CanonicalMotion["segments"]): CanonicalMotion {
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
    ...(segments ? { segments } : {}),
  };
}

function baked(poem: Poem): CanonicalMotion {
  const lines = poem.toLines();
  let start = 0;
  const segments = lines.map((line, index) => {
    const length = line.duration_seconds * 30;
    const segment = {
      index,
      prompt: line.prompt,
      start_frame: start,
      end_frame: start + length,
      transition_frames: index < lines.length - 1 ? 5 : 0,
      duration_seconds: line.duration_seconds,
    };
    start += length;
    return segment;
  });
  return motion(start, segments);
}

test("a suggested duration grows with the line but stays performable", () => {
  assert.equal(suggestedDuration(""), 2); // never below the model's floor
  assert.equal(suggestedDuration("a body remembers"), 2);
  assert.equal(suggestedDuration("a body remembers a place it cannot return to"), 6);
  assert.equal(suggestedDuration("word ".repeat(80)), 10); // never above its ceiling
});

test("an explicit duration wins over the suggestion", () => {
  const poem = new Poem(["a body remembers a place it cannot return to"]);
  const line = poem.all[0];

  assert.equal(poem.durationOf(line), 6);
  poem.setDuration(line.id, 3);
  assert.equal(poem.durationOf(line), 3);
  poem.setDuration(line.id, null);
  assert.equal(poem.durationOf(line), 6); // back to following the words
});

test("editing a baked line stales it and everything after — never what came before", () => {
  const poem = new Poem(["first", "second", "third", "fourth"]);
  poem.recordBake(baked(poem));
  assert.deepEqual(poem.all.map((l) => l.state), ["baked", "baked", "baked", "baked"]);

  poem.setText(poem.all[1].id, "second, changed");

  // This is the model's own causality: each baked line is generated from the body the
  // previous line left behind, so an edit changes the future and not the past.
  assert.deepEqual(poem.all.map((l) => l.state), ["baked", "stale", "stale", "stale"]);
});

test("editing one line does not invalidate another line's draft", () => {
  const poem = new Poem(["first", "second"]);
  poem.recordDraft(poem.all[0].id, motion());
  poem.recordDraft(poem.all[1].id, motion());

  poem.setText(poem.all[0].id, "first, changed");

  // A draft was generated alone, so it is as valid as it ever was. Only the bake carries
  // the dependency between lines.
  assert.equal(poem.all[0].state, "stale");
  assert.equal(poem.all[1].state, "draft");
});

test("changing a duration invalidates the same way an edit does", () => {
  const poem = new Poem(["first", "second"]);
  poem.recordBake(baked(poem));

  poem.setDuration(poem.all[0].id, 9);

  assert.deepEqual(poem.all.map((l) => l.state), ["stale", "stale"]);
});

test("a bake stops being current as soon as the poem moves under it", () => {
  const poem = new Poem(["first", "second"]);
  assert.equal(poem.bakeIsCurrent, false); // never baked

  poem.recordBake(baked(poem));
  assert.equal(poem.bakeIsCurrent, true);

  poem.insertAfter(poem.all[1].id, "third");
  assert.equal(poem.bakeIsCurrent, false); // a line it never saw
});

test("removing a line invalidates the bake but keeps the poem playable", () => {
  const poem = new Poem(["first", "second", "third"]);
  poem.recordBake(baked(poem));

  poem.remove(poem.all[1].id);

  assert.equal(poem.size, 2);
  assert.equal(poem.bakeIsCurrent, false);
  assert.notEqual(poem.bakedMotion, null); // kept, so the stage does not go blank
});

test("nothing is overwritten — a line keeps every generation it has had", () => {
  const poem = new Poem(["first"]);
  const id = poem.all[0].id;
  const one = motion(30);
  const two = motion(60);

  poem.recordDraft(id, one);
  poem.recordDraft(id, two);

  assert.equal(poem.all[0].motion, two);
  assert.deepEqual(poem.all[0].history, [one]);
});

test("a bake request carries only written lines, with their real durations", () => {
  const poem = new Poem(["first line", "", "third line here"]);
  poem.setDuration(poem.all[0].id, 4);

  assert.deepEqual(poem.toLines(), [
    { prompt: "first line", duration_seconds: 4 },
    { prompt: "third line here", duration_seconds: 2 },
  ]);
});

test("a baked poem's timeline maps a frame to the line that produced it", () => {
  const poem = new Poem(["first", "second", "third"]);
  poem.setDuration(poem.all[0].id, 2);
  poem.setDuration(poem.all[1].id, 3);
  poem.setDuration(poem.all[2].id, 2);
  const timeline = buildTimeline([baked(poem)]);

  assert.deepEqual(timeline.map((e) => [e.globalStart, e.length]), [
    [0, 60], [60, 90], [150, 60],
  ]);
  assert.equal(entryAt(timeline, 0)?.index, 0);
  assert.equal(entryAt(timeline, 59)?.index, 0);
  assert.equal(entryAt(timeline, 60)?.index, 1); // the boundary belongs to the next line
  assert.equal(entryAt(timeline, 149)?.index, 1);
  assert.equal(entryAt(timeline, 209)?.index, 2);
});

test("drafted clips lay end to end, each starting at its own frame zero", () => {
  const timeline = buildTimeline([motion(30), motion(45), motion(60)]);

  assert.deepEqual(timeline.map((e) => [e.globalStart, e.localStart, e.length]), [
    [0, 0, 30], [30, 0, 45], [75, 0, 60],
  ]);
  assert.equal(entryAt(timeline, 74)?.index, 1);
  assert.equal(entryAt(timeline, 75)?.index, 2);
});
