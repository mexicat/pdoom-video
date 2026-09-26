// GLSL for the shoggoth plate. Two passes:
//  1. GBUF (half resolution, MRT float): raymarch our shoggoth — a knot of torus-knot tubes,
//     bent tentacles, eye pods — and store depth, hatch parameters (arc length along / around
//     each tube), primitive id and lighting terms.
//  2. COMP (full resolution): depth/id-aware upsample of the G-buffer, engraving (scratchboard)
//     hatching that follows the tubes, orange rim, analytic eyes (iris fibres, lids) and the
//     analytic mask disc with the x-ray scan band, the creature's engraved words (planes in the
//     world, hatched, occluded by the body and the mask), and the CRT-style collapse into the flatline.
import { GLSL_COMMON } from '../engine/glsl/common';
import { GLSL_MASK } from './_motifs';

export const NK = 4; // knots
export const NT = 8; // tentacles
export const NE = 12; // eyes

const SHARED = /* glsl */ `
#define NK ${NK}
#define NT ${NT}
#define NE ${NE}
uniform vec3 camPos, camR, camU, camF;
uniform float tanF, aspect, squash, uT;
uniform mat3 kRot[NK]; uniform vec3 kPos[NK]; uniform vec4 kPar[NK]; uniform vec2 kPQ[NK];
uniform mat3 tRot[NT]; uniform vec3 tPos[NT]; uniform vec4 tPar[NT]; uniform float tB2[NT]; uniform vec4 tW[NT];
uniform vec4 corePR;
uniform vec3 stemA, stemB;
uniform vec4 ePR[NE]; uniform vec3 eF[NE]; uniform vec3 eU[NE]; uniform float eOpen[NE];
uniform vec4 bound;
uniform vec3 keyDir, rimDir;

vec3 camRay(vec2 uv) {
  float yy = 0.5 + (uv.y - 0.5) / squash;
  vec2 ndc = vec2(uv.x * 2.0 - 1.0, yy * 2.0 - 1.0);
  return normalize(camF + camR * ndc.x * aspect * tanF + camU * ndc.y * tanF);
}
`;

