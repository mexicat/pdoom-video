// FIG. 5 `spacetime` — four movements of one idea (revision 2).
//  I   "We had a stable training run,": the stable run as a pristine instrument. A triggered phosphor
//      scope, the waveform almost still, the beam repainting it once per beat and writing the lyric on it.
//      Locked-off camera, one slow, barely perceptible push; the glass graticule parallaxes over the phosphor.
//  II  "But now the singularity's begun": on "But" the trace collapses to a point like a CRT switched off;
//      on the "now" beat the point becomes a black hole. The graticule is lensed around a black disk and a
//      photon ring, "NOW" is set with the hole as its O; on the downbeat the camera plunges through it; the
//      lyric wraps the photon ring (physically lensed, with its flipped ghost inside); "begun" bends under
//      the hole; the camera falls through the horizon. Handheld, rolling camera, crash zooms on the beats.
//  III "And you're optimizing, accelerating,": out of the throat of a 3D spacetime sheet; streamlines
//      spiral into the well, faster every beat; the words orbit on a marquee ring and stretch as sung.
//      Sweeping crane and orbit moves, a cut on the downbeat.
//  IV  "I feel my atoms rearranging": straight down into the vortex; the lyric as atoms that detach and
//      re-form as a paperclip drawn by the spark. Locked overhead, slow corkscrew.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, measure, textPoints, type TextLayout } from '../engine/type';
import { norm, type Line, type Word } from '../engine/lyrics';
import { strokeText, type StrokeText } from '../engine/stroke';
import { sparkHead, sparkParticles } from './_motifs';
import { PDoom, formatPDoom } from '../engine/hud';
import { clamp, lerp, ease, prog, pulse, hash, noise1, smoothstep, springStep, TAU, type V2, polylineLengths, pointAtLength } from '../engine/util';
import { LensPass, MipLayer } from './spacetime-lens';

type P3 = { x: number; y: number; z: number };
type Proj = { x: number; y: number; s: number; w: number };
type Cam = { pos: P3; tgt: P3; roll: number; fov: number };

const GN = 20; // sheet half-size (grid lines at integers -GN..GN)
const SIG = 9; // well falloff
const DIV = 120; // px per graticule division at scope zoom 1

const sineInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));

function findWord(line: Line, q: string): Word {
  const n = norm(q);
  const w = line.words.find((x) => norm(x.w) === n);
  if (!w) throw new Error(`word not found: ${q}`);
  return w;
}
const orbit = (tgt: P3, yaw: number, pitch: number, dist: number): P3 => ({
  x: tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist,
  y: tgt.y + Math.sin(pitch) * dist,
  z: tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist,
});

/** Per-char [start,end] times for a line of words joined by single spaces. */
function charTimes(words: Word[]): [number, number][] {
  const out: [number, number][] = [];
  words.forEach((w, wi) => {
    const n = w.w.length;
    for (let j = 0; j < n; j++) out.push([lerp(w.start, w.end, j / n), lerp(w.start, w.end, (j + 1) / n)]);
    if (wi < words.length - 1) out.push([w.end, w.end]);
  });
  return out;
}

/** Gem-clip outline (long axis x in [-1,1]), sampled evenly. */
function paperclip(n: number): V2[] {
  const P: V2[] = [];
  const line = (a: V2, b: V2, k = 24) => { for (let i = 0; i < k; i++) P.push({ x: lerp(a.x, b.x, i / k), y: lerp(a.y, b.y, i / k) }); };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, k = 40) => { for (let i = 0; i < k; i++) { const a = lerp(a0, a1, i / k); P.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } };
  line({ x: -0.42, y: -0.18 }, { x: 0.4, y: -0.18 });
  arc(0.4, 0, 0.18, -Math.PI / 2, Math.PI / 2);
  line({ x: 0.4, y: 0.18 }, { x: -0.73, y: 0.18 });
  arc(-0.73, -0.09, 0.27, Math.PI / 2, Math.PI * 1.5);
  line({ x: -0.73, y: -0.36 }, { x: 0.64, y: -0.36 });
  arc(0.64, 0, 0.36, -Math.PI / 2, Math.PI / 2);
  line({ x: 0.64, y: 0.36 }, { x: -0.22, y: 0.36 });
  P.push({ x: -0.22, y: 0.36 });
  const L = polylineLengths(P);
  const tot = L[L.length - 1]!;
  const out: V2[] = [];
  for (let i = 0; i < n; i++) { const p = pointAtLength(P, L, (tot * i) / Math.max(1, n - 1)); out.push({ x: p.x, y: p.y }); }
  return out;
}

interface Stroke2 { st: StrokeText; ct: [number, number][]; x0: number; b0: number; S: number }
interface Dot { x: number; y: number; t0: number; tx: number; ty: number; tLeave: number; tArr: number; seed: number; row: number }
interface SrcGlyph { ch: string; x: number; w: number; t0: number; t1: number }
interface Lens { C: V2; thE: number; Rs: number; roll: number; swirl: number; gridPx: number; ring: number; heat: number; textK: number; pitch: number }
const CLIP = { x: W / 2, y: 318, s: 455, rot: -0.2 };

