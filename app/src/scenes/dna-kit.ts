// Shared toolkit for the DNA edition's scenes (docs/DNA_VIDEO_PLAN.md). Every DNA scene draws its
// lyrics, labels, stamps, the orange focus bracket and any DNA double helix through these helpers so
// the film reads as one system. Everything here is a pure function of its inputs (song time included).
import * as THREE from 'three';
import { FSPass, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, glyphX, textPathCommands } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { clamp, lerp, prog, ease, hash, smoothstep } from '../engine/util';

export type Pt = { x: number; y: number };
export type P3 = { x: number; y: number; z: number };
export type RGB = [number, number, number];

// ------------------------------------------------------------------ lyrics
export function findWord(line: Line, q: string, nth = 0): Word {
  const n = norm(q);
  const ws = line.words.filter((x) => norm(x.w) === n);
  const w = ws[nth];
  if (!w) throw new Error(`word not found: ${q} in "${line.text}"`);
  return w;
}

/** Characters of a word row sung by t (fractional), for a left-to-right karaoke wipe. */
export function sungChars(ws: Word[], t: number) {
  let n = 0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!, p = Lyrics.wordProgress(w, t);
    n += p * w.w.length;
    if (p < 1) return n;
    if (i < ws.length - 1) n += 1;
  }
  return n;
}

export interface RowOpts {
  align?: 'left' | 'right' | 'center';
  /** Palette key of the sung colour (unsung is the same at `dim` alpha). */
  on?: string;
  dim?: number;
  /** Seconds before the row's first word it starts showing, dim (default 0.4, the house maximum). */
  lead?: number;
  tracking?: number;
}
/**
 * One karaoke row: the words dim until sung, then a left-to-right wipe that follows the voice
 * (Lyrics.wordProgress, so it never runs ahead). The row anticipates its own first word only.
 * Returns the row's drawn width (0 when invisible).
 */
export function karaokeRow(c: CanvasRenderingContext2D, ws: Word[], x: number, y: number, fam: string, size: number, t: number, alpha = 1, o: RowOpts = {}): number {
  const lead = o.lead ?? 0.4;
  alpha *= prog(t, ws[0]!.start - lead, ws[0]!.start - lead * 0.25);
  if (alpha <= 0.001 || ws.length === 0) return 0;
  const txt = ws.map((w) => w.w).join(' ');
  c.font = font(fam, size);
  const wTot = c.measureText(txt).width;
  const x0 = o.align === 'right' ? x - wTot : o.align === 'center' ? x - wTot / 2 : x;
  const k = sungChars(ws, t), ki = Math.floor(k);
  const xa = ki >= txt.length ? wTot : glyphX(txt, ki, fam, size);
  const xb = ki + 1 >= txt.length ? wTot : glyphX(txt, ki + 1, fam, size);
  const xs = ki >= txt.length ? wTot : lerp(xa, xb, k - ki);
  const on = o.on ?? 'bone';
  c.fillStyle = rgba(on, (o.dim ?? 0.3) * alpha);
  c.fillText(txt, x0, y);
  if (xs > 0) {
    c.save();
    c.beginPath(); c.rect(x0 - 60, y - size * 1.3, xs + 60, size * 1.8); c.clip();
    c.fillStyle = rgba(on, alpha);
    c.fillText(txt, x0, y);
    c.restore();
  }
  return wTot;
}

/**
 * Text outline as a Path2D built straight from the glyph commands, at (x, baseline y).
 * Use this instead of engine/type's textPath2D: that one goes through SVG path data, which comes out
 * malformed for Archivo's O (the fill stops mid-word).
 */
export function glyphPath(text: string, fam: string, size: number, x = 0, y = 0): Path2D {
  const p = new Path2D();
  for (const cm of textPathCommands(text, fam, size, x, y) as any[]) {
    if (cm.type === 'M') p.moveTo(cm.x, cm.y);
    else if (cm.type === 'L') p.lineTo(cm.x, cm.y);
    else if (cm.type === 'Q') p.quadraticCurveTo(cm.x1, cm.y1, cm.x, cm.y);
    else if (cm.type === 'C') p.bezierCurveTo(cm.x1, cm.y1, cm.x2, cm.y2, cm.x, cm.y);
    else if (cm.type === 'Z') p.closePath();
  }
  return p;
}

