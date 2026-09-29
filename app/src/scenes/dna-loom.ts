// DNA edition, `loom` (126.140–131.595) — docs/DNA_VIDEO_PLAN.md, slot `loom`. Final chorus, full band.
//  126.14 hard cut from hook4: P(DOOM)'s lit counter (the microscope field, cells in it, the orange point
//         and its ring) stays where it was; the word is gone and the dimmed edges open up again.
//  "Just as foretold by Loom": the field resolves into a circular phylogeny growing out of the orange
//         point: a new level of branching on every beat, the field's rim riding the front (the present)
//         as it widens to hold the whole tree. `phylogeny · schematic`.
//  "From masked pre-training days": the growth keeps stepping on the beats while the camera pulls back;
//         on "masked" a small inset opens on one lineage: one promoter's CpG sites, a hatched mask wiping
//         over them as their methyl marks fill in — `regulation · context dependent`.
//  "To recursive self-upgrade": the tips keep splitting (no arrow, no top: every living tip on the same
//         circle, drawn the same). Then the camera pulls toward the root, `LUCA · last universal common
//         ancestor`; its circular node swells until its ring of ink swallows the frame and its lit centre is
//         a microscope field (→ ilya opens on that field, with a dividing cell in it).
// Pure function of song time: the tree is seeded and precomputed.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { ease, lerp, prog, smoothstep, window01 } from '../engine/util';
import { karaokeRow, monoLabel, findWord } from './dna-kit';
import { makePaperPass, orangePoint, CX, CY } from './dna-open-plate';
import { buildCellField } from './dna-loom-cells';
import { Phylo, R_END, HANDOFF, L3_ROWS, drawTree, drawMethylInset, splitRow, tipNear, type TreeView } from './dna-loom-tree';

/** hook4's last frame: the counter of P(DOOM)'s first O (after its post zoom) and the orange ring in it. */
const COUNTER = { x: 901.5, y: 539.5, ring: 63.5, wall: 77 };
/** The tree's front on screen once it fills the frame (px). */
const FRONT = 350;
/** LUCA's node glyph: an ink disc with a lit centre; outer radius (px) at rest, and outer/inner ratio. */
const NODE_RO = 12, NODE_K = HANDOFF.k;
/** The microscope field ilya opens on: LUCA's lit centre at the cut (px). */
const LOOM_FIELD_R = HANDOFF.fieldR;
/** Growth front at each beat from the cut (world units; R_END is the present at the end). */
const GK = [0, 0.1, 0.22, 0.36, 0.5, 0.63, 0.76, 0.88, 1.0, 1.1, 1.2, R_END];

