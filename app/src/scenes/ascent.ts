// FIG. 6 — "Ascent (log scale)". Chorus 2 after the hook, four quick movements:
//  A. "I hear the basilisk boom": an engraved serpent eye snaps open (shockwave, shake).
//  B. "NVDA to the moon": the slit pupil match-cuts to a candle; the price (the spark) goes
//     vertical, the camera tilts up to an engraved moon in banknote guilloché.
//  C. "The Omega Point's coming soon": every line converges into one white-hot point.
//  D. "One E thirty flops a second": a 31-drum mechanical odometer rolls to 10^30.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, makeRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, glyphX, layout, textPath2D } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, hash, keys, lerp, mulberry32, prog, pulse, TAU, frameIdx } from '../engine/util';
import { makeEyePass, EYE } from './ascent-eye';
import { makeNotePass, makeCompPass, makeCandles, DEC, MOON, NOTE, type Candle } from './ascent-note';
import { sparkHead, sparkParticles } from './_motifs';
import { makeOdoPass, makeDigitAtlas, drumX, ODO } from './ascent-odo';
import { PDoom, formatPDoom } from '../engine/hud';

type Mv = 'A' | 'B' | 'C' | 'D';

function wordOf(l: Line, s: string): Word {
  const q = norm(s);
  return l.words.find((w) => norm(w.w).includes(q)) ?? l.words[0]!;
}

export default class Ascent extends Scene {
  eye = makeEyePass();
  note = makeNotePass();
  comp2 = makeCompPass();
  rtB = makeRT();
  ink = new LineBatch(24000, { blend: 'normal' });
  glow = new LineBatch(8000);
  L1 = new Layer2D();
  L2 = new Layer2D();
  odo = makeOdoPass(makeDigitAtlas());
  candles: Candle[] = makeCandles();
  nvdaPaths: { p: Path2D; x: number; w: number }[] = [];
  rays: { a: number; r0: number; len: number; sp: number; ph: number; w: number; hot: boolean }[] = [];
  pd!: PDoom;
  T = {
    l1: null as unknown as Line, l2: null as unknown as Line, l3: null as unknown as Line, l4: null as unknown as Line,
    boom: 0, nvda: 0, moon: 0, omega: 0, one: 0, second: 0,
    cutB: 0, cutC: 0, cutD: 0,
  };

  override init() {
    const ly = this.ctx.lyrics;
    this.pd = new PDoom(ly);
    const T = this.T;
    T.l1 = ly.get('basilisk');
    T.l2 = ly.get('to the moon');
    T.l3 = ly.get('Omega');
    T.l4 = ly.get('flops');
    T.boom = wordOf(T.l1, 'boom').start;
    T.nvda = T.l2.words[0]!.start;
    T.moon = wordOf(T.l2, 'moon').start;
    T.omega = T.l3.words[0]!.start;
    T.one = T.l4.words[0]!.start;
    T.second = wordOf(T.l4, 'second').start;
    T.cutB = this.snap(T.nvda);
    // NVDA lettering outlines (banknote-style hatched letters)
    const fam = F.archivo(125, 900), size = 196, track = 10;
    const lay = layout('NVDA', fam, size, track);
    this.nvdaPaths = lay.glyphs.map((g) => ({ p: textPath2D(g.ch, fam, size, 0, 0), x: g.x, w: g.w }));
    const rnd = mulberry32(606);
    for (let i = 0; i < 900; i++) {
      this.rays.push({ a: rnd() * TAU, r0: 150 + rnd() * 1500, len: 60 + rnd() * 420, sp: 0.6 + rnd() * 1.6, ph: rnd(), w: 0.6 + rnd() * 1.4, hot: rnd() < 0.08 });
    }
    T.cutC = T.omega;
    T.cutD = this.snap(T.one);
  }

  /** Nearest beat if close to t (cuts land on the grid), else t itself. */
  snap(t: number, tol = 0.1) {
    const b = this.ctx.audio.nearestBeat(t);
    return Math.abs(b - t) <= tol ? b : t;
  }

  beatPulse(t: number, hl = 0.12) {
    const au = this.ctx.audio;
    const b = Math.floor(au.beatAt(t));
    return pulse(t, au.timeOfBeat(b), hl);
  }

  movement(t: number): Mv {
    const T = this.T;
    if (t < T.cutB) return 'A';
    if (t < T.cutC) return 'B';
    if (t < T.cutD) return 'C';
    return 'D';
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    switch (this.movement(f.t)) {
      case 'A': return this.renderA(f, out);
      case 'B': return this.renderB(f, out);
      case 'C': return this.renderC(f, out);
      default: return this.renderD(f, out);
    }
  }

  // ------------------------------------------------------------------ A: the basilisk eye
  eyeCam(t: number) {
    const T = this.T, s0 = this.ctx.start;
    const tb = T.boom;
    // the camera steps in on each sung word (and leans, alternating), then slams on "boom"
    const ws = T.l1.words.filter((w) => norm(w.w) !== 'boom');
    let zoom = 0.68 * (1 + 0.015 * prog(t, s0, tb));
    const leans = [-0.07, -0.03, -0.055, -0.015, 0.02];
    let rot = leans[0]!;
    ws.forEach((w, i) => {
      const k = ease.outExpo(clamp((t - w.start) / 0.2));
      zoom *= Math.pow(1.075, k);
      rot += k * ((leans[Math.min(i + 1, 4)] ?? 0) - (leans[Math.min(i, 4)] ?? 0));
    });
    rot = lerp(rot, 0, prog(t, tb, T.cutB, ease.inOutCubic));
    zoom += 0.18 * prog(t, tb, tb + 0.35, ease.outExpo);
    zoom *= Math.pow(3.2, prog(t, lerp(tb, T.cutB, 0.35), T.cutB, ease.inCubic));
    const cx = lerp(0.12, 0.0, prog(t, s0, tb + 0.3, ease.inOutCubic));
    const cy = lerp(-0.06, 0.16, prog(t, s0, tb, ease.inOutCubic)) * (1 - prog(t, tb + 0.1, T.cutB, ease.inOutCubic)) + 0.02 * prog(t, tb + 0.1, T.cutB, ease.inOutCubic);
    return { zoom, rot, cx, cy };
  }

