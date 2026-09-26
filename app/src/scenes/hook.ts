// HOOK x4 — "I'M / UPPING / MY / P(DOOM)": one full-frame slam per sung word, then P(doom)
// itself takes the frame (maths label, rolling digits, scale) and leaves on the cut, a different
// way each time:
//   n=1 bone on ink, clean. The number lands on the DOOM hit; on the next 8th it implodes into a
//       spark and a centred P(DOOM) bursts out of it: FIG. 3a (room) opens by shattering that outline.
//   n=2 ink on a signal field. The instrument rolls in on "P(", and on DOOM the field closes like an
//       eyelid onto the glowing seam that opens FIG. 6 (ascent).
//   n=3 the breakdown: hairlines, tiny, black. A ghost of the number waits behind the words, rolls,
//       and burns out filament by filament on the cut.
//   n=4 maximal: strobes, stacked outlines, 0.99999…; the 9s multiply until the string is a thread,
//       which switches off into the loom's weft line (FIG. 13).
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { HEX, rgba } from '../engine/palette';
import { F, font, measure, layout, plain, type TextLayout } from '../engine/type';
import { PDoom, formatPDoom } from '../engine/hud';
import type { Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, noise1, prog, pulse, smoothstep, frameIdx } from '../engine/util';
import { sparkHead2D } from './_motifs';

const CAP = 0.686; // Archivo cap height / em
const PCAP = 0.698; // Plex Mono cap height / em
const PADV = 0.6; // Plex Mono advance / em
/** Space between the italic P and "(" (em): no kerning between the two runs, so it is set by eye (the italic P's bowl overhangs its advance). */
const P_GAP = 0.05;

/** The instrument at full scale: maths label top-left, digits, tick bar (hairline variant for n=3). */
const BIG = { numSize: 720, numX: 92, numC: 585, labX: 118, labY: 214, labSize: 168, barX: 118, barY: 906, barW: W - 236 };
const HAIR = { numSize: 740, numX: 88, numC: 542, labX: 118, labY: 190, labSize: 84, barX: 118, barY: 890, barW: W - 236 };

// ---- hand-off geometry of the plates that follow (copied, not imported: they are other agents' files)
/** FIG. 3a (room): centred P(DOOM), Archivo 900 w100, 300 px, baseline H/2 + 0.36 em; its spark roots at the centre. */
const ROOM = { size: 300, root: { x: W * 0.5, y: H * 0.53 } };
/** FIG. 6 (ascent): the closed eye's camera and orbit (eye space: y up, seam y = TILT·x, |x| ≤ A). */
const EYE = { zoom: 0.68, rot: -0.07, cx: 0.12, cy: -0.06, A: 1, HU: 0.6, HL: 0.5, TILT: 0.06 };
/** FIG. 13 (loom): the reed's hairline across the loom at the cut, and the shuttle's spark on it. */
const THREAD = { y: 629, sparkX: 300 };

/** Deadpan footnote under the big number (Δ is computed from the actual step). */
const NOTES: Record<number, string> = {
  1: 'posterior · updated on one (1) chatbot',
  2: 'posterior · updated on Sydney',
  3: 'posterior · updated on a cat',
  4: 'posterior · rounded up',
};

type Col = keyof typeof HEX;
type Style = (i: number) => { col: string; a: number };

export default class Hook extends Scene {
  n = 1;
  pd!: PDoom;
  L = new Layer2D();
  comp!: FSPass;
  words: Word[] = [];
  ws: number[] = [];
  /** P( and DOOM sung; the instrument's entrance; its roll; the exit window; hook 1's P(DOOM) burst. */
  tP = 0; tDoom = 0; tNum = 0; tRoll0 = 0; tRoll1 = 0; tX0 = 0; tX1 = 0; tSlam = 0;
  dPrev = 0; dNew = 0;
  prevWord = '';
  lw = 1; // hairline width multiplier (kept constant under the exit transforms)
  f = {
    im: F.archivo(100, 900), up: F.archivo(125, 900), my: F.archivo(62, 900), doom: F.archivo(100, 900),
    P: F.archivoItalic(100, 800), paren: F.archivo(62, 300), hair: F.archivo(100, 300), hairW: F.archivo(125, 300),
    mono: F.mono(400), monoM: F.mono(500), monoL: F.mono(300),
  };
  upLay!: TextLayout;
  finLay!: TextLayout;

  override init() {
    const { lyrics, params, start, end, audio: au } = this.ctx;
    this.n = Number(params.n ?? 1);
    const n = this.n;
    this.pd = new PDoom(lyrics);
    const line = lyrics.linesIn(start - 0.3, end).find((l) => /upping/i.test(l.text)) ?? lyrics.linesIn(start, end)[0]!;
    this.words = line.words.slice(0, 4);
    const prev = lyrics.lines[line.i - 1];
    this.prevWord = prev ? plain(prev.words[prev.words.length - 1]!.w) : ''; // typed (mono): typewriter quotes
    this.ws = this.words.map((w) => w.start);
    const wP = this.words[3] ?? this.words[this.words.length - 1]!;
    this.tP = wP.start;
    this.tDoom = Math.min(wP.syl && wP.syl.length > 1 ? wP.syl[1]![0] : wP.start + 0.4 * (wP.end - wP.start), end - 0.03);
    const step = this.pd.steps.find((s) => s.t >= this.tP - 0.01 && s.t < end + 0.2) ?? this.pd.lastStep(end);
    const i = this.pd.steps.indexOf(step);
    this.dPrev = this.pd.steps[Math.max(0, i - 1)]!.v; this.dNew = step.v;

    // Hooks 1 and 4 have a beat after the DOOM hit: the number arrives on DOOM. In 2 and 3 the hit is
    // the cut itself, so the number arrives on "P(" and lands on DOOM.
    const early = n === 2 || n === 3;
    this.tNum = early ? this.tP : this.tDoom;
    this.tRoll0 = this.tNum + 0.015;
    this.tRoll1 = n === 1 ? this.tDoom + 0.13 : n === 4 ? this.tDoom + 0.08 : Math.max(this.tRoll0 + 0.08, n === 3 ? this.tP + 0.11 : this.tDoom - 0.015);
    // exits (all land on the cut)
    if (n === 1) {
      const hat = au.timeOfBeat(Math.round(au.beatAt(this.tDoom)) + 0.5); // the 8th after DOOM
      this.tSlam = hat > this.tDoom + 0.15 && hat < end - 0.12 ? hat : lerp(this.tDoom, end, 0.5);
      this.tX0 = this.tSlam - 0.066; this.tX1 = this.tSlam - 0.004;
    } else if (n === 2) {
      this.tX0 = Math.min(this.tDoom, end - 0.05); this.tX1 = end - 0.002;
    } else if (n === 3) {
      this.tX0 = Math.max(this.tRoll1 + 0.01, end - 0.16); this.tX1 = end - 0.004;
    } else {
      this.tX0 = end - 0.1; this.tX1 = end - 0.008;
    }
    this.upLay = layout('UPPING', this.f.up, 100);
    this.finLay = layout('P(DOOM)', this.f.doom, ROOM.size);
    this.comp = new FSPass(COMP, {
      tex: { value: this.L.texture }, bgCol: { value: [0, 0, 0] }, echo: { value: 0 }, hot: { value: 1 }, gain: { value: 1 },
    });
  }

