// DNA edition, `bureau` slot (docs/DNA_VIDEO_PLAN.md) — the film's driest joke, on bone paper.
// One long printed sheet under a camera that moves on the beat (sheet px = screen px at the cut, so the
// form the ascent's last frame became is exactly where it lands):
//  "That was safe enough, we reckoned": a beautiful containment-review form; on "safe" it is stamped
//      BSL-1 · APPROVED, and the approved form keeps extruding copies past its own margin (photocopies:
//      the copied stamp comes out grey) while the camera pulls back.
//  "Forward MLP, backward, repeat": Annex B, a three-step PCR wheel advances one step per word —
//      separate, anneal, extend, then again; the hub's product tally doubles per completed cycle.
//      An editorial analogy for the words, not backpropagation; temperatures marked typical.
//  "Now von Neumann's obsolete": Appendix C, a dividing cell; on "Neumann's" an abstract self-reproducing
//      constructor (tape + constructor, after von Neumann) prints in beside it and starts building its
//      copy; on "obsolete" the stamp DIFFERENT MACHINERY. SAME QUESTION. Then the appendix's bottom rule
//      takes base-position ticks and becomes a sequence baseline (next slot: the frameshift strip).
// Everything is a pure function of song time.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, SCALE } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F } from '../engine/type';
import { type Word } from '../engine/lyrics';
import { lerp, ease, prog, keys, pulse, hash, type Key } from '../engine/util';
import { karaokeRow, findWord, rubberStamp, monoLabel } from './dna-kit';
import { makePaperPass, drawForm, drawFormCached, tonerDust, FORM, STAMP1, ROW1, ROW2 } from './dna-bureau-form';
import { drawWheel, drawConstructor, drawDividingCell, drawRule, WHEEL, APPX } from './dna-bureau-figs';

interface Row { ws: Word[]; x: number; y: number; fam: string; size: number; align?: 'left' | 'right'; out: [number, number]; lead?: number }
const STAMP_A = 'BSL-1 · APPROVED';
const STAMP_B = 'DIFFERENT MACHINERY. SAME QUESTION.';
const RULE_Y = APPX.y + 760; // sheet px: Appendix C's bottom rule
const CELL = { x: 1470, y: APPX.y + 375 };
const STAMP2 = { x: 960, y: APPX.y + 668 };

export default class DnaBureau extends Scene {
  bg = makePaperPass();
  L = new Layer2D();
  copy!: HTMLCanvasElement;
  rows: Row[] = [];
  kx: Key[] = []; ky: Key[] = []; kz: Key[] = [];
  tSafe = 0; tNeu = 0; tObs = 0;
  emit: number[] = [];
  steps: number[] = [];
  tTally: [number, number][] = [];
  tBuild: number[] = [];
  tRule0 = 0; tRule1 = 0;

  override init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    const b0 = Math.round(au.beatAt(this.ctx.start));
    const B = (k: number) => au.timeOfBeat(b0 + k); // B(0) = 69.780
    const l1 = ly.get('safe enough'), l2 = ly.get('Forward MLP'), l3 = ly.get('Neumann');
    this.tSafe = findWord(l1, 'safe').start;
    this.tNeu = findWord(l3, 'Neumann’s').start;
    this.tObs = findWord(l3, 'obsolete').start;

    // the approved form's copies: one per beat, then eighths, then sixteenths
    for (let k = 2; k <= 5; k++) this.emit.push(B(k));
    for (let k = 5.5; k <= 8; k += 0.5) this.emit.push(B(k));
    for (let k = 8.25; k <= 10.5; k += 0.25) this.emit.push(B(k));

    // PCR wheel: one step per word, then "repeat" runs the cycle again on the eighths
    const wF = l2.words[0]!, wM = l2.words[1]!, wB = l2.words[2]!, wR = l2.words[3]!;
    const e8 = (B(1) - B(0)) / 2;
    this.steps = [wF.start, wM.start, wB.start, wR.start, wR.start + e8, wR.start + 2 * e8];
    this.tTally = [[this.steps[3]! - 0.2, 2], [this.steps[5]! + 0.12, 4]];

