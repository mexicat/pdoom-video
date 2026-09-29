// DNA edition, `paperclips` slot — part B (dna-paperclips.ts): a separate cell-control plate.
// A schematic tumor-suppressor pathway on bone paper: the p53 hub with its network (stress inputs,
// repair / apoptosis / feedback outputs), and the one output that matters here, a checkpoint gate on
// the cell-cycle rule, which hangs open. Past the open gate, cells proliferate (a deterministic 2D
// growth simulation precomputed in init: divisions on the eighth-note grid, soft-body repulsion),
// crop against the frame edges and press on the rule from both sides until the gap between the two
// cell masses is a narrow dark channel (it becomes the axon of the next slot, fuse).
import type { LineBatch } from '../engine/lines';
import type { AudioData } from '../engine/audio';
import { LIN, rgba } from '../engine/palette';
import { clamp, ease, hash, lerp, prog } from '../engine/util';

type RGB = [number, number, number];
const sc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Channel centre line (screen y). The empty focus bracket and the lyric of "Now there's nowhere…" sit on it. */
export const CY = 591;
export const GATE_X = 820;
export const HUB = { x: 430, y: 300, r: 56 };

export interface CellTimes {
  tB: number; // part B's first frame (the cut on "Killswitch")
  tEnd: number;
  tSq0: number; tSq1: number; // the channel narrows (cells pressing)
  tDark0: number; tDark1: number; // the channel's floor sinks into shadow
  tRel: number; // the gate's side wall gives: cells spill back over the diagram
}

/** Half-height of the channel between the two cell masses. */
export function channelHalf(T: CellTimes, t: number) {
  return lerp(62, 44, prog(t, T.tSq0, T.tSq1, ease.inOutCubic));
}
/** 0 = paper, 1 = solid ink. */
export function channelDark(T: CellTimes, t: number) {
  return prog(t, T.tDark0, T.tDark1, ease.inOutQuad);
}

// ------------------------------------------------------------------ growth simulation
export class CellSim {
  dt = 1 / 120;
  t0: number;
  frames: Float32Array[] = []; // per step: x, y, r for ids 0..count-1
  counts: number[] = [];
  seeds: number[] = [];
  births: number[] = [];

