// FIG. 10 `fuse` — the quiet tail of chorus 3.
//  1. "Too late now, we lit the fuse": the spark's line is revealed as a braided, engraved fuse. The lyric rides
//     along the cord; the spark burns through it in time with the voice (each word ignites as it is sung), the words
//     glow, then char to ash and crumble. "fuse" (a held note) burns letter by letter; a downbeat cuts to a macro.
//  2. "Orthogonality thesis blues" (revision 2: no more ultramarine, the plate stays in ink, bone and signal, lit
//     only by the spark). The camera tilts down after the spark as it drops onto a chart; it draws the x axis
//     (INTELLIGENCE →) while "Orthogonality thesis" is set along it; the y axis (GOALS ↑) shoots up on a beat; a
//     scatter of minds fills the plane, nodding along, uncorrelated. The flat regression line (r = 0.00) is a
//     guitar string: "blues" stands on it and bends it with the singer's actual pitch — the held C4 with its
//     vibrato, then the flip up an octave (tab notation: vib., bend +12) — and it rings when released; the
//     B-flat that follows earns a lone orange flat sign. The last half-beat inhales before the cut to the bridge.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { type Line, type Word, norm } from '../engine/lyrics';
import { HEX, LIN, rgba } from '../engine/palette';
import { F, font, layout, type TextLayout } from '../engine/type';
import { GLSL_COMMON } from '../engine/glsl/common';
import { clamp, ease, lerp, prog, hash, noise1, pulse, TAU, smoothstep, polylineLengths, pointAtLength, mulberry32, type V2, frameIdx } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';
import { PDoom, formatPDoom } from '../engine/hud';
import { bluesPitch } from './fuse-pitch';

type Ctx2 = CanvasRenderingContext2D;
interface Cam { x: number; y: number; z: number; r: number }
type Xf = { a: number; b: number; c: number; d: number; e: number; f: number };

function camXf(cam: Cam, shx = 0, shy = 0): Xf {
  const cs = Math.cos(cam.r) * cam.z, sn = Math.sin(cam.r) * cam.z;
  return { a: cs, b: sn, c: -sn, d: cs, e: W / 2 + shx - (cs * cam.x - sn * cam.y), f: H / 2 + shy - (sn * cam.x + cs * cam.y) };
}
function invXf(m: Xf): Xf {
  const det = m.a * m.d - m.b * m.c;
  const ia = m.d / det, ib = -m.b / det, ic = -m.c / det, id = m.a / det;
  return { a: ia, b: ib, c: ic, d: id, e: -(ia * m.e + ic * m.f), f: -(ib * m.e + id * m.f) };
}
const apply = (m: Xf, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
const lerpCam = (p: Cam, q: Cam, k: number): Cam => ({ x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k), z: Math.exp(lerp(Math.log(p.z), Math.log(q.z), k)), r: lerp(p.r, q.r, k) });
const hexRGB = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixHex = (a: string, b: string, k: number, al = 1) => { const p = hexRGB(a), q = hexRGB(b); return `rgba(${[0, 1, 2].map((i) => Math.round(lerp(p[i]!, q[i]!, clamp(k)))).join(',')},${al})`; };

// ------------------------------------------------------------------ shaders
const FUSE_VERT = /* glsl */ `
precision highp float;
in vec3 position;   // world px
in vec2 aSV;        // arc length (px), across (-1.4..1.4 in radius units)
uniform vec3 mA; uniform vec3 mB; // world -> screen px (rows)
out vec2 vSV;
void main() {
  vec2 s = vec2(dot(mA, vec3(position.xy, 1.0)), dot(mB, vec3(position.xy, 1.0)));
  vSV = aSV;
  gl_Position = vec4(s.x / 960.0 - 1.0, 1.0 - s.y / 540.0, 0.0, 1.0);
}`;

