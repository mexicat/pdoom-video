// FIG. 13a — the Loom tree: "Just as foretold by Loom" generated token by token along the chosen
// path, while sibling branches (the continuations not taken) sprout at every node with their tokens
// and probabilities, and keep branching into the dark. World px, y down; the root sits exactly on
// hook 4's exit (the reed's hairline at y=629, the shuttle's spark at x=300).
import { rgba } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import { Lyrics, type Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, prog } from '../engine/util';

export const Y0 = 629;
export const ROOT_X = 300;

export type P2 = { x: number; y: number };

/** The continuations that were not sampled, per node (node i replaces word i). Offsets = lanes (world px). */
const ALTS: { label: string; p: number; off: number }[][] = [
  [{ label: 'Exactly', p: 0.19, off: -640 }, { label: 'Almost', p: 0.08, off: -712 }, { label: 'Not', p: 0.04, off: 600 }, { label: 'Only', p: 0.03, off: 672 }],
  [{ label: 'like', p: 0.14, off: -548 }, { label: 'so', p: 0.05, off: 520 }],
  [{ label: 'predicted', p: 0.21, off: -412 }, { label: 'prophesied', p: 0.09, off: -474 }, { label: 'warned', p: 0.06, off: 376 }, { label: 'priced in', p: 0.04, off: 438 }],
  [{ label: 'in', p: 0.18, off: -372 }, { label: 'on', p: 0.04, off: 290 }],
  [{ label: 'Moloch', p: 0.22, off: -196 }, { label: 'the scaling laws', p: 0.17, off: -250 }, { label: 'Nostradamus', p: 0.09, off: -304 },
    { label: 'nobody, technically', p: 0.08, off: 88 }, { label: 'a Substack post', p: 0.05, off: 142 }, { label: 'the eval suite', p: 0.03, off: 196 }],
];
/** Horizontal reach of each node's arcs (world px). */
const REACH = [640, 540, 440, 330, 250];
/** Unlabelled low-probability continuations per node: lanes between/around the labelled ones. */
const WISPS = [7, 5, 6, 4, 0];
/** Probability of each sampled token on the trunk. */
const CHOSEN_P = [0.41, 0.62, 0.38, 0.71, 0.31];
/** Room for a final candidate's probability and bar, beside its label (world px). */
const PROB_W = 150;
/** Second-level continuations of each alternative (tiny, dim). */
const POOL = ['the', 'as', 'a', 'we', 'in', 'by', 'it', 'so', 'all', 'no', 'then', 'that', 'not', 'of', 'one', 'our', 'you', 'this', 'more', 'was', 'is', 'to', '…'];

interface Branch {
  from: P2; to: P2;            // connector (vertical-then-horizontal cubic)
  label: string; p: number;
  size: number; depth: number;
  t0: number; dur: number;     // growth
  lx: number; lw: number;      // label x, width
  node: number;                // trunk node it hangs from
  kids: Branch[];
  strike?: boolean;            // rejected at the final sampling
}

export class LoomTree {
  words: Word[];
  nodes: number[] = [];        // trunk node x per word, plus the end
  tokX: number[] = [];         // token text x
  tokW: number[] = [];
  tokSize = 92;
  loomSize = 196;
  branches: Branch[] = [];
  famTok = F.archivo(100, 800);
  famMono = F.mono(400);
  famLoom = F.serif(600, true);
  /** Rough world bounds of the grown tree. */
  bounds = { x0: 0, x1: 0, y0: 0, y1: 0 };
  tSample: number; // when the final token's candidates appear (the sampling)

