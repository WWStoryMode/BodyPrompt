// TypeScript mirror of the canonical motion format (bodyprompt.motion/v0).
// See ../../../docs/motion-schema.md for the authoritative spec.

/** One frame: 22 joint positions and 22 joint rotations, index-aligned to `joints`. */
export interface MotionFrame {
  /** World-space [x, y, z] per joint, metres, Y up, ground at y = 0. */
  positions: number[][];
  /** Local [qx, qy, qz, qw] quaternion per joint. Reserved (identity in v0 fixtures). */
  rotations: number[][];
}

/** One line of a poem, and where its movement sits in the motion's frames. */
export interface MotionSegment {
  index: number;
  prompt: string;
  /** Inclusive. */
  start_frame: number;
  /** Exclusive. */
  end_frame: number;
  /**
   * Trailing frames of this segment that are shared with the next one. They belong to both
   * lines and to neither: with post-processing on, Kimodo generates them under the *next*
   * line's prompt. Zero on the last segment, which has nothing to blend into.
   */
  transition_frames: number;
  duration_seconds: number;
}

/** A complete canonical motion — the exchange format the service returns. */
export interface CanonicalMotion {
  schema: string; // "bodyprompt.motion/v0"
  skeleton: string; // "smpl-22"
  fps: number;
  joints: string[]; // 22 joint names
  edges: [number, number][]; // [child, parent] bone connectivity
  frames: MotionFrame[];
  prompt: string;
  model: string;
  seed: number;
  /** Additive v1 truth about where this motion actually came from. */
  provenance?: {
    source: "kimodo" | "fixture";
    backend: string;
    model_version: string;
    inference_ms: number;
    /** Kimodo's foot-skate cleanup: what the worker did, not what was asked. */
    post_processing?: boolean | null;
    /** DDIM steps actually used — absolute count. Null for fixtures. */
    denoising_steps?: number | null;
    /** Whether the model really stitched a poem as one continuous motion. Null = none did. */
    multi_prompt?: boolean | null;
    /** Frames overlapped between lines. Null when this is not a stitched poem. */
    transition_frames?: number | null;
  };
  /** True when the motion came from the v0 stub rather than a model. */
  stub?: boolean;
  /**
   * *Optional.* Present only on a **poem** — a motion generated from an ordered list of
   * lines. Says where each line lives in `frames`, so a movement can be traced back to the
   * sentence that produced it. Segments tile the motion exactly: segment 0 starts at frame
   * 0 and the last one ends at `frames.length`.
   *
   * Its presence does NOT mean the lines were stitched continuously — check
   * `provenance.multi_prompt` for that. Lines merely laid end to end also carry segments.
   */
  segments?: MotionSegment[];
  /**
   * The ghost-cloud: siblings of this motion from the same prompt with different seeds.
   * Present only when the caller asked for `variants > 1`. Siblings never nest their own.
   */
  variants?: CanonicalMotion[];
}
