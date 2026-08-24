// StickFigureRenderer — plays a canonical motion (bodyprompt.motion/v0) as a 3D
// stick-figure NOTATION: joints are small spheres, bones are line segments, and the
// extremities leave a Marey-style fading trail. Deliberately NOT a realistic avatar —
// it shows what the machine computed (joints, trajectories, timing), nothing more.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CanonicalMotion } from "./types";
import { buildTimeline, entryAt, type TimelineEntry } from "./timeline";
import { JOINT_INDEX, LANDMARK_JOINTS, TRAIL_JOINTS } from "./skeleton";

// House palette (matches frontend/mockups/styles.css).
const STAGE_BG = 0x0b0c10;
const PERF_BG = 0x07080b; // performance: darker, for a projector in a dark room
const ACCENT = 0xe9b872; // bone/amber
const BONE = 0xd8b985;
const GRID = 0x232732;
const GHOST = 0x74a7c8; // cool tint — the variance cloud

// Trail shape: how many ghost samples, and how many source-frames apart.
const TRAIL_LEN = 8;
const TRAIL_STEP = 2;

// The ghost-cloud: bones only (no joints, no trails) so many figures stay legible.
// Opacity is a balance — high enough that the variance actually reads as a cloud,
// low enough that the selected figure stays clearly the subject.
const GHOST_OPACITY = 0.34;

/** How the renderer reports playhead changes back to the UI. */
export type FrameListener = (info: {
  frame: number;
  total: number;
  fps: number;
  playing: boolean;
  /** Which line of the poem the playhead is inside. 0 when there is only one clip. */
  segmentIndex: number;
}) => void;

/**
 * What happens at the end.
 *
 * `whole` runs the poem round; `line` holds the playhead inside one line so it can be
 * worked on; `none` stops at the end. Until v2 this was a single unconditional subtraction
 * — a clip could only ever loop.
 */
export type LoopMode = "whole" | "line" | "none";

/** Options per renderer instance — the triptych colour-codes one panel per model. */
export interface RendererOptions {
  /** Figure colour. Defaults to the house amber. */
  accent?: number;
  /** Hide the ground grid — useful in the triptych's small panels. */
  grid?: boolean;
}

export class StickFigureRenderer {
  private container: HTMLElement;
  private accent: number;
  private boneColor: number;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private clock = new THREE.Clock();

  // figure parts
  private jointMeshes: THREE.Mesh[] = [];
  private boneLines?: THREE.LineSegments;
  private bonePositions?: THREE.BufferAttribute;
  private trailMeshes: Map<number, THREE.Mesh[]> = new Map(); // jointIndex -> ghost spheres

  // the variance ghost-cloud — one translucent bones-only figure per sibling motion
  private ghosts: { motion: CanonicalMotion; lines: THREE.LineSegments; attr: THREE.BufferAttribute }[] = [];
  private ghostsVisible = true;

  // playback
  private motion?: CanonicalMotion; // the clip geometry and fps come from — entry 0's clip
  private timeline: TimelineEntry[] = [];
  private totalFrames = 0;
  private frameFloat = 0;
  private playing = false;
  private listener?: FrameListener;
  private tempo = 1; // 0.5 = half speed — the performer needs time to read and follow
  private loopMode: LoopMode = "whole";
  private loopIndex: number | null = null;

  // the stage itself: a lab bench is lit for inspection, a performance is lit for a room
  private grid?: THREE.GridHelper;

  constructor(container: HTMLElement, opts: RendererOptions = {}) {
    this.container = container;
    this.accent = opts.accent ?? ACCENT;
    // bones sit slightly softer than the joints, whatever the accent is
    this.boneColor = opts.accent === undefined ? BONE : opts.accent;
    this.scene.background = new THREE.Color(STAGE_BG);

    // Framed on the body, but with headroom: a raised arm reaches ~1.5m, so the view must
    // still hold roughly 0 -> 2.5m or gestures get cropped off the top.
    const { clientWidth: w, clientHeight: h } = container;
    this.camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100);
    this.camera.position.set(2.0, 1.45, 2.9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.0, 0); // chest height — the body, not the floor
    this.controls.enableDamping = true;
    this.controls.update();