// ------------------------------------------------------------------ annotations
/** Small IBM Plex Mono annotation with a hairline leader to (ax, ay). One explanatory label per shot. */
export function monoLabel(c: CanvasRenderingContext2D, text: string, x: number, y: number, ax: number, ay: number, a: number, color = 'ash', size = 15) {
  if (a <= 0.001) return;
  c.font = font(F.mono(400), size);
  c.fillStyle = rgba(color, 0.95 * a);
  c.fillText(text, x, y);
  c.strokeStyle = rgba(color, 0.6 * a); c.lineWidth = 1;
  const lx = ax < x ? x - 8 : x + c.measureText(text).width + 8, ly = y - size * 0.33;
  c.beginPath(); c.moveTo(lx, ly); c.lineTo(ax, ay); c.stroke();
  c.fillStyle = rgba(color, 0.9 * a);
  c.beginPath(); c.arc(ax, ay, 2, 0, Math.PI * 2); c.fill();
}

export interface StampOpts {
  /** Song time the stamp lands (it thunks down from 1.35x over 0.09 s). */
  t0: number;
  size?: number; rot?: number; color?: string; alpha?: number; seed?: number;
  /** Optional second, smaller line (e.g. an attribution). */
  sub?: string;
}
/**
 * A deadpan rubber stamp (docs/DNA_VIDEO_PLAN.md, "Stamps"): IBM Plex Mono capitals in a ruled box,
 * rubber-ink texture, slight rotation, landing on its word time. Never larger than the sung words.
 */
export function rubberStamp(c: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, o: StampOpts) {
  if (t < o.t0) return;
  const size = o.size ?? 26, rot = o.rot ?? -0.06, seed = o.seed ?? 1;
  const land = prog(t, o.t0, o.t0 + 0.09, ease.outCubic);
  const s = lerp(1.35, 1, land), a = (o.alpha ?? 0.92) * lerp(0.2, 1, land);
  const fam = F.mono(700);
  c.save();
  c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.font = font(fam, size);
  const lines = o.sub ? [text, o.sub] : [text];
  const subSize = size * 0.62;
  const w = Math.max(c.measureText(text).width, o.sub ? (c.font = font(fam, subSize), c.measureText(o.sub).width) : 0);
  const pad = size * 0.45, hh = size * (o.sub ? 1.95 : 1.2) + pad;
  c.strokeStyle = rgba(o.color ?? 'signal', a); c.lineWidth = Math.max(2, size * 0.09);
  c.strokeRect(-w / 2 - pad, -hh / 2, w + pad * 2, hh);
  c.fillStyle = rgba(o.color ?? 'signal', a);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = font(fam, size);
  c.fillText(lines[0]!, 0, o.sub ? -size * 0.42 : size * 0.04);
  if (o.sub) { c.font = font(fam, subSize); c.fillText(o.sub, 0, size * 0.62); }
  // rubber texture: knock out a sparse grain of specks
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    const px = (hash(seed, i, 1) - 0.5) * (w + pad * 2), py = (hash(seed, i, 2) - 0.5) * hh;
    c.fillStyle = `rgba(0,0,0,${0.25 + 0.5 * hash(seed, i, 3)})`;
    c.fillRect(px, py, 1 + 2.5 * hash(seed, i, 4), 1 + 1.5 * hash(seed, i, 5));
  }
  c.restore();
}

/**
 * The orange focus bracket (the film's recurring marker): four open corners around (x, y).
 * `empty` draws it with no centre dot and a dashed inner hint (the deleted base's absence).
 */
