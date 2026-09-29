// The observer, for the DNA outro (dna-outro.ts): an engraved eye that is seen head-on in close-up
// (the pupil constricted to the orange point, as the `ilya` scene leaves it) and turns into a spare
// profile of a person at a microscope eyepiece as the camera pulls back.
//
// Units: the eyeball radius (r_e, ~12 mm). The pupil point is the origin. Head frame: +Y up,
// +Z forward, +X lateral. The head is pitched down by BETA so the gaze runs down the eyepiece.
// Projection is orthographic: screen = (cx, cy) + S * (P·R, -P·U), with the camera basis turning from
// "looking straight into the eye" (k = 0) to "side view, face to the right" (k = 1).
//
// `drawEye(c, cx, cy, S, 0)` is the outro's first frame at S = EYE_S0: other scenes can import it
// to match that frame exactly.
import * as THREE from 'three';
import { rgba } from '../engine/palette';
import { clamp, lerp, smoothstep, hash } from '../engine/util';
import { orangePoint } from './dna-open-plate';

export const BETA = (45 * Math.PI) / 180;
const cB = Math.cos(BETA), sB = Math.sin(BETA);
/** Gaze, lateral and "up" axes of the eye (head frame). */
const G = new THREE.Vector3(0, -sB, cB), XE = new THREE.Vector3(1, 0, 0), UE = new THREE.Vector3(0, cB, sB);
const OE = G.clone().multiplyScalar(-0.85); // eyeball centre
export const IRIS_R = 0.52;
/** First-frame scale: iris radius 300 px. */
export const EYE_S0 = 300 / IRIS_R;
/** Constricted pupil radius (r_e) — 12 px at EYE_S0 — and the orange point's radius on screen. */
export const PUPIL_R = 12 / EYE_S0;
export const pointR = (S: number) => clamp(S * 0.0096, 3, 5.5);

// camera bases
const qFront = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(XE, UE, G));
const qSide = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)));

export interface View { cx: number; cy: number; S: number; R: THREE.Vector3; U: THREE.Vector3; F: THREE.Vector3; k: number }
export function eyeView(cx: number, cy: number, S: number, k: number): View {
  const q = qFront.clone().slerp(qSide, clamp(k));
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const R = new THREE.Vector3(), U = new THREE.Vector3(), F = new THREE.Vector3();
  m.extractBasis(R, U, F);
  return { cx, cy, S, R, U, F, k };
}
const prj = (v: View, p: THREE.Vector3) => ({ x: v.cx + v.S * p.dot(v.R), y: v.cy - v.S * p.dot(v.U), d: p.dot(v.F) });

/** Point on a sphere (radius rho about the eyeball centre) at azimuth phi (toward +X) and elevation th. */
function onSphere(rho: number, phi: number, th: number, out = new THREE.Vector3()) {
  return out.copy(OE)
    .addScaledVector(G, rho * Math.cos(th) * Math.cos(phi))
    .addScaledVector(XE, rho * Math.cos(th) * Math.sin(phi))
    .addScaledVector(UE, rho * Math.sin(th));
}
const PHI0 = 1.25;
const upperLid = (phi: number) => 0.42 * Math.pow(Math.max(0, 1 - (phi / PHI0) ** 2), 0.7) + 0.04 * (phi / PHI0);
const lowerLid = (phi: number) => -0.5 * Math.pow(Math.max(0, 1 - (phi / PHI0) ** 2), 0.85) - 0.03 * (phi / PHI0);

function strokePts(c: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  c.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]!.x, pts[i]!.y);
}

/**
 * The eye: lids, lashes, sclera, iris (engraved fibres), pupil and the orange point at the pupil.
 * `a` fades the whole drawing. `pupil` is the pupil radius in r_e (the outro starts constricted,
 * PUPIL_R; a scene leading into it can animate it down to that), `point` the orange point's opacity.
 * The outro's first frame is drawEye(c, 960, 540, EYE_S0, 0) on bone paper.
 */
