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
import type { RegisterView } from "./notation";
import type { CanonicalMotion } from "./types";
import { openAutosave } from "./autosave";
import { askFor, continuityLabel, readPanel } from "./triptych";
import { fromSession, restore, sessionFilename, toSession } from "./session";

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
const triScopeEl = $<HTMLButtonElement>("tri-scope");
const triTitleEl = $<HTMLSpanElement>("tri-title");
const triPhraseEl = $<HTMLSpanElement>("tri-phrase");
const triBannerEl = $<HTMLDivElement>("tri-banner");
const registersBtnEl = $<HTMLButtonElement>("registers-btn");
const modePillEl = $<HTMLSpanElement>("mode-pill");
const perfPhraseEl = $<HTMLDivElement>("perf-phrase");
const perfTempoEl = $<HTMLSpanElement>("perf-tempo");
const scoreTitleEl = $<HTMLSpanElement>("score-title");
const scoreScopeEl = $<HTMLButtonElement>("score-scope");
const sessionStatusEl = $<HTMLSpanElement>("session-status");
const sessionExportEl = $<HTMLButtonElement>("session-export");
const sessionImportEl = $<HTMLButtonElement>("session-import");
const sessionNewEl = $<HTMLButtonElement>("session-new");
const sessionFileEl = $<HTMLInputElement>("session-file");

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

// What the registers are drawing, in the GLOBAL frames the playhead speaks.
//
// A baked poem is one clip, so its first frame is global frame 0. A drafted poem is a run
// of clips and the registers only ever hold one of them — the selected line's — so that
// clip starts somewhere partway through. Without this offset the "now" marker on a drafted
// poem walks off the end of the register it is drawn on.
let stageStart = 0;
/** Global frames where a line begins. Only a bake has these; a draft has no seams to mark. */
let stageBoundaries: number[] = [];
/** The poem lines the timeline's entries correspond to, in order. */
let playingLines: PoemLine[] = [];

// ---- renderer + the poem ----
const renderer = new StickFigureRenderer(stageEl);
// Not `const`: a session can be opened from a file, or restored from the browser, and what
// arrives is a whole poem rather than an edit to this one. Everything that reads `poem`
// reads it through this binding, and `adoptPoem` is the only thing that moves it.
let poem = new Poem(["a body remembers a place it cannot return to"]);

// ---- where the search lives ----
//
// Two layers, and they answer different questions. The **browser's copy** is insurance: it
// exists because a reload used to destroy the poem and every line's history with it, and
// nobody remembers to export before a tab crashes. The **session file** is the answer to
// the question the README parked — *whose is the search?* — and it answers: the writer's.
// Self-contained, portable, and it opens with the service switched off.

const autosave = openAutosave();

function setSessionStatus(text: string, warn = false): void {
  sessionStatusEl.textContent = text;
  sessionStatusEl.classList.toggle("warn", warn);
}

autosave.onStatus(({ saved, at, problem }) => {
  if (problem) setSessionStatus(problem, true);
  else if (saved && at) {
    const clock = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setSessionStatus(`session · kept ${clock}`);
  }
});

/**
 * Replace the poem on the bench with another one — from a file, or from the browser's copy.
 *
 * Everything that outlived the old poem has to go with it: the editor rows are keyed by
 * line id and two poems can use the same ids, the loop is pinned to a line that no longer
 * exists, and the renderer is still holding the previous body. A stage that kept the last
 * poem's figure standing under this poem's lines would be showing movement that belongs to
 * a sentence nobody can see.
 */
function adoptPoem(next: Poem): void {
  poem = next;
  rows.clear();
  poemLinesEl.replaceChildren();
  loopingLineId = null;
  renderer.setLoop("whole");
  shownSegment = -1;
  playingLines = [];
  stageStart = 0;
  stageBoundaries = [];
  current = null;
  lastFrame = 0;
  playheads = [];

  renderPoem();
  updateBanner();
  showCurrent(); // puts back whatever this session already had generated

  if (!current) {
    // Nothing in this poem has been generated. Take the previous body off the stage rather
    // than leaving it there under a fresh poem's hint.
    renderer.clear();
    clearScore();
    hintEl.classList.remove("hidden");
    telemetryEl.innerHTML = "";
    counterEl.textContent = "";
    playPauseEl.textContent = "Play";
    scrubEl.value = "0";
  }
}