export function focusBracket(c: CanvasRenderingContext2D, x: number, y: number, o: { size?: number; alpha?: number; dot?: number; empty?: boolean } = {}) {
  const hs = o.size ?? 16, k = Math.max(5, hs * 0.42), a = o.alpha ?? 1;
  if (a <= 0.001) return;
  c.strokeStyle = rgba('signal', a); c.lineWidth = 2;
  c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const px = x + sx * hs, py = y + sy * hs;
    c.moveTo(px - sx * k, py); c.lineTo(px, py); c.lineTo(px, py - sy * k);
  }
  c.stroke();
  if (o.empty) {
    c.setLineDash([2, 4]); c.strokeStyle = rgba('signal', 0.35 * a); c.lineWidth = 1;
    c.strokeRect(x - hs * 0.45, y - hs * 0.45, hs * 0.9, hs * 0.9); c.setLineDash([]);
  } else if ((o.dot ?? 1) > 0) {
    c.fillStyle = rgba('signal', a * (o.dot ?? 1));
    c.beginPath(); c.arc(x, y, Math.max(2, hs * 0.16), 0, Math.PI * 2); c.fill();
  }
}

// ------------------------------------------------------------------ camera
export type Proj = { x: number; y: number; w: number; s: number };
/** Perspective camera for scenes that project their own geometry (LineBatch screen2D + painter's sort). */
export class Cam {
  cam: THREE.PerspectiveCamera;
  vp = new THREE.Matrix4();
  private v4 = new THREE.Vector4();
  private k = 1;
  constructor(public fov = 30) {
    this.cam = new THREE.PerspectiveCamera(fov, W / H, 0.05, 500);
  }
  /** Orbit `dist` around `tgt` (yaw about +Y, pitch up), optional roll. */
  orbit(tgt: P3, yaw: number, pitch: number, dist: number, roll = 0, fov = this.fov) {
    this.cam.fov = fov; this.fov = fov;
    this.cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.cam.lookAt(tgt.x, tgt.y, tgt.z);
    this.update();
    return this;
  }
  /** Explicit position/target. */
  look(pos: P3, tgt: P3, fov = this.fov) {
    this.cam.fov = fov; this.fov = fov;
    this.cam.position.set(pos.x, pos.y, pos.z); this.cam.up.set(0, 1, 0);
    this.cam.lookAt(tgt.x, tgt.y, tgt.z);
    this.update();
    return this;
  }
  private update() {
    this.cam.updateMatrixWorld(); this.cam.updateProjectionMatrix();
    this.vp.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
    this.k = H / 2 / Math.tan((this.fov * Math.PI) / 360);
  }
  /** World → screen px (y down); `w` view depth, `s` px per world unit at that depth. */
  proj(x: number, y: number, z: number): Proj {
    const v = this.v4.set(x, y, z, 1).applyMatrix4(this.vp);
    const w = Math.max(1e-3, v.w);
    return { x: (v.x / w * 0.5 + 0.5) * W, y: (1 - (v.y / w * 0.5 + 0.5)) * H, w, s: this.k / w };
  }
}

// ------------------------------------------------------------------ backdrop
/**
 * Fullscreen backdrop: ink with a raised centre (uPaper = 0) cross-fading to bone paper with fibres
 * (uPaper = 1); optional light pool (uPoolC px, y down; uPoolR px radii; uPool strength).
 */
export function makeBackdrop() {
  return new FSPass(/* glsl */ `
    uniform float uPaper; uniform vec2 uPoolC; uniform vec2 uPoolR; uniform float uPool; uniform float uSeed;
    void main() {
      vec2 px = FRAG_PX;
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ink = C_INK + C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, length(p)));
      float fib = fbm(px * vec2(0.010, 0.022) + uSeed, 4) * 0.5 + fbm(px * 0.06 + uSeed, 2) * 0.25;
      vec3 paper = C_BONE * (0.9 + 0.06 * fib) * vec3(1.0, 0.985, 0.95) * (1.0 - 0.18 * smoothstep(0.35, 1.05, length(p)));
      vec3 c = mix(ink, paper, uPaper);
      vec2 q = (px - vec2(uPoolC.x, 1080.0 - uPoolC.y)) / max(uPoolR, vec2(1.0));
      float f = exp(-dot(q, q) * 1.35) * uPool;
      c = mix(c, C_BONE * (0.9 + 0.06 * fib) * vec3(1.0, 0.985, 0.95), f);
      fragColor = vec4(c, 1.0);
    }`, {
    uPaper: { value: 0 }, uPoolC: { value: new THREE.Vector2(960, 540) }, uPoolR: { value: new THREE.Vector2(600, 330) },
    uPool: { value: 0 }, uSeed: { value: 0 },
  });
}