export function drawEye(c: CanvasRenderingContext2D, cx: number, cy: number, S: number, k: number, a = 1, pupil = PUPIL_R, point = 1) {
  const v = eyeView(cx, cy, S, k);
  const ir = IRIS_R * S; // iris radius on screen (px) when seen head-on
  const detail = smoothstep(25, 90, ir) * (1 - smoothstep(0.35, 0.7, k));
  const lw = (w: number) => Math.max(0.8, Math.min(w, w * S / 60));
  const P = new THREE.Vector3();
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  // ---- lid margins (the fissure), the eye's silhouette
  const N = 72;
  const up: { x: number; y: number; d: number }[] = [], lo: { x: number; y: number; d: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const phi = lerp(-PHI0, PHI0, i / N);
    up.push(prj(v, onSphere(1.04, phi, upperLid(phi), P)));
    lo.push(prj(v, onSphere(1.04, phi, lowerLid(phi), P)));
  }
  // the fissure (sclera + iris live inside it)
  const fissure = new Path2D();
  fissure.moveTo(up[0]!.x, up[0]!.y);
  for (const q of up) fissure.lineTo(q.x, q.y);
  for (let i = lo.length - 1; i >= 0; i--) fissure.lineTo(lo[i]!.x, lo[i]!.y);
  fissure.closePath();
  c.save();
  c.clip(fissure);
  // sclera shading: short strokes following the eyeball's curve, only toward the corners
  if (detail > 0.01) {
    c.lineWidth = lw(1.0);
    for (let j = 0; j < 30; j++) {
      const side = j < 15 ? -1 : 1, jj = j % 15;
      const f = jj / 14, phi = side * lerp(0.72, 1.24, f);
      const th0 = lerp(-0.12, -0.42, hash(j, 2)) * (1 - 0.4 * f), th1 = lerp(0.12, 0.34, hash(j, 3)) * (1 - 0.3 * f);
      c.strokeStyle = rgba('ink', (0.12 + 0.4 * f) * a * detail);
      const pts: { x: number; y: number }[] = [];
      for (let q = 0; q <= 10; q++) pts.push(prj(v, onSphere(1.0, phi, lerp(th0, th1, q / 10), P)));
      c.beginPath(); strokePts(c, pts); c.stroke();
    }
    // the upper lid's shadow on the sclera and iris: a band of fine lines just under the margin
    c.lineWidth = lw(0.9);
    for (let j = 0; j < 7; j++) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 48; i++) {
        const phi = lerp(-PHI0 * 0.92, PHI0 * 0.92, i / 48);
        pts.push(prj(v, onSphere(1.0, phi, upperLid(phi) - 0.018 - j * 0.017, P)));
      }
      c.strokeStyle = rgba('ink', 0.5 * (1 - j / 7) * a * detail);
      c.beginPath(); strokePts(c, pts); c.stroke();
    }
  }
  // ---- iris
  const ip = (r: number, ang: number) => prj(v, P.copy(XE).multiplyScalar(r * Math.cos(ang)).addScaledVector(UE, r * Math.sin(ang)).addScaledVector(G, 0.01));
  const ring = (r: number) => { const pts = []; for (let i = 0; i <= 96; i++) pts.push(ip(r, (i / 96) * Math.PI * 2)); return pts; };
  const irisEdge = ring(IRIS_R);
  const irisPath = new Path2D();
  irisPath.moveTo(irisEdge[0]!.x, irisEdge[0]!.y);
  for (const q of irisEdge) irisPath.lineTo(q.x, q.y);
  irisPath.closePath();
  if (detail > 0.01) {
    // radial fibres: long ones from the pupil ruff to the limbus, short ones in the outer zone
    c.strokeStyle = rgba('ink', 0.75 * a * detail);
    for (let i = 0; i < 220; i++) {
      const ang = (i / 220) * Math.PI * 2 + 0.01 * Math.sin(i * 1.7);
      const long = i % 2 === 0;
      const r0 = long ? (i % 4 === 0 ? PUPIL_R * 1.25 : 0.075) : lerp(0.2, 0.3, hash(i, 3)), r1 = IRIS_R * lerp(0.9, 0.99, hash(i, 5));
      c.lineWidth = lw(long ? 1.15 : 0.9);
      c.beginPath();
      for (let q = 0; q <= 10; q++) {
        const r = lerp(r0, r1, q / 10);
        const wob = 0.035 * Math.sin(q * 1.3 + i * 0.7) * (r / IRIS_R);
        const p2 = ip(r, ang + wob);
        if (q === 0) c.moveTo(p2.x, p2.y); else c.lineTo(p2.x, p2.y);
      }
      c.stroke();
    }
    // collarette: a wavy ring about a third of the way out
    c.strokeStyle = rgba('ink', 0.7 * a * detail); c.lineWidth = lw(1.3);
    c.beginPath();
    for (let i = 0; i <= 160; i++) {
      const ang = (i / 160) * Math.PI * 2, r = 0.2 + 0.012 * Math.sin(ang * 7 + 1.3) + 0.009 * Math.sin(ang * 13 + 0.4) + 0.006 * Math.sin(ang * 29 + 2.1);
      const p2 = ip(r, ang);
      if (i === 0) c.moveTo(p2.x, p2.y); else c.lineTo(p2.x, p2.y);
    }
    c.stroke();
    // limbal ring: dense ink band at the iris edge
    c.save(); c.clip(irisPath);
    // limbal ring: a few fine concentric lines at the iris edge
    c.lineWidth = lw(1.1);
    for (let j = 0; j < 4; j++) {
      c.strokeStyle = rgba('ink', (0.75 - j * 0.15) * a * detail);
      c.beginPath(); strokePts(c, ring(IRIS_R - 0.006 - j * 0.009)); c.stroke();
    }
    // shadow of the upper lid across the top of the iris: horizontal engraving
    c.strokeStyle = rgba('ink', 0.55 * a * detail); c.lineWidth = lw(1);
    const top = ip(IRIS_R, Math.PI / 2), bot = ip(IRIS_R, -Math.PI / 2);
    const hgt = Math.abs(bot.y - top.y) || 1;
    c.beginPath();
    for (let y = top.y; y < top.y + hgt * 0.32; y += Math.max(2.2, hgt / 110)) {
      const f = (y - top.y) / (hgt * 0.32);
      if (hash(Math.round(y), 1) > 1 - f * 0.6) continue;
      c.moveTo(cx - ir * 1.1, y); c.lineTo(cx + ir * 1.1, y);
    }
    c.stroke();
    c.restore();
  }
  // iris outline
  c.strokeStyle = rgba('ink', 0.9 * a); c.lineWidth = lw(1.5);
  c.stroke(irisPath);
  // pupil (constricted) with the orange point
  const pr = ring(pupil);
  c.fillStyle = rgba('ink', a);
  c.beginPath(); strokePts(c, pr); c.closePath(); c.fill();
  c.restore(); // fissure clip
  // ---- lid margins with thickness, lashes, creases
  c.strokeStyle = rgba('ink', 0.92 * a); c.lineWidth = lw(2.2);
  c.beginPath(); strokePts(c, up); c.stroke();
  c.lineWidth = lw(1.6);
  c.beginPath(); strokePts(c, lo); c.stroke();
  if (detail > 0.01) {
    // lid thickness line
    c.strokeStyle = rgba('ink', 0.5 * a * detail); c.lineWidth = lw(1.1);
    c.beginPath();
    const pts: { x: number; y: number }[] = [];
    for (let i = 4; i <= N - 4; i++) { const phi = lerp(-PHI0, PHI0, i / N); pts.push(prj(v, onSphere(1.07, phi, upperLid(phi) + 0.045, P))); }
    strokePts(c, pts); c.stroke();
    const pl: { x: number; y: number }[] = [];
    for (let i = 6; i <= N - 6; i++) { const phi = lerp(-PHI0, PHI0, i / N); pl.push(prj(v, onSphere(1.06, phi, lowerLid(phi) - 0.04, P))); }
    c.beginPath(); strokePts(c, pl); c.stroke();
    // crease above the lid, and two soft lines under the lower lid
    for (const [rho, th0, sc, al] of [[1.16, 0.78, 0.8, 0.55], [1.2, 0.98, 0.62, 0.3], [1.12, -0.74, 0.7, 0.35], [1.16, -0.92, 0.5, 0.2]] as const) {
      const pc: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) {
        const phi = lerp(-PHI0 * sc, PHI0 * sc, i / 40);
        const f = 1 - (phi / (PHI0 * sc)) ** 2;
        pc.push(prj(v, onSphere(rho, phi, th0 * (0.75 + 0.25 * f), P)));
      }
      c.strokeStyle = rgba('ink', al * a * detail); c.lineWidth = lw(1.2);
      c.beginPath(); strokePts(c, pc); c.stroke();
    }
    // lashes: curved, tapered strokes off the upper lid margin, sweeping outward toward the corners
    for (let i = 0; i < 90; i++) {
      const u = clamp((i + 0.5 + 0.6 * (hash(i, 9) - 0.5)) / 90), phi = lerp(-PHI0 * 0.88, PHI0 * 0.9, u);
      const mid = Math.sin(Math.PI * u);
      const len = (0.1 + 0.16 * mid) * lerp(0.75, 1.1, hash(i, 7));
      const th = upperLid(phi) + 0.015;
      const sweep = (u - 0.5) * 0.55 + 0.08 * (hash(i, 8) - 0.5);
      const p0 = prj(v, onSphere(1.06, phi, th, P));
      const p1 = prj(v, onSphere(1.06 + len * 0.75, phi + sweep * 0.5, th + len * 0.25, P));
      const p2 = prj(v, onSphere(1.06 + len * 0.95, phi + sweep, th + len * 0.85, P));
      c.strokeStyle = rgba('ink', (0.55 + 0.35 * hash(i, 6)) * a * detail);
      c.lineWidth = lw(1.6);
      const m = { x: (p0.x + 2 * p1.x + p2.x) / 4, y: (p0.y + 2 * p1.y + p2.y) / 4 };
      c.beginPath(); c.moveTo(p0.x, p0.y); c.quadraticCurveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, m.x, m.y); c.stroke();
      c.lineWidth = lw(0.9);
      c.beginPath(); c.moveTo(m.x, m.y); c.quadraticCurveTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, p2.x, p2.y); c.stroke();
    }
    // a few short lower lashes
    for (let i = 0; i < 30; i++) {
      const u = (i + 0.5 + 0.7 * (hash(i, 19) - 0.5)) / 30, phi = lerp(-PHI0 * 0.7, PHI0 * 0.78, clamp(u));
      if (hash(i, 18) < 0.3) continue;
      const th = lowerLid(phi) - 0.015, len = (0.035 + 0.05 * Math.sin(Math.PI * u)) * lerp(0.7, 1.2, hash(i, 17));
      const sweep = (u - 0.5) * 0.3;
      const p0 = prj(v, onSphere(1.06, phi, th, P)), p2 = prj(v, onSphere(1.06 + len, phi + sweep, th - len * 0.8, P));
      c.strokeStyle = rgba('ink', 0.55 * a * detail); c.lineWidth = lw(0.9);
      c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p2.x, p2.y); c.stroke();
    }
  }
  // cornea bulge, visible as the eye turns to profile
  const side = smoothstep(0.3, 0.9, k);
  if (side > 0.01) {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 24; i++) {
      const ang = lerp(-1.2, 1.2, i / 24);
      const p3 = P.copy(G).multiplyScalar(0.02 + 0.26 * Math.cos(ang) ** 1.6).addScaledVector(UE, IRIS_R * Math.sin(ang));
      pts.push(prj(v, p3));
    }
    c.strokeStyle = rgba('ink', 0.8 * a * side); c.lineWidth = lw(1.3);
    c.beginPath(); strokePts(c, pts); c.stroke();
  }
  c.restore();
  const o = prj(v, P.set(0, 0, 0));
  orangePoint(c, o.x, o.y, pointR(S), a * point);
}