  // ------------------------------------------------------------------ helpers
  private wordIdx(t: number) {
    let i = -1;
    for (let k = 0; k < this.ws.length; k++) if (t >= this.ws[k]! - 1e-4) i = k;
    return i;
  }
  private slam(t: number, t0: number, amt = 0.14, dur = 0.16) {
    const r = this.retrig(t, t0);
    const hold = 1 + 0.035 * Math.max(0, t - t0); // held words creep toward camera
    return hold * (1 + amt * (r === t0 ? 1 : 0.5) * (1 - ease.outExpo(clamp((t - r) / dur))));
  }
  /** Hook 4 re-slams a held word on every beat ("strobing repeats"); others slam once. */
  private retrig(t: number, t0: number) {
    if (this.n !== 4) return t0;
    const au = this.ctx.audio;
    const bt = au.timeOfBeat(Math.floor(au.beatAt(t) + 1e-4));
    return bt > t0 + 0.12 ? bt : t0;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t, n = this.n;
    const L = this.L; L.clear();
    const c = L.ctx;
    c.textBaseline = 'alphabetic';
    const wi = this.wordIdx(t);
    const o: PostOverrides = { bloomThreshold: 1.0, bloomKnee: 0.2, bloom: 0.6, bloomRadius: 0.55, ca: n === 3 ? 0.5 : 1.2, vignette: n === 2 ? 0.55 : 0.4, grain: n === 3 ? 0.07 : 0.055 };

    // ---- palette for this frame
    let bgK: Col = n === 2 ? 'signal' : 'ink';
    let inkK: Col = n === 2 ? 'ink' : 'bone';
    if (n === 4 && t >= this.ws[0]! - 0.01 && t < this.tDoom) {
      // strobe on the 8ths: ink / signal / bone
      const e = Math.floor(f.beat * 2);
      const m = ((e % 3) + 3) % 3;
      bgK = m === 0 ? 'ink' : m === 1 ? 'signal' : 'bone';
      inkK = m === 0 ? 'bone' : 'ink';
    }
    if (n === 1 && t < this.ws[0]!) { bgK = 'bone'; inkK = 'ink'; } // hold the prompt's white-out until I'M
    // punch frames: 2 inverted frames on every slam (not in the breakdown; hook 2's DOOM is the eyelid)
    const punchT = [...this.ws.slice(0, 3), n === 3 ? -9 : this.tP, n === 2 || n === 3 ? -9 : this.tDoom];
    const punch = n !== 3 && punchT.some((x) => t >= x && t < x + 2 / 60);
    if (punch) { const k = bgK; bgK = inkK; inkK = k; }

    // ---- content
    let shake = 0;
    const inNum = t >= this.tNum;
    if (n === 4 && t < this.ws[0]!) this.drawAskew(c, t);
    if (n === 3 && wi >= 0) this.drawGhost(c, t);
    if (!inNum) {
      if (wi < 0) this.drawPre(c, t, inkK);
      else if (n === 3) this.drawTiny(c, t, wi);
      else if (wi === 0) this.drawIM(c, t, inkK);
      else if (wi === 1) this.drawUP(c, t, inkK);
      else if (wi === 2) this.drawMY(c, t, inkK);
      else this.drawPDFull(c, t, inkK);
      if (wi >= 0 && n !== 3) shake = [0, 7, 13, 0, 20][n]! * pulse(t, this.retrig(t, this.ws[wi]!), 0.05);
      if (n !== 3) this.drawAnnotations(c, t, wi, inkK);
    } else {
      if (n === 3) this.drawTiny(c, t, 3, 1 - smoothstep(this.tNum, this.tNum + 0.06, t), 3);
      this.drawNumberPhase(c, t, inkK);
    }
    L.upload();

    const u = this.comp.u;
    (u.bgCol!.value as number[]).splice(0, 3, ...lin(bgK));
    u.echo!.value = n === 4 ? (wi === 3 && !inNum ? 0.02 : 0.06) * pulse(t, this.ws[Math.max(0, wi)] ?? t, 0.1) + (inNum && t < this.tX0 ? 0.025 : 0) : 0;
    u.hot!.value = bgK === 'signal' ? (n === 2 && t >= this.tX0 ? 1.4 : 0) : n === 3 ? 0.9 : 0.95;
    // hook 1's last frames: the drained outline runs white-hot, like the one FIG. 3a shatters
    u.gain!.value = n === 1 ? 1 + 0.9 * smoothstep(this.ctx.end - 0.09, this.ctx.end - 0.02, t) : n === 2 ? 1 + 0.7 * smoothstep(this.tX0 + 0.02, this.tX1, t) : n === 4 ? 1 + 1.2 * smoothstep(this.tX0 + 0.03, this.tX1, t) : 1;
    this.comp.render(this.ctx.renderer, out);

    // ---- camera-ish post
    if (n === 4 && t < this.ws[0]!) {
      // continuing "RLHF goes askew": the frame is still rolled, it snaps straight on I'M
      o.zoom = 1.08;
    }
    const hit = pulse(t, this.tDoom, 0.06);
    if (n !== 3 && n !== 2) { shake += [0, 10, 16, 0, 26][n]! * hit; o.zoom = (o.zoom ?? 1) * (1 + 0.04 * hit); }
    if (n === 1) { shake += 9 * pulse(t, this.tSlam, 0.05); o.bloom = 0.6 + 0.5 * pulse(t, this.tSlam, 0.08); }
    if (shake > 0.05) o.shake = [noise1(t * 60, 1) * shake, noise1(t * 60, 2) * shake];
    // the exits hand geometry to the next plate: hold the frame still for them
    const still = n === 1 ? this.ctx.end - 0.1 : this.tX0;
    if (t >= still) { o.shake = [0, 0]; o.zoom = 1; o.ca = 0.5; }
    return o;
  }

