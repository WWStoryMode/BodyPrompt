/**
 * What the follow camera is allowed to do.
 *
 * Two of these matter more than they look. A camera that overshoots oscillates around the
 * body, and a camera whose easing depends on the frame rate feels like a different camera on
 * a projector than on the laptop it was tuned on — and the projector is the one that counts.
 *
 * Run with `npm test` (Node runs TypeScript directly; no test runner is installed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { FOLLOW_RATE, followPan } from "./follow.ts";

const at = (x: number, z: number) => ({ x, z });

test("a body already centred does not move the camera", () => {
  const pan = followPan(at(2, -1), at(2, -1), 1 / 60);
  assert.equal(pan.dx, 0);
  assert.equal(pan.dz, 0);
});

test("the camera moves toward the body, never past it", () => {
  // One frame closes part of the gap. Overshooting would oscillate around the body.
  const pan = followPan(at(0, 0), at(4, 0), 1 / 60);
  assert.ok(pan.dx > 0, "moves toward the body");
  assert.ok(pan.dx < 4, "does not arrive in one frame");
  // Even an absurdly long frame cannot pass the body.
  const huge = followPan(at(0, 0), at(4, 0), 10);
  assert.ok(huge.dx < 4);
});

test("easing is frame-rate independent", () => {
  // Two half-steps must land exactly where one whole step does, or the camera follows
  // faster on a faster display and its feel becomes a property of the hardware.
  const dt = 1 / 30;
  const one = followPan(at(0, 0), at(6, 0), dt).dx;

  let x = 0;
  for (let i = 0; i < 2; i++) x += followPan(at(x, 0), at(6, 0), dt / 2).dx;

  assert.ok(Math.abs(one - x) < 1e-12, `${one} vs ${x}`);
});

test("it follows x and z, and nothing else", () => {
  const pan = followPan(at(0, 0), at(3, -5), 1 / 60);
  assert.ok(pan.dx > 0);
  assert.ok(pan.dz < 0);
  // There is no third component to get wrong: following height would bob the camera in
  // time with the walk cycle.
  assert.deepEqual(Object.keys(pan).sort(), ["dx", "dz"]);
});

test("a stalled clock pans nothing", () => {
  // The first frame after a tab regains focus can report dt 0, and a paused stage asks for
  // this every frame forever.
  for (const dt of [0, -1, Number.NaN]) {
    const pan = followPan(at(0, 0), at(9, 9), dt);
    assert.equal(pan.dx, 0, `dt ${dt}`);
    assert.equal(pan.dz, 0, `dt ${dt}`);
  }
});

test("the default rate closes most of the gap in about half a second", () => {
  // Pins the feel, so changing FOLLOW_RATE is a deliberate act with a visible consequence
  // rather than a number nudged until a test went green.
  let x = 0;
  for (let i = 0; i < 30; i++) x += followPan(at(x, 0), at(1, 0), 1 / 60, FOLLOW_RATE).dx;
  assert.ok(x > 0.55 && x < 0.75, `covered ${x.toFixed(3)} of the gap in 0.5 s`);
});
