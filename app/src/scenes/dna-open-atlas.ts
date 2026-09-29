// The outro's scale-cut plates (dna-outro.ts): the observer's own eye in section, one retinal rod,
// its nucleus, a chromatin loop. Each is an engraved ink-on-bone plate drawn in screen px, laid out
// so the structure the next cut enters sits under the orange point at the frame centre (CX, CY).
// These are montage across scales (schematic anatomy), not an optical zoom.
import { rgba } from '../engine/palette';
import { lerp, hash, noise1 } from '../engine/util';
import { CX, CY, PAPER_CSS } from './dna-open-plate';

type Pt = { x: number; y: number };
const TAU = Math.PI * 2;

/** Parallel engraving lines inside `path` (angle, spacing, alpha); a linear alpha ramp from (g0) to (g1). */
function hatchIn(c: CanvasRenderingContext2D, path: Path2D, ang: number, gap: number, a0: number, a1 = a0, g?: [number, number, number, number], lw = 0.9) {
  if (Math.max(a0, a1) <= 0.003) return;
  c.save(); c.clip(path);
  if (g) { const gr = c.createLinearGradient(g[0], g[1], g[2], g[3]); gr.addColorStop(0, rgba('ink', a0)); gr.addColorStop(1, rgba('ink', a1)); c.strokeStyle = gr; }
  else c.strokeStyle = rgba('ink', a0);
  c.lineWidth = lw;
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, R = 1400;
  c.beginPath();
  for (let i = -Math.ceil(R / gap); i <= Math.ceil(R / gap); i++) {
    const ox = CX + nx * i * gap, oy = CY + ny * i * gap;
    c.moveTo(ox - dx * R, oy - dy * R); c.lineTo(ox + dx * R, oy + dy * R);
  }
  c.stroke(); c.restore();
}
const ring = (cx: number, cy: number, r0: number, r1: number, a0 = 0, a1 = TAU) => {
  const p = new Path2D();
  p.arc(cx, cy, r1, a0, a1); p.arc(cx, cy, r0, a1, a0, true); p.closePath();
  return p;
};
const blob = (cx: number, cy: number, rx: number, ry: number, seed: number, amp = 0.08, rot = 0) => {
  const p = new Path2D();
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * TAU;
    const k = 1 + amp * (Math.sin(3 * t + seed) * 0.6 + Math.sin(5 * t + seed * 1.7) * 0.3 + Math.sin(9 * t + seed * 2.3) * 0.15);
    const x = Math.cos(t) * rx * k, y = Math.sin(t) * ry * k;
    const X = cx + x * Math.cos(rot) - y * Math.sin(rot), Y = cy + x * Math.sin(rot) + y * Math.cos(rot);
    if (i === 0) p.moveTo(X, Y); else p.lineTo(X, Y);
  }
  p.closePath();
  return p;
};
function stroke(c: CanvasRenderingContext2D, p: Path2D, a: number, w = 1.3) { c.strokeStyle = rgba('ink', a); c.lineWidth = w; c.stroke(p); }
function fillPaper(c: CanvasRenderingContext2D, p: Path2D) { c.fillStyle = PAPER_CSS; c.fill(p); }

