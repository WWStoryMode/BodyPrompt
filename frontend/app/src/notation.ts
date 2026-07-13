// Notation registers — the legible reduction.
//
// A stick figure shows you movement; it does not let you READ it. These four registers
// reduce a canonical motion to something a human can compare and re-embody:
//
//   · chronophotograph — Marey's plate: successive poses laid out in time, so the whole
//     phrase is visible at once instead of streaming past. Movement as its own notation.
//   · notation strip — a time-scored staff, one row per limb. Each glyph's ANGLE is the
//     direction that limb travelled, its LENGTH is how far, and its HEIGHT IN THE ROW is
//     the level it moved at (low / mid / high). Read left-to-right like a score.
//   · floor path   — the movement seen from above: where the body's weight travelled,
//     with the feet's traces behind it.
//   · Laban-inspired score — a vertical staff read bottom-to-top, columns for the limbs
//     either side of a central support column. Not strict Labanotation (see below).
//
// No single register is complete — each one throws information away, and *which* thing it
// throws away is the point. The floor path cannot show you a raised arm; the Laban score
// cannot show you travel. Reading them together is the instrument.
//
// Everything here is DERIVED from the joint trajectories — nothing is decorative.
// (Designing this reduction is itself part of the research; see the README.)

import type { CanonicalMotion } from "./types";
import { JOINT_INDEX } from "./skeleton";

const SVG_NS = "http://www.w3.org/2000/svg";

type Vec3 = [number, number, number];

/**
 * The rows of the score. Each track reduces the body to ONE point worth reading.
 * Limbs are measured RELATIVE to their anchor (a wrist relative to its shoulder is the
 * arm's gesture; the wrist's absolute position would just re-tell us where the body is).
 * `weight` is the exception — the pelvis in absolute terms IS where the weight is.
 */
const TRACKS: { name: string; joint: string; anchor: string | null }[] = [
  { name: "L arm", joint: "left_wrist", anchor: "left_shoulder" },
  { name: "R arm", joint: "right_wrist", anchor: "right_shoulder" },
  { name: "spine", joint: "spine3", anchor: "pelvis" },
  { name: "weight", joint: "pelvis", anchor: null },
  { name: "feet", joint: "left_ankle", anchor: "pelvis" },
];

const BUCKETS = 16; // columns in the score — one glyph per slice of time