  // ------------------------------------------------------------------ words
  private drawPre(c: CanvasRenderingContext2D, t: number, ink: Col) {
    if (this.n === 3) {
      // the breakdown: the cursor is still holding on to the last letter, alone in the dark
      const a = 1 - smoothstep(this.ws[0]! - 0.12, this.ws[0]!, t);
      const size = 40, adv = size * PADV;
      const w = this.prevWord.length * adv;
      c.font = font(this.f.mono, size);
      c.fillStyle = rgba('bone', 0.8 * a);
      c.fillText(this.prevWord, W / 2 - w / 2, H / 2 + size * 0.35);
      c.fillStyle = rgba('signal', a);
      c.fillRect(W / 2 + w / 2 + 3, H / 2 + size * 0.35 - size * 0.78, 3, size * 0.9);
      return;
    }
    const k = ease.outExpo(prog(t, this.ctx.start, this.ws[0]!));
    c.fillStyle = rgba(ink, 0.3);
    c.fillRect(W / 2 - 400 * k, H / 2, 800 * k, 1);
  }

  /** Hook 4 pre-roll: the frame still askew from the previous plate; outlines of I'M pulse in. */
  private drawAskew(c: CanvasRenderingContext2D, t: number) {
    const t0 = this.ws[0]!;
    const k = prog(t, this.ctx.start, t0);
    const fam = this.f.im, size = 1150;
    const w = measure('I’M', fam, size);
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(-0.12 * (1 - k * k));
    c.font = font(fam, size);
    for (let j = 0; j < 5; j++) {
      const sc = 0.2 + 0.8 * ((k * 2 + j / 5) % 1);
      c.save(); c.scale(sc, sc);
      c.strokeStyle = rgba(j % 2 ? 'signal' : 'bone', 0.5 * sc);
      c.lineWidth = 2 / sc;
      c.strokeText('I’M', -w / 2, (size * CAP) / 2);
      c.restore();
    }
    c.restore();
  }

  /** Type-specimen guides: hairlines at the word's baseline and cap height, full width. */
  private guides(c: CanvasRenderingContext2D, base: number, capH: number, ink: Col, a = 1) {
    if (this.n === 3) return;
    c.save();
    c.fillStyle = rgba(ink, 0.22 * a);
    c.fillRect(0, Math.round(base), W, 1);
    c.fillRect(0, Math.round(base - capH), W, 1);
    c.font = font(this.f.mono, 11);
    c.fillStyle = rgba(ink, 0.5 * a);
    c.fillText('baseline', 96, Math.round(base) + 16);
    c.fillText(`cap-height · ${(CAP).toFixed(3)} em`, 96, Math.round(base - capH) - 8);
    c.restore();
  }

  private drawIM(c: CanvasRenderingContext2D, t: number, ink: Col) {
    const n = this.n, t0 = this.ws[0]!;
    const fam = this.f.im;
    const w1 = measure('I’M', fam, 100) / 100;
    const size = Math.min(n === 1 ? 980 : 1200, (W - 150) / w1);
    const s = this.slam(t, t0, n === 4 ? 0.3 : 0.16);
    const w = w1 * size;
    const base = H / 2 + (size * CAP) / 2;
    this.guides(c, base, size * CAP, ink);
    c.save();
    c.translate(W / 2, base);
    c.scale(s, s);
    if (n === 4) this.echoes(c, 'I’M', fam, size, -w / 2, 0, t, t0);
    c.font = font(fam, size);
    c.fillStyle = rgba(ink);
    c.fillText('I’M', -w / 2, 0);
    c.restore();
  }

