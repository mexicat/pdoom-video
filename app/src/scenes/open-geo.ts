// B1 `open` — geometry for the unicorn construction plate: primitive builders, resampling,
// the unicorn at three training checkpoints (crude TikZ primitives → refined), and an
// octilinear "autorouter" that turns any stroke into PCB traces with vias.
// World units are TikZ units, y UP.
import { clamp, lerp, TAU } from '../engine/util';

export type P = { x: number; y: number };

export const pt = (x: number, y: number): P => ({ x, y });

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 96, a0 = Math.PI / 2, dir = -1): P[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (dir * TAU * i) / n;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push({ x: cx + c * x - s * y, y: cy + s * x + c * y });
  }
  return out;
}

export function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 48): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Closed polygon through the given corners (repeats the first point at the end). */
export const poly = (...ps: P[]): P[] => [...ps, ps[0]!];

/** Rectangle from its top-left corner, clockwise (as seen with y up: TL → TR → BR → BL). */
export const rect = (x: number, y: number, w: number, h: number): P[] =>
  poly(pt(x, y), pt(x + w, y), pt(x + w, y - h), pt(x, y - h));

export function cubic(p0: P, p1: P, p2: P, p3: P, n = 32): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

/** Catmull-Rom through points (open), n samples per span. */
export function spline(ps: P[], n = 12): P[] {
  const out: P[] = [];
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = ps[Math.max(0, i - 1)]!, p1 = ps[i]!, p2 = ps[i + 1]!, p3 = ps[Math.min(ps.length - 1, i + 2)]!;
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(ps[ps.length - 1]!);
  return out;
}

/** Closed Catmull-Rom through points. */
export function splineClosed(ps: P[], n = 12): P[] {
  const m = ps.length;
  const out: P[] = [];
  for (let i = 0; i < m; i++) {
    const p0 = ps[(i - 1 + m) % m]!, p1 = ps[i]!, p2 = ps[(i + 1) % m]!, p3 = ps[(i + 2) % m]!;
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(out[0]!);
  return out;
}

export function lengths(ps: P[]): Float32Array {
  const L = new Float32Array(ps.length);
  for (let i = 1; i < ps.length; i++) L[i] = L[i - 1]! + Math.hypot(ps[i]!.x - ps[i - 1]!.x, ps[i]!.y - ps[i - 1]!.y);
  return L;
}

export function at(ps: P[], L: Float32Array, s: number): P & { a: number } {
  const n = ps.length;
  if (n < 2) return { x: ps[0]?.x ?? 0, y: ps[0]?.y ?? 0, a: 0 };
  s = clamp(s, 0, L[n - 1]!);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m]! < s) lo = m; else hi = m; }
  const a = ps[lo]!, b = ps[hi]!;
  const u = (s - L[lo]!) / Math.max(1e-9, L[hi]! - L[lo]!);
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), a: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Resample a polyline to exactly n points evenly spaced by arc length. */
export function resample(ps: P[], n: number): P[] {
  const L = lengths(ps);
  const tot = L[L.length - 1]!;
  const out: P[] = [];
  for (let i = 0; i < n; i++) { const q = at(ps, L, (tot * i) / (n - 1)); out.push({ x: q.x, y: q.y }); }
  return out;
}

export const mix = (a: P[], b: P[], k: number): P[] => a.map((p, i) => ({ x: lerp(p.x, b[i]!.x, k), y: lerp(p.y, b[i]!.y, k) }));

// ------------------------------------------------------------------ the unicorn
// Parts share their point count across checkpoints so the drawing can morph ("train").
export interface Part { id: string; closed: boolean; pts: P[] }
export const PART_N: Record<string, number> = {};
const N_CLOSED = 72, N_OPEN = 28;

/** Tapered limb outline around a centreline (closed, starts top-left, clockwise-ish). */
function limb(center: P[], w0: number, w1: number, hoof = 0): P[] {
  const c = spline(center, 10);
  const L = lengths(c), tot = L[L.length - 1]!;
  const left: P[] = [], right: P[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)]!, b = c[Math.min(c.length - 1, i + 1)]!;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const k = L[i]! / tot;
    let w = lerp(w0, w1, Math.pow(k, 0.8)) / 2;
    if (hoof > 0 && k > 0.86) w += hoof * ((k - 0.86) / 0.14);
    left.push({ x: c[i]!.x + nx * w, y: c[i]!.y + ny * w });
    right.push({ x: c[i]!.x - nx * w, y: c[i]!.y - ny * w });
  }
  // going down the centreline, "left" normal points to +x for a downward line → outline: right side down, left side up
  // start top-left, across the top, down the far side, up the near side (same winding as rect())
  return [right[0]!, ...left, ...right.reverse()];
}