  constructor(T: CellTimes, au: AudioData, o: { max?: number; r0?: number } = {}) {
    const MAX = o.max ?? 480, R0 = o.r0 ?? 40;
    this.t0 = T.tB - 0.02;
    const x: number[] = [], y: number[] = [], r: number[] = [], R: number[] = [], rb: number[] = [], born: number[] = [], next: number[] = [], side: number[] = [], nb: number[] = [], gated: boolean[] = [];
    const eighth = (tt: number) => au.timeOfBeat(Math.ceil(au.beatAt(tt) * 2 - 1e-6) / 2);
    const spawn = (px: number, py: number, rad: number, tb: number, sd: number, s: number) => {
      const id = x.length;
      x.push(px); y.push(py); rb.push(rad); r.push(rad); nb.push(0); gated.push(px > GATE_X);
      R.push(R0 * (0.86 + 0.28 * hash(sd, 1)));
      born.push(tb); side.push(s);
      next.push(eighth(tb + 0.3 + 0.2 * hash(sd, 2)));
      this.seeds.push(sd); this.births.push(tb);
      return id;
    };
    // founders: a colony already past the open gate (the checkpoint has been open a while), on both
    // sides of the rule, thinning out toward the right edge; mature, dividing in turn
    const F0: [number, number, number][] = [
      [GATE_X + 60, -1, 0], [GATE_X + 64, 1, 0], [GATE_X + 140, -1, 0.1], [GATE_X + 150, 1, 0.05],
      [GATE_X + 96, -1, 0.95], [GATE_X + 110, 1, 0.9], [GATE_X + 226, -1, 0.1], [GATE_X + 236, 1, 0.12],
      [GATE_X + 190, -1, 0.95], [GATE_X + 200, 1, 1.0], [GATE_X + 300, -1, 0.3], [GATE_X + 150, -1, 1.85],
    ];
    F0.forEach(([fx, s, lvl], k) => {
      const fy = CY + s * (62 + 42 + 80 * lvl);
      const id = spawn(fx + (hash(k, 31) - 0.5) * 30, fy, R0, T.tB - 0.4, 11 + k * 7, s);
      next[id] = eighth(T.tB + 0.08 + 0.42 * hash(k, 33));
    });
    let sd = 100;
    const cellS = 2 * R0 * 1.2;
    const grid = new Map<number, number[]>();
    let leftIn = false;
    for (let t = this.t0; t <= T.tEnd + 0.05; t += this.dt) {
      const hb = channelHalf(T, t);
      const wall = t < T.tRel ? GATE_X + 18 : -1e9;
      if (!leftIn && t >= T.tRel - 0.3) {
        // the tissue beyond the left edge is proliferating too: it presses in from the frame edge
        leftIn = true;
        for (let k = 0; k < 10; k++) {
          const s = k % 2 === 0 ? -1 : 1, lvl = Math.floor(k / 2);
          const fy = CY + s * (62 + 40 + 96 * lvl + 30 * hash(k, 41));
          const id = spawn(18 + 30 * hash(k, 43), fy, R0, t - 0.3, 500 + k * 5, s);
          next[id] = eighth(t + 0.05 + 0.3 * hash(k, 47));
        }
        for (let k = 0; k < 10; k++) {
          const s = k % 2 === 0 ? -1 : 1, fx = 150 + 150 * Math.floor(k / 2) + 40 * hash(k, 51);
          const id = spawn(fx, s < 0 ? -8 : 1088, R0, t - 0.3, 600 + k * 5, s);
          next[id] = eighth(t + 0.05 + 0.3 * hash(k, 53));
        }
      }
      // divisions
      const n0 = x.length;
      for (let i = 0; i < n0; i++) {
        if (t < next[i]! || x.length >= MAX) continue;
        if (nb[i]! >= 6) { next[i] = eighth(t + 0.2); continue; }
        const on = x[i]! > -20 && x[i]! < 1940 && y[i]! > -20 && y[i]! < 1100;
        if (!on) { next[i] = 1e9; continue; }
        let th = hash(sd, 5) * Math.PI * 2;
        if (x[i]! < 120) th = (hash(sd, 5) - 0.5) * 1.6; // near the left edge: divide inward
        const rd = Math.max(r[i]!, R[i]! * 0.9) * 0.74;
        const dx = Math.cos(th) * rd * 0.45, dy = Math.sin(th) * rd * 0.45;
        const j = spawn(x[i]! + dx, y[i]! + dy, rd, t, sd++, side[i]!);
        x[i] = x[i]! - dx; y[i] = y[i]! - dy; r[i] = rd; rb[i] = rd; born[i] = t;
        next[i] = eighth(t + 0.2 + 0.22 * hash(sd, 7));
        next[j] = eighth(t + 0.2 + 0.22 * hash(sd, 9));
        sd++;
      }
      // growth
      const n = x.length;
      for (let i = 0; i < n; i++) r[i] = lerp(rb[i]!, R[i]!, prog(t, born[i]!, born[i]! + 0.34, ease.outQuad));
      // relaxation: pairwise repulsion (uniform grid) + constraints
      for (let it = 0; it < 3; it++) {
        const last = it === 2;
        if (last) nb.fill(0);
        grid.clear();
        for (let i = 0; i < n; i++) {
          const k = Math.floor(x[i]! / cellS + 64) * 4096 + Math.floor(y[i]! / cellS + 64);
          let g = grid.get(k); if (!g) grid.set(k, (g = [])); g.push(i);
        }
        for (let i = 0; i < n; i++) {
          const gx = Math.floor(x[i]! / cellS + 64), gy = Math.floor(y[i]! / cellS + 64);
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const g = grid.get((gx + ox) * 4096 + gy + oy);
            if (!g) continue;
            for (const j of g) {
              if (j <= i) continue;
              const ddx = x[j]! - x[i]!, ddy = y[j]! - y[i]!, d = Math.hypot(ddx, ddy) || 1e-3, m = (r[i]! + r[j]!) * 0.97;
              if (last && d < m * 1.08) { nb[i] = nb[i]! + 1; nb[j] = nb[j]! + 1; }
              if (d >= m) continue;
              const push = Math.min(6, (m - d) * 0.5), ux = ddx / d, uy = ddy / d;
              x[i] = x[i]! - ux * push; y[i] = y[i]! - uy * push;
              x[j] = x[j]! + ux * push; y[j] = y[j]! + uy * push;
            }
          }
        }
        for (let i = 0; i < n; i++) {
          if (last) {
            const wy = side[i]! < 0 ? CY - hb - y[i]! : y[i]! - CY - hb;
            if (wy < r[i]! * 1.05) nb[i] = nb[i]! + 2;
            if (x[i]! < -4 || x[i]! > 1924 || y[i]! < -4 || y[i]! > 1084) nb[i] = nb[i]! + 2;
          }
          if (side[i]! < 0) y[i] = Math.min(y[i]!, CY - hb - r[i]! * 0.96);
          else y[i] = Math.max(y[i]!, CY + hb + r[i]! * 0.96);
          x[i] = clamp(x[i]!, Math.max(-12, gated[i] ? wall + r[i]! : -12), 1932);
          y[i] = clamp(y[i]!, -12, 1092);
        }
      }
      const fr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { fr[i * 3] = x[i]!; fr[i * 3 + 1] = y[i]!; fr[i * 3 + 2] = r[i]!; }
      this.frames.push(fr); this.counts.push(n);
    }
  }

  /** Cells at song time t: calls fn(x, y, r, age, seed) in birth order. */
  each(t: number, fn: (x: number, y: number, r: number, age: number, seed: number) => void) {
    const f = clamp((t - this.t0) / this.dt, 0, this.frames.length - 1.001);
    const k = Math.floor(f), a = f - k;
    const A = this.frames[k]!, B = this.frames[Math.min(this.frames.length - 1, k + 1)]!;
    const nA = this.counts[k]!, nB = this.counts[Math.min(this.counts.length - 1, k + 1)]!;
    for (let i = 0; i < nB; i++) {
      let px: number, py: number, pr: number;
      if (i < nA) { px = lerp(A[i * 3]!, B[i * 3]!, a); py = lerp(A[i * 3 + 1]!, B[i * 3 + 1]!, a); pr = lerp(A[i * 3 + 2]!, B[i * 3 + 2]!, a); }
      else { if (a < 0.5) continue; px = B[i * 3]!; py = B[i * 3 + 1]!; pr = B[i * 3 + 2]!; }
      fn(px, py, pr, t - this.births[i]!, this.seeds[i]!);
    }
  }
}

