// Geometry and drawing helpers for the DNA edition's `room` slot (dna-room.ts): a schematic ribosome
// in the classic cutaway orientation (large subunit above, small subunit below, mRNA running 5'→3'
// left to right between them, tRNA sites E · P · A left to right, the exit tunnel through the large
// subunit), tRNA cloverleaf glyphs, the standard genetic code, and engraving/section hatching.
// Local units are px at full scale; the origin is the centre of the P-site codon on the mRNA axis,
// y down (the large subunit is at negative y). Everything is deterministic.
import { rgba } from '../engine/palette';
import { hash } from '../engine/util';

export type Pt = { x: number; y: number };

export const NT = 36; // px per nucleotide on the tape
export const CODON = NT * 3;
export const RS = 24; // px per residue along the nascent chain
export const TAPE = 17; // tape half-height

// ------------------------------------------------------------------ genetic code (standard table)
const BASES = 'UCAG';
const AAS = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
export const translate = (codon: string) => AAS[BASES.indexOf(codon[0]!) * 16 + BASES.indexOf(codon[1]!) * 4 + BASES.indexOf(codon[2]!)]!;
export const COMP: Record<string, string> = { A: 'U', U: 'A', G: 'C', C: 'G' };
/** Codon–anticodon hydrogen bonds per position (Watson–Crick): A·U two, G·C three. */
export const HB: Record<string, number> = { A: 2, U: 2, G: 3, C: 3 };

/** A deterministic open reading frame of sense codons (no stop codons). */
export function senseCodons(n: number, seed = 7): string[] {
  const out: string[] = [];
  let i = 0;
  while (out.length < n) {
    const c = BASES[Math.floor(hash(seed, i, 1) * 4)]! + BASES[Math.floor(hash(seed, i, 2) * 4)]! + BASES[Math.floor(hash(seed, i, 3) * 4)]!;
    i++;
    if (translate(c) === '*') continue;
    out.push(c);
  }
  return out;
}

// ------------------------------------------------------------------ splines
function catmull(p0: Pt, p1: Pt, p2: Pt, p3: Pt, u: number): Pt {
  const u2 = u * u, u3 = u2 * u;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
  };
}
export function smoothClosed(src: [number, number][], sub = 8): Pt[] {
  const p = src.map(([x, y]) => ({ x, y })), n = p.length, out: Pt[] = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < sub; k++) out.push(catmull(p[(i - 1 + n) % n]!, p[i]!, p[(i + 1) % n]!, p[(i + 2) % n]!, k / sub));
  return out;
}
export function smoothOpen(src: [number, number][], sub = 8): Pt[] {
  const p = src.map(([x, y]) => ({ x, y })), n = p.length, out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sub; k++) out.push(catmull(p[Math.max(0, i - 1)]!, p[i]!, p[i + 1]!, p[Math.min(n - 1, i + 2)]!, k / sub));
  out.push(p[n - 1]!);
  return out;
}
export function pathOf(pts: Pt[], closed = true, into = new Path2D()): Path2D {
  pts.forEach((q, i) => (i === 0 ? into.moveTo(q.x, q.y) : into.lineTo(q.x, q.y)));
  if (closed) into.closePath();
  return into;
}
/** Offset outline (a closed polygon) of an open polyline at half-width hw. */
export function ribbonOutline(pts: Pt[], hw: number): Pt[] {
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
    L.push({ x: pts[i]!.x + nx * hw, y: pts[i]!.y + ny * hw });
    R.push({ x: pts[i]!.x - nx * hw, y: pts[i]!.y - ny * hw });
  }
  return [...L, ...R.reverse()];
}
export function lengths(pts: Pt[]) {
  const L = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) L[i] = L[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return L;
}
export function atLength(pts: Pt[], L: Float64Array, s: number, out: Pt = { x: 0, y: 0 }): Pt {
  const n = pts.length;
  if (s <= 0) { out.x = pts[0]!.x; out.y = pts[0]!.y; return out; }
  if (s >= L[n - 1]!) { out.x = pts[n - 1]!.x; out.y = pts[n - 1]!.y; return out; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m]! < s) lo = m; else hi = m; }
  const u = (s - L[lo]!) / Math.max(1e-9, L[hi]! - L[lo]!);
  out.x = pts[lo]!.x + (pts[hi]!.x - pts[lo]!.x) * u; out.y = pts[lo]!.y + (pts[hi]!.y - pts[lo]!.y) * u;
  return out;
}

// ------------------------------------------------------------------ the ribosome (local px)
// The intersubunit cavity (cut into the large subunit's underside), where the tRNAs sit: the same
// ellipse as dCav in dna-room-glsl.ts.
export const CAV = { x: 0, y: -170, rx: 215, ry: 190 };
export const CAVITY: Pt[] = Array.from({ length: 96 }, (_, i) => {
  const a = (i / 96) * Math.PI * 2;
  return { x: CAV.x + Math.cos(a) * CAV.rx, y: CAV.y + Math.sin(a) * CAV.ry };
});
// Exit tunnel centreline: from the peptidyl-transferase centre to the solvent side (as dTun).
export const TUNNEL = smoothOpen([[30, -344], [58, -410], [104, -468], [152, -526], [188, -588], [226, -690]], 8);
export const TUNNEL_HW = 19;
export const PTC: Pt = { x: 30, y: -344 };
export const TUNNEL_EXIT: Pt = { x: 211, y: -648 };
/** The acceptor end (amino-acid bead) of a tRNA whose anticodon sits at x = xc. */
export const TRNA_TOP = { dx: 14, y: -278 };
export const ANTICODON_Y = -50;

