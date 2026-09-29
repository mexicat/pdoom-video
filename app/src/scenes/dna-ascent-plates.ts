// DNA edition, `ascent` — the six engraved plates of the scale atlas, drawn once in init() into
// offscreen canvases (bone-on-ink engraving on a transparent ground; the scene draws the panel, the
// frame and the scale bar live). Each plate is its own figure with its own scale: DNA, nucleosome,
// nucleus, cell, tissue, organism. All geometry is schematic, drawn to the stated scale bar.
import * as THREE from 'three';
import { SCALE } from '../engine/gl';
import { clamp, lerp, smoothstep, mulberry32, noise2 } from '../engine/util';
import { helix, sequence, straightAxis, HBONDS, type HelixBP, type Axis } from './dna-kit';

/** Plate size in plate px (16:10). One world unit of the ladder = 62.5 plate px. */
export const PLW = 1000, PLH = 625;
const SPR = 1.1 * SCALE;

const RGB = { ink: [10, 10, 11], ink2: [21, 21, 23], ink3: [30, 30, 33], graphite: [94, 91, 87], ash: [156, 151, 143], bone: [238, 233, 223] } as const;
type CK = keyof typeof RGB;
export function mix(a: CK, b: CK, k: number, al = 1) {
  const A = RGB[a], B = RGB[b], q = clamp(k);
  return `rgba(${Math.round(lerp(A[0], B[0], q))},${Math.round(lerp(A[1], B[1], q))},${Math.round(lerp(A[2], B[2], q))},${al})`;
}
const bone = (a: number) => `rgba(238,233,223,${a})`;
const ink = (a: number) => `rgba(10,10,11,${a})`;

export interface Plate {
  key: string;
  canvas: HTMLCanvasElement;
  /** Scale bar length (plate px) and its text. */
  bar: number;
  barText: string;
  /** Ladder coordinate: log10(scale bar length / 1 nm). */
  u: number;
  /** A point of interest (plate px), for the focus bracket. */
  focus?: { x: number; y: number };
}

function sprite() {
  const cv = document.createElement('canvas');
  cv.width = Math.round(PLW * SPR); cv.height = Math.round(PLH * SPR);
  const c = cv.getContext('2d')!;
  c.scale(SPR, SPR);
  c.lineCap = 'round'; c.lineJoin = 'round';
  return { cv, c };
}

// ------------------------------------------------------------------ helix engraving (Canvas2D)
type V = { x: number; y: number; d: number };
type Item = { d: number; front: boolean; f: (c: CanvasRenderingContext2D) => void };

function tubeSeg(c: CanvasRenderingContext2D, a: V, b: V, w: number, sh: number) {
  const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / dl, uy = (b.y - a.y) / dl;
  if (w < 13) {
    c.lineCap = 'round';
    c.strokeStyle = mix('ink2', 'bone', sh); c.lineWidth = w;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    const nx = -uy * (w / 2 + 0.4), ny = ux * (w / 2 + 0.4);
    c.lineCap = 'butt'; c.strokeStyle = ink(0.9); c.lineWidth = Math.max(1.1, w * 0.07);
    c.beginPath();
    c.moveTo(a.x + nx, a.y + ny); c.lineTo(b.x + nx, b.y + ny);
    c.moveTo(a.x - nx, a.y - ny); c.lineTo(b.x - nx, b.y - ny);
    c.stroke();
    return;
  }
  // engraved tube: a dark core crossed by lines along its length, brighter toward the light
  const ov = 2.2, ax = a.x - ux * ov, ay = a.y - uy * ov, bx = b.x + ux * ov, by = b.y + uy * ov;
  c.lineCap = 'butt';
  c.strokeStyle = mix('ink', 'ink2', 0.7); c.lineWidth = w;
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  const nx = -uy, ny = ux;
  const lit = nx * -0.55 + ny * -0.83; // which side of the tube faces the upper-left light
  const N = 6;
  c.lineWidth = Math.max(1.1, w * 0.075);
  for (let j = 0; j < N; j++) {
    const o = (j / (N - 1)) * 2 - 1; // -1..1 across the tube
    const off = o * (w / 2 - 1.2);
    const lat = clamp(0.5 + 0.5 * o * Math.sign(lit || 1) * Math.min(1, Math.abs(lit) * 1.6 + 0.3));
    const edge = Math.abs(o) > 0.99 ? 0.25 : 0;
    const al = clamp(sh * (0.3 + 0.9 * lat ** 1.3) + edge * sh);
    c.strokeStyle = bone(al);
    c.beginPath(); c.moveTo(ax + nx * off, ay + ny * off); c.lineTo(bx + nx * off, by + ny * off); c.stroke();
  }
}

