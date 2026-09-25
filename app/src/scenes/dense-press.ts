// dense, movements 1–2: "Post-Chinchilla, super-dense" / "Breaking through each safety fence".
// Typographic pressure, then release through the frame's own safe areas.
//  1. The lyric is packed into the broadcast title-safe rectangle. On each kick it is compressed
//     further (Archivo width axis 125 → 62, weight 300 → 900, tracking going negative) and more
//     copies stack up with collapsing leading, while a mono readout races tokens/param 20 → 20,000,
//     until the title-safe area is a solid slab of type straining against its hairline.
//  2. On the stressed words the type bursts through the fences one after another: title-safe
//     (the slab shatters it), action-safe, then the frame edge itself (the border bows out of
//     shot and the crop marks splay, then snap) and "FENCE" overshoots the frame. A deadpan
//     broadcast-QC log notes each violation with its timecode.
import { W, H } from '../engine/gl';
import type { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, type TextLayout } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import type { AudioData } from '../engine/audio';
import type { PostOverrides } from '../engine/scene';
import { clamp, ease, hash, lerp, prog, pulse, springStep } from '../engine/util';
import { beatsIn } from './stack-kit';

export interface Rect { x0: number; y0: number; x1: number; y1: number }
const inset = (k: number): Rect => ({ x0: (W * (1 - k)) / 2, y0: (H * (1 - k)) / 2, x1: W - (W * (1 - k)) / 2, y1: H - (H * (1 - k)) / 2 });
export const TITLE = inset(0.9);
export const ACTION = inset(0.93);
const BORDER: Rect = { x0: 1.5, y0: 1.5, x1: W - 1.5, y1: H - 1.5 };
const CAP = 0.686; // Archivo cap height / em
const FENCE_X = 26; // the last word keeps its F inside the frame and bursts out through the right edge
const DIVE = 0.16, DIVE_Z = 5, DIVE_ROLL = -0.35;
type RGB = [number, number, number];

// ------------------------------------------------------------------ karaoke helpers

/** Split a display word into syllable chunks at hyphens (only when the count matches the timing). */
function sylParts(text: string, n: number): string[] {
  if (n <= 1) return [text];
  const parts = text.split(/(?<=-)/);
  return parts.length === n ? parts : [text];
}

/** Characters of `text` sung by time t (fractional), following syllable timings when present. */
export function sungChars(w: Word, text: string, t: number): number {
  if (t <= w.start) return 0;
  if (t >= w.end) return text.length;
  const parts = sylParts(text, w.syl?.length ?? 1);
  if (parts.length > 1 && w.syl) {
    let acc = 0;
    for (let i = 0; i < parts.length; i++) {
      const [a, b] = w.syl[i]!;
      if (t < a) return acc;
      if (t < b) return acc + (parts[i]!.length * (t - a)) / Math.max(1e-3, b - a);
      acc += parts[i]!.length;
    }
    return text.length;
  }
  return (text.length * (t - w.start)) / Math.max(1e-3, w.end - w.start);
}

const layCache = new Map<string, TextLayout>();
function lay(text: string, fam: string, size: number, trackPx: number) {
  const k = `${text}|${fam}|${size.toFixed(2)}|${trackPx.toFixed(2)}`;
  let l = layCache.get(k);
  if (!l) { l = layout(text, fam, size, trackPx); layCache.set(k, l); }
  return l;
}
/** x (relative to the text origin) after n (fractional) glyphs: kerned glyph positions, continuous in n. */
function xAt(l: TextLayout, n: number) {
  if (n <= 0) return 0;
  const g = l.glyphs;
  if (n >= g.length) return l.width;
  const i = Math.floor(n), f = n - i;
  return lerp(g[i]!.x, i + 1 < g.length ? g[i + 1]!.x : l.width, f);
}

const glowRGB = (k: number): RGB => [LIN.ember[0] * k, LIN.ember[1] * k, LIN.ember[2] * k];

// ------------------------------------------------------------------ the press

/** Per-kick compression states of movement 1. */
const STAGES = [
  { width: 125, weight: 300, track: 0.05, lead: 1.55 },
  { width: 100, weight: 500, track: 0.0, lead: 1.2 },
  { width: 75, weight: 700, track: -0.025, lead: 0.97 },
  { width: 62, weight: 900, track: -0.05, lead: 0.78 },
];
const TOKENS = [20, 200, 2000, 20000];

interface StackRow { text: string; words: Word[]; fam: string; w: number; wPre: number; tIn: number; tShow: number; size: number; cap: number; left: boolean }
interface RowBox { base: number; cap: number; k: number; cy: number; ax: number; x0: number; x1: number }

export class Press {
  t0: number; c2: number; c3: number;
  kicks: number[] = [];
  beats: number[];
  S = 136; // movement-1 type size (px): the unsqueezed first line just fits the title-safe width
  A: string; B: string; wA: Word; wB: Word;
  rows: StackRow[] = [];
  /** Rupture beats: title-safe, action-safe, frame under load (bend), frame edge (snap). */
  rup: number[] = [];
  private shake: [number, number] = [0, 0];
  private zoom = 1;

