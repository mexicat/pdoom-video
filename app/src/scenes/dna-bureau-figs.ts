// DNA edition, `bureau` — the engraved figures on the bone-paper sheet (ink on paper, sheet px):
// Annex B, a three-step PCR wheel (an editorial analogy for "forward, backward, repeat", not
// backpropagation); Appendix C, an abstract self-reproducing constructor (tape + constructor, after
// von Neumann) beside a dividing cell. All schematic; temperatures, where shown, are typical values.
import { F, font } from '../engine/type';
import { SCALE } from '../engine/gl';
import { rgba } from '../engine/palette';
import { clamp, lerp, ease, hash, smoothstep, mulberry32, noise2 } from '../engine/util';

type C2 = CanvasRenderingContext2D;
const ink = (a: number) => rgba('ink', a);

// ------------------------------------------------------------------ Annex B: the PCR wheel
export const WHEEL = { x: 620, y: 2600, r: 330 };
/** Sector centre angles (screen convention, y down): separate, anneal, extend. */
export const SECT = [(-30 * Math.PI) / 180, (90 * Math.PI) / 180, (210 * Math.PI) / 180];
const CAPS: [string, string][] = [['1 · SEPARATE', 'denature · ~95 °C'], ['2 · ANNEAL', 'primers · ~55 °C'], ['3 · EXTEND', 'polymerase · ~72 °C']];