// ------------------------------------------------------------------ nascent chains outside the tunnel
/**
 * A deterministic nascent-chain coil starting at the tunnel exit and heading outward (-y), with a
 * weak pull toward a collapse centre so long chains gather into a loose globule (schematic).
 */
export function chainCoil(n: number, seed: number): Pt[] {
  const out: Pt[] = [{ x: TUNNEL_EXIT.x, y: TUNNEL_EXIT.y }];
  let ang = -Math.PI / 2 + 0.35 + (hash(seed, 0) - 0.5) * 0.4;
  let x = TUNNEL_EXIT.x, y = TUNNEL_EXIT.y;
  const cx = TUNNEL_EXIT.x + 60 + (hash(seed, 1) - 0.5) * 160, cy = TUNNEL_EXIT.y - 330 - hash(seed, 2) * 80;
  for (let i = 1; i < n; i++) {
    const toC = Math.atan2(cy - y, cx - x);
    let d = toC - ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const pull = i < 6 ? 0.05 : 0.22;
    ang += d * pull + (hash(seed, i, 3) - 0.5) * 1.1;
    x += Math.cos(ang) * RS; y += Math.sin(ang) * RS;
    out.push({ x, y });
  }
  return out;
}

// ------------------------------------------------------------------ tRNA cloverleaf (local, anchor at the anticodon centre x)
export interface TRNAGlyph { body: Path2D; loops: Path2D; stems: Path2D; ticks: Path2D }
export function trnaGlyph(): TRNAGlyph {
  const body = new Path2D(), loops = new Path2D(), stems = new Path2D(), ticks = new Path2D();
  // anticodon loop
  const rr = (p: Path2D, x0: number, y0: number, x1: number, y1: number, r: number) => {
    p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.arcTo(x1, y0, x1, y0 + r, r); p.lineTo(x1, y1 - r); p.arcTo(x1, y1, x1 - r, y1, r);
    p.lineTo(x0 + r, y1); p.arcTo(x0, y1, x0, y1 - r, r); p.lineTo(x0, y0 + r); p.arcTo(x0, y0, x0 + r, y0, r); p.closePath();
  };
  rr(loops, -51, -70, 51, -30, 15);
  // anticodon stem, junction, acceptor stem (the body is filled)
  body.moveTo(-14, -70); body.lineTo(-14, -122); body.lineTo(-32, -138); body.lineTo(-44, -138);
  body.lineTo(-44, -162); body.lineTo(-13, -164); body.lineTo(-13, -240); body.lineTo(13, -240); body.lineTo(13, -198);
  body.lineTo(44, -198); body.lineTo(44, -174); body.lineTo(28, -160); body.lineTo(14, -122); body.lineTo(14, -70); body.closePath();
  // D loop (left) and TΨC loop (right, higher), variable loop
  loops.moveTo(-62 + 18, -150); loops.arc(-62, -150, 18, 0, Math.PI * 2);
  loops.moveTo(62 + 18, -186); loops.arc(62, -186, 18, 0, Math.PI * 2);
  loops.moveTo(24 + 6, -134); loops.arc(24, -134, 6, 0, Math.PI * 2);
  // 3′ CCA tail up to the amino-acid bead
  stems.moveTo(13, -240); stems.quadraticCurveTo(20, -254, TRNA_TOP.dx, TRNA_TOP.y + 9);
  // base-pair ticks across the stems
  for (let k = 0; k < 4; k++) { const y = -78 - k * 12; ticks.moveTo(-14, y); ticks.lineTo(14, y); }
  for (let k = 0; k < 5; k++) { const y = -176 - k * 13; ticks.moveTo(-13, y); ticks.lineTo(13, y); }
  for (let k = 0; k < 2; k++) { const x = -40 + k * 8; ticks.moveTo(x, -162); ticks.lineTo(x, -138); }
  for (let k = 0; k < 2; k++) { const x = 32 + k * 8; ticks.moveTo(x, -198); ticks.lineTo(x, -174); }
  return { body, loops, stems, ticks };
}

// ------------------------------------------------------------------ engraving
export type Aff = [number, number, number, number, number, number];
export interface BBox { x0: number; y0: number; x1: number; y1: number }
export function bboxOf(pts: Pt[], m: Aff, pad = 2): BBox {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) {
    const x = m[0] * p.x + m[2] * p.y + m[4], y = m[1] * p.x + m[3] * p.y + m[5];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
/**
 * Parallel hatch lines (screen px) across a bbox, at angle `ang` (radians), `step` px apart. The
 * caller has already clipped. `alphaA`/`alphaB` fade the ink along the light axis (upper-left →
 * lower-right) when they differ.
 */
export function hatchLines(c: CanvasRenderingContext2D, b: BBox, step: number, ang: number, color: string, alphaA: number, alphaB: number, lw = 1, ref?: Pt) {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, R = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + step;
  if (R < 1 || (alphaA <= 0.003 && alphaB <= 0.003)) return;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  if (Math.abs(alphaA - alphaB) > 0.01) {
    const g = c.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
    g.addColorStop(0, rgba(color, alphaA)); g.addColorStop(1, rgba(color, alphaB));
    c.strokeStyle = g;
  } else c.strokeStyle = rgba(color, alphaA);
  c.lineWidth = lw;
  c.beginPath();
  const n = Math.ceil(R / step);
  // the line phase is anchored to `ref` (the shape's origin on screen), so the lines travel with it
  const rp = ref ? ref.x * nx + ref.y * ny : 0;
  const off = (((cx * nx + cy * ny) - rp) % step + step) % step;
  for (let i = -n; i <= n; i++) {
    const o = i * step - off;
    const px = cx + nx * o, py = cy + ny * o;
    c.moveTo(px - dx * R, py - dy * R); c.lineTo(px + dx * R, py + dy * R);
  }
  c.stroke();
}
