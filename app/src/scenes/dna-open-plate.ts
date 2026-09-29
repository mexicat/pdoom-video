// Shared by the DNA bookends (dna-open.ts, dna-outro.ts): the opening plate — bone paper, the circular
// microscope field, the eyepiece pointer, an engraved right-handed B-DNA (ink on bone) and the orange
// focus bracket closing around its first base — plus the engraving primitives both scenes draw with.
// The outro lands back on exactly this composition (`plateState` + `plateCam`), so it lives here once.
import * as THREE from 'three';
import { FSPass, W, H } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, lerp, prog, ease, smoothstep } from '../engine/util';
import { Cam, helix, straightAxis, sequence, BDNA, HBONDS, type HelixBP, type Base, type P3 } from './dna-kit';

// ------------------------------------------------------------------ plate constants
/** The orange point / first base: screen centre (the pupil in the outro's first frame sits here too). */
export const CX = W / 2, CY = H / 2;
/** The circular microscope field (px, centred on the point). */
export const FIELD_R = 300;
/** Plate scale: px per nm at the plate framing, and the scale bar it carries. */
export const PLATE_PX_NM = 118;
/** The scale bar's fixed spot (right end, baseline), shared by every plate in the bookends. */
export const BAR_X = W - 128, BAR_Y = H - 104;
/** Canvas fill that matches the backdrop's paper at the centre of the frame. */

export function linToCss(c: [number, number, number], a = 1) {
  const s = (x: number) => Math.round(255 * clamp(x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
  return `rgba(${s(c[0])},${s(c[1])},${s(c[2])},${a})`;
}
export const PAPER_LIN: [number, number, number] = [LIN.bone[0] * 0.935, LIN.bone[1] * 0.935 * 0.985, LIN.bone[2] * 0.935 * 0.95];
export const PAPER_LIT_LIN: [number, number, number] = [LIN.bone[0] * 0.99, LIN.bone[1] * 0.99 * 0.99, LIN.bone[2] * 0.99 * 0.965];
export const mixLin = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const PAPER_CSS = linToCss(PAPER_LIN);
export const PAPER_LIT_CSS = linToCss(PAPER_LIT_LIN);

// ------------------------------------------------------------------ backdrop
/**
 * Bone paper with fibres (uPaper = 1) or ink (0); the microscope field is a slightly brighter disc with
 * a soft rim shadow (uFieldA); uGroove darkens the frame toward ink from a point (the dive).
 */
export function makePaperPass() {
  return new FSPass(/* glsl */ `
    uniform float uPaper; uniform vec3 uField; uniform float uFieldA; uniform float uSeed;
    uniform vec3 uDark; uniform float uDarkA;
    void main() {
      vec2 px = FRAG_PX;
      vec2 sp = vec2(px.x, 1080.0 - px.y);
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      float fib = fbm(px * vec2(0.010, 0.022) + uSeed, 4) * 0.5 + fbm(px * 0.06 + uSeed, 2) * 0.25;
      vec3 paper = C_BONE * (0.9 + 0.06 * fib) * vec3(1.0, 0.985, 0.95) * (1.0 - 0.16 * smoothstep(0.35, 1.05, length(p)));
      float d = length(sp - uField.xy) - uField.z;
      float inside = 1.0 - smoothstep(-0.8, 0.8, d);
      float rim = inside * (1.0 - smoothstep(0.0, 70.0, -d));
      paper *= mix(1.0, mix(0.962, 1.035 - 0.05 * rim, inside), uFieldA);
      vec3 ink = C_INK + C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, length(p)));
      vec3 c = mix(ink, paper, uPaper);
      // the dive: a disc of ink opens from the groove floor (crisp, like the field's own edge)
      float g = (1.0 - smoothstep(uDark.z - 0.8, uDark.z + 0.8, length(sp - uDark.xy))) * uDarkA;
      c = mix(c, ink, g);
      fragColor = vec4(c, 1.0);
    }`, {
    uPaper: { value: 1 }, uField: { value: new THREE.Vector3(CX, CY, FIELD_R) }, uFieldA: { value: 1 }, uSeed: { value: 3.1 },
    uDark: { value: new THREE.Vector3(CX, CY, 1) }, uDarkA: { value: 0 },
  });
}

// ------------------------------------------------------------------ small engraved marks
/** The field's engraved rim: a firm ring and a hairline just inside it. */
export function drawFieldRing(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, col = 'ink') {
  if (a <= 0.001) return;
  c.strokeStyle = rgba(col, 0.82 * a); c.lineWidth = 1.9;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = rgba(col, 0.42 * a); c.lineWidth = 0.9;
  c.beginPath(); c.arc(x, y, r - 7, 0, Math.PI * 2); c.stroke();
}

/** Rectangular orange focus bracket (a rectangular variant of dna-kit's focusBracket): four open corners. */
export function bracketBox(c: CanvasRenderingContext2D, x: number, y: number, hw: number, hh: number, o: { alpha?: number; dot?: number; k?: number; dotR?: number } = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0.001) return;
  const k = o.k ?? Math.max(6, Math.min(hw, hh) * 0.5);
  c.strokeStyle = rgba('signal', a); c.lineWidth = 2; c.lineCap = 'butt';
  c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const px = x + sx * hw, py = y + sy * hh;
    c.moveTo(px - sx * k, py); c.lineTo(px, py); c.lineTo(px, py - sy * k);
  }
  c.stroke();
  const d = o.dot ?? 0;
  if (d > 0) orangePoint(c, x, y, o.dotR ?? 4.5, d);
}

