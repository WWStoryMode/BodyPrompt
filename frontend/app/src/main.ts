// Lab Bench — wires the prompt bar to the service and the renderer.
//
//   type a phrase  ->  POST /generate  ->  canonical motion  ->  three.js playback
//
// The motion is hand-authored fixture data served by the v0 stub (no ML). This file
// only orchestrates DOM + fetch + renderer; the drawing lives in renderer.ts.

import "./style.css";
import { StickFigureRenderer } from "./renderer";
import { Lineage, renderTree } from "./lineage";
import type { CanonicalMotion } from "./types";

// Where the FastAPI service listens. Keep in sync with service/ CORS + --port.
const API_BASE = "http://localhost:8000";

// ---- DOM ----
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const promptEl = $<HTMLInputElement>("prompt");
const modelEl = $<HTMLSelectElement>("model");
const generateEl = $<HTMLButtonElement>("generate");
const stageEl = $<HTMLDivElement>("stage");
const telemetryEl = $<HTMLDivElement>("telemetry");
const hintEl = $<HTMLDivElement>("hint");
const playPauseEl = $<HTMLButtonElement>("playpause");
const scrubEl = $<HTMLInputElement>("scrub");
const counterEl = $<HTMLSpanElement>("counter");
const lineageSvgEl = document.getElementById("lineage-svg") as unknown as SVGSVGElement;

// ---- renderer + lineage ----
const renderer = new StickFigureRenderer(stageEl);
const lineage = new Lineage();

let userScrubbing = false;

// Redraw the lineage tree; clicking a node replays its stored motion (no re-fetch).
function drawTree(): void {
  renderTree(lineageSvgEl, lineage, (id) => {
    const node = lineage.select(id);
    if (!node) return;
    promptEl.value = node.prompt; // so refining from here branches off this node
    showMotion(node.motion);
    drawTree();
  });
}

// Load a motion into the stage + telemetry. Shared by Generate and node-replay.
function showMotion(motion: CanonicalMotion): void {
  hintEl.classList.add("hidden");
  renderer.load(motion);
  telemetryEl.innerHTML =
    `<span class="k">model</span> ${motion.model}<br>` +
    `<span class="k">prompt</span> “${motion.prompt}”<br>` +
    `<span class="k">seed</span> ${motion.seed}<br>` +
    `<span class="k">joints</span> ${motion.joints.length} · ${motion.skeleton}<br>` +
    (motion.stub ? `<span class="stub">stub · hand-authored fixture (no ML)</span>` : "");
}

renderer.onFrame(({ frame, total, fps, playing }) => {
  playPauseEl.textContent = playing ? "Pause" : "Play";
  counterEl.textContent = `frame ${frame} / ${total - 1}  ·  ${fps} fps`;
  if (!userScrubbing && total > 1) {
    scrubEl.value = String(Math.round((frame / (total - 1)) * 1000));
  }
});

// ---- generate ----
async function generate(): Promise<void> {
  generateEl.disabled = true;
  generateEl.textContent = "…";
  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: modelEl.value, prompt: promptEl.value }),
    });
    if (!res.ok) throw new Error(`service responded ${res.status}`);
    const motion = (await res.json()) as CanonicalMotion;
    if (!motion.frames?.length) throw new Error("motion had no frames");

    // A new attempt becomes a child of the currently-selected node (root if none) —
    // refining from the tip extends a line; generating from an older node branches.
    lineage.add(motion, lineage.currentId);
    showMotion(motion);
    drawTree();
  } catch (err) {
    hintEl.classList.remove("hidden");
    hintEl.innerHTML =
      `Couldn't reach the service (${(err as Error).message}).<br>` +
      `Start it, then click <b>Generate</b>:<br>` +
      `<code>cd service &amp;&amp; uv run uvicorn app.main:app --port 8000</code>`;
  } finally {
    generateEl.disabled = false;
    generateEl.textContent = "Generate";
  }
}

// ---- events ----
generateEl.addEventListener("click", generate);
promptEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") generate();
});
playPauseEl.addEventListener("click", () => renderer.togglePlay());

scrubEl.addEventListener("input", () => {
  userScrubbing = true;
  renderer.seek(Number(scrubEl.value) / 1000);
});
scrubEl.addEventListener("change", () => {
  userScrubbing = false;
});

// Draw the (empty) tree, then generate once on load so the stage isn't empty and the
// search has a root (fails gracefully if the service is down).
drawTree();
generate();