const MAP = /* glsl */ `
// torus knot tube (p strands winding q times), meridional-plane distance approximation
float sdKnot(vec3 P, int i, out float along, out float around) {
  vec3 q = kRot[i] * (P - kPos[i]);
  vec4 pr = kPar[i]; // R, r, a, phase
  vec2 m = vec2(length(q.xz) - pr.x, q.y);
  float torusD = length(m) - (pr.y + pr.z * 1.5);
  along = 0.0; around = 0.0;
  if (torusD > 0.25) return torusD;
  float phi = atan(q.z, q.x);
  float p = kPQ[i].x, qq = kPQ[i].y;
  float best = 1e9, bal = 0.0; vec2 bdm = vec2(1.0, 0.0);
  for (int k = 0; k < 3; k++) {
    if (float(k) >= p) break;
    float al = phi + TAU * float(k);
    float th = (qq / p) * al + pr.w;
    vec2 dm = m - pr.y * vec2(cos(th), sin(th));
    float d = dot(dm, dm);
    if (d < best) { best = d; bal = al; bdm = dm; }
  }
  float rad = pr.z * (1.0 + 0.3 * sin(bal * 2.0 + pr.w * 1.3 + float(i)) + 0.12 * sin(bal * 7.0 - uT * 1.3) + 0.07 * sin(bal * 17.0 + float(i) * 2.0 + uT * 0.6));
  along = bal * pr.x;
  around = atan(bdm.y, bdm.x) * rad;
  return sqrt(best) - rad;
}

// tentacle: tapered tube along +x, doubly bent (cheap bend), curling
float sdTent(vec3 P, int i, out float along, out float around) {
  vec3 q = tRot[i] * (P - tPos[i]);
  vec4 pr = tPar[i]; // L, r0, r1, bend
  float bb = length(q) - pr.x - pr.y;
  along = 0.0; around = 0.0;
  if (bb > 0.3) return bb;
  float x = clamp(q.x, 0.0, pr.x);
  vec4 wv = tW[i]; // wave amp, wave freq, wave phase, tip curl
  float xn = x / pr.x;
  float a = pr.w * x + wv.x * sin(x * wv.y + wv.z) + wv.w * xn * xn * xn, c = cos(a), s = sin(a);
  q.xy = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  float a2 = tB2[i] * x + 0.5 * wv.x * sin(x * wv.y * 0.7 + wv.z * 1.3 + 1.0); c = cos(a2); s = sin(a2);
  q.xz = vec2(c * q.x + s * q.z, -s * q.x + c * q.z);
  float h = clamp(q.x / pr.x, 0.0, 1.0);
  float r = mix(pr.y, pr.z, pow(h, 0.65)) * (1.0 + 0.14 * sin(q.x * 11.0 - uT * 2.0 + float(i)) * (1.0 - h));
  along = q.x;
  around = atan(q.z, q.y) * r;
  return (length(vec3(q.x - h * pr.x, q.y, q.z)) - r) * 0.7;
}

void U(inout vec4 acc, float d, float al, float ar, float id, float k) {
  float h = sat(0.5 + 0.5 * (d - acc.x) / k);
  float m = mix(d, acc.x, h) - k * h * (1.0 - h);
  if (d < acc.x) acc.yzw = vec3(al, ar, id);
  acc.x = m;
}

// returns (distance, along, around, id): id 0 core, 1..NK knots, 10.. tentacles, 30 lids/pods, 40+i eyeballs
vec4 mapP(vec3 p) {
  vec3 cq = p - corePR.xyz;
  float cr = length(cq);
  float fold = abs(sin(cq.x * 9.0 + 2.5 * sin(cq.y * 7.0 + uT * 0.4) + 1.7 * sin(cq.z * 8.0)));
  float core = cr - corePR.w * (1.0 + 0.08 * sin(cq.x * 5.0 + uT) * sin(cq.y * 4.0 - uT * 0.7) * sin(cq.z * 6.0 + 1.0)) + 0.045 * (1.0 - fold);
  vec4 acc = vec4(core, acos(clamp(cq.y / max(cr, 1e-4), -1.0, 1.0)) * corePR.w, atan(cq.z, cq.x) * corePR.w, 0.0);
  float al, ar;
  for (int i = 0; i < NK; i++) { float d = sdKnot(p, i, al, ar); U(acc, d, al, ar, 1.0 + float(i), 0.16); }
  for (int i = 0; i < NT; i++) { float d = sdTent(p, i, al, ar); U(acc, d, al, ar, 10.0 + float(i), 0.14); }
  {
    // the stalk that holds the mask from behind
    vec3 pa = p - stemA, ba = stemB - stemA;
    float hh = sat(dot(pa, ba) / dot(ba, ba));
    vec3 dd = pa - ba * hh;
    float d = length(dd) - mix(0.055, 0.035, hh);
    U(acc, d, hh * length(ba), atan(dd.y, dd.x) * 0.05, 10.0, 0.06);
  }
  for (int i = 0; i < NE; i++) {
    vec4 e = ePR[i];
    vec3 dv = p - e.xyz;
    float L = length(dv);
    if (L > e.w * 2.2) { acc.x = min(acc.x, L - e.w * 1.6); continue; }
    vec3 F = eF[i], Uu = eU[i], R = cross(Uu, F);
    // pod of flesh the eye sits in
    float pod = length(dv + F * e.w * 0.55) - e.w * 1.35;
    // lids: a shell around the eyeball with an almond aperture that opens
    vec3 q = vec3(dot(dv, R), dot(dv, Uu), dot(dv, F));
    float shell = abs(L - e.w * 1.1) - e.w * 0.075;
    float xn = clamp(q.x / (e.w * 1.1), -1.0, 1.0);
    float hOpen = eOpen[i] * e.w * 0.7 * (1.0 - xn * xn);
    float openD = max(abs(q.y) - hOpen, -q.z);
    float lid = max(shell, -openD);
    float rho = length(q.xy);
    U(acc, min(pod, lid), rho + max(-q.z, 0.0), atan(q.y, q.x) * e.w, 30.0, 0.1);
    float ball = L - e.w;
    if (ball < acc.x) acc = vec4(ball, 0.0, 0.0, 40.0 + float(i));
  }
  return acc;
}
`;

