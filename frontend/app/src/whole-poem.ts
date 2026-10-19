/**
 * What the whole-poem button does, for the model that is selected.
 *
 * `B` has always meant "the whole poem", but only one model can answer that as *one* motion.
 * Kimodo conditions each line on the decoded tail of the line before it. SnapMoGen and
 * Language of Motion cannot, and SnapMoGen's worker refuses a poem outright rather than
 * laying independent lines end to end and calling the result continuous.
 *
 * So for those models the whole-poem action is a **batch of drafts**, not a bake, and the
 * naming is load-bearing. A draft is one line generated alone and the body jumps between
 * them; a bake is the whole poem in one pass. A button reading "Bake" while drafting every
 * line apart would rename the one distinction `poem.ts` exists to protect — and a label is
 * on screen every time, where a dialog is dismissed once by the person who already knew.
 *
 * The decision lives here rather than in the DOM for the same reason `askFor` does: it is
 * the kind of thing that can be wrong without *looking* wrong, so it is tested instead of
 * clicked through. We ask using a **capability** and name the action we are about to take.
 */

import { askFor, type PanelCapability } from "./triptych.ts";

export type WholePoemAction =
  /** One continuous motion, each line conditioned on the body the last one left. */
  | "bake"
  /** Every line generated alone. The body jumps between them, and no bake is recorded. */
  | "draft-all";

/**
 * Which whole-poem action this model can actually perform.
 *
 * Delegates the capability read to `askFor`, so there is exactly one place in the codebase
 * that decides what `can_stitch_poems` means — including that **`null` is not `true`**: a
 * model that never said gets its lines asked for one at a time, which every model can
 * answer, rather than being sent a poem on a guess and refused.
 */
export function wholePoemAction(capability: PanelCapability | undefined): WholePoemAction {
  return askFor(capability) === "whole" ? "bake" : "draft-all";
}

/** The words on the button. Kept beside the decision so the two cannot drift apart. */
export function wholePoemLabel(action: WholePoemAction): string {
  return action === "bake" ? "Bake whole poem" : "Draft all lines";
}

/** The hover text, which is where the *reason* goes — the button has room for neither. */
export function wholePoemTitle(action: WholePoemAction): string {
  return action === "bake"
    ? "Generate the whole poem continuously, each line carried into the next (B)"
    : "This model cannot carry one line into the next — generate every line alone (B)";
}
