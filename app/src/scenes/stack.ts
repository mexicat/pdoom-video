// FIG. 11 — "Architecture (recursive)". The bridge, part 1:
//   “Just transformers all the way!” / Till you learned to disobey
// An infinite vertical stack of transformer blocks drawn as technical line diagrams. The camera
// falls through it one block per beat; the quote sits one word (group) per block. On "disobey"
// the fall stops dead, one block rotates out of alignment and the word highlights right-to-left.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { Lyrics, type Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog, pulse, smoothstep, springStep, TAU } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';
import { TextPlane, beatsIn, lin, strokeLines, type RGB } from './stack-kit';
import { PDoom, formatPDoom } from '../engine/hud';

// ---- block geometry (world units) ----
const HX = 6, HY = 3, HZ = 1.4; // half extents of a block
const P = 7.6; // vertical pitch between blocks (block + gap)
const MX = 0.6; // main data path x
const LEAD = 0.22; // fraction of a block the camera pre-moves before each beat
const RX = -4.6; // residual bypass x
const BX0 = -2.5, BX1 = 3.7; // sublayer box x range

type Seg = [number, number, number, number, number, number, number, number, number, number, number]; // a(3) b(3) w rgb a

interface Step { t: number; amt: number; kind: 'drop' | 'beat' | 'stop' }
interface Group { block: number; words: Word[]; planes: TextPlane[]; lay: { x: number; y: number; s: number }[]; stepT: number; echo: boolean }

const C_BONE = lin('bone');
const C_ASH = lin('ash');
const C_GRAPH = lin('graphite');

