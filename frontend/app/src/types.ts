// TypeScript mirror of the canonical motion format (bodyprompt.motion/v0).
// See ../../../docs/motion-schema.md for the authoritative spec.

/** One frame: 22 joint positions and 22 joint rotations, index-aligned to `joints`. */
export interface MotionFrame {
  /** World-space [x, y, z] per joint, metres, Y up, ground at y = 0. */
  positions: number[][];
  /** Local [qx, qy, qz, qw] quaternion per joint. Reserved (identity in v0 fixtures). */
  rotations: number[][];
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
  /** True when the motion came from the v0 stub rather than a model. */
  stub?: boolean;
  /**
   * The ghost-cloud: siblings of this motion from the same prompt with different seeds.
   * Present only when the caller asked for `variants > 1`. Siblings never nest their own.
   */
  variants?: CanonicalMotion[];
}
