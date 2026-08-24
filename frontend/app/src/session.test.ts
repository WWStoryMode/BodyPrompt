/**
 * What a session file must survive.
 *
 * These are the tests that stop a restore from quietly telling a different story than the
 * session it came from. A poem that reloads with a line's history missing, or with a line
 * still claiming to be baked when its bake is gone, looks exactly like a poem that is fine.
 *
 * Run with `npm test` (Node runs TypeScript directly; no test runner is installed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { Poem } from "./poem.ts";
import { SESSION_SCHEMA, SessionError, fromSession, restore, sessionFilename, toSession } from "./session.ts";
import type { CanonicalMotion } from "./types.ts";

function motion(seed = 1, frames = 30): CanonicalMotion {
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

/** A poem with the shapes that matter: a draft, a history, an edit, and a bake. */
function worked(): Poem {
  const poem = new Poem(["a body remembers", "a place it cannot return to"]);
  const [first, second] = poem.all;
  poem.recordDraft(first.id, motion(1));
  poem.recordDraft(first.id, motion(2)); // the first draft becomes history
  poem.recordDraft(second.id, motion(3));
  poem.setDuration(second.id, 7);
  return poem;
}

/** Through a file and back — JSON.parse of JSON.stringify, exactly as export/import does. */
function roundTrip(poem: Poem): Poem {
  const written = JSON.stringify(toSession(poem));
  return restore(fromSession(JSON.parse(written)));
}

test("a session carries the whole poem, not a summary of it", () => {
  const before = worked();
  const after = roundTrip(before);

  assert.deepEqual(
    after.all.map((line) => [line.text, line.durationSeconds, line.state]),
    before.all.map((line) => [line.text, line.durationSeconds, line.state]),
  );
  assert.equal(after.all[0].history.length, 1);
  assert.equal(after.all[0].motion?.seed, 2);
  assert.equal(after.selectedId, before.selectedId);
});

test("a restored session opens with no service — the motions are in the file", () => {
  const after = roundTrip(worked());
  // Every frame of every motion, present and playable, with nothing loaded anywhere.
  assert.equal(after.all[0].motion?.frames.length, 30);
  assert.equal(after.all[0].history[0].frames.length, 30);
});

test("a bake survives, and so does the fact that it is the poem", () => {
  const poem = new Poem(["one", "two"]);
  const baked = motion(9, 60);
  baked.segments = [
    { index: 0, prompt: "one", start_frame: 0, end_frame: 30, transition_frames: 5, duration_seconds: 1 },
    { index: 1, prompt: "two", start_frame: 30, end_frame: 60, transition_frames: 0, duration_seconds: 1 },
  ];
  poem.recordBake(baked);
  assert.equal(poem.bakeIsCurrent, true);

  const after = roundTrip(poem);

  assert.equal(after.bakedMotion?.seed, 9);
  assert.equal(after.bakeIsCurrent, true);
});

test("an edited poem does not come back claiming to be baked", () => {
  const poem = new Poem(["one", "two"]);
  const baked = motion(9, 60);
  baked.segments = [
    { index: 0, prompt: "one", start_frame: 0, end_frame: 30, transition_frames: 5, duration_seconds: 1 },
    { index: 1, prompt: "two", start_frame: 30, end_frame: 60, transition_frames: 0, duration_seconds: 1 },
  ];
  poem.recordBake(baked);
  poem.setText(poem.all[1].id, "two, differently");

  const after = roundTrip(poem);

  assert.equal(after.bakeIsCurrent, false); // the older reading, and it says so
  assert.equal(after.all[1].state, "stale");
  assert.equal(after.bakedMotion?.seed, 9); // kept, so the stage does not go blank
});

test("a line caught mid-generation does not come back spinning forever", () => {
  const poem = new Poem(["one"]);
  poem.markGenerating(poem.all[0].id);

  const after = roundTrip(poem);

  // Nothing is in flight after a reload, so nothing may say it is.
  assert.equal(after.all[0].state, "empty");
});

test("a new line after a restore cannot collide with a restored one", () => {
  const after = roundTrip(new Poem(["one", "two", "three"]));
  const ids = after.all.map((line) => line.id);

  const added = after.append("four");

  assert.equal(ids.includes(added.id), false);
});

test("a file that is not a session says so instead of half-loading", () => {
  assert.throws(() => fromSession(null), SessionError);
  assert.throws(() => fromSession({ hello: "world" }), SessionError);
  assert.throws(
    () => fromSession({ schema: "bodyprompt.session/v9", poem: { lines: [] } }),
    /unsupported session format/,
  );
  assert.throws(() => fromSession({ schema: SESSION_SCHEMA }), /no poem/);
});

test("a hand-edited line is repaired rather than refused", () => {
  const session = fromSession({
    schema: SESSION_SCHEMA,
    poem: {
      lines: [{ text: "a body remembers" }, { text: "and", durationSeconds: "seven", state: "sideways" }],
      selectedId: 404,
    },
  });
  const poem = restore(session);

  assert.equal(poem.all[1].durationSeconds, null); // no explicit duration, which is a real state
  assert.equal(poem.all[1].state, "empty");
  assert.equal(poem.selectedId, poem.all[0].id); // a selection that names no line falls back
});

test("a motion with no frames is dropped rather than put on the stage", () => {
  const poem = restore(
    fromSession({
      schema: SESSION_SCHEMA,
      poem: {
        lines: [{ text: "one", state: "draft", motion: { frames: [] } }],
        selectedId: null,
      },
    }),
  );

  assert.equal(poem.all[0].motion, null);
  assert.equal(poem.all[0].state, "draft"); // recorded as it was; the dot is not rewritten
});

test("an empty file still opens somewhere to type", () => {
  const poem = restore(fromSession({ schema: SESSION_SCHEMA, poem: { lines: [] } }));

  assert.equal(poem.size, 1);
  assert.equal(poem.selectedId, poem.all[0].id);
});

test("the filename says what the poem is and when it was saved", () => {
  const poem = new Poem(["A body remembers a place!"]);
  const session = toSession(poem, () => new Date("2026-08-24T14:35:09Z"));

  assert.equal(
    sessionFilename(session, poem),
    "bodyprompt-a-body-remembers-a-place-2026-08-24-14-35.json",
  );
});