  private drawUP(c: CanvasRenderingContext2D, t: number, ink: Col) {
    const n = this.n, t0 = this.ws[1]!, t1 = this.ws[2] ?? t0 + 0.4;
    const fam = this.f.up;
    const size = Math.min(900, (W - 150) / (this.upLay.width / 100));
    const lay = layout('UPPING', fam, size);
    const x0 = (W - lay.width) / 2;
    const capH = size * CAP;
    const endY = H / 2 + capH / 2 - 30;
    const hold = t1 - t0;
    const dur = Math.min(0.3, hold * 0.8);
    const stagger = Math.min(0.035, hold * 0.08);
    // hook 4 holds "upping" ~1 s: the word launches again on every 8th note, a stream of rising copies
    const period = n === 4 ? this.ctx.audio.timeOfBeat(this.ctx.audio.beatAt(t0) + 0.5) - t0 : 99;
    const reps = n === 4 ? Math.min(8, 1 + Math.floor(Math.max(0, t - t0) / Math.max(0.12, period))) : 1;
    this.guides(c, endY, capH, ink, 0.6);
    c.save();
    c.font = font(fam, size);
    const posAt = (i: number, tt: number, rep: number) => {
      const ts = t0 + i * stagger + rep * period;
      const k = clamp((tt - ts) / dur);
      const e = ease.outExpo(k);
      const drift = Math.max(0, tt - ts - dur) * (n === 4 ? 900 : 70); // keeps rising
      return { y: lerp(H + capH * 1.3, endY, e) - drift, ts };
    };
    for (let rep = reps - 1; rep >= 0; rep--) {
      for (let i = 0; i < lay.glyphs.length; i++) {
        const g = lay.glyphs[i]!;
        const p = posAt(i, t, rep);
        if (t < p.ts || p.y < -80) continue;
        const pPrev = posAt(i, t - 1 / 60, rep);
        const vel = Math.abs(pPrev.y - p.y) * 60; // px/s
        const stretch = 1 + clamp(vel / 5000, 0, 1.3);
        const x = x0 + g.x;
        const trail = clamp(vel / 3000);
        if (trail > 0.02) {
          c.strokeStyle = rgba(ink, 0.55 * trail);
          c.lineWidth = 1.5;
          for (let j = 1; j <= 4; j++) {
            c.save(); c.translate(x, p.y + j * vel * 0.012); c.scale(1, stretch); c.strokeText(g.ch, 0, 0); c.restore();
          }
        }
        c.save();
        c.translate(x, p.y);
        c.scale(1, stretch);
        c.fillStyle = rgba(ink);
        if (n === 4 && rep < reps - 1) { c.strokeStyle = rgba(ink, 0.9); c.lineWidth = 3; c.strokeText(g.ch, 0, 0); }
        else c.fillText(g.ch, 0, 0);
        c.restore();
      }
    }
    c.restore();
  }

  private drawMY(c: CanvasRenderingContext2D, t: number, ink: Col) {
    const n = this.n, t0 = this.ws[2]!;
    const fam = this.f.my;
    const size = n === 1 ? 1300 : 1420;
    const s = this.slam(t, t0, n === 4 ? 0.3 : 0.12);
    const w = measure('MY', fam, size);
    const base = H / 2 + (size * CAP) / 2;
    this.guides(c, base, size * CAP, ink);
    c.save();
    c.translate(W / 2, base);
    c.scale(s, s);
    if (n === 4) this.echoes(c, 'MY', fam, size, -w / 2, 0, t, t0);
    c.font = font(fam, size);
    c.fillStyle = rgba(ink);
    c.fillText('MY', -w / 2, 0);
    c.restore();
  }

  /** Width of the maths-set P(DOOM) at a given em size. */
  private pdWidth(size: number, hair = false) {
    const f = this.f;
    return (measure('P', this.pFam(hair), size) + size * P_GAP + measure('(', f.paren, size * 1.25) * 2 + measure('DOOM', hair ? f.hairW : f.doom, size) + size * 0.03);
  }
  /** The P of P(DOOM): bold italic, or the light italic for the hairline variant. */
  private pFam(hair: boolean) { return hair ? F.archivoItalic(100, 400) : this.f.P; }
  /**
   * P(DOOM) set like a maths expression: italic P, hairline stretched delimiters, heavy DOOM.
   * Anchored at the left baseline. `lit` (0..1) karaoke for "DOOM)".
   */
  private drawPD(c: CanvasRenderingContext2D, x: number, base: number, size: number, ink: Col, lit: number, hair = false, doomCol?: string) {
    const f = this.f;
    c.fillStyle = rgba(ink);
    c.font = font(this.pFam(hair), size);
    c.fillText('P', x, base);
    x += measure('P', this.pFam(hair), size) + size * P_GAP;
    const psz = size * 1.25;
    c.font = font(f.paren, psz);
    c.fillText('(', x, base + psz * 0.12);
    x += measure('(', f.paren, psz);
    c.fillStyle = rgba(ink, lerp(this.n === 2 ? 0.3 : 0.2, 1, lit));
    c.font = font(hair ? f.hairW : f.doom, size);
    const pc = c.fillStyle;
    if (doomCol) c.fillStyle = doomCol;
    c.fillText('DOOM', x, base);
    c.fillStyle = pc;
    x += measure('DOOM', hair ? f.hairW : f.doom, size) + size * 0.03;
    c.font = font(f.paren, psz);
    c.fillText(')', x, base + psz * 0.12);
  }

  private drawPDFull(c: CanvasRenderingContext2D, t: number, ink: Col) {
    const n = this.n, t0 = this.tP;
    const size = (W - 190) / (this.pdWidth(100) / 100);
    const s = this.slam(t, t0, n === 4 ? 0.25 : 0.12);
    const w = this.pdWidth(size);
    const base = H / 2 + (size * CAP) / 2;
    this.guides(c, base, size * CAP, ink);
    c.save();
    c.translate(W / 2, base);
    c.scale(s, s);
    if (n === 4) {
      c.save();
      for (let j = 3; j >= 1; j--) {
        const sc = 1 + j * 0.07 * (1 + (t - t0) * 3);
        c.save(); c.scale(sc, sc); c.globalAlpha = 0.28 - j * 0.07;
        this.drawPD(c, -w / 2, 0, size, j % 2 ? 'signal' : 'bone', 1);
        c.restore();
      }
      c.restore();
    }
    this.drawPD(c, -w / 2, 0, size, ink, t >= this.tDoom ? 1 : 0);
    c.restore();
  }

  /** Stacked outline echoes (hook 4). */
  private echoes(c: CanvasRenderingContext2D, s: string, fam: string, size: number, x: number, y: number, t: number, t0: number) {
    c.save();
    c.font = font(fam, size);
    const age = t - this.retrig(t, t0);
    for (let j = 6; j >= 1; j--) {
      const sc = 1 + j * 0.07 * (1 + age * 2.5);
      c.save();
      c.scale(sc, sc);
      c.strokeStyle = rgba(j % 2 ? 'signal' : 'bone', 0.6 - j * 0.07);
      c.lineWidth = 2 / sc;
      c.strokeText(s, x, y);
      c.restore();
    }
    c.restore();
  }

