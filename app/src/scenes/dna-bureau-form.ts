// DNA edition — the bureau's paper and its form, shared by `ascent` (the last small frame flies in
// and becomes this form) and `bureau` (which opens on it). Sheet coordinates are the bureau's first
// frame in screen px: at 69.780 s both scenes map the sheet 1:1 onto the screen, so the cut is seamless.
import * as THREE from 'three';
import { FSPass, SCALE } from '../engine/gl';
import { F, font } from '../engine/type';
import { rgba } from '../engine/palette';
import { hash } from '../engine/util';

/** The form's outer ruled border (sheet px). 16:10, the same aspect as the ascent's frames. */
export const FORM = { x: 240, y: 90, w: 1440, h: 900 };
/** Statement field: the sung line sits on its rules (baselines 800 and 930). */
export const STATEMENT = { x: 290, y: 430, w: 880, h: 525 };
/** Containment box, where BSL-1 · APPROVED lands. */
export const CONTAIN = { x: 1220, y: 430, w: 410, h: 270 };
export const STAMP1 = { x: 1425, y: 580 };
/** Lyric baselines inside the statement field (screen px at the cut). */
export const ROW1 = { x: 330, y: 800 };
export const ROW2 = { x: 330, y: 930 };

/**
 * Backdrop (optional soft glow `uGlow` = centre px (y down), radius, strength on the ink): ink with a raised centre, bone paper where `uPaper` = 1 or inside `uRect` (px, y down);
 * the paper's fibres live in sheet coordinates (`uMap`: sheet = (px - xy) / z), so they travel with
 * the camera. (A variant of dna-kit makeBackdrop with a paper rectangle and a sheet mapping.)
 */
export function makePaperPass() {
  return new FSPass(/* glsl */ `
    uniform float uPaper; uniform vec4 uRect; uniform float uRectOn; uniform vec3 uMap; uniform vec4 uGlow;
    void main() {
      vec2 px = FRAG_PX;
      vec2 pc = vec2(px.x, 1080.0 - px.y);
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ink = C_INK + C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, length(p)));
      if (uGlow.w > 0.0) { vec2 g = (pc - uGlow.xy) / uGlow.z; ink += C_BONE * uGlow.w * (exp(-dot(g, g) * 4.0) * 0.6 + exp(-dot(g, g)) * 0.4); }
      float z = max(uMap.z, 1e-3);
      vec2 sp = (pc - uMap.xy) / z;
      float fine = smoothstep(0.18, 0.6, z);
      float fib = fbm(sp * vec2(0.010, 0.022), 4) * 0.5 + fbm(sp * 0.06, 2) * 0.25 * fine;
      vec3 paper = C_BONE * (0.9 + 0.06 * fib) * vec3(1.0, 0.985, 0.95) * (1.0 - 0.16 * smoothstep(0.35, 1.05, length(p)));
      float inR = 0.0;
      if (uRectOn > 0.5) {
        vec2 a = clamp(pc - uRect.xy + 0.5, 0.0, 1.0), b = clamp(uRect.xy + uRect.zw - pc + 0.5, 0.0, 1.0);
        inR = a.x * a.y * b.x * b.y;
      }
      fragColor = vec4(mix(ink, paper, max(uPaper, inR)), 1.0);
    }`, {
    uPaper: { value: 0 }, uRect: { value: new THREE.Vector4(0, 0, 0, 0) }, uRectOn: { value: 0 },
    uMap: { value: new THREE.Vector3(0, 0, 1) }, uGlow: { value: new THREE.Vector4(0, 0, 1, 0) },
  });
}

