// Geometry for the DNA edition's `stack` slot: a chromatin fibre (beads on a string) whose loops end
// as the outlines of dense's first cells. World units are nanometres; the loops lie on the plane
// y = 0 (their "flat" state), which the final overhead camera maps 1:1 onto dense's first frame.
//
// Science (schematic, docs/DNA_VIDEO_PLAN.md "Chromatin"): each nucleosome is ~147 bp of right-handed
// B-DNA wrapped ~1.65 turns, in a LEFT-handed superhelix, around a histone-octamer disc (~11 nm across
// with its DNA); linker DNA of irregular length (20–70 bp) joins them. The loops are irregular; there
// is no regular 30-nm fibre. The DNA itself comes from dna-kit's helix() along a curved axis (the
// superhelix around every disc, Hermite linkers between them), so handedness, rise and pairing are
// the kit's.
import * as THREE from 'three';
import { hash } from '../engine/util';
import { helix, sequence, BDNA, type Base } from './dna-kit';
import { CellField, wobbleR, type CellNode } from './dna-dense-field';

export const K = 1.4; // px per nm at the final overhead framing (dense's identity framing)
export const R_WRAP = 4.8; // superhelix radius (DNA axis), nm: 147 bp × 0.34 nm over 1.65 turns
export const PITCH = 2.6; // superhelical pitch, nm per turn
export const TURNS = 1.65;
export const BP_WRAP = 147;
export const PHI = TURNS * Math.PI * 2;
export const CORE_R = 3.55; // histone octamer disc radius, nm
export const CORE_HH = 2.75; // its half height
/** Loop id of the hero's stalk (a link, never folded). */
export const STALK = -2;
const KPH = PITCH / (Math.PI * 2);

/** dense px (identity framing) → world nm on the plane. */
export const toWorld = (X: number, Y: number) => ({ x: (X - 960) / K, z: (Y - 540) / K });

export interface Loop {
  node: CellNode;
  /** Centre (world), base point B and the hinge tangent there (unit, in the plane). */
  cx: number; cz: number; bx: number; bz: number; tx: number; tz: number;
  /** Side of the plane the loop lifts to when standing (+1 / -1 about the hinge). */
  lift: number;
  /** Standing angle and fold-down time (set by the scene). */
  phi0: number; tFold: number;
}

export interface Nuc {
  c: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3;
  loop: number; uu: number; bp0: number;
}

type Elem =
  | { kind: 0; bp0: number; nbp: number; nuc: number }
  | { kind: 1; bp0: number; nbp: number; p0: THREE.Vector3; m0: THREE.Vector3; p1: THREE.Vector3; m1: THREE.Vector3 };

/** DNA axis point + tangent on nucleosome `q`'s superhelix at angle phi (0 entry .. PHI exit). */
export function wrapAt(q: { c: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3 }, phi: number, p: THREE.Vector3, t?: THREE.Vector3) {
  const cs = Math.cos(phi), sn = Math.sin(phi), h = -KPH * (phi - PHI / 2);
  p.set(
    q.c.x + R_WRAP * (cs * q.u.x + sn * q.v.x) + h * q.n.x,
    q.c.y + R_WRAP * (cs * q.u.y + sn * q.v.y) + h * q.n.y,
    q.c.z + R_WRAP * (cs * q.u.z + sn * q.v.z) + h * q.n.z,
  );
  if (t) t.set(R_WRAP * (-sn * q.u.x + cs * q.v.x) - KPH * q.n.x, R_WRAP * (-sn * q.u.y + cs * q.v.y) - KPH * q.n.y, R_WRAP * (-sn * q.u.z + cs * q.v.z) - KPH * q.n.z).normalize();
}

/** Hermite point/tangent. */
function herm(e: { p0: THREE.Vector3; m0: THREE.Vector3; p1: THREE.Vector3; m1: THREE.Vector3 }, f: number, p: THREE.Vector3, t?: THREE.Vector3) {
  const f2 = f * f, f3 = f2 * f;
  const h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
  p.set(0, 0, 0).addScaledVector(e.p0, h00).addScaledVector(e.m0, h10).addScaledVector(e.p1, h01).addScaledVector(e.m1, h11);
  if (t) {
    const d00 = 6 * f2 - 6 * f, d10 = 3 * f2 - 4 * f + 1, d01 = -6 * f2 + 6 * f, d11 = 3 * f2 - 2 * f;
    t.set(0, 0, 0).addScaledVector(e.p0, d00).addScaledVector(e.m0, d10).addScaledVector(e.p1, d01).addScaledVector(e.m1, d11).normalize();
  }
}