// ------------------------------------------------------------------ B-DNA
export type Base = 'A' | 'T' | 'G' | 'C';
export const PAIR: Record<Base, Base> = { A: 'T', T: 'A', G: 'C', C: 'G' };
/** Hydrogen bonds per pair: A·T two, G·C three (drawn as ticks between the half-rungs). */
export const HBONDS: Record<Base, number> = { A: 2, T: 2, G: 3, C: 3 };

/** B-DNA constants (nm). Rounded model values, not universal constants (see the plan's guardrails). */
export const BDNA = {
  radius: 1.0, // backbone radius (2 nm wide)
  rise: 0.34, // per base pair
  twist: (2 * Math.PI) / 10.5, // 10.5 bp per turn → ~3.6 nm pitch
  /** Angular offset of strand 2's backbone from strand 1 at the same level, measured across the minor groove. */
  minor: (150 * Math.PI) / 180,
};

/** A deterministic base sequence (seeded), or a given string. */
export function sequence(n: number, seed = 1, given?: string): Base[] {
  if (given) return given.toUpperCase().split('').filter((b): b is Base => 'ATGC'.includes(b));
  const B: Base[] = ['A', 'T', 'G', 'C'];
  return Array.from({ length: n }, (_, i) => B[Math.floor(hash(seed, i) * 4)]!);
}

/**
 * Axis for a helix: position and unit tangent at arc length s (nm). `straightAxis` covers the usual
 * case; pass any smooth curve (e.g. wrapping a nucleosome) and the frame is parallel-transported.
 */
export type Axis = (s: number, outP: THREE.Vector3, outT: THREE.Vector3) => void;
export const straightAxis = (origin: P3, dir: P3): Axis => {
  const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
  return (s, p, tn) => { p.set(origin.x + d.x * s, origin.y + d.y * s, origin.z + d.z * s); tn.copy(d); };
};

export interface HelixBP {
  /** Backbone points of strand 1 (5'→3' along +s) and strand 2 (antiparallel), world. */
  a: THREE.Vector3; b: THREE.Vector3;
  /** Axis point at this base pair. */
  c: THREE.Vector3;
  base: Base;
}
/**
 * Right-handed B-DNA along `axis`: base pair i at arc length (i + s0)·rise, strand 1 at angle
 * phase + i·twist in the frame (e1, e2 = t × e1), which is right-handed about the tangent, so the
 * backbone turns counter-clockwise as it advances toward the viewer: a right-handed helix.
 * `sep(i)` (0..1+) opens base pair i (unzipping): each strand moves out along its own radial
 * direction by sep·open nm and the two half-rungs part.
 */
export function helix(n: number, axis: Axis, o: { phase?: number; s0?: number; seq?: Base[]; e1?: P3; sep?: (i: number) => number; open?: number } = {}): HelixBP[] {
  const out: HelixBP[] = [];
  const seq = o.seq ?? sequence(n);
  const p = new THREE.Vector3(), tn = new THREE.Vector3();
  let e1 = new THREE.Vector3(o.e1?.x ?? 1, o.e1?.y ?? 0, o.e1?.z ?? 0);
  let prevT: THREE.Vector3 | null = null;
  for (let i = 0; i < n; i++) {
    axis(((o.s0 ?? 0) + i) * BDNA.rise, p, tn);
    // parallel transport of e1 along the axis
    if (prevT) {
      const q = new THREE.Quaternion().setFromUnitVectors(prevT, tn);
      e1.applyQuaternion(q);
    }
    e1.addScaledVector(tn, -e1.dot(tn)).normalize();
    if (e1.lengthSq() < 1e-6) e1 = new THREE.Vector3(tn.y, -tn.x, 0.3).normalize();
    prevT = tn.clone();
    const e2 = new THREE.Vector3().crossVectors(tn, e1);
    const th = (o.phase ?? 0) + i * BDNA.twist, th2 = th + BDNA.minor;
    const sp = o.sep ? o.sep(i) * (o.open ?? 1.2) : 0;
    const r = BDNA.radius;
    const ra = r + sp, rb = r + sp;
    const a = p.clone().addScaledVector(e1, Math.cos(th) * ra).addScaledVector(e2, Math.sin(th) * ra);
    const b = p.clone().addScaledVector(e1, Math.cos(th2) * rb).addScaledVector(e2, Math.sin(th2) * rb);
    out.push({ a, b, c: p.clone(), base: seq[i % seq.length]! });
  }
  return out;
}

