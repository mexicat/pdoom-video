// hook4's field of cells, rebuilt for the first beat of `loom` so the field dissolves (instead of
// vanishing) as the phylogeny grows out of the orange point. A copy of CellsHook.buildCells
// (dna-hook-cells.ts, same seed and drawing) — kept identical so the two sides of the cut agree.
import * as THREE from 'three';
import { W, H, SCALE, scaleContext2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { mulberry32 } from '../engine/util';

type Pt = { x: number; y: number };
function clipHalf(poly: Pt[], mx: number, my: number, nx: number, ny: number): Pt[] {
  const out: Pt[] = [];
  const f = (p: Pt) => (p.x - mx) * nx + (p.y - my) * ny;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa <= 0) !== (fb <= 0)) { const u = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }); }
  }
  return out;
}
function chaikin(p: Pt[], it = 2): Pt[] {
  let q = p;
  for (let k = 0; k < it; k++) {
    const r: Pt[] = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[i]!, b = q[(i + 1) % q.length]!;
      r.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    q = r;
  }
  return q;
}
const toPath = (p: Pt[]) => { const P = new Path2D(); p.forEach((q, i) => (i ? P.lineTo(q.x, q.y) : P.moveTo(q.x, q.y))); P.closePath(); return P; };

/** The cell field (a relaxed Voronoi tessellation, schematic epithelium), engraved into a canvas + texture. */
export function buildCellField() {
  const rnd = mulberry32(124);
  const sp = 74, rows = Math.ceil((H + 160) / (sp * 0.87)), cols = Math.ceil((W + 160) / sp);
  let seeds: Pt[] = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    seeds.push({ x: -80 + q * sp + (r % 2 ? sp / 2 : 0) + (rnd() - 0.5) * sp * 0.7, y: -80 + r * sp * 0.87 + (rnd() - 0.5) * sp * 0.6 });
  }
  seeds = seeds.filter(() => rnd() > 0.09);
  const B = { x0: -120, y0: -120, x1: W + 120, y1: H + 120 };
  const cells = (S: Pt[]) => S.map((a) => {
    let poly: Pt[] = [{ x: B.x0, y: B.y0 }, { x: B.x1, y: B.y0 }, { x: B.x1, y: B.y1 }, { x: B.x0, y: B.y1 }];
    for (const b of S) {
      if (b === a) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy > (sp * 2.6) ** 2) continue;
      poly = clipHalf(poly, (a.x + b.x) / 2, (a.y + b.y) / 2, dx, dy);
    }
    return poly;
  });
  let polys = cells(seeds);
  seeds = polys.map((p, i) => {
    if (p.length < 3) return seeds[i]!;
    let x = 0, y = 0; for (const q of p) { x += q.x; y += q.y; }
    return { x: x / p.length, y: y / p.length };
  });
  polys = cells(seeds);

  const cv = document.createElement('canvas'); cv.width = W * SCALE; cv.height = H * SCALE;
  const c = scaleContext2D(cv.getContext('2d')!, SCALE);
  const INK = (a: number) => rgba('ink', a);
  polys.forEach((poly, i) => {
    if (poly.length < 3) return;
    const s = seeds[i]!;
    const ins = poly.map((q) => { const dx = q.x - s.x, dy = q.y - s.y, l = Math.hypot(dx, dy) || 1; return { x: q.x - (dx / l) * 1.8, y: q.y - (dy / l) * 1.8 }; });
    const mem = toPath(chaikin(ins, 2));
    let rad = 0; for (const q of ins) rad += Math.hypot(q.x - s.x, q.y - s.y); rad /= ins.length;
    c.save(); c.clip(mem);
    const g = c.createLinearGradient(s.x - rad * 0.5, s.y - rad * 0.5, s.x + rad * 0.9, s.y + rad * 0.9);
    g.addColorStop(0, INK(0)); g.addColorStop(0.5, INK(0.06)); g.addColorStop(1, INK(0.42));
    c.strokeStyle = g; c.lineWidth = 0.9;
    c.beginPath();
    for (let o = -rad * 2.2; o < rad * 2.2; o += 4.2) { c.moveTo(s.x + o - rad * 1.4, s.y - rad * 1.4); c.lineTo(s.x + o + rad * 1.4, s.y + rad * 1.4); }
    c.stroke();
    c.restore();
    c.strokeStyle = INK(0.5); c.lineWidth = 1.3; c.stroke(mem);
    if (rnd() < 0.05) return;
    const nx = s.x + (rnd() - 0.5) * rad * 0.35, ny = s.y + (rnd() - 0.5) * rad * 0.35;
    const rx = rad * (0.3 + rnd() * 0.12), ry = rx * (0.72 + rnd() * 0.22), rot = rnd() * Math.PI;
    const cr = Math.cos(rot), sr = Math.sin(rot), ph = rnd() * 10;
    const np: Pt[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2, j = 1 + 0.07 * Math.sin(a * 3 + ph) + 0.05 * Math.sin(a * 5 + ph * 2);
      const ex = Math.cos(a) * rx * j, ey = Math.sin(a) * ry * j;
      np.push({ x: nx + ex * cr - ey * sr, y: ny + ex * sr + ey * cr });
    }
    const nuc = toPath(chaikin(np, 2));
    c.fillStyle = INK(0.07); c.fill(nuc);
    c.save(); c.clip(nuc);
    for (let k = 0, n = 12 + Math.floor(rnd() * 12); k < n; k++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.92;
      const ex = Math.cos(a) * rx * rr, ey = Math.sin(a) * ry * rr;
      c.fillStyle = INK(0.25 + rnd() * 0.3);
      c.beginPath(); c.arc(nx + ex * cr - ey * sr, ny + ex * sr + ey * cr, 0.7 + rnd() * 0.9, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    c.strokeStyle = INK(0.5); c.lineWidth = 1.1; c.stroke(nuc);
    if (rnd() < 0.65) {
      const a = rnd() * Math.PI * 2, rr = rnd() * 0.45;
      c.fillStyle = INK(0.55); c.beginPath(); c.arc(nx + Math.cos(a) * rx * rr, ny + Math.sin(a) * ry * rr, Math.max(1.5, rad * 0.055), 0, Math.PI * 2); c.fill();
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { cv, tex };
}
