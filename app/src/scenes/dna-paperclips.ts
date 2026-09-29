// DNA edition, `paperclips` slot (96.596–102.051), the quiet third chorus (docs/DNA_VIDEO_PLAN.md).
//  carry-in  "I’m upping my P(doom)," finishes where hook3 set it (same line, place, scale and dial), and
//            the empty orange bracket stays where hook3 left it for all of part A; part B's plate
//            re-registers it on its channel line (x 1476, y 591), where fuse picks it up.
//  A  "as paperclips fill the room": capsid subunits (a schematic T = 1 icosahedral capsid: 60
//     identical subunits, five around each five-fold vertex) fly in pentamer by pentamer and snap into
//     shells on the eighth notes; the camera pulls back while shells nucleate outward and fill the
//     depth behind them until no gap is left in the field — except the one inside the empty bracket.
//  B  "Killswitch guy’s on PTO" (98.820): a clean editorial cut to a separate plate, a schematic
//     tumor-suppressor pathway on bone paper. The p53 hub is stamped `p53 / OUT OF OFFICE` on
//     "Killswitch"; stress signals keep arriving at it on the beat, every output is dashed, and the
//     checkpoint gate on the cell-cycle rule hangs open. Past it cells proliferate on the eighth notes
//     and crop against the frame.
//     "Now there’s nowhere left to go": the gate’s side gives way, cells overrun the diagram and press
//     on the rule from both sides; the gap between the two masses sinks into a narrow dark channel
//     that holds the lyric and the empty bracket (→ fuse: the channel becomes the axon).
// Pure function of song time.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, SCALE, scaleContext2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { PDoom } from '../engine/hud';
import { clamp, ease, hash, keys, lerp, prog, smoothstep, window01, type Key } from '../engine/util';
import { Cam, focusBracket, karaokeRow, makeBackdrop, monoLabel, rubberStamp } from './dna-kit';
import { CAP, PaperCache, drawDial, karaokeSet, setPD, setPlain, type Setting } from './dna-hook-type';
import { ASSEMBLED, CapsidField, capsidGeometry, capsidUniforms, qaxis, qmul } from './dna-paperclips-capsid';
import { CY, CellSim, HUB, NET, channelDark, channelHalf, drawChannel, drawGate, drawNetwork, drawTissue, type CellP, type CellTimes } from './dna-paperclips-cells';

// hook3's final layout (dna-hook-absence.ts, as of 13:44), reproduced so its line, dial and empty bracket
// continue across the cut: the bracket over prompt3's missing 650 bp band, the line on its axis from
// x 900, everything scaled 1.06 about the bracket (the gel's slow push, at its end). Re-check if hook3 moves.
const H3 = {
  br: { x: 724, y: 268 + ((Math.log10(2000) - Math.log10(650)) / (Math.log10(2000) - Math.log10(100))) * (872 - 268) },
  x0: 900, z: 1.06, size: 26,
};
/** Part B's (and fuse's) bracket: on the channel line. */
const BR = { x: 1476, y: CY, size: 26 };

interface ShellDef { x: number; y: number; z: number; s: number; q: [number, number, number, number]; spin: [number, number, number]; t0: number; seed: number }

export default class DnaPaperclips extends Scene {
  // part A
  // hook3's ground (dna-hook-type inkWithLayer(0.35) without its layer)
  inkBg = new FSPass(/* glsl */ `
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      fragColor = vec4(C_INK + C_INK2 * 0.35 * (1.0 - smoothstep(0.1, 1.0, length(p))), 1.0);
    }`);
  capU = capsidUniforms();
  capBase = capsidGeometry(4);
  fieldAsm = new CapsidField(420, this.capBase, this.capU, THREE.DoubleSide);
  fieldDone = new CapsidField(420, this.capBase, this.capU, THREE.FrontSide);
  capScene = (() => { const s = new THREE.Scene(); s.add(this.fieldDone.mesh, this.fieldAsm.mesh); return s; })();
  /** The A rows' cast shadows, rendered once (a blurred shadow per frame is costly in Canvas2D). */
  rowShadows: { cv: HTMLCanvasElement; x: number; y: number; w: number; h: number }[] = [];
  cam = new Cam(30);
  shells: ShellDef[] = [];
  // part B
  paper = new PaperCache((() => { const b = makeBackdrop(); b.u.uPaper!.value = 1; b.u.uSeed!.value = 3.7; return b; })());
  lines = new LineBatch(12000, { screen2D: true, blend: 'normal' });
  sim!: CellSim;
  T!: CellTimes;
  // shared
  text = new Layer2D();