  /** Hook 3: tiny hairline words in a lot of black; earlier words climb away above, fading. */
  private drawTiny(c: CanvasRenderingContext2D, t: number, wi: number, fade = 1, skip = -1) {
    const labels = ['I’M', 'UPPING', 'MY', 'P(DOOM)'];
    const fam = this.f.hair, size = 54, track = 16, gap = 84;
    const cy = H / 2 + (size * CAP) / 2;
    for (let i = 0; i <= wi; i++) {
      if (i === skip) continue;
      const since = t - this.ws[i]!;
      const cur = i === wi;
      // the stack scrolls up one slot per new word (eased), plus a slow drift
      let slot = 0;
      for (let j = i + 1; j <= wi; j++) slot += ease.outExpo(clamp((t - this.ws[j]!) / 0.3));
      // each new word rises into its slot from below (UPPING from further), clear of the one leaving
      const rise = -(1 - ease.outExpo(clamp(since / 0.3))) * (i === 1 ? gap : gap * 0.5);
      const y = cy - slot * gap - rise - since * 8;
      const a = (cur ? 0.95 : 0.22 / slot) * fade;
      c.save();
      c.fillStyle = rgba('bone', a);
      const s = labels[i]!;
      if (s === 'P(DOOM)') {
        c.globalAlpha = fade;
        this.drawPD(c, W / 2 - this.pdWidth(size, true) / 2, y, size, 'bone', t >= this.tDoom ? 1 : 0, true);
      } else {
        c.font = font(fam, size);
        c.letterSpacing = `${track}px`;
        const w = measure(s, fam, size, track) - track;
        c.fillText(s, W / 2 - w / 2, y);
      }
      c.restore();
    }
    c.fillStyle = rgba('bone', 0.1 * fade);
    c.fillRect(W / 2 - 360, cy + 26, 720, 1);
  }

  private drawAnnotations(c: CanvasRenderingContext2D, t: number, wi: number, ink: Col) {
    c.save();
    c.font = font(this.f.monoM, 13);
    c.letterSpacing = '3px';
    const labels = ["I'M", 'UPPING', 'MY', 'P(DOOM)']; // mono UI legend: typewriter apostrophe
    let x = 96;
    labels.forEach((l, i) => {
      const s = `${String(i + 1).padStart(2, '0')} ${l}`;
      c.fillStyle = i === wi ? rgba(ink === 'ink' ? 'ink' : 'signal', 1) : rgba(ink, 0.4);
      c.fillText(s, x, 84);
      x += measure(s, this.f.monoM, 13, 3) + 36;
    });
    c.textAlign = 'right';
    c.fillStyle = rgba(ink, 0.5);
    c.fillText(`HOOK ${this.n} / 4`, W - 96, 84);
    c.restore();
    void t;
  }

  // ------------------------------------------------------------------ the number
  /**
   * Displayed value: rolls from the previous step to this hook's value (PDoom steps) in time to land
   * on the beat; hook 4 then keeps counting 9s.
   */
  private shown(t: number) {
    const k = prog(t, this.tRoll0, this.tRoll1, this.n === 3 ? ease.inOutCubic : ease.outCubic);
    const v = lerp(this.dPrev, this.dNew, k);
    if (this.n !== 4) return v;
    return lerp(v, Math.max(v, 0.999), prog(t, this.tRoll1 + 0.005, this.tRoll1 + 0.05, ease.outCubic));
  }
  /** Hook 4: how many extra 9s have been appended (one every 18 ms once 0.999 is reached). */
  private extra9(t: number) {
    if (this.n !== 4) return 0;
    const t9 = this.tRoll1 + 0.06;
    return t >= t9 ? Math.min(30, 1 + Math.floor((t - t9) / 0.018)) : 0;
  }
  /** Where the label glides in from: the word as it was last set (full-width slam, or the tiny ladder). */
  private labelFrom(t: number) {
    const n = this.n;
    if (n === 3) {
      const size = 54;
      const rise = (1 - ease.outExpo(clamp((t - this.tP) / 0.3))) * 42; // as drawTiny sets a new word
      return { x: W / 2 - this.pdWidth(size, true) / 2, base: H / 2 + (size * CAP) / 2 - (t - this.tP) * 8 + rise, size };
    }
    if (n === 1 || n === 4) {
      const size = (W - 190) / (this.pdWidth(100) / 100);
      return { x: W / 2 - this.pdWidth(size) / 2, base: H / 2 + (size * CAP) / 2, size };
    }
    return { x: BIG.labX, base: BIG.labY, size: BIG.labSize };
  }

