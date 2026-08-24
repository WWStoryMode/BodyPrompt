/**
 * What the registers actually draw when they are given one line instead of the whole poem.
 *
 * These are drawings, and a drawing is usually visibly wrong. Two things about them are
 * not, and both are the point of this stage:
 *
 *   · a narrowed register must still be a full reading, not a crop — the same number of
 *     glyphs, renormalised — or "read one line" would just mean "see less";
 *   · a playhead outside the frames a register holds must say NOTHING, rather than sit at
 *     an edge and claim the body is somewhere it is not.
 *
 * There is no jsdom here (a dependency cannot currently be added — see the tsconfig note),
 * so the SVG is built against a DOM stub small enough to read. What that stub cannot check
 * is whether any of it is legible; that is a studio judgement and stays one.
 *
 * Run with `npm test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { JOINTS, EDGES } from "./skeleton.ts";
import type { CanonicalMotion } from "./types.ts";

// ---- the smallest DOM these registers need ----------------------------------

interface StubNode {
  tag: string;
  attrs: Record<string, string>;
  children: StubNode[];
  classes: Set<string>;
  setAttribute(k: string, v: string): void;
  appendChild(n: StubNode): StubNode;
  removeChild(n: StubNode): void;
  classList: { add(c: string): void; remove(c: string): void; contains(c: string): boolean };
  firstChild: StubNode | null;
  textContent: string;
}

function node(tag: string): StubNode {
  const self: StubNode = {
    tag,
    attrs: {},
    children: [],
    classes: new Set<string>(),
    setAttribute(k, v) {
      self.attrs[k] = v;
      if (k === "class") for (const c of v.split(/\s+/)) self.classes.add(c);
    },
    appendChild(n) {
      self.children.push(n);
      return n;
    },
    removeChild(n) {
      self.children = self.children.filter((c) => c !== n);
    },
    classList: {
      add: (c) => void self.classes.add(c),
      remove: (c) => void self.classes.delete(c),
      contains: (c) => self.classes.has(c),
    },
    get firstChild() {
      return self.children[0] ?? null;
    },
    textContent: "",
  };
  return self;
}

(globalThis as unknown as { document: unknown }).document = {
  createElementNS: (_ns: string, tag: string) => node(tag),
};

// Imported after the stub is installed: the module itself touches no DOM at load, but
// keeping the order explicit means this file cannot start failing for that reason.
const { renderNotationStrip, renderFloorPath, renderChronophotograph, renderLabanScore } =
  await import("./notation.ts");

/** Every node in the tree carrying `cls`. */
function withClass(root: StubNode, cls: string): StubNode[] {
  const found: StubNode[] = [];
  const walk = (n: StubNode) => {
    if (n.classes.has(cls)) found.push(n);
    n.children.forEach(walk);
  };
  root.children.forEach(walk);
  return found;
}

/**
 * A poem of three 60-frame lines, moving enough to draw. The body drifts sideways and one
 * wrist swings, so no register has to invent something out of a still figure.
 */
function poem(lines = 3, per = 60): CanonicalMotion {
  const total = lines * per;
  const frames = Array.from({ length: total }, (_, f) => {
    const t = f / total;
    const swing = Math.sin(f * 0.2);
    const positions = JOINTS.map((name, j) => {
      const y = 0.9 - (j % 5) * 0.15;
      if (name === "left_wrist") return [0.25 + t * 2 + swing * 0.3, 1.1 + swing * 0.4, 0.1];
      if (name === "pelvis") return [t * 2, 0.9 + swing * 0.05, t * 0.6];
      if (name === "left_foot" || name === "right_foot") return [t * 2, 0.03, t * 0.6];
      return [t * 2 + (j % 3) * 0.08, y, t * 0.6];
    });
    return { positions, rotations: [] };
  });
  return {
    schema: "bodyprompt.motion/v0",
    skeleton: "smpl-22",
    fps: 30,
    joints: [...JOINTS],
    edges: EDGES,
    frames,
    prompt: "a body remembers",
    model: "kimodo",
    seed: 1,
    segments: Array.from({ length: lines }, (_, i) => ({
      index: i,
      prompt: `line ${i + 1}`,
      start_frame: i * per,
      end_frame: (i + 1) * per,
      transition_frames: i < lines - 1 ? 5 : 0,
      duration_seconds: per / 30,
    })),
  };
}