/** The orange point: the film's first mark, and the pupil at the start of the outro. */
export function orangePoint(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
  if (a <= 0.001) return;
  c.fillStyle = rgba('signal', a);
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

/** Tiny mono scale bar (the one label of a plate): a hairline bar with end ticks, the unit above its right end. */
export function scaleBar(c: CanvasRenderingContext2D, len: number, label: string, a: number, col = 'ink', x = BAR_X, y = BAR_Y) {
  if (a <= 0.001) return;
  c.strokeStyle = rgba(col, 0.85 * a); c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x - len, y); c.lineTo(x, y);
  c.moveTo(x - len, y - 5); c.lineTo(x - len, y + 5);
  c.moveTo(x, y - 5); c.lineTo(x, y + 5);
  c.stroke();
  c.font = font(F.mono(400), 15);
  c.fillStyle = rgba(col, 0.9 * a);
  c.textAlign = 'right'; c.textBaseline = 'alphabetic';
  c.fillText(label, x, y - 12);
  c.textAlign = 'left';
}

/** The eyepiece pointer: a tapered hairline from the field rim, tip at (tx, ty). */
export function pointer(c: CanvasRenderingContext2D, tx: number, ty: number, ang: number, len: number, a: number, col = 'ink') {
  if (a <= 0.001 || len <= 0.5) return;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const bx = tx + dx * len, by = ty + dy * len, w = 1.35;
  c.fillStyle = rgba(col, 0.9 * a);
  c.beginPath();
  c.moveTo(tx, ty);
  c.lineTo(bx + nx * w, by + ny * w);
  c.lineTo(bx - nx * w, by - ny * w);
  c.closePath(); c.fill();
}

/**
 * Parallel engraving lines clipped to a path: `angle` (rad), `gap` px; the stroke alpha ramps from
 * `a0` at the start of the gradient axis (x0, y0) to `a1` at (x1, y1).
 */