function ticksRow(c: C2, x0: number, x1: number, y: number, dir: number, len: number, step = 10) {
  c.beginPath();
  for (let x = x0 + step / 2; x < x1; x += step) { c.moveTo(x, y); c.lineTo(x, y + dir * len); }
  c.stroke();
}
function strand(c: C2, x0: number, x1: number, y: number, w: number, al: number) {
  c.strokeStyle = ink(al); c.lineWidth = w * 1.25;
  c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
}
/** One sector's mini-diagram at progress p (0..1), centred on 0,0. */
function miniDiagram(c: C2, k: number, p: number, al: number) {
  c.lineCap = 'butt';
  const L = 75;
  if (k === 0) {
    // separate: the duplex opens into two single strands
    const g = lerp(12, 46, ease.inOutCubic(p));
    strand(c, -L, L, -g / 2, 2, al); strand(c, -L, L, g / 2, 2, al);
    c.strokeStyle = ink(0.75 * al); c.lineWidth = 1.2;
    if (g < 16) ticksRow(c, -L, L, -g / 2, 1, g);
    else { ticksRow(c, -L, L, -g / 2, 1, 6); ticksRow(c, -L, L, g / 2, -1, 6); }
  } else if (k === 1) {
    // anneal: a short primer settles on each template, at opposite ends (antiparallel)
    const g = 46;
    strand(c, -L, L, -g / 2, 2, al); strand(c, -L, L, g / 2, 2, al);
    c.strokeStyle = ink(0.75 * al); c.lineWidth = 1.2;
    ticksRow(c, -L, L, -g / 2, 1, 6); ticksRow(c, -L, L, g / 2, -1, 6);
    const e = ease.outCubic(p);
    const yt = -g / 2 + 10 + 22 * (1 - e), yb = g / 2 - 10 - 22 * (1 - e);
    strand(c, 28, 72, yt, 3, al); strand(c, -72, -28, yb, 3, al);
    c.strokeStyle = ink(0.8 * al); c.lineWidth = 1.2;
    ticksRow(c, 28, 72, yt, -1, 4); ticksRow(c, -72, -28, yb, 1, 4);
  } else {
    // extend: polymerase lengthens each primer along its template
    const g = 46, e = ease.inOutQuad(p);
    strand(c, -L, L, -g / 2, 2, al); strand(c, -L, L, g / 2, 2, al);
    c.strokeStyle = ink(0.75 * al); c.lineWidth = 1.2;
    ticksRow(c, -L, L, -g / 2, 1, 6); ticksRow(c, -L, L, g / 2, -1, 6);
    const xt = lerp(28, -72, e), xb = lerp(-28, 72, e);
    strand(c, xt, 72, -g / 2 + 10, 3, al); strand(c, -72, xb, g / 2 - 10, 3, al);
    c.strokeStyle = ink(0.8 * al); c.lineWidth = 1.2;
    ticksRow(c, xt, 72, -g / 2 + 10, -1, 4); ticksRow(c, -72, xb, g / 2 - 10, 1, 4);
    for (const [x, y] of [[xt, -g / 2 + 10], [xb, g / 2 - 10]] as const) {
      c.fillStyle = rgba('bone', al); c.strokeStyle = ink(0.9 * al); c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(x, y, 11, 8, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.save(); c.beginPath(); c.ellipse(x, y, 11, 8, 0, 0, Math.PI * 2); c.clip();
      c.lineWidth = 0.8; c.strokeStyle = ink(0.5 * al); c.beginPath();
      for (let o = -16; o <= 16; o += 3.5) { c.moveTo(x + o - 8, y + 8); c.lineTo(x + o + 8, y - 8); }
      c.stroke(); c.restore();
    }
  }
}
function duplexGlyph(c: C2, x: number, y: number, al: number) {
  c.lineCap = 'butt';
  strand(c, x - 30, x + 30, y - 5, 2, al); strand(c, x - 30, x + 30, y + 5, 2, al);
  c.strokeStyle = ink(0.75 * al); c.lineWidth = 1.2;
  c.beginPath();
  for (let i = 0; i < 6; i++) { const xx = x - 25 + i * 10; c.moveTo(xx, y - 5); c.lineTo(xx, y + 5); }
  c.stroke();
}

export interface WheelState {
  /** Marker angle (rad). */
  ang: number;
  /** Active sector (-1 before the first step) and its progress. */
  act: number; p: number;
  /** Product count shown in the hub (continuous: 1..4), and the fade-in of the wheel. */
  n: number; al: number;
}
export function drawWheel(c: C2, s: WheelState) {
  const { x, y, r } = WHEEL, al = s.al;
  if (al <= 0.001) return;
  c.save();
  c.lineCap = 'butt';
  // active sector: engraved hatch in its wedge
  if (s.act >= 0) {
    const a0 = SECT[s.act]! - Math.PI / 3, a1 = SECT[s.act]! + Math.PI / 3;
    c.save();
    c.beginPath(); c.moveTo(x + Math.cos(a0) * 100, y + Math.sin(a0) * 100); c.arc(x, y, r - 12, a0, a1); c.arc(x, y, 100, a1, a0, true); c.closePath();
    c.clip();
    c.strokeStyle = ink(0.17 * al); c.lineWidth = 0.9;
    c.beginPath();
    for (let o = -r; o <= r; o += 6) { c.moveTo(x + o - r, y + r); c.lineTo(x + o + r, y - r); }
    c.stroke();
    c.restore();
    c.strokeStyle = ink(0.92 * al); c.lineWidth = 7;
    c.beginPath(); c.arc(x, y, r - 6, a0 + 0.02, a1 - 0.02); c.stroke();
  }
  // bezel
  c.strokeStyle = ink(0.9 * al); c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = ink(0.6 * al); c.lineWidth = 1.1; c.beginPath(); c.arc(x, y, r - 12, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = ink(0.3 * al); c.lineWidth = 0.7; c.beginPath(); c.arc(x, y, r + 7, 0, Math.PI * 2); c.stroke();
  c.beginPath();
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2, r0 = i % 5 === 0 ? r - 12 : r - 8;
    c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
  }
  c.stroke();
  // sector dividers and hub
  c.strokeStyle = ink(0.7 * al); c.lineWidth = 1.3;
  c.beginPath();
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) { c.moveTo(x + Math.cos(a) * 100, y + Math.sin(a) * 100); c.lineTo(x + Math.cos(a) * (r - 12), y + Math.sin(a) * (r - 12)); }
  c.stroke();
  c.strokeStyle = ink(0.8 * al); c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, 100, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = ink(0.22 * al); c.lineWidth = 0.6;
  for (let rr = 18; rr <= 92; rr += 6.5) { c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.stroke(); }
  // mini diagrams (the active one animates, the others rest in their end state)
  for (let k = 0; k < 3; k++) {
    const a = SECT[k]!, cx = x + Math.cos(a) * r * 0.62, cy = y + Math.sin(a) * r * 0.62;
    c.save(); c.translate(cx, cy);
    c.scale(1.3, 1.3);
    miniDiagram(c, k, k === s.act ? s.p : 1, al * (k === s.act ? 1 : 0.5));
    c.restore();
  }
  // captions outside the bezel
  for (let k = 0; k < 3; k++) {
    const a = SECT[k]!, ax = x + Math.cos(a) * (r + 44), ay = y + Math.sin(a) * (r + 44);
    const on = k === s.act ? 1 : 0.62;
    c.textAlign = Math.cos(a) > 0.3 ? 'left' : Math.cos(a) < -0.3 ? 'right' : 'center';
    const yy = Math.sin(a) > 0.5 ? ay + 14 : ay;
    c.font = font(F.mono(600), 20); c.fillStyle = ink(0.95 * on * al); c.fillText(CAPS[k]![0], ax, yy);
    c.font = font(F.mono(400), 14); c.fillStyle = rgba('graphite', 0.95 * on * al); c.fillText(CAPS[k]![1], ax, yy + 24);
  }
  c.textAlign = 'left';
  // the marker: an engraved index outside the bezel
  {
    const a = s.ang, px = x + Math.cos(a) * (r + 8), py = y + Math.sin(a) * (r + 8);
    const tx = -Math.sin(a), ty = Math.cos(a);
    c.fillStyle = ink(0.92 * al);
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + Math.cos(a) * 28 + tx * 13, py + Math.sin(a) * 28 + ty * 13);
    c.lineTo(px + Math.cos(a) * 28 - tx * 13, py + Math.sin(a) * 28 - ty * 13);
    c.closePath(); c.fill();
  }
  // hub: the product tally doubles each completed cycle
  // 1 -> 2 -> 4 copies: each new one slides out of the one it was copied from
  const n = s.n, e2 = clamp(n - 1), e4 = clamp((n - 2) / 2);
  for (const sy of [-1, 1]) {
    const gy = sy * 22 * e2, a = sy < 0 ? 1 : e2;
    if (a <= 0.01) continue;
    duplexGlyph(c, x - 36 * e4, y + gy, al * a);
    if (e4 > 0.01) duplexGlyph(c, x + 36 * e4, y + gy, al * a * e4);
  }
  c.restore();
}

