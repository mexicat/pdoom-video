// hook4 — "recognition before release" (124.322–126.140).
// Bone paper under the microscope: a field of engraved cells (an epithelium, schematic) that dense has
// filled edge to edge. "RLHF goes askew" finishes; then each hook word lands on the field like a
// monumental slab and casts its shadow across the cells (it tightens as the word lands). P(DOOM) is the
// last and largest: its first O's counter is left open, a clear circle of cells in the ink: the opening's
// microscope field. The DOOM downbeat is the one orange impact: the focus point appears in that circle
// with a single ring. Then the light lowers, the shadow stretches across the field and the edges of
// the frame dim like an iris, holding the circle until the cut (loom).
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H, SCALE, scaleContext2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F } from '../engine/type';
import { clamp, ease, lerp, mulberry32, noise1, prog, pulse } from '../engine/util';
import { karaokeRow, makeBackdrop } from './dna-kit';
import {
  PaperCache, SAFE, dialValue, drawDial, fitHookWord, fitPD, karaokeSet, settingPath, wordIdx,
  type Hook, type Setting, type Stage,
} from './dna-hook-type';

type Pt = { x: number; y: number };
const PAPER = '#DCD7CD'; // the slab's unsung face: paper-toned, opaque
/** dna-kit's backdrop set to bone paper (cached once: its fibre noise is costly per pixel). */
function paperBackdrop() { const b = makeBackdrop(); b.u.uPaper!.value = 1; b.u.uPool!.value = 0; return b; }

/** Clip a convex polygon to the half-plane (p - m)·n <= 0 (Sutherland–Hodgman). */
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
/** Closed Chaikin smoothing. */
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

export class CellsHook implements Stage {
  paper = new PaperCache(paperBackdrop());
  T = new Layer2D();
  /** Each word's cast shadow, pre-blurred at the landed and the airborne softness (half resolution). */
  shLow: HTMLCanvasElement[] = []; shHigh: HTMLCanvasElement[] = [];
  cellTex!: THREE.CanvasTexture;
  cellCv!: HTMLCanvasElement;
  sets: Setting[] = [];
  x0: number[] = []; base: number[] = [];
  paths: Path2D[] = [];
  /** The open counter of P(DOOM)'s first O: centre and radius. */
  ring = { x: W / 2, y: H / 2, r: 60 };

  constructor(public h: Hook) {}

  init() {
    const h = this.h;
    for (let k = 0; k < 4; k++) {
      // weight 700 throughout; P(DOOM) at width 112.5, whose O has an almost perfectly round counter
      // (80 px narrower than title-safe: the push-in after DOOM keeps it inside)
      const mw = W - 2 * SAFE - 80, mc = H - 2 * SAFE - 60;
      const s = k === 3 ? fitPD(mw, mc, { weight: 700, widths: [112.5] }) : fitHookWord(h, k, mw, mc, 700);
      const x0 = (W - s.width) / 2, base = H / 2 + s.cap / 2;
      this.sets.push(s); this.x0.push(x0); this.base.push(base);
      this.paths.push(settingPath(s, x0, base));
    }
    const sprite = (path: Path2D, blur: number) => {
      const cv = document.createElement('canvas'); cv.width = W / 2; cv.height = H / 2;
      const c = cv.getContext('2d')!;
      c.scale(0.5, 0.5); c.filter = `blur(${blur / 2}px)`; c.fillStyle = rgba('ink', 1); c.fill(path);
      return cv;
    };
    for (const p of this.paths) { this.shLow.push(sprite(p, 7)); this.shHigh.push(sprite(p, 26)); }
    this.findCounter();
    this.buildCells();
  }

  /** Measure the first O's counter from a raster of P(DOOM). */
  private findCounter() {
    const s = this.sets[3]!, x0 = this.x0[3]!, base = this.base[3]!;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.fillStyle = '#fff'; c.fill(this.paths[3]!);
    const d = c.getImageData(0, 0, W, H).data;
    const ink = (x: number, y: number) => d[(Math.round(y) * W + Math.round(x)) * 4 + 3]! > 128;
    let cx = x0 + (s.charX[3]! + s.charX[4]!) / 2, cy = base - s.cap / 2;
    const reach = (dx: number, dy: number) => { let r = 0; while (r < 400 && !ink(cx + dx * r, cy + dy * r)) r++; return r; };
    // centre it between its walls
    const l = reach(-1, 0), rr = reach(1, 0), u = reach(0, -1), dn = reach(0, 1);
    cx += (rr - l) / 2; cy += (dn - u) / 2;
    this.ring = { x: cx, y: cy, r: Math.min(l + rr, u + dn) / 2 };
  }