  tS = 0; tEnd = 0; tK = 0; tRoom = 0; tNow = 0;
  lCarry!: Line; lA!: Line; lK!: Line; lN!: Line;
  carrySets: Setting[] = []; carryXs: number[] = []; carryFam = F.archivo(75, 700); carrySize = 60; carryBase = 540;
  vDial = 0;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.tS = this.ctx.start; this.tEnd = this.ctx.end;
    this.lCarry = ly.get("I'm upping", 2);
    this.lA = ly.get('as paperclips');
    this.lK = ly.get('Killswitch');
    this.lN = ly.get('nowhere left');
    this.tK = this.lK.words[0]!.start;
    this.tRoom = this.lA.words[this.lA.words.length - 1]!.start;
    this.tNow = this.lN.words[0]!.start;

    // ---- hook3's carried line (as dna-hook-absence sets it)
    const words = this.lCarry.words.slice(0, 4), disp = words.map((w) => w.w.toUpperCase());
    const probe = measure(disp.join(' '), this.carryFam, 100) / 100;
    this.carrySize = Math.round(Math.min(72, (W / 3 + 60) / probe));
    const sp = measure(' ', this.carryFam, this.carrySize);
    this.carryBase = H3.br.y + (this.carrySize * CAP) / 2;
    let x = H3.x0;
    for (let k = 0; k < 4; k++) {
      const d = disp[k]!;
      const s = k === 3
        ? setPD(this.carrySize, { doom: F.archivo(75, 700), p: F.archivoItalic(75, 800), tail: d.endsWith(',') ? ',' : undefined })
        : setPlain(d, this.carryFam, this.carrySize);
      this.carrySets.push(s); this.carryXs.push(x);
      x += s.width + sp;
    }
    const pd = new PDoom(ly), wP = words[3]!;
    this.vDial = (pd.steps.find((s) => s.t >= wP.start - 0.01) ?? pd.steps[pd.steps.length - 1]!).v;