// ------------------------------------------------------------------ drawing (LineBatch, 'normal' blend, px)
const INK = LIN.ink, BONE = LIN.bone, GRAPH = LIN.graphite;

function circle(L: LineBatch, x: number, y: number, r: number, w: number, col: RGB, a: number, n = 36, dash = 0) {
  let px = x + r, py = y;
  for (let i = 1; i <= n; i++) {
    const th = (i / n) * Math.PI * 2, qx = x + Math.cos(th) * r, qy = y + Math.sin(th) * r;
    if (!dash || i % 2 === 0) L.seg2(px, py, qx, qy, w, col, a);
    px = qx; py = qy;
  }
}
/**
 * Engraved shading: chords at 45° over the part of the disc (x, y, r) outside a lit disc offset toward
 * the upper-left light, getting heavier toward the shadowed rim.
 */
function shadeDisc(L: LineBatch, x: number, y: number, r: number, step: number, a: number, lit = 0.3, wMax = 1.4) {
  const ux = 0.7071, uy = -0.7071; // along the chord
  const nx = 0.7071, ny = 0.7071; // across (toward the lower right, away from the light)
  const ol = -lit * r, rl = r * 0.97;
  for (let o = -r + step * 0.5; o < r; o += step) {
    const ha = Math.sqrt(Math.max(0, r * r - o * o));
    const hb = Math.sqrt(Math.max(0, rl * rl - (o - ol) * (o - ol)));
    const w = lerp(0.5, wMax, clamp((o + r) / (2 * r)));
    const cx = x + nx * o, cy = y + ny * o;
    if (hb <= 0.01) { L.seg2(cx - ux * ha, cy - uy * ha, cx + ux * ha, cy + uy * ha, w, INK, a); continue; }
    if (hb >= ha) continue;
    L.seg2(cx - ux * ha, cy - uy * ha, cx - ux * hb, cy - uy * hb, w, INK, a);
    L.seg2(cx + ux * hb, cy + uy * hb, cx + ux * ha, cy + uy * ha, w, INK, a);
  }
}

