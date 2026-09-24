// Paperclip geometry shared by the CPU (spark path, camera framing) and the GPU (SDFs).
// A Gem-style clip, lying in the xy plane, long axis on x, the big bend on +x.
// Units: 1 ≈ 1 mm (clip ≈ 31.5 × 8.1, wire Ø 0.9). The centreline is one spiral path:
//   A (outer, free end, → +x)  → big bend R1 → B (outer top, → −x) → bend R2 → C (inner bottom, → +x)
//   → small bend R3 → D (innermost, → −x, free end).
// Arc length s runs from the free end of A (s = 0) to the free end of D (s = S_END).

export const CLIP = {
  YA: -3.6, YB: 3.6, YC: -2.5, YD: 1.5,
  XA0: -4.0, XR: 12.4, XL: -12.4, XS: 9.0, XD1: -7.5,
  R1: 3.6, R2: 3.05, R2CY: 0.55, R3: 2.0, R3CY: -0.5,
  WIRE: 0.45,
} as const;

const C = CLIP;
export const S_A1 = C.XR - C.XA0;
export const S_B0 = S_A1 + Math.PI * C.R1;
export const S_B1 = S_B0 + (C.XR - C.XL);
export const S_C0 = S_B1 + Math.PI * C.R2;
export const S_C1 = S_C0 + (C.XS - C.XL);
export const S_D0 = S_C1 + Math.PI * C.R3;
export const S_END = S_D0 + (C.XS - C.XD1);

/** Point on the centreline at arc length s (s < 0 extends A backwards: the lead-in line). */
export function clipPath(s: number): { x: number; y: number; a: number } {
  if (s <= S_A1) return { x: C.XA0 + s, y: C.YA, a: 0 };
  if (s <= S_B0) { const f = (s - S_A1) / C.R1 - Math.PI / 2; return { x: C.XR + Math.cos(f) * C.R1, y: Math.sin(f) * C.R1, a: f + Math.PI / 2 }; }
  if (s <= S_B1) return { x: C.XR - (s - S_B0), y: C.YB, a: Math.PI };
  if (s <= S_C0) { const f = Math.PI / 2 + (s - S_B1) / C.R2; return { x: C.XL + Math.cos(f) * C.R2, y: C.R2CY + Math.sin(f) * C.R2, a: f + Math.PI / 2 }; }
  if (s <= S_C1) return { x: C.XL + (s - S_C0), y: C.YC, a: 0 };
  if (s <= S_D0) { const f = (s - S_C1) / C.R3 - Math.PI / 2; return { x: C.XS + Math.cos(f) * C.R3, y: C.R3CY + Math.sin(f) * C.R3, a: f + Math.PI / 2 }; }
  const u = Math.min(s, S_END) - S_D0;
  return { x: C.XS - u, y: C.YD, a: Math.PI };
}

const f = (x: number) => x.toFixed(5);

/**
 * GLSL: `float clipD(vec2 p, float sT, float sH, out float s, out float lat, out vec2 q)`
 * 2D distance from p to the centreline restricted to arc lengths [sT, sH] (sT may be < 0 for the
 * lead-in). Returns +1e5 if the visible range is empty. s = arc length of the closest point,
 * lat = signed lateral offset (+ toward the inside of the spiral), q = closest point.
 */
