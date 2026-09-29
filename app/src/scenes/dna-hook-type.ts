// DNA edition hooks — shared typography: the hook's word timing, giant word settings (plain runs and
// the maths-set P(DOOM) of the reference hook), a karaoke wipe that follows the voice syllable by
// syllable, and the P(doom) dial (the lyric's own readout, never a biological quantity).
import * as THREE from 'three';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { FSPass, W, H, makeRT } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, glyphX, measure } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { PDoom, formatPDoom } from '../engine/hud';
import { clamp, ease, lerp, prog, smoothstep } from '../engine/util';
import { glyphPath } from './dna-kit';

export const CAP = 0.686; // Archivo cap height / em
export const PCAP = 0.698; // Plex Mono cap height / em
export const PADV = 0.6; // Plex Mono advance / em
/** Title-safe margin for lyric text. */
export const SAFE = 96;
export const ARCH_W = [125, 112.5, 100, 87.5, 75, 62];

// ------------------------------------------------------------------ the hook's words
export interface Hook {
  ctx: SceneCtx;
  n: number;
  line: Line;
  /** The four sung words (lyric data, untouched) and their display strings (capitals). */
  words: Word[];
  disp: string[];
  ws: number[];
  /** "P(" and "DOOM" syllable starts; the sung end of the line. */
  tP: number; tDoom: number; tLineEnd: number;
  /** The line still being sung when the slot opens (its tail is shown). */
  carry: Line;
  /** P(doom) before and after this hook's step (engine PDoom steps). */
  vPrev: number; vNew: number;
}

export function hookData(ctx: SceneCtx): Hook {
  const n = Number(ctx.params.n ?? 1);
  const ly = ctx.lyrics;
  const line = ly.get("I'm upping", n - 1);
  const words = line.words.slice(0, 4);
  const disp = words.map((w) => w.w.toUpperCase());
  const wP = words[3]!;
  const tDoom = wP.syl && wP.syl.length > 1 ? wP.syl[1]![0] : wP.start + 0.4 * (wP.end - wP.start);
  const pd = new PDoom(ly);
  const step = pd.steps.find((s) => s.t >= wP.start - 0.01) ?? pd.steps[pd.steps.length - 1]!;
  const i = pd.steps.indexOf(step);
  return {
    ctx, n, line, words, disp, ws: words.map((w) => w.start), tP: wP.start, tDoom, tLineEnd: line.end,
    carry: ly.lines[line.i - 1]!, vPrev: pd.steps[Math.max(0, i - 1)]!.v, vNew: step.v,
  };
}

/** Index of the hook word being shown at t (-1 before the first). */
export function wordIdx(h: Hook, t: number) {
  let i = -1;
  for (let k = 0; k < h.ws.length; k++) if (t >= h.ws[k]! - 1e-4) i = k;
  return i;
}

export interface Stage {
  init(): void | Promise<void>;
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides;
}

// ------------------------------------------------------------------ settings
export interface Piece { s: string; fam: string; size: number; x: number; dy: number }
/** A word set for display: pieces (one per font), char boundaries in x, cap height, syllable split. */
export interface Setting {
  text: string; pieces: Piece[]; width: number; size: number; cap: number;
  /** x of each char boundary (length = chars + 1), relative to the setting's left edge. */
  charX: number[];
  /** Characters sung on the first syllable of a two-syllable word (P( of P(DOOM)); 0 = none. */
  split: number;
}

export function setPlain(text: string, fam: string, size: number): Setting {
  const n = Array.from(text).length;
  const width = measure(text, fam, size);
  const charX = Array.from({ length: n + 1 }, (_, i) => (i >= n ? width : glyphX(text, i, fam, size)));
  return { text, pieces: [{ s: text, fam, size, x: 0, dy: 0 }], width, size, cap: size * CAP, charX, split: 0 };
}

/** Space between the italic P and "(" (em), set by eye (the italic P's bowl overhangs its advance). */
const P_GAP = 0.05;
/**
 * P(DOOM) set like a maths expression (the reference hook's identity): italic P, light stretched
 * parentheses, heavy DOOM. `tail` is trailing punctuation from the lyric (hook 3 has a comma).
 */
