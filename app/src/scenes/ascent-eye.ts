// FIG. 6 / movement 1: the basilisk's eye. An engraved (white-line, scratchboard) serpent
// eye: imbricate scales around the orbit, sliding eyelids, an ember iris of radial fibres
// and a vertical slit pupil. Eye space: x right, y UP, eye half-width = 1.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';

export const EYE = { A: 1.0, HU: 0.6, HL: 0.5, RI: 0.56, TILT: 0.06 };

export const EYE_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform float uT, uOpen, uZoom, uRot, uPupil, uShockR, uShockA, uLeak, uLightA, uBright, uSlitGlow, uSlitW;
uniform vec2 uCam;

const float A = ${EYE.A.toFixed(3)};
const float HU = ${EYE.HU.toFixed(3)};
const float HL = ${EYE.HL.toFixed(3)};
const float RI = ${EYE.RI.toFixed(3)};
const float TILT = ${EYE.TILT.toFixed(3)};

float orbitK(float x) { return pow(sat(1.0 - (x * x) / (A * A)), 0.62); }
float orbitU(float x) { return HU * orbitK(x) + TILT * x; }
float orbitL(float x) { return -HL * orbitK(x) + TILT * x; }

// nearest hex centre: xy = offset from centre, zw = cell id
vec4 hexGrid(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}

vec3 LDIR() { return normalize(vec3(cos(uLightA), sin(uLightA), 0.38)); }

// Macro form of the head (brow ridge, cheek) as a height field -> normal.
float headH(vec2 q) {
  float brow = 0.35 * exp(-pow((q.y - 0.8) / 0.45, 2.0)) * exp(-pow(q.x / 1.6, 2.0));
  float cheek = 0.25 * exp(-pow((q.y + 0.95) / 0.5, 2.0)) * exp(-pow((q.x + 0.2) / 1.4, 2.0));
  float dome = -0.08 * dot(q, q);
  float ball = 0.3 * sqrt(sat(1.0 - (q.x * q.x) / (A * A) - (q.y * q.y) / (0.62 * 0.62)));
  return brow + cheek + dome + ball;
}
vec3 headN(vec2 q) {
  vec2 e = vec2(0.01, 0.0);
  float hx = headH(q + e.xy) - headH(q - e.xy), hy = headH(q + e.yx) - headH(q - e.yx);
  return normalize(vec3(-hx / 0.02, -hy / 0.02, 1.0));
}

// Voronoi cells: xy = offset from the cell centre, z = distance to the cell edge, w = cell hash
vec4 voro(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0); float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.15 + 0.7 * hash22(n + g);
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = 0.15 + 0.7 * hash22(n + g);
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec4(-mr, md, hash12(n + mg));
}
vec4 hexCell(vec2 g) {
  vec4 hc = hexGrid(g);
  vec2 a = abs(hc.xy);
  float ed = 0.5 - max(a.x, a.x * 0.5 + a.y * 0.8660254);
  return vec4(hc.xy, ed, hash12(hc.zw));
}

// One engraved scale from a cell (offset h from its centre, edge distance ed, hash rnd).
// Lines run parallel to the scale's outline (contour engraving), thick where lit.
// T/R: screen directions of the cell space axes; macro: the head's normal.
float scaleShade(vec4 cell, vec2 T, vec2 R, vec3 macro, float lines, float roundness, vec2 wq) {
  vec2 h = cell.xy; float ed = cell.z; float rnd = cell.w;
  float rr = length(h) / 0.62;
  float dome = min(smoothstep(0.0, roundness, ed), sqrt(sat(1.0 - rr * rr)) * 0.6 + 0.4);
  vec2 dirOut = normalize(h + 1e-4);
  float slope = (1.0 - smoothstep(0.0, roundness, ed)) * 1.8 + rr * 0.9 + 0.1;
  vec2 ns = (T * dirOut.x + R * dirOut.y) * slope;
  vec3 n = normalize(normalize(vec3(ns, 1.0)) + macro * 0.8);
  float lam = sat(dot(n, LDIR()));
  // imbrication: the side toward the eye (-R) tucks under the previous row
  float tuck = sat(-dot(h, vec2(0.0, 1.0)) * 1.4) * 0.6;
  float light = smoothstep(0.3, 0.95, lam) * (0.6 + 0.6 * rnd) * (1.0 - tuck);
  // cross-contour engraving: one global direction, bent by each scale's dome
  float u = dot(wq, vec2(0.62, 0.78)) * lines + dome * 0.9 + rnd * 0.3;
  float c = hatch(u, sat(light * 0.9));
  // a sharp lit lip on the outline facing the light
  float lip = smoothstep(0.035, 0.012, ed) * smoothstep(0.0, 0.01, ed) * sat(dot(T * dirOut.x + R * dirOut.y, LDIR().xy) * 1.5) ;
  c = max(c, lip * light * 1.4);
  c *= smoothstep(0.0, 0.012, ed);
  return c;
}