  private drawNumberPhase(c: CanvasRenderingContext2D, t: number, ink: Col) {
    const n = this.n;
    this.lw = 1;
    if (n === 1) {
      // lands on DOOM; implodes into a spark on the next 8th; a centred P(DOOM) bursts out of it
      const R = ROOM.root;
      if (t < this.tSlam) {
        const k = prog(t, this.tX0, this.tX1, ease.inCubic);
        c.save();
        if (k > 0) { c.translate(R.x, R.y); c.scale(1 - k, 1 - k); c.translate(-R.x, -R.y); }
        this.drawInstrument(c, t, ink);
        c.restore();
        if (k > 0.02) sparkHead2D(c, R.x, R.y, t, 0.4 + 1.8 * k);
      } else {
        this.drawFinalPD(c, t);
      }
    } else if (n === 2) {
      // the field closes like an eyelid onto FIG. 6's glowing seam
      const e = prog(t, this.tX0, this.tX1);
      if (e <= 0) { this.drawInstrument(c, t, ink); return; }
      const S = eyePx(0, 0), P0 = eyePx(-1, -EYE.TILT), P1 = eyePx(1, EYE.TILT);
      const th = Math.atan2(P1.y - P0.y, P1.x - P0.x);
      const G = { x: BIG.numX + (4 * PADV * BIG.numSize) / 2, y: BIG.numC };
      const eo = ease.outCubic(e);
      c.save();
      c.translate(lerp(G.x, S.x, eo), lerp(G.y, S.y, eo));
      c.rotate(th * eo);
      c.scale(lerp(1, 0.55, eo), Math.max(0.002, (1 - e) * (1 - e)));
      c.translate(-G.x, -G.y);
      this.drawInstrument(c, t, ink);
      c.restore();
      this.drawLids(c, e);
    } else if (n === 3) {
      // burns out, filament by filament
      this.drawInstrument(c, t, ink);
    } else {
      // the 9s become a thread; the thread switches off into the loom's weft line
      const k = prog(t, this.tX0, this.tX1);
      if (k <= 0) { this.drawInstrument(c, t, ink); return; }
      const ex = this.extra9(t);
      const { size } = this.numFit(ex);
      const sw = (5 + ex) * size * PADV; // "0.999" + 9s
      const G = { x: BIG.numX + sw / 2, y: BIG.numC };
      const sy = Math.pow(1 - k, 3);
      c.save();
      c.translate(lerp(G.x, W / 2, ease.outCubic(k)), lerp(G.y, THREAD.y, ease.outCubic(k)));
      c.scale(lerp(1, (W + 40) / sw, ease.inCubic(k)), Math.max(0.003, sy));
      c.translate(-G.x, -G.y);
      this.drawInstrument(c, t, ink);
      c.restore();
      // the thread itself: bone, full width, hot at the shuttle
      const a = smoothstep(0.25, 0.85, k);
      c.fillStyle = rgba('bone', a);
      c.fillRect(0, THREAD.y - 1, W, 2);
      c.fillStyle = rgba('signal', 0.5 * a);
      c.fillRect(0, THREAD.y - 3, W, 1);
      if (k > 0.5) sparkHead2D(c, THREAD.sparkX, THREAD.y - 6, t, smoothstep(0.5, 1, k) * 0.9);
    }
  }

  /** Hook 1's last word: a plain centred P(DOOM) (FIG. 3a's geometry), bursting out of the spark, then draining to its outline. */
  private drawFinalPD(c: CanvasRenderingContext2D, t: number) {
    const R = ROOM.root, size = ROOM.size, fam = this.f.doom;
    const lay = this.finLay;
    const ox = W / 2 - lay.width / 2, oy = H / 2 + size * 0.36;
    const e = prog(t, this.tSlam, this.tSlam + 0.14);
    const s = e >= 1 ? 1 : lerp(0.1, 1, ease.outBack(e, 1.3));
    const end = this.ctx.end;
    const drain = smoothstep(end - 0.075, end - 0.012, t);
    c.save();
    c.translate(R.x, R.y); c.scale(s, s); c.translate(-R.x, -R.y);
    c.font = font(fam, size);
    // per glyph at the layout's positions (FIG. 3a builds its outline the same way)
    c.fillStyle = rgba('bone', 0.94 * (1 - drain));
    for (const g of lay.glyphs) c.fillText(g.ch, ox + g.x, oy);
    const lineA = smoothstep(end - 0.11, end - 0.04, t);
    if (lineA > 0) {
      c.lineJoin = 'round';
      c.strokeStyle = rgba('bone', lineA);
      c.lineWidth = 2.6 / s;
      for (const g of lay.glyphs) c.strokeText(g.ch, ox + g.x, oy);
    }
    c.restore();
    // the spark stays at the root (FIG. 3a's spark is born there)
    sparkHead2D(c, R.x, R.y, t, lerp(2.2, 0.75, prog(t, this.tSlam, this.tSlam + 0.16, ease.outCubic)));
  }

