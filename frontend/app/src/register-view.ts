/**
 * Which frames a notation register is reading — the whole poem, or one line of it.
 *
 * Every register in `notation.ts` divides its motion by a fixed count (16 buckets, 7
 * exposures, 6 beats) and normalises against that motion's own range. Handed a five-line
 * poem that is correct but nearly unreadable: each line gets about one and a half
 * exposures, and the loudest line sets the scale the quiet ones are drawn against.
 *
 * A `range` narrows a register to one line's frames — which is not a crop of the whole-poem
 * drawing but a different reading, because the normalisation moves with it. A quiet line
 * read alone shows its own dynamics at full scale. That is the point, and it is also the
 * thing to be careful about: two registers at different ranges are NOT comparable, and the
 * rail has to say which one is on screen.
 *
 * `boundaries` are the opposite move: they leave the whole poem in view and mark where the
 * lines meet, so the seams are visible rather than inferred.
 *
 * Kept apart from `notation.ts` for the same reason `timeline.ts` is kept apart from the
 * renderer: it is pure arithmetic, and it is the one part of a register that can be wrong
 * without looking wrong. A mis-mapped playhead sits confidently on the wrong line, and a
 * seam drawn at the wrong index says the body changed sentence somewhere it did not.
 */

import type { CanonicalMotion } from "./types.ts";

export interface RegisterView {
  /** Frames of the motion to read. Omitted, a register reads all of it. */
  range?: { start: number; end: number };
  /**
   * The global frame that this register's first frame is. Playheads arrive in global
   * frames — of the whole poem, or of a run of drafted clips — so a register that holds
   * only part of that needs to know where it sits to place the "now" marker, and to hide
   * it while the body is somewhere this register cannot see.
   */
  globalStart?: number;
  /** Global frames where a line begins. The poem's first line is implicit and not drawn. */
  boundaries?: number[];
}

export interface RegisterWindow {
  /** The motion the register should read — the whole one, or a slice of it. */
  motion: CanonicalMotion;
  /** Frame count of that slice. */
  n: number;
  /** Global frame → index within the slice, or -1 when the body is outside it. */
  local(frame: number): number;
  /** Line beginnings inside the slice, as indices within it. */
  seams: number[];
}

/** Resolve a view into the frames a register reads and where its playhead sits. */
export function windowOf(motion: CanonicalMotion, view: RegisterView): RegisterWindow {
  const total = motion.frames.length;
  const start = view.range ? Math.max(0, Math.min(total - 1, Math.floor(view.range.start))) : 0;
  const end = view.range ? Math.max(start + 1, Math.min(total, Math.ceil(view.range.end))) : total;
  const n = end - start;
  const offset = view.globalStart ?? 0;
  return {
    motion: start === 0 && end === total ? motion : { ...motion, frames: motion.frames.slice(start, end) },
    n,
    local: (frame: number) => {
      const i = frame - offset;
      return i >= 0 && i < n ? i : -1;
    },
    // A boundary at the very start of the window is the window's own edge, not a seam
    // inside it; drawing it would put a line down the left margin of every register.
    seams: (view.boundaries ?? [])
      .map((f) => f - offset)
      .filter((i) => i > 0 && i < n),
  };
}

/** Where a frame sits across a register drawn left-to-right, 0..1. */
export function fraction(i: number, n: number): number {
  return n > 1 ? i / (n - 1) : 0;
}

