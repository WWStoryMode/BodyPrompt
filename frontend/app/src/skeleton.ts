// The canonical smpl-22 skeleton, mirrored from docs/motion-schema.md.
//
// A loaded motion carries its own `joints` + `edges`, so the renderer draws bones from
// the motion itself. This module exists so we can refer to specific joints BY NAME —
// e.g. which joints get a fading trail, which render as larger "landmark" dots.

export const JOINTS = [
  "pelvis", "left_hip", "right_hip", "spine1", "left_knee", "right_knee",
  "spine2", "left_ankle", "right_ankle", "spine3", "left_foot", "right_foot",
  "neck", "left_collar", "right_collar", "head", "left_shoulder",
  "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
] as const;

export type JointName = (typeof JOINTS)[number];

/** name -> index */
export const JOINT_INDEX: Record<string, number> = Object.fromEntries(
  JOINTS.map((name, i) => [name, i]),
);

/** [child, parent] bone connectivity (21 bones; pelsis is the root). */
export const EDGES: [number, number][] = [
  [1, 0], [2, 0], [3, 0], [4, 1], [5, 2], [6, 3], [7, 4], [8, 5], [9, 6],
  [10, 7], [11, 8], [12, 9], [13, 9], [14, 9], [15, 12], [16, 13], [17, 14],
  [18, 16], [19, 17], [20, 18], [21, 19],
];

/** Extremities that leave a Marey-style fading trail. */
export const TRAIL_JOINTS: JointName[] = [
  "left_wrist", "right_wrist", "left_ankle", "right_ankle",
];

/** Joints drawn as larger "landmark" dots (head + the four extremities). */
export const LANDMARK_JOINTS: JointName[] = [
  "head", "left_wrist", "right_wrist", "left_ankle", "right_ankle",
];
