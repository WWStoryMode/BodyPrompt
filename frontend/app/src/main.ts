// Lab Bench — wires the poem to the service and the renderer.
//
//   write lines  ->  POST /generate  ->  canonical motion  ->  three.js playback
//
// Each line of the poem is a prompt. A line can be **drafted** on its own — fast, and blind
// to its neighbours — or the whole poem can be **baked**, generated in one pass so the body
// carries from one sentence into the next. Those are different things and this file keeps
// them apart: see `updateBanner`.
//
// The selected backend may be real Kimodo or an explicitly-labelled fixture. This file
// only orchestrates DOM + fetch + renderer; the drawing lives in renderer.ts.

import "./style.css";
import { StickFigureRenderer } from "./renderer";
import { Poem, suggestedDuration, type PoemLine } from "./poem";
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
const modelEl = $<HTMLSelectElement>("model");
const durationEl = $<HTMLSelectElement>("duration");
const stepsEl = $<HTMLInputElement>("steps");
// Denoising steps: empty leaves the choice to the worker's configured default, so the UI
// never silently pins a value the backend did not choose. A number box accepts anything
// typed past its min/max, and the service rejects out-of-range values with a 422 — so
// clamp here rather than let a typo read as a failed generation.
const chosenSteps = (): number | null => {
  const raw = stepsEl.value.trim();
  if (!raw) return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(1, n));
};
// Show back what will actually be sent, so the box never disagrees with the provenance.
stepsEl.addEventListener("blur", () => {
  const n = chosenSteps();
  stepsEl.value = n === null ? "" : String(n);
});
const generateEl = $<HTMLButtonElement>("generate");
const bakeEl = $<HTMLButtonElement>("bake");
const poemLinesEl = $<HTMLDivElement>("poem-lines");
const poemBannerEl = $<HTMLDivElement>("poem-banner");
const generationStatusEl = $<HTMLSpanElement>("generation-status");
const stageEl = $<HTMLDivElement>("stage");
const telemetryEl = $<HTMLDivElement>("telemetry");
const hintEl = $<HTMLDivElement>("hint");
const playPauseEl = $<HTMLButtonElement>("playpause");
const scrubEl = $<HTMLInputElement>("scrub");
const counterEl = $<HTMLSpanElement>("counter");
const ghostsEl = $<HTMLInputElement>("ghosts");
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

// ---- renderer + the poem ----
const renderer = new StickFigureRenderer(stageEl);
const poem = new Poem(["a body remembers a place it cannot return to"]);

// ---- the poem editor ----
//
// Rows are reused across renders rather than rebuilt, so typing does not lose the caret.
// Only a line's *state* and its neighbours change on a keystroke; the input itself is
// left alone unless the model disagrees with what is on screen.

const rows = new Map<number, HTMLDivElement>();

const STATE_TITLE: Record<string, string> = {
  empty: "not generated yet",
  generating: "generating…",
  draft: "drafted alone — the body will jump into the next line",
  baked: "baked — carries on from the line before it",
  stale: "edited since it was generated",
};

function buildRow(line: PoemLine): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "poem-line";
  row.dataset.id = String(line.id);

  const dot = document.createElement("span");
  dot.className = "poem-state";

  const text = document.createElement("input");
  text.className = "poem-text";
  text.spellcheck = false;
  text.placeholder = "a line of the poem…";

  const duration = document.createElement("input");
  duration.className = "poem-dur";
  duration.type = "number";
  duration.min = "2";
  duration.max = "10";
  duration.title = "seconds for this line — blank follows the line's length";

  const loop = document.createElement("button");
  loop.className = "poem-loop";
  loop.type = "button";
  loop.textContent = "↻";
  loop.title = "loop this line";

  text.addEventListener("input", () => {
    poem.setText(line.id, text.value);
    // The suggestion moves with the words while the box is empty.
    duration.placeholder = String(suggestedDuration(text.value));
    renderPoem();
    updateBanner();
  });
  text.addEventListener("focus", () => selectLine(line.id));
  text.addEventListener("keydown", (e) => onLineKey(e, line.id, text));

  duration.addEventListener("change", () => {
    const value = duration.value.trim();
    poem.setDuration(line.id, value ? Number(value) : null);
    renderPoem();
    updateBanner();
  });

  loop.addEventListener("click", () => toggleLoopLine(line.id));
  row.addEventListener("dblclick", () => jumpToLine(line.id));

  row.append(dot, text, duration, loop);
  return row;
}