export interface CellP { x: number; y: number; r: number; age: number; seed: number }
/**
 * The proliferating tissue, drawn into a Canvas2D layer in a handful of batched paths. Each cell is
 * its disc (1.12× its contact radius) cut by the power-diagram bisectors with its neighbours and by
 * the channel wall, so crowded cells press flat against each other and free edges stay round (a fresh
 * pair of daughters reads as one cell with its division furrow). Engraved: paper-white bodies with a
 * cast shadow, 45° hatching in the shade (clipped to each cell), hatched nuclei, nucleoli.
 */
export function drawTissue(c: CanvasRenderingContext2D, cells: CellP[], hb: number, a = 1) {
  const n = cells.length;
  if (!n || a <= 0.001) return;
  const G = 100, grid = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const k = (Math.floor(cells[i]!.x / G) + 64) * 4096 + Math.floor(cells[i]!.y / G) + 64;
    let g = grid.get(k); if (!g) grid.set(k, (g = [])); g.push(i);
  }
  const NA = 40, KR = 1.12;
  const bodies = new Path2D(), shadows = new Path2D(), hatchA = new Path2D(), hatchB = new Path2D(), nuc = new Path2D(), nucl = new Path2D();
  const pl: number[] = [];
  const ux = 0.7071, uy = -0.7071, nnx = 0.7071, nny = 0.7071;
  for (let i = 0; i < n; i++) {
    const ci = cells[i]!, R = ci.r * KR;
    pl.length = 0;
    const gx = Math.floor(ci.x / G) + 64, gy = Math.floor(ci.y / G) + 64;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const g = grid.get((gx + ox) * 4096 + gy + oy);
      if (!g) continue;
      for (const j of g) {
        if (j === i) continue;
        const cj = cells[j]!, dx = cj.x - ci.x, dy = cj.y - ci.y, D = Math.hypot(dx, dy), Rj = cj.r * KR;
        if (D >= R + Rj || D < 1e-3) continue;
        pl.push(dx / D, dy / D, (D * D + R * R - Rj * Rj) / (2 * D) - 1.4);
      }
    }
    if (ci.y < CY) pl.push(0, 1, CY - hb - 2 - ci.y); else pl.push(0, -1, ci.y - (CY + hb + 2));
    // outline: the ray distance to the nearest cut
    let rhoMin = R;
    for (let k = 0; k < NA; k++) {
      const th = (k / NA) * Math.PI * 2 + ci.seed, cx = Math.cos(th), cy = Math.sin(th);
      let rho = R * (1 + 0.025 * Math.sin(3 * th + ci.seed * 5));
      for (let q = 0; q < pl.length; q += 3) {
        const nu = pl[q]! * cx + pl[q + 1]! * cy;
        if (nu > 1e-4) rho = Math.min(rho, pl[q + 2]! / nu);
      }
      rho = Math.max(rho, R * 0.2);
      rhoMin = Math.min(rhoMin, rho);
      const px = ci.x + cx * rho, py = ci.y + cy * rho;
      if (k === 0) { bodies.moveTo(px, py); shadows.moveTo(px + 5, py + 7); } else { bodies.lineTo(px, py); shadows.lineTo(px + 5, py + 7); }
    }
    bodies.closePath(); shadows.closePath();
    // hatching chords (45°), clipped to the cell, only outside the lit disc (light from the upper left)
    const step = 4.4;
    for (let o = -R + step * 0.5; o < R; o += step) {
      let s0 = -Math.sqrt(R * R - o * o), s1 = -s0;
      for (let q = 0; q < pl.length && s1 > s0; q += 3) {
        const A = o * (pl[q]! * nnx + pl[q + 1]! * nny), B = pl[q]! * ux + pl[q + 1]! * uy, d = pl[q + 2]! - 1.2;
        if (B > 1e-6) s1 = Math.min(s1, (d - A) / B);
        else if (B < -1e-6) s0 = Math.max(s0, (d - A) / B);
        else if (A > d) s1 = s0;
      }
      if (s1 <= s0) continue;
      const rl = R * 0.97, oo = o + 0.3 * R, b = oo * oo < rl * rl ? Math.sqrt(rl * rl - oo * oo) : 0;
      const P = o > 0.35 * R ? hatchB : hatchA;
      const bx = ci.x + nnx * o, by = ci.y + nny * o;
      const seg = (u0: number, u1: number) => { if (u1 - u0 > 1) { P.moveTo(bx + ux * u0, by + uy * u0); P.lineTo(bx + ux * u1, by + uy * u1); } };
      if (b <= 0) seg(s0, s1);
      else { seg(s0, Math.min(s1, -b)); seg(Math.max(s0, b), s1); }
    }
    // nucleus and nucleolus
    const th = ci.seed * 2.3, nr = Math.min(ci.r * 0.36, rhoMin * 0.58), ko = Math.min(1, rhoMin / R);
    const nx0 = ci.x + (Math.cos(th) * ci.r * 0.1 - ci.r * 0.05) * ko, ny0 = ci.y + (Math.sin(th) * ci.r * 0.08 - ci.r * 0.04) * ko, rot = ci.seed * 1.7;
    nuc.moveTo(nx0 + nr * Math.cos(rot), ny0 + nr * Math.sin(rot));
    nuc.ellipse(nx0, ny0, nr, nr * 0.8, rot, 0, Math.PI * 2);
    const rr = ci.r * 0.075, lx = nx0 - nr * 0.25, ly = ny0 - nr * 0.2;
    if (rhoMin > R * 0.5) { nucl.moveTo(lx + rr, ly); nucl.arc(lx, ly, rr, 0, Math.PI * 2); }
  }
  c.save();
  c.globalAlpha = a;
  c.fillStyle = rgba('ink', 0.14); c.fill(shadows);
  c.fillStyle = rgba('bone', 1); c.fill(bodies);
  c.lineCap = 'butt';
  c.strokeStyle = rgba('ink', 0.42); c.lineWidth = 0.8; c.stroke(hatchA);
  c.strokeStyle = rgba('ink', 0.62); c.lineWidth = 1.25; c.stroke(hatchB);
  c.fillStyle = rgba('ash', 0.42); c.fill(nuc);
  c.strokeStyle = rgba('ink', 0.8); c.lineWidth = 1.2; c.stroke(nuc);
  c.fillStyle = rgba('ink', 0.85); c.fill(nucl);
  c.lineJoin = 'round';
  c.strokeStyle = rgba('ink', 0.95); c.lineWidth = 1.7; c.stroke(bodies);
  c.restore();
}