/** The unicorn at checkpoint k ∈ {1,2,3} (2 has a fifth leg, as early checkpoints do). */
export function unicorn(k: 1 | 2 | 3): Part[] {
  if (k === 2) {
    const a = unicorn(1), b = unicorn(3);
    return a.map((p, i) => ({ id: p.id, closed: p.closed, pts: p.id === 'leg4' ? resample(limb([pt(0.2, -0.75), pt(0.28, -1.5), pt(0.18, -2.3)], 0.3, 0.2, 0.03), N_CLOSED) : mix(p.pts, b[i]!.pts, 0.5) }));
  }
  const parts: Part[] = [];
  const add = (id: string, closed: boolean, pts: P[]) => parts.push({ id, closed, pts: resample(pts, closed ? N_CLOSED : N_OPEN) });
  if (k === 1) {
    add('body', true, ellipse(0, 0, 2, 1));
    const lx = [-1.5, -1.0, 0.85, 1.35];
    lx.forEach((x, i) => add(`leg${i}`, true, rect(x, -0.62, 0.32, 1.68)));
    add('leg4', true, rect(0.2, -0.9, 0.001, 0.001)); // absent
    add('neck', true, poly(pt(1.25, 0.55), pt(1.95, 1.95), pt(2.5, 1.65), pt(1.95, 0.15)));
    add('head', true, ellipse(2.72, 1.95, 0.72, 0.38, -0.3));
    add('ear', true, poly(pt(2.28, 2.2), pt(2.4, 2.66), pt(2.58, 2.28)));
    add('horn', true, poly(pt(2.62, 2.3), pt(3.3, 3.55), pt(2.92, 2.2)));
    add('mane0', false, cubic(pt(2.3, 2.3), pt(1.9, 2.5), pt(1.5, 1.9), pt(1.55, 1.5)));
    add('mane1', false, cubic(pt(1.95, 1.95), pt(1.5, 2.0), pt(1.2, 1.3), pt(1.3, 0.95)));
    add('mane2', false, cubic(pt(1.65, 1.35), pt(1.2, 1.35), pt(1.0, 0.8), pt(1.1, 0.55)));
    add('tail0', false, cubic(pt(-1.95, 0.3), pt(-2.7, 0.5), pt(-2.9, -0.4), pt(-2.75, -1.1)));
    add('tail1', false, cubic(pt(-1.98, 0.1), pt(-2.5, 0.1), pt(-2.55, -0.6), pt(-2.35, -1.2)));
    add('tail2', false, cubic(pt(-1.98, 0.2), pt(-3.0, 0.6), pt(-3.3, -0.2), pt(-3.15, -0.8)));
    return parts;
  }
  // ---- checkpoint 3: refined (outlines overlap; the renderer hides what falls inside other parts)
  const body: P[] = [];
  for (let i = 0; i <= 160; i++) {
    const a = Math.PI / 2 - (TAU * i) / 160;
    let x = 2.0 * Math.cos(a), y = 0.9 * Math.sin(a);
    if (y > 0) y -= 0.12 * Math.exp(-((x + 0.15) ** 2) / 0.7); // dip in the back
    if (y < 0) y *= 1 + 0.14 * Math.exp(-((x - 0.8) ** 2) / 0.8) - 0.2 * Math.exp(-((x + 1.15) ** 2) / 0.45); // deep chest, tucked flank
    if (x < 0 && y > 0) y += 0.1 * Math.exp(-((x + 1.5) ** 2) / 0.3); // croup
    body.push({ x, y });
  }
  add('body', true, body);
  const back = (x: number) => [pt(x, 0.0), pt(x + 0.12, -0.8), pt(x - 0.14, -1.45), pt(x - 0.06, -2.05), pt(x - 0.02, -2.32)];
  const front = (x: number) => [pt(x, -0.1), pt(x + 0.04, -1.3), pt(x + 0.0, -2.02), pt(x + 0.07, -2.32)];
  add('leg0', true, limb(back(-1.38), 0.62, 0.15, 0.05));
  add('leg1', true, limb(back(-0.95), 0.56, 0.15, 0.05));
  add('leg2', true, limb(front(0.98), 0.5, 0.15, 0.05));
  add('leg3', true, limb(front(1.4), 0.5, 0.15, 0.05));
  add('leg4', true, rect(0.2, -0.9, 0.001, 0.001));
  add('neck', true, splineClosed([pt(0.9, 0.62), pt(1.45, 1.5), pt(1.95, 2.18), pt(2.32, 2.42), pt(2.62, 1.9), pt(2.42, 1.25), pt(2.05, 0.35), pt(1.3, 0.25)], 10));
  add('head', true, splineClosed([pt(2.2, 2.42), pt(2.72, 2.34), pt(3.2, 2.0), pt(3.52, 1.66), pt(3.5, 1.45), pt(3.22, 1.42), pt(2.78, 1.58), pt(2.42, 1.74), pt(2.18, 2.05)], 10));
  add('ear', true, poly(pt(2.3, 2.36), pt(2.4, 2.9), pt(2.56, 2.4)));
  add('horn', true, poly(pt(2.6, 2.44), pt(3.42, 3.82), pt(2.84, 2.34)));
  add('mane0', false, spline([pt(2.28, 2.5), pt(1.92, 2.42), pt(1.62, 2.0), pt(1.32, 1.66), pt(1.0, 1.42), pt(0.9, 1.08)], 10));
  add('mane1', false, spline([pt(2.05, 2.3), pt(1.66, 2.14), pt(1.38, 1.72), pt(1.08, 1.46), pt(0.78, 1.26), pt(0.66, 0.9)], 10));
  add('mane2', false, spline([pt(1.75, 1.95), pt(1.38, 1.76), pt(1.12, 1.38), pt(0.84, 1.14), pt(0.56, 0.98), pt(0.46, 0.66)], 10));
  add('tail0', false, spline([pt(-1.9, 0.5), pt(-2.45, 0.75), pt(-2.85, 0.35), pt(-2.9, -0.35), pt(-3.2, -1.1), pt(-3.05, -1.6)], 10));
  add('tail1', false, spline([pt(-1.95, 0.4), pt(-2.4, 0.45), pt(-2.62, 0.0), pt(-2.62, -0.7), pt(-2.85, -1.35), pt(-2.7, -1.75)], 10));
  add('tail2', false, spline([pt(-1.9, 0.48), pt(-2.7, 1.0), pt(-3.25, 0.6), pt(-3.4, -0.1), pt(-3.7, -0.7), pt(-3.6, -1.15)], 10));
  return parts;
}