// ------------------------------------------------------------------ Appendix C: constructor + cell
/** Appendix C's origin: figure coordinates below are sheet px minus this. */
export const APPX = { x: 0, y: 3360 };
function hatchIn(c: C2, x: number, y: number, w: number, h: number, step: number, ang: number, al: number, lw = 0.8) {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.strokeStyle = ink(al); c.lineWidth = lw;
  const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2, dx = Math.cos(ang), dy = Math.sin(ang);
  c.beginPath();
  for (let o = -R; o <= R; o += step) { c.moveTo(cx - dy * o - dx * R, cy + dx * o - dy * R); c.lineTo(cx - dy * o + dx * R, cy + dx * o + dy * R); }
  c.stroke();
  c.restore();
}
function tape(c: C2, x0: number, x1: number, y: number, fill: number, seed: number, al: number) {
  const cw = 30, h = 30;
  c.strokeStyle = ink(0.85 * al); c.lineWidth = 1.4;
  c.strokeRect(x0, y, x1 - x0, h);
  c.lineWidth = 0.8;
  c.beginPath();
  for (let x = x0 + cw; x < x1 - 1; x += cw) { c.moveTo(x, y); c.lineTo(x, y + h); }
  c.stroke();
  let i = 0;
  for (let x = x0; x < x1 - 1; x += cw, i++) {
    if (x + cw / 2 > fill) break;
    if (hash(seed, i) > 0.5) { c.fillStyle = ink(0.85 * al); c.fillRect(x + 9, y + 9, 12, 12); }
    else { c.strokeStyle = ink(0.6 * al); c.lineWidth = 1; c.beginPath(); c.arc(x + 15, y + 15, 5, 0, Math.PI * 2); c.stroke(); }
  }
}
function machine(c: C2, x: number, y: number, al: number, letters = true) {
  const w = 370, h = 250;
  c.fillStyle = rgba('bone', al * 0.9);
  c.fillRect(x, y, w, h);
  hatchIn(c, x + 12, y + 12, 190, 226, 6, Math.PI / 4, 0.36 * al);
  hatchIn(c, x + 214, y + 12, 144, 106, 5, Math.PI / 4, 0.28 * al);
  hatchIn(c, x + 214, y + 12, 144, 106, 5, -Math.PI / 4, 0.22 * al);
  hatchIn(c, x + 214, y + 130, 144, 108, 5, 0, 0.3 * al);
  c.strokeStyle = ink(0.9 * al); c.lineWidth = 2; c.strokeRect(x, y, w, h);
  c.lineWidth = 1.1;
  c.strokeRect(x + 12, y + 12, 190, 226); c.strokeRect(x + 214, y + 12, 144, 106); c.strokeRect(x + 214, y + 130, 144, 108);
  if (letters) {
    c.font = font(F.mono(600), 16);
    for (const [s, lx, ly] of [['A', x + 20, y + 20], ['B', x + 222, y + 20], ['C', x + 222, y + 138]] as const) {
      c.fillStyle = rgba('bone', al); c.fillRect(lx, ly, 22, 24);
      c.strokeStyle = ink(0.7 * al); c.lineWidth = 0.8; c.strokeRect(lx, ly, 22, 24);
      c.fillStyle = ink(0.95 * al); c.fillText(s, lx + 6, ly + 18);
    }
  }
}
/** Static engravings rendered once at `k` x the output scale (the camera zooms up to ~1.3x). */
const SPR = new Map<string, HTMLCanvasElement>();
function cachedImage(key: string, x: number, y: number, w: number, h: number, draw: (g: C2) => void): (c: C2) => void {
  return (c: C2) => {
    let cv = SPR.get(key);
    if (!cv) {
      const k = SCALE * 1.35;
      cv = document.createElement('canvas');
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const g = cv.getContext('2d')!;
      g.scale(k, k); g.translate(-x, -y);
      g.lineCap = 'round'; g.lineJoin = 'round';
      draw(g);
      SPR.set(key, cv);
    }
    c.drawImage(cv, x, y, w, h);
  };
}
const machineA = cachedImage('machineA', 140, 190, 390, 270, (g) => machine(g, 150, 200, 1, true));
const machineB = cachedImage('machineB', 670, 190, 390, 270, (g) => machine(g, 680, 200, 1, false));