  /** Hook 2: ink lids closing onto the eye's seam (FIG. 6's opening camera and orbit). */
  private drawLids(c: CanvasRenderingContext2D, e: number) {
    const A = EYE.A * (1 + 2.6 * (1 - e));
    const h = Math.max(0.012, 4.4 * (1 - e) * (1 - e));
    const K = (x: number) => { const q = x / A; return Math.abs(q) < 1 ? Math.pow(1 - q * q, 0.62) : 0; };
    const up: { x: number; y: number }[] = [], dn: { x: number; y: number }[] = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const x = lerp(-3.4, 3.6, i / N);
      up.push(eyePx(x, EYE.TILT * x + h * EYE.HU * K(x)));
      dn.push(eyePx(x, EYE.TILT * x - h * EYE.HL * K(x)));
    }
    c.save();
    c.fillStyle = rgba('ink', 1);
    c.beginPath();
    up.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.lineTo(W + 100, -100); c.lineTo(-100, -100); c.closePath(); c.fill();
    c.beginPath();
    dn.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.lineTo(W + 100, H + 100); c.lineTo(-100, H + 100); c.closePath(); c.fill();
    // lash lines (engraved edge of each lid, only where the lids are apart)
    c.strokeStyle = rgba('bone', 0.3 * (1 - smoothstep(0.6, 0.95, e)));
    c.lineWidth = 1.5;
    for (const [sgn, H0] of [[1, EYE.HU], [-1, EYE.HL]] as const) {
      c.beginPath();
      for (let i = 0; i <= N; i++) {
        const x = lerp(-A, A, i / N);
        const p = eyePx(x, EYE.TILT * x + sgn * h * H0 * K(x));
        if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y);
      }
      c.stroke();
    }
    // light through the closing seam
    const a = smoothstep(0.3, 0.9, e);
    if (a > 0) {
      const p0 = eyePx(-A, -EYE.TILT * A), p1 = eyePx(A, EYE.TILT * A);
      c.lineCap = 'round';
      c.strokeStyle = rgba('signal', 0.35 * a); c.lineWidth = 9;
      c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
      c.strokeStyle = rgba('signal', a); c.lineWidth = 3;
      c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
    }
    c.restore();
  }

  /** Hook 3: the number's ghost, waiting behind the tiny words (hairline, barely there). */
  private drawGhost(c: CanvasRenderingContext2D, t: number) {
    if (t >= this.tNum) return;
    const a = 0.1 * smoothstep(this.ws[0]!, this.ws[0]! + 0.5, t);
    if (a <= 0.003) return;
    const size = HAIR.numSize;
    c.save();
    c.strokeStyle = rgba('bone', a);
    c.lineWidth = 1.2;
    c.font = font(this.f.monoL, size);
    c.strokeText(formatPDoom(this.dPrev), HAIR.numX, HAIR.numC + (size * PCAP) / 2);
    c.restore();
  }

  /** Size and baseline of the digits (hook 4 shrinks the type to fit the multiplying 9s). */
  private numFit(extra: number) {
    const B = this.n === 3 ? HAIR : BIG;
    const chars = 5 + extra;
    const size = extra > 0 ? Math.min(B.numSize, (W - 180) / (chars * PADV)) : B.numSize;
    return { size, base: B.numC + (size * PCAP) / 2 };
  }

  private drawInstrument(c: CanvasRenderingContext2D, t: number, ink: Col) {
    const n = this.n;
    const hair = n === 3;
    const B = hair ? HAIR : BIG;
    const age = t - this.tNum;
    const v = this.shown(t), vPrev = this.shown(t - 1 / 60);
    const inkSignal = ink === 'ink';
    // hook 3 burns out: each element goes at its own moment (label and bar first, then the digits)
    // (bar first, then the digits in a fixed shuffled order; the label last, flaring on the sung DOOM)
    const burn = (i: number): { col: string; a: number } => {
      if (!hair) return { col: '', a: 1 };
      const RANK = [3, 1, 0, 2];
      const span = Math.max(0.02, this.tX1 - 0.05 - (this.tX0 + 0.025));
      const tb = i === -2 ? this.tX0 : i === -1 ? this.tDoom : this.tX0 + 0.025 + (span * (RANK[i] ?? 3)) / 3;
      const heat = prog(t, tb - 0.03, tb + 0.01);
      const out = i === -1 ? 0.6 * prog(t, tb + 0.01, this.ctx.end) : prog(t, tb, tb + 0.05, ease.inQuad);
      const flick = 0.55 + 0.45 * hash(frameIdx(t), i + 3);
      const a = (1 - out) * (heat > 0 && out > 0 ? flick : 1) * (1 + 0.6 * heat * (1 - out));
      const k = Math.min(1, heat * 1.3);
      const col = k > 0 ? `rgb(${Math.round(lerp(242, 255, k))},${Math.round(lerp(236, 92, k))},${Math.round(lerp(228, 36, k))})` : rgba('bone');
      return { col, a: Math.min(1, a) * (i < 0 ? 1 : 0.92) };
    };
    const appear = hair ? prog(age, 0, 0.1) : 1;

    // ---- label: maths P(DOOM) gliding in from where the word was last set
    const m = n === 2 ? 1 : hair ? prog(t, this.tNum + 0.02, this.tNum + 0.16, ease.inOutCubic) : prog(t, this.tNum, this.tNum + 0.14, ease.outExpo);
    const from = this.labelFrom(t);
    const ls = Math.exp(lerp(Math.log(from.size), Math.log(B.labSize), m));
    c.save();
    const lb = burn(-1);
    c.globalAlpha = lb.a;
    this.drawPD(c, lerp(from.x, B.labX, m), lerp(from.base, B.labY, m), ls, ink, t >= this.tDoom ? 1 : 0, hair, hair && t >= this.tDoom ? lb.col : undefined);
    c.restore();
    const bb = burn(-2);

    // ---- bar + ticks (drawn on left to right as the instrument arrives)
    const d = prog(age, 0, hair ? 0.2 : 0.16, ease.outExpo);
    const bx = B.barX, by = B.barY, bw = B.barW;
    const th = hair ? 1 : 2;
    c.save();
    c.globalAlpha = appear * bb.a;
    c.fillStyle = rgba(ink, hair ? 0.35 : 0.43);
    c.fillRect(bx, by, bw * d, th);
    for (let i = 0; i <= 10 * d; i++) {
      const hh = (i % 5 === 0 ? 5 : 3) * (hair ? 3 : 4);
      c.fillRect(bx + (bw * i) / 10, by - hh, th, hh);
    }
    c.font = font(this.f.mono, 13);
    c.fillStyle = rgba(ink, 0.55 * smoothstep(0.3, 0.9, d));
    for (const i of [0, 5, 10]) c.fillText((i / 10).toFixed(2), bx + (bw * i) / 10 - (i === 10 ? 30 : i === 5 ? 15 : 0), by + 26);
    c.textAlign = 'right';
    const dd = this.dNew - this.dPrev;
    // U+2206 INCREMENT: Plex Mono has it, not the Greek Δ (which would fall back to a system font)
    c.fillText(`\u2206 ${dd >= 0 ? '+' : '−'}${Math.abs(dd).toFixed(2)} · ${NOTES[n] ?? ''}`, bx + bw, by + 50);
    c.textAlign = 'left';
    c.fillStyle = hair ? rgba('bone', 0.9) : inkSignal ? rgba('ink', 1) : rgba('signal', 1);
    c.fillRect(bx, by - (hair ? 1 : 3), bw * clamp(v) * d, hair ? 3 : 9);
    c.restore();

    // ---- the number (slams in; hook 3 fades in)
    const extra = this.extra9(t);
    const { size, base } = this.numFit(extra);
    const numCol = inkSignal ? rgba('ink', 1) : hair ? rgba('bone', 0.9) : rgba('signal', 1);
    const s = hair ? 1 : 1 + 0.1 * (1 - ease.outExpo(clamp(age / 0.16)));
    c.save();
    const cx = B.numX + (4 * PADV * size) / 2, cy = B.numC;
    c.translate(cx, cy); c.scale(s, s); c.translate(-cx, -cy);
    c.globalAlpha = appear;
    c.fillStyle = numCol; c.strokeStyle = numCol;
    this.drawDigits(c, B.numX, base, size, v, vPrev, extra, hair, hair ? burn : undefined);
    c.restore();
  }

  /** Rolling number: each digit on a drum (continuous value), formatted like formatPDoom, plus hook 4's 9s. */
  private drawDigits(c: CanvasRenderingContext2D, x: number, y: number, size: number, v: number, vPrev: number, extra: number, hair: boolean, style?: Style) {
    const dec = formatPDoom(v).length - 2;
    const scale = Math.pow(10, dec);
    const N = v * scale, Np = vPrev * scale;
    const adv = size * PADV;
    const rowH = size * 1.05;
    const a0 = c.globalAlpha;
    const glyph = (s: string, gx: number, gy: number) => {
      if (hair) { c.lineWidth = 1.4 * this.lw; c.strokeText(s, gx, gy); } else c.fillText(s, gx, gy);
    };
    const apply = (i: number) => {
      if (!style) return 1;
      const st = style(i);
      c.fillStyle = st.col; c.strokeStyle = st.col;
      return st.a;
    };
    c.font = font(hair ? this.f.monoL : this.f.mono, size);
    let sa = apply(0); c.globalAlpha = a0 * sa; glyph('0', x, y);
    sa = apply(1); c.globalAlpha = a0 * sa; glyph('.', x + adv, y);
    for (let d = 0; d < dec; d++) {
      const kp = dec - 1 - d; // 0 = last digit
      const pos = drum(N, kp), posP = drum(Np, kp);
      const speed = Math.abs(pos - posP) * 60;
      const xx = x + adv * (2 + d);
      sa = apply(2 + d);
      c.save();
      c.beginPath();
      c.rect(xx - 6, y - size * PCAP - size * 0.3, adv + 12, size * PCAP + size * 0.6);
      c.clip();
      const base = Math.floor(pos), fr = pos - base;
      const blur = clamp(speed / 25, 0, 1);
      for (let j = -1; j <= 1; j++) {
        const dig = (((base + j) % 10) + 10) % 10;
        const off = (fr - j) * rowH;
        const a = (1 - Math.min(1, Math.abs(off) / (rowH * 0.85))) * (hair && j !== 0 ? 0.5 : 1);
        if (a <= 0.01) continue;
        const copies = blur > 0.05 && !hair ? 4 : 1;
        for (let q = 0; q < copies; q++) {
          c.globalAlpha = a0 * sa * a * (copies > 1 ? 0.4 : 1);
          glyph(String(dig), xx, y + off + (q - (copies - 1) / 2) * rowH * 0.07 * blur);
        }
      }
      c.restore();
    }
    // the multiplying 9s
    c.globalAlpha = a0;
    for (let e = 0; e < extra; e++) glyph('9', x + adv * (2 + dec + e), y);
    if (extra > 0) {
      // stacked outlines of the whole string (maximal)
      const s = '0.' + '9'.repeat(dec + extra);
      c.save();
      c.lineWidth = 1.5;
      for (let r = 1; r <= 4; r++) {
        c.globalAlpha = a0 * (0.35 - r * 0.07);
        c.strokeText(s, x, y - r * rowH * 0.34);
        c.strokeText(s, x, y + r * rowH * 0.34);
      }
      c.restore();
    }
  }
}