export interface HelixStyle {
  /** Backbone tube width (nm) and colour. */
  tube?: number; col?: RGB;
  /** Draw base-pair rungs, H-bond ticks and (when big enough) base letters. */
  rungs?: boolean;
  /** Per-pair separation, same as helix() (the half-rungs part in the middle). */
  sep?: (i: number) => number;
  /** Light direction (toward the light) for shading; fog around depth `fogRef`. */
  light?: THREE.Vector3; fogRef?: number; fogSpan?: number;
  alpha?: number;
  /** Ink outlines (rails) — on for bone-on-ink engraving, off for plain lines. */
  rails?: boolean;
}
/**
 * Draw a helix into a screen2D, 'normal'-blend LineBatch with painter's ordering (far first).
 * Returns the projected base-pair centres (for labels, letters, the focus bracket).
 */
export function drawHelix(L: LineBatch, cam: Cam, bps: HelixBP[], st: HelixStyle = {}): Proj[] {
  const tube = st.tube ?? 0.22, col = st.col ?? LIN.bone, ink = LIN.ink, al = st.alpha ?? 1;
  const light = st.light ?? new THREE.Vector3(-0.5, 0.7, 0.5).normalize();
  type Item = { d: number; f: () => void };
  const items: Item[] = [];
  const pa = bps.map((q) => cam.proj(q.a.x, q.a.y, q.a.z));
  const pb = bps.map((q) => cam.proj(q.b.x, q.b.y, q.b.z));
  const pc = bps.map((q) => cam.proj(q.c.x, q.c.y, q.c.z));
  const fogRef = st.fogRef ?? pc.reduce((s, p) => s + p.w, 0) / Math.max(1, pc.length);
  const fogSpan = st.fogSpan ?? 4;
  const fog = (w: number) => lerp(1, 0.4, smoothstep(-1, fogSpan, w - fogRef));
  const shadeT = (d: THREE.Vector3) => 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - (d.dot(light) / Math.max(1e-6, d.length())) ** 2));
  const tubeSeg = (p: Proj, q: Proj, w0: THREE.Vector3, w1: THREE.Vector3) => {
    const d = new THREE.Vector3().subVectors(w1, w0);
    const sh = shadeT(d) * fog((p.w + q.w) / 2);
    const wpx = Math.max(1.2, tube * (p.s + q.s) / 2);
    items.push({
      d: (p.w + q.w) / 2, f: () => {
        L.seg2(p.x, p.y, q.x, q.y, wpx, [col[0] * sh, col[1] * sh, col[2] * sh], al);
        if (st.rails ?? true) {
          const dl = Math.hypot(q.x - p.x, q.y - p.y) || 1, nx = -(q.y - p.y) / dl * (wpx / 2 + 0.5), ny = (q.x - p.x) / dl * (wpx / 2 + 0.5);
          L.seg2(p.x + nx, p.y + ny, q.x + nx, q.y + ny, 1.3, ink, 0.9 * al);
          L.seg2(p.x - nx, p.y - ny, q.x - nx, q.y - ny, 1.3, ink, 0.9 * al);
        }
      },
    });
  };
  // backbones, subdivided between base pairs along the helical arc for smooth tubes
  const sub = 4;
  for (const strand of [0, 1]) {
    for (let i = 0; i < bps.length - 1; i++) {
      const A = strand === 0 ? bps[i]!.a : bps[i]!.b, B = strand === 0 ? bps[i + 1]!.a : bps[i + 1]!.b;
      const C0 = bps[i]!.c, C1 = bps[i + 1]!.c;
      // interpolate around the axis (not straight across) so the tube follows the helix
      let prev = A.clone(), pp = cam.proj(prev.x, prev.y, prev.z);
      for (let k = 1; k <= sub; k++) {
        const u = k / sub;
        const cc = C0.clone().lerp(C1, u);
        const ra = A.clone().sub(C0), rb = B.clone().sub(C1);
        const r = ra.clone().lerp(rb, u);
        const len = lerp(ra.length(), rb.length(), u);
        // slerp the radial direction
        const qa = ra.clone().normalize(), qb = rb.clone().normalize();
        const ang = Math.acos(clamp(qa.dot(qb), -1, 1));
        if (ang > 1e-4) {
          const sa = Math.sin((1 - u) * ang) / Math.sin(ang), sb = Math.sin(u * ang) / Math.sin(ang);
          r.copy(qa.multiplyScalar(sa).add(qb.multiplyScalar(sb))).setLength(len);
        }
        const P = cc.add(r), pq = cam.proj(P.x, P.y, P.z);
        tubeSeg(pp, pq, prev, P);
        prev = P; pp = pq;
      }
    }
  }
  // rungs: two half-rungs (one base each) with H-bond ticks in the gap
  if (st.rungs ?? true) {
    bps.forEach((q, i) => {
      const a = pa[i]!, b = pb[i]!;
      const sepK = st.sep ? clamp(st.sep(i)) : 0;
      const gap = lerp(0.08, 0.5, sepK); // fraction of the rung left open in the middle
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ha = { x: lerp(a.x, mx, 1 - gap), y: lerp(a.y, my, 1 - gap) }, hb = { x: lerp(b.x, mx, 1 - gap), y: lerp(b.y, my, 1 - gap) };
      const d = (a.w + b.w) / 2, sh = 0.72 * fog(d);
      const wpx = Math.max(1.4, 0.16 * (a.s + b.s) / 2);
      const nH = HBONDS[q.base];
      items.push({
        d: d + 0.05, f: () => {
          L.seg2(a.x, a.y, ha.x, ha.y, wpx, [col[0] * sh, col[1] * sh, col[2] * sh], al);
          L.seg2(b.x, b.y, hb.x, hb.y, wpx, [col[0] * sh * 0.86, col[1] * sh * 0.86, col[2] * sh * 0.86], al);
          if (sepK < 0.5) {
            // hydrogen-bond ticks across the gap, perpendicular to the rung: 2 (A·T) or 3 (G·C)
            const rx = hb.x - ha.x, ry = hb.y - ha.y, rl = Math.hypot(rx, ry) || 1, nx = -ry / rl, ny = rx / rl;
            const tl = wpx * 0.9, ta = al * (1 - sepK * 2) * 0.9;
            for (let k = 0; k < nH; k++) {
              const u = (k + 1) / (nH + 1), cx = lerp(ha.x, hb.x, u), cy = lerp(ha.y, hb.y, u);
              L.seg2(cx - nx * tl, cy - ny * tl, cx + nx * tl, cy + ny * tl, 1.1, [col[0] * sh, col[1] * sh, col[2] * sh], ta);
            }
          }
        },
      });
    });
  }
  items.sort((x, y) => y.d - x.d);
  for (const it of items) it.f();
  return pc;
}

/**
 * Base letters (Plex Mono) at the strand ends of each rung, when the rung is at least `minPx` long on
 * screen. Draw into a Canvas2D layer after the helix.
 */
export function drawBaseLetters(c: CanvasRenderingContext2D, cam: Cam, bps: HelixBP[], o: { minPx?: number; size?: number; alpha?: number; color?: string } = {}) {
  const size = o.size ?? 13;
  c.font = font(F.mono(500), size);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const q of bps) {
    const a = cam.proj(q.a.x, q.a.y, q.a.z), b = cam.proj(q.b.x, q.b.y, q.b.z);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const al = (o.alpha ?? 0.8) * smoothstep(o.minPx ?? 70, (o.minPx ?? 70) * 1.4, len);
    if (al <= 0.01) continue;
    c.fillStyle = rgba(o.color ?? 'bone', al);
    c.fillText(q.base, lerp(a.x, b.x, 0.22), lerp(a.y, b.y, 0.22) - 10);
    c.fillText(PAIR[q.base], lerp(a.x, b.x, 0.78), lerp(a.y, b.y, 0.78) - 10);
  }
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}

/** Linear palette triplet scaled. */
export const sc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export { LIN, rgba };