// ------------------------------------------------------------------ 1. the eye in horizontal section
/** Eyeball outer radius (px) and px per mm (24 mm eyeball). */
export const EYE_SEC = { R: 300, pxmm: 300 / 12 };
export function drawEyeSection(c: CanvasRenderingContext2D, a: number) {
  const R = EYE_SEC.R;
  const thP = (195 * Math.PI) / 180; // the point sits on the retina, back and a little up from the fovea
  const rP = R - 23;
  const ex = CX - rP * Math.cos(thP), ey = CY - rP * Math.sin(thP);
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  // optic nerve leaving the back, with its sheath
  const nA = (163 * Math.PI) / 180;
  const n0 = { x: ex + Math.cos(nA) * (R - 6), y: ey + Math.sin(nA) * (R - 6) };
  const nerve = new Path2D();
  const dir = { x: Math.cos(nA + 0.12), y: Math.sin(nA + 0.12) }, nrm = { x: -dir.y, y: dir.x };
  const L = 520, w0 = 54, w1 = 46;
  nerve.moveTo(n0.x + nrm.x * w0, n0.y + nrm.y * w0);
  nerve.quadraticCurveTo(n0.x + dir.x * L * 0.5 + nrm.x * (w0 + 6), n0.y + dir.y * L * 0.5 + nrm.y * (w0 + 6), n0.x + dir.x * L + nrm.x * w1 + 20, n0.y + dir.y * L + nrm.y * w1 + 30);
  nerve.lineTo(n0.x + dir.x * L - nrm.x * w1 + 20, n0.y + dir.y * L - nrm.y * w1 + 30);
  nerve.quadraticCurveTo(n0.x + dir.x * L * 0.5 - nrm.x * (w0 + 6), n0.y + dir.y * L * 0.5 - nrm.y * (w0 + 6), n0.x - nrm.x * w0, n0.y - nrm.y * w0);
  nerve.closePath();
  fillPaper(c, nerve);
  // nerve fibres: long lines along it, fading as it leaves the plate
  {
    const g = c.createLinearGradient(n0.x, n0.y, n0.x + dir.x * L, n0.y + dir.y * L);
    g.addColorStop(0, rgba('ink', 0.55 * a)); g.addColorStop(1, rgba('ink', 0));
    c.save(); c.clip(nerve); c.strokeStyle = g; c.lineWidth = 0.9;
    c.beginPath();
    for (let i = -12; i <= 12; i++) {
      const o = i * 3.6;
      c.moveTo(n0.x + nrm.x * o - dir.x * 10, n0.y + nrm.y * o - dir.y * 10);
      c.quadraticCurveTo(n0.x + dir.x * L * 0.5 + nrm.x * o * 1.1, n0.y + dir.y * L * 0.5 + nrm.y * o * 1.1, n0.x + dir.x * L + nrm.x * o * 0.9 + 20, n0.y + dir.y * L + nrm.y * o * 0.9 + 30);
    }
    c.stroke(); c.restore();
    const g2 = c.createLinearGradient(n0.x, n0.y, n0.x + dir.x * L, n0.y + dir.y * L);
    g2.addColorStop(0, rgba('ink', 0.9 * a)); g2.addColorStop(0.75, rgba('ink', 0.5 * a)); g2.addColorStop(1, rgba('ink', 0));
    c.strokeStyle = g2; c.lineWidth = 1.5; c.stroke(nerve);
  }
  // two rectus muscles in section, inserting on the sclera ahead of the equator and running back
  for (const sg of [-1, 1]) {
    const m = new Path2D();
    const ins = (sg * 62 * Math.PI) / 180;
    const p0 = { x: ex + Math.cos(ins) * R, y: ey + Math.sin(ins) * R };
    const p1 = { x: ex + Math.cos(ins * 0.72) * (R + 2), y: ey + Math.sin(ins * 0.72) * (R + 2) };
    const back = { x: ex - R * 1.25, y: ey + sg * R * 0.62 };
    m.moveTo(p1.x, p1.y);
    m.quadraticCurveTo(ex + R * 0.2, ey + sg * (R + 58), back.x, back.y + sg * 34);
    m.lineTo(back.x - 30, back.y);
    m.quadraticCurveTo(ex - R * 0.2, ey + sg * (R + 10), p0.x, p0.y);
    m.closePath();
    fillPaper(c, m);
    const g0 = { x: ex, y: ey + sg * R * 0.8 }, g1 = { x: ex, y: ey + sg * (R + 60) };
    hatchIn(c, m, sg * 0.12, 3.0, 0.15 * a, 0.6 * a, [g0.x, g0.y, g1.x, g1.y]);
    const fade = c.createLinearGradient(ex, ey, back.x - 30, back.y);
    fade.addColorStop(0, rgba('ink', 0.85 * a)); fade.addColorStop(1, rgba('ink', 0));
    c.strokeStyle = fade; c.lineWidth = 1.3; c.stroke(m);
  }
  // sclera (outer coat), cornea in front
  const corA = (36 * Math.PI) / 180;
  const sclera = ring(ex, ey, R - 13, R, corA, TAU - corA);
  { const disc = new Path2D(); disc.arc(ex, ey, R, 0, TAU); fillPaper(c, disc); }
  hatchIn(c, sclera, 0.35, 4.2, 0.35 * a);
  stroke(c, sclera, 0.85 * a, 1.4);
  // cornea: a steeper cap bulging past the sclera
  const cc = { x: ex + R * 0.38, y: ey }, cr = R * 0.66;
  const cA = Math.asin((R * Math.sin(corA)) / cr);
  const cornea = new Path2D();
  cornea.arc(cc.x, cc.y, cr, -cA, cA); cornea.arc(cc.x, cc.y, cr - 11, cA * 0.99, -cA * 0.99, true); cornea.closePath();
  fillPaper(c, cornea); stroke(c, cornea, 0.8 * a, 1.3);
  // choroid (dark vascular coat) and retina, from the ciliary body round the back
  const retA0 = (48 * Math.PI) / 180, retA1 = TAU - retA0;
  const choroid = ring(ex, ey, R - 20, R - 13, retA0, retA1);
  hatchIn(c, choroid, -0.6, 2.2, 0.8 * a);
  stroke(c, choroid, 0.6 * a, 1);
  const retina = ring(ex, ey, R - 30, R - 20, retA0 + 0.03, retA1 - 0.03);
  fillPaper(c, retina);
  // retina: fine radial ticks (the photoreceptor layer faces the choroid)
  c.strokeStyle = rgba('ink', 0.6 * a); c.lineWidth = 0.8;
  c.beginPath();
  for (let i = 0; i < 520; i++) {
    const t = lerp(retA0 + 0.04, retA1 - 0.04, i / 519);
    c.moveTo(ex + Math.cos(t) * (R - 21), ey + Math.sin(t) * (R - 21));
    c.lineTo(ex + Math.cos(t) * (R - 26), ey + Math.sin(t) * (R - 26));
  }
  c.stroke();
  stroke(c, retina, 0.8 * a, 1.1);
  // ciliary body and zonules, iris, lens
  const lens = { x: ex + R * 0.5, y: ey, rx: 52, ry: 126 };
  for (const sg of [-1, 1]) {
    const cb = new Path2D();
    const p0 = { x: ex + Math.cos(sg * retA0) * (R - 14), y: ey + Math.sin(sg * retA0) * (R - 14) };
    const p1 = { x: ex + Math.cos(sg * corA) * (R - 14), y: ey + Math.sin(sg * corA) * (R - 14) };
    cb.moveTo(p0.x, p0.y); cb.lineTo(p1.x, p1.y); cb.lineTo(lens.x + 20, ey + sg * (lens.ry + 40)); cb.closePath();
    fillPaper(c, cb); hatchIn(c, cb, 1.2, 2.6, 0.7 * a); stroke(c, cb, 0.8 * a, 1.1);
    // zonule fibres to the lens equator
    c.strokeStyle = rgba('ink', 0.45 * a); c.lineWidth = 0.8;
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const f = i / 8;
      c.moveTo(lerp(lens.x + 8, lens.x + 34, f), ey + sg * (lens.ry + 34 - 8 * f));
      c.lineTo(lerp(lens.x - 14, lens.x + 20, f), ey + sg * (lens.ry - 4));
    }
    c.stroke();
    // iris: a leaf from the ciliary root toward the axis, leaving a small (constricted) pupil
    const ir = new Path2D();
    const ix = ex + R * 0.66;
    ir.moveTo(ix - 4, ey + sg * (R * 0.6)); ir.quadraticCurveTo(ix + 10, ey + sg * (R * 0.33), ix + 6, ey + sg * 24);
    ir.lineTo(ix - 3, ey + sg * 24); ir.quadraticCurveTo(ix - 2, ey + sg * (R * 0.33), ix - 14, ey + sg * (R * 0.6)); ir.closePath();
    fillPaper(c, ir); hatchIn(c, ir, 0, 2.4, 0.85 * a); stroke(c, ir, 0.9 * a, 1.2);
  }
  const lp = new Path2D(); lp.ellipse(lens.x, lens.y, lens.rx, lens.ry, 0, 0, TAU);
  fillPaper(c, lp);
  c.strokeStyle = rgba('ink', 0.45 * a); c.lineWidth = 0.9;
  for (let k = 1; k <= 6; k++) { c.beginPath(); c.ellipse(lens.x, lens.y, lens.rx * (1 - k * 0.13), lens.ry * (1 - k * 0.12), 0, 0, TAU); c.stroke(); }
  stroke(c, lp, 0.9 * a, 1.4);
  c.restore();
}

