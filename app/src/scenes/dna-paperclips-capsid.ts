// DNA edition, `paperclips` slot — part A's capsids (dna-paperclips.ts).
// A schematic T = 1 icosahedral capsid: 60 identical subunits, three per triangular face, five around
// each of the 12 five-fold vertices (a pentamer). Each subunit is a domed kite (five-fold vertex, edge
// midpoint, face centre, edge midpoint), inset so the shell reads as separate proteins. Shells are
// drawn as one instanced mesh: the vertex shader flies each subunit in (pentamer by pentamer) from a
// per-shell start time, the fragment shader engraves it (bone relief, surface-following hatching in
// the shadows, ink grooves between subunits, depth fog). Everything is a pure function of `uT`.
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/glsl/common';
import { hash } from '../engine/util';

type V3 = [number, number, number];

// ------------------------------------------------------------------ icosahedron
const PHI = (1 + Math.sqrt(5)) / 2;
export const ICO_V: V3[] = (() => {
  const v: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) { v.push([0, a, b * PHI]); v.push([a, b * PHI, 0]); v.push([b * PHI, 0, a]); }
  return v.map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as V3; });
})();
/** Faces as vertex-index triples, counter-clockwise seen from outside. */
export const ICO_F: [number, number, number][] = (() => {
  const n = ICO_V.length, e = 1.06; // edge length on the unit sphere is ~1.051
  const d = (i: number, j: number) => Math.hypot(ICO_V[i]![0] - ICO_V[j]![0], ICO_V[i]![1] - ICO_V[j]![1], ICO_V[i]![2] - ICO_V[j]![2]);
  const f: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    if (d(i, j) < e && d(j, k) < e && d(i, k) < e) {
      const a = ICO_V[i]!, b = ICO_V[j]!, c = ICO_V[k]!;
      const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const out = nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1]) + nz * (a[2] + b[2] + c[2]);
      f.push(out > 0 ? [i, j, k] : [i, k, j]);
    }
  }
  return f;
})();

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V3): V3 => sc(a, 1 / (len(a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The capsid's base geometry (unit vertex radius): 60 kites, each an n×n domed grid.
 * Attributes: position, normal, aKuv (kite param), aCen (kite centre, the fly-in pivot), aDel (0..1
 * arrival rank: pentamers arrive in a spiral from one pole, subunits of a pentamer nearly together),
 * aSub (subunit index, for per-subunit hashes).
 */
export function capsidGeometry(n = 4): THREE.InstancedBufferGeometry {
  const pos: number[] = [], nor: number[] = [], kuv: number[] = [], cen: number[] = [], del: number[] = [], sid: number[] = [], idx: number[] = [];
  // pentamer arrival order: sort the 12 vertices by height along a tilted axis (a spiral from one pole)
  const ax = nrm([0.3, 0.85, 0.42]);
  const order = ICO_V.map((v, i) => ({ i, h: dot(v, ax) + 0.08 * Math.atan2(v[2], v[0]) })).sort((a, b) => b.h - a.h);
  const rank = new Array(12).fill(0);
  order.forEach((o, r) => (rank[o.i] = r));
  const INSET = 0.9, SPH = 0.55, DOME = 0.075;
  let s = 0;
  for (const [a, b, c] of ICO_F) {
    const A = ICO_V[a]!, B = ICO_V[b]!, C = ICO_V[c]!;
    const G = sc(add(add(A, B), C), 1 / 3), Mab = sc(add(A, B), 0.5), Mbc = sc(add(B, C), 0.5), Mca = sc(add(C, A), 0.5);
    for (const [vi, V, M1, M2] of [[a, A, Mab, Mca], [b, B, Mbc, Mab], [c, C, Mca, Mbc]] as [number, V3, V3, V3][]) {
      const K = sc(add(add(add(V, M1), G), M2), 0.25);
      const surf = (u: number, v: number): V3 => {
        let P = add(add(sc(V, (1 - u) * (1 - v)), sc(M1, u * (1 - v))), add(sc(G, u * v), sc(M2, (1 - u) * v)));
        P = add(K, sc(sub3(P, K), INSET));
        const r = len(P), d = nrm(P);
        const rs = r + (0.93 - r) * SPH; // pull toward a sphere: the shell reads round, the facets stay visible
        const dome = DOME * Math.pow(Math.max(0, Math.sin(Math.PI * u) * Math.sin(Math.PI * v)), 0.7);
        return sc(d, rs + dome);
      };
      const base = pos.length / 3;
      const Kc = surf(0.5, 0.5);
      const dl = rank[vi]! / 12 + 0.035 * hash(s, 3);
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
        const u = i / n, v = j / n, e = 1e-3;
        const P = surf(u, v);
        const Pu = sub3(surf(Math.min(1, u + e), v), surf(Math.max(0, u - e), v));
        const Pv = sub3(surf(u, Math.min(1, v + e)), surf(u, Math.max(0, v - e)));
        let N = nrm(cross(Pu, Pv));
        if (dot(N, P) < 0) N = sc(N, -1);
        pos.push(...P); nor.push(...N); kuv.push(u, v); cen.push(...Kc); del.push(dl); sid.push(s);
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const i00 = base + j * (n + 1) + i, i10 = i00 + 1, i01 = i00 + n + 1, i11 = i01 + 1;
        idx.push(i00, i10, i11, i00, i11, i01);
      }
      s++;
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aKuv', new THREE.Float32BufferAttribute(kuv, 2));
  g.setAttribute('aCen', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('aDel', new THREE.Float32BufferAttribute(del, 1));
  g.setAttribute('aSub', new THREE.Float32BufferAttribute(sid, 1));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
precision highp float;
in vec3 position; in vec3 normal; in vec2 aKuv; in vec3 aCen; in float aDel; in float aSub;
in vec4 iPos; // xyz = centre, w = scale
in vec4 iQuat;
in vec2 iTime; // x = assembly start (song s), y = seed
uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
uniform float uT; uniform float uSpan; uniform float uFly;
out vec3 vN; out vec3 vW; out vec2 vKuv; out float vP; out float vSnap; out float vSeed;
vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 rotA(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
float h1(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
void main() {
  float ta = iTime.x + aDel * uSpan;
  float p = clamp((uT - ta) / uFly, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - p, 3.0);
  float sd = aSub * 1.618 + iTime.y * 7.31;
  vec3 k = normalize(vec3(h1(sd), h1(sd + 1.7), h1(sd + 3.1)) - 0.5 + 1e-3);
  float ang = (1.0 - e) * 2.4;
  vec3 rel = rotA(position - aCen, k, ang);
  vec3 lp = aCen * (1.0 + (1.0 - e) * 1.9) + rel * (0.45 + 0.55 * e);
  vec3 ln = rotA(normal, k, ang);
  vec3 w = iPos.xyz + qrot(iQuat, lp) * iPos.w;
  vN = qrot(iQuat, ln);
  vW = w; vKuv = aKuv; vP = p; vSeed = sd;
  vSnap = p >= 1.0 ? exp(-(uT - ta - uFly) * 9.0) : 0.0;
  gl_Position = p > 0.0 ? projectionMatrix * viewMatrix * vec4(w, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vN; in vec3 vW; in vec2 vKuv; in float vP; in float vSnap; in float vSeed;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 uCam; uniform vec3 uL; uniform vec2 uFog; uniform vec2 uPoolC; uniform vec2 uPoolR; uniform float uPoolMin;
void main() {
  if (vP <= 0.0) discard;
  vec3 N = normalize(vN), V = normalize(uCam - vW);
  float facing = dot(N, V);
  bool back = !gl_FrontFacing;
  if (back) N = -N;
  float lam = max(dot(N, uL), 0.0);
  float sh = 0.1 + 0.9 * pow(lam, 1.2);
  if (back) sh *= 0.22; // the hollow shell's inside, seen through the gaps
  // ink grooves between subunits (the kite border)
  vec2 q = vKuv;
  float de = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
  float fw = fwidth(de);
  float groove = 1.0 - smoothstep(0.02, 0.02 + 1.6 * fw, de);
  // surface-following hatching in the shadows; fades to tone where lines would crowd
  float u = (q.x + 0.35 * q.y) * 9.0;
  float dark = smoothstep(0.7, 0.08, sh);
  float hl = hatch(u, dark * 0.95);
  float lod = smoothstep(0.22, 0.42, fwidth(u) * PX_SCALE);
  float ink = mix(hl, dark * 0.5, lod);
  vec3 col = C_BONE * (0.1 + 0.66 * sh) * (1.0 - 0.88 * ink);
  col += C_BONE * vSnap * 0.35;                       // a subunit locking in
  col = mix(col, C_INK, groove * (back ? 0.4 : 0.92));
  // key-light pool across the frame (the lyric corner stays in shade) and depth fog
  vec2 pq = (FRAG_PX - vec2(uPoolC.x, 1080.0 - uPoolC.y)) / uPoolR;
  float pool = mix(uPoolMin, 1.0, exp(-dot(pq, pq)));
  float fog = smoothstep(uFog.x, uFog.y, length(uCam - vW));
  col *= pool * (1.0 - 0.86 * fog);
  col = mix(col, C_INK, 0.35 * fog);
  fragColor = vec4(col, 1.0);
}`;

export interface Shell { x: number; y: number; z: number; t0: number; seed: number; q: [number, number, number, number]; spin: V3; layer: number }

/** The instanced capsid field. `update` fills the per-frame instance buffers; `mesh` renders them. */
/** Shared uniforms of the capsid materials (one set for both batches). */
export function capsidUniforms(): Record<string, THREE.IUniform> {
  return {
    uT: { value: 0 }, uSpan: { value: 0.3 }, uFly: { value: 0.24 },
    uCam: { value: new THREE.Vector3() }, uL: { value: new THREE.Vector3(0.5, 0.62, 0.6).normalize() },
    uFog: { value: new THREE.Vector2(8, 30) }, uPoolC: { value: new THREE.Vector2(1280, 330) }, uPoolR: { value: new THREE.Vector2(1050, 620) }, uPoolMin: { value: 0.1 },
  };
}
/** Seconds after a shell's start when every subunit has landed (and its snap has faded). */
export const ASSEMBLED = 0.3 + 0.24 + 0.35;

/**
 * One instanced batch of shells. Two batches share the base geometry and uniforms: shells still
 * assembling render both faces (the hollow inside shows through the gaps), finished shells only
 * their outside (half the fragments).
 */
export class CapsidField {
  geo: THREE.InstancedBufferGeometry;
  mat: THREE.RawShaderMaterial;
  mesh: THREE.Mesh;
  iPos: THREE.InstancedBufferAttribute; iQuat: THREE.InstancedBufferAttribute; iTime: THREE.InstancedBufferAttribute;
  constructor(public cap: number, base: THREE.InstancedBufferGeometry, uniforms: Record<string, THREE.IUniform>, side: THREE.Side) {
    this.geo = new THREE.InstancedBufferGeometry();
    for (const k of ['position', 'normal', 'aKuv', 'aCen', 'aDel', 'aSub']) this.geo.setAttribute(k, base.getAttribute(k));
    this.geo.setIndex(base.index);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.iQuat = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.iTime = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    for (const a of [this.iPos, this.iQuat, this.iTime]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.iPos); this.geo.setAttribute('iQuat', this.iQuat); this.geo.setAttribute('iTime', this.iTime);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms, side, depthTest: true, depthWrite: true,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  /** Write the shells (already culled and time-filtered by the caller) into the instance buffers. */
  update(list: { x: number; y: number; z: number; s: number; q: [number, number, number, number]; t0: number; seed: number }[]) {
    const P = this.iPos.array as Float32Array, Q = this.iQuat.array as Float32Array, T = this.iTime.array as Float32Array;
    const n = Math.min(this.cap, list.length);
    for (let i = 0; i < n; i++) {
      const s = list[i]!;
      P[i * 4] = s.x; P[i * 4 + 1] = s.y; P[i * 4 + 2] = s.z; P[i * 4 + 3] = s.s;
      Q[i * 4] = s.q[0]; Q[i * 4 + 1] = s.q[1]; Q[i * 4 + 2] = s.q[2]; Q[i * 4 + 3] = s.q[3];
      T[i * 2] = s.t0; T[i * 2 + 1] = s.seed;
    }
    for (const a of [this.iPos, this.iQuat, this.iTime]) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); }
    this.geo.instanceCount = n;
    return n;
  }
}

/** Quaternion multiply (x, y, z, w). */
export function qmul(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qaxis(ax: V3, ang: number): [number, number, number, number] {
  const k = nrm(ax), s = Math.sin(ang / 2);
  return [k[0] * s, k[1] * s, k[2] * s, Math.cos(ang / 2)];
}