// ------------------------------------------------------------------ profile and microscope (side view)
type Seg = [number, number][]; // bezier chain: M then C triples, (u, v) = (forward, up) in r_e
/** Head profile: throat, chin, lips, nose, brow, forehead, crown, occiput, nape (forward, up). */
const PROFILE: Seg = [
  [-3.2, -20], [-2.4, -16], [-1.8, -13.5], [-0.6, -12.3], [0.6, -11.6], [2.2, -11.4], [2.7, -10.4],
  [3.1, -9.6], [2.9, -8.8], [2.2, -8.5], [2.6, -8.1], [3.0, -7.7], [2.9, -7.3], [2.7, -7.15], [2.55, -7.05], [2.5, -7.0],
  [3.0, -6.8], [3.2, -6.3], [3.0, -5.9], [2.8, -5.5], [2.6, -5.2], [2.7, -5.0], [3.4, -4.9], [4.5, -4.6], [4.6, -3.9],
  [4.6, -3.2], [3.6, -1.6], [2.6, 0.2], [2.2, 0.8], [1.8, 1.0], [1.9, 1.4], [2.3, 2.3], [2.3, 3.0], [2.2, 3.6],
  [2.0, 5.6], [1.0, 7.6], [-1.5, 8.7], [-4.6, 10.0], [-9.4, 9.8], [-12.0, 7.4], [-14.2, 5.4], [-14.6, 1.6], [-13.6, -1.8],
  [-12.8, -4.6], [-11.6, -6.4], [-10.8, -8.4], [-10.2, -10.5], [-10.4, -14], [-11.4, -20],
];
const EAR_OUT: Seg = [[-7.0, 1.6], [-5.9, 1.9], [-5.6, -0.6], [-6.2, -2.4], [-6.6, -3.6], [-7.4, -4.4], [-8.2, -4.0], [-9.0, -3.6], [-9.4, -2.0], [-9.3, -0.4], [-9.2, 1.0], [-8.3, 1.8], [-7.0, 1.6]];
const EAR_IN: Seg = [[-7.2, 0.7], [-6.6, 0.8], [-6.5, -0.8], [-6.9, -2.0], [-7.2, -2.8], [-7.9, -3.0], [-8.3, -2.4]];
const JAW: Seg = [[-7.3, -4.9], [-6.8, -7.6], [-4.6, -10.3], [-1.6, -11.5]];
const NOSTRIL: Seg = [[3.3, -4.55], [3.7, -4.2], [4.1, -4.3], [4.0, -4.7]];
const BROW: Seg = [[-0.8, 1.5], [0.2, 2.1], [1.2, 2.2], [2.0, 2.0]];