/** The channel between the two cell masses: its floor darkens (engraved rules) and its walls close in. */
export function drawChannel(L: LineBatch, hb: number, dark: number, t: number) {
  const y0 = CY - hb, y1 = CY + hb;
  if (dark > 0.001) {
    // horizontal engraving rules that thicken until they merge into solid ink
    const step = 4;
    for (let y = y0 + step * 0.5; y < y1; y += step) {
      L.seg2(-10, y, 1930, y, lerp(0.4, step + 0.6, dark), INK, clamp(dark * 1.6));
    }
  }
  // the cell-cycle rule's chevrons (process direction), gone once the floor is dark
  const ca = 1 - clamp(dark * 3);
  if (ca > 0) {
    for (let x = 140; x < 1900; x += 96) {
      if (Math.abs(x - GATE_X) < 50) continue;
      L.seg2(x - 9, CY - 11, x + 3, CY, 1.3, GRAPH, 0.55 * ca);
      L.seg2(x + 3, CY, x - 9, CY + 11, 1.3, GRAPH, 0.55 * ca);
    }
  }
  L.seg2(-10, y0, 1930, y0, 2.2, INK, 1);
  L.seg2(-10, y1, 1930, y1, 2.2, INK, 1);
  void t;
}

/** The open checkpoint gate on the rule: two posts, the barrier arm hanging open, a dashed ghost of it closed. */
export function drawGate(L: LineBatch, hb: number, t: number, sway: number) {
  const y0 = CY - hb, y1 = CY + hb, x = GATE_X;
  const post = (ya: number, yb: number) => {
    L.seg2(x, ya, x, yb, 16, INK, 1);
    L.seg2(x, ya + 3, x, yb - 3, 9, sc(BONE, 0.95), 1);
    L.seg2(x - 3, lerp(ya, yb, 0.35), x + 3, lerp(ya, yb, 0.35), 4, INK, 0.9);
  };
  post(y0 - 44, y0 + 6);
  post(y1 - 6, y1 + 44);
  // ghost of the closed arm, dashed, across the rule
  for (let y = y0 + 6; y < y1 - 8; y += 14) {
    L.seg2(x - 7, y, x - 7, Math.min(y1 - 8, y + 7), 1.6, GRAPH, 0.8);
    L.seg2(x + 7, y, x + 7, Math.min(y1 - 8, y + 7), 1.6, GRAPH, 0.8);
  }
  // the arm: hinged on the upper post, swung up and back (open); a little play on the snares
  const hx = x, hy = y0 - 30;
  const ang = -Math.PI / 2 + 0.5 + 0.035 * sway;
  const lenA = 2 * hb + 70, ux = Math.cos(ang), uy = Math.sin(ang);
  const ex = hx + ux * lenA, ey = hy + uy * lenA;
  L.seg2(hx, hy, ex, ey, 15, INK, 1);
  L.seg2(hx, hy, ex, ey, 9, sc(BONE, 0.97), 1);
  for (let k = 1; k < 8; k += 2) {
    const a0 = (k / 8) * lenA, a1 = ((k + 1) / 8) * lenA;
    L.seg2(hx + ux * a0, hy + uy * a0, hx + ux * a1, hy + uy * a1, 9, INK, 0.92);
  }
  L.seg2(hx, hy, hx + 0.01, hy, 20, INK, 1);
  L.seg2(hx, hy, hx + 0.01, hy, 8, sc(BONE, 0.95), 1);
  void t;
}