  /** Eye space (y up) -> canvas px (y down), matching the shader's camera. */
  eyeToPx(ex: number, ey: number, cam: { zoom: number; rot: number; cx: number; cy: number }) {
    const dx = ex - cam.cx, dy = ey - cam.cy;
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    const px = cam.zoom * (c * dx + s * dy), py = cam.zoom * (-s * dx + c * dy);
    return { x: W / 2 + px * (H / 2), y: H / 2 - py * (H / 2) };
  }

  renderA(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t, tb = T.boom;
    const cam = this.eyeCam(t);
    const u = this.eye.u;
    // before "boom" the lids stir: a hairline crack on each syllable of "basilisk"
    const bw = wordOf(T.l1, 'basilisk');
    const bsyl = bw.syl && bw.syl.length ? bw.syl.map((q) => q[0]) : [0, 1, 2].map((i) => bw.start + (i * (bw.end - bw.start)) / 3.4);
    let stir = 0;
    bsyl.forEach((s, i) => { if (t >= s) stir = Math.max(stir, (0.025 + 0.012 * i) * Math.exp(-(t - s) / 0.1) * prog(t, s, s + 0.03)); });
    const open = t < tb ? stir : prog(t, tb, tb + 0.12, ease.outExpo) * (1 + 0.05 * Math.sin((t - tb) * 34) * Math.exp(-(t - tb) * 10));
    const bp = this.beatPulse(t, 0.1);
    u.uT!.value = t;
    u.uOpen!.value = open;
    u.uZoom!.value = cam.zoom;
    u.uRot!.value = cam.rot;
    (u.uCam!.value as THREE.Vector2).set(cam.cx, cam.cy);
    // pupil: wide on the snap, contracting to a hairline slit that turns white-hot before the cut
    const mid = lerp(tb, T.cutB, 0.5);
    const pup = lerp(0.22, 0.07, prog(t, tb + 0.04, tb + 0.35, ease.outCubic));
    u.uPupil!.value = lerp(pup, 0.004, prog(t, mid, T.cutB - 0.04, ease.inCubic));
    u.uSlitGlow!.value = prog(t, mid, T.cutB, ease.inQuad);
    u.uSlitW!.value = lerp(0.004, 0.0015, prog(t, mid, T.cutB));
    u.uShockR!.value = t < tb ? 0 : EYE.RI + (t - tb) * 3.4;
    u.uShockA!.value = t < tb ? 0 : Math.exp(-(t - tb) / 0.28);
    u.uLeak!.value = t < tb ? 0.45 + 0.9 * bp + 0.5 * prog(t, tb - 0.45, tb, ease.inQuad) : 0;
    // raking light turns in beat steps, so the scales glint on the grid
    const au = this.ctx.audio;
    const bIdx = au.beatAt(t), bi = Math.floor(bIdx);
    const le = ease.outCubic(clamp((bIdx - bi) / 0.35));
    const rock = bi % 2 === 0 ? le : 1 - le;
    u.uLightA!.value = 2.05 + 0.3 * rock + (t > tb ? 0.25 : 0);
    u.uBright!.value = 1.0;
    this.eye.render(renderer, out);

    // ---- lyric: "I HEAR THE BASILISK" set on the eyelid seam, split open by "boom"
    const L = this.L1; L.clear(); const c = L.ctx;
    const line = T.l1;
    const words = line.words.filter((w) => norm(w.w) !== 'boom');
    const fam = F.archivo(125, 700), size = Math.round(54 * Math.min(1, cam.zoom / 0.95)), track = 16;
    const txt = words.map((w) => w.w.toUpperCase()).join(' ');
    const lay = layout(txt, fam, size, track);
    const charWord: number[] = [], charIdx: number[] = [];
    words.forEach((w, wi) => {
      for (let k = 0; k < w.w.length; k++) { charWord.push(wi); charIdx.push(k); }
      if (wi < words.length - 1) { charWord.push(-1); charIdx.push(0); }
    });
    const unitPerPx = 1 / (cam.zoom * (H / 2));
    const x0 = -lay.width / 2 * unitPerPx;
    c.font = font(fam, size);
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.lineJoin = 'round';
    const fadeOut = 1 - prog(t, tb + 0.12, tb + 0.4, ease.inQuad);
    const appear = prog(t, this.ctx.start - 0.05, this.ctx.start + 0.12);
    if (fadeOut > 0) {
      for (const g of lay.glyphs) {
        const wi = charWord[g.i]!;
        if (wi < 0 || g.ch === ' ') continue;
        const w = words[wi]!;
        const lit = clamp(Lyrics.wordProgress(w, t) * w.w.length - charIdx[g.i]!);
        const ex = x0 + (g.x + g.w / 2) * unitPerPx;
        const K = Math.pow(Math.max(0, 1 - (ex * ex) / (EYE.A * EYE.A)), 0.62);
        const up = open * EYE.HU * K, dn = open * EYE.HL * K;
        const pc = this.eyeToPx(ex, EYE.TILT * ex, cam);
        const ang = -Math.atan(EYE.TILT) - cam.rot;
        const col = lit > 0 ? (lit < 1 || (wi === words.length - 1 && t < tb) ? rgba('signal', 1) : rgba('bone', 1)) : rgba('bone', 0.28);
        for (const half of [-1, 1]) {
          const off = (half < 0 ? up : dn) * cam.zoom * (H / 2);
          c.save();
          c.translate(pc.x, pc.y);
          c.rotate(ang);
          c.translate(0, half * off);
          c.beginPath();
          if (half < 0) c.rect(-size, -size, size * 2, size); else c.rect(-size, 0, size * 2, size);
          c.clip();
          c.globalAlpha = fadeOut * appear;
          c.strokeStyle = rgba('ink', 0.9);
          c.lineWidth = 7;
          c.strokeText(g.ch, 0, 2);
          c.fillStyle = col;
          c.fillText(g.ch, 0, 2);
          c.restore();
        }
      }
    }
    // ---- "BOOM": the word rides the shockwave rings, repeated around each ring
    const boomW = wordOf(line, 'boom');
    if (t >= boomW.start) {
      const bf = F.archivo(125, 900);
      const ctr = this.eyeToPx(0, 0, cam);
      for (let i = 0; i < 3; i++) {
        const e = t - boomW.start - i * 0.09;
        if (e < 0) continue;
        const Rpx = (0.68 + 0.07 * prog(e, 0, 0.5, ease.outCubic) + (i === 0 ? 0 : e * 1.2)) * cam.zoom * (H / 2);
        const a = (i === 0 ? 1 - prog(e, 0.35, 0.55) : Math.exp(-e / 0.25) * 0.7) * prog(e, 0, 0.03);
        const sz = 96 * (1 + e * 0.15) * (i === 0 ? 1 + 0.25 * pulse(e, 0, 0.06) : 1);
        this.textOnArc(c, 'BOOM', ctr.x, ctr.y, Rpx, true, bf, sz, i === 0 ? rgba('bone', a) : rgba('signal', a), i === 0);
      }
    }
    comp.draw(renderer, L.upload(), out);

    const sh = t >= tb ? Math.exp(-(t - tb) / 0.12) : 0;
    const shake: [number, number] = [Math.sin(t * 97) * 30 * sh, Math.cos(t * 83) * 22 * sh];
    return {
      bloom: 0.75, shake, flash: 0.2 * pulse(t, tb, 0.05), ca: 1.2 + 7 * sh, zoom: 1 + 0.06 * sh,
      vignette: 0.45,
    };
  }

