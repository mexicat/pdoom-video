// B1 `open` — "Sparks of AGI": the unicorn, as a construction drawing.
// Black. On the first downbeat the pen (the spark) strikes and shoots out the axes; the camera pulls
// back over a TikZ graph-paper sheet while a compass sweeps the first circle. The pen builds a
// unicorn from primitives on the beat (ellipse body, rectangle legs, bezier mane, triangle horn) with
// construction lines, dimension callouts and tiny Plex Mono TikZ annotations. The lyric is a Swiss
// text column beside the figure, set big in Archivo: the pickup "I" is literally drawn as a TikZ
// rectangle; the horn lands on "AGI" as a streak of sparks; on "eyes" a snap-zoom onto the eye, a
// perfect dot, r = 0.08. "Your circuits make me nervous,": the strokes re-route into PCB traces with
// vias while the drawing trains (ckpt 1 → 2 → 3, the middle one with five legs), and a tremor hits
// on "nervous". "that's no surprise": surprisal −log p = 0.00 nats; the sheet cools to black and the
// pen slides down to where `loss` starts its curve.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, textPathCommands, type TextLayout } from '../engine/type';
import { strokeText } from '../engine/stroke';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { sparkHead, sparkParticles } from './_motifs';
import { clamp, lerp, ease, prog, pulse, noise1, noise3, hash, TAU } from '../engine/util';
import { type P, type Part, pt, ellipse, arc, rect, poly, lengths, at, unicorn, octilinear, offset, mix, EYE } from './open-geo';

type RGB = [number, number, number];
type Kind = 'axis' | 'cons' | 'prim' | 'dim' | 'hatch' | 'plot' | 'eye' | 'ghost' | 'ring';
type Ease = (x: number) => number;

interface Stroke {
  pts: P[]; L: Float32Array; tot: number;
  t0: number; t1: number;
  kind: Kind; pen: boolean; ez: Ease;
  alpha: number; width: number; dash: number; // dash period in px (0 = solid)
  group: string;
  tD: Float32Array; // time at which the head reaches each point
}
interface Note { text: string; x: number; y: number; em: number; t0: number; dur: number; col: string; a: number; align: CanvasTextAlign; rot: number; group: string; weight: number; maxPx: number; hot: number }
interface LWord { w: Word; text: string; x: number; y: number; em: number; fam: string; lay: TextLayout; group: string; tAnt: number }
interface Cam { cx: number; cy: number; z: number; roll: number }
interface CamKey extends Cam { t: number; ez?: Ease }

const COLX = 4.3; // left edge of the lyric column (world units)
const DESC_EM = 0.21; // Archivo descender depth (em)

const BG_FRAG = /* glsl */ `
uniform vec4 uCam;       // cx, cy, zoom (px/unit), roll
uniform vec2 uRes;
uniform float uReveal;   // grid reveal radius (world units)
uniform vec3 uPen;       // pen screen xy (px, y down), intensity
uniform float uFade;     // 0..1 fade the sheet to black
void main() {
  vec2 sp = vec2(vUv.x, 1.0 - vUv.y) * uRes;             // screen px, y down
  vec2 d = sp - 0.5 * uRes;
  float c = cos(-uCam.w), s = sin(-uCam.w);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y) / uCam.z;
  vec2 p = uCam.xy + vec2(d.x, -d.y);                      // world, y up
  vec3 col = C_INK;
  // graph paper (TikZ help lines): minor 0.25, major 1.0
  vec2 g1 = abs(fract(p / 0.25 + 0.5) - 0.5) * 0.25 * uCam.z;
  vec2 g4 = abs(fract(p + 0.5) - 0.5) * uCam.z;
  float minor = max(1.0 - smoothstep(0.0, 1.0, g1.x), 1.0 - smoothstep(0.0, 1.0, g1.y));
  float major = max(1.0 - smoothstep(0.25, 1.25, g4.x), 1.0 - smoothstep(0.25, 1.25, g4.y));
  float dens = smoothstep(6.0, 18.0, 0.25 * uCam.z);
  float rr = length(p);
  float rev = smoothstep(uReveal, uReveal - 3.0, rr);
  float front = exp(-abs(rr - uReveal) * 1.6) * step(0.01, uReveal) * (1.0 - smoothstep(16.0, 26.0, uReveal));
  float edge = 1.0 - smoothstep(14.0, 18.0, max(abs(p.x + 1.0) * 0.72, abs(p.y)));
  col += C_BONE * (minor * 0.011 * dens + major * 0.028) * rev * edge;
  col += C_SIGNAL * (minor * dens * 0.5 + major) * front * 0.09;
  // the pen warms the paper right around it
  float pd = length(sp - uPen.xy);
  col += C_SIGNAL * 0.018 * uPen.z * exp(-pd * pd / (2.0 * 140.0 * 140.0));
  col *= 1.0 - uFade;
  fragColor = vec4(col, 1.0);
}`;

export default class OpenScene extends Scene {
  lines = new LineBatch(200000, { blend: 'add' });
  fx = new LineBatch(16000, { blend: 'add' });
  text = new Layer2D();
  bg = new FSPass(BG_FRAG, {
    uCam: { value: new THREE.Vector4() }, uRes: { value: new THREE.Vector2(W, H) }, uReveal: { value: 0 },
    uPen: { value: new THREE.Vector3() }, uFade: { value: 0 },
  });

  strokes: Stroke[] = [];
  pens: Stroke[] = [];
  notes: Note[] = [];
  words: LWord[] = [];
  cams: CamKey[] = [];
  u1: Part[] = []; u2: Part[] = []; u3: Part[] = [];

  // timing (all derived from the lyric and the beat grid)
  T0 = 0; T1 = 0;
  B: (i: number) => number = (i) => i;
  L1!: Line; L2!: Line; L3!: Line;
  w: Record<string, Word> = {};
  agi: [number, number][] = [];
  tCompass = 0; tCirc = 0; tCk2 = 0; tCk3 = 0; tNerv = 0; tNervEnd = 0; tExit = 0;
  hand = { x: 300, y: 208 };
  eye = EYE.k1;
  eq = pt(-11.25, -0.62); // surprisal line (world)
  famL = F.archivo(100, 700);

  override async init() {
    const au = this.ctx.audio, ly = this.ctx.lyrics;
    this.T0 = this.ctx.start; this.T1 = this.ctx.end;
    const b0 = Math.ceil(au.beatAt(this.T0 + 1e-3) - 1e-3);
    this.B = (i: number) => au.timeOfBeat(b0 + i);
    this.L1 = ly.get('sparks of AGI');
    this.L2 = ly.get('circuits make me');
    this.L3 = ly.get('no surprise');
    const find = (l: Line, q: string) => {
      const n = norm(q);
      const x = l.words.find((y) => norm(y.w) === n);
      if (!x) throw new Error(`open: word not found: ${q}`);
      return x;
    };
    const w = this.w;
    w.I = find(this.L1, 'I'); w.see = find(this.L1, 'see'); w.sparks = find(this.L1, 'sparks'); w.of = find(this.L1, 'of');
    w.AGI = find(this.L1, 'AGI'); w.in = find(this.L1, 'in'); w.your = find(this.L1, 'your'); w.eyes = find(this.L1, 'eyes');
    w.Your = this.L2.words[0]!; w.circuits = find(this.L2, 'circuits'); w.make = find(this.L2, 'make'); w.me = find(this.L2, 'me'); w.nervous = find(this.L2, 'nervous');
    w.thats = find(this.L3, "that's"); w.no = find(this.L3, 'no'); w.surprise = find(this.L3, 'surprise');
    const A = w.AGI!;
    this.agi = A.syl && A.syl.length === 3 ? A.syl : [0, 1, 2].map((i) => [lerp(A.start, A.end, i / 3), lerp(A.start, A.end, (i + 1) / 3)] as [number, number]);
    this.tCompass = this.B(1);
    this.tCirc = w.circuits!.start;
    this.tCk2 = au.nearestBeat(lerp(w.circuits!.start, w.circuits!.end, 0.3));
    this.tCk3 = au.nearestBeat(w.make!.start);
    this.tNerv = w.nervous!.start; this.tNervEnd = w.nervous!.end;
    this.tExit = au.timeOfBeat(Math.floor(au.beatAt(this.T1 - 1e-3)) - 1); // the last beat before the cut

    this.u1 = unicorn(1); this.u2 = unicorn(2); this.u3 = unicorn(3);
    this.hand = this.lossHandoff();
    this.buildLyrics();
    this.buildCamera();
    this.buildPlot();
  }