const FUSE_FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
in vec2 vSV;
out vec4 fragColor;
uniform float burnS;   // arc length of the burning front
uniform float rad;     // cord radius (world px)
uniform float time;
uniform float zoom;
void main() {
  float s = vSV.x, v = vSV.y;
  float ds = s - burnS;                     // > 0 ahead (intact), < 0 behind (burnt)
  float burnt = smoothstep(3.0, -26.0, ds);
  // burnt cord shrinks and crumbles
  float er = snoise(vec2(s * 0.09, 3.0)) * 0.5 + snoise(vec2(s * 0.35, 7.0)) * 0.25;
  float R = mix(1.0, 0.58 + 0.2 * er, burnt);
  float gap = smoothstep(0.42, 0.62, snoise(vec2(s * 0.018, 1.7))) * smoothstep(-160.0, -420.0, ds);
  R *= 1.0 - gap * 0.9;
  float av = abs(v);
  float aa = max(fwidth(v), 1e-3);
  float inside = 1.0 - smoothstep(R - aa, R + aa, av);

  // ---- intact braided cord (white-line engraving)
  float vv = clamp(v / max(R, 0.05), -0.999, 0.999);
  float ang = asin(vv);
  float nz = sqrt(1.0 - vv * vv);
  float pitch = rad * 1.55;
  float a1 = s / pitch + ang / PI * 3.0;
  float a2 = s / pitch - ang / PI * 3.0;
  float i1 = floor(a1), i2 = floor(a2), f1 = fract(a1), f2 = fract(a2);
  bool top1 = mod(i1 + i2, 2.0) < 0.5;
  float across = top1 ? f1 : f2;
  float along = top1 ? f2 : f1;
  float bulge = sin(PI * across);
  float dive = smoothstep(0.0, 0.4, along) * smoothstep(1.0, 0.6, along);
  float key = sat(0.08 + 0.92 * (nz * 0.55 - vv * 0.75));   // light from above: dark underside
  float warmL = exp(-max(ds, 0.0) / (rad * 7.0)) * (1.0 - burnt);   // light cast by the spark on the cord ahead
  float light = sat(key * (0.3 + 0.7 * bulge) * (0.35 + 0.65 * dive) + warmL * 0.5 * bulge);
  float gaps = smoothstep(0.0, 0.1, across) * smoothstep(1.0, 0.9, across);
  float fib = hatch(across * 4.0 + 0.5 + 0.035 * snoise(vec2(s * 0.08, v * 2.0)), light * 0.95) * gaps;
  vec3 cord = C_BONE * fib * (0.1 + 0.72 * light) * (0.25 + 0.75 * key);
  cord += C_EMBER * fib * warmL * 0.9 * (0.4 + 0.6 * nz);
  // rim line of the cord silhouette
  cord += C_BONE * 0.16 * (1.0 - smoothstep(0.0, 0.06, R - av)) * (1.0 - burnt) * step(vv, 0.2);

  // ---- burnt: ash with dying embers
  float emb = exp(min(ds, 0.0) / 70.0);
  float flick = 0.55 + 0.45 * snoise(vec2(s * 0.12, v * 2.0 + time * 2.5));
  float crack = hatch(s * 0.21 + v * 1.7 + 0.3 * snoise(vec2(s * 0.05, v)), 0.22);
  vec3 ash = C_GRAPHITE * (0.12 + 0.35 * crack * key);
  ash += heat(0.35 + 0.55 * emb * flick) * emb * flick * 1.6 * (0.4 + 0.6 * crack);
  // ---- the burning front
  float front = exp(-abs(ds + 4.0) / 9.0);
  vec3 col = mix(cord, ash, burnt);
  col += vec3(3.2, 1.5, 0.55) * front * (0.6 + 0.4 * flick) * (1.0 - av * 0.4);
  float a = inside;
  // soft glow halo around the front beyond the cord radius
  float halo = exp(-abs(ds) / 22.0) * exp(-max(av - R, 0.0) * 2.2) * (1.0 - inside);
  col = col * a + C_SIGNAL * 1.4 * halo;
  a = max(a, halo * 0.8);
  fragColor = vec4(col, a);
}`;

const GROUND_FRAG = /* glsl */ `
uniform vec3 iA; uniform vec3 iB;   // screen px -> world px
uniform vec2 spark;                  // spark (screen px)
uniform float zoom, time, bright;
void main() {
  vec2 sp = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
  vec2 wp = vec2(dot(iA, vec3(sp, 1.0)), dot(iB, vec3(sp, 1.0)));
  float d = length(sp - spark);
  float pool = exp(-d * d / (430.0 * 430.0 * max(zoom, 0.5)));
  float near = exp(-d / (70.0 * max(zoom, 0.6)));
  // an engraved ground (fixed ~7 px screen pitch), only faintly revealed by the spark's light
  float n = fbm(wp * 0.0016, 3);
  float lines = hatch(sp.y / 7.0 + n * 2.0 * zoom, 0.1 + 0.25 * pool);
  vec3 col = C_INK * 0.85;
  col += C_GRAPHITE * lines * 0.12 * pool * bright;
  col += C_EMBER * (0.012 * pool + 0.05 * near) * bright;
  // smoke: faint wisps drifting up from the burnt trail
  float sm = fbm(vec2(wp.x * 0.004, wp.y * 0.006 + time * 0.35), 4);
  col += C_ASH * 0.02 * smoothstep(0.1, 0.6, sm) * pool * bright;
  float vig = smoothstep(1.25, 0.35, length((vUv - 0.5) * vec2(1.6, 1.1)));
  fragColor = vec4(col * vig, 1.0);
}`;

const CHART_FRAG = /* glsl */ `
uniform float top;          // screen y of the chart's upper edge while the camera tilts down onto it
uniform vec3 iA; uniform vec3 iB;
uniform vec2 spark;         // spark (screen px)
uniform float zoom, time, dark;
void main() {
  vec2 sp = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
  vec2 wp = vec2(dot(iA, vec3(sp, 1.0)), dot(iB, vec3(sp, 1.0)));
  float d = length(sp - spark);
  float pool = exp(-d * d / (560.0 * 560.0 * max(zoom, 0.6)));
  float near = exp(-d / (80.0 * max(zoom, 0.6)));
  vec3 col = C_INK * 0.85;
  // graph paper inside the plane: faint graphite rulings, revealed by the spark's light
  float inPlane = step(380.0, wp.x) * step(wp.y, 740.0) * step(150.0, wp.y) * step(wp.x, 1720.0);
  vec2 q = (wp - vec2(380.0, 740.0));
  vec2 f1 = abs(fract(q / 24.0 - 0.5) - 0.5) * 24.0, f2 = abs(fract(q / 120.0 - 0.5) - 0.5) * 120.0;
  float px = 1.0 / max(zoom, 0.3);
  float minor = 1.0 - smoothstep(0.0, px * 1.1, min(f1.x, f1.y));
  float major = 1.0 - smoothstep(0.0, px * 1.3, min(f2.x, f2.y));
  col += C_GRAPHITE * (0.018 * minor + 0.05 * major) * (0.4 + 0.9 * pool) * inPlane;
  // an engraved ground beyond the plane, only faintly revealed
  float n = fbm(wp * 0.0016, 3);
  col += C_GRAPHITE * hatch(sp.y / 7.0 + n * 2.0 * zoom, 0.1 + 0.2 * pool) * 0.05 * pool * (1.0 - inPlane);
  // the spark's warm light, and smoke drifting through it
  col += C_EMBER * (0.014 * pool + 0.05 * near);
  float sm = fbm(vec2(wp.x * 0.003 - time * 0.04, wp.y * 0.005 + time * 0.25), 4);
  col += C_ASH * 0.018 * smoothstep(0.1, 0.7, sm) * (0.3 + pool);
  float vig = smoothstep(1.3, 0.3, length((vUv - 0.5) * vec2(1.5, 1.1)));
  col *= vig * (1.0 - 0.45 * dark);
  // feathered edge while the camera tilts down from the fuse: the two grounds melt into each other
  float a = smoothstep(top - 2.0, top + 170.0, sp.y);
  fragColor = vec4(col, a);
}`;

const TEXT_FRAG = /* glsl */ `
uniform sampler2D tex; uniform sampler2D glow; uniform float glowGain;
void main() {
  vec4 c = texture(tex, vUv);
  vec4 g = texture(glow, vUv);
  fragColor = vec4(c.rgb * c.a + g.rgb * g.a * glowGain, c.a);
}`;

// ------------------------------------------------------------------ data
interface PathGlyph { ch: string; s0: number; s1: number; tIgn: number; tDone: number; word: Word; wi: number; seed: number }
interface Agent { x: number; y: number; t0: number; size: number; kind: number; phase: number; group: number; depth: number; label?: string; lx?: number; ly?: number; pdoom?: boolean }

const O = { x: 380, y: 740 };          // chart origin (plane px)
const XEND = 1720, YEND = 150;
/** The regression line, strung like a guitar string: anchors, rest height, pitch response. */
const STRING = { x0: 470, x1: 1650, y: 540, rest: 59.1, pxPerSemi: 23, echo: 0.55, ringHz: 5.2, hz: 1000 };
const XP = 1060; // where "blues" pushes the string (the word's centre)
const BLUE_NOTE = { x: 640, y: 330 };
/** Where the spark sits at the cut: on the central axis of the transformer stack that opens the bridge. */
const HANDOFF = { x: 1045, y: 600 }; // the scrap of staff carrying the B-flat (left end, middle line)

export default class Fuse extends Scene {
  ground = new FSPass(GROUND_FRAG, { iA: { value: new THREE.Vector3() }, iB: { value: new THREE.Vector3() }, spark: { value: new THREE.Vector2() }, zoom: { value: 1 }, time: { value: 0 }, bright: { value: 1 } });
  chart = new FSPass(CHART_FRAG, { top: { value: 0 }, iA: { value: new THREE.Vector3() }, iB: { value: new THREE.Vector3() }, spark: { value: new THREE.Vector2() }, zoom: { value: 1 }, dark: { value: 0 }, time: { value: 0 } }, { blending: THREE.NormalBlending, transparent: true });
  textComp = new FSPass(TEXT_FRAG, { tex: { value: null }, glow: { value: null }, glowGain: { value: 3 } }, { blending: THREE.CustomBlending, transparent: true });
  text = new Layer2D();
  glow = new Layer2D(W / 2, H / 2, 1); // half-res at every output scale: the soft glow keeps its size
  add = new LineBatch(30000, { blend: 'add' });
  ink = new LineBatch(12000, { blend: 'normal' });
  over = new LineBatch(4000, { blend: 'normal' });
  fuseScene = new THREE.Scene();
  fuseCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  fuseMat!: THREE.RawShaderMaterial;

  L1!: Line; L2!: Line;
  wFuse!: Word; wOrth!: Word; wThesis!: Word; wBlues!: Word;
  T0 = 0; tEnd = 0; tDown1 = 0; tMacro = 0; tDrop0 = 0; tDrop1 = 0; tBlue = 0; tYAxis = 0; tFit = 0; beatLen = 0.4645;
  tString = 0; tBluesDb = 0; tFlat = Infinity; tLeap = Infinity; tLeapEnd = Infinity; tBlueNote = Infinity; tBack = 0;

  // fuse geometry
  path: V2[] = [];
  pathL = new Float32Array(0);
  rad = 17;
  sText0 = 0;
  lay!: TextLayout;
  glyphs: PathGlyph[] = [];
  burnKnots: [number, number][] = [];
  fam = F.archivo(100, 800);
  size = 104;

  // the chart
  bluesLay!: TextLayout;
  bluesFam = F.serif(600, true);
  bluesSize = 176;
  /** String displacement (plane px, up) sampled at SIM_HZ from simT0: the singer's pitch bends it. */
  simT0 = 0; sim = new Float32Array(0); simV = new Float32Array(0);
  orthLay!: TextLayout;
  orthX0 = 440;
  orthGlyphT: number[] = [];
  sparkKnots: [number, number][] = [];
  agents: Agent[] = [];
  pdoom!: PDoom;

  override async init() {
    const { lyrics, audio } = this.ctx;
    this.pdoom = new PDoom(lyrics);
    this.L1 = lyrics.get('lit the fuse');
    this.L2 = lyrics.get('Orthogonality');
    const find = (l: Line, q: string) => l.words.find((w) => norm(w.w).startsWith(norm(q))) ?? l.words[l.words.length - 1]!;
    this.wFuse = find(this.L1, 'fuse');
    this.wOrth = find(this.L2, 'orthogonal');
    this.wThesis = find(this.L2, 'thesis');
    this.wBlues = find(this.L2, 'blues');
    const au = audio;
    this.T0 = this.ctx.start;
    this.tEnd = this.ctx.end;
    const b0 = Math.floor(au.beatAt(this.T0));
    this.beatLen = au.timeOfBeat(b0 + 1) - au.timeOfBeat(b0);
    const downAfter = (t: number) => au.downbeats.find((d) => d > t + 1e-3) ?? t + this.beatLen * 4;
    this.tDown1 = downAfter(this.T0);
    this.tBlue = this.wOrth.start;
    // prefer downbeats; fall back to plain beats (never to arbitrary times)
    const beatAfter = (t: number) => au.timeOfBeat(Math.ceil(au.beatAt(t) - 1e-3));
    const nearestBeat = (t: number) => au.timeOfBeat(Math.round(au.beatAt(t)));
    this.tMacro = au.downbeats.find((d) => d > this.wFuse.start + 0.5 && d < this.tBlue - 0.6) ?? nearestBeat(lerp(this.wFuse.start, this.tBlue, 0.45));
    // the camera tilts down onto the chart from the beat before "Orthogonality"
    this.tDrop0 = Math.min(this.tBlue - 0.15, au.timeOfBeat(Math.floor(au.beatAt(this.tBlue - 0.1))));
    this.tDrop1 = this.tBlue + 0.1;
    this.tYAxis = au.downbeats.find((d) => d > this.tBlue + 0.25 && d < this.wBlues.start) ?? Math.min(beatAfter(this.tBlue + 0.35), this.wBlues.start - 0.1);
    // the regression line (the string) is strung on the beat inside "thesis"; "blues" lands on its downbeat
    this.tString = Math.min(beatAfter(this.wThesis.start + 0.03), this.wBlues.start - 0.15);
    this.tBluesDb = au.nearestBeat(this.wBlues.start);
    this.tFit = this.tString;
    this.initString();
    this.bluesLay = layout(this.wBlues.w.replace(/[^A-Za-z]/g, ''), this.bluesFam, this.bluesSize, 1);

    // ---- the fuse path (world px): a long lazy S across and beyond the frame
    const ctrl: V2[] = [];
    for (let i = 0; i <= 21; i++) {
      const x = -3200 + i * 300;
      ctrl.push({ x, y: 560 + 70 * Math.sin(x * 0.0021 + 0.9) + 26 * Math.sin(x * 0.0057 + 2.0) });
    }
    this.path = catmull(ctrl, 30);
    this.pathL = polylineLengths(this.path);
    // lyric along the cord
    this.lay = layout(this.L1.text, this.fam, this.size, 1);
    const sStart = this.sAtX(-60);
    this.sText0 = sStart;
    // word of each char
    const wordOfChar: (Word | null)[] = [];
    {
      let ci = 0;
      const txt = Array.from(this.L1.text);
      for (const w of this.L1.words) {
        const wc = Array.from(w.w);
        // find w's first char from ci
        let k = ci;
        while (k < txt.length && txt.slice(k, k + wc.length).join('') !== w.w) k++;
        if (k >= txt.length) k = ci;
        for (let j = ci; j < k; j++) wordOfChar[j] = null;
        for (let j = 0; j < wc.length; j++) wordOfChar[k + j] = w;
        ci = k + wc.length;
      }
    }
    // burn schedule: the front reaches each word's first letter exactly at its start;
    // "fuse" (the held note) burns letter by letter over its duration.
    const firstGlyphS = (w: Word) => {
      const i = wordOfChar.indexOf(w);
      return this.sText0 + (this.lay.glyphs[Math.max(0, i)]?.x ?? 0);
    };
    const lastGlyphS = (w: Word) => {
      const i = wordOfChar.lastIndexOf(w);
      const g = this.lay.glyphs[Math.max(0, i)]!;
      return this.sText0 + g.x + g.w;
    };
    const kn: [number, number][] = [[this.T0 - 0.2, this.sText0 - 170]];
    for (const w of this.L1.words) kn.push([w.start, firstGlyphS(w) - 2]);
    const wf = this.wFuse;
    kn.push([Math.max(wf.start + 0.2, wf.end - 0.12), lastGlyphS(wf) + 6]);
    kn.push([wf.end + 2, lastGlyphS(wf) + 90]);
    this.burnKnots = kn;
    this.glyphs = this.lay.glyphs.filter((g) => g.ch !== ' ').map((g) => {
      const s0 = this.sText0 + g.x, s1 = s0 + g.w;
      const w = wordOfChar[g.i] ?? this.L1.words[0]!;
      return { ch: g.ch, s0, s1, tIgn: this.timeAtBurn(s0 + g.w * 0.15), tDone: this.timeAtBurn(s1), word: w, wi: this.L1.words.indexOf(w), seed: g.i };
    });

    // ---- blue plane: "Orthogonality thesis" along the x axis
    const ofam = F.archivo(100, 500);
    this.orthLay = layout(`${this.wOrth.w} ${this.wThesis.w}`, ofam, 78, 2);
    const nO = Array.from(this.wOrth.w).length;
    this.orthGlyphT = this.orthLay.glyphs.map((g) => {
      const inO = g.i < nO;
      const w = inO ? this.wOrth : this.wThesis;
      const j = inO ? g.i : g.i - nO - 1;
      const n = Array.from(w.w).length;
      const dur = Math.min(w.end - w.start, inO ? 0.8 : 0.4);
      return w.start + (Math.max(0, j) / n) * dur;
    });
    const sk: [number, number][] = [[this.tDrop1 - 0.2, O.x], [this.tBlue + 0.001, this.orthX0 - 4]];
    this.orthLay.glyphs.forEach((g, i) => sk.push([this.orthGlyphT[i]!, this.orthX0 + g.x]));
    const xTextEnd = this.orthX0 + this.orthLay.width;
    sk.push([this.wThesis.start + Math.min(this.wThesis.end - this.wThesis.start, 0.4) + 0.05, xTextEnd + 10]);
    sk.push([this.tEnd, XEND - 150]);
    this.sparkKnots = sk.sort((a, b) => a[0] - b[0]);

    // ---- agents
    const rnd = mulberry32(1010);
    const labels = [
      ['thermostat', 0.07, 0.12], ['chess engine', 0.36, 0.08], ['paperclip maximizer', 0.93, 0.05], ['you', 0.1, 0.45],
      ['golden retriever', 0.12, 0.9], ['a very capable stapler', 0.84, 0.2], ['the market', 0.5, 0.95], ['evolution', 0.2, 0.2],
      ['me', 0.64, 0.15],   // the singer, carrying the P(doom) cameo
      ['helpful assistant (claimed)', 0.95, 0.72], ['a committee', 0.45, 0.2], ['?', 0.97, 0.97],
    ] as const;
    const px0 = 470, px1 = 1650, py0 = 200, py1 = 690;
    const bStart = au.beatAt(this.tYAxis);
    // everything pops in on (half-)beats after the y axis and is labelled before the cut
    const bSpan = Math.max(2, Math.min(6.5, au.beatAt(this.tEnd - 0.75) - bStart));
    const bk = (bSpan - 1) / 5.5;
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [
      { x0: 1560, x1: 1760, y0: STRING.y - 44, y1: STRING.y + 40 },   // r = 0.00
      { x0: 1000, x1: 1760, y0: 120, y1: 200 },   // footnote
      { x0: XP - 215, x1: XP + 215, y0: STRING.y - 150, y1: STRING.y + 8 },   // "blues" at rest on its string
      { x0: BLUE_NOTE.x - 20, x1: BLUE_NOTE.x + 170, y0: BLUE_NOTE.y - 70, y1: BLUE_NOTE.y + 70 },   // the staff scrap
    ];
    const lab: Agent[] = [];
    labels.forEach(([name, u, v], i) => {
      const x = lerp(px0, px1, u), y = lerp(py1, py0, v);
      const beat = bStart + 1 + Math.round(((i % 6) + 0.5 * (i % 2)) * bk * 2) / 2;
      const lx = u > 0.7 ? -1 : 1, ly = v > 0.8 ? 1 : -1;
      const pd = name === 'me';
      lab.push({ x, y, t0: au.timeOfBeat(beat), size: 6, kind: 4, phase: i * 1.7, group: i % 2, depth: 1, label: name, lx, ly, pdoom: pd });
      const w = (pd ? 'me · P(doom) 0.00'.length : name.length) * 9.6 + 50;
      boxes.push({ x0: lx > 0 ? x - 16 : x - w, x1: lx > 0 ? x + w : x + 16, y0: y + ly * 16 - 20, y1: y + ly * 16 + 16 });
    });
    for (let i = 0; i < 260 && this.agents.length < 200; i++) {
      const x = lerp(px0, px1, rnd()), y = lerp(py0, py1, rnd());
      const beat = bStart + Math.floor(rnd() * 7) * (bSpan / 6.5) + rnd() * 0.35;
      const depth = 0.65 + rnd() * 0.75;
      const a: Agent = { x, y, t0: au.timeOfBeat(beat), size: 1.6 + rnd() * 4.2, kind: Math.floor(rnd() * 4), phase: rnd() * TAU, group: rnd() < 0.5 ? 0 : 1, depth };
      if (boxes.some((b) => x > b.x0 - 8 && x < b.x1 + 8 && y > b.y0 - 8 && y < b.y1 + 8)) continue;
      this.agents.push(a);
    }
    this.agents.push(...lab);

    // ---- the fuse mesh
    const n = this.path.length;
    const pos = new Float32Array(n * 2 * 3), sv = new Float32Array(n * 2 * 2);
    const EXT = 1.45;
    for (let i = 0; i < n; i++) {
      const p = this.path[i]!, q = this.path[Math.min(n - 1, i + 1)]!, o = this.path[Math.max(0, i - 1)]!;
      const tx = q.x - o.x, ty = q.y - o.y, l = Math.hypot(tx, ty) || 1;
      const nx = -ty / l, ny = tx / l;
      for (let k = 0; k < 2; k++) {
        const sgn = k === 0 ? -1 : 1;
        pos.set([p.x + nx * this.rad * EXT * sgn, p.y + ny * this.rad * EXT * sgn, 0], (i * 2 + k) * 3);
        sv.set([this.pathL[i]!, EXT * sgn], (i * 2 + k) * 2);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSV', new THREE.BufferAttribute(sv, 2));
    geo.setIndex(idx);
    this.fuseMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: FUSE_VERT, fragmentShader: FUSE_FRAG,
      uniforms: { mA: { value: new THREE.Vector3() }, mB: { value: new THREE.Vector3() }, burnS: { value: 0 }, rad: { value: this.rad }, time: { value: 0 }, zoom: { value: 1 } },
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(geo, this.fuseMat);
    mesh.frustumCulled = false;
    this.fuseScene.add(mesh);
    const tm = this.textComp.mat;
    tm.blendSrc = THREE.OneFactor; tm.blendDst = THREE.OneMinusSrcAlphaFactor; tm.blendEquation = THREE.AddEquation;
  }

  // ------------------------------------------------------------------ the string ("blues")
  /**
   * Simulate the regression line as a guitar string pushed by the singer's pitch. While the voice sounds, a
   * stiff "finger" drives the string to the sung pitch (semitones above the rest note); when it stops, the
   * string rings freely at ~5 Hz and decays. Integrated once at init, so frames stay a pure function of t.
   */
  initString() {
    const wb = this.wBlues;
    const HZ = STRING.hz;
    this.simT0 = wb.start - 0.15;
    const n = Math.ceil((this.tEnd + 0.2 - this.simT0) * HZ);
    this.sim = new Float32Array(n); this.simV = new Float32Array(n);
    // fill short unvoiced gaps (< 70 ms) so a glide is not read as a release
    const raw: (number | null)[] = [];
    for (let i = 0; i < n; i++) raw.push(bluesPitch(this.simT0 + i / HZ, wb.start));
    const gap = Math.round(0.07 * HZ);
    for (let i = 0; i < n; i++) {
      if (raw[i] != null) continue;
      let j = i; while (j < n && raw[j] == null) j++;
      if (i > 0 && j < n && j - i <= gap) { const a = raw[i - 1]!, b = raw[j]!; for (let k = i; k < j; k++) raw[k] = lerp(a, b, (k - i + 1) / (j - i + 1)); }
      i = j;
    }
    let D = 0, V = 0;
    const wf = TAU * 26, zf = 0.95, ws = TAU * STRING.ringHz, zs = 0.09;
    const dt = 1 / HZ;
    for (let i = 0; i < n; i++) {
      const t = this.simT0 + i / HZ;
      const p = raw[i];
      const after = t > wb.end + 0.05;
      let a: number;
      if (p != null) {
        const target = Math.max(0, p - STRING.rest) * STRING.pxPerSemi * (after ? STRING.echo : 1);
        a = wf * wf * (target - D) - 2 * zf * wf * V;
      } else a = -ws * ws * D - 2 * zs * ws * V;
      V += a * dt; D += V * dt;
      this.sim[i] = D; this.simV[i] = V;
      // landmarks for the annotations
      if (p != null && t >= wb.start && this.tFlat === Infinity) this.tFlat = t;
      if (p != null && p > STRING.rest + 2.5 && t < wb.end + 0.05 && this.tLeap === Infinity) this.tLeap = t;
      if (p != null && p > STRING.rest + 11.5 && t < wb.end + 0.05 && this.tLeapEnd === Infinity) this.tLeapEnd = t;
      if (p != null && after && this.tBlueNote === Infinity) this.tBlueNote = t;
    }
    if (this.tLeap === Infinity) this.tLeap = wb.end - 0.2;
    if (this.tLeapEnd === Infinity) this.tLeapEnd = Math.min(wb.end, this.tLeap + 0.15);
    this.tBack = this.ctx.audio.downbeats.find((d) => d > wb.end + 0.3 && d < this.tEnd - 0.2) ?? this.tEnd - this.beatLen;
  }
  /** String displacement (px, upward) at t. */
  bend(t: number) {
    const x = (t - this.simT0) * STRING.hz;
    const i = Math.floor(x);
    if (i < 0) return 0;
    if (i >= this.sim.length - 1) return this.sim[this.sim.length - 1]!;
    return lerp(this.sim[i]!, this.sim[i + 1]!, x - i);
  }
  /** Shape of a string pushed at XP between its two anchors (0..1), with a softened apex. */
  shape(x: number) {
    const l = clamp((x - STRING.x0) / (XP - STRING.x0)), r = clamp((STRING.x1 - x) / (STRING.x1 - XP));
    const k = 0.17;
    return (-k * Math.log(Math.exp(-l / k) + Math.exp(-r / k))) / (1 - k * Math.log(2));
  }
  stringY(x: number, D: number) { return STRING.y - D * this.shape(x); }

  // ------------------------------------------------------------------ helpers
  sAtX(x: number) {
    for (let i = 1; i < this.path.length; i++) if (this.path[i]!.x >= x) return this.pathL[i]!;
    return 0;
  }
  burnS(t: number) {
    const k = this.burnKnots;
    let s: number;
    if (t <= k[0]![0]) s = k[0]![1];
    else if (t >= k[k.length - 1]![0]) s = k[k.length - 1]![1];
    else {
      let i = 1;
      while (k[i]![0] < t) i++;
      const a = k[i - 1]!, b = k[i]!;
      s = lerp(a[1], b[1], (t - a[0]) / Math.max(1e-4, b[0] - a[0]));
    }
    return s + 2.5 * noise1(t * 9, 3);
  }
  timeAtBurn(s: number) {
    const k = this.burnKnots;
    for (let i = 1; i < k.length; i++) {
      const a = k[i - 1]!, b = k[i]!;
      if (s <= b[1]) return lerp(a[0], b[0], clamp((s - a[1]) / Math.max(1e-4, b[1] - a[1])));
    }
    return k[k.length - 1]![0];
  }
  at(s: number) { return pointAtLength(this.path, this.pathL, s); }
  sparkX(t: number) {
    const k = this.sparkKnots;
    if (t <= k[0]![0]) return k[0]![1];
    for (let i = 1; i < k.length; i++) {
      const a = k[i - 1]!, b = k[i]!;
      if (t <= b[0]) return lerp(a[1], b[1], (t - a[0]) / Math.max(1e-4, b[0] - a[0]));
    }
    return k[k.length - 1]![1];
  }

  /** Fuse-world camera. */
  camFuse(t: number): Cam {
    const head = this.at(this.burnS(t));
    const wf = this.wFuse;
    // 1) reveal: from far (a hairline with a spark) into the cord, landing on the first downbeat
    const kIn = prog(t, this.T0, this.tDown1, ease.inOutCubic);
    const follow: Cam = { x: head.x + 250, y: head.y - 70, z: lerp(0.42, 1.12, kIn), r: lerp(0.05, -0.015, kIn) };
    // 2) track the spark through the fast words, easing out to show the whole line
    const wide: Cam = { x: lerp(head.x + 250, 760, 0.55), y: 520, z: 0.95, r: -0.01 };
    let cam = lerpCam(follow, wide, prog(t, this.tDown1, wf.start, ease.inOutCubic));
    // 3) "fuse" is held: slow push onto the burning word
    const push: Cam = { x: head.x - 40, y: head.y - 90, z: 1.75, r: 0.02 };
    cam = lerpCam(cam, push, prog(t, wf.start - 0.1, this.tMacro, ease.inOutQuad));
    // 4) downbeat: hard cut to a macro, drifting with the spark
    if (t >= this.tMacro) {
      const u = prog(t, this.tMacro, this.tBlue, ease.linear);
      cam = { x: head.x + 30 - 60 * u, y: head.y - 50 + 10 * u, z: lerp(3.3, 3.9, u), r: -0.11 + 0.03 * u };
    }
    return cam;
  }

  /** Chart camera (plane px == screen px at z = 1). */
  camChart(t: number): Cam {
    const u = prog(t, this.tBlue, this.tEnd, ease.linear);
    const sway = Math.sin(this.ctx.audio.beatAt(t) * Math.PI * 0.5) * 0.004;
    let cam: Cam = { x: 1010 - 50 * ease.inOutQuad(u), y: 460 + 12 * u, z: 1.0 + 0.04 * u, r: -0.004 + sway };
    // arrive close on the axis and the words, pull back to the whole plane when the y axis shoots up
    const close: Cam = { x: 820, y: 700, z: 1.5, r: 0.012 };
    cam = lerpCam(close, cam, prog(t, this.tYAxis - 0.05, this.tYAxis + 0.5, ease.outExpo));
    // "blues": push in on the string on its downbeat, ride the octave up, settle back out on the next downbeat
    const D = this.bend(t);
    const push: Cam = { x: XP + 30, y: STRING.y - 150 - 0.5 * D, z: 1.36, r: 0.008 };
    const kIn = prog(t, this.tBluesDb - 0.05, this.tBluesDb + 0.42, ease.outExpo);
    const kOut = prog(t, this.wBlues.end + 0.12, this.tBack + 0.05, ease.inOutCubic);
    cam = lerpCam(cam, push, kIn * (1 - kOut));
    // final inhale into the spark during the last half beat: it lands on the axis of the tower that follows
    // (the push keeps accelerating through the cut; the position lands a frame early so the last frame is on the mark)
    const inh = prog(t, this.tEnd - this.beatLen * 0.5, this.tEnd, ease.inCubic);
    const land = prog(t, this.tEnd - this.beatLen * 0.5, this.tEnd - 0.03, ease.inOutCubic);
    if (inh > 0 || land > 0) {
      const sx = this.sparkX(t);
      const z = cam.z * (1 + 0.22 * inh);
      const tgt = { x: sx - (HANDOFF.x - W / 2) / z, y: O.y - (HANDOFF.y - H / 2) / z };
      cam = { x: lerp(cam.x, tgt.x, land), y: lerp(cam.y, tgt.y, land), z, r: cam.r * (1 - land) };
    }
    return cam;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const drop = prog(t, this.tDrop0, this.tDrop1, ease.inOutCubic);
    const dropPx = H * drop;
    const fuseVisible = drop < 1;
    const chartVisible = drop > 0;
    const T = this.text, G = this.glow;
    T.clear(); G.clear();
    this.add.clear(); this.ink.clear(); this.over.clear();

    // spark screen position (continuous through the tilt)
    let sparkP = { x: 0, y: 0 };
    let fm: Xf | null = null, bm: Xf | null = null;
    const bs = this.burnS(t);

    if (fuseVisible) {
      const cam = this.camFuse(t);
      const shake = 3 * pulse(t, this.tMacro, 0.08);
      fm = camXf(cam, shake * (hash(frameIdx(t), 1) - 0.5), -dropPx + shake * (hash(frameIdx(t), 2) - 0.5));
      const im = invXf(fm);
      const hw = this.at(bs);
      const hs = apply(fm, hw.x, hw.y);
      sparkP = hs;
      // ground
      const g = this.ground.u;
      (g.iA!.value as THREE.Vector3).set(im.a, im.c, im.e);
      (g.iB!.value as THREE.Vector3).set(im.b, im.d, im.f);
      (g.spark!.value as THREE.Vector2).set(hs.x, hs.y);
      g.zoom!.value = cam.z; g.time!.value = t;
      g.bright!.value = 1;
      this.ground.render(renderer, out);
      // cord
      const u = this.fuseMat.uniforms;
      (u.mA!.value as THREE.Vector3).set(fm.a, fm.c, fm.e);
      (u.mB!.value as THREE.Vector3).set(fm.b, fm.d, fm.f);
      u.burnS!.value = bs; u.time!.value = t; u.zoom!.value = cam.z;
      renderer.setRenderTarget(out);
      renderer.render(this.fuseScene, this.fuseCam);
      // lyric along the cord (clipped above the chart while the camera tilts down)
      const clipY = H * (1 - drop) + 90;
      T.ctx.save(); T.ctx.beginPath(); T.ctx.rect(0, 0, W, clipY); T.ctx.clip();
      G.ctx.save(); G.ctx.beginPath(); G.ctx.rect(0, 0, W / 2, clipY / 2); G.ctx.clip();
      this.drawFuseText(T.ctx, G.ctx, fm, t, bs, cam.z);
      T.ctx.restore(); G.ctx.restore();
      this.drawFuseParticles(fm, t, bs, cam.z, clipY);
    }
    if (chartVisible) {
      const cam = this.camChart(t);
      bm = camXf(cam, 0, H * (1 - drop));
      const im = invXf(bm);
      const sx = this.sparkX(t);
      const bp = apply(bm, sx, O.y);
      const b = this.chart.u;
      b.top!.value = fuseVisible ? H * (1 - drop) - 60 : -2000;
      (b.iA!.value as THREE.Vector3).set(im.a, im.c, im.e);
      (b.iB!.value as THREE.Vector3).set(im.b, im.d, im.f);
      (b.spark!.value as THREE.Vector2).set(bp.x, bp.y);
      b.zoom!.value = cam.z;
      b.dark!.value = 0.6 * prog(t, this.tEnd - this.beatLen * 0.5, this.tEnd, ease.inCubic);
      b.time!.value = t;
      this.chart.render(renderer, out);
      this.drawChart(T.ctx, bm, t, cam.z, cam.x);
      sparkP = fuseVisible ? { x: lerp(sparkP.x, bp.x, smoothstep(0.2, 0.9, drop)), y: lerp(sparkP.y, bp.y, smoothstep(0.2, 0.9, drop)) } : bp;
    }

    // text layers
    this.textComp.u.tex!.value = T.upload();
    this.textComp.u.glow!.value = G.upload();
    this.textComp.u.glowGain!.value = 2.6;
    this.textComp.render(renderer, out);
    this.ink.render(renderer, out);

    // the spark
    const inh = prog(t, this.tEnd - this.beatLen * 0.5, this.tEnd, ease.inCubic);
    const z = fuseVisible && !chartVisible ? this.camFuse(t).z : chartVisible && !fuseVisible ? this.camChart(t).z : 1;
    const sparkScale = clamp(0.8 + 0.5 * z, 0.9, 2.6) * (1 + 0.8 * inh) * (chartVisible ? 1.05 : 1);
    const headAt = (tb: number) => {
      if (tb < this.tDrop0 && fm) { const p = this.at(this.burnS(tb)); return apply(fm, p.x, p.y); }
      if (tb >= this.tDrop1 && bm) return apply(bm, this.sparkX(tb), O.y);
      return null;
    };
    const sb = drop > 0.5 ? this.over : this.add;
    const inhAt = (tb: number) => prog(tb, this.tEnd - this.beatLen * 0.5, this.tEnd, ease.inCubic);
    sparkParticles(sb, t, headAt, { rate: (tb) => 160 + 140 * inhAt(tb), rateMax: 300, life: 0.5, speed: 200 * sparkScale, gravity: 480 * sparkScale, intensity: 1.2, seed: 10, width: 1.5 * Math.min(1.6, sparkScale) });
    // sputter bursts on the beats (the fuse spits in time)
    const au = this.ctx.audio;
    const bi = Math.floor(au.beatAt(t));
    const burstAt = (tb: number) => {
      const b = au.beatAt(tb);
      const ph = b - Math.floor(b);
      return ph < 0.1 && Math.floor(b) <= bi ? headAt(tb) : null;
    };
    sparkParticles(sb, t, burstAt, { rate: 700, life: 0.55, speed: 330 * sparkScale, gravity: 520 * sparkScale, intensity: 1.3, seed: 77, width: 1.4 * Math.min(1.6, sparkScale) });
    const beatKick = pulse(t, au.timeOfBeat(bi), 0.08);
    sparkHead(sb, sparkP.x, sparkP.y, t, sparkScale * (1 + 0.25 * beatKick), 1.2 + 1.4 * inh + 0.6 * beatKick);
    this.add.render(renderer, out);
    this.over.render(renderer, out);

    return { bloom: 0.8, bloomThreshold: 1.05, bloomKnee: 0.35, halation: 0.3, vignette: chartVisible && !fuseVisible ? 0.25 : 0.4, grain: 0.05 };
  }

  // ------------------------------------------------------------------ part 1: the lyric along the fuse
  drawFuseText(c: Ctx2, g: Ctx2, m: Xf, t: number, bs: number, zoom: number) {
    c.save(); g.save();
    c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    g.setTransform(m.a * 0.5, m.b * 0.5, m.c * 0.5, m.d * 0.5, m.e * 0.5, m.f * 0.5);
    c.font = font(this.fam, this.size); g.font = c.font;
    c.textBaseline = 'alphabetic'; g.textBaseline = 'alphabetic';
    const lift = this.rad + 16;
    for (const gl of this.glyphs) {
      const sc = (gl.s0 + gl.s1) / 2;
      const p = this.at(sc);
      const up = { x: Math.sin(p.angle), y: -Math.cos(p.angle) };
      const w = gl.word;
      const ign = t >= gl.tIgn;
      const since = t - gl.tIgn;
      const wEnd = Math.max(w.end, gl.tDone + 0.05);
      const charK = prog(t, wEnd, wEnd + 0.8, ease.inOutQuad);      // cooling to ash
      const crumble = prog(t, wEnd + 0.35, wEnd + 2.6, ease.inQuad);  // erosion + droop
      const droop = 26 * crumble * crumble * (0.6 + 0.8 * hash(gl.seed, 3));
      const x = p.x + up.x * lift, y = p.y + up.y * lift + droop;
      const rot = p.angle + (hash(gl.seed, 4) - 0.5) * 0.25 * crumble;
      const gw = gl.s1 - gl.s0;
      c.save();
      c.translate(x, y); c.rotate(rot);
      if (!ign) {
        c.fillStyle = rgba('bone', 0.1);
        c.fillText(gl.ch, -gw / 2, 0);
        c.strokeStyle = rgba('bone', 0.5); c.lineWidth = 1.3 / zoom;
        c.strokeText(gl.ch, -gw / 2, 0);
      } else {
        // white-hot at ignition -> ember -> signal while sung -> blood -> ash
        const hot = prog(since, 0, 0.45, ease.outCubic);
        let col: string;
        if (charK <= 0) col = hot < 0.5 ? mixHex('#FFF3E4', HEX.ember, hot * 2) : mixHex(HEX.ember, HEX.signal, (hot - 0.5) * 2);
        else col = charK < 0.45 ? mixHex(HEX.signal, HEX.blood, charK / 0.45) : mixHex(HEX.blood, '#57524C', (charK - 0.45) / 0.55, 1 - 0.25 * charK);
        c.fillStyle = col;
        c.fillText(gl.ch, -gw / 2, 0);
        // glowing rim while charring
        if (charK > 0 && charK < 1) { c.strokeStyle = rgba('ember', 0.8 * (1 - charK)); c.lineWidth = 2.2 / zoom; c.strokeText(gl.ch, -gw / 2, 0); }
        // erosion: bites out of the ash
        if (crumble > 0) {
          c.globalCompositeOperation = 'destination-out';
          // bites nibble in from the edges of the glyph box (irregular clusters of small holes)
          const nb = 44;
          c.beginPath();
          for (let i = 0; i < nb; i++) {
            const side = Math.floor(hash(gl.seed, i, 11) * 4);
            const u = hash(gl.seed, i, 7), top = -this.size * 0.76;
            let hx = -gw / 2 + u * gw, hy = lerp(top, 0, hash(gl.seed, i, 8));
            if (side === 0) hy = top + 4; else if (side === 1) hy = -2; else if (side === 2) hx = -gw / 2 + 2; else hx = gw / 2 - 2;
            const grow = clamp(crumble * 2.4 - hash(gl.seed, i, 9) * 1.4);
            const r = this.size * 0.12 * grow * (0.35 + hash(gl.seed, i, 10));
            if (r > 0.3) {
              // each bite is a ragged little polygon
              for (let k = 0; k < 7; k++) {
                const a = (k / 7) * TAU, rr = r * (0.6 + 0.7 * hash(gl.seed, i, k, 12));
                if (k === 0) c.moveTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr); else c.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr);
              }
              c.closePath();
            }
          }
          c.fill();
          c.globalCompositeOperation = 'source-over';
        }
        // emission
        const heat = (charK <= 0 ? lerp(1, 0.55, hot) : (1 - charK) * 0.55) * (w === this.wFuse && charK <= 0 ? 0.9 + 0.1 * noise1(t * 12, gl.seed) : 1);
        if (heat > 0.02) {
          g.save();
          g.translate(x, y); g.rotate(rot);
          g.fillStyle = hot < 0.4 && charK <= 0 ? mixHex('#FFF6EA', HEX.ember, hot / 0.4, heat) : rgba('signal', heat);
          g.fillText(gl.ch, -gw / 2, 0);
          g.restore();
        }
      }
      c.restore();
    }
    c.restore(); g.restore();
  }

  drawFuseParticles(m: Xf, t: number, bs: number, zoom: number, clipY = H) {
    // ash flakes drifting down from the burnt cord and letters; embers rising
    const rate = 46, life = 1.6;
    const n0 = Math.floor((t - life) * rate), n1 = Math.floor(t * rate);
    for (let n = n0; n <= n1; n++) {
      const tb = n / rate;
      if (tb > t || tb < this.T0 - 0.5) continue;
      const age = t - tb;
      const sb = this.burnS(tb) - 20 - hash(n, 1) * 260;
      if (sb < this.sText0 - 170) continue;
      const p = this.at(sb);
      const ember = hash(n, 2) < 0.35;
      const lift = hash(n, 3) < 0.5 ? 0 : this.rad + 16 + hash(n, 4) * this.size * 0.7;
      const x0 = p.x + Math.sin(p.angle) * lift, y0 = p.y - Math.cos(p.angle) * lift;
      const lf = life * (0.5 + 0.5 * hash(n, 5));
      if (age > lf) continue;
      const k = 1 - age / lf;
      if (ember) {
        const vx = (hash(n, 6) - 0.5) * 40 + 25 * noise1(t * 2 + n, 5), vy = -40 - 60 * hash(n, 7);
        const x = x0 + vx * age, y = y0 + vy * age;
        const s = apply(m, x, y), s2 = apply(m, x - vx * 0.03, y - vy * 0.03);
        if (s.y > clipY) continue;
        const I = 2.2 * k * k;
        this.add.seg2(s2.x, s2.y, s.x, s.y, 1.4 * Math.min(2, zoom), [LIN.signal[0] * I + 0.3 * I, LIN.signal[1] * I + 0.1 * I, LIN.signal[2] * I], k);
      } else {
        const vx = 14 * noise1(tb * 3 + n, 6) + 10 * Math.sin(age * 5 + n), vy = 30 + 50 * hash(n, 8);
        const x = x0 + vx * age, y = y0 + vy * age + 30 * age * age;
        const a = 2.2 * (0.5 + hash(n, 9));
        const ang = age * (3 + hash(n, 10) * 4) + n;
        const s = apply(m, x - Math.cos(ang) * a, y - Math.sin(ang) * a), s2 = apply(m, x + Math.cos(ang) * a, y + Math.sin(ang) * a);
        if (s.y > clipY) continue;
        const gv = 0.25 + 0.35 * hash(n, 11);
        this.ink.seg2(s.x, s.y, s2.x, s2.y, 2.2 * Math.min(2.5, zoom), [LIN.ash[0] * gv, LIN.ash[1] * gv, LIN.ash[2] * gv], 0.85 * Math.min(1, k * 2));
      }
    }
  }

  // ------------------------------------------------------------------ part 2: the chart
  drawChart(c: Ctx2, m: Xf, t: number, zoom: number, camX: number) {
    const au = this.ctx.audio;
    const bt = au.beatAt(t);
    const inh = prog(t, this.tEnd - this.beatLen * 0.5, this.tEnd, ease.inCubic);
    const bone = LIN.bone;
    const L = this.ink;
    const P = (x: number, y: number) => apply(m, x, y);
    const seg = (x0: number, y0: number, x1: number, y1: number, w: number, a = 1, col = bone, k = 0.8) => { const p = P(x0, y0), q = P(x1, y1); L.seg2(p.x, p.y, q.x, q.y, w * zoom, [col[0] * k, col[1] * k, col[2] * k], a); };
    // ---- x axis: faint guide, burnt bright behind the spark (the fuse continues as the axis)
    const sx = this.sparkX(t);
    const guide = prog(t, this.tDrop0, this.tBlue + 0.2);
    for (let x = O.x; x < XEND - 20; x += 16) seg(x, O.y, Math.min(x + 8, XEND - 20), O.y, 1.2, 0.3 * guide);
    if (sx > O.x) seg(O.x, O.y, sx, O.y, 2.2, 1);
    const arrow = (x: number, y: number, dx: number, dy: number, a: number, col = bone, k = 0.8, sz = 18) => {
      const nx = -dy, ny = dx;
      seg(x, y, x - dx * sz + nx * sz * 0.39, y - dy * sz + ny * sz * 0.39, 2, a, col, k);
      seg(x, y, x - dx * sz - nx * sz * 0.39, y - dy * sz - ny * sz * 0.39, 2, a, col, k);
    };
    arrow(XEND - 20, O.y, 1, 0, 0.35 * guide + 0.65 * prog(sx, XEND - 300, XEND - 150));
    // ---- y axis on the beat
    const ky = prog(t, this.tYAxis, this.tYAxis + 0.32, ease.outExpo);
    if (ky > 0) {
      const yTop = lerp(O.y, YEND, ky);
      seg(O.x, O.y, O.x, yTop, 2.2, 1);
      arrow(O.x, yTop, 0, -1, ky);
    }
    const tk = prog(t, this.tYAxis + 0.1, this.tYAxis + 0.9);
    for (let i = 1; i <= 10; i++) {
      const x = O.x + i * 120;
      if (x < sx && x < XEND - 60) seg(x, O.y, x, O.y + (i % 5 === 0 ? 14 : 8), 1.4, 0.8);
      const y = O.y - i * 120;
      if (y > YEND + 40 && tk > i / 6) seg(O.x, y, O.x - (i % 5 === 0 ? 14 : 8), y, 1.4, 0.8);
    }

    // ---- the regression line (r = 0.00), strung like a guitar string. "blues" bends it.
    const kf = prog(t, this.tString, this.tString + 0.3, ease.outExpo);
    const D = this.bend(t);
    const strungA = prog(t, this.wBlues.start - 0.25, this.wBlues.start);   // dashed fit -> taut solid string
    if (kf > 0) {
      const x1 = lerp(STRING.x0, STRING.x1, kf);
      const N = 90;
      // afterimages of a vibrating string: where it was a few ms ago
      const ghosts = [[0, 1], [0.012, 0.3], [0.026, 0.14]] as const;
      for (const [dt, ga] of ghosts) {
        const Dg = dt === 0 ? D : this.bend(t - dt);
        if (dt > 0 && Math.abs(Dg - D) < 1.5) continue;
        let px = STRING.x0, py = this.stringY(px, Dg);
        for (let i = 1; i <= N; i++) {
          const x = lerp(STRING.x0, x1, i / N);
          const y = this.stringY(x, Dg);
          // dashed until "blues" pulls it taut
          const dash = strungA >= 1 || Math.floor((x - STRING.x0) / 11) % 2 === 0 ? 1 : strungA;
          seg(px, py, x, y, lerp(1.5, 2.1, strungA), ga * lerp(0.55, 0.95, strungA) * dash, bone, 0.85);
          px = x; py = y;
        }
      }
      // anchors: a nut and a bridge
      const anc = strungA * kf;
      if (anc > 0) for (const ax of [STRING.x0, STRING.x1]) { seg(ax, STRING.y - 9, ax, STRING.y + 9, 2.4, anc); seg(ax - 4, STRING.y + 9, ax + 4, STRING.y + 9, 2.4, anc); }
    }

    // ---- canvas: labels, lyric, agents
    c.save();
    c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    c.textBaseline = 'alphabetic';
    c.font = font(F.mono(500), 17); c.letterSpacing = '5px';
    c.fillStyle = rgba('bone', 0.85 * guide);
    c.textAlign = 'right';
    c.fillText('INTELLIGENCE →', XEND - 10, O.y + 40);
    c.textAlign = 'left';
    if (ky > 0) { c.fillStyle = rgba('bone', 0.85 * ky); c.fillText('GOALS ↑', O.x + 22, YEND + 16); }
    c.letterSpacing = '0px';
    if (kf > 0) {
      c.font = font(F.mono(500), 18); c.fillStyle = rgba('bone', 0.9 * kf);
      c.fillText('r = 0.00', STRING.x1 - 22, STRING.y - 20);
      c.font = font(F.mono(400), 13); c.fillStyle = rgba('bone', 0.55 * kf);
      c.fillText(`n = ${this.agents.length}`, STRING.x1 - 22, STRING.y + 30);
    }
    // footnote, once the string has been released
    const kn = prog(t, this.tBack - 0.3, this.tBack + 0.3);
    if (kn > 0) {
      c.font = font(F.serif(400, true), 24); c.fillStyle = rgba('bone', 0.7 * kn);
      c.textAlign = 'right';
      c.fillText('Any level of intelligence, any final goal.', XEND - 10, YEND + 10);
      c.textAlign = 'left';
    }

    // "Orthogonality thesis" along the x axis, appearing as the spark passes
    const ofam = F.archivo(100, 500);
    c.font = font(ofam, 78);
    c.letterSpacing = '2px';
    this.orthLay.glyphs.forEach((g, i) => {
      if (g.ch === ' ') return;
      const tg = this.orthGlyphT[i]!;
      const k = prog(t, tg, tg + 0.12, ease.outCubic);
      const x = this.orthX0 + g.x;
      if (k <= 0) { c.fillStyle = rgba('bone', 0.14 * guide); c.fillText(g.ch, x, O.y + 104); return; }
      c.fillStyle = rgba('bone', 0.35 + 0.65 * k);
      c.fillText(g.ch, x, O.y + 104 + 14 * (1 - k));
    });
    c.letterSpacing = '0px';

    // agents: pop in on the beats, then nod along (half of them on 1 & 3, half on 2 & 4)
    const wordBox = this.bluesBox(t, D);
    for (const a of this.agents) {
      if (t < a.t0) continue;
      const k = prog(t, a.t0, a.t0 + 0.28, (x) => ease.outBack(x, 2.2));
      const beatInBar = ((bt % 2) + 2) % 2;
      const ph = a.group === 0 ? beatInBar : (beatInBar + 1) % 2;
      const nod = -7 * Math.pow(Math.max(0, 1 - ph), 3) * (ph < 1 ? 1 : 0);
      const dx = 9 * noise1(t * 0.45 + a.phase * 3, 21) + 2 * Math.sin(t * 0.9 + a.phase);
      const dy = 7 * noise1(t * 0.4 + a.phase * 5, 22) + nod;
      const par = (camX - 1010) * (a.depth - 1) * 1.4;
      let x = a.x + dx - par, y = a.y + dy;
      if (inh > 0) { const sxp = this.sparkX(t); x = lerp(x, sxp, 0.06 * inh); y = lerp(y, O.y, 0.06 * inh); }
      const r = a.size * k * a.depth;
      // make room for the word as it bends through the crowd
      const near = wordBox ? 1 - 0.8 * smoothstep(60, 0, Math.max(wordBox.x0 - x, x - wordBox.x1, wordBox.y0 - y, y - wordBox.y1)) : 1;
      const al = clamp(0.35 + 0.55 * a.depth, 0.3, 0.95) * near;
      c.strokeStyle = rgba('bone', al); c.fillStyle = rgba('bone', al);
      c.lineWidth = 1.3;
      if (a.kind === 0) { c.beginPath(); c.arc(x, y, r * 0.7, 0, TAU); c.fill(); }
      else if (a.kind === 1) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
      else if (a.kind === 2) { c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); }
      else if (a.kind === 3) { c.strokeRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); }
      else {
        // labelled agent: ring + dot + leader + mono label
        c.lineWidth = 1.6;
        c.beginPath(); c.arc(x, y, r * 1.6, 0, TAU); c.stroke();
        c.beginPath(); c.arc(x, y, r * 0.45, 0, TAU); c.fill();
        const lk = prog(t, a.t0 + 0.12, a.t0 + 0.4, ease.outCubic);
        if (lk > 0 && a.label) {
          const lx = x + a.lx! * 16, ly = y + a.ly! * 16;
          c.beginPath(); c.moveTo(x + a.lx! * r * 1.6 * 0.7, y + a.ly! * r * 1.6 * 0.7); c.lineTo(lx + a.lx! * 18 * lk, ly); c.stroke();
          c.font = font(F.mono(400), 15); c.letterSpacing = '1px';
          c.fillStyle = rgba('bone', 0.9 * lk * near);
          c.textAlign = a.lx! > 0 ? 'left' : 'right';
          const txt = a.pdoom ? `${a.label} · P(doom) ` : a.label;
          const n = Math.ceil(txt.length * lk);
          c.fillText(txt.slice(0, n), lx + a.lx! * 24, ly + 5);
          if (a.pdoom && n >= txt.length) {
            const w0 = c.measureText(txt).width;
            c.fillStyle = rgba('signal', 0.95 * lk);
            c.textAlign = 'left';
            c.fillText(formatPDoom(this.pdoom.value(t)), a.lx! > 0 ? lx + 24 + w0 : lx - 24 + 4, ly + 5);
          }
          c.textAlign = 'left'; c.letterSpacing = '0px';
        }
      }
    }

    this.drawBlues(c, t, D);
    c.restore();
  }

  /** Plane-space box around "blues" on its bent string (for making room in the crowd). */
  bluesBox(t: number, D: number) {
    if (t < this.wBlues.start - 0.4) return null;
    const hw = this.bluesLay.width / 2 + 20;
    const yTop = this.stringY(XP, D) - this.bluesSize * 0.72 - 70 * prog(t, this.tFlat, this.tFlat + 0.2);
    const right = XP + hw + 190 * prog(t, this.tLeap - 0.1, this.tLeap + 0.1) * (1 - prog(t, this.tBack - 0.2, this.tBack + 0.2));
    return { x0: XP - hw, x1: right, y0: yTop, y1: STRING.y + 6 };
  }

  /** "blues" standing on the string: set letter by letter as sung, riding every bend; tab notation around it. */
  drawBlues(c: Ctx2, t: number, D: number) {
    const wb = this.wBlues;
    if (t < wb.start - 0.4) return;
    const lay = this.bluesLay, sz = this.bluesSize;
    const pre = prog(t, wb.start - 0.4, wb.start - 0.05);
    const span = Math.min(0.5, (wb.end - wb.start) * 0.6);
    const x0 = XP - lay.width / 2;
    c.save();
    c.font = font(this.bluesFam, sz);
    c.textBaseline = 'alphabetic';
    lay.glyphs.forEach((g, i) => {
      const gx = x0 + g.x + g.w / 2;
      const y = this.stringY(gx, D) - 7;
      const e = 2;
      const ang = Math.atan2(this.stringY(gx + e, D) - this.stringY(gx - e, D), 2 * e);
      const tg = wb.start + (i / lay.glyphs.length) * span;
      const sung = t >= tg;
      c.save();
      c.translate(gx, y); c.rotate(ang);
      if (!sung) {
        c.strokeStyle = rgba('bone', 0.4 * pre); c.lineWidth = 1.4;
        c.strokeText(g.ch, -g.w / 2, 0);
      } else {
        const h = Math.exp(-(t - tg) / 0.3);
        c.fillStyle = h > 0.03 ? `rgba(255,${Math.round(lerp(233, 150, h))},${Math.round(lerp(223, 80, h))},0.97)` : rgba('bone', 0.97);
        c.fillText(g.ch, -g.w / 2, 0);
      }
      c.restore();
    });
    // ---- tab notation, deadpan and precise
    const topY = this.stringY(XP, D) - sz * 0.78;
    c.font = font(F.mono(500), 17); c.letterSpacing = '2px';
    // vib. — a wavy line written along as the vibrato is sung
    const kv = prog(t, this.tFlat + 0.12, this.tLeap, ease.linear);
    const vibA = prog(t, this.tFlat + 0.1, this.tFlat + 0.25) * (1 - prog(t, this.tLeapEnd, this.tLeapEnd + 0.25));
    if (kv > 0 && vibA > 0) {
      const wx0 = x0 + 40, wx1 = x0 + lay.width - 10;
      c.fillStyle = rgba('bone', 0.8 * vibA);
      c.fillText('vib.', wx0 - 70, topY - 14);
      c.strokeStyle = rgba('bone', 0.8 * vibA); c.lineWidth = 1.6;
      c.beginPath();
      const xe = lerp(wx0, wx1, kv);
      for (let x = wx0; x <= xe; x += 2) {
        const y = topY - 20 + 5 * Math.sin((x - wx0) / 13 * TAU / 2);
        if (x === wx0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    // bend +12 — tab notation: a curved arrow from the rest pitch up to the bent pitch
    const kb = prog(t, this.tLeap - 0.02, this.tLeapEnd + 0.05, ease.outCubic);
    const bA = kb * (1 - prog(t, this.tBack - 0.2, this.tBack + 0.2));
    if (bA > 0) {
      const ax = x0 + lay.width + 90, baseY = STRING.y - 16;
      const peak = this.stringY(XP, Math.max(D, this.bend(this.tLeapEnd))) - sz * 0.35;
      const tipY = Math.min(baseY - 60, peak), tipX = ax + 64;
      c.strokeStyle = rgba('bone', 0.85 * bA); c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(ax, baseY);
      const n = 24;
      for (let i = 1; i <= n; i++) {
        const u = (i / n) * kb;
        c.lineTo(ax + (tipX - ax) * (1 - Math.cos(u * Math.PI / 2)), lerp(baseY, tipY, Math.sin(u * Math.PI / 2)));
      }
      c.stroke();
      if (kb > 0.9) {
        c.beginPath(); c.moveTo(tipX - 7, tipY + 12); c.lineTo(tipX, tipY); c.lineTo(tipX + 7, tipY + 12); c.stroke();
        c.fillStyle = rgba('bone', 0.9 * bA);
        c.textAlign = 'center';
        c.fillText('+12', tipX, tipY - 14);
        c.font = font(F.mono(400), 13); c.fillStyle = rgba('ash', 0.9 * bA);
        c.fillText('(one octave)', tipX, tipY - 36);
        c.textAlign = 'left';
      }
    }
    // the blue note: a scrap of staff, one B-flat on its middle line; the flat and the note in orange
    const kf = prog(t, this.tBlueNote - 0.06, this.tBlueNote + 0.25, ease.outCubic);
    if (kf > 0 && this.tBlueNote < this.tEnd) {
      const sp = 12, sw = 150;
      const fx = BLUE_NOTE.x, fy = BLUE_NOTE.y;
      c.save();
      c.strokeStyle = rgba('bone', 0.7); c.lineWidth = 1.3;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(fx, fy + i * sp); c.lineTo(fx + sw * kf, fy + i * sp); c.stroke(); }
      const pop = prog(t, this.tBlueNote, this.tBlueNote + 0.18, (x) => ease.outBack(x, 2.6));
      if (pop > 0) {
        c.save(); c.translate(fx + 52, fy + sp * 0.55); c.scale(pop, pop); drawFlat(c, sp * 3.3, rgba('signal', 0.97)); c.restore();
        c.save(); c.translate(fx + 92, fy); c.rotate(-0.38); c.scale(pop, pop);
        c.fillStyle = rgba('signal', 0.97); c.beginPath(); c.ellipse(0, 0, sp * 0.72, sp * 0.5, 0, 0, TAU); c.fill();
        c.restore();
        c.strokeStyle = rgba('signal', 0.97 * pop); c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(fx + 92 + sp * 0.62, fy - 2); c.lineTo(fx + 92 + sp * 0.62, fy - sp * 3.4); c.stroke();
      }
      const la = prog(t, this.tBlueNote + 0.12, this.tBlueNote + 0.4);
      c.font = font(F.mono(400), 14); c.letterSpacing = '1px';
      c.fillStyle = rgba('ash', 0.95 * la);
      c.fillText('B-flat  ·  the blue note', fx, fy + 3 * sp + 22);
      c.restore();
    }
    c.letterSpacing = '0px';
    c.restore();
  }
}

/** A flat sign (music), drawn by hand: `h` px tall, origin at the foot of the stem. */
function drawFlat(c: Ctx2, h: number, col: string) {
  const st = Math.max(1.4, h * 0.055);
  c.fillStyle = col;
  c.fillRect(-st / 2, -h, st, h);
  c.beginPath();
  // the bowl: bulges right from the stem, closes to a point at the foot; counter cut with even-odd
  c.moveTo(st / 2, -h * 0.3);
  c.bezierCurveTo(h * 0.16, -h * 0.44, h * 0.4, -h * 0.4, h * 0.36, -h * 0.26);
  c.bezierCurveTo(h * 0.32, -h * 0.13, h * 0.12, -h * 0.05, st / 2, 0);
  c.lineTo(st / 2, -h * 0.07);
  c.bezierCurveTo(h * 0.1, -h * 0.12, h * 0.24, -h * 0.2, h * 0.24, -h * 0.27);
  c.bezierCurveTo(h * 0.24, -h * 0.34, h * 0.12, -h * 0.33, st / 2, -h * 0.22);
  c.closePath();
  c.fill('evenodd');
}

/** Centripetal-ish Catmull-Rom through control points, `seg` samples per span. */
function catmull(p: V2[], seg: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]!, p1 = p[i]!, p2 = p[i + 1]!, p3 = p[Math.min(p.length - 1, i + 2)]!;
    for (let j = 0; j < seg; j++) {
      const u = j / seg, u2 = u * u, u3 = u2 * u;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      });
    }
  }
  out.push(p[p.length - 1]!);
  return out;
}