  /** Text along the top (reading clockwise) or bottom (reading counter-clockwise) arc of a circle, upright. */
  textOnArc(c: CanvasRenderingContext2D, text: string, cx: number, cy: number, R: number, top: boolean, fam: string, size: number, fill: string, solid: boolean) {
    c.save();
    c.font = font(fam, size);
    c.textAlign = 'center';
    c.textBaseline = top ? 'alphabetic' : 'top';
    const lay = layout(text, fam, size, size * 0.08);
    const Rt = top ? R : R;
    const arcLen = lay.width / Rt;
    for (const g of lay.glyphs) {
      const s = (g.x + g.w / 2) / Rt - arcLen / 2;
      const a = top ? -Math.PI / 2 + s : Math.PI / 2 - s;
      c.save();
      c.translate(cx + Math.cos(a) * Rt, cy + Math.sin(a) * Rt);
      c.rotate(top ? a + Math.PI / 2 : a - Math.PI / 2);
      if (solid) { c.fillStyle = fill; c.fillText(g.ch, 0, 0); }
      else { c.strokeStyle = fill; c.lineWidth = 2; c.strokeText(g.ch, 0, 0); }
      c.restore();
    }
    c.restore();
  }

  // ------------------------------------------------------------------ B: the chart becomes a banknote
  tTo() { return wordOf(this.T.l2, 'to').start; }

  /** Syllable onsets of "NVDA" (N, V, D, A). */
  nvSyl(): number[] {
    const nv = this.T.l2.words[0]!;
    return nv.syl && nv.syl.length >= 4 ? nv.syl.map((q) => q[0]) : [0, 1, 2, 3].map((i) => nv.start + (i * (nv.end - nv.start)) / 4);
  }

  /** The price surges in steps, one per syllable, then lands on the moon. Returns world y. */
  headY(t: number) {
    const T = this.T;
    const [sN, sV, sD, sA] = this.nvSyl() as [number, number, number, number];
    const tTo = this.tTo();
    const st = (t0: number, dur: number, dd: number, e = ease.outExpo) => dd * e(clamp((t - t0) / dur));
    let d = 4.1;
    d += st(sN - 0.07, 0.24, 2.9);
    d += st(sV, 0.22, 6.0);
    d += st(sD, 0.24, 6.5);
    d += st(sA, 0.32, 8.9);
    const top = 28.4 * DEC;
    let y = d * DEC;
    // final approach: accelerate into the moon's south limb on "moon"
    y += (MOON.y - MOON.r - top) * ease.inQuad(clamp((t - (tTo + 0.1)) / (T.moon - tTo - 0.1)));
    return y;
  }

  camB(t: number) {
    const T = this.T, t0 = T.cutB, tTo = this.tTo(), tm = T.moon;
    const [, sV] = this.nvSyl() as [number, number, number, number];
    const zF = 0.8, syF = 250;
    // reveal: zoom out from the vertical line (match cut), anchored in screen space
    const t1 = Math.max(t0 + 0.12, sV - 0.01);
    const reveal = (tt: number) => {
      const e = ease.outExpo(clamp((tt - t0) / (t1 - t0)));
      const z = Math.pow(8, 1 - e) * Math.pow(zF, e);
      const sx = lerp(960, 1390, e), sy = lerp(-420, syF, e);
      return { x: -(sx - 960) / z, y: this.headY(tt) - (540 - sy) / z, z };
    };
    if (t <= t1) return reveal(t);
    const r1 = reveal(t1);
    // follow: the camera chases the stepping price a beat-fraction late
    const follow = (tt: number) => ({
      x: lerp(r1.x, -340, prog(tt, t1, tTo + 0.05, ease.inOutQuad)),
      y: this.headY(tt - 0.035) - (540 - syF) / zF,
      z: zF,
    });
    const tF = tTo + 0.05;
    if (t <= tF) return follow(t);
    const f1 = follow(tF);
    const k = ease.outCubic(clamp((t - tF) / (tm - tF)));
    const z = t <= tm ? lerp(f1.z, 1.0, k) : lerp(1.0, 1.06, prog(t, tm, T.cutD));
    return { x: lerp(f1.x, NOTE.x, k), y: lerp(f1.y, MOON.y, k), z };
  }

  w2s(x: number, y: number, cam: { x: number; y: number; z: number }) {
    return { x: W / 2 + (x - cam.x) * cam.z, y: H / 2 - (y - cam.y) * cam.z };
  }

