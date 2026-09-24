// FIG. 2 `loss` — "Training loss, suddenly".
// A hairline log-scale chart draws in from black; the spark draws a noisy loss plateau while
// the lyric rides the curve. On "drop" the curve falls off a grokking cliff, the camera falls
// with it out of the bottom of the chart into a 3D loss landscape engraved as illuminated
// contour lines (the log-loss levels continue the chart's axis), the spark descending a canyon
// (the only orange thing) toward a sharp minimum. "now I'm your servant and you're my boss":
// typographic hierarchy inversion; the world rolls 180° on "boss" and dives into the minimum
// (hard cut into the pre-chorus).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { W, H, clearRT, Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, type TextLayout } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { GLSL_COMMON } from '../engine/glsl/common';
import { sparkHead, sparkParticles } from './_motifs';
import { PDoom, formatPDoom } from '../engine/hud';
import { clamp, lerp, ease, prog, pulse, noise1, smoothstep, TAU } from '../engine/util';

// ------------------------------------------------------------------ terrain (JS + GLSL twins)
// Terrain local coords: u = x - X0 (across), v = -z (along the canyon, away from the chart).
const VB = 11.5; // basin centre (along)
const KPIT = 1.3, EPS = 0.07, SIG = 2.6; // the sharp minimum
const cuF = (v: number) => 2.0 * Math.sin(v * 0.2) + 1.0 * Math.sin(v * 0.47 + 0.9) - 1.0 * Math.sin(0.9);
const UB = cuF(VB);
const smin = (a: number, b: number, k: number) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
};
const BOWL0 = -0.62 * VB - 1.2;
function terrH(u: number, v: number, pit = true): number {
  const s = Math.sin;
  const hills = 1.0 * s(0.42 * u + 0.6 * s(0.31 * v)) * s(0.37 * v + 0.5 * s(0.29 * u))
    + 0.5 * s(0.93 * u + 0.4 * v + 1.3) * s(0.81 * v - 0.3 * u)
    + 0.22 * s(2.1 * u + 1.7 * v) * s(1.9 * v - 1.3 * u + 0.4)
    + 0.1 * s(4.3 * u - 3.1 * v) * s(3.7 * v + 2.9 * u);
  const rim = 2.8 + hills - 0.16 * v + 0.012 * u * u;
  const vc = clamp(v, 0, VB);
  const fl = -0.62 * vc;
  const d = u - cuF(v);
  const w = 0.9 + 0.08 * vc;
  const k = smoothstep(0.25 * w, 1.9 * w, Math.abs(d));
  let h = lerp(fl, rim, k);
  h = lerp(rim, h, smoothstep(-2.0, 0.8, v));
  const bu = u - UB, bv = v - VB, r2 = bu * bu + bv * bv;
  h = smin(h, BOWL0 + 0.07 * r2, 2.5);
  if (pit) h -= (KPIT / Math.sqrt(r2 + EPS * EPS)) * Math.exp(-r2 / (SIG * SIG));
  return h;
}
const TERRAIN_GLSL = /* glsl */ `
const float VB = ${VB.toFixed(4)};
const float UB = ${UB.toFixed(6)};
float cuF(float v) { return 2.0 * sin(v * 0.2) + 1.0 * sin(v * 0.47 + 0.9) - 1.0 * sin(0.9); }
float sminT(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float terrH(vec2 q) {
  float u = q.x, v = q.y;
  float hills = 1.0 * sin(0.42 * u + 0.6 * sin(0.31 * v)) * sin(0.37 * v + 0.5 * sin(0.29 * u))
    + 0.5 * sin(0.93 * u + 0.4 * v + 1.3) * sin(0.81 * v - 0.3 * u)
    + 0.22 * sin(2.1 * u + 1.7 * v) * sin(1.9 * v - 1.3 * u + 0.4)
    + 0.1 * sin(4.3 * u - 3.1 * v) * sin(3.7 * v + 2.9 * u);
  float rim = 2.8 + hills - 0.16 * v + 0.012 * u * u;
  float vc = clamp(v, 0.0, VB);
  float fl = -0.62 * vc;
  float d = u - cuF(v);
  float w = 0.9 + 0.08 * vc;
  float k = smoothstep(0.25 * w, 1.9 * w, abs(d));
  float h = mix(fl, rim, k);
  h = mix(rim, h, smoothstep(-2.0, 0.8, v));
  vec2 b = q - vec2(UB, VB);
  float r2 = dot(b, b);
  h = sminT(h, ${BOWL0.toFixed(5)} + 0.07 * r2, 2.5);
  h -= ${KPIT.toFixed(4)} / sqrt(r2 + ${(EPS * EPS).toFixed(6)}) * exp(-r2 / ${(SIG * SIG).toFixed(4)});
  return h;
}`;

const TERRAIN_VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelMatrix; uniform mat4 viewMatrix; uniform mat4 projectionMatrix;
uniform float uX0, uYR;
out vec3 vW;
${TERRAIN_GLSL}
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  p.y = uYR + terrH(vec2(p.x - uX0, -p.z));
  vW = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const TERRAIN_FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec3 vW;
out vec4 fragColor;
${GLSL_COMMON}
${TERRAIN_GLSL}
uniform float uX0, uYR, uRevR, uRipT, uBright, uFogStart, uFogLen, uHatch, uTime, uMinor, uIndex;
uniform vec3 uCam; uniform vec2 uRevC, uRipC; uniform vec4 uPulse;

float contour(float c, float wpx) {
  float fwP = max(fwidth(c), 1e-5), fw = fwP * PX_SCALE; // contour interval per physical / logical px
  float d = abs(fract(c + 0.5) - 0.5) / fwP;
  float cov = pxLine(d, wpx * 0.5 - 0.5, wpx * 0.5 + 0.5);
  float mean = clamp(wpx * fw, 0.0, 1.0);
  return mix(cov, mean * 0.45, smoothstep(0.16, 0.42, fw));
}

