// FIG. 6 / movements 2–3: the chart that becomes a banknote, and the Omega convergence.
// World space: px at zoom 1, y UP. One decade of price = DEC px. The moon sits at 10^30.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { mulberry32 } from '../engine/util';

export const DEC = 170;
export const MOON = { x: 0, y: 31 * DEC, r: 180 };
export const NOTE = { x: -380, y: 31 * DEC, w: 1790, h: 930 };

export interface Candle { x: number; o: number; c: number; hi: number; lo: number }

/** Deterministic price history in decades (log10 $): flat, then a hockey stick. */
export function makeCandles(): Candle[] {
  const rnd = mulberry32(61);
  const out: Candle[] = [];
  let prev = 1.2;
  const N = 78;
  for (let i = 0; i < N; i++) {
    const k = Math.max(0, (i - 40) / (N - 1 - 40));
    const trend = 1.2 + 0.07 * Math.sin(i * 0.45) + 0.04 * Math.sin(i * 1.7) + 2.9 * Math.pow(k, 2.4);
    const c = trend + (rnd() - 0.5) * (0.14 + 0.1 * k);
    const o = prev;
    const hi = Math.max(o, c) + rnd() * 0.09;
    const lo = Math.min(o, c) - rnd() * 0.09;
    out.push({ x: (i - N) * 21, o, c, hi, lo });
    prev = c;
  }
  return out;
}

const COMMON = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uCam;
uniform float uZoom;
vec2 worldAt(vec2 fc) { return uCam + (fc - 0.5 * uRes) / uZoom; }
`;

/** Paper, security guilloché, the engraved moon and the note's frame. */
export const NOTE_FRAG = /* glsl */ `
${COMMON}
uniform float uT, uImpact, uNoteA, uGridFade;
uniform vec3 uMoon;   // x, y, r
uniform vec4 uNote;   // cx, cy, w, h

float lineAA(float d, float w) { float aa = 0.75 / uZoom; return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(d)); }

// guilloché curve family around a centre: returns ink coverage of K curves r = R + a*sin(n*th + ph_k)
float rosette(vec2 m, float R, float a, float n, float K, float w, float twist) {
  float r = length(m), th = atan(m.y, m.x);
  float ink = 0.0;
  for (int k = 0; k < 16; k++) {
    if (float(k) >= K) break;
    float ph = float(k) * TAU / K + twist;
    float s = sin(n * th + ph + 3.0 * sin(th * 2.0 + float(k) * 0.3) * 0.0);
    float rk = R + a * s;
    float slope = a * n * cos(n * th + ph) / max(r, 1.0);
    float d = (r - rk) / sqrt(1.0 + slope * slope);
    ink = max(ink, lineAA(d, w));
  }
  return ink;
}

float craterH(vec2 m) {
  float h = 0.0;
  for (int k = 0; k < 11; k++) {
    float fk = float(k);
    vec2 c = vec2(hash11(fk * 7.13 + 1.0), hash11(fk * 3.71 + 2.0)) * 1.6 - 0.8;
    float rk = mix(0.06, 0.26, pow(hash11(fk * 5.3 + 3.0), 2.0));
    float d = length(m - c) / rk;
    // bowl with a raised rim
    h += (-0.55 * (1.0 - smoothstep(0.0, 1.0, d)) + 0.25 * exp(-pow((d - 1.0) / 0.22, 2.0))) * rk;
  }
  // maria: broad dark smooth plains
  return h;
}
float mariaMask(vec2 m) {
  return smoothstep(0.1, 0.5, snoise(m * 1.6 + 4.0) * 0.5 + 0.5 - length(m - vec2(-0.2, 0.25)) * 0.35);
}