export function hatchPath(c: CanvasRenderingContext2D, path: Path2D, box: { x: number; y: number; r: number }, angle: number, gap: number, a0: number, a1: number, g?: { x0: number; y0: number; x1: number; y1: number }, lw = 1, col = 'ink') {
  if (Math.max(a0, a1) <= 0.003) return;
  c.save();
  c.clip(path);
  if (g) {
    const gr = c.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
    gr.addColorStop(0, rgba(col, a0)); gr.addColorStop(1, rgba(col, a1));
    c.strokeStyle = gr;
  } else c.strokeStyle = rgba(col, a0);
  c.lineWidth = lw;
  const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
  const n = Math.ceil(box.r / gap);
  c.beginPath();
  for (let i = -n; i <= n; i++) {
    const ox = box.x + nx * i * gap, oy = box.y + ny * i * gap;
    c.moveTo(ox - dx * box.r, oy - dy * box.r); c.lineTo(ox + dx * box.r, oy + dy * box.r);
  }
  c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ the engraved helix
export interface EngraveOpts {
  /** Index of the first base (growth centre) and the visible half-extent around it, in base pairs. */
  focus?: number; ext?: number;
  /** Clip to a circle (the field). */
  clip?: { x: number; y: number; r: number } | null;
  /** Direction toward the key light (world). */
  light?: THREE.Vector3;
  /** Target hatch spacing (px). */
  hatchPx?: number;
  /** Line colour (palette key) and fill (css). */
  ink?: string; fill?: string; fillLit?: string;
  alpha?: number;
  /** Depth at which aerial fading starts, and its span (nm). */
  fogRef?: number; fogSpan?: number;
  /** Extra darkness (0..1) pushed into every face (the passage getting deep). */
  gloom?: number;
  /** Straighten base pair `rule` into a flat horizontal rule (0..1): see the open's last beat. */
  rule?: number; ruleIdx?: number; ruleY?: number; ruleX0?: number; ruleX1?: number;
  /** Fade everything but base pair ruleIdx (0..1). */
  isolate?: number;
  /** Darken everything toward ink (the dive), except base pair ruleIdx which is drawn lit, on top. */
  dim?: number;
  /** Base pair ruleIdx drawn last, on top, lit toward bone (0..1). */
  heroLit?: number;
  /** Leave a disc empty (the ink opening of the dive): items are clipped to outside it. */
  hole?: { x: number; y: number; r: number } | null;
}

type Item = { d: number; f: () => void };

/**
 * Right-handed B-DNA drawn as an engraving in Canvas2D: backbone tubes with ink rails and ring
 * hatching on their shadow side, base pairs as thin slabs (purine longer than pyrimidine) with the
 * hydrogen bonds bridging the gap (A·T two, G·C three), painter's-sorted far to near.
 */
export class EngravedHelix {
  sub = 5;
  tubeR = 0.2;
  plateW = 0.24; // half-width of a base slab (nm)
  plateT = 0.075; // slab thickness (nm)
  gap = 0.3; // H-bond gap between the two bases (nm)
  n: number;
  // per strand, per sample: world position, bp parameter, world arc length
  P: THREE.Vector3[][] = [[], []];
  U: Float32Array[] = [];
  S: Float32Array[] = [];
  // per-frame scratch
  private sx: Float32Array[] = []; private sy: Float32Array[] = []; private sw: Float32Array[] = []; private ss: Float32Array[] = [];
  private rx: Float32Array[] = []; private ry: Float32Array[] = []; // screen normal (unit)
  private camPos = new THREE.Vector3();

  constructor(public bps: HelixBP[]) {
    this.n = bps.length;
    const sub = this.sub;
    for (const st of [0, 1]) {
      const pts: THREE.Vector3[] = [], u: number[] = [];
      for (let i = 0; i < this.n - 1; i++) {
        const A = st === 0 ? bps[i]!.a : bps[i]!.b, B = st === 0 ? bps[i + 1]!.a : bps[i + 1]!.b;
        const C0 = bps[i]!.c, C1 = bps[i + 1]!.c;
        for (let k = 0; k < sub; k++) {
          const f = k / sub;
          const cc = C0.clone().lerp(C1, f);
          const ra = A.clone().sub(C0), rb = B.clone().sub(C1);
          const len = lerp(ra.length(), rb.length(), f);
          const qa = ra.normalize(), qb = rb.normalize();
          const ang = Math.acos(clamp(qa.dot(qb), -1, 1));
          const r = ang > 1e-4 ? qa.clone().multiplyScalar(Math.sin((1 - f) * ang) / Math.sin(ang)).add(qb.clone().multiplyScalar(Math.sin(f * ang) / Math.sin(ang))) : qa.clone();
          pts.push(cc.add(r.setLength(len)));
          u.push(i + f);
        }
      }
      pts.push((st === 0 ? bps[this.n - 1]!.a : bps[this.n - 1]!.b).clone()); u.push(this.n - 1);
      this.P[st] = pts;
      this.U[st] = Float32Array.from(u);
      const s = new Float32Array(pts.length);
      for (let j = 1; j < pts.length; j++) s[j] = s[j - 1]! + pts[j]!.distanceTo(pts[j - 1]!);
      this.S[st] = s;
      const m = pts.length;
      this.sx[st] = new Float32Array(m); this.sy[st] = new Float32Array(m); this.sw[st] = new Float32Array(m); this.ss[st] = new Float32Array(m);
      this.rx[st] = new Float32Array(m); this.ry[st] = new Float32Array(m);
    }
  }

  draw(c: CanvasRenderingContext2D, cam: Cam, o: EngraveOpts = {}) {
    const focus = o.focus ?? (this.n - 1) / 2, ext = o.ext ?? 1e9;
    const L = o.light ?? new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
    const al = o.alpha ?? 1;
    const ink = o.ink ?? 'ink', fill = o.fill ?? PAPER_CSS, fillLit = o.fillLit ?? PAPER_LIT_CSS;
    const hp = o.hatchPx ?? 5.2;
    const gloom = o.gloom ?? 0;
    const iso = o.isolate ?? 0, ruleK = o.rule ?? 0, ruleIdx = o.ruleIdx ?? Math.round(focus);
    const dim = o.dim ?? 0;
    const heroLit = o.heroLit ?? 0;
    const hero = heroLit > 0 || ruleK > 0;
    const lineK = 1 - dim;
    const inkD = mixLin(LIN.ink2, LIN.ink, smoothstep(0.6, 1, dim));
    const fillD = dim > 0 ? linToCss(mixLin(PAPER_LIN, inkD, dim)) : fill, fillLitD = dim > 0 ? linToCss(mixLin(PAPER_LIT_LIN, inkD, dim)) : fillLit;
    this.camPos.copy(cam.cam.position);
    const items: Item[] = [];
    const tmp = new THREE.Vector3();

    // ---- project the strands
    for (const st of [0, 1]) {
      const P = this.P[st]!, sx = this.sx[st]!, sy = this.sy[st]!, sw = this.sw[st]!, ss = this.ss[st]!;
      for (let j = 0; j < P.length; j++) {
        const q = cam.proj(P[j]!.x, P[j]!.y, P[j]!.z);
        sx[j] = q.x; sy[j] = q.y; sw[j] = q.w; ss[j] = q.s;
      }
      const rx = this.rx[st]!, ry = this.ry[st]!;
      let px = 0, py = 1;
      for (let j = 0; j < P.length; j++) {
        const j0 = Math.max(0, j - 1), j1 = Math.min(P.length - 1, j + 1);
        let tx = sx[j1]! - sx[j0]!, ty = sy[j1]! - sy[j0]!;
        const tl = Math.hypot(tx, ty);
        if (tl < 1e-4) { rx[j] = px; ry[j] = py; continue; }
        tx /= tl; ty /= tl;
        rx[j] = -ty; ry[j] = tx; px = rx[j]!; py = ry[j]!;
      }
    }
    const fogRef = o.fogRef ?? cam.proj(this.bps[Math.round(clamp(focus, 0, this.n - 1))]!.c.x, this.bps[Math.round(clamp(focus, 0, this.n - 1))]!.c.y, this.bps[Math.round(clamp(focus, 0, this.n - 1))]!.c.z).w;
    const fogSpan = o.fogSpan ?? 3;
    const fog = (w: number) => lerp(1, 0.4, smoothstep(-0.5, fogSpan, w - fogRef));
    const isoA = (u: number) => lerp(1, 0, iso * smoothstep(0.4, 1.2, Math.abs(u - ruleIdx)));

    const cl = o.clip ?? null, holeC = o.hole && o.hole.r > 0.5 ? o.hole : null;
    // ---- backbone tube segments
    const V = new THREE.Vector3(), T = new THREE.Vector3(), N3 = new THREE.Vector3();
    for (const st of [0, 1]) {
      const P = this.P[st]!, U = this.U[st]!, S = this.S[st]!;
      const sx = this.sx[st]!, sy = this.sy[st]!, sw = this.sw[st]!, ss = this.ss[st]!, rx = this.rx[st]!, ry = this.ry[st]!;
      for (let j = 0; j < P.length - 1; j++) {
        const u0 = U[j]!, u1 = U[j + 1]!;
        // growth: the visible stretch is |u - focus| <= ext
        const lo = focus - ext, hi = focus + ext;
        if (u1 <= lo || u0 >= hi) continue;
        const f0 = clamp((lo - u0) / (u1 - u0)), f1 = clamp((hi - u0) / (u1 - u0));
        const ia = isoA((u0 + u1) / 2) * al;
        if (ia <= 0.004) continue;
        const d = (sw[j]! + sw[j + 1]!) / 2;
        if (sw[j]! < 0.15 || sw[j + 1]! < 0.15) continue;
        // cull segments off the frame (or outside the field clip)
        {
          const rr = this.tubeR * Math.max(ss[j]!, ss[j + 1]!) + 4;
          const x0 = Math.min(sx[j]!, sx[j + 1]!) - rr, x1 = Math.max(sx[j]!, sx[j + 1]!) + rr;
          const y0 = Math.min(sy[j]!, sy[j + 1]!) - rr, y1 = Math.max(sy[j]!, sy[j + 1]!) + rr;
          if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) continue;
          if (cl) { const dx = Math.max(cl.x - x1, 0, x0 - cl.x), dy = Math.max(cl.y - y1, 0, y0 - cl.y); if (dx * dx + dy * dy > cl.r * cl.r) continue; }
          if (holeC && Math.hypot(Math.max(Math.abs(sx[j]! - holeC.x), Math.abs(sx[j + 1]! - holeC.x)), Math.max(Math.abs(sy[j]! - holeC.y), Math.abs(sy[j + 1]! - holeC.y))) + rr < holeC.r * 0.7) continue;
        }
        const fg = fog(d);
        // growth front: the strand tapers to a point instead of ending in a cap
        const tap = (u: number) => smoothstep(0, 0.9, ext - Math.abs(u - focus));
        items.push({
          d, f: () => {
            const ax = lerp(sx[j]!, sx[j + 1]!, f0), ay = lerp(sy[j]!, sy[j + 1]!, f0);
            const bx = lerp(sx[j]!, sx[j + 1]!, f1), by = lerp(sy[j]!, sy[j + 1]!, f1);
            const ra = this.tubeR * lerp(ss[j]!, ss[j + 1]!, f0) * tap(lerp(u0, u1, f0)), rb = this.tubeR * lerp(ss[j]!, ss[j + 1]!, f1) * tap(lerp(u0, u1, f1));
            const nax = lerp(rx[j]!, rx[j + 1]!, f0), nay = lerp(ry[j]!, ry[j + 1]!, f0);
            const nbx = lerp(rx[j]!, rx[j + 1]!, f1), nby = lerp(ry[j]!, ry[j + 1]!, f1);
            const l1x = ax + nax * ra, l1y = ay + nay * ra, l2x = bx + nbx * rb, l2y = by + nby * rb;
            const r1x = ax - nax * ra, r1y = ay - nay * ra, r2x = bx - nbx * rb, r2y = by - nby * rb;
            c.fillStyle = fillD;
            c.beginPath(); c.moveTo(l1x, l1y); c.lineTo(l2x, l2y); c.lineTo(r2x, r2y); c.lineTo(r1x, r1y); c.closePath();
            c.globalAlpha = Math.min(1, ia * 1.5);
            c.fill();
            c.globalAlpha = 1;
            // ring hatching on the shadow side, anchored to the strand's arc length
            const Pm = tmp.copy(P[j]!).lerp(P[j + 1]!, (f0 + f1) / 2);
            V.copy(Pm).sub(this.camPos).normalize();
            T.copy(P[j + 1]!).sub(P[j]!).normalize();
            N3.crossVectors(T, V).normalize();
            // orient N3 with the screen normal
            const pr = cam.proj(Pm.x + N3.x * 0.05, Pm.y + N3.y * 0.05, Pm.z + N3.z * 0.05);
            const pm = cam.proj(Pm.x, Pm.y, Pm.z);
            if ((pr.x - pm.x) * (nax + nbx) + (pr.y - pm.y) * (nay + nby) < 0) N3.negate();
            const la = N3.dot(L), lb = -V.dot(L);
            // darkness across the width, u = +1 at the +n rail (l side), -1 at the r side
            const dk = (u: number) => clamp(1 - (0.42 + 0.8 * Math.max(0, u * la + Math.sqrt(Math.max(0, 1 - u * u)) * lb)) + gloom * 0.7);
            const dPlus = dk(0.97), dMinus = dk(-0.97);
            const side = dPlus > dMinus ? 1 : -1;
            const dEdge = Math.max(dPlus, dMinus);
            // how far across the tube the tone reaches (primary lines) and its dense core (secondary)
            let e1 = 0, e2 = 0;
            for (let q = 1; q <= 16; q++) { const d2 = dk(side * (1 - q / 8)); if (d2 > 0.34) e1 = q / 16; if (d2 > 0.55) e2 = q / 16; }
            e1 = Math.max(e1, 0.12 * smoothstep(0.3, 0.5, dEdge));
            const sA = lerp(S[j]!, S[j + 1]!, f0), sB = lerp(S[j]!, S[j + 1]!, f1);
            const kpx = Math.hypot(bx - ax, by - ay) / Math.max(1e-5, sB - sA); // px per nm along the strand
            const lineA = fg * ia * lineK * smoothstep(0.28, 0.5, dEdge) * Math.min(1, ra / 2.5);
            if (lineA > 0.01 && e1 > 0 && kpx > 0.5) {
              // big tubes (close up) take a slightly wider spacing: same tone, far fewer strokes
              const hpx = hp * (1 + 0.45 * smoothstep(30, 140, ra));
              const x = Math.log2(hpx / (0.05 * kpx)), lf = Math.floor(x), fr = x - lf;
              const step = 0.05 * Math.pow(2, lf);
              const m0 = Math.ceil(sA / step), m1 = Math.floor(sB / step);
              const hl = (m: number, e: number) => {
                const f = (m * step - sA) / Math.max(1e-6, sB - sA);
                const ex = side > 0 ? lerp(l1x, l2x, f) : lerp(r1x, r2x, f), ey = side > 0 ? lerp(l1y, l2y, f) : lerp(r1y, r2y, f);
                const ox = side > 0 ? lerp(r1x, r2x, f) : lerp(l1x, l2x, f), oy = side > 0 ? lerp(r1y, r2y, f) : lerp(l1y, l2y, f);
                c.moveTo(ex, ey); c.lineTo(lerp(ex, ox, e), lerp(ey, oy, e));
              };
              c.lineWidth = 0.9; c.strokeStyle = rgba(ink, 0.8 * lineA);
              c.beginPath();
              for (let m = m0; m <= m1; m++) if (m % 2 === 0) hl(m, e1);
              c.stroke();
              // interleaved lines: the finer LOD fading in, reaching only into the dense core
              if (fr < 0.95) {
                c.strokeStyle = rgba(ink, 0.8 * lineA * (1 - fr));
                c.beginPath();
                for (let m = m0; m <= m1; m++) if (m % 2 !== 0) hl(m, Math.max(e2, e1 * 0.5));
                c.stroke();
              }
            }
            // rails
            c.strokeStyle = rgba(ink, 0.92 * fg * ia * lineK); c.lineWidth = lerp(1.0, 1.5, fg);
            c.beginPath(); c.moveTo(l1x, l1y); c.lineTo(l2x, l2y); c.moveTo(r1x, r1y); c.lineTo(r2x, r2y); c.stroke();
          },
        });
      }
    }

    // ---- base pairs
    const up = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const vis = smoothstep(0.1, 0.9, ext - Math.abs(i - focus) + 0.5);
      const ia = isoA(i) * al * vis;
      if (ia <= 0.004) continue;
      const bp = this.bps[i]!;
      const A = bp.a, B = bp.b, C = bp.c;
      const i0 = Math.max(0, i - 1), i1 = Math.min(this.n - 1, i + 1);
      up.copy(this.bps[i1]!.c).sub(this.bps[i0]!.c).normalize(); // axis tangent
      const u = B.clone().sub(A); const Lc = u.length(); u.normalize();
      const v = new THREE.Vector3().crossVectors(up, u).normalize();
      const inner = Lc - 2 * this.tubeR * 0.85 - this.gap;
      const pur = (b: Base) => b === 'A' || b === 'G';
      const q1 = pur(bp.base) ? 0.56 : 0.44;
      const s0 = this.tubeR * 0.85, s1 = s0 + inner * q1, s2 = s1 + this.gap, s3 = Lc - this.tubeR * 0.85;
      const at = (s: number, w: number, h: number) => A.clone().addScaledVector(u, s).addScaledVector(v, w).addScaledVector(up, h);
      // which faces show: top (+up) or bottom, and the long side (+v or -v) toward the camera
      V.copy(C).sub(this.camPos).normalize();
      const topS = V.dot(up) < 0 ? 1 : -1, sideS = V.dot(v) < 0 ? 1 : -1;
      const nTop = up.clone().multiplyScalar(topS), nSide = v.clone().multiplyScalar(sideS);
      const litTop = clamp(0.15 + 0.9 * Math.max(0, nTop.dot(L)) - gloom * 0.7), litSide = clamp(0.15 + 0.9 * Math.max(0, nSide.dot(L)) - gloom * 0.7);
      const pc = cam.proj(C.x, C.y, C.z);
      {
        // cull plates off the frame, outside the field clip, or deep inside the ink opening
        const rr = 1.1 * pc.s + 6;
        if (pc.w < 0.15 || pc.x + rr < 0 || pc.x - rr > W || pc.y + rr < 0 || pc.y - rr > H) continue;
        if (cl && Math.hypot(pc.x - cl.x, pc.y - cl.y) - rr > cl.r) continue;
        if (holeC && i !== ruleIdx && Math.hypot(pc.x - holeC.x, pc.y - holeC.y) + rr < holeC.r) continue;
      }
      const fg = fog(pc.w);
      const hh = this.plateT / 2, pw = this.plateW;
      const nH = HBONDS[bp.base];
      if (ruleK > 0 && i === ruleIdx) continue;
      items.push({
        d: pc.w + 0.02, f: () => {
          const face = (sa: number, sb: number) => {
            // side face (thickness), then top face
            const P1 = at(sa, sideS * pw, hh), P2 = at(sb, sideS * pw, hh), P3 = at(sb, sideS * pw, -hh), P4 = at(sa, sideS * pw, -hh);
            const T1 = at(sa, -pw, topS * hh), T2 = at(sb, -pw, topS * hh), T3 = at(sb, pw, topS * hh), T4 = at(sa, pw, topS * hh);
            const pj = (p: THREE.Vector3) => cam.proj(p.x, p.y, p.z);
            const side = [pj(P1), pj(P2), pj(P3), pj(P4)], top = [pj(T1), pj(T2), pj(T3), pj(T4)];
            const poly = (q: { x: number; y: number }[]) => { c.beginPath(); c.moveTo(q[0]!.x, q[0]!.y); for (let k = 1; k < q.length; k++) c.lineTo(q[k]!.x, q[k]!.y); c.closePath(); };
            c.fillStyle = fillD; c.strokeStyle = rgba(ink, 0.85 * fg * ia * lineK); c.lineWidth = lerp(0.9, 1.25, fg);
            {
              c.globalAlpha = Math.min(1, ia * 1.5);
              poly(side); c.fill(); c.globalAlpha = 1;
              // hatch the side face along its length (it is mostly in shadow)
              const dS = clamp(1 - litSide + 0.1);
              const hs = Math.hypot(side[3]!.x - side[0]!.x, side[3]!.y - side[0]!.y);
              const nl = Math.min(3, Math.floor(hs / 3.2));
              if (nl >= 1 && dS > 0.25) {
                c.save(); c.strokeStyle = rgba(ink, 0.75 * fg * ia * lineK * smoothstep(0.25, 0.7, dS)); c.lineWidth = 0.9;
                c.beginPath();
                for (let k = 1; k <= nl; k++) {
                  const f = k / (nl + 1);
                  c.moveTo(lerp(side[0]!.x, side[3]!.x, f), lerp(side[0]!.y, side[3]!.y, f));
                  c.lineTo(lerp(side[1]!.x, side[2]!.x, f), lerp(side[1]!.y, side[2]!.y, f));
                }
                c.stroke(); c.restore();
              }
              poly(side); c.stroke();
            }
            c.globalAlpha = Math.min(1, ia * 1.5);
            c.fillStyle = litTop > 0.7 ? fillLitD : fillD;
            poly(top); c.fill(); c.globalAlpha = 1;
            const dT = clamp(1 - litTop);
            const ht = Math.hypot(top[3]!.x - top[0]!.x, top[3]!.y - top[0]!.y);
            const nt = Math.floor(ht / 3.2);
            if (nt >= 1 && dT > 0.35) {
              c.save(); c.strokeStyle = rgba(ink, 0.6 * fg * ia * lineK * smoothstep(0.35, 0.8, dT)); c.lineWidth = 0.85;
              c.beginPath();
              for (let k = 1; k <= nt; k++) {
                const f = k / (nt + 1);
                c.moveTo(lerp(top[0]!.x, top[3]!.x, f), lerp(top[0]!.y, top[3]!.y, f));
                c.lineTo(lerp(top[1]!.x, top[2]!.x, f), lerp(top[1]!.y, top[2]!.y, f));
              }
              c.stroke(); c.restore();
            }
            poly(top); c.stroke();
          };
          face(s0, s1);
          face(s2, s3);
          // hydrogen bonds bridging the gap on the visible face: A·T two, G·C three
          {
            c.strokeStyle = rgba(ink, 0.9 * fg * ia * lineK); c.lineWidth = 1.05;
            c.beginPath();
            for (let k = 0; k < nH; k++) {
              const w = (nH === 1 ? 0 : (k / (nH - 1) - 0.5) * 1.3) * pw;
              const p = cam.proj(...(at(s1 + this.gap * 0.18, w, topS * hh).toArray() as [number, number, number]));
              const q = cam.proj(...(at(s2 - this.gap * 0.18, w, topS * hh).toArray() as [number, number, number]));
              c.moveTo(p.x, p.y); c.lineTo(q.x, q.y);
            }
            c.stroke();
          }
        },
      });
    }

    items.sort((a, b) => b.d - a.d);
    c.save();
    if (o.clip) { c.beginPath(); c.arc(o.clip.x, o.clip.y, o.clip.r, 0, Math.PI * 2); c.clip(); }
    c.lineJoin = 'round'; c.lineCap = 'round';
    const hole = o.hole && o.hole.r > 0.5 ? o.hole : null;
    if (hole) { c.save(); c.beginPath(); c.rect(-10, -10, W + 20, H + 20); c.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2, true); c.clip('evenodd'); }
    if (!hole || hole.r < 2400) for (const it of items) it.f();
    if (hole) c.restore();
    if (ruleK > 0 || (hero && !hole)) this.drawHero(c, cam, ruleIdx, Math.max(dim, heroLit), ruleK, o);
    else if (hero && hole) {
      // inside the ink opening the rung is lit; outside it is still part of the engraving
      c.save(); c.beginPath(); c.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2); c.clip();
      this.drawHero(c, cam, ruleIdx, Math.max(dim, heroLit), 0, o);
      c.restore();
    }
    c.restore();
    c.globalAlpha = 1; c.lineCap = 'butt'; c.lineJoin = 'miter';
  }

  /** The one base pair that stays lit while the rest goes dark, and straightens into a horizontal rule. */
  private drawHero(c: CanvasRenderingContext2D, cam: Cam, i: number, dim: number, ruleK: number, o: EngraveOpts) {
    const bp = this.bps[i]!;
    const A = bp.a, B = bp.b;
    const i0 = Math.max(0, i - 1), i1 = Math.min(this.n - 1, i + 1);
    const up = this.bps[i1]!.c.clone().sub(this.bps[i0]!.c).normalize();
    const u = B.clone().sub(A); const Lc = u.length(); u.normalize();
    const v = new THREE.Vector3().crossVectors(up, u).normalize();
    const inner = Lc - 2 * this.tubeR * 0.85 - this.gap;
    const q1 = bp.base === 'A' || bp.base === 'G' ? 0.56 : 0.44;
    const s0 = this.tubeR * 0.85, s1 = s0 + inner * q1, s2 = s1 + this.gap, s3 = Lc - this.tubeR * 0.85;
    const V = bp.c.clone().sub(cam.cam.position).normalize();
    const topS = V.dot(up) < 0 ? 1 : -1, hh = this.plateT / 2, pw = this.plateW;
    const at = (s: number, w: number) => { const p = A.clone().addScaledVector(u, s).addScaledVector(v, w).addScaledVector(up, topS * hh); return cam.proj(p.x, p.y, p.z); };
    const e = ease.inOutCubic(clamp(ruleK)), ry = o.ruleY ?? CY, x0 = o.ruleX0 ?? 0, x1 = o.ruleX1 ?? W;
    // flip so the rung's left end goes to the rule's left end
    const pa = at(s0, 0), pb = at(s3, 0);
    const flip = pa.x > pb.x;
    const X = (s: number) => lerp(x0, x1, flip ? (s3 - s) / (s3 - s0) : (s - s0) / (s3 - s0));
    const flat = (p: { x: number; y: number }, s: number, sgn: number) => ({ x: lerp(p.x, X(s), e), y: lerp(p.y, ry + sgn * 1.6, e) });
    const col = linToCss(mixLin(PAPER_LIT_LIN, LIN.bone, dim));
    const poly = (q: { x: number; y: number }[]) => { c.beginPath(); c.moveTo(q[0]!.x, q[0]!.y); for (let k = 1; k < q.length; k++) c.lineTo(q[k]!.x, q[k]!.y); c.closePath(); };
    // as it straightens the H-bond gap closes: one continuous rule
    const g = lerp(1, 0, e);
    const segs: [number, number][] = g > 0.02 ? [[s0, s1 + (s2 - s1) * (1 - g) * 0.5], [s2 - (s2 - s1) * (1 - g) * 0.5, s3]] : [[s0, s3]];
    // the edge that is higher on screen becomes the rule's top edge (no pinch as the slab flattens)
    const sg = at((s0 + s3) / 2, -pw).y < at((s0 + s3) / 2, pw).y ? 1 : -1;
    for (const [sa, sb] of segs) {
      const q = [flat(at(sa, -pw), sa, -sg), flat(at(sb, -pw), sb, -sg), flat(at(sb, pw), sb, sg), flat(at(sa, pw), sa, sg)];
      c.fillStyle = col; poly(q); c.fill();
      c.strokeStyle = rgba('ink', 0.85 * (1 - dim)); c.lineWidth = 1.2; c.stroke();
    }
    if (g > 0.05) {
      const nH = HBONDS[bp.base];
      c.strokeStyle = linToCss(mixLin(LIN.ink, LIN.bone, dim), g); c.lineWidth = 1.1;
      c.beginPath();
      for (let k = 0; k < nH; k++) {
        const w = (nH === 1 ? 0 : (k / (nH - 1) - 0.5) * 1.3) * pw;
        const p = flat(at(s1 + this.gap * 0.18, w), s1, 0), q = flat(at(s2 - this.gap * 0.18, w), s2, 0);
        c.moveTo(p.x, p.y); c.lineTo(q.x, q.y);
      }
      c.stroke();
    }
  }

  /** Screen centre of base `i`'s own half (strand 1 side) — where the bracket goes. */
  baseCentre(cam: Cam, i: number) {
    const bp = this.bps[i]!;
    const u = bp.b.clone().sub(bp.a); const Lc = u.length(); u.normalize();
    const inner = Lc - 2 * this.tubeR * 0.85 - this.gap;
    const q1 = bp.base === 'A' || bp.base === 'G' ? 0.56 : 0.44;
    const s = this.tubeR * 0.85 + inner * q1 * 0.5;
    const p = bp.a.clone().addScaledVector(u, s);
    return { world: p, scr: cam.proj(p.x, p.y, p.z), halfLen: inner * q1 * 0.5 };
  }
}