const LINE_TWO = { range: { start: 60, end: 120 }, globalStart: 60 };

test("the whole poem is marked where its lines meet — never at its own first frame", () => {
  const svg = node("svg");
  renderNotationStrip(svg as never, poem(), { boundaries: [60, 120] });

  assert.equal(withClass(svg, "nota-seam").length, 2);
});

test("a narrowed register is a re-reading, not a crop", () => {
  const whole = node("svg");
  const line = node("svg");
  renderNotationStrip(whole as never, poem());
  renderNotationStrip(line as never, poem(), LINE_TWO);

  const glyphs = (svg: StubNode) =>
    withClass(svg, "nota-glyph").length + withClass(svg, "nota-still").length;

  // The whole point: one line gets the SAME resolution as the whole poem did, drawn
  // against its own range. Fewer glyphs would just mean "see less".
  assert.equal(glyphs(line), glyphs(whole));
  assert.equal(withClass(line, "nota-seam").length, 0); // no join inside one line
});

test("a narrowed register's playhead speaks global frames, and hides outside its line", () => {
  const svg = node("svg");
  const setFrame = renderNotationStrip(svg as never, poem(), LINE_TWO);
  const playhead = withClass(svg, "nota-now")[0];

  setFrame(90); // the middle of line 2
  assert.equal(playhead.attrs.visibility, "visible");
  const middle = Number(playhead.attrs.x1);

  setFrame(60); // its first frame
  const left = Number(playhead.attrs.x1);
  assert.ok(left < middle, "the line's own frame 0 sits at the left of the register");

  setFrame(30); // line 1 — this register cannot see the body at all
  assert.equal(playhead.attrs.visibility, "hidden");
  setFrame(150); // line 3
  assert.equal(playhead.attrs.visibility, "hidden");
});

test("the floor path ticks where each line began, and hides its 'now' off-window", () => {
  const svg = node("svg");
  const setFrame = renderFloorPath(svg as never, poem(), { boundaries: [60, 120] });
  assert.equal(withClass(svg, "floor-seam").length, 2);

  const narrowed = node("svg");
  const set = renderFloorPath(narrowed as never, poem(), LINE_TWO);
  assert.equal(withClass(narrowed, "floor-seam").length, 0);
  const now = withClass(narrowed, "floor-now")[0];
  set(90);
  assert.equal(now.attrs.visibility, "visible");
  set(10);
  assert.equal(now.attrs.visibility, "hidden");
});

test("no exposure is lit while the body is in a line the plate does not hold", () => {
  const svg = node("svg");
  const setFrame = renderChronophotograph(svg as never, poem(), LINE_TWO);
  const poses = withClass(svg, "chrono-pose");

  setFrame(90);
  assert.equal(poses.filter((p) => p.classes.has("now")).length, 1);
  setFrame(200); // line 3
  // Leaving the last exposure lit would keep claiming the body is in a pose it has left.
  assert.equal(poses.filter((p) => p.classes.has("now")).length, 0);
});

test("every register draws a whole poem, one line, and a one-line poem", () => {
  const renderers = [
    renderNotationStrip,
    renderFloorPath,
    renderChronophotograph,
    renderLabanScore,
  ];
  for (const render of renderers) {
    for (const [motion, view] of [
      [poem(), { boundaries: [60, 120] }],
      [poem(), LINE_TWO],
      [poem(1), {}], // a poem of a single line has no seams to draw
    ] as const) {
      const svg = node("svg");
      const setFrame = render(svg as never, motion, view);
      setFrame(0);
      setFrame(motion.frames.length - 1);
      assert.ok(svg.children.length > 0, `${render.name} drew nothing`);
    }
  }
});