function el(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** The point a track reads, per frame: joint position, minus its anchor if it has one. */
function trackPoints(motion: CanonicalMotion, joint: string, anchor: string | null): Vec3[] {
  const j = JOINT_INDEX[joint];
  const a = anchor === null ? null : JOINT_INDEX[anchor];
  return motion.frames.map((f) => {
    const p = f.positions[j];
    if (a === null) return [p[0], p[1], p[2]] as Vec3;
    const q = f.positions[a];
    return [p[0] - q[0], p[1] - q[1], p[2] - q[2]] as Vec3;
  });
}

// ---- the notation strip ----------------------------------------------------

const ROW_H = 30;
const LABEL_W = 46;
const STRIP_W = 300;

/**
 * Draw the score. Returns a setFrame(i) that moves the "now" playhead — the static score
 * is built once per motion, so playback only nudges one line.
 */
export function renderNotationStrip(
  svg: SVGSVGElement,
  motion: CanonicalMotion,
): (frame: number) => void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const height = TRACKS.length * ROW_H + 14;
  const plotW = STRIP_W - LABEL_W - 8;
  svg.setAttribute("viewBox", `0 0 ${STRIP_W} ${height}`);
  svg.setAttribute("width", "100%");

  const nFrames = motion.frames.length;

  TRACKS.forEach((track, r) => {
    const yTop = r * ROW_H + 8;
    const yMid = yTop + ROW_H / 2;

    // row label + baseline
    const label = el("text", { x: "0", y: String(yMid + 3), class: "nota-label" });
    label.textContent = track.name;
    svg.appendChild(label);
    svg.appendChild(
      el("line", {
        x1: String(LABEL_W), y1: String(yMid),
        x2: String(LABEL_W + plotW), y2: String(yMid),
        class: "nota-baseline",
      }),
    );

    const pts = trackPoints(motion, track.joint, track.anchor);

    // Level is relative to THIS track's own vertical range across the whole motion —
    // so "high" means high for that limb, not high in the room.
    const ys = pts.map((p) => p[1]);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const ySpan = Math.max(1e-6, yMax - yMin);

    // Magnitude is normalised per-track too, so a still track doesn't get fake drama.
    const deltas: { dx: number; dy: number; mag: number; level: number }[] = [];
    for (let b = 0; b < BUCKETS; b++) {
      const s = Math.floor((b * nFrames) / BUCKETS);
      const e = Math.max(s + 1, Math.floor(((b + 1) * nFrames) / BUCKETS)) - 1;
      const p0 = pts[s];
      const p1 = pts[Math.min(e, nFrames - 1)];
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const dz = p1[2] - p0[2];
      const mag = Math.hypot(dx, dy, dz);
      // mean height over the bucket -> 0 (low) .. 1 (high) within this track's range
      let sum = 0;
      for (let f = s; f <= e; f++) sum += pts[f][1];
      const level = (sum / (e - s + 1) - yMin) / ySpan;
      deltas.push({ dx, dy, mag, level });
    }
    const magMax = Math.max(1e-6, ...deltas.map((d) => d.mag));

    deltas.forEach((d, b) => {
      const cx = LABEL_W + ((b + 0.5) / BUCKETS) * plotW;
      // height in the row = level (top of row is high)
      const cy = yTop + ROW_H - 6 - d.level * (ROW_H - 12);
      // a still bucket still gets a mark — a dot — so the score never lies by omission
      const len = 4 + (d.mag / magMax) * 9;
      if (d.mag / magMax < 0.06) {
        svg.appendChild(el("circle", { cx: String(cx), cy: String(cy), r: "1.6", class: "nota-still" }));
        return;
      }
      // angle: direction the limb travelled, in the frontal plane (SVG y is flipped)
      const ang = Math.atan2(-d.dy, d.dx);
      const hx = (Math.cos(ang) * len) / 2;
      const hy = (Math.sin(ang) * len) / 2;
      svg.appendChild(
        el("line", {
          x1: String(cx - hx), y1: String(cy - hy),
          x2: String(cx + hx), y2: String(cy + hy),
          class: "nota-glyph",
        }),
      );
      // a tick on the leading end shows which way along the stroke it moved
      svg.appendChild(
        el("circle", { cx: String(cx + hx), cy: String(cy + hy), r: "1.5", class: "nota-head" }),
      );
    });
  });

  // the "now" playhead
  const playhead = el("line", {
    x1: String(LABEL_W), y1: "2",
    x2: String(LABEL_W), y2: String(height - 6),
    class: "nota-now",
  });
  svg.appendChild(playhead);

  return (frame: number) => {
    const t = nFrames > 1 ? frame / (nFrames - 1) : 0;
    const x = LABEL_W + t * plotW;
    playhead.setAttribute("x1", String(x));
    playhead.setAttribute("x2", String(x));
  };
}

// ---- the floor path --------------------------------------------------------

const FLOOR_W = 300;
const FLOOR_H = 150;
const FLOOR_PAD = 14;
const MIN_SPAN = 0.7; // metres — stops a nearly-still motion being magnified into drama

/**
 * The movement from above: the weight's trace (pelvis), with the feet's traces behind it.
 * Returns a setFrame(i) that moves the "now" dot along the path.
 */
