// Small math / animation helpers shared by every scene. Everything must be a
// pure function of time (or seeded), so frames render identically on export.

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => (a === b ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number, clampIt = true) => {
  const t = invLerp(a, b, x);
  return lerp(c, d, clampIt ? clamp(t) : t);
};
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const fract = (x: number) => x - Math.floor(x);
export const mod = (x: number, m: number) => ((x % m) + m) % m;
export const TAU = Math.PI * 2;

/** Window: 0 before a, ramps up over `fadeIn`, holds, ramps down over `fadeOut` ending at b. */
export const window01 = (x: number, a: number, b: number, fadeIn = 0.2, fadeOut = 0.2) =>
  Math.min(smoothstep(a, a + fadeIn, x), 1 - smoothstep(b - fadeOut, b, x));

// ---- easing (t in 0..1) ----
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t: number) => t * t * t * t,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t: number, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outElastic: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

/** Clamped eased progress of x through [a, b]. */
export const prog = (x: number, a: number, b: number, fn: (t: number) => number = ease.linear) =>
  fn(clamp((x - a) / (b - a)));

/** Damped spring response to a step at time 0 (value goes 0 -> 1 with overshoot). */
export const springStep = (t: number, freq = 4, damping = 0.35) => {
  if (t <= 0) return 0;
  const w = TAU * freq;
  return 1 - Math.exp(-damping * w * t) * Math.cos(w * Math.sqrt(1 - damping * damping) * t);
};

/** Exponential decay pulse after an event at time `t0` (1 at t0, fades with half-life `hl`). */
export const pulse = (t: number, t0: number, hl = 0.12) => (t < t0 ? 0 : Math.pow(0.5, (t - t0) / hl));

// ---- deterministic randomness ----
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Stateless hash of integers/floats to [0,1). */
export function hash(...xs: number[]) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    h ^= Math.floor(x * 1000003) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

// ---- value noise (1D/2D/3D), cheap & deterministic, for CPU-side motion ----
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  return lerp(hash(i, seed) * 2 - 1, hash(i + 1, seed) * 2 - 1, fade(f));
}
export function noise2(x: number, y: number, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy) * 2 - 1;
}
export function noise3(x: number, y: number, z: number, seed = 0) {
  const iz = Math.floor(z);
  const fz = fade(z - iz);
  return lerp(noise2(x + iz * 17.13, y - iz * 31.7, seed), noise2(x + (iz + 1) * 17.13, y - (iz + 1) * 31.7, seed), fz);
}
export function fbm1(x: number, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise1(x * f, seed + i * 7); f *= 2; a *= 0.5; }
  return s;
}
export function fbm2(x: number, y: number, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f, seed + i * 7); f *= 2; a *= 0.5; }
  return s;
}

// ---- keyframes ----
export type Key = [time: number, value: number, easeFn?: (t: number) => number];
/** Piecewise interpolation through keyframes; the ease on key i shapes the segment ending at key i. */
export function keys(t: number, ks: Key[]): number {
  if (ks.length === 0) return 0;
  if (t <= ks[0]![0]) return ks[0]![1];
  for (let i = 1; i < ks.length; i++) {
    const k = ks[i]!;
    if (t <= k[0]) {
      const p = ks[i - 1]!;
      const u = (t - p[0]) / (k[0] - p[0]);
      return lerp(p[1], k[1], (k[2] ?? ease.inOutCubic)(u));
    }
  }
  return ks[ks.length - 1]![1];
}

export const vec2 = (x = 0, y = 0) => ({ x, y });
export type V2 = { x: number; y: number };
export const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Polyline helpers: cumulative arc lengths & point-at-length (used for text on paths, reveals). */
export function polylineLengths(pts: V2[]) {
  const L = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) L[i] = L[i - 1]! + dist(pts[i - 1]!, pts[i]!);
  return L;
}
export function pointAtLength(pts: V2[], L: Float32Array, s: number): { x: number; y: number; angle: number } {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0, angle: 0 };
  if (n === 1) return { x: pts[0]!.x, y: pts[0]!.y, angle: 0 };
  s = clamp(s, 0, L[n - 1]!);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid]! < s) lo = mid; else hi = mid; }
  const a = pts[lo]!, b = pts[hi]!;
  const seg = L[hi]! - L[lo]!;
  const u = seg > 0 ? (s - L[lo]!) / seg : 0;
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Linear-space color from hex (for GL uniforms; applies sRGB->linear). */
export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return c as [number, number, number];
}