export const GBUF_FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
layout(location = 0) out vec4 g0;
layout(location = 1) out vec4 g1;
${GLSL_COMMON}
${SHARED}
${MAP}
uniform float quality;

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.04;
  for (int i = 0; i < 14; i++) {
    float h = mapP(ro + rd * t).x;
    res = min(res, 7.0 * h / t);
    t += clamp(h, 0.04, 0.3);
    if (res < 0.02 || t > 3.5) break;
  }
  return sat(res);
}

void main() {
  float yy = 0.5 + (vUv.y - 0.5) / squash;
  if (yy < 0.0 || yy > 1.0) { g0 = vec4(1e5, 0.0, 0.0, -1.0); g1 = vec4(0.0); return; }
  vec3 rd = camRay(vUv);
  vec3 oc = camPos - bound.xyz;
  float b = dot(oc, rd), c = dot(oc, oc) - bound.w * bound.w, h = b * b - c;
  if (h < 0.0) { g0 = vec4(1e5, 0.0, 0.0, -1.0); g1 = vec4(0.0); return; }
  h = sqrt(h);
  float t = max(0.02, -b - h), t1 = -b + h;
  vec4 m = vec4(1.0);
  bool hit = false;
  for (int i = 0; i < 96; i++) {
    m = mapP(camPos + rd * t);
    if (m.x < 0.0007 * t) { hit = true; break; }
    t += m.x * 0.8;
    if (t > t1) break;
  }
  if (!hit) { g0 = vec4(1e5, 0.0, 0.0, -1.0); g1 = vec4(0.0); return; }
  vec3 p = camPos + rd * t;
  // tetrahedral normal
  float e = 0.0012 * t;
  vec2 k = vec2(1.0, -1.0);
  vec3 n = normalize(k.xyy * mapP(p + k.xyy * e).x + k.yyx * mapP(p + k.yyx * e).x + k.yxy * mapP(p + k.yxy * e).x + k.xxx * mapP(p + k.xxx * e).x);
  // ambient occlusion (3 taps)
  float ao = 0.0, w = 1.0;
  for (int j = 1; j <= 3; j++) { float hh = 0.06 * float(j); ao += w * (hh - mapP(p + n * hh).x); w *= 0.6; }
  ao = sat(1.0 - ao * 4.0);
  float dif = max(dot(n, keyDir), 0.0);
  float sh = quality > 0.5 && dif > 0.01 ? softShadow(p + n * 0.01, keyDir) : 1.0;
  float key = dif * sh;
  float fres = pow(sat(1.0 - dot(n, -rd)), 2.5); // (sat: a dot a hair above 1 would give pow(negative) = NaN)
  float rim = fres * (0.35 + 0.65 * max(dot(n, rimDir), 0.0));
  g0 = vec4(t, m.y, m.z, m.w);
  g1 = vec4(key, rim, ao, max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0));
}
`;

export const COMP_FRAG = /* glsl */ `
${SHARED}
${GLSL_MASK}
uniform sampler2D g0Tex, g1Tex, textTex, overTex;
uniform vec2 gRes;
uniform vec3 eGaze[NE]; uniform float ePupil[NE]; uniform float eGlow[NE];
uniform vec3 mC, mN, mRt, mUp; uniform float mR, mVis;
uniform float bandX, bandW, bandOn, trailK, xrayAll, ghostK;
uniform float bodyK, outsideK, flatK, fogNear, fogK, hatchSp;
// engraved words: up to two planes (baseline-left origin, right/down unit axes, normal, cap height)
uniform vec3 tpO[2], tpU[2], tpV[2], tpN[2]; uniform float tpCap[2], tpK[2], tpHot[2];
uniform float txXray; // 1: the words behind the mask are only seen through the x-ray