export function renderFloorPath(
  svg: SVGSVGElement,
  motion: CanonicalMotion,
): (frame: number) => void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${FLOOR_W} ${FLOOR_H}`);
  svg.setAttribute("width", "100%");

  const idx = {
    pelvis: JOINT_INDEX["pelvis"],
    la: JOINT_INDEX["left_ankle"],
    ra: JOINT_INDEX["right_ankle"],
  };
  const xz = (j: number): [number, number][] =>
    motion.frames.map((f) => [f.positions[j][0], f.positions[j][2]]);

  const pelvis = xz(idx.pelvis);
  const left = xz(idx.la);
  const right = xz(idx.ra);
  const all = [...pelvis, ...left, ...right];

  // Fit the traces to the box, but never zoom in past MIN_SPAN — a body that barely
  // travels should LOOK like a body that barely travels.
  const xs = all.map((p) => p[0]);
  const zs = all.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const span = Math.max(
    MIN_SPAN,
    Math.max(...xs) - Math.min(...xs),
    Math.max(...zs) - Math.min(...zs),
  );
  const scale = Math.min(FLOOR_W - 2 * FLOOR_PAD, FLOOR_H - 2 * FLOOR_PAD) / span;
  const px = (x: number) => FLOOR_W / 2 + (x - cx) * scale;
  const py = (z: number) => FLOOR_H / 2 + (z - cz) * scale;

  // frame + a faint grid, so the scale is readable
  svg.appendChild(
    el("rect", {
      x: "1", y: "1",
      width: String(FLOOR_W - 2), height: String(FLOOR_H - 2),
      rx: "6", class: "floor-frame",
    }),
  );
  for (let i = 1; i < 4; i++) {
    svg.appendChild(el("line", {
      x1: String((FLOOR_W / 4) * i), y1: "1",
      x2: String((FLOOR_W / 4) * i), y2: String(FLOOR_H - 1), class: "floor-grid",
    }));
    svg.appendChild(el("line", {
      x1: "1", y1: String((FLOOR_H / 4) * i),
      x2: String(FLOOR_W - 1), y2: String((FLOOR_H / 4) * i), class: "floor-grid",
    }));
  }

  const toPath = (pts: [number, number][]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(" ");

  // the feet, faint — then the weight, bright
  svg.appendChild(el("path", { d: toPath(left), class: "floor-foot" }));
  svg.appendChild(el("path", { d: toPath(right), class: "floor-foot" }));
  svg.appendChild(el("path", { d: toPath(pelvis), class: "floor-trace" }));

  // where it began
  svg.appendChild(
    el("circle", { cx: String(px(pelvis[0][0])), cy: String(py(pelvis[0][1])), r: "3", class: "floor-start" }),
  );

  // where it is now
  const now = el("circle", { cx: "0", cy: "0", r: "4.5", class: "floor-now" });
  svg.appendChild(now);

  return (frame: number) => {
    const i = Math.max(0, Math.min(pelvis.length - 1, frame));
    now.setAttribute("cx", String(px(pelvis[i][0])));
    now.setAttribute("cy", String(py(pelvis[i][1])));
  };
}

// ---- the chronophotograph ---------------------------------------------------

const CHRONO_W = 640;
const CHRONO_H = 260;
const CHRONO_PAD = 16;
const POSES = 7; // successive exposures on the plate
const BODY_SPAN = 2.0; // metres of headroom to fit — a raised arm reaches ~1.9 m

// The plate stands a little off to the side of the body rather than square in front of it.
// Dead-on, the hips are only ~9 cm apart and the two legs collapse onto the same line — the
// figure loses its legs. A quarter-turn lets depth separate them. This changes only the
// camera, never the joints.
const TURN = Math.PI / 7; // ~26°
const COS_T = Math.cos(TURN);
const SIN_T = Math.sin(TURN);

/**
 * Marey's chronophotograph: the same body, several times, fading from past to present.
 *
 * The poses are laid out evenly across the plate — as on Marey's *moving* plate, which
 * spread successive exposures of a subject who stayed put. So the horizontal axis here is
 * TIME, not space.
 *
 * Each pose is centred on its own pelvis, which drops the body's travel entirely: a motion
 * that slides a metre sideways would otherwise walk its last exposure clean off the plate.
 * Nothing about the SHAPE is lost by this — a lean, a reach, a collapsed spine are all
 * still read against the pelvis. Only where the body went is gone, and that is the floor
 * path's job. Registers divide the labour; none of them carries everything.
 *
 * Projection is frontal — x (side) and y (up); depth is dropped.
 *
 * Returns a setFrame(i) that lights up whichever exposure the playback is nearest.
 */
export function renderChronophotograph(
  svg: SVGSVGElement,
  motion: CanonicalMotion,
): (frame: number) => void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${CHRONO_W} ${CHRONO_H}`);
  svg.setAttribute("width", "100%");

  const nFrames = motion.frames.length;
  const head = JOINT_INDEX["head"];
  const pelvis = JOINT_INDEX["pelvis"];

  const scale = (CHRONO_H - 2 * CHRONO_PAD) / BODY_SPAN;
  const ground = CHRONO_H - CHRONO_PAD;
  const slotW = (CHRONO_W - 2 * CHRONO_PAD) / POSES;

  // the floor the exposures stand on
  svg.appendChild(
    el("line", {
      x1: String(CHRONO_PAD), y1: String(ground),
      x2: String(CHRONO_W - CHRONO_PAD), y2: String(ground),
      class: "chrono-ground",
    }),
  );

  // the sampled frames, first and last always included
  const sampled = Array.from({ length: POSES }, (_, i) =>
    Math.round((i / (POSES - 1)) * (nFrames - 1)),
  );

  const poses = sampled.map((f, i) => {
    const cx = CHRONO_PAD + slotW * (i + 0.5);
    const P = motion.frames[f].positions;
    const x0 = P[pelvis][0]; // this pose's own weight — the plate travels with the body
    const z0 = P[pelvis][2];
    const px = (j: number) =>
      cx + ((P[j][0] - x0) * COS_T + (P[j][2] - z0) * SIN_T) * scale;
    const py = (j: number) => ground - P[j][1] * scale;

    // the exposure fades with age: the oldest is nearly gone, the newest is solid
    const g = el("g", {
      class: "chrono-pose",
      opacity: (0.16 + 0.84 * (i / (POSES - 1))).toFixed(2),
    });
    for (const [c, p] of motion.edges) {
      g.appendChild(
        el("line", {
          x1: px(c).toFixed(1), y1: py(c).toFixed(1),
          x2: px(p).toFixed(1), y2: py(p).toFixed(1),
          class: "chrono-bone",
        }),
      );
    }
    g.appendChild(
      el("circle", { cx: px(head).toFixed(1), cy: py(head).toFixed(1), r: "4.5", class: "chrono-head" }),
    );
    svg.appendChild(g);
    return g;
  });

  let lit = -1;
  return (frame: number) => {
    // which exposure is the playback standing in?
    const t = nFrames > 1 ? frame / (nFrames - 1) : 0;
    const i = Math.max(0, Math.min(POSES - 1, Math.round(t * (POSES - 1))));
    if (i === lit) return;
    if (lit >= 0) poses[lit].classList.remove("now");
    poses[i].classList.add("now");
    lit = i;
  };
}

