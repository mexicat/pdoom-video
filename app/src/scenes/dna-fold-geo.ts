// Geometry for the DNA edition's hero fold (`dna-fold`): a schematic 94-residue protein (three
// right-handed α-helices and a β-hairpin) as a Cα trace, the winding track the chain follows out of
// the ribosome exit tunnel, and the keyframe blend between them. World units are nanometres.
// The fold is schematic (docs/DNA_VIDEO_PLAN.md, "Folding"): designed coordinates, not a real structure.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise1 } from '../engine/util';

export type SS = 'H' | 'E' | 'L';
export type P3 = { x: number; y: number; z: number };

/** Secondary-structure layout along the chain, N → C. */
export const LAYOUT: [SS, number][] = [
  ['L', 6], ['H', 18], ['L', 5], ['E', 7], ['L', 3], ['E', 7], ['L', 5], ['H', 18], ['L', 5], ['H', 16], ['L', 4],
];
export const N_RES = LAYOUT.reduce((s, [, n]) => s + n, 0); // 94
export const CA = 0.38; // Cα–Cα spacing (nm)
const H_RISE = 0.15, H_RAD = 0.23, H_TURN = (100 * Math.PI) / 180; // α-helix: 3.6 residues per turn
const E_RISE = 0.33, E_ZIG = 0.09; // β-strand: rise per residue and pleat amplitude

/** Where the folded protein sits in the scene, and the paper plane under it. */
export const FOLD_C: P3 = { x: 0.6, y: 0.2, z: 0 };
export const PAPER_Y = -2.6;
/** Ribosome exit-tunnel mouth: the chain emerges here. */
export const EXIT: P3 = { x: -3.4, y: 0.4, z: 0.2 };

export interface Seg { kind: SS; i0: number; n: number }
export interface SSE extends Seg {
  kind: 'H' | 'E';
  /** Residue offsets in the element's own frame (along, e1, e2): formed shape, and the chain as it lay on the track. */
  formed: P3[]; straight: P3[];
  /** Frame on the emergence track (E) and in the native fold (F). */
  cE: THREE.Vector3; qE: THREE.Quaternion; cF: THREE.Vector3; qF: THREE.Quaternion;
}

export const SEGS: Seg[] = (() => {
  const out: Seg[] = [];
  let i = 0;
  for (const [kind, n] of LAYOUT) { out.push({ kind, i0: i, n }); i += n; }
  return out;
})();
/** Secondary-structure type of every residue. */
export const RES_SS: SS[] = SEGS.flatMap((s) => Array<SS>(s.n).fill(s.kind));

const v3 = (p: P3) => new THREE.Vector3(p.x, p.y, p.z);

/** Native-fold element placements: axis, in-plane reference axis, centre (relative to FOLD_C). */
const NATIVE: { axis: P3; e1: P3; c: P3; phase: number }[] = [
  { axis: { x: 0, y: 1, z: 0 }, e1: { x: 1, y: 0, z: 0 }, c: { x: -0.58, y: -0.1, z: -0.32 }, phase: 0.4 }, // helix A (up)
  { axis: { x: 1, y: 0, z: 0 }, e1: { x: 0, y: 1, z: 0 }, c: { x: 0.08, y: 1.9, z: -0.32 }, phase: 0 }, //  strand 1
  { axis: { x: -1, y: 0, z: 0 }, e1: { x: 0, y: 1, z: 0 }, c: { x: 0.08, y: 2.38, z: -0.32 }, phase: 0 }, // strand 2 (antiparallel)
  { axis: { x: 0, y: -1, z: 0 }, e1: { x: 1, y: 0, z: 0 }, c: { x: 0.58, y: 0.0, z: -0.32 }, phase: 2.1 }, // helix B (down)
  { axis: { x: 0, y: 1, z: 0 }, e1: { x: 1, y: 0, z: 0 }, c: { x: 0.0, y: 0.0, z: 0.62 }, phase: 1.2 }, //  helix C (up)
];

/** Right-handed orthonormal frame (a, e1, a×e1) as a quaternion mapping x→a, y→e1, z→a×e1. */
function frameQ(a: THREE.Vector3, e1hint: THREE.Vector3): THREE.Quaternion {
  const A = a.clone().normalize();
  const E1 = e1hint.clone().sub(A.clone().multiplyScalar(e1hint.dot(A)));
  if (E1.lengthSq() < 1e-8) E1.set(A.y, -A.x, 0.3);
  E1.normalize();
  const E2 = A.clone().cross(E1);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(A, E1, E2));
}

// ------------------------------------------------------------------ emergence track
/**
 * The track the chain follows out of the tunnel: a short lead-in to the right, then a loose inward
 * spiral around FOLD_C. Sampled by arc length (0 at the tunnel mouth). The N-terminus leads.
 */