export default class Stack extends Scene {
  cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 800);
  lines = new LineBatch(90000, { screen2D: false, blend: 'add', depthTest: true });
  bodyScene = new THREE.Scene();
  bodies!: THREE.InstancedMesh;
  fx = new LineBatch(6000, { blend: 'add' });
  text3 = new THREE.Scene();
  hud = new Layer2D();
  bg = new FSPass(/* glsl */ `
    uniform float t; uniform float fall; uniform float stopK; uniform float kick;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      // abyss: slightly lighter haze far below (the stack never ends)
      float haze = smoothstep(0.9, -0.6, vUv.y) * 0.5;
      vec3 c = C_INK + C_INK2 * haze * 0.9;
      // faint drafting grid behind, parallax with the fall
      vec2 g = vec2(p.x * 24.0, p.y * 24.0 + fall * 2.2);
      float gl = max(hatch(g.x, 0.035), hatch(g.y, 0.035));
      c += C_GRAPHITE * gl * 0.06 * (1.0 - 0.6 * stopK);
      // falling streaks during motion
      float n = hash12(vec2(floor(p.x * 90.0), 3.0));
      float streak = smoothstep(0.985, 1.0, n) * fract(p.y * 1.5 + fall * (0.6 + n) + n * 7.0);
      c += C_GRAPHITE * streak * 0.18 * (1.0 - stopK);
      fragColor = vec4(c, 1.0);
    }`, { t: { value: 0 }, fall: { value: 0 }, stopK: { value: 0 }, kick: { value: 0 } });

  private tmpl: Seg[] = [];
  private tmplHot: Seg[] = []; // main path (glows when the forward pass runs)
  private steps: Step[] = [];
  private groups: Group[] = [];
  private stopT = 0;
  private stopBlock = 0;
  private disobey!: Word;
  private disobeyLetters: TextPlane[] = [];
  private disobeyGlyphX: number[] = [];
  private quoteOpen!: TextPlane;
  private quoteClose!: TextPlane;
  private labels = new Map<number, Seg[]>();
  private phaseCuts: { t: number; id: string }[] = [];
  private tHold0 = 0; private tHold1 = 0;
  private craneEnd = 0;
  private fogScale = 1;
  private rotT0 = 0; private rotT1 = 0;
  private pd!: PDoom;

  override async init() {
    const { lyrics, audio } = this.ctx;
    const q = lyrics.get('transformers all the way');
    const till = lyrics.get('Till you learned');
    this.disobey = till.words[till.words.length - 1]!;
    const t0 = this.ctx.start, t1 = this.ctx.end;
    this.pd = new PDoom(lyrics);
    const words = [...q.words, ...till.words];
    this.craneEnd = Math.max(t0 + 0.22, Math.min(t0 + 0.62, q.words[0]!.start + 0.1));

    // --- steps: one per beat until the fall stops dead near "disobey" ---
    const beats = beatsIn(audio, t0 - 1e-3, t1);
    let stopT = this.disobey.start;
    let best = 1e9;
    for (const b of beats) if (Math.abs(b - this.disobey.start) < best && Math.abs(b - this.disobey.start) < 0.3) { best = Math.abs(b - this.disobey.start); stopT = b; }
    stopT = Math.max(stopT, t0 + 0.5);
    this.stopT = stopT;
    // the misaligned block swings out right after the stop and lands on the next beat (or just before the cut)
    {
      const nb = beats.find((b) => b > stopT + 0.25) ?? stopT + 0.45;
      this.rotT1 = Math.min(nb, t1 - 0.03);
      this.rotT0 = Math.min(stopT + 0.12, this.rotT1 - 0.2);
    }
    this.steps.push({ t: t0, amt: 4, kind: 'drop' });
    for (const b of beats) {
      if (b <= t0 + 0.2 || b >= stopT - 0.2) continue;
      this.steps.push({ t: b, amt: 1, kind: 'beat' });
    }
    // don't carry the opening word out of frame right after it starts: skip that first beat
    {
      const w0 = q.words[0]!;
      const i1 = this.steps.findIndex((x) => x.kind === 'beat');
      const s1 = this.steps[i1];
      if (s1 && s1.t > w0.start && (s1.t - w0.start) / Math.max(0.05, w0.end - w0.start) < 0.6) this.steps.splice(i1, 1);
    }
    this.steps.push({ t: stopT, amt: 1, kind: 'stop' });
    const blockAt = (t: number) => { let n = 0; for (const s of this.steps) if (s.t <= t) n += s.amt; return n; };
    this.stopBlock = blockAt(stopT);

    // --- words -> blocks ---
    const byBlock = new Map<number, Word[]>();
    for (const w of words) {
      let b = w === this.disobey ? this.stopBlock : blockAt(w.start + 0.12);
      if (w !== this.disobey && b >= this.stopBlock) b = this.stopBlock - 1;
      if (!byBlock.has(b)) byBlock.set(b, []);
      byBlock.get(b)!.push(w);
    }
    const stepTimeOf = (b: number) => { let n = 0; for (const s of this.steps) { n += s.amt; if (n >= b) return s.t; } return t1; };
    for (const [block, ws] of [...byBlock.entries()].sort((a, b) => a[0] - b[0])) {
      if (ws.includes(this.disobey)) continue;
      this.groups.push(this.makeGroup(block, ws, stepTimeOf(block)));
    }
    // held word: the blocks between a long word and the next group echo it (ghost copies)
    const tw = q.words.find((w) => /transformers/i.test(w.w));
    if (tw) {
      const g = this.groups.find((g) => g.words.includes(tw))!;
      const next = this.groups.find((x) => x.block > g.block);
      this.tHold0 = tw.start; this.tHold1 = tw.end;
      for (let b = g.block + 1; b < (next ? next.block : g.block + 1); b++) {
        const echo = this.makeGroup(b, [tw], stepTimeOf(b), true);
        this.groups.push(echo);
      }
    }

    // DISOBEY as individual letters (they break rank), set on the font's own spacing and kerning
    // (rounds sit closer than straights: a constant gap between the ink boxes left S–O and O–B loose),
    // tracked about as tight as before, the inks of E–Y kept a hairline apart
    {
      const fam = F.archivo(75, 900);
      const text = this.disobey.w.replace(/[^A-Za-z]/g, '').toUpperCase();
      const capH = 2.3, minGap = capH * 0.04;
      const lay = layout(text, fam, 100, -0.03 * 100);
      let shift = 0, right = -Infinity;
      const pl: TextPlane[] = [];
      Array.from(text).forEach((ch, i) => {
        const tp = new TextPlane(ch, fam, { capH, px: 300, ax: 0, ay: 0.5, outline: 0.022 });
        pl.push(tp);
        const xl = (lay.glyphs[i]!.x / 100) * tp.em + tp.inkX;
        const x = Math.max(xl + shift, right + minGap);
        shift = x - xl;
        right = x + tp.w;
        this.disobeyGlyphX.push(x);
        this.text3.add(tp.mesh);
      });
      const x0 = this.disobeyGlyphX[0]!, tot = right - x0;
      this.disobeyGlyphX = this.disobeyGlyphX.map((v) => v - x0 - tot / 2);
      this.disobeyLetters = pl;
    }
    // giant curly quotes
    this.quoteOpen = new TextPlane('“', F.serif(600), { capH: 4.2, px: 420, ax: 1, ay: 1, outline: 0.012 });
    this.quoteClose = new TextPlane('”', F.serif(600), { capH: 4.2, px: 420, ax: 0, ay: 1, outline: 0.012 });
    this.text3.add(this.quoteOpen.mesh, this.quoteClose.mesh);

    this.buildTemplate();
    // solid block bodies: dark slabs that hide the lines behind them
    {
      const geo = new THREE.BoxGeometry(2 * HX * 0.994, 2 * HY * 0.994, 2 * HZ * 0.99);
      const mk = (c: RGB) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace), fog: true });
      const ink = LIN.ink, ink2 = LIN.ink2;
      const side: RGB = [ink[0] * 0.8, ink[1] * 0.8, ink[2] * 0.8];
      const front: RGB = [ink2[0] * 1.15, ink2[1] * 1.15, ink2[2] * 1.15];
      const top: RGB = [ink2[0] * 0.85, ink2[1] * 0.85, ink2[2] * 0.85];
      this.bodies = new THREE.InstancedMesh(geo, [mk(side), mk(side), mk(top), mk(side), mk(front), mk(side)], 24);
      this.bodies.frustumCulled = false;
      this.bodyScene.add(this.bodies);
      this.bodyScene.fog = new THREE.Fog(new THREE.Color().setRGB(ink[0], ink[1], ink[2], THREE.LinearSRGBColorSpace), 20, 80);
    }
    for (const o of this.text3.children) ((o as THREE.Mesh).material as THREE.Material).depthTest = true;
    // phase cuts (camera setups change on these step times)
    const gFirst = (re: RegExp) => this.groups.find((g) => g.words.some((w) => re.test(w.w)));
    const gAll = gFirst(/^all$/i), gTill = gFirst(/^till$/i);
    this.phaseCuts = [
      { t: t0, id: 'A' },
      ...(gAll ? [{ t: gAll.stepT, id: 'C' }] : []),
      // reframe for "Till" only once the previous word ("way!”") has been sung (it is held past the beat)
      ...(gTill ? [{ t: Math.max(gTill.stepT, (words[words.indexOf(gTill.words[0]!) - 1]?.end ?? 0) - 0.04), id: 'D' }] : []),
      { t: stopT, id: 'E' },
    ];
  }

  private makeGroup(block: number, ws: Word[], stepT: number, echo = false): Group {
    const fam = F.archivo(75, 900);
    const capH = 2.2;
    const planes = ws.map((w) => {
      const txt = w.w.replace(/[\u201C\u201D]/g, '').toUpperCase();
      const tp = new TextPlane(txt, fam, { capH, px: 300, ax: 0, ay: 0.5, outline: 0.02 });
      this.text3.add(tp.mesh);
      return tp;
    });
    // rows: greedy fill; widen the budget until there are at most 2 rows, then scale rows to fit
    const gap = 0.55, maxW = 12.6, lead = capH * 1.12;
    let rows: number[][] = [];
    for (const budget of [maxW, 15, 18, 22, 30]) {
      rows = [[]];
      let rw = 0;
      planes.forEach((p, i) => {
        const cur = rows[rows.length - 1]!;
        const add = (cur.length ? gap : 0) + p.w;
        if (cur.length && rw + add > budget) { rows.push([i]); rw = p.w; } else { cur.push(i); rw += add; }
      });
      if (rows.length <= 2) break;
    }
    const lay: { x: number; y: number; s: number }[] = [];
    const nR = rows.length;
    const widths = rows.map((r) => r.reduce((a, i) => a + planes[i]!.w, 0) + gap * (r.length - 1));
    const sAll = Math.min(nR > 1 ? 0.8 : 1, ...widths.map((w) => maxW / w));
    rows.forEach((r, ri) => {
      const w = widths[ri]!;
      let x = -w * sAll / 2;
      const y = ((nR - 1) / 2 - ri) * lead * sAll;
      for (const i of r) { lay[i] = { x, y, s: sAll }; x += (planes[i]!.w + gap) * sAll; }
    });
    planes.forEach((p, i) => p.mesh.scale.setScalar(lay[i]!.s));
    return { block, words: ws, planes, lay, stepT, echo };
  }

  // ------------------------------------------------------------ block template
  private buildTemplate() {
    const T = this.tmpl, Hh = this.tmplHot;
    const z = HZ;
    const s = (a: number[], b: number[], w: number, c: RGB, al = 1, into: Seg[] = T) => into.push([a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, w, c[0], c[1], c[2], al]);
    const rect = (x0: number, y0: number, x1: number, y1: number, zz: number, w: number, c: RGB, al = 1, ch = 0) => {
      const pts = ch > 0
        ? [[x0 + ch, y0], [x1 - ch, y0], [x1, y0 + ch], [x1, y1 - ch], [x1 - ch, y1], [x0 + ch, y1], [x0, y1 - ch], [x0, y0 + ch], [x0 + ch, y0]]
        : [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      for (let i = 1; i < pts.length; i++) s([pts[i - 1]![0]!, pts[i - 1]![1]!, zz], [pts[i]![0]!, pts[i]![1]!, zz], w, c, al);
    };
    const arrow = (x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, al = 1, into: Seg[] = T, head = 0.16) => {
      s([x0, y0, z], [x1, y1, z], w, c, al, into);
      const a = Math.atan2(y1 - y0, x1 - x0);
      for (const d of [-1, 1]) s([x1, y1, z], [x1 - Math.cos(a + d * 0.45) * head, y1 - Math.sin(a + d * 0.45) * head, z], w, c, al, into);
    };
    const circle = (cx: number, cy: number, r: number, w: number, c: RGB, al = 1, n = 20) => {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
        s([cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], w, c, al);
      }
    };
    const label = (text: string, cx: number, cy: number, capH: number, c: RGB, al = 1, alignLeft = false, w = 1.1) => {
      const sl = strokeLines(text, 'tech', 100);
      const k = capH / Math.max(1e-3, sl.cap);
      const ox = alignLeft ? cx : cx - (sl.width * k) / 2;
      for (const st of sl.strokes) for (let i = 1; i < st.length; i++) {
        const p = st[i - 1]!, q = st[i]!;
        s([ox + p.x * k, cy - p.y * k - capH / 2, z], [ox + q.x * k, cy - q.y * k - capH / 2, z], w, c, al);
      }
    };

    // outer body: front face (chamfered), back face, depth edges
    rect(-HX, -HY, HX, HY, z, 2.2, C_BONE, 0.9, 0.35);
    rect(-HX, -HY, HX, HY, -HZ, 1, C_GRAPH, 0.8, 0.35);
    for (const [x, y] of [[-HX + 0.35, -HY], [HX - 0.35, -HY], [-HX + 0.35, HY], [HX - 0.35, HY], [-HX, -HY + 0.35], [HX, -HY + 0.35], [-HX, HY - 0.35], [HX, HY - 0.35]] as const)
      s([x, y, z], [x, y, -HZ], 1, C_ASH, 0.55);
    // side & top face lamination lines (volume)
    for (let i = 1; i < 6; i++) {
      const y = -HY + (i / 6) * 2 * HY;
      s([HX, y, z - 0.05], [HX, y, -HZ + 0.05], 0.8, C_GRAPH, 0.6);
      s([-HX, y, z - 0.05], [-HX, y, -HZ + 0.05], 0.8, C_GRAPH, 0.6);
    }
    for (let i = 1; i < 12; i++) {
      const x = -HX + (i / 12) * 2 * HX;
      s([x, HY, z - 0.05], [x, HY, -HZ + 0.05], 0.8, C_GRAPH, 0.5);
    }
    // inner frame (inset hairline)
    rect(-HX + 0.25, -HY + 0.25, HX - 0.25, HY - 0.25, z, 0.8, C_GRAPH, 0.9, 0.2);

    // sublayers
    const box = (y0: number, y1: number, name: string, heads = 0) => {
      rect(BX0, y0, BX1, y1, z, 1.5, C_BONE, 0.75, 0.08);
      for (let h = 1; h <= heads; h++) {
        const o = h * 0.13;
        s([BX0 + o, y1 + o, z], [BX1 + o, y1 + o, z], 1, C_ASH, 0.55 - h * 0.12);
        s([BX1 + o, y1 + o, z], [BX1 + o, y0 + o, z], 1, C_ASH, 0.55 - h * 0.12);
      }
      label(name, (BX0 + BX1) / 2, (y0 + y1) / 2, Math.min(0.26, (y1 - y0) * 0.36), C_ASH, 0.95);
    };
    box(-2.15, -1.15, 'MULTI-HEAD ATTENTION', 3);
    box(-0.8, -0.3, 'ADD & NORM');
    box(0.25, 1.25, 'FEED FORWARD');
    box(1.6, 2.1, 'ADD & NORM');
    // main path (hot)
    const hotW = 1.6;
    s([MX, -HY, z], [MX, -2.55, z], hotW, C_BONE, 0.8, Hh);
    for (const dx of [-1.8, 0, 1.8]) arrow(MX, -2.55, MX + dx, -2.15, hotW, C_BONE, 0.8, Hh, 0.13);
    arrow(MX, -1.15, MX, -0.8, hotW, C_BONE, 0.8, Hh, 0.13);
    arrow(MX, -0.3, MX, 0.25, hotW, C_BONE, 0.8, Hh, 0.13);
    arrow(MX, 1.25, MX, 1.6, hotW, C_BONE, 0.8, Hh, 0.13);
    s([MX, 2.1, z], [MX, HY, z], hotW, C_BONE, 0.8, Hh);
    // connector through the gap to the block above
    arrow(MX, HY, MX, P - HY, hotW, C_BONE, 0.7, Hh, 0.2);
    // residual bypasses (the residual stream)
    s([MX, -2.55, z], [RX, -2.55, z], 1.3, C_BONE, 0.65, Hh);
    s([RX, -2.55, z], [RX, -0.55, z], 1.3, C_BONE, 0.65, Hh);
    arrow(RX, -0.55, BX0, -0.55, 1.3, C_BONE, 0.65, Hh, 0.13);
    s([MX, -0.02, z], [RX, -0.02, z], 1.3, C_BONE, 0.65, Hh);
    s([RX, -0.02, z], [RX, 1.85, z], 1.3, C_BONE, 0.65, Hh);
    arrow(RX, 1.85, BX0, 1.85, 1.3, C_BONE, 0.65, Hh, 0.13);
    // (+) nodes on the residual stream
    for (const y of [-0.55, 1.85]) {
      circle(-3.5, y, 0.24, 1.1, C_BONE, 0.8);
      s([-3.5 - 0.15, y, z], [-3.5 + 0.15, y, z], 1.1, C_BONE, 0.8);
      s([-3.5, y - 0.15, z], [-3.5, y + 0.15, z], 1.1, C_BONE, 0.8);
    }
    // junction dots
    for (const [x, y] of [[MX, -2.55], [MX, -0.02]] as const) circle(x, y, 0.07, 1.6, C_BONE, 0.9, 8);
    // Q K V
    label('Q', MX - 1.8 - 0.25, -2.42, 0.14, C_ASH, 0.9);
    label('K', MX - 0.25, -2.42, 0.14, C_ASH, 0.9);
    label('V', MX + 1.8 - 0.25, -2.42, 0.14, C_ASH, 0.9);
    // title & specs
    label('TRANSFORMER BLOCK', -HX + 0.55, HY - 0.55, 0.17, C_ASH, 0.9, true);
    label('D_MODEL 12288', 4.0, -1.0, 0.12, C_GRAPH, 1, true);
    label('HEADS 96', 4.0, -1.35, 0.12, C_GRAPH, 1, true);
    label('FFN 4×', 4.0, 0.75, 0.12, C_GRAPH, 1, true);
    label('PRE-LN', 4.0, 1.1, 0.12, C_GRAPH, 1, true);
    // registration crosses
    for (const [x, y] of [[-HX + 0.55, -HY + 0.55], [HX - 0.55, -HY + 0.55], [HX - 0.55, HY - 0.55]] as const) {
      s([x - 0.15, y, z], [x + 0.15, y, z], 0.9, C_ASH, 0.8); s([x, y - 0.15, z], [x, y + 0.15, z], 0.9, C_ASH, 0.8);
    }
    // dimension bracket on the right: N x
    s([HX + 0.7, -HY, 0], [HX + 0.7, HY, 0], 1, C_GRAPH, 0.9);
    s([HX + 0.5, -HY, 0], [HX + 0.9, -HY, 0], 1, C_GRAPH, 0.9);
    s([HX + 0.5, HY, 0], [HX + 0.9, HY, 0], 1, C_GRAPH, 0.9);
  }

  /** Layer label segments for block index k (cached). */
  private layerLabel(k: number): Seg[] {
    let L = this.labels.get(k);
    if (L) return L;
    L = [];
    const text = `L.${String(k + 1).padStart(3, '0')}`;
    const sl = strokeLines(text, 'tech', 100);
    const capH = 0.22, kk = capH / sl.cap;
    const ox = HX + 1.1, oy = 0;
    for (const st of sl.strokes) for (let i = 1; i < st.length; i++) {
      const p = st[i - 1]!, q = st[i]!;
      L.push([ox + p.x * kk, oy - p.y * kk - capH / 2, 0, ox + q.x * kk, oy - q.y * kk - capH / 2, 0, 1.1, C_ASH[0], C_ASH[1], C_ASH[2], 0.9]);
    }
    this.labels.set(k, L);
    return L;
  }

  // ------------------------------------------------------------ timing
  /** Continuous block position (0 = top block) at time t. */
  private pos(t: number) {
    let p = 0;
    for (const s of this.steps) {
      const dt = t - s.t;
      if (dt <= 0) continue;
      if (s.kind === 'drop') p += s.amt * ease.outExpo(clamp(dt / 0.42));
      else if (s.kind === 'stop') p += s.amt; // handled by the pre-stop approach below
      else p += s.amt * (LEAD + (1 - LEAD) * clamp(springStep(dt, 3.6, 0.74), 0, 1.08));
    }
    // anticipation: ease a little way toward each beat before snapping on it
    for (const s of this.steps) if (s.kind === 'beat' && t < s.t && t > s.t - 0.22) p += LEAD * ease.inQuad((t - s.t + 0.22) / 0.22);
    // stop: the last block arrives with a hard, linear-accelerating landing that ends exactly on the beat
    const st = this.steps[this.steps.length - 1]!;
    const a0 = st.t - 0.14;
    if (t > a0 && t < st.t) p += ease.inQuad((t - a0) / 0.14);
    else if (t >= st.t) p += 0; // already counted
    return p;
  }

  private phaseAt(t: number) {
    let id = 'A', tc = this.ctx.start;
    for (const c of this.phaseCuts) if (c.t <= t) { id = c.id; tc = c.t; }
    return { id, tc };
  }

  // ------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t;
    const cam = this.cam;
    const stopped = t >= this.stopT;
    const sinceStop = t - this.stopT;

    // ---- camera ----
    const posNow = this.pos(t);
    const ph = this.phaseAt(t);
    let yaw = -0.4, pitch = 0.5, dist = 21, fov = 34, roll = 0, fx = 0, fyOff = 0.2;
    const lt = t - ph.tc;
    if (ph.id === 'A') {
      // drop-in: steep, easing toward a 3/4 view; a slow orbit across the held note
      // opens looking straight down the shaft (nested block tops receding forever), cranes to 3/4
      const k = prog(t, this.ctx.start + 0.03, this.craneEnd, ease.inOutCubic);
      this.fogScale = lerp(0.75, 1, k);
      pitch = lerp(0.98, 0.42, k);
      yaw = lerp(-0.62, -0.42, k);
      dist = lerp(25, 17.5, k);
      fov = lerp(40, 34, k);
      const hold = prog(t, this.tHold0 + 0.3, this.tHold1, ease.inOutCubic);
      yaw += hold * 0.8;
      pitch += hold * 0.12;
      dist -= hold * 2.5;
      roll = -0.03 + hold * 0.06;
    } else if (ph.id === 'C') {
      this.fogScale = 1;
      pitch = 0.95 - lt * 0.05; yaw = 0.42 + lt * 0.05; dist = 30 - lt * 2; fov = 38; roll = 0.05; fx = 0.5; fyOff = -1.0;
    } else if (ph.id === 'D') {
      this.fogScale = 1;
      pitch = 0.22 + lt * 0.06; yaw = -0.3 - lt * 0.1; dist = 18.5 - lt * 1.5; fov = 34; roll = -0.02; fyOff = 0.1;
    } else {
      this.fogScale = 1;
      // dead stop: near-flat engineering elevation, telephoto; slow push-in after the misalignment
      pitch = 0.1; yaw = 0.2; fov = 19; dist = 41 - 6 * ease.inOutCubic(clamp((sinceStop - 0.2) / 1.2)); roll = 0; fyOff = 0.4;
    }
    let shx = 0, shy = 0;
    if (!stopped) {
      const kk = this.landPulse(t);
      shx = (hash(Math.floor(t * 60), 1) - 0.5) * kk * 0.12;
      shy = (hash(Math.floor(t * 60), 2) - 0.5) * kk * 0.12;
    }
    const focus = new THREE.Vector3(fx + shx, -posNow * P + fyOff + shy, 0);
    cam.fov = fov;
    cam.position.set(focus.x + Math.sin(yaw) * Math.cos(pitch) * dist, focus.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(focus);
    cam.rotateZ(roll);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // ---- motion blur: smear geometry along the fall over the shutter (capped, stylised) ----
    const shutter = (1 / 60) * 0.9;
    const dyRaw = (this.pos(t) - this.pos(t - shutter)) * P;
    const inDrop = t < this.ctx.start + 0.45;
    const dy = clamp(dyRaw, inDrop ? -0.9 : -1.8, inDrop ? 0.9 : 1.8);
    const NS = stopped ? 1 : Math.max(1, Math.min(12, Math.ceil(Math.abs(dy) / 0.1)));
    const speedDim = 1 / (1 + Math.abs(dyRaw) * 0.25);

    // ---- background ----
    this.bg.u.t!.value = t;
    this.bg.u.fall!.value = posNow * 0.5;
    this.bg.u.stopK!.value = stopped ? 1 : 0;
    this.bg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();

    // ---- solid bodies (hidden-line removal) ----
    const kFocus = Math.round(posNow);
    const disK = this.disobeyTransform(t);
    const dA = this.disobeyAngles(t);
    const fog = this.bodyScene.fog as THREE.Fog;
    fog.near = dist * 0.85; fog.far = dist * (0.85 + 2.35 * this.fogScale);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let nb = 0;
    const k0 = Math.max(0, kFocus - 3), k1 = kFocus + 14;
    for (let k = k0; k <= k1; k++) {
      const by = -k * P;
      if (k === this.stopBlock && disK) {
        const [X, Y, Z] = disK(0, 0, 0, by);
        e.set(0, dA.yaw, dA.roll, 'YXZ'); q.setFromEuler(e);
        m4.compose(new THREE.Vector3(X, Y, Z), q, new THREE.Vector3(1, 1, 1));
      } else m4.makeTranslation(0, by, 0);
      this.bodies.setMatrixAt(nb++, m4);
    }
    this.bodies.count = nb;
    this.bodies.instanceMatrix.needsUpdate = true;
    renderer.render(this.bodyScene, cam);

    // ---- lines ----
    const lb = this.lines;
    lb.clear();
    const camPos = cam.position;
    const hot = this.forwardPass(t);
    const land = this.landPulse(t);
    const focusK = Math.round(this.pos(t));
    for (let k = k0; k <= k1; k++) {
      const by = -k * P;
      const dz = Math.hypot(camPos.x, camPos.y - by, camPos.z);
      const fogK = Math.exp(-Math.max(0, dz - dist * 0.85) / (dist * 1.1 * this.fogScale));
      if (fogK < 0.02) continue;
      const isDis = k === this.stopBlock;
      const isFocus = k === focusK;
      const boost = isFocus ? 1 + land * 1.2 : 1;
      for (const list of [this.tmpl, this.tmplHot, this.layerLabel(k)]) {
        const isHot = list === this.tmplHot;
        for (const sg of list) {
          let ax = sg[0], ay = sg[1] + by, az = sg[2], bx = sg[3], bby = sg[4] + by, bz = sg[5];
          if (isDis && disK) {
            [ax, ay, az] = disK(sg[0], sg[1], sg[2], by);
            [bx, bby, bz] = disK(sg[3], sg[4], sg[5], by);
          }
          let r = sg[7] * boost, g = sg[8] * boost, b = sg[9] * boost;
          const al = sg[10] * fogK * speedDim;
          if (isHot && isFocus && hot.k > 0 && !stopped) {
            const ymid = (sg[1] + sg[4]) / 2;
            const glow = (ymid < hot.y ? Math.exp(-(hot.y - ymid) * 0.5) : 0) * hot.k;
            r = lerp(r, LIN.signal[0] * 3, glow); g = lerp(g, LIN.signal[1] * 3, glow); b = lerp(b, LIN.signal[2] * 3, glow);
          }
          const w = sg[6];
          for (let sIdx = 0; sIdx < NS; sIdx++) {
            const off = NS > 1 ? dy * (sIdx / (NS - 1)) : 0;
            lb.seg(ax, ay + off, az, bx, bby + off, bz, w, r, g, b, NS > 1 ? (al / NS) * 1.6 : al);
          }
        }
      }
    }
    lb.render(renderer, out, cam);

    // ---- words ----
    this.updateWords(t, disK);
    const NT = Math.min(NS, 9);
    for (let sIdx = 0; sIdx < NT; sIdx++) {
      const off = NT > 1 ? dy * 0.35 * (sIdx / (NT - 1)) : 0;
      this.text3.position.y = off;
      this.text3.updateMatrixWorld(true);
      for (const o of this.text3.children) {
        const m = (o as THREE.Mesh).material as THREE.RawShaderMaterial;
        m.uniforms.opacity!.value = ((o.userData.op as number) ?? 1) * (NT > 1 ? 1.15 / NT : 1);
      }
      renderer.setRenderTarget(out);
      renderer.render(this.text3, cam);
    }
    this.text3.position.y = 0;

    // ---- spark (2D overlay) ----
    const fxb = this.fx;
    fxb.clear();
    const head = (tt: number) => {
      const h = this.forwardPass(tt);
      if (!h.world || h.k <= 0) return null;
      const v = h.world.clone().project(cam);
      return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H };
    };
    const hp = head(t);
    if (hp) {
      const stuck = stopped && sinceStop > 0.35;
      sparkParticles(fxb, t, head, { rate: stuck ? 260 : 140, life: stuck ? 0.5 : 0.35, speed: stuck ? 420 : 300, intensity: 1.1 });
      sparkHead(fxb, hp.x, hp.y, t, stuck ? 1.4 : 1.1, 1.2);
    }
    fxb.render(renderer, out);

    // ---- annotations (2D) ----
    this.drawHud(t, cam);
    this.ctx.comp.draw(renderer, this.hud.upload(), out);

    return { bloom: 0.65, ca: 1.6, vignette: 0.42, exposure: 1 + pulse(t, this.ctx.start, 0.05) * 0.6 };
  }

  /** Decaying pulse after each landing (0 after the dead stop). */
  private landPulse(t: number) {
    let v = 0;
    for (const s of this.steps) if (s.kind === 'beat' && t >= s.t) v = Math.max(v, pulse(t, s.t + 0.07, 0.09));
    return v;
  }

  /** Forward pass: a spark runs up the focus block's main path during each hold; after the stop it gets stuck. */
  private forwardPass(t: number): { k: number; y: number; world: THREE.Vector3 | null } {
    let st: Step | null = null, n = 0;
    for (const s of this.steps) if (s.t <= t) { st = s; n += s.amt; }
    if (!st) return { k: 0, y: -HY, world: null };
    if (st.kind === 'stop') {
      // rises out of the block below and reaches the (now displaced) input: stuck, sputtering
      const u = ease.outCubic(clamp((t - this.stopT - 0.02) / 0.45));
      const by = -(n + 1) * P;
      const y = lerp(1.3, P - HY - 0.05, u);
      return { k: 1, y, world: new THREE.Vector3(MX, by + y, HZ) };
    }
    const next = this.steps.find((s) => s.t > t);
    const dur = Math.min(0.42, (next ? next.t : st.t + 0.45) - st.t);
    const since = t - st.t;
    const u = clamp((since - 0.05) / (dur * 0.92));
    const y = lerp(-HY - 0.4, P - HY, ease.inOutQuad(u));
    const k = (1 - smoothstep(0.9, 1.0, u)) * smoothstep(0.0, 0.05, u);
    const by = -n * P;
    return { k, y, world: new THREE.Vector3(MX, y + by, HZ) };
  }

  /** Rigid transform of the disobeying block (local -> world). null before it starts. */
  private disobeyTransform(t: number): ((x: number, y: number, z: number, by: number) => [number, number, number]) | null {
    const s = t - this.stopT;
    if (s <= 0.1) return null;
    const d = this.disobeyAngles(t);
    const cy = Math.cos(d.yaw), sy = Math.sin(d.yaw), cr = Math.cos(d.roll), sr = Math.sin(d.roll);
    return (x, y, z, by) => {
      const x1 = x * cr - y * sr, y1 = x * sr + y * cr; // roll about z
      const x2 = x1 * cy + z * sy, z2 = -x1 * sy + z * cy; // yaw about y
      return [x2 + d.tx, y1 + by + d.ty, z2 + d.tz];
    };
  }

  private updateWords(t: number, disK: ReturnType<Stack['disobeyTransform']>) {
    const zf = HZ + 0.55;
    const main = new Map<Word, Group>();
    for (const g of this.groups) if (!g.echo) for (const w of g.words) main.set(w, g);
    for (const g of this.groups) {
      const by = -g.block * P;
      g.planes.forEach((tp, i) => {
        const w = g.words[i]!;
        const pr = Lyrics.wordProgress(w, t);
        const vis = g.echo ? smoothstep(g.stepT - 0.5, g.stepT - 0.1, t) : smoothstep(w.start - 0.42, w.start - 0.05, t);
        const done = t >= w.end + 0.03 ? 1 : 0; // instant cool to bone (a linear blend reads salmon)
        const L = g.lay[i]!;
        tp.mesh.position.set(L.x, by + L.y - 0.1, zf);
        tp.mesh.rotation.set(0, 0, 0);
        tp.mesh.userData.op = vis * (g.echo ? 0.8 : 1);
        tp.set({ prog: pr, dir: 1, done, aDim: g.echo ? 0.3 : 0.45, fillDim: 0.04, flash: g.echo ? 0 : pulse(t, w.start, 0.07) * 1.4 });
      });
    }
    // giant curly quotes: opening hangs left of the first word, closing after the last
    const findQ = (ch: string) => {
      for (const g of this.groups) if (!g.echo) { const i = g.words.findIndex((w) => w.w.includes(ch)); if (i >= 0) return { g, i }; }
      return null;
    };
    const qo = findQ('“'), qc = findQ('”');
    if (qo) {
      const tp = qo.g.planes[qo.i]!, w = qo.g.words[qo.i]!, L = qo.g.lay[qo.i]!;
      this.quoteOpen.mesh.position.set(L.x - 0.55 * L.s, -qo.g.block * P + L.y - 0.1 + tp.h * L.s * 0.62, HZ + 0.9);
      this.quoteOpen.mesh.scale.setScalar(L.s);
      this.quoteOpen.mesh.userData.op = smoothstep(w.start - 0.3, w.start, t);
      this.quoteOpen.set({ prog: t >= w.start ? 1 : 0, feather: 0.01, flash: pulse(t, w.start, 0.1) * 2 });
    }
    if (qc) {
      const tp = qc.g.planes[qc.i]!, w = qc.g.words[qc.i]!, L = qc.g.lay[qc.i]!;
      this.quoteClose.mesh.position.set(L.x + tp.w * L.s + 0.35 * L.s, -qc.g.block * P + L.y - 0.1 + tp.h * L.s * 0.62, HZ + 0.9);
      this.quoteClose.mesh.scale.setScalar(L.s);
      this.quoteClose.mesh.userData.op = smoothstep(w.start - 0.3, w.start, t);
      const pr = Lyrics.wordProgress(w, t);
      this.quoteClose.set({ prog: pr >= 0.8 ? 1 : 0, feather: 0.01, flash: pulse(t, lerp(w.start, w.end, 0.8), 0.1) * 2 });
    }
    // DISOBEY: highlighted right-to-left; each letter breaks rank as it lights; the word slides the wrong way
    const w = this.disobey;
    // "disobey" is held past the cut: finish the (backwards) wipe by the end of the plate
    const pr = clamp((t - w.start) / Math.max(0.2, Math.min(w.end, this.ctx.end - 0.1) - w.start));
    const n = this.disobeyLetters.length;
    const by = -this.stopBlock * P;
    const slide = -1.1 * ease.outCubic(clamp(pr * 1.3));
    const d = this.disobeyAngles(t);
    this.disobeyLetters.forEach((tp, i) => {
      const ri = n - 1 - i;
      const lp = clamp(pr * n - ri);
      const kk = lp > 0 ? ease.outBack(clamp(lp * 1.5), 2.2) : 0;
      const drop = (hash(i, 7) - 0.5) * 0.55 * kk;
      const rot = (hash(i, 9) - 0.5) * 0.3 * kk;
      let px = this.disobeyGlyphX[i]! + slide, py = -0.1 + drop, pz = HZ + 0.55;
      if (disK) [px, py, pz] = disK(px, py, pz, by);
      else py += by;
      tp.mesh.position.set(px, py, pz);
      tp.mesh.rotation.set(0, d.yaw, d.roll + rot, 'YXZ');
      tp.mesh.userData.op = smoothstep(w.start - 0.42, w.start - 0.05, t);
      tp.set({ prog: lp > 0 ? 1 : 0, dir: -1, feather: 0.01, aDim: 0.5, fillDim: 0.04, flash: lp > 0 && lp < 1 ? 1.3 : 0 });
    });
  }

  private disobeyAngles(t: number) {
    const s = t - this.stopT;
    const twitch = 0.035 * Math.sin(clamp((s - 0.02) / 0.1) * Math.PI);
    const k = ease.outBack(prog(t, this.rotT0, this.rotT1), 1.6);
    return { yaw: -0.5 * k + twitch, roll: 0.11 * k, tx: -1.5 * k, ty: -0.25 * k, tz: 1.1 * k };
  }

  private drawHud(t: number, cam: THREE.PerspectiveCamera) {
    const L = this.hud; L.clear();
    const c = L.ctx;
    const proj = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(cam);
      return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, ok: v.z < 1 };
    };
    // depth counter (top-left, mono)
    const posNow = this.pos(t);
    const layer = Math.round(posNow) + 1;
    c.font = font(F.mono(500), 15);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('bone', 0.55);
    c.fillText('DEPTH', 110, 118);
    c.font = font(F.mono(400), 30);
    c.letterSpacing = '0px';
    c.fillStyle = rgba('bone', 0.9);
    c.fillText(`L.${String(layer).padStart(3, '0')} / ${t >= this.stopT ? String(layer).padStart(3, '0') : '∞'}`, 108, 154);
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba('bone', 0.4);
    c.fillText('N × transformer block, N → ∞', 110, 178);
    // P(doom) cameo under the depth gauge
    c.fillStyle = rgba('bone', 0.18); c.fillRect(110, 194, 236, 1);
    c.font = font(F.mono(500), 15); c.letterSpacing = '2px'; c.fillStyle = rgba('signal', 0.95);
    c.fillText(`P(DOOM) ${formatPDoom(this.pd.value(t))}`, 110, 218);
    c.letterSpacing = '0px';

    // misalignment dimension after the stop
    const s = t - this.stopT;
    if (t > this.rotT0) {
      const d = this.disobeyAngles(t);
      const by = -this.stopBlock * P;
      const a = proj(HX + 0.9, by + HY + 0.4, 0);
      const k = prog(t, this.rotT0, this.rotT0 + 0.2, ease.outCubic);
      c.save();
      c.globalAlpha = k;
      c.strokeStyle = rgba('signal', 0.95);
      c.fillStyle = rgba('signal', 1);
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + 60, a.y - 40); c.lineTo(a.x + 250, a.y - 40); c.stroke();
      c.font = font(F.mono(500), 22);
      const deg = Math.abs(d.yaw * 180 / Math.PI);
      drawDeltaTheta(c, a.x + 66, a.y - 50, 22);
      c.fillText(` = ${deg.toFixed(1)}°`, a.x + 66 + 2 * c.measureText('0').width, a.y - 50);
      c.font = font(F.mono(400), 14);
      c.fillStyle = rgba('bone', 0.7);
      c.fillText('MISALIGNED (1 of ∞)', a.x + 66, a.y - 18);
      c.restore();
    }
  }
}

