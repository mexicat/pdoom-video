// Room plate — "The room, from inside" (chorus 1, after the hook).
//
// Three beats:
//  A  "'cause the future goes FOOM": the hook's letters shatter into line debris; the spark
//     splits on every eighth (then every sixteenth once FOOM hits) — 1→2→4→…→1024 branches —
//     an exponential branching explosion. FOOM slams in, stepping through Archivo's width
//     instances (62→125) on sixteenths while its O's fire shockwave rings through the tree.
//  B  "Trapped in the Chinese room,": FOOM's blast blows the door in and the camera crashes
//     through behind it, down a long hairline library aisle of rulebooks, and never settles: a
//     snap reframe on every beat (a dutch tracking shot, a low hero angle once the slot starts
//     firing 我不懂 cards on the kicks, a punch-in on "room,"), books sliding out on the hi-hats.
//     The lyric is stamped word by word onto a flip-board hanging over the desk; every stamp
//     jolts it on its axle.
//  C  "with a bag of shrooms": the board flips over on the snare while the camera whips up into
//     a high orbit round the desk; a paper bag drops onto it, the rulebook's pages riffle on the
//     eighths, mycelium spreads, the room breathes (warp + echo trails, the acid accent),
//     mushrooms pop on the sixteenths, the orbit tips into a roll and "SHROOMS" tears off the
//     board toward the lens, ending in the exact screen layout the shoggoth plate picks up.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, ot } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, lerp, ease, prog, mulberry32, springStep, pulse, TAU, smoothstep, hash, noise1 } from '../engine/util';
import { sparkParticles } from './_motifs';
import { PDoom, formatPDoom } from '../engine/hud';
import { RW, RH, RD, ZF, DESK, SLOT, BOARD, DOOR, KIND, buildRoom, buildMycelium, type Segs, type Book, type Shroom } from './room-geo';
import { SHROOMS_FAM, shroomsAffine } from './room-shrooms';

type RGB = [number, number, number];
type V3 = [number, number, number];
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const WHITE: RGB = [1, 0.93, 0.85];
const CJK = '"Songti SC", "STSong", "Hiragino Sans GB", "PingFang SC", serif';

const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vsc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vlerp = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
/** Rodrigues rotation of v about unit axis k by angle a. */
const vrot = (v: V3, k: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a), kv = vdot(k, v), x = vcross(k, v);
  return [v[0] * c + x[0] * s + k[0] * kv * (1 - c), v[1] * c + x[1] * s + k[1] * kv * (1 - c), v[2] * c + x[2] * s + k[2] * kv * (1 - c)];
};

interface Branch { g: number; parent: number; pts: { x: number; y: number }[]; t0: number; t1: number; seed: number }
interface Debris { x0: number; y0: number; x1: number; y1: number; vx: number; vy: number; spin: number; d: number }
/** Pinhole camera: position, orthonormal basis (right, up, forward), focal length in px. */
interface Cam { p: V3; R: V3; U: V3; F: V3; f: number; cx: number; cy: number }
interface Key { p: V3; tg: V3; roll: number; f: number }
interface Shot { t0: number; t1: number; a?: Key; b?: Key; e?: (x: number) => number; snap: number; kick?: number; rollSpring?: [number, number]; key?: (t: number) => Key }
interface CardDef { t: number; v: V3; axis: V3; w: number; yaw: number; seed: number }
interface BGlyph { ch: string; x: number; w: number; wi: number }
interface BRow { glyphs: BGlyph[]; m: number; base: number; cap: number; fam: string; words: Word[]; x0: number; width: number }
interface Affine { a: number; b: number; c: number; d: number; e: number; f: number }
interface BoardPose { O: V3; th: number; uyA: V3; nA: V3 }
type BK = 'i' | 'g' | 'iF' | 'gF';

const K = (p: V3, tg: V3, roll: number, f: number): Key => ({ p, tg, roll, f });
const lerpKey = (a: Key, b: Key, k: number): Key => ({ p: vlerp(a.p, b.p, k), tg: vlerp(a.tg, b.tg, k), roll: lerp(a.roll, b.roll, k), f: lerp(a.f, b.f, k) });
const S_PX = 100; // canvas px per em for board glyphs (drawn under a projective-ish affine)

export default class Room extends Scene {
  bg = new FSPass(/* glsl */ `
    uniform float t, part, gridK, gridS, acidK;
    uniform vec4 wall;   // back wall rect in px (x0, y0, x1, y1), y down
    uniform vec2 vp;     // FOOM: root of the explosion / room: vanishing point (px)
    uniform vec4 rings[12];   // x, y, r, w (px)
    uniform vec2 ringI[12];   // intensity, heat
    void main() {
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * vec2(${W}.0, ${H}.0);
      vec3 c = C_INK;
      if (part < 0.5) {
        // FOOM: faint polar graph paper around the root (a plate in a treatise)
        vec2 q = px - vp;
        float r = length(q);
        float a = atan(q.y, q.x);
        float reveal = smoothstep(gridK * 1400.0 + 40.0, gridK * 1400.0 - 40.0, r);
        float circ = aaStroke(fract(r / gridS + 0.5) - 0.5, 0.012) ;
        float circMajor = aaStroke(fract(r / (gridS * 4.0) + 0.5) - 0.5, 0.004);
        float rad = aaStroke(sin(a * 36.0) * r / 36.0, 0.8) * smoothstep(40.0, 120.0, r);
        c += C_GRAPHITE * (0.10 * circ + 0.16 * circMajor + 0.06 * rad) * reveal;
        // shockwave rings: a sharp hot front with a faint wake inside
        for (int i = 0; i < 12; i++) {
          vec4 R = rings[i];
          if (ringI[i].x <= 0.001) continue;
          float d = length(px - R.xy) - R.z;
          float front = exp(-d * d / (R.w * R.w));
          float wake = d < 0.0 ? exp(d / (R.w * 10.0)) * 0.06 : 0.0;
          vec3 col = mix(C_SIGNAL, vec3(1.0, 0.9, 0.8), ringI[i].y);
          c += col * (front * 1.1 + wake) * ringI[i].x;
        }
      } else {
        float inWall = step(wall.x, px.x) * step(px.x, wall.z) * step(wall.y, px.y) * step(px.y, wall.w);
        c = mix(c, C_INK2 * 1.15, inWall);
        float d = length((px - vp) / vec2(${W}.0, ${H}.0));
        c *= 1.0 - 0.35 * smoothstep(0.2, 0.8, d);
      }
      fragColor = vec4(c, 1.0);
    }`, {
    t: { value: 0 }, part: { value: 0 }, gridK: { value: 0 }, gridS: { value: 120 }, acidK: { value: 0 },
    wall: { value: new THREE.Vector4() }, vp: { value: new THREE.Vector2(W / 2, H / 2) },
    rings: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
    ringI: { value: Array.from({ length: 12 }, () => new THREE.Vector2()) },
  });

  /** The room's background: the back wall (a projected quad) a hair lighter than the void. */
  roomBg = new FSPass(/* glsl */ `
    uniform vec2 q0, q1, q2, q3; uniform float wallOn, slotGlow; uniform vec2 slotP;
    float side(vec2 p, vec2 a, vec2 b) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }
    void main() {
      vec2 px = vec2(vUv.x, 1.0 - vUv.y) * vec2(${W}.0, ${H}.0);
      vec3 c = C_INK;
      float s0 = side(px, q0, q1), s1 = side(px, q1, q2), s2 = side(px, q2, q3), s3 = side(px, q3, q0);
      float inW = ((s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0)) ? 1.0 : 0.0;
      c = mix(c, C_INK2 * 1.15, inW * wallOn);
      // the output slot is the room's only warm light: a faint pool on the wall
      float ds = length(px - slotP);
      c += C_BLOOD * 0.05 * slotGlow * exp(-ds / 180.0) * inW;
      float d = length((px - vec2(${W / 2}.0, ${H / 2}.0)) / vec2(${W}.0, ${H}.0));
      c *= 1.0 - 0.38 * smoothstep(0.2, 0.8, d);
      fragColor = vec4(c, 1.0);
    }`, {
    q0: { value: new THREE.Vector2() }, q1: { value: new THREE.Vector2() }, q2: { value: new THREE.Vector2() }, q3: { value: new THREE.Vector2() },
    wallOn: { value: 1 }, slotGlow: { value: 0 }, slotP: { value: new THREE.Vector2() },
  });

  ink = new LineBatch(130000, { blend: 'max' }); // crisp hairlines, no double brightness (room: behind the board)
  glow = new LineBatch(70000, { blend: 'add' }); // hot things: sparks, rings, acid tips, echoes
  inkF = new LineBatch(90000, { blend: 'max' }); // room: in front of the board's plane
  glowF = new LineBatch(50000, { blend: 'add' });
  text = new Layer2D();
  text2 = new Layer2D(); // paper in front of the board

  // timing (song seconds), all derived from lyrics + beat grid in init()
  private L1!: Line; private L2!: Line; private L3!: Line;
  private tA = 0; private tP = 0; private tX = 0; private pWord: Word | null = null; private tF = 0; private tB = 0; private tEnd = 0;
  private B0 = 0; private tb: number[] = []; // beat times from the cut: tb[k] = cut beat + k
  private tFlip = 0; private tBag = 0; private tLand = 0; private tShrooms = 0; private tEsc = 0;
  private gens: number[] = [];
  private branches: Branch[] = [];
  private debris: Debris[] = [];
  private root = { x: W * 0.5, y: H * 0.53 };

  // the room
  private segs!: Segs;
  private books: Book[] = [];
  private bookOff = new Float32Array(0);
  private slides: { t: number; b: number; d: number }[] = [];
  private ms: Float32Array = new Float32Array(0); private mb: Float32Array = new Float32Array(0); private mn = 0;
  private shrooms: Shroom[] = [];
  private shots: Shot[] = [];
  private cards: CardDef[] = [];
  private rowsA: BRow[] = []; private rowsB: BRow[] = [];
  private stamps: number[] = [];
  private capK = 0.72; // Archivo cap height / em
  private pdoom!: PDoom;
  private bagTag: { x: number; y: number } | null = null;
  // the board's plane this frame (visible side's normal): lines are split into behind / in front of it
  private bO: V3 = [0, 0, 0]; private bN: V3 = [0, 0, 1];
  private front(x: number, y: number, z: number) { return (x - this.bO[0]) * this.bN[0] + (y - this.bO[1]) * this.bN[1] + (z - this.bO[2]) * this.bN[2] > 0; }
  private batch(kind: BK, x: number, y: number, z: number): LineBatch {
    if (kind === 'iF') return this.inkF;
    if (kind === 'gF') return this.glowF;
    const f = this.front(x, y, z);
    return kind === 'i' ? (f ? this.inkF : this.ink) : f ? this.glowF : this.glow;
  }