function exportSession(): void {
  const session = toSession(poem);
  const blob = new Blob([JSON.stringify(session)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sessionFilename(session, poem);
  link.click();
  URL.revokeObjectURL(url);
  setSessionStatus(`session · exported ${link.download}`);
}

async function importSession(file: File): Promise<void> {
  try {
    adoptPoem(restore(fromSession(JSON.parse(await file.text()))));
    setSessionStatus(`session · opened ${file.name}`);
  } catch (err) {
    // Never half-load. A poem missing most of itself looks exactly like a poem.
    setSessionStatus(`could not open ${file.name}: ${(err as Error).message}`, true);
  }
}

sessionExportEl.addEventListener("click", exportSession);
sessionImportEl.addEventListener("click", () => sessionFileEl.click());
sessionFileEl.addEventListener("change", () => {
  const file = sessionFileEl.files?.[0];
  sessionFileEl.value = ""; // so picking the same file twice fires twice
  if (file) void importSession(file);
});
sessionNewEl.addEventListener("click", () => {
  if (!confirm("Start an empty poem? Export this one first if you want to keep it.")) return;
  void autosave.clear();
  adoptPoem(new Poem([""]));
  setSessionStatus("session · new");
});

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

  // Every mutation of the poem already comes through here, which makes this the one place
  // autosave cannot be forgotten at a new call site. `queue` is debounced and builds the
  // snapshot only when it fires, so a keystroke costs a timer reset and nothing more.
  autosave.queue(() => toSession(poem));
}

function selectLine(id: number): void {
  if (poem.selectedId === id) return;
  poem.selectedId = id;
  renderPoem();
  // The ghost-cloud follows the line being worked on. The registers do not — they follow
  // the body (see `registerView`).
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
  // Segment indices count the lines ON THE STAGE — for a draft that is only the generated
  // ones, so a written-but-ungenerated line must not be counted along the way.
  const at = playingLines.findIndex((line) => line.id === id);
  if (loopingLineId !== null && at >= 0) {
    renderer.setLoop("line", at);
    renderer.seekSegment(at);
  } else {
    renderer.setLoop("whole");
  }
  renderPoem();
}

function jumpToLine(id: number): void {
  const at = playingLines.findIndex((line) => line.id === id);
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



/** What the service says each model is. The backend, not this file, is the authority. */
interface Capability {
  model: string;
  source: string;
  ready: boolean;
  hosting?: string;
  model_version?: string | null;
  /** Whether a poem may be sent to this model at all. `null` = the worker did not say. */
  can_stitch_poems?: boolean | null;
}

const capabilities = new Map<string, Capability>();

const MODEL_NAMES: Record<string, string> = {
  kimodo: "Kimodo",
  snapmogen: "SnapMoGen",
  "language-of-motion": "Language of Motion",
};

/** A model's display name. An unrecognised id keeps its own name rather than borrowing one. */
function modelName(id: string): string {
  return MODEL_NAMES[id] ?? id;
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

/** The prompts the panels are playing, in order. One entry; or one per line of the poem. */
let triPrompts: string[] = [];

/**
 * The panel whose playhead the transport reports — and it is **named on screen**.
 *
 * There is no shared clock to report. In poem scope the panels are different lengths (a
 * three-line poem is 180 frames of Kimodo and 384 of SnapMoGen), so a frame count would be
 * one panel's clock presented as everyone's. What IS shared is the line: every panel has
 * the same number of them, in the same order. So the transport reads a percentage and a
 * line, and says whose.
 */
let triLead: string | null = null;

/** Renderers are built lazily — a WebGL context per panel is not free. */
function triRenderer(modelId: string, accent: number): StickFigureRenderer {
  let r = triRenderers.get(modelId);
  if (!r) {
    const host = document.getElementById(`tri-stage-${modelId}`) as HTMLDivElement;
    r = new StickFigureRenderer(host, { accent, grid: false });
    r.onFrame((info) => onTriFrame(modelId, info));
    triRenderers.set(modelId, r);
  }
  return r;
}

const lineEl = (id: string) => document.getElementById(`tri-line-${id}`) as HTMLDivElement;

/**
 * A panel moved. Say which sentence its body is answering, and — if this is the panel the
 * transport is following — move the transport with it.
 *
 * Each panel reports its own line, because in poem scope they genuinely diverge: SnapMoGen
 * floors every line to the same length while Kimodo honours the durations it was given, so
 * halfway through the poem the two panels can be on different sentences. Showing one line
 * number for all three would be inventing an agreement they do not have.
 */
function onTriFrame(
  id: string,
  info: { frame: number; total: number; playing: boolean; segmentIndex: number },
): void {
  const prompt = triPrompts[info.segmentIndex];
  lineEl(id).innerHTML =
    triPrompts.length > 1 && prompt
      ? `<b>${info.segmentIndex + 1}</b> · ${escapeHtml(prompt)}`
      : "";

  if (id !== triLead) return;
  playPauseEl.textContent = info.playing ? "Pause" : "Play";
  const last = Math.max(1, info.total - 1);
  const percent = Math.round((info.frame / last) * 100);
  const where =
    triPrompts.length > 1 ? `line ${info.segmentIndex + 1}/${triPrompts.length} · ` : "";
  counterEl.textContent = `${modelName(id)} · ${where}${percent}%`;
  if (!userScrubbing && info.total > 1) {
    scrubEl.value = String(Math.round((info.frame / last) * 1000));
  }
}

/**
 * Which panel the transport follows.
 *
 * A real model in preference to a fixture: a hand-authored clip's length is an authoring
 * decision, and letting it drive the scrub bar would put a fixture's clock in charge of two
 * models. Named in the counter either way, so the choice is never silent.
 */
function chooseTriLead(loaded: Set<string>): void {
  const real = TRI_MODELS.find(
    (m) => loaded.has(m.id) && capabilities.get(m.id)?.source !== "fixture",
  );
  triLead = (real ?? TRI_MODELS.find((m) => loaded.has(m.id)))?.id ?? null;
}

/**
 * What the triptych is comparing: one line, or the whole poem.
 *
 * These are two different questions. **One line** asks how three models read the same
 * sentence. **The whole poem** asks something the instrument has never been able to ask:
 * which of them can carry a body from one sentence into the next at all.
 */
type TriScope = "line" | "poem";
let triScope: TriScope = "line";

const foot = (id: string) => document.getElementById(`tri-foot-${id}`) as HTMLDivElement;

/**
 * What a panel actually is, drawn in the panel.
 *
 * The decision behind this lives in `triptych.ts`, out of the DOM and under test, because
 * it is the claim the whole view rests on: in whole-poem mode the three panels are **not
 * the same kind of thing**, and a screen that let that pass would be a capability
 * comparison wearing a model comparison's clothes.
 */
function triFoot(clips: CanonicalMotion[], lines: number): string {
  const reading = readPanel(clips, lines);
  const label = continuityLabel(reading);
  const claim = label
    ? `<b class="${reading.continuity === "apart" ? "apart" : ""}">${label}</b>`
    : `seed ${escapeHtml(clips[0].seed)}`;
  // Stated as two numbers rather than as a diagnosis. SnapMoGen is held to a length floor;
  // a fixture simply is whatever length it was authored at. The fact is the same and the
  // panel is not the place to guess which.
  const stretched = reading.lengthened
    ? `<span class="note">asked for ${reading.framesAsked} frames, moved for ` +
      `${reading.framesUsed}</span>`
    : "";
  return `${claim} · ${reading.frames} frames · ${escapeHtml(reading.source)}${stretched}`;
}

/** Ask the three models one line. */
async function generateTriptychLine(): Promise<void> {
  // The line being worked on, not the whole poem — that is what the poem scope is for.
  const prompt = poem.selected?.text.trim() || poem.written[0]?.text.trim() || "";
  if (!prompt) return;
  triPrompts = [prompt];
  triPhraseEl.textContent = `“${prompt}”`;
  const loaded = new Set<string>();
  await Promise.all(
    TRI_MODELS.map(async ({ id, accent }) => {
      const r = triRenderer(id, accent);
      foot(id).textContent = "generating…";
      try {
        const motion = await post({
          model: id,
          prompt,
          variants: 1,
          duration_seconds: Number(durationEl.value),
          denoising_steps: chosenSteps(),
        });
        r.load(motion);
        loaded.add(id);
        foot(id).innerHTML = triFoot([motion], 1);
      } catch (err) {
        foot(id).textContent = `error: ${(err as Error).message}`;
      }
    }),
  );
  chooseTriLead(loaded);
}

/**
 * Ask the three models the whole poem — each at its best, and each saying what it did.
 *
 * A model that can stitch is sent the poem as a poem. A model that cannot is sent its lines
 * one at a time and the panel plays them as separate clips: seams visible, nothing
 * interpolated, no pelvis slid across a join to disguise it. That is deliberately the
 * bench's drafted-poem behaviour, because it is deliberately the same claim.
 *
 * Which way round to ask is read from `/health`, not discovered by failing: a worker that
 * cannot stitch declares `can_stitch_poems: false`, and SnapMoGen's refuses a poem outright.
 */
async function generateTriptychPoem(): Promise<void> {
  const lines = poem.toLines();
  if (!lines.length) return;
  triPrompts = lines.map((line) => line.prompt);
  triPhraseEl.textContent = `${lines.length} lines`;
  const loaded = new Set<string>();
  await Promise.all(
    TRI_MODELS.map(async ({ id, accent }) => {
      const r = triRenderer(id, accent);
      const whole = askFor(capabilities.get(id)) === "whole";
      foot(id).textContent = whole
        ? `generating ${lines.length} lines as one…`
        : `generating ${lines.length} lines, one at a time…`;
      try {
        // Both branches fire everything at once. How much actually runs in parallel is the
        // service's business, not the browser's — a local worker is gated to one at a time
        // there, which is exactly the split Stage A existed to make.
        const clips = whole
          ? [await post({ model: id, lines, denoising_steps: chosenSteps() })]
          : await Promise.all(
              lines.map((line) =>
                post({
                  model: id,
                  prompt: line.prompt,
                  variants: 1,
                  duration_seconds: line.duration_seconds,
                  denoising_steps: chosenSteps(),
                }),
              ),
            );
        r.loadSequence(clips);
        loaded.add(id);
        foot(id).innerHTML = triFoot(clips, lines.length);
      } catch (err) {
        foot(id).textContent = `error: ${(err as Error).message}`;
      }
    }),
  );
  chooseTriLead(loaded);
}

// One triptych generation at a time. The bench has always guarded this through
// `setGenerating`; the triptych never did, because a single line across three models was
// cheap enough that a double-press only wasted seconds. A whole poem is every line through
// every model with each local worker serialised to one at a time — minutes — so a second
// press while the first is still running has to be refused rather than queued.
let triBusy = false;

/** Ask all three models the same question, at once. */
async function generateTriptych(): Promise<void> {
  if (triBusy) return;
  triBusy = true;
  const started = performance.now();
  setGenerating(
    true,
    triScope === "poem" ? "reading the poem in three models…" : "asking three models…",
  );
  try {
    await (triScope === "poem" ? generateTriptychPoem() : generateTriptychLine());
    generationStatusEl.textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
  } finally {
    triBusy = false;
    // Restores the buttons; the panels own their own errors, one per model, because two of
    // three succeeding is the normal case here and a single banner would flatten it.
    generateEl.disabled = false;
    bakeEl.disabled = false;
  }
}

/**
 * Say what these three panels are, from what the service reports rather than from a
 * sentence typed into the HTML.
 *
 * The hard-coded banner this replaces claimed "SnapMoGen and Language of Motion remain
 * labeled fixtures" for the whole of the commit in which SnapMoGen stopped being one. A
 * claim about what is real must come from the thing that knows it.
 */
function updateTriptychBanner(): void {
  const known = TRI_MODELS.map(({ id }) => capabilities.get(id)).filter(Boolean);
  const fixtures = known.filter((c) => c!.source === "fixture").map((c) => modelName(c!.model));
  const parts: string[] = [];

  if (!known.length) {
    parts.push("<b>checking</b> — the service has not said yet what any of these are.");
  } else if (fixtures.length === TRI_MODELS.length) {
    parts.push(
      "<b>no models here</b> — all three panels are hand-authored fixtures chosen by " +
        "hashing the prompt. The differences between them are an artefact of hashing and " +
        "are <b>not evidence of anything</b>.",
    );
  } else if (fixtures.length) {
    parts.push(
      `<b>mixed sources</b> — ${fixtures.join(" and ")} ` +
        `${fixtures.length === 1 ? "is a" : "are"} hand-authored ` +
        `${fixtures.length === 1 ? "fixture" : "fixtures"}, not model output. ` +
        `This is <b>${TRI_MODELS.length - fixtures.length} of ${TRI_MODELS.length}</b> ` +
        "panels comparing models.",
    );
  } else {
    parts.push("<b>three models</b> — every panel is real model output.");
  }

  if (triScope === "poem") {
    const stitchers = known
      .filter((c) => c!.can_stitch_poems === true)
      .map((c) => modelName(c!.model));
    parts.push(
      stitchers.length
        ? `Reading the whole poem. <b>${stitchers.join(" and ")}</b> ` +
            `${stitchers.length === 1 ? "carries" : "carry"} each line into the next; the ` +
            "others generate their lines apart. <b>The panels are not the same kind of " +
            "thing</b> — each one says which it is."
        : "Reading the whole poem. <b>None of these models can carry one line into the " +
            "next</b>, so every panel is lines generated apart.",
    );
  }

  triBannerEl.innerHTML = parts.join(" ");
}

function setTriScope(scope: TriScope): void {
  triScope = scope;
  triScopeEl.textContent = scope === "poem" ? "whole poem" : "one line";
  triScopeEl.classList.toggle("on", scope === "poem");
  triTitleEl.textContent =
    scope === "poem" ? "the whole poem · three models" : "one line · three models";
  updateTriptychBanner();
  if (comparing) modePillEl.textContent = triptychPill();

  // Switching scope does NOT generate. A whole-poem triptych is every line through every
  // model, with each local worker serialised to one at a time — minutes of GPU. That is
  // asked for deliberately, never triggered by a toggle.
  const waiting =
    scope === "poem"
      ? `press D — or “Ask all three” — to read ${poem.written.length} lines here`
      : "press D to ask all three";
  triPrompts = [];
  triLead = null;
  triPhraseEl.textContent =
    scope === "poem" ? `${poem.written.length} lines, not yet read` : "";
  counterEl.textContent = "";
  scrubEl.value = "0";
  playPauseEl.textContent = "Play";
  for (const { id } of TRI_MODELS) {
    triRenderers.get(id)?.clear();
    lineEl(id).textContent = "";
    foot(id).textContent = waiting;
  }
}

/** What the two generate buttons are called, for whichever instrument is open. */
function setBarLabels(): void {
  generateEl.textContent = comparing ? "Ask all three" : "Draft line";
  generateEl.title = comparing
    ? "Ask all three models (D)"
    : "Generate the selected line alone (D)";
  bakeEl.textContent = comparing ? "Whole poem" : "Bake";
  bakeEl.title = comparing
    ? "Ask all three models the whole poem (B)"
    : "Generate the whole poem continuously (B)";
}

function triptychPill(): string {
  return triScope === "poem"
    ? "Triptych · the whole poem"
    : "Triptych · one line, three models";
}

function setComparing(on: boolean): void {
  if (on && reading) setReading(false); // both take the whole stage — only one at a time
  comparing = on;
  appEl.classList.toggle("comparing", on);
  triptychEl.textContent = on ? "Close" : "Compare";
  modePillEl.textContent = on ? triptychPill() : "Search instrument · live";
  // The bench's labels describe the bench. In the triptych the same buttons ask three
  // models, and a button that says "Draft line" while doing something else is how the
  // instruction on screen stops matching the control.
  setBarLabels();
  if (!on) {
    // Hand the transport back to the bench immediately. Waiting for its next frame would
    // leave a panel's reading on screen for as long as the bench stays paused.
    showBenchCounter();
    return;
  }
  updateTriptychBanner();
  // One line is cheap enough to answer the moment the view opens. The whole poem is not,
  // so it waits to be asked.
  if (triScope === "line") void generateTriptych();
  else setTriScope("poem");
}

triScopeEl.addEventListener("click", () => setTriScope(triScope === "poem" ? "line" : "poem"));

// ---- the notation registers ----
//
// The right-hand rail always carries two registers, small. The registers VIEW opens all
// four, large: chronophotograph, strip, floor path, Laban-inspired score. No register is
// complete on its own — what each one drops is the point, and you read them together.

let reading = false;

/**
 * Which reading the registers give: the whole poem, or one line of it.
 *
 * These are not zoom levels. Every register normalises against the frames it is handed —
 * levels, magnitudes, the floor's scale — so a line read alone is drawn against its own
 * range, and a quiet line that vanishes inside the whole poem becomes legible. That also
 * means the two readings cannot be compared with each other, which is why the rail says
 * out loud which one is on screen.
 *
 * Narrowed, the register follows the line the body is **playing**, not the line the cursor
 * is in. The score is a reading of the movement, so it should say what the body is doing
 * now; the writer's cursor is somewhere else most of the time, and a score that followed it
 * would describe a line nobody is watching. Pinning a line is what looping is for (`L`),
 * and it works on the score for free — pin the body and the score stays with it.
 */
type ScoreScope = "poem" | "line";
let scoreScope: ScoreScope = "poem";

/** The line a narrowed register is reading: the one the playhead is inside. */
function readingSegment(): number {
  return renderer.segmentIndex;
}

/** The window the registers should read, for whatever is currently on the stage. */
function registerView(): RegisterView {
  const segments = current?.segments ?? [];
  if (scoreScope === "line" && segments.length) {
    const segment = segments[readingSegment()];
    if (segment) {
      return {
        range: { start: segment.start_frame, end: segment.end_frame },
        globalStart: segment.start_frame,
      };
    }
  }
  return { globalStart: stageStart, boundaries: stageBoundaries };
}

/** Say which line is being read, so a narrowed register is never mistaken for the poem. */
function updateScoreHead(): void {
  const segments = current?.segments ?? [];
  // Narrowing only means anything for a baked poem: a drafted line is already its own clip,
  // and the registers are already reading it alone.
  scoreScopeEl.disabled = segments.length < 2;
  scoreScopeEl.title = scoreScopeEl.disabled
    ? "one line at a time — needs a baked poem of more than one line"
    : "Read the line the body is playing (N)";
  const narrowed = scoreScope === "line" && !scoreScopeEl.disabled;
  scoreScopeEl.textContent = narrowed ? "this line" : "whole poem";
  scoreScopeEl.classList.toggle("on", narrowed);
  if (performing) return; // performance mode owns the title
  scoreTitleEl.textContent = narrowed
    ? `notation · line ${readingSegment() + 1}`
    : "notation · the score";
}

/**
 * Rebuild every register from the current motion, and re-seat the playheads.
 * The registers view is only drawn while it is open — four more SVGs is not free, and it
 * is closed most of the time.
 */
function buildScore(): void {
  updateScoreHead();
  if (!current) return;
  const view = registerView();
  playheads = [
    renderNotationStrip(notationSvgEl, current, view),
    renderFloorPath(floorSvgEl, current, view),
  ];
  if (reading) {
    playheads.push(
      renderChronophotograph(regChronoSvgEl, current, view),
      renderNotationStrip(regStripSvgEl, current, view),
      renderFloorPath(regFloorSvgEl, current, view),
      renderLabanScore(regLabanSvgEl, current, view),
    );
  }
  // the renderer only emits while playing, so a score built during a pause would sit at
  // frame 0 until you hit play — put the playheads where the body actually is
  for (const set of playheads) set(lastFrame);
}

/** Empty every register. Used when the session is replaced by one with nothing on stage. */
function clearScore(): void {
  playheads = [];
  for (const el of [notationSvgEl, floorSvgEl, regChronoSvgEl, regStripSvgEl, regFloorSvgEl, regLabanSvgEl]) {
    el.replaceChildren();
  }
}

function setScoreScope(scope: ScoreScope): void {
  scoreScope = scope;
  buildScore();
}

scoreScopeEl.addEventListener("click", () =>
  setScoreScope(scoreScope === "line" ? "poem" : "line"),
);

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
  if (!on) updateScoreHead(); // the title may be naming a line, not the whole poem

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
  const baked = poem.bakedMotion;
  const usingBake = poem.bakeIsCurrent && baked !== null;
  const drafted = poem.written.filter((line) => line.motion !== null);
  const drafts = drafted.map((line) => line.motion as CanonicalMotion);

  // A bake plays whenever it is current, and also when it is not but there is nothing
  // drafted to show instead — keeping the older reading on the stage rather than going
  // blank, with the banner saying it is out of date.
  if (baked && (usingBake || drafts.length === 0)) {
    current = baked;
    stageStart = 0;
    // If the bake is stale these lines may no longer be the ones it was made from, so a
    // line added or removed since can put the highlight one line out. The banner already
    // says this reading is not the poem; the next bake resets it.
    playingLines = poem.written;
    // The first line begins at frame 0 — that is the start of the poem, not a seam.
    stageBoundaries = (baked.segments ?? []).slice(1).map((segment) => segment.start_frame);
    renderer.loadSequence([baked], { keepPlayhead: opts.keepPlayhead });
  } else if (drafts.length) {
    const selected = poem.selected;
    // The ghost-cloud is a per-line instrument: it shows the line being worked on.
    const ghosts = selected?.motion?.variants ?? [];
    current = selected?.motion ?? drafts[0];
    // Only the lines that have actually been drafted are on the stage — a written but
    // ungenerated line contributes no clip, so it must not shift the count either.
    playingLines = drafted;
    // The registers hold one clip out of the run; find where it starts in global frames.
    const at = drafts.indexOf(current);
    stageStart = drafts.slice(0, Math.max(0, at)).reduce((n, clip) => n + clip.frames.length, 0);
    // Drafts are separate generations laid end to end. They have joins, not seams, and the
    // banner already says so — marking them on the score would dress a break as a
    // transition. A drafted register shows one line, and only that line.
    stageBoundaries = [];
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
  const safe = escapeHtml;
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
        `<br>` +
        // A remembered motion is the SAME generation, served again — the seconds above are
        // the original run's, not this one's, and the stage says so rather than letting a
        // replay read as a fast model.
        (provenance.served_from_store
          ? `<span class="k">memory</span> remembered · not regenerated<br>`
          : "")
      : "") +
    (ghostCount
      ? `<span class="k">cloud</span> ${ghostCount} other seeds<br>`
      : "") +
    (motion.stub ? `<span class="stub">stub · hand-authored fixture (no ML)</span>` : "");
}

// Which line the playhead was inside last tick, so the DOM is only touched when it moves.
let shownSegment = -1;

// The bench's last reported position. Kept because the renderer only emits while something
// is moving: closing the triptych over a paused bench would otherwise leave a panel's
// reading on the transport, describing a body that is no longer on screen.
type BenchFrame = { frame: number; total: number; fps: number; playing: boolean; segmentIndex: number };
let lastBench: BenchFrame | null = null;

/** Put the bench's own position back on the transport. */
function showBenchCounter(): void {
  if (!lastBench) {
    counterEl.textContent = "";
    return;
  }
  const { frame, total, fps, playing, segmentIndex } = lastBench;
  playPauseEl.textContent = playing ? "Pause" : "Play";
  const where =
    playingLines.length > 1 ? `line ${segmentIndex + 1}/${playingLines.length}  ·  ` : "";
  counterEl.textContent = `${where}frame ${frame} / ${total - 1}  ·  ${fps} fps`;
  if (!userScrubbing && total > 1) {
    scrubEl.value = String(Math.round((frame / (total - 1)) * 1000));
  }
}

renderer.onFrame(({ frame, total, fps, playing, segmentIndex }) => {
  lastFrame = frame;
  lastBench = { frame, total, fps, playing, segmentIndex };
  // While the triptych is open the bench is still running, hidden, and usually holding a
  // different motion. It must not narrate the transport for a body nobody can see — the
  // lead panel does that (see `onTriFrame`).
  if (!comparing) showBenchCounter();
  // walk the "now" marker through every open register
  for (const set of playheads) set(frame);

  if (segmentIndex !== shownSegment) {
    shownSegment = segmentIndex;
    // A narrowed register is reading the line that just ended. Re-read the new one — this
    // fires once per line boundary, not per frame.
    if (scoreScope === "line") buildScore();
    const line = playingLines[segmentIndex];
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
    const health = (await res.json()) as { capabilities?: Capability[] };
    for (const capability of health.capabilities ?? []) {
      capabilities.set(capability.model, capability);
      const name = modelName(capability.model);
      const state = capability.source === "fixture"
        ? "stub"
        : capability.ready ? "real" : "real · unavailable";
      const option = modelEl.querySelector<HTMLOptionElement>(
        `option[value="${capability.model}"]`,
      );
      if (option) option.textContent = `${name} · ${state}`;
      const triptychName = document.getElementById(`tri-name-${capability.model}`);
      if (triptychName) triptychName.textContent = `${name} · ${state}`;
    }
    // The banner is a claim about what these panels are, so it is rebuilt from what the
    // service just said rather than left as a sentence somebody typed once.
    updateTriptychBanner();
  } catch {
    // Generate owns the full actionable service error; leave "checking…" honest here.
  }
}

// ---- events ----
//
// The bar drives whichever instrument is open: the triptych asks its models, the bench
// drafts into the poem. Every route in — the button and the keyboard both — goes through
// these two, for the reason `space` already goes through `playPauseEl.click()`: a second
// path is a path that forgets. `D` used to call `draftLine` directly, so in the triptych it
// silently drafted a bench line nobody could see.

function draftHere(): void {
  if (comparing) void generateTriptych();
  else void draftLine();
}

/** `B` has always meant "the whole poem". In the triptych, that is the poem scope. */
function bakeHere(): void {
  if (!comparing) {
    void bake();
    return;
  }
  if (triScope !== "poem") setTriScope("poem");
  void generateTriptych();
}

generateEl.addEventListener("click", draftHere);
bakeEl.addEventListener("click", bakeHere);
triptychEl.addEventListener("click", () => setComparing(!comparing));
registersBtnEl.addEventListener("click", () => setReading(!reading));

/**
 * Play or pause everything on screen, as ONE state.
 *
 * Not a toggle each. Toggling every renderer independently inverts whatever was already out
 * of step instead of bringing it into step — one panel that had nothing loaded when the
 * others started would flip to playing exactly when they stopped. Comparing motions that
 * are out of step with each other would tell you nothing.
 *
 * The state is read from whichever renderer the transport is reporting, so the button and
 * the counter can never disagree about what is happening.
 */
function setPlayingAll(on: boolean): void {
  for (const r of [renderer, ...triRenderers.values()]) {
    if (on) r.play();
    else r.pause();
  }
}

function transportLead(): StickFigureRenderer {
  return (comparing && triLead ? triRenderers.get(triLead) : undefined) ?? renderer;
}

playPauseEl.addEventListener("click", () => setPlayingAll(!transportLead().playing));
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
      draftHere();
      break;
    case "b":
      bakeHere();
      break;
    case "l":
      if (poem.selectedId !== null) toggleLoopLine(poem.selectedId);
      break;
    case "n":
      // Both views have a scope, and only one of them is ever on screen.
      if (comparing) setTriScope(triScope === "poem" ? "line" : "poem");
      else if (!scoreScopeEl.disabled) setScoreScope(scoreScope === "line" ? "poem" : "line");
      break;
  }
});