  constructor(au: AudioData, L1: Line, L2: Line, t0: number, c2: number, c3: number) {
    this.t0 = t0; this.c2 = c2; this.c3 = c3;
    this.beats = beatsIn(au, t0 - 1, c3 + 1);
    this.kicks = this.beats.filter((b) => b >= t0 - 0.02 && b < c2 - 0.05).slice(0, 4);
    while (this.kicks.length < 4) this.kicks.push(this.kicks[this.kicks.length - 1]! + 0.4545);
    this.wA = L1.words[0]!; this.wB = L1.words[1]!;
    this.A = this.wA.w.toUpperCase(); this.B = this.wB.w.toUpperCase();
    // movement 2: each stressed word lands on a beat and breaks one more fence
    const beatOf = (s: number) => this.beats.find((b) => b >= s - 0.07) ?? s;
    const [wBr, wTh, wEa, wSa, wFe] = L2.words as [Word, Word, Word, Word, Word];
    const up = (w: Word) => w.w.replace(/[^A-Za-z-]/g, '').toUpperCase();
    this.rup = [c2, beatOf(wTh.start), beatOf(wSa.start), beatOf(wFe.start)];
    const AW = ACTION.x1 - ACTION.x0, TW = TITLE.x1 - TITLE.x0;
    // [words, Archivo width, width it bursts out to, width it is held at before, burst beat, left-anchored]
    const spec: [Word[], number, number, number, number, boolean][] = [
      [[wBr], 62, AW, TW, this.rup[0]!, false],
      [[wTh], 75, W, AW, this.rup[1]!, false],
      [[wEa, wSa], 62, W * 1.06, W, this.rup[2]!, false],
      [[wFe], 87.5, W * 1.05, W - 2 * FENCE_X, this.rup[3]!, true],
    ];
    this.rows = spec.map(([ws, wd, wTarget, wPre, tIn, left]) => {
      const text = ws.map(up).join(' ');
      const fam = F.archivo(wd, 900);
      const adv = lay(text, fam, 100, 0).width / 100;
      const size = wTarget / adv;
      return { text, words: ws, fam, w: wTarget, wPre, tIn, tShow: ws[0]!.start, size, cap: size * CAP, left };
    });
  }

  /** Compression stage 0..3 (index of the last kick) and the spring into it. */
  private stage(t: number) {
    let k = 0;
    for (let i = 0; i < 4; i++) if (t >= this.kicks[i]!) k = i;
    const sp = k === 0 ? 1 : springStep(t - this.kicks[k]!, 3.2, 0.42);
    return { k, sp };
  }

  tokens(t: number) {
    const { k } = this.stage(t);
    const a = k === 0 ? TOKENS[0]! : TOKENS[k - 1]!, b = TOKENS[k]!;
    const u = k === 0 ? 1 : prog(t, this.kicks[k]!, this.kicks[k]! + 0.3, ease.outExpo);
    return Math.round(Math.pow(10, lerp(Math.log10(a), Math.log10(b), u)));
  }

  draw(c: CanvasRenderingContext2D, t: number, glow: LineBatch): PostOverrides {
    c.fillStyle = rgba('ink');
    c.fillRect(0, 0, W, H);
    glow.clear();
    const R = this.rup;
    const { k, sp } = this.stage(t);
    const kickP = t < this.c2 ? pulse(t, this.kicks[k]!, 0.08) : 0;
    const pressure = t < this.c2 ? (k + sp) / 4 : 0;
    const bowT = t < this.c2 ? (1.5 + 7 * pressure) * (1 + 1.2 * kickP) : 0;
    // impacts shake/punch the type (in-scene, so the fences and the frame border stay put)
    let hit = kickP * 0.35;
    const hw = [0.8, 0.7, 0.45, 1];
    for (let i = 0; i < 4; i++) hit = Math.max(hit, pulse(t, R[i]!, 0.07) * hw[i]!);
    const fr = Math.floor(t * 60);
    this.shake = [(hash(fr, 1) - 0.5) * 30 * hit, (hash(fr, 2) - 0.5) * 20 * hit];
    this.zoom = 1 + 0.03 * hit;

    this.drawSlab(c, t, bowT);
    if (t >= this.c2 - 0.04) this.drawStack(c, t);

    // fences (drawn steady over the type)
    this.drawTitleFence(c, t, glow, bowT);
    this.drawActionFence(c, t, glow);
    this.drawFrameFence(c, t, glow);
    if (t < this.c2 + 0.4) this.drawReadout(c, t);
    this.drawQC(c, t);

    return { hud: 0, bloom: 0.6, bloomThreshold: 0.95, bloomKnee: 0.15, halation: 0.06, vignette: 0.3, ca: 0.7 + 1.6 * hit, grain: 0.05 };
  }

  private camera(c: CanvasRenderingContext2D) {
    c.translate(W / 2 + this.shake[0], H / 2 + this.shake[1]);
    c.scale(this.zoom, this.zoom);
    c.translate(-W / 2, -H / 2);
  }

