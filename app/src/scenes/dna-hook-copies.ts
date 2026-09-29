// hook2 — "abundance" (58.871–60.235).
// It opens on prompt2's last frame: the bone instrument sheet with its graph paper, the justified block
// of 32 identical PCR products (each a thin duplex, primer to primer), the orange focus bracket repeated
// on every copy's same position, the plateaued amplification curve, "Sydney, please let me free".
// The camera pulls back while the block is copied tile by tile across the sheet (each new copy extends
// 5'→3' like a synthesis), until the field is thousands of copies and their brackets an orange lattice.
// On "I'm" the ground floods orange and every copy gathers into the word's silhouette, loose and
// tumbling; as the voice reaches them they snap into horizontal lines, set like justified type, and the
// face fills in behind. From the eighth after "P(" the field separates into windows at other scales
// (one copy magnified, the whole field repeated small) for ascent's atlas. Schematic throughout: the
// copies are drawn at the prompt's scale, not a molecular one.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, makeRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, glyphX, measure } from '../engine/type';
import { clamp, ease, lerp, mulberry32, noise1, prog, pulse } from '../engine/util';
import { karaokeRow, sungChars, type RGB } from './dna-kit';
import {
  SAFE, dialValue, drawDial, drawSetting, fitHookWord, settingPath, wipeX, wordIdx,
  type Hook, type Setting, type Stage,
} from './dna-hook-type';

type Pt = { x: number; y: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

// ---- prompt2's plate (dna-prompt-pcr.ts), copied so the cut is seamless: 25 px per bp, products bp 15–51
// (x 535–1435), 32 of them in the band y 440–840, rails 6.9 px apart, the bracket on bp 40 (x 1172.5)
const BX0 = 535, BX1 = 1435, BY0 = 440, BY1 = 840, ROWS = 32, BP = 25;
const PITCH_Y = (BY1 - BY0) / ROWS, GAP0 = Math.min(125, (0.55 * (BY1 - BY0)) / ROWS);
const BC = { x: (BX0 + BX1) / 2, y: (BY0 + BY1) / 2 }; // the block's centre: the pull-back's fixed point
const BRX = 160 + 40.5 * BP - BC.x; // the bracket's offset along each copy
const TX = 1060, TY = 470; // the block copied across the sheet
const TILES = 128, NMAX = TILES * ROWS;
const ZEND = 0.19; // how far the camera pulls back by "I'm"

/** Points filling a path (eroded by `margin`) on a jittered grid of ~n cells (sx:sy = 1:aspect), in serpentine rows. */
function sampleFill(path: Path2D, n: number, margin: number, aspect: number, seed: number): { pts: Pt[]; sx: number; sy: number } {
  const s = 0.5, cw = W * s, ch = H * s;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.scale(s, s); c.fillStyle = '#fff'; c.fill(path);
  if (margin > 0) { c.globalCompositeOperation = 'destination-out'; c.lineWidth = margin * 2; c.lineJoin = 'round'; c.stroke(path); }
  const d = c.getImageData(0, 0, cw, ch).data;
  const inside = (x: number, y: number) => {
    const ix = Math.round(x * s), iy = Math.round(y * s);
    return ix >= 0 && iy >= 0 && ix < cw && iy < ch && d[(iy * cw + ix) * 4 + 3]! > 128;
  };
  let area = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]! > 128) area++;
  area /= s * s;
  let sp = Math.sqrt(area / n);
  const rnd = mulberry32(seed);
  let pts: Pt[] = [];
  for (let tries = 0; tries < 6; tries++) {
    pts = [];
    const sx = sp / Math.sqrt(aspect), sy = sp * Math.sqrt(aspect);
    let row = 0;
    for (let y = sy / 2; y < H; y += sy, row++) {
      const rowPts: Pt[] = [];
      const off = row % 2 ? sx / 2 : 0;
      for (let x = off; x < W; x += sx) {
        const px = x + (rnd() - 0.5) * sx * 0.25, py = y + (rnd() - 0.5) * sy * 0.3;
        if (inside(px, py)) rowPts.push({ x: px, y: py });
      }
      if (row % 2) rowPts.reverse();
      pts.push(...rowPts);
    }
    if (pts.length >= n * 0.92) break;
    sp *= Math.sqrt(pts.length / n) * 0.97;
  }
  return { pts, sx: sp / Math.sqrt(aspect), sy: sp * Math.sqrt(aspect) };
}