// ------------------------------------------------------------------ 2. one retinal rod (and its neighbours)
/** px per µm. */
export const ROD = { pxum: 15 };
interface RodSpec { y: number; nx: number; a: number; cone?: boolean; seed: number }
function drawRod(c: CanvasRenderingContext2D, r: RodSpec, main: boolean) {
  const k = ROD.pxum, y = r.y, a = r.a;
  const w = (main ? 2.1 : 1.9) * k; // cell width
  // along x: outer-segment tip at x0, then OS, cilium, inner segment, OLM, fibre, nucleus (at nx), axon, spherule
  const osL = (r.cone ? 11 : 25) * k, isL = (r.cone ? 22 : 26) * k, cil = 1.2 * k;
  const olm = CX - 3.4 * k - 40;
  const isX1 = olm, isX0 = isX1 - isL, osX1 = isX0 - cil, osX0 = osX1 - osL;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  // outer segment: a stack of membrane discs (rod: cylinder; cone: tapering)
  const os = new Path2D();
  const tip = r.cone ? w * 0.18 : w / 2;
  os.moveTo(osX1, y - w / 2); os.lineTo(osX0 + tip, y - (r.cone ? tip : w / 2)); os.quadraticCurveTo(osX0, y, osX0 + tip, y + (r.cone ? tip : w / 2));
  os.lineTo(osX1, y + w / 2); os.closePath();
  fillPaper(c, os);
  c.save(); c.clip(os);
  c.strokeStyle = rgba('ink', 0.7 * a); c.lineWidth = 0.9;
  c.beginPath();
  for (let x = osX0 + 3; x < osX1 - 1; x += 3.4) { c.moveTo(x, y - w); c.lineTo(x, y + w); }
  c.stroke();
  c.restore();
  stroke(c, os, 0.85 * a, 1.2);
  // connecting cilium
  c.strokeStyle = rgba('ink', 0.85 * a); c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(osX1, y - 3); c.lineTo(isX0, y - 3); c.moveTo(osX1, y + 3); c.lineTo(isX0, y + 3); c.stroke();
  // inner segment: ellipsoid packed with mitochondria, then the myoid
  const isp = new Path2D();
  const wi = w * (r.cone ? 1.35 : 1.05);
  isp.moveTo(isX0, y - wi * 0.35); isp.bezierCurveTo(isX0 + isL * 0.15, y - wi * 0.55, isX0 + isL * 0.55, y - wi * 0.55, isX1, y - w * 0.32);
  isp.lineTo(isX1, y + w * 0.32); isp.bezierCurveTo(isX0 + isL * 0.55, y + wi * 0.55, isX0 + isL * 0.15, y + wi * 0.55, isX0, y + wi * 0.35); isp.closePath();
  fillPaper(c, isp);
  c.save(); c.clip(isp);
  c.strokeStyle = rgba('ink', 0.6 * a); c.lineWidth = 0.9;
  for (let i = 0; i < 16; i++) {
    const mx = isX0 + 12 + hash(r.seed, i, 1) * isL * 0.45, my = y + (hash(r.seed, i, 2) - 0.5) * wi * 0.6;
    c.beginPath(); c.ellipse(mx, my, 9 + 6 * hash(r.seed, i, 3), 3, 0, 0, TAU); c.stroke();
  }
  c.restore();
  // shade the lower half (light from above)
  hatchIn(c, isp, 0, 2.6, 0, 0.5 * a, [isX0, y - wi * 0.1, isX0, y + wi * 0.5]);
  stroke(c, isp, 0.85 * a, 1.2);
  // fibre to the nucleus, nucleus, axon, spherule
  const nx = r.nx, nrx = (main ? 2.3 : 2.0) * k, nry = (main ? 1.9 : 1.65) * k;
  c.strokeStyle = rgba('ink', 0.85 * a); c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(isX1, y - 5); c.lineTo(nx - nrx, y - 5); c.moveTo(isX1, y + 5); c.lineTo(nx - nrx, y + 5);
  c.stroke();
  const np = new Path2D(); np.ellipse(nx, y, nrx, nry, 0, 0, TAU);
  fillPaper(c, np);
  // condensed chromatin: dense cross-hatching with a few lighter channels
  hatchIn(c, np, 0.7, 2.4, 0.75 * a);
  hatchIn(c, np, -0.5, 3.4, 0.45 * a);
  stroke(c, np, 0.95 * a, 1.4);
  const sx = CX + 22 * k;
  c.beginPath(); c.moveTo(nx + nrx, y - 3.5); c.lineTo(sx - 18, y - 3); c.moveTo(nx + nrx, y + 3.5); c.lineTo(sx - 18, y + 3); c.stroke();
  const sp = new Path2D(); sp.ellipse(sx, y, 22, 17, 0, 0, TAU);
  fillPaper(c, sp); hatchIn(c, sp, 0.9, 3, 0.4 * a); stroke(c, sp, 0.85 * a, 1.2);
  c.strokeStyle = rgba('ink', 0.7 * a); c.lineWidth = 1;
  c.beginPath(); c.arc(sx + 10, y, 7, -1.9, 1.9, true); c.stroke();
  c.restore();
  return { olm, osX0 };
}
export function drawPhotoreceptor(c: CanvasRenderingContext2D, a: number) {
  const k = ROD.pxum;
  const rows: RodSpec[] = [];
  // neighbours: the outer nuclear layer stacks their nuclei at different depths
  for (let i = -9; i <= 9; i++) {
    if (i === 0) continue;
    const y = CY + i * 2.9 * k + (hash(i, 4) - 0.5) * 6;
    if (y < 60 || y > 1020) continue;
    const nx = CX + (hash(i, 5) - 0.35) * 16 * k;
    rows.push({ y, nx, a: a * lerp(0.42, 0.14, Math.abs(i) / 9), cone: i === 3 || i === -5, seed: i + 20 });
  }
  let olm = 0;
  for (const r of rows) olm = drawRod(c, r, false).olm;
  // pigment epithelium the outer segments reach into, and the outer limiting membrane
  const rx0 = CX - 3.4 * k - 40 - 26 * k - 1.2 * k - 25 * k;
  const rpe = new Path2D(); rpe.rect(rx0 - 70, -10, 60, 1100);
  fillPaper(c, rpe); hatchIn(c, rpe, 1.3, 2.8, 0.55 * a);
  c.strokeStyle = rgba('ink', 0.5 * a); c.lineWidth = 1;
  c.beginPath(); c.moveTo(rx0 - 10, 0); c.lineTo(rx0 - 10, 1080); c.stroke();
  c.setLineDash([3, 5]); c.strokeStyle = rgba('ink', 0.5 * a);
  c.beginPath(); c.moveTo(olm, 0); c.lineTo(olm, 1080); c.stroke(); c.setLineDash([]);
  // the cell: its nucleus under the point
  drawRod(c, { y: CY, nx: CX, a, seed: 1 }, true);
}