/** Map head-frame (forward, up) to screen offsets (r_e, y down) with the head pitched by BETA. */
const headXY = (u: number, w: number): [number, number] => {
  // the head pitches by BETA; the neck bends less, so the throat and nape drop toward the shoulders
  const b = BETA * lerp(1, 0.3, smoothstep(-7, -20, w));
  const x = u, y = -w, cb = Math.cos(b), sb = Math.sin(b);
  // keep the neck attached: rotate about the jaw's pivot for the lower part
  const px = -5, py = 8, cp = Math.cos(BETA), sp = Math.sin(BETA);
  const jx = px * cp - py * sp, jy = px * sp + py * cp; // the pivot under full head pitch
  if (b === BETA) return [x * cB - y * sB, x * sB + y * cB];
  const dx = x - px, dy = y - py;
  return [jx + dx * cb - dy * sb, jy + dx * sb + dy * cb];
};

function bez(c: CanvasRenderingContext2D, seg: Seg, map: (p: [number, number]) => [number, number]) {
  const p0 = map(seg[0]!);
  c.moveTo(p0[0], p0[1]);
  for (let i = 1; i + 2 < seg.length + 0; i += 3) {
    const a = map(seg[i]!), b = map(seg[i + 1]!), d = map(seg[i + 2]!);
    c.bezierCurveTo(a[0], a[1], b[0], b[1], d[0], d[1]);
  }
}