  override async init() {
    const { lyrics: ly, audio: au } = this.ctx;
    this.pdoom = new PDoom(ly);
    this.L1 = ly.get("the future goes");
    this.L2 = ly.get('Chinese room');
    this.L3 = ly.get('bag of shrooms');
    this.tP = this.ctx.start;
    this.tEnd = this.ctx.end;
    // the explosion starts on "'cause"; if the plate opens earlier (the end of the hook's
    // "P(doom)"), the hook's word is held first and shattered on "'cause"
    this.tX = Math.max(this.tP, this.L1.words[0]!.start);
    this.tA = this.tX;
    this.pWord = ly.findWords('P(doom)').filter((w) => w.start < this.tX).pop() ?? null;
    this.tF = this.L1.words[this.L1.words.length - 1]!.start; // FOOM
    // hard cut into the room on the beat nearest "Trapped"
    this.tB = au.nearestBeat(this.L2.words[0]!.start);
    if (this.tB <= this.tF + 0.3) this.tB = this.L2.words[0]!.start;
    this.B0 = Math.round(au.beatAt(this.tB));
    for (let k = 0; k <= 12; k++) this.tb.push(au.timeOfBeat(this.B0 + k));
    const w3 = this.L3.words;
    // the board flips over on the snare that lands with "with"
    this.tFlip = w3[0]!.start - 0.09;
    const bagW = w3.find((w) => /bag/i.test(w.w)) ?? w3[2]!;
    this.tBag = bagW.start;
    this.tLand = au.timeOfBeat(Math.ceil(au.beatAt(this.tBag + 0.15)));
    this.tShrooms = w3[w3.length - 1]!.start;
    this.tEsc = this.tShrooms + 0.1;
    this.stamps = [...this.L2.words, ...w3].map((w) => w.start);

    // branching generations: eighths until FOOM, then sixteenths until the cut
    this.gens.push(this.tX);
    let b = Math.ceil(au.beatAt(this.tX + 0.15) * 2) / 2;
    let tt = au.timeOfBeat(b);
    while (tt < this.tF - 0.07) { this.gens.push(tt); b += 0.5; tt = au.timeOfBeat(b); }
    while (tt < this.tB - 0.06 && this.gens.length < 11) { this.gens.push(tt); b += 0.25; tt = au.timeOfBeat(b); }
    this.gens.push(this.tB);

    this.buildTree();
    this.buildDebris();
    const room = buildRoom();
    this.segs = room.segs; this.books = room.books;
    this.bookOff = new Float32Array(this.books.length);
    const my = buildMycelium();
    this.ms = my.segs; this.mb = my.birth; this.mn = my.n; this.shrooms = my.shrooms;
    this.buildShots();
    this.buildBoard();
    this.buildCards();
    this.buildSlides();
  }

  // ================================================================== part A geometry
  private buildTree() {
    const rnd = mulberry32(3301);
    const N = this.gens.length - 1;
    const br: Branch[] = [];
    const nF = this.gens.findIndex((g) => g >= this.tF - 0.07);
    const make = (g: number, parent: number, x: number, y: number, a: number) => {
      const t0 = this.gens[g]!, t1 = this.gens[g + 1]!;
      // eighth-note generations are long strokes; sixteenths are shorter but twice as fast
      const fast = nF >= 0 && g >= nF;
      const len = (fast ? 150 : 215) * (0.8 + 0.4 * rnd()) * (g === 0 ? 1.3 : 1);
      const curv = (rnd() - 0.5) * 0.9 / len * 6;
      const pts: { x: number; y: number }[] = [{ x, y }];
      let ang = a, px = x, py = y;
      const n = 5;
      for (let i = 1; i <= n; i++) {
        ang += curv * (len / n) * 0.2 + (rnd() - 0.5) * 0.06;
        px += Math.cos(ang) * len / n; py += Math.sin(ang) * len / n;
        pts.push({ x: px, y: py });
      }
      const id = br.length;
      br.push({ g, parent, pts, t0, t1, seed: rnd() });
      if (g + 1 < N) {
        // outward bias keeps the explosion radial and frame-filling
        const rdx = px - this.root.x, rdy = (py - this.root.y) * 1.5;
        const rad = Math.atan2(rdy, rdx);
        let dA = rad - ang; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
        const base = ang + dA * (g < 2 ? 0.0 : 0.35);
        const spread = (g < 2 ? 0.95 : 0.42) + rnd() * 0.3;
        const tw = (rnd() - 0.5) * 0.2;
        make(g + 1, id, px, py, base - spread + tw);
        make(g + 1, id, px, py, base + spread + tw);
      }
    };
    // gen 0: the spark enters from the centre, heading up-right
    make(0, -1, this.root.x, this.root.y, -0.35);
    this.branches = br;
  }

