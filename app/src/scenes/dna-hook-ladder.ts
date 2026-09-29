// hook1 — "one ladder striking into type" (22.509–24.328).
// It opens on prompt1's last frame exactly: the flat ladder diagram of its fork (the kit helix untwisted,
// seen square on at 96 px/nm), both strands 3.18 nm off the axis with their bases exposed as outlined
// slabs, the sequence lettered along both, the fork zipping shut at the right edge, the orange bracket
// over one unpaired base, and "…please don't eat me alive" finishing in the same two rows.
// On "I'm" the ladder strikes: the fork snaps straight, and from then on every base reaches across and
// pairs with its partner (2 or 3 hydrogen-bond ticks) the instant the voice's wipe passes it, flashing,
// behind each hook word struck between the letter rows. The DOOM downbeat strikes the whole ladder and
// lands the P(doom) dial. Then one bright rung sweeps across the frame: behind it the bases let go and
// the two backbones part into the walls of a chamber (room opens inside a ribosome).
// (A flat ladder diagram: the pairs are drawn across the open strands, schematic, not a duplex width.)
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, glyphX } from '../engine/type';
import { clamp, ease, lerp, noise1, prog, pulse, smoothstep } from '../engine/util';
import { BDNA, focusBracket, karaokeRow, sequence, sungChars, PAIR, HBONDS, type Base, type RGB } from './dna-kit';
import {
  SAFE, dialValue, drawDial, fitHookWord, inkBackdrop, karaokeSet, slam, wipeTime, wordIdx,
  type Hook, type Setting, type Stage,
} from './dna-hook-type';

// ---- prompt1's ladder, copied so the cut is seamless (dna-prompt-fork.ts at flat = 1: Cam(30) square on
// at distance 21 aimed at x = 4.6 nm; bp i at x = -14 + 0.34 i nm; strands 3.18 nm off the axis; the fork
// at 14.5 nm; sequence(150, 17); the bracket over bp 68 of the top strand)
const S = (H / 2 / Math.tan((15 * Math.PI) / 180)) / 21; // px per nm
const RO = 3.18, XF = 14.5, X0 = -14, CX = 4.6, N = 150, BR = 68;
const TUBE = 0.2 * S, STUB = 0.17 * S;
const baseLen = (b: Base) => (b === 'A' || b === 'G' ? 1.04 : 0.8) * S; // purines two-ring, pyrimidines one
const sx = (i: number) => W / 2 + (X0 + i * BDNA.rise - CX) * S;
const LETTER = 1.34 * S; // letters sit this far in from each backbone
const BOW = 180; // how far the backbones part into the chamber

interface Rung { i: number; x: number; top: Base; bot: Base; cross: number[]; tz: number }

export class LadderHook implements Stage {
  bg = inkBackdrop();
  L = new LineBatch(16000, { screen2D: true, blend: 'normal' });
  T = new Layer2D();
  sets: Setting[] = [];
  x0: number[] = [];
  rungs: Rung[] = [];
  beats: number[] = [];
  tSw0 = 0; tEnd = 0; tStrike = 0;

  constructor(public h: Hook) {}

  init() {
    const h = this.h, au = h.ctx.audio;
    this.tEnd = h.ctx.end; this.tStrike = h.ws[0]!;
    // the words sit between the letter rows
    for (let k = 0; k < 4; k++) {
      const s = fitHookWord(h, k, W - 2 * SAFE, 2 * (RO * S - LETTER) - 44);
      this.sets.push(s);
      this.x0.push((W - s.width) / 2);
    }
    const seq = sequence(N, 17);
    for (let i = 0; i < N; i++) {
      const x = sx(i);
      if (x < -40 || x > W + 40) continue;
      const cross: number[] = [];
      for (let k = 0; k < 4; k++) {
        const tc = wipeTime(this.sets[k]!, h.words[k]!, x - this.x0[k]!);
        if (tc !== null) cross.push(tc);
      }
      const top = seq[i]!;
      this.rungs.push({ i, x, top, bot: PAIR[top], cross, tz: cross.length ? Math.min(...cross) : h.tDoom });
    }
    for (let b = Math.ceil(au.beatAt(h.ctx.start)); au.timeOfBeat(b) < this.tEnd; b++) this.beats.push(au.timeOfBeat(b));
    this.tSw0 = h.tDoom + 0.07;
  }