// ---- the Laban-inspired score ----------------------------------------------

const LABAN_W = 360;
const LABAN_H = 280;
const LABAN_TOP = 16;
const LABAN_BOTTOM = 26; // room for the column labels
const BEATS = 6;

/** Levels, as Labanotation shades them: solid = low, hatched = middle, hollow = high. */
type Level = "low" | "mid" | "high";
const LEVEL_FILL: Record<Level, string> = {
  low: "var(--accent)",
  mid: "url(#laban-hatch)",
  high: "none",
};

/**
 * The gesture columns, in the order they are drawn (left to right on the page).
 * `centre` is the column's x; the staff sits between them at x = 174..186.
 *
 * The columns are the BODY's left and right — the staff is read as if you were the
 * performer, not as if you were watching them. That is the Labanotation convention, and
 * it is the one that matters here: the score exists to be re-embodied.
 */
const LABAN_COLS: {
  name: string;
  label: string;
  joint: string;
  anchor: string;
  centre: number;
  kind: "arm" | "leg";
}[] = [
  { name: "L arm", label: "arm", joint: "left_wrist", anchor: "left_shoulder", centre: 74, kind: "arm" },
  { name: "L leg", label: "leg", joint: "left_ankle", anchor: "pelvis", centre: 124, kind: "leg" },
  { name: "R leg", label: "leg", joint: "right_ankle", anchor: "pelvis", centre: 236, kind: "leg" },
  { name: "R arm", label: "arm", joint: "right_wrist", anchor: "right_shoulder", centre: 286, kind: "arm" },
];