// ------------------------------------------------------------------ engraved ornaments (precomputed)
let guilloche: Path2D | null = null;
let rosette: Path2D | null = null;
/** Header band: phase-shifted sinusoids braid into a banknote lattice. */
function guillochePath() {
  if (guilloche) return guilloche;
  const p = new Path2D();
  const x0 = FORM.x + 34, x1 = FORM.x + FORM.w - 34, cy = FORM.y + 64;
  for (let i = 0; i < 18; i++) {
    const ph = (i / 18) * Math.PI * 2;
    for (let x = x0; x <= x1; x += 3) {
      const A = 25 * (0.72 + 0.28 * Math.cos((x - x0) * 0.0105 + ph * 0.5));
      const y = cy + A * Math.sin((x - x0) * 0.0215 + ph);
      if (x === x0) p.moveTo(x, y); else p.lineTo(x, y);
    }
  }
  guilloche = p;
  return p;
}
/** A spirograph rosette (the form's seal), centred at 0,0. */
function rosettePath() {
  if (rosette) return rosette;
  const p = new Path2D();
  for (let k = 0; k < 3; k++) {
    const R = 46 - k * 10, lobes = 21 - k * 4, r = R / lobes, d = 9 - k * 1.5;
    const n = 1400;
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI * 2;
      const x = (R - r) * Math.cos(th) + d * Math.cos(((R - r) / r) * th);
      const y = (R - r) * Math.sin(th) - d * Math.sin(((R - r) / r) * th);
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
  }
  rosette = p;
  return p;
}

function caption(c: CanvasRenderingContext2D, s: string, x: number, y: number, al: number, size = 12) {
  c.font = font(F.mono(500), size);
  c.fillStyle = rgba('graphite', 0.9 * al);
  c.fillText(s, x, y);
}
function rule(c: CanvasRenderingContext2D, x0: number, x1: number, y: number, al: number, w = 0.8) {
  c.strokeStyle = rgba('ink', al); c.lineWidth = w;
  c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
}

/**
 * The containment-review form in sheet px, ink on bone (the caller sets the transform).
 * `al` scales all ink. No stamp and no lyric: those belong to the scenes.
 */