  // -------------------------------------------------------------- movement 1: the slab
  private drawSlab(c: CanvasRenderingContext2D, t: number, bow: number) {
    const rel = t < this.c2 ? 0 : prog(t, this.c2, this.c2 + 0.3);
    if (rel >= 1) return;
    const { k, sp } = this.stage(t);
    const st = STAGES[k]!, prev = STAGES[Math.max(0, k - 1)]!;
    const S = this.S, cap = S * CAP;
    const fam = F.archivo(st.width, st.weight);
    const tr = st.track * S;
    const lA = lay(this.A, fam, S, tr), lB = lay(this.B, fam, S, tr);
    // the width axis steps on the kick; a horizontal spring hides the step (squeeze + overshoot)
    const famP = F.archivo(prev.width, prev.weight);
    const ratio = k === 0 ? 1 : lay(this.A, famP, S, prev.track * S).width / lA.width;
    const sx = lerp(ratio, 1, sp);
    // leading collapses on each kick and creeps between kicks (pressure building)
    const nextK = this.kicks[k + 1] ?? this.c2;
    const creep = prog(t, this.kicks[k]!, nextK) * 0.05;
    const lead = Math.max(0.62, lerp(prev.lead, st.lead, k === 0 ? 1 : sp) - creep);
    const pitch = cap * lead;
    const heroPitch = Math.max(pitch, cap * 1.1);
    const yc = H * 0.5;
    const yA = yc - heroPitch / 2 + cap / 2, yB = yA + heroPitch;
    const slotY = (i: number) => (i <= 0 ? yA + i * pitch : yB + (i - 1) * pitch);
    const gap = 0.3 * S;
    const uA = lA.width + tr + gap, uB = lB.width + tr + gap;
    const nA = sungChars(this.wA, this.A, t), nB = sungChars(this.wB, this.B, t);
    // tokens stream through the copies, faster as tokens/param climbs
    const u = Math.max(0, t - this.t0);
    const scroll = 24 * u + 150 * u * u;
    const pr = (k + sp) / 4;
    const copyCol = mixCss('graphite', 'ash', 0.35 * clamp(pr * 1.3 - 0.3));
    // the two lines alternate a step apart in value: packed rows overlap as flat layers (no outlines)
    const copyColB = mixCss('graphite', 'ash', 0.35 * clamp(pr * 1.3 - 0.3) - 0.14);

    c.save();
    if (rel === 0) { bowPath(c, TITLE, bow); c.clip(); }
    else { c.beginPath(); c.rect(ACTION.x0, ACTION.y0, ACTION.x1 - ACTION.x0, ACTION.y1 - ACTION.y0); c.clip(); }
    this.camera(c);
    const trem = 3 * prog(t, this.kicks[3]!, this.c2, ease.inQuad) * (rel === 0 ? 1 : 0);
    if (trem > 0) { const fr = Math.floor(t * 60); c.translate((hash(fr, 31) - 0.5) * trem, (hash(fr, 32) - 0.5) * trem); }
    const rowsN = 9;
    // the baseline grid: every slot the leading allows, empty until copies land on it
    if (rel < 1) {
      c.fillStyle = rgba('graphite', 0.55 * (1 - rel));
      for (let i = -rowsN; i <= rowsN + 1; i++) {
        const y = slotY(i);
        if (y < TITLE.y0 || y > TITLE.y1) continue;
        c.fillRect(TITLE.x0, Math.round(y) + 0.5, TITLE.x1 - TITLE.x0, 1);
      }
    }
    c.font = font(fam, S);
    c.letterSpacing = `${tr}px`;
    c.lineJoin = 'round';
    const heroes: [number, number, boolean][] = [];
    for (let i = -rowsN; i <= rowsN + 1; i++) {
      const hero = i === 0 || i === 1;
      const order = hero ? 0 : i === -1 || i === 2 ? 1 : i >= -3 && i <= 4 ? 2 : 3;
      if (order > k) continue;
      const intro = order === 0 ? 1 : springStep(t - this.kicks[order]!, 3.2, 0.6);
      // new copies are stuffed in from beyond the top and bottom fences and packed toward the hero
      let y = slotY(i) + (i <= 0 ? -1 : 1) * H * 0.55 * (1 - intro);
      const isA = i % 2 === 0;
      const dir = isA ? -1 : 1;
      let xoff = 0;
      if (rel > 0) {
        // release: the slab blows apart vertically and shoots out sideways through the broken fence
        y = yc + (y - cap / 2 - yc) * (1 + 1.2 * ease.outCubic(rel)) + cap / 2;
        xoff = dir * (0.8 + 0.4 * hash(i, 17)) * (1400 * rel + 1400 * rel * rel);
      }
      if (y - cap > ACTION.y1 + 20 || y < ACTION.y0 - 20) continue;
      if (hero) { heroes.push([y, xoff, isA]); continue; }
      const txt = isA ? this.A : this.B, uu = isA ? uA : uB;
      const phase = ((Math.floor(i / 2) % 2 + 2) % 2) * 0.5 * uu + (isA ? 0 : 0.25 * uu);
      const x0 = TITLE.x0 - phase + dir * (scroll % uu) - uu;
      const alpha = 1;
      this.row(c, txt, x0, y, uu, sx, alpha, isA ? copyCol : copyColB, xoff);
    }
    // hero pair on top: static, flush with the fence, karaoke — set on a flat ink band across the
    // fence that the packed copies slide under (it goes with the release)
    const band = heroes.length ? 1 - prog(rel, 0, 0.12) : 0;
    if (band > 0) {
      const ys = heroes.map(([y]) => y), pad = 0.16 * cap;
      c.fillStyle = rgba('ink', band);
      c.fillRect(TITLE.x0 - 40, Math.min(...ys) - cap - pad, TITLE.x1 - TITLE.x0 + 80, Math.max(...ys) - Math.min(...ys) + cap + 2 * pad);
    }
    for (const [y, xoff, isA] of heroes) {
      const txt = isA ? this.A : this.B, l = isA ? lA : lB, uu = isA ? uA : uB, n = isA ? nA : nB;
      const w = isA ? this.wA : this.wB;
      const contA = clamp(springStep(t - this.kicks[1]!, 2.6, 0.5) * 1.6);
      if (contA > 0) this.row(c, txt, TITLE.x0 + uu, y, uu, sx, contA, isA ? copyCol : copyColB, xoff);
      if (rel > 0) { this.row(c, txt, TITLE.x0, y, uu, sx, 1, isA ? copyCol : copyColB, xoff); continue; }
      const alpha = 1;
      c.save();
      c.translate(TITLE.x0, 0); c.scale(sx, 1); c.translate(-TITLE.x0, 0);
      const x = TITLE.x0 + xoff;
      c.fillStyle = rgba('bone', 0.3 * alpha);
      c.fillText(txt, x, y);
      if (n > 0) {
        const s = xAt(l, n);
        c.save(); c.beginPath(); c.rect(x - 20, y - S * 1.2, s + 20, S * 1.6); c.clip();
        c.fillStyle = t < w.end + 0.05 ? rgba('signal', alpha) : rgba('bone', alpha);
        c.fillText(txt, x, y);
        c.restore();
      }
      c.restore();
    }
    c.restore();
  }

