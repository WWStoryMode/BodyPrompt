/**
 * How the camera follows a travelling body.
 *
 * The stage camera was framed on a body at the origin, and real models do not stay there —
 * one line covers 2.11 m on Kimodo and 3.89 m on SnapMoGen. A body that travels walks out of
 * the frame, and out of the performance view's spotlight, which is a radial gradient fixed to
 * the centre of the viewport.
 *
 * What this does NOT do is change the motion. Displacement is a finding in this project — how
 * far a body goes is part of how the model read the prompt — so the data is untouched and the
 * floor still streams past underneath. Only the viewpoint moves. That is a different thing
 * from pelvis-aligning the motion, which stays parked as an option (see docs/roadmap.md).
 *
 * The arithmetic lives here rather than in the animation loop for the same reason
 * `timeline.ts` and `register-view.ts` do: a camera that eases at the wrong rate, or that
 * overshoots, or that drifts differently on a 60 Hz laptop and a 120 Hz projector, is wrong
 * in a way that is hard to see and easy to argue about. Here it can be tested.
 */

/** Where the camera aims: the body's x/z, at the height the stage was framed for. */
export const FOLLOW_HEIGHT = 1.0;

/**
 * How fast the camera closes the gap, as a rate per second.
 *
 * It is a time constant, not a per-frame fraction: at 1.8 the camera covers about 63% of the
 * distance to the body in the first 0.55 s. The lag is the point — a camera that snapped to
 * the pelvis would nail the body to the glass and read as the body standing still while the
 * world slid past. This reads as an operator following a dancer, and it is the one number
 * here most worth changing in a room.
 */
export const FOLLOW_RATE = 1.8;

export interface Pan {
  dx: number;
  dz: number;
}

/**
 * How far to pan this frame, so the body eases toward the centre of the shot.
 *
 * Applied to the orbit target **and** the camera position, by the same amount — that is what
 * keeps it a pan. Moving only the target would swing the camera round the body and throw away
 * whatever angle and distance the viewer had chosen.
 *
 * Frame-rate independent by construction: `1 - exp(-rate * dt)` composes exactly, so two
 * half-steps land in the same place as one whole step. A fixed per-frame fraction would
 * follow faster on a faster display, which would make the camera's feel a property of the
 * hardware rather than a decision.
 *
 * Never overshoots: the factor is in [0, 1) for any non-negative `dt`.
 *
 * Only x and z. Following the body's height as well would make the camera bob with the
 * pelvis — a camera breathing in time with the walk cycle, which reads as the floor moving.
 */
export function followPan(
  from: { x: number; z: number },
  to: { x: number; z: number },
  dt: number,
  rate: number = FOLLOW_RATE,
): Pan {
  if (!(dt > 0) || !(rate > 0)) return { dx: 0, dz: 0 };
  const k = 1 - Math.exp(-rate * dt);
  return { dx: (to.x - from.x) * k, dz: (to.z - from.z) * k };
}
