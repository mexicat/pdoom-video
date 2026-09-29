// The cell field shared by the DNA edition's `stack` (whose chromatin loops end as its first cells'
// outlines) and `dense` (where the field divides until it has consumed the negative space).
// World units are dense's px at its identity framing (= the screen). Everything is built once and is
// a pure function of song time afterwards.
//
// The field is laid out backwards: its final, confluent state is hook4's cell field (the same
// Voronoi seeds, reproduced from dna-hook-cells.ts, so the cut into hook4 lands on the same cells),
// extended past the frame for dense's wide views and down to a basement membrane; neighbouring
// cells are then paired up four times into parents (a division tree). Played forwards, the ~30 cells
// of the first frame divide in four rounds, one per sung phrase, into hook4's field. Schematic.
import { W, H, SCALE, scaleContext2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { mulberry32, hash } from '../engine/util';
import type { AudioData } from '../engine/audio';

export type Pt = { x: number; y: number };

/** Final seed spacing (hook4's), division rounds, and the basement membrane's world y. */
export const SP = 74;
export const LEVELS = 4;
export const MEMBRANE_Y = 1330;
/** Extent of the seeded world (the epithelium; the stroma lies below MEMBRANE_Y). */
export const WORLD = { x0: -2000, x1: 3920, y0: -1600, y1: MEMBRANE_Y - 26 };

export interface CellNode {
  id: number; level: number; x: number; y: number;
  /** Nominal radius at fill factor 1 (area-equivalent radius of its final region(s)). */
  rho: number;
  parent: number; kids: number[];
  /** When it splits into its two kids (Infinity: never), and when it was born (its parent's split). */
  tDiv: number; tBirth: number;
  /** Outline wobble phases and nucleus parameters (hash-seeded, stable across the division). */
  w1: number; w2: number;
}

// ------------------------------------------------------------------ geometry helpers
/** Clip a convex polygon to the half-plane (p - m)·n <= 0 (Sutherland–Hodgman). */
export function clipHalf(poly: Pt[], mx: number, my: number, nx: number, ny: number): Pt[] {
  const out: Pt[] = [];
  const f = (p: Pt) => (p.x - mx) * nx + (p.y - my) * ny;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa <= 0) !== (fb <= 0)) { const u = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }); }
  }
  return out;
}
/** Closed Chaikin smoothing. */
export function chaikin(p: Pt[], it = 2): Pt[] {
  let q = p;
  for (let k = 0; k < it; k++) {
    const r: Pt[] = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[i]!, b = q[(i + 1) % q.length]!;
      r.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    q = r;
  }
  return q;
}
const toPath = (p: Pt[]) => { const P = new Path2D(); p.forEach((q, i) => (i ? P.lineTo(q.x, q.y) : P.moveTo(q.x, q.y))); P.closePath(); return P; };
const polyArea = (p: Pt[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const u = p[i]!, v = p[(i + 1) % p.length]!; a += u.x * v.y - v.x * u.y; } return Math.abs(a) / 2; };

/** Uniform bucket grid over points, for neighbour queries. */
export class Grid {
  cell: number; x0: number; y0: number; nx: number; ny: number;
  heads: Int32Array; next: Int32Array;
  constructor(pts: ArrayLike<number>, n: number, cell: number, stride = 2) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { const x = pts[i * stride]!, y = pts[i * stride + 1]!; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (n === 0) { x0 = y0 = 0; x1 = y1 = 1; }
    this.cell = cell; this.x0 = x0; this.y0 = y0;
    this.nx = Math.max(1, Math.ceil((x1 - x0) / cell) + 1); this.ny = Math.max(1, Math.ceil((y1 - y0) / cell) + 1);
    this.heads = new Int32Array(this.nx * this.ny).fill(-1); this.next = new Int32Array(Math.max(1, n));
    for (let i = 0; i < n; i++) {
      const gx = Math.floor((pts[i * stride]! - x0) / cell), gy = Math.floor((pts[i * stride + 1]! - y0) / cell);
      const k = gy * this.nx + gx;
      this.next[i] = this.heads[k]!; this.heads[k] = i;
    }
  }
  /** Calls f(i) for every point in the buckets within `r` of (x, y). */
  near(x: number, y: number, r: number, f: (i: number) => void) {
    const gx0 = Math.max(0, Math.floor((x - r - this.x0) / this.cell)), gx1 = Math.min(this.nx - 1, Math.floor((x + r - this.x0) / this.cell));
    const gy0 = Math.max(0, Math.floor((y - r - this.y0) / this.cell)), gy1 = Math.min(this.ny - 1, Math.floor((y + r - this.y0) / this.cell));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      for (let i = this.heads[gy * this.nx + gx]!; i >= 0; i = this.next[i]!) f(i);
    }
  }
}