/** Painter-sortable items for a helix (right-handed B-DNA from dna-kit `helix`), projected by P. */
function helixItems(bps: HelixBP[], P: (v: THREE.Vector3) => V, S: number, o: { tube?: number; light?: THREE.Vector3; d0: number; d1: number; front?: (q: HelixBP) => boolean }): Item[] {
  const items: Item[] = [];
  const tube = o.tube ?? 0.24;
  const light = (o.light ?? new THREE.Vector3(-0.5, 0.7, 0.5)).clone().normalize();
  const fog = (d: number) => lerp(1, 0.4, smoothstep(o.d0, o.d1, d));
  const shadeT = (dv: THREE.Vector3) => 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - (dv.dot(light) / Math.max(1e-6, dv.length())) ** 2));
  const wpx = Math.max(1.4, tube * S);
  for (const strand of [0, 1]) {
    for (let i = 0; i < bps.length - 1; i++) {
      const q0 = bps[i]!, q1 = bps[i + 1]!;
      const fr = o.front ? o.front(q0) : false;
      const A = strand === 0 ? q0.a : q0.b, B = strand === 0 ? q1.a : q1.b;
      const ra = A.clone().sub(q0.c), rb = B.clone().sub(q1.c);
      let prev = A.clone(), pp = P(prev);
      for (let k = 1; k <= 4; k++) {
        const u = k / 4;
        const cc = q0.c.clone().lerp(q1.c, u);
        const len = lerp(ra.length(), rb.length(), u);
        const qa = ra.clone().normalize(), qb = rb.clone().normalize();
        const ang = Math.acos(clamp(qa.dot(qb), -1, 1));
        const r = ra.clone().lerp(rb, u);
        if (ang > 1e-4) {
          const sa = Math.sin((1 - u) * ang) / Math.sin(ang), sb = Math.sin(u * ang) / Math.sin(ang);
          r.copy(qa.multiplyScalar(sa).add(qb.multiplyScalar(sb))).setLength(len);
        }
        const Pt = cc.add(r), pq = P(Pt);
        const sh = shadeT(Pt.clone().sub(prev)) * fog((pp.d + pq.d) / 2);
        const a = pp, b = pq;
        items.push({ d: (a.d + b.d) / 2, front: fr, f: (c) => tubeSeg(c, a, b, wpx, sh) });
        prev = Pt; pp = pq;
      }
    }
  }
  for (const q of bps) {
    const a = P(q.a), b = P(q.b), fr = o.front ? o.front(q) : false;
    const d = (a.d + b.d) / 2 + 0.05;
    const sh = 0.72 * fog(d);
    const w = Math.max(1.4, 0.16 * S);
    const nH = HBONDS[q.base];
    items.push({
      d, front: fr, f: (c) => {
        const gap = 0.08, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const ha = { x: lerp(a.x, mx, 1 - gap), y: lerp(a.y, my, 1 - gap) }, hb = { x: lerp(b.x, mx, 1 - gap), y: lerp(b.y, my, 1 - gap) };
        c.lineCap = 'butt';
        if (w >= 10) {
          // engraved half-rungs: dark core with two edge lines and a centre line
          for (const [p0, p1, k] of [[a, ha, 1], [b, hb, 0.84]] as const) {
            const dl = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, nx = -(p1.y - p0.y) / dl, ny = (p1.x - p0.x) / dl;
            c.lineWidth = w * 0.8; c.strokeStyle = mix('ink', 'ink2', 0.7);
            c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
            c.lineWidth = Math.max(1, w * 0.09);
            for (const [o, al] of [[-0.36, 0.85], [0, 0.35], [0.36, 0.55]] as const) {
              c.strokeStyle = bone(al * sh * k);
              c.beginPath(); c.moveTo(p0.x + nx * o * w, p0.y + ny * o * w); c.lineTo(p1.x + nx * o * w, p1.y + ny * o * w); c.stroke();
            }
          }
        } else {
          c.lineWidth = w;
          c.strokeStyle = mix('ink2', 'bone', sh); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(ha.x, ha.y); c.stroke();
          c.strokeStyle = mix('ink2', 'bone', sh * 0.84); c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(hb.x, hb.y); c.stroke();
        }
        // hydrogen-bond ticks across the gap: 2 (A·T) or 3 (G·C)
        const rx = hb.x - ha.x, ry = hb.y - ha.y, rl = Math.hypot(rx, ry) || 1, nx = -ry / rl, ny = rx / rl;
        const tl = w * 0.9;
        c.strokeStyle = mix('ink2', 'bone', sh); c.lineWidth = Math.max(1, w * 0.14);
        c.beginPath();
        for (let k = 0; k < nH; k++) {
          const uu = (k + 1) / (nH + 1), cx = lerp(ha.x, hb.x, uu), cy = lerp(ha.y, hb.y, uu);
          c.moveTo(cx - nx * tl, cy - ny * tl); c.lineTo(cx + nx * tl, cy + ny * tl);
        }
        c.stroke();
      },
    });
  }
  return items;
}
function drawItems(c: CanvasRenderingContext2D, items: Item[]) {
  items.sort((x, y) => y.d - x.d);
  for (const it of items) it.f(c);
}

function viewer(R: THREE.Matrix4, S: number, ox: number, oy: number) {
  const v = new THREE.Vector3();
  return (p: THREE.Vector3): V => {
    v.copy(p).applyMatrix4(R);
    return { x: ox + v.x * S, y: oy - v.y * S, d: -v.z };
  };
}
const rot = (x: number, y: number, z = 0) => new THREE.Matrix4().makeRotationX(x).multiply(new THREE.Matrix4().makeRotationY(y)).multiply(new THREE.Matrix4().makeRotationZ(z));

// ------------------------------------------------------------------ 1. DNA (2 nm)
function plateDNA(): Plate {
  const { cv, c } = sprite();
  const S = 84; // px per nm
  const n = 30;
  const bps = helix(n, straightAxis({ x: -((n - 1) * 0.34) / 2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), { phase: 0.6, seq: sequence(n, 11), e1: { x: 0, y: 1, z: 0 } });
  const R = rot(0.34, -0.12, -0.06);
  const P = viewer(R, S, 500, 292);
  drawItems(c, helixItems(bps, P, S, { tube: 0.25, d0: -1, d1: 1.2 }));
  const q = bps[17]!;
  const m = P(q.a.clone().lerp(q.b, 0.5));
  return { key: 'dna', canvas: cv, bar: 2 * S, barText: '2 nm', u: Math.log10(2), focus: { x: m.x, y: m.y } };
}

// ------------------------------------------------------------------ 2. nucleosome (10 nm)
/** A polyline axis with arc-length lookup, for helix() along a curve. */
function polyAxis(pts: THREE.Vector3[]): { axis: Axis; len: number } {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!));
  const axis: Axis = (s, p, tn) => {
    s = clamp(s, 0, L[L.length - 1]!);
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid]! < s) lo = mid; else hi = mid; }
    const u = (s - L[lo]!) / Math.max(1e-6, L[hi]! - L[lo]!);
    p.copy(pts[lo]!).lerp(pts[hi]!, u);
    tn.subVectors(pts[hi]!, pts[lo]!).normalize();
  };
  return { axis, len: L[L.length - 1]! };
}

