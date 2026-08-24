/**
 * The poem — the instrument's state.
 *
 * Each line is a prompt. Written together they are a score: the body moves from one
 * sentence into the next rather than restarting at each one. This replaces the branching
 * lineage tree; where the tree recorded *what was tried*, the poem records *what is being
 * made*, and each line keeps its own history so a revision still never destroys what came
 * before.
 *
 * Two kinds of motion live here, and the difference matters more than anything else in
 * this file:
 *
 *   - a **draft** is a line generated on its own, blind to its neighbours. Fast to make,
 *     and the body visibly jumps between drafts.
 *   - a **bake** is the whole poem generated in one pass, each line conditioned on the body
 *     left by the line before it. This is the real reading.
 *
 * A draft must never be mistaken for a bake, so this module tracks which is which and
 * refuses to blur them.
 */

import type { CanonicalMotion, MotionSegment } from "./types";

export type LineState =
  /** Nothing generated for this line yet. */
  | "empty"
  /** A request is in flight. */
  | "generating"
  /** Has its own motion, generated alone — correct for this line, blind to its neighbours. */
  | "draft"
  /** Covered by a bake that still matches this line and every line before it. */
  | "baked"
  /** Had a motion, but an edit invalidated it. */
  | "stale";

export interface PoemLine {
  id: number;
  text: string;
  /** Explicit duration, or null to use `suggestedDuration(text)`. */
  durationSeconds: number | null;
  state: LineState;
  /** This line's own draft motion, if it has been drafted. */
  motion: CanonicalMotion | null;
  /** Every past generation of this line, oldest first. Nothing is overwritten. */
  history: CanonicalMotion[];
}

/** A poem as plain data — what a session file carries, and what a restore reads. */
export interface PoemSnapshot {
  lines: PoemLine[];
  selectedId: number | null;
  baked: CanonicalMotion | null;
}

const MIN_SECONDS = 2;
const MAX_SECONDS = 10;
/** Roughly a beat per word — slow enough that a phrase has time to be a phrase. */
const SECONDS_PER_WORD = 0.7;

/**
 * How long a line probably wants to move for, from how much it says.
 *
 * Only ever a suggestion: it fills the duration box faintly until the writer sets a real
 * value, because timing is a choreographic decision and guessing it from word count is not.
 */
export function suggestedDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.round(words * SECONDS_PER_WORD);
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, seconds));
}

export class Poem {
  private lines: PoemLine[] = [];
  // A plain counter, as the lineage tree used: no Date or random, so ids stay reproducible.
  private nextId = 1;

  /** The line the writer is working on — what the ghost-cloud and notation follow. */
  selectedId: number | null = null;

  /** The whole-poem motion from the last bake, or null if it has never been baked. */
  bakedMotion: CanonicalMotion | null = null;

  constructor(initial: string[] = [""]) {
    for (const text of initial) this.append(text);
    this.selectedId = this.lines[0]?.id ?? null;
  }

  get all(): readonly PoemLine[] {
    return this.lines;
  }

  get size(): number {
    return this.lines.length;
  }

  get(id: number): PoemLine | undefined {
    return this.lines.find((line) => line.id === id);
  }

  indexOf(id: number): number {
    return this.lines.findIndex((line) => line.id === id);
  }

  get selected(): PoemLine | undefined {
    return this.selectedId === null ? undefined : this.get(this.selectedId);
  }

  /** The duration this line will actually be generated at. */
  durationOf(line: PoemLine): number {
    return line.durationSeconds ?? suggestedDuration(line.text);
  }

  /** Lines with something to say — the ones a generation would include. */
  get written(): PoemLine[] {
    return this.lines.filter((line) => line.text.trim().length > 0);
  }

  /**
   * Is the baked motion still the poem? False as soon as any line has been edited since,
   * or if lines have been added or removed.
   */
  get bakeIsCurrent(): boolean {
    return (
      this.bakedMotion !== null &&
      this.written.length > 0 &&
      this.lines.every((line) => line.state === "baked" || !line.text.trim())
    );
  }

  append(text = ""): PoemLine {
    const line: PoemLine = {
      id: this.nextId++,
      text,
      durationSeconds: null,
      state: "empty",
      motion: null,
      history: [],
    };
    this.lines.push(line);
    return line;
  }

  /** Insert a new line directly after `id` — what Enter does at the end of a line. */
  insertAfter(id: number, text = ""): PoemLine {
    const line = this.append(text);
    const at = this.indexOf(id);
    if (at >= 0 && at < this.lines.length - 1) {
      this.lines.splice(this.lines.length - 1, 1);
      this.lines.splice(at + 1, 0, line);
    }
    this.invalidateFrom(at + 1);
    return line;
  }

  /** Remove a line — what Backspace does when it merges an empty line away. */
  remove(id: number): void {
    const at = this.indexOf(id);
    if (at < 0 || this.lines.length === 1) return;
    this.lines.splice(at, 1);
    if (this.selectedId === id) {
      this.selectedId = this.lines[Math.max(0, at - 1)].id;
    }
    this.invalidateFrom(at);
  }