/** The constructor figure (figure coords): parent machine reading its tape; an arm builds the copy. */
export function drawConstructor(c: C2, build: number, al: number) {
  if (al <= 0.001) return;
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  const PX = 150, PY = 200;
  // parent tape runs under the machine; the read head drops from the controller (C)
  tape(c, 90, 620, 500, 1e9, 3, al);
  c.strokeStyle = ink(0.8 * al); c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(PX + 250, PY + 250); c.lineTo(PX + 240, 500); c.lineTo(PX + 300, 500); c.lineTo(PX + 290, PY + 250); c.stroke();
  // torn tape end
  c.beginPath(); c.moveTo(90, 500); for (let i = 0; i <= 6; i++) c.lineTo(90 + (i % 2 ? -6 : 0), 500 + i * 5); c.stroke();
  machineA(c);
  // the offspring, built left to right as the head passes; the rest waits as a dashed outline
  const OX = 680, OY = 200, OW = 370, OH = 250;
  const bx = OX + OW * clamp(build);
  c.save();
  c.beginPath(); c.rect(OX - 4, OY - 4, bx - OX + 4, OH + 8); c.clip();
  machineB(c);
  c.restore();
  c.strokeStyle = ink(0.45 * al); c.lineWidth = 1.2; c.setLineDash([6, 6]);
  c.strokeRect(OX, OY, OW, OH);
  c.setLineDash([]);
  // the offspring's tape, copied cell by cell
  tape(c, OX, OX + OW, 500, bx, 3, al);
  // construction arm: a gantry from the constructor (A) over the build site; the head rasters the copy
  const railY = PY - 38, railX0 = PX + 120, railX1 = OX + OW + 26;
  c.strokeStyle = ink(0.9 * al); c.lineWidth = 2;
  c.beginPath(); c.moveTo(railX0, railY); c.lineTo(railX1, railY); c.moveTo(railX0, railY + 8); c.lineTo(railX1, railY + 8); c.stroke();
  c.lineWidth = 0.8; c.beginPath();
  for (let x = railX0 + 6; x < railX1; x += 12) { c.moveTo(x, railY); c.lineTo(x + 6, railY + 8); }
  c.stroke();
  c.lineWidth = 1.6; c.beginPath(); c.moveTo(PX + 140, PY); c.lineTo(PX + 140, railY + 8); c.moveTo(PX + 100, PY); c.lineTo(PX + 140, railY + 8); c.stroke();
  const hx = bx, hy = OY + 26 + (OH - 52) * (0.5 - 0.5 * Math.cos(build * Math.PI * 10));
  c.fillStyle = rgba('bone', al); c.strokeStyle = ink(0.9 * al); c.lineWidth = 1.6;
  c.fillRect(hx - 16, railY - 7, 32, 22); c.strokeRect(hx - 16, railY - 7, 32, 22);
  c.lineWidth = 3; c.beginPath(); c.moveTo(hx, railY + 15); c.lineTo(hx, hy - 12); c.stroke();
  c.fillStyle = ink(0.95 * al);
  c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx - 9, hy - 14); c.lineTo(hx + 9, hy - 14); c.closePath(); c.fill();
  c.restore();
}