  // ---- geometry at t
  /** Strand offset from the axis (px) at screen x: prompt1's fork until the strike, then straight. */
  private off(x: number, t: number) {
    const xw = CX + (x - W / 2) / S;
    const sep = 1 - smoothstep(XF - 4.2, XF + 0.6, xw);
    const fork = S * (1 + (RO - 1) * ease.inOutQuad(sep));
    const k = ease.outBack(prog(t, this.tStrike, this.tStrike + 0.12), 1.8);
    return lerp(fork, RO * S, k) + BOW * this.bow(x) * this.jaw(t);
  }
  private sweepX(t: number) { return t < this.tSw0 ? -1e4 : lerp(-120, W + 120, (t - this.tSw0) / (this.tEnd - 0.012 - this.tSw0)); }
  /** Bases behind the sweeping rung let go and retract. */
  private open(x: number, t: number) { return smoothstep(0, 170, this.sweepX(t) - x); }
  /** The backbones part like jaws, as a whole, while the rung sweeps: the chamber's two walls. */
  private jaw(t: number) { return ease.inOutCubic(prog(t, this.tSw0 + 0.02, this.tEnd)); }
  private bow(x: number) { return Math.pow(Math.sin(Math.PI * clamp(x / W)), 1.6); }
  private flash(r: Rung, t: number) {
    let f = 0;
    for (const c of r.cross) if (t >= c) f = Math.max(f, pulse(t, c, 0.06));
    for (const b of this.beats) if (Math.abs(b - this.h.tDoom) > 0.05 && b > this.tStrike) f = Math.max(f, 0.18 * pulse(t, b, 0.08));
    return Math.max(f, 0.62 * pulse(t, this.h.tDoom, 0.09), 0.5 * pulse(t, this.tStrike, 0.07));
  }