  private buildDebris() {
    // "P(DOOM)" outlines (the hook's last slam) broken into short strokes that fly apart
    const fam = F.archivo(100, 900);
    const size = 300;
    const lay = layout('P(DOOM)', fam, size);
    const ox = W / 2 - lay.width / 2, oy = H / 2 + size * 0.36;
    // per-glyph outlines (opentype's shaper chokes on Archivo's ccmp lookups for whole strings)
    const cmds: any[] = [];
    const fnt = ot(fam);
    for (const g of lay.glyphs) cmds.push(...fnt.charToGlyph(g.ch).getPath(ox + g.x, oy, size).commands);
    const pts: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    let lx = 0, ly = 0, sx = 0, sy = 0;
    for (const c of cmds) {
      if (c.type === 'M') { if (cur.length > 1) pts.push(cur); cur = [{ x: c.x, y: c.y }]; lx = sx = c.x; ly = sy = c.y; }
      else if (c.type === 'L') { cur.push({ x: c.x, y: c.y }); lx = c.x; ly = c.y; }
      else if (c.type === 'Q') {
        for (let i = 1; i <= 5; i++) { const u = i / 5, v = 1 - u; cur.push({ x: v * v * lx + 2 * v * u * c.x1 + u * u * c.x, y: v * v * ly + 2 * v * u * c.y1 + u * u * c.y }); }
        lx = c.x; ly = c.y;
      } else if (c.type === 'C') {
        for (let i = 1; i <= 6; i++) { const u = i / 6, v = 1 - u; cur.push({ x: v * v * v * lx + 3 * v * v * u * c.x1 + 3 * v * u * u * c.x2 + u * u * u * c.x, y: v * v * v * ly + 3 * v * v * u * c.y1 + 3 * v * u * u * c.y2 + u * u * u * c.y }); }
        lx = c.x; ly = c.y;
      } else if (c.type === 'Z') { cur.push({ x: sx, y: sy }); pts.push(cur); cur = []; }
    }
    if (cur.length > 1) pts.push(cur);
    const rnd = mulberry32(77);
    for (const poly of pts) {
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1]!, b = poly[i]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.ceil(len / 38));
        for (let k = 0; k < n; k++) {
          const x0 = a.x + (b.x - a.x) * k / n, y0 = a.y + (b.y - a.y) * k / n;
          const x1 = a.x + (b.x - a.x) * (k + 1) / n, y1 = a.y + (b.y - a.y) * (k + 1) / n;
          const mx = (x0 + x1) / 2 - W / 2, my = (y0 + y1) / 2 - H / 2;
          const r = Math.hypot(mx, my) + 1;
          const sp = 900 + 1400 * rnd();
          this.debris.push({ x0, y0, x1, y1, vx: (mx / r) * sp + (rnd() - 0.5) * 500, vy: (my / r) * sp + (rnd() - 0.5) * 500, spin: (rnd() - 0.5) * 9, d: rnd() });
        }
      }
    }
  }

  // ================================================================== render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    if (t < this.tB) return this.renderFoom(f, out);
    return this.renderRoom(f, out);
  }

  // ------------------------------------------------------------------ A: FOOM
  private renderFoom(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, audio: au } = this.ctx;
    const t = f.t;
    const ink = this.ink, glow = this.glow;
    ink.clear(); glow.clear();
    const foomK = t >= this.tF ? 1 : 0;
    // view: slow pull-back as the tree outgrows the frame; punch on FOOM
    // exponential growth, exponential pull-back: the growth front stays near the frame edge
    const zp = prog(t, this.tA, this.tB);
    const zoom = 1.75 * Math.pow(0.72 / 1.75, Math.pow(zp, 0.9)) * (1 + 0.08 * pulse(t, this.tF, 0.12) * foomK);
    const rot = -0.07 * prog(t, this.tA, this.tB, ease.inOutQuad);
    const cx = W * 0.5, cy = H * 0.53;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const rings = this.foomRings(t);
    const xf = (x: number, y: number): [number, number] => {
      let X = (x - this.root.x) * zoom, Y = (y - this.root.y) * zoom;
      const x2 = X * cr - Y * sr, y2 = X * sr + Y * cr;
      X = cx + x2; Y = cy + y2;
      // radial push from passing ring fronts
      for (const r of rings) {
        const dx = X - r.x, dy = Y - r.y, dd = Math.hypot(dx, dy) + 1e-3;
        const k = r.amp * Math.exp(-(((dd - r.r) / 80) ** 2));
        X += (dx / dd) * k; Y += (dy / dd) * k;
      }
      return [X, Y];
    };

    // debris of the hook's letters (first ~0.6 s)
    const dt0 = t - this.tA;
    if (dt0 < 0) {
      // the hook's word, held as a hairline outline until "'cause"
      const fl = 0.75 + 0.25 * Math.sin(t * 60) * Math.sin(t * 37);
      for (const d of this.debris) ink.seg2(d.x0, d.y0, d.x1, d.y1, 1.6, mul(LIN.bone, 0.85 * fl), 1);
    } else if (dt0 < 0.75) {
      for (const d of this.debris) {
        const life = 0.3 + 0.4 * d.d;
        if (dt0 > life) continue;
        const k = 1 - dt0 / life;
        const tau = (1 - Math.exp(-dt0 * 5)) / 5;
        const mx = (d.x0 + d.x1) / 2 + d.vx * tau, my = (d.y0 + d.y1) / 2 + d.vy * tau + 300 * dt0 * dt0;
        const ang = d.spin * tau * 3;
        const hx = (d.x1 - d.x0) / 2, hy = (d.y1 - d.y0) / 2;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const ex = hx * ca - hy * sa, ey = hx * sa + hy * ca;
        const hot = Math.exp(-dt0 / 0.05);
        const col = mix3(mix3(LIN.signal, mul(LIN.bone, 0.8), 0.35 + 0.5 * k), WHITE, hot);
        ink.seg2(mx - ex, my - ey, mx + ex, my + ey, 1.8 * (0.5 + k), col, Math.min(1, k * 1.5));
        if (dt0 < 0.03) glow.seg2(mx - ex, my - ey, mx + ex, my + ey, 2.5, mul(LIN.ember, 0.5 * hot), 1);
      }
    }

    // the branching tree
    let growing = 0;
    for (const bch of this.branches) {
      if (t < bch.t0) continue;
      const dur = bch.t1 - bch.t0;
      const u = clamp((t - bch.t0) / dur);
      const pu = 1 - Math.pow(1 - u, 1.5);
      const n = bch.pts.length - 1;
      const reach = pu * n;
      const w = Math.max(1.15, 4.4 * Math.pow(0.8, bch.g));
      let prev = xf(bch.pts[0]!.x, bch.pts[0]!.y);
      const start = prev;
      for (let i = 0; i < n; i++) {
        if (reach <= i) break;
        const a = bch.pts[i]!, b2 = bch.pts[i + 1]!;
        const k = Math.min(1, reach - i);
        const cur = xf(a.x + (b2.x - a.x) * k, a.y + (b2.y - a.y) * k);
        // cooling: white-hot where just drawn → signal → bone → graphite
        const tw = bch.t0 + dur * (1 - Math.pow(1 - (i + k) / n, 1 / 1.5));
        const age = Math.max(0, t - tw);
        const hot = Math.exp(-age / 0.07);
        const warm = Math.exp(-age / 0.35);
        const coolCol = mix3(mul(LIN.bone, 0.82), mul(LIN.ash, 0.62), smoothstep(0.3, 1.4, age));
        const c = mix3(coolCol, mix3(LIN.signal, WHITE, hot), Math.max(hot, warm * 0.7));
        ink.seg2(prev[0], prev[1], cur[0], cur[1], w, c, 1);
        if (hot > 0.2) glow.seg2(prev[0], prev[1], cur[0], cur[1], w * 1.6, mul(LIN.ember, 1.3 * hot), 1);
        prev = cur;
      }
      // node marks: tiny circles at the split points of the first generations (a diagram)
      if (bch.g >= 1 && bch.g <= 5 && bch.pts.length) {
        const rr = 5.5 - bch.g * 0.6;
        for (let k = 0; k < 10; k++) {
          const a0 = (k / 10) * TAU, a1 = ((k + 1) / 10) * TAU;
          ink.seg2(start[0] + Math.cos(a0) * rr, start[1] + Math.sin(a0) * rr, start[0] + Math.cos(a1) * rr, start[1] + Math.sin(a1) * rr, 1, mul(LIN.bone, 0.7), 1);
        }
      }
      if (u < 1) {
        growing++;
        // tip: a small hot point (the spark, multiplied)
        const I = Math.max(0.4, 1.5 * Math.pow(0.8, bch.g));
        const s = Math.max(2.4, 10 * Math.pow(0.8, bch.g));
        glow.seg2(prev[0], prev[1], prev[0] + 0.01, prev[1], s * 2.6, mul(LIN.signal, 0.7 * I), 0.5);
        glow.seg2(prev[0], prev[1], prev[0] + 0.01, prev[1], s, mul(WHITE, 3 * I), 1);
      }
    }
    // the root spark sputters for the first generations
    if (t < this.gens[4]!) {
      const b0 = this.branches[0]!;
      sparkParticles(glow, t, (tb) => {
        if (tb < b0.t0) return null;
        const u = clamp((tb - b0.t0) / (b0.t1 - b0.t0));
        const pu = 1 - Math.pow(1 - u, 1.5);
        const i = Math.min(b0.pts.length - 2, Math.floor(pu * (b0.pts.length - 1)));
        const k = pu * (b0.pts.length - 1) - i;
        const p = b0.pts[i]!, q = b0.pts[i + 1]!;
        const r = xf(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k);
        return { x: r[0], y: r[1] };
      }, { rate: 150, intensity: 1.1, seed: 5 });
    }

    // a burst of sparks at every split of the first generations (hits on the eighths)
    for (const bch of this.branches) {
      if (bch.g < 1 || bch.g > 4) continue;
      const age = t - bch.t0;
      if (age < 0 || age > 0.35) continue;
      const o = xf(bch.pts[0]!.x, bch.pts[0]!.y);
      const n = 10 - bch.g * 2;
      for (let k = 0; k < n; k++) {
        const a = hash(bch.seed * 1000, k) * TAU, sp = 260 + 520 * hash(k, bch.seed * 1000 + 3);
        const life = 0.18 + 0.17 * hash(k, bch.seed * 1000 + 7);
        if (age > life) continue;
        const kk = 1 - age / life;
        const x1 = o[0] + Math.cos(a) * sp * age, y1 = o[1] + Math.sin(a) * sp * age + 300 * age * age;
        const x0 = o[0] + Math.cos(a) * sp * Math.max(0, age - 0.025), y0 = o[1] + Math.sin(a) * sp * Math.max(0, age - 0.025);
        glow.seg2(x0, y0, x1, y1, 1.4 * (0.5 + kk), mul(mix3(LIN.signal, WHITE, kk * kk), 2.2 * kk), 1);
      }
    }

    // background: graph paper + analytic shockwave rings
    const u = this.bg.u;
    u.t!.value = t; u.part!.value = 0;
    u.gridK!.value = prog(t, this.tP, this.tA + 0.5, ease.outCubic);
    u.gridS!.value = 120 * zoom;
    const rp = xf(this.root.x, this.root.y);
    (u.vp!.value as THREE.Vector2).set(rp[0], rp[1]);
    const RV = u.rings!.value as THREE.Vector4[], RI = u.ringI!.value as THREE.Vector2[];
    for (let i = 0; i < 12; i++) {
      const r = rings[i];
      if (r) { RV[i]!.set(r.x, r.y, r.r, r.w); RI[i]!.set(r.alpha, r.heat); } else RI[i]!.set(0, 0);
    }
    this.bg.render(renderer, out);
    ink.render(renderer, out);
    glow.render(renderer, out);

    // typography
    const L = this.text; L.clear(); const c = L.ctx;
    if (t < this.tA) this.drawHookHold(c, t);
    this.drawFoomLyric(c, t);
    this.drawCounter(c, t, growing);
    this.drawFoomWord(c, t);
    comp.draw(renderer, L.upload(), out);

    // post: kick the camera on the slam
    const beatP = pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t))), 0.08);
    const sixteenth = pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t) * 4) / 4), 0.05) * foomK;
    const sh = 16 * pulse(t, this.tF, 0.1) * foomK + 5 * sixteenth + 3 * beatP;
    return {
      bloom: 0.6, bloomThreshold: 0.85,
      // FOOM slam: a brief over-exposure (blacks stay black); the plate burns out into the hard cut
      exposure: 1 + 0.9 * pulse(t, this.tF, 0.03) * foomK + 5 * Math.pow(smoothstep(this.tB - 0.12, this.tB, t), 2),
      shake: [Math.sin(t * 97) * sh, Math.cos(t * 83) * sh], zoom: 1 + 0.025 * pulse(t, this.tF, 0.15) * foomK + 0.01 * beatP + 0.012 * sixteenth,
      ca: 0.8 + 2.5 * pulse(t, this.tF, 0.15) * foomK,
    };
  }

  /** Before "'cause": the end of the hook's "P(doom)", filling in as it is sung (the outline is in the line batch). */
  private drawHookHold(c: CanvasRenderingContext2D, t: number) {
    const fam = F.archivo(100, 900), size = 300;
    const lay = layout('P(DOOM)', fam, size);
    const ox = W / 2 - lay.width / 2, oy = H / 2 + size * 0.36;
    const p = this.pWord ? Lyrics.wordProgress(this.pWord, t) : 1;
    c.save();
    c.font = font(fam, size);
    c.beginPath(); c.rect(ox - 10, oy - size, (lay.width + 20) * p, size * 1.4); c.clip();
    c.fillStyle = rgba('bone', 0.94);
    c.fillText('P(DOOM)', ox, oy);
    c.restore();
  }

  /** FOOM word layout for time t (width steps on sixteenths, scale grows). */
  private foomLayout(t: number) {
    const { audio: au } = this.ctx;
    const widths = [62, 75, 87.5, 100, 112.5, 125];
    const bF = au.beatAt(this.tF);
    const step = clamp(Math.floor((au.beatAt(t) - bF) * 4 + 0.001), 0, widths.length - 1);
    const fam = F.archivo(widths[step]!, 900);
    const u = prog(t, this.tF, this.tB);
    const targetW = lerp(900, 2300, Math.pow(u, 1.7));
    const lay = layout('FOOM', fam, 100);
    const size = (100 * targetW) / lay.width;
    const L2 = layout('FOOM', fam, size);
    const x0 = W / 2 - L2.width / 2;
    const base = H / 2 + size * 0.36;
    // O centres (Archivo's cap height ≈ 0.72 em)
    const oc = [1, 2].map((gi) => { const g = L2.glyphs[gi]!; return { x: x0 + g.x + g.w / 2, y: base - size * 0.36, r: g.w * 0.43 }; });
    return { fam, size, lay: L2, x0, base, step, oc };
  }

  private foomRings(t: number) {
    const rings: { x: number; y: number; r: number; w: number; amp: number; alpha: number; heat: number }[] = [];
    if (t < this.tF) return rings;
    const { audio: au } = this.ctx;
    const bF = au.beatAt(this.tF);
    const nNow = Math.floor((au.beatAt(t) - bF) * 4);
    // newest first so the 12 slots keep the freshest rings
    for (let n = nNow; n >= 0 && rings.length < 12; n--) {
      const te = au.timeOfBeat(bF + n / 4);
      const age = t - te;
      if (age < 0 || age > 1.2) continue;
      const Lf = this.foomLayout(te);
      for (const o of Lf.oc) {
        const r = o.r + 2300 * (1 - Math.exp(-age * 2.4));
        rings.push({ x: o.x, y: o.y, r, w: Math.max(1.1, 4.5 * Math.exp(-age * 5)), amp: 42 * Math.exp(-age * 2.5), alpha: Math.exp(-age * 2.0), heat: Math.exp(-age * 14) });
      }
    }
    return rings;
  }

  private drawFoomLyric(c: CanvasRenderingContext2D, t: number) {
    const words = this.L1.words;
    // stacked, top-left, Swiss: ’CAUSE THE / FUTURE / GOES
    const rows: [number[], number, number, number][] = [[[0, 1], 58, 700, 87.5], [[2], 150, 900, 75], [[3], 150, 900, 75]];
    const x = 128;
    let y = 150;
    const out = prog(t, this.tF, this.tF + 0.22, ease.inCubic); // blown away by FOOM
    c.save();
    c.globalAlpha = 1 - out;
    c.translate(-out * 300, 0);
    rows.forEach(([idx, size, wt, wd], ri) => {
      if (ri > 0) y += size * 0.86;
      const fam = F.archivo(wd, wt);
      c.font = font(fam, size);
      // hanging punctuation: a leading ’ sits in the margin so the row's letters align with the stack
      const first = words[idx[0]!]!.w.replace(/^'/, '’').toUpperCase();
      const hang = /^[’‘“]/.test(first) ? c.measureText(first).width - c.measureText(first.slice(1)).width : 0;
      let xx = x - hang;
      for (const wi of idx) {
        const w = words[wi]!;
        const txt = w.w.replace(/^'/, '’').toUpperCase();
        const p = Lyrics.wordProgress(w, t);
        const vis = prog(t, w.start - 0.3, w.start, ease.outCubic);
        const ww = c.measureText(txt).width;
        if (vis > 0) {
          c.save();
          c.globalAlpha *= vis;
          c.translate(0, (1 - vis) * 18);
          c.fillStyle = rgba('bone', 0.28);
          c.fillText(txt, xx, y);
          c.beginPath(); c.rect(xx - 4, y - size, (ww + 8) * p, size * 1.3); c.clip();
          c.fillStyle = p < 1 ? rgba('signal') : rgba('bone', 0.96);
          c.fillText(txt, xx, y);
          c.restore();
        }
        xx += ww + size * 0.26;
      }
      y += 8;
    });
    c.restore();
    c.save();
    c.font = font(F.mono(400), 14);
    c.letterSpacing = '2px';
    c.fillStyle = rgba('ash', 0.8 * (1 - out));
    c.fillText('GROWTH, AS ADVERTISED', x, 82);
    c.restore();
  }

  private drawFoomWord(c: CanvasRenderingContext2D, t: number) {
    if (t < this.tF - 0.02) return;
    const { audio: au } = this.ctx;
    const Lf = this.foomLayout(t);
    const bF = au.beatAt(this.tF);
    const lastEmit = au.timeOfBeat(bF + Math.floor((au.beatAt(t) - bF) * 4) / 4);
    const fl = pulse(t, lastEmit, 0.05);
    c.save();
    const cyy = Lf.base - Lf.size * 0.36;
    const slam = springStep(t - this.tF, 3.2, 0.35);
    c.translate(W / 2, cyy);
    c.scale(0.75 + 0.25 * slam, 0.75 + 0.25 * slam);
    c.translate(-W / 2, -cyy);
    c.font = font(Lf.fam, Lf.size);
    Lf.lay.glyphs.forEach((g, i) => {
      const x = Lf.x0 + g.x;
      if (i === 1 || i === 2) {
        // the O's are rings now: hollow, hot outline (the shockwaves leave from here)
        c.lineWidth = Lf.size * (0.03 + 0.025 * fl);
        c.strokeStyle = fl > 0.5 ? rgba('ember') : rgba('signal');
        c.strokeText(g.ch, x, Lf.base);
      } else {
        c.fillStyle = rgba('bone');
        c.fillText(g.ch, x, Lf.base);
      }
    });
    c.restore();
    // a mono note riding under the word
    c.save();
    c.font = font(F.mono(400), 15);
    c.letterSpacing = '2px';
    c.fillStyle = rgba('bone', 0.75);
    c.textAlign = 'center';
    c.fillText(`WDTH ${[62, 75, 87.5, 100, 112.5, 125][Lf.step]}  ·  d(FOOM)/dt > 0`, W / 2, Math.min(H - 170, Lf.base + 60));
    c.restore();
  }

  private drawCounter(c: CanvasRenderingContext2D, t: number, _n: number) {
    // n = 2^k — the branch count, ticking with each generation
    let g = 0;
    for (let i = 0; i < this.gens.length - 1; i++) if (t >= this.gens[i]!) g = i;
    const n = Math.pow(2, g);
    const x = W - 132;
    c.save();
    c.textAlign = 'right';
    c.font = font(F.mono(500), 15);
    c.letterSpacing = '2px';
    c.fillStyle = rgba('ash', 0.85);
    c.fillText('BRANCHES', x, 108);
    c.font = font(F.mono(400), 44);
    c.letterSpacing = '0px';
    const fl = pulse(t, this.gens[g]!, 0.06);
    c.fillStyle = fl > 0.2 ? rgba('signal') : rgba('bone', 0.92);
    c.fillText(String(n).padStart(4, '0'), x, 158);
    c.font = font(F.mono(400), 14);
    c.fillStyle = rgba('ash', 0.7);
    c.fillText(`n(t) = 2^floor(t/beat)   k = ${g}`, x, 186);
    c.restore();
  }

  // ================================================================== B + C: the room
  // ------------------------------------------------------------------ setup
  private buildShots() {
    const tb = this.tb;
    this.shots = [
      // "Trapped": blown in through the door right behind the door itself, rolling out of a dutch angle
      { t0: this.tB, t1: tb[1]!, a: K([0.28, 1.45, ZF + 0.55], [0.05, 1.95, -8], -0.5, 520), b: K([-0.35, 1.72, -1.15], [0.15, 2.5, -8], -0.02, 900), e: (x) => 0.8 * ease.outCubic(x) + 0.2 * x, snap: 0, rollSpring: [1.25, 0.36] },
      // "in the": snap right, dutch, tracking hard down the aisle (the shelves stream past)
      { t0: tb[1]!, t1: tb[2]!, a: K([1.3, 1.2, -1.55], [-0.9, 2.8, -8], 0.14, 860), b: K([1.1, 1.3, -3.2], [-0.7, 2.75, -8], 0.08, 900), e: ease.linear, snap: 0.13, kick: 0.05 },
      // "Chinese": a low hero angle from the left as the slot starts firing cards
      { t0: tb[2]!, t1: tb[3]!, a: K([-1.55, 0.6, -2.9], [0.5, 3.0, -8.2], -0.16, 780), b: K([-1.35, 0.68, -4.3], [0.4, 2.95, -8.2], -0.1, 800), e: ease.linear, snap: 0.12, kick: -0.05 },
      // "room,": punch-in on the board (downbeat)
      { t0: tb[3]!, t1: tb[4]!, a: K([0.35, 2.15, -3.1], [0.02, 2.98, BOARD.z], 0.05, 1150), b: K([0.12, 2.35, -4.45], [0, 3.0, BOARD.z], 0.0, 1250), e: ease.outCubic, snap: 0.09 },
      // "with a bag of shrooms": whip up into a high orbit round the desk, tipping into a roll
      { t0: tb[4]!, t1: this.tEnd, key: (t) => this.orbitKey(t), snap: 0.16, kick: 0.06 },
    ];
  }

  private orbitKey(t: number): Key {
    const au = this.ctx.audio;
    const t0 = this.tb[4]!, t7 = this.tb[7]!;
    const u = prog(t, t0, this.tEnd);
    // a high angle (camera up by the ceiling) swinging round the desk, accelerating
    const phi = lerp(0.78, -0.8, 0.6 * u + 0.4 * u * u);
    const r = 2.45 - 0.4 * u;
    const trip = this.tripK(t);
    const breath = Math.sin(Math.PI * (au.beatAt(t) - this.B0));
    const p: V3 = [Math.sin(phi) * r, 3.15 - 0.2 * u, -5.9 + Math.cos(phi) * r];
    const tg: V3 = [0.3 * Math.sin(phi), lerp(2.5, 2.05, ease.inOutQuad(clamp(u / 0.55))), -7.0];
    const roll = 0.12 * Math.sin(phi) - 1.15 * ease.inCubic(prog(t, t7 - 0.05, this.tEnd));
    // the bag lands: punch in on the desk
    const land = t >= this.tLand ? pulse(t, this.tLand, 0.16) : 0;
    const kick = pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t))), 0.07);
    return { p, tg: vlerp(tg, [0.25, 0.9, -5.9], 0.25 * land), roll, f: 700 * (1 + 0.14 * trip * breath + 0.12 * land + 0.035 * kick) };
  }

  private buildBoard() {
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = font(F.archivo(100, 900), S_PX);
    this.capK = (c.measureText('H').actualBoundingBoxAscent || 72) / S_PX;
    const w2 = this.L2.words, w3 = this.L3.words;
    const width = BOARD.x1 - BOARD.x0 - 0.36;
    const row = (words: Word[], fam: string, cap: number, base: number, tracking: number): BRow => {
      const txt = words.map((w) => w.w.toUpperCase()).join(' ');
      const lay = layout(txt, fam, S_PX, tracking);
      let m = cap / (this.capK * S_PX);
      if (lay.width * m > width) m = width / lay.width;
      const glyphs: BGlyph[] = [];
      let wi = 0, k = 0;
      for (const g of lay.glyphs) {
        if (g.ch === ' ') { wi++; k = 0; continue; }
        glyphs.push({ ch: g.ch, x: g.x, w: g.w, wi });
        k++;
      }
      return { glyphs, m, base, cap: this.capK * S_PX * m, fam, words, x0: -(lay.width * m) / 2, width: lay.width * m };
    };
    this.rowsA = [row(w2.slice(0, 3), F.archivo(100, 900), 0.3, -0.2, 4), row(w2.slice(3), F.archivo(87.5, 900), 0.48, 0.4, 3)];
    this.rowsB = [row(w3.slice(0, w3.length - 1), F.archivo(100, 900), 0.3, -0.2, 4), row(w3.slice(w3.length - 1), SHROOMS_FAM(), 0.48, 0.4, 5)];
  }

  private buildCards() {
    const au = this.ctx.audio;
    const times = au.events('kick', this.tb[1]! - 0.04, this.tEnd - 0.05).map(([t]) => t);
    // once the trip starts the slot fires on the off-beat eighths as well
    for (let b = Math.ceil(au.beatAt(this.tShrooms) * 2) / 2; au.timeOfBeat(b) < this.tEnd - 0.05; b += 0.5) if (b % 1 !== 0) times.push(au.timeOfBeat(b));
    times.sort((a, b) => a - b);
    times.forEach((tk, i) => {
      const r = mulberry32(900 + i);
      const a = (r() - 0.5) * 0.5;
      // once the camera is up in the orbit the cards spill round the desk instead of at the lens
      const late = tk > this.tb[4]! - 0.05;
      this.cards.push({ t: tk, v: [(r() - 0.5) * (late ? 3.4 : 2.4), 0.9 + 1.4 * r(), late ? 2.2 + 2.0 * r() : 4.0 + 3.4 * r()], axis: [Math.cos(a), 0, Math.sin(a)], w: (6 + 8 * r()) * (r() < 0.5 ? -1 : 1), yaw: (r() - 0.5) * 1.4, seed: r() });
    });
  }

  private buildSlides() {
    const au = this.ctx.audio;
    au.events('hat', this.tB - 0.01, this.tEnd).forEach(([th], j) => {
      const cam = this.camAt(th);
      const cand: number[] = [];
      this.books.forEach((bk, i) => {
        const rel = vsub([bk.x, bk.y0 + bk.h / 2, (bk.z0 + bk.z1) / 2], cam.p);
        const z = vdot(rel, cam.F);
        if (z > 0.8 && z < 6.5 && Math.abs(vdot(rel, cam.R)) / z < 1.0 && Math.abs(vdot(rel, cam.U)) / z < 0.6) cand.push(i);
      });
      if (!cand.length) return;
      for (let k = 0; k < 9; k++) this.slides.push({ t: th, b: cand[Math.floor(hash(j, k, 71) * cand.length)]!, d: 0.22 + 0.3 * hash(j, k, 72) });
    });
  }

  // ------------------------------------------------------------------ camera
  private keyAt(t: number): Key {
    const S = this.shots;
    let i = 0;
    while (i + 1 < S.length && t >= S[i + 1]!.t0) i++;
    const s = S[i]!;
    let k = this.shotKey(s, t);
    if (i > 0 && s.snap > 0 && t - s.t0 < s.snap) k = lerpKey(this.shotKey(S[i - 1]!, t), k, ease.outExpo(clamp((t - s.t0) / s.snap)));
    if (s.kick && t >= s.t0) k.roll += s.kick * Math.sin(TAU * 2.6 * (t - s.t0)) * Math.exp(-(t - s.t0) * 6);
    return k;
  }
  private shotKey(s: Shot, t: number): Key {
    if (s.key) return s.key(t);
    const u = clamp((t - s.t0) / (s.t1 - s.t0));
    const k = lerpKey(s.a!, s.b!, (s.e ?? ease.linear)(u));
    if (s.rollSpring) k.roll = lerp(s.a!.roll, s.b!.roll, springStep(t - s.t0, s.rollSpring[0], s.rollSpring[1]));
    return k;
  }
  private camAt(t: number): Cam {
    const k = this.keyAt(t);
    const h = this.hitK(t);
    if (h > 0.001) {
      k.p = vadd(k.p, [noise1(t * 37, 11) * 0.05 * h, noise1(t * 41, 12) * 0.05 * h, 0]);
      k.roll += noise1(t * 29, 13) * 0.012 * h;
    }
    const Fw = vnorm(vsub(k.tg, k.p));
    const R0 = vnorm([-Fw[2], 0, Fw[0]]);
    const U0 = vcross(R0, Fw);
    const c = Math.cos(k.roll), s = Math.sin(k.roll);
    return { p: k.p, F: Fw, R: vadd(vsc(R0, c), vsc(U0, s)), U: vsub(vsc(U0, c), vsc(R0, s)), f: k.f, cx: W / 2, cy: H / 2 };
  }

  /** Stamps, the cut and the bag landing: 0..1 impact envelope. */
  private hitK(t: number) {
    let h = t >= this.tB ? pulse(t, this.tB, 0.08) : 0;
    for (const s of this.stamps) if (t >= s) h = Math.max(h, 0.6 * pulse(t, s, 0.07));
    if (t >= this.tLand) h = Math.max(h, pulse(t, this.tLand, 0.09));
    return h;
  }
  /** 0..1: how far into the trip (the bag lands softly, "shrooms" hits hard). */
  private tripK(t: number) {
    return 0.35 * prog(t, this.tBag, this.tLand, ease.outCubic) + 0.65 * prog(t, this.tShrooms - 0.1, this.tShrooms + 0.25, ease.inOutCubic);
  }
  private warpAmp(t: number) {
    const au = this.ctx.audio;
    const beatP = pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t))), 0.1);
    return this.tripK(t) * (8 + 22 * beatP) + 30 * prog(t, this.tb[7]!, this.tEnd, ease.inQuad);
  }
  private lightK(t: number) {
    const u = t - this.tB;
    let k = 1;
    if (u >= 0 && u < 0.4) k = hash(Math.floor(u * 30), 5) < 0.45 + u * 1.2 ? 1 : 0.1;
    const trip = this.tripK(t);
    if (trip > 0) { const au = this.ctx.audio; k *= 1 - 0.55 * trip * (1 - pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t))), 0.12)); }
    return k;
  }

  // ------------------------------------------------------------------ projection
  private P5 = [0, 0, 0, 0, 0];
  /** Project a world point; null if behind the near plane. */
  private proj(c: Cam, X: number, Y: number, Z: number): [number, number] | null {
    const rx = X - c.p[0], ry = Y - c.p[1], rz = Z - c.p[2];
    const z = rx * c.F[0] + ry * c.F[1] + rz * c.F[2];
    if (z < 0.05) return null;
    const x = rx * c.R[0] + ry * c.R[1] + rz * c.R[2], y = rx * c.U[0] + ry * c.U[1] + rz * c.U[2];
    return [c.cx + (c.f * x) / z, c.cy - (c.f * y) / z];
  }
  private depth(c: Cam, X: number, Y: number, Z: number) { return (X - c.p[0]) * c.F[0] + (Y - c.p[1]) * c.F[1] + (Z - c.p[2]) * c.F[2]; }
  /** Near-clip and project a segment into P[0..3]; P[4] = mean depth. False if culled. */
  private clipSeg(c: Cam, ax: number, ay: number, az: number, bx: number, by: number, bz: number, P: number[]): boolean {
    const near = 0.1;
    let da = this.depth(c, ax, ay, az), db = this.depth(c, bx, by, bz);
    if (da < near && db < near) return false;
    if (da < near) { const u = (near - da) / (db - da); ax += (bx - ax) * u; ay += (by - ay) * u; az += (bz - az) * u; da = near; }
    else if (db < near) { const u = (near - db) / (da - db); bx += (ax - bx) * u; by += (ay - by) * u; bz += (az - bz) * u; db = near; }
    const pa = this.proj(c, ax, ay, az)!, pb = this.proj(c, bx, by, bz)!;
    P[0] = pa[0]; P[1] = pa[1]; P[2] = pb[0]; P[3] = pb[1]; P[4] = (da + db) / 2;
    if ((P[0]! < -250 && P[2]! < -250) || (P[0]! > W + 250 && P[2]! > W + 250) || (P[1]! < -250 && P[3]! < -250) || (P[1]! > H + 250 && P[3]! > H + 250)) return false;
    return true;
  }
  /** Screen-space "breathing" warp for the trip. */
  private warp(x: number, y: number, t: number, A: number): [number, number] {
    if (A <= 0) return [x, y];
    const dx = Math.sin(y * 0.0105 + t * 3.1 + Math.sin(x * 0.006 - t * 1.7) * 1.6) + 0.5 * Math.sin((x + y) * 0.019 - t * 4.3);
    const dy = Math.sin(x * 0.0093 - t * 2.6 + Math.sin(y * 0.008 + t * 1.3) * 1.4) + 0.5 * Math.sin((x - y) * 0.017 + t * 3.7);
    return [x + dx * A, y + dy * A];
  }
  private seg3(kind: BK, c: Cam, a: V3, b: V3, w: number, col: RGB, al: number, t: number, warpA: number) {
    const P = this.P5;
    const lb = this.batch(kind, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    if (!this.clipSeg(c, a[0], a[1], a[2], b[0], b[1], b[2], P)) return;
    let ax = P[0]!, ay = P[1]!, bx = P[2]!, by = P[3]!;
    if (warpA > 0) { [ax, ay] = this.warp(ax, ay, t, warpA); [bx, by] = this.warp(bx, by, t, warpA); }
    lb.seg2(ax, ay, bx, by, w, col, al * (1 - 0.5 * clamp(P[4]! / 13)));
  }
  /** Canvas affine putting canvas point (cx, cy) at world point P, canvas x along ux and y along uy (m metres per canvas px). */
  private planeAffine(c: Cam, P: V3, ux: V3, uy: V3, m: number, cx: number, cy: number, scale: number, t: number, warpA: number): Affine | null {
    const d = 10;
    const p0 = this.proj(c, P[0], P[1], P[2]);
    const pa = this.proj(c, P[0] + ux[0] * m * d, P[1] + ux[1] * m * d, P[2] + ux[2] * m * d);
    const pb = this.proj(c, P[0] + uy[0] * m * d, P[1] + uy[1] * m * d, P[2] + uy[2] * m * d);
    if (!p0 || !pa || !pb) return null;
    let [x0, y0] = p0, [xa, ya] = pa, [xb, yb] = pb;
    if (warpA > 0) { [x0, y0] = this.warp(x0, y0, t, warpA); [xa, ya] = this.warp(xa, ya, t, warpA); [xb, yb] = this.warp(xb, yb, t, warpA); }
    const a = ((xa - x0) / d) * scale, b = ((ya - y0) / d) * scale, cc = ((xb - x0) / d) * scale, dd = ((yb - y0) / d) * scale;
    return { a, b, c: cc, d: dd, e: x0 - a * cx - cc * cy, f: y0 - b * cx - dd * cy };
  }

  // ------------------------------------------------------------------ board
  private boardPose(t: number): BoardPose {
    let th = t >= this.tFlip ? Math.PI * springStep(t - this.tFlip, 2.4, 0.5) : 0;
    for (const s of this.stamps) if (t >= s && t - s < 1.2) th += 0.055 * Math.sin((t - s) * 21) * Math.exp(-(t - s) * 6.5);
    th += 0.12 * this.tripK(t) * Math.sin(t * 5.3);
    const O: V3 = [0, BOARD.yc, BOARD.z];
    const uyA: V3 = [0, -Math.cos(th), -Math.sin(th)];
    const nA: V3 = [0, -Math.sin(th), Math.cos(th)];
    return { O, th, uyA, nA };
  }

  // ------------------------------------------------------------------ render
  private renderRoom(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, audio: au } = this.ctx;
    const t = f.t;
    const ink = this.ink, glow = this.glow;
    ink.clear(); glow.clear(); this.inkF.clear(); this.glowF.clear();
    const cam = this.camAt(t);
    {
      const bp = this.boardPose(t);
      this.bO = bp.O;
      this.bN = vdot(bp.nA, vsub(cam.p, bp.O)) > 0 ? bp.nA : vsc(bp.nA, -1);
    }
    const trip = this.tripK(t);
    const warpA = this.warpAmp(t);
    const beatP = pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t))), 0.1);
    this.updateBooks(t);

    // camera smear: when the view whips, re-draw the room at a few earlier instants (motion blur)
    const smear = this.smearAmt(t, cam);
    const nS = smear > 0.04 ? 4 : 0;
    for (let e = nS; e >= 1; e--) {
      const te = t - (e / nS) * (1 / 24) * smear;
      this.drawStatic('i', this.camAt(te), te, this.warpAmp(te), mul(LIN.bone, 0.78), 0.3 * (1 - (e - 1) / nS), false);
    }
    // the trip: echoes of the architecture (acid, then signal) trailing behind
    if (trip > 0.01) {
      for (let e = 3; e >= 1; e--) {
        const te = t - e * 0.055;
        this.drawStatic('g', this.camAt(te), te, this.warpAmp(te), e === 1 ? mul(LIN.acid, 0.5) : mul(LIN.signal, 0.55), 0.75 * Math.pow(0.6, e - 1) * trip, true);
      }
    }
    this.drawStatic('i', cam, t, warpA, mul(LIN.bone, 0.78), 1, false);
    this.drawDoor(cam, t, warpA);
    this.drawRulebook(cam, t, warpA);
    this.drawMycelium(cam, t, warpA);
    if (t > this.tShrooms - 0.3) this.drawShrooms(cam, t, warpA);
    if (t > this.tBag) this.drawBag(cam, t, warpA);
    this.drawBlast(cam, t);
    this.drawStampDust(cam, t, warpA);

    // background: the back wall quad
    const u = this.roomBg.u;
    const q = [[-RW, RH], [RW, RH], [RW, 0], [-RW, 0]].map(([x, y]) => this.proj(cam, x!, y!, -RD));
    const qv = [u.q0, u.q1, u.q2, u.q3];
    u.wallOn!.value = q.every((p) => p) ? 1 : 0;
    q.forEach((p, i) => { if (p) { const [x, y] = this.warp(p[0], p[1], t, warpA); (qv[i]!.value as THREE.Vector2).set(x, y); } });
    const sp = this.proj(cam, SLOT.x, SLOT.y, SLOT.z);
    if (sp) (u.slotP!.value as THREE.Vector2).set(sp[0], sp[1]);
    u.slotGlow!.value = t > this.tb[1]! ? 1 : 0;
    this.roomBg.render(renderer, out);
    ink.render(renderer, out);
    glow.render(renderer, out);

    // paper in depth order: wall labels and cards behind the board, the board; then what is in
    // front of the board's plane (lines, cards), the bag's tag and the escaping SHROOMS
    const L = this.text; L.clear(); const c = L.ctx;
    const L2 = this.text2; L2.clear(); const c2 = L2.ctx;
    this.drawPaper(c, c2, cam, t, warpA);
    c.setTransform(1, 0, 0, 1, 0, 0);
    comp.draw(renderer, L.upload(), out);
    this.inkF.render(renderer, out);
    this.glowF.render(renderer, out);
    this.drawBagTag(c2, t);
    if (t >= this.tShrooms) this.drawShroomsWord(c2, t);
    c2.setTransform(1, 0, 0, 1, 0, 0);
    comp.draw(renderer, L2.upload(), out);

    const cutFlash = t >= this.tB ? pulse(t, this.tB, 0.035) : 0;
    const land = t >= this.tLand ? pulse(t, this.tLand, 0.1) : 0;
    let stampK = 0;
    for (const s of this.stamps) if (t >= s) stampK = Math.max(stampK, pulse(t, s, 0.06));
    const sh = 14 * land + 5 * stampK + 3 * beatP * trip + 12 * cutFlash;
    return {
      bloom: 0.6 + 0.3 * trip, bloomThreshold: 0.8,
      exposure: 1 + 0.9 * cutFlash + 0.1 * stampK,
      shake: [Math.sin(t * 91) * sh, Math.cos(t * 77) * sh],
      zoom: 1 + 0.02 * land + 0.012 * stampK + 0.012 * beatP * trip,
      ca: 0.4 + 0.7 * trip * (0.3 + beatP) + 0.8 * smear,
      halation: 0.25 + 0.2 * trip,
    };
  }

  /** 0..1 from how fast a few reference points move on screen (px per 1/60 s). */
  private smearAmt(t: number, cam: Cam) {
    const prev = this.camAt(t - 1 / 60);
    let d = 0, n = 0;
    for (const [x, y, z] of [[0, 3, BOARD.z], [0, 0.8, -5.9], [-2.6, 1.5, -3], [2.6, 1.5, -3], [0, 1.9, -RD]] as const) {
      const a = this.proj(cam, x, y, z), b = this.proj(prev, x, y, z);
      if (a && b) { d += Math.hypot(a[0] - b[0], a[1] - b[1]); n++; }
    }
    return n ? clamp((d / n - 8) / 50) : 0;
  }

  private updateBooks(t: number) {
    this.bookOff.fill(0);
    for (const s of this.slides) {
      if (t < s.t || t > s.t + 0.8) continue;
      const k = ease.outExpo(prog(t, s.t, s.t + 0.09)) - ease.inOutCubic(prog(t, s.t + 0.28, s.t + 0.75));
      this.bookOff[s.b] = Math.max(this.bookOff[s.b]!, s.d * k);
    }
  }

  private drawStatic(kind: BK, cam: Cam, t: number, warpA: number, col: RGB, alphaMul: number, archOnly: boolean) {
    const S = this.segs, s = S.s, P = this.P5;
    const lightA = this.lightK(t);
    for (let i = 0; i < S.n; i++) {
      const k = S.k[i]!;
      if (archOnly && (k === KIND.BOOK || k === KIND.GRID)) continue;
      const o = i * 6;
      const bi = S.book[i]!;
      if (bi >= 0 && this.bookOff[bi]! > 0.015) continue; // pulled books are drawn as boxes
      if (!this.clipSeg(cam, s[o]!, s[o + 1]!, s[o + 2]!, s[o + 3]!, s[o + 4]!, s[o + 5]!, P)) continue;
      let ax = P[0]!, ay = P[1]!, bx = P[2]!, by = P[3]!;
      if (warpA > 0) { [ax, ay] = this.warp(ax, ay, t, warpA); [bx, by] = this.warp(bx, by, t, warpA); }
      let a = S.a[i]! * (1 - 0.5 * clamp(P[4]! / 13)) * alphaMul;
      if (k === KIND.LIGHT) a *= lightA;
      this.batch(kind, (s[o]! + s[o + 3]!) / 2, (s[o + 1]! + s[o + 4]!) / 2, (s[o + 2]! + s[o + 5]!) / 2).seg2(ax, ay, bx, by, S.w[i]!, col, a);
    }
    // books sliding out on the hi-hats: full boxes (spine, top, fore-edge), catching the light
    for (let bi = 0; bi < this.books.length; bi++) {
      const off = this.bookOff[bi]!;
      if (off <= 0.015) continue;
      const bk = this.books[bi]!;
      const x0 = bk.x - bk.side * off, x1 = x0 + bk.side * 0.3;
      const y0 = bk.y0, y1 = bk.y0 + bk.h, za = bk.z0, zb = bk.z1;
      const E: [V3, V3][] = [
        [[x0, y0, za], [x0, y0, zb]], [[x0, y1, za], [x0, y1, zb]], [[x0, y0, za], [x0, y1, za]], [[x0, y0, zb], [x0, y1, zb]],
        [[x0, y1, za], [x1, y1, za]], [[x0, y1, zb], [x1, y1, zb]], [[x1, y1, za], [x1, y1, zb]],
        [[x0, y0, za], [x1, y0, za]], [[x0, y0, zb], [x1, y0, zb]],
        [[x0, y1 - bk.h * 0.28, za], [x0, y1 - bk.h * 0.28, zb]], [[x0, y1 - bk.h * 0.16, za], [x0, y1 - bk.h * 0.16, zb]],
      ];
      const a = Math.min(1, 0.6 + off * 2) * alphaMul;
      for (const [p, q] of E) this.seg3(kind, cam, p, q, 1.2, col, a, t, warpA);
    }
  }

  /** The door, blown off its hinges by FOOM, tumbling down the aisle ahead of the camera. */
  private drawDoor(cam: Cam, t: number, warpA: number) {
    const tau = t - this.tB;
    if (tau < 0 || tau > 2) return;
    const k = 4.2;
    const fall = Math.min(Math.PI / 2, 2.2 * tau + 7 * tau * tau);
    const C: V3 = [0.12 * tau, Math.max(0.035 + 1.14 * Math.abs(Math.cos(fall)), 1.15 + 0.6 * tau - 3 * tau * tau), ZF - 0.03 - (30 / k) * (1 - Math.exp(-k * tau))];
    const spin = 0.5 * (1 - Math.exp(-3 * tau)), twist = 0.3 * (1 - Math.exp(-3 * tau));
    const xf = (u: number, v: number, w = 0): V3 => {
      // local (u right, v up, w toward camera) → tip back about x, spin about y, twist about z
      let p: V3 = [u, v, w];
      p = [p[0] * Math.cos(twist) - p[1] * Math.sin(twist), p[0] * Math.sin(twist) + p[1] * Math.cos(twist), p[2]];
      const a = -fall;
      p = [p[0], p[1] * Math.cos(a) - p[2] * Math.sin(a), p[1] * Math.sin(a) + p[2] * Math.cos(a)];
      p = [p[0] * Math.cos(spin) + p[2] * Math.sin(spin), p[1], -p[0] * Math.sin(spin) + p[2] * Math.cos(spin)];
      return vadd(C, p);
    };
    const hot = Math.exp(-tau / 0.08);
    const col = mix3(mul(LIN.bone, 0.85), WHITE, hot);
    const hw = (DOOR.x1 - DOOR.x0) / 2 - 0.02, hh = DOOR.h / 2 - 0.01;
    const L = (a: V3, b: V3, w = 1.5, al = 1) => {
      this.seg3('i', cam, a, b, w, col, al, t, warpA);
      if (hot > 0.1) this.seg3('g', cam, a, b, w * 2, mul(LIN.ember, 1.4 * hot), 1, t, warpA);
    };
    const rect = (u0: number, v0: number, u1: number, v1: number, w: number, al: number, zz = 0) => {
      const n = 3;
      const pts: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      for (let i = 0; i < 4; i++) {
        const [pu, pv] = pts[i]!, [qu, qv] = pts[(i + 1) % 4]!;
        for (let j = 0; j < n; j++) L(xf(lerp(pu, qu, j / n), lerp(pv, qv, j / n), zz), xf(lerp(pu, qu, (j + 1) / n), lerp(pv, qv, (j + 1) / n), zz), w, al);
      }
    };
    rect(-hw, -hh, hw, hh, 1.6, 1, 0.025);
    rect(-hw, -hh, hw, hh, 1.1, 0.5, -0.025);
    for (const [u, v] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const) L(xf(u, v, 0.025), xf(u, v, -0.025), 1, 0.6);
    // six raised panels
    const pw = (2 * hw - 0.3) / 2, ph = (2 * hh - 0.4) / 3;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) {
      const u0 = -hw + 0.1 + i * (pw + 0.1), v0 = -hh + 0.1 + j * (ph + 0.1);
      rect(u0, v0, u0 + pw, v0 + ph, 1, 0.6, 0.026);
    }
    // knob
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * TAU, a1 = ((i + 1) / 10) * TAU;
      L(xf(hw - 0.12 + Math.cos(a0) * 0.035, Math.sin(a0) * 0.035, 0.05), xf(hw - 0.12 + Math.cos(a1) * 0.035, Math.sin(a1) * 0.035, 0.05), 1.2, 0.9);
    }
  }

  /** FOOM's shockwave, still expanding as we are blown in. */
  private drawBlast(cam: Cam, t: number) {
    const u = t - this.tB;
    if (u < 0 || u > 0.5) return;
    const c0 = this.proj(cam, 0, 1.9, -RD) ?? [W / 2, H / 2];
    for (const [delay, amp] of [[0, 1], [0.07, 0.6]] as const) {
      const k = prog(u, delay, delay + 0.42, ease.outCubic);
      if (k <= 0 || k >= 1) continue;
      const r = 220 + 2500 * k, a = (1 - k) * amp;
      const n = 120;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
        this.glowF.seg2(c0[0] + Math.cos(a0) * r, c0[1] + Math.sin(a0) * r, c0[0] + Math.cos(a1) * r, c0[1] + Math.sin(a1) * r, 3 + 5 * (1 - k), mul(mix3(LIN.signal, WHITE, (1 - k) ** 3), 1.6 * a), 1);
      }
    }
  }

  /** The open rulebook on the desk; its pages riffle over on the eighths (sixteenths in the trip). */
  private drawRulebook(cam: Cam, t: number, warpA: number) {
    const au = this.ctx.audio;
    const d = DESK;
    const xs = -0.3, y = d.h + 0.012, zF = d.z1 - 0.12, zB = d.z1 - 0.5, pw = 0.3;
    const col = mul(LIN.bone, 0.85);
    const page = (ang: number, curl: number, al: number) => {
      const n = 8;
      const pt = (r: number, z: number): V3 => {
        const a = ang + curl * (r / pw) * Math.sin(ang);
        return [xs + Math.cos(a) * r, y + Math.sin(a) * r * 0.9, z];
      };
      for (let i = 0; i < n; i++) {
        const r0 = (i / n) * pw, r1 = ((i + 1) / n) * pw;
        this.seg3('i', cam, pt(r0, zF), pt(r1, zF), 1, col, al, t, warpA);
        this.seg3('i', cam, pt(r0, zB), pt(r1, zB), 1, col, al, t, warpA);
      }
      this.seg3('i', cam, pt(pw, zF), pt(pw, zB), 1.1, col, al, t, warpA);
    };
    // the two resting stacks
    page(0.04, 0, 0.9); page(Math.PI - 0.04, 0, 0.9);
    for (let k = 1; k < 5; k++) {
      const z = lerp(zF, zB, k / 5.5);
      this.seg3('i', cam, [xs + 0.04, y + 0.004, z], [xs + pw - 0.04, y + 0.014, z], 1, col, 0.35, t, warpA);
      this.seg3('i', cam, [xs - 0.04, y + 0.004, z], [xs - pw + 0.04, y + 0.014, z], 1, col, 0.35, t, warpA);
    }
    // riffling pages
    const t0 = this.tb[3]!;
    if (t < t0) return;
    const b = au.beatAt(t);
    const step = t > this.tShrooms ? 0.25 : 0.5;
    const bi = Math.floor(b / step) * step;
    for (let j = 0; j < 3; j++) {
      const tj = au.timeOfBeat(bi - j * step);
      if (tj < t0) continue;
      const k = prog(t, tj, tj + 0.2, ease.inOutCubic);
      if (k <= 0 || k >= 1) continue;
      page(0.04 + k * (Math.PI - 0.08), -0.7 * Math.sin(k * Math.PI), 1);
    }
  }

  private drawMycelium(cam: Cam, t: number, warpA: number) {
    if (t < this.tLand - 0.02) return;
    const au = this.ctx.audio;
    const b8 = (au.beatAt(t) - au.beatAt(this.tLand)) * 2;
    const burst = Math.floor(b8) + ease.outExpo(b8 - Math.floor(b8));
    const front = Math.max(0, burst) * 1.5 + 0.4;
    const ms = this.ms, P = this.P5;
    for (let i = 0; i < this.mn; i++) {
      const bd = this.mb[i]!;
      if (bd > front) continue;
      const o = i * 6;
      if (!this.clipSeg(cam, ms[o]!, ms[o + 1]!, ms[o + 2]!, ms[o + 3]!, ms[o + 4]!, ms[o + 5]!, P)) continue;
      const [ax, ay] = this.warp(P[0]!, P[1]!, t, warpA);
      const [bx, by] = this.warp(P[2]!, P[3]!, t, warpA);
      const tip = Math.exp(-(front - bd) / 0.3);
      const fr = this.front(ms[o]!, ms[o + 1]!, ms[o + 2]!);
      (fr ? this.inkF : this.ink).seg2(ax, ay, bx, by, 0.9, mix3(mul(LIN.bone, 0.62), mul(LIN.acid, 0.95), 0.15 + 0.85 * tip), 0.8);
      if (tip > 0.25) (fr ? this.glowF : this.glow).seg2(ax, ay, bx, by, 1.8, mul(LIN.acid, 0.7 * tip), 0.8);
    }
  }

  private drawShrooms(cam: Cam, t: number, warpA: number) {
    const au = this.ctx.audio;
    const b0 = au.beatAt(this.tShrooms - 0.25);
    const P = [0, 0];
    this.shrooms.forEach((m, i) => {
      const tb = au.timeOfBeat(b0 + Math.floor(i / 2) / 4 + (i % 2) * 0.06);
      if (t < tb) return;
      const g = springStep(t - tb, 3.2, 0.32);
      const pp = this.proj(cam, m.x, 0, m.z);
      if (!pp) return;
      const s = (cam.f / Math.max(0.2, this.depth(cam, m.x, 0, m.z))) * m.s * g;
      if (s < 1) return;
      [P[0], P[1]] = this.warp(pp[0], pp[1], t, warpA);
      const x = P[0]!, y = P[1]!;
      // mushrooms grow "up" in screen space along the camera's up vector (the room rolls)
      const upx = -Math.sin(Math.atan2(cam.R[1], cam.U[1])), upy = -Math.cos(Math.atan2(cam.R[1], cam.U[1]));
      const wob = Math.sin(t * 7 + m.seed * 10) * 0.12 + m.lean;
      const dirx = upx * Math.cos(wob) - upy * Math.sin(wob), diry = upx * Math.sin(wob) + upy * Math.cos(wob);
      const topX = x + dirx * s * 0.9, topY = y + diry * s * 0.9;
      const nx = -diry, ny = dirx; // across
      const col = mul(LIN.bone, 0.85), acid = mul(LIN.acid, 0.95);
      const ink = this.batch('i', m.x, 0, m.z), glow = this.batch('g', m.x, 0, m.z);
      ink.seg2(x - nx * s * 0.08, y - ny * s * 0.08, topX - nx * s * 0.07, topY - ny * s * 0.07, 1.1, col, 1);
      ink.seg2(x + nx * s * 0.08, y + ny * s * 0.08, topX + nx * s * 0.07, topY + ny * s * 0.07, 1.1, col, 1);
      const cw = s * 0.62, chh = s * 0.42;
      const n = 12;
      let px = topX - nx * cw, py = topY - ny * cw;
      for (let k = 1; k <= n; k++) {
        const a = Math.PI - (k / n) * Math.PI;
        const qx = topX + nx * Math.cos(a) * cw + dirx * Math.sin(a) * chh, qy = topY + ny * Math.cos(a) * cw + diry * Math.sin(a) * chh;
        ink.seg2(px, py, qx, qy, 1.3, acid, 1);
        px = qx; py = qy;
      }
      ink.seg2(topX - nx * cw, topY - ny * cw, topX + nx * cw, topY + ny * cw, 1, col, 0.9);
      for (let k = 1; k < 6; k++) {
        const o = -cw + (2 * cw * k) / 6;
        ink.seg2(topX + nx * o, topY + ny * o, topX + nx * o * 0.3 - dirx * s * 0.08, topY + ny * o * 0.3 - diry * s * 0.08, 1, col, 0.5);
      }
      const sx = topX - nx * cw * 0.3 + dirx * chh * 0.55, sy = topY - ny * cw * 0.3 + diry * chh * 0.55;
      glow.seg2(sx, sy, sx + 0.01, sy, Math.max(1.5, s * 0.07), mul(LIN.acid, 0.6), 0.8);
    });
  }

  private drawBag(cam: Cam, t: number, warpA: number) {
    const d = DESK;
    const fallT = this.tLand - this.tBag;
    let y: number;
    if (t < this.tLand) { const u = (t - this.tBag) / fallT; y = d.h + (RH + 1.5 - d.h) * (1 - u * u); }
    else { const a = t - this.tLand; y = d.h + 0.18 * Math.abs(Math.sin(a * 14)) * Math.exp(-a * 9); }
    const squash = t >= this.tLand ? 1 - 0.18 * pulse(t, this.tLand, 0.06) : 1.06;
    const bx = 0.25, bz = (d.z0 + d.z1) / 2;
    const w = 0.46, dp = 0.3, h = 0.58 * squash;
    const col = mul(LIN.bone, 0.9);
    const L = (a: V3, b: V3, wd = 1.4) => this.seg3('i', cam, a, b, wd, col, 1, t, warpA);
    const x0 = bx - w / 2, x1 = bx + w / 2, z0 = bz - dp / 2, z1 = bz + dp / 2;
    const fl = 0.025;
    const yt = y + h;
    L([x0, y, z1], [x1, y, z1]); L([x0, y, z1], [x0 - fl, yt, z1]); L([x1, y, z1], [x1 + fl, yt, z1]);
    L([x1, y, z1], [x1, y, z0], 1.1); L([x1 + fl, yt, z0], [x1, y, z0], 1.1);
    L([x0, y, z1], [x0, y, z0], 1.1); L([x0 - fl, yt, z0], [x0, y, z0], 1.1);
    L([x0 - fl * 0.5, y + h * 0.08, (z0 + z1) / 2], [x0 - fl * 0.8, yt - 0.07, (z0 + z1) / 2], 1);
    L([x0, y, z1], [x0 - fl * 0.5, y + h * 0.08, (z0 + z1) / 2], 1); L([x0, y, z0], [x0 - fl * 0.5, y + h * 0.08, (z0 + z1) / 2], 1);
    for (let k = 1; k < 7; k++) { const zz = z1 + (z0 - z1) * (k / 7); L([x0 - 0.002, y + 0.02, zz], [x0 - fl * 0.9, yt - 0.09, zz], 0.9); }
    L([x0 - fl, yt - 0.07, z1], [x1 + fl, yt - 0.07, z1], 1.2); L([x0 - fl, yt, z1], [x1 + fl, yt, z1], 1.2);
    L([x0 - fl, yt - 0.07, z1], [x0 - fl, yt - 0.07, z0], 1); L([x1 + fl, yt - 0.07, z1], [x1 + fl, yt - 0.07, z0], 1);
    L([x0 - fl, yt, z0], [x1 + fl, yt, z0], 1);
    const zz = 9;
    for (let i = 0; i < zz; i++) {
      const u0 = i / zz, u1 = (i + 1) / zz;
      const X0 = x0 - fl + (w + 2 * fl) * u0, X1 = x0 - fl + (w + 2 * fl) * u1;
      L([X0, yt + (i % 2 ? 0.035 : 0), z1], [X1, yt + ((i + 1) % 2 ? 0.035 : 0), z1], 1);
    }
    const lx = bx, ly = y + h * 0.42;
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * TAU, a1 = ((k + 1) / 12) * TAU;
      L([lx + Math.cos(a0) * 0.07, ly + Math.sin(a0) * 0.07, z1 + 0.001], [lx + Math.cos(a1) * 0.07, ly + Math.sin(a1) * 0.07, z1 + 0.001], 1);
    }
    if (t > this.tLand) {
      for (let i = 0; i < 48; i++) {
        const born = this.tLand + (i / 48) * 1.6;
        const age = t - born;
        if (age < 0 || age > 1.1) continue;
        const sx = bx + Math.sin(i * 12.9898) * 0.5 * w * 0.8 + Math.sin(age * 4 + i) * 0.04;
        const sy = yt + age * (0.5 + 0.4 * Math.abs(Math.sin(i * 3.7))), sz = bz + Math.sin(i * 78.233) * 0.08;
        const pp = this.proj(cam, sx, sy, sz);
        if (!pp) continue;
        const [px, py] = this.warp(pp[0], pp[1], t, warpA);
        const k = 1 - age / 1.1;
        this.batch('g', sx, sy, sz).seg2(px, py, px + 0.01, py, 3.5 * k + 1, mul(LIN.acid, 0.9 * k), 0.9);
      }
    }
    const tp = this.proj(cam, x1 + fl, y + h * 0.75, z1);
    this.bagTag = tp ? { x: tp[0], y: tp[1] } : null;
  }

  /** Hot splinters thrown off each stamp, in the board's plane. */
  private drawStampDust(cam: Cam, t: number, warpA: number) {
    const bp = this.boardPose(t);
    const rows = [...this.rowsA.map((r) => ({ r, side: 1 })), ...this.rowsB.map((r) => ({ r, side: -1 }))];
    for (const { r, side } of rows) {
      r.words.forEach((w, wi) => {
        const age = t - w.start;
        if (age < 0 || age > 0.28) return;
        const gl = r.glyphs.filter((g) => g.wi === wi);
        if (!gl.length) return;
        const u0 = r.x0 + gl[0]!.x * r.m, u1 = r.x0 + (gl[gl.length - 1]!.x + gl[gl.length - 1]!.w) * r.m;
        const v0 = r.base - r.cap, v1 = r.base;
        const uy = vsc(bp.uyA, side);
        const at = (uu: number, vv: number): V3 => vadd(vadd(bp.O, [uu, 0, 0]), vsc(uy, vv));
        const acid = r.fam === SHROOMS_FAM() && wi === r.words.length - 1 && r === this.rowsB[1];
        for (let k = 0; k < 22; k++) {
          const h1 = hash(w.start * 100, k), h2 = hash(k, w.start * 100 + 1);
          const onTop = k % 2 === 0;
          const uu = lerp(u0, u1, h1), vv = onTop ? v0 - 0.02 : v1 + 0.03;
          const dir = onTop ? -1 : 1;
          const len = (0.1 + 0.25 * h2) * ease.outCubic(clamp(age / 0.18));
          const s0 = 0.05 + len * 0.4;
          const a = at(uu + (h1 - 0.5) * 0.3 * len, vv + dir * s0), b = at(uu + (h1 - 0.5) * 0.5 * len, vv + dir * (s0 + len));
          const kk = 1 - age / 0.28;
          this.seg3('gF', cam, a, b, 1.6, mul(acid ? LIN.acid : mix3(LIN.signal, WHITE, kk * kk), 1.6 * kk), 1, t, warpA);
        }
      });
    }
  }

  // ------------------------------------------------------------------ paper: labels, cards, the board
  private drawPaper(c: CanvasRenderingContext2D, c2: CanvasRenderingContext2D, cam: Cam, t: number, warpA: number) {
    type Item = { z: number; draw: (c: CanvasRenderingContext2D) => void; front?: boolean };
    const items: Item[] = [];
    // back wall labels
    const wallUx: V3 = [1, 0, 0], wallUy: V3 = [0, -1, 0];
    const label = (x: number, y: number, txt: string, fam: string, sizeM: number, fill: string, arrowDown = false) => {
      const P: V3 = [x, y, -RD + 0.01];
      items.push({ z: this.depth(cam, P[0], P[1], P[2]), draw: (c) => {
        const m = sizeM / 20;
        c.font = font(fam, 20);
        const wpx = c.measureText(txt).width;
        const A = this.planeAffine(cam, P, wallUx, wallUy, m, wpx / 2, -7, 1, t, warpA);
        if (!A) return;
        c.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
        c.fillStyle = fill;
        c.fillText(txt, 0, 0);
        if (arrowDown) {
          // ▾ (not in Plex Mono): a small triangle drawn in the label's last (blank) cell
          const cx = wpx - wpx / Array.from(txt).length / 2;
          c.beginPath(); c.moveTo(cx - 3.9, -9.6); c.lineTo(cx + 3.9, -9.6); c.lineTo(cx, -1.6); c.closePath(); c.fill();
        }
      } });
    };
    label(0, 2.1, 'OUT  ', F.mono(500), 0.075, rgba('bone', 0.65), true);
    label(2.0, 2.24, 'EXIT', F.mono(500), 0.075, rgba('bone', 0.65));
    label(2.0, 2.155, '(DECORATIVE)', F.mono(500), 0.06, rgba('signal', 0.85));
    // cards
    for (const cd of this.cards) {
      const pose = this.cardPose(cd, t);
      if (!pose) continue;
      items.push({ z: this.depth(cam, pose.p[0], pose.p[1], pose.p[2]), draw: (c) => this.drawCard(c, cam, t, warpA, pose), front: this.front(pose.p[0], pose.p[1], pose.p[2]) });
    }
    // the board
    const bp = this.boardPose(t);
    items.sort((a, b) => b.z - a.z);
    c.save();
    for (const it of items) if (!it.front) it.draw(c);
    this.drawBoard(c, cam, t, warpA, bp);
    c.restore();
    c2.save();
    for (const it of items) if (it.front) it.draw(c2);
    c2.restore();
  }

  private cardPose(cd: CardDef, t: number): { p: V3; lx: V3; ly: V3 } | null {
    const tau = t - cd.t;
    if (tau < 0) return null;
    const S0: V3 = [SLOT.x + (cd.seed - 0.5) * 0.5, SLOT.y, SLOT.z + 0.12];
    const g = 9.8;
    const tl = (cd.v[1] + Math.sqrt(cd.v[1] ** 2 + 2 * g * (S0[1] - 0.004))) / g;
    const tf = Math.min(tau, tl);
    let p: V3 = [S0[0] + cd.v[0] * tf, S0[1] + cd.v[1] * tf - 0.5 * g * tf * tf, S0[2] + cd.v[2] * tf];
    if (tau > tl) {
      const s = (1 - Math.exp(-(tau - tl) * 7)) / 7;
      p = [p[0] + cd.v[0] * s * 0.6, 0.004 + 0.002 * cd.seed, p[2] + cd.v[2] * s * 0.6];
    }
    const angEnd = Math.round((cd.w * tl) / Math.PI) * Math.PI;
    const ang = lerp(cd.w * tf, angEnd, smoothstep(tl - 0.12, tl, tf));
    const yaw = cd.yaw * Math.min(1, tf / tl);
    let lx: V3 = [1, 0, 0], ly: V3 = [0, 0, 1];
    lx = vrot(vrot(lx, cd.axis, ang), [0, 1, 0], yaw);
    ly = vrot(vrot(ly, cd.axis, ang), [0, 1, 0], yaw);
    // emerging from the slot: the first 60 ms it slides out flat
    if (tau < 0.06) p = vadd(p, [0, 0, -0.18 * (1 - tau / 0.06)]);
    return { p, lx, ly };
  }

  private drawCard(c: CanvasRenderingContext2D, cam: Cam, t: number, warpA: number, pose: { p: V3; lx: V3; ly: V3 }) {
    const m = 0.0026; // card: 100 x 138 canvas px = 0.26 x 0.36 m
    const A = this.planeAffine(cam, pose.p, pose.lx, pose.ly, m, 0, 0, 1, t, warpA);
    if (!A) return;
    const n = vcross(pose.ly, pose.lx);
    const front = vdot(n, vsub(cam.p, pose.p)) > 0;
    // never let a card swallow the lens
    const near = smoothstep(0.45, 1.2, this.depth(cam, pose.p[0], pose.p[1], pose.p[2]));
    if (near <= 0) return;
    c.globalAlpha = near;
    c.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
    c.fillStyle = front ? rgba('bone', 0.97) : rgba('ash', 0.95);
    c.fillRect(-50, -69, 100, 138);
    c.strokeStyle = rgba('ink', 0.45); c.lineWidth = 0.8;
    c.strokeRect(-46, -65, 92, 130);
    if (!front) { c.globalAlpha = 1; return; }
    c.fillStyle = rgba('ink', 0.35);
    for (let i = 0; i < 18; i++) c.fillRect(-45 + i * 5, -60, 2.2, 1);
    c.fillStyle = rgba('ink', 1);
    c.textAlign = 'center';
    c.font = `600 30px ${CJK}`;
    c.fillText('我不懂', 0, -8);
    c.font = font(F.mono(400), 7);
    c.fillStyle = rgba('ink', 0.85);
    c.fillText('(i don’t understand)', 0, 10);
    c.font = font(F.mono(400), 5);
    c.fillStyle = rgba('ink', 0.5);
    c.fillText('RULE 4.2.1 · OUTPUT OK', 0, 40);
    c.fillText(`P(DOOM) ${formatPDoom(this.pdoom.value(t))} · ALSO ???`, 0, 48);
    c.textAlign = 'left';
    c.globalAlpha = 1;
  }

  private drawBoard(c: CanvasRenderingContext2D, cam: Cam, t: number, warpA: number, bp: BoardPose) {
    const toCam = vsub(cam.p, bp.O);
    const sideA = vdot(bp.nA, toCam) > 0;
    const uy = sideA ? bp.uyA : vsc(bp.uyA, -1);
    const n = sideA ? bp.nA : vsc(bp.nA, -1);
    const ux: V3 = [1, 0, 0];
    const at = (u: number, v: number): V3 => vadd(vadd(bp.O, [u, 0, 0]), vsc(uy, v));
    // panel
    const corners = [at(BOARD.x0, -BOARD.hh), at(BOARD.x1, -BOARD.hh), at(BOARD.x1, BOARD.hh), at(BOARD.x0, BOARD.hh)];
    const pc = corners.map((p) => { const q = this.proj(cam, p[0], p[1], p[2]); return q ? this.warp(q[0], q[1], t, warpA) : null; });
    if (pc.some((q) => !q)) return;
    let stampK = 0;
    for (const s of this.stamps) if (t >= s) stampK = Math.max(stampK, pulse(t, s, 0.08));
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath();
    pc.forEach((q, i) => (i ? c.lineTo(q![0], q![1]) : c.moveTo(q![0], q![1])));
    c.closePath();
    c.fillStyle = rgba('ink', 0.985);
    c.fill();
    c.strokeStyle = rgba('bone', 0.8 + 0.2 * stampK); c.lineWidth = 1.4 + 1.2 * stampK;
    c.stroke();
    // guide rules under the rows + footnote
    const rows = sideA ? this.rowsA : this.rowsB;
    c.lineWidth = 1;
    for (const r of rows) {
      const a = this.proj(cam, ...at(BOARD.x0 + 0.12, r.base + 0.05)), b = this.proj(cam, ...at(BOARD.x1 - 0.12, r.base + 0.05));
      if (!a || !b) continue;
      const [ax, ay] = this.warp(a[0], a[1], t, warpA), [bx, by] = this.warp(b[0], b[1], t, warpA);
      c.strokeStyle = rgba('ash', 0.22);
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    }
    const foot = sideA ? 'NO UNDERSTANDING ON THE PREMISES *' : '* CONTENTS NOT COVERED BY THE RULEBOOK';
    {
      c.font = font(F.mono(400), 20);
      const wpx = c.measureText(foot).width;
      const A = this.planeAffine(cam, at(0, BOARD.hh - 0.07), ux, uy, 0.055 / 20, wpx / 2, -7, 1, t, warpA);
      if (A) { c.setTransform(A.a, A.b, A.c, A.d, A.e, A.f); c.fillStyle = rgba('ash', 0.8); c.fillText(foot, 0, 0); }
    }
    // stamped glyphs
    for (const r of rows) {
      c.font = font(r.fam, S_PX);
      const capPx = this.capK * S_PX;
      const escaping = r === this.rowsB[1];
      for (const g of r.glyphs) {
        const w = r.words[g.wi]!;
        if (t < w.start) continue;
        if (escaping && t >= this.tEsc) continue; // drawn by drawShroomsWord
        const age = t - w.start;
        const e = ease.outExpo(clamp(age / 0.12));
        const lift = 0.45 * (1 - e);
        const gu = r.x0 + (g.x + g.w / 2) * r.m, gv = r.base - r.cap / 2;
        const P = vadd(at(gu, gv), vsc(n, lift));
        const A = this.planeAffine(cam, P, ux, uy, r.m, g.w / 2, -capPx / 2, 1 + 0.7 * (1 - e), t, warpA);
        if (!A) continue;
        c.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
        const hot = Math.exp(-age / 0.05);
        const cool = prog(t, w.end - 0.04, w.end + 0.2);
        c.globalAlpha = clamp(age / 0.025);
        c.fillStyle = escaping ? rgba('acid') : hot > 0.3 ? rgba('ember') : cool < 1 ? mixCss('signal', 'bone', cool) : rgba('bone', 0.96);
        c.fillText(g.ch, 0, 0);
        c.globalAlpha = 1;
      }
    }
  }

  /** "SHROOMS" tears off the board and ends in the fixed screen layout the shoggoth plate continues. */
  private drawShroomsWord(c: CanvasRenderingContext2D, t: number) {
    if (t < this.tEsc) return;
    const r = this.rowsB[1]!;
    const capPx = this.capK * S_PX;
    c.font = font(r.fam, S_PX);
    for (let e = 3; e >= 0; e--) {
      const te = t - e * 0.045;
      if (te < this.tEsc) continue;
      const cam = this.camAt(te);
      const warpA = this.warpAmp(te);
      const bp = this.boardPose(te);
      const sideA = vdot(bp.nA, vsub(cam.p, bp.O)) > 0;
      const uy = sideA ? bp.uyA : vsc(bp.uyA, -1);
      const k = ease.inOutCubic(prog(te, this.tEsc, this.tEnd));
      r.glyphs.forEach((g, i) => {
        const gu = r.x0 + (g.x + g.w / 2) * r.m, gv = r.base - r.cap / 2;
        const P = vadd(vadd(bp.O, [gu, 0, 0]), vsc(uy, gv));
        const A0 = this.planeAffine(cam, P, [1, 0, 0], uy, r.m, g.w / 2, -capPx / 2, 1, te, warpA);
        const A1: Affine = shroomsAffine(te, i, 1, g.w, capPx, 0.35 + 0.65 * k);
        const A = A0 ? lerpAff(A0, A1, k) : A1;
        c.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
        c.globalAlpha = e === 0 ? 1 : 0.32 * Math.pow(0.6, e - 1) * k;
        c.fillStyle = e === 0 ? rgba('acid') : e === 1 ? rgba('acid') : rgba('signal');
        c.fillText(g.ch, 0, 0);
      });
    }
    c.globalAlpha = 1;
  }

  private drawBagTag(c: CanvasRenderingContext2D, t: number) {
    if (!this.bagTag || t < this.tLand) return;
    const { x: bx, y: by } = this.bagTag;
    const a = prog(t, this.tLand, this.tLand + 0.15) * (1 - prog(t, this.tEsc, this.tEsc + 0.2));
    if (a <= 0) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.save();
    c.globalAlpha = a;
    c.strokeStyle = rgba('bone', 0.7); c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 60, by - 40); c.lineTo(bx + 240, by - 40); c.stroke();
    c.font = font(F.mono(500), 13);
    c.fillStyle = rgba('bone', 0.9);
    c.fillText('BAG (1)', bx + 66, by - 48);
    c.font = font(F.mono(400), 11);
    c.fillStyle = rgba('acid', 0.9);
    c.fillText('CONTENTS: FUNGAL', bx + 66, by - 24);
    c.restore();
  }
}

function lerpAff(p: Affine, q: Affine, k: number): Affine {
  return { a: lerp(p.a, q.a, k), b: lerp(p.b, q.b, k), c: lerp(p.c, q.c, k), d: lerp(p.d, q.d, k), e: lerp(p.e, q.e, k), f: lerp(p.f, q.f, k) };
}
function mixCss(a: string, b: string, k: number) {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgb(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')})`;
}
