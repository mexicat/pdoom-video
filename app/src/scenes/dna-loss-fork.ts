// Replication-fork geometry and drawing for the DNA edition's `loss` slot (scenes/dna-loss.ts).
// The parental duplex is dna-kit's right-handed B-DNA (helix() with sep for the unzipping); behind the
// junction the two separated strands are blended from their helical positions onto two "arm" curves in
// the z = 0 plane: the upper arm is the error plot's curve, the lower arm its baseline. Drawn with the
// same engraved style as drawHelix (bone tubes, ink rails, painter's order), plus: unpaired base stubs on
// the separated strands, shadow-side hatching on the tubes, and a hexameric helicase ring at the fork.
import * as THREE from 'three';
import { LineBatch } from '../engine/lines';
import { clamp, lerp, smoothstep, hash } from '../engine/util';
import { Cam, LIN, helix, straightAxis, HBONDS, BDNA, type Base, type Proj, type RGB } from './dna-kit';

export const RISE = BDNA.rise;
const BASES: Base[] = ['A', 'T', 'G', 'C'];
/** The parental sequence, indexed by global base-pair number g (x = g·rise). */
export const baseAt = (g: number): Base => BASES[Math.floor(hash(11, g) * 4)]!;

export interface ForkShape {
  /** Junction x (nm): paired for x > xJ, separated behind it. */
  xJ: number;
  /** Target heights (world y, nm) of the separated strands at x, in the z = 0 plane. */
  upper: (x: number) => number;
  lower: (x: number) => number;
  /** Distance behind the junction over which the strands leave the helix for the arms. */
  blend: number;
}

export interface ForkBP { a: THREE.Vector3; b: THREE.Vector3; x: number; base: Base; paired: number; g: number }