function renderPoem(): void {
  for (const [id, row] of rows) {
    if (!poem.get(id)) {
      row.remove();
      rows.delete(id);
    }
  }
  poem.all.forEach((line, at) => {
    let row = rows.get(line.id);
    if (!row) {
      row = buildRow(line);
      rows.set(line.id, row);
    }
    if (poemLinesEl.children[at] !== row) {
      poemLinesEl.insertBefore(row, poemLinesEl.children[at] ?? null);
    }
    const text = row.querySelector<HTMLInputElement>(".poem-text")!;
    const duration = row.querySelector<HTMLInputElement>(".poem-dur")!;
    // Never overwrite what someone is typing.
    if (document.activeElement !== text && text.value !== line.text) text.value = line.text;
    if (document.activeElement !== duration) {
      duration.value = line.durationSeconds === null ? "" : String(line.durationSeconds);
    }
    duration.placeholder = String(suggestedDuration(line.text));
    row.dataset.state = line.state;
    row.classList.toggle("selected", line.id === poem.selectedId);
    row.classList.toggle("looping", loopingLineId === line.id);
    row.querySelector(".poem-state")!.setAttribute("title", STATE_TITLE[line.state] ?? "");
  });
}

function selectLine(id: number): void {
  if (poem.selectedId === id) return;
  poem.selectedId = id;
  renderPoem();
  // The registers and the ghost-cloud follow the line being worked on.
  if (!poem.bakeIsCurrent) showCurrent({ keepPlayhead: true });
}

function focusLine(id: number, caret?: number): void {
  const text = rows.get(id)?.querySelector<HTMLInputElement>(".poem-text");
  if (!text) return;
  text.focus();
  if (caret !== undefined) text.setSelectionRange(caret, caret);
}

/** Editor keys. Enter splits, Backspace at the start merges, arrows move between lines. */
function onLineKey(e: KeyboardEvent, id: number, text: HTMLInputElement): void {
  const index = poem.indexOf(id);
  const lines = poem.all;
  if (e.key === "Enter") {
    e.preventDefault();
    const tail = text.value.slice(text.selectionStart ?? text.value.length);
    if (tail) {
      poem.setText(id, text.value.slice(0, text.selectionStart ?? 0));
      text.value = poem.get(id)!.text;
    }
    const created = poem.insertAfter(id, tail);
    renderPoem();
    updateBanner();
    focusLine(created.id, 0);
  } else if (e.key === "Backspace" && text.selectionStart === 0 && text.selectionEnd === 0) {
    const previous = lines[index - 1];
    if (!previous) return;
    e.preventDefault();
    const caret = previous.text.length;
    poem.setText(previous.id, previous.text + text.value);
    poem.remove(id);
    renderPoem();
    updateBanner();
    focusLine(previous.id, caret);
  } else if (e.key === "ArrowUp" && lines[index - 1]) {
    e.preventDefault();
    focusLine(lines[index - 1].id, lines[index - 1].text.length);
  } else if (e.key === "ArrowDown" && lines[index + 1]) {
    e.preventDefault();
    focusLine(lines[index + 1].id, lines[index + 1].text.length);
  } else if (e.key === "Escape") {
    text.blur();
  }
}

// Which line, if any, the playhead is pinned inside.
let loopingLineId: number | null = null;

function toggleLoopLine(id: number): void {
  loopingLineId = loopingLineId === id ? null : id;
  const at = poem.written.findIndex((line) => line.id === id);
  if (loopingLineId !== null && at >= 0) {
    renderer.setLoop("line", at);
    renderer.seekSegment(at);
  } else {
    renderer.setLoop("whole");
  }
  renderPoem();
}

function jumpToLine(id: number): void {
  const at = poem.written.findIndex((line) => line.id === id);
  if (at >= 0) renderer.seekSegment(at);
}

/**
 * Say plainly what is on the stage.
 *
 * A drafted poem and a baked one look similar and mean different things: drafts are
 * generated blind to each other, so the body jumps between lines. Nothing smooths that
 * over, and this banner refuses to let it pass unremarked.
 */
function updateBanner(): void {
  let message = "";
  if (poem.bakedMotion && !poem.bakeIsCurrent) {
    message =
      "the poem has changed since it was baked — what is playing is the older reading";
  } else if (!poem.bakedMotion && poem.written.some((line) => line.motion)) {
    message =
      "drafted lines: each was generated on its own, so the body jumps between them. " +
      "Bake for the real reading.";
  }
  poemBannerEl.textContent = message;
  poemBannerEl.classList.toggle("hidden", !message);
}