function plateNucleosome(): Plate {
  const { cv, c } = sprite();
  const S = 34;
  // DNA axis: a left-handed superhelix (radius 4.2 nm, pitch 2.4 nm, 1.65 turns) around the octamer's
  // local +Y axis, with straight linker DNA leaving tangentially at both ends
  const Rsh = 4.2, pitch = 2.4, turns = 1.65, cz = pitch / (Math.PI * 2);
  const phi0 = -Math.PI * 0.55, phi1 = phi0 + turns * Math.PI * 2;
  const yc = (cz * (phi0 + phi1)) / 2;
  const at = (ph: number) => new THREE.Vector3(Rsh * Math.cos(ph), cz * ph - yc, Rsh * Math.sin(ph));
  const tan = (ph: number) => new THREE.Vector3(-Rsh * Math.sin(ph), cz, Rsh * Math.cos(ph)).normalize();
  const pts: THREE.Vector3[] = [];
  const LK = 11;
  for (let k = 20; k >= 1; k--) pts.push(at(phi0).addScaledVector(tan(phi0), (-LK * k) / 20));
  for (let i = 0; i <= 360; i++) pts.push(at(lerp(phi0, phi1, i / 360)));
  for (let k = 1; k <= 20; k++) pts.push(at(phi1).addScaledVector(tan(phi1), (LK * k) / 20));
  const { axis, len } = polyAxis(pts);
  const n = Math.floor(len / 0.34);
  const bps = helix(n, axis, { phase: 0.3, seq: sequence(n, 23), e1: { x: 0, y: 1, z: 0 } });
  const R = rot(0.5, 0.42, 0.1);
  const P = viewer(R, S, 560, 300);
  // which side of the octamer each pair lies on (toward the viewer = in front of the core)
  const tmp = new THREE.Vector3();
  const Rrot = new THREE.Matrix4().extractRotation(R);
  const front = (q: HelixBP) => tmp.set(q.c.x, 0, q.c.z).applyMatrix4(Rrot).z > 0;
  const items = helixItems(bps, P, S, { tube: 0.26, d0: -4, d1: 5, front });
  const back = items.filter((i) => !i.front), fr = items.filter((i) => i.front);
  drawItems(c, back);
  // the histone octamer core: an engraved puck
  const rc = 3.2, hh = 2.9;
  const top: V[] = [], bot: V[] = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    top.push(P(new THREE.Vector3(rc * Math.cos(a), hh, rc * Math.sin(a))));
    bot.push(P(new THREE.Vector3(rc * Math.cos(a), -hh, rc * Math.sin(a))));
  }
  const hull = convexHull([...top, ...bot]);
  const hp = new Path2D();
  hull.forEach((p, i) => (i ? hp.lineTo(p.x, p.y) : hp.moveTo(p.x, p.y)));
  hp.closePath();
  c.fillStyle = mix('ink2', 'graphite', 0.35); c.fill(hp);
  c.save(); c.clip(hp);
  const light = new THREE.Vector3(-0.55, 0.65, 0.5).normalize();
  const nrm = new THREE.Vector3();
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    nrm.set(Math.cos(a), 0, Math.sin(a));
    const nv = nrm.clone().applyMatrix4(Rrot);
    if (nv.z <= 0) continue;
    const lam = Math.max(0, nv.dot(light));
    const p0 = P(new THREE.Vector3(rc * Math.cos(a), -hh, rc * Math.sin(a))), p1 = P(new THREE.Vector3(rc * Math.cos(a), hh, rc * Math.sin(a)));
    c.strokeStyle = bone(0.12 + 0.5 * lam); c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
  }
  // lit top face with lathe rings
  const tp = new Path2D();
  top.forEach((p, i) => (i ? tp.lineTo(p.x, p.y) : tp.moveTo(p.x, p.y)));
  tp.closePath();
  c.fillStyle = mix('ink2', 'graphite', 0.7); c.fill(tp);
  for (let k = 1; k <= 7; k++) {
    const rr = (rc * k) / 7.5;
    c.strokeStyle = bone(0.1 + 0.05 * k); c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2, p = P(new THREE.Vector3(rr * Math.cos(a), hh, rr * Math.sin(a)));
      if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
    }
    c.stroke();
  }
  c.restore();
  c.strokeStyle = bone(0.7); c.lineWidth = 1.4; c.stroke(hp);
  c.strokeStyle = bone(0.55); c.lineWidth = 1.1; c.stroke(tp);
  drawItems(c, fr);
  return { key: 'nucleosome', canvas: cv, bar: 10 * S, barText: '10 nm', u: 1 };
}