  /** One row of repeated copies (flat fill), squeezed horizontally about the fence. */
  private row(c: CanvasRenderingContext2D, txt: string, x0: number, y: number, uu: number, sx: number, alpha: number, col: string, xoff = 0) {
    if (alpha <= 0.002) return;
    c.save();
    c.translate(TITLE.x0 + xoff, 0); c.scale(sx, 1); c.translate(-TITLE.x0, 0);
    // a finite strip: only the copies that were inside the fence (so the released slab can leave)
    const xs: number[] = [];
    const xEnd = TITLE.x0 + (TITLE.x1 - TITLE.x0) / sx;
    for (let x = x0; x < xEnd; x += uu) if (x + uu > TITLE.x0) xs.push(x);
    c.globalAlpha = alpha;
    c.fillStyle = col;
    for (const x of xs) c.fillText(txt, x, y);
    c.restore();
  }

  // -------------------------------------------------------------- movement 2: the stack
  /** Screen boxes of the stacked lines at time t (before the camera transform). */
  private stackLayout(t: number): (RowBox | null)[] {
    const rows = this.rows;
    let cur = -1;
    for (let i = 0; i < rows.length; i++) if (t >= rows[i]!.tShow - 0.12) cur = i;
    const ys: number[] = [];
    let y = 0;
    rows.forEach((r, i) => { y += i === 0 ? r.cap : r.cap + 0.1 * r.cap; ys.push(y); });
    // keep the last two lines centred; the final word sits a little low and dominates
    const target = (i: number) => {
      if (i === 0) return H / 2 + rows[0]!.cap / 2 - ys[0]!;
      if (i === rows.length - 1) return H * 0.6 + rows[i]!.cap / 2 - ys[i]!;
      const top = ys[i - 1]! - rows[i - 1]!.cap, bot = ys[i]!;
      return H / 2 - (top + bot) / 2;
    };
    let off = target(0);
    for (let i = 1; i <= Math.max(0, cur); i++) off = lerp(off, target(i), prog(t, rows[i]!.tShow - 0.03, rows[i]!.tShow + 0.22, ease.outExpo));
    return rows.map((r, i) => {
      if (i > cur) return null;
      // held at the previous fence's width, then bursts out to its own on the beat (and bounces)
      const burst = t < r.tIn ? 0 : springStep(t - r.tIn, 3.4, 0.45);
      let k = lerp(r.wPre / r.w, 1, burst) + 0.05 * pulse(t, r.tIn, 0.05);
      if (i === rows.length - 1) k *= 1 + 0.03 * prog(t, r.tIn, this.c3, ease.outQuad);
      const base = off + ys[i]!;
      const ax = r.left ? FENCE_X : W / 2;
      const x0 = r.left ? FENCE_X : W / 2 - (r.w * k) / 2;
      return { base, cap: r.cap, k, cy: base - r.cap / 2, ax, x0, x1: x0 + r.w * k };
    });
  }

  /** 0..1 over the last beat's tail: the camera dives into a stem of FENCE (match cut to the GPU macro). */
  dive(t: number) {
    const wEnd = this.rows[this.rows.length - 1]!.words[0]!.end;
    return prog(t, Math.max(wEnd + 0.02, this.c3 - DIVE), this.c3);
  }

