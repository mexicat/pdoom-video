// DNA edition, `dense` slot (115.232–124.322): the bridge, part 2.
//   “Post-Chinchilla, super-dense”: stack's loops were these cells' outlines; now they are cells. The
//      field grows and divides on the beat, consuming the ink; the sung words press the cells aside.
//   “Breaking through each safety fence”: a hard reframe onto the hatched basement membrane the
//      epithelium crowds against; on "fence" three cells squeeze through it (`local invasion · schematic`,
//      not metastasis).
//   “Hundred thousand GPU”: hard zoom-outs on the beats while another round of divisions lands: the
//      field repeats outward (the lyric stays lyric; no count is ever labelled).
//   “RLHF goes askew”: a close-up on one cell: a stylized inhibitory signal docks on its receptor and
//      the relay fires, but the downstream arrow is askew and its inhibition bar misses the nucleus,
//      so nothing changes (`growth control disrupted`); the cell divides anyway. Pull back: the field is
//      confluent, the negative space has gone to paper, and one cell boundary widens into the circle that
//      hook4's P(DOOM) will frame as its counter. The field is hook4's, cell for cell.
// Pure function of song time (the division tree and every trajectory are built in init).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, makeRT } from '../engine/gl';
import { F, font, glyphX } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, lerp, ease, prog, smoothstep, window01, pulse } from '../engine/util';
import { karaokeRow, monoLabel, findWord, makeBackdrop, rgba, sungChars } from './dna-kit';
import { CellField, fieldSchedule, hook4Field, MEMBRANE_Y, type CellNode } from './dna-dense-field';
import { CellLayer, nucleusParams, nodePos, type CellDraw, type NucParams } from './dna-dense-cells';
import { ROW1, ROW2 } from './dna-dense-type';

type Pt = { x: number; y: number };
interface Cam2 { x: number; y: number; z: number; rot: number }
interface RowDef { ws: Word[]; x: number; y: number; fam: string; size: number; desc: boolean; line: Line; lead?: number }
interface Invader { node: CellNode; p0: Pt; p1: Pt; t0: number; t1: number }

const HOOK_RING = { x: 872, y: 560, r: 88 }; // fallback if hook4's type module can't be read

export default class DnaDense extends Scene {
  paperRT = makeRT();
  paperSrc = (() => { const b = makeBackdrop(); b.u.uPaper!.value = 1; b.u.uPool!.value = 0; return b; })();
  paperDone = false;
  bg = new FSPass(/* glsl */ `
    uniform vec4 uCam; uniform float uBone; uniform sampler2D uPaper; uniform float uYm;
    uniform vec4 uHoleX; uniform vec4 uHoleW; uniform float uMemA;
    float sdBand(float y, float c, float hw) { return abs(y - c) - hw; }
    void main() {
      vec2 sp = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
      vec2 d = (sp - vec2(960.0, 540.0)) / uCam.z;
      float c = cos(-uCam.w), s = sin(-uCam.w);
      vec2 p = uCam.xy + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
      vec2 pp = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 ink = C_INK + C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, length(pp)));
      vec3 col = mix(ink, texture(uPaper, vUv).rgb, uBone);
      float aa = 1.0 / uCam.z;
      // the stroma under the membrane: sparse engraved fibres
      if (p.y > uYm + 8.0) {
        float w = p.y + 14.0 * snoise(vec2(p.x * 0.004, p.y * 0.01)) + 6.0 * snoise(vec2(p.x * 0.02, 3.0));
        float fib = hatch(w / 11.0, 0.08) * smoothstep(0.1, 0.6, snoise(vec2(p.x * 0.006, w * 0.03)));
        col = mix(col, C_ASH * 0.55, fib * 0.55 * uMemA * (1.0 - uBone));
      }
      // the basement membrane: a hatched band (the "fence"), torn where cells have crossed it
      float hole = 1.0;
      for (int i = 0; i < 4; i++) {
        float hx = uHoleX[i], hw = uHoleW[i];
        if (hw > 0.1) {
          float rag = hw * (1.0 + 0.25 * snoise(vec2(p.y * 0.3, hx)));
          hole *= smoothstep(rag - 2.0 * aa, rag + 2.0 * aa, abs(p.x - hx));
        }
      }
      float band = 1.0 - smoothstep(-aa, aa, sdBand(p.y, uYm, 7.0));
      float hl = hatch((p.x + p.y) / 3.4, 0.4);
      float edge = max(1.0 - smoothstep(0.6 * aa, 1.6 * aa, abs(p.y - uYm + 7.0)), 1.0 - smoothstep(0.6 * aa, 1.6 * aa, abs(p.y - uYm - 7.0)));
      col = mix(col, C_BONE * 0.82, band * max(hl * 0.8, edge) * hole * uMemA);
      fragColor = vec4(col, 1.0);
    }`, {
    uCam: { value: new THREE.Vector4(960, 540, 1, 0) }, uBone: { value: 0 }, uPaper: { value: null }, uYm: { value: MEMBRANE_Y },
    uHoleX: { value: new THREE.Vector4() }, uHoleW: { value: new THREE.Vector4() }, uMemA: { value: 1 },
  });
  cells!: CellLayer;
  text = new Layer2D();
  field!: CellField;
  nuc: NucParams[] = [];
  fill: (t: number) => number = () => 1;
  h4Tex!: THREE.CanvasTexture;
  ring = { ...HOOK_RING };

