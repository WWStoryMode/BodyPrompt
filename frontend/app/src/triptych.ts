/**
 * What a triptych panel is, and how to ask for it.
 *
 * In one-line mode the three panels are the same kind of thing and the only question is how
 * each model reads the sentence. In **whole-poem mode they are not**: Kimodo conditions each
 * line on the decoded tail of the line before it, so its poem is one continuous motion,
 * while SnapMoGen has no way to do that at all and its lines are generated apart. Showing
 * those side by side without saying which is which would be a capability comparison wearing
 * a model comparison's clothes.
 *
 * So the two decisions that carry the honesty live here, out of the DOM, where they can be
 * tested rather than clicked through:
 *
 *   - `askFor` — how to ask a given model, from what it says it can do
 *   - `readPanel` — what came back, from what the model reports it DID
 *
 * The asymmetry is deliberate and is the same rule as everywhere else in this codebase: we
 * ask using a **capability**, and we label using **provenance**. A model that claimed it
 * could stitch and then did not must be labelled by what it did.
 */

import type { CanonicalMotion } from "./types.ts";

/** Whether a poem may be sent to this model whole. `null`/absent = it never said. */
export interface PanelCapability {
  can_stitch_poems?: boolean | null;
}

/**
 * How to ask this model for a poem.
 *
 * `"whole"` only for a model that has explicitly said it can carry a line into the next.
 * **`null` is not `false`, but it is not `true` either** — a model that never answered gets
 * asked line by line, which every model can answer, rather than being sent a poem on a
 * guess and refused.
 */
export function askFor(capability: PanelCapability | undefined): "whole" | "line-by-line" {
  return capability?.can_stitch_poems === true ? "whole" : "line-by-line";
}

export type Continuity =
  /** One line. There is nothing to carry into anything. */
  | "single"
  /** The model generated the poem as one motion, each line conditioned on the last. */
  | "carried"
  /** The lines were generated apart and laid end to end. The body jumps between them. */
  | "apart";

export interface PanelReading {
  lines: number;
  continuity: Continuity;
  frames: number;
  source: string;
  /**
   * True when the model moved for **materially** longer than it was asked to.
   *
   * The threshold is half a second, and it is there to separate two different things.
   * SnapMoGen quantises to whole units, so a 5 s line comes back as 152 frames instead of
   * 150 — a rounding artefact, and reporting it in every panel would be noise. The same
   * model held to its 128-frame floor answers a 2 s line with 4.27 s of movement, which is
   * a fact about the model and changes what the panel is showing.
   */
  lengthened: boolean;
  framesAsked: number;
  framesUsed: number;
}

/**
 * Read back what a panel actually got.
 *
 * `continuity` comes from `provenance.multi_prompt` — **what the model did** — and never
 * from the capability the request was built with. `multi_prompt: null` (the fixtures, which
 * lay motions end to end and slide the pelvis to match) reads as `apart`, because nothing
 * generated it as a poem either.
 */
export function readPanel(clips: CanonicalMotion[], lines: number): PanelReading {
  const first = clips[0];
  const provenance = first?.provenance;
  const sum = (pick: (clip: CanonicalMotion) => number) =>
    clips.reduce((total, clip) => total + pick(clip), 0);
  const framesAsked = sum((clip) => clip.provenance?.frames_asked ?? 0);
  const framesUsed = sum((clip) => clip.provenance?.frames_used ?? 0);

  return {
    lines,
    continuity:
      lines <= 1 ? "single" : provenance?.multi_prompt === true ? "carried" : "apart",
    frames: sum((clip) => clip.frames.length),
    source: provenance?.source ?? (first?.stub ? "fixture" : "unknown"),
    // Only ever reported when the model itself said both numbers. A model that reports
    // neither is not silently described as having honoured a length it never mentioned.
    lengthened: framesAsked > 0 && framesUsed - framesAsked > (first?.fps ?? 30) / 2,
    framesAsked,
    framesUsed,
  };
}

/** The words the panel says. Kept beside the decision so the two cannot drift apart. */
export function continuityLabel(reading: PanelReading): string {
  if (reading.continuity === "carried") return `${reading.lines} lines carried through`;
  if (reading.continuity === "apart") return `${reading.lines} lines generated apart`;
  return "";
}
