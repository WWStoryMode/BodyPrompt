/**
 * Playback speed, and how the controls move through it.
 *
 * Half speed exists because a body has to be able to follow and re-embody what it sees, and
 * how slow that needs to be is a studio judgement rather than a constant — so the speed is
 * adjustable from the stage, by key as well as by control, since there is no mouse in front
 * of a room.
 *
 * **One list.** There were briefly two — a short cycle for `T` and the full set for the
 * select — and the only thing that bought was 1.5x and 2x being unreachable by the key whose
 * whole job is changing the speed. A set of values half the controls can reach is the kind of
 * fault that looks like a preference until someone tries it, which is why the stepping lives
 * here where it can be tested rather than in the keydown switch.
 */

/** Every speed there is, slowest first. */
export const TEMPO_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];

/**
 * The speed the room opens at.
 *
 * It was 0.5 — the argument being that a body has to be able to follow and re-embody what it
 * sees. That argument still holds, but it is a judgement for the performer rather than
 * something the instrument should impose on arrival, and now that every speed is a keypress
 * away (T, or [ and ]) imposing it bought nothing. Opening at real time also means the first
 * thing the room sees is the motion as the model produced it.
 */
export const PERFORM_TEMPO = 1;

export const FULL_SPEED = 1;

/**
 * Where a rate sits in the list — or the nearest step at or above it, for a rate that
 * somehow sits between two (nothing sets one today; a hand-edited `?speed=` could).
 */
export function tempoIndex(rate: number): number {
  const at = TEMPO_STEPS.indexOf(rate);
  if (at >= 0) return at;
  const near = TEMPO_STEPS.findIndex((r) => r >= rate);
  return near < 0 ? TEMPO_STEPS.length - 1 : near;
}

/**
 * The next speed along.
 *
 * `wrap` is the difference between the two controls, and it is deliberate. `T` cycles, so
 * every speed is reachable by pressing one key repeatedly. `[` and `]` step and stop at the
 * ends, because holding `[` to get as slow as possible should not suddenly hand you double
 * speed in front of a room.
 */
export function stepTempo(rate: number, by: -1 | 1, wrap: boolean): number {
  const n = TEMPO_STEPS.length;
  const at = tempoIndex(rate);
  const next = wrap
    ? (at + by + n) % n
    : Math.min(n - 1, Math.max(0, at + by));
  return TEMPO_STEPS[next];
}