void main() {
  vec2 w = worldAt(FRAG_PX);
  float px = 1.0 / uZoom;
  // ---- paper
  float fib = snoise(w * vec2(0.004, 0.03)) * 0.5 + snoise(w * 0.02) * 0.5;
  vec3 paper = C_BONE * (0.94 + 0.025 * fib);
  float ink = 0.0;
  // security guilloché: two interlaced sine families, very fine and faint
  float g1 = hatch((w.y + 22.0 * sin(w.x * 0.011) + 7.0 * sin(w.x * 0.037 + 1.3)) / 11.0, 0.07);
  float g2 = hatch((w.y - 22.0 * sin(w.x * 0.011 + 1.9) - 7.0 * sin(w.x * 0.029)) / 11.0, 0.07);
  ink += (g1 + g2) * 0.09;

  // ---- note region: frame, inner guilloché field
  vec2 nq = w - uNote.xy;
  vec2 hs = uNote.zw * 0.5;
  float dBox = sdBox(nq, hs - 40.0) - 40.0;
  float inNote = 1.0 - smoothstep(-px, px, dBox);
  float frame = lineAA(dBox, 2.2) + lineAA(dBox + 16.0, 1.1) + lineAA(dBox + 62.0, 1.1) + lineAA(dBox + 70.0, 2.0);
  // woven band between the rules
  float band = step(-62.0, dBox) * step(dBox, -16.0);
  float along = (abs(nq.x) / hs.x > abs(nq.y) / hs.y) ? nq.y : nq.x;
  float bw = (dBox + 39.0);
  float weave = max(lineAA(bw - 14.0 * sin(along * 0.07), 1.0), lineAA(bw + 14.0 * sin(along * 0.07), 1.0));
  weave = max(weave, max(lineAA(bw - 9.0 * sin(along * 0.14 + 1.0), 0.8), lineAA(bw + 9.0 * sin(along * 0.14 + 1.0), 0.8)));
  ink += (frame + band * weave) * uNoteA;
  // tinted lathe-work field inside the note (fine concentric waves around the moon)
  vec2 mq = w - uMoon.xy;
  float rr = length(mq);
  float field = hatch((rr + 10.0 * sin(atan(mq.y, mq.x) * 12.0)) / 9.0, 0.06) * inNote * smoothstep(-62.0, -120.0, dBox);
  ink += field * 0.16 * uNoteA;

  // ---- the moon's rosettes (portrait oval)
  float R = uMoon.z;
  vec2 m = mq / R;
  float mr = length(m);
  float ripple = uImpact * sin(mr * 18.0 - uT * 40.0) * exp(-abs(mr - 1.4) * 2.0) * 0.03;
  if (mr > 1.02 && mr < 1.9) {
    float ro = rosette(mq, R * 1.24, R * 0.07, 36.0, 10.0, 1.1, ripple * 10.0);
    ro = max(ro, rosette(mq, R * 1.5, R * 0.13, 18.0, 12.0, 1.1, 0.4 + ripple * 10.0));
    ro = max(ro, rosette(mq, R * 1.5, R * 0.13, -18.0, 6.0, 0.9, 0.2));
    ink += ro * 0.85 * uNoteA * smoothstep(1.02, 1.06, mr) * smoothstep(1.9, 1.75, mr);
    ink += lineAA(rr - R * 1.08, 1.6) * uNoteA + lineAA(rr - R * 1.72, 1.2) * uNoteA;
  }
  // ---- the moon: line-relief engraving (lines displaced by height, width by shade)
  vec3 col = paper;
  if (mr < 1.0) {
    float z = sqrt(1.0 - mr * mr);
    float hc = craterH(m) * z;
    float H = z * 0.55 + hc;
    vec2 e = vec2(0.004, 0.0);
    float hx = (sqrt(max(0.0, 1.0 - dot(m + e.xy, m + e.xy))) * 0.55 + craterH(m + e.xy) * z) - H;
    float hy = (sqrt(max(0.0, 1.0 - dot(m + e.yx, m + e.yx))) * 0.55 + craterH(m + e.yx) * z) - H;
    vec3 n = normalize(vec3(-hx / 0.004, -hy / 0.004, 1.0));
    vec3 L = normalize(vec3(-0.55, 0.45, 0.6));
    float lam = sat(dot(n, L));
    float dark = 1.0 - lam;
    dark = mix(dark, dark + 0.18, mariaMask(m));
    // relief lines: horizontal lines lifted by height
    float u = (m.y * R - H * R * 0.28) / 6.5;
    float relief = hatch(u, sat(dark * 1.05 + 0.04));
    // cross hatch in the deepest shade
    float cross = hatch((m.x * R + m.y * R * 0.5) / 5.0, sat(dark * 1.6 - 1.0));
    ink = max(ink * 0.3, max(relief, cross));
    ink = max(ink, lineAA(rr - R, 1.8));
    // impact glow at the south limb
    col = paper;
  }
  col = mix(col, C_INK * 1.3, sat(ink));
  // impact: the spark lands on the moon's south limb
  vec2 ip = w - (uMoon.xy - vec2(0.0, R));
  float glow = exp(-length(ip) / 70.0) * uImpact;
  col += C_SIGNAL * glow * 1.2 + C_EMBER * pow(glow, 2.0) * 3.0;
  fragColor = vec4(col, 1.0);
}`;

/**
 * Composite of the note RT: directional motion blur (camera tilt), and the Omega warp:
 * everything is pulled into one point, inverted to bone-on-ink, with radial streaks.
 */
export const COMP_FRAG = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform vec2 uVel;      // blur vector in px
uniform vec2 uP;        // convergence point (px, y up)
uniform float uWarp, uSwirl, uDark, uStreak, uCore, uT, uCollapse;
vec3 samp(vec2 fc) {
  vec2 uv = fc / uRes;
  vec3 paper = C_BONE * 0.94;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return paper;
  // feather the frame edge so rotated/warped samples never reveal clamped rows
  float e = smoothstep(0.0, 0.02, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  return mix(paper, texture(uSrc, uv).rgb, e);
}
vec2 warpSrc(vec2 fc) {
  vec2 r = fc - uP;
  float d = length(r);
  // pull: what lies at d*g now appears at d
  float g = exp(uWarp * (0.6 + 0.4 * smoothstep(0.0, 900.0, d)));
  float a = uSwirl / (d / 260.0 + 0.35);
  vec2 rs = rot2(a) * r * g;
  return uP + rs;
}
void main() {
  vec2 fc = FRAG_PX;
  vec3 acc = vec3(0.0);
  const int N = 14;
  float tw = 0.0;
  for (int i = 0; i < N; i++) {
    float k = float(i) / float(N - 1) - 0.5;
    vec2 q = fc + uVel * k;
    vec2 s = warpSrc(q);
    // radial streak toward the point
    vec2 rd = s - uP;
    s = uP + rd * (1.0 + uStreak * k * 0.6);
    float wgt = 1.0 - abs(k) * 0.6;
    acc += samp(s) * wgt; tw += wgt;
  }
  vec3 c = acc / tw;
  // invert to bone-on-ink (orange stays orange)
  float lb = luma(C_BONE);
  float inkCov = sat(1.0 - luma(c) / lb);
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float far = exp(-uWarp * 0.25 * length(fc - uP) / 400.0);
  vec3 inv = C_INK + C_BONE * 0.95 * pow(inkCov, 1.4) * far;
  inv = mix(inv, c * 1.6, smoothstep(0.1, 0.3, chroma));
  c = mix(c, inv, uDark);
  // collapse: fade everything except near the point
  float d = length(fc - uP);
  c *= mix(1.0, smoothstep(0.0, 1.0, 1.0 - d / (1400.0 * (1.0 - uCollapse) + 1.0)), step(0.001, uCollapse));
  // the white-hot point: a tiny core, a tight ember halo
  c += vec3(1.0, 0.92, 0.85) * exp(-d / 4.0) * 40.0 * uCore + C_EMBER * exp(-d / 22.0) * 2.5 * uCore + C_SIGNAL * exp(-d / 90.0) * 0.25 * uCore;
  fragColor = vec4(c, 1.0);
}`;

export function makeNotePass() {
  return new FSPass(NOTE_FRAG, {
    uRes: { value: new THREE.Vector2(1920, 1080) }, uCam: { value: new THREE.Vector2() }, uZoom: { value: 1 },
    uT: { value: 0 }, uImpact: { value: 0 }, uNoteA: { value: 1 }, uGridFade: { value: 1 },
    uMoon: { value: new THREE.Vector3(MOON.x, MOON.y, MOON.r) },
    uNote: { value: new THREE.Vector4(NOTE.x, NOTE.y, NOTE.w, NOTE.h) },
  });
}

export function makeCompPass() {
  return new FSPass(COMP_FRAG, {
    uSrc: { value: null }, uRes: { value: new THREE.Vector2(1920, 1080) }, uVel: { value: new THREE.Vector2() },
    uP: { value: new THREE.Vector2(960, 540) }, uWarp: { value: 0 }, uSwirl: { value: 0 }, uDark: { value: 0 },
    uStreak: { value: 0 }, uCore: { value: 0 }, uT: { value: 0 }, uCollapse: { value: 0 },
  });
}