float eline(float u, float w) {
  float d = abs(u - floor(u + 0.5));
  float aa = max(fwidth(u), 1e-4) * 0.7;
  return rampLine(d, w * 0.5, aa) * smoothstep(0.0, 0.05, w);
}
float elineLod(float u, float w, float px) {
  float fu = max(fwidth(u), 1e-5) * PX_SCALE; // per logical px: the spacing is px logical px at any output scale
  float k = clamp(-log2(fu * px), -1.0, 3.0);
  float kf = floor(k), kr = k - kf;
  return mix(eline(u * exp2(kf), w), eline(u * exp2(kf + 1.0), w), smoothstep(0.0, 1.0, kr));
}
vec4 fetch0(ivec2 c) { return texelFetch(g0Tex, clamp(c, ivec2(0), ivec2(gRes) - 1), 0); }
vec4 fetch1(ivec2 c) { return texelFetch(g1Tex, clamp(c, ivec2(0), ivec2(gRes) - 1), 0); }

float irisPattern(float a2, float rr, float seed) {
  float fib = hatch(a2 * 64.0 / TAU + 0.35 * sin(rr * 21.0 + seed), 0.45 + 0.35 * sin(a2 * 7.0 + seed));
  float fib2 = hatch(a2 * 23.0 / TAU + 0.5 * rr, 0.25);
  return max(fib, fib2 * 0.6);
}