export class Track {
  pts: THREE.Vector3[] = [];
  ds = 0.01;
  length = 0;
  constructor(len = N_RES * CA + 1) {
    const raw: THREE.Vector3[] = [];
    const K = 6000;
    for (let k = 0; k <= K; k++) {
      const s = (k / K) * len * 1.25;
      const lead = new THREE.Vector3(EXIT.x + s * 0.95, EXIT.y - s * 0.05, EXIT.z + s * 0.08);
      const R = 2.55 - 1.35 * clamp(s / len) + 0.28 * Math.sin(0.55 * s);
      const a = Math.PI - (s - 1.2) / 2.2;
      const orbit = new THREE.Vector3(
        FOLD_C.x + R * Math.cos(a) + 0.25 * noise1(s * 0.4, 3),
        FOLD_C.y + R * 0.78 * Math.sin(a) + 0.35 * Math.sin(0.31 * s + 0.8),
        FOLD_C.z + 0.95 * Math.sin(0.37 * s) + 0.3 * noise1(s * 0.5, 9),
      );
      raw.push(lead.lerp(orbit, smoothstep(0.4, 3.2, s)));
    }
    // resample by arc length
    const cum = [0];
    for (let k = 1; k < raw.length; k++) cum.push(cum[k - 1]! + raw[k]!.distanceTo(raw[k - 1]!));
    this.length = Math.min(cum[cum.length - 1]!, len);
    let j = 0;
    for (let s = 0; s <= this.length + 1e-9; s += this.ds) {
      while (j < cum.length - 2 && cum[j + 1]! < s) j++;
      const u = (s - cum[j]!) / Math.max(1e-9, cum[j + 1]! - cum[j]!);
      this.pts.push(raw[j]!.clone().lerp(raw[j + 1]!, clamp(u)));
    }
  }
  at(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    const x = clamp(s, 0, this.length) / this.ds;
    const i = Math.min(this.pts.length - 2, Math.floor(x));
    return out.copy(this.pts[i]!).lerp(this.pts[i + 1]!, x - i);
  }
}

// ------------------------------------------------------------------ native fold + element frames
export function buildSSEs(track: Track): SSE[] {
  const el = SEGS.filter((s): s is Seg & { kind: 'H' | 'E' } => s.kind !== 'L');
  // final track positions (all residues out): residue i sits at arc length (N-1-i)·CA
  const trackPos = (i: number) => track.at((N_RES - 1 - i) * CA);
  return el.map((s, k) => {
    const nat = NATIVE[k]!;
    const formed: P3[] = [], straight: P3[] = [];
    for (let j = 0; j < s.n; j++) {
      const mid = (s.n - 1) / 2;
      if (s.kind === 'H') {
        const ph = nat.phase + j * H_TURN;
        formed.push({ x: (j - mid) * H_RISE, y: H_RAD * Math.cos(ph), z: H_RAD * Math.sin(ph) });
      } else formed.push({ x: (j - mid) * E_RISE, y: 0, z: E_ZIG * (j % 2 ? 1 : -1) });
    }
    const cF = v3(nat.c).add(v3(FOLD_C));
    const qF = frameQ(v3(nat.axis), v3(nat.e1));
    // frame on the track: centre of the element's residues, axis first→last, e1 toward the bulge
    const P = Array.from({ length: s.n }, (_, j) => trackPos(s.i0 + j));
    const cE = P.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / s.n);
    const aE = P[s.n - 1]!.clone().sub(P[0]!);
    const bulge = P[Math.floor(s.n / 2)]!.clone().sub(P[0]!.clone().add(P[s.n - 1]!).multiplyScalar(0.5));
    const qE = frameQ(aE, bulge.lengthSq() > 1e-6 ? bulge : new THREE.Vector3(0, 1, 0));
    // the unformed shape is the chain exactly as it lies on the track, so lifting it into the rigid
    // frame (w) is invisible and forming (v) coils the actual curve rather than a straightened rod
    const qInv = qE.clone().invert();
    for (const p of P) { const l = p.clone().sub(cE).applyQuaternion(qInv); straight.push({ x: l.x, y: l.y, z: l.z }); }
    return { ...s, formed, straight, cE, qE, cF, qF };
  });
}

/** Per-element progress at time t: `w` track → rigid frame, `v` straight → formed shape, `u` track frame → native frame. */
export interface ElemState { w: number; v: number; u: number }

/**
 * Residue positions for the given element states. Track positions come from `trackS(i)` (arc length of
 * residue i, negative = still inside the tunnel). Loops and tails are cubic Béziers between the current
 * element ends, blended with their own track positions by the smaller neighbouring `w`.
 */