  /** Draws the world (paper, moon, chart, world text) for camera `cam` into rtB. */
  drawWorld(t: number, cam: { x: number; y: number; z: number }, headY: number, impact: number) {
    const { renderer, comp } = this.ctx;
    const T = this.T;
    const u = this.note.u;
    (u.uCam!.value as THREE.Vector2).set(cam.x, cam.y);
    u.uZoom!.value = cam.z;
    u.uT!.value = t;
    u.uImpact!.value = impact;
    this.note.render(renderer, this.rtB);

    // ---- chart geometry (ink on paper)
    const lb = this.ink; lb.clear();
    const INK: [number, number, number] = [LIN.ink[0], LIN.ink[1], LIN.ink[2]];
    const GR: [number, number, number] = [LIN.graphite[0], LIN.graphite[1], LIN.graphite[2]];
    const yTop = cam.y + H / 2 / cam.z + 40, yBot = cam.y - H / 2 / cam.z - 40;
    const xL = cam.x - W / 2 / cam.z - 40, xR = cam.x + W / 2 / cam.z + 40;
    const S = (x: number, y: number) => this.w2s(x, y, cam);
    const gridFade = (y: number) => 1 - clamp((y - 26.3 * DEC) / (1.7 * DEC));
    // decade grid + minor log lines
    for (let d = -1; d <= 34; d++) {
      const y = d * DEC;
      if (y < yBot - DEC || y > yTop) continue;
      const gf = gridFade(y);
      if (gf <= 0) continue;
      const a = S(-1700, y), b = S(260, y);
      lb.seg2(a.x, a.y, b.x, b.y, 1.3, GR, 0.8 * gf);
      for (let m = 2; m <= 9; m++) {
        const ym = y + Math.log10(m) * DEC;
        if (ym < yBot || ym > yTop) continue;
        const p = S(-1700, ym), q = S(260, ym);
        lb.seg2(p.x, p.y, q.x, q.y, 0.8, GR, 0.3 * gf);
      }
    }
    // vertical grid every 8 candles
    for (let i = 0; i <= 10; i++) {
      const x = -78 * 21 + i * 8 * 21 - 10;
      if (x < xL || x > xR) continue;
      const a = S(x, Math.max(yBot, -0.2 * DEC)), b = S(x, Math.min(yTop, 7 * DEC));
      lb.seg2(a.x, a.y, b.x, b.y, 0.8, GR, 0.3);
    }
    // candles
    const z = cam.z;
    const drawBody = (x: number, y0: number, y1: number, bull: boolean, hw: number) => {
      const lo = Math.max(Math.min(y0, y1), yBot), hi = Math.min(Math.max(y0, y1), yTop);
      if (hi <= lo) return;
      const A = S(x - hw, lo), B = S(x + hw, hi);
      if (!bull) { const m = S(x, lo), n = S(x, hi); lb.seg2(m.x, m.y, n.x, n.y, 2 * hw * z, INK, 0.92); return; }
      lb.seg2(A.x, A.y, A.x, B.y, 1.4, INK, 0.95); lb.seg2(B.x, A.y, B.x, B.y, 1.4, INK, 0.95);
      lb.seg2(A.x, A.y, B.x, A.y, 1.4, INK, 0.95); lb.seg2(A.x, B.y, B.x, B.y, 1.4, INK, 0.95);
      const step = Math.max(3.2 / z, 3.6);
      for (let y = Math.ceil(lo / step) * step; y < hi; y += step) {
        const p = S(x - hw, y), q = S(x + hw, y);
        lb.seg2(p.x, p.y, q.x, q.y, Math.max(0.7, 1.1 * z * 0.6), INK, 0.8);
      }
    };
    for (const c of this.candles) {
      if (c.x < xL || c.x > xR) continue;
      const a = S(c.x, c.lo * DEC), b = S(c.x, c.hi * DEC);
      lb.seg2(a.x, a.y, b.x, b.y, Math.max(1, 1.6 * z), INK, 0.9);
      drawBody(c.x, c.o * DEC, c.c * DEC, c.c >= c.o, 6.5);
    }
    // the live candle: one bull body all the way up to the price
    const last = this.candles[this.candles.length - 1]!;
    drawBody(0, last.c * DEC, headY, true, 6.5);
    // price line (orange, drawn as ink on paper)
    const SIG: [number, number, number] = [LIN.signal[0], LIN.signal[1], LIN.signal[2]];
    let prev: { x: number; y: number } | null = null;
    for (const c of this.candles) {
      const p = S(c.x, c.c * DEC);
      if (prev) lb.seg2(prev.x, prev.y, p.x, p.y, Math.max(2, 3.2 * z), SIG, 1);
      prev = p;
    }
    const ph = S(0, headY), pl = S(0, last.c * DEC);
    if (prev) lb.seg2(prev.x, prev.y, pl.x, pl.y, Math.max(2, 3.2 * z), SIG, 1);
    lb.seg2(pl.x, pl.y, ph.x, Math.max(ph.y, -50), Math.max(2, 3.2 * z), SIG, 1);
    lb.render(renderer, this.rtB);

    // ---- world text: axis labels, note lettering
    const L = this.L1; L.clear(); const c = L.ctx;
    c.textBaseline = 'middle';
    const sup = (n: number) => String(n).split('').map((ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch]).join('');
    const names = ['$1', '$10', '$100', '$1K', '$10K', '$100K', '$1M', '$10M', '$100M', '$1B', '$10B', '$100B', '$1T'];
    const lsz = 30 * z;
    if (lsz > 5) {
      for (let d = 0; d <= 30; d++) {
        const y = d * DEC;
        if (y < yBot || y > yTop) continue;
        const gf = gridFade(y);
        if (gf <= 0.02) continue;
        const p = S(40, y);
        const passed = headY >= y && headY < y + 1.5 * DEC && t > T.cutB;
        c.font = font(F.mono(passed ? 700 : 500), lsz);
        c.fillStyle = passed ? rgba('signal', gf) : rgba('ink', 0.8 * gf);
        c.fillText(d < names.length ? names[d]! : `$10${sup(d)}`, p.x, p.y);
      }
      c.font = font(F.mono(500), lsz);
      // deadpan axis notes
      const note = (d: number, s: string) => {
        const y = d * DEC; if (y < yBot || y > yTop) return;
        const p = S(150, y + 20);
        c.font = font(F.mono(400, true), 20 * z); c.fillStyle = rgba('graphite', 0.9 * gridFade(y)); c.fillText(s, p.x, p.y);
        c.font = font(F.mono(500), lsz);
      };
      note(12, '← still log scale');
      note(19, '← yes, still log scale');
      note(24, '← analysts: “fair value”');
      note(27, '← we checked the axis');
      const tt = S(-1640, 6.4 * DEC);
      c.font = font(F.mono(600), 26 * z); c.fillStyle = rgba('ink', 0.85);
      c.fillText('NVDA · 1D · LOG', tt.x, tt.y);
      c.font = font(F.mono(400), 19 * z); c.fillStyle = rgba('graphite', 1);
      c.fillText('O 1.2   H ∞   L 1.1   C ↑', tt.x, tt.y + 32 * z);
    }
    // note lettering (world-fixed)
    if (Math.abs(cam.y - MOON.y) < 1400) {
      const mc = S(MOON.x, MOON.y);
      c.save();
      c.fillStyle = rgba('ink', 0.92);
      this.arcText(c, 'LUNAR RESERVE NOTE', mc.x, mc.y, (MOON.r * 1.8) * z, F.serif(600), 34 * z, 0.2);
      c.font = font(F.serif(400, true), 20 * z);
      c.textAlign = 'center';
      const mp = S(MOON.x, MOON.y - MOON.r * 1.9);
      c.fillText('In Scaling We Trust', mp.x, mp.y);
      // corner numerals and serials
      const cn = (x: number, y: number, al: CanvasTextAlign) => {
        const p = S(x, y);
        c.textAlign = al;
        c.font = font(F.serif(600), 64 * z); c.fillStyle = rgba('ink', 0.9);
        c.fillText('10', p.x, p.y);
        const w10 = c.measureText('10').width;
        c.font = font(F.serif(600), 34 * z);
        c.fillText('30', al === 'left' ? p.x + w10 + 4 * z : p.x + 2 * z, p.y - 26 * z);
      };
      cn(NOTE.x - NOTE.w / 2 + 110, NOTE.y + NOTE.h / 2 - 125, 'left');
      cn(NOTE.x + NOTE.w / 2 - 175, NOTE.y + NOTE.h / 2 - 125, 'left');
      c.font = font(F.mono(500), 22 * z); c.fillStyle = rgba('signal', 1); c.textAlign = 'left';
      const s1 = S(NOTE.x - NOTE.w / 2 + 112, NOTE.y + NOTE.h / 2 - 185);
      c.fillText('NV 10³⁰ 000001 A', s1.x, s1.y);
      const s2 = S(NOTE.x + NOTE.w / 2 - 330, NOTE.y - NOTE.h / 2 + 118);
      c.fillText('NV 10³⁰ 000001 A', s2.x, s2.y);
      c.restore();
    }
    comp.draw(renderer, L.upload(), this.rtB);
  }