/** Base pairs g0..g1 of the fork (helix() positions, then the separated part blended onto the arms). */
export function forkBPs(g0: number, g1: number, sh: ForkShape): ForkBP[] {
  const n = g1 - g0 + 1;
  if (n < 2) return [];
  const seq = Array.from({ length: n }, (_, i) => baseAt(g0 + i));
  const sepOf = (x: number) => smoothstep(0, 1.1, sh.xJ - x);
  const bps = helix(n, straightAxis({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), {
    s0: g0, phase: g0 * BDNA.twist, seq, e1: { x: 0, y: 1, z: 0 }, open: 0.9,
    sep: (i) => sepOf((g0 + i) * RISE),
  });
  return bps.map((q, i) => {
    const x = (g0 + i) * RISE, u = sh.xJ - x;
    const w = smoothstep(0.15, sh.blend, u);
    if (w > 0) {
      q.a.lerp(new THREE.Vector3(x, sh.upper(x), 0), w);
      q.b.lerp(new THREE.Vector3(x, sh.lower(x), 0), w);
    }
    return { a: q.a, b: q.b, x, base: q.base, paired: 1 - sepOf(x), g: g0 + i };
  });
}

export interface ForkStyle {
  alpha: number;
  /** View depth of the focus (fog reference) and the span over which far things dim. */
  fogRef: number; fogSpan?: number;
  light?: THREE.Vector3;
  tube?: number;
  /** Helicase ring: centre, axis (unit), ring radius and lobe radius (nm); omitted = none. */
  ring?: { c: THREE.Vector3; axis: THREE.Vector3; R: number; r: number; spin: number };
}

type Item = { d: number; f: () => void };
const cr = (p0: number, p1: number, p2: number, p3: number, u: number) => {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
};

/** Draw the fork into a screen2D 'normal' LineBatch, far things first (painter's order). */
export function drawFork(L: LineBatch, cam: Cam, bps: ForkBP[], st: ForkStyle) {
  const al = st.alpha;
  if (al <= 0.002 || bps.length < 2) return;
  const col = LIN.bone, ink = LIN.ink;
  const tube = st.tube ?? 0.24;
  const light = st.light ?? new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
  const fogSpan = st.fogSpan ?? 6;
  const fog = (w: number) => lerp(1, 0.32, smoothstep(-0.5, fogSpan, w - st.fogRef));
  const items: Item[] = [];
  const shadeT = (dx: number, dy: number, dz: number) => {
    const l = Math.hypot(dx, dy, dz) || 1;
    const c = (dx * light.x + dy * light.y + dz * light.z) / l;
    return 0.28 + 0.72 * Math.sqrt(Math.max(0, 1 - c * c));
  };
  const onScreen = (p: Proj, q: Proj, m: number) =>
    !(Math.max(p.x, q.x) < -m || Math.min(p.x, q.x) > 1920 + m || Math.max(p.y, q.y) < -m || Math.min(p.y, q.y) > 1080 + m);

  // ---- backbones: Catmull-Rom through the backbone points, 4 sub-segments per base pair.
  // Each sub-segment is a core item plus a decoration item (shadow band, hatch ticks, rails) sorted as
  // the nearest of its neighbours, so the next core's round cap never paints over it.
  const SUB = 4;
  for (const strand of [0, 1]) {
    const P = bps.map((q) => (strand === 0 ? q.a : q.b));
    const n = P.length;
    const pts: Proj[] = [], wld: THREE.Vector3[] = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = P[Math.max(0, i - 1)]!, p1 = P[i]!, p2 = P[i + 1]!, p3 = P[Math.min(n - 1, i + 2)]!;
      for (let k = i > 0 ? 1 : 0; k <= SUB; k++) {
        const u = k / SUB;
        const X = new THREE.Vector3(cr(p0.x, p1.x, p2.x, p3.x, u), cr(p0.y, p1.y, p2.y, p3.y, u), cr(p0.z, p1.z, p2.z, p3.z, u));
        wld.push(X); pts.push(cam.proj(X.x, X.y, X.z));
      }
    }
    tubeItems(items, L, pts, wld, tube, 1, shadeT, fog, al, onScreen);
  }

  // ---- rungs: paired = two half-rungs with 2 (A·T) or 3 (G·C) H-bond ticks; separated = unpaired stubs
  for (const q of bps) {
    const pa = cam.proj(q.a.x, q.a.y, q.a.z), pb = cam.proj(q.b.x, q.b.y, q.b.z);
    const d = (pa.w + pb.w) / 2, sh = 0.8 * fog(d);
    const wpx = Math.max(1.3, 0.15 * (pa.s + pb.s) / 2);
    if (!onScreen(pa, pb, 20)) continue;
    const c1: RGB = [col[0] * sh, col[1] * sh, col[2] * sh];
    if (q.paired > 0.02) {
      const gap = lerp(0.5, 0.08, q.paired);
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      const ha = { x: lerp(pa.x, mx, 1 - gap), y: lerp(pa.y, my, 1 - gap) }, hb = { x: lerp(pb.x, mx, 1 - gap), y: lerp(pb.y, my, 1 - gap) };
      const nH = HBONDS[q.base];
      items.push({
        d: d + 0.05, f: () => {
          engravedBar(L, pa.x, pa.y, ha.x, ha.y, wpx, sh, al, 'bar', 0);
          engravedBar(L, pb.x, pb.y, hb.x, hb.y, wpx, sh * 0.86, al, 'bar', 0);
          const k = clamp((q.paired - 0.5) * 2);
          if (k > 0) {
            const rx = hb.x - ha.x, ry = hb.y - ha.y, rl = Math.hypot(rx, ry) || 1, nx = -ry / rl, ny = rx / rl, tl = wpx * 0.9;
            for (let j = 0; j < nH; j++) {
              const u = (j + 1) / (nH + 1), cx = lerp(ha.x, hb.x, u), cy = lerp(ha.y, hb.y, u);
              L.seg2(cx - nx * tl, cy - ny * tl, cx + nx * tl, cy + ny * tl, 1.1, c1, 0.9 * k * al);
            }
          }
        },
      });
    }
    if (q.paired < 0.98) {
      // unpaired bases: a stub of fixed length (0.75 nm) from each backbone toward the other strand
      const dir = new THREE.Vector3().subVectors(q.b, q.a);
      const len = dir.length() || 1;
      dir.multiplyScalar(1 / len);
      const Ls = Math.min(0.75, len * 0.42);
      const ea = q.a.clone().addScaledVector(dir, Ls), eb = q.b.clone().addScaledVector(dir, -Ls);
      const qa = cam.proj(ea.x, ea.y, ea.z), qb = cam.proj(eb.x, eb.y, eb.z);
      const k = 1 - q.paired;
      items.push({ d: (pa.w + qa.w) / 2 + 0.04, f: () => engravedBar(L, pa.x, pa.y, qa.x, qa.y, wpx, sh, al * k, 'bar', 0) });
      items.push({ d: (pb.w + qb.w) / 2 + 0.04, f: () => engravedBar(L, pb.x, pb.y, qb.x, qb.y, wpx, sh * 0.86, al * k, 'bar', 0) });
    }
  }

  // ---- helicase: a hexameric ring of six lobes around the upper strand at the fork
  if (st.ring) {
    const { c, axis, R, r, spin } = st.ring;
    const e1 = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize();
    const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
    for (let k = 0; k < 6; k++) {
      const th = spin + (k / 6) * Math.PI * 2;
      const P = c.clone().addScaledVector(e1, Math.cos(th) * R).addScaledVector(e2, Math.sin(th) * R);
      const p = cam.proj(P.x, P.y, P.z), rp = r * p.s;
      if (p.x < -rp || p.x > 1920 + rp || p.y < -rp || p.y > 1080 + rp) continue;
      const fg = fog(p.w);
      items.push({ d: p.w, f: () => sphere(L, p.x, p.y, rp, fg, al, k) });
    }
  }

  items.sort((x, y) => y.d - x.d);
  for (const it of items) it.f();
}