void main() {
  vec2 p = (FRAG_PX - 0.5 * uRes) / (0.5 * uRes.y);
  float px = 1.0 / (0.5 * uRes.y * uZoom);
  vec2 q = rot2(-uRot) * (p / uZoom) + uCam;
  // shockwave: radial push around the eye centre
  float rr = length(q);
  float sw = exp(-pow((rr - uShockR) / 0.09, 2.0)) * uShockA;
  q += normalize(q + 1e-5) * sw * 0.07;
  float x = q.x, y = q.y;

  float oU = orbitU(x), oL = orbitL(x);
  bool inOrbit = abs(x) < A && y > oL && y < oU;
  float seam = TILT * x;
  float eU = mix(seam, oU, uOpen), eL = mix(seam, oL, uOpen);

  vec3 col = C_INK;
  vec3 macro = headN(q);
  float headLight = sat(dot(macro, LDIR())) ;

  if (inOrbit && y < eU && y > eL) {
    // ---------------- eyeball ----------------
    vec2 ic = q - vec2(0.0, 0.02 + 0.5 * TILT * 0.0);
    float ri = length(ic);
    float ai = atan(ic.y, ic.x);
    float n1 = snoise(vec2(ai * 5.0, ri * 7.0));
    float n2 = snoise(vec2(ai * 17.0, ri * 23.0));
    // brightness profile: hot collarette, glowing mid, dark limbus
    float coll = exp(-pow((ri - RI * 0.36) / (RI * 0.09), 2.0));
    float mid = smoothstep(RI, RI * 0.7, ri) * smoothstep(RI * 0.12, RI * 0.4, ri);
    float prof = 0.35 * mid + 0.65 * coll + 0.12 * n2;
    // radial fibres (engraved lines), width follows the profile
    float fu = ai * 150.0 / TAU + n1 * 0.9 + 0.6 * sin(ri * 30.0 + ai * 3.0);
    float fib = hatch(fu, sat(0.15 + 0.9 * prof));
    float fib2 = hatch(ai * 75.0 / TAU - n1 * 0.5 + ri * 4.0, sat(prof * 0.6));
    float lines = max(fib, fib2 * 0.7);
    // contraction furrows
    float furrow = hatch(ri * 34.0 + n1 * 0.6, 0.12) * smoothstep(RI * 0.45, RI * 0.9, ri);
    lines *= 1.0 - furrow;
    vec3 irisCol = C_BLOOD * 0.08 + mix(C_BLOOD * 0.9, C_SIGNAL * 1.15, sat(prof * 1.3)) * lines;
    irisCol += C_EMBER * 1.3 * pow(sat(coll), 2.0) * lines * uBright;
    // dark limbal ring
    irisCol *= smoothstep(RI, RI * 0.9, ri) * 0.85 + 0.15;
    // pupil: vertical vesica
    float pw = max(uPupil, 1e-4), ph = RI * 0.97;
    float Rp = (pw * pw + ph * ph) / (2.0 * pw);
    float dp = max(length(ic - vec2(Rp - pw, 0.0)), length(ic + vec2(Rp - pw, 0.0))) - Rp;
    float pupil = 1.0 - smoothstep(-px, px, dp);
    vec3 c = irisCol;
    // sclera (reptile: dark, finely hatched)
    float scl = hatch((q.y - 0.3 * q.x) * 110.0, 0.1 + 0.15 * headLight);
    c = mix(c, C_INK2 * 0.5 + C_ASH * 0.18 * scl, smoothstep(RI - px, RI + px, ri));
    c = mix(c, C_INK * 0.1, pupil);
    // the slit becomes a white-hot line before the match cut
    float slitD = abs(ic.x);
    float slit = exp(-slitD / max(uSlitW, px)) * smoothstep(ph, ph * 0.6, abs(ic.y));
    c += (C_EMBER * 2.5 + vec3(1.2, 0.9, 0.7) * 2.0 * slit) * slit * uSlitGlow;
    // lid shadows on the ball
    float shU = smoothstep(0.0, 0.25, eU - y), shL = smoothstep(0.0, 0.08, y - eL);
    c *= mix(0.08, 1.0, shU) * mix(0.35, 1.0, shL);
    // wet specular: a small window with a mullion
    vec2 sp = rot2(0.25) * (q - vec2(-0.2, 0.26));
    float win = sdBox(sp, vec2(0.05, 0.028)) - 0.006;
    float mull = min(abs(sp.x), abs(sp.y)) - 0.004;
    float spec = (1.0 - smoothstep(-px, px, win)) * smoothstep(-px, px, mull);
    vec2 sp2 = q - vec2(0.27, -0.24);
    spec += 0.6 * (1.0 - smoothstep(-px, px, length(sp2) - 0.012));
    c += C_BONE * spec * 1.05 * shU * uBright;
    col = c;
  } else {
    // ---------------- skin ----------------
    float cov = 0.0;
    if (inOrbit) {
      // eyelid band: fine granular scales in rows parallel to the lid edge
      bool upper = y >= eU;
      float s = upper ? (y - eU) : (eL - y);
      float band = upper ? (oU - eU) : (eL - oL);
      vec2 g = vec2(x / 0.075, s / 0.06 + (upper ? 0.0 : 17.0));
      vec2 T = vec2(1.0, 0.0), R = vec2(0.0, upper ? 1.0 : -1.0);
      vec4 cell = voro(g);
      cell.xy *= vec2(1.0, upper ? 1.0 : -1.0);
      cov = scaleShade(cell, T, R, macro, 115.0, 0.35, q);
      // rolled lid margin
      float rim = smoothstep(0.05, 0.015, s) * smoothstep(0.0, 0.008, s);
      float rimL = hatch(x * 70.0, 0.35 + 0.4 * headLight);
      cov = mix(cov, rimL * 0.8, rim);
      cov *= smoothstep(0.0, 0.004 + px, s);
      // folding under the orbit rim
      cov *= smoothstep(0.0, 0.06, band - s);
      cov *= 0.55 + 0.6 * headLight;
    } else {
      // distance to the orbit rim (approx)
      float dRim = abs(x) < A ? min(abs(y - oU), abs(y - oL)) : length(vec2(abs(x) - A, y - TILT * x));
      vec2 e = q / vec2(A, 0.55);
      float r = length(e);
      vec2 Rr = normalize(q / vec2(A * A, 0.3) + 1e-5);
      vec2 Tt = vec2(-Rr.y, Rr.x);
      if (dRim < 0.1) {
        // periocular ring: one row of small scales hugging the orbit
        float th = atan(e.y, e.x);
        vec2 g = vec2(th / TAU * 56.0, (dRim / 0.1 * 0.95 + 0.5) / 0.8660254);
        cov = scaleShade(hexCell(g), Tt, Rr, macro, 115.0, 0.35, q);
      } else {
        // head scales: a warped hex lattice, growing away from the eye
        // irregular head scales (Voronoi), larger away from the eye
        float grow = 1.0 / (1.0 + 0.3 * max(r - 1.0, 0.0));
        vec2 g = q * 6.0 * grow;
        cov = scaleShade(voro(g), vec2(1.0, 0.0), vec2(0.0, 1.0), macro, 80.0, 0.45, q);
      }
      // crease just outside the orbit
      cov *= smoothstep(0.0, 0.02, dRim);
      cov *= smoothstep(2.6, 0.9, r);
      cov *= 0.2 + 1.0 * pow(headLight, 1.5);
    }
    col = mix(C_INK, C_BONE * 0.72 * uBright, cov);
    // the basilisk's light leaking through the closed seam
    float dSeam = inOrbit ? min(abs(y - eU), abs(y - eL)) : 1.0;
    float leak = exp(-dSeam / 0.006) * uLeak;
    col += C_SIGNAL * leak * 1.5 + C_EMBER * leak * leak * 1.5;
    // warm bounce on the lid rims
    col += C_BLOOD * exp(-dSeam / 0.05) * uLeak * 0.25;
  }

  // shockwave ring (a hairline of ember + faint wake)
  col += C_EMBER * sw * 1.6 * (1.0 - smoothstep(0.0, 2.0 * px, abs(rr - uShockR) - 0.003));
  col *= mix(1.0, 1.0 + 0.4 * sw, 1.0);
  col *= smoothstep(4.0, 1.4, length(p));
  fragColor = vec4(col, 1.0);
}`;

export function makeEyePass() {
  return new FSPass(EYE_FRAG, {
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uT: { value: 0 }, uOpen: { value: 0 }, uZoom: { value: 1 }, uRot: { value: 0 }, uPupil: { value: 0.12 },
    uShockR: { value: 0 }, uShockA: { value: 0 }, uLeak: { value: 0 }, uLightA: { value: 2.2 },
    uBright: { value: 1 }, uSlitGlow: { value: 0 }, uSlitW: { value: 0.01 },
    uCam: { value: new THREE.Vector2(0, 0) },
  });
}