  /** Where `loss` puts its spark on its first frame (replicates loss.ts chartCam at T0 and curveLog(0)). */
  lossHandoff() {
    const T0 = this.T1;
    const cx = 6.9 + 0.12 * Math.sin(T0 * 0.8);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 400);
    cam.position.set(cx - 0.25, 3.2, 21.5); cam.up.set(0, 1, 0); cam.lookAt(cx, 3.1, 0); cam.updateMatrixWorld(true);
    const l = 0.3 + 0.72 + 0.045 * noise1(0, 3) + 0.03 * noise1(0, 5) + 0.018 * noise1(0, 9);
    const v = new THREE.Vector3(0, (l + 2) * 2.2, 0).project(cam);
    return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H };
  }

  // ================================================================== layout: the lyric column
  buildLyrics() {
    const fam = this.famL;
    const place = (words: Word[], text: string[], x: number, y: number, em: number, group: string, ant = 0.3) => {
      let cx = x;
      const sp = (layout(' ', fam, 100).width / 100) * em;
      words.forEach((wd, i) => {
        const tx = text[i] ?? wd.w;
        const lay = layout(tx, fam, 100);
        this.words.push({ w: wd, text: tx, x: cx, y, em, fam, lay, group, tAnt: wd.start - ant });
        cx += (lay.width / 100) * em + sp;
      });
    };
    /** Em size that makes a row exactly `colW` wide (Swiss poster: every row justified to the column), capped. */
    const fit = (text: string, colW: number, maxEm: number) => Math.min(maxEm, colW / (layout(text, fam, 100).width / 100));
    const CAP = 0.72, DESC = 0.21, GAP = 0.2;
    /** Stack rows downward from the first row's cap line; returns each row's baseline and em. */
    const stack = (rows: [string, number][], topY: number, colW: number) => {
      let y = topY;
      let prevDesc = 0;
      return rows.map(([text, maxEm], i) => {
        const em = fit(text, colW, maxEm);
        y -= (i === 0 ? 0 : prevDesc + GAP) + CAP * em;
        prevDesc = DESC * em;
        return { y, em };
      });
    };
    const w = this.w;
    const colW = 5.9;
    // line 1: "AGI" is anchored right above the horn's tip; "I see sparks of" sits on top of it
    const emAGI = fit('AGI', colW, 2.45);
    const emR1 = fit('I see sparks of', colW, 1.25);
    const yAGI = 3.18;
    const yR1 = yAGI + CAP * emAGI + GAP + DESC * emR1;
    place([w.I!, w.see!, w.sparks!, w.of!], ['I', 'see', 'sparks', 'of'], COLX, yR1, emR1, 'l1');
    place([w.AGI!], ['AGI'], COLX - 0.06 * emAGI, yAGI, emAGI, 'l1');
    place([w.in!, w.your!], ['in', 'your'], COLX, 2.28, 0.5, 'l1e', 0.25);
    place([w.eyes!], ['eyes'], COLX, 1.62, 0.5, 'l1e', 0.2);
    // line 2 under it
    const r2 = stack([['Your circuits', 1.25], ['make me', 1.5], ['nervous,', 1.9]], 0.55, colW);
    place([w.Your!, w.circuits!], ['Your', 'circuits'], COLX, r2[0]!.y, r2[0]!.em, 'l2');
    place([w.make!, w.me!], ['make', 'me'], COLX, r2[1]!.y, r2[1]!.em, 'l2');
    place([w.nervous!], ['nervous,'], COLX - 0.04, r2[2]!.y, r2[2]!.em, 'l2');
    // line 3 on the left of the figure, with the surprisal underneath
    const r3 = stack([['that’s no', 1.45], ['surprise', 1.45]], 2.75, 5.3);
    place([w.thats!, w.no!], ['that’s', 'no'], this.eq.x, r3[0]!.y, r3[0]!.em, 'l3');
    place([w.surprise!], ['surprise'], this.eq.x, r3[1]!.y, r3[1]!.em, 'l3');
    this.eq = pt(this.eq.x + 0.03, r3[1]!.y - DESC * r3[1]!.em - 0.42);
    this.row1 = { y: yR1, em: emR1 };
  }
  row1 = { y: 5.4, em: 1.1 };

  // ================================================================== camera
  buildCamera() {
    const B = this.B, w = this.w, e = this.eye;
    const K = (t: number, cx: number, cy: number, z: number, roll: number, ez?: Ease): CamKey => ({ t, cx, cy, z, roll, ez });
    const ib = this.glyphBox(this.words[0]!, 0);
    this.cams = [
      K(0, 0, 0, 560, 0.34),
      K(B(0), 0, 0, 560, 0.34),
      K(B(1) - 0.02, 0.05, 0.05, 236, 0.07, ease.outExpo), // pull back as the axes shoot out
      K(B(2), 0.1, 0.12, 214, 0.015, ease.inOutQuad), // the compass
      K(w.I!.start - 0.12, 0.2, 0.25, 200, 0.0, ease.linear),
      K(w.I!.start + 0.12, ib.x0 + 1.5, ib.y0 + 0.42, 380, -0.035, ease.inOutCubic), // whip to the "I"
      K(B(4) - 0.03, ib.x0 + 1.3, ib.y0 + 0.4, 470, -0.05, ease.inOutQuad),
      K(B(4) + 0.34, 3.2, 1.62, 112, 0.02, ease.outExpo), // the body, on the downbeat
      K(w.AGI!.start - 0.03, 3.4, 1.8, 118, 0.0, ease.inOutQuad),
      K(w.AGI!.start + 0.26, 5.0, 3.55, 200, -0.065, ease.outExpo), // snap onto the horn and "AGI"
      K(this.agi[2]![0] - 0.02, 5.1, 3.62, 212, -0.075, ease.linear),
      K(this.agi[2]![0] + 0.2, 5.55, 3.75, 236, -0.02, ease.outExpo), // reframe on the "I" of AGI
      K(w.in!.start - 0.04, 5.6, 3.78, 244, -0.015, ease.linear),
      K(w.eyes!.start - 0.01, e.x + 0.95, 1.62, 372, 0.0, ease.inOutCubic), // dive across to the eye
      K(w.Your!.start - 0.01, e.x + 0.93, 1.62, 396, 0.008, ease.linear),
      K(w.Your!.start + 0.34, 3.5, -0.62, 108, -0.06, ease.outExpo), // snap out: circuits
      K(this.tCk2 - 0.01, 3.45, -0.65, 110, -0.055, ease.linear),
      K(this.tCk2 + 0.18, 3.42, -0.7, 114, -0.035, ease.outExpo),
      K(this.tCk3 - 0.01, 3.4, -0.72, 115, -0.032, ease.linear),
      K(this.tCk3 + 0.18, 3.38, -0.78, 119, -0.015, ease.outExpo),
      K(w.thats!.start - 0.07, 3.35, -0.84, 123, -0.012, ease.linear),
      K(w.thats!.start + 0.3, -3.95, 0.55, 112, 0.0, ease.outExpo), // whip across to "that's no surprise"
      K(this.tExit, -4.12, 0.62, 116, 0.006, ease.linear),
      K(this.T1, -4.3, 0.7, 121, 0.01, ease.inQuad),
    ];
  }

  cam(t: number): Cam {
    const ks = this.cams;
    if (t <= ks[0]!.t) return ks[0]!;
    for (let i = 1; i < ks.length; i++) {
      const b = ks[i]!;
      if (t > b.t) continue;
      const a = ks[i - 1]!;
      const k = (b.ez ?? ease.inOutCubic)(clamp((t - a.t) / Math.max(1e-4, b.t - a.t)));
      const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), k));
      const roll = lerp(a.roll, b.roll, k);
      // zoom about the fixed point of the move, so dives and pull-backs read as one gesture
      if (Math.abs(b.z - a.z) > a.z * 0.04) {
        const fx = (b.z * b.cx - a.z * a.cx) / (b.z - a.z), fy = (b.z * b.cy - a.z * a.cy) / (b.z - a.z);
        return { cx: fx - (a.z / z) * (fx - a.cx), cy: fy - (a.z / z) * (fy - a.cy), z, roll };
      }
      return { cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z, roll };
    }
    return ks[ks.length - 1]!;
  }

  // ================================================================== the plot program
  addStroke(pts: P[], t0: number, t1: number, kind: Kind, o: Partial<Pick<Stroke, 'pen' | 'ez' | 'alpha' | 'width' | 'dash' | 'group'>> = {}) {
    const L = lengths(pts);
    const tot = L[L.length - 1]!;
    const ez = o.ez ?? ease.linear;
    const tD = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      // invert the ease: when does the head reach point i?
      const target = tot > 0 ? L[i]! / tot : 1;
      let lo = 0, hi = 1;
      for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (ez(m) < target) lo = m; else hi = m; }
      tD[i] = t0 + (t1 - t0) * hi;
    }
    const s: Stroke = { pts, L, tot, t0, t1, kind, pen: o.pen ?? false, ez, alpha: o.alpha ?? 1, width: o.width ?? 1.2, dash: o.dash ?? 0, group: o.group ?? 'main', tD };
    this.strokes.push(s);
    if (s.pen) this.pens.push(s);
    return s;
  }
  /** A pen waypoint: the pen is at p at time t (it travels there before). */
  wp(p: P, t: number, hold = 0) { this.addStroke([p, pt(p.x + 1e-4, p.y)], t, t + Math.max(1e-3, hold), 'ghost', { pen: true, alpha: 0 }); }
  note(text: string, x: number, y: number, t0: number, o: Partial<Omit<Note, 'text' | 'x' | 'y' | 't0'>> = {}) {
    this.notes.push({
      text, x, y, t0, em: o.em ?? 0.2, dur: o.dur ?? Math.min(0.4, 0.01 * text.length + 0.05), col: o.col ?? 'ash', a: o.a ?? 0.9,
      align: o.align ?? 'left', rot: o.rot ?? 0, group: o.group ?? 'main', weight: o.weight ?? 400, maxPx: o.maxPx ?? 30, hot: o.hot ?? 0,
    });
  }
  /** Single-stroke technical lettering, written by the pen. */
  plotText(text: string, x: number, y: number, em: number, t0: number, t1: number, group = 'main') {
    const st = strokeText(text, 'tech', 100);
    const k = em / 100;
    let acc = 0;
    st.strokes.forEach((s, i) => {
      const len = st.lens[i]![st.lens[i]!.length - 1] ?? 0;
      const a = t0 + (t1 - t0) * (acc / st.total), b = t0 + (t1 - t0) * ((acc + len) / st.total);
      acc += len;
      if (s.length >= 2) this.addStroke(s.map((p) => pt(x + p.x * k, y - p.y * k)), a, b, 'plot', { pen: true, width: 1.4, group });
    });
  }
  /** Engineering dimension: extension ticks, arrowheads, centred value. */
  dimension(a: P, b: P, label: string, t0: number, group: string, em = 0.16) {
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
    const ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const S = (pts: P[], ta: number, tb: number) => this.addStroke(pts, ta, tb, 'dim', { alpha: 0.75, width: 1.0, group });
    S([a, b], t0, t0 + 0.12);
    const ar = 0.1;
    for (const [p, s] of [[a, 1], [b, -1]] as const) {
      S([pt(p.x + s * ux * ar + nx * ar * 0.33, p.y + s * uy * ar + ny * ar * 0.33), p, pt(p.x + s * ux * ar - nx * ar * 0.33, p.y + s * uy * ar - ny * ar * 0.33)], t0 + 0.08, t0 + 0.12);
      S([pt(p.x - nx * 0.1, p.y - ny * 0.1), pt(p.x + nx * 0.1, p.y + ny * 0.1)], t0, t0 + 0.05);
    }
    const m = pt((a.x + b.x) / 2, (a.y + b.y) / 2);
    const vert = Math.abs(dy) > Math.abs(dx);
    this.note(label, m.x + (vert ? -0.07 : 0), m.y + (vert ? -em * 0.32 : 0.06), t0 + 0.1, { em, align: vert ? 'right' : 'center', col: 'ash', group, dur: 0.08 });
  }
  /** World-space ink box of glyph gi of a lyric word. */
  glyphBox(lw: LWord, gi: number) {
    const g = lw.lay.glyphs[gi]!;
    const cmds = textPathCommands(g.ch, lw.fam, 100, 0, 0);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of cmds) if ('x' in c) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y); }
    const k = lw.em / 100;
    return { x0: lw.x + (g.x + x0) * k, x1: lw.x + (g.x + x1) * k, y0: lw.y - y1 * k, y1: lw.y - y0 * k };
  }

  buildPlot() {
    const B = this.B, w = this.w;
    const part = (id: string) => this.u1.find((p) => p.id === id)!.pts;
    const S = (pts: P[], t0: number, t1: number, kind: Kind, o: Parameters<OpenScene['addStroke']>[4] = {}) => this.addStroke(pts, t0, t1, kind, o);
    const line = (a: P, b: P) => [a, b];
    const ez = ease;
    const t0 = B(0);

    // ---- ignition: the axes shoot out of the spark, ticks and numbers cascade
    this.wp(pt(0, 0), t0 - 0.002, 0.25);
    for (const [dx, dy, len, d] of [[1, 0, 15, 0], [-1, 0, 15, 0.01], [0, 1, 9, 0.03], [0, -1, 9, 0.04]] as const)
      S(line(pt(0, 0), pt(dx * len, dy * len)), t0 + d, t0 + d + 0.55, 'axis', { ez: ez.outExpo, width: 1.1, group: 'axes' });
    // a starburst of construction rays every 30°, dashed, racing out with the axes
    for (let d = 30; d < 360; d += 30) {
      if (d % 90 === 0) continue;
      const a = (d * Math.PI) / 180;
      S(line(pt(0.25 * Math.cos(a), 0.25 * Math.sin(a)), pt(13 * Math.cos(a), 13 * Math.sin(a))), t0 + 0.02, t0 + 0.62, 'cons', { ez: ez.outExpo, alpha: 0.5, dash: 10, width: 1.0, group: 'rays' });
    }
    const reach = (d: number, len: number) => { // time the ray's head passes distance d
      let lo = 0, hi = 1;
      for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (ease.outExpo(m) * len < d) lo = m; else hi = m; }
      return t0 + 0.55 * hi;
    };
    for (let i = -14; i <= 14; i++) {
      if (i === 0) continue;
      const ti = reach(Math.abs(i), 15);
      S(line(pt(i, 0.08), pt(i, -0.08)), ti, ti + 0.04, 'axis', { width: 1.0, group: 'axes' });
      for (let q = 1; q < 4; q++) if (Math.abs(i) < 14) S(line(pt(i + Math.sign(i) * q * 0.25, 0.035), pt(i + Math.sign(i) * q * 0.25, -0.035)), ti + 0.01, ti + 0.04, 'axis', { width: 1.0, alpha: 0.6, group: 'axes' });
      this.note(tick(i), i, -0.3, ti + 0.02, { em: 0.15, align: 'center', col: 'ash', a: 0.75, group: 'axes', dur: 0.03 });
    }
    for (let i = -8; i <= 8; i++) {
      if (i === 0) continue;
      const ti = reach(Math.abs(i), 9);
      S(line(pt(-0.08, i), pt(0.08, i)), ti, ti + 0.04, 'axis', { width: 1.0, group: 'axes' });
      this.note(tick(i), -0.17, i - 0.055, ti + 0.02, { em: 0.15, align: 'right', col: 'ash', a: 0.75, group: 'axes', dur: 0.03 });
    }
    this.note('(0,0)', 0.1, -0.27, t0 + 0.1, { em: 0.15, col: 'ash', group: 'axes', dur: 0.05 });
    this.note('x', 14.55, 0.16, t0 + 0.4, { em: 0.2, col: 'ash', group: 'axes' });
    this.note('y', 0.14, 8.55, t0 + 0.4, { em: 0.2, col: 'ash', group: 'axes' });
    // the prompt, deadpan, typed while we pull back
    this.note('% prompt: "Draw a unicorn in TikZ."', -3.98, 2.36, t0 + 0.12, { em: 0.155, col: 'bone', a: 0.85, dur: 0.42, group: 'prompt', maxPx: 60 });
    this.note('\\begin{tikzpicture}', -3.98, 2.14, t0 + 0.5, { em: 0.13, col: 'ash', dur: 0.12, group: 'prompt', maxPx: 60 });
    // ignition ring
    S(arc(0, 0, 0.35, 0, TAU, 96), t0, t0 + 0.02, 'ring', { alpha: 1, width: 1.2, group: 'ring' });

    // ---- the compass: the pen rides to (2,0) along the axis and sweeps a full circle
    const tc = this.tCompass;
    S(arc(0, 0, 2, 0, TAU, 128), tc, tc + 0.38, 'cons', { pen: true, ez: ez.inOutCubic, alpha: 0.8, width: 1.1, group: 'cons' });
    S(arc(0, 0, 1, Math.PI, Math.PI + TAU, 96), tc + 0.08, tc + 0.4, 'cons', { ez: ez.inOutCubic, alpha: 0.45, width: 1.0, dash: 7, group: 'cons' });
    this.note('r = 2', 1.52, -1.62, tc + 0.3, { em: 0.15, col: 'ash', group: 'cons' });
    // the circle doubles as a protractor: ticks every 5°, labels every 30°, laid down as the pen passes
    const circ = this.strokes[this.strokes.length - 2]!;
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180;
      const tt = circ.tD[Math.round((d / 360) * 128)]!;
      const l = d % 30 === 0 ? 0.2 : d % 10 === 0 ? 0.11 : 0.06;
      S(line(pt(2 * Math.cos(a), 2 * Math.sin(a)), pt((2 + l) * Math.cos(a), (2 + l) * Math.sin(a))), tt, tt + 0.03, 'cons', { alpha: d % 30 === 0 ? 0.9 : 0.6, width: 1.0, group: 'dial' });
      if (d % 30 === 0) this.note(`${d}°`, 2.42 * Math.cos(a), 2.42 * Math.sin(a) - 0.05, tt + 0.02, { em: 0.12, align: 'center', col: 'ash', a: 0.8, group: 'dial', dur: 0.03 });
    }
    this.note('r = 1', -0.86, 0.72, tc + 0.35, { em: 0.15, col: 'ash', group: 'cons', align: 'right' });
    // the ellipse's bounding box, foci, dimensions
    const tb = B(2);
    S(rect(-2, 1, 4, 2), tb, tb + 0.17, 'cons', { pen: true, ez: ez.inOutQuad, alpha: 0.6, width: 1.0, dash: 9, group: 'cons' });
    const fx = Math.sqrt(3);
    for (const sx of [-1, 1]) {
      S(line(pt(sx * fx - 0.1, 0), pt(sx * fx + 0.1, 0)), tb + 0.1, tb + 0.14, 'cons', { alpha: 0.7, group: 'cons' });
      S(line(pt(sx * fx, -0.1), pt(sx * fx, 0.1)), tb + 0.11, tb + 0.15, 'cons', { alpha: 0.7, group: 'cons' });
    }
    this.note('F₁', -fx - 0.08, 0.14, tb + 0.14, { em: 0.14, col: 'ash', group: 'cons', align: 'right' });
    this.note('F₂', fx + 0.08, 0.14, tb + 0.15, { em: 0.14, col: 'ash', group: 'cons' });
    this.dimension(pt(-2, 1.3), pt(2, 1.3), '4.00', tb + 0.14, 'dims');
    this.dimension(pt(-2.3, -1), pt(-2.3, 1), '2.00', tb + 0.18, 'dims');

    // ---- "I": the glyph is exactly a rectangle, so the pen draws it as one
    const iW = this.words[0]!;
    const gb = this.glyphBox(iW, 0);
    const tI = w.I!.start;
    S(poly(pt(gb.x0, gb.y0), pt(gb.x0, gb.y1), pt(gb.x1, gb.y1), pt(gb.x1, gb.y0)), tI, tI + 0.28, 'prim', { pen: true, ez: ez.inOutQuad, width: 1.5, group: 'lyricI' });
    this.dimension(pt(gb.x0, gb.y1 + 0.2), pt(gb.x1, gb.y1 + 0.2), (gb.x1 - gb.x0).toFixed(2), tI + 0.26, 'lyricI', 0.12);
    this.dimension(pt(gb.x0 - 0.22, gb.y0), pt(gb.x0 - 0.22, gb.y1), (gb.y1 - gb.y0).toFixed(2), tI + 0.3, 'lyricI', 0.12);
    // typographic construction: baseline and cap line run across the whole column
    const gx1 = COLX + 6.4;
    S(line(pt(gb.x0 - 0.5, gb.y0), pt(gx1, gb.y0)), tI + 0.02, tI + 0.3, 'cons', { ez: ez.outCubic, alpha: 0.6, group: 'type' });
    S(line(pt(gb.x0 - 0.5, gb.y1), pt(gx1, gb.y1)), tI + 0.05, tI + 0.33, 'cons', { ez: ez.outCubic, alpha: 0.5, dash: 8, group: 'type' });
    S(line(pt(gb.x0 - 0.5, gb.y0 + 0.53 * this.row1.em), pt(gx1, gb.y0 + 0.53 * this.row1.em)), tI + 0.08, tI + 0.36, 'cons', { ez: ez.outCubic, alpha: 0.35, dash: 4, group: 'type' });
    S(line(pt(gb.x0 - 0.5, gb.y0 - DESC_EM * this.row1.em), pt(gx1, gb.y0 - DESC_EM * this.row1.em)), tI + 0.1, tI + 0.38, 'cons', { ez: ez.outCubic, alpha: 0.35, dash: 4, group: 'type' });
    this.note('baseline', gx1 + 0.08, gb.y0 - 0.03, tI + 0.3, { em: 0.1, col: 'ash', group: 'typel' });
    this.note(`cap height ${(gb.y1 - gb.y0).toFixed(2)}`, gx1 + 0.08, gb.y1 - 0.03, tI + 0.33, { em: 0.1, col: 'ash', group: 'typel' });
    this.note('x-height', gx1 + 0.08, gb.y0 + 0.53 * this.row1.em - 0.03, tI + 0.36, { em: 0.1, col: 'ash', group: 'typel' });
    this.note('descender', gx1 + 0.08, gb.y0 - DESC_EM * this.row1.em - 0.03, tI + 0.38, { em: 0.1, col: 'ash', group: 'typel' });
    // glyph metrics: the em box, side bearings, the advance
    const gI = iW.lay.glyphs[0]!, kI = iW.em / 100;
    const ex0 = iW.x + gI.x * kI, ex1 = iW.x + (gI.x + gI.w) * kI, ey0 = iW.y - 0.21 * iW.em, ey1 = iW.y + 0.79 * iW.em;
    S(poly(pt(ex0, ey1), pt(ex1, ey1), pt(ex1, ey0), pt(ex0, ey0)), tI + 0.3, tI + 0.5, 'cons', { alpha: 0.55, dash: 5, group: 'type' });
    this.dimension(pt(ex0, ey0 - 0.14), pt(ex1, ey0 - 0.14), `adv ${(ex1 - ex0).toFixed(2)}`, tI + 0.45, 'typel', 0.075);
    this.note('LSB', (ex0 + gb.x0) / 2, ey1 + 0.04, tI + 0.5, { em: 0.065, col: 'ash', align: 'center', group: 'typel' });
    this.note('RSB', (ex1 + gb.x1) / 2, ey1 + 0.04, tI + 0.52, { em: 0.065, col: 'ash', align: 'center', group: 'typel' });
    this.note('U+0049  LATIN CAPITAL LETTER I', ex0, ey1 + 0.62, tI + 0.36, { em: 0.09, col: 'bone', a: 0.75, group: 'typel', dur: 0.25 });
    this.note('Archivo 700 · wdth 100', ex0, ey1 + 0.47, tI + 0.42, { em: 0.075, col: 'ash', group: 'typel', dur: 0.2 });
    this.note(`\\fill (${gb.x0.toFixed(2)},${gb.y0.toFixed(2)}) rectangle ++(${(gb.x1 - gb.x0).toFixed(2)},${(gb.y1 - gb.y0).toFixed(2)}); % I`, gb.x0 - 0.02, gb.y0 - 0.3, tI + 0.22, { em: 0.13, col: 'ash', group: 'lyricI', dur: 0.3 });

    // ---- the unicorn, primitive by primitive (checkpoint 1)
    const tB = B(4);
    S(part('body'), tB, tB + 0.34, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.8 });
    const tL = B(5), st = (B(6) - B(5)) / 4;
    const legX = [-1.5, -1.0, 0.85, 1.35];
    for (let i = 0; i < 4; i++) {
      const a = tL + i * st;
      S(part(`leg${i}`), a, a + st * 0.9, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.8 });
      S(line(pt(legX[i]! + 0.16, -0.3), pt(legX[i]! + 0.16, -2.7)), a - 0.03, a + 0.08, 'cons', { alpha: 0.4, dash: 5, group: 'cons' });
    }
    S(line(pt(-3.9, -2.3), pt(3.9, -2.3)), tL, tL + 0.3, 'cons', { alpha: 0.5, group: 'cons', ez: ez.outCubic });
    const tN = (B(6) + B(7)) / 2;
    S(line(pt(0.75, -0.4), pt(2.85, 2.9)), tN - 0.05, tN + 0.08, 'cons', { alpha: 0.4, dash: 6, group: 'cons' });
    S(arc(1.25, 0.55, 0.5, 0, Math.atan2(1.4, 0.7), 20), tN, tN + 0.1, 'cons', { alpha: 0.6, group: 'cons' });
    this.note('63°', 1.8, 0.64, tN + 0.1, { em: 0.14, col: 'ash', group: 'cons' });
    S(part('neck'), tN, tN + 0.08, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.8 });
    S(part('head'), tN + 0.09, tN + 0.19, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.8 });
    S(part('ear'), tN + 0.195, tN + 0.225, 'prim', { pen: true, group: 'u1', width: 1.6 });
    const tM = B(7);
    const maneCtl: P[][] = [[pt(2.3, 2.3), pt(1.9, 2.5), pt(1.5, 1.9), pt(1.55, 1.5)], [pt(1.95, 1.95), pt(1.5, 2.0), pt(1.2, 1.3), pt(1.3, 0.95)], [pt(1.65, 1.35), pt(1.2, 1.35), pt(1.0, 0.8), pt(1.1, 0.55)]];
    maneCtl.forEach((c, i) => {
      const a = tM + i * 0.07;
      S(c, a - 0.03, a + 0.05, 'cons', { alpha: 0.45, dash: 4, group: 'cons' });
      for (const q of [c[1]!, c[2]!]) S(ellipse(q.x, q.y, 0.03, 0.03, 0, 12), a, a + 0.03, 'cons', { alpha: 0.7, group: 'cons' });
      S(part(`mane${i}`), a, a + 0.07, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.6 });
    });

    // ---- the horn lands on "AGI", as a streak
    const [sa, sg, si] = this.agi as [[number, number], [number, number], [number, number]];
    const horn = part('horn');
    const ia = hornApex(horn);
    S(horn.slice(0, ia + 1), sa[0] - 0.01, sa[0] + 0.06, 'prim', { pen: true, ez: ez.outQuad, group: 'u1', width: 1.9 });
    S(horn.slice(ia), sa[0] + 0.06, sa[0] + 0.2, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.9 });
    S(line(pt(2.77, 2.25), pt(3.72, 4.45)), sa[0] - 0.03, sa[0] + 0.1, 'cons', { alpha: 0.45, dash: 6, group: 'cons' });
    this.note('% horn', 2.2, 3.12, sa[0] + 0.08, { em: 0.12, col: 'signal', a: 1, group: 'code', align: 'right' });
    const hb0 = horn[0]!, hap = horn[ia]!, hb1 = horn[hornBaseR(horn)]!;
    for (let k = 1; k <= 7; k++) {
      const f = k / 8, g = Math.min(1, f + 0.08);
      S([pt(lerp(hb0.x, hap.x, f), lerp(hb0.y, hap.y, f)), pt(lerp(hb1.x, hap.x, g), lerp(hb1.y, hap.y, g))], sg[0] + k * 0.018, sg[0] + k * 0.018 + 0.05, 'hatch', { width: 1.1, group: 'u1h' });
    }
    this.note('spiral, 7 turns', 2.2, 2.93, si[0], { em: 0.12, col: 'ash', group: 'code', align: 'right' });

    // ---- the tail: the pen crosses the sheet for it
    const tT = B(6);
    for (let i = 0; i < 3; i++) S(part(`tail${i}`), tT + i * 0.065, tT + i * 0.065 + 0.06, 'prim', { pen: true, ez: ez.inOutQuad, group: 'u1', width: 1.6 });

    // ---- the TikZ listing (top-left of the sheet): each line lights up as its primitive is plotted
    const lst: [string, number][] = [
      ['% prompt: "Draw a unicorn in TikZ."', B(0) + 0.12],
      ['\\begin{tikzpicture}', B(0) + 0.5],
      ['\\draw (0,0) ellipse (2 and 1);     % body', tB],
      ['\\foreach \\x in {-1.5,-1,0.85,1.35}', tL],
      ['  \\draw (\\x,-0.62) rectangle ++(0.32,-1.68);', tL + 0.1],
      ['\\draw (-1.95,0.3) .. controls ..;  % tail', tT],
      ['\\draw (1.25,0.55) -- ... -- cycle; % neck', tN],
      ['\\draw[rotate=-17] (2.72,1.95) ellipse ..;', tN + 0.09],
      ['\\draw (2.3,2.3) .. controls ..;     % mane', tM],
      ['\\draw (2.62,2.3) -- (3.3,3.55) -- ..;  % horn', this.agi[0]![0]],
      ['\\fill (2.95,2) circle (0.08);      % eye', w.eyes!.start],
      ['\\end{tikzpicture}', w.eyes!.start + 0.3],
    ];
    lst.forEach(([txt, ti], i) => this.note(txt, 0.32, 6.12 - i * 0.232, ti, { em: 0.13, col: i === 0 ? 'bone' : 'ash', a: i === 0 ? 0.85 : 0.75, dur: 0.12, group: 'listing', hot: i > 1 ? 0.45 : 0, maxPx: 34 }));
    // ---- the title block (bottom-right of the sheet)
    const tbx = 6.35, tby = -0.75, tbw = 4.6, rh = 0.34;
    const tt = B(4) + 0.15;
    S(poly(pt(tbx, tby), pt(tbx + tbw, tby), pt(tbx + tbw, tby - 3 * rh), pt(tbx, tby - 3 * rh)), tt, tt + 0.25, 'cons', { alpha: 0.7, group: 'title' });
    for (let r = 1; r < 3; r++) S(line(pt(tbx, tby - r * rh), pt(tbx + tbw, tby - r * rh)), tt + 0.1, tt + 0.25, 'cons', { alpha: 0.5, group: 'title' });
    S(line(pt(tbx + 2.3, tby - rh), pt(tbx + 2.3, tby - 3 * rh)), tt + 0.15, tt + 0.28, 'cons', { alpha: 0.5, group: 'title' });
    const cell = (txt: string, x: number, r: number, d: number, col = 'ash') => this.note(txt, tbx + x, tby - r * rh - 0.23, tt + d, { em: 0.13, col, group: 'title', dur: 0.15 });
    cell('TITLE   unicorn (exp. 1)', 0.1, 0, 0.2, 'bone');
    cell('DRAWN   the model', 0.1, 1, 0.25);
    cell('CHECKED —', 2.4, 1, 0.3);
    cell('SCALE   1:1', 0.1, 2, 0.35);
    cell('SHEET   1 of 1', 2.4, 2, 0.4);

    // ---- the eye: the pen hovers through "in your", dots it on "eyes"
    const E = this.eye;
    this.wp(pt(E.x + 0.22, E.y + 0.14), w.in!.start + 0.12, 0.05);
    this.wp(pt(E.x + 0.12, E.y + 0.08), w.your!.start + 0.1, 0.05);
    const spiral: P[] = [];
    for (let i = 0; i <= 70; i++) { const k = i / 70; const r = EYE.r * (1 - k); const a = -k * TAU * 3.5; spiral.push(pt(E.x + r * Math.cos(a), E.y + r * Math.sin(a))); }
    const te = w.eyes!.start;
    S(spiral, te, te + 0.1, 'eye', { pen: true, ez: ez.inOutQuad, group: 'eye' });
    S(line(pt(E.x - 0.26, E.y), pt(E.x + 0.26, E.y)), te + 0.1, te + 0.2, 'cons', { alpha: 0.7, dash: 6, group: 'eyec' });
    S(line(pt(E.x, E.y - 0.26), pt(E.x, E.y + 0.26)), te + 0.12, te + 0.22, 'cons', { alpha: 0.7, dash: 6, group: 'eyec' });
    const la = (-68 * Math.PI) / 180;
    const p0 = pt(E.x + EYE.r * Math.cos(la), E.y + EYE.r * Math.sin(la));
    const p1 = pt(E.x + 0.8 * Math.cos(la), E.y + 0.8 * Math.sin(la));
    const p2 = pt(p1.x + 0.95, p1.y);
    S([p0, p1, p2], te + 0.16, te + 0.28, 'dim', { pen: true, ez: ez.inOutQuad, width: 1.1, group: 'eyec' });
    const ah = 0.035, an = la;
    S([pt(p0.x + ah * Math.cos(an + 0.35), p0.y + ah * Math.sin(an + 0.35)), p0, pt(p0.x + ah * Math.cos(an - 0.35), p0.y + ah * Math.sin(an - 0.35))], te + 0.16, te + 0.19, 'dim', { width: 1.1, group: 'eyec' });
    this.plotText('r = 0.08', p1.x + 0.06, p1.y + 0.05, 0.155, te + 0.3, te + 0.54, 'eyec');
    this.note('\\fill (2.95,2) circle (0.08); % eye', p1.x + 0.06, p1.y - 0.1, te + 0.44, { em: 0.045, col: 'ash', group: 'eyec', maxPx: 99 });

    // ---- circuits: the pen rides the router, then ticks the checkpoints
    const route = octilinear(part('body'), 0.24, 0.08, true);
    S(route, this.tCirc + 0.02, this.tCirc + 0.3, 'ghost', { pen: true, alpha: 0, ez: ez.inOutQuad });
    const tbl = this.tablePos();
    S([pt(tbl.x - 0.05, tbl.y - 0.52), pt(tbl.x + 2.9, tbl.y - 0.52)], this.tCk2, this.tCk2 + 0.1, 'plot', { pen: true, width: 1.1, group: 'table' });
    S([pt(tbl.x - 0.05, tbl.y - 0.78), pt(tbl.x + 2.9, tbl.y - 0.78)], this.tCk3, this.tCk3 + 0.1, 'plot', { pen: true, width: 1.1, group: 'table' });
    // "nervous": the pen runs a polygraph line under the table
    const pg = this.polyPos();
    const pgLine: P[] = [];
    for (let i = 0; i <= 240; i++) {
      const ti = lerp(this.tNerv - 0.04, this.tNervEnd, i / 240);
      const amp = 0.05 + 0.3 * this.tremor(ti);
      pgLine.push(pt(pg.x + (i / 240) * 3.6, pg.y + amp * (0.65 * noise1(i * 0.9, 3) + 0.35 * noise1(i * 3.1, 4))));
    }
    this.polygraph = this.addStroke(pgLine, this.tNerv - 0.04, this.tNervEnd, 'plot', { pen: true, width: 1.3, group: 'poly' });
    this.note('% tremor', pg.x, pg.y + 0.38, this.tNerv, { em: 0.13, col: 'ash', group: 'poly' });
    // "that's no surprise": to the surprisal line, then the pen follows the typing
    this.wp(pt(this.eq.x - 0.05, this.eq.y + 0.1), w.surprise!.start + 0.02, 0.01);
    S([pt(this.eq.x - 0.05, this.eq.y - 0.1), pt(this.eq.x + 5.3, this.eq.y - 0.1)], w.surprise!.start + 0.03, w.surprise!.start + 0.3, 'ghost', { pen: true, alpha: 0 });
    this.pens.sort((a, b) => a.t0 - b.t0);
  }

  tablePos() { return pt(-3.75, -3.05); }
  polyPos() { return pt(-3.75, -4.55); }
  polygraph: Stroke | null = null;

  // ================================================================== pen
  penAt(t: number): P {
    const ps = this.pens;
    let prev: Stroke | null = null;
    for (const s of ps) {
      if (t < s.t0) {
        const from = prev ? prev.pts[prev.pts.length - 1]! : s.pts[0]!;
        const to = s.pts[0]!;
        const tPrev = prev ? prev.t1 : s.t0 - 1;
        const d = Math.hypot(to.x - from.x, to.y - from.y);
        const dur = Math.min(s.t0 - tPrev, clamp(0.08 + d * 0.025, 0.08, 0.32));
        const k = ease.inOutCubic(clamp((t - (s.t0 - dur)) / Math.max(1e-4, dur)));
        return pt(lerp(from.x, to.x, k), lerp(from.y, to.y, k));
      }
      if (t <= s.t1) {
        const k = s.ez(clamp((t - s.t0) / Math.max(1e-4, s.t1 - s.t0)));
        const q = at(s.pts, s.L, k * s.tot);
        return pt(q.x, q.y);
      }
      prev = s;
    }
    // exit (rapid pen-up moves, like a plotter): back along the surprisal line, up the left margin,
    // then slide down into the handoff point, where `loss` starts its curve
    const from = prev ? prev.pts[prev.pts.length - 1]! : pt(0, 0);
    const c = this.cam(this.T1);
    const route = [
      from,
      pt(this.eq.x - 0.25, this.eq.y - 0.1),
      this.s2w(c, this.hand.x - 150, this.hand.y - 60),
      this.s2w(c, this.hand.x - 70, this.hand.y - 95),
      this.s2w(c, this.hand.x, this.hand.y),
    ];
    const Lr = lengths(route);
    const k = ease.inOutCubic(prog(t, this.tExit + 0.02, this.T1 - 0.02));
    const q = at(route, Lr, k * Lr[Lr.length - 1]!);
    return pt(q.x, q.y);
  }

  // ================================================================== projection
  w2s(c: Cam, x: number, y: number): [number, number] {
    const dx = (x - c.cx) * c.z, dy = -(y - c.cy) * c.z;
    const co = Math.cos(c.roll), si = Math.sin(c.roll);
    return [W / 2 + co * dx - si * dy, H / 2 + si * dx + co * dy];
  }
  s2w(c: Cam, sx: number, sy: number): P {
    const dx = sx - W / 2, dy = sy - H / 2;
    const co = Math.cos(-c.roll), si = Math.sin(-c.roll);
    const rx = co * dx - si * dy, ry = si * dx + co * dy;
    return pt(c.cx + rx / c.z, c.cy - ry / c.z);
  }

  // ================================================================== state
  tremor(t: number) {
    const up = prog(t, this.tNerv - 0.02, this.tNerv + 0.1, ease.outQuad);
    const peak = 1 + 0.6 * pulse(t, this.B(16), 0.12);
    const down = 1 - prog(t, this.B(16) + 0.06, this.tNervEnd + 0.08, ease.inOutQuad);
    return up * down * peak * (0.75 + 0.25 * Math.sin(t * 47));
  }
  exitK(t: number) { return prog(t, this.tExit, this.T1 - 0.12, ease.inQuad); }
  groupAlpha(g: string, t: number): number {
    const exit = 1 - this.exitK(t);
    const pcb = prog(t, this.tCirc, this.tCirc + 0.4);
    const late = prog(t, this.B(8), this.B(11));
    switch (g) {
      case 'u1': return exit * (1 - 0.8 * pcb) * (1 - 0.55 * prog(t, this.tCk3 - 0.05, this.tCk3 + 0.2)) * (1 - prog(t, this.w.thats!.start - 0.1, this.w.thats!.start + 0.5));
      case 'u1h': return exit * (1 - pcb);
      case 'cons': return exit * (1 - 0.5 * late) * (1 - 0.7 * pcb);
      case 'axes': return exit * (1 - 0.35 * late) * (1 - 0.72 * pcb) * (1 - 0.5 * prog(t, this.w.thats!.start, this.w.thats!.start + 0.4));
      case 'dims': return exit * (1 - 0.8 * prog(t, this.B(5), this.B(7)));
      case 'lyricI': return exit * (1 - 0.85 * prog(t, this.B(4), this.B(5)));
      case 'code': return exit * (1 - 0.8 * pcb);
      case 'code2': return exit * (1 - pcb);
      case 'prompt': return exit * (1 - prog(t, this.B(4) - 0.1, this.B(4) + 0.25));
      case 'dial': return exit * (1 - 0.75 * prog(t, this.B(4), this.B(6))) * (1 - pcb);
      case 'type': return exit * lerp(1, 0.25, prog(t, this.B(4), this.B(6))) * (1 - prog(t, this.w.Your!.start, this.w.Your!.start + 0.3));
      case 'ring': return 1;
      case 'listing': return exit * (1 - 0.85 * pcb) * (1 - prog(t, this.w.thats!.start - 0.1, this.w.thats!.start + 0.3));
      case 'typel': return exit * (1 - prog(t, this.B(4), this.B(5)));
      case 'title': return exit * (1 - prog(t, this.w.in!.start, this.w.Your!.start));
      case 'rays': return exit * (1 - prog(t, this.B(2), this.B(4)));
      case 'poly': return exit * prog(t, this.tNerv - 0.1, this.tNerv) * (1 - 0.6 * prog(t, this.w.thats!.start, this.w.thats!.start + 0.4));
      case 'eye': return exit;
      case 'eyec': return exit * (1 - prog(t, this.w.Your!.start + 0.05, this.w.Your!.start + 0.35));
      case 'table': return exit * prog(t, this.tCirc, this.tCirc + 0.2);
      case 'l1': return (1 - prog(t, this.w.Your!.start - 0.02, this.w.Your!.start + 0.12)) * exit;
      case 'l1e': return (1 - prog(t, this.w.Your!.start, this.w.Your!.start + 0.3)) * exit;
      case 'l2': return lerp(0.14, 1, 1 - prog(t, this.w.thats!.start - 0.1, this.w.thats!.start + 0.3)) * exit;
      case 'l3': return 1 - prog(t, this.T1 - 0.2, this.T1 - 0.04);
      default: return exit;
    }
  }

  // ================================================================== render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const B = this.B;
    const c = this.cam(t);
    const trem = this.tremor(t);
    const jit = (x: number, y: number): [number, number] => {
      const s = this.w2s(c, x, y);
      if (trem <= 0.001) return s;
      const a = trem * 5;
      return [s[0] + a * noise3(x * 2.3, y * 2.3, t * 24, 1), s[1] + a * noise3(x * 2.3 + 7, y * 2.3, t * 24, 2)];
    };
    const pw = this.penAt(t);
    const ps = jit(pw.x, pw.y);
    const ignite = prog(t, B(0) - 0.012, B(0) + 0.01);

    // ---- the sheet
    const u = this.bg.u;
    (u.uCam!.value as THREE.Vector4).set(c.cx, c.cy, c.z, c.roll);
    u.uReveal!.value = 24 * ease.outCubic(prog(t, B(0) + 0.15, B(2) + 0.4));
    (u.uPen!.value as THREE.Vector3).set(ps[0], ps[1], ignite);
    u.uFade!.value = this.exitK(t);
    this.bg.render(renderer, out);

    // ---- the drawing
    const L = this.lines; L.clear();
    this.drawStrokes(t, c, L, jit);
    this.drawCompassArm(t, L, jit, pw);
    this.drawPCB(t, c, L, jit);
    L.render(renderer, out);

    // ---- type
    const T = this.text; T.clear();
    this.drawNotes(t, c, T.ctx, trem);
    this.drawTable(t, c, T.ctx, trem);
    this.drawLyrics(t, c, T.ctx, trem);
    this.drawSurprisal(t, c, T.ctx);
    comp.draw(renderer, T.upload(), out);

    // ---- the pen: spark head, hot trail, sputter
    const X = this.fx; X.clear();
    if (ignite > 0) {
      const burst = pulse(t, B(0), 0.16);
      const sp = this.w.sparks!;
      const sputter = 1 + 3 * prog(t, sp.start, sp.start + 0.08) * (1 - prog(t, sp.end - 0.1, sp.end + 0.1));
      let prev = ps;
      let trail = 0;
      for (let i = 1; i <= 12; i++) {
        const tt = t - i * 0.007;
        if (tt < B(0)) break;
        const q = this.penAt(tt), s = jit(q.x, q.y);
        const k = 1 - i / 13;
        trail += Math.hypot(s[0] - prev[0], s[1] - prev[1]);
        const fade = 1 - clamp((trail - 90) / 60);
        if (fade <= 0) break;
        X.seg2(prev[0], prev[1], s[0], s[1], 2.0 * k + 0.6, [LIN.ember[0] * 3 * k * fade, LIN.ember[1] * 3 * k * fade, LIN.ember[2] * 3 * k * fade], k * fade);
        prev = s;
      }
      sparkParticles(X, t, (tb) => {
        if (tb < B(0)) return null;
        const q = this.penAt(tb);
        const s = this.w2s(c, q.x, q.y);
        return { x: s[0], y: s[1] };
      }, { rate: 60 * sputter + 700 * pulse(t, B(0), 0.06), intensity: 0.9, speed: 220 + 420 * burst, seed: 17, life: 0.42 });
      this.hornSparks(t, c, X);
      this.wordSparks(t, c, X);
      this.rayHeads(t, c, X);
      sparkHead(X, ps[0], ps[1], t, 1.05 + 1.5 * burst + 0.5 * pulse(t, this.w.eyes!.start, 0.1) + 0.7 * prog(t, this.T1 - 0.3, this.T1, ease.inQuad), ignite);
    }
    X.render(renderer, out);

    // ---- post: punches on the downbeats and the hits, tremor, ignition flash
    let punch = 0;
    for (const d of [B(4), B(8), B(12), B(16)]) punch += 0.016 * pulse(t, d, 0.09);
    for (const d of [B(5), B(6), B(7)]) punch += 0.007 * pulse(t, d, 0.07);
    punch += 0.022 * pulse(t, this.agi[0]![0], 0.08) + 0.012 * pulse(t, this.tCk2, 0.07) + 0.012 * pulse(t, this.tCk3, 0.07);
    const shakeA = 12 * trem + 9 * pulse(t, B(0), 0.07) + 4 * pulse(t, this.agi[0]![0], 0.06);
    const flash = 0.012 * pulse(t, B(0), 0.03) + 0.006 * pulse(t, this.agi[0]![0], 0.04);
    return {
      bloom: 0.72 - 0.3 * pulse(t, B(0), 0.25), bloomThreshold: 0.82, flash,
      shake: [shakeA * noise1(t * 45, 3), shakeA * noise1(t * 51, 4)],
      zoom: 1 + punch, ca: 1.0 + 5 * trem, vignette: 0.42, grain: 0.05,
      // the sheet's crop marks (the outro's rewind lands back inside them); they fly out on the last beat
      frame: 1 - prog(t, this.tExit, this.T1, ease.inOutCubic),
    };
  }

  // ---------------------------------------------------------------- strokes
  drawStrokes(t: number, c: Cam, L: LineBatch, jit: (x: number, y: number) => [number, number]) {
    const bone = LIN.bone, ash = LIN.ash, sig = LIN.signal, emb = LIN.ember;
    for (const s of this.strokes) {
      if (t < s.t0 || s.alpha <= 0) continue;
      const ga = this.groupAlpha(s.group, t);
      if (ga <= 0.002) continue;
      const k = s.ez(clamp((t - s.t0) / Math.max(1e-4, s.t1 - s.t0)));
      const head = k * s.tot;
      let base: RGB, a0: number, hot: number;
      switch (s.kind) {
        case 'axis': base = ash; a0 = 0.55; hot = 0.8; break;
        case 'cons': base = ash; a0 = 0.5; hot = 0.6; break;
        case 'dim': base = ash; a0 = 0.8; hot = 0.5; break;
        case 'hatch': base = bone; a0 = 0.55; hot = 1; break;
        case 'plot': base = bone; a0 = 0.85; hot = 1; break;
        default: base = bone; a0 = 0.8; hot = 1;
      }
      const A = a0 * s.alpha * ga;
      if (s.kind === 'ring') {
        // ignition shockwave: a construction circle racing outward
        const age = t - s.t0;
        if (age > 0.7) continue;
        const R = 0.3 + 7.5 * ease.outCubic(age / 0.7);
        const I = Math.pow(1 - age / 0.7, 1.5);
        let prev: [number, number] | null = null;
        for (let i = 0; i <= 96; i++) {
          const an = (i / 96) * TAU;
          const cur = jit(R * Math.cos(an), R * Math.sin(an));
          if (prev) L.seg2(prev[0], prev[1], cur[0], cur[1], 1.2, [sig[0] * 0.9 * I + bone[0] * 0.35 * I, sig[1] * 0.9 * I + bone[1] * 0.35 * I, sig[2] * 0.9 * I + bone[2] * 0.35 * I], I);
          prev = cur;
        }
        continue;
      }
      if (s.kind === 'eye') {
        // a perfect dot: the plotter's spiral fill closing in, drawn as one disc
        const [x, y] = jit(this.eye.x, this.eye.y);
        const r = EYE.r * c.z * Math.sqrt(clamp(k * 1.1));
        const h = Math.exp(-Math.max(0, t - s.t1) / 0.09);
        const col: RGB = [lerp(bone[0] * 0.9, sig[0] * 2.2, h), lerp(bone[1] * 0.9, sig[1] * 2.2 + 0.25 * h, h), lerp(bone[2] * 0.9, sig[2] * 2.2, h)];
        L.seg2(x, y, x + 0.01, y, 2 * r, col, ga);
        if (k >= 1) continue;
      }
      let prev: [number, number] | null = null;
      let acc = 0;
      for (let i = 0; i < s.pts.length; i++) {
        let p = s.pts[i]!;
        let stop = false;
        if (s.L[i]! > head) {
          if (i === 0) break;
          const q = at(s.pts, s.L, head);
          p = pt(q.x, q.y);
          stop = true;
        }
        const cur = jit(p.x, p.y);
        if (prev) {
          const segLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
          const age = t - Math.min(s.tD[i]!, t);
          const h1 = hot * Math.exp(-age / 0.05), h2 = hot * Math.exp(-age / 0.32);
          const col: RGB = [
            base[0] * (1 - h2) + sig[0] * 1.5 * h2 + emb[0] * 2.6 * h1,
            base[1] * (1 - h2) + sig[1] * 1.5 * h2 + emb[1] * 2.6 * h1,
            base[2] * (1 - h2) + sig[2] * 1.5 * h2 + emb[2] * 2.6 * h1,
          ];
          const al = Math.min(1, A + h2 * 0.8 * ga);
          const wd = s.width * (1 + 0.6 * h1);
          if (s.dash > 0) {
            let u0 = 0;
            while (u0 < segLen) {
              const ph = (acc + u0) % s.dash;
              const on = ph < s.dash * 0.55;
              const run = Math.min(segLen - u0, on ? s.dash * 0.55 - ph : s.dash - ph);
              if (on && run > 0.05) {
                const a1 = u0 / segLen, b1 = (u0 + run) / segLen;
                L.seg2(lerp(prev[0], cur[0], a1), lerp(prev[1], cur[1], a1), lerp(prev[0], cur[0], b1), lerp(prev[1], cur[1], b1), wd, col, al);
              }
              u0 += Math.max(run, 0.05);
            }
          } else L.seg2(prev[0], prev[1], cur[0], cur[1], wd, col, al);
          acc += segLen;
        }
        prev = cur;
        if (stop) break;
      }
    }
  }

  /** While the compass circle is swept: the compass arm from the pivot to the pen, and the pivot. */
  drawCompassArm(t: number, L: LineBatch, jit: (x: number, y: number) => [number, number], pen: P) {
    const tc = this.tCompass;
    const a = prog(t, tc - 0.12, tc) * (1 - prog(t, tc + 0.4, tc + 0.6));
    if (a <= 0) return;
    const o = jit(0, 0), p = jit(pen.x, pen.y);
    const b = LIN.bone;
    L.seg2(o[0], o[1], p[0], p[1], 1.3, [b[0] * 0.8, b[1] * 0.8, b[2] * 0.8], 0.8 * a);
    // pivot: a small ring and a cross
    const r = 7;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU;
      L.seg2(o[0] + r * Math.cos(a0), o[1] + r * Math.sin(a0), o[0] + r * Math.cos(a1), o[1] + r * Math.sin(a1), 1.2, [b[0], b[1], b[2]], 0.9 * a);
    }
  }

  /** The ray heads of the four axes on ignition: small hot sparks racing out. */
  rayHeads(t: number, c: Cam, X: LineBatch) {
    const t0 = this.B(0);
    const age = t - t0;
    if (age < 0 || age > 0.6) return;
    for (const [dx, dy, len, d] of [[1, 0, 15, 0], [-1, 0, 15, 0.01], [0, 1, 9, 0.03], [0, -1, 9, 0.04]] as const) {
      const k = ease.outExpo(clamp((age - d) / 0.55));
      const k0 = ease.outExpo(clamp((age - d - 0.02) / 0.55));
      const a = this.w2s(c, dx * len * k0, dy * len * k0), b = this.w2s(c, dx * len * k, dy * len * k);
      const I = 1 - clamp(age / 0.6);
      X.seg2(a[0], a[1], b[0], b[1], 3, [LIN.ember[0] * 4 * I, LIN.ember[1] * 4 * I, LIN.ember[2] * 4 * I], 1);
      X.seg2(b[0], b[1], b[0] + 0.01, b[1], 8, [3 * I, 2 * I, 1.2 * I], I);
    }
  }

  // ---------------------------------------------------------------- PCB phase
  /** The unicorn at time t (ckpt 1 → 2 → 3) and how refined (silhouette-only) it is. */
  geometry(t: number): { parts: Part[]; refine: number } {
    const k2 = ease.inOutCubic(prog(t, this.tCk2 - 0.03, this.tCk2 + 0.14));
    const k3 = ease.inOutCubic(prog(t, this.tCk3 - 0.03, this.tCk3 + 0.14));
    const parts = this.u1.map((p, i) => {
      const a = k2 > 0 ? mix(p.pts, this.u2[i]!.pts, k2) : p.pts;
      return { id: p.id, closed: p.closed, pts: k3 > 0 ? mix(a, this.u3[i]!.pts, k3) : a };
    });
    return { parts, refine: clamp(0.45 * k2 + 0.55 * k3) };
  }

  drawPCB(t: number, c: Cam, L: LineBatch, jit: (x: number, y: number) => [number, number]) {
    if (t < this.tCirc - 0.02) return;
    const exit = 1 - this.exitK(t);
    if (exit <= 0) return;
    const { parts, refine } = this.geometry(t);
    const order = ['body', 'neck', 'head', 'horn', 'ear', 'mane0', 'mane1', 'mane2', 'leg2', 'leg3', 'leg1', 'leg0', 'leg4', 'tail0', 'tail1', 'tail2'];
    const closed = parts.filter((p) => p.closed);
    const inside = (x: number, y: number, self: string) => {
      for (const q of closed) if (q.id !== self && pointInPoly(x, y, q.pts)) return true;
      return false;
    };
    const sig = LIN.signal, emb = LIN.ember, bone = LIN.bone;
    const settle = prog(t, this.w.thats!.start - 0.1, this.w.thats!.start + 0.6, ease.inOutCubic); // traces cool to bone
    const k2in = prog(t, this.tCk2 - 0.03, this.tCk2 + 0.1);
    for (const part of parts) {
      if (part.id === 'leg4' && k2in <= 0) continue;
      const oi = Math.max(0, order.indexOf(part.id));
      const tr0 = this.tCirc + 0.02 + oi * 0.02;
      const kr = ease.outCubic(prog(t, tr0, tr0 + 0.3));
      if (kr <= 0) continue;
      const base = octilinear(part.pts, 0.24, 0.08, part.closed);
      const tracks = part.id.startsWith('leg') || part.id === 'ear' || part.id === 'horn' ? [0, -0.06] : [0, -0.075, 0.075];
      tracks.forEach((off, ti) => {
        const path = off === 0 ? base : offset(base, off, part.closed);
        const Lp = lengths(path);
        const head = kr * Lp[Lp.length - 1]!;
        let prev: [number, number] | null = null;
        for (let i = 0; i < path.length; i++) {
          let p = path[i]!;
          let stop = false;
          if (Lp[i]! > head) {
            if (i === 0) break;
            const q = at(path, Lp, head); p = pt(q.x, q.y); stop = true;
          }
          const cur = jit(p.x, p.y);
          if (prev) {
            const a = path[i - 1]!;
            const hid = refine > 0.02 && part.closed && inside((a.x + p.x) / 2, (a.y + p.y) / 2, part.id);
            const vis = hid ? 1 - refine : 1;
            if (vis > 0.01) {
              const front = kr < 1 ? Math.exp(-Math.max(0, head - Lp[i]!) / 0.3) : 0;
              const warm = (1 - settle) * (ti === 0 ? 1 : 0.6);
              const col: RGB = [
                lerp(bone[0] * 0.72, sig[0] * 0.95, warm) + emb[0] * 3 * front,
                lerp(bone[1] * 0.72, sig[1] * 0.95, warm) + emb[1] * 3 * front,
                lerp(bone[2] * 0.72, sig[2] * 0.95, warm) + emb[2] * 3 * front,
              ];
              L.seg2(prev[0], prev[1], cur[0], cur[1], ti === 0 ? 1.6 : 1.0, col, (ti === 0 ? 0.95 : 0.55) * vis * exit);
            }
          }
          prev = cur;
          if (stop) break;
        }
        if (kr >= 1 && ti === 0) {
          const ends = part.closed ? [path[0]!] : [path[0]!, path[path.length - 1]!];
          for (const e of ends) {
            if (part.closed && refine > 0.5 && inside(e.x, e.y, part.id)) continue;
            this.via(L, jit, c, e.x, e.y, 0.055, exit);
          }
        }
      });
    }
    // current: pulses running along the traces on the 8ths
    if (t > this.tCirc + 0.3 && settle < 1) {
      const n8 = Math.floor(this.ctx.audio.beatAt(t) * 2);
      for (let j = 0; j < 4; j++) {
        const tb = this.ctx.audio.timeOfBeat((n8 - j) / 2);
        const age = t - tb;
        if (age < 0 || age > 0.7) continue;
        const part = parts[(n8 - j) * 7 % parts.length]!;
        if (part.id === 'leg4' && k2in <= 0) continue;
        const path = octilinear(part.pts, 0.24, 0.08, part.closed);
        const Lp = lengths(path), tot = Lp[Lp.length - 1]!;
        const s0 = (age / 0.7) * tot;
        const I = (1 - age / 0.7) * (1 - settle) * exit;
        let prev: [number, number] | null = null;
        for (let q = 0; q <= 6; q++) {
          const pq = at(path, Lp, Math.max(0, s0 - 0.4 + (q / 6) * 0.4));
          const cur = jit(pq.x, pq.y);
          if (prev) L.seg2(prev[0], prev[1], cur[0], cur[1], 2.4, [emb[0] * 4 * I * q / 6, emb[1] * 4 * I * q / 6, emb[2] * 4 * I * q / 6], 1);
          prev = cur;
        }
      }
    }
  }

  via(L: LineBatch, jit: (x: number, y: number) => [number, number], c: Cam, x: number, y: number, r: number, a: number) {
    const n = 16;
    let prev = jit(x + r, y);
    const b = LIN.bone;
    for (let i = 1; i <= n; i++) {
      const an = (i / n) * TAU;
      const cur = jit(x + r * Math.cos(an), y + r * Math.sin(an));
      L.seg2(prev[0], prev[1], cur[0], cur[1], 1.3, [b[0] * 0.85, b[1] * 0.85, b[2] * 0.85], 0.9 * a);
      prev = cur;
    }
    const [cx, cy] = jit(x, y);
    L.seg2(cx, cy, cx + 0.01, cy, Math.max(1.4, r * 0.7 * c.z), [b[0] * 0.5, b[1] * 0.5, b[2] * 0.5], a);
  }

  /** The word "sparks" throws sparks: each glyph bursts from its top as the karaoke fill completes it. */
  wordSparks(t: number, c: Cam, X: LineBatch) {
    const lw = this.words.find((x) => x.w === this.w.sparks)!;
    const n = lw.lay.glyphs.length, wd = lw.w;
    lw.lay.glyphs.forEach((g, gi) => {
      const tb0 = lerp(wd.start, wd.end, (gi + 1) / n);
      const age = t - tb0;
      if (age < 0 || age > 0.8) return;
      const gx = lw.x + ((g.x + g.w * 0.5) / 100) * lw.em, gy = lw.y + 0.55 * lw.em;
      for (let i = 0; i < 16; i++) {
        const life = 0.3 + 0.45 * hash(i, gi, 31);
        const a2 = age - hash(i, gi, 32) * 0.05;
        if (a2 < 0 || a2 > life) continue;
        const an = Math.PI / 2 + (hash(i, gi, 33) - 0.5) * 2.2;
        const sp = 1.5 + 4 * hash(i, gi, 34) ** 2;
        const pos = (tt: number) => this.w2s(c, gx + Math.cos(an) * sp * tt, gy + Math.sin(an) * sp * tt - 3.2 * tt * tt);
        const p1 = pos(a2), p0 = pos(Math.max(0, a2 - 0.025));
        const k = 1 - a2 / life;
        X.seg2(p0[0], p0[1], p1[0], p1[1], 1.0 + k, [(LIN.signal[0] + k) * 2.2, (LIN.signal[1] + 0.6 * k * k) * 2.2, (LIN.signal[2] + 0.3 * k * k) * 2.2], Math.min(1, k * 1.5));
      }
    });
  }

  hornSparks(t: number, c: Cam, X: LineBatch) {
    const horn = this.u1.find((p) => p.id === 'horn')!.pts;
    const apex = horn[hornApex(horn)]!, br = horn[hornBaseR(horn)]!;
    const axis = Math.atan2(apex.y - (horn[0]!.y + br.y) / 2, apex.x - (horn[0]!.x + br.x) / 2);
    const agi = this.words.find((x) => x.w === this.w.AGI)!;
    const toA = Math.atan2(agi.y + 0.35 * agi.em - apex.y, agi.x + 0.3 * agi.em - apex.x);
    // A: the horn lands (a big streak); G, I: the horn fires again
    this.agi.forEach(([ta], si) => {
      const age = t - ta;
      if (age < 0 || age > 1.0) return;
      const n = si === 0 ? 110 : 45;
      const dir = lerp(axis, toA, si === 0 ? 0.45 : 0.7);
      for (let i = 0; i < n; i++) {
        const tb = ta + (si === 0 ? 0.05 : 0) + hash(i, 5 + si) ** 2 * 0.2;
        const a2 = t - tb;
        if (a2 < 0) continue;
        const life = 0.25 + 0.5 * hash(i, 6 + si);
        if (a2 > life) continue;
        const an = dir + (hash(i, 7 + si) - 0.5) * 0.55 * (0.3 + hash(i, 9 + si));
        const sp = (si === 0 ? 5 : 3.5) + 11 * hash(i, 8 + si) ** 2;
        const pos = (tt: number) => { const d = sp * tt * (1 - 0.4 * tt / life); return this.w2s(c, apex.x + Math.cos(an) * d, apex.y + Math.sin(an) * d - 1.6 * tt * tt); };
        const p1 = pos(a2), p0 = pos(Math.max(0, a2 - 0.03));
        const k = 1 - a2 / life;
        X.seg2(p0[0], p0[1], p1[0], p1[1], 1.1 + 1.3 * k, [(LIN.signal[0] + k) * 2.4, (LIN.signal[1] + 0.7 * k * k) * 2.4, (LIN.signal[2] + 0.4 * k * k) * 2.4], Math.min(1, k * 1.5));
      }
    });
  }

  // ---------------------------------------------------------------- type
  /** Canvas transform for world-space text at (x, y), em size `em` world units, drawn at 100 px. */
  tx(ctx: CanvasRenderingContext2D, c: Cam, x: number, y: number, em: number, rot = 0, j: [number, number] = [0, 0]) {
    const [sx, sy] = this.w2s(c, x, y);
    const k = (c.z * em) / 100;
    const a = c.roll - rot;
    ctx.setTransform(k * Math.cos(a), k * Math.sin(a), -k * Math.sin(a), k * Math.cos(a), sx + j[0], sy + j[1]);
  }

  drawNotes(t: number, c: Cam, ctx: CanvasRenderingContext2D, trem: number) {
    ctx.textBaseline = 'alphabetic';
    for (const n of this.notes) {
      if (t < n.t0) continue;
      const px = c.z * n.em;
      const sizeA = clamp(px / 8 - 0.4) * (1 - clamp((px - n.maxPx) / (n.maxPx * 0.6)));
      const ga = this.groupAlpha(n.group, t) * sizeA;
      if (ga <= 0.003) continue;
      const shown = Math.floor(n.text.length * clamp((t - n.t0) / Math.max(0.01, n.dur)) + 1e-3);
      if (shown <= 0) continue;
      const j: [number, number] = trem > 0 ? [trem * 3 * noise1(t * 30 + n.x * 7, 5), trem * 3 * noise1(t * 30 + n.y * 7, 6)] : [0, 0];
      this.tx(ctx, c, n.x, n.y, n.em, n.rot, j);
      ctx.font = font(F.mono(n.weight), 100);
      ctx.textAlign = n.align;
      const hk = n.hot > 0 ? 1 - prog(t, n.t0 + n.dur, n.t0 + n.dur + n.hot) : 0;
      ctx.fillStyle = hk > 0 ? mixCss(n.col, 'signal', hk, n.a * ga) : rgba(n.col, n.a * ga);
      const s = n.align === 'left' ? n.text.slice(0, shown) : n.text;
      ctx.fillText(s, 0, 0);
      if (shown < n.text.length && n.align === 'left') {
        ctx.fillStyle = rgba('signal', ga);
        ctx.fillRect(ctx.measureText(s).width + 6, -74, 54, 88);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Training checkpoints: a tiny mono table (ckpt 2 has five legs; P(doom) is steady). */
  drawTable(t: number, c: Cam, ctx: CanvasRenderingContext2D, trem: number) {
    const ga = this.groupAlpha('table', t);
    if (ga <= 0.003) return;
    const p = this.tablePos();
    const rows = [
      ['ckpt', 'step', 'legs', 'P(doom)'],
      ['1', '0', '4', '0.02'],
      ['2', '4,000', '5', '0.02'],
      ['3', '32,000', '4', '0.02'],
    ];
    const cols = [0, 0.75, 1.75, 2.5];
    const shownAt = [this.tCirc, this.tCirc + 0.05, this.tCk2, this.tCk3];
    const cur = t >= this.tCk3 ? 3 : t >= this.tCk2 ? 2 : 1;
    ctx.textBaseline = 'alphabetic';
    rows.forEach((r, ri) => {
      if (t < shownAt[ri]!) return;
      const y = p.y - ri * 0.26;
      const typed = clamp((t - shownAt[ri]!) / 0.12);
      r.forEach((cell, ci) => {
        const j: [number, number] = trem > 0 ? [trem * 3 * noise1(t * 30 + ri, 5), trem * 3 * noise1(t * 31 + ci, 6)] : [0, 0];
        this.tx(ctx, c, p.x + cols[ci]!, y, 0.16, 0, j);
        ctx.font = font(F.mono(ri === 0 ? 500 : 400), 100);
        ctx.textAlign = 'left';
        const hot = ri === cur;
        const col = ri === 0 ? rgba('ash', 0.8 * ga) : hot ? rgba(ri === 2 && ci === 2 ? 'signal' : 'bone', 0.95 * ga) : rgba('ash', 0.55 * ga);
        ctx.fillStyle = col;
        ctx.fillText(cell.slice(0, Math.ceil(cell.length * typed)), 0, 0);
      });
      if (ri === cur) {
        // the row marker: a small right-pointing triangle, drawn (Plex Mono has no ▸; the system
        // fallback glyph would differ between machines), at the fallback ▸'s size and position
        this.tx(ctx, c, p.x - 0.22, y, 0.16);
        ctx.fillStyle = rgba('signal', ga);
        ctx.beginPath(); ctx.moveTo(10.7, -45.4); ctx.lineTo(49.5, -26); ctx.lineTo(10.7, -6.6); ctx.closePath(); ctx.fill();
      }
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawLyrics(t: number, c: Cam, ctx: CanvasRenderingContext2D, trem: number) {
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    for (const lw of this.words) {
      if (t < lw.tAnt) continue;
      const ga = this.groupAlpha(lw.group, t);
      if (ga <= 0.003) continue;
      const px = c.z * lw.em;
      if (px < 6 || px > 5000) continue;
      const ant = prog(t, lw.tAnt, lw.tAnt + 0.18);
      // "surprise" is held past the cut into the loss plate: finish its wipe before the plate dissolves
      const p = lw.w === this.w.surprise ? prog(t, lw.w.start, Math.min(lw.w.end, this.T1 - 0.24)) : Lyrics.wordProgress(lw.w, t);
      const done = prog(t, lw.w.end, lw.w.end + 0.3);
      const isNerv = lw.w === this.w.nervous;
      const isI = lw.w === this.w.I;
      const isAGI = lw.w === this.w.AGI;
      ctx.font = font(lw.fam, 100);
      const n = lw.lay.glyphs.length;
      for (const g of lw.lay.glyphs) {
        let j: [number, number] = [0, 0];
        if (trem > 0.001) {
          const amp = trem * (isNerv ? 10 : 3);
          j = [amp * noise1(t * 38 + g.i * 3.1, 11), amp * noise1(t * 41 + g.i * 2.3, 12)];
        }
        // AGI: one letter per syllable, slammed in on its onset (with a small pop)
        const sylT = isAGI ? this.agi[g.i]?.[0] ?? lw.w.start : 0;
        const pop = isAGI ? 1 + 0.12 * pulse(t, sylT, 0.07) : 1;
        if (pop !== 1) {
          const cx = lw.x + ((g.x + g.w / 2) / 100) * lw.em, cy = lw.y + 0.36 * lw.em;
          this.tx(ctx, c, cx + (lw.x + (g.x / 100) * lw.em - cx) * pop, cy + (lw.y - cy) * pop, lw.em * pop, 0, j);
        } else this.tx(ctx, c, lw.x + (g.x / 100) * lw.em, lw.y, lw.em, 0, j);
        const gp = isAGI ? (t >= sylT ? 1 : 0) : clamp(p * n - g.i);
        if (gp < 1 && !isI) {
          ctx.lineWidth = (1.1 * 100) / px;
          ctx.strokeStyle = rgba('ash', 0.45 * ant * ga);
          ctx.strokeText(g.ch, 0, 0);
        }
        if (gp > 0) {
          ctx.save();
          if (gp < 1) {
            // the "I" fills from the baseline up (it is a rectangle being filled); the others wipe left→right
            ctx.beginPath();
            if (isI) ctx.rect(-20, -100 * gp, g.w + 40, 100 * gp + 30); else ctx.rect(-20, -130, g.w * gp + 20, 190);
            ctx.clip();
          }
          const hotI = isAGI ? pulse(t, sylT, 0.05) : 0;
          ctx.fillStyle = hotI > 0.02 ? mixCss('signal', 'ember', Math.min(1, hotI * 1.5)) : done < 1 ? mixCss('signal', 'bone', done) : rgba('bone', 1);
          ctx.globalAlpha = ga;
          ctx.fillText(g.ch, 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawSurprisal(t: number, c: Cam, ctx: CanvasRenderingContext2D) {
    const ts = this.w.surprise!.start;
    if (t < ts) return;
    const ga = this.groupAlpha('l3', t);
    const e = this.eq;
    const k = prog(t, ts + 0.12, ts + 0.5, ease.outCubic);
    const s1 = 'surprisal   −log p = ';
    const s2 = `${lerp(4.61, 0, k).toFixed(2)} nats`;
    const full = s1 + s2;
    const n = Math.floor(full.length * clamp((t - ts - 0.03) / 0.27));
    this.tx(ctx, c, e.x, e.y, 0.27);
    ctx.font = font(F.mono(400), 100);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba('ash', 0.95 * ga);
    ctx.fillText(s1.slice(0, Math.min(n, s1.length)), 0, 0);
    if (n > s1.length) {
      ctx.fillStyle = k < 1 ? rgba('signal', ga) : rgba('bone', ga);
      ctx.fillText(s2.slice(0, n - s1.length), ctx.measureText(s1).width, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

/** Axis tick label, set like TikZ's math-mode ticks: a true minus sign (U+2212), not a hyphen. */
const tick = (i: number) => (i < 0 ? `−${-i}` : String(i));

/** Index of the horn's apex (highest point) and of its right base corner in the resampled triangle. */
function hornApex(h: P[]) { let bi = 0; h.forEach((p, i) => { if (p.y > h[bi]!.y) bi = i; }); return bi; }
function hornBaseR(h: P[]) { let bi = 0; h.forEach((p, i) => { if (p.x - p.y * 0.3 > h[bi]!.x - h[bi]!.y * 0.3 && p.y < 2.5) bi = i; }); return bi; }

function pointInPoly(x: number, y: number, ps: P[]) {
  let c = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i]!, b = ps[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function mixCss(a: string, b: string, k: number, alpha = 1) {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgba(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')},${alpha})`;
}