  constructor(words: Word[]) {
    this.words = words;
    // trunk layout
    let x = ROOT_X;
    words.forEach((w, i) => {
      this.nodes.push(x);
      const isLoom = i === words.length - 1;
      const gap = isLoom ? 250 : 22;
      const tw = isLoom ? measure(w.w, this.famLoom, this.loomSize) : measure(w.w.toUpperCase(), this.famTok, this.tokSize);
      this.tokX.push(x + gap);
      this.tokW.push(tw);
      x += gap + tw + (isLoom ? 20 : 34);
    });
    this.nodes.push(x);
    const last = words[words.length - 1]!, prev = words[words.length - 2]!;
    this.tSample = lerp(prev.start, last.start, 0.2);
    // alternatives and their descendants
    ALTS.forEach((alts, i) => {
      const nx = this.nodes[i]!;
      const w = words[i]!;
      const last = i === ALTS.length - 1;
      const t0 = last ? this.tSample : w.start;
      alts.forEach((a, k) => {
        const size = last ? 40 : 32;
        const ex = nx + REACH[i]!;
        const b: Branch = {
          from: { x: nx, y: Y0 }, to: { x: ex, y: Y0 + a.off }, label: a.label, p: a.p, size, depth: 1,
          t0: t0 + (last ? 0.02 : 0.03) * k, dur: last ? 0.12 + 0.0001 * Math.abs(a.off) : 0.16 + 0.00022 * Math.abs(a.off), lx: ex + 12, lw: measure(a.label, this.famMono, size), node: i, kids: [],
          strike: last,
        };
        this.grow(b, 2, i * 31 + k * 7);
        this.branches.push(b);
      });
      // the long tail: thin unlabelled continuations fanning between the named ones
      const offs = alts.map((a) => a.off);
      const lo = Math.min(...offs.filter((o) => o < 0), -120), hi = Math.max(...offs.filter((o) => o > 0), 120);
      for (let k = 0; k < WISPS[i]!; k++) {
        const up = k % 2 === 0;
        const u = hash(i, k, 3);
        const off = up ? lerp(lo * 0.55, lo * 1.06, u) : lerp(hi * 0.55, hi * 1.06, u);
        if (offs.some((o) => Math.abs(o - off) < 26)) continue;
        const ex = nx + REACH[i]! * (0.55 + 0.35 * hash(i, k, 4));
        const b: Branch = {
          from: { x: nx, y: Y0 }, to: { x: ex, y: Y0 + off }, label: '', p: 0.005 + 0.02 * hash(i, k, 5), size: 0, depth: 1,
          t0: t0 + 0.06 + 0.02 * k, dur: 0.2 + 0.0002 * Math.abs(off), lx: ex + 4, lw: 0, node: i, kids: [],
        };
        this.grow(b, 3, i * 57 + k * 11);
        this.branches.push(b);
      }
    });
    const all = this.flat();
    this.bounds.x0 = ROOT_X; this.bounds.x1 = Math.max(...all.map((b) => b.lx + b.lw + (b.strike ? PROB_W : 0)), x);
    this.bounds.y0 = Math.min(...all.map((b) => b.to.y)) - 40; this.bounds.y1 = Math.max(...all.map((b) => b.to.y)) + 40;
  }

  /** Recursive sub-branches: fewer, smaller, dimmer and later with depth. */
  private grow(b: Branch, depth: number, seed: number) {
    if (depth > 5) return;
    const n = depth === 2 ? 2 + Math.floor(hash(seed, 1) * 2) : depth === 3 ? 2 + Math.floor(hash(seed, 9) * 2) : 2;
    const spread = depth === 2 ? 26 : depth === 3 ? 15 : depth === 4 ? 9 : 5;
    const size = depth === 2 && !b.strike ? 20 : 0; // the final candidates' futures stay unlabelled (legibility)
    const sx = b.lx + b.lw + (b.size ? 14 : 3) + (b.strike ? PROB_W : 0);
    for (let k = 0; k < n; k++) {
      const s = seed * 13 + k * 5 + depth;
      const dy = (n === 1 ? 0 : (k / (n - 1) - 0.5) * 2) * spread * (0.7 + 0.6 * hash(s, 2));
      const dx = depth === 2 ? 44 + 22 * hash(s, 3) : depth === 3 ? 36 + 34 * hash(s, 4) : 22 + 22 * hash(s, 5);
      const label = size ? POOL[Math.floor(hash(s, 6) * POOL.length)]! : '';
      const lw = size ? measure(label, this.famMono, size) : 0;
      const kid: Branch = {
        from: { x: sx, y: b.to.y }, to: { x: sx + dx, y: b.to.y + dy }, label, p: 0.02 + 0.2 * hash(s, 7), size, depth,
        t0: b.t0 + b.dur * 0.75 + 0.05 * hash(s, 8), dur: 0.16 + 0.07 * depth, lx: sx + dx + 5, lw, node: b.node, kids: [],
      };
      this.grow(kid, depth + 1, s);
      b.kids.push(kid);
    }
  }
  flat(list = this.branches, out: Branch[] = []): Branch[] { for (const b of list) { out.push(b); this.flat(b.kids, out); } return out; }