// ------------------------------------------------------------------ 3. the nucleus
/** px per µm (a rod nucleus is ~5 µm across). */
export const NUC = { pxum: 150 };
export function drawNucleus(c: CanvasRenderingContext2D, a: number) {
  const nx = CX + 70, ny = CY - 10, rx = 390, ry = 335;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  const outer = blob(nx, ny, rx, ry, 1.3, 0.035);
  const inner = blob(nx, ny, rx - 12, ry - 12, 1.3, 0.035);
  fillPaper(c, outer);
  // euchromatin: loose fibres wandering through the interior (seeded random walks)
  c.save(); c.clip(inner);
  for (let f = 0; f < 44; f++) {
    let x = nx + (hash(f, 1) - 0.5) * rx * 1.7, y = ny + (hash(f, 2) - 0.5) * ry * 1.7;
    let ang = hash(f, 3) * TAU;
    c.strokeStyle = rgba('ink', (0.12 + 0.14 * hash(f, 4)) * a); c.lineWidth = 0.85;
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 70; s++) {
      ang += noise1(f * 13.1 + s * 0.23) * 0.65;
      x += Math.cos(ang) * 6; y += Math.sin(ang) * 6;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  // heterochromatin: dense engraved masses against the nuclear lamina, in patches
  const het = new Path2D();
  for (let j = 0; j < 14; j++) {
    const t0 = (j / 14) * TAU + 0.3 * hash(j, 41), span = 0.25 + 0.3 * hash(j, 42), depth = 18 + 40 * hash(j, 43);
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const t = t0 + span * (i / n);
      const kk = 1 + 0.035 * (Math.sin(3 * t + 1.3) * 0.6 + Math.sin(5 * t + 2.21) * 0.3 + Math.sin(9 * t + 2.99) * 0.15);
      const x = nx + Math.cos(t) * (rx - 10) * kk, y = ny + Math.sin(t) * (ry - 10) * kk;
      if (i === 0) het.moveTo(x, y); else het.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const t = t0 + span * (i / n), bump = Math.sin(Math.PI * i / n) ** 0.7;
      const dd = depth * bump * (0.8 + 0.4 * noise1(t * 5 + j));
      const kk = 1 + 0.035 * (Math.sin(3 * t + 1.3) * 0.6 + Math.sin(5 * t + 2.21) * 0.3 + Math.sin(9 * t + 2.99) * 0.15);
      const x = nx + Math.cos(t) * ((rx - 10) * kk - dd), y = ny + Math.sin(t) * ((ry - 10) * kk - dd);
      het.lineTo(x, y);
    }
    het.closePath();
  }
  c.save(); c.clip(het);
  hatchIn(c, outer, 0.75, 2.3, 0.75 * a); hatchIn(c, outer, -0.55, 3.3, 0.5 * a);
  c.restore();
  c.strokeStyle = rgba('ink', 0.5 * a); c.lineWidth = 0.9; c.stroke(het);
  // a chromocentre and the nucleolus
  const nuc = blob(nx + 150, ny - 120, 74, 64, 2.7, 0.1);
  fillPaper(c, nuc); hatchIn(c, nuc, 0.6, 2.0, 0.8 * a); hatchIn(c, nuc, -0.7, 2.6, 0.55 * a);
  stroke(c, nuc, 0.85 * a, 1.2);
  const cc = blob(nx - 190, ny + 150, 46, 38, 5.1, 0.12);
  fillPaper(c, cc); hatchIn(c, cc, 0.9, 2.4, 0.7 * a); stroke(c, cc, 0.7 * a, 1.1);
  c.restore();
  // the loop under the point: one beaded fibre in full ink (the next plate opens on it)
  {
    const lp = (u: number) => {
      const t = u * TAU;
      const r = 62 + 12 * Math.sin(2 * t + 0.4);
      return { x: CX + 36 + Math.cos(t + 1.9) * r * 1.35, y: CY - 50 + Math.sin(t + 1.9) * r };
    };
    // move it so its lowest point sits on the point
    let lo = { x: 0, y: -1e9 };
    for (let i = 0; i <= 200; i++) { const q = lp(i / 200); if (q.y > lo.y) lo = q; }
    const ox = CX - lo.x, oy = CY - lo.y;
    c.strokeStyle = rgba('ink', 0.9 * a); c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 0; i <= 120; i++) { const q = lp(i / 120); if (i === 0) c.moveTo(q.x + ox, q.y + oy); else c.lineTo(q.x + ox, q.y + oy); }
    c.stroke();
    // the loop's two ends run off side by side (its base), fading into the rest of the chromatin
    const q0 = lp(0), q1 = lp(1);
    for (const [q, sgn] of [[q0, -1], [q1, 1]] as const) {
      const x0 = q.x + ox, y0 = q.y + oy;
      const g = c.createLinearGradient(x0, y0, x0 + sgn * 40 - 60, y0 + 190);
      g.addColorStop(0, rgba('ink', 0.9 * a)); g.addColorStop(1, rgba('ink', 0));
      c.strokeStyle = g;
      c.beginPath(); c.moveTo(x0, y0);
      c.bezierCurveTo(x0 + sgn * 16, y0 + 40, x0 - 40 + sgn * 26, y0 + 90, x0 - 60 + sgn * 40, y0 + 190);
      c.stroke();
    }
    c.fillStyle = PAPER_CSS;
    for (let i = 0; i < 16; i++) {
      const u = (i + 0.3 + 0.3 * hash(i, 51)) / 16;
      if (Math.abs(u - 0.25) < 0.05) continue;
      const q = lp(u);
      c.beginPath(); c.arc(q.x + ox, q.y + oy, 6, 0, TAU); c.fill(); c.stroke();
    }
  }
  // double envelope with pores
  stroke(c, outer, 0.95 * a, 1.6);
  stroke(c, inner, 0.7 * a, 1.1);
  c.lineWidth = 1.4;
  for (let i = 0; i < 44; i++) {
    const t = (i / 44) * TAU + 0.05 * Math.sin(i * 2.3);
    const k = 1 + 0.035 * (Math.sin(3 * t + 1.3) * 0.6 + Math.sin(5 * t + 2.21) * 0.3 + Math.sin(9 * t + 2.99) * 0.15);
    const px = nx + Math.cos(t) * (rx - 6) * k, py = ny + Math.sin(t) * (ry - 6) * k;
    const tx = -Math.sin(t), ty = Math.cos(t), ox = Math.cos(t), oy = Math.sin(t);
    c.fillStyle = PAPER_CSS;
    c.beginPath(); c.arc(px, py, 6.5, 0, TAU); c.fill();
    c.strokeStyle = rgba('ink', 0.85 * a);
    c.beginPath();
    c.moveTo(px + tx * 6 - ox * 8, py + ty * 6 - oy * 8); c.lineTo(px + tx * 6 + ox * 8, py + ty * 6 + oy * 8);
    c.moveTo(px - tx * 6 - ox * 8, py - ty * 6 - oy * 8); c.lineTo(px - tx * 6 + ox * 8, py - ty * 6 + oy * 8);
    c.stroke();
  }
  // cytoplasm edge: a faint cell membrane far outside
  c.strokeStyle = rgba('ink', 0.25 * a); c.lineWidth = 1;
  c.beginPath(); c.ellipse(nx + 40, ny + 10, rx + 190, ry + 200, 0.1, 0, TAU); c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ 4. a chromatin loop (10-nm fibre)