/** Arrowhead or blunt bar (⊣) at (x, y) pointing along (dx, dy). */
function head(L: LineBatch, x: number, y: number, dx: number, dy: number, kind: 'arrow' | 'bar', col: RGB, a: number) {
  const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, px = -uy, py = ux;
  if (kind === 'bar') { L.seg2(x + px * 12, y + py * 12, x - px * 12, y - py * 12, 3, col, a); return; }
  L.seg2(x, y, x - ux * 13 + px * 7, y - uy * 13 + py * 7, 2, col, a);
  L.seg2(x, y, x - ux * 13 - px * 7, y - uy * 13 - py * 7, 2, col, a);
}
function edge(L: LineBatch, ax: number, ay: number, bx: number, by: number, ra: number, rb: number, kind: 'arrow' | 'bar', dashed: boolean, col: RGB, a: number, w = 1.6) {
  const l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
  const sx = ax + ux * (ra + 6), sy = ay + uy * (ra + 6), ex = bx - ux * (rb + 6), ey = by - uy * (rb + 6);
  const L2 = Math.hypot(ex - sx, ey - sy);
  if (!dashed) L.seg2(sx, sy, ex, ey, w, col, a);
  else for (let s = 0; s < L2; s += 13) L.seg2(sx + ux * s, sy + uy * s, sx + ux * Math.min(L2, s + 7), sy + uy * Math.min(L2, s + 7), w, col, a);
  head(L, ex, ey, ux, uy, kind, col, a);
}