export default class DnaLoomScene extends Scene {
  bg = makePaperPass();
  T = new Layer2D();
  tree = new Phylo(17);
  beats: number[] = [];
  l1!: Line; l2!: Line; l3!: Line;
  wMasked!: Word;
  tPush = 0;
  /** hook4's field of cells (rebuilt identically), dissolving on the first beat. */
  field = buildCellField();

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    const b0 = Math.round(au.beatAt(this.ctx.start));
    for (let k = 0; k < 13; k++) this.beats.push(au.timeOfBeat(b0 + k));
    this.l1 = ly.get('Just as foretold');
    this.l2 = ly.get('masked pre-training');
    this.l3 = ly.get('recursive self-upgrade');
    this.wMasked = findWord(this.l2, 'masked');
    // the pull toward the root: it takes off on the last downbeat and lands on the cut
    this.tPush = this.ctx.end - 0.7;
  }

  /** Growth front (world units): a step on every beat. `slow` gives the camera's lagging copy. */
  private front(t: number, slow = false) {
    let g = 0;
    for (let k = 0; k < GK.length - 1; k++) {
      const b = this.beats[k]!;
      if (t < b) break;
      g = lerp(GK[k]!, GK[k + 1]!, slow ? prog(t, b, b + 0.42, ease.inOutCubic) : prog(t, b, b + 0.24, ease.outCubic));
    }
    return g;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, t0 = this.ctx.start, t1 = this.ctx.end;
    const g = this.front(t), gLag = this.front(t, true);
    // camera: the tree grows out to FRONT px, then the camera pulls back as it keeps growing; at the end
    // it pushes into the root until LUCA's lit centre is LOOM_FIELD_R across
    const zMax = LOOM_FIELD_R / (NODE_RO / NODE_K);
    const push = ease.inOutCubic(prog(t, this.tPush, t1));
    const Z = Math.exp(Math.log(zMax) * push);
    const s = (FRONT / Math.max(0.22, gLag)) * Z;
    const mv = prog(t, t0, t0 + 0.7, ease.inOutCubic);
    const cx = lerp(COUNTER.x, CX, mv), cy = lerp(COUNTER.y, CY, mv);
    const rot = -0.9 + 0.035 * (t - t0);
    const view: TreeView = { cx, cy, s, g, rot, wk: Math.min(3.2, Math.pow(Z, 0.33)), alpha: 1 };
    const Fp = s * g; // the front on screen
    const ringR = Math.max(COUNTER.ring, Fp + 10);
    const rO = NODE_RO * Z, rI = rO / NODE_K;

    // ---- backdrop: bone paper; the microscope field is the tree's disc, then LUCA's lit centre
    const bg = this.bg.u;
    const fieldTree = 1 - prog(t, this.tPush + 0.1, this.tPush + 0.42);
    const fieldNode = prog(t, t1 - 0.26, t1 - 0.05);
    const useNode = t > this.tPush + 0.42;
    (bg.uField!.value as THREE.Vector3).set(cx, cy, useNode ? rI : ringR);
    bg.uFieldA!.value = useNode ? fieldNode : fieldTree;
    bg.uDarkA!.value = 0;
    this.bg.render(renderer, out);

    // ---- hook4's cell field, as it was at the cut (its slow push 1.018 and post zoom 1.05), dissolving
    const cellA = 1 - prog(t, t0 + 0.03, t0 + 0.42, ease.inOutQuad);
    const HZ = 1.05, HP = 1.018;
    if (cellA > 0.001) comp.draw(renderer, this.field.tex, out, { scale: [1 / (HZ * HP), 1 / (HZ * HP)], opacity: cellA });

    const c = this.T.ctx;
    this.T.clear();
    if (cellA > 0.001) {
      // the counter: a lit microscope field, its cells magnified 1.9x (hook4's last frame, without the word)
      const Rx = CX + (COUNTER.x - CX) / HZ, Ry = CY + (COUNTER.y - CY) / HZ, Rr = COUNTER.wall / HZ;
      c.save();
      c.translate(CX, CY); c.scale(HZ, HZ); c.translate(-CX, -CY);
      c.beginPath(); c.arc(Rx, Ry, Rr, 0, Math.PI * 2); c.clip();
      c.globalAlpha = cellA;
      c.fillStyle = rgba('bone', 1); c.fillRect(Rx - Rr - 2, Ry - Rr - 2, Rr * 2 + 4, Rr * 2 + 4);
      c.translate(Rx, Ry); c.scale(1.9, 1.9); c.translate(-Rx, -Ry);
      c.translate(CX, CY); c.scale(HP, HP); c.translate(-CX, -CY);
      c.drawImage(this.field.cv, 0, 0, W, H);
      c.restore();
      // the counter's edge, now the field's rim
      c.strokeStyle = rgba('ink', 0.75 * cellA); c.lineWidth = 2;
      c.beginPath(); c.arc(COUNTER.x, COUNTER.y, COUNTER.wall, 0, Math.PI * 2); c.stroke();
    }

    // ---- faint time rings behind the tree (schematic: no scale), the tree, the present
    const treeA = 1 - 0.55 * smoothstep(1.15, 4, Z); // the lines thin out as they fly past the type
    if (rO < 2400) {
      c.save();
      c.setLineDash([1.5, 5]); c.lineWidth = 1;
      for (const r of [0.25, 0.5, 0.75, 1.0]) {
        if (r >= g - 0.02) continue;
        const R = r * s;
        if (R < rO + 4 || R > 2400) continue;
        c.strokeStyle = rgba('graphite', 0.3 * smoothstep(g - 0.02, g + 0.06, r + 0.1));
        c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
      }
      c.setLineDash([]);
      c.restore();
      drawTree(c, this.tree, { ...view, alpha: treeA, hole: rO - 1 });
      // the field's rim (hook4's orange ring) becomes the present: a hairline just past the front
      const toInk = prog(t, t0 + 0.05, t0 + 0.5, ease.inOutQuad);
      if (ringR < 1400) {
        c.lineWidth = lerp(1.9, 1.1, toInk);
        if (toInk < 1) { c.strokeStyle = rgba('signal', 0.8 * (1 - toInk)); c.beginPath(); c.arc(cx, cy, ringR, 0, Math.PI * 2); c.stroke(); }
        c.strokeStyle = rgba('ink', 0.55 * toInk); c.beginPath(); c.arc(cx, cy, ringR, 0, Math.PI * 2); c.stroke();
      }
    }

    // ---- LUCA's node: an ink disc with a lit centre (it becomes the dark around the next field)
    const nodeA = prog(t, t0 + 0.03, t0 + 0.3);
    if (nodeA > 0.001) {
      c.fillStyle = rgba('ink', nodeA);
      c.beginPath();
      if (rO > 1110) c.rect(-10, -10, W + 20, H + 20); else c.arc(cx, cy, rO, 0, Math.PI * 2);
      c.moveTo(cx + rI, cy); c.arc(cx, cy, rI, 0, Math.PI * 2, true);
      c.fill('evenodd');
    }
    orangePoint(c, cx, cy, lerp(5.8, 5.5, prog(t, t0, t0 + 0.3)), 1);

    // ---- lyrics (ink on paper; the last line turns bone as the node's ink reaches it)
    const l1 = this.l1, l2 = this.l2, l3 = this.l3;
    const a1 = 1 - prog(t, l1.end + 0.05, l1.end + 0.35);
    karaokeRow(c, l1.words.slice(0, 3), 128, 196, F.archivo(100, 800), 76, t, a1, { on: 'ink' });
    karaokeRow(c, l1.words.slice(3), 128, 312, F.archivo(100, 900), 104, t, a1, { on: 'ink' });
    const a2 = 1 - prog(t, l2.end + 0.05, l2.end + 0.35);
    karaokeRow(c, l2.words.slice(0, 2), 128, 872, F.archivo(100, 800), 76, t, a2, { on: 'ink' });
    karaokeRow(c, l2.words.slice(2), 128, 978, F.archivo(100, 900), 76, t, a2, { on: 'ink' });
    const disc = { x: cx, y: cy, r: rO > 1110 ? 5000 : rO };
    for (const [k, ws] of [l3.words.slice(0, 2), l3.words.slice(2)].entries()) {
      const r = L3_ROWS[k]!;
      splitRow(c, ws, r.x, r.y, F.archivo(r.width, r.weight), r.size, t, 1, { align: 'right' }, disc);
    }

    // ---- one explanatory label at a time
    {
      const a = window01(t, t0 + 0.6, l1.end + 0.02, 0.25, 0.22);
      if (a > 0.001) { const p = tipNear(this.tree, view, -0.62); monoLabel(c, 'phylogeny · schematic', 1392, 226, p.x, p.y, a, 'graphite'); }
    }
    {
      const wm = this.wMasked;
      const a = prog(t, wm.start - 0.14, wm.start + 0.02, ease.outCubic) * (1 - prog(t, l2.end - 0.22, l2.end + 0.04));
      if (a > 0.001) {
        const pop = lerp(0.94, 1, prog(t, wm.start - 0.14, wm.start + 0.08, ease.outCubic));
        const wipe = ease.inOutQuad(Lyrics.wordProgress(wm, t));
        const ix = 1340, iy = 112, iw = 452, ih = 126;
        c.save();
        c.translate(ix + iw / 2, iy + ih / 2); c.scale(pop, pop); c.translate(-(ix + iw / 2), -(iy + ih / 2));
        drawMethylInset(c, ix, iy, iw, ih, wipe, a);
        c.restore();
        const p = tipNear(this.tree, view, -0.8);
        monoLabel(c, 'regulation · context dependent', ix, iy + ih + 30, p.x, p.y, a, 'graphite');
      }
    }
    {
      const a = window01(t, l3.words[1]!.start + 0.15, this.tPush + 0.1, 0.2, 0.14);
      if (a > 0.001) monoLabel(c, 'LUCA · last universal common ancestor', 128, 548, cx - rO - 4, cy, a, 'graphite');
    }
    comp.draw(renderer, this.T.upload(), out);

    // ---- post: hook4 ended with its edges dimmed like an iris; they open again on the first beat
    const vig = lerp(0.8, 0.32, prog(t, t0, t0 + 0.5, ease.outCubic));
    return {
      paper: 1, frame: 0, bloom: 0.35, bloomThreshold: 1.0, vignette: vig, grain: 0.04, halation: 0.05, ca: 0.4,
      zoom: 1 + 0.004 * (f.a.kick ?? 0) * (1 - push),
    };
  }
}