  private drawStack(c: CanvasRenderingContext2D, t: number) {
    const boxes = this.stackLayout(t);
    c.save();
    this.camera(c);
    const dv = this.dive(t);
    if (dv > 0) {
      // pivot: the arms of the E, brought to the centre while zooming in and rolling to
      // the GPU floor's opening angle
      const r = this.rows[this.rows.length - 1]!, b = boxes[this.rows.length - 1]!;
      const l = lay(r.text, r.fam, r.size, 0);
      const px = b.ax + (FENCE_X + l.glyphs[1]!.x + l.glyphs[1]!.w * 0.42 - b.ax) * b.k, py = b.cy;
      const z = Math.exp(Math.log(DIVE_Z) * ease.inQuad(dv));
      const sx = lerp(px, W / 2, ease.inOutCubic(dv)), sy = lerp(py, H / 2, ease.inOutCubic(dv));
      c.translate(sx, sy); c.rotate(DIVE_ROLL * ease.inCubic(dv)); c.scale(z, z); c.translate(-px, -py);
    }
    this.rows.forEach((r, i) => {
      const b = boxes[i];
      if (!b) return;
      const appear = prog(t, r.tShow - 0.12, r.tShow);
      c.save();
      c.translate(b.ax, b.cy); c.scale(b.k, b.k); c.translate(-b.ax, -b.cy);
      c.font = font(r.fam, r.size);
      c.letterSpacing = '0px';
      c.lineJoin = 'round';
      const l = lay(r.text, r.fam, r.size, 0);
      const x0 = r.left ? FENCE_X : W / 2 - l.width / 2, base = b.base;
      // the first line is punched out of the slab: a solid ink cut-out until the debris has cleared
      if (i === 0 && t < this.c2 + 0.35) {
        const ko = 1 - prog(t, this.c2 + 0.15, this.c2 + 0.35);
        c.fillStyle = rgba('ink', ko); c.fillText(r.text, x0, base);
      }
      // per-word karaoke: outline before, signal wipe while sung, bone after
      let ci = 0;
      r.words.forEach((w, wi) => {
        const wt = w.w.replace(/[^A-Za-z-]/g, '').toUpperCase();
        const a = xAt(l, ci), bx = xAt(l, ci + wt.length);
        const n = sungChars(w, wt, t);
        const s = xAt(l, ci + n);
        c.save(); c.beginPath(); c.rect(x0 + a - 4, base - r.size * 1.2, bx - a + 8, r.size * 1.6); c.clip();
        if (n < wt.length) {
          c.lineWidth = Math.max(1.5, 1.6 / b.k);
          c.strokeStyle = rgba('bone', 0.45 * appear);
          c.strokeText(r.text, x0, base);
        }
        if (n > 0) {
          c.beginPath(); c.rect(x0 + a - 4, base - r.size * 1.2, s - a + 4, r.size * 1.6); c.clip();
          c.fillStyle = t < w.end + 0.04 ? rgba('signal') : rgba('bone');
          c.fillText(r.text, x0, base);
        }
        c.restore();
        ci += wt.length + (wi < r.words.length - 1 ? 1 : 0);
      });
      c.restore();
    });
    c.restore();
  }

  // -------------------------------------------------------------- fences
  private label(c: CanvasRenderingContext2D, text: string, x: number, y: number, a: number, alignRight = false, strike = 0) {
    if (a <= 0) return;
    c.save();
    c.font = font(F.mono(500), 11); c.letterSpacing = '2px';
    const w = c.measureText(text).width;
    const lx = alignRight ? x - w : x;
    c.fillStyle = rgba('ink', a); c.fillRect(lx - 7, y - 7, w + 12, 13);
    c.fillStyle = rgba('bone', 0.8 * a);
    c.textBaseline = 'middle';
    c.fillText(text, lx, y + 0.5);
    if (strike > 0) { c.fillStyle = rgba('signal', a); c.fillRect(lx - 3, y - 0.5, (w + 4) * strike, 1.5); }
    c.restore();
  }

  /** The tripwire flash: the whole fence runs hot for an instant as it gives way. */
  private trip(glow: LineBatch, r: Rect, dt: number, k = 1) {
    if (dt < 0 || dt > 0.25) return;
    const hot = 5 * k * Math.exp(-dt * 16);
    const col = glowRGB(hot);
    glow.seg2(r.x0, r.y0, r.x1, r.y0, 2, col); glow.seg2(r.x1, r.y0, r.x1, r.y1, 2, col);
    glow.seg2(r.x1, r.y1, r.x0, r.y1, 2, col); glow.seg2(r.x0, r.y1, r.x0, r.y0, 2, col);
  }