  // timing
  t0 = 0; tEnd = 0; c2 = 0; c3 = 0; c4 = 0; tFence = 0; tGoes = 0; tAskew = 0; tPB = 0; tPE = 0; tDown = 0;
  zSteps: number[] = []; kicks: number[] = [];
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  rows: RowDef[] = [];
  invaders: Invader[] = [];
  X!: CellNode; ringLeaf!: CellNode;
  /** The diagram's centre (world): between the receptor and the nucleus. */
  dgC: Pt = { x: 0, y: 0 };

  override async init() {
    const { audio: au, lyrics: ly } = this.ctx;
    this.t0 = this.ctx.start; this.tEnd = this.ctx.end;
    this.L1 = ly.get('Post-Chinchilla'); this.L2 = ly.get('safety fence'); this.L3 = ly.get('Hundred thousand'); this.L4 = ly.get('RLHF');
    const beatAfter = (t: number) => au.timeOfBeat(Math.ceil(au.beatAt(t) - 0.12));
    this.c2 = beatAfter(this.L2.words[0]!.start);
    this.c3 = beatAfter(this.L3.words[0]!.start);
    this.c4 = au.timeOfBeat(Math.floor(au.beatAt(this.L4.words[0]!.start)));
    this.tFence = findWord(this.L2, 'fence').start;
    this.tGoes = findWord(this.L4, 'goes').start;
    this.tAskew = findWord(this.L4, 'askew').start;
    this.tDown = au.downbeats.find((d) => d > this.tAskew + 1.5) ?? this.tEnd - 0.45;
    this.tPB = au.timeOfBeat(Math.round(au.beatAt(this.tDown)) - 1);
    this.tPE = this.tDown - 0.05;
    const b3 = Math.round(au.beatAt(this.c3));
    this.zSteps = [0, 1, 2, 3].map((k) => au.timeOfBeat(b3 + k));
    this.kicks = au.events('kick', this.t0 - 0.1, this.tEnd + 0.1).map((e) => e[0]);

    const sch = fieldSchedule(au, ly);
    this.fill = sch.fill;
    this.field = new CellField(sch.rounds);
    this.nuc = nucleusParams(this.field);
    const h4 = hook4Field();
    const cv = h4.draw();
    this.h4Tex = new THREE.CanvasTexture(cv);
    this.h4Tex.colorSpace = THREE.SRGBColorSpace; this.h4Tex.minFilter = THREE.LinearFilter; this.h4Tex.generateMipmaps = false;
    this.cells = new CellLayer(4200, this.paperRT.texture);
    this.bg.u.uPaper!.value = this.paperRT.texture;
    await this.findRing();
    this.pickCells(sch.rounds);
    this.layoutRows();
    { const X = this.X, np = this.nuc[X.id]!, r = X.rho * this.fill(this.c4 + 0.5), th = -2.35;
      const mem = { x: Math.cos(th) * r * 0.9, y: Math.sin(th) * r * 0.9 }, nuc = { x: np.ox * X.rho, y: np.oy * X.rho };
      this.dgC = { x: X.x + (mem.x + nuc.x) / 2 + 6, y: X.y + (mem.y + nuc.y) / 2 + 10 }; }
  }