  /** prompt1's engraved backbone tube: shadow tone, lit band, highlight, a hatch tick per segment, ink edges. */
  private tube(ax: number, ay: number, bx: number, by: number, sh: number, a = 1) {
    const L = this.L, col = LIN.bone, ink = LIN.ink, wpx = TUBE;
    const dl = Math.hypot(bx - ax, by - ay) || 1;
    let ux = -(by - ay) / dl, uy = (bx - ax) / dl;
    if (uy < 0) { ux = -ux; uy = -uy; }
    const h = wpx / 2, s0 = sh * 0.5, hl = Math.min(1.05, sh * 1.22);
    L.seg2(ax, ay, bx, by, wpx, [col[0] * s0, col[1] * s0, col[2] * s0], a);
    L.seg2(ax - ux * h * 0.3, ay - uy * h * 0.3, bx - ux * h * 0.3, by - uy * h * 0.3, wpx * 0.66, [col[0] * sh, col[1] * sh, col[2] * sh], a);
    L.seg2(ax - ux * h * 0.5, ay - uy * h * 0.5, bx - ux * h * 0.5, by - uy * h * 0.5, wpx * 0.16, [col[0] * hl, col[1] * hl, col[2] * hl], a);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    L.seg2(mx + ux * h * 0.42, my + uy * h * 0.42, mx + ux * h * 0.95, my + uy * h * 0.95, 1.05, ink, 0.7 * a);
    L.seg2(ax + ux * (h + 0.5), ay + uy * (h + 0.5), bx + ux * (h + 0.5), by + uy * (h + 0.5), 1.4, ink, 0.9 * a);
    L.seg2(ax - ux * (h + 0.5), ay - uy * (h + 0.5), bx - ux * (h + 0.5), by - uy * (h + 0.5), 1.3, ink, 0.9 * a);
  }
  /** A base: a short stem, then the ring as a dark slab outlined in bone (prompt1's); `dir` +1 down, -1 up. */
  private slab(x: number, y0: number, dir: number, len: number, sh: number, fl: number, a: number) {
    const L = this.L, col = LIN.bone, ink = LIN.ink;
    const stem = 0.2 * S, w = STUB, k = sh + 1.15 * Math.min(1.2, fl);
    const lc: RGB = [col[0] * k, col[1] * k, col[2] * k], lw = Math.max(1.1, w * 0.12);
    const ym = y0 + dir * stem, ye = y0 + dir * len;
    L.seg2(x, y0, x, ym, Math.max(1.2, w * 0.28), [col[0] * sh, col[1] * sh, col[2] * sh], a);
    const cap = Math.min(w / 2, Math.abs(ye - ym) / 2 - 0.01);
    const fk = 0.6 * Math.min(1, fl);
    L.seg2(x, ym + dir * cap, x, ye - dir * cap, w, fk > 0.02 ? [col[0] * fk, col[1] * fk, col[2] * fk] : [ink[0] * 1.6, ink[1] * 1.6, ink[2] * 1.6], a);
    L.seg2(x - w / 2, ym, x - w / 2, ye, lw, lc, a); L.seg2(x + w / 2, ym, x + w / 2, ye, lw, lc, a);
    L.seg2(x - w / 2, ye, x + w / 2, ye, lw, lc, a); L.seg2(x - w / 2, ym, x + w / 2, ym, lw, lc, a);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const h = this.h, t = f.t, { renderer, comp } = h.ctx;
    this.bg.render(renderer, out);
    const B = this.L; B.clear();
    const bone = LIN.bone;
    const sc = (k: number): RGB => [bone[0] * k, bone[1] * k, bone[2] * k];
    const yT = (x: number) => H / 2 - this.off(x, t), yB = (x: number) => H / 2 + this.off(x, t);
    const struck = t >= this.tStrike;

    // ---- bases (behind the backbones)
    for (const r of this.rungs) {
      const op = this.open(r.x, t);
      if (op >= 0.999) continue;
      const a = 1 - smoothstep(0.6, 1, op);
      const yt = yT(r.x), yb = yB(r.x), gapPx = yb - yt;
      const fl = this.flash(r, t);
      const lt0 = baseLen(r.top), lb0 = baseLen(r.bot);
      if (!struck && gapPx < lt0 + lb0 + 40) {
        // prompt1's fork: paired already, plain rung halves with their bonds
        B.seg2(r.x, yt, r.x, yt + lt0, Math.max(1.3, STUB * 0.7), sc(0.66), a);
        B.seg2(r.x, yb, r.x, yb - lb0, Math.max(1.3, STUB * 0.7), sc(0.56), a);
        const g0 = yt + lt0, g1 = yb - lb0, n = HBONDS[r.top];
        if (g1 - g0 < 30) for (let j = 0; j < n; j++) { const y = lerp(g0, g1, (j + 1) / (n + 1)); B.seg2(r.x - 9.4, y, r.x + 9.4, y, 1.1, sc(0.72), 0.9 * a); }
        continue;
      }
      // struck: each base reaches across to its partner as the voice passes it
      const z = !struck || t < r.tz ? 0 : ease.outBack(clamp((t - r.tz) / 0.1), 2.2);
      const gap = 26, span = gapPx - gap, frac = lt0 / (lt0 + lb0);
      const reach = 1 - op;
      const lt = lerp(lt0, span * frac, clamp(z, 0, 1.06)) * reach, lb = lerp(lb0, span * (1 - frac), clamp(z, 0, 1.06)) * reach;
      if (z <= 0) {
        // still unpaired: prompt1's outlined slabs
        this.slab(r.x, yt, 1, lt0 * reach, 0.66, fl, a);
        this.slab(r.x, yb, -1, lb0 * reach, 0.56, fl * 0.85, a);
      } else {
        // paired: a quiet rung behind the type (bright only as the voice passes)
        const k = 0.24 + 1.25 * Math.min(1.2, fl), wr = lerp(STUB, 6, clamp(z));
        B.seg2(r.x, yt, r.x, yt + lt, wr, sc(k), a);
        B.seg2(r.x, yb, r.x, yb - lb, wr, sc(k * 0.85), a);
      }
      const hb = smoothstep(0.75, 1, z) * (1 - smoothstep(0.05, 0.3, op));
      if (hb > 0.01) {
        const g0 = yt + lt, g1 = yb - lb, n = HBONDS[r.top];
        for (let j = 0; j < n; j++) { const y = lerp(g0, g1, (j + 1) / (n + 1)); B.seg2(r.x - 8, y, r.x + 8, y, 1.3, sc(0.4 + 0.9 * fl), hb * a); }
      }
    }
    // ---- the rung that sweeps across the frame and opens the chamber
    const swx = this.sweepX(t);
    if (swx > -200 && swx < W + 200) {
      const yt = yT(swx) + TUBE / 2, yb = yB(swx) - TUBE / 2, g0 = lerp(yt, yb, 0.53) - 14, g1 = g0 + 28;
      B.seg2(swx, yt, swx, yb, 64, sc(0.35), 0.16);
      B.seg2(swx, yt, swx, g0, 18, sc(1.8)); B.seg2(swx, yb, swx, g1, 18, sc(1.55));
      for (let j = 0; j < 3; j++) { const y = lerp(g0, g1, (j + 1) / 4); B.seg2(swx - 11, y, swx + 11, y, 2.2, sc(1.6), 1); }
    }
    // ---- backbones (antiparallel): prompt1's tube, three segments per base pair
    const seg = (BDNA.rise * S) / 3;
    for (const top of [true, false]) {
      let px = -2 * seg, py = top ? yT(px) : yB(px);
      for (let x = -seg; x <= W + 2 * seg; x += seg) {
        const y = top ? yT(x) : yB(x);
        this.tube(px, py, x, y, 0.91);
        px = x; py = y;
      }
    }
    // ---- chamber walls: engraved hatching outside the parted backbones
    const wallA = this.jaw(t);
    if (wallA > 0.01) {
      const g = LIN.graphite, gc: RGB = [g[0] * 1.8, g[1] * 1.8, g[2] * 1.8];
      for (let x = 10; x < W; x += 12) {
        const op = this.bow(x);
        if (op < 0.05) continue;
        const len = 90 * op * wallA;
        const yt = yT(x) - TUBE / 2 - 4, yb = yB(x) + TUBE / 2 + 4;
        B.seg2(x, yt, x - len * 0.5, yt - len, 1.1, gc, 0.7 * wallA);
        B.seg2(x, yb, x - len * 0.5, yb + len, 1.1, gc, 0.7 * wallA);
      }
    }
    B.render(renderer, out);

    // ---- letters, lyric, bracket, dial
    const c = this.T.ctx; this.T.clear();
    // the sequence along both strands (a letter dims once its base has paired)
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = font(F.mono(500), clamp(0.25 * S, 10, 30));
    for (const r of this.rungs) {
      const paired = struck && t >= r.tz ? smoothstep(r.tz, r.tz + 0.12, t) : 0;
      const off = this.off(r.x, t);
      if (!struck && off < baseLen(r.top) + 60) continue; // inside the fork: paired, unlettered
      const a = 0.72 * (1 - 0.6 * paired) * (1 - this.open(r.x, t));
      if (a < 0.02) continue;
      c.fillStyle = rgba('bone', a);
      c.fillText(r.top, r.x, H / 2 - off + LETTER);
      c.fillText(r.bot, r.x, H / 2 + off - LETTER);
    }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';

    const wi = wordIdx(h, t);
    if (wi < 0) {
      // "ChatGPT, please don't eat me alive" finishes in prompt1's two rows, its caret riding the voice
      const ws = h.carry.words;
      karaokeRow(c, ws.slice(0, 1), 236, 512, F.archivo(100, 900), 168, t, 1);
      const row2 = ws.slice(1), fam = F.archivo(100, 800), size = 104, x = 240;
      karaokeRow(c, row2, x, 646, fam, size, t, 1);
      const txt = row2.map((q) => q.w).join(' '), k = sungChars(row2, t), ki = Math.floor(k);
      if (ki < txt.length) {
        const xs = lerp(glyphX(txt, ki, fam, size), glyphX(txt, ki + 1, fam, size), k - ki);
        c.fillStyle = rgba('bone', 0.9);
        c.fillRect(x + xs + size * 0.04, 646 - size * 0.74, Math.max(3, size * 0.035), size * 0.86);
      }
    } else {
      const s = this.sets[wi]!, w = h.words[wi]!;
      const k = slam(t, w.start, wi === 3 ? 0.07 : 0.1, 0.13);
      const cx = W / 2, cy = H / 2;
      c.save();
      c.translate(cx, cy); c.scale(k, k); c.translate(-cx, -cy);
      karaokeSet(c, s, w, this.x0[wi]!, cy + s.cap / 2, t, { knock: 'ink' });
      c.restore();
    }
    // the focus bracket stays over its base (prompt1 left it waiting there)
    const xb = sx(BR);
    focusBracket(c, xb, H / 2 - this.off(xb, t) + LETTER, { size: 17, alpha: 1 - this.open(xb, t) });
    // the dial: rolls on "P(", lands on DOOM
    const da = prog(t, h.tP - 0.03, h.tP + 0.06);
    if (da > 0) drawDial(c, SAFE, 1000, dialValue(h, t), { k: 1.7, alpha: da, barW: 260 });
    comp.draw(renderer, this.T.upload(), out);

    // ---- post: the strike, word slams, the DOOM downbeat
    let sh = 0;
    for (let k = 0; k < 3; k++) sh = Math.max(sh, (k === 0 ? 9 : 6) * pulse(t, h.ws[k]!, 0.04));
    sh = Math.max(sh, 15 * pulse(t, h.tDoom, 0.06));
    const o: PostOverrides = {
      bloom: 0.5, bloomThreshold: 0.9, vignette: 0.45, ca: 0.5,
      zoom: 1 + 0.03 * pulse(t, h.tDoom, 0.1) + 0.012 * pulse(t, h.ws[Math.max(0, wi)] ?? t, 0.06),
    };
    if (sh > 0.05 && t < this.tEnd - 0.12) o.shake = [noise1(t * 60, 1) * sh, noise1(t * 60, 2) * sh];
    return o;
  }
}
