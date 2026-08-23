/**
 * The playhead's timeline — how a poem's frames are laid out in time.
 *
 * A **baked** poem is one clip whose `segments` divide it, so every entry points at the
 * same clip at a different offset. A **draft** is one clip per line, each starting at its
 * own frame 0. Resolving a global frame through these entries is what lets the instrument
 * say which sentence the body is currently answering — in both shapes, without the renderer
 * needing to know which one it is holding.
 *
 * Kept apart from the renderer because it is pure arithmetic: no three.js, no DOM, and the
 * one piece of this that silently attributes movement to the wrong line if it is wrong.
 */

import type { CanonicalMotion } from "./types";

export interface TimelineEntry {
  clip: CanonicalMotion;
  /** First global frame of this entry. */
  globalStart: number;
  /** The frame within `clip` that `globalStart` maps to. */
  localStart: number;
  length: number;
  /** Which line of the poem this is. */
  index: number;
}

/**
 * Lay clips end to end. A single clip carrying `segments` is divided by them; anything else
 * contributes one entry per clip.
 */
export function buildTimeline(clips: CanonicalMotion[]): TimelineEntry[] {
  const segments = clips.length === 1 ? clips[0].segments : undefined;
  if (segments?.length) {
    return segments.map((segment) => ({
      clip: clips[0],
      globalStart: segment.start_frame,
      localStart: segment.start_frame,
      length: segment.end_frame - segment.start_frame,
      index: segment.index,
    }));
  }
  let globalStart = 0;
  return clips.map((clip, index) => {
    const entry = { clip, globalStart, localStart: 0, length: clip.frames.length, index };
    globalStart += clip.frames.length;
    return entry;
  });
}

/** The entry a global frame falls inside. */
export function entryAt(
  timeline: TimelineEntry[],
  frame: number,
): TimelineEntry | undefined {
  for (const entry of timeline) {
    if (frame < entry.globalStart + entry.length) return entry;
  }
  return timeline[timeline.length - 1];
}