function convexHull(pts: V[]): V[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: V, a: V, b: V) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: V[] = [], up: V[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]!; while (up.length >= 2 && cr(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

// ------------------------------------------------------------------ shared 2D engraving helpers
type P2 = { x: number; y: number };
function blob(cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.05, n = 160): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + wob * noise2(Math.cos(a) * 1.4 + seed, Math.sin(a) * 1.4 - seed) + wob * 0.4 * Math.sin(3 * a + seed);
    out.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return out;
}
function pathOf(pts: P2[], close = true) {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
  if (close) p.closePath();
  return p;
}
function scaleAbout(pts: P2[], cx: number, cy: number, k: number): P2[] {
  return pts.map((q) => ({ x: cx + (q.x - cx) * k, y: cy + (q.y - cy) * k }));
}
/** Parallel hatch lines across a region (the caller clips). */
function hatchLines(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, step: number, ang: number) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  c.beginPath();
  for (let o = -R; o <= R; o += step) {
    c.moveTo(cx + nx * o - dx * R, cy + ny * o - dy * R); c.lineTo(cx + nx * o + dx * R, cy + ny * o + dy * R);
  }
  c.stroke();
}
/** Chromatin fibres: smooth random walks. */
function walks(c: CanvasRenderingContext2D, rnd: () => number, n: number, start: () => P2, steps: number, stepLen: number, al: [number, number], w: number, seed: number) {
  for (let i = 0; i < n; i++) {
    let { x, y } = start();
    const a0 = rnd() * Math.PI * 2, fo = rnd() * 40;
    c.strokeStyle = bone(lerp(al[0], al[1], rnd())); c.lineWidth = w;
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < steps; k++) {
      const a = a0 + 2.6 * noise2(x * 0.013 + seed + fo, y * 0.013 - fo);
      x += Math.cos(a) * stepLen; y += Math.sin(a) * stepLen;
      c.lineTo(x, y);
    }
    c.stroke();
  }
}

/** Nuclear envelope: two membranes joined at the pores, with the pore complexes. */
function envelope(c: CanvasRenderingContext2D, outer: P2[], cx: number, cy: number, gap: number, nPores: number, rnd: () => number, lw = 1.4) {
  const n = outer.length;
  const inner = outer.map((q) => { const dx = q.x - cx, dy = q.y - cy, r = Math.hypot(dx, dy); return { x: cx + dx * (1 - gap / r), y: cy + dy * (1 - gap / r) }; });
  const poreAt: number[] = [];
  for (let i = 0; i < nPores; i++) poreAt.push(Math.floor(((i + 0.3 + 0.4 * rnd()) / nPores) * n) % n);
  poreAt.sort((a, b) => a - b);
  const half = Math.max(1, Math.round(n / nPores / 7));
  c.strokeStyle = bone(0.85); c.lineWidth = lw;
  for (let k = 0; k < poreAt.length; k++) {
    const s = poreAt[k]! + half, e = poreAt[(k + 1) % poreAt.length]! - half + (k + 1 === poreAt.length ? n : 0);
    c.beginPath();
    for (let i = s; i <= e; i++) { const q = outer[i % n]!; if (i === s) c.moveTo(q.x, q.y); else c.lineTo(q.x, q.y); }
    for (let i = e; i >= s; i--) { const q = inner[i % n]!; c.lineTo(q.x, q.y); }
    c.closePath();
    c.stroke();
  }
  // pore complexes: a short plug across each gap
  c.strokeStyle = mix('ink2', 'ash', 0.9); c.lineWidth = lw * 1.6;
  for (const i of poreAt) {
    const o = outer[i]!, q = inner[i]!;
    c.beginPath(); c.moveTo(lerp(o.x, q.x, -0.35), lerp(o.y, q.y, -0.35)); c.lineTo(lerp(o.x, q.x, 1.35), lerp(o.y, q.y, 1.35)); c.stroke();
  }
  return inner;
}

// ------------------------------------------------------------------ 3. nucleus (µm)
function plateNucleus(): Plate {
  const { cv, c } = sprite();
  const rnd = mulberry32(31);
  const cx = 470, cy = 300, rx = 300, ry = 232;
  const outer = blob(cx, cy, rx, ry, 1.3, 0.05, 240);
  c.fillStyle = mix('ink2', 'graphite', 0.14); c.fill(pathOf(outer));
  const inner = envelope(c, outer, cx, cy, 7, 24, rnd, 1.5);
  const ip = pathOf(inner);
  c.save(); c.clip(ip);
  // euchromatin: loose fibres; heterochromatin: dense at the lamina and around the nucleolus
  const nuc = { x: cx + 70, y: cy - 30, r: 76 };
  const inside = (): P2 => { for (;;) { const x = cx + (rnd() * 2 - 1) * rx, y = cy + (rnd() * 2 - 1) * ry; if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 0.9) return { x, y }; } };
  walks(c, rnd, 240, inside, 30, 4, [0.12, 0.34], 0.9, 3);
  walks(c, rnd, 260, () => { const a = rnd() * Math.PI * 2, k = 0.86 + 0.08 * rnd(); return { x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k }; }, 12, 3, [0.3, 0.6], 1.1, 7);
  walks(c, rnd, 90, () => { const a = rnd() * Math.PI * 2, k = 1.05 + 0.25 * rnd(); return { x: nuc.x + Math.cos(a) * nuc.r * k, y: nuc.y + Math.sin(a) * nuc.r * k }; }, 10, 3, [0.3, 0.55], 1.1, 9);
  // nucleolus: dense cross-hatched body with fibrillar centres
  const nb = blob(nuc.x, nuc.y, nuc.r, nuc.r * 0.86, 4.1, 0.08, 120);
  const np = pathOf(nb);
  c.fillStyle = mix('ink2', 'graphite', 0.4); c.fill(np);
  c.save(); c.clip(np);
  c.strokeStyle = bone(0.42); c.lineWidth = 0.9;
  hatchLines(c, nuc.x - nuc.r, nuc.y - nuc.r, nuc.x + nuc.r, nuc.y + nuc.r, 3.4, 0.6);
  c.strokeStyle = bone(0.26);
  hatchLines(c, nuc.x - nuc.r, nuc.y - nuc.r, nuc.x + nuc.r, nuc.y + nuc.r, 4.2, -0.7);
  c.fillStyle = bone(0.5);
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * nuc.r;
    const x = nuc.x + Math.cos(a) * rr, y = nuc.y + Math.sin(a) * rr * 0.86;
    if (noise2(x * 0.05, y * 0.05, 5) > 0.1) c.fillRect(x, y, 1.3, 1.3);
  }
  c.restore();
  c.strokeStyle = bone(0.6); c.lineWidth = 1.2; c.stroke(np);
  // side light: engraved shadow hatch toward the lower right
  const g = c.createLinearGradient(cx - rx * 0.4, cy - ry * 0.4, cx + rx, cy + ry);
  g.addColorStop(0, ink(0)); g.addColorStop(1, ink(0.55));
  c.strokeStyle = g; c.lineWidth = 1.2;
  hatchLines(c, cx - rx, cy - ry, cx + rx, cy + ry, 5, -0.75);
  c.restore();
  const S = 80; // px per µm (nucleus ≈ 7.5 µm across)
  return { key: 'nucleus', canvas: cv, bar: 2 * S, barText: '2 µm', u: Math.log10(2000) };
}

