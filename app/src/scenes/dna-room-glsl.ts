// Fullscreen pass for the `room` slot (dna-room.ts): the ink backdrop plus up to eight ribosomes as
// engraved masses. Each subunit is a smooth union of lumpy ellipses (local px, y down, see
// dna-room-geo.ts); a rounded height profile off its distance field gives a normal, and the side light
// is rendered as white-line engraving (bone hatch lines whose width follows the light, fixed screen
// pitch, phase anchored to the ribosome). With `cut` = 1 the ribosome is shown in section: flat cut
// faces with 45° section lining, the intersubunit cavity and the exit tunnel dark, the uncut back half
// showing as a crescent of thickness past the cut edge.
export const RIBO_MAX = 8;

export const RIBO_FRAG = /* glsl */ `
uniform int uN;
uniform vec4 uInv[${RIBO_MAX}];   // screen → local linear map (row-major a b / c d)
uniform vec2 uOrg[${RIBO_MAX}];   // screen px (y down) of the local origin
uniform vec4 uPar[${RIBO_MAX}];   // cut, alpha, scale (screen px per local px), rotation
uniform float uFlash;

float sdEll(vec2 p, vec2 c, vec2 r, float a) {
  p -= c;
  float cs = cos(a), sn = sin(a);
  p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
  return (length(p / r) - 1.0) * min(r.x, r.y);
}
float lump(vec2 p) { return 5.0 * snoise(p * 0.0068 + 3.1); }
float dLarge(vec2 p) {
  float d = sdEll(p, vec2(0.0, -330.0), vec2(480.0, 300.0), 0.0);
  d = smin(d, sdEll(p, vec2(-40.0, -560.0), vec2(270.0, 160.0), 0.06), 130.0);   // central protuberance
  d = smin(d, sdEll(p, vec2(-430.0, -330.0), vec2(160.0, 175.0), -0.3), 120.0);  // L1 side (E)
  d = smin(d, sdEll(p, vec2(440.0, -360.0), vec2(150.0, 165.0), 0.35), 120.0);   // L7/L12 side (A)
  d = smin(d, sdEll(p, vec2(0.0, -150.0), vec2(520.0, 150.0), 0.0), 100.0);
  d += lump(p);
  return smax(d, p.y + 24.0, 18.0); // the flat interface facing the small subunit
}
float dSmall(vec2 p) {
  float d = sdEll(p, vec2(30.0, 186.0), vec2(440.0, 146.0), 0.04);
  d = smin(d, sdEll(p, vec2(-300.0, 140.0), vec2(190.0, 130.0), -0.15), 130.0);  // head
  d = smin(d, sdEll(p, vec2(330.0, 118.0), vec2(150.0, 100.0), 0.25), 110.0);    // platform
  d += lump(p + 900.0);
  return smax(d, 26.0 - p.y, 18.0);
}
float dCav(vec2 p) { return sdEll(p, vec2(0.0, -170.0), vec2(215.0, 190.0), 0.0); }
float dTun(vec2 p) {
  float d = sdSegment(p, vec2(30.0, -344.0), vec2(58.0, -410.0));
  d = min(d, sdSegment(p, vec2(58.0, -410.0), vec2(104.0, -468.0)));
  d = min(d, sdSegment(p, vec2(104.0, -468.0), vec2(152.0, -526.0)));
  d = min(d, sdSegment(p, vec2(152.0, -526.0), vec2(188.0, -588.0)));
  d = min(d, sdSegment(p, vec2(188.0, -588.0), vec2(226.0, -690.0)));
  return d - 19.0;
}
float D(vec2 p, int w) { return w == 0 ? dLarge(p) : dSmall(p); }

// Engraved lines with a one-pixel box-filtered edge (the pitch is constant, so no screen derivatives
// are needed: these passes branch per pixel, where fwidth is unreliable). w = line width / pitch.
float hatchA(float u, float w, float aa) {
  float dist = abs(fract(u + 0.5) - 0.5);
  return sat((0.5 * w - dist) / aa + 0.5);
}
// lines of pitch P px at angle a (phase anchored to the ribosome's origin); nothing at zero weight
float lines(vec2 uv, float a, float P, float w) {
  return hatchA((rot2(a) * uv).y / P, sat(w), 1.0 / (P * PX_SCALE)) * sat(w * 8.0);
}
// white-line engraving: bone lines whose width follows the light v (0..1), 6 px pitch, crosshatch in highlights
float engraveLight(vec2 uv, float v, float P) {
  float a = lines(uv, 0.8, P, v * 0.92);
  float b = lines(uv, -0.75, P, sat((v - 0.78) * 2.2));
  return max(a, b);
}

vec3 subunit(vec3 col, vec2 p, vec2 uv, float s, float ang, float cut, float al, int w) {
  float d = D(p, w);
  float e = 1.5 / s;
  float pitch = mix(3.4, 6.0, smoothstep(0.15, 0.6, s)); // finer engraving on small ribosomes
  vec2 off = vec2(18.0, 14.0);
  float dB = cut > 0.0 ? D(p - off, w) : 1e9;
  if (d * s > 2.0 && dB * s > 2.0) return col;
  float cover = sat(0.5 - d * s);
  vec3 m = vec3(0.0);
  if (cut < 0.999) {
    // ---- the whole mass (exterior): rounded profile → normal → light
    vec2 g = vec2(D(p + vec2(e, 0.0), w) - d, D(p + vec2(0.0, e), w) - d) / e;
    float R0 = 250.0;
    float u = sat(-d / R0);
    float slope = (1.0 - u) / sqrt(max(u * (2.0 - u), 0.004));
    vec3 n = normalize(vec3(g * min(slope, 6.0), 1.0));
    float c = cos(ang), sn = sin(ang);
    n.xy = vec2(c * n.x - sn * n.y, sn * n.x + c * n.y);
    vec3 L = normalize(vec3(-0.7, -0.75, 0.4));
    float v = pow(max(0.0, dot(n, L)), 2.5);
    v = max(v, 0.14 * pow(1.0 - u, 26.0)); // a hairline of reflected light along the far edge
    vec3 dome = mix(C_INK2 * 1.1, C_BONE * 0.56, engraveLight(uv, v, pitch));
    float edge = pxLine(abs(d * s), 0.3, 1.3);
    m = mix(dome, C_ASH * 0.45, edge * 0.6);
  }
  if (cut > 0.0) {
    // ---- in section: the cut face, lined at 45°, lit a little from the upper left
    float lining = lines(uv, -0.785, 5.0, 0.3 + 0.3 * uFlash);
    float lf = 0.8 + 0.35 * sat(0.5 - (p.x + p.y) / 1500.0);
    vec3 face = mix(C_INK2 * 1.45, C_ASH * 0.5, lining) * lf;
    if (w == 0) {
      float dc = min(dCav(p), dTun(p));
      float hole = sat(0.5 - dc * s);
      // the far wall of the cavity, faintly engraved and deepening upward
      float depth = sat((-p.y - 20.0) / 360.0);
      vec3 far = C_INK * 0.6 + C_ASH * 0.1 * lines(uv, 0.8, 8.0, 0.16 * (1.0 - depth));
      face = mix(face, far, hole);
      face = mix(face, C_BONE * 0.45, pxLine(abs(dc * s), 0.3, 1.2) * 0.9);
    }
    face = mix(face, C_BONE * 0.7, pxLine(abs(d * s), 0.5, 1.6));
    m = cut < 0.999 ? mix(m, face, cut) : face;
    // the uncut back half, seen past the cut edge: a crescent of engraved thickness
    float back = sat(0.5 - dB * s) * (1.0 - cover);
    vec3 bk = mix(C_INK2 * 0.9, C_BONE * 0.5, engraveLight(uv, 0.1 + 0.18 * sat(1.0 + dB / 40.0), pitch));
    col = mix(col, bk, back * cut * al);
  }
  return mix(col, m, cover * al);
}

void main() {
  vec2 px = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 p0 = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 col = C_INK + C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, length(p0)));
  for (int k = 0; k < ${RIBO_MAX}; k++) {
    if (k >= uN) break;
    vec4 A = uInv[k];
    vec2 q = px - uOrg[k];
    vec2 p = vec2(A.x * q.x + A.y * q.y, A.z * q.x + A.w * q.y);
    if (abs(p.x) > 820.0 || p.y < -860.0 || p.y > 540.0) continue;
    vec4 P = uPar[k];
    // cheap bounds per subunit (the back-half crescent reaches ~20 px past them)
    if (p.y > 0.0 && p.y < 410.0 && abs(p.x) < 580.0) col = subunit(col, p, q, P.z, P.w, P.x, P.y, 1);
    if (p.y < 20.0 && p.y > -790.0 && abs(p.x) < 700.0) col = subunit(col, p, q, P.z, P.w, P.x, P.y, 0);
  }
  fragColor = vec4(col, 1.0);
}`;