  /** hook4's P(DOOM) counter (its first O), measured the way dna-hook-cells.ts measures it. */
  private async findRing() {
    try {
      const m = await import('./dna-hook-type');
      const mw = W - 2 * m.SAFE - 80, mc = H - 2 * m.SAFE - 60;
      const s = m.fitPD(mw, mc, { weight: 700, widths: [112.5] });
      const x0 = (W - s.width) / 2, base = H / 2 + s.cap / 2;
      const path = m.settingPath(s, x0, base);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d', { willReadFrequently: true })!;
      c.fillStyle = '#fff'; c.fill(path);
      const d = c.getImageData(0, 0, W, H).data;
      const ink = (x: number, y: number) => d[(Math.round(y) * W + Math.round(x)) * 4 + 3]! > 128;
      let cx = x0 + (s.charX[3]! + s.charX[4]!) / 2, cy = base - s.cap / 2;
      const reach = (dx: number, dy: number) => { let r = 0; while (r < 400 && !ink(cx + dx * r, cy + dy * r)) r++; return r; };
      const l = reach(-1, 0), rr = reach(1, 0), u = reach(0, -1), dn = reach(0, 1);
      cx += (rr - l) / 2; cy += (dn - u) / 2;
      this.ring = { x: cx, y: cy, r: Math.min(l + rr, u + dn) / 2 };
    } catch { this.ring = { ...HOOK_RING }; }
  }

  /** The invaders (at the membrane, in the reframed view) and the close-up cell X. */
  private pickCells(rounds: number[][]) {
    const F = this.field, nodes = F.nodes;
    // the close-up cell: the level-3 ancestor of the leaf nearest the ring's centre; it divides late
    let leaf = nodes[0]!, bd = Infinity;
    for (const n of nodes) if (n.level === 4) { const d = Math.hypot(n.x - this.ring.x, n.y - this.ring.y); if (d < bd) { bd = d; leaf = n; } }
    this.ringLeaf = leaf;
    let X = leaf;
    while (X.level > 3 && X.parent >= 0) X = nodes[X.parent]!;
    this.X = X;
    if (X.kids.length === 2) {
      X.tDiv = rounds[3]![2] ?? X.tDiv;
      for (const k of X.kids) nodes[k]!.tBirth = X.tDiv;
    }
    // invaders: level-2 cells born on round 1's first beat, nearest the membrane in the reframed view
    const r1 = rounds[1]![0]!;
    const cand = nodes.filter((n) => n.level === 2 && n.parent >= 0 && nodes[n.parent]!.kids.length === 2 && n.x > 860 && n.x < 1320);
    cand.sort((a, b) => b.y - a.y);
    const picks: CellNode[] = [];
    for (const n of cand) { if (picks.every((p) => Math.abs(p.x - n.x) > 110)) picks.push(n); if (picks.length === 3) break; }
    picks.forEach((n, k) => {
      const P = nodes[n.parent]!;
      P.tDiv = r1; for (const kk of P.kids) nodes[kk]!.tBirth = r1;
      n.tDiv = Infinity; // it leaves; its would-be descendants lie off hook4's frame
      const t0 = this.tFence - 0.42 + 0.12 * k, t1 = this.tFence + 0.3 + 0.1 * k;
      this.invaders.push({ node: n, p0: { x: n.x, y: n.y }, p1: { x: n.x + (k - 1) * 26, y: MEMBRANE_Y + 64 + 22 * (k % 2) }, t0, t1 });
    });
  }

