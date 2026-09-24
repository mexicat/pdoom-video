// Geometry for the room plate's Chinese room: a long hairline library aisle (units ≈ metres).
// x right, y up, z toward the camera; the back wall (slot) is at z = -RD, the door at z = ZF.
import { mulberry32, lerp, clamp, TAU } from '../engine/util';

export const RW = 3; // half width
export const RH = 4; // height
export const RD = 9; // back wall at z = -RD
export const ZF = 3; // front wall (the door we are blown through) at z = ZF
export const DESK = { x0: -0.95, x1: 0.95, z0: -6.3, z1: -5.45, h: 0.76 };
export const SLOT = { x: 0, y: 1.86, z: -RD + 0.02, w: 0.5 };
/** The hanging flip-board that carries the lyric: an axle at (yc, z), turning about x. */
export const BOARD = { x0: -2.3, x1: 2.3, yc: 3.0, hh: 0.66, z: -7.55 };
/** Door opening in the front wall (and the panel that gets blown in). */
export const DOOR = { x0: -0.62, x1: 0.62, h: 2.3 };

export const KIND = { STRUCT: 0, BOOK: 1, GRID: 2, LIGHT: 3, DESK: 4, FRONT: 5 } as const;

export interface Book { side: number; x: number; y0: number; h: number; z0: number; z1: number }

export interface Segs {
  n: number;
  s: Float32Array; // ax ay az bx by bz
  w: Float32Array;
  a: Float32Array;
  k: Uint8Array;
  book: Int32Array; // book index or -1
}

class SegBuf {
  s: number[] = []; w: number[] = []; a: number[] = []; k: number[] = []; b: number[] = [];
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, a: number, k: number, n = 1, book = -1) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      this.s.push(ax + (bx - ax) * u0, ay + (by - ay) * u0, az + (bz - az) * u0, ax + (bx - ax) * u1, ay + (by - ay) * u1, az + (bz - az) * u1);
      this.w.push(w); this.a.push(a); this.k.push(k); this.b.push(book);
    }
  }
  loop(pts: number[][], w: number, a: number, k: number, n = 1, book = -1) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
      this.add(p[0]!, p[1]!, p[2]!, q[0]!, q[1]!, q[2]!, w, a, k, n, book);
    }
  }
  done(): Segs {
    return { n: this.w.length, s: Float32Array.from(this.s), w: Float32Array.from(this.w), a: Float32Array.from(this.a), k: Uint8Array.from(this.k), book: Int32Array.from(this.b) };
  }
}

