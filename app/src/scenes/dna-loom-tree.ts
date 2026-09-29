// Helpers for the DNA edition's `loom` scene (dna-loom.ts), and one shared with `ilya`:
//  - Phylo: a seeded, precomputed circular phylogeny (schematic). The root sits at the centre; time runs
//    outward; every lineage that reaches the present ends on the same circle with the same glyph
//    (equally weighted living tips, no privileged direction, no "top"). A few lineages end early
//    (extinction). Branching is strictly bifurcating/trifurcating: no gene transfer, not a real phylogeny.
//  - drawMethylInset: the one promoter-region methylation example (CpG lollipops, a hatched "mask").
//  - splitRow: a karaoke row that is bone where it lies over a dark disc and ink elsewhere (the disc's
//    edge sweeps across the type as the pupil/node grows or shrinks).
import { rgba } from '../engine/palette';
import { font } from '../engine/type';
import { type Word } from '../engine/lyrics';
import { clamp, lerp, mulberry32, smoothstep } from '../engine/util';
import { karaokeRow, type RowOpts } from './dna-kit';

export interface Lineage {
  /** Start and end radius (world units; the present of the full tree is R_END). */
  r0: number; r1: number;
  /** Angle (rad), from the final layout. */
  th: number;
  kids: number[];
  /** Ends before the present (extinct). */
  ext: boolean;
  parent: number;
}

/** The present at the end of the growth (world units). */
export const R_END = 1.3;
/** The loom → ilya handoff: LUCA's lit centre becomes the microscope field (px), and the node glyph's
 *  outer/inner radius ratio (its ink ring is the observer's pupil around that field). */
export const HANDOFF = { fieldR: 380, k: 2.95 };
/** "To recursive self-upgrade": its two rows (right-aligned), shared so the tail continues in place in ilya. */
export const L3_ROWS = [
  { x: 1920 - 128, y: 872, width: 100, weight: 800, size: 76 },
  { x: 1920 - 128, y: 978, width: 100, weight: 900, size: 104 },
];

export class Phylo {
  L: Lineage[] = [];
  /** Lineages sorted by start radius (draw order). */
  constructor(seed = 17) {
    const rnd = mulberry32(seed);
    // branch length: shorter early (dense deep splits), longer after r = 1 (the tips keep splitting)
    const base = (r: number) => (r < 1 ? 0.168 : 0.3);
    const L = this.L;
    L.push({ r0: 0, r1: 0, th: 0, kids: [], ext: false, parent: -1 });
    const grow = (parent: number, r0: number): number => {
      const i = L.length;
      const d = base(r0) * (0.62 + 0.76 * rnd());
      let r1 = r0 + d;
      const ln: Lineage = { r0, r1, th: 0, kids: [], ext: false, parent };
      L.push(ln);
      if (r1 >= R_END - 0.04) { ln.r1 = R_END; return i; }
      if (r0 > 0.3 && rnd() < 0.055) { ln.ext = true; ln.r1 = Math.min(r1, R_END - 0.08); return i; }
      const n = rnd() < 0.05 ? 3 : 2;
      for (let k = 0; k < n; k++) ln.kids.push(grow(i, r1));
      return i;
    };
    // LUCA's two descendant lineages (the root node is L[0], at the centre)
    L[0]!.kids.push(grow(0, 0), grow(0, 0));
    // layout: every tip gets an equal angular slot (extinct lineages a narrower one)
    const slots: number[] = [];
    const weight = (i: number): number => {
      const l = L[i]!;
      if (l.kids.length === 0) return l.ext ? 0.45 : 1;
      let w = 0; for (const k of l.kids) w += weight(k);
      return w;
    };
    const W = weight(0);
    let acc = 0;
    const th0 = rnd() * Math.PI * 2;
    const place = (i: number): number => {
      const l = L[i]!;
      if (l.kids.length === 0) {
        const w = l.ext ? 0.45 : 1;
        l.th = th0 + ((acc + w / 2) / W) * Math.PI * 2;
        acc += w;
        slots.push(l.th);
        return l.th;
      }
      const a = l.kids.map(place);
      l.th = (a[0]! + a[a.length - 1]!) / 2;
      return l.th;
    };
    place(0);
  }

