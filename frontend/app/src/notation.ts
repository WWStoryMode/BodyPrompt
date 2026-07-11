// Notation registers — the legible reduction.
//
// A stick figure shows you movement; it does not let you READ it. These two registers
// reduce a canonical motion to something a human can compare and re-embody:
//
//   · notation strip — a time-scored staff, one row per limb. Each glyph's ANGLE is the
//     direction that limb travelled, its LENGTH is how far, and its HEIGHT IN THE ROW is
//     the level it moved at (low / mid / high). Read left-to-right like a score.
//   · floor path   — the movement seen from above: where the body's weight travelled,
//     with the feet's traces behind it.
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