/** Spare engraved profile of the observer (head and neck), pitched toward the eyepiece. */
export function drawProfile(c: CanvasRenderingContext2D, cx: number, cy: number, S: number, a: number) {
  if (a <= 0.001) return;
  const map = (p: [number, number]): [number, number] => { const [x, y] = headXY(p[0], p[1]); return [cx + x * S, cy + y * S]; };
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  const head = new Path2D();
  {
    const p0 = map(PROFILE[0]!); head.moveTo(p0[0], p0[1]);
    for (let i = 1; i + 2 < PROFILE.length; i += 3) {
      const A = map(PROFILE[i]!), B = map(PROFILE[i + 1]!), D = map(PROFILE[i + 2]!);
      head.bezierCurveTo(A[0], A[1], B[0], B[1], D[0], D[1]);
    }
    head.closePath();
  }
  // shading: engraved lines in the shadow under the jaw and down the throat (light from the upper right)
  const shade = new Path2D();
  {
    const q = [[-7.3, -4.9], [-4.0, -10.6], [-0.6, -12.3], [-2.4, -16], [-3.0, -19.5], [-10.4, -19.5], [-10.4, -12], [-9.6, -7]].map((p) => map(p as [number, number]));
    shade.moveTo(q[0]![0], q[0]![1]); for (const z of q) shade.lineTo(z[0], z[1]); shade.closePath();
  }
  c.save(); c.clip(head); c.clip(shade);
  const [gx0, gy0] = map([-6, -8]), [gx1, gy1] = map([-3, -16]);
  const gr = c.createLinearGradient(gx0, gy0, gx1, gy1);
  gr.addColorStop(0, rgba('ink', 0.05 * a)); gr.addColorStop(1, rgba('ink', 0.5 * a));
  c.strokeStyle = gr; c.lineWidth = 0.9;
  c.beginPath();
  const [dx, dy] = headXY(0.25, -1), dl = Math.hypot(dx, dy);
  const nx = -dy / dl, ny = dx / dl;
  const [ox, oy] = map([-5, -13]);
  for (let i = -30; i <= 30; i++) {
    const px = ox + nx * i * 3.4, py = oy + ny * i * 3.4;
    c.moveTo(px - dx / dl * 300, py - dy / dl * 300); c.lineTo(px + dx / dl * 300, py + dy / dl * 300);
  }
  c.stroke();
  c.restore();
  // the neck lines fade out toward the shoulders (an engraving's vignette)
  const [fx0, fy0] = map([-6, -14]), [fx1, fy1] = map([-6, -20]);
  const fade = c.createLinearGradient(fx0, fy0, fx1, fy1);
  fade.addColorStop(0, rgba('ink', 0.9 * a)); fade.addColorStop(1, rgba('ink', 0));
  // outline
  c.strokeStyle = fade; c.lineWidth = 1.7;
  c.beginPath(); bez(c, PROFILE, map); c.stroke();
  c.lineWidth = 1.2;
  c.beginPath(); bez(c, EAR_OUT, map); c.stroke();
  c.strokeStyle = rgba('ink', 0.6 * a); c.lineWidth = 1.0;
  c.beginPath(); bez(c, EAR_IN, map); c.stroke();
  c.beginPath(); bez(c, NOSTRIL, map); c.stroke();
  c.strokeStyle = rgba('ink', 0.35 * a);
  c.beginPath(); bez(c, JAW, map); c.stroke();
  c.strokeStyle = rgba('ink', 0.55 * a); c.lineWidth = 1.4;
  c.beginPath(); bez(c, BROW, map); c.stroke();
  // hair: a few long engraved strands over the crown
  c.strokeStyle = rgba('ink', 0.35 * a); c.lineWidth = 0.9;
  for (let i = 0; i < 9; i++) {
    const f = i / 8;
    const s0: [number, number] = [lerp(-0.9, -11.4, f), lerp(8.2, 6.4, f) - 1.1 * Math.sin(Math.PI * f)];
    const s1: [number, number] = [lerp(-3.8, -12.9, f), lerp(9.2, 3.0, f) - 0.6];
    const s2: [number, number] = [lerp(-7.2, -13.3, f), lerp(8.8, -0.8, f) - 0.7];
    const A = map(s0), B = map(s1), D = map(s2);
    c.beginPath(); c.moveTo(A[0], A[1]); c.quadraticCurveTo(B[0], B[1], D[0], D[1]); c.stroke();
  }
  c.restore();
}