/** The static room: shell, floor/ceiling grids, lights, shelves full of rulebooks, back wall, desk. */
export function buildRoom(): { segs: Segs; books: Book[] } {
  const g = new SegBuf();
  const books: Book[] = [];
  const L = ZF + RD; // aisle length
  const nz = (len: number) => Math.max(2, Math.ceil(len / 0.5)); // subdivide long edges (near-plane clipping, warp)
  // shell: long edges, back wall, front wall with the door opening
  for (const x of [-RW, RW]) for (const y of [0, RH]) g.add(x, y, ZF, x, y, -RD, 1.6, 0.9, KIND.STRUCT, nz(L));
  g.loop([[-RW, 0, -RD], [RW, 0, -RD], [RW, RH, -RD], [-RW, RH, -RD]], 1.6, 0.9, KIND.STRUCT, 10);
  const zf = ZF;
  g.add(-RW, RH, zf, RW, RH, zf, 1.6, 0.9, KIND.FRONT, 12);
  g.add(-RW, 0, zf, DOOR.x0, 0, zf, 1.6, 0.9, KIND.FRONT, 5);
  g.add(DOOR.x1, 0, zf, RW, 0, zf, 1.6, 0.9, KIND.FRONT, 5);
  g.add(-RW, 0, zf, -RW, RH, zf, 1.6, 0.9, KIND.FRONT, 8);
  g.add(RW, 0, zf, RW, RH, zf, 1.6, 0.9, KIND.FRONT, 8);
  // door frame (architrave): two nested outlines + reveal depth
  for (const [e, al] of [[0, 1], [0.09, 0.55]] as const) {
    g.add(DOOR.x0 - e, 0, zf, DOOR.x0 - e, DOOR.h + e, zf, 1.4, al, KIND.FRONT, 5);
    g.add(DOOR.x0 - e, DOOR.h + e, zf, DOOR.x1 + e, DOOR.h + e, zf, 1.4, al, KIND.FRONT, 3);
    g.add(DOOR.x1 + e, DOOR.h + e, zf, DOOR.x1 + e, 0, zf, 1.4, al, KIND.FRONT, 5);
  }
  for (const x of [DOOR.x0, DOOR.x1]) g.add(x, DOOR.h, zf, x, DOOR.h, zf - 0.22, 1, 0.6, KIND.FRONT, 1);
  g.add(DOOR.x0, DOOR.h, zf - 0.22, DOOR.x1, DOOR.h, zf - 0.22, 1, 0.5, KIND.FRONT, 3);

  // floor grid (0.5 m tiles) and a sparse ceiling grid
  for (let i = 1; i < 12; i++) { const x = -RW + i * 0.5; g.add(x, 0, ZF, x, 0, -RD, 1, 0.34, KIND.GRID, nz(L)); }
  for (let z = ZF - 0.5; z > -RD + 0.01; z -= 0.5) g.add(-RW, 0, z, RW, 0, z, 1, 0.34, KIND.GRID, 12);
  for (let i = 1; i < 6; i++) { const x = -RW + i; g.add(x, RH, ZF, x, RH, -RD, 1, 0.16, KIND.GRID, nz(L)); }
  for (let z = ZF - 1; z > -RD + 0.01; z -= 1) g.add(-RW, RH, z, RW, RH, z, 1, 0.16, KIND.GRID, 12);
  // fluorescent panels down the aisle
  for (const zc of [1.2, -1.5, -4.2, -6.4]) {
    const y = RH - 0.01;
    g.loop([[-0.55, y, zc - 0.6], [0.55, y, zc - 0.6], [0.55, y, zc + 0.6], [-0.55, y, zc + 0.6]], 1.4, 0.95, KIND.LIGHT, 4);
    for (let k = 1; k < 4; k++) g.add(-0.55 + k * 0.275, y, zc - 0.6, -0.55 + k * 0.275, y, zc + 0.6, 1, 0.6, KIND.LIGHT, 4);
  }

  // shelves of rulebooks along both walls, the full length of the aisle
  const rnd = mulberry32(911);
  const shelfY = [0.12, 0.82, 1.52, 2.22, 2.92, 3.62];
  const Z0 = ZF - 0.35, Z1 = -8.4, depth = 0.42;
  for (const side of [-1, 1]) {
    const xw = side * RW, xf = side * (RW - depth);
    for (const y of shelfY) {
      g.add(xf, y, Z0, xf, y, Z1, 1.3, 0.8, KIND.STRUCT, nz(Z0 - Z1));
      g.add(xf, y - 0.04, Z0, xf, y - 0.04, Z1, 1, 0.4, KIND.STRUCT, nz(Z0 - Z1));
    }
    const bays = 9;
    for (let i = 0; i <= bays; i++) {
      const z = Z0 + (Z1 - Z0) * (i / bays);
      g.add(xf, shelfY[0]! - 0.04, z, xf, shelfY[shelfY.length - 1]!, z, 1.3, 0.8, KIND.STRUCT, 6);
      g.add(xf, shelfY[shelfY.length - 1]!, z, xw, shelfY[shelfY.length - 1]!, z, 1, 0.5, KIND.STRUCT, 1);
      // bay number plates on the uprights (tiny detail that streams past)
      g.add(xf, 1.25, z - 0.06, xf, 1.25, z + 0.06, 1, 0.5, KIND.STRUCT, 1);
    }
    g.add(xw, shelfY[shelfY.length - 1]!, Z0, xw, shelfY[shelfY.length - 1]!, Z1, 1, 0.4, KIND.STRUCT, nz(Z0 - Z1));
    for (let s = 0; s < shelfY.length - 1; s++) {
      const y0 = shelfY[s]!, gap = shelfY[s + 1]! - y0 - 0.06;
      let z = Z0 - 0.03;
      while (z > Z1 + 0.05) {
        const th = 0.05 + 0.1 * rnd() * rnd() + 0.03;
        if (rnd() < 0.05) { z -= 0.12 + 0.2 * rnd(); continue; }
        const h = gap * (0.62 + 0.36 * rnd());
        const zb = Math.max(Z1 + 0.02, z - th);
        const lean = rnd() < 0.06 ? (rnd() - 0.5) * 0.5 : 0;
        const xs = xf + side * (0.01 + 0.03 * rnd());
        const tz = lean * h;
        const A = 0.42 + 0.3 * rnd();
        const bi = books.length;
        books.push({ side, x: xs, y0, h, z0: z, z1: zb });
        g.loop([[xs, y0, z], [xs, y0, zb], [xs, y0 + h, zb + tz], [xs, y0 + h, z + tz]], 1, A, KIND.BOOK, 1, bi);
        const nb = rnd() < 0.7 ? 2 : 1;
        for (let k = 0; k < nb; k++) {
          const yb = y0 + h * (0.72 + 0.12 * k);
          g.add(xs, yb, z + tz * 0.8, xs, yb, zb + tz * 0.8, 1, A * 0.8, KIND.BOOK, 1, bi);
        }
        // top edge receding into the shelf (shows the book's depth when it slides out)
        g.add(xs, y0 + h, (z + zb) / 2 + tz, xs + side * 0.3, y0 + h, (z + zb) / 2 + tz, 1, A * 0.3, KIND.BOOK, 1, bi);
        z = zb - 0.004;
      }
    }
  }

  // back wall: output slot bezel + slit, a door with no handle
  const bz = -RD + 0.005;
  g.loop([[-0.62, 1.7, bz], [0.62, 1.7, bz], [0.62, 2.02, bz], [-0.62, 2.02, bz]], 1.4, 0.9, KIND.STRUCT, 3);
  g.loop([[-0.5, 1.84, bz], [0.5, 1.84, bz], [0.5, 1.88, bz], [-0.5, 1.88, bz]], 1.8, 1, KIND.STRUCT, 3);
  g.loop([[1.55, 0, bz], [2.45, 0, bz], [2.45, 2.1, bz], [1.55, 2.1, bz]], 1.2, 0.55, KIND.STRUCT, 4);
  g.loop([[1.62, 0, bz], [2.38, 0, bz], [2.38, 2.03, bz], [1.62, 2.03, bz]], 1, 0.25, KIND.STRUCT, 4);
  // the board's hanging rods (ceiling → axle ends)
  for (const x of [BOARD.x0 - 0.05, BOARD.x1 + 0.05]) g.add(x, RH, BOARD.z, x, BOARD.yc, BOARD.z, 1.2, 0.75, KIND.STRUCT, 3);
  g.add(BOARD.x0 - 0.05, BOARD.yc, BOARD.z, BOARD.x0, BOARD.yc, BOARD.z, 1.6, 0.8, KIND.STRUCT, 1);
  g.add(BOARD.x1, BOARD.yc, BOARD.z, BOARD.x1 + 0.05, BOARD.yc, BOARD.z, 1.6, 0.8, KIND.STRUCT, 1);

  // the desk (the rulebook on it is animated separately)
  const d = DESK;
  g.loop([[d.x0, d.h, d.z0], [d.x1, d.h, d.z0], [d.x1, d.h, d.z1], [d.x0, d.h, d.z1]], 1.5, 0.95, KIND.DESK, 4);
  g.loop([[d.x0, d.h - 0.06, d.z1], [d.x1, d.h - 0.06, d.z1], [d.x1, d.h, d.z1], [d.x0, d.h, d.z1]], 1.2, 0.7, KIND.DESK, 4);
  for (const [x, z] of [[d.x0 + 0.06, d.z1 - 0.06], [d.x1 - 0.06, d.z1 - 0.06], [d.x0 + 0.06, d.z0 + 0.06], [d.x1 - 0.06, d.z0 + 0.06]] as const)
    g.add(x, 0, z, x, d.h - 0.06, z, 1.3, 0.85, KIND.DESK, 4);
  // in/out trays
  for (const [xc, lab] of [[0.62, 0], [-0.66, 1]] as const) {
    const y = d.h + 0.005, zc = d.z0 + 0.18;
    g.loop([[xc - 0.16, y, zc - 0.12], [xc + 0.16, y, zc - 0.12], [xc + 0.16, y, zc + 0.12], [xc - 0.16, y, zc + 0.12]], 1, 0.7, KIND.DESK, 1);
    g.loop([[xc - 0.16, y + 0.05, zc - 0.12], [xc + 0.16, y + 0.05, zc - 0.12], [xc + 0.16, y + 0.05, zc + 0.12], [xc - 0.16, y + 0.05, zc + 0.12]], 1, 0.45, KIND.DESK, 1);
    void lab;
  }
  return { segs: g.done(), books };
}