// ------------------------------------------------------------------ the plate: geometry, camera, state
/** Base pairs either side of the first base in the plate helix, and the first base's index. */
export const PLATE_N = 30;
export const FIRST = PLATE_N;
/** Plate helix phase: at the first base pair the minor groove faces the camera and the rung lies across the frame. */
export const PHASE = (-165 * Math.PI) / 180;
/** Strand-1 angle of the base pair at height y (nm) in the plate helix; its major groove is centred at +255°. */
export const strandAngle = (y: number) => PHASE + BDNA.twist * (y / BDNA.rise);

export function plateHelix(extra = 0): { bps: HelixBP[]; first: number } {
  const n = 2 * PLATE_N + 1 + extra;
  const seq = sequence(n, 7);
  seq[FIRST] = 'C'; seq[FIRST + 1] = 'A'; seq[FIRST - 1] = 'G';
  const bps = helix(n, straightAxis({ x: 0, y: -FIRST * BDNA.rise, z: 0 }, { x: 0, y: 1, z: 0 }), { phase: PHASE - FIRST * BDNA.twist, seq });
  return { bps, first: FIRST };
}

/** World point the plate camera centres on: the first base's own half-rung (so the point sits on the base). */
export function plateTarget(h: EngravedHelix): P3 {
  const w = h.baseCentre(new Cam(), FIRST).world;
  return { x: w.x, y: w.y, z: w.z };
}