/** The DNA axis through a run of nucleosomes and linkers, as a function of bp index. */
export class FibreAxis {
  elems: Elem[] = [];
  nbp = 0;
  constructor(public nucs: Nuc[]) {}
  addWrap(nuc: number) { this.elems.push({ kind: 0, bp0: this.nbp, nbp: BP_WRAP, nuc }); this.nucs[nuc]!.bp0 = this.nbp; this.nbp += BP_WRAP; }
  addLinker(p0: THREE.Vector3, m0: THREE.Vector3, p1: THREE.Vector3, m1: THREE.Vector3, nbp: number) {
    this.elems.push({ kind: 1, bp0: this.nbp, nbp, p0: p0.clone(), m0: m0.clone(), p1: p1.clone(), m1: m1.clone() });
    this.nbp += nbp;
  }
  private find(i: number) {
    let lo = 0, hi = this.elems.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.elems[m]!.bp0 <= i) lo = m; else hi = m - 1; }
    return this.elems[lo]!;
  }
  at(i: number, p: THREE.Vector3, t: THREE.Vector3) {
    const e = this.find(i);
    const f = Math.min(1, Math.max(0, (i - e.bp0) / e.nbp));
    if (e.kind === 0) wrapAt(this.nucs[e.nuc]!, f * PHI, p, t);
    else herm(e, f, p, t);
  }
}

export interface Chromatin {
  loops: Loop[];
  nucs: Nuc[];
  nbp: number;
  /** Per base pair (flat state): strand a, strand b, axis (xyz each), base code (0 A 1 T 2 G 3 C). */
  A: Float32Array; B: Float32Array; C: Float32Array; base: Uint8Array;
  /** Per base pair: loop index (-1 on the links between loops) and ring parameter u (0..1). */
  loopOf: Int16Array; uOf: Float32Array;
  /** Chunks for LOD and painter's sorting: [bp0, bp1) ranges (each wrap and each linker). */
  chunks: { bp0: number; bp1: number; nuc: number; loop: number }[];
  axis: FibreAxis;
  seq: Base[];
  /** The hero loop (flat throughout) and its stalk. */
  hero: number; stalk: Stalk;
}

/** The ring of loop `k` in its flat state: centreline point at u in [0, 1] (radially offset toward the ends). */
export function ringPoint(L: Loop, f0: number, u: number, out: THREE.Vector3, th0: number, dir: number, sweep = Math.PI * 2, ofs = 5.5) {
  const th = th0 + dir * u * sweep;
  const rpx = wobbleR(L.node.rho * f0, th, L.node.w1, L.node.w2, f0) - 12;
  const r = rpx / K + (u - 0.5) * ofs;
  out.set(L.cx + Math.cos(th) * r, 2.2 * Math.sin(u * Math.PI * 6 + L.node.id), L.cz + Math.sin(th) * r);
}

/**
 * The hero loop's shape for the match cut from fuse (whose last frame is an axon's outline: a stalk
 * of two parallel lines ending in a round terminal): its ring opens on the left into two parallel
 * fibres running off to the left, `delta` nm either side of its centre line.
 */
export interface Stalk { loop: number; delta: number; len: number; alpha: number; beta: number; r: number }

/**
 * Build the fibre: loops (one per first-frame cell that touches the frame) visited in a nearest-
 * neighbour chain, each a lasso from its base point round and back, joined by links across the gaps.
 */