/** Liang–Barsky: clip a segment to a rect; null when outside. */
function clipSeg(ax: number, ay: number, bx: number, by: number, r: Rect): [number, number, number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy], q = [ax - r.x0, r.x1 - ax, ay - r.y0, r.y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i]! < 0) return null; continue; }
    const u = q[i]! / p[i]!;
    if (p[i]! < 0) { if (u > t1) return null; if (u > t0) t0 = u; } else { if (u < t0) return null; if (u < t1) t1 = u; }
  }
  return [ax + dx * t0, ay + dy * t0, ax + dx * t1, ay + dy * t1];
}

// the sheet: prompt2's paper (cached) with its graph paper drawn at the camera's scale, flooding orange on "I'm"
const PAPER = /* glsl */ `
void main() {
  vec2 px = FRAG_PX;
  vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  float fib = fbm(px * vec2(0.010, 0.022), 4) * 0.5 + fbm(px * 0.06, 2) * 0.25;
  vec3 paper = C_BONE * (0.9 + 0.06 * fib) * vec3(1.0, 0.985, 0.95);
  fragColor = vec4(paper * (1.0 - 0.16 * smoothstep(0.45, 1.1, length(p))), 1.0);
}`;
const SHEET = /* glsl */ `
uniform sampler2D uPaper; uniform float uSig; uniform float uZoom; uniform vec2 uC; uniform float uGrid;
float gridLine(float v, float off, float sp) { float d = abs(mod(v - off + 0.5 * sp, sp) - 0.5 * sp); return pxLine(d * uZoom * PX_SCALE, 0.0, 1.0); }
void main() {
  vec2 q = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 c = texture(uPaper, vUv).rgb;
  if (uGrid > 0.001) {
    vec2 s = uC + (q - uC) / uZoom; // sheet coordinates
    float mnr = max(gridLine(s.x, 22.5, 25.0), gridLine(s.y, 2.5, 25.0));
    float mjr = max(gridLine(s.x, 72.5, 125.0), gridLine(s.y, 52.5, 125.0));
    c = mix(c, C_INK, (0.045 * mnr + 0.06 * mjr) * uGrid);
  }
  vec3 sig = C_SIGNAL * 0.95 * (1.0 - 0.22 * smoothstep(0.3, 1.1, length(p)));
  fragColor = vec4(mix(c, sig, uSig), 1.0);
}`;

interface Win { r: Rect; t0: number; zoom: number; src: Pt; tiles?: number }

export class CopiesHook implements Stage {
  paperRT = makeRT();
  paperPass = new FSPass(PAPER);
  paperDone = false;
  sheet = new FSPass(SHEET, { uPaper: { value: null }, uSig: { value: 0 }, uZoom: { value: 1 }, uC: { value: new THREE.Vector2(BC.x, BC.y) }, uGrid: { value: 1 } });
  /** One Canvas2D layer, under the copies: the carried line, the face, the windows' ground, the dial. */
  face = new Layer2D();
  L = new LineBatch(72000, { screen2D: true, blend: 'normal' });
  sets: Setting[] = [];
  x0: number[] = []; base: number[] = [];
  /** Per phase (0 = the sheet at the end of the pull-back, 1..4 = the words): each copy's target. */
  tgt: Float32Array[] = [];
  rodL: number[] = [];
  /** Each copy's place on the sheet (sheet px, before the pull-back) and birth. */
  home = new Float32Array(NMAX * 2);
  tb = new Float32Array(NMAX);
  ang0 = new Float32Array(NMAX); spin = new Float32Array(NMAX); dly = new Float32Array(NMAX);
  phaseT: number[] = [];
  wins: Win[] = [];
  tWin = 0; t0 = 0;
  lyricBox = { x0: 140, y0: 130, x1: 900, y1: 430 };

  constructor(public h: Hook) {}