export const PLATE_FOV = 18;
export const PLATE_PITCH = 0.2;
/** Camera distance giving `pxNm` px per nm at the target (fov fixed). */
export function distFor(pxNm: number, fov = PLATE_FOV) {
  return (H / 2 / Math.tan((fov * Math.PI) / 360)) / pxNm;
}
export function plateCam(cam: Cam, tgt: P3, pxNm = PLATE_PX_NM, yaw = 0, pitch = PLATE_PITCH) {
  return cam.orbit(tgt, yaw, pitch, distFor(pxNm), 0, PLATE_FOV);
}

/**
 * The opening plate as a function of plate time τ (the opening's song time):
 * pointer slides in on the first downbeat, finds the base, strands grow around it, the bracket closes
 * and lands on the first sung note ("I"), the pointer backs off. From ~1.45 s it is a still plate —
 * the composition the outro lands back on.
 */
export interface PlateTimes { d0: number; sing: number }
export function plateState(tau: number, T: PlateTimes) {
  const tIn0 = T.d0, tIn1 = T.d0 + 0.55;
  const tBase0 = tIn1 - 0.04, tBase1 = tBase0 + 0.2;
  const tGrow0 = tBase0 + 0.1, tGrow1 = T.sing - 0.02;
  const tBr0 = tBase1 - 0.1, tBr1 = T.sing;
  const tOut0 = T.sing - 0.35, tOut1 = T.sing + 0.05;
  const pin = prog(tau, tIn0, tIn1, ease.outCubic);
  const pout = prog(tau, tOut0, tOut1, ease.inOutCubic);
  return {
    /** pointer: tip distance from the point, 0 = touching (px), and visibility */
    pointerGap: lerp(FIELD_R - 8, 0, pin) + lerp(0, 150, pout),
    pointerA: prog(tau, tIn0 - 0.05, tIn0 + 0.1) * (1 - prog(tau, tOut1 - 0.15, tOut1)),
    /** the first base materialising at the point (0..1) */
    base: prog(tau, tBase0, tBase1, ease.outCubic),
    /** strands' half-extent in base pairs */
    ext: lerp(0.35, 11.5, prog(tau, tGrow0, tGrow1, (x) => 1 - Math.pow(1 - x, 2.4))) * (tau < tGrow0 ? prog(tau, tBase0, tGrow0) : 1),
    /** bracket closing: scale factor (1 = closed) and alpha */
    brK: lerp(2.3, 1, prog(tau, tBr0, tBr1, ease.outCubic)),
    brA: prog(tau, tBr0, tBr0 + 0.12),
    /** the point before it becomes the bracket's dot */
    pointA: 1,
    bar: prog(tau, tGrow0 + 0.1, tGrow1),
  };
}
export type PlateStateT = ReturnType<typeof plateState>;

