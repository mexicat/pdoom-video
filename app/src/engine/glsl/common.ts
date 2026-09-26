import { LIN } from '../palette';
import { SCALE } from '../scale';

const v3 = (c: [number, number, number]) => `vec3(${c.map((x) => x.toFixed(5)).join(',')})`;

/**
 * Shared GLSL (ES 3.0) prepended to every FSPass. Also importable into custom three.js
 * ShaderMaterials. Palette colours are LINEAR RGB.
 */
export const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718
// Output scale: physical px per logical (1920x1080) px. gl_FragCoord, fwidth and dFdx are in
// physical px; FRAG_PX is the fragment's position in logical px (use it for anything that is
// meant to be N logical px: grain/dither cells, hatch spacing, pixel-snapped patterns).
const float PX_SCALE = ${SCALE.toFixed(1)};
#define FRAG_PX (gl_FragCoord.xy / PX_SCALE)
const vec3 C_INK = ${v3(LIN.ink)};
const vec3 C_INK2 = ${v3(LIN.ink2)};
const vec3 C_GRAPHITE = ${v3(LIN.graphite)};
const vec3 C_ASH = ${v3(LIN.ash)};
const vec3 C_BONE = ${v3(LIN.bone)};
const vec3 C_SIGNAL = ${v3(LIN.signal)};
const vec3 C_EMBER = ${v3(LIN.ember)};
const vec3 C_BLOOD = ${v3(LIN.blood)};
const vec3 C_ACID = ${v3(LIN.acid)};

/** Rotated-grid supersample offset k (0..3) within one pixel, in pixels. See SS_TAP (gl.ts). */
vec2 rgss(int k) { return k == 0 ? vec2(0.125, -0.375) : k == 1 ? vec2(0.375, 0.125) : k == 2 ? vec2(-0.125, 0.375) : vec2(-0.375, -0.125); }

