// Lab Bench — wires the prompt bar to the service and the renderer.
//
//   type a phrase  ->  POST /generate  ->  canonical motion  ->  three.js playback
//
// The selected backend may be real Kimodo or an explicitly-labelled fixture. This file
// only orchestrates DOM + fetch + renderer; the drawing lives in renderer.ts.

import "./style.css";
import { StickFigureRenderer } from "./renderer";
import { Lineage, renderTree } from "./lineage";
import {
  renderChronophotograph,
  renderFloorPath,
  renderLabanScore,
  renderNotationStrip,
} from "./notation";
import type { CanonicalMotion } from "./types";

// Where the FastAPI service listens. Keep in sync with service/ CORS + --port.
const API_BASE = "http://localhost:8000";

// How many motions one prompt returns: the primary + (VARIANTS - 1) ghosts.
const VARIANTS = 4;

// ---- DOM ----
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const promptEl = $<HTMLInputElement>("prompt");
const modelEl = $<HTMLSelectElement>("model");
const durationEl = $<HTMLSelectElement>("duration");
const generateEl = $<HTMLButtonElement>("generate");
const generationStatusEl = $<HTMLSpanElement>("generation-status");
const stageEl = $<HTMLDivElement>("stage");
const telemetryEl = $<HTMLDivElement>("telemetry");
const hintEl = $<HTMLDivElement>("hint");
const playPauseEl = $<HTMLButtonElement>("playpause");
const scrubEl = $<HTMLInputElement>("scrub");
const counterEl = $<HTMLSpanElement>("counter");
const ghostsEl = $<HTMLInputElement>("ghosts");
const lineageSvgEl = document.getElementById("lineage-svg") as unknown as SVGSVGElement;
const notationSvgEl = document.getElementById("notation-svg") as unknown as SVGSVGElement;
const floorSvgEl = document.getElementById("floor-svg") as unknown as SVGSVGElement;
const appEl = $<HTMLDivElement>("app");
const performEl = $<HTMLButtonElement>("perform");
const triptychEl = $<HTMLButtonElement>("triptych");
const registersBtnEl = $<HTMLButtonElement>("registers-btn");
const modePillEl = $<HTMLSpanElement>("mode-pill");
const perfPhraseEl = $<HTMLDivElement>("perf-phrase");
const perfTempoEl = $<HTMLSpanElement>("perf-tempo");
const scoreTitleEl = $<HTMLDivElement>("score-title");

// the 2×2 registers view — the same motion, made legible four ways at once
const svg = (id: string) => document.getElementById(id) as unknown as SVGSVGElement;
const regChronoSvgEl = svg("reg-chrono-svg");
const regStripSvgEl = svg("reg-strip-svg");
const regFloorSvgEl = svg("reg-floor-svg");
const regLabanSvgEl = svg("reg-laban-svg");

// The score is rebuilt once per motion; playback only moves these playheads.
let playheads: ((frame: number) => void)[] = [];
let current: CanonicalMotion | null = null;
let lastFrame = 0;

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

// ---- the triptych: one prompt, three models ----
//
// The models keep their NATIVE way of authoring — write / voice / sculpt — because the
// difference in *how you author* is itself part of the research. (Only `write` is wired
// up; voice and sculpt are labelled but not built.)
//
// Ghosts are off here on purpose: the ghost-cloud compares SEEDS, the triptych compares
// MODELS. Overlaying both would just be noise.

const TRI_MODELS = [
  { id: "snapmogen", accent: 0xe9b872 },
  { id: "language-of-motion", accent: 0xc78ad0 },
  { id: "kimodo", accent: 0x74a7c8 },
];

let comparing = false;
const triRenderers = new Map<string, StickFigureRenderer>();

/** Renderers are built lazily — a WebGL context per panel is not free. */
function triRenderer(modelId: string, accent: number): StickFigureRenderer {
  let r = triRenderers.get(modelId);
  if (!r) {
    const host = document.getElementById(`tri-stage-${modelId}`) as HTMLDivElement;
    r = new StickFigureRenderer(host, { accent, grid: false });
    triRenderers.set(modelId, r);
  }
  return r;
}

