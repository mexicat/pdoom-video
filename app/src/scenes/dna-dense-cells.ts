// The cell field of the DNA edition's `dense` slot, drawn as instanced engraved cells: each instance is a
// disc clipped by the radical axes to its overlapping neighbours (a power diagram, so a field that grows
// becomes confluent, and a cell that divides pinches along the line between its daughters), by the
// basement membrane and by the lyric's slots, then engraved in the shader: bone paper, 45° hatching that
// darkens toward the lower right, an ink membrane line, a nucleus with stippled chromatin and a nucleolus
// (hook4's look, so the field hands over into hook4 unchanged). World units are dense px.
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/glsl/common';
import { W, H, rtScale } from '../engine/gl';
import { hash, clamp, ease, prog, lerp } from '../engine/util';
import { CellField, Grid, MEMBRANE_Y, wobbleAmp, type CellNode } from './dna-dense-field';

const NH = 8; // half-planes per cell
const FLOATS = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]; // iA, iH0..iH5, iN, iM, iW, iL, iR

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec4 iA; in vec4 iH0; in vec4 iH1; in vec4 iH2; in vec4 iH3; in vec4 iH4; in vec4 iH5;
in vec4 iN; in vec4 iM; in vec4 iW; in vec4 iL; in vec4 iR;
uniform vec4 uCam; // world centre x, y; zoom; rotation
out vec2 vQ;
flat out vec4 vA; flat out vec4 vH0; flat out vec4 vH1; flat out vec4 vH2; flat out vec4 vH3; flat out vec4 vH4; flat out vec4 vH5;
flat out vec4 vN; flat out vec4 vM; flat out vec4 vW; flat out vec4 vL; flat out vec4 vR;
void main() {
  float R = iA.z * 1.3 * max(1.0, iW.z) + 4.0 / uCam.z;
  vec2 q = position.xy * R;
  vec2 d = iA.xy + q - uCam.xy;
  float c = cos(uCam.w), s = sin(uCam.w);
  vec2 S = vec2(960.0, 540.0) + uCam.z * vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  gl_Position = vec4(S.x / 960.0 - 1.0, 1.0 - S.y / 540.0, 0.0, 1.0);
  vQ = q; vA = iA; vH0 = iH0; vH1 = iH1; vH2 = iH2; vH3 = iH3; vH4 = iH4; vH5 = iH5; vN = iN; vM = iM; vW = iW; vL = iL; vR = iR;
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vQ;
flat in vec4 vA; flat in vec4 vH0; flat in vec4 vH1; flat in vec4 vH2; flat in vec4 vH3; flat in vec4 vH4; flat in vec4 vH5;
flat in vec4 vN; flat in vec4 vM; flat in vec4 vW; flat in vec4 vL; flat in vec4 vR;
uniform vec4 uCam;
uniform float uYm; uniform float uK; uniform float uMemGap;
uniform vec4 uBox[4]; uniform float uBoxPad;
uniform sampler2D uPaper; uniform vec2 uRes;
uniform float uLineW; uniform float uAlpha;
out vec4 fragColor;
${GLSL_COMMON}
float hp(vec2 q, vec3 h) { return dot(q, h.xy) - h.z; }
void main() {
  vec2 q = vQ; float r = vA.z;
  // anisotropy (a cell squeezing through the membrane): stretch sx along angle
  vec2 qa = q;
  if (abs(vW.z - 1.0) > 1e-3) { float c = cos(vW.w), s = sin(vW.w); vec2 u = vec2(c * q.x + s * q.y, -s * q.x + c * q.y); qa = vec2(u.x / vW.z, u.y * vW.z); }
  float th = atan(qa.y, qa.x);
  float rr = r * (1.0 + vM.y * (0.07 * sin(3.0 * th + vW.x) + 0.045 * sin(5.0 * th + vW.y)));
  float d = length(qa) - rr;
  float k = uK;
  d = smax(d, hp(q, vH0.xyz), k); d = smax(d, hp(q, vec3(vH0.w, vH1.xy)), k);
  d = smax(d, hp(q, vec3(vH1.zw, vH2.x)), k); d = smax(d, hp(q, vH2.yzw), k);
  d = smax(d, hp(q, vH3.xyz), k); d = smax(d, hp(q, vec3(vH3.w, vH4.xy)), k);
  d = smax(d, hp(q, vec3(vH4.zw, vH5.x)), k); d = smax(d, hp(q, vH5.yzw), k);
  vec2 p = vA.xy + q;
  if (vM.z < 0.5) d = smax(d, p.y - (uYm - uMemGap), k);
  // the lyric's slots (screen px): the type presses the field aside
  vec2 sp = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  for (int i = 0; i < 4; i++) {
    if (uBox[i].z > 0.5) d = smax(d, (uBoxPad - sdBox(sp - uBox[i].xy, uBox[i].zw)) / uCam.z, k * 1.5);
  }
  float aa = max(fwidth(d), 1e-4);
  float cov = 1.0 - smoothstep(-aa, aa, d);
  if (cov <= 0.001) discard;
  vec3 paper = texture(uPaper, gl_FragCoord.xy / uRes).rgb;
  float lw = uLineW; // world units per 1x px of line
  // hatching: lines of slope +1 every 4.2 px of x (hook4's), fading in toward the lower right
  float rad = vR.x;
  float u = (p.x - p.y - vL.w) / 4.2;
  float tt = (q.x + q.y + rad) / (2.8 * rad);
  float ga = tt < 0.5 ? 0.06 * clamp(tt / 0.5, 0.0, 1.0) : mix(0.06, 0.42, clamp((tt - 0.5) / 0.5, 0.0, 1.0));
  float ink = hatch(u, 0.303 * lw / 1.0) * ga;
  // membrane: an ink line just inside the edge
  float ml = 1.0 - smoothstep(0.65 * lw - aa, 0.65 * lw + aa, abs(d + 0.7 * lw));
  ink = max(ink, 0.5 * ml);
  // nucleus
  if (vR.y > 0.5) {
    vec2 nq = q - vN.xy;
    float c = cos(-vN.w), s = sin(-vN.w);
    vec2 lq = vec2(c * nq.x - s * nq.y, s * nq.x + c * nq.y);
    float rx = vN.z, ry = vN.z * vM.x;
    float a = atan(lq.y / ry, lq.x / rx);
    float j = 1.0 + 0.07 * sin(a * 3.0 + vM.w) + 0.05 * sin(a * 5.0 + vM.w * 2.0);
    float nd = (length(lq / vec2(rx, ry)) - j) * min(rx, ry);
    float nIn = 1.0 - smoothstep(-aa, aa, nd);
    ink = max(ink, 0.07 * nIn);
    // stippled chromatin
    vec2 gq = lq / (3.4 * lw);
    vec2 id = floor(gq), fq = fract(gq) - 0.5;
    float h1 = hash12(id + vA.w * 17.0);
    if (h1 < 0.6 && nd < -1.0 * lw) {
      vec2 o = (hash22(id + vA.w * 5.0) - 0.5) * 0.5;
      float dr = (0.7 + 0.9 * hash12(id + 3.1)) / 3.4;
      float dd = length(fq - o) - dr;
      float daa = max(fwidth(dd), 1e-4);
      ink = max(ink, (0.25 + 0.3 * h1 / 0.6) * (1.0 - smoothstep(-daa, daa, dd)));
    }
    float ol = 1.0 - smoothstep(0.55 * lw - aa, 0.55 * lw + aa, abs(nd));
    ink = max(ink, 0.5 * ol);
    if (vL.z > 0.0) {
      float nl = length(nq - vL.xy) - vL.z;
      float naa = max(fwidth(nl), 1e-4);
      ink = max(ink, 0.55 * (1.0 - smoothstep(-naa, naa, nl)));
    }
  }
  vec3 col = mix(paper, C_INK, ink);
  float A = cov * uAlpha;
  fragColor = vec4(col * A, A);
}`;

export interface CellDraw {
  node: CellNode; x: number; y: number; r: number;
  exempt?: boolean; sx?: number; ang?: number;
}
export interface NucParams { ox: number; oy: number; rx: number; asp: number; rot: number; ph: number; nl: [number, number, number] | null; rad: number; hph: number; has: boolean }

/** Nucleus parameters per node, normalised to its nominal radius (hook4's exact ones for its cells). */
export function nucleusParams(field: CellField): NucParams[] {
  return field.nodes.map((n) => {
    const h4 = n.level === 4 && n.id < field.hook4.length ? field.hook4[n.id]! : null;
    if (h4 && h4.nuc && h4.rad > 0) {
      const u = h4.nuc;
      return {
        ox: (u.nx - h4.s.x) / n.rho, oy: (u.ny - h4.s.y) / n.rho, rx: u.rx / n.rho, asp: u.ry / u.rx, rot: u.rot, ph: u.ph,
        nl: u.nl ? [Math.cos(u.nl[0]) * u.rx * u.nl[1] / n.rho, Math.sin(u.nl[0]) * u.ry * u.nl[1] / n.rho, u.nl[2] / n.rho] : null,
        rad: h4.rad / n.rho, hph: h4.s.x - h4.s.y - 2.2 * h4.rad, has: true,
      };
    }
    if (h4 && !h4.nuc) return { ox: 0, oy: 0, rx: 0.3, asp: 1, rot: 0, ph: 0, nl: null, rad: h4.rad > 0 ? h4.rad / n.rho : 0.95, hph: h4.s.x - h4.s.y - 2.2 * (h4.rad || n.rho), has: false };
    const R = (k: number) => hash(n.id, 31, k);
    const rad = 0.95, rx = rad * (0.3 + R(3) * 0.12);
    return {
      ox: (R(1) - 0.5) * rad * 0.35, oy: (R(2) - 0.5) * rad * 0.35, rx, asp: 0.72 + R(4) * 0.22, rot: R(5) * Math.PI, ph: R(6) * 10,
      nl: R(7) < 0.65 ? [Math.cos(R(8) * 6.283) * rx * R(9) * 0.45, Math.sin(R(8) * 6.283) * rx * R(9) * 0.45, Math.max(0.04, 0.055 * rad)] : null,
      rad, hph: n.x - n.y - 2.2 * n.rho, has: R(10) > 0.05,
    };
  });
}

export class CellLayer {
  geo = new THREE.InstancedBufferGeometry();
  mat: THREE.RawShaderMaterial;
  mesh: THREE.Mesh;
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  arr: Float32Array[];
  attrs: THREE.InstancedBufferAttribute[];
  count = 0;
  /** A node whose half-planes are kept (for the signalling diagram drawn on it). */
  watch = -1; watchHP: Float32Array | null = null;
  constructor(public cap: number, paper: THREE.Texture) {
    const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    this.geo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    const names = ['iA', 'iH0', 'iH1', 'iH2', 'iH3', 'iH4', 'iH5', 'iN', 'iM', 'iW', 'iL', 'iR'];
    this.arr = FLOATS.map((n) => new Float32Array(cap * n));
    this.attrs = this.arr.map((a, i) => { const at = new THREE.InstancedBufferAttribute(a, FLOATS[i]!); at.setUsage(THREE.DynamicDrawUsage); return at; });
    names.forEach((nm, i) => this.geo.setAttribute(nm, this.attrs[i]!));
    const boxes = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0));
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uCam: { value: new THREE.Vector4(960, 540, 1, 0) }, uYm: { value: MEMBRANE_Y }, uK: { value: 4 }, uMemGap: { value: 9 },
        uBox: { value: boxes }, uBoxPad: { value: 20 }, uPaper: { value: paper }, uRes: { value: new THREE.Vector2(W, H) },
        uLineW: { value: 1 }, uAlpha: { value: 1 },
      },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, side: THREE.DoubleSide,
    });
    const m = this.mat;
    m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  get u() { return this.mat.uniforms; }

  /**
   * Fill the instances: `cells` (visible ones first are not required) with their neighbours' radical
   * axes. `axisW` blends the radical axis (1) toward the plain bisector (0, hook4's Voronoi).
   */
  set(cells: CellDraw[], nuc: NucParams[], f: number, axisW: number, gap: number, view: { x0: number; y0: number; x1: number; y1: number }) {
    // A divided or offscreen watched cell must not inherit the last frame's receptor boundary.
    this.watchHP = null;
    const n = cells.length;
    const flat = new Float32Array(n * 2);
    let rMax = 1;
    cells.forEach((c, i) => { flat[i * 2] = c.x; flat[i * 2 + 1] = c.y; rMax = Math.max(rMax, c.r); });
    const g = new Grid(flat, n, Math.max(20, rMax * 1.2));
    const [A, H0, H1, H2, H3, H4, H5, N, M, Wv, L, R] = this.arr as [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
    const hs = [H0, H1, H2, H3, H4, H5];
    const cand: { j: number; d: number }[] = [];
    const hpBuf = new Float32Array(NH * 3);
    let k = 0;
    const wob = wobbleAmp(f);
    for (let i = 0; i < n && k < this.cap; i++) {
      const c = cells[i]!;
      const ext = c.r * 1.35 * Math.max(1, c.sx ?? 1);
      if (c.x + ext < view.x0 || c.x - ext > view.x1 || c.y + ext < view.y0 || c.y - ext > view.y1) continue;
      cand.length = 0;
      g.near(c.x, c.y, c.r + rMax, (j) => {
        if (j === i) return;
        const o = cells[j]!, dx = o.x - c.x, dy = o.y - c.y, D = Math.hypot(dx, dy);
        if (D < c.r + o.r && D > 1e-3) cand.push({ j, d: D });
      });
      cand.sort((a, b) => a.d - b.d);
      hpBuf.fill(0);
      for (let q = 0; q < NH; q++) {
        if (q < cand.length) {
          const o = cells[cand[q]!.j]!, D = cand[q]!.d, nx = (o.x - c.x) / D, ny = (o.y - c.y) / D;
          const a = D / 2 + axisW * (c.r * c.r - o.r * o.r) / (2 * D);
          hpBuf[q * 3] = nx; hpBuf[q * 3 + 1] = ny; hpBuf[q * 3 + 2] = a - gap;
        } else { hpBuf[q * 3] = 0; hpBuf[q * 3 + 1] = 0; hpBuf[q * 3 + 2] = 1e5; }
      }
      for (let q = 0; q < 24; q++) hs[q >> 2]![k * 4 + (q & 3)] = hpBuf[q]!;
      const np = nuc[c.node.id]!;
      const eff = c.node.rho * Math.min(f, 1); // the nucleus grows with the cell until it is confluent
      A[k * 4] = c.x; A[k * 4 + 1] = c.y; A[k * 4 + 2] = c.r; A[k * 4 + 3] = hash(c.node.id, 9) * 97;
      N[k * 4] = np.ox * eff; N[k * 4 + 1] = np.oy * eff; N[k * 4 + 2] = np.rx * eff; N[k * 4 + 3] = np.rot;
      M[k * 4] = np.asp; M[k * 4 + 1] = wob; M[k * 4 + 2] = c.exempt ? 1 : 0; M[k * 4 + 3] = np.ph;
      Wv[k * 4] = c.node.w1; Wv[k * 4 + 1] = c.node.w2; Wv[k * 4 + 2] = c.sx ?? 1; Wv[k * 4 + 3] = c.ang ?? 0;
      if (np.nl) { L[k * 4] = np.nl[0] * eff + np.ox * eff; L[k * 4 + 1] = np.nl[1] * eff + np.oy * eff; L[k * 4 + 2] = Math.max(1.5, np.nl[2] * eff); }
      else { L[k * 4] = 0; L[k * 4 + 1] = 0; L[k * 4 + 2] = 0; }
      L[k * 4 + 3] = np.hph;
      R[k * 4] = Math.max(8, np.rad * eff); R[k * 4 + 1] = np.has ? 1 : 0; R[k * 4 + 2] = 0; R[k * 4 + 3] = 0;
      if (c.node.id === this.watch) this.watchHP = hpBuf.slice();
      k++;
    }
    this.count = k;
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget) {
    if (this.count === 0) return;
    this.attrs.forEach((a) => { a.needsUpdate = true; a.addUpdateRange(0, this.count * a.itemSize); });
    this.geo.instanceCount = this.count;
    const s = rtScale(out);
    (this.u.uRes!.value as THREE.Vector2).set(out.width, out.height);
    void s;
    renderer.setRenderTarget(out);
    renderer.render(this.scene, this.cam);
    this.attrs.forEach((a) => a.clearUpdateRanges());
  }
}

/** A node's position at t: born at its parent's split, it slides out from the parent over 0.3 s. */
export function nodePos(field: CellField, n: CellNode, t: number): { x: number; y: number } {
  if (n.parent < 0 || !(t < n.tBirth + 0.3)) return { x: n.x, y: n.y };
  const p = field.nodes[n.parent]!;
  if (p.kids.length < 2) return { x: n.x, y: n.y };
  const e = ease.outCubic(clamp((t - n.tBirth) / 0.3));
  const sx = p.x + (n.x - p.x) * 0.14, sy = p.y + (n.y - p.y) * 0.14;
  return { x: lerp(sx, n.x, e), y: lerp(sy, n.y, e) };
}
void prog;
