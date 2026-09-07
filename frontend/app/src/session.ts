/**
 * A session the writer owns.
 *
 * Until v3 Stage C the instrument kept nothing. A reload destroyed the poem and every
 * line's history with it, which meant a forty-second Kimodo generation lived exactly as
 * long as one browser tab. The parked note in the README asked the real question — *where
 * should a search live* — and this is the answer it takes: **with the researcher**, in a
 * file they can put beside their notes, not in a service they have to keep running.
 *
 * So a session file is **self-contained**. It carries the motions themselves, not
 * references to them, and it opens with nothing loaded, no GPU, and no network. It is
 * bigger that way — a poem with history runs to a few MB — and that is the correct trade:
 * a pointer into someone else's store is not a copy of your work.
 *
 * This module is deliberately free of the DOM and of `fetch`, so the rules below can be
 * tested rather than clicked through. Reading and writing the actual file is `main.ts`'s
 * job; keeping the browser's copy is `autosave.ts`'s.
 */

import {
  Poem,
  isRatingValue,
  type LineMeta,
  type LineState,
  type PoemLine,
  type PoemSnapshot,
  type Rating,
} from "./poem.ts";
import type { CanonicalMotion } from "./types.ts";

export const SESSION_SCHEMA = "bodyprompt.session/v1";

/**
 * Formats this build can open, newest first. v1 added ratings and the per-line record a
 * rating needs to be traceable; v0 had neither, and opens as an unrated poem.
 *
 * The version was bumped rather than quietly extended, and the direction that matters is
 * the other one: a v1 file taken to an older build is **refused**, loudly, instead of
 * opening happily and dropping every judgement in it on the way through. A file that will
 * not open can be fixed. Work that vanished on a round trip cannot.
 */
const READABLE = [SESSION_SCHEMA, "bodyprompt.session/v0"];

export interface Session {
  schema: string;
  /** When this file was written, ISO 8601. Informational — nothing branches on it. */
  saved_at: string;
  poem: PoemSnapshot;
}

/** A file that is not a session, or is one this build cannot read. */
export class SessionError extends Error {}

const STATES: LineState[] = ["empty", "generating", "draft", "baked", "stale"];

export interface SessionOptions {
  now?: () => Date;
  /**
   * Write only these lines. Used by "export selected": a chosen handful of prompt-movement
   * pairs, carrying their ratings and their motions, that someone else can open and watch.
   */
  only?: ReadonlySet<number>;
}

export function toSession(poem: Poem, options: SessionOptions = {}): Session {
  const { now = () => new Date(), only } = options;
  return {
    schema: SESSION_SCHEMA,
    saved_at: now().toISOString(),
    poem: poem.toSnapshot(only),
  };
}

/**
 * Read a session file.
 *
 * The envelope is checked strictly — a file that is not a session must say so plainly
 * rather than half-load into a poem missing most of itself. Inside a line, missing or
 * malformed fields are repaired to safe defaults instead: a session written by an older
 * build, or hand-edited, should still open, and a line whose duration went missing is a
 * line with no explicit duration, which is a state the poem already has a meaning for.
 *
 * A motion is passed through untouched. It is not re-validated here — `docs/motion-schema.md`
 * is the service's contract, the renderer already refuses a motion it cannot draw, and
 * silently "fixing" a stored motion would be the one place this codebase edits a record of
 * what a model produced. A line's `calibration` block gets the same treatment, for the same
 * reason: it is a record of how a motion was made, and this module does not know its shape.
 *
 * A v0 file opens and comes back as v1, unrated.
 */