  setText(id: number, text: string): void {
    const line = this.get(id);
    if (!line || line.text === text) return;
    line.text = text;
    this.invalidateFrom(this.indexOf(id));
  }

  setDuration(id: number, seconds: number | null): void {
    const line = this.get(id);
    if (!line || line.durationSeconds === seconds) return;
    line.durationSeconds = seconds;
    this.invalidateFrom(this.indexOf(id));
  }

  /**
   * An edit at `index` invalidates that line and, if the poem was baked, every line after
   * it.
   *
   * This is not caution — it is what the model actually does. Each baked line is generated
   * conditioned on the body the previous line left behind, so changing one line changes the
   * body every later line inherits. Editing a line changes the future, not the past: the
   * lines *before* the edit are untouched and stay baked.
   *
   * Drafts are different. A draft is generated alone, so an edit elsewhere leaves it as
   * valid as it ever was, and only the edited line's own draft goes stale.
   */
  private invalidateFrom(index: number): void {
    this.lines.forEach((line, at) => {
      if (at < index) return;
      if (at === index) {
        if (line.state === "baked" || line.state === "draft") line.state = "stale";
        else if (line.state !== "generating") line.state = line.motion ? "stale" : "empty";
      } else if (line.state === "baked") {
        line.state = "stale";
      }
    });
    // The bake described a poem that no longer exists. The motion is kept so playback does
    // not go blank mid-edit, but `bakeIsCurrent` now reports false and the UI says so.
  }

  markGenerating(id: number): void {
    const line = this.get(id);
    if (line) line.state = "generating";
  }

  /** Record a line's own motion. Only ever makes that one line valid. */
  recordDraft(id: number, motion: CanonicalMotion): void {
    const line = this.get(id);
    if (!line) return;
    if (line.motion) line.history.push(line.motion);
    line.motion = motion;
    line.state = "draft";
  }

  /**
   * Record a whole-poem bake. Every written line becomes `baked`; blank lines stay empty.
   *
   * The per-line motions are left alone: a draft remains that line's own history even after
   * the poem is baked around it.
   */
  recordBake(motion: CanonicalMotion): void {
    this.bakedMotion = motion;
    const segments: MotionSegment[] = motion.segments ?? [];
    const written = this.written;
    written.forEach((line, at) => {
      if (at < segments.length) line.state = "baked";
    });
    for (const line of this.lines) {
      if (!line.text.trim()) line.state = "empty";
    }
  }

  /** What a bake request should send. */
  toLines(): { prompt: string; duration_seconds: number }[] {
    return this.written.map((line) => ({
      prompt: line.text.trim(),
      duration_seconds: this.durationOf(line),
    }));
  }

  /**
   * The whole poem as plain data — every line, every line's history, and the bake.
   *
   * Nothing is dropped and nothing is summarised: a snapshot has to be able to *become*
   * this poem again, on another machine, with the service switched off. That is what makes
   * a session file the writer's own copy rather than a pointer at ours.
   */
  toSnapshot(): PoemSnapshot {
    return {
      lines: this.lines.map((line) => ({
        id: line.id,
        text: line.text,
        durationSeconds: line.durationSeconds,
        state: line.state,
        motion: line.motion,
        history: [...line.history],
      })),
      selectedId: this.selectedId,
      baked: this.bakedMotion,
    };
  }

  /**
   * Rebuild a poem from a snapshot.
   *
   * Two things are deliberately not restored verbatim:
   *
   * - **`generating`** becomes `stale` (or `empty`). It described a request that was in
   *   flight when the snapshot was taken; nothing is in flight now, and a row that spins
   *   forever would be a lie told by a dot.
   * - **`nextId`** resumes past the highest id in the file, so a line added after a restore
   *   cannot collide with one that was already there.
   *
   * Everything else — including which lines were baked — is restored exactly as recorded.
   * `bakeIsCurrent` recomputes from the restored states, so an imported poem cannot claim
   * a continuous reading it did not have.
   */
  static fromSnapshot(snapshot: PoemSnapshot): Poem {
    const poem = new Poem([]);
    poem.lines = snapshot.lines.map((line) => ({
      id: line.id,
      text: line.text,
      durationSeconds: line.durationSeconds,
      state: line.state === "generating" ? (line.motion ? "stale" : "empty") : line.state,
      motion: line.motion,
      history: [...(line.history ?? [])],
    }));
    // The editor always needs somewhere to type.
    if (!poem.lines.length) poem.append("");
    poem.nextId = Math.max(0, ...poem.lines.map((line) => line.id)) + 1;
    poem.bakedMotion = snapshot.baked;
    const selected = snapshot.selectedId;
    poem.selectedId =
      selected !== null && poem.lines.some((line) => line.id === selected)
        ? selected
        : poem.lines[0].id;
    return poem;
  }
}