  /** A hairline edge recoiling into its corner after it snapped: the free end whips outward. */
  private recoil(c: CanvasRenderingContext2D, glow: LineBatch, cx: number, cy: number, px: number, py: number, nx: number, ny: number, dt: number, a: number, seed: number) {
    const rec = ease.outCubic(prog(dt, 0, 0.28 + 0.08 * hash(seed, 1)));
    const L = 1 - rec;
    if (L <= 0.003) return;
    const ex = lerp(cx, px, L), ey = lerp(cy, py, L);
    const fl = (50 + 40 * hash(seed, 2)) * Math.sin(Math.PI * Math.min(1, dt / 0.3)) * L;
    c.strokeStyle = rgba('bone', a);
    c.lineWidth = 1.25;
    c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo((cx + ex) / 2 + nx * fl * 0.6, (cy + ey) / 2 + ny * fl * 0.6, ex + nx * fl, ey + ny * fl); c.stroke();
    const hot = Math.exp(-dt * 8);
    if (hot > 0.03) {
      const fx = ex + nx * fl, fy = ey + ny * fl;
      const dx = cx - fx, dy = cy - fy, dl = Math.hypot(dx, dy) || 1;
      glow.seg2(fx, fy, fx + (dx / dl) * 24, fy + (dy / dl) * 24, 2.5, glowRGB(4 * hot), 1);
    }
  }

  /** A loose hairline fragment flung outward. */
  private fragment(c: CanvasRenderingContext2D, glow: LineBatch, ax: number, ay: number, bx: number, by: number, vx: number, vy: number, spin: number, dt: number, a: number) {
    const mx = (ax + bx) / 2 + vx * dt, my = (ay + by) / 2 + vy * dt + 300 * dt * dt;
    const hx = (bx - ax) / 2, hy = (by - ay) / 2;
    const r = spin * dt, cs = Math.cos(r), sn = Math.sin(r);
    const qx = hx * cs - hy * sn, qy = hx * sn + hy * cs;
    c.strokeStyle = rgba('bone', a);
    c.lineWidth = 1.25;
    c.beginPath(); c.moveTo(mx - qx, my - qy); c.lineTo(mx + qx, my + qy); c.stroke();
    const hot = Math.exp(-dt * 7);
    if (hot > 0.03) glow.seg2(mx - qx, my - qy, mx + qx, my + qy, 1.8, glowRGB(2.4 * hot), 1);
  }

  private drawTitleFence(c: CanvasRenderingContext2D, t: number, glow: LineBatch, bow: number) {
    const r = TITLE, tb = this.rup[0]!, dt = t - tb;
    const inA = prog(t, this.t0, this.t0 + 0.1, ease.outCubic);
    c.save();
    if (dt < 0) {
      c.strokeStyle = rgba('bone', 0.5 + 0.35 * clamp(bow / 8));
      c.lineWidth = 1;
      bowPath(c, r, bow);
      c.stroke();
      this.label(c, 'TITLE SAFE 90%', r.x0 + 26, r.y0 - 0.06 * bow, inA);
    } else {
      this.trip(glow, r, dt);
      const life = 1 - prog(dt, 0.3, 0.75);
      if (life > 0) {
        // the slab shatters the side walls into loose segments; top and bottom recoil into the corners
        for (const [x, s] of [[r.x0, -1], [r.x1, 1]] as const) {
          let y = r.y0;
          for (let j = 0; y < r.y1; j++) {
            const len = 50 + 90 * hash(j, s, 21);
            const y1 = Math.min(r.y1, y + len);
            const v = 500 + 1300 * hash(j, s, 22);
            this.fragment(c, glow, x, y + 3, x, y1 - 3, s * v, (hash(j, s, 23) - 0.5) * 300, (hash(j, s, 24) - 0.5) * 14, dt, 0.8 * life);
            y = y1;
          }
        }
        for (const [yy, ny] of [[r.y0, -1], [r.y1, 1]] as const) {
          const px = lerp(r.x0, r.x1, 0.45 + 0.1 * hash(ny, 5));
          this.recoil(c, glow, r.x0, yy, px, yy, 0, ny, dt, 0.8 * life, 11 + ny);
          this.recoil(c, glow, r.x1, yy, px, yy, 0, ny, dt, 0.8 * life, 13 + ny);
        }
        this.label(c, 'TITLE SAFE 90%', r.x0 + 26, r.y0 - 30 * ease.outCubic(prog(dt, 0, 0.3)), life, false, ease.outExpo(prog(dt, 0, 0.1)));
      }
    }
    c.restore();
  }