/** Painter's items for a tube through projected points (width in nm, constant or per point). */
function tubeItems(items: Item[], L: LineBatch, pts: Proj[], wld: THREE.Vector3[], width: number | number[], tone: number,
  shadeT: (dx: number, dy: number, dz: number) => number, fog: (w: number) => number, al: number,
  onScreen: (p: Proj, q: Proj, m: number) => boolean) {
  const n = pts.length;
  let arc = 0;
  const dep = (i: number) => (pts[Math.max(0, Math.min(n - 1, i))]!.w + pts[Math.max(0, Math.min(n - 1, i + 1))]!.w) / 2;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const wn = typeof width === 'number' ? width : (width[i]! + width[i + 1]!) / 2;
    const wpx = Math.max(1.3, wn * (a.s + b.s) / 2);
    const segL = Math.hypot(b.x - a.x, b.y - a.y);
    const arc0 = arc;
    arc += segL;
    if (!onScreen(a, b, wpx + 4)) continue;
    const w0 = wld[i]!, w1 = wld[i + 1]!;
    const sh = tone * (0.55 + 0.45 * shadeT(w1.x - w0.x, w1.y - w0.y, w1.z - w0.z)) * fog((a.w + b.w) / 2);
    const d = dep(i);
    items.push({ d, f: () => engravedBar(L, a.x, a.y, b.x, b.y, wpx, sh, al, 'core', arc0) });
    items.push({ d: Math.min(d, dep(i - 1), dep(i + 1)) - 1e-4, f: () => engravedBar(L, a.x, a.y, b.x, b.y, wpx, sh, al, 'deco', arc0) });
  }
}

// light from the upper left, in screen space (unit vector toward the light)
const LX = -0.55, LY = -0.835;

/**
 * An engraved bar (tube or base): bone core, a darker band along the side away from the light with
 * ink hatch ticks across it, and optional ink rails. `arc0` phases the ticks along a strand.
 */
function engravedBar(L: LineBatch, ax: number, ay: number, bx: number, by: number, w: number, sh: number, al: number, mode: 'core' | 'deco' | 'bar', arc0: number) {
  const bone = LIN.bone, ink = LIN.ink;
  const dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy) || 1;
  const tx = dx / dl, ty = dy / dl;
  let nx = -ty, ny = tx;
  const facing = nx * LX + ny * LY;
  if (facing > 0) { nx = -nx; ny = -ny; } // n now points to the shadow side
  const k = Math.abs(facing); // 0 when the bar runs along the light
  if (mode !== 'deco') L.seg2(ax, ay, bx, by, w, [bone[0] * sh, bone[1] * sh, bone[2] * sh], al);
  if (mode === 'core') return;
  if (w > 3.5) {
    const bw = w * lerp(0.26, 0.44, k), off = w / 2 - bw / 2;
    const d = sh * 0.5;
    L.seg2(ax + nx * off, ay + ny * off, bx + nx * off, by + ny * off, bw, [bone[0] * d, bone[1] * d, bone[2] * d], al);
    if (w > 9 && mode === 'deco') {
      const sp = 4.5, j0 = Math.ceil(arc0 / sp), j1 = Math.floor((arc0 + dl) / sp);
      const i0 = w / 2 - bw * 1.35, i1 = w / 2 - 0.5;
      for (let j = j0; j <= j1; j++) {
        const u = j * sp - arc0, px = ax + tx * u, py = ay + ty * u;
        L.seg2(px + nx * i0, py + ny * i0, px + nx * i1, py + ny * i1, 0.9, ink, 0.55 * al);
      }
    }
  }
  if (mode === 'deco') {
    const o = w / 2 + 0.5;
    L.seg2(ax + nx * o, ay + ny * o, bx + nx * o, by + ny * o, 1.3, ink, 0.92 * al);
    L.seg2(ax - nx * o, ay - ny * o, bx - nx * o, by - ny * o, 1.3, ink, 0.92 * al);
  }
}


/**
 * An engraved sphere: ink rim, bone body, and shading drawn as engraved lines of equal illumination
 * (arcs around the lit point, heavier toward the shadow side), clipped to the disc.
 */
function sphere(L: LineBatch, x: number, y: number, r: number, fg: number, al: number, seed: number) {
  const bone = LIN.bone, ink = LIN.ink;
  const k0 = 0.8 * fg;
  L.seg2(x, y, x + 0.01, y, 2 * r + 3, ink, al);
  L.seg2(x, y, x + 0.01, y, 2 * r, [bone[0] * k0, bone[1] * k0, bone[2] * k0], al);
  const hx = x + LX * 0.42 * r, hy = y + LY * 0.42 * r;
  const n = 12, rr = r * 0.97;
  for (let k = 0; k < n; k++) {
    const rho = r * (0.52 + 0.085 * k + 0.02 * hash(seed, k));
    const wd = lerp(0.8, 3.4, (k / (n - 1)) ** 1.3) * Math.min(1, r / 40 + 0.4);
    const M = 48;
    let px = 0, py = 0, pin = false;
    for (let m = 0; m <= M; m++) {
      const th = (m / M) * Math.PI * 2;
      const qx = hx + Math.cos(th) * rho, qy = hy + Math.sin(th) * rho;
      const qin = Math.hypot(qx - x, qy - y) < rr;
      if (m > 0 && pin && qin) L.seg2(px, py, qx, qy, wd, ink, 0.8 * al);
      px = qx; py = qy; pin = qin;
    }
  }
}