/** Draw the plate (paper-layer marks + the helix) for a given state; the backdrop is drawn separately. */
export function drawPlate(c: CanvasRenderingContext2D, h: EngravedHelix, cam: Cam, s: PlateStateT, o: { fieldA?: number; alpha?: number; barA?: number; pxNm?: number } = {}) {
  const a = o.alpha ?? 1;
  drawFieldRing(c, CX, CY, FIELD_R, (o.fieldA ?? 1) * a);
  // the helix grows out of the first base
  if (s.base > 0) {
    const ext = Math.max(s.ext, 0);
    // before the strands grow, only the first base pair shows (fading in from the point)
    h.draw(c, cam, { focus: FIRST, ext: Math.max(0.35, ext), clip: { x: CX, y: CY, r: FIELD_R - 1 }, alpha: a * s.base });
  }
  const bc = h.baseCentre(cam, FIRST);
  const hw = bc.halfLen * bc.scr.s + 16, hh = 26;
  bracketBox(c, bc.scr.x, bc.scr.y, hw * s.brK, hh * s.brK, { alpha: s.brA * a, dot: 0, k: 11 });
  const pa = -0.62, gap = Math.max(0, s.pointerGap);
  pointer(c, CX + Math.cos(pa) * gap, CY + Math.sin(pa) * gap, pa, FIELD_R - 3 - gap, s.pointerA * a);
  // the orange point stays on the base (it is the bracket's centre dot once the bracket closes)
  orangePoint(c, bc.scr.x, bc.scr.y, 5, s.pointA * a);
  scaleBar(c, o.pxNm ?? PLATE_PX_NM, '1 nm', s.bar * (o.barA ?? 1) * a);
}

/** Camera helper: explicit position, target and up vector (the kit's Cam.look fixes up = +Y). */
export function lookUp(cam: Cam, pos: P3, tgt: P3, up: P3, fov: number) {
  cam.cam.fov = fov; cam.fov = fov;
  cam.cam.position.set(pos.x, pos.y, pos.z);
  cam.cam.up.set(up.x, up.y, up.z).normalize();
  cam.cam.lookAt(tgt.x, tgt.y, tgt.z);
  (cam as any).update();
  return cam;
}

/**
 * Orbit camera with a stable up vector (d/dpitch of the view direction), so it can look steeply up or
 * down a helix axis without the kit's +Y up flipping; roll turns it about the view axis.
 */
export function orbitCam(cam: Cam, tgt: P3, yaw: number, pitch: number, dist: number, roll: number, fov: number) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const pos = { x: tgt.x + sy * cp * dist, y: tgt.y + sp * dist, z: tgt.z + cy * cp * dist };
  const up = new THREE.Vector3(-sy * sp, cp, -cy * sp);
  if (roll) up.applyAxisAngle(new THREE.Vector3(-sy * cp, -sp, -cy * cp), roll);
  return lookUp(cam, pos, tgt, up, fov);
}