/** Voronoi polygons of `pts` (only those listed in `which`), clipped to a box, via a bucket grid. */
function voronoi(pts: Pt[], which: number[], box: { x0: number; y0: number; x1: number; y1: number }, reach: number): Pt[][] {
  const flat = new Float32Array(pts.length * 2);
  pts.forEach((p, i) => { flat[i * 2] = p.x; flat[i * 2 + 1] = p.y; });
  const g = new Grid(flat, pts.length, reach);
  return which.map((i) => {
    const a = pts[i]!;
    let poly: Pt[] = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
    g.near(a.x, a.y, reach, (j) => {
      if (j === i) return;
      const b = pts[j]!, dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy > reach * reach) return;
      poly = clipHalf(poly, (a.x + b.x) / 2, (a.y + b.y) / 2, dx, dy);
    });
    return poly;
  });
}

// ------------------------------------------------------------------ hook4's field (reproduced)
export interface Nucleus { nx: number; ny: number; rx: number; ry: number; rot: number; ph: number; dots: [number, number, number, number][]; nl: [number, number, number] | null }
export interface Hook4Cell { s: Pt; poly: Pt[]; rad: number; nuc: Nucleus | null }
/**
 * hook4's cell field exactly as dna-hook-cells.ts builds it (same seed, lattice, thinning, box, Lloyd
 * step and random stream, so the nuclei land where hook4 draws them), plus that texture.
 */
