// DNA edition, `fuse` slot — the myelinated axon (dna-fuse.ts), a schematic longitudinal section.
// World units are px at zoom 1; the axon runs along y = 0. Each internode is one Schwann cell's
// myelin: compact lamellae above and below the axon that, at each node of Ranvier, open into
// paranodal loops stacked along the axon (innermost lamella ending farthest from the node), with the
// Schwann cell's nucleus on the outer surface. At the node the bare axolemma carries a dense band of
// voltage-gated Na⁺ channels (ticks). The last internode ends at a heminode; an unmyelinated terminal
// swells into a presynaptic bouton (vesicles, active zone) across a synaptic cleft from a
// postsynaptic membrane. Distances and timings are stylized.
import type { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';
import { clamp, hash, lerp, smoothstep } from '../engine/util';

type RGB = [number, number, number];
const sc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const INK = LIN.ink, BONE = LIN.bone, GRAPH = LIN.graphite, ASH = LIN.ash, SIG = LIN.signal, EMB = LIN.ember;

export const AX = {
  ra: 34, // axon radius (interior half-height)
  my: 36, // myelin thickness (g-ratio ≈ 0.49, stylized)
  lint: 330, // internode period
  gap: 22, // node width (bare axolemma)
  nLam: 9, // lamellae drawn per side
};
/** Screen mapping: sx = ax + (x - cx) * z, sy = ay + y * z. */
export interface View { cx: number; ax: number; ay: number; z: number }
export const sxOf = (v: View, x: number) => v.ax + (x - v.cx) * v.z;
export const syOf = (v: View, y: number) => v.ay + y * v.z;

/** Terminal geometry (world x), after the last node. */
export interface Terminal { xHemi: number; xNeck: number; bx: number; br: number; xCleft: number; cleft: number }
export function terminalAt(xLastNode: number): Terminal {
  const xHemi = xLastNode + AX.lint, xNeck = xHemi + 120, br = 84, bx = xNeck + br * 0.9;
  return { xHemi, xNeck, bx, br, xCleft: bx + br, cleft: 26 };
}

/** Radius of the axon at world x (swells into the bouton past the neck). */
export function axonR(x: number, T: Terminal) {
  const rn = AX.ra * lerp(1, 0.72, smoothstep(T.xHemi, T.xNeck, x));
  const u = (x - T.bx) / T.br;
  if (u >= 1) return 0;
  if (u <= -1) return rn;
  const rc = T.br * Math.sqrt(1 - u * u);
  if (u >= 0) return rc;
  // a filleted join of the neck into the bouton (smooth maximum)
  const k = 26, h = clamp(0.5 + 0.5 * (rc - rn) / k);
  return lerp(rn, rc, h) + k * h * (1 - h);
}

/**
 * One myelin half-sheath (side s = -1 above, +1 below) from node edge xa to node edge xb (world).
 * `lit` 0..1 brightens it (the key light is from above), `a` its opacity.
 */
export function drawSheath(L: LineBatch, v: View, xa: number, xb: number, s: number, a: number, lamLit = 1) {
  const { ra, my, nLam } = AX;
  const ls = 3.4; // paranodal loop spacing along the axon
  for (let i = 0; i < nLam; i++) {
    const r = ra + 2.5 + (i / (nLam - 1)) * (my - 4);
    // innermost lamella (i = 0) ends farthest from the node, outermost closest
    const eA = xa + (nLam - 1 - i) * ls + 2, eB = xb - (nLam - 1 - i) * ls - 2;
    if (eB - eA < 8) continue;
    const tA = eA + ls * 1.1 + (i / nLam) * 3, tB = eB - ls * 1.1 - (i / nLam) * 3;
    const k = s < 0 ? lerp(0.72, 1.0, i / (nLam - 1)) : lerp(0.62, 0.42, i / (nLam - 1));
    const col = sc(BONE, k * lamLit);
    const w = Math.max(1.1, 2.5 * v.z);
    const Y = (rr: number) => syOf(v, s * rr);
    L.seg2(sxOf(v, tA), Y(r), sxOf(v, tB), Y(r), w, col, a);
    // the paranodal ends: the lamella turns down to the axolemma and closes in a small loop
    for (const [x0, x1] of [[tA, eA], [tB, eB]] as [number, number][]) {
      let px = sxOf(v, x0), py = Y(r);
      const n = 5;
      for (let j = 1; j <= n; j++) {
        const u = j / n, xx = lerp(x0, x1, u), rr = lerp(r, ra + 2.2, u * u * (3 - 2 * u));
        const qx = sxOf(v, xx), qy = Y(rr);
        L.seg2(px, py, qx, qy, w * 0.8, col, a);
        px = qx; py = qy;
      }
      const lr = 1.5 * v.z;
      L.seg2(px - lr, py, px + lr, py, lr * 2.2, col, a * 0.9);
    }
  }
  // outer edge of the sheath (a crisp contour), and a thin ink seam at the axon
  const rO = ra + my - 1;
  L.seg2(sxOf(v, xa + nLam * 3.4 - 2), syOf(v, s * rO), sxOf(v, xb - nLam * 3.4 + 2), syOf(v, s * rO), Math.max(1.2, 1.4 * v.z), sc(BONE, s < 0 ? 1.1 : 0.6), a);
}

/** The Schwann cell's nucleus on the outer surface of an internode (an engraved lens). */
export function drawSchwannNucleus(L: LineBatch, v: View, xm: number, s: number, seed: number, a: number) {
  const { ra, my } = AX;
  const len = 110 + 30 * hash(seed, 1), th = 15 + 4 * hash(seed, 2);
  const x0 = xm - len / 2 + (hash(seed, 3) - 0.5) * 60, n = 18;
  let pT: [number, number] | null = null;
  for (let j = 0; j <= n; j++) {
    const u = j / n, x = x0 + u * len, h = th * Math.sin(Math.PI * u) ** 0.8;
    const y0 = s * (ra + my), y1 = s * (ra + my + h + 2.5);
    const X = sxOf(v, x);
    // the Schwann cytoplasm over the sheath, hatched
    L.seg2(X, syOf(v, y0), X, syOf(v, y1), Math.max(1, 0.9 * v.z), sc(BONE, s < 0 ? 0.62 : 0.4), a * 0.8);
    const q: [number, number] = [X, syOf(v, y1)];
    if (pT) L.seg2(pT[0], pT[1], q[0], q[1], Math.max(1.2, 1.5 * v.z), sc(BONE, s < 0 ? 1.0 : 0.62), a);
    pT = q;
  }
  // chromatin of the nucleus: two dark flecks
  for (let k = 0; k < 2; k++) {
    const x = x0 + len * (0.38 + 0.24 * k), y = s * (ra + my + th * 0.45);
    L.seg2(sxOf(v, x - 6), syOf(v, y), sxOf(v, x + 6), syOf(v, y), 3 * v.z, INK, a * 0.8);
  }
}

/**
 * The axolemma (membrane) along [x0, x1], both sides, with the Na⁺-channel band at each node:
 * `nodes` = world x of node centres. `terminal` narrows it into the bouton.
 */
export function drawAxon(L: LineBatch, v: View, x0: number, x1: number, nodes: number[], T: Terminal, a: number, interiorA = 1, contour = 0) {
  const step = 12;
  const w = Math.max(1.3, 1.6 * v.z) * (1 + 0.5 * contour);
  const cT = sc(BONE, lerp(0.95, 1.05, contour)), cB = sc(BONE, lerp(0.7, 1.05, contour));
  let p: [number, number, number] | null = null;
  const xm = Math.min(x1, T.bx);
  for (let x = x0; x <= xm + 1e-6; x = Math.min(xm, x + (x > T.xNeck - 60 ? 3 : step))) {
    const r = axonR(x, T);
    if (r <= 0) break;
    const X = sxOf(v, x);
    const top = syOf(v, -r), bot = syOf(v, r);
    if (p) { L.seg2(p[0], p[1], X, top, w, cT, a); L.seg2(p[0], p[2], X, bot, w, cB, a); }
    p = [X, top, bot];
    if (x >= xm) break;
  }
  // the bouton's far half: a closed arc through the presynaptic face
  if (p && x1 >= T.bx) {
    const n = 24;
    let qT: [number, number] = [p[0], p[1]], qB: [number, number] = [p[0], p[2]];
    for (let j = 1; j <= n; j++) {
      const th = (j / n) * (Math.PI / 2);
      const X = sxOf(v, T.bx + Math.sin(th) * T.br), yT = syOf(v, -Math.cos(th) * T.br), yB = syOf(v, Math.cos(th) * T.br);
      L.seg2(qT[0], qT[1], X, yT, w, cT, a); L.seg2(qB[0], qB[1], X, yB, w, sc(BONE, lerp(0.8, 1.05, contour)), a);
      qT = [X, yT]; qB = [X, yB];
    }
  }
  // neurofilaments: faint dashed longitudinal lines in the axoplasm
  if (interiorA > 0.01) {
    for (let k = -2; k <= 2; k++) {
      const yy = k * AX.ra * 0.3;
      for (let x = Math.ceil(x0 / 40) * 40; x < Math.min(x1, T.xNeck); x += 40) {
        const o = hash(k + 9, Math.floor(x / 40)) * 18;
        L.seg2(sxOf(v, x + o), syOf(v, yy), sxOf(v, x + o + 16), syOf(v, yy), 1, sc(GRAPH, 0.9), a * interiorA * 0.55);
      }
    }
  }
  // Na⁺-channel clusters at the nodes: ticks through the bare membrane
  for (const xn of nodes) {
    if (xn < x0 - 40 || xn > x1 + 40 || contour > 0.99) continue;
    for (let k = -3; k <= 3; k++) {
      const x = xn + k * (AX.gap / 7);
      for (const s of [-1, 1]) {
        const y = s * AX.ra;
        L.seg2(sxOf(v, x), syOf(v, y - 3.2), sxOf(v, x), syOf(v, y + 3.2), Math.max(1, 1.3 * v.z), sc(BONE, 0.85), a * (1 - contour));
      }
    }
  }
}

/** The presynaptic bouton's contents, the cleft and the postsynaptic membrane. */
export function drawSynapse(L: LineBatch, v: View, T: Terminal, t: number, tRel: number, a: number, aPost: number) {
  // synaptic vesicles clustered toward the active zone; a few dock and fuse at the release
  for (let k = 0; k < 16; k++) {
    const ang = hash(k, 3) * Math.PI * 2, rr = Math.sqrt(hash(k, 4)) * T.br * 0.62;
    let x = T.bx + T.br * 0.18 + Math.cos(ang) * rr * 0.8, y = Math.sin(ang) * rr;
    const dock = k < 4;
    if (dock) { x = T.xCleft - 11; y = (k - 1.5) * 26; }
    const fuse = dock ? clamp((t - tRel - k * 0.03) / 0.12) : 0;
    const R = 8.5 * v.z;
    const X = sxOf(v, x + fuse * 8), Y = syOf(v, y);
    const n = 12;
    for (let j = 0; j < n; j++) {
      const a0 = (j / n) * Math.PI * 2, a1 = ((j + 1) / n) * Math.PI * 2;
      if (fuse > 0 && Math.cos((a0 + a1) / 2) > 1 - fuse * 1.2) continue; // the vesicle opens into the cleft
      L.seg2(X + Math.cos(a0) * R, Y + Math.sin(a0) * R, X + Math.cos(a1) * R, Y + Math.sin(a1) * R, Math.max(1, 1.2 * v.z), sc(BONE, 0.8), a);
    }
  }
  // active zone: dense projections on the presynaptic membrane
  for (let k = -3; k <= 3; k++) {
    const y = k * 17, X = sxOf(v, T.xCleft - 2);
    L.seg2(X, syOf(v, y - 5), X - 7 * v.z, syOf(v, y), 2.2 * v.z, sc(BONE, 0.9), a);
  }
  if (aPost <= 0.001) return;
  // postsynaptic membrane: a long gently curved surface across the frame, with its density
  const xP = T.xCleft + T.cleft;
  let prev: [number, number] | null = null;
  for (let y = -900; y <= 900; y += 20) {
    const x = xP + (y / 700) ** 2 * 160;
    const q: [number, number] = [sxOf(v, x), syOf(v, y)];
    if (prev) L.seg2(prev[0], prev[1], q[0], q[1], Math.max(1.4, 2 * v.z), sc(BONE, 0.9), aPost);
    prev = q;
  }
  for (let y = -60; y <= 60; y += 6) L.seg2(sxOf(v, xP + 3), syOf(v, y), sxOf(v, xP + 11), syOf(v, y), 2 * v.z, sc(BONE, 0.7), aPost);
  // the postsynaptic cell's body: engraved contour lines parallel to its membrane, fading inward
  for (let j = 1; j <= 16; j++) {
    const d = 10 + j * 7 + j * j * 0.6, k = (1 - j / 17) ** 1.4;
    let q: [number, number] | null = null;
    for (let y = -700; y <= 700; y += 25) {
      const x = xP + (y / 700) ** 2 * 160 + d;
      const r: [number, number] = [sxOf(v, x), syOf(v, y)];
      if (q) L.seg2(q[0], q[1], r[0], r[1], 1.1, sc(ASH, 0.75), aPost * k);
      q = r;
    }
  }
}

// ------------------------------------------------------------------ the action potential (stylized)
/** Membrane potential at a node, normalized: 0 = rest, 1 = peak, <0 = after-hyperpolarization. */
export function apWave(tau: number) {
  if (tau < 0) return 0;
  if (tau < 0.05) { const u = tau / 0.05; return u * u * (3 - 2 * u); }
  if (tau < 0.34) { const u = (tau - 0.05) / 0.29; return lerp(1, -0.22, u * u * (3 - 2 * u)); }
  if (tau < 1.0) { const u = (tau - 0.34) / 0.66; return lerp(-0.22, 0, u * u * (3 - 2 * u)); }
  return 0;
}