export function fromSession(data: unknown): Session {
  if (!data || typeof data !== "object") throw new SessionError("not a session file");
  const raw = data as Record<string, unknown>;
  if (typeof raw.schema !== "string" || !READABLE.includes(raw.schema)) {
    throw new SessionError(
      `unsupported session format ${JSON.stringify(raw.schema ?? null)} — expected ${READABLE.join(" or ")}`,
    );
  }
  const poem = raw.poem as Record<string, unknown> | undefined;
  if (!poem || !Array.isArray(poem.lines)) {
    throw new SessionError("session file has no poem");
  }

  const lines = poem.lines.map((line, at) => readLine(line, at));
  const ids = new Set(lines.map((line) => line.id));
  const selected = typeof poem.selectedId === "number" ? poem.selectedId : null;

  return {
    schema: SESSION_SCHEMA,
    saved_at: typeof raw.saved_at === "string" ? raw.saved_at : "",
    poem: {
      lines,
      selectedId: selected !== null && ids.has(selected) ? selected : null,
      baked: motionOrNull(poem.baked),
    },
  };
}

/** A session's poem, ready to put on the stage. */
export function restore(session: Session): Poem {
  return Poem.fromSnapshot(session.poem);
}

function readLine(value: unknown, at: number): PoemLine {
  const line = (value ?? {}) as Record<string, unknown>;
  const motion = motionOrNull(line.motion);
  const duration = line.durationSeconds;
  const state = STATES.includes(line.state as LineState)
    ? (line.state as LineState)
    : motion
      ? "stale"
      : "empty";
  return {
    // Ids only have to be unique and stable within one poem, so position is a safe
    // fallback: `Poem.fromSnapshot` reseats the counter above whatever it finds here.
    id: typeof line.id === "number" && Number.isFinite(line.id) ? line.id : at + 1,
    text: typeof line.text === "string" ? line.text : "",
    durationSeconds:
      typeof duration === "number" && Number.isFinite(duration) ? duration : null,
    state,
    motion,
    history: Array.isArray(line.history)
      ? line.history.map(motionOrNull).filter((m): m is CanonicalMotion => m !== null)
      : [],
    rating: ratingOrNull(line.rating),
    historyRatings: Array.isArray(line.historyRatings)
      ? line.historyRatings.map(ratingOrNull)
      : [],
    // `calibration` is what the Day 2 drivers wrote; `meta` is what v1 writes. Reading both
    // means the existing corpus opens without being rewritten first.
    meta: metaOrNull(line.meta ?? line.calibration),
  };
}

/**
 * A rating this build understands, or none.
 *
 * A value outside the scale is dropped rather than clamped. Clamping would invent a
 * judgement nobody made; `null` says truthfully that this motion has not been rated by
 * anyone whose scale this build shares.
 */
function ratingOrNull(value: unknown): Rating | null {
  if (!value || typeof value !== "object") return null;
  const rating = value as Record<string, unknown>;
  if (!isRatingValue(rating.value)) return null;
  return {
    value: rating.value,
    at: typeof rating.at === "string" ? rating.at : "",
  };
}

/**
 * The line's own record of how it was made.
 *
 * Not reshaped, not validated, not interpreted. The Day 2 corpus carries the cue, the
 * prompt level, the seed and the model here — the four things that make a rating traceable
 * back to a prompt, and without which a judgement is a number attached to nothing.
 *
 * It arrives under `calibration` in those files and is written back as `meta`, which is
 * what it always was. Both are read, so the corpus opens as it stands.
 */
function metaOrNull(value: unknown): LineMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LineMeta;
}

function motionOrNull(value: unknown): CanonicalMotion | null {
  if (!value || typeof value !== "object") return null;
  const motion = value as Partial<CanonicalMotion>;
  // The one thing worth insisting on: a motion with no frames cannot be played, and
  // letting it through would put an empty body on the stage under a real line's name.
  return Array.isArray(motion.frames) && motion.frames.length
    ? (value as CanonicalMotion)
    : null;
}

/**
 * A filename that sorts by date and says what it is.
 *
 * `stem` names a file that is not the whole poem — a selection — so an export of eight
 * chosen pairs cannot be mistaken later for the session it was drawn from.
 */
export function sessionFilename(session: Session, poem: Poem, stem?: string): string {
  const stamp = (session.saved_at || new Date().toISOString())
    .slice(0, 16)
    .replace(/[:T]/g, "-");
  const first = poem.written[0]?.text.trim() ?? "";
  const slug =
    stem ??
    (first
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) ||
      "poem");
  return `bodyprompt-${slug}-${stamp}.json`;
}