    // constructor: prints in on "Neumann's", then builds its copy on the eighths
    const n0 = Math.ceil(au.beatAt(this.tNeu) * 2);
    for (let k = 1; k <= 9; k++) this.tBuild.push(au.timeOfBeat((n0 + k) / 2));
    this.tRule0 = B(24) + 0.05; this.tRule1 = this.ctx.end - 0.08;

    // camera (sheet px at the screen centre, zoom)
    const io = ease.inOutCubic, oc = ease.outCubic;
    const tA = B(3), tA1 = B(6.5), tB0 = B(8), tBm = B(8.7), tB1 = wF.start, tC0 = B(17) - 0.02, tC1 = l3.words[0]!.start + 0.08;
    this.kx = [[this.ctx.start, 960], [tA, 960], [tA1, 1600, io], [tB0, 1650, ease.linear], [tBm, 1250, io], [tB1, 960, oc], [tC0, 980, ease.linear], [tC1, 960, io], [this.tRule0, 960], [this.ctx.end - 0.12, 960, io]];
    this.ky = [[this.ctx.start, 540], [tA, 540], [tA1, 700, io], [tB0, 690, ease.linear], [tBm, 1650, io], [tB1, WHEEL.y, oc], [tC0, WHEEL.y - 6, ease.linear], [tC1, APPX.y + 540, io], [this.tRule0, APPX.y + 546, ease.linear], [this.ctx.end - 0.12, RULE_Y - 36, io]];
    this.kz = [[this.ctx.start, 1], [tA, 1.012, ease.linear], [tA1, 0.5, io], [tB0, 0.47, ease.linear], [tBm, 0.42, io], [tB1, 1, oc], [tC0, 1.035, ease.linear], [tC1, 1, io], [this.tRule0, 1.025, ease.linear], [this.ctx.end - 0.12, 1.28, io]];

    // lyric rows: the first two sit on the form's statement rules at the cut
    const Fa = (w: number, wt: number) => F.archivo(w, wt);
    this.rows = [
      { ws: l1.words.slice(0, 4), x: ROW1.x, y: ROW1.y, fam: Fa(100, 800), size: 76, out: [l1.end - 0.02, l1.end + 0.12] },
      { ws: l1.words.slice(4), x: ROW2.x, y: ROW2.y, fam: Fa(112.5, 900), size: 110, out: [l1.end - 0.02, l1.end + 0.12] },
      { ws: [wF], x: 1790, y: 330, fam: Fa(100, 800), size: 104, align: 'right', out: [l2.end + 0.02, l2.end + 0.2] },
      { ws: [wM], x: 1790, y: 468, fam: Fa(100, 800), size: 104, align: 'right', out: [l2.end + 0.02, l2.end + 0.2] },
      { ws: [wB], x: 1790, y: 606, fam: Fa(100, 800), size: 104, align: 'right', out: [l2.end + 0.02, l2.end + 0.2] },
      { ws: [wR], x: 1790, y: 756, fam: Fa(112.5, 900), size: 126, align: 'right', out: [l2.end + 0.02, l2.end + 0.2] },
      { ws: l3.words.slice(0, 3), x: 130, y: 862, fam: Fa(100, 800), size: 84, out: [1e9, 1e9], lead: 0.22 },
      { ws: l3.words.slice(3), x: 130, y: 975, fam: Fa(125, 900), size: 130, out: [1e9, 1e9] },
    ];