  init() {
    const h = this.h, au = h.ctx.audio;
    this.t0 = h.ctx.start;
    const tI = h.ws[0]!;
    const rnd = mulberry32(58);
    // the tiles nearest the block first (as the frame sees them at the end of the pull-back)
    const cand: { u: number; v: number; d: number }[] = [];
    for (let v = -8; v <= 8; v++) for (let u = -7; u <= 7; u++) {
      const dx = u * TX * ZEND, dy = v * TY * ZEND;
      cand.push({ u, v, d: Math.hypot(dx / (W / 2), dy / (H / 2)) + (u === 0 && v === 0 ? -9 : 0) });
    }
    cand.sort((a, b) => a.d - b.d);
    // doubling: the block, then 2, 4, 8 … tiles, one generation per step up to "I'm"
    const gens = Math.ceil(Math.log2(TILES));
    const dt = (tI - this.t0 - 0.03) / gens;
    for (let k = 0; k < TILES; k++) {
      const { u, v } = cand[k]!;
      const g = k === 0 ? 0 : Math.floor(Math.log2(k)) + 1;
      for (let j = 0; j < ROWS; j++) {
        const i = k * ROWS + j;
        this.home[i * 2] = BC.x + u * TX;
        this.home[i * 2 + 1] = BY0 + (j + 0.5) * PITCH_Y + v * TY;
        this.tb[i] = g === 0 ? -1 : this.t0 + 0.01 + g * dt + rnd() * 0.004;
      }
    }
    for (let i = 0; i < NMAX; i++) { this.ang0[i] = rnd() * Math.PI; this.spin[i] = (rnd() - 0.5) * 1.6; this.dly[i] = rnd(); }
    // phase 0: the sheet as the frame sees it when "I'm" lands
    const f0 = new Float32Array(NMAX * 2);
    for (let i = 0; i < NMAX; i++) { f0[i * 2] = BC.x + (this.home[i * 2]! - BC.x) * ZEND; f0[i * 2 + 1] = BC.y + (this.home[i * 2 + 1]! - BC.y) * ZEND; }
    this.tgt.push(f0);
    this.rodL.push(900 * ZEND);
    // one ordering for every phase (serpentine rows of the pulled-back sheet), so the field condenses
    // into each word, and each word into the next, without crossing itself
    const band = 22;
    const order = Array.from({ length: NMAX }, (_, i) => i).sort((a, b) => {
      const ra = Math.floor(f0[a * 2 + 1]! / band), rb = Math.floor(f0[b * 2 + 1]! / band);
      if (ra !== rb) return ra - rb;
      return (ra % 2 ? -1 : 1) * (f0[a * 2]! - f0[b * 2]!);
    });
    const rank = new Float32Array(NMAX);
    order.forEach((i, r) => (rank[i] = r / NMAX));
    // phases 1..4: the words, full frame inside the title-safe area, filled with horizontal copies
    for (let k = 0; k < 4; k++) {
      const s = fitHookWord(h, k, W - 2 * SAFE, H - 2 * SAFE);
      const x0 = (W - s.width) / 2, base = H / 2 + s.cap / 2;
      this.sets.push(s); this.x0.push(x0); this.base.push(base);
      const smp = sampleFill(settingPath(s, x0, base), NMAX, 5, 1 / 3.4, 11 + k);
      const a = new Float32Array(NMAX * 2), n = smp.pts.length;
      for (let i = 0; i < NMAX; i++) { const p = smp.pts[Math.min(n - 1, Math.floor(rank[i]! * n))]!; a[i * 2] = p.x; a[i * 2 + 1] = p.y; }
      this.tgt.push(a);
      this.rodL.push(clamp(smp.sx * 0.9, 12, 42));
    }
    this.phaseT = [-1e9, ...h.ws];
    // the carried line's box (the copies thin out behind it)
    const w1 = measure(h.carry.words[0]!.w, F.archivo(100, 900), 176), w2 = measure(h.carry.words.slice(1).map((q) => q.w).join(' '), F.archivo(100, 800), 92);
    this.lyricBox = { x0: 130, y0: 130, x1: 200 + Math.max(w1, w2), y1: 440 };
    // the windows open on the eighth after "P(" and the sixteenth after that
    this.tWin = au.timeOfBeat(Math.ceil(au.beatAt(h.tP) * 2) / 2);
    const s3 = this.sets[3]!;
    const src = { x: this.x0[3]! + s3.charX[2]! + s3.size * 0.16, y: H / 2 - s3.cap * 0.15 };
    this.wins = [
      { r: { x0: 1300, y0: 96, x1: 1824, y1: 352 }, t0: this.tWin, zoom: 5, src },
      { r: { x0: 96, y0: 772, x1: 560, y1: 984 }, t0: this.tWin + (this.tWin - h.tP > 0.1 ? 0.06 : 0.1), zoom: 0.125, src: { x: W / 2, y: H / 2 }, tiles: 2 },
    ];
  }