  private drawActionFence(c: CanvasRenderingContext2D, t: number, glow: LineBatch) {
    const r = ACTION, tb = this.rup[1]!, dt = t - tb;
    const inA = prog(t, this.t0 + 0.04, this.t0 + 0.14, ease.outCubic);
    // after the title-safe breach this is the fence that holds: brighter, and it bows on the impact
    const load = t < this.rup[0]! ? 0 : 1;
    const bow = t < this.rup[0]! ? 0 : 22 * pulse(t, this.rup[0]!, 0.07) + 3;
    c.save();
    if (dt < 0) {
      c.strokeStyle = rgba('bone', 0.4 + 0.45 * load);
      c.lineWidth = 1 + 0.25 * load;
      bowPath(c, r, bow);
      c.stroke();
      this.label(c, 'ACTION SAFE 93%', r.x1 - 26, r.y0 - 0.06 * bow, inA, true);
    } else {
      this.trip(glow, r, dt);
      const life = 1 - prog(dt, 0.3, 0.75);
      if (life > 0) {
        // THROUGH punches out of the side walls where its letters cross them
        const bx = this.stackLayout(tb)[1];
        const yb0 = bx ? bx.base - bx.cap * bx.k - 8 : H * 0.4, yb1 = bx ? bx.base + 8 : H * 0.6;
        for (const [x, s] of [[r.x0, -1], [r.x1, 1]] as const) {
          this.recoil(c, glow, x, r.y0, x, yb0, s, 0, dt, 0.85 * life, 31 + s);
          this.recoil(c, glow, x, r.y1, x, yb1, s, 0, dt, 0.85 * life, 33 + s);
          const n = 3;
          for (let j = 0; j < n; j++) {
            const a = lerp(yb0, yb1, j / n), b = lerp(yb0, yb1, (j + 1) / n);
            this.fragment(c, glow, x, a + 2, x, b - 2, s * (900 + 900 * hash(j, s, 41)), (hash(j, s, 42) - 0.5) * 400, (hash(j, s, 43) - 0.5) * 16, dt, 0.85 * life);
          }
        }
        for (const [yy, ny] of [[r.y0, -1], [r.y1, 1]] as const) {
          const px = lerp(r.x0, r.x1, 0.5 + 0.12 * (hash(ny, 6) - 0.5));
          const d2 = dt - 0.05;
          if (d2 < 0) { c.strokeStyle = rgba('bone', 0.85); c.lineWidth = 1.25; c.beginPath(); c.moveTo(r.x0, yy); c.lineTo(r.x1, yy); c.stroke(); continue; }
          this.recoil(c, glow, r.x0, yy, px, yy, 0, ny, d2, 0.85 * life, 35 + ny);
          this.recoil(c, glow, r.x1, yy, px, yy, 0, ny, d2, 0.85 * life, 37 + ny);
        }
        this.label(c, 'ACTION SAFE 93%', r.x1 - 26, r.y0 - 30 * ease.outCubic(prog(dt, 0, 0.3)), life, true, ease.outExpo(prog(dt, 0, 0.1)));
      }
    }
    c.restore();
  }