/** FIG. 6's eye space → canvas px (its opening camera). */
function eyePx(ex: number, ey: number) {
  const dx = ex - EYE.cx, dy = ey - EYE.cy;
  const cs = Math.cos(EYE.rot), sn = Math.sin(EYE.rot);
  const px = EYE.zoom * (cs * dx + sn * dy), py = EYE.zoom * (-sn * dx + cs * dy);
  return { x: W / 2 + px * (H / 2), y: H / 2 - py * (H / 2) };
}

/** Odometer drum position for the digit 10^k of a continuous count N. */
function drum(N: number, k: number) {
  const p = Math.pow(10, k);
  if (k === 0) {
    // detent: rests on the rounded digit (like toFixed), rolls continuously in between
    const r = Math.round(N), f = N - r;
    return (((r + Math.sign(f) * 0.5 * smoothstep(0.38, 0.5, Math.abs(f))) % 10) + 10) % 10;
  }
  const q = Math.floor(N / p);
  const rem = N - q * p;
  const carry = clamp(rem - (p - 0.5), 0, 1);
  return ((q % 10) + carry + 10) % 10;
}

function hexRGB(k: Col): [number, number, number] {
  const n = parseInt(HEX[k].slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lin(k: Col): [number, number, number] {
  return hexRGB(k).map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }) as [number, number, number];
}

const COMP = /* glsl */ `
uniform sampler2D tex; uniform vec3 bgCol; uniform float echo, hot, gain;
void main() {
  vec4 s = texture(tex, vUv);
  if (echo > 0.0) {
    // radial echo (zoom trails) for the maximal hook
    vec4 acc = vec4(0.0); float wsum = 0.0;
    for (int i = 0; i < 6; i++) {
      float k = float(i) / 5.0;
      vec4 e = texture(tex, mix(vUv, vec2(0.5), k * echo));
      float w = 1.0 - k * 0.8;
      acc += vec4(e.rgb * e.a, e.a) * w; wsum += w;
    }
    acc /= wsum;
    s = vec4(acc.rgb / max(acc.a, 1e-3), max(s.a, acc.a));
  }
  // signal-orange type glows (only the signal colour exceeds the bloom threshold); gain = white-hot
  float h = smoothstep(0.25, 0.7, s.r - s.g * 1.3);
  vec3 col = mix(bgCol, s.rgb * (1.0 + hot * h) * gain, s.a);
  fragColor = vec4(col, 1.0);
}`;