    // ---- part A: the shell field (ABC close packing, three layers), nucleating outward from the first shell
    const S = 2.06, LZ = S * Math.sqrt(2 / 3);
    const eighth = (tt: number) => au.timeOfBeat(Math.round(au.beatAt(tt) * 2) / 2);
    const tLast = this.tK - 0.62;
    // the nucleation front (world units from the first shell): slow while the camera is close, then it
    // outruns the pull-back and reaches the far corner (the lyric's) on "room"
    const wA = this.lA.words;
    const kFront: Key[] = [[this.tS - 0.45, 0], [this.tS, 0.7], [this.tS + 0.5, 2.3], [wA[1]!.end, 6.4, ease.inOutQuad], [this.tRoom, 12, ease.inOutQuad]];
    const tFront = (d: number) => {
      let a = this.tS - 0.45, b = this.tRoom + 0.6;
      for (let i = 0; i < 32; i++) { const m = (a + b) / 2; if (keys(m, kFront) < d) a = m; else b = m; }
      return b;
    };
    for (let layer = 0; layer < 3; layer++) {
      const ox = [0, S / 2, S][layer]!, oy = [0, S * Math.sqrt(3) / 6, S * Math.sqrt(3) / 3][layer]!;
      for (let j = -6; j <= 6; j++) for (let i = -8; i <= 8; i++) {
        const sd = layer * 1000 + (j + 50) * 100 + i + 50;
        const px = i * S + (((j % 2) + 2) % 2) * S / 2 + ox - (layer === 2 ? S : 0) + (hash(sd, 1) - 0.5) * 0.12;
        const py = j * S * Math.sqrt(3) / 2 + oy + (hash(sd, 2) - 0.5) * 0.12;
        const pz = -layer * LZ + (hash(sd, 3) - 0.5) * 0.1;
        const d = Math.hypot(px, py * 1.25);
        // the nucleation front grows with the camera's pull-back; deeper layers close the last gaps
        let t0 = tFront(d) + layer * 0.24 + (hash(sd, 4) - 0.5) * 0.16;
        if (layer === 0 && i === 0 && j === 0) t0 = this.tS - 0.3;
        t0 = Math.min(tLast, eighth(t0));
        const q = qmul(qaxis([hash(sd, 5) - 0.5, hash(sd, 6) - 0.5, hash(sd, 7) - 0.5], hash(sd, 8) * 6.28), [0, 0, 0, 1]);
        this.shells.push({ x: px, y: py, z: pz, s: 1 + (hash(sd, 9) - 0.5) * 0.05, q, spin: [hash(sd, 10) - 0.5, hash(sd, 11) - 0.5, hash(sd, 12) - 0.5], t0, seed: hash(sd, 13) * 100 });
      }
    }

    // ---- part A's lyric rows cast a soft shadow on the field (rendered once)
    for (const [ws, x, y, fam, size] of this.rowsA()) {
      const txt = ws.map((w) => w.w).join(' '), m = 48;
      const w = measure(txt, fam, size) + 2 * m, h = size * 1.6 + 2 * m;
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(w * SCALE); cv.height = Math.ceil(h * SCALE);
      const g = scaleContext2D(cv.getContext('2d')!, SCALE);
      g.font = font(fam, size); g.textBaseline = 'alphabetic';
      g.shadowColor = rgba('ink', 0.85); g.shadowBlur = 18; g.shadowOffsetX = 8; g.shadowOffsetY = 10;
      g.fillStyle = rgba('ink', 0.9);
      g.fillText(txt, m, m + size * 1.15);
      this.rowShadows.push({ cv, x: x - m, y: y - m - size * 1.15, w, h });
    }