  private layoutRows() {
    const L1 = this.L1, L2 = this.L2, L3 = this.L3, L4 = this.L4;
    this.rows = [
      { ws: L1.words.slice(0, 1), x: ROW1.x, y: ROW1.y, fam: ROW1.fam, size: ROW1.size, desc: false, line: L1 },
      { ws: L1.words.slice(1), x: ROW2.x, y: ROW2.y, fam: ROW2.fam, size: ROW2.size, desc: false, line: L1 },
      { ws: L2.words.slice(0, 3), x: 108, y: 190, fam: F.archivo(100, 700), size: 72, desc: true, line: L2 },
      { ws: L2.words.slice(3), x: 100, y: 344, fam: F.archivo(112.5, 900), size: 150, desc: true, line: L2 },
      { ws: L3.words.slice(0, 2), x: 108, y: 560, fam: F.archivo(100, 700), size: 92, desc: false, line: L3 },
      { ws: L3.words.slice(2), x: 96, y: 770, fam: F.archivo(125, 900), size: 230, desc: false, line: L3 },
      // hook4's carry row (same place, face and size), so the line crosses the cut unchanged
      { ws: L4.words, x: 108, y: 960, fam: F.archivo(100, 800), size: 92, desc: false, line: L4 },
    ];
  }

  // ------------------------------------------------------------------ camera
  private camAt(t: number): Cam2 {
    if (t < this.c2) return { x: 960, y: 540, z: 1 + 0.05 * ease.inOutQuad(prog(t, this.t0, this.c2)), rot: 0 };
    if (t < this.c3) { const u = prog(t, this.c2, this.c3); return { x: 1030 - 20 * u, y: 1150, z: 1.52 + 0.08 * u, rot: -0.035 }; }
    if (t < this.c4) {
      const zs = [1.0, 0.74, 0.54, 0.4];
      let k = 0; for (let i = 0; i < 4; i++) if (t >= this.zSteps[i]! - 1e-4) k = i;
      const u = prog(t, this.zSteps[k]!, this.zSteps[k]! + 0.45);
      return { x: 960, y: 470, z: zs[k]! * (1 + 0.025 * u), rot: 0 };
    }
    // P4: the close-up on X, then the pull back to hook4's framing
    const Z = 8.4, cx = this.dgC.x, cy = this.dgC.y;
    const drift = prog(t, this.c4, this.tPB);
    const c0: Cam2 = { x: cx - 10 * drift, y: cy + 4 * drift, z: Z * (1 + 0.04 * drift), rot: 0.02 };
    if (t < this.tPB) return c0;
    const e = ease.inOutCubic(prog(t, this.tPB, this.tPE));
    return { x: lerp(c0.x, 960, e), y: lerp(c0.y, 540, e), z: Math.exp(lerp(Math.log(c0.z), 0, e)), rot: lerp(c0.rot, 0, e) };
  }
  private toScreen(cam: Cam2, x: number, y: number): Pt {
    const dx = x - cam.x, dy = y - cam.y, c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    return { x: 960 + cam.z * (c * dx - s * dy), y: 540 + cam.z * (s * dx + c * dy) };
  }