/**
 * Open the instrument.
 *
 * The browser's copy comes first, before anything is drawn: whatever is on screen at the
 * first render is what autosave will write back, so restoring after that would overwrite
 * the session with the default poem it was supposed to replace.
 *
 * A restored session is never re-generated. Its motions are in the file — that is the whole
 * point of keeping them — so the stage is rebuilt from what is there, with nothing loaded
 * and no request made. Only a genuinely fresh start drafts its first line so the stage is
 * not empty. Bake stays a deliberate act, as it always has.
 */
async function start(): Promise<void> {
  const stored = await autosave.load();
  let restored = false;
  if (stored) {
    try {
      poem = restore(fromSession(stored));
      restored = true;
    } catch (err) {
      setSessionStatus(`the autosaved session could not be read: ${(err as Error).message}`, true);
    }
  }

  renderPoem();
  updateBanner();
  if (!autosave.available) {
    // Private windows and blocked site data. Say it plainly — a writer who thinks their
    // work is being kept and is wrong is worse off than one who knows it is not.
    setSessionStatus(autosave.problem ?? "session · not kept in this browser", true);
  } else if (restored) {
    setSessionStatus("session · restored");
  } else {
    setSessionStatus("session · new");
  }

  await refreshCapabilities();
  if (restored) showCurrent();
  else void draftLine();
}

void start();

// Boot flags: ?perform=1 goes straight to the projectable stage (for plugging into a
// projector without fumbling through chrome in front of a room); ?compare=1 opens the
// triptych; ?registers=1 opens the four notation registers.
const boot = new URLSearchParams(location.search);
if (boot.has("perform")) setPerforming(true);
if (boot.has("compare")) setComparing(true);
if (boot.has("registers")) setReading(true);