/** A cell in late division (telophase), engraved in ink, centred at (cx, cy) (figure coords). */
const cellImg = cachedImage('cell', -270, -230, 540, 460, (g) => drawCellRaw(g, 0, 0, 1));
export function drawDividingCell(c: C2, cx: number, cy: number, al: number) {
  if (al <= 0.001) return;
  c.save(); c.translate(cx, cy); cellImg(c); c.restore();
}
let cellPath: Path2D | null = null;
function drawCellRaw(c: C2, cx: number, cy: number, al: number) {
  const A = 158, Cc = 132;
  if (!cellPath) {
    const p = new Path2D();
    for (let i = 0; i <= 240; i++) {
      const th = (i / 240) * Math.PI * 2, c2 = Math.cos(2 * th);
      const r2 = Cc * Cc * c2 + Math.sqrt(Cc ** 4 * c2 * c2 + A ** 4 - Cc ** 4);
      const r = Math.sqrt(Math.max(0, r2)) * (1 + 0.015 * Math.sin(th * 5 + 1));
      const x = Math.cos(th) * r, y = Math.sin(th) * r * 1.12;
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
    cellPath = p;
  }
  c.save();
  c.translate(cx, cy); c.rotate(-0.08);
  c.fillStyle = rgba('bone', 0.6 * al); c.fill(cellPath);
  c.save(); c.clip(cellPath);
  // cytoplasm stipple and a side-light shadow hatch toward the lower right
  const rnd = mulberry32(83);
  c.fillStyle = ink(0.28 * al);
  for (let i = 0; i < 700; i++) { const x = (rnd() * 2 - 1) * 210, y = (rnd() * 2 - 1) * 110; c.fillRect(x, y, 1.1, 1.1); }
  const g = c.createLinearGradient(-60, -90, 120, 120);
  g.addColorStop(0, ink(0)); g.addColorStop(1, ink(0.42 * al));
  c.strokeStyle = g; c.lineWidth = 1;
  c.beginPath();
  for (let o = -420; o <= 420; o += 5) { c.moveTo(o - 150, 150); c.lineTo(o + 150, -150); }
  c.stroke();
  // spindle remnant toward the midbody
  c.strokeStyle = ink(0.3 * al); c.lineWidth = 0.8;
  c.beginPath();
  for (let k = -3; k <= 3; k++) { c.moveTo(-100, k * 7); c.quadraticCurveTo(-40, k * 3, 0, k * 1.2); c.moveTo(100, k * 7); c.quadraticCurveTo(40, k * 3, 0, k * 1.2); }
  c.stroke();
  c.restore();
  c.strokeStyle = ink(0.9 * al); c.lineWidth = 1.9; c.stroke(cellPath);
  c.save(); c.scale(0.965, 0.95); c.strokeStyle = ink(0.28 * al); c.lineWidth = 1; c.stroke(cellPath); c.restore();
  // midbody at the furrow
  c.fillStyle = ink(0.85 * al); c.fillRect(-4, -9, 8, 18);
  // daughter nuclei re-forming, with decondensing chromatin
  for (const s of [-1, 1]) {
    const nx = s * 108, ny = 0;
    c.fillStyle = rgba('bone', 0.9 * al);
    c.beginPath(); c.ellipse(nx, ny, 46, 40, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = ink(0.85 * al); c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = ink(0.45 * al); c.lineWidth = 0.8;
    c.beginPath(); c.ellipse(nx, ny, 41, 35, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = ink(0.6 * al); c.lineWidth = 1.3;
    const r2 = mulberry32(s > 0 ? 91 : 97);
    for (let k = 0; k < 22; k++) {
      let x = nx + (r2() - 0.5) * 48, y = ny + (r2() - 0.5) * 40;
      c.beginPath(); c.moveTo(x, y);
      for (let q = 0; q < 4; q++) {
        const a = 3 * noise2(x * 0.06 + k, y * 0.06 + s * 3);
        x += Math.cos(a) * 3.2; y += Math.sin(a) * 3.2; c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  c.restore();
}

/** A long printed rule; from `ticks` on it carries base-position ticks, every third one taller. */
export function drawRule(c: C2, y: number, x0: number, x1: number, ticks: number, tx0: number, tx1: number, al: number) {
  c.strokeStyle = ink(0.75 * al); c.lineWidth = 1.3; c.lineCap = 'butt';
  c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
  if (ticks <= 0) return;
  const step = 32;
  const xe = lerp(tx0, tx1, ticks);
  c.lineWidth = 1.2;
  c.beginPath();
  let i = 0;
  for (let x = tx0; x <= xe; x += step, i++) {
    const h = i % 3 === 0 ? 16 : 9;
    c.moveTo(x, y); c.lineTo(x, y - h * smoothstep(xe, xe - 120, x));
  }
  c.stroke();
}