    // the copy: the form as printed by a copier (flat paper, the stamp reproduced in grey)
    const k = 0.5;
    const cv = document.createElement('canvas');
    cv.width = Math.round(FORM.w * k * SCALE); cv.height = Math.round(FORM.h * k * SCALE);
    const g = cv.getContext('2d')!;
    g.scale(k * SCALE, k * SCALE); g.translate(-FORM.x, -FORM.y);
    g.fillStyle = '#ECE7DD'; g.fillRect(FORM.x, FORM.y, FORM.w, FORM.h);
    drawForm(g, 0.82);
    rubberStamp(g, STAMP_A, STAMP1.x, STAMP1.y, 1e9, { t0: 0, size: 34, rot: -0.08, seed: 3, color: 'graphite', alpha: 0.8 });
    tonerDust(g, 5, 1);
    this.copy = cv;
  }

  private cam(t: number) {
    const z = keys(t, this.kz), cx = keys(t, this.kx), cy = keys(t, this.ky);
    return { z, ox: W / 2 - cx * z, oy: H / 2 - cy * z };
  }
  private stepAt(t: number) {
    let j = -1;
    for (let i = 0; i < this.steps.length; i++) if (t >= this.steps[i]! - 0.02) j = i;
    return j;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const C = this.cam(t);
    this.bg.u.uPaper!.value = 1;
    this.bg.u.uRectOn!.value = 0;
    (this.bg.u.uMap!.value as THREE.Vector3).set(C.ox, C.oy, C.z);
    this.bg.render(renderer, out);

    const c = this.L.ctx;
    this.L.clear();
    c.save();
    c.setTransform(C.z, 0, 0, C.z, C.ox, C.oy);
    // visible sheet region (for culling)
    const vx0 = -C.ox / C.z, vy0 = -C.oy / C.z, vx1 = (W - C.ox) / C.z, vy1 = (H - C.oy) / C.z;
    const vis = (y0: number, y1: number) => y1 > vy0 - 40 && y0 < vy1 + 40;

    // ---- A: the form, its stamp and its copies
    if (vis(FORM.y - 800, FORM.y + FORM.h + 500)) {
      this.drawCopies(c, t, vx1);
      drawFormCached(c);
      rubberStamp(c, STAMP_A, STAMP1.x, STAMP1.y, t, { t0: this.tSafe, size: 34, rot: -0.08, seed: 3 });
    }
    // section rules between the annexes
    c.strokeStyle = rgba('ink', 0.55); c.lineWidth = 1 / Math.max(0.5, C.z) + 0.2;
    for (const y of [2140, APPX.y + 70]) { c.beginPath(); c.moveTo(vx0 - 50, y); c.lineTo(vx1 + 50, y); c.stroke(); }

    // ---- B: the PCR wheel
    if (vis(WHEEL.y - 420, WHEEL.y + 420)) this.drawAnnexB(c, t);

    // ---- C: the cell, the constructor, the stamp, the rule
    if (vis(APPX.y, RULE_Y + 60)) this.drawAppendixC(c, t, vx0, vx1);
    c.restore();

    // ---- lyrics (screen space, ink on paper)
    for (const r of this.rows) {
      const a = 1 - prog(t, r.out[0], r.out[1]);
      if (a > 0.001) karaokeRow(c, r.ws, r.x, r.y, r.fam, r.size, t, a, { align: r.align ?? 'left', on: 'ink', lead: r.lead });
    }
    comp.draw(renderer, this.L.upload(), out);

    const punch = pulse(t, this.tSafe, 0.08) + pulse(t, this.tObs, 0.08) + 0.35 * this.steps.reduce((s, x) => s + pulse(t, x, 0.06), 0);
    return { paper: 1, bloom: 0.18, bloomThreshold: 1.4, vignette: 0.25, grain: 0.05, ca: 0.35, zoom: 1 + 0.012 * punch };
  }

  // ------------------------------------------------------------------ A
  private drawCopies(c: CanvasRenderingContext2D, t: number, vx1: number) {
    let N = 0;
    for (let i = 0; i < this.emit.length; i++) {
      const e = this.emit[i]!, gap = (this.emit[i + 1] ?? e + 0.45) - e;
      N += prog(t, e, e + Math.min(0.2, gap * 0.8), ease.outCubic);
    }
    if (N <= 0) return;
    c.save();
    // copies slide out from under the form: nothing of them shows through it
    c.beginPath(); c.rect(-4000, -4000, 12000, 12000); c.rect(FORM.x, FORM.y, FORM.w, FORM.h); c.clip('evenodd');
    const nMax = Math.ceil(N);
    for (let j = 1; j <= nMax; j++) {
      const n = N - j + 1; // position along the stream (1 = one step out)
      const x = FORM.x + 176 * n, y = FORM.y - 30 * n - 1.4 * n * n;
      if (x > vx1 + 60) continue;
      const rot = 0.01 * n + (hash(j, 7) - 0.5) * 0.05;
      c.save();
      c.translate(x + FORM.w / 2, y + FORM.h / 2); c.rotate(rot);
      c.fillStyle = rgba('ink', 0.06); c.fillRect(-FORM.w / 2 + 6, -FORM.h / 2 + 9, FORM.w, FORM.h);
      c.fillStyle = rgba('ink', 0.05); c.fillRect(-FORM.w / 2 + 2, -FORM.h / 2 + 3, FORM.w, FORM.h);
      c.drawImage(this.copy, -FORM.w / 2, -FORM.h / 2, FORM.w, FORM.h);
      c.restore();
    }
    c.restore();
  }

  // ------------------------------------------------------------------ B
  private drawAnnexB(c: CanvasRenderingContext2D, t: number) {
    const S = this.steps;
    const j = this.stepAt(t);
    const act = j < 0 ? -1 : j % 3;
    const next = S[j + 1] ?? S[j]! + 0.7;
    const p = j < 0 ? 0 : prog(t, S[j]!, Math.min(next, S[j]! + 0.62), ease.inOutQuad);
    // the index turns clockwise one sector per step (the first step comes from the top)
    let ang = -Math.PI / 2;
    S.forEach((s, i) => { ang += (i === 0 ? Math.PI / 3 : (2 * Math.PI) / 3) * prog(t, s - 0.05, s + 0.12, (x) => ease.outBack(x, 1.6)); });
    let n = 1;
    for (const [tt, v] of this.tTally) n = Math.max(n, lerp(n, v, prog(t, tt, tt + 0.22, ease.outCubic)));
    drawWheel(c, { ang, act, p, n, al: 1 });
    // the one explanatory label
    const la = Math.min(prog(t, S[0]! + 0.25, S[0]! + 0.55), 1 - prog(t, S[5]! + 0.1, S[5]! + 0.4));
    {
      const aa = (235 * Math.PI) / 180, ax = WHEEL.x + Math.cos(aa) * (WHEEL.r + 8), ay = WHEEL.y + Math.sin(aa) * (WHEEL.r + 8);
      monoLabel(c, 'PCR cycle · schematic · temperatures typical, protocol-dependent', 150, WHEEL.y - 392, ax, ay, la, 'graphite');
    }
  }

  // ------------------------------------------------------------------ C
  private drawAppendixC(c: CanvasRenderingContext2D, t: number, vx0: number, vx1: number) {
    c.save();
    c.translate(APPX.x, APPX.y);
    drawDividingCell(c, CELL.x - APPX.x, CELL.y - APPX.y, 1);
    // the constructor prints in on "Neumann's", left to right, then builds its offspring on the eighths
    const pr = prog(t, this.tNeu - 0.02, this.tNeu + 0.32, ease.outQuad);
    if (pr > 0) {
      let b = 0;
      for (const tb of this.tBuild) b += (0.94 / this.tBuild.length) * prog(t, tb - 0.06, tb + 0.1, ease.outCubic);
      c.save();
      c.beginPath(); c.rect(60, 140, 1040 * pr, 440); c.clip();
      drawConstructor(c, b, 1);
      c.restore();
      if (pr < 1) {
        c.strokeStyle = rgba('ink', 0.3); c.lineWidth = 1;
        c.beginPath(); c.moveTo(60 + 1040 * pr, 150); c.lineTo(60 + 1040 * pr, 560); c.stroke();
      }
    }
    c.restore();
    // one label while the constructor is new; it gives way to the stamp
    const la = Math.min(prog(t, this.tNeu + 0.2, this.tNeu + 0.45), 1 - prog(t, this.tObs - 0.3, this.tObs - 0.05));
    monoLabel(c, 'self-reproducing automaton · schematic, after von Neumann', 648, APPX.y + 600, 566, APPX.y + 538, la, 'graphite');
    rubberStamp(c, STAMP_B, STAMP2.x, STAMP2.y, t, { t0: this.tObs, size: 28, rot: -0.04, seed: 9 });
    // the bottom rule; at the end it takes base-position ticks (every third taller) and becomes a baseline
    const tk = prog(t, this.tRule0, this.tRule1, ease.inOutQuad);
    drawRule(c, RULE_Y, vx0 - 50, vx1 + 50, tk, 176, 1776, 1);
  }
}