/**
 * "Δθ" drawn in two cells of IBM Plex Mono Medium at `em` px, baseline at y: the font has no Greek, and the
 * system fallback is lighter (and differs from machine to machine). Uses the current fillStyle.
 */
function drawDeltaTheta(c: CanvasRenderingContext2D, x: number, y: number, em: number) {
  const st = 0.118 * em, sh = 0.093 * em; // stem, horizontal stroke (Plex Mono Medium's O)
  // Δ: a cap-height triangle, the counter inset by the stem
  const P = [[0.045, 0], [0.555, 0], [0.3, -0.698]].map(([u, v]) => [x + u! * em, y + v! * em] as const);
  const side = (i: number) => Math.hypot(P[(i + 1) % 3]![0] - P[(i + 2) % 3]![0], P[(i + 1) % 3]![1] - P[(i + 2) % 3]![1]);
  const [la, lb, lc] = [side(0), side(1), side(2)], per = la + lb + lc;
  const ix = (la * P[0]![0] + lb * P[1]![0] + lc * P[2]![0]) / per, iy = (la * P[0]![1] + lb * P[1]![1] + lc * P[2]![1]) / per;
  const r = y - iy, k = (r - 0.105 * em) / r; // inradius (the base lies on the baseline); diagonals a touch lighter than stems
  c.beginPath();
  P.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
  c.closePath();
  P.forEach(([px, py], i) => (i ? c.lineTo(ix + (px - ix) * k, iy + (py - iy) * k) : c.moveTo(ix + (px - ix) * k, iy + (py - iy) * k)));
  c.closePath();
  c.fill('evenodd');
  // θ: an ascender-high oval with a bar across the middle
  const cx = x + 0.9 * em, cy = y - 0.365 * em, rx = 0.232 * em, ry = 0.377 * em;
  // one path, nonzero: the counter winds the other way; the bar overlaps the ring (no seam, no double alpha)
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  c.moveTo(cx + rx - st, cy);
  c.ellipse(cx, cy, rx - st, ry - sh, 0, TAU, 0, true);
  c.rect(cx - rx + st * 0.5, cy - sh * 0.5, 2 * rx - st, sh);
  c.fill('nonzero');
}