// Weight-bearing is read from the FOOT joint, not the ankle: a standing ankle already sits
// ~0.09 m up, so an ankle threshold would read every planted foot as lifted. The foot joint
// rests at 0.03 m, and 0.08 m clears the ghost-cloud's few centimetres of wander without
// swallowing a real step.
const SUPPORT_FEET = ["left_foot", "right_foot"] as const;
const PLANTED = 0.08; // metres — a foot this low is carrying the body

/**
 * Level, read anatomically rather than statistically — so "high" means the same thing in
 * every motion, and two scores can be compared. (The notation strip normalises per-track,
 * which is right for reading ONE motion; here we want the scores to be comparable.)
 *
 *   arm — the wrist against its own shoulder: hanging = low, out level = middle, up = high.
 *   leg — the ankle against the floor: down = low, lifted = middle, thrown up = high.
 */
function levelOf(kind: "arm" | "leg", jointY: number, anchorY: number): Level {
  if (kind === "arm") {
    const dy = jointY - anchorY;
    if (dy < -0.2) return "low"; // a hanging arm rests ~0.57 m below the shoulder
    if (dy > 0.1) return "high";
    return "mid";
  }
  if (jointY < 0.25) return "low"; // a standing ankle rests ~0.09 m up
  if (jointY < 0.6) return "mid"; // knee-height
  return "high";
}

/**
 * A Laban-INSPIRED score. Deliberately not strict Labanotation — it is a designed
 * reduction, and the design is part of the research:
 *
 *   read bottom → top      time runs upward, one row per beat
 *   central column pair    SUPPORT — which foot is bearing weight, shaded by how deep
 *   outer columns          the limb GESTURES, body's left and right
 *   glyph fill             LEVEL (solid = low · hatched = middle · hollow = high)
 *   glyph lean             which way it went, sideways
 *   glyph width            how far it went
 *
 * A real Laban direction symbol encodes forward/back too, by its shape. This one does
 * not: side-to-side is legible in the lean, and forward/back is left to the floor path.
 * Saying which register carries which fact is more useful than one register pretending
 * to carry them all.
 *
 * Returns a setFrame(i) that walks the beat line up the staff.
 */