    // ground grid (the "floor" the figure stands on)
    if (opts.grid !== false) {
      const grid = new THREE.GridHelper(6, 12, GRID, GRID);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.5;
      this.scene.add(grid);
      this.grid = grid;
    }

    // keep the canvas matched to its container
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(container);

    this.animate();
  }

  /**
   * Load a motion, build its figure, and start from frame 0.
   * Also builds the ghost-cloud from `motion.variants` (if the service sent any).
   */
  load(motion: CanonicalMotion): void {
    this.loadSequence([motion], { ghosts: motion.variants ?? [] });
  }

  /**
   * Play a poem: one clip per line for a draft, or a single segmented clip for a bake.
   *
   * Both shapes become the same timeline, so playback, scrubbing and "which line is moving"
   * work identically — but they are not made to *look* the same. A draft's clips were
   * generated blind to each other and the body will jump between them; nothing here
   * smooths that over, because the jump is the honest signal that the poem has not been
   * baked yet.
   */
  loadSequence(
    clips: CanonicalMotion[],
    opts: { ghosts?: CanonicalMotion[]; keepPlayhead?: boolean } = {},
  ): void {
    if (clips.length === 0) return;
    const previous = this.frameFloat;
    this.motion = clips[0];
    this.timeline = buildTimeline(clips);
    this.totalFrames = this.timeline.reduce((sum, e) => sum + e.length, 0);
    this.frameFloat = opts.keepPlayhead
      ? Math.min(previous, Math.max(0, this.totalFrames - 1))
      : 0;
    this.buildFigure(clips[0]);
    this.loadGhosts(opts.ghosts ?? []);
    this.applyFrame(this.frameFloat);
    this.play();
  }

  /** Where the playhead is, as a line index. */
  get segmentIndex(): number {
    return this.entryAt(this.frameFloat)?.index ?? 0;
  }

  /**
   * What happens at the end of the poem — or of one line.
   *
   * `loopLine` is the "only loop on a sentence when I choose to" control: it pins the
   * playhead inside one line so the writer can watch it over and over while editing.
   */
  setLoop(mode: LoopMode, lineIndex: number | null = null): void {
    this.loopMode = mode;
    this.loopIndex = mode === "line" ? lineIndex : null;
  }

  /** Jump the playhead to the start of a line. */
  seekSegment(index: number): void {
    const entry = this.timeline.find((e) => e.index === index);
    if (!entry) return;
    this.frameFloat = entry.globalStart;
    this.applyFrame(this.frameFloat);
    this.emit();
  }

  private entryAt(frame: number): TimelineEntry | undefined {
    const i = Math.max(0, Math.min(this.totalFrames - 1, Math.round(frame)));
    return entryAt(this.timeline, i);
  }

  /** Resolve a global frame to the actual pose behind it. */
  private poseAt(frame: number): number[][] | undefined {
    const entry = this.entryAt(frame);
    if (!entry) return undefined;
    const i = Math.max(0, Math.min(this.totalFrames - 1, Math.round(frame)));
    const local = entry.localStart + (i - entry.globalStart);
    return entry.clip.frames[Math.min(local, entry.clip.frames.length - 1)]?.positions;
  }

  /**
   * Build the variance cloud: one translucent, bones-only figure per sibling motion.
   * They play in lock-step with the primary, so the cloud moves *with* the figure —
   * one prompt, many seeds, all doing "the same thing" slightly differently.
   */
  loadGhosts(motions: CanonicalMotion[]): void {
    for (const g of this.ghosts) {
      this.scene.remove(g.lines);
      g.lines.geometry.dispose();
      (g.lines.material as THREE.Material).dispose();
    }
    this.ghosts = [];

    for (const motion of motions) {
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(
        new Float32Array(motion.edges.length * 2 * 3),
        3,
      );
      geo.setAttribute("position", attr);
      const lines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({
          color: GHOST,
          transparent: true,
          opacity: GHOST_OPACITY,
          depthWrite: false, // so overlapping ghosts blend instead of z-fighting
        }),
      );
      lines.visible = this.ghostsVisible;
      this.scene.add(lines);
      this.ghosts.push({ motion, lines, attr });
    }
  }

  setGhostsVisible(on: boolean): void {
    this.ghostsVisible = on;
    for (const g of this.ghosts) g.lines.visible = on;
  }

  /** Playback rate. 0.5 = half speed — slow enough for a body in the room to follow. */
  setTempo(rate: number): void {
    this.tempo = Math.max(0.05, rate);
    this.emit();
  }

  getTempo(): number {
    return this.tempo;
  }

  /**
   * Light the stage for a room rather than for inspection: a darker ground, a dimmer
   * grid. The figure stays exactly as it is — this is the *only* honest thing to change,
   * since the notation is the work.
   */
  setPerformanceMode(on: boolean): void {
    this.scene.background = new THREE.Color(on ? PERF_BG : STAGE_BG);
    if (this.grid) {
      const mat = this.grid.material as THREE.Material;
      mat.opacity = on ? 0.22 : 0.5;
    }
  }

  /**
   * Take the body off the stage.
   *
   * Only ever used when the session itself is replaced — New, or an imported poem whose
   * lines have not been generated yet. Leaving the previous poem's figure standing under
   * the new poem's hint would be the stage telling a story about a body that is not there,
   * which is the one thing this instrument may not do.
   */
  clear(): void {
    this.playing = false;
    for (const m of this.jointMeshes) this.scene.remove(m);
    this.jointMeshes = [];
    for (const ghosts of this.trailMeshes.values()) {
      for (const g of ghosts) this.scene.remove(g);
    }
    this.trailMeshes.clear();
    if (this.boneLines) this.scene.remove(this.boneLines);
    this.boneLines = undefined;
    this.bonePositions = undefined;
    this.loadGhosts([]); // disposes their geometry and materials too
    this.motion = undefined;
    this.timeline = [];
    this.totalFrames = 0;
    this.frameFloat = 0;
  }

  play(): void {
    if (!this.motion) return;
    this.playing = true;
    this.emit();
  }

  pause(): void {
    this.playing = false;
    this.emit();
  }

  togglePlay(): void {
    this.playing ? this.pause() : this.play();
  }

  /** Seek to a normalised position in [0, 1]. */
  seek(fraction: number): void {
    if (!this.motion) return;
    const last = Math.max(0, this.totalFrames - 1);
    this.frameFloat = Math.max(0, Math.min(1, fraction)) * last;
    this.applyFrame(this.frameFloat);
    this.emit();
  }

  onFrame(listener: FrameListener): void {
    this.listener = listener;
  }

  // ---- internals --------------------------------------------------------

  /** (Re)build joint spheres, bone lines, and trail ghosts for a motion. */
  private buildFigure(motion: CanonicalMotion): void {
    // clear any previous figure
    for (const m of this.jointMeshes) this.scene.remove(m);
    this.jointMeshes = [];
    for (const ghosts of this.trailMeshes.values()) {
      for (const g of ghosts) this.scene.remove(g);
    }
    this.trailMeshes.clear();
    if (this.boneLines) this.scene.remove(this.boneLines);

    const landmarkIdx = new Set(LANDMARK_JOINTS.map((n) => JOINT_INDEX[n]));

    // joints
    const jointGeo = new THREE.SphereGeometry(0.022, 12, 12);
    const landmarkGeo = new THREE.SphereGeometry(0.038, 14, 14);
    const jointMat = new THREE.MeshBasicMaterial({ color: this.accent });
    for (let i = 0; i < motion.joints.length; i++) {
      const geo = landmarkIdx.has(i) ? landmarkGeo : jointGeo;
      const mesh = new THREE.Mesh(geo, jointMat);
      this.scene.add(mesh);
      this.jointMeshes.push(mesh);
    }

    // bones — one LineSegments, two vertices per edge, updated each frame
    const boneGeo = new THREE.BufferGeometry();
    this.bonePositions = new THREE.BufferAttribute(
      new Float32Array(motion.edges.length * 2 * 3),
      3,
    );
    boneGeo.setAttribute("position", this.bonePositions);
    this.boneLines = new THREE.LineSegments(
      boneGeo,
      new THREE.LineBasicMaterial({ color: this.boneColor }),
    );
    this.scene.add(this.boneLines);

    // trails — a small stack of fading ghost spheres per tracked joint
    const trailGeo = new THREE.SphereGeometry(0.02, 10, 10);
    for (const name of TRAIL_JOINTS) {
      const idx = JOINT_INDEX[name];
      const ghosts: THREE.Mesh[] = [];
      for (let k = 0; k < TRAIL_LEN; k++) {
        const opacity = 0.5 * (1 - k / TRAIL_LEN);
        const mat = new THREE.MeshBasicMaterial({
          color: this.accent,
          transparent: true,
          opacity,
        });
        const g = new THREE.Mesh(trailGeo, mat);
        this.scene.add(g);
        ghosts.push(g);
      }
      this.trailMeshes.set(idx, ghosts);
    }
  }

  /** Position every part for a (possibly fractional) frame. */
  private applyFrame(frameFloat: number): void {
    const motion = this.motion;
    if (!motion || !this.bonePositions) return;
    const total = this.totalFrames;
    const i = Math.max(0, Math.min(total - 1, Math.round(frameFloat)));
    const pos = this.poseAt(i);
    if (!pos) return;

    // joints
    for (let j = 0; j < this.jointMeshes.length; j++) {
      const p = pos[j];
      this.jointMeshes[j].position.set(p[0], p[1], p[2]);
    }

    // bones
    const arr = this.bonePositions.array as Float32Array;
    motion.edges.forEach((edge, e) => {
      const [child, parent] = edge;
      const c = pos[child];
      const pa = pos[parent];
      const o = e * 6;
      arr[o] = c[0]; arr[o + 1] = c[1]; arr[o + 2] = c[2];
      arr[o + 3] = pa[0]; arr[o + 4] = pa[1]; arr[o + 5] = pa[2];
    });
    this.bonePositions.needsUpdate = true;

    // trails — sample this joint's position a few source-frames back
    for (const [idx, ghosts] of this.trailMeshes) {
      for (let k = 0; k < ghosts.length; k++) {
        const sample = Math.max(0, i - (k + 1) * TRAIL_STEP);
        const p = this.poseAt(sample)?.[idx];
        if (p) ghosts[k].position.set(p[0], p[1], p[2]);
      }
    }

    // the ghost-cloud — same frame index, clamped to each sibling's own length
    for (const ghost of this.ghosts) {
      if (!ghost.lines.visible) continue;
      const gm = ghost.motion;
      const gi = Math.max(0, Math.min(gm.frames.length - 1, i));
      const gpos = gm.frames[gi].positions;
      const garr = ghost.attr.array as Float32Array;
      gm.edges.forEach((edge, e) => {
        const [child, parent] = edge;
        const c = gpos[child];
        const pa = gpos[parent];
        const o = e * 6;
        garr[o] = c[0]; garr[o + 1] = c[1]; garr[o + 2] = c[2];
        garr[o + 3] = pa[0]; garr[o + 4] = pa[1]; garr[o + 5] = pa[2];
      });
      ghost.attr.needsUpdate = true;
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();

    if (this.playing && this.motion && this.totalFrames > 0) {
      const [from, to] = this.loopBounds();
      this.frameFloat += dt * this.motion.fps * this.tempo;
      if (this.frameFloat > to) {
        if (this.loopMode === "none") {
          this.frameFloat = to;
          this.playing = false;
        } else {
          // Wrap into the looped span rather than to frame 0: looping one line has to come
          // back to that line's beginning, not the poem's.
          this.frameFloat = from + (this.frameFloat - to);
        }
      }
      this.applyFrame(this.frameFloat);
      this.emit();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** The span the playhead is confined to, given the current loop mode. */
  private loopBounds(): [number, number] {
    const last = Math.max(0, this.totalFrames - 1);
    if (this.loopMode === "line" && this.loopIndex !== null) {
      const entry = this.timeline.find((e) => e.index === this.loopIndex);
      if (entry) return [entry.globalStart, entry.globalStart + entry.length - 1];
    }
    return [0, last];
  }

  private emit(): void {
    if (!this.listener || !this.motion) return;
    this.listener({
      frame: Math.round(this.frameFloat),
      total: this.totalFrames,
      fps: this.motion.fps,
      playing: this.playing,
      segmentIndex: this.segmentIndex,
    });
  }

  private onResize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
