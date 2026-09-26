// Shaders for FIG. 9 (paperclips): engraved-steel wire shading, the top-down split layer,
// and the raymarched infinite lattice (floor stack + descending ceiling stack).
import { SS_TAP_GLSL } from '../engine/gl';
import { GLSL_CLIP } from './paperclips-geo';

export const MAX_ITEMS = 64;
export const CELL = 40;
const CELLF = CELL.toFixed(1);

const GLSL_SHADE = /* glsl */ `
${SS_TAP_GLSL}
${GLSL_CLIP}
uniform vec3 camPos, camR, camU, camF; uniform float focal; uniform vec2 res; uniform float time;
uniform vec3 keyDir; uniform float keyI; uniform vec3 rimDir; uniform float rimI;
uniform vec3 lampPos; uniform float lampI;
vec2 rotv(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
vec3 camRay(out vec2 px) {
  px = vUv * res - 0.5 * res;
  return normalize(camF * focal + camR * px.x + camU * px.y);
}
/** Engraving line with an explicit footprint fw (lines per pixel): coverage of lines at integer u. */
float hatchW(float u, float darkness, float fw) {
  float f = abs(fract(u) - 0.5);
  float hw = 0.5 * clamp(darkness, 0.0, 1.0);
  float aa = max(fw, 1e-3);
  float l = 1.0 - smoothstep(hw - aa, hw + aa, 0.5 - f);
  return mix(l, clamp(darkness, 0.0, 1.0), smoothstep(0.3, 0.75, fw));
}
/**
 * Engraved steel: bone hairlines running along the wire (constant angle around the tube), swelling
 * where lit; a crisp specular line; a thin orange rim from the backlight. theta = angle around the
 * tube (0 at the inside edge, PI/2 on top, PI at the outside edge). wirePx = wire diameter on screen.
 */
vec3 shadeWireL(vec3 P, vec3 N, vec3 V, float theta, float wirePx, float shadow, float ao) {
  float dif = max(dot(N, keyDir), 0.0) * shadow;
  float tone = keyI * (0.02 + 0.98 * pow(dif, 1.6)) * mix(0.35, 1.0, ao);
  float nl = 7.0;
  float u = theta / PI * nl + 0.5;
  // footprint of one (super)sample: both passes take 4 samples per pixel
  float fw = nl / max(2.0 * wirePx * max(sin(theta), 0.2), 0.5);
  float cov = hatchW(u, pow(tone, 1.5) * 1.15, fw);
  vec3 Hh = normalize(keyDir + V);
  float spec = pow(max(dot(N, Hh), 0.0), 60.0) * keyI * shadow;
  vec3 col = C_BONE * 0.74 * cov + C_BONE * 0.85 * smoothstep(0.3, 0.6, spec);
  float nv = max(dot(N, V), 0.0);
  float rim = pow(sat(1.0 - nv), 5.0) * smoothstep(0.0, 0.7, dot(N, rimDir)) * rimI * smoothstep(3.0, 12.0, wirePx);
  col += C_SIGNAL * rim * 1.1;
  // the spark lamp: a little hot light on nearby wires
  vec3 Lv = lampPos - P; float Ld = length(Lv); Lv /= Ld;
  float fall = lampI * 60.0 / (Ld * Ld + 60.0);
  col += (C_SIGNAL * max(dot(N, Lv), 0.0) * fall * 1.2 + C_EMBER * pow(max(dot(N, normalize(Lv + V)), 0.0), 30.0) * fall * 2.0) * mix(0.5, 1.0, ao);
  return col;
}
vec3 shadeWire(vec3 P, vec3 N, vec3 V, float theta, float wirePx) { return shadeWireL(P, N, V, theta, wirePx, 1.0, 1.0); }
/** The spark lamp as seen by a ray (core + halo), in pixels from its projection. */
vec3 lampGlow(vec3 ro, vec3 rd, float tMax) {
  vec3 lp = lampPos - ro; float tl = dot(lp, rd);
  if (tl <= 0.0 || tl > tMax) return vec3(0.0);
  float apx = length(lp - rd * tl) / tl * focal;
  float core = exp(-apx * apx / 18.0) * 6.0;
  float halo = exp(-apx * apx / 700.0) * 0.45 + 0.025 / (1.0 + apx * apx / 12000.0);
  return (vec3(1.0, 0.85, 0.7) * core + C_SIGNAL * halo) * lampI;
}
`;