export interface Node { x: number; y: number; r: number; kind: 'in' | 'out' | 'fb' }
/** The p53 network (schematic, unlabelled nodes): two stress inputs, two outputs, one feedback partner. */
export const NET: Node[] = [
  { x: 190, y: 200, r: 14, kind: 'in' },
  { x: 176, y: 378, r: 12, kind: 'in' },
  { x: 356, y: 150, r: 13, kind: 'out' },
  { x: 604, y: 170, r: 12, kind: 'out' },
  { x: 262, y: 474, r: 13, kind: 'fb' },
];

/**
 * The hub and its network. Inputs arrive as small pulses on the beats (`pulses`: 0..1 progress of
 * the current pulse per input); every output of the hub is dashed: it is out of office.
 */
export function drawNetwork(L: LineBatch, hb: number, pulses: number[], a = 1) {
  const H0 = HUB;
  NET.forEach((n, i) => {
    if (n.kind === 'in') edge(L, n.x, n.y, H0.x, H0.y, n.r, H0.r, 'arrow', false, INK, 0.85 * a);
    else if (n.kind === 'out') edge(L, H0.x, H0.y, n.x, n.y, H0.r, n.r, 'arrow', true, GRAPH, 0.9 * a);
    else {
      // feedback partner: hub → partner (dashed, idle), partner ⊣ hub (solid)
      edge(L, H0.x - 20, H0.y + 30, n.x - 8, n.y - 6, 22, n.r, 'arrow', true, GRAPH, 0.9 * a);
      edge(L, n.x + 12, n.y - 2, H0.x + 4, H0.y + 38, n.r, 22, 'bar', false, INK, 0.8 * a);
    }
    circle(L, n.x, n.y, n.r, 1.6, INK, 0.95 * a, 20);
    if (n.kind === 'in') L.seg2(n.x, n.y, n.x + 0.01, n.y, n.r * 0.9, INK, 0.9 * a);
    // an arriving signal pulse
    const p = pulses[i] ?? 0;
    if (n.kind === 'in' && p > 0 && p < 1) {
      const px = lerp(n.x, H0.x, 0.12 + 0.72 * p), py = lerp(n.y, H0.y, 0.12 + 0.72 * p);
      L.seg2(px, py, px + 0.01, py, 7, INK, a * (1 - p * 0.6));
    }
  });
  // the hub → checkpoint edge (⊣ at the gate), dashed: the arrest signal is not being sent
  const gx = GATE_X - 16, gy = CY - hb - 58;
  edge(L, H0.x, H0.y, gx, gy, H0.r, 4, 'bar', true, GRAPH, 0.95 * a, 2.2);
  // the hub: an engraved sphere
  L.seg2(H0.x + 6, H0.y + 8, H0.x + 6.01, H0.y + 8, 2 * H0.r + 4, INK, 0.16 * a);
  L.seg2(H0.x, H0.y, H0.x + 0.01, H0.y, 2 * H0.r, sc(BONE, 1.02), a);
  shadeDisc(L, H0.x, H0.y, H0.r, 3.6, 0.8 * a, 0.36, 1.8);
  circle(L, H0.x, H0.y, H0.r, 2.6, INK, a, 56);
  circle(L, H0.x, H0.y, H0.r + 9, 1, INK, 0.5 * a, 56, 1);
}