  /** The cell field, engraved once into a texture (a Voronoi tessellation, relaxed; schematic). */
  private buildCells() {
    const rnd = mulberry32(124);
    const sp = 74, rows = Math.ceil((H + 160) / (sp * 0.87)), cols = Math.ceil((W + 160) / sp);
    let seeds: Pt[] = [];
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      seeds.push({ x: -80 + q * sp + (r % 2 ? sp / 2 : 0) + (rnd() - 0.5) * sp * 0.7, y: -80 + r * sp * 0.87 + (rnd() - 0.5) * sp * 0.6 });
    }
    seeds = seeds.filter(() => rnd() > 0.09); // a few larger cells
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
    // one Lloyd step evens the cells without making them regular
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
      // cells share their walls: a narrow inset leaves the double membrane line of a tissue section
      const ins = poly.map((q) => { const dx = q.x - s.x, dy = q.y - s.y, l = Math.hypot(dx, dy) || 1; return { x: q.x - (dx / l) * 1.8, y: q.y - (dy / l) * 1.8 }; });
      const mem = toPath(chaikin(ins, 2));
      let rad = 0; for (const q of ins) rad += Math.hypot(q.x - s.x, q.y - s.y); rad /= ins.length;
      // engraved shading: hatching thickens toward the lower right (light from the upper left)
      c.save(); c.clip(mem);
      const g = c.createLinearGradient(s.x - rad * 0.5, s.y - rad * 0.5, s.x + rad * 0.9, s.y + rad * 0.9);
      g.addColorStop(0, INK(0)); g.addColorStop(0.5, INK(0.06)); g.addColorStop(1, INK(0.42));
      c.strokeStyle = g; c.lineWidth = 0.9;
      c.beginPath();
      for (let o = -rad * 2.2; o < rad * 2.2; o += 4.2) { c.moveTo(s.x + o - rad * 1.4, s.y - rad * 1.4); c.lineTo(s.x + o + rad * 1.4, s.y + rad * 1.4); }
      c.stroke();
      c.restore();
      c.strokeStyle = INK(0.5); c.lineWidth = 1.3; c.stroke(mem);
      if (rnd() < 0.05) return; // sectioned above its nucleus
      // nucleus: an irregular outline with stippled chromatin and, mostly, a nucleolus
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
    this.cellCv = cv;
    this.cellTex = new THREE.CanvasTexture(cv);
    this.cellTex.colorSpace = THREE.SRGBColorSpace;
    this.cellTex.minFilter = THREE.LinearFilter;
    this.cellTex.generateMipmaps = false;
    this.cellTex.needsUpdate = true;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const h = this.h, t = f.t, { renderer, comp } = h.ctx;
    const wi = wordIdx(h, t);
    const rel = ease.inOutCubic(prog(t, h.tDoom + 0.05, h.ctx.end)); // recognition: the light lowers, the iris dims
    // paper and cells (a slow push; the cells sit on the paper plane)
    this.paper.render(renderer, out);
    const z = 1 + 0.018 * f.p;
    comp.draw(renderer, this.cellTex, out, { scale: [1 / z, 1 / z] });
    const c = this.T.ctx; this.T.clear();
    c.textBaseline = 'alphabetic';
    // ---- the current word is a slab landing on the field: first its shadow (it tightens as it lands)
    let land = 0;
    if (wi >= 0) {
      land = 1 - ease.outCubic(clamp((t - h.ws[wi]!) / 0.12)); // 1 = still high above the paper
      const low = wi === 3 ? rel : 0; // after DOOM the light lowers and the shadow stretches
      const ox = 44 * (1 + 2.4 * land + 1.9 * low), oy = 34 * (1 + 2.4 * land + 1.9 * low);
      const a = 0.42 * (1 - 0.55 * land) * (1 - 0.2 * low), bk = clamp(land + 0.3 * low);
      const cx = W / 2, cy = H / 2, k = 1 + 0.03 * land;
      c.save();
      c.setTransform(k, 0, 0, k, cx - cx * k + ox, cy - cy * k + oy);
      if (bk < 0.999) { c.globalAlpha = a * (1 - bk); c.drawImage(this.shLow[wi]!, 0, 0, W, H); }
      if (bk > 0.001) { c.globalAlpha = a * bk; c.drawImage(this.shHigh[wi]!, 0, 0, W, H); }
      c.restore();
    }
    if (wi < 0) {
      // "RLHF goes askew" is still being sung
      karaokeRow(c, h.carry.words, SAFE + 12, H - SAFE - 24, F.archivo(100, 800), 92, t, 1, { on: 'ink', dim: 0.3 });
    } else {
      const s = this.sets[wi]!, w = h.words[wi]!;
      if (wi === 3 && t >= h.tDoom) {
        // the counter becomes a microscope field: lit, the cells in it pulling into magnification
        // (drawn under the word, which masks it to the counter's exact shape)
        const R = this.ring, m = lerp(1, 1.9, ease.inOutCubic(prog(t, h.tDoom + 0.02, h.tDoom + 0.26)));
        c.save();
        c.beginPath(); c.arc(R.x, R.y, R.r * 1.3, 0, Math.PI * 2); c.clip();
        c.fillStyle = rgba('bone', 1); c.fillRect(R.x - R.r * 1.4, R.y - R.r * 1.4, R.r * 2.8, R.r * 2.8);
        c.translate(R.x, R.y); c.scale(m, m); c.translate(-R.x, -R.y);
        c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
        c.drawImage(this.cellCv, 0, 0, W, H);
        c.restore();
      }
      const k = 1 + 0.07 * land, cx = W / 2, cy = H / 2;
      c.save();
      c.translate(cx, cy); c.scale(k, k); c.translate(-cx, -cy);
      karaokeSet(c, s, w, this.x0[wi]!, this.base[wi]!, t, { on: 'ink', dim: 0.24, knock: PAPER });
      c.restore();
    }
    // the one orange impact: the focus point in P(DOOM)'s open counter, one ring
    if (wi === 3 && t >= h.tDoom) {
      const R = this.ring, e = prog(t, h.tDoom, h.tDoom + 0.14, ease.outCubic);
      // the impact: a wash in the counter and one ring that leaves it across the field
      const wash = pulse(t, h.tDoom, 0.06);
      if (wash > 0.01) { c.fillStyle = rgba('signal', 0.34 * wash); c.beginPath(); c.arc(R.x, R.y, R.r * 0.98, 0, Math.PI * 2); c.fill(); }
      const q = prog(t, h.tDoom, h.tDoom + 0.26, ease.outCubic);
      if (q < 1) { c.strokeStyle = rgba('signal', 0.95 * (1 - q * q)); c.lineWidth = lerp(7, 1.5, q); c.beginPath(); c.arc(R.x, R.y, R.r * lerp(0.9, 4.6, q), 0, Math.PI * 2); c.stroke(); }
      // what stays: the opening's field, a circle with its focus point
      c.strokeStyle = rgba('signal', lerp(1, 0.8, e)); c.lineWidth = lerp(4, 1.8, e);
      c.beginPath(); c.arc(R.x, R.y, R.r * lerp(0.4, 0.84, e), 0, Math.PI * 2); c.stroke();
      c.fillStyle = rgba('signal', 1);
      c.beginPath(); c.arc(R.x, R.y, lerp(10, 5.5, e), 0, Math.PI * 2); c.fill();
    }
    // the dial: ink on the paper (orange is kept for the impact)
    const da = prog(t, h.tP - 0.03, h.tP + 0.06);
    if (da > 0) drawDial(c, W - SAFE - 300, H - SAFE + 6, dialValue(h, t), { k: 1.35, alpha: da, label: rgba('ink', 0.65), digits: rgba('ink', 0.95), track: rgba('ink', 0.3), fill: rgba('ink', 0.9), barW: 222 });
    comp.draw(renderer, this.T.upload(), out);

    // ---- post: each word lands on the kick; DOOM is the impact; then the iris
    let sh = 0;
    for (let k = 0; k < 3; k++) sh = Math.max(sh, 7 * pulse(t, h.ws[k]!, 0.045));
    sh = Math.max(sh, 12 * pulse(t, h.tDoom, 0.06));
    const o: PostOverrides = {
      bloom: 0.3, bloomThreshold: 0.95, vignette: lerp(0.38, 0.8, rel), paper: 1, grain: 0.05,
      zoom: 1 + 0.05 * rel + 0.012 * pulse(t, h.ws[Math.max(0, wi)] ?? t, 0.07) + 0.025 * pulse(t, h.tDoom, 0.09),
    };
    if (sh > 0.05 && t < h.ctx.end - 0.1) o.shake = [noise1(t * 60, 1) * sh, noise1(t * 60, 2) * sh];
    return o;
  }
}