  /** Text centred on the top of a circle (letters upright, reading clockwise). */
  arcText(c: CanvasRenderingContext2D, text: string, cx: number, cy: number, R: number, fam: string, size: number, trackEm: number) {
    c.save();
    c.font = font(fam, size);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    const lay = layout(text, fam, size, size * trackEm);
    const arcLen = lay.width / R;
    for (const g of lay.glyphs) {
      const a = -Math.PI / 2 - arcLen / 2 + (g.x + g.w / 2) / R;
      c.save();
      c.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      c.rotate(a + Math.PI / 2);
      c.fillText(g.ch, 0, 0);
      c.restore();
    }
    c.restore();
  }

  renderB(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t;
    const cam = this.camB(t);
    const hy = this.headY(t);
    const impact = t >= T.moon ? Math.exp(-(t - T.moon) / 0.35) : 0;
    this.drawWorld(t, cam, hy, impact);
    // motion blur from the camera's screen velocity
    const dt = 1 / 120;
    const c0 = this.camB(t - dt);
    const vy = (cam.y - c0.y) * cam.z, vx = (cam.x - c0.x) * cam.z;
    const cu = this.comp2.u;
    cu.uSrc!.value = this.rtB.texture;
    (cu.uVel!.value as THREE.Vector2).set(-vx, -vy);
    cu.uWarp!.value = 0; cu.uSwirl!.value = 0; cu.uDark!.value = 0; cu.uStreak!.value = 0; cu.uCore!.value = 0; cu.uCollapse!.value = 0;
    this.comp2.render(renderer, out);

    // ---- the spark (additive)
    const g = this.glow; g.clear();
    const headAt = (tt: number) => { const cc = this.camB(tt); const p = this.w2s(0, this.headY(tt), cc); return p; };
    const hp = this.w2s(0, hy, cam);
    sparkParticles(g, t, headAt, { rate: 140, speed: 340, intensity: 1.2, seed: 3, width: 2.2 });
    sparkHead(g, hp.x, hp.y, t, 2.0 + 1.2 * impact, 1.5);
    g.render(renderer, out);

    // ---- NVDA / TO THE MOON lettering (screen-fixed, banknote style)
    const L = this.L2; L.clear(); const c = L.ctx;
    const nv = T.l2.words[0]!;
    const syl = this.nvSyl();
    const X0 = 150, Y0 = 600;
    for (let i = 0; i < 4; i++) {
      const ts = syl[i]!;
      if (t < ts) continue;
      const P = this.nvdaPaths[i]!;
      const e = t - ts;
      const sc = 1 + 0.35 * Math.exp(-e / 0.05);
      const hot = i === 3 ? t < nv.end + 0.12 : t < (syl[i + 1] ?? nv.end);
      c.save();
      c.translate(X0 + P.x + P.w / 2, Y0 - 80);
      c.scale(sc, sc);
      c.translate(-P.w / 2, 80);
      // bone knock-out halo for legibility over the chart
      c.lineJoin = 'round';
      c.strokeStyle = rgba('bone', 0.95); c.lineWidth = 12; c.stroke(P.p);
      if (hot) { c.fillStyle = rgba('signal', 1); c.fill(P.p); }
      else {
        c.fillStyle = rgba('bone', 1); c.fill(P.p);
        c.save(); c.clip(P.p);
        c.fillStyle = rgba('ink', 0.9);
        for (let y = -240; y < 40; y += 6) c.fillRect(-10, y, P.w + 20, 2.6);
        c.restore();
      }
      c.strokeStyle = rgba('ink', 1); c.lineWidth = 2.5; c.stroke(P.p);
      c.restore();
    }
    // "TO THE MOON" in engraved roman capitals
    const rest = T.l2.words.slice(1);
    let x = X0 + 6;
    c.font = font(F.serif(600), 58);
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    for (const w of rest) {
      const txt = w.w.toUpperCase();
      const p = Lyrics.wordProgress(w, t);
      const vis = prog(t, w.start - 0.35, w.start);
      c.letterSpacing = '12px';
      const ww = c.measureText(txt).width;
      if (vis > 0) {
        c.lineWidth = 8; c.strokeStyle = rgba('bone', 0.9 * vis); c.strokeText(txt, x, Y0 + 96);
        c.fillStyle = p > 0 ? (p < 1 ? rgba('signal', 1) : rgba('ink', 0.95)) : rgba('ink', 0.25 * vis);
        c.fillText(txt, x, Y0 + 96);
      }
      x += ww + 34;
    }
    c.letterSpacing = '0px';
    // live price tag riding the head (the chart's last-price label), readable while it climbs
    const dNow = hy / DEC;
    const tagA = prog(t, T.cutB, T.cutB + 0.08) * (1 - prog(t, T.moon - 0.12, T.moon));
    if (tagA > 0 && hp.y > 40 && hp.y < H - 40) {
      const sup = (n: number) => String(n).split('').map((ch) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch]).join('');
      const e = Math.floor(dNow), m = Math.pow(10, dNow - e);
      const txt = `$${m.toFixed(2)}×10${sup(e)}`;
      c.font = font(F.mono(600), 26);
      const tw = c.measureText(txt).width;
      const tx = hp.x + 34, ty = hp.y;
      c.globalAlpha = tagA;
      c.fillStyle = rgba('signal', 1);
      c.beginPath(); c.moveTo(tx - 16, ty); c.lineTo(tx, ty - 20); c.lineTo(tx + tw + 20, ty - 20); c.lineTo(tx + tw + 20, ty + 20); c.lineTo(tx, ty + 20); c.closePath(); c.fill();
      c.fillStyle = rgba('bone', 1); c.textBaseline = 'middle'; c.textAlign = 'left';
      c.fillText(txt, tx + 8, ty + 1);
      c.globalAlpha = 1;
    }
    comp.draw(renderer, L.upload(), out);