export function setPD(size: number, o: { doom?: string; p?: string; paren?: string; tail?: string } = {}): Setting {
  const pF = o.p ?? F.archivoItalic(100, 800), dF = o.doom ?? F.archivo(100, 900), paF = o.paren ?? F.archivo(62, 300);
  const psz = size * 1.25;
  const pieces: Piece[] = [];
  const charX: number[] = [0];
  let x = 0;
  const wP = measure('P', pF, size);
  pieces.push({ s: 'P', fam: pF, size, x, dy: 0 });
  x += wP + size * P_GAP; charX.push(x);
  const wo = measure('(', paF, psz);
  pieces.push({ s: '(', fam: paF, size: psz, x, dy: psz * 0.12 });
  x += wo; charX.push(x);
  pieces.push({ s: 'DOOM', fam: dF, size, x, dy: 0 });
  for (let i = 1; i < 4; i++) charX.push(x + glyphX('DOOM', i, dF, size));
  x += measure('DOOM', dF, size) + size * 0.03; charX.push(x);
  pieces.push({ s: ')', fam: paF, size: psz, x, dy: psz * 0.12 });
  x += measure(')', paF, psz); charX.push(x);
  if (o.tail) {
    pieces.push({ s: o.tail, fam: dF, size, x, dy: 0 });
    x += measure(o.tail, dF, size); charX.push(x);
  }
  return { text: 'P(DOOM)' + (o.tail ?? ''), pieces, width: x, size, cap: size * CAP, charX, split: 2 };
}

/** Largest setting of a plain word inside maxW × maxCap, trying Archivo widths (ties: the widest). */
export function fitPlain(text: string, weight: number, maxW: number, maxCap: number, widths = ARCH_W): Setting {
  let best: Setting | null = null;
  for (const wd of widths) {
    const fam = F.archivo(wd, weight);
    const u = measure(text, fam, 100) / 100;
    const size = Math.min(maxCap / CAP, maxW / u);
    if (!best || size > best.size + 0.5) best = setPlain(text, fam, size);
  }
  return best!;
}
export function fitPD(maxW: number, maxCap: number, o: { weight?: number; widths?: number[]; tail?: string } = {}): Setting {
  let best: Setting | null = null;
  for (const wd of o.widths ?? ARCH_W) {
    const doom = F.archivo(wd, o.weight ?? 900);
    const u = setPD(100, { doom, tail: o.tail }).width / 100;
    const size = Math.min(maxCap / CAP, maxW / u);
    if (!best || size > best.size + 0.5) best = setPD(size, { doom, tail: o.tail });
  }
  return best!;
}

/** The hook's display word k as a setting that fits the box (P(DOOM) maths-set). */
export function fitHookWord(h: Hook, k: number, maxW: number, maxCap: number, weight = 900, widths = ARCH_W): Setting {
  const d = h.disp[k]!;
  if (k === 3) return fitPD(maxW, maxCap, { weight, widths, tail: d.endsWith(',') ? ',' : undefined });
  return fitPlain(d, weight, maxW, maxCap, widths);
}

/** Outline of a setting (for mattes and shadows) at (x, baseline). */
export function settingPath(s: Setting, x = 0, base = 0): Path2D {
  const p = new Path2D();
  for (const pc of s.pieces) p.addPath(glyphPath(pc.s, pc.fam, pc.size, x + pc.x, base + pc.dy));
  return p;
}

export function drawSetting(c: CanvasRenderingContext2D, s: Setting, x: number, base: number) {
  for (const pc of s.pieces) { c.font = font(pc.fam, pc.size); c.fillText(pc.s, x + pc.x, base + pc.dy); }
}

/**
 * Sung characters of `w` at t, drawn as setting `s`. Syllabled words light their own characters per
 * syllable (P( on "P", DOOM) on "DOOM"), so the wipe follows the voice, never ahead of it.
 */