  /** Trunk progress: the tip's world x at time t (it runs under each word while it is sung). */
  tipX(t: number): number {
    const ws = this.words;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i]!;
      if (t < w.start) return this.nodes[i]!;
      if (t <= w.end) {
        const p = Lyrics.wordProgress(w, t);
        if (i === ws.length - 1) return lerp(this.nodes[i]!, this.tokX[i]! + this.tokW[i]! + 12, ease.outCubic(p));
        return lerp(this.nodes[i]!, this.nodes[i + 1]!, p);
      }
    }
    const i = ws.length - 1;
    return this.tokX[i]! + this.tokW[i]! + 12;
  }

  private cubic(b: Branch, u: number): P2 {
    // vertical tangent at the node for depth 1 (clears the token text), horizontal for deeper forks
    const a = b.from, e = b.to;
    const vert = b.depth === 1;
    const c1 = vert ? { x: a.x, y: lerp(a.y, e.y, 0.62) } : { x: lerp(a.x, e.x, 0.5), y: a.y };
    const c2 = vert ? { x: a.x + (e.x - a.x) * 0.3, y: e.y } : { x: lerp(a.x, e.x, 0.5), y: e.y };
    const v = 1 - u;
    return {
      x: v * v * v * a.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * e.x,
      y: v * v * v * a.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * e.y,
    };
  }

  /**
   * Draw the tree (everything except the glowing trunk and the spark) into a Canvas2D whose
   * transform maps world px to screen. `z` = zoom (for hairline widths).
   */
  draw(c: CanvasRenderingContext2D, t: number, z: number) {
    const ws = this.words;
    const nLast = ws.length - 1;
    const loom = ws[nLast]!;
    const loomK = prog(t, loom.start, loom.start + 0.2, ease.outCubic);
    const px = 1 / z;
    c.lineCap = 'round';
    // ---- branches
    for (const b of this.flat()) {
      const k = prog(t, b.t0, b.t0 + b.dur, ease.outCubic);
      if (k <= 0) continue;
      // dim once the trunk has moved past their node (the paths not taken); the final candidates on Loom
      const passed = b.node < nLast ? prog(t, ws[b.node]!.end, ws[b.node]!.end + 0.3) : loomK;
      const dim = lerp(1, b.depth === 1 ? 0.55 : 0.6, passed);
      const baseA = b.depth === 1 ? (b.size ? 0.66 : 0.24) : b.depth === 2 ? 0.36 : b.depth === 3 ? 0.24 : b.depth === 4 ? 0.17 : 0.12;
      c.strokeStyle = rgba('bone', baseA * dim);
      c.lineWidth = Math.max(0.8 * px, (b.depth === 1 ? 1 + 7 * b.p : 1.1) * (b.depth >= 3 ? 0.75 : 1));
      c.beginPath();
      const n = b.depth === 1 ? 36 : 14;
      for (let i = 0; i <= n; i++) {
        const p = this.cubic(b, Math.min(1, (i / n) * k));
        if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
      }
      c.stroke();
      if (k < 0.9) continue;
      const lk = prog(t, b.t0 + b.dur * 0.9, b.t0 + b.dur * 0.9 + 0.1);
      // the fork dot
      c.fillStyle = rgba('bone', (b.depth === 1 && b.size ? 0.85 : 0.35) * dim * lk);
      c.beginPath(); c.arc(b.to.x, b.to.y, b.depth === 1 && b.size ? 3.4 : 1.8, 0, Math.PI * 2); c.fill();
      if (!b.size) continue;
      c.textBaseline = 'middle';
      c.font = font(this.famMono, b.size);
      c.fillStyle = rgba('bone', (b.depth === 1 ? 0.86 : 0.5) * dim * lk);
      c.fillText(b.label, b.lx, b.to.y);
      if (b.depth === 1) {
        // probability and a tiny bar: under the token; beside it for the final candidates (a readable
        // distribution, flickering until the sample is drawn)
        const flick = b.strike && t < loom.start ? Math.floor(t * 30) : -1;
        const pv = flick >= 0 ? clamp(b.p + (hash(flick, b.lx) - 0.5) * 0.06, 0.01, 0.99) : b.p;
        if (b.strike) {
          const px0 = b.lx + b.lw + 16;
          c.font = font(this.famMono, 22);
          c.fillStyle = rgba('ash', 0.9 * dim * lk);
          c.fillText(pv.toFixed(2), px0, b.to.y + 1);
          c.fillStyle = rgba('bone', 0.4 * dim * lk);
          c.fillRect(px0 + 62, b.to.y - 2, 70 * pv / 0.22, 4);
        } else {
          c.font = font(this.famMono, 16);
          c.fillStyle = rgba('ash', 0.85 * dim * lk);
          c.fillText(pv.toFixed(2), b.lx, b.to.y + b.size * 0.72);
          c.fillStyle = rgba('bone', 0.35 * dim * lk);
          c.fillRect(b.lx + 44, b.to.y + b.size * 0.72 - 1, 90 * pv, 2);
        }
        if (b.strike && loomK > 0 && lk > 0) {
          c.fillStyle = rgba('graphite', 0.95 * lk);
          c.fillRect(b.lx - 4, b.to.y - 1, (b.lw + 8) * loomK, 2.2);
        }
      }
    }
    // ---- trunk nodes and tokens
    const tip = this.tipX(t);
    ws.forEach((w, i) => {
      const nx = this.nodes[i]!;
      if (t < w.start - 0.02 && i > 0) return;
      c.fillStyle = rgba('bone', 0.95);
      c.beginPath(); c.arc(nx, Y0, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = rgba('ink', 1);
      c.beginPath(); c.arc(nx, Y0, 2.2, 0, Math.PI * 2); c.fill();
      if (t < w.start) return;
      const p = Lyrics.wordProgress(w, t);
      const cool = prog(t, w.end, w.end + 0.3);
      const isLoom = i === nLast;
      const x = this.tokX[i]!;
      c.save();
      c.textBaseline = 'alphabetic';
      if (isLoom) {
        // Loom lands whole on its beat, as the sample is drawn
        const s = lerp(1.18, 1, ease.outExpo(loomK));
        c.translate(x, Y0 - 24); c.scale(s, s);
        c.font = font(this.famLoom, this.loomSize);
        c.shadowColor = rgba('signal', 0.7); c.shadowBlur = 40 * z;
        c.globalAlpha = loomK;
        c.fillStyle = rgba('signal');
        c.fillText(w.w.replace(/[^A-Za-z]/g, ''), 0, 0);
        c.shadowBlur = 0;
        c.font = font(this.famMono, 17);
        c.letterSpacing = '3px';
        c.fillStyle = rgba('signal', 0.95);
        c.textBaseline = 'top';
        c.fillText(`p ${CHOSEN_P[i]!.toFixed(2)}  ▸ SAMPLED`, 6 / s, (24 + 12) / s);
      } else {
        // written by the tip, glyph by glyph; hot while sung, cooling to bone
        c.beginPath(); c.rect(x - 4, Y0 - 200, Math.max(0, tip - x + 6), 260); c.clip();
        c.font = font(this.famTok, this.tokSize);
        c.fillStyle = p < 1 || cool < 1 ? mix('signal', 'bone', cool, 1) : rgba('bone', 0.95);
        c.fillText(w.w.toUpperCase(), x, Y0 - 20);
        c.restore(); c.save();
        c.font = font(this.famMono, 15);
        c.fillStyle = rgba('ash', 0.9 * prog(t, w.start + 0.05, w.start + 0.2));
        c.textBaseline = 'top';
        c.fillText(`p ${CHOSEN_P[i]!.toFixed(2)}`, x + 2, Y0 + 12);
      }
      c.restore();
    });
  }
}

function mix(a: string, b: string, k: number, alpha: number) {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgba(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')},${alpha})`;
}