  // ------------------------------------------------------------------ the field at t
  private cellsAt(t: number, cam: Cam2, slots: { x: number; y: number; hx: number; hy: number }[]): CellDraw[] {
    const out: CellDraw[] = [];
    // the slots in world units (the camera's small rotations are ignored here)
    const c0 = Math.cos(-cam.rot), s0 = Math.sin(-cam.rot);
    const wb = slots.map((b) => {
      const dx = (b.x - 960) / cam.z, dy = (b.y - 540) / cam.z;
      return { x: cam.x + c0 * dx - s0 * dy, y: cam.y + s0 * dx + c0 * dy, hx: (b.hx + 20) / cam.z, hy: (b.hy + 20) / cam.z };
    });
    const f = this.fill(t);
    const inv = new Map(this.invaders.map((v) => [v.node.id, v]));
    for (const n of this.field.nodes) {
      if (!(t >= n.tBirth && t < n.tDiv)) continue;
      const p = nodePos(this.field, n, t);
      const c: CellDraw = { node: n, x: p.x, y: p.y, r: n.rho * f };
      const v = inv.get(n.id);
      if (v) {
        const e = ease.inOutCubic(prog(t, v.t0, v.t1));
        c.x = lerp(v.p0.x, v.p1.x, e); c.y = lerp(v.p0.y, v.p1.y, e);
        const cross = Math.max(0, 1 - Math.abs(c.y - MEMBRANE_Y) / (c.r * 1.25));
        c.sx = 1 + 0.55 * cross; c.ang = Math.PI / 2; c.exempt = e > 0.02;
        c.r *= lerp(1, 0.82, e);
      }
      // the type presses cells whose centres it covers out of its way (then clips what is left)
      for (const b of wb) {
        const lx = c.x - b.x, ly = c.y - b.y, m = c.r * 0.5;
        const ex = b.hx + m - Math.abs(lx), ey = b.hy + m - Math.abs(ly);
        if (ex > 0 && ey > 0) {
          if (ex < ey) c.x += Math.sign(lx || 1) * Math.min(ex, c.r * 1.4);
          else c.y += Math.sign(ly || 1) * Math.min(ey, c.r * 1.4);
        }
      }
      out.push(c);
    }
    return out;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    if (!this.paperDone) { this.paperSrc.render(renderer, this.paperRT); this.paperDone = true; }
    const cam = this.camAt(t);
    const bone = smoothstep(this.tPB + 0.05, this.tDown, t);
    const fin = prog(t, this.tEnd - 0.3, this.tEnd - 0.04); // hand the field over to hook4's texture
    // background
    const bu = this.bg.u;
    (bu.uCam!.value as THREE.Vector4).set(cam.x, cam.y, cam.z, cam.rot);
    bu.uBone!.value = bone;
    bu.uMemA!.value = 1 - bone;
    const hx = bu.uHoleX!.value as THREE.Vector4, hw = bu.uHoleW!.value as THREE.Vector4;
    hx.set(0, 0, 0, 0); hw.set(0, 0, 0, 0);
    this.invaders.forEach((v, i) => {
      const e = prog(t, v.t0, v.t1), r = v.node.rho * this.fill(t);
      const open = Math.max(Math.sin(Math.PI * clamp(e * 1.1)) * 0.62, e > 0.5 ? 0.3 : 0);
      if (i < 4 && e > 0) { hx.setComponent(i, lerp(v.p0.x, v.p1.x, ease.inOutCubic(e))); hw.setComponent(i, r * open); }
    });
    this.bg.render(renderer, out);
    // cells
    const fl = this.fill(t);
    const cu = this.cells.u;
    (cu.uCam!.value as THREE.Vector4).set(cam.x, cam.y, cam.z, cam.rot);
    cu.uLineW!.value = Math.pow(cam.z, -0.4);
    cu.uAlpha!.value = 1 - fin;
    cu.uK!.value = 4 / Math.max(1, cam.z * 0.6);
    const boxes = cu.uBox!.value as THREE.Vector4[];
    const slots = this.slots(t, bone);
    const cellsNow = this.cellsAt(t, cam, slots);
    for (let i = 0; i < 4; i++) { const s = slots[i]; if (s) boxes[i]!.set(s.x, s.y, s.hx, s.hy); else boxes[i]!.set(0, 0, 0, 0); }
    const halfW = 960 / cam.z + 200, halfH = 540 / cam.z + 200, rr = Math.hypot(halfW, halfH);
    const view = { x0: cam.x - rr, y0: cam.y - rr, x1: cam.x + rr, y1: cam.y + rr };
    this.cells.watch = this.X.id;
    this.cells.set(cellsNow, this.nuc, fl, 1 - smoothstep(this.tPB, this.tDown, t), 1.1, view);
    if (fin < 1) this.cells.render(renderer, out);
    if (fin > 0) comp.draw(renderer, this.h4Tex, out, { opacity: fin });
    // text, labels, the diagram, the ring
    this.drawText(t, cam, bone);
    comp.draw(renderer, this.text.upload(), out);

    let kp = 0; for (const k of this.kicks) kp = Math.max(kp, pulse(t, k, 0.06));
    return {
      bloom: 0.3, bloomThreshold: 0.95, ca: 0, vignette: lerp(0.42, 0.38, bone), grain: lerp(0.055, 0.05, bone), paper: bone,
      zoom: 1 + 0.006 * kp * (1 - bone),
    };
  }