let userScrubbing = false;



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
  // One line, three models. The triptych compares models on a single phrase, so it takes
  // the line being worked on rather than the whole poem.
  const prompt = poem.selected?.text.trim() || poem.written[0]?.text.trim() || "";
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
            denoising_steps: chosenSteps(),
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
// Not a separate page: the same session, the same poem. The performer keeps working
// (writing, drafting, baking) while the room sees only the body, the line it is
// answering, and the score. Slowed down, because a human has to be able to follow it.

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

/**
 * Put the poem on the stage.
 *
 * A current bake plays as one continuous motion. Otherwise the drafted lines play in order,
 * as separate clips — which is exactly what they are, seams and all.
 */
function showCurrent(opts: { keepPlayhead?: boolean } = {}): void {
  const baked = poem.bakeIsCurrent ? poem.bakedMotion : poem.bakedMotion;
  const usingBake = poem.bakeIsCurrent && baked !== null;
  const drafts = poem.written
    .map((line) => line.motion)
    .filter((motion): motion is CanonicalMotion => motion !== null);

  if (usingBake && baked) {
    current = baked;
    renderer.loadSequence([baked], { keepPlayhead: opts.keepPlayhead });
  } else if (baked && drafts.length === 0) {
    // Edited since baking, with nothing drafted to show instead: keep the old reading on
    // the stage rather than going blank, and let the banner say it is out of date.
    current = baked;
    renderer.loadSequence([baked], { keepPlayhead: opts.keepPlayhead });
  } else if (drafts.length) {
    const selected = poem.selected;
    // The ghost-cloud is a per-line instrument: it shows the line being worked on.
    const ghosts = selected?.motion?.variants ?? [];
    current = selected?.motion ?? drafts[0];
    renderer.loadSequence(drafts, { ghosts, keepPlayhead: opts.keepPlayhead });
  } else {
    return; // nothing generated yet — the hint is still on screen
  }

  hintEl.classList.add("hidden");
  renderer.setGhostsVisible(ghostsEl.checked);
  buildScore();
  updateBanner();
  showTelemetry(usingBake);
}

function showTelemetry(usingBake: boolean): void {
  const motion = current;
  if (!motion) return;
  const ghostCount = motion.variants?.length ?? 0;
  const provenance = motion.provenance;
  const safe = (value: unknown) =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lineCount = poem.written.length;
  telemetryEl.innerHTML =
    `<span class="k">model</span> ${safe(motion.model)}<br>` +
    `<span class="k">poem</span> ${lineCount} line${lineCount === 1 ? "" : "s"} · ` +
    // The distinction the whole design turns on, stated on the stage itself.
    (usingBake ? "baked · continuous" : "drafted · lines generated apart") + `<br>` +
    `<span class="k">seed</span> ${motion.seed}<br>` +
    `<span class="k">joints</span> ${motion.joints.length} · ${motion.skeleton}<br>` +
    (provenance
      ? `<span class="k">source</span> ${safe(provenance.source)} · ` +
        `${safe(provenance.model_version)}<br>` +
        `<span class="k">generated</span> ${(provenance.inference_ms / 1000).toFixed(1)} s` +
        (provenance.denoising_steps
          ? ` · ${provenance.denoising_steps} steps`
          : "") +
        `<br>`
      : "") +
    (ghostCount
      ? `<span class="k">cloud</span> ${ghostCount} other seeds<br>`
      : "") +
    (motion.stub ? `<span class="stub">stub · hand-authored fixture (no ML)</span>` : "");
}

// Which line the playhead was inside last tick, so the DOM is only touched when it moves.
let shownSegment = -1;