/** Ask all three models the same question, at once. */
async function generateTriptych(): Promise<void> {
  const prompt = promptEl.value;
  await Promise.all(
    TRI_MODELS.map(async ({ id, accent }) => {
      const footEl = document.getElementById(`tri-foot-${id}`) as HTMLDivElement;
      const r = triRenderer(id, accent);
      try {
        const res = await fetch(`${API_BASE}/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: id,
            prompt,
            variants: 1,
            duration_seconds: Number(durationEl.value),
          }),
        });
        if (!res.ok) throw new Error(await responseError(res));
        const motion = (await res.json()) as CanonicalMotion;
        r.load(motion);
        footEl.textContent =
          `seed ${motion.seed} · ${motion.frames.length} frames · ` +
          `${motion.provenance?.source ?? (motion.stub ? "fixture" : "unknown")}`;
      } catch (err) {
        footEl.textContent = `error: ${(err as Error).message}`;
      }
    }),
  );
}

function setComparing(on: boolean): void {
  if (on && reading) setReading(false); // both take the whole stage — only one at a time
  comparing = on;
  appEl.classList.toggle("comparing", on);
  triptychEl.textContent = on ? "Close" : "Compare";
  modePillEl.textContent = on ? "Triptych · three models" : "Search instrument · live";
  if (on) generateTriptych();
}

// ---- the notation registers ----
//
// The right-hand rail always carries two registers, small. The registers VIEW opens all
// four, large: chronophotograph, strip, floor path, Laban-inspired score. No register is
// complete on its own — what each one drops is the point, and you read them together.

let reading = false;

/**
 * Rebuild every register from the current motion, and re-seat the playheads.
 * The registers view is only drawn while it is open — four more SVGs is not free, and it
 * is closed most of the time.
 */
function buildScore(): void {
  if (!current) return;
  playheads = [
    renderNotationStrip(notationSvgEl, current),
    renderFloorPath(floorSvgEl, current),
  ];
  if (reading) {
    playheads.push(
      renderChronophotograph(regChronoSvgEl, current),
      renderNotationStrip(regStripSvgEl, current),
      renderFloorPath(regFloorSvgEl, current),
      renderLabanScore(regLabanSvgEl, current),
    );
  }
  // the renderer only emits while playing, so a score built during a pause would sit at
  // frame 0 until you hit play — put the playheads where the body actually is
  for (const set of playheads) set(lastFrame);
}

function setReading(on: boolean): void {
  if (on && comparing) setComparing(false); // only one full-stage view at a time
  reading = on;
  appEl.classList.toggle("reading", on);
  registersBtnEl.textContent = on ? "Close" : "Read";
  modePillEl.textContent = on ? "Notation registers · four ways" : "Search instrument · live";
  buildScore();
}

// ---- performance mode ----
//
// Not a separate page: the same session, the same lineage. The performer keeps working
// (typing, generating, branching) while the room sees only the body, the phrase and the
// score. Slowed down, because a human has to be able to follow and re-embody it.

const TEMPOS = [0.5, 0.25, 1]; // performance opens at half speed; T cycles
const FULL_SPEED = TEMPOS.indexOf(1);
let performing = false;
// Where T picks up from. The bench plays at full speed, so it starts here and the first
// press steps to 0.5x; performance mode re-seats it at 0.5x (index 0) when it opens.
let tempoIdx = FULL_SPEED;

function setTempo(rate: number): void {
  renderer.setTempo(rate);
  perfTempoEl.textContent = `${rate}× tempo`;
}

function setPerforming(on: boolean): void {
  performing = on;
  appEl.classList.toggle("performing", on);
  renderer.setPerformanceMode(on);

  performEl.textContent = on ? "Exit" : "Perform";
  modePillEl.textContent = on ? "Performance" : "Search instrument · live";
  scoreTitleEl.textContent = on ? "the score · for the body" : "notation · the score";

  if (on) {
    tempoIdx = 0; // performance opens at half speed — a body has to be able to follow it
    setTempo(TEMPOS[tempoIdx]);
    renderer.play();
  } else {
    tempoIdx = FULL_SPEED;
    setTempo(TEMPOS[tempoIdx]);
  }
}

function cycleTempo(): void {
  tempoIdx = (tempoIdx + 1) % TEMPOS.length;
  setTempo(TEMPOS[tempoIdx]);
}

// Load a motion into the stage + telemetry. Shared by Generate and node-replay.
// A motion carries its own ghost-cloud in `variants`, so replaying a past node
// restores that node's cloud too.
function showMotion(motion: CanonicalMotion): void {
  hintEl.classList.add("hidden");
  current = motion;
  renderer.load(motion);
  renderer.setGhostsVisible(ghostsEl.checked);

  // rebuild the legible reduction for this motion
  buildScore();

  // the phrase the room is watching the body search for
  perfPhraseEl.textContent = `“${motion.prompt}”`;

  const ghostCount = motion.variants?.length ?? 0;
  const provenance = motion.provenance;
  const safe = (value: unknown) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  telemetryEl.innerHTML =
    `<span class="k">model</span> ${safe(motion.model)}<br>` +
    `<span class="k">prompt</span> “${safe(motion.prompt)}”<br>` +
    `<span class="k">seed</span> ${motion.seed}<br>` +
    `<span class="k">joints</span> ${motion.joints.length} · ${motion.skeleton}<br>` +
    (provenance
      ? `<span class="k">source</span> ${safe(provenance.source)} · ` +
        `${safe(provenance.model_version)}<br>` +
        `<span class="k">generated</span> ${(provenance.inference_ms / 1000).toFixed(1)} s<br>`
      : "") +
    (ghostCount
      ? `<span class="k">cloud</span> ${ghostCount} other seeds<br>`
      : "") +
    (motion.stub ? `<span class="stub">stub · hand-authored fixture (no ML)</span>` : "");
}

renderer.onFrame(({ frame, total, fps, playing }) => {
  lastFrame = frame;
  playPauseEl.textContent = playing ? "Pause" : "Play";
  counterEl.textContent = `frame ${frame} / ${total - 1}  ·  ${fps} fps`;
  if (!userScrubbing && total > 1) {
    scrubEl.value = String(Math.round((frame / (total - 1)) * 1000));
  }
  // walk the "now" marker through every open register
  for (const set of playheads) set(frame);
});

// ---- generate ----
async function responseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string };
    return body.detail ?? `service responded ${res.status}`;
  } catch {
    return `service responded ${res.status}`;
  }
}

function setGenerating(on: boolean, message = ""): void {
  generateEl.disabled = on;
  generateEl.textContent = on ? "…" : "Generate";
  generationStatusEl.textContent = message;
  generationStatusEl.className = `generation-status${on ? " busy" : ""}`;
}

async function generate(): Promise<void> {
  const started = performance.now();
  setGenerating(true, "generating…");
  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: modelEl.value,
        prompt: promptEl.value,
        variants: VARIANTS, // ask for the ghost-cloud alongside the primary
        duration_seconds: Number(durationEl.value),
      }),
    });
    if (!res.ok) throw new Error(await responseError(res));
    const motion = (await res.json()) as CanonicalMotion;
    if (!motion.frames?.length) throw new Error("motion had no frames");

    // A new attempt becomes a child of the currently-selected node (root if none) —
    // refining from the tip extends a line; generating from an older node branches.
    lineage.add(motion, lineage.currentId);
    showMotion(motion);
    drawTree();
    generationStatusEl.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
  } catch (err) {
    hintEl.classList.remove("hidden");
    hintEl.innerHTML =
      `Generation failed: ${String((err as Error).message)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}.<br>` +
      `The previous motion is still in the lineage.`;
    generationStatusEl.textContent = "failed";
    generationStatusEl.className = "generation-status error";
  } finally {
    generateEl.disabled = false;
    generateEl.textContent = "Generate";
    if (!generationStatusEl.classList.contains("error")) {
      generationStatusEl.className = "generation-status";
    }
  }
}

/** The backend, not static HTML, is the source of truth about what is real. */
async function refreshCapabilities(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return;
    const health = (await res.json()) as {
      capabilities?: { model: string; source: string; ready: boolean }[];
    };
    for (const capability of health.capabilities ?? []) {
      const option = modelEl.querySelector<HTMLOptionElement>(
        `option[value="${capability.model}"]`,
      );
      if (!option) continue;
      const name = capability.model === "language-of-motion"
        ? "Language of Motion"
        : capability.model === "snapmogen" ? "SnapMoGen" : "Kimodo";
      const state = capability.source === "fixture"
        ? "stub"
        : capability.ready ? "real" : "real · unavailable";
      option.textContent = `${name} · ${state}`;
      const triptychName = document.getElementById(`tri-name-${capability.model}`);
      if (triptychName) triptychName.textContent = `${name} · ${state}`;
    }
  } catch {
    // Generate owns the full actionable service error; leave "checking…" honest here.
  }
}

// ---- events ----
// One prompt bar drives whichever instrument is open.
function generateHere(): void {
  if (comparing) generateTriptych();
  else generate();
}

generateEl.addEventListener("click", generateHere);
promptEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") generateHere();
});
triptychEl.addEventListener("click", () => setComparing(!comparing));
registersBtnEl.addEventListener("click", () => setReading(!reading));

playPauseEl.addEventListener("click", () => {
  renderer.togglePlay();
  // in the triptych the three panels move together — comparing motions that are out of
  // step with each other would tell you nothing
  for (const r of triRenderers.values()) r.togglePlay();
});
ghostsEl.addEventListener("change", () => renderer.setGhostsVisible(ghostsEl.checked));

scrubEl.addEventListener("input", () => {
  userScrubbing = true;
  const at = Number(scrubEl.value) / 1000;
  renderer.seek(at);
  for (const r of triRenderers.values()) r.seek(at);
});
scrubEl.addEventListener("change", () => {
  userScrubbing = false;
});

performEl.addEventListener("click", () => setPerforming(!performing));

// Stage shortcuts. Ignored while typing a prompt — except Escape, which always gets you
// out (you do not want to be hunting for a mouse in front of an audience).
window.addEventListener("keydown", (e) => {
  const typing = document.activeElement === promptEl;

  if (e.key === "Escape") {
    if (performing) setPerforming(false);
    else if (comparing) setComparing(false);
    else if (reading) setReading(false);
    else promptEl.blur();
    return;
  }
  if (typing) return;

  switch (e.key.toLowerCase()) {
    case " ":
      e.preventDefault(); // don't scroll the page
      playPauseEl.click(); // one path, so the triptych stays in step
      break;
    case "c":
      setComparing(!comparing);
      break;
    case "r":
      setReading(!reading);
      break;
    case "p":
      setPerforming(!performing);
      break;
    case "t":
      cycleTempo();
      break;
    case "g":
      ghostsEl.checked = !ghostsEl.checked;
      renderer.setGhostsVisible(ghostsEl.checked);
      break;
  }
});

// Draw the (empty) tree, then generate once on load so the stage isn't empty and the
// search has a root (fails gracefully if the service is down).
drawTree();
void refreshCapabilities().then(generate);

// Boot flags: ?perform=1 goes straight to the projectable stage (for plugging into a
// projector without fumbling through chrome in front of a room); ?compare=1 opens the
// triptych; ?registers=1 opens the four notation registers.
const boot = new URLSearchParams(location.search);
if (boot.has("perform")) setPerforming(true);
if (boot.has("compare")) setComparing(true);
if (boot.has("registers")) setReading(true);