// Phase A: the flat layer seen from above (items animated on the CPU) + the infinite lattice flooding in.
export const FRAG_TOP = /* glsl */ `
${GLSL_SHADE}
uniform vec4 items[${MAX_ITEMS}];
uniform int nItems;
uniform float sT0, sH0, rad0, hot0, rad;
uniform float fillT; // seconds since the flood started (<0: none)
uniform vec2 groupHalf; // half extent of the CPU group (world)
float fillK(vec2 cell) {
  vec2 cc = (cell + 0.5) * ${CELLF};
  if (abs(cc.x) < groupHalf.x && abs(cc.y) < groupHalf.y) return -1.0; // inside the group
  if (fillT < 0.0) return 0.0;
  float dist = max(abs(cc.x) - groupHalf.x, abs(cc.y) - groupHalf.y);
  float t0 = dist / 1100.0 + hash12(cell) * 0.1;
  float k = clamp((fillT - t0) / 0.22, 0.0, 1.0);
  return 1.0 - pow(1.0 - k, 3.0);
}
vec3 topSample(vec2 px) {
  vec3 rd = normalize(camF * focal + camR * px.x + camU * px.y);
  float tp = -camPos.z / rd.z;
  vec3 P = camPos + rd * tp;
  vec2 xy = P.xy;
  float pxw = tp / focal; // world units per pixel on the plane
  float bd = 1e5, br = rad, bl = 0.0, sHit = 0.0; vec2 bo = vec2(0.0); int who = -1;
  for (int i = 0; i < ${MAX_ITEMS}; i++) {
    if (i >= nItems) break;
    vec4 it = items[i];
    vec2 q = xy - it.xy;
    if (dot(q, q) > 420.0 && i > 0) continue;
    vec2 lq = rotv(q, -it.z);
    float s, lat; vec2 cq;
    float sT = i == 0 ? sT0 : 0.0, sH = i == 0 ? sH0 : 1e3;
    float r = (i == 0 ? rad0 : rad) * it.w;
    float d2 = clipD(lq, sT, sH, s, lat, cq);
    if (d2 - r < bd - br) { bd = d2; br = r; bl = (lat < 0.0 ? -1.0 : 1.0) * d2; bo = rotv(lq - cq, it.z); sHit = s; who = i; }
  }
  // the flood: the infinite lattice beyond the group, cells popping in as a wave
  vec2 cell = floor(xy / ${CELLF});
  float fk = fillK(cell);
  if (fk > 0.0) {
    vec2 cc = (cell + 0.5) * ${CELLF};
    float ang = mod(cell.x + cell.y, 2.0) > 0.5 ? PI * 0.5 : 0.0;
    vec2 lp = rotv(xy - cc, -ang);
    float m = clamp(floor(lp.y / 10.0 + 2.0), 0.0, 3.0);
    for (int j = 0; j < 2; j++) {
      float mm = clamp(m + float(j) * (fract(lp.y / 10.0) > 0.5 ? 1.0 : -1.0), 0.0, 3.0);
      vec2 lq = (lp - vec2(0.0, (mm - 1.5) * 10.0)) / fk;
      float s, lat; vec2 cq;
      float d2 = clipD(lq, 0.0, 1e3, s, lat, cq) * fk;
      float r = rad * fk;
      if (d2 - r < bd - br) { bd = d2; br = r; bl = (lat < 0.0 ? -1.0 : 1.0) * d2; bo = rotv((lq - cq) * fk, ang); sHit = s; who = 999; }
    }
  }
  float z = sqrt(max(br * br - bd * bd, 0.0));
  vec3 N = normalize(vec3(bo, z + 1e-4));
  float theta = atan(z, bl);
  float cover = clamp(0.5 - (bd - br) / pxw, 0.0, 1.0);
  vec3 col = shadeWire(vec3(xy, z), N, -rd, theta, 2.0 * br / pxw);
  if (who == 0) {
    // item 0 while being drawn: white-hot at the pen, cooling fast to a dim orange hairline
    float behind = max(sH0 - sHit, 0.0);
    float hk = exp(-behind / 5.0);
    vec3 hotc = heat(0.42 + 0.58 * hk) * (0.9 + 3.5 * hk);
    col = mix(col, hotc, hot0);
  }
  vec3 bg = C_INK * (0.8 + 0.2 * smoothstep(1.1, 0.0, length(px / res.y)));
  return mix(bg, col, cover);
}
void main() {
  vec2 px0 = vUv * res - 0.5 * res;
  vec3 col = vec3(0.0);
  for (int k = ssK0(); k < ssK1(); k++) col += topSample(px0 + rgss(k) / PX_SCALE); // offsets within a physical px
  fragColor = vec4(col * ssWeight(), 1.0);
}`;

