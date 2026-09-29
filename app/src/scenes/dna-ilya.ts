// DNA edition, `ilya` (131.595–140.230) — docs/DNA_VIDEO_PLAN.md, slot `ilya` (revision 3). Quiet.
//  131.595 hard cut: LUCA's lit node from `loom` is now a microscope field seen through the eyepiece —
//          a dividing cell (metaphase) in a lit disc, dark all around. The tail of "To recursive
//          self-upgrade" finishes in place. `mitosis · schematic`.
//  "What did Ilya see?" (Cormorant italic): on "see?" (132.818) the chromatids start to separate and
//          the camera pulls back: the dark around the field is a pupil, the field is its reflection —
//          iris, lids, lashes: the observer's eye (the film's first line ended on "eyes").
//  "We'll never know": hold on the eye; in the small reflection the cell finishes dividing.
//  "Was it all for show?": through the stop bar (138.412–140.230) both irises close together — the
//          microscope's iris diaphragm (a polygon of blades shutting on the reflected field) and the eye's
//          iris (the pupil constricting) — and on "show?" (140.027) the pupil is down to the orange point.
//          The last frames are exactly the outro's first frame (drawEye at EYE_S0, pupil PUPIL_R), with
//          the lyric row shrunk into the outro's SHOW_ROW so its tail continues in place.
// No claim about what the real person saw. Pure function of song time.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F } from '../engine/type';
import { type Line } from '../engine/lyrics';
import { ease, lerp, prog, window01 } from '../engine/util';
import { karaokeRow, monoLabel, findWord } from './dna-kit';
import { makePaperPass, orangePoint, CX, CY } from './dna-open-plate';
import { drawEye, EYE_S0, PUPIL_R, pointR } from './dna-open-observer';
import { SHOW_ROW } from './dna-outro';
import { HANDOFF, L3_ROWS, splitRow } from './dna-loom-tree';
import { MitoticCell } from './dna-ilya-cell';

/** Pupil radius (eyeball radii) before the stop bar: dilated, the observer at a dark microscope. */
const RHO_P = 0.345;
/** The reflected field's radius (eyeball radii): the pupil is the ink ring of LUCA's node around it. */
const RHO_F = RHO_P / HANDOFF.k;
/** Eye scale at the cut (px per eyeball radius): the field is exactly LUCA's lit centre. */
const S_CUT = HANDOFF.fieldR / RHO_F;
/** Iris diaphragm blades. */
const BLADES = 9;

export default class DnaIlyaScene extends Scene {
  bg = makePaperPass();
  T = new Layer2D();
  cell = new MitoticCell(131);
  lPrev!: Line; lA!: Line; lC!: Line;
  tSee = 0; tKnow = 0; tShow = 0; tStop = 0; tPull1 = 0;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.lPrev = ly.get('recursive self-upgrade');
    this.lA = ly.get('What did Ilya');
    this.lC = ly.get('all for show');
    this.tSee = findWord(this.lA, 'see?').start;
    this.tKnow = findWord(this.lA, 'know').start;
    this.tShow = findWord(this.lC, 'show?').start;
    // the stop bar: the downbeat after "Was it" (the band stops until the outro)
    this.tStop = au.downbeats.find((d) => d > this.lC.words[1]!.start) ?? this.lC.words[2]!.start;
    this.tPull1 = this.tKnow - 0.04;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, t0 = this.ctx.start;
    // ---- camera (eye scale), pupil and diaphragm
    const S1 = S_CUT * lerp(1, 1.018, prog(t, t0, this.tSee, ease.inOutQuad));
    const pull = ease.inOutCubic(prog(t, this.tSee, this.tPull1));
    const S = Math.exp(lerp(Math.log(S1), Math.log(EYE_S0), pull));
    const close = ease.inOutCubic(prog(t, this.tStop, this.tShow));
    const hip = 1 + 0.012 * Math.sin(((t - this.tPull1) / 2.3) * Math.PI * 2) * window01(t, this.tPull1, this.tStop, 0.8, 0.8);
    const pupil = lerp(RHO_P * hip, PUPIL_R, close);
    const pR = pupil * S; // pupil radius on screen
    const fR = RHO_F * S; // reflected field radius on screen
    // diaphragm: a polygon's inradius (field radii), from well outside the field to shut at "show?"
    const dia = lerp(1.25, 0, ease.inOutCubic(prog(t, this.tStop, this.tShow - 0.02)));
    const shut = dia <= 0.0001;

    // ---- backdrop: bone paper; the field's lit disc fades out of the paper during the pull-back
    const bg = this.bg.u;
    (bg.uField!.value as THREE.Vector3).set(CX, CY, fR);
    bg.uFieldA!.value = 1 - prog(t, this.tSee + 0.15, this.tPull1);
    bg.uDarkA!.value = 0;
    this.bg.render(renderer, out);