/** Unfolded (floor-plane) coords → 3D point on floor / side walls / back wall. */
function unfold(u: number, v: number): [number, number, number] {
  const ox = Math.abs(u) - RW, oz = -RD - v;
  if (ox > 0 && ox >= oz) return [Math.sign(u) * RW, Math.min(ox, RH), Math.max(v, -RD)];
  if (oz > 0) return [clamp(u, -RW, RW), Math.min(oz, RH), -RD];
  return [u, 0.004, v];
}

export interface Shroom { x: number; z: number; s: number; t: number; lean: number; seed: number }

/** Mycelium from the bag: over the desk, down its legs, then branching over floor and walls. */
export function buildMycelium(): { segs: Float32Array; birth: Float32Array; n: number; shrooms: Shroom[] } {
  const rnd = mulberry32(4242);
  const segs: number[] = [], birth: number[] = [];
  const d = DESK;
  const legs = [[d.x0 + 0.06, d.z1 - 0.06], [d.x1 - 0.06, d.z1 - 0.06], [d.x0 + 0.06, d.z0 + 0.06], [d.x1 - 0.06, d.z0 + 0.06]] as const;
  const legLen = d.h + 0.4;
  for (const [x, z] of legs) {
    const bxp = 0.25, bzp = (d.z0 + d.z1) / 2;
    const n1 = 6;
    for (let i = 0; i < n1; i++) {
      const u0 = i / n1, u1 = (i + 1) / n1;
      const w0 = Math.sin(u0 * 7 + x) * 0.03, w1 = Math.sin(u1 * 7 + x) * 0.03;
      segs.push(lerp(bxp, x, u0) + w0, d.h + 0.006, lerp(bzp, z, u0) - w0, lerp(bxp, x, u1) + w1, d.h + 0.006, lerp(bzp, z, u1) - w1);
      birth.push(u0 * 0.4);
    }
    const n2 = 6;
    for (let i = 0; i < n2; i++) {
      const y0 = d.h * (1 - i / n2), y1 = d.h * (1 - (i + 1) / n2);
      const wob = 0.012 * Math.sin(i * 2.3 + z);
      segs.push(x + 0.02 + wob, y0, z + 0.02, x + 0.02 - wob, y1, z + 0.02);
      birth.push(0.4 + (i / n2) * (legLen - 0.4));
    }
  }
  interface Tip { u: number; v: number; a: number; b: number; depth: number }
  const tips: Tip[] = [];
  for (const [x, z] of legs) for (let k = 0; k < 8; k++) tips.push({ u: x, v: z, a: rnd() * TAU, b: legLen, depth: 0 });
  const step = 0.075;
  let guard = 0;
  while (tips.length && guard++ < 90000 && birth.length < 20000) {
    const tp = tips.shift()!;
    let { u, v, a, b } = tp;
    const steps = 10 + Math.floor(rnd() * 16);
    for (let s = 0; s < steps; s++) {
      a += (rnd() - 0.5) * 0.7;
      const ou = u, ov = v - (d.z0 + d.z1) / 2;
      const oa = Math.atan2(ov, ou);
      let da = oa - a; da = Math.atan2(Math.sin(da), Math.cos(da));
      a += da * 0.06;
      const nu = u + Math.cos(a) * step, nv = v + Math.sin(a) * step;
      if (Math.abs(nu) > RW + RH || nv < -RD - RH) break;
      if (nv > -1.2) { a = -a; continue; }
      const p = unfold(u, v), q = unfold(nu, nv);
      segs.push(p[0], p[1], p[2], q[0], q[1], q[2]);
      birth.push(b);
      b += step; u = nu; v = nv;
      if (rnd() < 0.16 && tp.depth < 12) tips.push({ u, v, a: a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), b, depth: tp.depth + 1 });
    }
    if (tp.depth < 12 && rnd() < 0.85) tips.push({ u, v, a: a + (rnd() - 0.5) * 0.4, b, depth: tp.depth + 1 });
  }
  const shrooms: Shroom[] = [];
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const near = rnd() < 0.65;
    const x = near ? side * (RW - 0.15 - rnd() * 0.5) : (rnd() - 0.5) * 3.2;
    const z = -1.0 - rnd() * (RD - 1.4);
    shrooms.push({ x, z, s: 0.22 + rnd() * 0.32, t: rnd(), lean: (rnd() - 0.5) * 0.3, seed: rnd() });
  }
  shrooms.sort((p, q) => p.t - q.t);
  return { segs: Float32Array.from(segs), birth: Float32Array.from(birth), n: birth.length, shrooms };
}
