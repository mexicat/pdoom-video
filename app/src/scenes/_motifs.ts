// Shared motifs used by several plates so they look identical everywhere:
//  - the SPARK: orange point with white-hot core, glow, and sputtering particles
//  - the MASK: the bland "assistant smile" (bone disc, two dots, one curve)
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { hash, TAU } from '../engine/util';

type P2 = { x: number; y: number };

/**
 * Sputtering particles for a spark whose head position over time is `headAt(t)`.
 * Deterministic: particles are born at fixed times (rate per second) with hashed velocities.
 * Draws into a 2D LineBatch as short streaks (motion-blurred), additive.
 */
export function sparkParticles(lb: LineBatch, t: number, headAt: (t: number) => P2 | null, o: { rate?: number; life?: number; speed?: number; gravity?: number; intensity?: number; seed?: number; width?: number } = {}) {
  const rate = o.rate ?? 90, life = o.life ?? 0.45, speed = o.speed ?? 260, g = o.gravity ?? 520, I = o.intensity ?? 1, seed = o.seed ?? 1;
  const n0 = Math.floor((t - life) * rate), n1 = Math.floor(t * rate);
  for (let n = n0; n <= n1; n++) {
    const tb = n / rate;
    if (tb > t) continue;
    const age = t - tb;
    const h = headAt(tb);
    if (!h) continue;
    const a = hash(n, seed) * TAU, sp = speed * (0.25 + hash(n, seed + 1) ** 2 * 1.2);
    const lf = life * (0.35 + 0.65 * hash(n, seed + 2));
    if (age > lf) continue;
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - speed * 0.3;
    const x = h.x + vx * age, y = h.y + vy * age + 0.5 * g * age * age;
    const dtb = 0.018; // streak length in time
    const x0 = h.x + vx * Math.max(0, age - dtb), y0 = h.y + vy * Math.max(0, age - dtb) + 0.5 * g * Math.max(0, age - dtb) ** 2;
    const k = 1 - age / lf;
    const heat = k * k;
    const col: [number, number, number] = [
      (LIN.signal[0] + (1 - LIN.signal[0]) * heat) * 2.2 * I,
      (LIN.signal[1] + (0.8 - LIN.signal[1]) * heat) * 2.2 * I,
      (LIN.signal[2] + (0.5 - LIN.signal[2]) * heat) * 2.2 * I,
    ];
    lb.seg2(x0, y0, x, y, (o.width ?? 1.6) * (0.5 + k * 0.7), col, Math.min(1, k * 1.4));
  }
}

/** The spark head: a white-hot core and an orange halo (draw after the line it drags). 2D LineBatch. */
export function sparkHead(lb: LineBatch, x: number, y: number, t: number, scale = 1, intensity = 1) {
  const flick = 0.85 + 0.15 * Math.sin(t * 91.7) * Math.sin(t * 57.3);
  const I = intensity * flick;
  // halo: a few concentric short segments (dots) with decreasing intensity
  lb.seg2(x, y, x + 0.01, y, 26 * scale, [LIN.signal[0] * 0.5 * I, LIN.signal[1] * 0.5 * I, LIN.signal[2] * 0.5 * I], 0.35);
  lb.seg2(x, y, x + 0.01, y, 12 * scale, [LIN.ember[0] * 2.5 * I, LIN.ember[1] * 2.5 * I, LIN.ember[2] * 2.5 * I], 0.8);
  lb.seg2(x, y, x + 0.01, y, 5 * scale, [6 * I, 5 * I, 4 * I], 1);
  // four tiny rays
  for (let i = 0; i < 4; i++) {
    const a = i * (TAU / 4) + t * 3 + 0.4;
    const r = (9 + 5 * hash(Math.floor(t * 30), i)) * scale;
    lb.seg2(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, 1.2 * scale, [3 * I, 1.2 * I, 0.4 * I], 0.8);
  }
}

/** Canvas2D version of the spark head (for scenes drawing in 2D layers). Use with additive-ish bloom. */
export function sparkHead2D(c: CanvasRenderingContext2D, x: number, y: number, t: number, scale = 1) {
  const g = c.createRadialGradient(x, y, 0, x, y, 22 * scale);
  g.addColorStop(0, 'rgba(255,250,240,1)');
  g.addColorStop(0.18, 'rgba(255,170,90,0.95)');
  g.addColorStop(0.45, rgba('signal', 0.45));
  g.addColorStop(1, rgba('signal', 0));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, 22 * scale, 0, TAU); c.fill();
}

// ---------------------------------------------------------------- the mask
/**
 * Canonical mask geometry in units of the disc radius R (centre at 0,0, y down):
 * disc radius 1; eyes: dots at (±0.30, -0.16) radius 0.075;
 * smile: arc centred (0, -0.08) radius 0.50 from 25° to 155° (y-down angles), stroke 0.06.
 */
export const MASK = { eyeX: 0.30, eyeY: -0.16, eyeR: 0.075, smileCY: -0.08, smileR: 0.5, smileA0: (25 * Math.PI) / 180, smileA1: (155 * Math.PI) / 180, smileW: 0.06 };

/** Draw the mask on Canvas2D at (x,y) with radius R and rotation `rot`. */
export function drawMask2D(c: CanvasRenderingContext2D, x: number, y: number, R: number, rot = 0, o: { face?: string; ink?: string; alpha?: number } = {}) {
  c.save();
  c.translate(x, y); c.rotate(rot);
  c.globalAlpha *= o.alpha ?? 1;
  c.fillStyle = o.face ?? rgba('bone');
  c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  c.fillStyle = o.ink ?? rgba('ink');
  for (const s of [-1, 1]) { c.beginPath(); c.arc(s * MASK.eyeX * R, MASK.eyeY * R, MASK.eyeR * R, 0, TAU); c.fill(); }
  c.strokeStyle = o.ink ?? rgba('ink');
  c.lineWidth = MASK.smileW * R; c.lineCap = 'round';
  c.beginPath(); c.arc(0, MASK.smileCY * R, MASK.smileR * R, MASK.smileA0, MASK.smileA1); c.stroke();
  c.restore();
}

/** GLSL: signed distance to the mask's ink features (eyes + smile) in mask units (p / R, y DOWN). */
export const GLSL_MASK = /* glsl */ `
float sdMaskInk(vec2 p) {
  float e = min(length(p - vec2(-${MASK.eyeX}, ${MASK.eyeY})), length(p - vec2(${MASK.eyeX}, ${MASK.eyeY}))) - ${MASK.eyeR};
  vec2 q = p - vec2(0.0, ${MASK.smileCY});
  float a = atan(q.y, q.x);
  float a0 = ${MASK.smileA0.toFixed(5)}, a1 = ${MASK.smileA1.toFixed(5)};
  float s;
  if (a > a0 && a < a1) s = abs(length(q) - ${MASK.smileR}) - ${(MASK.smileW / 2).toFixed(4)};
  else {
    vec2 c0 = vec2(cos(a0), sin(a0)) * ${MASK.smileR}, c1 = vec2(cos(a1), sin(a1)) * ${MASK.smileR};
    s = min(length(q - c0), length(q - c1)) - ${(MASK.smileW / 2).toFixed(4)};
  }
  return min(e, s);
}`;