export function hook4Field(): { cells: Hook4Cell[]; draw: () => HTMLCanvasElement } {
  const rnd = mulberry32(124);
  const sp = SP, rows = Math.ceil((H + 160) / (sp * 0.87)), cols = Math.ceil((W + 160) / sp);
  let seeds: Pt[] = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    seeds.push({ x: -80 + q * sp + (r % 2 ? sp / 2 : 0) + (rnd() - 0.5) * sp * 0.7, y: -80 + r * sp * 0.87 + (rnd() - 0.5) * sp * 0.6 });
  }
  seeds = seeds.filter(() => rnd() > 0.09);
  const B = { x0: -120, y0: -120, x1: W + 120, y1: H + 120 };
  const cells = (S: Pt[]) => S.map((a) => {
    let poly: Pt[] = [{ x: B.x0, y: B.y0 }, { x: B.x1, y: B.y0 }, { x: B.x1, y: B.y1 }, { x: B.x0, y: B.y1 }];
    for (const b of S) {
      if (b === a) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy > (sp * 2.6) ** 2) continue;
      poly = clipHalf(poly, (a.x + b.x) / 2, (a.y + b.y) / 2, dx, dy);
    }
    return poly;
  });
  let polys = cells(seeds);
  seeds = polys.map((p, i) => {
    if (p.length < 3) return seeds[i]!;
    let x = 0, y = 0; for (const q of p) { x += q.x; y += q.y; }
    return { x: x / p.length, y: y / p.length };
  });
  polys = cells(seeds);
  // the drawing pass's random stream, consumed in the same order
  const out: Hook4Cell[] = polys.map((poly, i) => {
    const s = seeds[i]!;
    if (poly.length < 3) return { s, poly, rad: 0, nuc: null };
    const ins = poly.map((q) => { const dx = q.x - s.x, dy = q.y - s.y, l = Math.hypot(dx, dy) || 1; return { x: q.x - (dx / l) * 1.8, y: q.y - (dy / l) * 1.8 }; });
    let rad = 0; for (const q of ins) rad += Math.hypot(q.x - s.x, q.y - s.y); rad /= ins.length;
    if (rnd() < 0.05) return { s, poly, rad, nuc: null };
    const nx = s.x + (rnd() - 0.5) * rad * 0.35, ny = s.y + (rnd() - 0.5) * rad * 0.35;
    const rx = rad * (0.3 + rnd() * 0.12), ry = rx * (0.72 + rnd() * 0.22), rot = rnd() * Math.PI;
    const ph = rnd() * 10;
    const dots: [number, number, number, number][] = [];
    for (let k = 0, n = 12 + Math.floor(rnd() * 12); k < n; k++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.92, al = 0.25 + rnd() * 0.3, dr = 0.7 + rnd() * 0.9;
      dots.push([a, rr, al, dr]);
    }
    let nl: [number, number, number] | null = null;
    if (rnd() < 0.65) { const a = rnd() * Math.PI * 2, rr = rnd() * 0.45; nl = [a, rr, Math.max(1.5, rad * 0.055)]; }
    return { s, poly, rad, nuc: { nx, ny, rx, ry, rot, ph, dots, nl } };
  });
  const draw = () => {
    const cv = document.createElement('canvas'); cv.width = W * SCALE; cv.height = H * SCALE;
    const c = scaleContext2D(cv.getContext('2d')!, SCALE);
    const INK = (a: number) => rgba('ink', a);
    for (const cell of out) {
      const { s, poly, rad, nuc } = cell;
      if (poly.length < 3) continue;
      const ins = poly.map((q) => { const dx = q.x - s.x, dy = q.y - s.y, l = Math.hypot(dx, dy) || 1; return { x: q.x - (dx / l) * 1.8, y: q.y - (dy / l) * 1.8 }; });
      const mem = toPath(chaikin(ins, 2));
      c.save(); c.clip(mem);
      const g = c.createLinearGradient(s.x - rad * 0.5, s.y - rad * 0.5, s.x + rad * 0.9, s.y + rad * 0.9);
      g.addColorStop(0, INK(0)); g.addColorStop(0.5, INK(0.06)); g.addColorStop(1, INK(0.42));
      c.strokeStyle = g; c.lineWidth = 0.9;
      c.beginPath();
      for (let o = -rad * 2.2; o < rad * 2.2; o += 4.2) { c.moveTo(s.x + o - rad * 1.4, s.y - rad * 1.4); c.lineTo(s.x + o + rad * 1.4, s.y + rad * 1.4); }
      c.stroke();
      c.restore();
      c.strokeStyle = INK(0.5); c.lineWidth = 1.3; c.stroke(mem);
      if (!nuc) continue;
      const { nx, ny, rx, ry, rot, ph } = nuc;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const np: Pt[] = [];
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2, j = 1 + 0.07 * Math.sin(a * 3 + ph) + 0.05 * Math.sin(a * 5 + ph * 2);
        const ex = Math.cos(a) * rx * j, ey = Math.sin(a) * ry * j;
        np.push({ x: nx + ex * cr - ey * sr, y: ny + ex * sr + ey * cr });
      }
      const nucP = toPath(chaikin(np, 2));
      c.fillStyle = INK(0.07); c.fill(nucP);
      c.save(); c.clip(nucP);
      for (const [a, rr, al, dr] of nuc.dots) {
        const ex = Math.cos(a) * rx * rr, ey = Math.sin(a) * ry * rr;
        c.fillStyle = INK(al);
        c.beginPath(); c.arc(nx + ex * cr - ey * sr, ny + ex * sr + ey * cr, dr, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      c.strokeStyle = INK(0.5); c.lineWidth = 1.1; c.stroke(nucP);
      if (nuc.nl) {
        const [a, rr, r0] = nuc.nl;
        c.fillStyle = INK(0.55); c.beginPath(); c.arc(nx + Math.cos(a) * rx * rr, ny + Math.sin(a) * ry * rr, r0, 0, Math.PI * 2); c.fill();
      }
    }
    return cv;
  };
  return { cells: out, draw };
}

// ------------------------------------------------------------------ the division tree
export interface Rounds { beats: number[][] }

export class CellField {
  nodes: CellNode[] = [];
  roots: number[] = [];
  /** Which final seeds are hook4's (the rest extend the world). */
  hook4: Hook4Cell[] = [];