void main() {
  vec2 uv = vUv;
  vec2 px = vec2(uv.x * ${1920}.0, (1.0 - uv.y) * ${1080}.0);
  float yy = 0.5 + (uv.y - 0.5) / squash;
  bool inside = yy >= 0.0 && yy <= 1.0;
  vec3 ro = camPos, rd = camRay(uv);

  // ---- G-buffer: depth/id-aware bilinear upsample
  vec2 hp = uv * gRes - 0.5;
  ivec2 i0 = ivec2(floor(hp));
  vec2 f = hp - vec2(i0);
  vec4 a00 = fetch0(i0), a10 = fetch0(i0 + ivec2(1, 0)), a01 = fetch0(i0 + ivec2(0, 1)), a11 = fetch0(i0 + ivec2(1, 1));
  vec4 b00 = fetch1(i0), b10 = fetch1(i0 + ivec2(1, 0)), b01 = fetch1(i0 + ivec2(0, 1)), b11 = fetch1(i0 + ivec2(1, 1));
  vec4 bw = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  float cov = dot(bw, vec4(a00.x < 1e4 ? 1.0 : 0.0, a10.x < 1e4 ? 1.0 : 0.0, a01.x < 1e4 ? 1.0 : 0.0, a11.x < 1e4 ? 1.0 : 0.0));
  // reference sample = nearest of the four that hit (prefer the closest depth)
  vec4 ref = a00; vec4 refB = b00; float best = -1.0;
  if (bw.x > best && a00.x < 1e4) { best = bw.x; ref = a00; refB = b00; }
  if (bw.y > best && a10.x < 1e4) { best = bw.y; ref = a10; refB = b10; }
  if (bw.z > best && a01.x < 1e4) { best = bw.z; ref = a01; refB = b01; }
  if (bw.w > best && a11.x < 1e4) { best = bw.w; ref = a11; refB = b11; }
  vec4 wv = bw * vec4(
    (a00.w == ref.w && abs(a00.x - ref.x) < 0.06 * ref.x) ? 1.0 : 0.0,
    (a10.w == ref.w && abs(a10.x - ref.x) < 0.06 * ref.x) ? 1.0 : 0.0,
    (a01.w == ref.w && abs(a01.x - ref.x) < 0.06 * ref.x) ? 1.0 : 0.0,
    (a11.w == ref.w && abs(a11.x - ref.x) < 0.06 * ref.x) ? 1.0 : 0.0);
  float ws = dot(wv, vec4(1.0));
  float edge = 0.0;
  vec4 G0 = ref, G1 = refB;
  if (ws > 1e-4) {
    wv /= ws;
    G0 = a00 * wv.x + a10 * wv.y + a01 * wv.z + a11 * wv.w;
    G1 = b00 * wv.x + b10 * wv.y + b01 * wv.z + b11 * wv.w;
    G0.w = ref.w;
    // how much of the footprint belongs to something else in front/behind: a crevice line
    edge = sat(1.0 - ws / max(cov, 1e-3));
  }
  float tBody = cov > 0.02 ? G0.x : 1e5;

  // ---- engraving (scratchboard): bone lines on black, width grows with light, lines follow the tubes
  vec3 body = vec3(0.0);
  if (cov > 0.001) {
    float key = G1.x, rim = G1.y, ao = G1.z, up = G1.w;
    float light = sat(key * (0.3 + 0.7 * ao) + 0.05 * up * ao);
    float u = G0.y / hatchSp;
    float v = G0.z / (hatchSp * 0.8);
    float id = G0.w;
    if (id >= 29.5 && id < 39.5) { u = G0.y / (hatchSp * 0.55); v = G0.z / (hatchSp * 0.6); } // pods/lids: rings around the eye
    if (id < 0.5) { u = G0.y / (hatchSp * 0.9); } // core folds: contour lines
    // a hand-cut wobble so the rings never read as a machined hose (not on the eye pods)
    if (id < 29.5 || id > 39.5) u += 0.22 * sin(v * 0.21 + u * 0.013) + 0.08 * sin(v * 0.9 + 1.7);
    float wA = pow(light, 1.25) * 0.9;
    // nested line densities (like mip levels): new lines fade in between old ones, so the
    // engraving keeps ~6px spacing on screen whatever the camera distance
    float la = elineLod(u, wA, 6.0);
    float lb = elineLod(v, sat(light * 1.6 - 0.95) * 0.7, 7.0);
    float lines = max(la, lb);
    // too dense to resolve (grazing angles) → fall back to tone
    float fw = max(fwidth(u), fwidth(v) * 0.5) * PX_SCALE;
    lines = mix(lines, wA * 0.8, smoothstep(0.6, 1.2, fw));
    // silhouettes and thin parts (partial coverage in the half-res buffer): smooth tone, no lines
    lines = mix(wA * 0.75, lines, smoothstep(0.55, 0.95, cov));
    vec3 c = C_BONE * lines * 0.8;
    // orange rim light on the back-lit edges: the lines turn hot, then a hot contour
    float rl = elineLod(u, sat(rim * 1.2) * 0.85, 6.0);
    c = mix(c, C_EMBER * 1.3 * max(rl, lines), smoothstep(0.08, 0.5, rim));
    c += C_SIGNAL * 0.8 * pow(rim, 3.0) * ao;
    // crevices between tubes: an ink contour
    c *= 1.0 - 0.95 * smoothstep(0.08, 0.4, edge);
    // depth fog into black
    c *= exp(-max(G0.x - fogNear, 0.0) * fogK);
    body = c * cov;
  }

  // ---- analytic eyes (full resolution detail)
  for (int i = 0; i < NE; i++) {
    vec4 e = ePR[i];
    vec3 oc = ro - e.xyz;
    float bq = dot(oc, rd);
    // outer lid shell: is the ray passing through the aperture?
    float rs = e.w * 1.18;
    float hs = bq * bq - (dot(oc, oc) - rs * rs);
    if (hs < 0.0) continue;
    float ts = -bq - sqrt(hs);
    if (ts > tBody + e.w * 0.6 || ts < 0.0) continue;
    vec3 F = eF[i], Uu = eU[i], R = cross(Uu, F);
    vec3 dv = ro + rd * ts - e.xyz;
    vec3 q = vec3(dot(dv, R), dot(dv, Uu), dot(dv, F));
    if (q.z < 0.0) continue;
    float xn = clamp(q.x / rs, -1.0, 1.0);
    float hOpen = max(eOpen[i], 0.0) * e.w * 0.7 * (1.0 - xn * xn) * (1.18 / 1.1);
    float apert = hOpen - abs(q.y);
    // eyelid contour (or the closed slit): an ink line with a bone lash-line above it
    float pw = ts * 2.0 * tanF / 1080.0;
    float corner = smoothstep(1.0, 0.75, abs(xn));
    float lidLine = (1.0 - smoothstep(pw * 0.8, pw * 0.8 + e.w * 0.035 + pw, abs(apert))) * corner;
    if (apert <= 0.0) { body *= 1.0 - 0.95 * lidLine * cov; continue; }
    float hb = bq * bq - (dot(oc, oc) - e.w * e.w);
    if (hb < 0.0) continue;
    float tb = -bq - sqrt(hb);
    vec3 p = ro + rd * tb;
    vec3 n = normalize(p - e.xyz);
    vec3 g = eGaze[i];
    float ang = acos(clamp(dot(n, g), -1.0, 1.0));
    vec3 t1 = normalize(cross(g, abs(g.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 t2 = cross(g, t1);
    float a2 = atan(dot(n, t2), dot(n, t1));
    float irisA = 0.62, pupA = ePupil[i];
    float dif = max(dot(n, keyDir), 0.0);
    vec3 c;
    if (ang < irisA) {
      float rr = ang / irisA;
      float fib = irisPattern(a2, rr, float(i) * 3.1);
      vec3 ic = mix(C_BLOOD * 0.6, C_EMBER, fib) * (0.8 + 1.4 * smoothstep(1.0, 0.3, rr)) * (0.6 + eGlow[i]);
      ic *= smoothstep(1.0, 0.86, rr) * 0.9 + 0.1; // dark limbal ring
      c = ic * smoothstep(pupA / irisA - 0.02, pupA / irisA + 0.03, rr); // pupil
    } else {
      // sclera: engraved latitude lines around the gaze axis, dim bone
      float lat = hatch(ang * 20.0 / 1.0, 0.25 + 0.5 * dif);
      c = C_BONE * (0.1 + 0.35 * lat * (0.3 + 0.7 * dif));
    }
    // wet specular highlight
    vec3 hv = normalize(keyDir - rd);
    c += vec3(1.6, 1.5, 1.4) * pow(max(dot(n, hv), 0.0), 180.0);
    // lid shadow near the aperture edge + the lid contour
    c *= smoothstep(0.0, e.w * 0.2, apert);
    c *= 1.0 - lidLine;
    c *= exp(-max(tb - fogNear, 0.0) * fogK);
    body = mix(body, c, 1.0);
    tBody = tb;
  }
  body *= bodyK;

  // ---- the mask (analytic disc) and the x-ray band
  vec3 col = C_INK;
  float den = dot(rd, mN);
  float maskA = 0.0; vec3 maskCol = vec3(0.0); vec2 ml = vec2(9.0);
  float tMask = 1e9;
  if (abs(den) > 1e-4) {
    float tm = dot(mC - ro, mN) / den;
    if (tm > 0.0 && tm < tBody + 0.02) {
      tMask = tm;
      vec3 pm = ro + rd * tm - mC;
      ml = vec2(dot(pm, mRt), -dot(pm, mUp)) / mR;
      float r = length(ml);
      float fw = fwidth(r);
      maskA = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, r);
      // bland bone face with a faint engraved dome shading (light from upper left)
      vec3 nn = normalize(vec3(ml.x * 0.55, -ml.y * 0.55, 1.0));
      float lit = sat(dot(nn, normalize(vec3(-0.5, 0.6, 0.8))));
      float dark = sat(0.85 - lit) * 1.4;
      float hl = hatch((ml.y * 0.8 + ml.x * 0.25) * 70.0, dark * 0.5) * smoothstep(0.2, 0.6, dark);
      maskCol = C_BONE * (0.86 - 0.1 * (1.0 - lit)) * (1.0 - 0.55 * hl);
      maskCol *= 1.0 - 0.35 * smoothstep(0.93, 1.0, r); // rim of the disc
      float ink = sdMaskInk(ml);
      float fi = fwidth(ink);
      maskCol = mix(maskCol, C_INK, 1.0 - smoothstep(-fi, fi, ink));
      maskA *= mVis;
    }
  }
  // x-ray: inside the band (and in its wake) the mask is transparent
  float inBand = bandOn * (1.0 - smoothstep(bandW - 1.5, bandW + 1.5, abs(px.x - bandX)));
  float wake = bandOn * trailK * smoothstep(bandX - bandW + 2.0, bandX - bandW - 2.0, px.x);
  float xr = max(max(inBand, wake), xrayAll);
  // body visible: everywhere behind the (transparent) mask; outside the mask only dimly before the reveal
  float bodyVis = mix(outsideK, 1.0, max(xr, 1.0 - step(0.5, mVis)));
  col += body * bodyVis;
  if (inBand > 0.0) col += C_INK2 * 0.5 * inBand * (1.0 - cov);
  // mask: solid where not x-rayed; its ghost (outline + features) where x-rayed
  float ghost = 0.0;
  if (maskA > 0.0 || ml.x < 8.0) {
    float r = length(ml);
    float fw = fwidth(r);
    float ol = pxLine(abs(r - 1.0), 0.0, fw * 1.5);
    float ink = sdMaskInk(ml);
    float fo = pxLine(abs(ink), 0.0, fwidth(ink) * 1.5);
    ghost = max(ol, fo) * mVis;
  }
  col = mix(col, maskCol, maskA * (1.0 - xr));
  col += C_BONE * 0.55 * ghost * max(xr, ghostK) ;
  float maskShown = maskA * (1.0 - xr);

  // band furniture: edges, scanlines, leading-edge glow
  if (bandOn > 0.0) {
    float dl = abs(px.x - (bandX - bandW)), dr = abs(px.x - (bandX + bandW));
    col += C_BONE * 0.7 * bandOn * (smoothstep(1.2, 0.0, dl) + smoothstep(1.2, 0.0, dr));
    col += C_SIGNAL * 1.2 * bandOn * exp(-max(px.x - bandX - bandW, 0.0) / 6.0) * step(bandX + bandW - 1.0, px.x) * 0.6;
    float scan = 0.5 + 0.5 * sin(px.y * 2.1 + uT * 40.0);
    col *= 1.0 - 0.12 * inBand * scan;
  }

  // ---- the creature's engraved words (data texture: R = plane 0 glyphs, G = plane 1 glyphs, B = sung)
  // Solid engraved letters: an ink knock-out filled with horizontal burin lines (thicker toward the
  // cap line) and a short cross-hatch at the foot, cut in the word's own plane so the lines keep
  // perspective; tentacles and the opaque mask pass in front of them.
  vec3 tx = texture(textTex, uv).rgb;
  for (int k = 0; k < 2; k++) {
    float cov = k == 0 ? tx.r : tx.g;
    float den2 = dot(rd, tpN[k]);
    float tp = abs(den2) > 1e-5 ? dot(tpO[k] - ro, tpN[k]) / den2 : -1.0;
    vec3 hp = ro + rd * max(tp, 0.0) - tpO[k];
    float u = dot(hp, tpU[k]), v = dot(hp, tpV[k]);
    float h = sat(-v / tpCap[k]);
    float sp = tpCap[k] / 12.0;
    float fade = tpK[k];
    float la = elineLod(v / sp, mix(0.5, 0.88, h) * fade, 5.0);
    float lb = elineLod((u * 0.8 - v) / (sp * 1.15), sat(0.42 - h) * 1.2 * fade, 6.0);
    float lines = max(la, lb * 0.75);
    float vis = cov * step(0.0, tp) * step(0.001, fade);
    vis *= 1.0 - smoothstep(-0.03, 0.03, tp - tBody);   // body in front
    vis *= 1.0 - maskShown * step(tMask, tp);            // the opaque mask in front
    vis *= mix(1.0, xr, txXray);                          // behind the mask: only through the x-ray
    vec3 lc = mix(C_BONE * 0.42, mix(C_BONE * 0.95, C_EMBER * 1.25, tpHot[k]), tx.b);
    col = mix(col, C_INK, vis * 0.95 * fade);
    col += lc * lines * vis;
  }

  // ---- overlay: detection boxes, the mask's polite voice, shinigami tags
  vec4 ov = texture(overTex, uv);
  col = mix(col, ov.rgb, ov.a);

  if (!inside) col = C_INK;
  // ---- the flatline
  float dy = abs(px.y - 540.0);
  col += (C_SIGNAL * 2.2 * exp(-dy * dy / 3.0) + C_SIGNAL * 0.35 * exp(-dy / 10.0) + vec3(1.0, 0.8, 0.6) * 1.5 * exp(-dy * dy / 0.6)) * flatK;
  fragColor = vec4(col, 1.0);
}
`;