  /** Lineages alive at radius g (their line crosses the front), including tips at the present. */
  aliveAt(g: number) {
    let n = 0;
    for (let i = 1; i < this.L.length; i++) { const l = this.L[i]!; if (l.r0 < g && (g <= l.r1 || (!l.ext && l.kids.length === 0 && l.r1 >= R_END))) n++; }
    return n;
  }
}

export interface TreeView {
  cx: number; cy: number;
  /** Screen px per world unit. */
  s: number;
  /** Growth front (world radius): everything beyond it is still to come. */
  g: number;
  rot: number;
  /** Line-width multiplier (the push-in thickens the lines a little). */
  wk: number;
  alpha: number;
  /** Keep the tree outside this radius around the root (LUCA's node glyph), px. */
  hole?: number;
}

/**
 * The tree as an engraving: the deep lineages drawn as hollow double lines, the rest as single ink
 * lines that thin outward; a living-tip glyph (a small cell: ring + nucleus dot) on the front for every
 * lineage alive there; extinct lineages end in a short cross-tick.
 */
export function drawTree(c: CanvasRenderingContext2D, P: Phylo, v: TreeView) {
  const { cx, cy, s, g, rot, wk } = v;
  const a = v.alpha;
  if (a <= 0.001) return;
  const X = (r: number, th: number) => cx + Math.cos(th + rot) * r * s;
  const Y = (r: number, th: number) => cy + Math.sin(th + rot) * r * s;
  const L = P.L;
  // width bins by start radius
  const BINS = [0, 0.12, 0.3, 0.5, 0.75, 1.0, 9];
  const wOf = (b: number) => lerp(2.8, 1.15, clamp(b / 5)) * wk;
  const paths: Path2D[] = BINS.slice(0, -1).map(() => new Path2D());
  const bin = (r: number) => { let b = 0; while (b < BINS.length - 2 && r >= BINS[b + 1]!) b++; return b; };
  const tips = new Path2D(), ticks = new Path2D();
  const tipR = Math.max(1.6, Math.min(2.4, 1.9 * wk));
  // screen culling (the push-in flies most of the tree off the frame)
  const onScr = (x: number, y: number, m: number) => x > -m && x < 1920 + m && y > -m && y < 1080 + m;
  for (let i = 1; i < L.length; i++) {
    const l = L[i]!;
    if (l.r0 >= g) continue;
    const re = Math.min(l.r1, g);
    const p = paths[bin(l.r0)]!;
    const x0 = X(l.r0, l.th), y0 = Y(l.r0, l.th), x1 = X(re, l.th), y1 = Y(re, l.th);
    p.moveTo(x0, y0); p.lineTo(x1, y1);
    // the split: an arc through the parent's angle, from the first child to the last
    if (l.kids.length && l.r1 < g) {
      const t0 = L[l.kids[0]!]!.th, t1 = L[l.kids[l.kids.length - 1]!]!.th;
      const R = l.r1 * s;
      if (R > 0.5) {
        const pb = paths[bin(l.r1)]!;
        pb.moveTo(X(l.r1, t0), Y(l.r1, t0));
        pb.arc(cx, cy, R, t0 + rot, t1 + rot, t1 < t0);
      }
    }
    // living tip on the front (or at the present), extinction tick
    const alive = g <= l.r1 && !(l.ext && g >= l.r1);
    if (alive && (l.kids.length === 0 || g < l.r1)) {
      if (onScr(x1, y1, 10)) { tips.moveTo(x1 + tipR, y1); tips.arc(x1, y1, tipR, 0, Math.PI * 2); }
    } else if (l.ext && g >= l.r1) {
      const nx = -Math.sin(l.th + rot) * 3.2, ny = Math.cos(l.th + rot) * 3.2;
      ticks.moveTo(x1 - nx, y1 - ny); ticks.lineTo(x1 + nx, y1 + ny);
    }
  }
  c.save();
  if (v.hole && v.hole > 0.5) { c.beginPath(); c.rect(-10, -10, 1940, 1100); c.arc(cx, cy, v.hole, 0, Math.PI * 2, true); c.clip('evenodd'); }
  c.lineCap = 'round'; c.lineJoin = 'round';
  // deep lineages: hollow double lines (ink rails, paper core), like an engraved trunk
  for (let b = 0; b < paths.length; b++) {
    const w = wOf(b);
    if (b <= 1) {
      c.strokeStyle = rgba('ink', 0.9 * a); c.lineWidth = w + 2.6 * wk;
      c.stroke(paths[b]!);
      c.strokeStyle = rgba('#E9E3D8', a); c.lineWidth = Math.max(0.6, w - 0.4 * wk);
      c.stroke(paths[b]!);
    } else {
      c.strokeStyle = rgba('ink', (0.9 - 0.05 * b) * a); c.lineWidth = w;
      c.stroke(paths[b]!);
    }
  }
  c.strokeStyle = rgba('ink', 0.6 * a); c.lineWidth = 1;
  c.stroke(ticks);
  c.fillStyle = rgba('#E9E3D8', a); c.fill(tips);
  c.strokeStyle = rgba('ink', 0.85 * a); c.lineWidth = 1.05;
  c.stroke(tips);
  c.restore();
}