  /** `rounds[k]`: the beats on which the cells of level k divide (k = 0..3). */
  constructor(rounds: number[][]) {
    const h4 = hook4Field();
    this.hook4 = h4.cells;
    const seeds: Pt[] = h4.cells.map((c) => ({ ...c.s }));
    const nHook = seeds.length;
    // extend hook4's lattice over the world (same rows and columns continued; other jitter)
    const rnd = mulberry32(9124);
    const sp = SP, rows = Math.ceil((H + 160) / (sp * 0.87)), cols = Math.ceil((W + 160) / sp);
    const r0 = Math.floor((WORLD.y0 + 80) / (sp * 0.87)), r1 = Math.ceil((WORLD.y1 + 80) / (sp * 0.87));
    const q0 = Math.floor((WORLD.x0 + 80) / sp) - 1, q1 = Math.ceil((WORLD.x1 + 80) / sp);
    for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) {
      const jx = (rnd() - 0.5) * sp * 0.7, jy = (rnd() - 0.5) * sp * 0.6, keep = rnd() > 0.09;
      if (r >= 0 && r < rows && q >= 0 && q < cols) continue;
      const x = -80 + q * sp + (((r % 2) + 2) % 2 ? sp / 2 : 0) + jx, y = -80 + r * sp * 0.87 + jy;
      if (!keep || x < WORLD.x0 || x > WORLD.x1 || y < WORLD.y0 || y > WORLD.y1) continue;
      seeds.push({ x, y });
    }
    // one Lloyd step for the extension (hook4's seeds stay put), then the final regions' areas
    const box = { x0: WORLD.x0 - 60, y0: WORLD.y0 - 60, x1: WORLD.x1 + 60, y1: WORLD.y1 + 14 };
    const ext = seeds.map((_, i) => i).filter((i) => i >= nHook);
    const pe = voronoi(seeds, ext, box, sp * 2.6);
    ext.forEach((i, k) => {
      const p = pe[k]!;
      if (p.length < 3) return;
      let x = 0, y = 0; for (const q of p) { x += q.x; y += q.y; }
      seeds[i] = { x: x / p.length, y: Math.min(WORLD.y1, y / p.length) };
    });
    const all = voronoi(seeds, seeds.map((_, i) => i), box, sp * 2.6);
    // leaves
    let level: number[] = [];
    seeds.forEach((s, i) => {
      const a = all[i]!.length >= 3 ? polyArea(all[i]!) : sp * sp * 0.87;
      level.push(this.add({ level: LEVELS, x: s.x, y: s.y, rho: Math.sqrt(a / Math.PI) }));
    });
    // pair neighbours upwards
    for (let L = LEVELS - 1; L >= 0; L--) {
      const n = level.length, flat = new Float32Array(n * 2);
      level.forEach((id, k) => { flat[k * 2] = this.nodes[id]!.x; flat[k * 2 + 1] = this.nodes[id]!.y; });
      const spL = sp * Math.SQRT2 ** (LEVELS - 1 - L); // spacing of the kids' level
      const g = new Grid(flat, n, spL * 1.6);
      const pairs: [number, number, number][] = [];
      for (let a = 0; a < n; a++) {
        g.near(flat[a * 2]!, flat[a * 2 + 1]!, spL * 1.6, (b) => {
          if (b <= a) return;
          const d = Math.hypot(flat[b * 2]! - flat[a * 2]!, flat[b * 2 + 1]! - flat[a * 2 + 1]!);
          if (d < spL * 1.6) pairs.push([a, b, d * (0.8 + 0.4 * hash(a, b, L, 3))]);
        });
      }
      pairs.sort((u, v) => u[2] - v[2]);
      const used = new Uint8Array(n);
      const up: number[] = [];
      for (const [a, b] of pairs) {
        if (used[a] || used[b]) continue;
        used[a] = used[b] = 1;
        const A = this.nodes[level[a]!]!, Bn = this.nodes[level[b]!]!;
        const rho = Math.hypot(A.rho, Bn.rho), wa = A.rho * A.rho, wb = Bn.rho * Bn.rho;
        const p = this.add({ level: L, x: (A.x * wa + Bn.x * wb) / (wa + wb), y: (A.y * wa + Bn.y * wb) / (wa + wb), rho });
        this.link(p, [level[a]!, level[b]!]);
        up.push(p);
      }
      for (let a = 0; a < n; a++) if (!used[a]) {
        const A = this.nodes[level[a]!]!;
        const p = this.add({ level: L, x: A.x, y: A.y, rho: A.rho });
        this.link(p, [level[a]!]);
        up.push(p);
      }
      // relax the parents a little (sparser fields read better evenly spread); their kids start from here
      const P = up.map((id) => ({ x: this.nodes[id]!.x, y: this.nodes[id]!.y }));
      const spP = sp * Math.SQRT2 ** (LEVELS - L);
      const pv = voronoi(P, P.map((_, i) => i), box, spP * 2.6);
      up.forEach((id, k) => {
        const poly = pv[k]!;
        if (poly.length < 3) return;
        let x = 0, y = 0; for (const q of poly) { x += q.x; y += q.y; }
        const nd = this.nodes[id]!;
        nd.x += (x / poly.length - nd.x) * 0.45; nd.y = Math.min(WORLD.y1 - nd.rho * 0.3, nd.y + (y / poly.length - nd.y) * 0.45);
      });
      level = up;
    }
    this.roots = level;
    // division times: level L divides on one of rounds[L]'s beats
    for (const nd of this.nodes) {
      if (nd.kids.length === 2) {
        const bs = rounds[nd.level]!;
        nd.tDiv = bs[Math.floor(hash(nd.id, 17) * bs.length)]!;
      } else if (nd.kids.length === 1) nd.tDiv = rounds[nd.level]![0]!;
      for (const k of nd.kids) this.nodes[k]!.tBirth = nd.tDiv;
    }
    // wobble phases are inherited so a cell keeps its outline character
    for (const nd of this.nodes) if (nd.parent >= 0 && this.nodes[nd.parent]!.kids.length === 1) {
      const p = this.nodes[nd.parent]!; nd.w1 = p.w1; nd.w2 = p.w2;
    }
  }
  private add(o: { level: number; x: number; y: number; rho: number }): number {
    const id = this.nodes.length;
    this.nodes.push({ id, ...o, parent: -1, kids: [], tDiv: Infinity, tBirth: -Infinity, w1: hash(id, 5) * 6.283, w2: hash(id, 6) * 6.283 });
    return id;
  }
  private link(p: number, kids: number[]) {
    this.nodes[p]!.kids = kids;
    for (const k of kids) this.nodes[k]!.parent = p;
  }
}