renderer.onFrame(({ frame, total, fps, playing, segmentIndex }) => {
  lastFrame = frame;
  playPauseEl.textContent = playing ? "Pause" : "Play";
  counterEl.textContent = `frame ${frame} / ${total - 1}  ·  ${fps} fps`;
  if (!userScrubbing && total > 1) {
    scrubEl.value = String(Math.round((frame / (total - 1)) * 1000));
  }
  // walk the "now" marker through every open register
  for (const set of playheads) set(frame);

  if (segmentIndex !== shownSegment) {
    shownSegment = segmentIndex;
    const line = poem.written[segmentIndex];
    // The room reads the sentence the body is answering right now, not the whole poem.
    if (line) perfPhraseEl.textContent = `“${line.text}”`;
    for (const [id, row] of rows) row.classList.toggle("playing", id === line?.id);
  }
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
  bakeEl.disabled = on;
  generationStatusEl.textContent = message;
  generationStatusEl.className = `generation-status${on ? " busy" : ""}`;
}

function generationFailed(err: unknown, keeping: string): void {
  hintEl.classList.remove("hidden");
  hintEl.innerHTML =
    `Generation failed: ${String((err as Error).message)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}.<br>` +
    keeping;
  generationStatusEl.textContent = "failed";
  generationStatusEl.className = "generation-status error";
}

async function post(body: unknown): Promise<CanonicalMotion> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await responseError(res));
  const motion = (await res.json()) as CanonicalMotion;
  if (!motion.frames?.length) throw new Error("motion had no frames");
  return motion;
}

/**
 * Draft one line on its own.
 *
 * Fast, and deliberately blind to the rest of the poem: this line does not know where the
 * body will be when it arrives. That is what `Bake` is for.
 */
async function draftLine(id: number | null = poem.selectedId): Promise<void> {
  const line = id === null ? undefined : poem.get(id);
  if (!line || !line.text.trim()) return;
  const started = performance.now();
  poem.markGenerating(line.id);
  renderPoem();
  setGenerating(true, "drafting…");
  try {
    const motion = await post({
      model: modelEl.value,
      prompt: line.text.trim(),
      // The ghost-cloud is per line, so it is only asked for when it is switched on.
      variants: ghostsEl.checked ? VARIANTS : 1,
      duration_seconds: poem.durationOf(line),
      denoising_steps: chosenSteps(),
    });
    poem.recordDraft(line.id, motion);
    showCurrent();
    generationStatusEl.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
  } catch (err) {
    poem.setText(line.id, line.text); // knocks it out of "generating"
    generationFailed(err, "The line is unchanged.");
  } finally {
    renderPoem();
    setGenerating(false);
  }
}

/**
 * Bake the whole poem: every line in one pass, each conditioned on the body the line
 * before it left behind. This is the real reading.
 */
async function bake(): Promise<void> {
  const lines = poem.toLines();
  if (!lines.length) return;
  const started = performance.now();
  setGenerating(true, `baking ${lines.length} lines…`);
  try {
    const motion = await post({
      model: modelEl.value,
      lines,
      denoising_steps: chosenSteps(),
    });
    poem.recordBake(motion);
    loopingLineId = null;
    renderer.setLoop("whole");
    showCurrent();
    generationStatusEl.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
  } catch (err) {
    generationFailed(err, "The previous reading is still on the stage.");
  } finally {
    renderPoem();
    setGenerating(false);
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
// The bar drives whichever instrument is open: the triptych compares one line across
// models, the bench drafts that line into the poem.
function draftHere(): void {
  if (comparing) void generateTriptych();
  else void draftLine();
}

generateEl.addEventListener("click", draftHere);
bakeEl.addEventListener("click", () => void bake());
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

// Stage shortcuts. Ignored while typing — which, now that the instrument is an editor, is
// most of the time. Escape always gets you out: you do not want to be hunting for a mouse
// in front of an audience.
const isTyping = (): boolean =>
  document.activeElement instanceof HTMLInputElement ||
  document.activeElement instanceof HTMLTextAreaElement;

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (performing) setPerforming(false);
    else if (comparing) setComparing(false);
    else if (reading) setReading(false);
    else (document.activeElement as HTMLElement | null)?.blur();
    return;
  }
  if (isTyping()) return;

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
    case "d":
      void draftLine();
      break;
    case "b":
      void bake();
      break;
    case "l":
      if (poem.selectedId !== null) toggleLoopLine(poem.selectedId);
      break;
  }
});

// Draw the poem, then draft its first line so the stage is not empty (and fail gracefully
// if the service is down). Bake is a deliberate act, never something that just happens.
renderPoem();
updateBanner();
void refreshCapabilities().then(() => draftLine());

// Boot flags: ?perform=1 goes straight to the projectable stage (for plugging into a
// projector without fumbling through chrome in front of a room); ?compare=1 opens the
// triptych; ?registers=1 opens the four notation registers.
const boot = new URLSearchParams(location.search);
if (boot.has("perform")) setPerforming(true);
if (boot.has("compare")) setComparing(true);
if (boot.has("registers")) setReading(true);