// ------------------------------------------------------------------ 4. cell (10–20 µm)
function plateCell(): Plate {
  const { cv, c } = sprite();
  const rnd = mulberry32(47);
  const cx = 520, cy = 300, rx = 300, ry = 238;
  const mem = blob(cx, cy, rx, ry, 2.7, 0.07, 260);
  const mp = pathOf(mem);
  c.fillStyle = mix('ink2', 'graphite', 0.08); c.fill(mp);
  c.save(); c.clip(mp);
  // cytoplasm stipple
  c.fillStyle = bone(0.2);
  for (let i = 0; i < 1400; i++) { const x = cx + (rnd() * 2 - 1) * rx, y = cy + (rnd() * 2 - 1) * ry; c.fillRect(x, y, 1.1, 1.1); }
  // nucleus
  const nx = cx - 40, ny = cy + 8, nr = 100;
  const nout = blob(nx, ny, nr, nr * 0.86, 5.2, 0.05, 160);
  c.fillStyle = mix('ink2', 'graphite', 0.2); c.fill(pathOf(nout));
  const nin = envelope(c, nout, nx, ny, 5, 22, rnd, 1.2);
  c.save(); c.clip(pathOf(nin));
  walks(c, rnd, 90, () => ({ x: nx + (rnd() * 2 - 1) * nr * 0.8, y: ny + (rnd() * 2 - 1) * nr * 0.7 }), 14, 3, [0.15, 0.4], 0.8, 2);
  c.fillStyle = mix('ink2', 'graphite', 0.5);
  const nlp = pathOf(blob(nx + 26, ny - 18, 26, 22, 3.3, 0.1, 60));
  c.fill(nlp); c.strokeStyle = bone(0.5); c.lineWidth = 1; c.stroke(nlp);
  c.restore();
  // rough ER: wavy cisternae hugging the nucleus, ribosome dots on their outer face
  for (let k = 0; k < 4; k++) {
    const r0 = nr + 22 + k * 15, a0 = 0.9 + k * 0.25, a1 = a0 + 2.6 - k * 0.2;
    c.strokeStyle = bone(0.55 - k * 0.08); c.lineWidth = 1.1;
    c.beginPath();
    const pts: P2[] = [];
    for (let i = 0; i <= 90; i++) {
      const a = lerp(a0, a1, i / 90), r = r0 + 4 * Math.sin(a * 9 + k);
      pts.push({ x: nx + Math.cos(a) * r, y: ny + Math.sin(a) * r * 0.9 });
    }
    pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.stroke();
    c.fillStyle = bone(0.5);
    for (let i = 0; i < pts.length; i += 3) c.fillRect(pts[i]!.x + 1.5, pts[i]!.y - 1.5, 1.8, 1.8);
  }
  // Golgi stack
  const gx = cx + 150, gy = cy - 110;
  for (let k = 0; k < 5; k++) {
    const L = 64 - k * 7;
    c.strokeStyle = bone(0.7 - k * 0.08); c.lineWidth = 2.4;
    c.beginPath(); c.arc(gx - k * 9, gy + k * 9, 60 + k * 2, -0.35 - L / 240, -0.35 + L / 240); c.stroke();
  }
  for (let i = 0; i < 7; i++) { c.strokeStyle = bone(0.55); c.lineWidth = 1; c.beginPath(); c.arc(gx + 40 + rnd() * 30, gy - 40 + rnd() * 60, 3 + rnd() * 3, 0, Math.PI * 2); c.stroke(); }
  // mitochondria with cristae
  const mito: [number, number, number][] = [[cx + 150, cy + 90, 0.5], [cx + 60, cy + 175, -0.2], [cx - 200, cy - 120, 0.9], [cx - 220, cy + 110, -0.8], [cx + 230, cy - 10, 1.4], [cx - 90, cy - 170, 0.1]];
  for (const [mx, my, ma] of mito) {
    c.save(); c.translate(mx, my); c.rotate(ma);
    const L = 34 + rnd() * 10, Wd = 12;
    c.fillStyle = mix('ink2', 'graphite', 0.3);
    c.beginPath(); c.ellipse(0, 0, L, Wd, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = bone(0.8); c.lineWidth = 1.3; c.stroke();
    c.strokeStyle = bone(0.5); c.lineWidth = 1;
    c.beginPath();
    for (let x = -L + 8; x < L - 6; x += 7) { c.moveTo(x, -Wd + 3); c.lineTo(x + 3, Wd * 0.3); }
    c.stroke();
    c.restore();
  }
  // vesicles
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, k = 0.55 + 0.35 * rnd();
    c.strokeStyle = bone(0.5); c.lineWidth = 1;
    c.beginPath(); c.arc(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, 3 + rnd() * 5, 0, Math.PI * 2); c.stroke();
  }
  // shadow hatch
  const g = c.createLinearGradient(cx - rx * 0.3, cy - ry * 0.3, cx + rx, cy + ry);
  g.addColorStop(0, ink(0)); g.addColorStop(1, ink(0.6));
  c.strokeStyle = g; c.lineWidth = 1.3;
  hatchLines(c, cx - rx, cy - ry, cx + rx, cy + ry, 5.5, -0.75);
  c.restore();
  c.strokeStyle = bone(0.9); c.lineWidth = 1.8; c.stroke(mp);
  c.strokeStyle = bone(0.3); c.lineWidth = 1; c.stroke(pathOf(scaleAbout(mem, cx, cy, 0.975)));
  const S = 34; // px per µm (cell ≈ 17 µm across)
  return { key: 'cell', canvas: cv, bar: 10 * S, barText: '10 µm', u: Math.log10(10000) };
}