export const GLSL_CLIP = /* glsl */ `
const float CL_YA = ${f(C.YA)}, CL_YB = ${f(C.YB)}, CL_YC = ${f(C.YC)}, CL_YD = ${f(C.YD)};
const float CL_XA0 = ${f(C.XA0)}, CL_XR = ${f(C.XR)}, CL_XL = ${f(C.XL)}, CL_XS = ${f(C.XS)}, CL_XD1 = ${f(C.XD1)};
const float CL_R1 = ${f(C.R1)}, CL_R2 = ${f(C.R2)}, CL_R2CY = ${f(C.R2CY)}, CL_R3 = ${f(C.R3)}, CL_R3CY = ${f(C.R3CY)};
const float CL_SA1 = ${f(S_A1)}, CL_SB0 = ${f(S_B0)}, CL_SB1 = ${f(S_B1)}, CL_SC0 = ${f(S_C0)}, CL_SC1 = ${f(S_C1)}, CL_SD0 = ${f(S_D0)}, CL_SEND = ${f(S_END)};

void _clSeg(vec2 p, float y, float x0, float x1, float dir, float s0, float sT, float sH, inout float bd, inout float bs, inout float bl, inout vec2 bq) {
  // horizontal segment traversed from x0 in direction dir (+1/-1); s = s0 + (x - x0) * dir
  float a = s0 + max(sT - s0, 0.0), b = s0 + min(sH - s0, abs(x1 - x0));
  if (b < a) return;
  float xa = x0 + (a - s0) * dir, xb = x0 + (b - s0) * dir;
  float x = clamp(p.x, min(xa, xb), max(xa, xb));
  vec2 o = p - vec2(x, y);
  float d = length(o);
  if (d < bd) { bd = d; bs = s0 + (x - x0) * dir; bl = o.y * dir; bq = vec2(x, y); }
}
void _clArc(vec2 p, vec2 c, float R, float a0, float s0, float sT, float sH, inout float bd, inout float bs, inout float bl, inout vec2 bq) {
  // counter-clockwise half circle starting at angle a0, s = s0 + (ang - a0) * R
  float lo = max(sT - s0, 0.0) / R, hi = min(sH - s0, PI * R) / R;
  if (hi < lo) return;
  vec2 v = p - c;
  float mid = a0 + PI * 0.5;
  float ang = atan(v.y, v.x);
  float rel = ang - mid; rel -= TAU * floor((rel + PI) / TAU); // (-PI, PI] around the arc middle
  float u = clamp(rel + PI * 0.5, lo, hi);
  float aa = a0 + u;
  vec2 q = c + R * vec2(cos(aa), sin(aa));
  vec2 o = p - q;
  float d = length(o);
  if (d < bd) { bd = d; bs = s0 + u * R; bl = R - length(v); bq = q; }
}
float clipD(vec2 p, float sT, float sH, out float s, out float lat, out vec2 q) {
  float bd = 1e5, bs = 0.0, bl = 0.0; vec2 bq = vec2(0.0);
  _clSeg(p, CL_YA, CL_XA0 + min(sT, 0.0), CL_XR, 1.0, min(sT, 0.0), sT, sH, bd, bs, bl, bq);
  _clArc(p, vec2(CL_XR, 0.0), CL_R1, -PI * 0.5, CL_SA1, sT, sH, bd, bs, bl, bq);
  _clSeg(p, CL_YB, CL_XR, CL_XL, -1.0, CL_SB0, sT, sH, bd, bs, bl, bq);
  _clArc(p, vec2(CL_XL, CL_R2CY), CL_R2, PI * 0.5, CL_SB1, sT, sH, bd, bs, bl, bq);
  _clSeg(p, CL_YC, CL_XL, CL_XS, 1.0, CL_SC0, sT, sH, bd, bs, bl, bq);
  _clArc(p, vec2(CL_XS, CL_R3CY), CL_R3, -PI * 0.5, CL_SC1, sT, sH, bd, bs, bl, bq);
  _clSeg(p, CL_YD, CL_XS, CL_XD1, -1.0, CL_SD0, sT, sH, bd, bs, bl, bq);
  s = bs; lat = bl; q = bq;
  return bd;
}
/** Fast full-clip distance with the signed lateral offset (no arc length, no trig): for raymarching. */
float clipDL(vec2 p, out float lat) {
  float bd = 1e5, bl = 0.0;
  // straight legs: A (y=YA, +x), B (y=YB, -x), C (y=YC, +x), D (y=YD, -x)
  vec2 o; float d;
  o = p - vec2(clamp(p.x, CL_XA0, CL_XR), CL_YA); d = dot(o, o); if (d < bd) { bd = d; bl = o.y; }
  o = p - vec2(clamp(p.x, CL_XL, CL_XR), CL_YB); d = dot(o, o); if (d < bd) { bd = d; bl = -o.y; }
  o = p - vec2(clamp(p.x, CL_XL, CL_XS), CL_YC); d = dot(o, o); if (d < bd) { bd = d; bl = o.y; }
  o = p - vec2(clamp(p.x, CL_XD1, CL_XS), CL_YD); d = dot(o, o); if (d < bd) { bd = d; bl = -o.y; }
  bd = sqrt(bd);
  // bends (only their own half-plane; beyond it the legs' ends are closer)
  vec2 v; float r;
  v = p - vec2(CL_XR, 0.0); if (v.x > 0.0) { r = length(v); d = abs(r - CL_R1); if (d < bd) { bd = d; bl = CL_R1 - r; } }
  v = p - vec2(CL_XL, CL_R2CY); if (v.x < 0.0) { r = length(v); d = abs(r - CL_R2); if (d < bd) { bd = d; bl = CL_R2 - r; } }
  v = p - vec2(CL_XS, CL_R3CY); if (v.x > 0.0) { r = length(v); d = abs(r - CL_R3); if (d < bd) { bd = d; bl = CL_R3 - r; } }
  lat = bl;
  return bd;
}
/** Fast full-clip distance (no range, no outputs). */
float clipD0(vec2 p) {
  float s, l; vec2 q;
  return clipD(p, 0.0, 1e3, s, l, q);
}
`;
