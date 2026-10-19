/**
 * That every speed can actually be reached.
 *
 * This file exists because of a shipped fault: `T` cycled a three-value list while the control
 * offered seven, so 1.5x and 2x could not be reached by the key that changes the speed. It read
 * as a design choice until someone pressed the key enough times.
 *
 * Run with `npm test` (Node runs TypeScript directly; no test runner is installed).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { FULL_SPEED, PERFORM_TEMPO, TEMPO_STEPS, stepTempo, tempoIndex } from "./tempo.ts";

test("cycling reaches every speed, including the fast ones", () => {
  // The regression this file is named for.
  const seen = new Set<number>();
  let rate = FULL_SPEED;
  for (let i = 0; i < TEMPO_STEPS.length; i++) {
    rate = stepTempo(rate, 1, true);
    seen.add(rate);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [...TEMPO_STEPS]);
  assert.ok(seen.has(1.5) && seen.has(2), "1.5x and 2x are reachable by cycling");
});

test("cycling returns to where it started", () => {
  let rate = PERFORM_TEMPO;
  for (let i = 0; i < TEMPO_STEPS.length; i++) rate = stepTempo(rate, 1, true);
  assert.equal(rate, PERFORM_TEMPO);
});

test("stepping stops at the ends instead of wrapping", () => {
  // Holding [ must not hand you double speed in front of a room.
  let slow = FULL_SPEED;
  for (let i = 0; i < 20; i++) slow = stepTempo(slow, -1, false);
  assert.equal(slow, TEMPO_STEPS[0]);

  let fast = FULL_SPEED;
  for (let i = 0; i < 20; i++) fast = stepTempo(fast, 1, false);
  assert.equal(fast, TEMPO_STEPS[TEMPO_STEPS.length - 1]);
});

test("stepping moves one speed at a time, in the right direction", () => {
  assert.equal(stepTempo(0.5, 1, false), 0.75);
  assert.equal(stepTempo(0.5, -1, false), 0.25);
});

test("the defaults are speeds the controls actually offer", () => {
  // Otherwise entering performance would put the select and the renderer out of step.
  assert.ok(TEMPO_STEPS.includes(PERFORM_TEMPO));
  assert.ok(TEMPO_STEPS.includes(FULL_SPEED));
});

test("a rate between two steps lands on one of them", () => {
  assert.equal(tempoIndex(0.4), TEMPO_STEPS.indexOf(0.5));
  assert.equal(stepTempo(0.4, 1, false), 0.75);
  // And a rate past the end does not fall off it.
  assert.equal(tempoIndex(99), TEMPO_STEPS.length - 1);
  assert.equal(stepTempo(99, 1, false), TEMPO_STEPS[TEMPO_STEPS.length - 1]);
});

test("the list is sorted, which is what makes stepping mean slower and faster", () => {
  const sorted = [...TEMPO_STEPS].sort((a, b) => a - b);
  assert.deepEqual(TEMPO_STEPS, sorted);
});