  /** The last fence: the frame itself (a hairline border + the crop marks). */
  private drawFrameFence(c: CanvasRenderingContext2D, t: number, glow: LineBatch) {
    const [, tA, tB, tS] = this.rup as [number, number, number, number];
    const snap = t - tS;
    // border: appears when action-safe goes, bows out of shot under load, then is gone
    const bowK = t < tB ? 0 : springStep(t - tB, 2.4, 0.4);
    const bowI = t < tA ? 0 : 10 * pulse(t, tA, 0.06);
    const bow = bowI + 70 * bowK;
    c.save();
    if (t >= tA && snap < 0) {
      const a = 0.75 * prog(t, tA, tA + 0.04);
      c.strokeStyle = t >= tB ? rgba('signal', a) : rgba('bone', a);
      c.lineWidth = 1.5;
      bowPath(c, BORDER, bow);
      c.stroke();
      this.label(c, t >= tB ? 'FRAME 100% — UNDER LOAD' : 'FRAME 100%', W / 2, 16 - 0.5 * bow, a / 0.75, false);
    }
    if (snap >= 0) this.trip(glow, { x0: 1, y0: 1, x1: W - 1, y1: H - 1 }, snap, 1.4);
    // crop marks: the frame's guides, shown with its border (the video is otherwise full-bleed)
    const m = 36, l0 = 22;
    const la = t < tA ? 0 : 1;
    const l = l0 + 18 * la * prog(t, tA, tA + 0.1, ease.outCubic);
    const splay = 0.38 * bowK;
    [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy], i) => {
      let ox = -sx! * 10 * bowK, oy = -sy! * 7 * bowK, rot = 0;
      let alpha = t < tA ? 0 : 0.75 * prog(t, tA, tA + 0.04);
      if (snap > 0) {
        const v = 1100 + 600 * hash(i, 9);
        ox += -sx! * v * snap; oy += -sy! * v * 0.55 * snap + 500 * snap * snap;
        rot = (hash(i, 4) - 0.5) * 10 * snap;
        alpha *= 1 - prog(snap, 0.15, 0.45);
      }
      if (alpha <= 0) return;
      c.save();
      c.translate(x! + ox, y! + oy); c.rotate(rot);
      c.strokeStyle = t >= tB ? rgba('signal', alpha) : rgba('bone', alpha);
      c.lineWidth = t < tA ? 1 : 1.5;
      c.beginPath();
      // the L opens up: both arms are pushed away from the frame centre
      c.moveTo(sx! * l * Math.cos(splay), -sy! * l * Math.sin(splay)); c.lineTo(0, 0);
      c.lineTo(-sx! * l * Math.sin(splay), sy! * l * Math.cos(splay));
      c.stroke();
      c.restore();
      if (snap > 0 && snap < 0.35) {
        const hot = Math.exp(-snap * 9);
        glow.seg2(x! + ox, y! + oy, x! + ox + sx! * 10, y! + oy + sy! * 10, 3, glowRGB(4 * hot), 1);
      }
    });
    // the border's corners are the last to go: they fly off with the crop marks
    if (snap > 0 && snap < 0.5) {
      const a = 0.75 * (1 - prog(snap, 0.12, 0.45));
      [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]].forEach(([x, y, sx, sy], i) => {
        const v = 1300 + 500 * hash(i, 19);
        const px = x! - sx! * v * snap, py = y! - sy! * v * 0.55 * snap;
        c.strokeStyle = rgba('signal', a); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(px + sx! * 160, py + sy! * 1.5); c.lineTo(px + sx! * 1.5, py + sy! * 1.5); c.lineTo(px + sx! * 1.5, py + sy! * 110); c.stroke();
      });
    }
    c.restore();
  }

  private drawReadout(c: CanvasRenderingContext2D, t: number) {
    // shoved out of the frame by the burst
    const out = t < this.c2 ? 0 : ease.inCubic(prog(t, this.c2, this.c2 + 0.3));
    const w = 360, h = 150;
    const x = TITLE.x1 - 40 - w + 1100 * out, y = TITLE.y1 - 40 - h;
    const v = this.tokens(t);
    const { k } = this.stage(t);
    const inA = prog(t, this.t0, this.t0 + 0.12, ease.outCubic);
    c.save();
    c.globalAlpha = inA;
    c.fillStyle = rgba('ink', 0.94);
    c.fillRect(x, y, w, h);
    c.strokeStyle = rgba('bone', 0.35); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w, h);
    c.font = font(F.mono(500), 13); c.letterSpacing = '3px'; c.fillStyle = rgba('bone', 0.6);
    c.fillText('TOKENS / PARAM', x + 20, y + 30);
    c.letterSpacing = '0px';
    c.font = font(F.mono(500), 50);
    c.fillStyle = k === 3 ? rgba('signal') : rgba('bone', 0.95);
    c.textAlign = 'right';
    c.fillText(v.toLocaleString('en-US'), x + w - 20, y + 86);
    c.textAlign = 'left';
    // log scale 1 … 100k with the Chinchilla-optimal tick at 20
    const bx = x + 20, bw = w - 40, by = y + 110;
    const X = (val: number) => bx + (bw * Math.log10(Math.max(1, val))) / 5;
    c.fillStyle = rgba('bone', 0.3); c.fillRect(bx, by, bw, 1);
    for (let d = 0; d <= 5; d++) c.fillRect(X(Math.pow(10, d)), by - 4, 1, 4);
    c.fillStyle = rgba('signal'); c.fillRect(bx, by - 1, X(v) - bx, 3);
    c.fillStyle = rgba('bone', 0.9); c.fillRect(X(20), by - 9, 1, 18);
    c.font = font(F.mono(400), 12); c.fillStyle = rgba('bone', 0.6);
    c.fillText('20 = Chinchilla-optimal', X(20) - 3, by + 26);
    c.restore();
  }

  private drawQC(c: CanvasRenderingContext2D, t: number) {
    const msgs = [
      ['WARN', 'text outside title safe (90%)'],
      ['WARN', 'text outside action safe (93%)'],
      ['WARN', 'frame under load'],
      ['FAIL', 'text outside frame'],
    ];
    const shown = this.rup.filter((r) => t >= r).length;
    if (shown === 0) return;
    c.save();
    c.globalAlpha = 1 - prog(this.dive(t), 0, 0.3);
    c.font = font(F.mono(500), 13); c.letterSpacing = '1px';
    const x = TITLE.x0, lh = 21;
    const y0 = TITLE.y1 - 16 - (shown - 1) * lh + lh * (1 - ease.outCubic(prog(t, this.rup[shown - 1]!, this.rup[shown - 1]! + 0.12)));
    for (let i = 0; i < shown; i++) {
      const tr = this.rup[i]!;
      const a = prog(t, tr, tr + 0.04);
      const y = y0 + i * lh;
      const fail = msgs[i]![0] === 'FAIL';
      c.fillStyle = rgba('ink', 0.9 * a); c.fillRect(x - 8, y - 15, 560, lh);
      c.fillStyle = rgba('bone', 0.55 * a); c.fillText(`QC  ${timecode(tr)}`, x, y);
      c.fillStyle = fail ? rgba('signal', a) : rgba('ember', 0.95 * a);
      c.fillText(msgs[i]![0]!, x + 176, y);
      c.fillStyle = rgba('bone', 0.85 * a); c.fillText(msgs[i]![1]!, x + 230, y);
    }
    c.restore();
  }
}

/** Rectangle path with each edge bowed outward by `b` px at its midpoint. */
function bowPath(c: CanvasRenderingContext2D, r: Rect, b: number) {
  const { x0, y0, x1, y1 } = r;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const bh = 2 * b * 0.56; // long edges bow a little less than the short ones
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(mx, y0 - bh, x1, y0);
  c.quadraticCurveTo(x1 + 2 * b, my, x1, y1);
  c.quadraticCurveTo(mx, y1 + bh, x0, y1);
  c.quadraticCurveTo(x0 - 2 * b, my, x0, y0);
  c.closePath();
}

/** CSS colour between two palette entries. */
function mixCss(a: keyof typeof LIN, b: keyof typeof LIN, k: number) {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgb(${[0, 1, 2].map((i) => Math.round(lerp(pa[i]!, pb[i]!, k))).join(',')})`;
}

/** SMPTE-style timecode of song time at 60 fps. */
function timecode(t: number) {
  const f = Math.floor(t * 60 + 1e-6);
  const s = Math.floor(f / 60), fr = f % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(fr)}`;
}
