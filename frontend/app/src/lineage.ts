// The prompt lineage — BodyPrompt's core contribution.
//
// Every Generate becomes a NODE in a branching tree instead of replacing the last one.
// Refining from the current node extends a line; generating again from an older node
// BRANCHES. Each node keeps the motion it was given, so clicking a node replays instantly
// (no re-fetch). The branching search itself is the artefact.
//
// This module is pure data + an SVG drawer — no three.js, no network.

import type { CanonicalMotion } from "./types";

export interface LineageNode {
  id: number;
  prompt: string;
  model: string;
  seed: number;
  motion: CanonicalMotion;
  parentId: number | null;
  childIds: number[];
}

/** A growing forest of prompt attempts. In practice there is one root (the first Generate). */
export class Lineage {
  private nodes = new Map<number, LineageNode>();
  private nextId = 1; // no Date/random — a plain counter keeps ids stable/reproducible
  currentId: number | null = null;

  /** Add a motion as a child of `parentId` (or as a root if null). Becomes current. */
  add(motion: CanonicalMotion, parentId: number | null): LineageNode {
    const node: LineageNode = {
      id: this.nextId++,
      prompt: motion.prompt,
      model: motion.model,
      seed: motion.seed,
      motion,
      parentId,
      childIds: [],
    };
    this.nodes.set(node.id, node);
    if (parentId !== null) {
      this.nodes.get(parentId)?.childIds.push(node.id);
    }
    this.currentId = node.id;
    return node;
  }

  select(id: number): LineageNode | undefined {
    if (this.nodes.has(id)) this.currentId = id;
    return this.nodes.get(id);
  }

  get(id: number): LineageNode | undefined {
    return this.nodes.get(id);
  }

  get current(): LineageNode | undefined {
    return this.currentId === null ? undefined : this.nodes.get(this.currentId);
  }

  get roots(): LineageNode[] {
    return [...this.nodes.values()].filter((n) => n.parentId === null);
  }

  get size(): number {
    return this.nodes.size;
  }
}

// ---- SVG tree rendering ----------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const ROW_H = 62; // vertical gap between depths
const COL_W = 54; // horizontal gap between leaf columns
const PAD_X = 26;
const PAD_Y = 26;
const LABEL_MAX = 18;

interface Placed {
  node: LineageNode;
  x: number;
  y: number;
}

/**
 * Tidy vertical layout: a DFS gives each LEAF the next column slot; an internal node
 * sits above the mean of its children. Depth sets the row. Simple, readable, good enough
 * for the modest trees a live search produces.
 */
function layout(lineage: Lineage): { placed: Map<number, Placed>; width: number; height: number } {
  const placed = new Map<number, Placed>();
  let nextCol = 0;
  let maxDepth = 0;

  const walk = (node: LineageNode, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    let x: number;
    if (node.childIds.length === 0) {
      x = nextCol++; // leaf takes the next column
    } else {
      const childXs = node.childIds.map((cid) => walk(lineage.get(cid)!, depth + 1));
      x = childXs.reduce((a, b) => a + b, 0) / childXs.length; // centre over children
    }
    placed.set(node.id, {
      node,
      x: PAD_X + x * COL_W,
      y: PAD_Y + depth * ROW_H,
    });
    return x;
  };

  for (const root of lineage.roots) walk(root, 0);

  const width = PAD_X * 2 + Math.max(0, nextCol - 1) * COL_W + 40;
  const height = PAD_Y * 2 + maxDepth * ROW_H + 20;
  return { placed, width, height };
}

function truncate(text: string): string {
  return text.length > LABEL_MAX ? text.slice(0, LABEL_MAX - 1) + "…" : text;
}

function el(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/** Rebuild the tree SVG from scratch and wire each node's click to `onSelect`. */
export function renderTree(
  svg: SVGSVGElement,
  lineage: Lineage,
  onSelect: (id: number) => void,
): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  if (lineage.size === 0) {
    svg.setAttribute("width", "220");
    svg.setAttribute("height", "80");
    const hint = el("text", { x: "20", y: "40", class: "tree-empty" });
    hint.textContent = "generate to begin the search…";
    svg.appendChild(hint);
    return;
  }

  const { placed, width, height } = layout(lineage);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  // edges first, so nodes sit on top
  for (const { node, x, y } of placed.values()) {
    if (node.parentId === null) continue;
    const parent = placed.get(node.parentId);
    if (!parent) continue;
    svg.appendChild(
      el("line", {
        x1: String(parent.x),
        y1: String(parent.y),
        x2: String(x),
        y2: String(y),
        class: "tree-edge",
      }),
    );
  }

  // nodes
  for (const { node, x, y } of placed.values()) {
    const isCurrent = node.id === lineage.currentId;
    const g = el("g", {
      class: `tree-node${isCurrent ? " current" : ""}`,
      transform: `translate(${x},${y})`,
      role: "button",
      tabindex: "0",
      "aria-label": `prompt: ${node.prompt}`,
    });
    g.appendChild(el("circle", { r: isCurrent ? "7" : "5", class: "tree-dot" }));
    const label = el("text", { x: "13", y: "4", class: "tree-label" });
    label.textContent = truncate(node.prompt);
    g.appendChild(label);

    const pick = () => onSelect(node.id);
    g.addEventListener("click", pick);
    g.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") pick();
    });
    svg.appendChild(g);
  }
}