export default class SpacetimeScene extends Scene {
  cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 400);
  vp = new THREE.Matrix4();
  v4 = new THREE.Vector4();
  bg = new FSPass(/* glsl */ `
    uniform float uKick;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      float r = length(p);
      vec3 c = C_INK;
      c += C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, r));
      fragColor = vec4(c, 1.0);
    }`, { uKick: { value: 0 } });
  src = new MipLayer();
  lens = new LensPass(this.src.texture);
  L3 = new LineBatch(160000, { screen2D: false, blend: 'add' });
  L2 = new LineBatch(24000, { screen2D: true, blend: 'add' });
  text = new Layer2D();

  // ---- timing (all derived from the lyric and the beat grid)
  T0 = 0; T1 = 0;
  l1!: Line; l2!: Line; l3!: Line; l4!: Line;
  wBut!: Word; wNow!: Word; wThe!: Word; wSing!: Word; wBegun!: Word;
  tBut = 0; tNow = 0; tPlunge = 0; tDb2 = 0; tFall0 = 0; tM3 = 0;
  tAnd = 0; tOpt = 0; tAcc = 0; tAccEnd = 0; tI = 0; tAtoms = 0; tRe = 0; tReEnd = 0;
  tCutB = 0; tTop = 0;
  m2beats: number[] = [];

  // ---- content
  s1!: Stroke2;
  big = F.archivo(100, 900);
  nowLay!: TextLayout; nowX0 = 0; nowBase = 0; nowSize = 380; butSize = 118;
  ringGlyphs: SrcGlyph[] = []; ringFam = F.archivo(87.5, 900);
  begunLay!: TextLayout; begunGlyphT: [number, number][] = [];
  flowT: Float32Array = new Float32Array(0);
  flowDt = 1 / 240;
  dots: Dot[] = [];
  clip: V2[] = []; clipL = new Float32Array(0); tClip0 = 0; tClip1 = 0;
  ringWords: Word[] = [];
  pd!: PDoom;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    this.l1 = ly.get('stable training run');
    this.l2 = ly.get('singularity');
    this.l3 = ly.get('optimizing');
    this.l4 = ly.get('atoms');
    this.wBut = this.l2.words[0]!;
    this.wNow = findWord(this.l2, 'now');
    this.wThe = findWord(this.l2, 'the');
    this.wSing = findWord(this.l2, "singularity's");
    this.wBegun = findWord(this.l2, 'begun');
    this.tBut = this.wBut.start;
    // the transformation lands on the beat of "now"
    this.tNow = Math.max(this.tBut + 0.12, au.nearestBeat(this.wNow.start));
    this.tAnd = this.l3.words[0]!.start;
    this.tM3 = au.timeOfBeat(Math.ceil(au.beatAt(this.tAnd) - 0.05));
    this.tOpt = findWord(this.l3, 'optimizing,').start;
    const wA = findWord(this.l3, 'accelerating,');
    this.tAcc = wA.start; this.tAccEnd = wA.end;
    this.tI = this.l4.words[0]!.start;
    this.tAtoms = findWord(this.l4, 'atoms').start;
    const wR = findWord(this.l4, 'rearranging');
    this.tRe = wR.start; this.tReEnd = wR.end;
    const downIn = (lo: number, hi: number) => au.downbeats.find((d) => d > lo && d < hi);
    const beatAfter = (x: number) => au.timeOfBeat(Math.ceil(au.beatAt(x) - 1e-3));
    this.tPlunge = downIn(this.tNow + 0.2, this.wSing.start + 0.3) ?? beatAfter(this.wThe.end);
    this.tDb2 = downIn(this.tPlunge + 0.5, this.wBegun.start + 0.3) ?? beatAfter(this.wBegun.start - 0.3);
    this.tFall0 = Math.max(this.wBegun.end - 0.2, this.tM3 - 0.36);
    this.m2beats = au.beats.filter((b) => b > this.tNow + 0.05 && b < this.tM3 - 0.05);
    /** Nearest downbeat (else beat) to `target` inside [lo, hi]. */
    const pick = (target: number, lo: number, hi: number) => {
      for (const list of [au.downbeats, au.beats]) {
        let best = NaN;
        for (const b of list) if (b >= lo && b <= hi && (isNaN(best) || Math.abs(b - target) < Math.abs(best - target))) best = b;
        if (!isNaN(best)) return best;
      }
      return target;
    };
    this.tCutB = pick(this.tAcc, this.tOpt + 0.3, this.tAcc + 0.6);
    this.tTop = pick(this.tAccEnd - 0.1, this.tAcc + 0.8, this.tI + 0.4);

    // ---- I: beam-written lyric (vector font), in graticule divisions
    {
      const st = strokeText(this.l1.words.map((w) => w.w).join(' '), 'osmotron', 100);
      const S = 0.95 / 100;
      this.s1 = { st, ct: charTimes(this.l1.words), S, b0: 0.62, x0: (-st.width * S) / 2 };
    }

    // ---- II: "BUT / NOW" with the hole as the O, "the" tucked under; the ring word; "BEGUN"
    {
      const mc = document.createElement('canvas').getContext('2d')!;
      mc.font = font(this.big, this.nowSize);
      this.nowLay = layout('NOW', this.big, this.nowSize);
      const o = this.nowLay.glyphs[1]!;
      const m = mc.measureText('O');
      const oCy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2; // O centre above the baseline
      const C = this.lensCentre0();
      this.nowX0 = C.x - (o.x + o.w / 2);
      this.nowBase = C.y + oCy;
    }
    {
      const ws = this.wSing, txt = ws.w.toUpperCase();
      const lay = layout(txt, this.ringFam, 100, 2);
      const n = lay.glyphs.length;
      // letters are set as sung; the word is long and held, so spread the letters over its first 80%
      const span = (ws.end - ws.start) * 0.8;
      this.ringGlyphs = lay.glyphs.map((g, i) => ({ ch: g.ch, x: g.x, w: g.w, t0: ws.start + (i / n) * span, t1: ws.start + ((i + 1) / n) * span }));
    }
    {
      const wb = this.wBegun;
      this.begunLay = layout(wb.w.toUpperCase(), this.big, 100);
      const n = this.begunLay.glyphs.length;
      const span = Math.min(wb.end - wb.start, 0.7);
      this.begunGlyphT = this.begunLay.glyphs.map((_, i) => [wb.start + (i / n) * span, wb.start + ((i + 1) / n) * span]);
    }

    // ---- III: flow clock — speed steps up on every beat after "And you're"
    const n = Math.ceil((this.T1 - this.T0 + 1) / this.flowDt);
    this.flowT = new Float32Array(n + 1);
    let acc = 0;
    for (let i = 0; i <= n; i++) {
      this.flowT[i] = acc;
      const t = this.T0 + i * this.flowDt;
      acc += this.flowSpeed(t) * this.flowDt;
    }

    // ---- IV: atoms. Row 1 ("I feel my atoms") re-forms as a paperclip drawn by the spark;
    //      row 2 ("rearranging") stays legible, its atoms jittering, rearranging in place.
    const famD = F.archivo(100, 900);
    const sz = 150;
    const rows = [this.l4.words.slice(0, this.l4.words.indexOf(wR)), [wR]];
    const row1: Dot[] = [];
    rows.forEach((ws, ri) => {
      const txt = ws.map((w) => w.w).join(' ');
      const lay = layout(txt, famD, sz);
      const x0 = W / 2 - lay.width / 2, y0 = ri === 0 ? 575 : 575 + sz * 1.08;
      const tp = textPoints(txt, famD, sz, 6.2, 7 + ri);
      const ranges: { x0: number; x1: number; w: Word }[] = [];
      let ci = 0;
      ws.forEach((w) => {
        const g0 = lay.glyphs[ci]!, g1 = lay.glyphs[Math.min(lay.glyphs.length - 1, ci + w.w.length - 1)]!;
        ranges.push({ x0: g0.x, x1: g1.x + g1.w, w });
        ci += w.w.length + 1;
      });
      tp.forEach((q, qi) => {
        const r = ranges.find((z) => q.x >= z.x0 - 4 && q.x <= z.x1 + 4) ?? ranges[ranges.length - 1]!;
        const u = clamp((q.x - r.x0) / Math.max(1, r.x1 - r.x0));
        // "rearranging" is held past the cut into the next scene: finish setting it just before the cut
        const wEnd = Math.min(r.w.end, this.T1 - 0.12);
        const d: Dot = { x: x0 + q.x, y: y0 + q.y, t0: lerp(r.w.start, wEnd, u * 0.92), tx: 0, ty: 0, tLeave: Infinity, tArr: Infinity, seed: qi + ri * 10000, row: ri };
        (ri === 0 ? row1 : this.dots).push(d);
      });
    });
    this.clip = paperclip(900).map((q) => {
      const x = q.x * CLIP.s, y = q.y * CLIP.s;
      return { x: CLIP.x + x * Math.cos(CLIP.rot) - y * Math.sin(CLIP.rot), y: CLIP.y + x * Math.sin(CLIP.rot) + y * Math.cos(CLIP.rot) };
    });
    this.clipL = polylineLengths(this.clip);
    this.tClip0 = this.tRe + 0.4; this.tClip1 = this.T1 - 0.1;
    row1.sort((p, q) => p.x - q.x + 0.001 * (p.y - q.y));
    const tot = this.clipL[this.clipL.length - 1]!;
    row1.forEach((d, j) => {
      const fr = (j + 0.5) / row1.length;
      const q = pointAtLength(this.clip, this.clipL, fr * tot);
      d.tx = q.x + (hash(d.seed, 5) - 0.5) * 5; d.ty = q.y + (hash(d.seed, 6) - 0.5) * 5;
      const inv = fr < 0.5 ? Math.sqrt(fr / 2) : 1 - Math.sqrt((1 - fr) / 2); // inverse of inOutQuad
      d.tArr = lerp(this.tClip0, this.tClip1, inv);
      d.tLeave = Math.max(this.tRe - 0.05 + 0.25 * hash(d.seed, 7), d.tArr - 0.95);
      this.dots.push(d);
    });
    this.ringWords = this.l3.words;
    this.pd = new PDoom(this.ctx.lyrics);
  }

  // ================================================================ I: the scope
  /** Scope camera: one slow push and a lateral drift over the whole movement (no cuts, no punches). */
  scopeCam(t: number) {
    const u = sineInOut(prog(t, this.T0, this.tNow));
    return { s: 1 + 0.06 * u, dx: -18 * u, dy: 4 * u };
  }
  /** Phosphor plane (divisions, y up) -> screen. Sits a hair behind the glass: slower parallax. */
  phos(t: number, x: number, y: number): V2 {
    const c = this.scopeCam(t);
    const s = DIV * c.s * 0.985;
    return { x: W / 2 + 0.8 * c.dx + x * s, y: H / 2 + 0.8 * c.dy - y * s };
  }
  lensCentre0(): V2 { return this.phos(this.tNow, 0, 0); }
  /** 0 → 1: the CRT collapse on "But" (horizontal squeeze to a point). */
  squeeze(t: number) { return prog(t, this.tBut + 0.03, this.tNow, ease.inCubic); }
  /** Triggered waveform (divisions): nearly still, drifting 1/16 wavelength per beat. */
  traceAmp(t: number) {
    const on = prog(t, this.T0 + 0.05, this.T0 + 1.2, ease.inOutCubic);
    return 0.5 * on * (1 - prog(t, this.tBut - 0.02, this.tBut + 0.16, ease.outCubic));
  }
  traceY(x: number, t: number) {
    const ph = -TAU * this.ctx.audio.beatAt(t) / 16;
    return this.traceAmp(t) * Math.sin((TAU / 4) * x + ph) * (1 + 0.04 * Math.sin((TAU / 4) * 3 * x + 2 * ph));
  }
  beamX(f: Frame) { return -8.3 + 16.6 * f.beatPhase; }

  drawScope(t: number, f: Frame, L: LineBatch) {
    if (t >= this.tNow + 0.02) return;
    const sg = LIN.signal, em = LIN.ember;
    const sq = this.squeeze(t);
    const hx = 1 - sq;
    const bright = 1 + 3 * sq * sq;
    const on = prog(t, this.T0 - 0.01, this.T0 + 0.02);
    const ign = 1 - prog(t, this.T0, this.T0 + 0.55, ease.outCubic); // the handoff flatline, still white-hot
    const beamX = this.beamX(f) * hx;
    const N = 560;
    let prev: V2 | null = null;
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1;
      const x = 9 * u;
      const p = this.phos(t, x * hx, this.traceY(x, t));
      if (prev) {
        let d = beamX - x * hx;
        if (d < 0) d += 16.6 * hx + 1e-3;
        const glow = lerp(Math.exp(-d / 2.6), 1, ign);
        const I = (0.42 + 2.9 * glow) * on * bright;
        // hot core + a wide soft halo (the phosphor's bloom)
        const wh = 0.45 * ign;
        L.seg2(prev.x, prev.y, p.x, p.y, 2.1 + 1.1 * glow - 0.6 * ign, [lerp(lerp(sg[0], em[0], glow * 0.4), 1.6, wh) * I * 1.35, lerp(lerp(sg[1], em[1], glow * 0.4), 1.1, wh) * I * 1.2, lerp(sg[2], 0.8, wh) * I * 1.05], 1);
        L.seg2(prev.x, prev.y, p.x, p.y, 10 + 30 * ign, [sg[0] * (0.07 + 0.05 * ign) * I, sg[1] * (0.07 + 0.05 * ign) * I, sg[2] * (0.07 + 0.05 * ign) * I], 1);
      }
      prev = p;
    }
    // long persistence: the last sweeps linger, each drifted a sixteenth of a wavelength
    const beatNow = this.ctx.audio.beatAt(t), amp = this.traceAmp(t);
    for (let k = 1; k <= 3; k++) {
      const Ik = 0.16 * Math.pow(0.5, k - 1) * on * (1 - ign) * (1 - sq);
      if (Ik <= 0.002 || amp <= 0.01) continue;
      const ph = -TAU * (beatNow - k) / 16;
      let q: V2 | null = null;
      for (let i = 0; i <= 280; i++) {
        const x = -9 + (18 * i) / 280;
        const p = this.phos(t, x * hx, amp * Math.sin((TAU / 4) * x + ph));
        if (q) L.seg2(q.x, q.y, p.x, p.y, 1.6, [sg[0] * Ik, sg[1] * Ik, sg[2] * Ik], 1);
        q = p;
      }
    }
    // CH2 (P(doom)): a flat, dim, muted trace nobody is watching
    const ch2 = prog(t, this.T0 + 0.3, this.T0 + 0.9) * (1 - sq);
    if (ch2 > 0) {
      const gr = LIN.ash;
      let q: V2 | null = null;
      for (let i = 0; i <= 160; i++) {
        const x = -9 + (18 * i) / 160;
        const y = -3.1 + 0.012 * noise1(x * 3 + t * 9, 31) + 0.02 * this.pd.value(t);
        const p = this.phos(t, x * hx, y * (1 - sq));
        if (q) L.seg2(q.x, q.y, p.x, p.y, 1.4, [gr[0] * 0.32 * ch2, gr[1] * 0.3 * ch2, gr[2] * 0.28 * ch2], 1);
        q = p;
      }
    }
    // line 1, written by the beam and riding the wave; it is swallowed by the collapse
    const a1 = prog(t, this.T0, this.T0 + 0.1);
    const vy = 1 - sq;
    this.drawStroke2(this.s1, t, a1 * (1 + 1.5 * sq), (a, b) => this.phos(t, a * hx, (b + 0.75 * this.traceY(a, t)) * vy), 2.6, L);
  }

  drawStroke2(S: Stroke2, t: number, alpha: number, map: (a: number, b: number) => V2, width: number, L: LineBatch) {
    if (alpha <= 0) return;
    const sg = LIN.signal, em = LIN.ember;
    const { st, ct } = S;
    const len = this.writtenLen(st, ct, t);
    for (let si = 0; si < st.strokes.length; si++) {
      const pts = st.strokes[si]!, Ls = st.lens[si]!, s0 = st.startLen[si]!;
      let prev: V2 | null = null;
      for (let j = 0; j < pts.length; j++) {
        const sl = s0 + Ls[j]!;
        const p = map(S.x0 + pts[j]!.x * S.S, S.b0 - pts[j]!.y * S.S);
        if (prev) {
          const written = sl <= len;
          const hot = written ? Math.exp(-Math.max(0, len - sl) / 1.4) : 0;
          const c0 = ct[st.charOf[si]!]?.[0] ?? Infinity;
          const I = (written ? 1.3 + 2.2 * hot : 0.12 * prog(t, c0 - 0.5, c0 - 0.1)) * alpha;
          L.seg2(prev.x, prev.y, p.x, p.y, width,
            [lerp(sg[0], em[0] * 1.6, hot) * I, lerp(sg[1], em[1] * 1.4, hot) * I, lerp(sg[2], em[2] * 1.2, hot) * I], 1);
        }
        prev = p;
      }
    }
  }
  writtenLen(st: StrokeText, ct: [number, number][], t: number) {
    let len = 0;
    for (let i = 0; i < st.charRange.length; i++) {
      const [a, b] = st.charRange[i]!;
      const [t0, t1] = ct[i] ?? [Infinity, Infinity];
      if (t >= t1) len = b;
      else if (t > t0) { len = a + (b - a) * ((t - t0) / Math.max(1e-3, t1 - t0)); break; }
      else break;
    }
    return len;
  }

  drawReadouts(t: number, c: CanvasRenderingContext2D) {
    const a = prog(t, this.T0 + 0.1, this.T0 + 0.4) * (1 - prog(t, this.tNow - 0.02, this.tNow + 0.03));
    if (a <= 0) return;
    c.save();
    c.font = font(F.mono(500), 17);
    c.letterSpacing = '2px';
    c.textBaseline = 'alphabetic';
    const bpm = this.ctx.audio.bpm;
    const hz = bpm / 60;
    const but = prog(t, this.tBut, this.tBut + 0.05);
    const blink = Math.floor(t * 8) % 2 === 0;
    c.fillStyle = rgba('bone', 0.75 * a);
    c.textAlign = 'left';
    c.fillText('CH1  0.2 V/div  DC', 96, 92);
    c.fillStyle = rgba('ash', 0.8 * a);
    c.fillText(`f = ${but > 0 ? '→ ∞' : hz.toFixed(3)} Hz`, 96, 120);
    c.fillStyle = rgba('bone', 0.75 * a);
    c.fillText('CH2  P(doom)', 96, 160);
    c.fillStyle = rgba('signal', 0.95 * a);
    c.fillText(formatPDoom(this.pd.value(t)), 96 + c.measureText('CH2  P(doom)  ').width, 160);
    c.fillStyle = rgba('ash', 0.7 * a);
    c.fillText('(muted)', 96, 188);
    c.textAlign = 'right';
    c.fillStyle = rgba('bone', 0.75 * a);
    c.fillText(`M  ${(60000 / bpm / 4).toFixed(1)} ms/div`, W - 96, 92);
    const trig = but > 0 ? (blink ? 'NO SIGNAL' : '') : "TRIG'D    CH1";
    c.fillStyle = but > 0 ? rgba('signal', a) : rgba('ash', 0.8 * a);
    c.fillText(trig, W - 96, 120);
    if (but <= 0) {
      // ▲ (not in Plex Mono): a small triangle drawn in the blank cell before "CH1"
      const cell = c.measureText(' ').width;
      const tx = W - 96 - c.measureText(' CH1').width - cell + (cell - 2) / 2;
      c.beginPath(); c.moveTo(tx - 5.2, 120); c.lineTo(tx + 5.2, 120); c.lineTo(tx, 120 - 9.4); c.closePath(); c.fill();
    }
    // the run's own vital sign, calm, ticking down
    if (but <= 0) {
      const loss = 0.0213 - 0.0009 * prog(t, this.T0, this.tBut);
      c.fillStyle = rgba('ash', 0.7 * a);
      c.fillText(`loss ${loss.toFixed(4)}  ·  stable`, W - 96, 148);
    }
    c.restore();
  }

  // ================================================================ II: the singularity
  lensAt(t: number, f: Frame): Lens {
    const au = this.ctx.audio;
    const C0 = this.lensCentre0();
    // the collapse starts to pull: a faint lens before the hole opens
    let thE = 22 * prog(t, this.tBut + 0.05, this.tNow, ease.inQuad);
    let Rs = 0;
    let Z = 1; // camera "distance" to the hole
    let roll = 0;
    if (t >= this.tNow) {
      const born = prog(t, this.tNow, this.tNow + 0.22, ease.outExpo);
      thE = lerp(thE, 96, born);
      Rs = 0.44 * 96 * ease.outBack(prog(t, this.tNow, this.tNow + 0.3), 2.2) * (born > 0 ? 1 : 0);
      // the plunge through the O on the downbeat, then a slow creep; crash zooms on beats, a slam on bar 2
      const pl = prog(t, this.tPlunge - 0.03, this.tPlunge + 0.42, ease.outExpo);
      Z = lerp(1.06 * (1 + 0.02 * (t - this.tNow)), 2.05, pl) * (1 + 0.035 * Math.max(0, t - this.tPlunge));
      Z *= 1 + 0.12 * prog(t, this.tDb2, this.tDb2 + 0.3, ease.outExpo);
      let punch = 0;
      for (const b of this.m2beats) if (b > this.tPlunge + 0.1) punch = Math.max(punch, pulse(t, b, 0.1));
      Z *= 1 + 0.04 * punch;
      thE = 96 * Z * lerp(born, 1, prog(t, this.tNow + 0.2, this.tNow + 0.3));
      Rs = lerp(Rs, 0.44 * 96, prog(t, this.tNow + 0.3, this.tNow + 0.5)) * Z;
      // handheld roll: kicked at the birth, snapped on the plunge, then a slow dutch drift
      roll = -0.07 * (1 - springStep(t - this.tNow, 2.2, 0.3)) + 0.16 * prog(t, this.tPlunge, this.tPlunge + 0.4, ease.outExpo)
        + 0.045 * (t - this.tPlunge > 0 ? t - this.tPlunge : 0) - 0.1 * prog(t, this.tDb2, this.tDb2 + 0.35, ease.outExpo);
      // fall through the horizon
      const fall = prog(t, this.tFall0, this.tM3, ease.inExpo);
      Rs = lerp(Rs, 1500, fall);
      thE = lerp(thE, 1500 / 0.44, fall);
    }
    const jit = t >= this.tNow ? 2.2 : 0;
    const C = { x: C0.x + jit * noise1(t * 5.3, 11) + 6 * f.a.kick * noise1(t * 40, 12) * (t > this.tNow ? 1 : 0), y: C0.y + jit * noise1(t * 4.7, 12) };
    const swirl = t < this.tNow ? 0 : 0.12 + 0.5 * prog(t, this.tPlunge, this.tM3, ease.inQuad) + 1.2 * prog(t, this.tFall0, this.tM3, ease.inQuad);
    const gridPx = t < this.tNow ? DIV * this.scopeCam(t).s : DIV * 1.06 * Z;
    const ring = t < this.tNow ? 0 : prog(t, this.tNow, this.tNow + 0.06) * (1 + 2.5 * pulse(t, this.tNow, 0.12));
    const heat = t < this.tNow ? 0 : 0.6 + 0.4 * prog(t, this.tPlunge, this.tM3);
    // the plane behind the hole tips back into a floor: a slow lean after the plunge, a snap on bar 2
    const pitch = t < this.tPlunge ? 0 : 0.42 * sineInOut(prog(t, this.tPlunge + 0.2, this.tDb2)) + 0.72 * prog(t, this.tDb2, this.tDb2 + 0.4, ease.outExpo)
      + 0.25 * prog(t, this.tFall0, this.tM3, ease.inQuad);
    return { C, thE, Rs, roll, swirl, gridPx, ring, heat, textK: Z, pitch };
  }

  /** The lyric of movement II, drawn flat in the source plane (the lens bends it). */
  drawSource(t: number, c: CanvasRenderingContext2D, ln: Lens) {
    const C = ln.C;
    const heatCol = (since: number, a: number) => {
      const h = Math.exp(-Math.max(0, since) / 0.28);
      return `rgba(255,${Math.round(lerp(233, 150, h))},${Math.round(lerp(223, 80, h))},${a})`;
    };
    c.save();
    c.textBaseline = 'alphabetic';
    // --- "BUT" / "NOW" / "the": the hole is the O of NOW; they fly apart on the plunge
    const fly = prog(t, this.tPlunge - 0.04, this.tPlunge + 0.26, ease.inQuad);
    const gone = prog(fly, 0.3, 0.75);
    if (t >= this.tBut && gone < 1) {
      c.save();
      c.translate(C.x, C.y); c.rotate(ln.roll);
      const k = (t < this.tNow ? 1 : ln.textK / 1.06) * Math.exp(4.2 * fly);
      c.scale(k, k);
      c.translate(-C.x, -C.y);
      const aB = prog(t, this.tBut, this.tBut + 0.04) * (1 - gone);
      const slB = 1 + 0.1 * (1 - prog(t, this.tBut, this.tBut + 0.14, ease.outExpo));
      c.save();
      c.translate(this.nowX0, this.nowBase - this.nowSize * 0.72 - 34);
      c.scale(slB, slB);
      c.font = font(this.big, this.butSize);
      c.fillStyle = heatCol(t - this.tBut, 0.96 * aB);
      c.fillText('BUT', 0, 0);
      c.restore();
      if (t >= this.wNow.start) {
        const aN = prog(t, this.wNow.start, this.wNow.start + 0.03) * (1 - gone);
        const slN = 1 + 0.16 * (1 - prog(t, this.wNow.start, this.wNow.start + 0.16, ease.outExpo));
        c.save();
        c.translate(C.x, C.y); c.scale(slN, slN); c.translate(-C.x, -C.y);
        c.font = font(this.big, this.nowSize);
        c.fillStyle = heatCol(t - this.wNow.start, 0.97 * aN);
        c.fillText('NOW', this.nowX0, this.nowBase);
        c.restore();
      }
      if (t >= this.wThe.start) {
        const aT = prog(t, this.wThe.start, this.wThe.start + 0.04) * (1 - gone);
        c.font = font(this.big, this.butSize);
        c.textAlign = 'right';
        c.fillStyle = heatCol(t - this.wThe.start, 0.96 * aT);
        c.fillText('THE', this.nowX0 + this.nowLay.width, this.nowBase + this.butSize + 34);
        c.textAlign = 'left';
      }
      c.restore();
    }
    // --- "SINGULARITY'S" on a source circle around the hole: lensed onto the photon ring
    if (t > this.wSing.start - 0.5 && t < this.tM3) {
      const R = ln.thE * 1.32, sz = ln.thE * 0.44 / 1.0;
      const k = sz / 100;
      const g0 = this.ringGlyphs;
      const tot = (g0[g0.length - 1]!.x + g0[g0.length - 1]!.w) * k;
      const start = -Math.PI / 2 - tot / R / 2 + ln.roll;
      c.font = font(this.ringFam, sz);
      c.letterSpacing = '0px';
      for (const g of g0) {
        const a = start + (g.x * k + (g.w * k) / 2) / R;
        const sung = t >= g.t0;
        const pre = prog(t, this.wSing.start - 0.5, this.wSing.start - 0.1);
        c.save();
        c.translate(C.x + Math.cos(a) * R, C.y + Math.sin(a) * R);
        c.rotate(a + Math.PI / 2);
        if (!sung) {
          c.strokeStyle = rgba('bone', 0.3 * pre); c.lineWidth = 1.6;
          c.strokeText(g.ch, -(g.w * k) / 2, 0);
        } else {
          c.fillStyle = heatCol(t - g.t0, 0.97);
          c.fillText(g.ch, -(g.w * k) / 2, 0);
        }
        c.restore();
      }
    }
    // --- "BEGUN": a straight word under the hole; the lens bends it round the bottom of the ring
    if (t > this.wBegun.start - 0.4 && t < this.tM3) {
      const sz = ln.thE * 0.62, k = sz / 100;
      const lay = this.begunLay;
      const bx = -lay.width * k / 2, by = ln.thE * 0.98 + sz * 0.36;
      c.save();
      c.translate(C.x, C.y); c.rotate(ln.roll);
      c.font = font(this.big, sz);
      lay.glyphs.forEach((g, i) => {
        const [t0] = this.begunGlyphT[i]!;
        const pre = prog(t, this.wBegun.start - 0.4, this.wBegun.start - 0.05);
        if (t < t0) {
          c.strokeStyle = rgba('bone', 0.3 * pre); c.lineWidth = 2;
          c.strokeText(g.ch, bx + g.x * k, by);
        } else {
          c.fillStyle = heatCol(t - t0, 0.97);
          c.fillText(g.ch, bx + g.x * k, by);
        }
      });
      c.restore();
    }
    c.restore();
  }

  /** Matter falling in: short ember streaks spiralling onto the photon ring (screen space). */
  drawInfall(t: number, L: LineBatch, ln: Lens) {
    if (t < this.tNow || ln.Rs <= 1) return;
    const C = ln.C;
    const n = 260;
    const age0 = t - this.tNow;
    for (let i = 0; i < n; i++) {
      const P = 1.1 + 1.3 * hash(i, 1);
      const x = (t - this.tNow) / P + hash(i, 2);
      const cyc = Math.floor(x), u = x - cyc;
      const born = this.tNow + (cyc - hash(i, 2)) * P;
      if (born < this.tNow - 0.01 && age0 < P) continue;
      const r0 = ln.Rs * (2.2 + 4.5 * hash(i, cyc, 3));
      const ph0 = hash(i, cyc, 4) * TAU + ln.roll;
      let prev: V2 | null = null;
      const segs = 6;
      for (let s = 0; s <= segs; s++) {
        const uu = Math.max(0, u - 0.05 * (1 - s / segs));
        const r = ln.Rs + (r0 - ln.Rs) * Math.pow(1 - uu, 1.4);
        const ph = ph0 + 2.4 * Math.log(r0 / r) + 0.8 * uu;
        const p = { x: C.x + Math.cos(ph) * r, y: C.y + Math.sin(ph) * r };
        if (prev) {
          const heat = smoothstep(ln.Rs * 2.2, ln.Rs * 1.02, r);
          const life = smoothstep(0, 0.1, u) * (s / segs) * smoothstep(ln.Rs * 0.98, ln.Rs * 1.08, r);
          const I = (0.25 + 1.0 * heat) * life;
          L.seg2(prev.x, prev.y, p.x, p.y, 1.3 + 0.8 * heat, [lerp(LIN.ember[0], 1.8, heat) * I, lerp(LIN.ember[1], 1.3, heat) * I, lerp(LIN.ember[2], 0.9, heat) * I], 1);
        }
        prev = p;
      }
    }
    // shockwaves: the birth and the plunge
    for (const [t0, amp] of [[this.tNow, 1], [this.tPlunge, 0.7]] as const) {
      const k = prog(t, t0, t0 + 0.55, ease.outCubic);
      if (k <= 0 || k >= 1) continue;
      const R = ln.Rs * 1.1 + 1300 * k;
      const I = amp * (1 - k) * 1.4;
      const N = 160;
      for (let j = 0; j < N; j++) {
        const a0 = (j / N) * TAU, a1 = ((j + 1) / N) * TAU;
        L.seg2(C.x + Math.cos(a0) * R, C.y + Math.sin(a0) * R, C.x + Math.cos(a1) * R, C.y + Math.sin(a1) * R, 1.6 + 3 * (1 - k), [LIN.ember[0] * I, LIN.ember[1] * I, LIN.ember[2] * I], 1);
      }
    }
  }

  /** Screen position and strength of the beam, for the glass it lights. */
  beamLight(t: number, f: Frame): [number, number, number] {
    if (t >= this.tNow) return [0, 0, 0];
    const sq = this.squeeze(t);
    const p = this.phos(t, this.beamX(f) * (1 - sq), this.traceY(this.beamX(f), t) * (1 - sq));
    return [p.x, p.y, 0.8 * prog(t, this.T0 + 0.3, this.T0 + 0.8) * (1 + 2 * sq * sq)];
  }

  drawBeam(t: number, f: Frame, L: LineBatch) {
    if (t >= this.tNow + 0.05) return;
    const sq = this.squeeze(t);
    const bx = this.beamX(f) * (1 - sq);
    const p = this.phos(t, bx, this.traceY(this.beamX(f), t) * (1 - sq));
    const flare = 1 + 2.5 * sq * sq;
    sparkHead(L, p.x, p.y, t, 0.85 * (1 + 0.6 * sq), prog(t, this.T0, this.T0 + 0.05) * flare * (1 - prog(t, this.tNow, this.tNow + 0.05)));
  }

  renderLens(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    const ln = this.lensAt(t, f);
    const sc = this.scopeCam(t);
    // source plane: the lyric of movement II
    this.src.clear();
    this.drawSource(t, this.src.ctx, ln);
    this.src.upload();
    const m1 = t < this.tNow;
    const glassC: V2 = m1 ? { x: W / 2 + sc.dx, y: H / 2 + sc.dy } : ln.C;
    this.lens.set({
      C: [ln.C.x, ln.C.y], Rs: ln.Rs, thE: ln.thE, swirl: ln.swirl, pitch: ln.pitch, F: 1400,
      gridOff: [glassC.x - ln.C.x, -(glassC.y - ln.C.y)], gridPx: ln.gridPx, gridRot: m1 ? 0 : -ln.roll,
      gridExt: m1 ? [8, 4.5] : [lerp(8, 30, prog(t, this.tNow, this.tPlunge)), lerp(4.5, 30, prog(t, this.tNow, this.tPlunge))],
      gridA: m1 ? 0.62 : 1 + 0.6 * pulse(t, this.tNow, 0.2), gridDraw: prog(t, this.T0, this.T0 + 0.5, ease.outExpo),
      ticks: m1 ? 1 : 1 - prog(t, this.tNow, this.tPlunge), minor: prog(t, this.tPlunge - 0.1, this.tPlunge + 0.3),
      texA: 1, ring: ln.ring, ringPh: -1.2 + 2.2 * (t - this.tNow) + ln.roll, glow: m1 ? prog(t, this.T0 + 0.1, this.T0 + 0.8) : 0.3, kick: f.a.kick, heat: ln.heat, time: t,
      line: m1 ? 1.25 : 1.35,
      beam: this.beamLight(t, f),
    });
    this.lens.render(renderer, out);

    const L2 = this.L2; L2.clear();
    this.drawScope(t, f, L2);
    this.drawInfall(t, L2, ln);
    this.drawBeam(t, f, L2);
    L2.render(renderer, out);

    const T = this.text; T.clear();
    this.drawReadouts(t, T.ctx);
    this.ctx.comp.draw(renderer, T.upload(), out);

    const born = pulse(t, this.tNow, 0.09), pl = pulse(t, this.tPlunge, 0.1), db2 = pulse(t, this.tDb2, 0.1);
    const sh = m1 ? 0 : 16 * born + 12 * pl + 7 * db2 + 3.5 * f.a.kick;
    return {
      bloom: m1 ? 0.8 : 0.7, bloomThreshold: m1 ? 0.8 : 1.0, halation: m1 ? 0.3 : 0.18,
      shake: [sh * noise1(t * 43, 1), sh * noise1(t * 47, 2)],
      ca: 1.2 + 4 * born + 3 * pl,
      flash: 0.05 * pulse(t, this.tNow, 0.02),
      bloomRadius: m1 ? 0.75 : 0.4,
      vignette: m1 ? 0.45 : 0.5,
    };
  }

  // ================================================================ III/IV: the sheet
  K(t: number) { return 2.35 + 1.2 * prog(t, this.tAnd, this.T1, ease.inQuad); }
  eps(_t: number) { return 0.55; }
  well(r: number, K: number, e: number) {
    const d = (K / Math.sqrt(r * r + e * e)) * Math.exp(-(r * r) / (SIG * SIG));
    return -9 * Math.tanh(d / 9); // soft floor keeps the throat finite
  }
  flowSpeed(t: number) {
    if (t < this.tAnd - 0.5) return 0.1;
    const b0 = this.ctx.audio.beatAt(this.tAnd);
    const nb = Math.max(0, this.ctx.audio.beatAt(t) - b0);
    const k = Math.floor(nb) + ease.outExpo(clamp((nb - Math.floor(nb)) / 0.35));
    return 0.14 * Math.pow(1.2, Math.min(k, 14));
  }
  flow(t: number) {
    const x = (t - this.T0) / this.flowDt;
    const i = clamp(Math.floor(x), 0, this.flowT.length - 2);
    return lerp(this.flowT[i]!, this.flowT[i + 1]!, clamp(x - i, 0, 1));
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
  proj(p: P3): Proj | null {
    const v = this.v4.set(p.x, p.y, p.z, 1).applyMatrix4(this.vp);
    if (v.w <= 0.05) return null;
    const P11 = this.cam.projectionMatrix.elements[5]!;
    return { x: (v.x / v.w * 0.5 + 0.5) * W, y: (0.5 - v.y / v.w * 0.5) * H, s: 0.5 * H * P11 / v.w, w: v.w };
  }
  sheetCam(t: number): Cam {
    const spin = this.flow(t) * 0.35;
    let c: Cam;
    if (t < this.tCutB) {
      // out of the throat: a corkscrew crane up from the singularity to a high three-quarter view
      const l = t - this.tM3;
      const e = ease.outExpo(clamp(l / 1.0));
      const tgt = { x: 0, y: lerp(-4.2, -2.2, e), z: 0 };
      c = { pos: orbit(tgt, -1.6 + 1.1 * e + spin * 0.6, lerp(1.45, 0.72, e), lerp(7.5, 18.5, e) - 0.6 * Math.max(0, l - 1.0)), tgt, roll: lerp(-0.9, -0.06, e), fov: lerp(50, 34, e) };
    } else if (t < this.tTop) {
      const l = t - this.tCutB;
      const tgt = { x: 0, y: -3, z: 0 };
      c = { pos: orbit(tgt, 0.9 + spin, 0.42 + 0.02 * l, 15.5 - 0.8 * l), tgt, roll: 0.1 + 0.03 * l, fov: 38 };
    } else {
      // hard cut on the beat: straight down into the vortex, slowly corkscrewing in
      const l = t - this.tTop;
      const tgt = { x: 0, y: -2, z: 0 };
      const settle = ease.outExpo(clamp(l / 0.5));
      c = { pos: orbit(tgt, 0.02, 1.5, lerp(20, 23, settle) - 1.1 * l), tgt, roll: -0.2 - 0.45 * l, fov: lerp(40, 34, settle) };
    }
    const au = this.ctx.audio;
    const pb = pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t))), 0.09);
    c.fov -= 1.8 * pb;
    return c;
  }
  sheet(a: number, b: number, D: number): P3 { return { x: a, y: D, z: -b }; }

  renderSheet(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t;
    this.setCam(this.sheetCam(t));
    const K = this.K(t), e = this.eps(t);
    this.bg.u.uKick!.value = f.a.kick;
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    const L = this.L3; L.clear();
    this.drawGrid(t, f, K, e);
    this.drawStreams(t, K, e);
    L.render(renderer, out, this.cam);
    const T = this.text; T.clear();
    this.drawRing(t, T.ctx, K, e);
    this.ctx.comp.draw(renderer, T.upload(), out);
    const L2 = this.L2; L2.clear();
    this.drawAtoms(t, L2);
    this.drawClipSpark(t, L2);
    L2.render(renderer, out);
    const emerge = pulse(t, this.tM3, 0.14);
    const shakeA = 7 * emerge + 6 * pulse(t, this.tCutB, 0.1) + 4 * f.a.kick;
    return {
      bloom: 0.85, bloomThreshold: 0.8, halation: 0.3,
      shake: [shakeA * noise1(t * 43, 1), shakeA * noise1(t * 47, 2)],
      ca: 1.2 + 3 * emerge,
      vignette: 0.42,
    };
  }

  drawGrid(t: number, f: Frame, K: number, e: number) {
    const L = this.L3;
    const bone = LIN.bone;
    const bph = f.beat - Math.floor(f.beat);
    const ringR = lerp(14, 0, ease.inQuad(bph));
    const segN = 180;
    for (let dir = 0; dir < 2; dir++) {
      for (let i = -GN; i <= GN; i++) {
        const axis = i === 0;
        let prev: P3 | null = null;
        let pa = 0;
        for (let j = 0; j <= segN; j++) {
          const u = (j / segN) * 2 - 1;
          const s = GN * Math.sign(u) * Math.pow(Math.abs(u), 1.7);
          const a = dir === 0 ? s : i, b = dir === 0 ? i : s;
          const r = Math.hypot(a, b);
          const al = 1 - smoothstep(GN - 6, GN, r);
          const p = this.sheet(a, b, this.well(r, K, e));
          if (prev && al > 0 && pa > 0) {
            const pr = Math.exp(-Math.abs(r - ringR) * 0.9) * 1.5;
            const heat = smoothstep(3.5, 0.3, r) * 0.6;
            const I = ((axis ? 0.55 : 0.28) + pr) * Math.min(al, pa);
            L.seg(prev.x, prev.y, prev.z, p.x, p.y, p.z, axis ? 1.5 : 1.1,
              bone[0] * I + LIN.ember[0] * heat, bone[1] * I + LIN.ember[1] * heat, bone[2] * I + LIN.ember[2] * heat, 1);
          }
          prev = p; pa = al;
        }
      }
    }
  }

  drawStreams(t: number, K: number, e: number) {
    const L = this.L3;
    const FT = this.flow(t);
    const n = Math.round(lerp(2000, 3200, prog(t, this.tM3, this.tOpt)));
    const bone = LIN.bone, em = LIN.ember;
    const late = prog(t, this.tRe, this.tReEnd);
    for (let i = 0; i < n; i++) {
      const P = 0.7 + 0.6 * hash(i, 1);
      const x = FT / P + hash(i, 2);
      const cyc = Math.floor(x);
      const u = x - cyc;
      const r0 = 3.5 + 15.5 * Math.sqrt(hash(i, cyc, 3));
      const ph0 = hash(i, cyc, 4) * TAU;
      const du = 0.035 + 0.02 * hash(i, 5);
      let prev: P3 | null = null;
      const segs = 10;
      for (let k = 0; k <= segs; k++) {
        const uu = Math.max(0, u - du * (1 - k / segs));
        const r = r0 * Math.pow(1 - uu, 0.62) + 0.05;
        const ph = ph0 + 1.9 * Math.log(r0 / r);
        const p = this.sheet(r * Math.cos(ph), r * Math.sin(ph), this.well(r, K, e) + 0.03);
        if (prev) {
          const heat = smoothstep(4.5, 0.4, r);
          const life = smoothstep(0, 0.08, u) * smoothstep(1, 0.9, u) * (k / segs);
          const I = (0.22 + 0.9 * heat) * life * (1 - 0.3 * late) * (1 - 0.45 * prog(t, this.tI - 0.3, this.tI + 0.3));
          L.seg(prev.x, prev.y, prev.z, p.x, p.y, p.z, 1.2 + 0.8 * heat,
            lerp(bone[0], em[0] * 2.2, heat) * I, lerp(bone[1], em[1] * 2.0, heat) * I, lerp(bone[2], em[2] * 1.6, heat) * I, 1);
        }
        prev = p;
      }
    }
  }

  /** The marquee ring ("And you're optimizing, accelerating,"). */
  drawRing(t: number, c: CanvasRenderingContext2D, K: number, e: number) {
    const ws = this.ringWords;
    const on = prog(t, this.tAnd - 0.25, this.tAnd) * (1 - prog(t, Math.max(this.tTop, this.tAccEnd - 0.06), this.tAccEnd + 0.08));
    if (on <= 0) return;
    const R = 6.2;
    const size = 1.25; // em in world units
    // glyph widths grow from 62 to 125 as each glyph is sung (only the two long words stretch)
    const glyphs: { ch: string; adv: number; width: number; k: number; tg: number; fam: string; sf: number }[] = [];
    ws.forEach((w, wi) => {
      const stretch = wi >= 2;
      const n = w.w.length;
      for (let j = 0; j < n; j++) {
        const tg = lerp(w.start, w.end, j / n);
        const k = stretch ? prog(t, tg, tg + 0.35, ease.outCubic) : 1;
        const width = stretch ? lerp(62, 125, k) : 100;
        const fam = F.archivo(width, 900);
        const sf = stretch ? lerp(0.62, 1.25, k) / (nearestW(width) / 100) : 1;
        const adv = layout(w.w[j]!.toUpperCase(), fam, 100).width / 100 * size * sf;
        glyphs.push({ ch: w.w[j]!.toUpperCase(), adv, width, k, tg, fam, sf });
      }
      if (wi < ws.length - 1) glyphs.push({ ch: ' ', adv: size * 0.42, width: 100, k: 1, tg: w.end, fam: F.archivo(100, 900), sf: 1 });
    });
    // glyphs are set one by one (each in its own width instance): add the font's kerning between
    // neighbours (YO, AT, AC…), the pair's kern averaged over the two glyphs' instances
    let s = 0;
    const pos: number[] = [];
    glyphs.forEach((g, i) => {
      pos.push(s);
      s += g.adv;
      const n = glyphs[i + 1];
      if (n && g.ch !== ' ' && n.ch !== ' ') s += 0.5 * (kern100(g.ch, n.ch, g.fam) * g.sf + kern100(g.ch, n.ch, n.fam) * n.sf) / 100 * size;
    });
    let head = 0;
    glyphs.forEach((g, i) => { if (t >= g.tg) head = pos[i]! + g.adv * clamp((t - g.tg) / 0.12); });
    const cp = this.cam.position;
    const front = Math.atan2(-cp.z, cp.x);
    const phOff = front + 0.3 - head / R;
    const lift = 0.15;
    c.save();
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    glyphs.forEach((g, i) => {
      if (g.ch === ' ') return;
      const ph0 = phOff + pos[i]! / R, ph1 = phOff + (pos[i]! + g.adv) / R;
      const y0 = this.well(R, K, e) + lift;
      const qa = this.proj({ x: R * Math.cos(ph0), y: y0, z: -R * Math.sin(ph0) }), qb = this.proj({ x: R * Math.cos(ph1), y: y0, z: -R * Math.sin(ph1) });
      if (!qa || !qb || qb.x <= qa.x) return;
      const adv = Math.hypot(qb.x - qa.x, qb.y - qa.y);
      const ang = Math.atan2(qb.y - qa.y, qb.x - qa.x);
      const hpx = 0.5 * (qa.s + qb.s) * size;
      const sung = t >= g.tg;
      const fam = F.archivo(g.width, 900);
      const gw = layout(g.ch, fam, 100).width;
      const comp = adv / Math.max(1, (gw * hpx) / 100);
      const behind = head - pos[i]!;
      const a = on * smoothstep(0.28, 0.62, comp) * (1 - smoothstep(0.62, 0.8, behind / (2 * Math.PI * R)));
      c.save();
      c.translate(qa.x, qa.y); c.rotate(ang);
      c.scale(adv / Math.max(1, gw), hpx / 100);
      c.font = font(fam, 100);
      if (!sung) {
        c.strokeStyle = rgba('bone', 0.35 * a); c.lineWidth = 2.5 * 100 / hpx;
        c.strokeText(g.ch, 0, 0);
      } else {
        const heat = Math.exp(-(t - g.tg) / 0.3);
        c.fillStyle = heat > 0.03 ? `rgba(255,${Math.round(lerp(233, 150, heat))},${Math.round(lerp(223, 80, heat))},${a})` : rgba('bone', 0.96 * a);
        c.fillText(g.ch, 0, 0);
      }
      c.restore();
    });
    c.restore();
  }

  drawAtoms(t: number, L: LineBatch) {
    if (t < this.tI - 0.3) return;
    const cx = W / 2, cy = H / 2;
    const bone = LIN.bone, sg = LIN.signal, em = LIN.ember;
    for (const d of this.dots) {
      const ap = prog(t, d.t0 - 0.04, d.t0 + 0.1, ease.outCubic);
      const ghost = d.row === 1 ? 0.22 * prog(t, this.tRe - 0.45, this.tRe - 0.1) : 0;
      if (ap <= 0 && ghost <= 0) continue;
      let x = d.x, y = d.y;
      let heat = Math.exp(-(t - d.t0) / 0.25) * 0.9 * (ap > 0 ? 1 : 0);
      let settle = 0;
      if (d.row === 1 && ap > 0) {
        const j = 1.2 + 5 * prog(t, d.t0, this.T1);
        x += j * noise1(t * 7 + d.seed * 0.37, d.seed);
        y += j * noise1(t * 7 + d.seed * 0.53, d.seed + 3);
      }
      const u = d.row === 0 ? prog(t, d.tLeave, d.tArr, ease.inOutCubic) : 0;
      if (u > 0) {
        const r0 = Math.hypot(d.x - cx, d.y - cy), a0 = Math.atan2(d.y - cy, d.x - cx);
        const r1 = Math.hypot(d.tx - cx, d.ty - cy);
        let a1 = Math.atan2(d.ty - cy, d.tx - cx);
        while (a1 < a0) a1 += TAU;
        const dip = Math.sin(u * Math.PI);
        const r = lerp(r0, r1, u) * (1 - 0.7 * dip);
        const a = lerp(a0, a1, u);
        x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r;
        heat = Math.max(heat, dip);
        settle = prog(t, d.tArr - 0.05, d.tArr + 0.3);
      }
      const w = lerp(4.6, 3.6, u);
      const I = (ap > 0 ? 1.15 * ap : ghost) * (1 + 1.2 * pulse(t, d.tArr, 0.1));
      const cr = lerp(bone[0], em[0] * 2.4, heat), cg = lerp(bone[1], em[1] * 2.2, heat), cb = lerp(bone[2], em[2] * 2, heat);
      const fin = settle * 0.35;
      L.seg2(x, y, x + 0.01, y, w, [lerp(cr, sg[0] * 1.8, fin) * I, lerp(cg, sg[1] * 1.8, fin) * I, lerp(cb, sg[2] * 1.8, fin) * I], 1);
    }
  }

  /** The end: the spark re-emerges from the well and draws the paperclip's wire. */
  drawClipSpark(t: number, L: LineBatch) {
    if (t <= this.tClip0 - 0.25) return;
    const tot = this.clipL[this.clipL.length - 1]!;
    const sAt = (tt: number) => tot * prog(tt, this.tClip0, this.tClip1, ease.inOutQuad);
    const s = sAt(t);
    const sg = LIN.signal;
    const n = Math.ceil((s / tot) * 300);
    let prev: V2 | null = null;
    for (let i = 0; i <= n; i++) {
      const q = pointAtLength(this.clip, this.clipL, (s * i) / Math.max(1, n));
      if (prev) {
        const age = (s - (s * i) / Math.max(1, n)) / tot;
        const I = 0.5 + 2.5 * Math.exp(-age * 12);
        L.seg2(prev.x, prev.y, q.x, q.y, 1.6, [sg[0] * I, sg[1] * I, sg[2] * I], 1);
      }
      prev = q;
    }
    const emerge = prog(t, this.tClip0 - 0.25, this.tClip0);
    const h = s > 0 ? pointAtLength(this.clip, this.clipL, s) : { x: lerp(W / 2, this.clip[0]!.x, emerge), y: lerp(H / 2, this.clip[0]!.y, emerge) };
    const done = prog(t, this.tClip1, this.tClip1 + 0.08);
    sparkParticles(L, t, (tb) => (tb < this.tClip0 ? null : pointAtLength(this.clip, this.clipL, sAt(tb))), { rate: 120, speed: 260, seed: 5 });
    sparkHead(L, h.x, h.y, t, 1.1 * (1 + done), emerge * (1 + 1.5 * done));
  }

  // ================================================================ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    return f.t < this.tM3 ? this.renderLens(f, out) : this.renderSheet(f, out);
  }
}

const kernCache = new Map<string, number>();
/** The font's kerning (px at 100 px) between glyphs a and b: the pair set as one run minus the two set apart. */
function kern100(a: string, b: string, fam: string) {
  const key = `${fam}|${a}${b}`;
  let v = kernCache.get(key);
  if (v === undefined) {
    v = measure(a + b, fam, 100) - measure(a, fam, 100) - measure(b, fam, 100);
    kernCache.set(key, v);
  }
  return v;
}

/** Archivo static width instance nearest to a requested width (percent). */
function nearestW(w: number) {
  const ws = [62, 75, 87.5, 100, 112.5, 125];
  let b = ws[0]!;
  for (const x of ws) if (Math.abs(x - w) < Math.abs(b - w)) b = x;
  return b;
}