export function sungCharsSet(s: Setting, w: Word, t: number): number {
  const n = s.charX.length - 1;
  if (w.syl && w.syl.length === 2 && s.split > 0) {
    const [a, b] = w.syl as [[number, number], [number, number]];
    if (t < a[1]) return s.split * clamp((t - a[0]) / Math.max(1e-3, a[1] - a[0]));
    return s.split + (n - s.split) * clamp((t - b[0]) / Math.max(1e-3, b[1] - b[0]));
  }
  return n * Lyrics.wordProgress(w, t);
}
/** x of the karaoke wipe inside the setting (0..width). */
export function wipeX(s: Setting, w: Word, t: number) {
  const k = sungCharsSet(s, w, t), n = s.charX.length - 1, i = Math.floor(k);
  if (i >= n) return s.width;
  if (k <= 0) return 0;
  return lerp(s.charX[i]!, s.charX[i + 1]!, k - i);
}
/** Song time at which the wipe of `w` reaches x (relative to the setting), or null if never. */
export function wipeTime(s: Setting, w: Word, x: number): number | null {
  if (x < 0 || x > s.width) return null;
  let a = w.start, b = w.end;
  if (wipeX(s, w, b) < x) return null;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (wipeX(s, w, m) < x) a = m; else b = m; }
  return b;
}

export interface KOpts {
  /** Palette key of the sung colour; unsung is the same at `dim` alpha. */
  on?: string; dim?: number; alpha?: number;
  /** Fill the whole word in this colour first (so the unsung part still occludes what is behind). */
  knock?: string;
}
/**
 * One sung word as a giant setting: dim until sung, then a left-to-right wipe that follows the voice
 * (the house karaoke rule of dna-kit's karaokeRow, for multi-font settings). Returns the wipe x.
 */
export function karaokeSet(c: CanvasRenderingContext2D, s: Setting, w: Word, x: number, base: number, t: number, o: KOpts = {}): number {
  const a = o.alpha ?? 1;
  if (a <= 0.001) return 0;
  const on = o.on ?? 'bone';
  if (o.knock) { c.fillStyle = rgba(o.knock, a); drawSetting(c, s, x, base); }
  c.fillStyle = rgba(on, (o.dim ?? 0.3) * a);
  drawSetting(c, s, x, base);
  const xs = wipeX(s, w, t);
  if (xs > 0) {
    c.save();
    c.beginPath(); c.rect(x - s.size, base - s.size * 1.6, xs + s.size, s.size * 2.4); c.clip();
    c.fillStyle = rgba(on, a);
    drawSetting(c, s, x, base);
    c.restore();
  }
  return xs;
}

// ------------------------------------------------------------------ the P(doom) dial
/** Displayed P(doom): rolls from the previous step to this hook's value, landing on the DOOM syllable. */
export function dialValue(h: Hook, t: number) {
  return lerp(h.vPrev, h.vNew, prog(t, h.tP + 0.02, h.tDoom, ease.inOutCubic));
}

export interface DialOpts {
  k?: number;
  label?: string; digits?: string; track?: string; fill?: string;
  /** Hairline digits (Plex Mono Light). */
  light?: boolean;
  alpha?: number;
  /** Bar width at k = 1 (px). */
  barW?: number;
}
/**
 * The P(doom) instrument (after engine/hud drawReadout): mono label, odometer digits, tick bar.
 * (x, y) = left end of the digits' baseline. It dresses the lyric; it never measures biology.
 */
export function drawDial(c: CanvasRenderingContext2D, x: number, y: number, v: number, o: DialOpts = {}) {
  const k = o.k ?? 1, a = o.alpha ?? 1;
  if (a <= 0.001) return;
  c.save();
  c.globalAlpha = a;
  c.textBaseline = 'alphabetic';
  c.font = font(F.mono(500), 13 * k);
  c.letterSpacing = `${3 * k}px`;
  c.fillStyle = o.label ?? rgba('bone', 0.6);
  c.fillText('P(DOOM)', x, y - 44 * k);
  c.letterSpacing = '0px';
  const size = 40 * k;
  c.fillStyle = o.digits ?? rgba('bone', 0.92);
  drawDigits(c, x - 2 * k, y, size, v, o.light ?? false, a);
  const bw = (o.barW ?? 220) * k, by = y + 16 * k, th = Math.max(1, k * 0.8);
  c.globalAlpha = a;
  c.fillStyle = o.track ?? rgba('bone', 0.22);
  c.fillRect(x, by, bw, th);
  for (let i = 0; i <= 10; i++) { const hh = (i % 5 === 0 ? 5 : 3) * k; c.fillRect(x + (bw * i) / 10, by - hh, th, hh); }
  c.fillStyle = o.fill ?? rgba('signal', 1);
  c.fillRect(x, by - k, bw * clamp(v), 3 * k);
  c.restore();
}