// ------------------------------------------------------------------ 5. tissue (epithelium, en face)
function plateTissue(): Plate {
  // a simple columnar epithelium in section: brush border above, nuclei near the base, a basement
  // membrane, and loose connective tissue with a capillary below (schematic)
  const { cv, c } = sprite();
  const rnd = mulberry32(59);
  const yb = (x: number) => 392 + 26 * Math.sin(x * 0.0062 + 0.4) + 9 * Math.sin(x * 0.017 + 1.1);
  const dyb = (x: number) => (yb(x + 0.5) - yb(x - 0.5));
  const up = (x: number) => { const d = dyb(x), l = Math.hypot(d, 1); return { x: d / l, y: -1 / l }; };
  const hgt = (x: number) => 168 + 16 * Math.sin(x * 0.009 + 2.0);
  // connective tissue first (behind): collagen fibres, fibroblasts, one capillary
  c.save();
  const below = new Path2D();
  below.moveTo(-10, yb(-10) + 4);
  for (let x = -10; x <= PLW + 10; x += 5) below.lineTo(x, yb(x) + 4);
  below.lineTo(PLW + 10, PLH + 10); below.lineTo(-10, PLH + 10); below.closePath();
  c.fillStyle = mix('ink2', 'graphite', 0.07); c.fill(below);
  c.clip(below);
  for (let i = 0; i < 70; i++) {
    const y0 = yb(0) + 20 + rnd() * 230, ph = rnd() * 6, amp = 4 + rnd() * 9, fr = 0.008 + rnd() * 0.01;
    c.strokeStyle = bone(0.1 + 0.22 * rnd()); c.lineWidth = 0.9 + rnd() * 0.6;
    c.beginPath();
    const x0 = rnd() * PLW - 200, len = 180 + rnd() * 420;
    for (let x = x0; x <= x0 + len; x += 6) { const y = y0 + (yb(x) - yb(0)) * 0.6 + amp * Math.sin(x * fr + ph); if (x === x0) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const x = rnd() * PLW, y = yb(x) + 40 + rnd() * 170, a = (rnd() - 0.5) * 0.5;
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = mix('ink2', 'ash', 0.45); c.beginPath(); c.ellipse(0, 0, 14 + rnd() * 6, 3.2, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = bone(0.7); c.lineWidth = 0.9; c.stroke();
    c.restore();
  }
  {
    const x = 690, y = yb(690) + 120, r = 24;
    c.fillStyle = mix('ink2', 'ink', 0.5); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = bone(0.75); c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(x, y, r - 4, 0, Math.PI * 2); c.lineWidth = 0.8; c.strokeStyle = bone(0.35); c.stroke();
    c.fillStyle = mix('ink2', 'ash', 0.5); c.beginPath(); c.ellipse(x - r + 5, y + 2, 3, 9, 0.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = bone(0.6); c.beginPath(); c.ellipse(x + 3, y - 2, 9, 8, 0, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
  // basement membrane
  c.strokeStyle = bone(0.85); c.lineWidth = 2.2;
  c.beginPath();
  for (let x = -10; x <= PLW + 10; x += 4) { const y = yb(x) + 3; if (x === -10) c.moveTo(x, y); else c.lineTo(x, y); }
  c.stroke();
  // cells
  const walls: number[] = [];
  for (let x = -30; x < PLW + 40; x += 40 + rnd() * 14) walls.push(x);
  const light = { x: -0.6, y: -0.8 };
  for (let i = 0; i < walls.length - 1; i++) {
    const xa = walls[i]! + 1.4, xb = walls[i + 1]! - 1.4;
    const pa = { x: xa, y: yb(xa) }, pb = { x: xb, y: yb(xb) };
    const na = up(xa), nb = up(xb), ha = hgt(xa), hb = hgt(xb);
    const qa = { x: pa.x + na.x * ha, y: pa.y + na.y * ha }, qb = { x: pb.x + nb.x * hb, y: pb.y + nb.y * hb };
    const path = new Path2D();
    path.moveTo(pa.x, pa.y);
    for (let k = 1; k <= 6; k++) { const x = lerp(xa, xb, k / 6); path.lineTo(x, yb(x)); }
    path.lineTo(qb.x, qb.y);
    path.quadraticCurveTo((qa.x + qb.x) / 2, (qa.y + qb.y) / 2 - 6, qa.x, qa.y);
    path.closePath();
    const goblet = rnd() < 0.12;
    c.fillStyle = mix('ink2', 'graphite', 0.1 + 0.14 * rnd()); c.fill(path);
    c.save(); c.clip(path);
    const g = c.createLinearGradient(qa.x, qa.y, pa.x, pa.y);
    g.addColorStop(0, bone(0.3)); g.addColorStop(1, bone(0.06));
    c.strokeStyle = g; c.lineWidth = 0.8;
    c.beginPath();
    for (let x = xa + 3; x < xb; x += 4) { const n = up(x), p0 = { x, y: yb(x) }; c.moveTo(p0.x, p0.y); c.lineTo(p0.x + n.x * 200, p0.y + n.y * 200); }
    c.stroke();
    c.restore();
    c.strokeStyle = bone(0.72); c.lineWidth = 1.1; c.stroke(path);
    const xm = (xa + xb) / 2, nm = up(xm), hm = hgt(xm), bm = { x: xm, y: yb(xm) };
    const ang = Math.atan2(nm.y, nm.x) + Math.PI / 2;
    if (goblet) {
      // goblet cell: a pale mucus cup under the apex, the nucleus pressed to the base
      const cx = bm.x + nm.x * hm * 0.72, cy = bm.y + nm.y * hm * 0.72;
      c.save(); c.translate(cx, cy); c.rotate(ang);
      c.fillStyle = mix('ink2', 'ash', 0.3); c.beginPath(); c.ellipse(0, 0, (xb - xa) * 0.42, hm * 0.25, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = bone(0.35);
      for (let k = 0; k < 40; k++) c.fillRect((rnd() - 0.5) * (xb - xa) * 0.6, (rnd() - 0.5) * hm * 0.4, 1, 1);
      c.strokeStyle = bone(0.6); c.lineWidth = 0.9; c.stroke();
      c.restore();
    }
    const nh = goblet ? 0.16 : 0.3;
    const nx = bm.x + nm.x * hm * nh, ny = bm.y + nm.y * hm * nh;
    c.save(); c.translate(nx, ny); c.rotate(ang);
    c.fillStyle = mix('ink2', 'ash', 0.55); c.beginPath(); c.ellipse(0, 0, Math.min(9, (xb - xa) * 0.3), goblet ? 11 : 20, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = bone(0.85); c.lineWidth = 1; c.stroke();
    c.fillStyle = ink(0.85); c.beginPath(); c.arc(1, -3, 2, 0, Math.PI * 2); c.fill();
    c.restore();
    // brush border: microvilli on the apical surface
    c.strokeStyle = bone(0.5); c.lineWidth = 0.9;
    c.beginPath();
    for (let k = 0.08; k < 0.94; k += 0.09) {
      const x = lerp(qa.x, qb.x, k), y = lerp(qa.y, qb.y, k) - 6 * Math.sin(Math.PI * k);
      c.moveTo(x, y); c.lineTo(x + light.x * 0.5 + nm.x * 8, y + nm.y * 8);
    }
    c.stroke();
  }
  const S = 4; // px per µm (columnar cells ≈ 11 µm wide, 40–45 µm tall)
  return { key: 'tissue', canvas: cv, bar: 50 * S, barText: '50 µm', u: Math.log10(50000) };
}

// ------------------------------------------------------------------ 6. organism (a small fish, ~3.5 cm)
function plateOrganism(): Plate {
  const { cv, c } = sprite();
  const x0 = 150, L = 610, H0 = 92;
  const mid = (u: number) => 300 + 7 * Math.sin(u * Math.PI * 1.6 + 0.4);
  const hh = (u: number) => H0 * (1.25 * Math.sqrt(Math.max(0, u) + 0.002) - 0.25 * u) * (1 - 0.72 * smoothstep(0.3, 1.0, u));
  const X = (u: number) => x0 + u * L;
  const top = (u: number) => mid(u) - hh(u) * 0.9;
  const bot = (u: number) => mid(u) + hh(u) * 1.1;
  const N = 160;
  const body = new Path2D();
  for (let i = 0; i <= N; i++) { const u = i / N; if (i) body.lineTo(X(u), top(u)); else body.moveTo(X(u), top(u)); }
  for (let i = N; i >= 0; i--) { const u = i / N; body.lineTo(X(u), bot(u)); }
  body.closePath();
  // fins first (behind the body): caudal, dorsal, anal, pelvic
  const xe = X(1), ym = mid(1);
  const fin = (base: P2[], tip: P2[], rays: number) => {
    const p = new Path2D();
    base.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
    for (let i = tip.length - 1; i >= 0; i--) p.lineTo(tip[i]!.x, tip[i]!.y);
    p.closePath();
    c.fillStyle = mix('ink2', 'graphite', 0.25); c.fill(p);
    c.strokeStyle = bone(0.5); c.lineWidth = 1;
    c.beginPath();
    for (let r = 0; r <= rays; r++) {
      const k = r / rays, bi = Math.round(k * (base.length - 1)), ti = Math.round(k * (tip.length - 1));
      c.moveTo(base[bi]!.x, base[bi]!.y); c.lineTo(tip[ti]!.x, tip[ti]!.y);
    }
    c.stroke();
    c.strokeStyle = bone(0.75); c.lineWidth = 1.2; c.stroke(p);
  };
  const arcPts = (n: number, f: (k: number) => P2) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  // caudal fin: forked, two lobes
  const cb = arcPts(12, (k) => ({ x: xe - 6, y: lerp(top(1) + 2, bot(1) - 2, k) }));
  const ct = arcPts(12, (k) => {
    const up = { x: xe + 150, y: ym - 92 }, fork = { x: xe + 92, y: ym + 4 }, dn = { x: xe + 154, y: ym + 96 };
    return k < 0.5 ? { x: lerp(up.x, fork.x, (k / 0.5) ** 1.3), y: lerp(up.y, fork.y, k / 0.5) } : { x: lerp(fork.x, dn.x, ((k - 0.5) / 0.5) ** 0.77), y: lerp(fork.y, dn.y, (k - 0.5) / 0.5) };
  });
  fin(cb, ct, 16);
  fin(arcPts(8, (k) => ({ x: X(lerp(0.5, 0.66, k)), y: top(lerp(0.5, 0.66, k)) + 3 })), arcPts(8, (k) => ({ x: X(lerp(0.56, 0.76, k)), y: top(lerp(0.5, 0.66, k)) - lerp(52, 12, k) })), 8);
  fin(arcPts(10, (k) => ({ x: X(lerp(0.56, 0.8, k)), y: bot(lerp(0.56, 0.8, k)) - 3 })), arcPts(10, (k) => ({ x: X(lerp(0.6, 0.86, k)), y: bot(lerp(0.56, 0.8, k)) + lerp(44, 12, k) })), 12);
  fin(arcPts(4, (k) => ({ x: X(lerp(0.42, 0.47, k)), y: bot(lerp(0.42, 0.47, k)) - 2 })), arcPts(4, (k) => ({ x: X(lerp(0.47, 0.55, k)), y: bot(0.45) + lerp(30, 8, k) })), 4);
  // body
  c.fillStyle = mix('ink2', 'graphite', 0.2); c.fill(body);
  c.save(); c.clip(body);
  // engraved lines along the body; horizontal stripes read as bands without lines
  const stripeDark = (v: number) => { const cs = [-0.02, 0.36, 0.7, -0.4]; let d = 1; for (const s of cs) d = Math.min(d, Math.abs(v - s)); return smoothstep(0.1, 0.05, d); };
  for (let j = 0; j < 44; j++) {
    const v = lerp(-0.96, 0.96, j / 43);
    const a = 0.62 * (1 - 0.85 * stripeDark(v)) * (0.55 + 0.45 * (1 - (v + 1) / 2));
    c.strokeStyle = bone(a); c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = lerp(0.17, 1.02, i / 80), yy = mid(u) + v * hh(u) * (v < 0 ? 0.9 : 1.1);
      if (i) c.lineTo(X(u), yy); else c.moveTo(X(u), yy);
    }
    c.stroke();
  }
  // head: fine stipple
  c.fillStyle = bone(0.35);
  const rnd = mulberry32(71);
  for (let i = 0; i < 700; i++) { const u = rnd() * 0.19, v = rnd() * 2 - 1; c.fillRect(X(u), mid(u) + v * hh(u), 1.1, 1.1); }
  // belly shadow
  const g = c.createLinearGradient(0, mid(0.4) - 20, 0, bot(0.4));
  g.addColorStop(0, ink(0)); g.addColorStop(1, ink(0.6));
  c.strokeStyle = g; c.lineWidth = 1.2;
  hatchLines(c, x0, 200, x0 + L + 40, 420, 4.5, -0.8);
  c.restore();
  c.strokeStyle = bone(0.95); c.lineWidth = 1.8; c.stroke(body);
  // operculum, eye, mouth, pectoral fin
  c.strokeStyle = bone(0.7); c.lineWidth = 1.3;
  c.beginPath();
  for (let i = 0; i <= 30; i++) { const k = i / 30, u = 0.19 - 0.035 * Math.sin(k * Math.PI); const yy = lerp(top(0.19) + 6, bot(0.19) - 6, k); if (i) c.lineTo(X(u), yy); else c.moveTo(X(u), yy); }
  c.stroke();
  const ex = X(0.075), ey = mid(0.075) - 10;
  c.fillStyle = mix('ink2', 'graphite', 0.5); c.beginPath(); c.arc(ex, ey, 16, 0, Math.PI * 2); c.fill();
  c.strokeStyle = bone(0.9); c.lineWidth = 1.4; c.stroke();
  c.fillStyle = ink(1); c.beginPath(); c.arc(ex + 1, ey, 9, 0, Math.PI * 2); c.fill();
  c.fillStyle = bone(0.9); c.beginPath(); c.arc(ex - 3, ey - 4, 2.4, 0, Math.PI * 2); c.fill();
  c.strokeStyle = bone(0.8); c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(X(0.004), mid(0.004) - 4); c.lineTo(X(0.03), mid(0.03) + 1); c.stroke();
  const pb = arcPts(4, (k) => ({ x: X(0.22), y: lerp(mid(0.22) + 14, mid(0.22) + 26, k) }));
  const pt = arcPts(4, (k) => ({ x: X(0.22) + lerp(52, 38, k), y: lerp(mid(0.22) + 22, mid(0.22) + 46, k) }));
  fin(pb, pt, 5);
  const S = 200; // px per cm (fish ≈ 3.8 cm with the tail)
  return { key: 'organism', canvas: cv, bar: S, barText: '1 cm', u: 7 };
}

export function buildPlates(): Plate[] {
  return [plateDNA(), plateNucleosome(), plateNucleus(), plateCell(), plateTissue(), plateOrganism()];
}