  /**
   * The rows' slots (screen px boxes the cells keep out of): each opens as its row appears, pressing the
   * field aside, and closes as the line leaves (the carried line's closes as the paper comes up).
   */
  private slots(t: number, bone: number) {
    const out: { x: number; y: number; hx: number; hy: number }[] = [];
    const c = this.text.ctx;
    for (const r of this.rows) {
      // (the first line's slots open only after the cut: stack's loops lay under its rows)
      const lead = this.lead(r), o0 = Math.max(r.ws[0]!.start - lead, this.t0);
      const a = this.rowAlpha(r, t) * ease.outCubic(prog(t, o0, o0 + (r.line === this.L1 ? 0.28 : 0.3)));
      const close = r.line === this.L4 ? 1 - bone : 1;
      if (a * close <= 0.01) continue;
      const txt = r.ws.map((w) => w.w).join(' ');
      c.font = font(r.fam, r.size);
      const wTot = c.measureText(txt).width;
      const top = r.y - r.size * 0.74, bot = r.y + (r.desc ? r.size * 0.22 : 0);
      const k = a * close;
      out.push({ x: r.x + wTot / 2, y: (top + bot) / 2, hx: (wTot / 2) * lerp(0.2, 1, k), hy: ((bot - top) / 2) * k });
      if (out.length === 4) break;
    }
    return out;
  }
  private lead(r: RowDef) { return r.line === this.L1 ? 0.4 : r.line === this.L3 ? 0.22 : 0.36; }
  private rowAlpha(r: RowDef, t: number) {
    const l = r.line;
    if (l === this.L4) return 1; // carried into hook4
    if (l === this.L3) return 1 - prog(t, l.end + 0.02, l.end + 0.12); // it overhangs the close-up's cut
    return 1 - prog(t, l.end + 0.06, l.end + 0.24);
  }

  private drawText(t: number, cam: Cam2, bone: number) {
    const c = this.text.ctx;
    this.text.clear();
    // P4: the signalling diagram on X (world → screen)
    if (t >= this.c4 && t < this.tPB + 0.2) this.drawDiagram(c, t, cam);
    // the ring: one cell boundary widens into hook4's counter circle
    const eR = prog(t, this.tDown, this.tEnd - 0.06, ease.outCubic);
    if (eR > 0) {
      const leaf = this.ringLeaf, r0 = leaf.rho * 0.95;
      const R = lerp(r0, this.ring.r, eR);
      const x = lerp(leaf.x, this.ring.x, eR), y = lerp(leaf.y, this.ring.y, eR);
      c.strokeStyle = rgba('ink', lerp(0.5, 0.72, eR)); c.lineWidth = lerp(1.3, 1.8, eR);
      c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.stroke();
    }
    // lyric rows: bone on the ink slots; ink once the negative space has gone to paper
    for (const r of this.rows) {
      const a = this.rowAlpha(r, t);
      if (a <= 0.001) continue;
      const on = r.line === this.L4 && bone > 0.5 ? 'ink' : 'bone';
      const dim = r.line === this.L4 ? lerp(0.3, 0.3, bone) : 0.3;
      karaokeRow(c, r.ws, r.x, r.y, r.fam, r.size, t, a, { on, dim, lead: this.lead(r) });
    }
    // labels (one at a time)
    const aI = window01(t, this.tFence + 0.05, this.c3 - 0.02, 0.18, 0.12);
    if (aI > 0 && this.invaders.length) {
      const v = this.invaders[1] ?? this.invaders[0]!;
      const e = ease.inOutCubic(prog(t, v.t0, v.t1));
      const p = this.toScreen(cam, lerp(v.p0.x, v.p1.x, e), lerp(v.p0.y, v.p1.y, e) + v.node.rho * 0.5);
      monoLabel(c, 'local invasion · schematic', Math.min(1500, p.x + 150), Math.min(984, p.y + 120), p.x + 10, p.y + 8, aI);
    }
  }