/** Odometer digits: each decimal on a drum (continuous value), formatted like formatPDoom. */
function drawDigits(c: CanvasRenderingContext2D, x: number, y: number, size: number, v: number, light: boolean, a0: number) {
  const dec = formatPDoom(v).length - 2;
  const N = v * Math.pow(10, dec);
  const adv = size * PADV, rowH = size * 1.05;
  c.font = font(F.mono(light ? 300 : 400), size);
  c.globalAlpha = a0;
  c.fillText('0', x, y);
  c.fillText('.', x + adv, y);
  for (let d = 0; d < dec; d++) {
    const pos = drum(N, dec - 1 - d), xx = x + adv * (2 + d);
    c.save();
    c.beginPath(); c.rect(xx - 4, y - size * PCAP - size * 0.12, adv + 8, size * PCAP + size * 0.24); c.clip();
    const b = Math.floor(pos), fr = pos - b;
    for (let j = -1; j <= 1; j++) {
      const off = (fr - j) * rowH;
      const al = 1 - Math.min(1, Math.abs(off) / (rowH * 0.85));
      if (al <= 0.01) continue;
      c.globalAlpha = a0 * al;
      c.fillText(String((((b + j) % 10) + 10) % 10), xx, y + off);
    }
    c.restore();
  }
}
/** Odometer drum position for the digit 10^k of a continuous count N (from the reference hook). */
function drum(N: number, k: number) {
  const p = Math.pow(10, k);
  if (k === 0) {
    const r = Math.round(N), f = N - r;
    return (((r + Math.sign(f) * 0.5 * smoothstep(0.38, 0.5, Math.abs(f))) % 10) + 10) % 10;
  }
  const q = Math.floor(N / p), rem = N - q * p;
  return ((q % 10) + clamp(rem - (p - 0.5), 0, 1) + 10) % 10;
}

// ------------------------------------------------------------------ backdrops
/** The ink ground with its raised centre (dna-kit makeBackdrop's ink branch, without the paper noise). */
export function inkBackdrop(raise = 0.5) {
  return new FSPass(/* glsl */ `
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      fragColor = vec4(C_INK + C_INK2 * ${raise.toFixed(3)} * (1.0 - smoothstep(0.1, 1.0, length(p))), 1.0);
    }`);
}
/** The ink ground and a Canvas2D layer in one pass (like the reference hook's compositor). */
export function inkWithLayer(raise = 0.5) {
  return new FSPass(/* glsl */ `
    uniform sampler2D tex;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 bg = C_INK + C_INK2 * ${raise.toFixed(3)} * (1.0 - smoothstep(0.1, 1.0, length(p)));
      vec4 s = texture(tex, vUv);
      fragColor = vec4(mix(bg, s.rgb, s.a), 1.0);
    }`, { tex: { value: null } });
}
/**
 * dna-kit's bone paper rendered once into a target: each frame copies it instead of re-evaluating the
 * fibre noise per pixel (a measurable cost on this machine).
 */
export class PaperCache {
  rt = makeRT();
  private copy = new FSPass(/* glsl */ `uniform sampler2D tex; void main() { fragColor = vec4(texture(tex, vUv).rgb, 1.0); }`, { tex: { value: null } });
  private done = false;
  constructor(private src: FSPass) {}
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget) {
    if (!this.done) { this.src.render(renderer, this.rt); this.done = true; }
    this.copy.u.tex!.value = this.rt.texture;
    this.copy.render(renderer, out);
  }
}

// ------------------------------------------------------------------ small helpers
/** Word slam: 1 + amt at t0, easing to 1 over `dur`. */
export const slam = (t: number, t0: number, amt = 0.1, dur = 0.14) => 1 + amt * (1 - ease.outExpo(clamp((t - t0) / dur)));
/** Deterministic frame-level shake vector. */
export function shakeVec(t: number, amp: number): [number, number] {
  const k = Math.round(t * 60);
  const h = (i: number) => (Math.sin(k * 12.9898 + i * 78.233) * 43758.5453) % 1;
  return [h(1) * amp, h(2) * amp];
}
export { W, H };