void main() {
  vec2 q = vec2(vW.x - uX0, -vW.z);
  float h = terrH(q);
  float e = 0.02;
  float hu = (terrH(q + vec2(e, 0.0)) - terrH(q - vec2(e, 0.0))) / (2.0 * e);
  float hv = (terrH(q + vec2(0.0, e)) - terrH(q - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-hu, 1.0, hv));
  float slope = length(vec2(hu, hv));
  vec3 L = normalize(vec3(-0.55, 0.7, 0.45));
  float lamb = sat(dot(n, L));
  vec2 nx = n.xz / max(length(n.xz), 1e-4);
  float aspect = dot(nx, normalize(L.xz));
  float tanaka = sat(0.5 + 0.55 * aspect * sat(slope * 1.2));

  // impact ripple (visual only)
  float rd = length(q - uRipC);
  float rip = 0.0;
  if (uRipT > 0.0) rip = 0.45 * sin(rd * 3.2 - uRipT * 15.0) * exp(-abs(rd - uRipT * 9.0) * 0.8) * exp(-uRipT * 1.4);
  float y = uYR + h + rip; // world height = log-loss level

  float minor = contour(y / uMinor, 1.05);
  float index = contour(y / uIndex, 2.1);
  float pulseB = 0.0;
  for (int i = 0; i < 4; i++) pulseB += exp(-abs(y - uPulse[i]) * 2.4);

  vec3 col = C_INK;
  col += C_INK2 * lamb * 0.7;
  float lb = mix(0.10, 1.0, tanaka);
  col += C_BONE * minor * (0.36 * lb + 0.55 * pulseB);
  col += C_BONE * index * (mix(0.22, 0.95, tanaka) + 0.7 * pulseB);

  // hachures: lines running down the slopes (across the canyon; radial in the pit)
  vec2 bq = q - vec2(UB, VB);
  float wb = exp(-dot(bq, bq) / 30.0);
  float ang = atan(bq.y, bq.x);
  float hc = mix(q.y * 9.0 + 0.8 * sin(q.x * 1.3), ang * 90.0 / TAU, wb);
  float hk = sat(slope * 0.5 - 0.15) * mix(0.15, 0.85, lamb) * uHatch;
  // staggered per contour band, with a gap at each contour (short strokes, like engraved hachures)
  float band = floor(y / uMinor), fb = fract(y / uMinor);
  float gap = smoothstep(0.08, 0.22, fb) * smoothstep(0.92, 0.78, fb);
  col += C_ASH * hatch(hc + hash11(band * 7.13) * 3.0, hk * 0.5) * 0.4 * gap;

  // fog, reveal, edges
  float dist = length(vW - uCam);
  float fog = exp(-max(dist - uFogStart, 0.0) / uFogLen);
  float rv = length(q - uRevC);
  float reveal = smoothstep(uRevR, uRevR - 3.0, rv);
  float front = exp(-abs(rv - uRevR) * 1.4) * step(0.0, uRevR) * (1.0 - smoothstep(24.0, 36.0, uRevR));
  float edge = smoothstep(0.0, 4.0, 21.5 - abs(q.x)) * smoothstep(-12.0, -8.0, q.y) * smoothstep(0.0, 4.0, 29.0 - q.y);
  col = mix(C_INK, col, fog * reveal * edge * uBright);
  col += C_BONE * (minor + index) * front * 0.9 * fog * edge;
  fragColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ chart constants
const DEC = 2.2; // world units per decade (chart y and terrain heights share this log scale)
const yOfLog = (l: number) => (l + 2) * DEC; // y=0 is 1e-2 (chart floor), top 1e1
const CW = 14; // chart width (world)
const YR = -8.2; // terrain base level (world y)
const TXT = 0.8; // chart lyric size (world units)
const TXT3 = 0.62; // canyon lyric size (world units)
const SPACE_EM = 0.14; // extra word spacing (em)

type P3 = { x: number; y: number; z: number };
type Proj = { x: number; y: number; s: number; w: number };
type Cam = { pos: P3; tgt: P3; roll: number; fov: number };

function findWord(line: Line, q: string, from = 0): Word {
  const n = norm(q);
  for (let i = from; i < line.words.length; i++) if (norm(line.words[i]!.w) === n) return line.words[i]!;
  throw new Error(`word not found: ${q}`);
}
/** Layout with extra space after word gaps. */
function spacedLayout(text: string, fam: string, extraEm: number): TextLayout {
  const lay = layout(text, fam, 100, 0);
  let shift = 0;
  for (const g of lay.glyphs) {
    g.x += shift;
    if (g.ch === ' ') { g.w += extraEm * 100; shift += extraEm * 100; }
  }
  lay.width += shift;
  return lay;
}
const orbit = (tgt: P3, yaw: number, pitch: number, dist: number): P3 => ({
  x: tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist,
  y: tgt.y + Math.sin(pitch) * dist,
  z: tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist,
});
const lerp3 = (a: P3, b: P3, k: number): P3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });

interface PathGlyph { ch: string; s: number; w: number; t0: number; t1: number; word: Word }
interface MapLabel { p: P3; ang: P3; text: string; sub?: string; kind: 'contour' | 'min' | 'pit' | 'pdoom' }