  /** The pull-back: 1 at the cut (prompt2's framing), ZEND when "I'm" lands. */
  private zoom(t: number) { return Math.exp(Math.log(ZEND) * ease.inOutCubic(prog(t, this.t0, this.h.ws[0]! + 0.01))); }
  /** Phase at t (each word's flight starts a hair early so it lands on the onset; the first leaves the sheet on it). */
  private phaseAt(t: number) { let p = 0; for (let k = 1; k < this.phaseT.length; k++) if (t >= this.phaseT[k]! - (k === 1 ? 0 : 0.02)) p = k; return p; }
  private tgtOf(i: number, p: number): Pt { const a = this.tgt[p]!; return { x: a[i * 2]!, y: a[i * 2 + 1]! }; }
  /** Where copy i is on the sheet at t during the pull-back. */
  private sheetPos(i: number, t: number): Pt {
    const z = this.zoom(t);
    return { x: BC.x + (this.home[i * 2]! - BC.x) * z, y: BC.y + (this.home[i * 2 + 1]! - BC.y) * z };
  }
  private pos(i: number, t: number): Pt {
    const p = this.phaseAt(t);
    if (p === 0) return this.sheetPos(i, t);
    const T = this.tgtOf(i, p);
    const tp = this.phaseT[p]! + 0.035 * this.dly[i]!;
    const Pp = p === 1 ? this.sheetPos(i, this.phaseT[1]!) : this.tgtOf(i, p - 1);
    const e = ease.outExpo(clamp((t - tp) / 0.13));
    return { x: lerp(Pp.x, T.x, e), y: lerp(Pp.y, T.y, e) };
  }