export const EYE = { k1: pt(2.95, 2.0), k3: pt(3.02, 1.98), r: 0.08 };

// ------------------------------------------------------------------ PCB autorouter
/**
 * Route a polyline octilinearly (0/45/90°) on a grid: resample every `step`, snap to `grid`,
 * then connect consecutive points with a diagonal run followed by a straight run.
 * Collinear runs are merged. Closed inputs stay closed.
 */
export function octilinear(ps: P[], step: number, grid: number, closed: boolean): P[] {
  const L = lengths(ps);
  const tot = L[L.length - 1]!;
  const n = Math.max(closed ? 4 : 2, Math.round(tot / step) + 1);
  const snap = (v: number) => Math.round(v / grid) * grid;
  const q: P[] = [];
  for (let i = 0; i < n; i++) {
    const p = at(ps, L, (tot * i) / (n - 1));
    const s = { x: snap(p.x), y: snap(p.y) };
    const last = q[q.length - 1];
    if (!last || last.x !== s.x || last.y !== s.y) q.push(s);
  }
  if (closed && q.length > 1) { const a = q[0]!, b = q[q.length - 1]!; if (a.x !== b.x || a.y !== b.y) q.push({ ...a }); }
  const out: P[] = [q[0]!];
  for (let i = 1; i < q.length; i++) {
    const a = q[i - 1]!, b = q[i]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const m = Math.min(Math.abs(dx), Math.abs(dy));
    // alternate the order (diagonal first / straight first) so outlines don't staircase
    const diagFirst = i % 2 === 0;
    const mid = diagFirst
      ? { x: a.x + Math.sign(dx) * m, y: a.y + Math.sign(dy) * m }
      : { x: b.x - Math.sign(dx) * m, y: b.y - Math.sign(dy) * m };
    if ((mid.x !== a.x || mid.y !== a.y) && (mid.x !== b.x || mid.y !== b.y)) out.push(mid);
    out.push(b);
  }
  // merge collinear
  const merged: P[] = [out[0]!];
  for (let i = 1; i < out.length - 1; i++) {
    const a = merged[merged.length - 1]!, b = out[i]!, c = out[i + 1]!;
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) > 1e-9) merged.push(b);
  }
  merged.push(out[out.length - 1]!);
  return merged;
}

/** Offset a polyline sideways by d (miter joins, clamped). */
export function offset(ps: P[], d: number, closed: boolean): P[] {
  const n = ps.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    let a = ps[i - 1], b = ps[i + 1];
    if (closed) { if (i === 0) a = ps[n - 2]; if (i === n - 1) b = ps[1]; }
    const p = ps[i]!;
    const n1 = a ? norm(a, p) : null, n2 = b ? norm(p, b) : null;
    let nx = 0, ny = 0;
    if (n1 && n2) { nx = n1.x + n2.x; ny = n1.y + n2.y; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; const c = nx * n1.x + ny * n1.y; const m = 1 / Math.max(0.5, c); nx *= m; ny *= m; }
    else { const k = (n1 ?? n2)!; nx = k.x; ny = k.y; }
    out.push({ x: p.x + nx * d, y: p.y + ny * d });
  }
  return out;
}
function norm(a: P, b: P) { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return { x: -dy / l, y: dx / l }; }

export function centroid(ps: P[]): P {
  let x = 0, y = 0;
  for (const p of ps) { x += p.x; y += p.y; }
  return { x: x / ps.length, y: y / ps.length };
}