// Phases B–D: raymarched infinite lattice (floor stack + optional ceiling stack), fog, lamp.
export const FRAG_MARCH = /* glsl */ `
${GLSL_SHADE}
uniform float rad, pz, ceilZ, lowerOn, fogK, fogFar, fillT, slitK, slitH, horizonY;
uniform vec2 groupHalf;
float fillK(vec2 cell) {
  vec2 cc = (cell + 0.5) * ${CELLF};
  if (abs(cc.x) < groupHalf.x && abs(cc.y) < groupHalf.y) return 1.0;
  if (fillT < 0.0) return 0.0;
  float dist = max(abs(cc.x) - groupHalf.x, abs(cc.y) - groupHalf.y);
  float t0 = dist / 1100.0 + hash12(cell) * 0.1;
  float k = clamp((fillT - t0) / 0.22, 0.0, 1.0);
  return 1.0 - pow(1.0 - k, 3.0);
}
// one layer of basket-woven cells; q relative to the layer plane; k = layer index (seeds everything)
// info = (lateral, height, -, k)
float layerD(vec3 q, float k, out vec4 info) {
  info = vec4(0.0, 0.0, 0.0, k);
  if (abs(q.z) > 1.3) return abs(q.z) - 0.9;
  vec2 off = k > 0.5 ? floor(hash22(vec2(k, 7.3)) * 4.0) * ${CELLF} + vec2(0.0, ${(CELL / 2).toFixed(1)}) * mod(k, 2.0) : vec2(0.0);
  vec2 xy = q.xy + off;
  vec2 cell = floor(xy / ${CELLF});
  vec2 cc = (cell + 0.5) * ${CELLF};
  float ang = mod(cell.x + cell.y + k, 2.0) > 0.5 ? PI * 0.5 : 0.0;
  vec2 lp = rotv(xy - cc, -ang);
  float border = ${(CELL / 2).toFixed(1)} - max(abs(lp.x), abs(lp.y));
  float fk = k < 0.5 ? fillK(cell) : 1.0;
  if (fk <= 0.0) return max(border, 0.0) + 0.5;
  float m = clamp(floor(lp.y / 10.0 + 2.0), 0.0, 3.0);
  float best = 1e5;
  float jit = k > 0.5 ? 1.0 : 0.0;
  for (int j = 0; j < 2; j++) {
    float mm = clamp(m + float(j) * (fract(lp.y / 10.0) > 0.5 ? 1.0 : -1.0), 0.0, 3.0);
    vec3 h = hash33(vec3(cell, k * 7.0 + mm));
    if (jit > 0.5 && h.x < 0.1) continue; // a few missing clips in the deeper layers
    vec2 cp = vec2((h.y - 0.5) * 3.0 * jit, (mm - 1.5) * 10.0);
    vec2 lq = rotv(lp - cp, -(h.z - 0.5) * 0.08 * jit) / fk;
    float zz = q.z - (h.x - 0.5) * 0.3 * jit;
    // cheap bounding-box bound first
    vec3 bb = vec3(abs(lq.x - 0.275) - 16.2, abs(lq.y) - 4.05, abs(zz / fk) - 0.45);
    float bx = length(max(bb, 0.0)) * fk;
    if (bx > 0.35) { best = min(best, bx); continue; }
    float lat;
    float d2 = clipDL(lq, lat) * fk;
    float d = sqrt(d2 * d2 + zz * zz) - rad * fk;
    if (d < best) { best = d; info = vec4((lat < 0.0 ? -1.0 : 1.0) * d2, zz, 0.0, k); }
  }
  return min(best, max(border, 0.0) + 0.5);
}
float stackD(vec3 p, float base, float dirz, float seed, out vec4 info) {
  // layers at z = base + dirz * k * pz, k >= 0
  float h = (p.z - base) * dirz;
  float k0 = max(floor(h / -pz), 0.0);
  vec4 i0, i1;
  float d0 = layerD(vec3(p.xy, h + k0 * pz), k0 + seed, i0);
  float d1 = layerD(vec3(p.xy, h + (k0 + 1.0) * pz), k0 + 1.0 + seed, i1);
  if (d0 < d1) { info = i0; return d0; }
  info = i1; return d1;
}
float map(vec3 p, out vec4 info) {
  float d = stackD(p, 0.0, 1.0, 0.0, info);
  if (ceilZ < 900.0) {
    vec4 b;
    float dc = stackD(p, ceilZ, -1.0, 100.0, b);
    if (dc < d) { info = b; d = dc; }
  }
  return d;
}
float mapD(vec3 p) { vec4 i; return map(p, i); }
vec3 calcN(vec3 p, float e) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * mapD(p + k.xyy * e) + k.yyx * mapD(p + k.yyx * e) + k.yxy * mapD(p + k.yxy * e) + k.xxx * mapD(p + k.xxx * e));
}
vec3 fogCol(vec3 rd) {
  return C_INK * 0.9 + C_INK2 * 0.35 * exp(-abs(rd.z) * 18.0);
}
float softShadow(vec3 ro, vec3 rd, float eps) {
  // start clear of the surface we hit (eps grows with distance: the hit tolerance does too)
  float res = 1.0, t = 0.08 + 4.0 * eps;
  for (int i = 0; i < 28; i++) {
    float h = mapD(ro + rd * t);
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.04, 0.7);
    if (res < 0.02 || t > 14.0) break;
  }
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.04 + 0.22 * float(i);
    occ += (h - mapD(p + n * h)) * sca;
    sca *= 0.75;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}
vec3 shadeAt(vec3 ro, vec3 rd, float t) {
  vec3 P = ro + rd * t;
  vec4 info; map(P, info);
  vec3 N = calcN(P, 0.002 + 0.0006 * t);
  float wirePx = 2.0 * rad * focal / t;
  float fogA = 1.0 - exp(-t * fogK);
  float sh = 1.0, ao = 1.0;
  float eps = 0.1 * t / focal;
  // contact shadows and AO only where the wires are big enough on screen to read them
  float nearK = smoothstep(6.0, 16.0, wirePx);
  if (fogA < 0.97 && nearK > 0.0) {
    sh = mix(1.0, softShadow(P + N * (0.02 + 2.0 * eps), keyDir, eps), nearK);
    ao = mix(1.0, calcAO(P + N * eps, N), nearK);
  }
  vec3 c = shadeWireL(P, N, -rd, atan(info.y, info.x), wirePx, sh, ao);
  float k = info.w >= 100.0 ? info.w - 100.0 : info.w;
  c *= pow(0.5, k) * (k > 0.5 && info.w < 100.0 ? lowerOn : 1.0);
  return mix(c, fogCol(rd), fogA);
}
vec3 trace(vec3 rd) {
  vec3 ro = camPos;
  float pa = 1.0 / focal;
  bool hit = false; vec4 info;
  // skip the empty slab between the floor stack and the ceiling stack analytically
  float zTop = 0.75, zBot = ceilZ - 0.75;
  float t = 0.02;
  if (ro.z > zTop && ro.z < zBot) {
    float te = rd.z < -1e-5 ? (ro.z - zTop) / -rd.z : rd.z > 1e-5 ? (zBot - ro.z) / rd.z : 1e9;
    t = max(te - 0.05, 0.02);
  }
  float zDeep = -4.5 * pz;
  for (int i = 0; i < 128; i++) {
    if (t > fogFar) break;
    vec3 p = ro + rd * t;
    float d = map(p, info);
    float pr = t * pa;
    if (d < 0.1 * pr) { hit = true; break; }
    t += max(d * 0.9, pr * (0.2 + t * 0.003));
    if (p.z < zDeep) { t = 1e5; break; }
  }
  vec3 col = hit ? shadeAt(ro, rd, t) : fogCol(rd);
  return col + lampGlow(ro, rd, hit ? t : 1e5);
}
void main() {
  vec2 px0 = vUv * res - 0.5 * res;
  // 4-tap rotated-grid supersampling: crisp silhouettes and engraving without shimmer
  vec3 col = vec3(0.0);
  for (int k = ssK0(); k < ssK1(); k++) {
    vec2 px = px0 + rgss(k) / PX_SCALE; // offsets within a physical px
    vec3 rd = normalize(camF * focal + camR * px.x + camU * px.y);
    col += trace(rd);
  }
  col *= ssWeight();
  vec2 px = px0;
  float sm = smoothstep(slitH + 30.0, slitH, abs(px.y - horizonY));
  col *= mix(1.0, sm, slitK);
  fragColor = vec4(col, 1.0);
}`;