/** px per nm (a nucleosome core is ~11 nm across). */
export const CHR = { pxnm: 7 };
/** The loop's path (screen px): closed-ish, its two ends leaving together at the lower left. */
function loopPath(u: number): Pt {
  // a lasso: a big irregular loop, anchored lower left, with the point's linker passing the centre
  const t = u * TAU;
  const r = 205 + 34 * Math.sin(2 * t + 0.7) + 18 * Math.sin(3 * t + 2.1);
  const cx = CX + 140, cy = CY - 90;
  return { x: cx + Math.cos(t + 2.35) * r * 1.6, y: cy + Math.sin(t + 2.35) * r * 1.0 };
}
export function drawChromatin(c: CanvasRenderingContext2D, a: number) {
  const k = CHR.pxnm;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  // sample the loop
  const N = 900;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) pts.push(loopPath(i / N));
  // the two tails leaving the anchor, off the frame
  const a0 = pts[0]!, a1 = pts[N]!;
  // the stretch at the bottom of the loop is linker DNA; slide the loop so it passes under the point
  let best = 0, bd = -1e9;
  pts.forEach((p, i) => { const d = p.y - Math.abs(p.x - CX) * 0.35; if (d > bd) { bd = d; best = i; } });
  const shift = { x: CX - pts[best]!.x, y: CY - pts[best]!.y };
  for (const p of pts) { p.x += shift.x; p.y += shift.y; }
  // arc length
  const Ls = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) Ls[i] = Ls[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  const total = Ls[pts.length - 1]!;
  const at = (s: number) => {
    let i = 1; while (i < pts.length - 1 && Ls[i]! < s) i++;
    const f = (s - Ls[i - 1]!) / Math.max(1e-6, Ls[i]! - Ls[i - 1]!);
    const p = pts[i - 1]!, q = pts[i]!;
    return { x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f), tx: (q.x - p.x) / (Ls[i]! - Ls[i - 1]! || 1), ty: (q.y - p.y) / (Ls[i]! - Ls[i - 1]! || 1) };
  };
  // nucleosomes: irregular linker lengths (a schematic, not a regular fibre); keep the centre free
  const sCentre = Ls[best]!;
  const nuc: number[] = [];
  let s = 30;
  for (let i = 0; s < total - 30; i++) {
    if (Math.abs(s - sCentre) > 70) nuc.push(s);
    s += 11 * k + lerp(3, 16, hash(i, 31)) * k; // core + linker
  }
  const coreR = 5.5 * k, coreH = 2.9 * k;
  // linker DNA: a thin double helix (right-handed: front strand crosses "\\" relative to the fibre)
  const dnaR = 1.0 * k;
  const drawDNA = (s0: number, s1: number, al: number) => {
    const n = Math.max(2, Math.ceil((s1 - s0) / 2));
    for (const strand of [0, 1]) for (const front of [false, true]) {
      c.strokeStyle = rgba('ink', (front ? 0.95 : 0.4) * al); c.lineWidth = front ? 1.6 : 1.1;
      c.beginPath();
      let pen = false;
      for (let j = 0; j <= n; j++) {
        const ss = lerp(s0, s1, j / n), p = at(ss);
        const th = (ss / (3.4 * k)) * TAU + strand * 2.6;
        const isFront = Math.cos(th) > 0;
        const nx = -p.ty, ny = p.tx; // screen image of t × z (z toward the viewer): right-handed
        const o = Math.sin(th) * dnaR;
        const X = p.x + nx * o, Y = p.y + ny * o;
        if (isFront === front) { if (!pen) { c.moveTo(X, Y); pen = true; } else c.lineTo(X, Y); } else pen = false;
      }
      c.stroke();
    }
  };
  // the fibre continues out of the loop at its anchor, fading off the plate
  for (const [p, dx, dy, sd] of [[a0, -560, 330, 1], [a1, -520, 400, 2]] as const) {
    const x0 = p.x + shift.x, y0 = p.y + shift.y;
    const g = c.createLinearGradient(x0, y0, x0 + dx, y0 + dy);
    g.addColorStop(0, rgba('ink', 0.7 * a)); g.addColorStop(1, rgba('ink', 0));
    c.strokeStyle = g; c.lineWidth = 1.3;
    c.beginPath();
    for (let q = 0; q <= 40; q++) {
      const f = q / 40, w = Math.sin(f * 9 + sd) * 10 * f;
      const x = x0 + dx * f + w * 0.6, y = y0 + dy * f - w;
      if (q === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    c.fillStyle = PAPER_CSS;
    for (let q = 1; q <= 4; q++) {
      const f = q / 5.2, x = x0 + dx * f, y = y0 + dy * f;
      c.strokeStyle = rgba('ink', 0.7 * a * (1 - f));
      c.beginPath(); c.ellipse(x, y, 5.5 * k * 0.9, 3.4 * k * 0.9, -0.5 + q, 0, TAU); c.fill(); c.stroke();
    }
  }
  // linkers between nucleosomes
  let prev = 0;
  for (const sn of [...nuc, total]) {
    drawDNA(prev, Math.max(prev, sn - coreR * 0.9), a);
    prev = sn + coreR * 0.9;
  }
  // nucleosome cores: short cylinders with ~1.65 turns of DNA wrapped on the rim
  nuc.forEach((sn, i) => {
    const p = at(sn);
    const ang = Math.atan2(p.ty, p.tx) + (hash(i, 7) - 0.5) * 1.2 + Math.PI / 2;
    const tilt = 0.35 + 0.4 * hash(i, 8); // how much of the face shows
    c.save(); c.translate(p.x, p.y); c.rotate(ang);
    const body = new Path2D();
    body.ellipse(0, -coreH / 2, coreR, coreR * tilt, 0, Math.PI, 0);
    body.lineTo(coreR, coreH / 2); body.ellipse(0, coreH / 2, coreR, coreR * tilt, 0, 0, Math.PI); body.closePath();
    fillPaper(c, body);
    hatchIn(c, body, Math.PI / 2, 3.0, 0, 0.55 * a, [-coreR, 0, coreR, 0]);
    stroke(c, body, 0.9 * a, 1.3);
    const face = new Path2D(); face.ellipse(0, -coreH / 2, coreR, coreR * tilt, 0, 0, TAU);
    fillPaper(c, face); stroke(c, face, 0.8 * a, 1.1);
    // the wrapped DNA: two turns crossing the rim
    c.strokeStyle = rgba('ink', 0.85 * a); c.lineWidth = 2.2;
    for (const off of [-0.28, 0.28]) {
      c.beginPath(); c.ellipse(0, off * coreH, coreR * 1.02, coreR * tilt * 1.02, 0, 0.05, Math.PI - 0.05); c.stroke();
    }
    c.restore();
  });
  c.restore();
}

