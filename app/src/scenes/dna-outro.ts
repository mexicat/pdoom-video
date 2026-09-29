// DNA edition, `outro` (140.230–156.651) — docs/DNA_VIDEO_PLAN.md, slot `outro` (revision 3).
// No editorial text, no title card. The pupil the `ilya` scene constricted to the orange point opens
// this scene as an engraved eye close-up (the tail of the sung "show?" small and quiet at the lower
// left). The camera pulls back and turns: the eye belongs to an observer at a microscope eyepiece —
// the opening's circular field was their view. Hold on the observer while the vocal builds. Then one
// hard scale cut per downbeat into the observer's own body, each an explicit montage plate marked
// only by its tiny mono scale bar, the orange point at the frame centre marking where the next plate
// enters: eye (section) → a retinal rod → its nucleus → a chromatin loop → the helix. Exactly as the
// drums stop, the opening plate returns — bone paper, the circular field, the helix, the bracket
// closing around the first base — and holds through the last vocal notes into silence.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F } from '../engine/type';
import { type Line } from '../engine/lyrics';
import { clamp, lerp, prog, ease, pulse } from '../engine/util';
import { Cam, karaokeRow, helix, straightAxis, sequence, BDNA } from './dna-kit';
import {
  EngravedHelix, makePaperPass, plateHelix, plateTarget, plateState, plateCam, drawPlate, orbitCam, distFor, scaleBar, orangePoint,
  CX, CY, FIELD_R, type PlateTimes,
} from './dna-open-plate';
import { drawEye, drawProfile, drawMicroscope, EYE_S0 } from './dna-open-observer';
import { drawEyeSection, drawPhotoreceptor, drawNucleus, drawChromatin, EYE_SEC, ROD, NUC, CHR } from './dna-open-atlas';
import { signalGlint } from './dna-open-glint';

/** Observer hold scale (px per eyeball radius, ~12 mm). */
const HOLD_S = 17;
/** Where the tail of "Was it all for show?" sits in the first frames (left, baseline, px). */
export const SHOW_ROW = { x: 128, y: 968, size: 34 };
/** Helix plate: px per nm. */
const HX_PX_NM = 44;

export default class DnaOutroScene extends Scene {
  bg = makePaperPass();
  draw = new Layer2D();
  glint = new LineBatch(64, { screen2D: true, blend: 'add' });
  cam = new Cam(18);
  lShow!: Line;
  D: number[] = [];
  plate!: EngravedHelix;
  plateTgt = { x: 0, y: 0, z: 0 };
  hx!: EngravedHelix;
  hxTgt = { x: 0, y: 0, z: 0 };
  T!: PlateTimes;
  notes: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.lShow = ly.get('all for show');
    // the outro's downbeats: 140.23 (start), 142.05, 143.87 … 152.96 (the drums stop)
    this.D = au.downbeats.filter((d) => d >= this.ctx.start - 0.01 && d < this.ctx.end);
    // the opening plate, exactly as dna-open builds it
    const open = ly.get('sparks of AGI');
    this.T = { d0: au.downbeats[0]!, sing: open.words[0]!.start };
    this.plate = new EngravedHelix(plateHelix().bps);
    this.plateTgt = plateTarget(this.plate);
    // a longer stretch for the helix plate
    const n = 121, mid = 60;
    const seq = sequence(n, 23);
    const bps = helix(n, straightAxis({ x: 0, y: -mid * BDNA.rise, z: 0 }, { x: 0, y: 1, z: 0 }), { phase: 0.4, seq });
    this.hx = new EngravedHelix(bps);
    const w = this.hx.baseCentre(this.cam, mid).world;
    this.hxTgt = { x: w.x, y: w.y, z: w.z };
    // the last sung notes after the drums stop (vocal onsets), for the point's two quiet glints
    this.notes = au.events('vocal', this.D[7]! + 0.1, this.ctx.end).map(([t]) => t);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, D = this.D;
    const win = D.filter((d) => d <= t + 1e-6).length - 1; // 0: eye/observer … 7: the opening plate
    const bg = this.bg.u;
    bg.uDarkA!.value = 0;
    bg.uFieldA!.value = win >= 7 ? 1 : 0;
    (bg.uField!.value as THREE.Vector3).set(CX, CY, FIELD_R);
    this.bg.render(renderer, out);
    const c = this.draw.ctx;
    this.draw.clear();
    const post: PostOverrides = { paper: 1, frame: 0, bloom: 0.35, bloomThreshold: 1.0, vignette: 0.12, grain: 0.04, halation: 0.05, ca: 0.4 };
    let glintA = 0;