  // ------------------------------------------------------------------ the signalling diagram
  private drawDiagram(c: CanvasRenderingContext2D, t: number, cam: Cam2) {
    const X = this.X, f = this.fill(t);
    const r = X.rho * f;
    // The relay belongs to the parent cell. Clear it as that cell divides, before its membrane
    // disappears, so seeking directly to the daughters never depends on an earlier parent frame.
    const fade = (1 - prog(t, this.X.tDiv - 0.18, this.X.tDiv)) * prog(t, this.c4, this.c4 + 0.08);
    if (fade <= 0.001) return;
    // the receptor's direction (upper left) and the membrane's distance along it (disc ∩ half-planes)
    const th = -2.35, ux = Math.cos(th), uy = Math.sin(th);
    let rho = r;
    const hp = this.cells.watchHP;
    if (hp) for (let q = 0; q < 8; q++) { const d = ux * hp[q * 3]! + uy * hp[q * 3 + 1]!; if (d > 1e-3) rho = Math.min(rho, hp[q * 3 + 2]! / d); }
    const S = (dx: number, dy: number) => this.toScreen(cam, X.x + dx, X.y + dy);
    const k = cam.z;
    const np = this.nuc[X.id]!, eff = X.rho * Math.min(f, 1);
    const nuc = { x: np.ox * eff, y: np.oy * eff }, nr = np.rx * eff;
    const mem = { x: ux * (rho - 1.4), y: uy * (rho - 1.4) };
    const relay = { x: mem.x * 0.52 + nuc.x * 0.48 - uy * 5, y: mem.y * 0.52 + nuc.y * 0.48 + ux * 5 };
    // the downstream arrow should end in an inhibition bar on the nucleus; it is askew and misses
    const aim = Math.atan2(nuc.y - relay.y, nuc.x - relay.x), dAim = Math.hypot(nuc.x - relay.x, nuc.y - relay.y) - nr - 2;
    const skew = 0.62 * ease.inOutCubic(prog(t, this.tAskew - 0.05, this.tAskew + 0.35));
    const tipA = aim + skew, tip = { x: relay.x + Math.cos(tipA) * dAim, y: relay.y + Math.sin(tipA) * dAim };
    const P = (p: Pt) => S(p.x, p.y);
    c.save();
    c.globalAlpha = fade;
    c.lineCap = 'round';
    const inkLine = (w: number, a = 0.9) => { c.strokeStyle = rgba('ink', a); c.lineWidth = w; };
    // receptor: a Y across the membrane (arms outside in bone, stem inside in ink)
    const pm = P(mem), pOut = P({ x: mem.x + ux * 7, y: mem.y + uy * 7 }), pIn = P({ x: mem.x - ux * 6, y: mem.y - uy * 6 });
    const bound = prog(t, this.tGoes - 0.06, this.tGoes + 0.04);
    c.strokeStyle = rgba('bone', 0.95); c.lineWidth = 0.9 * k;
    const arm = (s: number) => { const a = th + s * 0.55; const q = P({ x: mem.x + ux * 3 + Math.cos(a) * 5.5, y: mem.y + uy * 3 + Math.sin(a) * 5.5 }); c.beginPath(); c.moveTo(P({ x: mem.x + ux * 2.2, y: mem.y + uy * 2.2 }).x, P({ x: mem.x + ux * 2.2, y: mem.y + uy * 2.2 }).y); c.lineTo(q.x, q.y); c.stroke(); };
    arm(1); arm(-1);
    inkLine(0.9 * k, 0.92); c.beginPath(); c.moveTo(pm.x, pm.y); c.lineTo(pIn.x, pIn.y); c.stroke();
    void pOut;
    // the inhibitory signal: a small dimer drifting in through the gap and docking in the receptor's arms
    const arrive = ease.outCubic(prog(t, this.c4 + 0.1, this.tGoes));
    const L = lerp(70, 5.2, arrive) + 3 * Math.sin(t * 5) * (1 - arrive);
    const lg = { x: mem.x + ux * L, y: mem.y + uy * L }, perp = { x: -uy, y: ux };
    for (const s of [-1, 1]) {
      const q = P({ x: lg.x + perp.x * s * 1.7, y: lg.y + perp.y * s * 1.7 });
      c.fillStyle = rgba('bone', 0.95); c.beginPath(); c.arc(q.x, q.y, 1.6 * k, 0, Math.PI * 2); c.fill();
      c.strokeStyle = rgba('ink', 0.8); c.lineWidth = 0.35 * k; c.stroke();
    }
    // arrow 1: receptor → relay (fires when the signal binds)
    const pr = P(relay);
    inkLine(0.55 * k, 0.8);
    c.setLineDash([2.2 * k, 1.6 * k]);
    c.beginPath(); c.moveTo(pIn.x, pIn.y); c.lineTo(pr.x, pr.y); c.stroke();
    c.setLineDash([]);
    this.arrowHead(c, pIn, pr, 2.4 * k);
    // relay node
    const lit = prog(t, this.tGoes + 0.18, this.tGoes + 0.26);
    c.fillStyle = rgba('ink', 0.12 + 0.6 * lit); c.beginPath(); c.arc(pr.x, pr.y, 3.2 * k, 0, Math.PI * 2); c.fill();
    inkLine(0.5 * k, 0.9); c.stroke();
    // arrow 2: relay ⊣ (askew) — the inhibition bar lands in empty cytoplasm
    const pt = P(tip), ang = Math.atan2(pt.y - pr.y, pt.x - pr.x);
    const a0 = { x: pr.x + Math.cos(ang) * 3.8 * k, y: pr.y + Math.sin(ang) * 3.8 * k };
    inkLine(0.6 * k, 0.9);
    c.beginPath(); c.moveTo(a0.x, a0.y); c.lineTo(pt.x, pt.y); c.stroke();
    const bx = -Math.sin(ang) * 3 * k, by = Math.cos(ang) * 3 * k;
    inkLine(0.75 * k, 0.95);
    c.beginPath(); c.moveTo(pt.x - bx, pt.y - by); c.lineTo(pt.x + bx, pt.y + by); c.stroke();
    // the intended target, faint: where the bar should have landed
    const pn = P(nuc), want = { x: relay.x + Math.cos(aim) * dAim, y: relay.y + Math.sin(aim) * dAim }, pw = P(want);
    c.setLineDash([1.2 * k, 1.8 * k]); inkLine(0.35 * k, 0.35 * prog(t, this.tAskew, this.tAskew + 0.3));
    c.beginPath(); c.moveTo(a0.x, a0.y); c.lineTo(pw.x, pw.y); c.stroke(); c.setLineDash([]);
    void pn;
    // the pulse: receptor → relay → along the askew arrow, then nothing
    const s1 = prog(t, this.tGoes + 0.02, this.tGoes + 0.2), s2 = prog(t, this.tAskew + 0.02, this.tAskew + 0.42);
    let dot: Pt | null = null;
    if (s1 > 0 && s1 < 1) dot = { x: lerp(pIn.x, pr.x, s1), y: lerp(pIn.y, pr.y, s1) };
    else if (s2 > 0 && s2 < 1) dot = { x: lerp(a0.x, pt.x, s2), y: lerp(a0.y, pt.y, s2) };
    if (dot) { c.fillStyle = rgba('ink', 0.95); c.beginPath(); c.arc(dot.x, dot.y, 1.5 * k, 0, Math.PI * 2); c.fill(); }
    c.restore();
    // label
    const aG = window01(t, this.tAskew + 0.3, this.tPB, 0.2, 0.15) * fade;
    if (aG > 0) monoLabel(c, 'growth control disrupted', Math.min(1500, pt.x + 120), Math.min(900, pt.y + 150), pt.x, pt.y, aG, 'ink');
  }
  private arrowHead(c: CanvasRenderingContext2D, a: Pt, b: Pt, s: number) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x), e = { x: b.x - Math.cos(ang) * s * 1.6, y: b.y - Math.sin(ang) * s * 1.6 };
    c.fillStyle = rgba('ink', 0.85);
    c.beginPath(); c.moveTo(e.x + Math.cos(ang) * s * 1.2, e.y + Math.sin(ang) * s * 1.2);
    c.lineTo(e.x - Math.sin(ang) * s * 0.7, e.y + Math.cos(ang) * s * 0.7); c.lineTo(e.x + Math.sin(ang) * s * 0.7, e.y - Math.cos(ang) * s * 0.7); c.closePath(); c.fill();
  }
}