/** Screen position of the living lineage nearest angle `ang` on the front (for a leader line). */
export function tipNear(P: Phylo, v: TreeView, ang: number) {
  let best = -1, bd = 1e9;
  for (let i = 1; i < P.L.length; i++) {
    const l = P.L[i]!;
    if (!(l.r0 < v.g && v.g <= l.r1 + 1e-6) || l.ext) continue;
    let d = Math.abs(((l.th + v.rot - ang) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    if (d < bd) { bd = d; best = i; }
  }
  const l = P.L[Math.max(1, best)]!;
  const r = Math.min(v.g, l.r1);
  return { x: v.cx + Math.cos(l.th + v.rot) * r * v.s, y: v.cy + Math.sin(l.th + v.rot) * r * v.s };
}

// ------------------------------------------------------------------ the methylation inset
/**
 * One promoter-region methylation example (schematic): a stretch of DNA (double hairline), a gene's
 * first exon with its transcription-start arrow, and the CpG sites of the promoter's CpG island as
 * lollipops — open = unmethylated, filled = methylated (the methyl mark). `wipe` (0..1, the sung
 * "masked") sweeps a hatched mask over the promoter and fills the lollipops it passes (not all of them:
 * methylation is partial and context dependent).
 */
export function drawMethylInset(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wipe: number, a: number) {
  if (a <= 0.001) return;
  c.save();
  c.globalAlpha = a;
  c.fillStyle = '#EAE4D9'; c.fillRect(x, y, w, h);
  c.strokeStyle = rgba('ink', 0.85); c.lineWidth = 1.2; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const yl = y + h * 0.64, x0 = x + 22, x1 = x + w - 22;
  const tss = x + w * 0.66;
  // DNA: two hairlines
  c.strokeStyle = rgba('ink', 0.9); c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(x0, yl - 2); c.lineTo(x1, yl - 2); c.moveTo(x0, yl + 2); c.lineTo(x1, yl + 2); c.stroke();
  // exon 1: a box on the line, engraved hatching
  const ex0 = tss, ex1 = x1 - 8, eh = 13;
  c.fillStyle = '#EAE4D9'; c.fillRect(ex0, yl - eh, ex1 - ex0, eh * 2);
  c.save(); c.beginPath(); c.rect(ex0, yl - eh, ex1 - ex0, eh * 2); c.clip();
  c.strokeStyle = rgba('ink', 0.55); c.lineWidth = 0.9; c.beginPath();
  for (let q = ex0 - 40; q < ex1 + 40; q += 4) { c.moveTo(q, yl + eh); c.lineTo(q + 26, yl - eh); }
  c.stroke(); c.restore();
  c.strokeStyle = rgba('ink', 0.9); c.lineWidth = 1.2; c.strokeRect(ex0, yl - eh, ex1 - ex0, eh * 2);
  // transcription start: a bent arrow
  c.lineWidth = 1.4; c.beginPath(); c.moveTo(tss, yl - eh); c.lineTo(tss, yl - eh - 30); c.lineTo(tss + 30, yl - eh - 30); c.stroke();
  c.fillStyle = rgba('ink', 0.9); c.beginPath(); c.moveTo(tss + 38, yl - eh - 30); c.lineTo(tss + 28, yl - eh - 35); c.lineTo(tss + 28, yl - eh - 25); c.closePath(); c.fill();
  // CpG island in the promoter: lollipops (clustered, irregular spacing)
  const sites = [0.02, 0.1, 0.16, 0.27, 0.34, 0.41, 0.5, 0.58, 0.63, 0.74, 0.83, 0.92];
  const meth = [1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1];
  const px0 = x0 + 6, px1 = tss - 18;
  const mx = lerp(px0 - 12, px1 + 14, wipe);
  for (let k = 0; k < sites.length; k++) {
    const sx = lerp(px0, px1, sites[k]!), top = yl - 2 - 26, r = 5.8;
    c.strokeStyle = rgba('ink', 0.9); c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(sx, yl - 2); c.lineTo(sx, top + r); c.stroke();
    const filled = meth[k]! > 0 && sx < mx;
    c.fillStyle = filled ? rgba('ink', 0.92) : '#EAE4D9';
    c.beginPath(); c.arc(sx, top, r, 0, Math.PI * 2); c.fill(); c.stroke();
  }
  // the mask: diagonal hatching over the promoter, wiping on with "masked"
  if (wipe > 0.001) {
    c.save();
    c.beginPath(); c.rect(px0 - 14, y + 10, mx - (px0 - 14), yl + 16 - (y + 10)); c.clip();
    c.strokeStyle = rgba('ink', 0.42); c.lineWidth = 1;
    c.beginPath();
    for (let q = px0 - 120; q < px1 + 60; q += 6) { c.moveTo(q, yl + 16); c.lineTo(q + 80, y + 10); }
    c.stroke();
    c.restore();
    // the mask's leading edge
    c.strokeStyle = rgba('ink', 0.7 * smoothstep(0.98, 0.9, wipe)); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(mx, y + 10); c.lineTo(mx, yl + 16); c.stroke();
  }
  c.restore();
}

// ------------------------------------------------------------------ split-colour karaoke row
/**
 * karaokeRow, drawn bone where the row lies inside the dark disc (dx, dy, dr) and ink outside it: the
 * disc's edge sweeps across the type as it grows (the LUCA node) or shrinks (the pupil).
 */
export function splitRow(c: CanvasRenderingContext2D, ws: Word[], x: number, y: number, fam: string, size: number, t: number, alpha: number, o: RowOpts, disc: { x: number; y: number; r: number }) {
  if (alpha <= 0.001) return;
  c.font = font(fam, size);
  const txt = ws.map((w) => w.w).join(' ');
  const wTot = c.measureText(txt).width;
  const x0 = o.align === 'right' ? x - wTot : o.align === 'center' ? x - wTot / 2 : x;
  const bx0 = x0 - 4, bx1 = x0 + wTot + 4, by0 = y - size, by1 = y + size * 0.3;
  // nearest / farthest distance of the row's box from the disc centre
  const nx = clamp(disc.x, bx0, bx1), ny = clamp(disc.y, by0, by1);
  const dNear = Math.hypot(nx - disc.x, ny - disc.y);
  const dFar = Math.max(Math.hypot(bx0 - disc.x, by0 - disc.y), Math.hypot(bx1 - disc.x, by0 - disc.y), Math.hypot(bx0 - disc.x, by1 - disc.y), Math.hypot(bx1 - disc.x, by1 - disc.y));
  if (disc.r <= dNear) { karaokeRow(c, ws, x, y, fam, size, t, alpha, { ...o, on: 'ink' }); return; }
  if (disc.r >= dFar) { karaokeRow(c, ws, x, y, fam, size, t, alpha, { ...o, on: 'bone' }); return; }
  c.save();
  c.beginPath(); c.rect(-10, -10, 1940, 1100); c.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2, true); c.clip('evenodd');
  karaokeRow(c, ws, x, y, fam, size, t, alpha, { ...o, on: 'ink' });
  c.restore();
  c.save();
  c.beginPath(); c.arc(disc.x, disc.y, disc.r, 0, Math.PI * 2); c.clip();
  karaokeRow(c, ws, x, y, fam, size, t, alpha, { ...o, on: 'bone' });
  c.restore();
}