    const c = this.T.ctx;
    this.T.clear();
    // ---- the eye (its pupil is the dark around the field); drawn whole once the pupil's edge is in frame
    if (pR > 1112) { c.fillStyle = 'rgba(10,10,11,1)'; c.fillRect(-10, -10, W + 20, H + 20); }
    else drawEye(c, CX, CY, S, 0, 1, pupil, 1);
    // ---- the reflected field: a lit disc (∩ the diaphragm's polygon) with the dividing cell in it
    if (!shut) {
      const poly = new Path2D();
      const rin = dia * fR, rc = rin / Math.cos(Math.PI / BLADES), turn = 0.7 * (1 - dia / 1.25);
      for (let k = 0; k <= BLADES; k++) {
        const an = turn + (k / BLADES) * Math.PI * 2;
        const x = CX + Math.cos(an) * rc, y = CY + Math.sin(an) * rc;
        if (k === 0) poly.moveTo(x, y);
        else {
          // blade edges are slightly curved (concave toward the centre)
          const am = turn + ((k - 0.5) / BLADES) * Math.PI * 2, rm = rin * 1.035;
          poly.quadraticCurveTo(CX + Math.cos(am) * rm * 1.0, CY + Math.sin(am) * rm * 1.0, x, y);
        }
      }
      poly.closePath();
      c.save();
      c.beginPath(); c.arc(CX, CY, fR, 0, Math.PI * 2); c.clip();
      c.clip(poly);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000'; c.fillRect(CX - fR - 2, CY - fR - 2, fR * 2 + 4, fR * 2 + 4);
      c.globalCompositeOperation = 'source-over';
      const st = {
        ana: prog(t, this.tSee, this.tSee + 1.15, ease.inOutQuad),
        elong: prog(t, this.tSee + 0.5, this.tSee + 2.8, ease.inOutCubic),
        furrow: 0.78 * prog(t, this.tSee + 1.6, this.tStop - 0.2, ease.inOutCubic),
        env: prog(t, this.tSee + 2.6, this.tStop - 0.4),
        t,
      };
      this.cell.draw(c, CX, CY, fR, st, { hatch: 4.2 });
      // the blades' edges, seen in the reflection once they reach into the field
      if (dia < 1.02) { c.strokeStyle = 'rgba(10,10,11,0.9)'; c.lineWidth = 1.2; c.stroke(poly); }
      c.restore();
      orangePoint(c, CX, CY, pointR(S), 1);
    }

    // ---- lyrics (bone over the dark pupil, ink over the paper and the iris)
    const disc = { x: CX, y: CY, r: pR > 1112 ? 5000 : pR };
    const lp = this.lPrev;
    const aPrev = 1 - prog(t, lp.end + 0.03, lp.end + 0.3);
    if (aPrev > 0.001) for (const [k, ws] of [lp.words.slice(0, 2), lp.words.slice(2)].entries()) {
      const r = L3_ROWS[k]!;
      splitRow(c, ws, r.x, r.y, F.archivo(r.width, r.weight), r.size, t, aPrev, { align: 'right' }, disc);
    }
    const lA = this.lA, wA = lA.words;
    const aA = 1 - prog(t, lA.end + 0.08, lA.end + 0.45);
    if (aA > 0.001) {
      const serif = F.serif(600, true);
      splitRow(c, wA.slice(0, 2), 128, 184, serif, 90, t, aA, {}, disc);
      splitRow(c, wA.slice(2, 4), 128, 278, serif, 90, t, aA, {}, disc);
      splitRow(c, wA.slice(4, 6), W - 128, 890, F.archivo(100, 700), 64, t, aA, { align: 'right' }, disc);
      splitRow(c, wA.slice(6), W - 128, 982, F.archivo(100, 800), 104, t, aA, { align: 'right' }, disc);
    }
    // "Was it all for show?" shrinks with the closing irises into the outro's row
    const size = lerp(56, SHOW_ROW.size, close);
    karaokeRow(c, this.lC.words, SHOW_ROW.x, SHOW_ROW.y, F.archivo(100, 700), size, t, 1, { on: 'ink' });

    // ---- the one label, on the field hold
    {
      const a = window01(t, t0 + 0.2, this.tSee - 0.05, 0.22, 0.2);
      if (a > 0.001) monoLabel(c, 'mitosis · schematic', 1262, 868, CX + fR * 0.52, CY + fR * 0.52, a, 'ash');
    }
    comp.draw(renderer, this.T.upload(), out);

    return {
      paper: 1, frame: 0, bloom: 0.35, bloomThreshold: 1.0, vignette: lerp(0.32, 0.12, prog(t, this.tSee, this.tPull1)),
      grain: 0.04, halation: 0.05, ca: 0.4,
    };
  }
}
