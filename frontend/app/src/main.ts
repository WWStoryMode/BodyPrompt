// Lab Bench — wires the prompt bar to the service and the renderer.
//
//   type a phrase  ->  POST /generate  ->  canonical motion  ->  three.js playback
//
// The motion is hand-authored fixture data served by the v0 stub (no ML). This file
// only orchestrates DOM + fetch + renderer; the drawing lives in renderer.ts.

import "./style.css";
import { StickFigureRenderer } from "./renderer";
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

// ---- renderer ----
const renderer = new StickFigureRenderer(stageEl);

let userScrubbing = false;

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

    hintEl.classList.add("hidden");
    renderer.load(motion);
    telemetryEl.innerHTML =
      `<span class="k">model</span> ${motion.model}<br>` +
      `<span class="k">prompt</span> “${motion.prompt}”<br>` +
      `<span class="k">seed</span> ${motion.seed}<br>` +
      `<span class="k">joints</span> ${motion.joints.length} · ${motion.skeleton}<br>` +
      (motion.stub ? `<span class="stub">stub · hand-authored fixture (no ML)</span>` : "");
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

// Try once on load so the stage isn't empty (fails gracefully if the service is down).
generate();