/** Beats on the grid within [t0, t1). */
export function gridBeats(au: AudioData, t0: number, t1: number): number[] {
  const out: number[] = [];
  for (let i = Math.ceil(au.beatAt(t0) - 1e-6); ; i++) { const t = au.timeOfBeat(i); if (t >= t1) break; out.push(t); }
  return out;
}

/**
 * The field's schedule (shared by stack and dense): the beats of each division round and the fill
 * factor f(t) (cell radius = rho·f; above ~1.1 neighbours meet and the field is confluent).
 */
export function fieldSchedule(au: AudioData, ly: { get(s: string): { words: { start: number; end: number }[]; end: number } }) {
  const l1 = ly.get('Post-Chinchilla'), l2 = ly.get('safety fence'), l3 = ly.get('Hundred thousand'), l4 = ly.get('RLHF');
  const tSuper = l1.words[1]!.start, tFence = l2.words[4]!.start;
  const rounds = [
    gridBeats(au, tSuper - 0.3, l1.end),
    gridBeats(au, l2.words[1]!.start, tFence + 0.3),
    gridBeats(au, l3.words[0]!.start + 0.05, l3.end - 0.2),
    gridBeats(au, l4.words[1]!.start, l4.words[2]!.start + 1.2),
  ];
  const t0 = au.timeOfBeat(Math.floor(au.beatAt(l1.words[0]!.start + 0.05)));
  const fKeys: [number, number][] = [
    [t0 - 0.6, 0.64], [t0, 0.66], [tSuper, 0.7], [l1.end, 0.76], [tFence, 0.84], [l3.end, 0.94],
    [l4.words[2]!.start, 1.02], [l4.words[2]!.start + 1.4, 1.2], [l4.end, 1.3],
  ];
  const fill = (t: number) => {
    if (t <= fKeys[0]![0]) return fKeys[0]![1];
    for (let i = 1; i < fKeys.length; i++) {
      const [tb, vb] = fKeys[i]!, [ta, va] = fKeys[i - 1]!;
      if (t <= tb) { const u = (t - ta) / (tb - ta); return va + (vb - va) * (u * u * (3 - 2 * u)); }
    }
    return fKeys[fKeys.length - 1]![1];
  };
  return { rounds, fill, t0 };
}

/** Outline wobble of a still-rounded cell (fades as the field becomes confluent). */
export const wobbleAmp = (f: number) => 1 - Math.min(1, Math.max(0, (f - 0.7) / 0.4));
export function wobbleR(r: number, th: number, w1: number, w2: number, f: number) {
  return r * (1 + wobbleAmp(f) * (0.07 * Math.sin(3 * th + w1) + 0.045 * Math.sin(5 * th + w2)));
}