export function drawForm(c: CanvasRenderingContext2D, al = 1) {
  const { x, y, w, h } = FORM;
  c.save();
  c.lineCap = 'butt'; c.lineJoin = 'miter';
  // double ruled border
  c.strokeStyle = rgba('ink', 0.88 * al); c.lineWidth = 2.2; c.strokeRect(x, y, w, h);
  c.strokeStyle = rgba('ink', 0.5 * al); c.lineWidth = 0.8; c.strokeRect(x + 8, y + 8, w - 16, h - 16);
  // corner rosettes of the border (small registration crosses)
  c.strokeStyle = rgba('ink', 0.55 * al); c.lineWidth = 0.8;
  for (const [cx, cy] of [[x + 8, y + 8], [x + w - 8, y + 8], [x + w - 8, y + h - 8], [x + 8, y + h - 8]] as const) {
    c.beginPath(); c.arc(cx, cy, 5, 0, Math.PI * 2); c.stroke();
  }
  // guilloché header band
  c.strokeStyle = rgba('ink', 0.5 * al); c.lineWidth = 0.8;
  c.strokeRect(x + 28, y + 30, w - 56, 68);
  c.save();
  c.beginPath(); c.rect(x + 28, y + 30, w - 56, 68); c.clip();
  c.strokeStyle = rgba('ink', 0.3 * al); c.lineWidth = 0.7;
  c.stroke(guillochePath());
  c.restore();
  // title block
  c.fillStyle = rgba('ink', 0.92 * al);
  c.font = font(F.serif(600), 46);
  c.fillText('Containment Review', x + 48, y + 170);
  caption(c, 'FORM C-1 · BIOSAFETY LEVEL ASSIGNMENT', x + 50, y + 198, al, 13);
  // seal
  c.save();
  c.translate(x + w - 118, y + 164);
  c.strokeStyle = rgba('ink', 0.55 * al); c.lineWidth = 1.1;
  c.beginPath(); c.arc(0, 0, 58, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 0.6; c.beginPath(); c.arc(0, 0, 52, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    c.beginPath(); c.moveTo(Math.cos(a) * 52, Math.sin(a) * 52); c.lineTo(Math.cos(a) * 56, Math.sin(a) * 56); c.stroke();
  }
  c.strokeStyle = rgba('ink', 0.32 * al); c.lineWidth = 0.55;
  c.stroke(rosettePath());
  c.restore();
  rule(c, x + 34, x + w - 34, y + 228, 0.7 * al, 1.2);
  // row of short fields
  const fy = y + 262;
  caption(c, 'AGENT', x + 50, fy, al);
  rule(c, x + 50, x + 640, fy + 34, 0.55 * al);
  caption(c, 'RISK GROUP', x + 700, fy, al);
  rule(c, x + 700, x + 930, fy + 34, 0.55 * al);
  caption(c, 'REPLICATES', x + 990, fy, al);
  c.strokeStyle = rgba('ink', 0.7 * al); c.lineWidth = 1;
  c.font = font(F.mono(500), 13);
  for (const [bx, s] of [[x + 990, 'YES'], [x + 1100, 'NO']] as const) {
    c.strokeRect(bx, fy + 14, 15, 15);
    c.fillStyle = rgba('ink', 0.8 * al); c.fillText(s, bx + 24, fy + 27);
  }
  // statement field (the sung line sits on its rules)
  const S = STATEMENT;
  c.strokeStyle = rgba('ink', 0.6 * al); c.lineWidth = 0.9; c.strokeRect(S.x, S.y, S.w, S.h);
  caption(c, 'STATEMENT OF RISK', S.x + 14, S.y + 26, al);
  for (const ry of [ROW1.y - 130, ROW1.y, ROW2.y]) rule(c, S.x + 30, S.x + S.w - 30, ry + 8, 0.28 * al, 0.7);
  // containment box
  const B = CONTAIN;
  c.strokeStyle = rgba('ink', 0.6 * al); c.lineWidth = 0.9; c.strokeRect(B.x, B.y, B.w, B.h);
  caption(c, 'CONTAINMENT LEVEL', B.x + 14, B.y + 26, al);
  // signatures
  caption(c, 'REVIEWED BY', B.x, B.y + B.h + 60, al);
  rule(c, B.x, B.x + B.w, B.y + B.h + 100, 0.55 * al);
  caption(c, 'DATE', B.x, B.y + B.h + 150, al);
  rule(c, B.x, B.x + 200, B.y + B.h + 190, 0.55 * al);
  // footer
  caption(c, 'page 1 of 1', x + 50, y + h - 24, al, 11);
  c.textAlign = 'right';
  caption(c, 'C-1 / rev. 0', x + w - 50, y + h - 24, al, 11);
  c.textAlign = 'left';
  c.restore();
}

/** The form rendered once (at the output scale) and drawn as an image: identical at 1:1, far cheaper per frame. */
let formCv: HTMLCanvasElement | null = null;
const FPAD = 12;
export function drawFormCached(c: CanvasRenderingContext2D) {
  if (!formCv) {
    const k = SCALE * 1.05;
    formCv = document.createElement('canvas');
    formCv.width = Math.round((FORM.w + 2 * FPAD) * k); formCv.height = Math.round((FORM.h + 2 * FPAD) * k);
    const g = formCv.getContext('2d')!;
    g.scale(k, k); g.translate(FPAD - FORM.x, FPAD - FORM.y);
    drawForm(g, 1);
  }
  c.drawImage(formCv, FORM.x - FPAD, FORM.y - FPAD, FORM.w + 2 * FPAD, FORM.h + 2 * FPAD);
}

/** A few seeded paper specks for copies (photocopy toner dust), sheet px, inside the form. */
export function tonerDust(c: CanvasRenderingContext2D, seed: number, al: number) {
  c.fillStyle = rgba('ink', 0.35 * al);
  for (let i = 0; i < 40; i++) {
    const px = FORM.x + hash(seed, i, 1) * FORM.w, py = FORM.y + hash(seed, i, 2) * FORM.h;
    const r = 0.6 + 1.6 * hash(seed, i, 3);
    c.fillRect(px, py, r, r);
  }
}