  /** A copy: two strands (rails) and base ticks; `grow` extends it 5'→3' from its left end. */
  private rod(x: number, y: number, th: number, len: number, gap: number, col: RGB, a: number, ticks: number, clip?: Rect, primer = 0, pa = 1) {
    const B = this.L;
    const ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
    const hl = len / 2, hw = gap / 2;
    const S = (ax: number, ay: number, bx: number, by: number, w: number, al: number) => {
      if (clip) { const q = clipSeg(ax, ay, bx, by, clip); if (q) B.seg2(q[0], q[1], q[2], q[3], w, col, al); }
      else B.seg2(ax, ay, bx, by, w, col, al);
    };
    const rw = gap > 20 ? 2.5 : 1.6;
    for (const sg of [1, -1]) S(x - ux * hl + nx * hw * sg, y - uy * hl + ny * hw * sg, x + ux * hl + nx * hw * sg, y + uy * hl + ny * hw * sg, rw, a * 0.94);
    if (primer > 0 && pa > 0.01) {
      // the primers are every copy's 5' ends (top strand's left, bottom strand's right), drawn heavier
      const pl = Math.min(hl, primer), pw = rw * lerp(1, 1.9, pa), o = hw + (pw - rw) * 0.5;
      S(x - ux * hl - nx * o, y - uy * hl - ny * o, x - ux * (hl - pl) - nx * o, y - uy * (hl - pl) - ny * o, pw, a * 0.94);
      S(x + ux * hl + nx * o, y + uy * hl + ny * o, x + ux * (hl - pl) + nx * o, y + uy * (hl - pl) + ny * o, pw, a * 0.94);
    }
    if (ticks > 0) {
      const tl = Math.min(hw * 0.88, Math.max(1, gap * 0.44));
      for (let j = 0; j < ticks; j++) {
        const u = ((j + 0.5) / ticks - 0.5) * 2 * hl;
        const cx = x + ux * u, cy = y + uy * u;
        S(cx + nx * hw, cy + ny * hw, cx + nx * (hw - tl), cy + ny * (hw - tl), gap > 20 ? 1.9 : 1.2, a * 0.85);
        S(cx - nx * hw, cy - ny * hw, cx - nx * (hw - tl), cy - ny * (hw - tl), gap > 20 ? 1.9 : 1.2, a * 0.85);
      }
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const h = this.h, t = f.t, { renderer, comp } = h.ctx;
    const wi = wordIdx(h, t);
    const z = this.zoom(t);
    // ---- the sheet
    if (!this.paperDone) { this.paperPass.render(renderer, this.paperRT); this.paperDone = true; }
    const su = this.sheet.u;
    su.uPaper!.value = this.paperRT.texture; su.uSig!.value = wi >= 0 ? 1 : 0; su.uZoom!.value = z;
    su.uGrid!.value = wi >= 0 ? 0 : clamp((z - 0.3) / 0.4);
    this.sheet.render(renderer, out);

    // ---- the face layer: carried line, the face filling in behind the aligned copies, windows' ground, dial
    const fc = this.face.ctx; this.face.clear();
    fc.textBaseline = 'alphabetic';
    let xs = -1e9;
    if (wi < 0) {
      // "Sydney, please let me free" finishes in prompt2's two rows, the caret riding the voice
      const ws = h.carry.words;
      karaokeRow(fc, ws.slice(0, 1), 156, 292, F.archivo(100, 900), 176, t, 1, { on: 'ink', dim: 0.22 });
      const row2 = ws.slice(1), fam = F.archivo(100, 800), size = 92, x = 162, y = 404;
      karaokeRow(fc, row2, x, y, fam, size, t, 1, { on: 'ink', dim: 0.22 });
      const txt = row2.map((q) => q.w).join(' '), k = sungChars(row2, t), ki = Math.floor(k);
      if (ki < txt.length) {
        const cx = x + lerp(glyphX(txt, ki, fam, size), glyphX(txt, ki + 1, fam, size), k - ki);
        fc.fillStyle = rgba('ink', 0.9);
        fc.fillRect(cx + size * 0.04, y - size * 0.74, Math.max(3, size * 0.035), size * 0.86);
      }
      // the amplification curve rides the sheet back and fades
      this.drawCurve(fc, z, clamp((z - 0.45) / 0.35));
    } else {
      const s = this.sets[wi]!, w = h.words[wi]!;
      xs = this.x0[wi]! + wipeX(s, w, t);
      fc.save();
      fc.beginPath(); fc.rect(0, 0, xs, H); fc.clip();
      fc.fillStyle = rgba('ink', 0.5);
      drawSetting(fc, s, this.x0[wi]!, this.base[wi]!);
      fc.restore();
    }
    const winK = this.wins.map((w) => ease.outExpo(clamp((t - w.t0) / 0.07)));
    const winR = this.wins.map((w, k) => {
      const e = winK[k]!, cx = (w.r.x0 + w.r.x1) / 2, cy = (w.r.y0 + w.r.y1) / 2;
      const hx = ((w.r.x1 - w.r.x0) / 2) * e, hy = ((w.r.y1 - w.r.y0) / 2) * lerp(0.08, 1, e);
      return { x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy };
    });
    winR.forEach((r, k) => { if (winK[k]! > 0.001) { fc.fillStyle = rgba('ink', 1); fc.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); } });
    const da = prog(t, h.tP - 0.03, h.tP + 0.05);
    if (da > 0) drawDial(fc, 1392, H - SAFE - 10, dialValue(h, t), { k: 1.5, alpha: da, label: rgba('ink', 0.75), digits: rgba('ink', 1), track: rgba('ink', 0.4), fill: rgba('ink', 1), barW: 280 });
    comp.draw(renderer, this.face.upload(), out);

    // ---- the copies
    const B = this.L; B.clear();
    const p = this.phaseAt(t);
    const ink = LIN.ink, sig = LIN.signal;
    const eL = ease.outExpo(clamp((t - this.phaseT[p]!) / (p === 1 ? 0.07 : 0.13)));
    const Lw = lerp(this.rodL[Math.max(0, p - 1)]!, this.rodL[p]!, eL);
    const gapW = p === 1 ? lerp(2.2, Math.max(2.6, this.rodL[1]! * 0.1), eL) : Math.max(2.6, Lw * 0.1);
    const P: (Pt | undefined)[] = new Array(NMAX);
    const LB = this.lyricBox;
    for (let i = 0; i < NMAX; i++) {
      const tb = this.tb[i]!;
      if (tb >= 0 && t < tb) continue;
      const q = this.pos(i, t);
      P[i] = q;
      if (p === 0) {
        // on the sheet: a copy extends 5'→3' from its primer end when it is made
        const grow = tb < 0 ? 1 : ease.outCubic(clamp((t - tb) / 0.05));
        const len = 900 * z, x0 = q.x - len / 2, l2 = len * grow;
        const cx = x0 + l2 / 2;
        if (cx + l2 / 2 < -10 || cx - l2 / 2 > W + 10 || q.y < -10 || q.y > H + 10) continue;
        const behind = q.x > LB.x0 && q.x < LB.x1 && q.y > LB.y0 && q.y < LB.y1 ? 0.25 : 1;
        const tickN = z > 0.62 ? 36 : z > 0.4 ? 18 : 0;
        this.rod(cx, q.y, 0, l2, Math.max(2.2, GAP0 * z), ink, behind, Math.round(tickN * grow), undefined, grow > 0.99 ? 5 * BP * z : 0, clamp((z - 0.5) / 0.4));
        // the bracket on every copy's bp 40: a lattice of orange marks as the sheet fills
        if (grow > 0.8) {
          const bx = q.x + BRX * z, by = q.y;
          if (z > 0.55) {
            const hs = 3 * z, k = hs * 0.55;
            for (const [sx2, sy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
              const px = bx + sx2 * hs, py = by + sy2 * hs;
              B.seg2(px - sx2 * k, py, px, py, 1.3, sig, behind); B.seg2(px, py, px, py - sy2 * k, 1.3, sig, behind);
            }
          }
          B.seg2(bx, by, bx + 0.01, by, Math.max(2, 2.2 * z), sig, behind);
        }
        continue;
      }
      // hidden under an open window (with a clean mat around it)
      let hid = false;
      for (let k = 0; k < winR.length; k++) {
        if (winK[k]! <= 0.001) continue;
        const r = winR[k]!;
        if (q.x > r.x0 - 26 && q.x < r.x1 + 26 && q.y > r.y0 - 22 && q.y < r.y1 + 22) { hid = true; break; }
      }
      if (hid) continue;
      // tumbling until the voice reaches them, then set horizontal behind the wipe (they leave the sheet level)
      const lift = p === 1 ? ease.inOutCubic(clamp((t - this.phaseT[1]!) / 0.16)) : 1;
      const th = this.angle(i, t, q.x, xs) * lift;
      this.rod(q.x, q.y, th, Lw, gapW, ink, 0.92, 3);
    }
    // ---- the windows: one copy magnified, the whole field repeated small
    for (let k = 0; k < this.wins.length; k++) {
      if (winK[k]! <= 0.001) continue;
      const w = this.wins[k]!, r = winR[k]!;
      const cx = (w.r.x0 + w.r.x1) / 2, cy = (w.r.y0 + w.r.y1) / 2;
      const bone: RGB = [LIN.bone[0] * 0.9, LIN.bone[1] * 0.9, LIN.bone[2] * 0.9];
      if (!w.tiles) {
        const hw = (w.r.x1 - w.r.x0) / 2 / w.zoom + 50, hh = (w.r.y1 - w.r.y0) / 2 / w.zoom + 20;
        for (let i = 0; i < NMAX; i++) {
          const q = P[i];
          if (!q || Math.abs(q.x - w.src.x) > hw || Math.abs(q.y - w.src.y) > hh) continue;
          const L5 = Lw * w.zoom;
          this.rod(cx + (q.x - w.src.x) * w.zoom, cy + (q.y - w.src.y) * w.zoom, this.angle(i, t, q.x, xs), L5, L5 * 0.1, bone, 0.95, 9, r);
        }
      } else {
        const n = w.tiles;
        for (let ty = -n; ty <= n; ty++) for (let tx = -n; tx <= n; tx++) {
          const ox = cx + tx * W * w.zoom * 1.06, oy = cy + ty * H * w.zoom * 1.06;
          for (let i = 0; i < NMAX; i += 3) {
            const q = P[i];
            if (!q) continue;
            const x = ox + (q.x - w.src.x) * w.zoom, y = oy + (q.y - w.src.y) * w.zoom;
            if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
            B.seg2(x - 1.8, y, x + 1.8, y, 1.1, bone, 0.8);
          }
        }
      }
      // frame: bone hairlines
      const e = winK[k]!, bn: RGB = [LIN.bone[0], LIN.bone[1], LIN.bone[2]];
      B.seg2(r.x0, r.y0, r.x1, r.y0, 1.6, bn, 0.9 * e); B.seg2(r.x1, r.y0, r.x1, r.y1, 1.6, bn, 0.9 * e);
      B.seg2(r.x1, r.y1, r.x0, r.y1, 1.6, bn, 0.9 * e); B.seg2(r.x0, r.y1, r.x0, r.y0, 1.6, bn, 0.9 * e);
    }
    B.render(renderer, out);

    // ---- post: the orange ground lands on "I'm"; word slams; DOOM
    let sh = 0;
    for (let k = 0; k < 3; k++) sh = Math.max(sh, 7 * pulse(t, h.ws[k]!, 0.04));
    sh = Math.max(sh, 10 * pulse(t, h.tDoom, 0.05));
    const o: PostOverrides = {
      bloom: 0.35, bloomThreshold: 0.95, vignette: wi >= 0 ? 0.45 : 0.34, ca: 0.5, paper: wi < 0 ? 1 : 0,
      zoom: 1 + 0.02 * pulse(t, h.ws[0]!, 0.08) + 0.015 * pulse(t, h.tDoom, 0.06),
    };
    if (sh > 0.05 && t < h.ctx.end - 0.06) o.shake = [noise1(t * 60, 1) * sh, noise1(t * 60, 2) * sh];
    return o;
  }

  /** A copy's angle, in (-π/2, π/2] (a copy reads the same turned by π): tumbling until the wipe passes it, then level. */
  private angle(i: number, t: number, x: number, xs: number) {
    const tumble = this.ang0[i]! + this.spin[i]! * t;
    const w = tumble - Math.PI * Math.round(tumble / Math.PI);
    const al = ease.outBack(clamp((xs - x + 10) / 70), 1.6);
    return w * (1 - clamp(al, 0, 1.08));
  }

  /** prompt2's amplification curve (plateaued), riding the sheet as the camera pulls back. */
  private drawCurve(c: CanvasRenderingContext2D, z: number, a: number) {
    if (a <= 0.001) return;
    const m = (x: number, y: number) => ({ x: BC.x + (x - BC.x) * z, y: BC.y + (y - BC.y) * z });
    const cx0 = 1335, cx1 = 1760, cyT = 152.5, cyB = 377.5;
    c.save();
    c.strokeStyle = rgba('ink', 0.8 * a); c.lineWidth = 1.6;
    const o = m(cx0, cyT - 12), b = m(cx0, cyB), e = m(cx1 + 10, cyB);
    c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(b.x, b.y); c.lineTo(e.x, e.y); c.stroke();
    c.strokeStyle = rgba('ink', 0.7 * a); c.lineWidth = 1.2;
    c.beginPath();
    for (let k = 0; k <= 40; k += 10) { const p0 = m(lerp(cx0, cx1, k / 40), cyB); c.moveTo(p0.x, p0.y); c.lineTo(p0.x, p0.y + 7 * z); }
    c.stroke();
    const val = (cyc: number) => 0.03 + 0.92 / (1 + Math.exp(-(cyc - 24) / 2.1));
    c.strokeStyle = rgba('ink', 0.92 * a); c.lineWidth = 2.2;
    c.beginPath();
    for (let i = 0; i <= 80; i++) {
      const cc = (38 * i) / 80, q = m(lerp(cx0, cx1, cc / 40), cyB - (cyB - cyT) * val(cc));
      if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y);
    }
    c.stroke();
    const end = m(lerp(cx0, cx1, 38 / 40), cyB - (cyB - cyT) * val(38));
    c.fillStyle = rgba('ink', a); c.beginPath(); c.arc(end.x, end.y, Math.max(1.5, 4 * z), 0, Math.PI * 2); c.fill();
    c.restore();
  }
}