float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }
float remap(float x, float a, float b, float c, float d) { return c + (d - c) * sat((x - a) / (b - a)); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// ---- hashes ----
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

// ---- simplex noise (Ashima / Stefan Gustavson, MIT) ----
vec3 _mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 _mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 _mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 _permute(vec3 x) { return _mod289(((x * 34.0) + 10.0) * x); }
vec4 _permute(vec4 x) { return _mod289(((x * 34.0) + 10.0) * x); }
vec4 _taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = _mod289(i);
  vec3 p = _permute(_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = _mod289(i);
  vec4 p = _permute(_permute(_permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = _taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec2 p, int oct) { float s = 0.0, a = 0.5; for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * snoise(p); p = rot2(0.6) * p * 2.03 + 11.7; a *= 0.5; } return s; }
float fbm(vec3 p, int oct) { float s = 0.0, a = 0.5; for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
// curl of 2D noise (divergence-free flow field)
vec2 curl2(vec2 p, float t) {
  float e = 0.01;
  float n1 = snoise(vec3(p + vec2(0.0, e), t)), n2 = snoise(vec3(p - vec2(0.0, e), t));
  float n3 = snoise(vec3(p + vec2(e, 0.0), t)), n4 = snoise(vec3(p - vec2(e, 0.0), t));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}

// ---- 2D SDFs ----
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h); }
// ---- 3D SDFs ----
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox3(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba)); return length(pa - ba * h) - r; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float smin(float a, float b, float k) { float h = sat(0.5 + 0.5 * (b - a) / k); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

// Output scale > 1: lines whose width comes from the pixel footprint (fwidth, "N-px hairlines") would get
// thinner and lighter. The helpers below keep the ink (mean coverage) of the 1x look and draw it with
// the sharper physical footprint. _inkHalfWidth(L, R, X): the ink half-width that 1 - smoothstep(L, R, x)
// puts down over 0 <= x <= X; _boxLine: a line of half-width m box-filtered over +-r (its ink is exactly m).
float _ss3(float t) { return t * t * t * (1.0 - 0.5 * t); } // integral of smoothstep's cubic
float _inkHalfWidth(float L, float R, float X) {
  float k = max(R - L, 1e-6), x = min(X, R);
  return x - k * (_ss3(sat((x - L) / k)) - _ss3(sat(-L / k)));
}
float _boxLine(float x, float m, float r) { r = max(r, 1e-6); return sat((min(x + r, m) - max(x - r, -m)) / (2.0 * r)); }
/**
 * The hairline idiom 1 - smoothstep(a, b, d) where the thresholds were tuned in 1x device pixels: either
 * d in physical px (dist / fwidth) with a, b in px, or d in any unit with a, b multiples of fwidth.
 * Identical at output scale 1; at higher scales the line keeps its 1x ink (PX_SCALE times wider in
 * physical px) with an edge ramp of (b - a) physical px, i.e. the same look, sharper.
 */
${SCALE === 1 ? `float pxLine(float d, float a, float b) { return 1.0 - smoothstep(a, b, d); }` : `float pxLine(float d, float a, float b) { return _boxLine(d, _inkHalfWidth(a, b, 1e9) * PX_SCALE, 0.5 * (b - a)); }`}
/** Same for the linear-ramp idiom sat((hw - d) / aa + 0.5): a line of half-width hw, ramp aa = k * fwidth. */
${SCALE === 1 ? `float rampLine(float d, float hw, float aa) { return sat((hw - d) / aa + 0.5); }` : `float rampLine(float d, float hw, float aa) {
  float aL = aa * PX_SCALE, e = max(hw + 0.5 * aL, 0.0);
  return _boxLine(d, hw >= 0.5 * aL ? hw : e * e / (2.0 * aL), 0.5 * aa);
}`}
/** Anti-aliased coverage of a distance field (d<0 inside) using screen derivatives. */
float aaFill(float d) { float w = fwidth(d); return 1.0 - smoothstep(-w, w, d); }
/** Anti-aliased stroke of width wd around the zero set of d. */
${SCALE === 1 ? `float aaStroke(float d, float wd) { float w = fwidth(d); return 1.0 - smoothstep(wd * 0.5 - w, wd * 0.5 + w, abs(d)); }` : `float aaStroke(float d, float wd) { float w = fwidth(d); return _boxLine(abs(d), _inkHalfWidth(wd * 0.5 - w * PX_SCALE, wd * 0.5 + w * PX_SCALE, 1e9), w); }`}

/**
 * Engraving hatch: parallel lines along coordinate u (lines at integer u),
 * each line's width grows with darkness (0 = paper, 1 = full ink). Returns ink coverage 0..1.
 * Works in any space: u can be screen, world, or surface-param based. Anti-aliased via fwidth.
 */
float hatch(float u, float darkness) {
  float f = abs(fract(u) - 0.5);            // 0 at line centre ... 0.5 between lines
  float half_w = 0.5 * sat(darkness);       // half line width in u-units
  float aa = max(fwidth(u), 1e-4);
${SCALE === 1 ? `  return 1.0 - smoothstep(half_w - aa, half_w + aa, 0.5 - f);` : `  // keep the ink the 1x footprint puts down per period; draw it with the sharper physical footprint
  float aaL = aa * PX_SCALE, x = 0.5 - f, m = _inkHalfWidth(half_w - aaL, half_w + aaL, 0.5);
  return min(_boxLine(x, m, aa) + _boxLine(1.0 - x, m, aa), 1.0);`}
}
/** Engraving with a thin always-on hairline + crosshatch in deep shadows. */
float engrave(vec2 uv, float darkness, float freq, float angle) {
  vec2 r = rot2(angle) * uv * freq;
  float a = hatch(r.y, darkness * 1.1);
  float b = hatch((rot2(1.1) * uv * freq).y, sat(darkness * 2.0 - 1.1));
  return max(a, b);
}

// ---- colour ----
vec3 toSRGB(vec3 c) { return mix(12.92 * c, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
/** Signal-orange heat ramp: 0 = ink, 0.5 = signal, 1 = white-hot. */
vec3 heat(float x) {
  x = sat(x);
  vec3 c = mix(C_INK, C_BLOOD, smoothstep(0.0, 0.3, x));
  c = mix(c, C_SIGNAL, smoothstep(0.25, 0.55, x));
  c = mix(c, C_EMBER, smoothstep(0.55, 0.8, x));
  return mix(c, vec3(1.0, 0.93, 0.85), smoothstep(0.8, 1.0, x));
}
`;