export function buildChromatin(field: CellField, f0: number, seed = 7): Chromatin {
  // the cells of dense's first frame
  const cand = field.roots.map((id) => field.nodes[id]!).filter((n) => {
    const r = n.rho * f0;
    return n.x > -r * 0.7 && n.x < 1920 + r * 0.7 && n.y > -r * 0.7 && n.y < 1080 + r * 0.7;
  });
  // nearest-neighbour chain from the top-left
  const order: CellNode[] = [];
  const left = cand.slice();
  let cur = left.reduce((b, n) => (n.x + n.y < b.x + b.y ? n : b), left[0]!);
  while (left.length) {
    order.push(cur);
    left.splice(left.indexOf(cur), 1);
    if (!left.length) break;
    const c0 = cur;
    cur = left.reduce((b, n) => (Math.hypot(n.x - c0.x, n.y - c0.y) < Math.hypot(b.x - c0.x, b.y - c0.y) ? n : b), left[0]!);
  }
  const loops: Loop[] = order.map((node) => {
    const w = toWorld(node.x, node.y);
    return { node, cx: w.x, cz: w.z, bx: 0, bz: 0, tx: 1, tz: 0, lift: 1, phi0: 0, tFold: 0 };
  });
  // the hero: the loop nearest the frame centre (it lies flat throughout; stack's camera starts on it)
  let hero = 0;
  { let bd = Infinity; loops.forEach((L, k) => { const d = Math.hypot(L.cx, L.cz * 1.3); if (d < bd) { bd = d; hero = k; } }); }
  // base points: on the side facing the chain's path; winding so the tangent there points onward
  const th0s: number[] = [], dirs: number[] = [], sweeps: number[] = [], ofss: number[] = [];
  const HL = loops[hero]!;
  const stalk: Stalk = { loop: hero, delta: 24, len: 330, alpha: 0, beta: 0.36, r: 0 };
  {
    const p = new THREE.Vector3();
    ringPoint(HL, f0, 0, p, Math.PI, 1, Math.PI * 2, 0);
    stalk.r = Math.hypot(p.x - HL.cx, p.z - HL.cz);
    stalk.alpha = Math.asin(Math.min(0.8, stalk.delta / stalk.r));
  }
  loops.forEach((L, k) => {
    if (k === hero) {
      // a terminal: from the upper junction (screen-up is -z) round the far side to the lower junction
      th0s.push(Math.PI + stalk.alpha + stalk.beta); dirs.push(1); sweeps.push(Math.PI * 2 - 2 * (stalk.alpha + stalk.beta)); ofss.push(0);
      L.bx = L.cx - stalk.r; L.bz = L.cz; L.tx = 0; L.tz = -1; L.lift = 1;
      return;
    }
    const P = loops[Math.max(0, k - 1)]!, N = loops[Math.min(loops.length - 1, k + 1)]!;
    let mx = (P.cx + N.cx) / 2 - L.cx, mz = (P.cz + N.cz) / 2 - L.cz;
    if (k === 0 || k === loops.length - 1) { const O = k === 0 ? N : P; mx = O.cx - L.cx; mz = O.cz - L.cz; }
    if (Math.hypot(mx, mz) < 1e-3) { mx = N.cx - P.cx; mz = N.cz - P.cz; }
    const th0 = Math.atan2(mz, mx);
    // travel direction along the chain
    let dx = N.cx - P.cx, dz = N.cz - P.cz;
    if (k === 0) { dx = N.cx - L.cx; dz = N.cz - L.cz; }
    if (k === loops.length - 1) { dx = L.cx - P.cx; dz = L.cz - P.cz; }
    // tangent of a ring point at th0 going counter-clockwise (+th): (-sin, cos)
    const dir = (-Math.sin(th0) * dx + Math.cos(th0) * dz) >= 0 ? 1 : -1;
    th0s.push(th0); dirs.push(dir); sweeps.push(Math.PI * 2); ofss.push(5.5);
    const p = new THREE.Vector3();
    ringPoint(L, f0, 0.5, p, th0, dir); // (u = 0.5 has no radial offset: use it only for the radius)
    const r = Math.hypot(p.x - L.cx, p.z - L.cz);
    L.bx = L.cx + Math.cos(th0) * r; L.bz = L.cz + Math.sin(th0) * r;
    L.tx = -Math.sin(th0) * dir; L.tz = Math.cos(th0) * dir;
    // lifting: rotate the ring's interior (toward the centre) up (+y) about the hinge tangent
    const ix = L.cx - L.bx, iz = L.cz - L.bz; // interior direction
    L.lift = (L.tz * ix - L.tx * iz) >= 0 ? 1 : -1;
  });
  const ring = (k: number, u: number, out: THREE.Vector3) => ringPoint(loops[k]!, f0, u, out, th0s[k]!, dirs[k]!, sweeps[k]!, ofss[k]!);
  const ringTan = (k: number, u: number) => {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    ring(k, Math.max(0, u - 0.002), a); ring(k, Math.min(1, u + 0.002), b);
    return b.sub(a).setY(0).normalize();
  };
  // the stalk's far ends
  const Win = new THREE.Vector3(HL.cx - stalk.r - stalk.len, 0, HL.cz - stalk.delta);
  const Wout = new THREE.Vector3(HL.cx - stalk.r - stalk.len, 0, HL.cz + stalk.delta);
  // where each stalk line flares into the terminal
  const fx = HL.cx - stalk.r * Math.cos(stalk.alpha) - 14;
  const Fin = new THREE.Vector3(fx, 0, HL.cz - stalk.delta), Fout = new THREE.Vector3(fx, 0, HL.cz + stalk.delta);

  // ---- the fibre centreline, sampled every 0.5 nm: loop k's ring, then the link to loop k+1
  const pts: THREE.Vector3[] = [], lo: number[] = [], uu: number[] = [];
  const push = (p: THREE.Vector3, k: number, u: number) => { pts.push(p.clone()); lo.push(k); uu.push(u); };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const ringLen = (k: number) => { let s = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(); ring(k, 0, a); for (let i = 1; i <= 400; i++) { ring(k, i / 400, b); s += a.distanceTo(b); a.copy(b); } return s; };
  /** A link piece: Hermite from p0 (unit tangent t0) to p1 (unit tangent t1), sampled by arc length. */
  const link = (p0: THREE.Vector3, t0: THREE.Vector3, p1: THREE.Vector3, t1: THREE.Vector3, k: number, bulge = 1.1, tag = -1) => {
    const d = p0.distanceTo(p1), h = { p0, m0: t0.clone().multiplyScalar(d * bulge), p1, m1: t1.clone().multiplyScalar(d * bulge) };
    let L2 = 0; const a = p0.clone();
    for (let i = 1; i <= 200; i++) { herm(h, i / 200, tmp2); L2 += a.distanceTo(tmp2); a.copy(tmp2); }
    const nn = Math.max(2, Math.ceil(L2 / 0.5));
    for (let i = 0; i < nn; i++) { herm(h, i / nn, tmp2); if (tag === -1) tmp2.y += 2.5 * Math.sin(i * 0.05 + k); push(tmp2, tag, 0); }
  };
  const X = new THREE.Vector3(1, 0, 0), NX = new THREE.Vector3(-1, 0, 0);
  // lead-in from beyond the first loop
  {
    const L0 = loops[0]!, s0 = new THREE.Vector3(); ring(0, 0, s0);
    if (hero === 0) { link(Win.clone().add(new THREE.Vector3(-120, 0, 0)), X, Win, X, -1); link(Win, X, Fin, X, -1, 0.3, STALK); link(Fin, X, s0, ringTan(0, 0), -1, 0.8, STALK); }
    else link(new THREE.Vector3(L0.bx - L0.tx * 140, 0, L0.bz - L0.tz * 140), new THREE.Vector3(L0.tx, 0, L0.tz), s0, ringTan(0, 0), -1);
  }
  loops.forEach((L, k) => {
    const len = ringLen(k), n = Math.ceil(len / 0.5);
    for (let i = 0; i < n; i++) { ring(k, i / n, tmp); push(tmp, k, i / n); }
    // link to the next loop (through the stalk's far ends when the hero is on either side)
    const e0 = new THREE.Vector3(); ring(k, 1, e0);
    const m0 = ringTan(k, 1);
    let e1: THREE.Vector3, m1: THREE.Vector3;
    if (k < loops.length - 1) { e1 = new THREE.Vector3(); ring(k + 1, 0, e1); m1 = ringTan(k + 1, 0); }
    else { e1 = e0.clone().addScaledVector(m0, 160); m1 = m0.clone(); }
    if (k === hero) { link(e0, m0, Fout, NX, -1, 0.8, STALK); link(Fout, NX, Wout, NX, -1, 0.3, STALK); link(Wout, NX, e1, m1, -1); }
    else if (k + 1 === hero) { link(e0, m0, Win, X, -1); link(Win, X, Fin, X, -1, 0.3, STALK); link(Fin, X, e1, m1, -1, 0.8, STALK); }
    else link(e0, m0, e1, m1, -1);
  });
  // arc length table
  const cum = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1]! + pts[i]!.distanceTo(pts[i - 1]!);
  const total = cum[pts.length - 1]!;
  let jj = 0;
  const cl = (s: number, p: THREE.Vector3, t: THREE.Vector3) => {
    if (s < cum[jj]!) jj = 0;
    while (jj < pts.length - 2 && cum[jj + 1]! < s) jj++;
    const f = (s - cum[jj]!) / Math.max(1e-6, cum[jj + 1]! - cum[jj]!);
    p.copy(pts[jj]!).lerp(pts[jj + 1]!, Math.min(1, Math.max(0, f)));
    t.subVectors(pts[Math.min(pts.length - 1, jj + 2)]!, pts[Math.max(0, jj - 1)]!).normalize();
    return jj;
  };

  // ---- nucleosomes along it (irregular linkers), each disc hanging off the fibre with a random roll
  const nucs: Nuc[] = [];
  const linkBp: number[] = [];
  const S = new THREE.Vector3(), T = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let s = 6, j = 0;
  // entry and exit sit 63° either side of the dyad: 2.18 nm off the disc centre, 8.55 nm apart
  const H63 = (63 * Math.PI) / 180;
  while (s < total - 12) {
    const idx = cl(s, S, T);
    const N = new THREE.Vector3().crossVectors(up, T).normalize();
    const Bn = new THREE.Vector3().crossVectors(T, N).normalize();
    const psi = (j % 2 ? 0 : Math.PI) + (hash(seed, j, 1) - 0.5) * 2.2;
    const side = N.clone().multiplyScalar(Math.cos(psi)).addScaledVector(Bn, Math.sin(psi));
    const D = side.clone().negate();
    const om = Math.PI / 2 + (hash(seed, j, 2) - 0.5) * 1.1;
    const TxD = new THREE.Vector3().crossVectors(T, D);
    const n = T.clone().multiplyScalar(Math.cos(om)).addScaledVector(TxD, Math.sin(om)).normalize();
    const c = S.clone().addScaledVector(side, R_WRAP * Math.cos(H63));
    // u = rot_n(-PHI/2) D, v = n × u
    const nxD = new THREE.Vector3().crossVectors(n, D);
    const u = D.clone().multiplyScalar(Math.cos(-PHI / 2)).addScaledVector(nxD, Math.sin(-PHI / 2)).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    nucs.push({ c, u, v, n, loop: lo[idx]!, uu: uu[idx]!, bp0: 0 });
    const lb = 20 + Math.floor(hash(seed, j, 3) * 50);
    linkBp.push(lb);
    s += 2 * R_WRAP * Math.sin(H63) + 0.8 * lb * BDNA.rise;
    j++;
  }
  // ---- the DNA axis: lead linker, wrap, linker, wrap, ..., tail linker
  const axis = new FibreAxis(nucs);
  const P0 = new THREE.Vector3(), T0 = new THREE.Vector3(), P1 = new THREE.Vector3(), T1 = new THREE.Vector3();
  cl(0, P0, T0);
  wrapAt(nucs[0]!, 0, P1, T1);
  let d = P0.distanceTo(P1);
  axis.addLinker(P0, T0.clone().multiplyScalar(d), P1, T1.clone().multiplyScalar(d), Math.max(4, Math.round(d / BDNA.rise)));
  for (let q = 0; q < nucs.length; q++) {
    axis.addWrap(q);
    wrapAt(nucs[q]!, PHI, P0, T0);
    if (q + 1 < nucs.length) wrapAt(nucs[q + 1]!, 0, P1, T1);
    else { cl(total, P1, T1); }
    d = P0.distanceTo(P1);
    const nb = q + 1 < nucs.length ? linkBp[q]! : Math.max(4, Math.round(d / BDNA.rise));
    const mag = Math.max(d, nb * BDNA.rise * 0.9);
    axis.addLinker(P0, T0.clone().multiplyScalar(mag), P1, T1.clone().multiplyScalar(mag), nb);
  }
  // ---- base pairs from dna-kit's helix() along that axis
  const nbp = axis.nbp;
  const seq = sequence(nbp, 61);
  const bps = helix(nbp, (sArc, p, t) => axis.at(sArc / BDNA.rise, p, t), { seq, phase: 0.4, e1: { x: 0, y: 1, z: 0 } });
  const A = new Float32Array(nbp * 3), Bb = new Float32Array(nbp * 3), C = new Float32Array(nbp * 3), base = new Uint8Array(nbp);
  const code: Record<Base, number> = { A: 0, T: 1, G: 2, C: 3 };
  bps.forEach((q, i) => {
    A[i * 3] = q.a.x; A[i * 3 + 1] = q.a.y; A[i * 3 + 2] = q.a.z;
    Bb[i * 3] = q.b.x; Bb[i * 3 + 1] = q.b.y; Bb[i * 3 + 2] = q.b.z;
    C[i * 3] = q.c.x; C[i * 3 + 1] = q.c.y; C[i * 3 + 2] = q.c.z;
    base[i] = code[q.base];
  });
  // per-bp loop membership (from the elements) and chunks
  const loopOf = new Int16Array(nbp).fill(-1), uOf = new Float32Array(nbp);
  const chunks: Chromatin['chunks'] = [];
  axis.elems.forEach((e, ei) => {
    let lp = -1, nuc = -1;
    if (e.kind === 0) {
      const q = nucs[e.nuc]!; lp = q.loop; nuc = e.nuc;
      for (let i = e.bp0; i < e.bp0 + e.nbp; i++) { loopOf[i] = lp; uOf[i] = q.uu; }
    } else {
      const prev = ei > 0 ? axis.elems[ei - 1]! : null, next = ei + 1 < axis.elems.length ? axis.elems[ei + 1]! : null;
      const qa = prev && prev.kind === 0 ? nucs[prev.nuc]! : null, qb = next && next.kind === 0 ? nucs[next.nuc]! : null;
      if (qa && qb && qa.loop === qb.loop && qa.loop >= 0 && qb.uu >= qa.uu) {
        lp = qa.loop;
        for (let i = e.bp0; i < e.bp0 + e.nbp; i++) { loopOf[i] = qa.loop; uOf[i] = qa.uu + (qb.uu - qa.uu) * ((i - e.bp0) / e.nbp); }
      } else {
        // a linker leaving or entering a loop: each half follows its own side, easing to the loop's base
        // (u = 1 or 0, where the fold leaves the plane unmoved) so the two halves meet
        for (let i = e.bp0; i < e.bp0 + e.nbp; i++) {
          const f = (i - e.bp0) / e.nbp;
          if (f < 0.5 && qa && qa.loop >= 0) { loopOf[i] = qa.loop; uOf[i] = qa.uu + (1 - qa.uu) * (f / 0.5); }
          else if (f >= 0.5 && qb && qb.loop >= 0) { loopOf[i] = qb.loop; uOf[i] = qb.uu * ((f - 0.5) / 0.5); }
          else { loopOf[i] = -1; uOf[i] = 0; }
        }
      }
    }
    // split long linkers into pieces for sorting
    const step = e.kind === 0 ? e.nbp : 48;
    for (let b = e.bp0; b < e.bp0 + e.nbp; b += step) chunks.push({ bp0: b, bp1: Math.min(e.bp0 + e.nbp, b + step), nuc, loop: lp });
  });
  return { loops, nucs, nbp, A, B: Bb, C, base, loopOf, uOf, chunks, axis, seq, hero, stalk };
}

/** Bend weight of a ring point: the loop's base stays in the plane while its body stands up. */
export const bendW = (u: number) => {
  const a = Math.min(1, Math.max(0, u / 0.08)), b = Math.min(1, Math.max(0, (1 - u) / 0.08));
  return a * a * (3 - 2 * a) * b * b * (3 - 2 * b);
};