    // ---- part B: the growth simulation
    const bt = (tt: number) => au.timeOfBeat(Math.round(au.beatAt(tt)));
    this.T = {
      tB: this.tK, tEnd: this.tEnd,
      tSq0: bt(this.tNow) - 0.3, tSq1: this.tEnd - 0.12,
      tDark0: this.tNow - 0.78, tDark1: this.tNow - 0.3,
      tRel: this.tNow,
    };
    this.sim = new CellSim(this.T, au);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    return f.t < this.tK ? this.renderA(f, out) : this.renderB(f, out);
  }

  /** "as paperclips / fill the room": the two rows (words, x, baseline, family, size). */
  private rowsA(): [Word[], number, number, string, number][] {
    const wA = this.lA.words;
    return [
      [wA.slice(0, 2), 150, 852, F.archivo(100, 700), 84],
      [wA.slice(2), 150, 966, F.archivo(112.5, 900), 118],
    ];
  }

  // ================================================================== A: capsids fill the room
  private camA(t: number) {
    const p = prog(t, this.tS, this.tK, (x) => ease.inOutCubic(x * 0.92 + 0.08 * x * x));
    const D = lerp(9, 19.5, p);
    const cx = lerp(-2.3, -0.5, p), cy = lerp(-1.25, -0.35, p);
    this.cam.look({ x: cx + 0.35 * p, y: cy + 0.15, z: D }, { x: cx - 0.2 * p, y: cy, z: -2 }, 30);
    return D;
  }

  private renderA(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    this.camA(t);
    this.inkBg.render(renderer, out);
    renderer.setRenderTarget(out);
    renderer.clearDepth();

    // visible, started shells (finished ones and assembling ones batch separately)
    const list: ShellDef[] = [], asm: ShellDef[] = [];
    const cp = this.cam.cam.position;
    for (const s of this.shells) {
      if (t < s.t0) continue;
      const p = this.cam.proj(s.x, s.y, s.z);
      const rad = 1.9 * s.s * p.s; // incl. subunits still flying in
      if (p.w <= 0.2 || p.x < -rad || p.x > W + rad || p.y < -rad || p.y > H + rad) continue;
      const age = t - s.t0;
      const q = qmul(qaxis(s.spin, 0.22 * age + s.seed), s.q);
      (age > ASSEMBLED ? list : asm).push({ ...s, q });
    }
    // front to back (early-z)
    const byDist = (a: ShellDef, b: ShellDef) => Math.hypot(a.x - cp.x, a.y - cp.y, a.z - cp.z) - Math.hypot(b.x - cp.x, b.y - cp.y, b.z - cp.z);
    list.sort(byDist); asm.sort(byDist);
    this.fieldDone.update(list);
    this.fieldAsm.update(asm);
    const u = this.capU;
    u.uT!.value = t;
    (u.uCam!.value as THREE.Vector3).copy(cp);
    const D = cp.z;
    (u.uFog!.value as THREE.Vector2).set(D + 0.5, D + 7.5);
    renderer.render(this.capScene, this.cam.cam);

    // ---- type, bracket
    const c = this.text.ctx;
    this.text.clear();
    c.textBaseline = 'alphabetic';
    // hook3's line finishes where it was sung, with its dial, then leaves the field to the capsids
    const ca = 1 - smoothstep(this.lCarry.end + 0.02, this.lCarry.end + 0.34, t);
    c.save();
    c.translate(H3.br.x, H3.br.y); c.scale(H3.z, H3.z); c.translate(-H3.br.x, -H3.br.y);
    if (ca > 0) {
      for (let k = 0; k < 4; k++) karaokeSet(c, this.carrySets[k]!, this.lCarry.words[k]!, this.carryXs[k]!, this.carryBase, t, { alpha: ca, dim: 0.28 });
      drawDial(c, H3.x0, this.carryBase + 140, this.vDial, { k: 1, alpha: ca * 0.85, light: true, label: rgba('ash', 0.8), digits: rgba('bone', 0.8), track: rgba('bone', 0.18), fill: rgba('bone', 0.6), barW: 240 });
    }
    // the empty bracket stays where hook3 left it: every gap in the field closes except the one it keeps
    c.fillStyle = rgba('ink', 1);
    const hs = H3.size * 0.78;
    c.fillRect(H3.br.x - hs, H3.br.y - hs, hs * 2, hs * 2);
    focusBracket(c, H3.br.x, H3.br.y, { size: H3.size, empty: true });
    c.restore();
    // "as paperclips / fill the room", lower left in the field's shade; the words cast a shadow on it
    const rows = this.rowsA();
    const fadeA = 1 - smoothstep(this.tK - 0.001, this.tK, t);
    rows.forEach(([ws], k) => {
      const a = prog(t, ws[0]!.start - 0.4, ws[0]!.start - 0.1) * fadeA;
      if (a <= 0) return;
      const sh = this.rowShadows[k]!;
      c.globalAlpha = a; c.drawImage(sh.cv, sh.x, sh.y, sh.w, sh.h); c.globalAlpha = 1;
    });
    for (const [ws, x, y, fam, size] of rows) karaokeRow(c, ws, x, y, fam, size, t, fadeA);

    // the one label: the stated architecture, pointing at the first shell
    const p0 = this.cam.proj(0, 0, 0);
    const la = window01(t, this.lA.words[1]!.start + 0.05, this.lA.words[2]!.start + 0.3, 0.25, 0.3);
    if (la > 0) monoLabel(c, 'T = 1 icosahedral capsid · 60 subunits · schematic', 150, 112, p0.x - 0.62 * p0.s, p0.y - 0.62 * p0.s, la);

    comp.draw(renderer, this.text.upload(), out);
    // post: hook3's at the cut (no jump in the carried line's glow), then this field's
    const k = prog(t, this.lCarry.end, this.lCarry.end + 0.5, ease.inOutQuad);
    return { bloom: lerp(0.45, 0.3, k), bloomThreshold: lerp(0.9, 0.92, k), vignette: lerp(0.55, 0.5, k), ca: 0.4, grain: lerp(0.055, 0.06, k), halation: lerp(0.25, 0.1, k), zoom: 1 + 0.003 * (f.a.kick ?? 0) };
  }

  // ================================================================== B: p53 out of office
  private renderB(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, audio: au } = this.ctx;
    const t = f.t, T = this.T;
    this.paper.render(renderer, out);
    const hb = channelHalf(T, t), dk = channelDark(T, t);
    const L = this.lines;
    L.clear();
    drawChannel(L, hb, dk, t);
    // stress inputs arrive at the hub on the beats; nothing leaves it
    const bf = au.beatAt(t);
    const pulses = NET.map((n, i) => (n.kind === 'in' ? clamp(((bf + i * 0.5) % 1) / 0.55) : 0));
    drawNetwork(L, hb, pulses);
    drawGate(L, hb, t, f.a.snare ?? 0);
    L.render(renderer, out);

    // ---- the tissue (over the diagram), then type, stamp, label, bracket
    const c = this.text.ctx;
    this.text.clear();
    const cells: CellP[] = [];
    this.sim.each(t, (x, y, r, age, seed) => { if (x > -r * 1.2 - 8 && x < W + r * 1.2 && y > -r * 1.2 - 8 && y < H + r * 1.2) cells.push({ x, y, r, age, seed }); });
    drawTissue(c, cells, hb);
    c.textBaseline = 'alphabetic';
    const wK = this.lK.words;
    const aK = 1 - smoothstep(this.lK.end + 0.03, this.lK.end + 0.3, t);
    karaokeRow(c, [wK[0]!], 150, 800, F.archivo(100, 900), 124, t, aK, { on: 'ink', dim: 0.22, lead: 0.01 });
    karaokeRow(c, wK.slice(1), 150, 902, F.archivo(100, 700), 88, t, aK, { on: 'ink', dim: 0.22, lead: 0.01 });
    // the lyric lies in the channel the cells leave it
    const fN = F.archivo(87.5, 700), sN = 72;
    karaokeRow(c, this.lN.words, 150, CY + (sN * CAP) / 2, fN, sN, t, 1, { on: 'bone', dim: 0.3 });
    // the stamp lands on "Killswitch"; the one explanatory label beside the pathway
    const stA = 1 - smoothstep(this.tEnd - 0.55, this.tEnd - 0.25, t);
    rubberStamp(c, 'p53 / OUT OF OFFICE', HUB.x + 262, HUB.y + 14, t, { t0: this.tK, size: 30, rot: -0.07, seed: 9, alpha: 0.94 * stA });
    const la = window01(t, this.tK + 0.14, this.tNow + 0.5, 0.25, 0.3);
    monoLabel(c, 'tumor-suppressor pathway · schematic', 150, 100, HUB.x + 10, HUB.y - HUB.r - 6, la, 'graphite');
    // the empty bracket keeps its place on the channel line
    focusBracket(c, BR.x, BR.y, { size: BR.size, empty: true, alpha: 0.95 });
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: lerp(0.1, 0.25, dk), bloomThreshold: 0.96, vignette: 0.28, grain: 0.045, halation: 0.06, ca: 0.3, paper: 1, zoom: 1 + 0.002 * (f.a.kick ?? 0) };
  }
}