export function renderLabanScore(
  svg: SVGSVGElement,
  motion: CanonicalMotion,
): (frame: number) => void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("viewBox", `0 0 ${LABAN_W} ${LABAN_H}`);
  svg.setAttribute("width", "100%");

  const nFrames = motion.frames.length;
  const rowH = (LABAN_H - LABAN_TOP - LABAN_BOTTOM) / BEATS;
  const floor = LABAN_H - LABAN_BOTTOM; // beat 0 sits on this line
  const beatTop = (b: number) => floor - (b + 1) * rowH;
  const beatBottom = (b: number) => floor - b * rowH;

  // the hatch that means "middle level"
  const defs = el("defs", {});
  const pattern = el("pattern", {
    id: "laban-hatch", width: "5", height: "5",
    patternTransform: "rotate(45)", patternUnits: "userSpaceOnUse",
  });
  pattern.appendChild(el("line", { x1: "0", y1: "0", x2: "0", y2: "5", class: "laban-hatch-line" }));
  defs.appendChild(pattern);
  svg.appendChild(defs);

  // beat lines
  for (let b = 0; b <= BEATS; b++) {
    const y = floor - b * rowH;
    svg.appendChild(
      el("line", { x1: "40", y1: y.toFixed(1), x2: "320", y2: y.toFixed(1), class: "laban-beat" }),
    );
  }
  // the staff — the body's centre line, read upward
  for (const x of [174, 186]) {
    svg.appendChild(
      el("line", {
        x1: String(x), y1: String(beatTop(BEATS - 1)),
        x2: String(x), y2: String(floor), class: "laban-staff",
      }),
    );
  }

  // Each beat is a slice of the timeline; a column reads its joint over that slice.
  const slice = (b: number): [number, number] => {
    const s = Math.floor((b * nFrames) / BEATS);
    const e = Math.max(s, Math.floor(((b + 1) * nFrames) / BEATS) - 1);
    return [s, Math.min(e, nFrames - 1)];
  };
  const mean = (j: number, axis: number, s: number, e: number) => {
    let sum = 0;
    for (let f = s; f <= e; f++) sum += motion.frames[f].positions[j][axis];
    return sum / (e - s + 1);
  };

  // ---- support: which foot bears the weight, and how deep it is ----
  const pelvisIdx = JOINT_INDEX["pelvis"];
  const pelvisYs = motion.frames.map((f) => f.positions[pelvisIdx][1]);
  const pyMin = Math.min(...pelvisYs);
  const pySpan = Math.max(1e-6, Math.max(...pelvisYs) - pyMin);

  for (let b = 0; b < BEATS; b++) {
    const [s, e] = slice(b);
    // how deep the body is sitting, relative to its own range in this motion:
    // a crouch shades the support solid, standing tall leaves it hollow
    const depth = (mean(pelvisIdx, 1, s, e) - pyMin) / pySpan;
    const supportLevel: Level = depth < 0.34 ? "low" : depth < 0.67 ? "mid" : "high";

    SUPPORT_FEET.forEach((foot, i) => {
      // A foot only takes a support symbol when it is actually down. If both leave the
      // floor the column goes empty — and the gap in the staff is the notation.
      if (mean(JOINT_INDEX[foot], 1, s, e) > PLANTED) return;
      svg.appendChild(
        el("rect", {
          x: String(i === 0 ? 150 : 190), y: (beatTop(b) + 3).toFixed(1),
          width: "20", height: (rowH - 6).toFixed(1),
          fill: LEVEL_FILL[supportLevel], class: "laban-glyph",
        }),
      );
    });
  }

  // ---- the gesture columns ----
  for (const col of LABAN_COLS) {
    const j = JOINT_INDEX[col.joint];
    const a = JOINT_INDEX[col.anchor];

    // read every beat first, so width can be normalised against this column's own range —
    // a still limb should not be blown up into a big gesture
    const beats = Array.from({ length: BEATS }, (_, b) => {
      const [s, e] = slice(b);
      const P0 = motion.frames[s].positions;
      const P1 = motion.frames[e].positions;
      // the gesture is the joint RELATIVE to its anchor — a wrist's absolute travel would
      // just re-tell us where the body went
      const rel = (P: number[][], axis: number) => P[j][axis] - P[a][axis];
      const dx = rel(P1, 0) - rel(P0, 0);
      const dy = rel(P1, 1) - rel(P0, 1);
      const dz = rel(P1, 2) - rel(P0, 2);
      return {
        dx,
        mag: Math.hypot(dx, dy, dz),
        level: levelOf(col.kind, mean(j, 1, s, e), mean(a, 1, s, e)),
      };
    });
    const magMax = Math.max(1e-6, ...beats.map((x) => x.mag));
    const dxMax = Math.max(1e-6, ...beats.map((x) => Math.abs(x.dx)));

    beats.forEach((x, b) => {
      const w = 8 + (x.mag / magMax) * 14; // width = how far
      const lean = (x.dx / dxMax) * 8; // lean = which way, sideways
      const yT = beatTop(b) + 3;
      const yB = beatBottom(b) - 3;
      const hw = w / 2;
      // a parallelogram: the top edge leads, so the glyph leans the way the limb went
      const pts = [
        [col.centre - hw + lean, yT],
        [col.centre + hw + lean, yT],
        [col.centre + hw - lean, yB],
        [col.centre - hw - lean, yB],
      ]
        .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
        .join(" ");
      svg.appendChild(
        el("polygon", { points: pts, fill: LEVEL_FILL[x.level], class: "laban-glyph" }),
      );
    });

    const label = el("text", {
      x: String(col.centre), y: String(LABAN_H - 8),
      "text-anchor": "middle", class: "laban-label",
    });
    label.textContent = col.label;
    svg.appendChild(label);
  }

  // the beat line, walking upward as the body moves
  const now = el("line", {
    x1: "36", y1: String(floor), x2: "324", y2: String(floor), class: "laban-now",
  });
  svg.appendChild(now);

  return (frame: number) => {
    const t = nFrames > 1 ? frame / (nFrames - 1) : 0;
    const y = (floor - t * BEATS * rowH).toFixed(1);
    now.setAttribute("y1", y);
    now.setAttribute("y2", y);
  };
}
