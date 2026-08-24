/**
 * How a register decides which frames it is reading.
 *
 * The registers themselves are drawings, and a drawing that is wrong is usually visibly
 * wrong. This arithmetic is not: a playhead mapped to the wrong frame sits confidently on
 * the wrong line, and a seam drawn at the wrong index claims the body changed sentence
 * somewhere it did not. So it is tested, and the SVG is left to the eye.
 *
 * Run with `npm test` (Node runs TypeScript directly; no test runner is installed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { windowOf } from "./register-view.ts";
import type { CanonicalMotion } from "./types.ts";

function motion(frames: number): CanonicalMotion {
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
  };
}

test("with no view, a register reads the whole motion at global frames", () => {
  const w = windowOf(motion(90), {});

  assert.equal(w.n, 90);
  assert.equal(w.motion.frames.length, 90);
  assert.equal(w.local(0), 0);
  assert.equal(w.local(89), 89);
  assert.equal(w.local(90), -1); // past the end
  assert.deepEqual(w.seams, []);
});

test("a range slices the motion and re-bases the playhead onto it", () => {
  // line 2 of a three-line poem: frames 60..149
  const w = windowOf(motion(210), { range: { start: 60, end: 150 }, globalStart: 60 });

  assert.equal(w.n, 90);
  assert.equal(w.motion.frames.length, 90);
  assert.equal(w.local(60), 0); // the line's first frame is this register's frame 0
  assert.equal(w.local(149), 89);
  // The body is in another line. The register must say nothing rather than park its marker
  // on an edge the body is not standing on.
  assert.equal(w.local(59), -1);
  assert.equal(w.local(150), -1);
});

test("a drafted clip is offset without being sliced", () => {
  // three drafts of 30 frames; the registers hold the second one
  const w = windowOf(motion(30), { globalStart: 30 });

  assert.equal(w.motion.frames.length, 30);
  assert.equal(w.local(29), -1); // still in the first draft
  assert.equal(w.local(30), 0);
  assert.equal(w.local(59), 29);
  assert.equal(w.local(60), -1); // already in the third
});

test("seams land where the lines begin, in the register's own frames", () => {
  const w = windowOf(motion(210), { boundaries: [60, 150] });

  assert.deepEqual(w.seams, [60, 150]);
});

test("a boundary at the window's own edge is not a seam inside it", () => {
  // Line 2 read alone: its start is where this register begins, not a join within it.
  // Drawn, it would be a rule down the left margin of every narrowed register.
  const w = windowOf(motion(210), {
    range: { start: 60, end: 150 },
    globalStart: 60,
    boundaries: [0, 60, 150],
  });

  assert.deepEqual(w.seams, []);
});

test("a range is clamped to frames that exist", () => {
  const w = windowOf(motion(50), { range: { start: 30, end: 400 }, globalStart: 30 });

  assert.equal(w.n, 20);
  assert.equal(w.motion.frames.length, 20);
  assert.equal(w.local(49), 19);
});