/** Microscope parts in screen-aligned r_e units relative to the pupil (y down); eyepiece axis along (cos β, sin β). */
export const MS = 1.25;
export const TABLE_Y = 20.8 * MS;
export function drawMicroscope(c: CanvasRenderingContext2D, cx: number, cy: number, S0: number, a: number) {
  if (a <= 0.001) return;
  const S = S0 * MS;
  const X = (x: number) => cx + x * S, Y = (y: number) => cy + y * S;
  const d = { x: cB, y: sB }, n = { x: -sB, y: cB }; // along the eyepiece, and across it (down-left side = +n)
  const ax = (s: number, w: number) => ({ x: X(d.x * s + n.x * w), y: Y(d.y * s + n.y * w) });
  const quad = (p: { x: number; y: number }[]) => { const path = new Path2D(); path.moveTo(p[0]!.x, p[0]!.y); for (const q of p) path.lineTo(q.x, q.y); path.closePath(); return path; };
  const tube = (s0: number, s1: number, r0: number, r1: number) => quad([ax(s0, -r0), ax(s1, -r1), ax(s1, r1), ax(s0, r0)]);
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  const fill = (p: Path2D) => { c.fillStyle = rgba('#E6E0D4', a); c.fill(p); };
  const edge = (p: Path2D, w = 1.4, al = 0.9) => { c.strokeStyle = rgba('ink', al * a); c.lineWidth = w; c.stroke(p); };
  // engraved shading: lines across a part on its lower-left (+n) side
  const shadeTube = (s0: number, s1: number, r: number, frac = 0.55, gap = 3.2) => {
    c.strokeStyle = rgba('ink', 0.6 * a); c.lineWidth = 0.9;
    c.beginPath();
    const L = (s1 - s0) * S;
    for (let q = gap / 2; q < L; q += gap) {
      const s = s0 + q / S;
      const p = ax(s, r * 0.98), p2 = ax(s, r * (1 - 2 * frac));
      c.moveTo(p.x, p.y); c.lineTo(p2.x, p2.y);
    }
    c.stroke();
  };
  const hatchRect = (path: Path2D, ang: number, gap: number, al: number, bx: number, by: number, r: number) => {
    c.save(); c.clip(path);
    c.strokeStyle = rgba('ink', al * a); c.lineWidth = 0.9;
    const dx = Math.cos(ang), dy = Math.sin(ang), nx2 = -dy, ny2 = dx;
    c.beginPath();
    for (let i = -Math.ceil(r / gap); i <= Math.ceil(r / gap); i++) {
      const px = bx + nx2 * i * gap, py = by + ny2 * i * gap;
      c.moveTo(px - dx * r, py - dy * r); c.lineTo(px + dx * r, py + dy * r);
    }
    c.stroke(); c.restore();
  };
  // ---- base and table
  const base = new Path2D();
  base.moveTo(X(3.4), Y(20.8)); base.lineTo(X(2.9), Y(19.9)); base.quadraticCurveTo(X(3.0), Y(19.2), X(4.0), Y(19.1));
  base.lineTo(X(13.2), Y(19.1)); base.quadraticCurveTo(X(13.9), Y(19.2), X(13.9), Y(19.9)); base.lineTo(X(13.9), Y(20.8)); base.closePath();
  fill(base); hatchRect(base, 0, 3, 0.5, X(8), Y(20.3), 200); edge(base);
  // illuminator port
  c.strokeStyle = rgba('ink', 0.8 * a); c.lineWidth = 1.2;
  c.beginPath(); c.ellipse(X(7.4), Y(19.1), 0.9 * S, 0.22 * S, 0, 0, Math.PI * 2); c.stroke();
  // ---- arm (C-shaped limb) behind the optics
  const arm = new Path2D();
  arm.moveTo(X(9.2), Y(5.2));
  arm.bezierCurveTo(X(11.9), Y(5.0), X(13.2), Y(7.6), X(13.0), Y(10.6));
  arm.lineTo(X(12.8), Y(19.1)); arm.lineTo(X(10.6), Y(19.1)); arm.lineTo(X(10.8), Y(11.4));
  arm.bezierCurveTo(X(10.9), Y(9.2), X(10.4), Y(8.3), X(9.2), Y(8.2));
  arm.closePath();
  fill(arm); hatchRect(arm, Math.PI / 2, 3.1, 0.55, X(12.4), Y(12), 300);
  // lit edge of the arm stays clean: re-fill a sliver on the left
  edge(arm, 1.5);
  // focus knob
  c.fillStyle = rgba('#E6E0D4', a);
  c.beginPath(); c.arc(X(11.8), Y(15.6), 1.45 * S, 0, Math.PI * 2); c.fill();
  { const kp = new Path2D(); kp.arc(X(11.8), Y(15.6), 1.45 * S, 0, Math.PI * 2); edge(kp, 1.3); }
  c.strokeStyle = rgba('ink', 0.7 * a); c.lineWidth = 1;
  c.beginPath(); c.arc(X(11.8), Y(15.6), 0.8 * S, 0, Math.PI * 2); c.stroke();
  c.beginPath();
  for (let i = 0; i < 28; i++) {
    const t0 = (i / 28) * Math.PI * 2;
    c.moveTo(X(11.8) + Math.cos(t0) * 1.45 * S, Y(15.6) + Math.sin(t0) * 1.45 * S);
    c.lineTo(X(11.8) + Math.cos(t0) * 1.25 * S, Y(15.6) + Math.sin(t0) * 1.25 * S);
  }
  c.stroke();
  // ---- stage, slide, condenser
  const cond = new Path2D(); cond.rect(X(6.5), Y(13.7), 1.8 * S, 1.2 * S);
  fill(cond); hatchRect(cond, Math.PI / 2, 2.8, 0.5, X(7.4), Y(14.3), 60); edge(cond, 1.2);
  const stage = new Path2D(); stage.rect(X(3.6), Y(13.0), 8.4 * S, 0.7 * S);
  fill(stage); hatchRect(stage, 0, 2.6, 0.6, X(7.8), Y(13.35), 200); edge(stage, 1.4);
  c.strokeStyle = rgba('ink', 0.85 * a); c.lineWidth = 1.1;
  c.beginPath(); c.moveTo(X(5.0), Y(12.9)); c.lineTo(X(9.8), Y(12.9)); c.stroke(); // slide
  c.beginPath(); c.moveTo(X(4.6), Y(12.6)); c.lineTo(X(6.0), Y(12.75)); c.stroke(); // clip
  // ---- nosepiece and objectives
  const nose = quad([{ x: X(5.6), y: Y(8.4) }, { x: X(9.5), y: Y(8.4) }, { x: X(9.0), y: Y(9.6) }, { x: X(6.0), y: Y(9.6) }]);
  fill(nose); hatchRect(nose, Math.PI / 2, 2.8, 0.45, X(8.6), Y(9), 60); edge(nose, 1.3);
  const obj2 = new Path2D();
  obj2.moveTo(X(8.4), Y(9.5)); obj2.lineTo(X(9.6), Y(9.3)); obj2.lineTo(X(10.4), Y(11.0)); obj2.lineTo(X(9.6), Y(11.3)); obj2.closePath();
  fill(obj2); edge(obj2, 1.1, 0.7);
  const obj = quad([{ x: X(6.6), y: Y(9.6) }, { x: X(8.2), y: Y(9.6) }, { x: X(7.9), y: Y(12.1) }, { x: X(6.9), y: Y(12.1) }]);
  fill(obj); hatchRect(obj, Math.PI / 2, 2.6, 0.55, X(7.9), Y(10.8), 60); edge(obj, 1.3);
  c.strokeStyle = rgba('ink', 0.7 * a); c.lineWidth = 1;
  c.beginPath(); c.moveTo(X(6.7), Y(10.5)); c.lineTo(X(8.1), Y(10.5)); c.stroke();
  // ---- head housing (prism)
  const hous = new Path2D();
  hous.moveTo(X(4.9), Y(4.9)); hous.lineTo(X(9.6), Y(4.7)); hous.lineTo(X(9.8), Y(8.4)); hous.lineTo(X(5.4), Y(8.4));
  hous.quadraticCurveTo(X(4.6), Y(7.2), X(4.9), Y(4.9)); hous.closePath();
  fill(hous); hatchRect(hous, Math.PI / 2, 3, 0.5, X(9.0), Y(6.6), 80); edge(hous, 1.5);
  // ---- eyepiece tube, eyepiece, eyecup (along the gaze)
  const et = tube(4.2, 8.0, 1.2, 1.25); fill(et); shadeTube(4.2, 8.0, 1.2); edge(et, 1.5);
  const collar = tube(3.9, 4.35, 1.35, 1.35); fill(collar); edge(collar, 1.2);
  const ep = tube(1.9, 3.95, 0.92, 0.95); fill(ep); shadeTube(1.9, 3.95, 0.92, 0.5, 2.8); edge(ep, 1.4);
  const cup = tube(1.35, 1.9, 1.1, 1.0); fill(cup); edge(cup, 1.3);
  // the table: a long rule
  c.strokeStyle = rgba('ink', 0.75 * a); c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(X(-30), Y(20.8)); c.lineTo(X(30), Y(20.8)); c.stroke();
  c.restore();
}
