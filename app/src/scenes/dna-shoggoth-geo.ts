// Geometry and glyphs for the DNA edition's `shoggoth` slot (dna-shoggoth.ts): a schematic icosahedral
// capsid (20 faces, 12 vertices carrying surface proteins), a packaged dsDNA genome wound as a spool,
// the host-receptor / viral-mimic / capsid-spike glyphs, and schematic telomere repeat blocks.
// Deterministic; units are unit-sphere for the capsid, px for glyphs.
import { rgba } from '../engine/palette';
import { hash } from '../engine/util';

export type V3 = [number, number, number];
export type Pt = { x: number; y: number };

// ------------------------------------------------------------------ icosahedron
const PHI = (1 + Math.sqrt(5)) / 2;
export const ICO_V: V3[] = (() => {
  const v: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) { v.push([0, a, b * PHI]); v.push([a, b * PHI, 0]); v.push([b * PHI, 0, a]); }
  return v.map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as V3; });
})();
/** Faces as vertex-index triples, wound counter-clockwise seen from outside. */
export const ICO_F: [number, number, number][] = (() => {
  const n = ICO_V.length, e = 1.06; // edge length on the unit sphere is ~1.051
  const d = (i: number, j: number) => Math.hypot(ICO_V[i]![0] - ICO_V[j]![0], ICO_V[i]![1] - ICO_V[j]![1], ICO_V[i]![2] - ICO_V[j]![2]);
  const f: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    if (d(i, j) < e && d(j, k) < e && d(i, k) < e) {
      const a = ICO_V[i]!, b = ICO_V[j]!, c = ICO_V[k]!;
      const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const out = nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1]) + nz * (a[2] + b[2] + c[2]);
      f.push(out > 0 ? [i, j, k] : [i, k, j]);
    }
  }
  return f;
})();

// ------------------------------------------------------------------ rotations
export type M3 = number[]; // row-major 3x3
export function axisAngle(ax: V3, a: number): M3 {
  const l = Math.hypot(ax[0], ax[1], ax[2]), x = ax[0] / l, y = ax[1] / l, z = ax[2] / l;
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
export function mm(a: M3, b: M3): M3 {
  const r: M3 = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
}
export const mv = (m: M3, v: V3): V3 => [m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2], m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2], m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2]];
/** Rotation taking unit vector a onto unit vector b. */
export function alignRot(a: V3, b: V3): M3 {
  const c: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const s = Math.hypot(c[0], c[1], c[2]), d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (s < 1e-9) return d > 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : axisAngle([1, 0, 0], Math.PI);
  return axisAngle(c, Math.atan2(s, d));
}

// ------------------------------------------------------------------ packaged genome (dsDNA spool, schematic)
/**
 * A coaxially wound spool: layers of turns around the z axis, each layer on a smaller sphere, the
 * winding direction alternating layer to layer. Points in capsid units (inside radius 0.84).
 */
export function genomeSpool(): V3[] {
  const out: V3[] = [];
  const layers = [0.8, 0.66, 0.52, 0.38, 0.24];
  layers.forEach((R, li) => {
    const turns = Math.round(10 * R / 0.8) + 3, n = turns * 28;
    for (let i = 0; i <= n; i++) {
      const u = i / n; // pole to pole
      const zc = (li % 2 === 0 ? 1 : -1) * (1 - 2 * u) * 0.92;
      const rr = Math.sqrt(Math.max(0, 1 - zc * zc)) * R;
      const a = u * turns * Math.PI * 2 + li * 1.3;
      out.push([Math.cos(a) * rr, Math.sin(a) * rr, zc * R]);
    }
  });
  return out;
}

// ------------------------------------------------------------------ surface-protein glyphs (px, along +u from the base)
export type GlyphKind = 'spike' | 'receptor' | 'mimic';
// residue ticks ("sequence barcode", schematic) along each protein: identical in the binding cup, different along the stalk
const TICKS_CUP = [49, 53, 57];
const TICKS_R = [3, 7, 20, 24, 36, 41];
const TICKS_M = [5, 10, 22, 26, 39, 43];
/**
 * Draw a glyph with its base at (0,0) pointing along -y (up) at length scale k (1 = 64 px tall).
 * receptor: host cell-surface receptor — transmembrane anchor, two stalk domains, a binding cup.
 * mimic: the viral protein in the same glyph (at ordinary size they read alike) — the same binding cup,
 *   but on a capsid base plate, its stalk domains a little larger and shifted, and a different residue
 *   barcode along the stalk; `detail` (the loupe) draws the barcodes.
 * spike: an ordinary capsid vertex protein (shaft + knob).
 */
export function glyph(c: CanvasRenderingContext2D, kind: GlyphKind, k: number, a: number, o: { color?: string; fill?: string; lw?: number; dash?: number[]; detail?: boolean } = {}) {
  if (a <= 0.01) return;
  const col = rgba(o.color ?? 'bone', a), fill = o.fill ? rgba(o.fill, a) : null;
  c.save();
  c.scale(k, k);
  c.lineWidth = (o.lw ?? 1.6) / k;
  c.strokeStyle = col;
  if (o.dash) c.setLineDash(o.dash.map((x) => x / k));
  c.lineCap = 'round'; c.lineJoin = 'round';
  const ell = (y: number, rx: number, ry: number) => {
    c.beginPath(); c.ellipse(0, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.stroke();
  };
  const cup = () => {
    c.beginPath(); c.moveTo(-12, -62); c.quadraticCurveTo(-12, -46, 0, -46); c.quadraticCurveTo(12, -46, 12, -62);
    c.moveTo(-12, -62); c.lineTo(-7, -62); c.moveTo(12, -62); c.lineTo(7, -62);
    c.stroke();
  };
  const ticks = (us: number[], w: number) => {
    c.save(); c.setLineDash([]); c.lineWidth = 1.2 / k;
    c.beginPath();
    for (const u of us) { c.moveTo(-w, -u); c.lineTo(w, -u); }
    c.stroke(); c.restore();
  };
  if (kind === 'spike') {
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -46); c.stroke();
    c.beginPath(); c.arc(0, -54, 8, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.stroke();
  } else {
    const m = kind === 'mimic';
    if (m) { c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke(); } // capsid base plate
    else { c.beginPath(); c.moveTo(-3, 12); c.lineTo(-3, 0); c.moveTo(3, 12); c.lineTo(3, 0); c.stroke(); } // transmembrane helix
    const b1 = m ? 16 : 14, r1 = m ? 7.5 : 6, b2 = m ? 32 : 30, r2 = m ? 6.8 : 6;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -(b1 - r1)); c.moveTo(0, -(b1 + r1)); c.lineTo(0, -(b2 - r2)); c.moveTo(0, -(b2 + r2)); c.lineTo(0, -46); c.stroke();
    ell(-b1, r1, r1); ell(-b2, r2, r2);
    cup();
    if (o.detail) { ticks(m ? TICKS_M : TICKS_R, 4); ticks(TICKS_CUP, 9); }
  }
  c.restore();
}

// ------------------------------------------------------------------ telomere repeat blocks
export const REPEAT = 'TTAGGG';
export const BLOCK_W = 66;