export function residuePositions(track: Track, sses: SSE[], st: ElemState[], trackS: (i: number) => number, out: THREE.Vector3[]) {
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), c = new THREE.Vector3(), loc = new THREE.Vector3();
  for (let i = 0; i < N_RES; i++) track.at(Math.max(0, trackS(i)), out[i]!);
  sses.forEach((e, k) => {
    const s = st[k]!;
    if (s.w <= 0) return;
    q.copy(e.qE).slerp(e.qF, s.u);
    c.copy(e.cE).lerp(e.cF, s.u);
    for (let j = 0; j < e.n; j++) {
      const f = e.formed[j]!, g = e.straight[j]!;
      loc.set(lerp(g.x, f.x, s.v), lerp(g.y, f.y, s.v), lerp(g.z, f.z, s.v)).applyQuaternion(q).add(c);
      out[e.i0 + j]!.lerp(loc, s.w);
    }
  });
  // loops between elements, and the two tails
  const segs = SEGS;
  const elemOf = (segIdx: number) => sses.findIndex((e) => e.i0 === segs[segIdx]!.i0);
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si]!;
    if (sg.kind !== 'L') continue;
    const kPrev = si > 0 ? elemOf(si - 1) : -1, kNext = si < segs.length - 1 ? elemOf(si + 1) : -1;
    const wB = Math.min(kPrev >= 0 ? st[kPrev]!.w : 1, kNext >= 0 ? st[kNext]!.w : 1);
    if (wB <= 0) continue;
    const a = kPrev >= 0 ? out[sg.i0 - 1]! : null, b = kNext >= 0 ? out[sg.i0 + sg.n]! : null;
    const ta = kPrev >= 0 ? out[sg.i0 - 1]!.clone().sub(out[sg.i0 - 2]!).normalize() : null;
    const tb = kNext >= 0 ? out[sg.i0 + sg.n + 1]!.clone().sub(out[sg.i0 + sg.n]!).normalize() : null;
    for (let j = 0; j < sg.n; j++) {
      const idx = sg.i0 + j;
      let p: THREE.Vector3;
      if (a && b && ta && tb) {
        const u = (j + 1) / (sg.n + 1), L = (sg.n + 1) * CA * 0.42;
        const p1 = a.clone().addScaledVector(ta, L), p2 = b.clone().addScaledVector(tb, -L);
        const m = 1 - u;
        p = a.clone().multiplyScalar(m * m * m).addScaledVector(p1, 3 * m * m * u).addScaledVector(p2, 3 * m * u * u).addScaledVector(b, u * u * u);
      } else if (b && tb) { // N-terminal tail: hangs back from the first element with a slight curl
        const d = sg.n - j;
        p = b.clone().addScaledVector(tb, -d * CA * 0.85).add(tmp.set(0.12 * Math.sin(d * 1.3), -0.05 * d, 0.1 * Math.cos(d)));
      } else if (a && ta) { // C-terminal tail
        const d = j + 1;
        p = a.clone().addScaledVector(ta, d * CA * 0.85).add(tmp.set(0.1 * Math.sin(d * 1.1), 0.04 * d, 0.1 * Math.cos(d * 0.8)));
      } else continue;
      out[idx]!.lerp(p, wB);
    }
  }
}

/** Catmull–Rom point on the Cα trace at continuous residue coordinate r (0..N-1). */
export function traceAt(P: THREE.Vector3[], r: number, out = new THREE.Vector3()): THREE.Vector3 {
  const n = P.length;
  const i = clamp(Math.floor(r), 0, n - 2), u = r - i;
  const p0 = P[Math.max(0, i - 1)]!, p1 = P[i]!, p2 = P[i + 1]!, p3 = P[Math.min(n - 1, i + 2)]!;
  const u2 = u * u, u3 = u2 * u;
  out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);
  out.y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);
  out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3);
  return out;
}

/** Cartoon half-width (nm) at continuous residue coordinate r, given each element's formation v. */
export function ribbonHalfWidth(r: number, sses: SSE[], st: ElemState[]): number {
  const i = clamp(Math.round(r), 0, N_RES - 1);
  const k = sses.findIndex((e) => i >= e.i0 && i < e.i0 + e.n);
  const tube = 0.045;
  if (k < 0) return tube;
  const e = sses[k]!, v = st[k]!.v;
  // taper in over the element's first half-residue, out over its last
  const x = r - e.i0 + 0.5, L = e.n;
  const edge = smoothstep(0, 1, x) * (e.kind === 'H' ? smoothstep(0, 1, L - x) : 1);
  let w = e.kind === 'H' ? 0.15 : 0.17;
  if (e.kind === 'E') { // arrowhead over the last residue
    const a = x - (L - 1.2);
    if (a > 0) w = lerp(0.28, tube, clamp(a / 1.2));
  }
  return lerp(tube, lerp(tube, w, edge), clamp(v * 1.15));
}
