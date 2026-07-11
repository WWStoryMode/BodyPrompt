// StickFigureRenderer — plays a canonical motion (bodyprompt.motion/v0) as a 3D
// stick-figure NOTATION: joints are small spheres, bones are line segments, and the
// extremities leave a Marey-style fading trail. Deliberately NOT a realistic avatar —
// it shows what the machine computed (joints, trajectories, timing), nothing more.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CanonicalMotion } from "./types";
import { JOINT_INDEX, LANDMARK_JOINTS, TRAIL_JOINTS } from "./skeleton";

// House palette (matches frontend/mockups/styles.css).
const STAGE_BG = 0x0b0c10;
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
}) => void;

export class StickFigureRenderer {
  private container: HTMLElement;
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
  private motion?: CanonicalMotion;
  private frameFloat = 0;
  private playing = false;
  private listener?: FrameListener;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene.background = new THREE.Color(STAGE_BG);

    const { clientWidth: w, clientHeight: h } = container;
    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this.camera.position.set(2.4, 1.5, 3.2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.0, 0);
    this.controls.enableDamping = true;
    this.controls.update();

    // ground grid (the "floor" the figure stands on)
    const grid = new THREE.GridHelper(6, 12, GRID, GRID);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    this.scene.add(grid);

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
    this.motion = motion;
    this.frameFloat = 0;
    this.buildFigure(motion);
    this.loadGhosts(motion.variants ?? []);
    this.applyFrame(0);
    this.play();
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
    const last = this.motion.frames.length - 1;
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
    const jointMat = new THREE.MeshBasicMaterial({ color: ACCENT });
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
      new THREE.LineBasicMaterial({ color: BONE }),
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
          color: ACCENT,
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
    const total = motion.frames.length;
    const i = Math.max(0, Math.min(total - 1, Math.round(frameFloat)));
    const pos = motion.frames[i].positions;

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
        const p = motion.frames[sample].positions[idx];
        ghosts[k].position.set(p[0], p[1], p[2]);
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

    if (this.playing && this.motion) {
      const last = this.motion.frames.length - 1;
      this.frameFloat += dt * this.motion.fps;
      if (this.frameFloat > last) this.frameFloat -= last; // loop
      this.applyFrame(this.frameFloat);
      this.emit();
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private emit(): void {
    if (!this.listener || !this.motion) return;
    this.listener({
      frame: Math.round(this.frameFloat),
      total: this.motion.frames.length,
      fps: this.motion.fps,
      playing: this.playing,
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