    if (win <= 1) {
      // ---- the eye → the observer at the eyepiece
      const pb = prog(t, D[0]!, D[1]! - 0.12, ease.inOutCubic);
      const S = Math.exp(lerp(Math.log(EYE_S0), Math.log(HOLD_S), pb)) * lerp(1, 1.035, prog(t, D[1]!, D[2]!, ease.inOutQuad));
      // the eye turns to profile only once it is small, then the observer comes up around it
      const zp = Math.log(EYE_S0 / S) / Math.log(EYE_S0 / HOLD_S);
      const k = sstep(zp, 0.52, 0.76), side = sstep(zp, 0.6, 0.9);
      drawProfile(c, CX, CY, S, side);
      drawMicroscope(c, CX, CY, S, side);
      drawEye(c, CX, CY, S, k);
      // the observer shot's scale (it sets up the bars the cuts will carry)
      const bar = prog(t, D[1]!, D[1]! + 0.25);
      scaleBar(c, (100 / 12) * S * bar, '10 cm', bar);
      post.zoom = 1 + 0.003 * (f.a.kick ?? 0) * prog(t, D[0]! + 0.35, D[0]! + 0.6);
    } else if (win <= 6) {
      // ---- the scale cuts: a hard cut per downbeat, each plate drifting a little toward the point
      const t0 = D[win]!, t1 = D[win + 1]!;
      const z = lerp(1, 1.045, prog(t, t0, t1, ease.inOutQuad));
      const bar = prog(t, t0 + 0.04, t0 + 0.22, ease.outCubic);
      c.save(); c.translate(CX, CY); c.scale(z, z); c.translate(-CX, -CY);
      let len = 0, label = '';
      if (win === 2) { drawEyeSection(c, 1); len = 5 * EYE_SEC.pxmm; label = '5 mm'; }
      else if (win === 3) { drawPhotoreceptor(c, 1); len = 10 * ROD.pxum; label = '10 µm'; }
      else if (win === 4) { drawNucleus(c, 1); len = 1 * NUC.pxum; label = '1 µm'; }
      else if (win === 5) { drawChromatin(c, 1); len = 20 * CHR.pxnm; label = '20 nm'; }
      else {
        orbitCam(this.cam, this.hxTgt, 0.3, 0.16, distFor(HX_PX_NM * z), -1.05, 18);
        c.restore(); c.save();
        this.hx.draw(c, this.cam, { hatchPx: 4.2 });
        len = 2 * HX_PX_NM; label = '2 nm';
      }
      c.restore();
      orangePoint(c, CX, CY, 5, 1);
      scaleBar(c, len * z * bar, label, bar);
      post.zoom = 1 + 0.012 * pulse(t, t0, 0.07) + 0.003 * (f.a.kick ?? 0);
    } else {
      // ---- back to the opening composition: the bracket closes around the first base, then stillness
      const tau = this.T.sing - 0.42 + (t - D[7]!);
      const still = plateState(this.T.sing + 1, this.T);
      const br = plateState(tau, this.T);
      plateCam(this.cam, this.plateTgt);
      drawPlate(c, this.plate, this.cam, { ...still, brK: br.brK, brA: br.brA });
      post.frame = prog(t, D[7]!, D[7]! + 0.9, ease.inOutCubic);
      post.bloom = 0.2; post.bloomThreshold = 1.2;
      for (const nt of this.notes) glintA = Math.max(glintA, 0.6 * pulse(t, nt, 0.22) * prog(t, nt - 0.02, nt));
    }
    // ---- the tail of the sung "show?": small and quiet, then nothing
    const aShow = 1 - prog(t, this.lShow.end + 0.05, this.lShow.end + 0.4);
    if (aShow > 0.001) karaokeRow(c, this.lShow.words, SHOW_ROW.x, SHOW_ROW.y, F.archivo(100, 700), SHOW_ROW.size, t, aShow, { on: 'ink' });
    comp.draw(renderer, this.draw.upload(), out);
    if (glintA > 0.01) { signalGlint(this.glint, CX, CY, glintA); this.glint.render(renderer, out); }
    return post;
  }
}

const sstep = (x: number, a: number, b: number) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
