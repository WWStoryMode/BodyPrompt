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

test("moving a line invalidates from where it moved — never above it", () => {
  const poem = new Poem(["first", "second", "third", "fourth"]);
  poem.recordBake(baked(poem));

  poem.move(poem.all[2].id, 1); // third moves down past fourth

  // Reordering is an edit to the score: every line from the earlier of the two positions
  // inherits a different body, and the lines above it inherit exactly what they did.
  assert.deepEqual(poem.all.map((l) => l.text), ["first", "second", "fourth", "third"]);
  assert.deepEqual(poem.all.map((l) => l.state), ["baked", "baked", "stale", "stale"]);
});

test("moving a line up invalidates from the position it moved into", () => {
  const poem = new Poem(["first", "second", "third", "fourth"]);
  poem.recordBake(baked(poem));

  poem.move(poem.all[3].id, -2); // fourth moves up between first and second

  assert.deepEqual(poem.all.map((l) => l.text), ["first", "fourth", "second", "third"]);
  assert.deepEqual(poem.all.map((l) => l.state), ["baked", "stale", "stale", "stale"]);
});

test("a line at either end has nowhere to go, and nothing happens", () => {
  const poem = new Poem(["first", "second"]);
  poem.recordBake(baked(poem));

  assert.equal(poem.move(poem.all[0].id, -1), false);
  assert.equal(poem.move(poem.all[1].id, 1), false);

  assert.deepEqual(poem.all.map((l) => l.text), ["first", "second"]);
  assert.deepEqual(poem.all.map((l) => l.state), ["baked", "baked"]); // not even touched
});

test("rating a line judges it without invalidating it", () => {
  const poem = new Poem(["first", "second"]);
  poem.recordBake(baked(poem));

  poem.setRating(poem.all[0].id, 3);

  // Looking at a movement is not editing the score. A line that comes back stale for
  // having been read would make the instrument unusable for the thing it is being built for.
  assert.deepEqual(poem.all.map((l) => l.state), ["baked", "baked"]);
  assert.equal(poem.bakeIsCurrent, true);
  assert.equal(poem.all[0].rating?.value, 3);
});

test("unrated is not zero", () => {
  const poem = new Poem(["first"]);
  const id = poem.all[0].id;

  assert.equal(poem.all[0].rating, null);

  poem.setRating(id, 0);
  assert.equal(poem.all[0].rating?.value, 0); // a judgement of "nothing there"

  poem.setRating(id, null);
  assert.equal(poem.all[0].rating, null); // back to never having been asked
});

test("skip is kept apart from a low score", () => {
  const poem = new Poem(["first"]);
  poem.setRating(poem.all[0].id, "skip");

  assert.equal(poem.all[0].rating?.value, "skip");
  assert.notEqual(poem.all[0].rating?.value, 0);
});

test("a rating follows the motion it judged into history", () => {
  const poem = new Poem(["first"]);
  const id = poem.all[0].id;
  const one = motion(30);
  const two = motion(60);

  poem.recordDraft(id, one);
  poem.setRating(id, 4);
  poem.recordDraft(id, two);

  // The verdict was passed on `one`. It stays with `one`, and `two` arrives unjudged
  // rather than inheriting a reading of a body nobody watched.
  assert.deepEqual(poem.all[0].history, [one]);
  assert.equal(poem.all[0].historyRatings[0]?.value, 4);
  assert.equal(poem.all[0].rating, null);
});

test("history and its ratings stay the same length through a restore", () => {
  const poem = new Poem(["first"]);
  const id = poem.all[0].id;
  poem.recordDraft(id, motion(30));
  poem.setRating(id, 2);
  poem.recordDraft(id, motion(45));
  poem.recordDraft(id, motion(60));

  const line = Poem.fromSnapshot(poem.toSnapshot()).all[0];

  assert.equal(line.history.length, 2);
  assert.equal(line.historyRatings.length, line.history.length);
  assert.equal(line.historyRatings[0]?.value, 2);
  assert.equal(line.historyRatings[1], null); // drafted again without being rated
});

test("a file whose ratings do not line up with its history is repaired, not trusted", () => {
  const poem = new Poem(["first"]);
  poem.recordDraft(poem.all[0].id, motion(30));
  poem.recordDraft(poem.all[0].id, motion(60));
  const snapshot = poem.toSnapshot();
  // A hand-edited file, or one written before this field existed.
  snapshot.lines[0].historyRatings = [];

  const line = Poem.fromSnapshot(snapshot).all[0];

  // Padding beats guessing: a rating shifted onto the wrong motion is worse than none.
  assert.equal(line.historyRatings.length, line.history.length);
  assert.deepEqual(line.historyRatings, [null]);
});

test("appending a session renumbers its lines so nothing collides", () => {
  const host = new Poem(["first", "second"]);
  const incoming = new Poem(["third", "fourth"]); // its ids are 1 and 2, same as the host's

  host.absorb(incoming.toSnapshot());

  assert.deepEqual(host.all.map((l) => l.text), ["first", "second", "third", "fourth"]);
  assert.equal(new Set(host.all.map((l) => l.id)).size, 4); // no two lines share an id
  assert.equal(host.get(host.all[2].id)?.text, "third"); // and each id finds its own line
});

test("an appended poem brings its ratings and its record with it", () => {
  const host = new Poem(["first"]);
  const incoming = new Poem(["Trance"]);
  const id = incoming.all[0].id;
  incoming.recordDraft(id, motion());
  incoming.setRating(id, 3);
  (incoming.all[0] as { meta: unknown }).meta = { cue: "PB1", promptLevel: "O" };

  host.absorb(incoming.toSnapshot());

  const landed = host.all[1];
  assert.equal(landed.rating?.value, 3);
  assert.deepEqual(landed.meta, { cue: "PB1", promptLevel: "O" });
  assert.equal(landed.motion?.frames.length, 60);
});

test("an appended bake is dropped, and its lines stop claiming to be baked", () => {
  const host = new Poem(["first"]);
  host.recordDraft(host.all[0].id, motion());
  const incoming = new Poem(["second", "third"]);
  incoming.recordBake(baked(incoming));
  assert.deepEqual(incoming.all.map((l) => l.state), ["baked", "baked"]);

  host.absorb(incoming.toSnapshot());

  // Those lines were generated from the body that preceded them in *their* poem. Here
  // something else does, so a solid dot would be claiming a continuity that is gone.
  assert.deepEqual(host.all.map((l) => l.state), ["draft", "empty", "empty"]);
  assert.equal(host.bakedMotion, null); // and the reading itself was never of this poem
});

test("appending to a baked poem makes the bake stop claiming to be the poem", () => {
  const host = new Poem(["first", "second"]);
  host.recordBake(baked(host));
  assert.equal(host.bakeIsCurrent, true);

  host.absorb(new Poem(["third"]).toSnapshot());

  assert.equal(host.bakeIsCurrent, false);
  assert.notEqual(host.bakedMotion, null); // kept, so the stage does not go blank
});

test("appending into a fresh instrument does not leave the empty line behind", () => {
  const host = new Poem([""]); // what New gives you
  host.absorb(new Poem(["one", "two"]).toSnapshot());

  assert.deepEqual(host.all.map((l) => l.text), ["one", "two"]);
  assert.equal(host.selectedId, host.all[0].id); // and the selection lands somewhere real
});

test("a written line is never absorbed away, however short it is", () => {
  const host = new Poem(["a"]);
  host.absorb(new Poem(["b"]).toSnapshot());

  assert.deepEqual(host.all.map((l) => l.text), ["a", "b"]);
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