    // each syllable punches the price through another ceiling
    let punch = 0;
    for (const ts of syl) punch = Math.max(punch, t >= ts ? Math.exp(-(t - ts) / 0.09) : 0);
    const sh = Math.max(impact * impact, 0.35 * punch);
    return { paper: 1, bloom: 0.6, bloomThreshold: 0.95, vignette: 0.3, zoom: 1 + 0.025 * punch, shake: [Math.sin(t * 91) * 14 * sh, Math.cos(t * 77) * 10 * sh], flash: 0.18 * pulse(t, T.moon, 0.04) + 0.3 * pulse(t, T.cutB, 0.04), ca: 1.0 + 3 * sh };
  }

  // ------------------------------------------------------------------ C: the Omega Point
  renderC(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t, t0 = T.omega, t1 = T.cutD;
    const l3 = T.l3;
    const omegaW = wordOf(l3, 'omega');
    // the note keeps drifting while the camera centres the moon
    const base = this.camB(t);
    const pan = prog(t, t0, omegaW.start + 0.25, ease.inOutCubic);
    const cam = { x: lerp(base.x, MOON.x, pan), y: base.y, z: base.z * (1 + 0.1 * pan) };
    this.drawWorld(t, cam, MOON.y - MOON.r, Math.exp(-(t - T.moon) / 0.35));
    const P = this.w2s(MOON.x, MOON.y, cam);
    const k = prog(t, t0, t1);
    const collapse = prog(t, t1 - 0.2, t1, ease.inCubic);
    const bp = this.beatPulse(t, 0.14);
    const cu = this.comp2.u;
    cu.uSrc!.value = this.rtB.texture;
    (cu.uVel!.value as THREE.Vector2).set(0, 0);
    (cu.uP!.value as THREE.Vector2).set(P.x, H - P.y);
    cu.uWarp!.value = 4.5 * Math.pow(prog(t, t0, omegaW.start + 0.6), 1.5);
    cu.uSwirl!.value = 1.2 * Math.pow(prog(t, t0, omegaW.start + 0.6), 2);
    const dark = prog(t, t0, t0 + 0.12, ease.inOutCubic);
    cu.uDark!.value = dark;
    cu.uStreak!.value = 0.12 * prog(t, t0, omegaW.start + 0.6);
    cu.uCore!.value = prog(t, t0, omegaW.start, ease.outCubic) * (0.35 + 0.5 * k + 0.35 * bp) * (1 + 3 * collapse);
    cu.uCollapse!.value = 0;
    cu.uT!.value = t;
    this.comp2.render(renderer, out);

    // the glory: engraved rays converging on the point, drawn in from the frame edges
    const g = this.glow; g.clear();
    const draw = prog(t, t0 + 0.05, omegaW.start + 0.35, ease.outCubic);
    // the field turns like an aperture, one click per sung word
    let rot = 0.12 * Math.pow(k, 1.5);
    for (const w of l3.words) rot += 0.045 * ease.outExpo(clamp((t - w.start) / 0.25));
    const NR = 180;
    const Rmax = 1250;
    // a ring of light rides every ray inward and lands on the point on the beat
    const wph = ease.inQuad(clamp(f.beatPhase));
    const wr = Rmax * (1 - wph);
    const wA = prog(t, omegaW.start - 0.1, omegaW.start + 0.2) * (1 - collapse);
    const beatN = Math.floor(this.ctx.audio.beatAt(t));
    const beatPh = f.beatPhase;
    for (let i = 0; i < NR; i++) {
      const long = i % 2 === 0;
      const hsh = hash(i, 7);
      const a = (i / NR) * TAU + rot + (hash(i, 3) - 0.5) * 0.004;
      const rOut = (long ? Rmax : Rmax * (0.45 + 0.35 * hsh)) * (1 - collapse);
      const reach = i % 6 === 0;
      const rIn = (reach ? 26 : long ? 90 + 70 * hash(i, 9) : 70 + 120 * hash(i, 5)) * (1 - collapse);
      // drawn from outside inward
      const rEnd = lerp(rOut, rIn, clamp(draw * 1.25 - hsh * 0.25));
      if (rEnd >= rOut - 1) continue;
      const w = long ? 1.1 : 0.7;
      const I = (long ? 0.62 : 0.4) * (0.8 + 0.2 * hash(i, beatN));
      const col: [number, number, number] = [LIN.bone[0] * I, LIN.bone[1] * I, LIN.bone[2] * I];
      g.seg2(P.x + Math.cos(a) * rOut, P.y + Math.sin(a) * rOut, P.x + Math.cos(a) * rEnd, P.y + Math.sin(a) * rEnd, w, col, 1);
      // the converging ring
      if (wA > 0 && wr > rEnd && wr < rOut) {
        const near = 1 - wr / Rmax;
        const len = 18 + 70 * (1 - near);
        const hi = Math.min(rOut, wr + len);
        const I2 = (long ? 1.25 : 0.8) * wA * (0.45 + 0.8 * near);
        const hc: [number, number, number] = [lerp(LIN.bone[0], LIN.ember[0] * 1.6, near) * I2, lerp(LIN.bone[1], LIN.ember[1] * 1.6, near) * I2, lerp(LIN.bone[2], LIN.ember[2] * 1.6, near) * I2];
        g.seg2(P.x + Math.cos(a) * hi, P.y + Math.sin(a) * hi, P.x + Math.cos(a) * wr, P.y + Math.sin(a) * wr, w * 1.6, hc, 1);
      }
      // on each beat a pulse of heat runs down a few rays into the point
      if (hash(i, beatN, 11) < 0.12 && draw > 0.5) {
        const pr = lerp(rOut, rIn, ease.inQuad(clamp(beatPh * 1.6)));
        const pl = 90;
        const hc: [number, number, number] = [LIN.signal[0] * 2.2, LIN.signal[1] * 2.2, LIN.signal[2] * 2.2];
        g.seg2(P.x + Math.cos(a) * Math.min(rOut, pr + pl), P.y + Math.sin(a) * Math.min(rOut, pr + pl), P.x + Math.cos(a) * pr, P.y + Math.sin(a) * pr, 1.6, hc, 1 - clamp(beatPh * 1.6));
      }
    }
    g.render(renderer, out);

    // ---- lyric: Cormorant italic, above and below the point, shrinking into it
    const L = this.L2; L.clear(); const c = L.ctx;
    const sc = (0.95 * Math.exp(-0.42 * Math.max(0, t - omegaW.start))) * (1 - collapse);
    const words = l3.words;
    const rowA = words.slice(0, 3), rowB = words.slice(3);
    const fam = F.serif(400, true);
    const size = 128;
    c.save();
    c.translate(P.x, P.y);
    c.scale(sc, sc);
    c.textBaseline = 'alphabetic';
    const drawRow = (ws: Word[], y: number) => {
      c.font = font(fam, size);
      const row = ws.map((w) => w.w).join(' ');
      const total = c.measureText(row).width;
      // each word drawn on its own (own colour) at its kerned position in the row set as one run
      let k = 0;
      for (const w of ws) {
        const p = Lyrics.wordProgress(w, t);
        const vis = prog(t, w.start - 0.35, w.start);
        c.fillStyle = p > 0 ? (p < 1 ? rgba('ember', 1) : rgba('bone', 1)) : rgba('bone', 0.2 * vis);
        c.fillText(w.w, -total / 2 + glyphX(row, k, fam, size), y);
        k += Array.from(w.w).length + 1;
      }
    };
    drawRow(rowA, -86);
    drawRow(rowB, 176);
    c.restore();
    comp.draw(renderer, L.upload(), out);

    return { paper: 1 - dark, bloom: 0.8, vignette: 0.45, flash: 0.9 * pulse(t, t1 - 0.03, 0.05) * prog(t, t1 - 0.1, t1), zoom: 1 + 0.02 * bp, ca: 1.2 + 2 * k };
  }

  // ------------------------------------------------------------------ D: the odometer
  odoTimes() {
    const l4 = this.T.l4;
    const thirty = wordOf(l4, 'thirty'), second = wordOf(l4, 'second');
    return { tE0: thirty.start, tL: this.snap(second.start) };
  }
  odoE(t: number) {
    const { tE0, tL } = this.odoTimes();
    return 30 * ease.inOutCubic(clamp((t - tE0) / (tL - tE0)));
  }

  renderD(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const T = this.T, t = f.t, t0 = T.cutD;
    const { tE0, tL } = this.odoTimes();
    const E = this.odoE(t);
    const h = 1 / 240;
    const dE = (this.odoE(t + h) - this.odoE(t - h)) / (2 * h);
    const u = this.odo.u;
    const pos = u.uPos!.value as number[], blur = u.uBlur!.value as number[];
    for (let j = 0; j <= 30; j++) {
      const q = E - j;
      let p = 0, b = 0;
      if (t < tL || j === 30 || q <= 2.2) {
        if (q > 14) { p = hash(j, frameIdx(t)) * 10; b = 12; }
        else if (q > -3) {
          const v = Math.pow(10, q);
          p = v % 10;
          b = Math.min(12, (Math.LN10 * dE * v) / 120);
        }
        if (t >= tL) { p = j === 30 ? 1 : 0; b = 0; }
      } else {
        // spin-down: a wave of zeros settling left to right
        const ts = tL + 0.05 + 0.013 * (27 - j);
        if (t < ts) { p = hash(j, frameIdx(t)) * 10; b = 12; }
        else {
          const e = t - ts;
          b = 12 * Math.exp(-e / 0.025);
          p = 10 - 0.35 * Math.exp(-e / 0.06) * Math.cos(e * 55);
        }
      }
      if (j === 30 && t >= tL) {
        const e = t - tL;
        p = 1 + 0.12 * Math.exp(-e / 0.07) * Math.sin(e * 60);
      }
      pos[j] = p; blur[j] = b;
    }
    // camera
    const front = clamp(E, 0, 30);
    const pull = prog(t, tE0 + 0.05, tL - 0.12, ease.inOutCubic);
    const au = this.ctx.audio;
    const tR = au.timeOfBeat(Math.ceil(au.beatAt(tL + 0.6)));
    let zoom: number, camX: number, camY: number;
    if (t < tR) {
      zoom = lerp(3.0, 0.97, pull) * (1 + 0.05 * prog(t, t0, tE0)) + 0.04 * pulse(t, tL, 0.08) + 0.03 * prog(t, tL + 0.1, tR, ease.inOutQuad);
      const fx = t < tE0 ? drumX(0) - 60 : lerp(drumX(front) + 60, 0, pull);
      camX = fx; camY = lerp(10, 16, pull);
    } else {
      // reframe on the beat: track along the zeros toward the one
      const k = prog(t, tR, Math.min(tR + 0.8, this.ctx.end - 0.25), ease.inOutCubic);
      zoom = 2.25 + 0.25 * prog(t, tR, this.ctx.end, ease.inOutQuad);
      camX = lerp(drumX(9), drumX(27) + 40, k);
      camY = 6;
    }
    (u.uCam!.value as THREE.Vector2).set(camX, camY);
    u.uZoom!.value = zoom;
    u.uT!.value = t;
    u.uHot!.value = t >= tL ? 0.6 + 0.4 * Math.exp(-(t - tL) / 0.3) + 0.25 * this.beatPulse(t, 0.12) : 0;
    u.uThunk!.value = pulse(t, tL, 0.06);
    const bn = Math.floor(this.ctx.audio.beatAt(t));
    const bt = this.ctx.audio.timeOfBeat(bn);
    u.uSheen!.value = t > tL ? lerp(-1100, 1100, clamp((t - bt) / 0.45)) : -5000;
    this.odo.render(renderer, out);

    // ---- overlay: commas on the housing, the notation, the gloss and the footnote
    const L = this.L2; L.clear(); const c = L.ctx;
    const O = (x: number, y: number) => ({ x: W / 2 + (x - camX) * zoom, y: H / 2 - (y - camY) * zoom });
    c.fillStyle = rgba('bone', 0.8);
    c.font = font(F.archivo(100, 700), 40 * zoom);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    for (let g = 1; g <= 10; g++) {
      const x = drumX(g * 3 - 1) - ODO.pitch / 2 - ODO.gap / 2;
      const p = O(x, -ODO.winH + 6);
      if (p.x < -50 || p.x > W + 50) continue;
      c.fillText(',', p.x, p.y);
    }
    // notation: 1 E 30 FLOP /s  (one token per sung word)
    const l4 = T.l4;
    const tok: [string, string][] = [['1', 'one'], ['E', 'E'], ['30', 'thirty'], ['FLOP', 'flops'], ['/s', 'a second']];
    const wds = l4.words;
    const tokWords: Word[][] = [[wds[0]!], [wds[1]!], [wds[2]!], [wds[3]!], wds.slice(4)];
    const nf = F.archivo(100, 900), ns = 150;
    c.textAlign = 'left';
    let x = 150;
    const yN = 250;
    for (let i = 0; i < tok.length; i++) {
      const [s1, gl] = tok[i]!;
      const ws = tokWords[i]!;
      const w0 = ws[0]!;
      c.font = font(nf, ns);
      c.letterSpacing = '-4px';
      const tw = c.measureText(s1).width;
      const on = t >= w0.start;
      const e = t - w0.start;
      const singing = ws.some((w) => t >= w.start && t < w.end + 0.05);
      if (on) {
        const sc = 1 + 0.25 * Math.exp(-e / 0.045);
        c.save();
        c.translate(x + tw / 2, yN - ns * 0.35);
        c.scale(sc, sc);
        c.fillStyle = singing ? rgba('signal', 1) : rgba('bone', 0.95);
        c.fillText(s1, -tw / 2, ns * 0.35);
        c.restore();
      } else {
        c.fillStyle = rgba('bone', 0.08);
        c.fillText(s1, x, yN);
      }
      c.letterSpacing = '0px';
      // gloss
      c.font = font(F.mono(400), 20);
      const gp = ws.reduce((a, w) => a + Lyrics.wordProgress(w, t), 0) / ws.length;
      c.fillStyle = gp > 0 ? rgba('bone', 0.85) : rgba('ash', 0.3);
      c.fillText(gl, x + 4, yN + 44);
      if (gp > 0 && gp < 1) { c.fillStyle = rgba('signal', 1); c.fillRect(x + 4, yN + 52, c.measureText(gl).width * gp, 2); }
      // token gaps: a word space after "30"; FLOP→/s tightened by eye (the font has no P/ kern, and
      // the P's open foot plus the slash's lean leave a hole that reads wider than the other gaps)
      x += tw + (i === 2 ? 44 : i === 3 ? 12 : 18);
    }
    // footnote marker + footnote typed after the lock
    if (t > tL) {
      c.font = font(nf, 60); c.fillStyle = rgba('signal', 1); c.fillText('¹', x - 8, yN - 80);
      const fn = '¹ One nonillion floating-point operations per second. Rounded down, for safety.';
      const n = Math.floor(fn.length * prog(t, tL + 0.3, tL + 1.05));
      c.font = font(F.mono(400), 20);
      c.fillStyle = rgba('ash', 0.95);
      c.fillText(fn.slice(0, n), 150, 842);
      if (n > 0 && n < fn.length && Math.floor(t * 8) % 2 === 0) c.fillRect(150 + c.measureText(fn.slice(0, n)).width + 3, 826, 11, 20);
      c.fillStyle = rgba('graphite', 0.9);
      c.fillRect(150, 812, 220, 1);
      // P(doom) cameo: a second footnote, same rounding policy
      const fn2 = `² P(doom): ${formatPDoom(this.pd.value(t))}. Also rounded down.`;
      const n2 = Math.floor(fn2.length * prog(t, tL + 1.15, tL + 1.55));
      c.fillStyle = rgba('ash', 0.95);
      c.fillText(fn2.slice(0, n2), 150, 874);
      if (n2 > 0 && n2 < fn2.length && Math.floor(t * 8) % 2 === 0) c.fillRect(150 + c.measureText(fn2.slice(0, n2)).width + 3, 858, 11, 20);
    }
    comp.draw(renderer, L.upload(), out);

    const sh = pulse(t, tL, 0.07);
    const intro = pulse(t, t0, 0.06);
    return {
      bloom: 0.7, vignette: 0.5, shake: [Math.sin(t * 90) * 18 * sh, Math.cos(t * 70) * 12 * sh],
      ca: 1.2 + 3 * sh, flash: 0.12 * sh + 0.3 * intro,
    };
  }
}