export default class LossScene extends Scene {
  cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 400);
  vp = new THREE.Matrix4();
  v4 = new THREE.Vector4();
  terrScene = new THREE.Scene();
  terrMat!: THREE.RawShaderMaterial;
  lines3 = new LineBatch(40000, { screen2D: false, depthTest: true, blend: 'add' });
  lines2 = new LineBatch(6000, { screen2D: true, blend: 'add' });
  text = new Layer2D();

  // timing (all derived from lyrics & beat grid)
  L1!: Line; L2!: Line;
  T0 = 0; T1 = 0;
  tThere = 0; tSudden = 0; tDrop = 0; tIn = 0; tLossEnd = 0;
  tNow = 0; tServ = 0; tAnd = 0; tBoss = 0;
  dbs: number[] = [];
  tPush = 0; tCut1 = 0; tCut2 = 0; tRoll = 0;

  // chart
  famLyric = F.archivo(100, 800);
  lay1!: TextLayout; // "There was a sudden"
  words1: Word[] = [];
  xText0 = 1.0;
  xC = 10; // cliff x
  xSpike = 7;
  yPlat = 6;
  gFall = 60;
  yLand = -6;

  // canyon
  center: P3[] = []; centerS: number[] = [];
  glyphs3: PathGlyph[] = [];
  s3Start = 0;
  labels: MapLabel[] = [];
  pd!: PDoom;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.L1 = ly.get('sudden drop');
    this.L2 = ly.get('your servant');
    const w1 = (q: string) => findWord(this.L1, q), w2 = (q: string) => findWord(this.L2, q);
    this.tThere = w1('There').start;
    this.tSudden = w1('sudden').start;
    this.tDrop = w1('drop').start;
    this.tIn = w1('in').start;
    this.tLossEnd = w1('loss,').end;
    this.tNow = w2('now').start;
    this.tServ = w2('servant').start;
    this.tAnd = w2('and').start;
    this.tBoss = w2('boss').start;
    this.dbs = au.downbeats.filter((d) => d > this.T0 + 0.05 && d < this.T1 - 0.05);
    /** Nearest beat (or downbeat) to `target` inside [lo, hi]; falls back to the target itself. */
    const pick = (target: number, lo: number, hi: number, down = false) => {
      const list = down ? au.downbeats : au.beats;
      let best = NaN;
      for (const b of list) if (b >= lo && b <= hi && (isNaN(best) || Math.abs(b - target) < Math.abs(best - target))) best = b;
      return isNaN(best) ? target : best;
    };
    this.tPush = pick(this.tSudden, this.T0 + 0.3, this.tDrop - 0.1); // push-in on the beat before "sudden"
    this.tCut1 = pick(this.tIn + 0.8, this.tIn + 0.35, this.tLossEnd - 0.1); // reframe in the canyon
    // cut to the basin: a downbeat between the lines if there is one, else the beat nearest "servant"
    const dbGap = pick(this.tNow, this.tLossEnd - 0.1, this.tServ + 0.05, true);
    this.tCut2 = au.downbeats.includes(dbGap) ? dbGap : pick(this.tServ, this.tLossEnd, this.tServ + 0.2);
    this.tRoll = pick(this.tBoss, this.tAnd + 0.3, this.T1 - 0.5); // roll on "boss"

    // --- chart lyric layout ("There was a sudden")
    const idxSudden = this.L1.words.findIndex((w) => norm(w.w) === 'sudden');
    this.words1 = this.L1.words.slice(0, idxSudden + 1);
    this.lay1 = spacedLayout(this.words1.map((w) => w.w).join(' '), this.famLyric, SPACE_EM);
    const sc = TXT / 100;
    this.xC = this.xText0 + this.lay1.width * sc + 0.45;
    const g0 = this.charIndexOfWord(this.words1, idxSudden);
    this.xSpike = this.xText0 + this.lay1.glyphs[g0]!.x * sc + 0.1;
    this.yPlat = yOfLog(this.curveLog(this.xC));

    // --- terrain mesh
    const geo = new THREE.PlaneGeometry(44, 42, 640, 720);
    geo.rotateX(-Math.PI / 2);
    this.terrMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      uniforms: {
        uX0: { value: this.xC }, uYR: { value: YR }, uRevR: { value: -1 }, uRipT: { value: -1 }, uBright: { value: 1 },
        uFogStart: { value: 10 }, uFogLen: { value: 14 }, uHatch: { value: 1 }, uTime: { value: 0 },
        uMinor: { value: DEC / 10 }, uIndex: { value: DEC / 2 },
        uCam: { value: new THREE.Vector3() }, uRevC: { value: new THREE.Vector2() }, uRipC: { value: new THREE.Vector2() },
        uPulse: { value: new THREE.Vector4(99, 99, 99, 99) },
      },
      depthTest: true, depthWrite: true,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
    });
    const mesh = new THREE.Mesh(geo, this.terrMat);
    mesh.position.set(this.xC, 0, -9); // v from -12 to 30
    mesh.frustumCulled = false;
    this.terrScene.add(mesh);

    this.yLand = this.tY(0.25, 0) + 0.12;
    const fallT = Math.max(0.3, this.tIn - this.tDrop);
    this.gFall = (2 * (this.yPlat - this.yLand)) / (fallT * fallT);

    // --- canyon centreline (the lyric's baseline) — offset toward the camera side
    for (let v = 0; v <= VB + 0.01; v += 0.02) {
      const u = cuF(v) * smoothstep(0, 1.2, v) + 0.7;
      this.center.push({ x: this.xC + u, y: YR + terrH(u - 0.7, v, false) + 0.2, z: -v });
    }
    let acc = 0;
    this.centerS = [0];
    for (let i = 1; i < this.center.length; i++) {
      const a = this.center[i - 1]!, b = this.center[i]!;
      acc += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      this.centerS.push(acc);
    }
    // canyon lyric ("in your training loss,")
    const idxIn = this.L1.words.findIndex((w) => norm(w.w) === 'in');
    const w3 = this.L1.words.slice(idxIn);
    const lay3 = spacedLayout(w3.map((w) => w.w).join(' '), F.archivoItalic(100, 800), SPACE_EM);
    const sc3 = TXT3 / 100;
    this.s3Start = 0.6;
    this.glyphs3 = lay3.glyphs.map((g) => {
      const { word, j } = this.wordOfChar(w3, g.i);
      const len = Math.max(1, word.w.length);
      const t0 = lerp(word.start, word.end, j / len), t1 = lerp(word.start, word.end, (j + 1) / len);
      return { ch: g.ch, s: this.s3Start + g.x * sc3, w: g.w * sc3, t0, t1, word };
    });
    this.pd = new PDoom(this.ctx.lyrics);
    this.buildLabels();
  }

  /** Cartographic annotations: contour elevation labels, local minima, the pit. */
  buildLabels() {
    const lvl = (y: number) => {
      const e = y / DEC - 2;
      const m = Math.pow(10, e - Math.floor(e));
      return `${m < 1.5 ? 1 : m < 4.5 ? 3 : 1}e${m < 4.5 ? Math.floor(e) : Math.floor(e) + 1}`;
    };
    const grad = (u: number, v: number) => {
      const e = 0.01;
      return [(terrH(u + e, v) - terrH(u - e, v)) / (2 * e), (terrH(u, v + e) - terrH(u, v - e)) / (2 * e)] as const;
    };
    const onContour = (u: number, v: number, y: number) => {
      for (let i = 0; i < 30; i++) {
        const h = YR + terrH(u, v) - y;
        const [gu, gv] = grad(u, v);
        const g2 = gu * gu + gv * gv + 1e-6;
        u -= (h * gu) / g2; v -= (h * gv) / g2;
      }
      return { u, v };
    };
    const addContour = (u: number, v: number, kind: 'contour' | 'pdoom' = 'contour') => {
      const y0 = YR + terrH(u, v);
      const y = Math.round(y0 / (DEC / 2)) * (DEC / 2);
      const p = onContour(u, v, y);
      const [gu, gv] = grad(p.u, p.v);
      const gl = Math.hypot(gu, gv) + 1e-6;
      this.labels.push({ p: { x: this.xC + p.u, y: y + 0.03, z: -p.v }, ang: { x: -gv / gl, y: 0, z: -gu / gl }, text: lvl(y), kind });
    };
    for (const [u, v] of [[2.6, 1.5], [-1.9, 3.2], [3.4, 5.5], [-1.2, 7.4], [4.8, 9.0], [2.3, 12.8], [-3.0, 10.2], [5.2, 2.6]] as const) addContour(u + cuF(v), v);
    // P(doom), surveyed like any other elevation (one on the canyon wall, one on the basin rim)
    addContour(1.9 + cuF(4.2), 4.2, 'pdoom');
    addContour(UB - 3.3, VB + 1.2, 'pdoom');
    // local minima of the hills (gradient descent from a few seeds), away from the canyon & basin
    const found: { u: number; v: number }[] = [];
    for (let su = -9; su <= 9; su += 2.2) for (let sv = 1; sv <= 16; sv += 2.2) {
      let u = su, v = sv;
      for (let i = 0; i < 200; i++) { const [gu, gv] = grad(u, v); u -= gu * 0.08; v -= gv * 0.08; }
      const dCanyon = Math.abs(u - cuF(v));
      const dBasin = Math.hypot(u - UB, v - VB);
      if (dCanyon < 2.8 || dBasin < 5 || v < 1 || v > 17 || Math.abs(u) > 11) continue;
      if (found.some((m) => Math.hypot(m.u - u, m.v - v) < 1.5)) continue;
      found.push({ u, v });
    }
    found.sort((a, b) => a.v - b.v);
    for (const m of found.slice(0, 4)) this.labels.push({ p: { x: this.xC + m.u, y: YR + terrH(m.u, m.v) + 0.05, z: -m.v }, ang: { x: 1, y: 0, z: 0 }, text: 'local min.', kind: 'min' });
    this.labels.push({ p: { x: this.xC + UB, y: YR + BOWL0 - 0.2, z: -VB }, ang: { x: 1, y: 0, z: 0 }, text: 'sharp minimum', sub: '(generalizes poorly)', kind: 'pit' });
  }

  // ---------------------------------------------------------------- helpers
  charIndexOfWord(words: Word[], wi: number) {
    let c = 0;
    for (let i = 0; i < wi; i++) c += words[i]!.w.length + 1;
    return c;
  }
  wordOfChar(words: Word[], ci: number) {
    let c = 0;
    for (const w of words) {
      if (ci < c + w.w.length) return { word: w, j: ci - c };
      if (ci === c + w.w.length) return { word: w, j: w.w.length - 1 }; // the space after
      c += w.w.length + 1;
    }
    const w = words[words.length - 1]!;
    return { word: w, j: w.w.length - 1 };
  }
  tY(u: number, v: number, pit = true) { return YR + terrH(u, v, pit); }

  /** Loss curve (log10) along the chart. */
  curveLog(x: number, smooth = false) {
    let l = 0.3 + 0.72 * Math.exp(-x * 2.1);
    if (!smooth) l += 0.045 * noise1(x * 5, 3) + 0.03 * noise1(x * 17, 5) + 0.018 * noise1(x * 43, 9);
    const dx = x - this.xSpike;
    l += 0.5 * (dx > 0 ? Math.exp(-dx * 3.2) : Math.exp(dx * 26));
    return l;
  }
  /** Time a chart glyph gets written (never before the spark could reach it). */
  glyphTime(tg: number, gx: number) {
    return Math.max(tg, this.T0 + 0.03 + 0.1 * (gx / Math.max(0.1, this.xC)));
  }

  /** Chart x reached by the spark at time t (before the drop). */
  sparkX(t: number) {
    const sc = TXT / 100;
    const head = (tt: number) => {
      let chars = 0;
      for (const w of this.words1) {
        const p = Lyrics.wordProgress(w, tt);
        chars += p * w.w.length;
        if (p < 1) break;
        chars += 1;
      }
      const gi = Math.min(this.lay1.glyphs.length - 1, Math.floor(chars));
      const g = this.lay1.glyphs[gi]!;
      const x = chars >= this.lay1.glyphs.length ? this.lay1.width : g.x + g.w * (chars - gi);
      return this.xText0 + x * sc;
    };
    let x = 0;
    for (let k = -2; k <= 2; k++) x += head(t + k * 0.03);
    x /= 5;
    // the spark sprints in from the axis at the start
    const catchUp = lerp(0, this.xC, prog(t, this.T0 + 0.02, this.T0 + 0.9, ease.outCubic));
    x = Math.min(Math.max(x, this.xText0 * prog(t, this.T0, this.T0 + 0.2)), catchUp);
    const tail = prog(t, this.words1[this.words1.length - 1]!.end - 0.08, this.tDrop, ease.inOutQuad);
    return lerp(x, this.xC, tail);
  }

  /** The spark in world space at time t. */
  sparkPos(t: number): P3 {
    if (t < this.tDrop) {
      const x = this.sparkX(t);
      return { x, y: yOfLog(this.curveLog(x)), z: 0 };
    }
    if (t < this.tIn) {
      const dt = t - this.tDrop;
      const y = this.yPlat - 0.5 * this.gFall * dt * dt;
      return { x: this.xC + 0.25 * (1 - Math.exp(-dt * 9)), y, z: 0 };
    }
    const tA = this.spiralStart();
    let uv: { u: number; v: number };
    if (t <= tA) uv = this.canyonUV(t);
    else {
      // spiral from the arrival point, the same way round as it arrived, accelerating into the drain
      const A = this.canyonUV(tA), B = this.canyonUV(tA - 0.03);
      const rx = A.u - UB, ry = A.v - VB, vx = A.u - B.u, vy = A.v - B.v;
      const dir = Math.sign(rx * vy - ry * vx) || 1;
      const r0 = Math.hypot(rx, ry), a0 = Math.atan2(ry, rx);
      const p = prog(t, tA, this.T1 - 0.06);
      const r = r0 * Math.pow(1 - p, 1.25) + 0.02;
      const a = a0 + dir * TAU * 3.0 * (0.4 * p + 0.6 * p * p);
      uv = { u: UB + Math.cos(a) * r, v: VB + Math.sin(a) * r };
    }
    const land = prog(t, this.tIn, this.tIn + 0.25, ease.outCubic);
    const u0 = 0.25;
    const u = lerp(u0, uv.u, land), v = uv.v * land;
    return { x: this.xC + u, y: this.tY(u, v) + 0.14, z: -v };
  }
  /** Canyon run in terrain coords: along the lyric's write head, with SGD jitter across the canyon. */
  canyonUV(t: number) {
    const c = this.centerAt(this.canyonS(t));
    const v = -c.z;
    const zig = 0.5 * Math.sin(v * 5.2) * Math.exp(-v * 0.16) + 0.07 * Math.sin(v * 13.1);
    return { u: c.x - this.xC - 0.7 + zig, v };
  }
  /** Write head of the canyon lyric (arc length along the baseline). */
  writeHead(t: number) {
    let head = this.s3Start * prog(t, this.tIn, this.tIn + 0.2);
    for (const g of this.glyphs3) if (t >= g.t0) head = g.s + g.w * clamp((t - g.t0) / Math.max(0.01, g.t1 - g.t0));
    return head;
  }
  get sArrive() {
    // arc length where the canyon run hands over to the spiral (a few units short of the pit)
    const i = this.center.findIndex((p) => -p.z >= VB - 3.4);
    return this.centerS[i < 0 ? this.centerS.length - 1 : i]!;
  }
  canyonS(t: number) {
    const x = prog(t, this.tLossEnd - 0.2, this.spiralStart());
    const after = x * x * (2 - x); // eases in, arrives with speed
    const sEnd = this.sArrive;
    return lerp(this.writeHead(t) + 0.2, sEnd, after);
  }
  spiralStart() { return this.tLossEnd + 0.45; }
  centerAt(s: number): P3 {
    const S = this.centerS, C = this.center;
    s = clamp(s, 0, S[S.length - 1]!);
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m]! < s) lo = m; else hi = m; }
    const u = (s - S[lo]!) / Math.max(1e-6, S[hi]! - S[lo]!);
    const a = C[lo]!, b = C[hi]!;
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) };
  }

  setCam(c0: Cam) {
    const c = this.cam;
    c.fov = c0.fov; c.updateProjectionMatrix();
    c.position.set(c0.pos.x, c0.pos.y, c0.pos.z);
    c.up.set(0, 1, 0);
    c.lookAt(c0.tgt.x, c0.tgt.y, c0.tgt.z);
    c.rotateZ(c0.roll);
    c.updateMatrixWorld(true);
    this.vp.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  }
  proj(x: number, y: number, z: number): Proj | null {
    const v = this.v4.set(x, y, z, 1).applyMatrix4(this.vp);
    if (v.w <= 0.05) return null;
    const P11 = this.cam.projectionMatrix.elements[5]!;
    return { x: (v.x / v.w * 0.5 + 0.5) * W, y: (0.5 - v.y / v.w * 0.5) * H, s: 0.5 * H * P11 / v.w, w: v.w };
  }

  // ---------------------------------------------------------------- camera
  chartCam(t: number): Cam {
    const push = prog(t, this.tPush - 0.02, this.tPush + 0.4, ease.outExpo);
    const z = lerp(21.5, 18, push) - 0.5 * prog(t, this.T0, this.tDrop);
    const cx = lerp(6.9, this.xC - 1.5, push) + 0.12 * Math.sin(t * 0.8);
    const cy = lerp(3.1, 4.8, push);
    const tgt = { x: cx, y: cy + 0.3 * pulse(t, this.tSudden, 0.07) * Math.sin(t * 80), z: 0 };
    return { pos: { x: cx - 0.25, y: cy + 0.1, z }, tgt, roll: -0.01 * push, fov: 30 };
  }
  landCam(): Cam {
    const tgt = { x: this.xC + 0.3, y: this.yLand - 0.6, z: -1.6 };
    return { pos: orbit(tgt, 0.35, 1.02, 11.5), tgt, roll: 0.04, fov: 32 };
  }
  camera(t: number): Cam {
    let c: Cam;
    if (t < this.tDrop) c = this.chartCam(t);
    else if (t < this.tIn) {
      // S2: swoop down after the falling spark, out through the chart floor, onto the terrain
      const a = this.chartCam(this.tDrop), b = this.landCam();
      const sp = this.sparkPos(t);
      const kp = prog(t, this.tDrop + 0.04, this.tIn + 0.02, ease.inOutCubic);
      const kt = prog(t, this.tDrop, this.tDrop + 0.2, ease.inQuad);
      const follow = { x: lerp(a.tgt.x, sp.x, 0.7), y: sp.y - 0.4, z: 0 };
      const tgt = lerp3(lerp3(a.tgt, follow, kt), b.tgt, prog(t, this.tIn - 0.2, this.tIn, ease.inOutQuad));
      c = { pos: lerp3(a.pos, b.pos, kp), tgt, roll: lerp(a.roll, b.roll, kp), fov: lerp(30, 32, kp) };
    } else if (t < this.tCut2) {
      const sp = this.sparkPos(t);
      const fc = this.centerAt(this.writeHead(t) - 1.1);
      const kf = prog(t, this.tLossEnd - 0.1, this.tLossEnd + 0.7, ease.inOutCubic);
      const tgt = lerp3({ x: fc.x, y: fc.y + 0.2, z: fc.z }, { x: sp.x, y: sp.y, z: sp.z - 0.8 }, kf);
      if (t < this.tCut1) {
        // S3: from above the impact, swing round to the side of the canyon
        const k = prog(t, this.tIn, this.tIn + 0.55, ease.inOutCubic);
        const b = this.landCam();
        const tg = lerp3(b.tgt, tgt, prog(t, this.tIn, this.tIn + 0.3, ease.outCubic));
        const yaw = lerp(0.35, 1.2, k) + 0.05 * (t - this.tIn);
        const pitch = lerp(1.02, 0.66, k);
        const dist = lerp(11.5, 12.5, k);
        c = { pos: orbit(tg, yaw, pitch, dist), tgt: tg, roll: lerp(0.04, -0.03, k), fov: lerp(32, 34, k) };
      } else {
        // S4: lower, closer, looking down the canyon toward the basin
        const lt = t - this.tCut1;
        const back = prog(t, this.tLossEnd - 0.2, this.tCut2, ease.inOutCubic);
        const bc = { x: this.xC + UB, y: YR + BOWL0, z: -VB };
        const tg = lerp3(tgt, { x: lerp(sp.x, bc.x, 0.6), y: bc.y, z: lerp(sp.z, bc.z, 0.6) }, back);
        c = { pos: orbit(tg, 1.0 - 0.1 * lt - 0.5 * back, lerp(0.5 + 0.05 * lt, 0.95, back), lerp(9.6 - 0.4 * lt, 13, back)), tgt: tg, roll: lerp(-0.05, 0.03, back), fov: 36 };
      }
    } else {
      // S5/S6: oblique over the basin; roll 180° on "boss", then dive into the minimum
      const bc: P3 = { x: this.xC + UB, y: YR + BOWL0, z: -VB };
      const lt = t - this.tCut2;
      const dive = prog(t, this.tRoll, this.T1, ease.inCubic);
      const pre = prog(t, this.tCut2, this.tRoll, ease.linear);
      const tgt = lerp3({ x: bc.x - 0.3, y: bc.y - 0.6, z: bc.z + 0.6 }, { x: bc.x, y: bc.y - 3.5, z: bc.z }, dive);
      const yaw = 0.42 - 0.12 * pre - 0.6 * dive;
      const pitch = lerp(0.52 + 0.08 * pre, 1.42, dive);
      const dist = lerp(15.5 - 2.2 * pre, 1.6, dive);
      c = { pos: orbit(tgt, yaw, pitch, dist), tgt, roll: this.rollAngle(t), fov: lerp(34, 64, dive) };
      void lt;
    }
    // keep the camera above the ground
    if (t > this.tDrop) {
      const u = c.pos.x - this.xC, v = -c.pos.z;
      const g = Math.max(this.tY(u, v, false), this.tY(u + 1, v, false), this.tY(u - 1, v, false), this.tY(u, v + 1, false), this.tY(u, v - 1, false)) + 1.4;
      if (c.pos.y < g) c.pos.y = g;
    }
    return c;
  }
  rollAngle(t: number) {
    // the flip, then a slow vertiginous overrun into the cut
    return Math.PI * prog(t, this.tRoll, this.tRoll + 0.45, ease.inOutCubic) + 0.13 * prog(t, this.tRoll + 0.45, this.T1, ease.inQuad);
  }

  // ---------------------------------------------------------------- render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const cm = this.camera(t);
    const tens = prog(t, this.tRoll + 0.25, this.T1, ease.inQuad);
    const shakeA = 7 * pulse(t, this.tSudden, 0.09) + 12 * pulse(t, this.tIn, 0.12) + 9 * pulse(t, this.tCut2, 0.1) + 7 * tens;
    const shake: [number, number] = [shakeA * noise1(t * 37, 1), shakeA * noise1(t * 41, 2)];
    this.setCam(cm);

    clearRT(renderer, out, LIN.ink);
    // ------------------------------------------------ terrain
    if (t > this.tDrop + 0.05) {
      const u = this.terrMat.uniforms;
      u.uCam!.value.set(cm.pos.x, cm.pos.y, cm.pos.z);
      const revT = t - (this.tDrop + 0.08);
      u.uRevR!.value = revT > 0 ? 1 + 40 * ease.outCubic(clamp(revT / 1.5)) : -5;
      (u.uRevC!.value as THREE.Vector2).set(0.25, 0.0);
      u.uRipT!.value = t > this.tIn ? t - this.tIn : -1;
      (u.uRipC!.value as THREE.Vector2).set(0.25, 0.0);
      const late = t >= this.tCut2;
      u.uFogStart!.value = late ? 11 : 10;
      u.uFogLen!.value = late ? 14 : 12;
      u.uTime!.value = t;
      // beat pulses travelling down the contour levels from the spark
      const pv = u.uPulse!.value as THREE.Vector4;
      const rb = f.beat - this.ctx.audio.beatAt(this.tRoll); // beats since the roll
      const sub = rb >= 1 ? 4 : rb >= 0 ? 2 : 1; // 8ths on the roll, 16ths on the last beat into the cut
      const b = f.beat * sub;
      const top = this.sparkPos(t).y + 1.2;
      const hs: number[] = [];
      for (let i = 0; i < 4; i++) {
        const bi = Math.floor(b) - i;
        const age = (b - bi) / sub;
        hs.push(t > this.tIn ? top - age * (t > this.tRoll ? 7 : 2.6) : 99);
      }
      pv.set(hs[0]!, hs[1]!, hs[2]!, hs[3]!);
      u.uBright!.value = 1 + 0.25 * tens;
      renderer.setRenderTarget(out);
      renderer.render(this.terrScene, this.cam);
    }

    // ------------------------------------------------ 3D lines: chart + trail
    const L3 = this.lines3; L3.clear();
    this.drawChart3D(t, L3);
    this.drawTrail(t, L3);
    L3.render(renderer, out, this.cam);

    // ------------------------------------------------ text
    const T = this.text; T.clear();
    this.drawLabels(t, T.ctx);
    this.drawChartText(t, T.ctx);
    this.drawCanyonText(t, T.ctx);
    this.drawServantBoss(t, T.ctx);
    this.ctx.comp.draw(renderer, T.upload(), out);

    // ------------------------------------------------ spark head & particles (screen)
    const L2 = this.lines2; L2.clear();
    const sp = this.sparkPos(t);
    const hp = this.proj(sp.x, sp.y, sp.z);
    const ignite = lerp(0.5, 1, prog(t, this.T0, this.T0 + 0.08)); // the opening hands over a lit spark
    if (hp && ignite > 0) {
      const sc = clamp(hp.s / 90, 0.6, 1.5);
      sparkParticles(L2, t, (tb) => {
        if (tb < this.T0 + 0.05) return null;
        const p = this.sparkPos(tb);
        const q = this.proj(p.x, p.y, p.z);
        return q ? { x: q.x, y: q.y } : null;
      }, { rate: t > this.tDrop && t < this.tIn + 0.2 ? 170 : 85, intensity: 0.9, speed: 240 * sc, seed: 11 });
      sparkHead(L2, hp.x, hp.y, t, sc * (1 + 1.2 * pulse(t, this.T0, 0.12) + 0.6 * pulse(t, this.tIn, 0.12)), ignite * (1 + 0.3 * f.a.kick));
    }
    L2.render(renderer, out);

    const flash = 0.02 * pulse(t, this.tIn, 0.06) + 0.025 * pulse(t, this.tCut2, 0.05);
    const lastBeat = this.ctx.audio.timeOfBeat(Math.floor(this.ctx.audio.beatAt(t)));
    const punch = t > this.tRoll ? 0.03 * pulse(t, lastBeat, 0.08) : 0;
    return { bloom: 0.7, shake, flash, vignette: 0.38 + 0.3 * tens, ca: 1.2 + 3.5 * tens, zoom: 1 + 0.05 * tens + punch };
  }

  // ---------------------------------------------------------------- chart (3D, plane z=0)
  drawChart3D(t: number, L: LineBatch) {
    const a = clamp(1 - prog(t, this.tIn - 0.1, this.tIn + 0.35));
    if (a <= 0) return;
    const draw = prog(t, this.T0, this.T0 + 0.3, ease.outExpo);
    const bone = LIN.bone, gr = LIN.graphite, ash = LIN.ash;
    const top = yOfLog(1) + 0.5;
    L.seg(0, 0, 0, 0, top * draw, 0, 1.4, bone[0], bone[1], bone[2], 0.8 * a);
    // the floor, torn where the spark falls through
    const tear = t > this.tDrop ? prog(t, this.tDrop + 0.2, this.tDrop + 0.45, ease.outExpo) : 0;
    if (tear > 0) {
      L.seg(0, 0, 0, Math.min(CW * draw, this.xC - 0.9 * tear), -0.25 * tear, 0, 1.4, bone[0], bone[1], bone[2], 0.8 * a);
      L.seg(this.xC + 0.9 * tear, -0.35 * tear, 0, CW * draw, 0, 0, 1.4, bone[0], bone[1], bone[2], 0.8 * a);
    } else L.seg(0, 0, 0, CW * draw, 0, 0, 1.4, bone[0], bone[1], bone[2], 0.8 * a);
    // axis extension below the floor (dashed), revealed as we fall
    const ext = prog(t, this.tDrop, this.tDrop + 0.3);
    for (let y = 0; y > -16 * ext; y -= 0.3) L.seg(0, y, 0, 0, y - 0.14, 0, 1.0, ash[0], ash[1], ash[2], 0.5 * a);
    for (let d = -9; d <= 1; d++) {
      const y0 = yOfLog(d);
      const onChart = d >= -2;
      const ta = onChart ? prog(t, this.T0 + 0.04 + (d + 2) * 0.04, this.T0 + 0.22 + (d + 2) * 0.04) : ext;
      if (ta <= 0) continue;
      L.seg(-0.26 * ta, y0, 0, 0, y0, 0, 1.3, bone[0], bone[1], bone[2], 0.8 * a);
      if (d < 1) {
        for (let k = 2; k <= 9; k++) {
          const y = y0 + Math.log10(k) * DEC;
          L.seg(-0.11 * ta, y, 0, 0, y, 0, 1.0, ash[0], ash[1], ash[2], 0.6 * a);
        }
      }
      if (onChart && d > -2) for (let x = 0.4; x < CW * draw; x += 0.4) L.seg(x, y0, 0, x + 0.06, y0, 0, 1.0, gr[0], gr[1], gr[2], 0.5 * a);
    }
    for (let i = 1; i <= 7; i++) {
      const x = i * 2;
      const ta = prog(t, this.T0 + 0.05 + i * 0.025, this.T0 + 0.22 + i * 0.025);
      if (ta > 0) L.seg(x, 0, 0, x, -0.2 * ta, 0, 1.3, bone[0], bone[1], bone[2], 0.8 * a);
    }
  }

  drawTrail(t: number, L: LineBatch) {
    const sg = LIN.signal;
    if (t < this.T0) return;
    const col = (age: number) => {
      const k = Math.exp(-age / 0.16);
      return [lerp(sg[0] * 1.35, 4, k), lerp(sg[1] * 1.35, 2.1, k), lerp(sg[2] * 1.35, 0.9, k)] as const;
    };
    let prev: P3 | null = null;
    const push = (p: P3, age: number, width: number) => {
      if (prev) { const c = col(age); L.seg(prev.x, prev.y, prev.z, p.x, p.y, p.z, width, c[0], c[1], c[2], 1); }
      prev = p;
    };
    const tA = Math.min(t, this.tDrop);
    const xA = this.sparkX(tA);
    const fadeChart = 1 - prog(t, this.tIn + 0.1, this.tIn + 0.6);
    if (fadeChart > 0) {
      const n1 = 280;
      for (let i = 0; i <= n1; i++) {
        const x = (xA * i) / n1;
        push({ x, y: yOfLog(this.curveLog(x)), z: 0 }, t < this.tDrop ? (xA - x) * 0.6 : 5, 2.2);
      }
    }
    if (t > this.tDrop) {
      const tb = Math.min(t, this.tIn);
      for (let i = 0; i <= 30; i++) { const tt = lerp(this.tDrop, tb, i / 30); push(this.sparkPos(tt), t - tt, 2.4); }
    }
    if (t > this.tIn) {
      const n = Math.min(700, Math.ceil((t - this.tIn) * 150));
      for (let i = 0; i <= n; i++) { const tt = lerp(this.tIn, t, i / n); push(this.sparkPos(tt), t - tt, 2.6); }
    }
  }

  // ---------------------------------------------------------------- text
  drawChartText(t: number, c: CanvasRenderingContext2D) {
    const a = clamp(1 - prog(t, this.tIn - 0.25, this.tIn + 0.15));
    if (a <= 0) return;
    const labA = prog(t, this.T0 + 0.05, this.T0 + 0.35) * a;
    c.save();
    c.textBaseline = 'alphabetic';
    const P = (x: number, y: number) => this.proj(x, y, 0);
    const mono = F.mono(400);
    const fsz = (p: Proj, k = 0.2) => Math.round(clamp(p.s * k, 11, 44));
    for (let d = -9; d <= 1; d++) {
      const onChart = d >= -2;
      const ta = onChart ? labA * prog(t, this.T0 + 0.08 + (d + 2) * 0.04, this.T0 + 0.3 + (d + 2) * 0.04) : a * prog(t, this.tDrop + 0.04 * (-d - 2), this.tDrop + 0.1 + 0.04 * (-d - 2));
      if (ta <= 0) continue;
      const p = P(-0.42, yOfLog(d));
      if (!p) continue;
      c.font = font(mono, fsz(p));
      c.textAlign = 'right';
      c.fillStyle = rgba('bone', (onChart ? 0.72 : 0.55) * ta);
      c.fillText(`1e${d}`, p.x, p.y + p.s * 0.07);
    }
    for (let i = 0; i <= 7; i++) {
      const p = P(i * 2, -0.5);
      if (!p) continue;
      const ta = labA * prog(t, this.T0 + 0.1 + i * 0.025, this.T0 + 0.3 + i * 0.025);
      c.font = font(mono, fsz(p));
      c.textAlign = 'center';
      c.fillStyle = rgba('bone', 0.6 * ta);
      c.fillText(i === 0 ? '0' : `${i * 5}k`, p.x, p.y);
    }
    {
      const p = P(-1.3, yOfLog(1));
      if (p) {
        c.save(); c.translate(p.x, p.y); c.rotate(-Math.PI / 2);
        c.font = font(F.mono(500), fsz(p, 0.19));
        c.letterSpacing = '3px'; c.textAlign = 'right';
        c.fillStyle = rgba('bone', 0.75 * labA);
        c.fillText('LOSS (LOG)', 0, 0);
        c.restore();
      }
      const q = P(CW, -1.05);
      if (q) {
        c.font = font(F.mono(500), fsz(q, 0.19));
        c.letterSpacing = '3px'; c.textAlign = 'right';
        c.fillStyle = rgba('bone', 0.75 * labA);
        c.fillText('STEP →', q.x, q.y);
      }
      const r = P(0.3, yOfLog(1) + 0.55);
      if (r) {
        c.font = font(F.mono(400), fsz(r, 0.18));
        c.letterSpacing = '1px'; c.textAlign = 'left';
        c.fillStyle = rgba('ash', 0.9 * labA);
        const s = 'train/loss   run: you-and-me-v2   smoothing: 0';
        c.fillText(s.slice(0, Math.floor(s.length * prog(t, this.T0 + 0.1, this.T0 + 0.7))), r.x, r.y);
      }
      c.letterSpacing = '0px';
    }
    // ---- the lyric riding the curve
    const sc = TXT / 100;
    let ci = 0;
    c.font = font(this.famLyric, 100);
    c.textAlign = 'left';
    // baseline: the smooth trend plus a soft hill over the spike, so "sudden" arcs over it as one word
    const base = (x: number) => {
      const dx = x - (this.xSpike + 0.35);
      return yOfLog(0.3 + 0.72 * Math.exp(-x * 2.1) + 0.3 * Math.exp(-dx * dx / 1.3)) + 0.36;
    };
    for (const w of this.words1) {
      for (let j = 0; j < w.w.length; j++) {
        const g = this.lay1.glyphs[ci + j]!;
        const gx = this.xText0 + (g.x + g.w * 0.5) * sc;
        const tg = this.glyphTime(lerp(w.start, w.end, j / w.w.length), gx);
        if (t < tg) continue;
        const ap = prog(t, tg, tg + 0.16, ease.outBack as (x: number) => number);
        const p = P(gx, base(gx));
        const pa = P(gx - 0.2, base(gx - 0.2)), pb = P(gx + 0.2, base(gx + 0.2));
        if (!p || !pa || !pb) continue;
        const ang = 0.6 * Math.atan2(pb.y - pa.y, pb.x - pa.x);
        const s = (p.s * TXT) / 100;
        const heat = Math.exp(-(t - tg) / 0.28);
        c.save();
        c.translate(p.x, p.y); c.rotate(ang);
        c.scale(s, s * (0.3 + 0.7 * ap));
        c.fillStyle = heatCss(heat, a);
        c.fillText(g.ch, -g.w / 2, 0);
        c.restore();
      }
      ci += w.w.length + 1;
    }
    // ---- "drop": upright letters stacked down the cliff, spreading as the fall accelerates
    const wd = findWord(this.L1, 'drop');
    const chars = Array.from(wd.w);
    const famD = F.archivo(62, 900);
    c.font = font(famD, 100);
    chars.forEach((ch, j) => {
      const tg = lerp(wd.start, wd.end, j / chars.length);
      if (t < tg) return;
      const sp = this.sparkPos(tg);
      const p = P(this.xC + 0.6, sp.y - 0.15 * j);
      if (!p) return;
      const size = Math.min(230, p.s * (1.05 + 0.18 * j));
      const ap = prog(t, tg, tg + 0.1, ease.outCubic);
      const heat = Math.exp(-(t - tg) / 0.28);
      c.save();
      c.translate(p.x, p.y);
      c.scale(size / 100, (size / 100) * (0.5 + 0.5 * ap) * (1 + 0.12 * j));
      c.fillStyle = heatCss(heat, a);
      c.fillText(ch, 0, 0);
      c.restore();
    });
    // deadpan annotation at the cliff
    const an = prog(t, this.tDrop + 0.08, this.tDrop + 0.25) * a;
    if (an > 0) {
      const p = P(this.xC + 1.9, this.yPlat + 1.15), q = P(this.xC + 0.3, this.yPlat + 0.05);
      if (p && q) {
        c.strokeStyle = rgba('ash', 0.8 * an); c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.x - 8, p.y + 4); c.lineTo(q.x + 4, q.y - 4); c.stroke();
        const fs = fsz(p, 0.21);
        c.font = font(F.mono(400), fs);
        c.textAlign = 'left';
        c.fillStyle = rgba('bone', 0.9 * an);
        c.fillText('grokking (?)', p.x, p.y);
        c.fillStyle = rgba('ash', 0.9 * an);
        c.fillText('Δloss −99.9999%', p.x, p.y + fs * 1.3);
      }
    }
    c.restore();
  }

  drawCanyonText(t: number, c: CanvasRenderingContext2D) {
    if (t < this.tIn - 0.05) return;
    const fade = 1 - prog(t, this.tLossEnd + 0.15, this.tLossEnd + 0.45);
    if (fade <= 0) return;
    const fam = F.archivoItalic(100, 800);
    c.save();
    c.font = font(fam, 100);
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    for (const g of this.glyphs3) {
      if (t < g.t0 || g.ch === ' ') continue;
      const ap = prog(t, g.t0, g.t0 + 0.16, ease.outBack as (x: number) => number);
      const lift = 0.45;
      // letters stand on the canyon floor: advance follows the projected path (foreshortened),
      // height is the perspective size
      const pa0 = this.centerAt(g.s), pb0 = this.centerAt(g.s + g.w);
      const qa = this.proj(pa0.x, pa0.y + lift, pa0.z), qb = this.proj(pb0.x, pb0.y + lift, pb0.z);
      if (!qa || !qb) continue;
      const adv = Math.hypot(qb.x - qa.x, qb.y - qa.y);
      if (qb.x < qa.x) continue;
      const ang = clamp(Math.atan2(qb.y - qa.y, qb.x - qa.x), -0.7, 0.7);
      const pm = 0.5 * (qa.s + qb.s);
      const size = clamp(pm * TXT3, 14, 150);
      const heat = Math.exp(-(t - g.t0) / 0.28);
      const gw = g.w / (TXT3 / 100); // advance at font size 100
      c.save();
      c.translate(qa.x, qa.y); c.rotate(ang);
      c.scale(clamp(adv / gw, 0.05, (size / 100) * 1.1), (size / 100) * (0.3 + 0.7 * ap));
      c.strokeStyle = rgba('ink', 0.9 * fade); c.lineWidth = 16;
      c.strokeText(g.ch, 0, 0);
      c.fillStyle = heatCss(heat, fade);
      c.fillText(g.ch, 0, 0);
      c.restore();
    }
    c.restore();
  }

  drawLabels(t: number, c: CanvasRenderingContext2D) {
    if (t < this.tIn - 0.2) return;
    const tRev = this.tDrop + 0.08;
    c.save();
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    this.labels.forEach((lb, i) => {
      // appear once the survey reaches them, staggered
      const dist = Math.hypot(lb.p.x - this.xC, lb.p.z);
      const ta = tRev + 1.5 * Math.cbrt(clamp(dist / 40)) * 0.9 + 0.35 + (i % 3) * 0.06;
      let a = prog(t, ta, ta + 0.2);
      if (lb.kind !== 'pit') a *= 1 - prog(t, this.tRoll + 0.3, this.tRoll + 0.6);
      else a *= prog(t, this.tCut2 + 0.2, this.tCut2 + 0.45) * (1 - prog(t, this.tRoll + 0.1, this.tRoll + 0.3));
      if (a <= 0) return;
      const p = this.proj(lb.p.x, lb.p.y, lb.p.z);
      if (!p || p.x < -100 || p.x > W + 100 || p.y < -100 || p.y > H + 100) return;
      const fog = Math.exp(-Math.max(0, p.w - 12) / 12);
      a *= fog;
      if (a < 0.02) return;
      if (lb.kind === 'contour' || lb.kind === 'pdoom') {
        const q = this.proj(lb.p.x + lb.ang.x * 0.3, lb.p.y, lb.p.z + lb.ang.z * 0.3);
        if (!q) return;
        let ang = Math.atan2(q.y - p.y, q.x - p.x);
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        const pdoom = lb.kind === 'pdoom';
        const txt = pdoom ? `P(doom) ${formatPDoom(this.pd.value(t))}` : lb.text;
        const fs = clamp(p.s * (pdoom ? 0.19 : 0.16), pdoom ? 12 : 9, pdoom ? 28 : 24);
        c.save();
        c.translate(p.x, p.y); c.rotate(ang);
        c.font = font(F.mono(500), fs);
        c.textAlign = 'center';
        const wdt = c.measureText(txt).width;
        c.fillStyle = rgba('ink', 0.95 * a);
        c.fillRect(-wdt / 2 - 4, -fs * 0.55, wdt + 8, fs * 1.1);
        c.fillStyle = pdoom ? rgba('signal', 0.95 * a) : rgba('bone', 0.85 * a);
        c.fillText(txt, 0, 1);
        c.restore();
      } else {
        const fs = lb.kind === 'pit' ? clamp(p.s * 0.3, 18, 30) : clamp(p.s * 0.15, 10, 22);
        const r = lb.kind === 'pit' ? 7 : 4;
        c.strokeStyle = rgba('bone', 0.8 * a); c.lineWidth = 1.2;
        c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
        c.beginPath(); c.moveTo(p.x + r * 0.7, p.y - r * 0.7); c.lineTo(p.x + 26, p.y - 26); c.lineTo(p.x + 34, p.y - 26); c.stroke();
        c.font = font(F.mono(lb.kind === 'pit' ? 500 : 400), fs);
        c.textAlign = 'left';
        c.fillStyle = rgba('ink', 0.9 * a);
        const wdt = Math.max(c.measureText(lb.text).width, lb.sub ? c.measureText(lb.sub).width : 0);
        c.fillRect(p.x + 36, p.y - 26 - fs * 0.7, wdt + 10, fs * (lb.sub ? 2.7 : 1.4));
        c.fillStyle = rgba('bone', 0.9 * a);
        c.fillText(lb.text, p.x + 40, p.y - 26);
        if (lb.sub) { c.fillStyle = rgba('ash', 0.9 * a); c.fillText(lb.sub, p.x + 40, p.y - 26 + fs * 1.25); }
      }
    });
    c.restore();
  }

  drawServantBoss(t: number, c: CanvasRenderingContext2D) {
    if (t < this.tNow - 0.05) return;
    const roll = this.rollAngle(t);
    const ws = this.L2.words;
    const wServ = findWord(this.L2, 'servant'), wBoss = findWord(this.L2, 'boss');
    const iServ = ws.indexOf(wServ), iBoss = ws.indexOf(wBoss);
    const wNow = ws.slice(0, iServ), wAnd = ws.slice(iServ + 1, iBoss);
    c.save();
    c.translate(W / 2, H / 2); c.rotate(roll); c.translate(-W / 2, -H / 2);
    c.textBaseline = 'alphabetic';
    const mono = F.mono(500);
    const typed = (words: Word[], x: number, y: number, size: number, alpha = 1) => {
      c.font = font(mono, size);
      c.letterSpacing = '4px';
      let s = '';
      for (const w of words) {
        const p = Lyrics.wordProgress(w, t);
        if (p <= 0) break;
        s += (s ? ' ' : '') + w.w.slice(0, Math.ceil(p * w.w.length));
      }
      s = s.toUpperCase();
      c.fillStyle = rgba('bone', 0.9 * alpha);
      c.fillText(s, x, y);
      if (s.length && Math.floor(t * 4) % 2 === 0) c.fillRect(x + c.measureText(s).width + 6, y - size * 0.8, size * 0.55, size * 0.95);
      c.letterSpacing = '0px';
    };
    const after = prog(t, this.tRoll + 0.25, this.T1, ease.inOutCubic);
    typed(wNow, 150, 168, 36, 1 - 0.5 * after);
    // "SERVANT" — huge, on top (the hierarchy, inverted); condenses and sinks after the roll
    {
      const txt = wServ.w.toUpperCase();
      const fam = F.archivo(lerp(125, 62, after), 900);
      const size = lerp(250, 200, after);
      const lay = layout(txt, fam, size, -4);
      const x0 = 150, y0 = 188 + size * 0.76;
      c.font = font(fam, size);
      const pr = Lyrics.wordProgress(wServ, t) * txt.length;
      const slam = prog(t, wServ.start, wServ.start + 0.12, ease.outCubic);
      c.lineJoin = 'round';
      lay.glyphs.forEach((g, i) => {
        const k = clamp(pr - i);
        const drop = (1 - slam) * -50;
        c.save();
        c.translate(x0 + g.x, y0 + drop);
        if (k <= 0) {
          c.strokeStyle = rgba('bone', 0.4 * slam); c.lineWidth = 2;
          c.strokeText(g.ch, 0, 0);
        } else {
          const pop = prog(k, 0, 1, ease.outCubic);
          c.strokeStyle = rgba('ink', 0.85); c.lineWidth = 12;
          c.strokeText(g.ch, 0, 0);
          c.fillStyle = rgba('bone', lerp(0.97, 0.45, after) * (0.6 + 0.4 * pop));
          c.fillText(g.ch, 0, 0);
        }
        c.restore();
      });
    }
    // set upside down in the rolling frame: it comes upright (and on top) with the roll
    c.translate(W / 2, H / 2); c.rotate(Math.PI); c.translate(-W / 2, -H / 2);
    typed(wAnd, 170, 205, 36);
    {
      const txt = wBoss.w.toUpperCase();
      const k = prog(t, wBoss.start, wBoss.end, ease.outCubic);
      const fam = F.archivo(lerp(62, 125, k), 900);
      const size = lerp(120, 270, k);
      const lay = layout(txt, fam, size, -4);
      const x0 = 170, y0 = 225 + size * 0.76;
      c.font = font(fam, size);
      const pr = Lyrics.wordProgress(wBoss, t) * txt.length;
      lay.glyphs.forEach((g, i) => {
        if (pr - i <= 0) return;
        c.strokeStyle = rgba('ink', 0.85); c.lineWidth = 12;
        c.strokeText(g.ch, x0 + g.x, y0);
        c.fillStyle = rgba('bone', 0.98);
        c.fillText(g.ch, x0 + g.x, y0);
      });
    }
    c.restore();
  }
}

/** White-hot → ember → bone cooling for freshly written glyphs. */
function heatCss(heat: number, alpha: number) {
  if (heat < 0.02) return rgba('bone', 0.96 * alpha);
  const k = 1 - heat;
  const r = Math.round(lerp(255, 238, k)), g = Math.round(lerp(150, 233, k)), b = Math.round(lerp(70, 223, k));
  return `rgba(${r},${g},${b},${alpha})`;
}
