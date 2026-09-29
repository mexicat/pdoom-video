// DNA edition, `open` (0–9.328 s) — see docs/DNA_VIDEO_PLAN.md, slot `open`.
//  Bone paper. An orange point sits in a circular microscope field. On the first downbeat the eyepiece
//  pointer (a hairline) slides in and finds a base; paired strands grow around it into right-handed
//  B-DNA, engraved ink on bone, and the orange focus bracket closes around that first base, landing on
//  the first sung note ("I"). A still plate with a 1 nm scale bar: the composition the outro returns to.
//  "I see sparks of AGI in your eyes": the lyric column sits beside the plate; the specimen creeps
//  closer. On "eyes" the camera rotates below the helix and tilts up: the helix becomes a spiral tower
//  whose major groove reads as a narrow architectural passage. "Your circuits make me nervous," rides
//  beside the near backbone as the tower turns. "that's no surprise": dive into the groove toward the
//  bracketed base pair; the paper goes dark and that one rung straightens into a horizontal rule
//  (the tick `loss` opens its chart on).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F } from '../engine/type';
import { type Line } from '../engine/lyrics';
import { clamp, lerp, prog, ease, keys } from '../engine/util';
import { Cam, karaokeRow, findWord } from './dna-kit';
import { signalGlint } from './dna-open-glint';
import {
  EngravedHelix, makePaperPass, plateHelix, plateTarget, plateState, drawPlate, lookUp, distFor, drawFieldRing,
  bracketBox, orangePoint, scaleBar, strandAngle, CX, CY, FIELD_R, FIRST, PLATE_PX_NM, PLATE_FOV, PLATE_PITCH, type PlateTimes,
} from './dna-open-plate';

/** The rule the last rung becomes (screen px): `loss` can open its chart on it. */
export const RULE = { y: 540, x0: 360, x1: 1560 };

type V3 = THREE.Vector3;
const TOWER = { R: 2.0, dth: 3.24, rT: 0.3, dy: 5.5, fov: 62, spin: -0.55, shift: 0.72 };
const DIVE = { pitch: -0.25, dist: 1.45, fov: 58 };
/** Where the "circuits" rows start (left, first baseline) and the backbone spot they hold on to. */
const ROW2 = { x: 128, y: 760, ax: 700, ay: 760 };
interface CamState { pos: V3; tgt: V3; up: V3; fov: number }
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

function orbitState(tgt: V3, yaw: number, pitch: number, dist: number, roll: number, fov: number): CamState {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const pos = v3(tgt.x + sy * cp * dist, tgt.y + sp * dist, tgt.z + cy * cp * dist);
  const up = v3(-sy * sp, cp, -cy * sp);
  if (roll) up.applyAxisAngle(v3(-sy * cp, -sp, -cy * cp), roll);
  return { pos, tgt: tgt.clone(), up, fov };
}
/** Blend two camera states; the position travels in cylindrical coordinates about the helix axis (so it turns around it). */
function blendState(a: CamState, b: CamState, k: number, turn = 0): CamState {
  const ra = Math.hypot(a.pos.x, a.pos.z), rb = Math.hypot(b.pos.x, b.pos.z);
  const ta = Math.atan2(-a.pos.z, a.pos.x);
  let tb = Math.atan2(-b.pos.z, b.pos.x);
  while (tb - ta > Math.PI) tb -= 2 * Math.PI;
  while (tb - ta < -Math.PI) tb += 2 * Math.PI;
  tb += turn * 2 * Math.PI;
  const r = Math.exp(lerp(Math.log(ra), Math.log(rb), k)), th = lerp(ta, tb, k);
  const pos = v3(r * Math.cos(th), lerp(a.pos.y, b.pos.y, k), -r * Math.sin(th));
  return { pos, tgt: a.tgt.clone().lerp(b.tgt, k), up: a.up.clone().lerp(b.up, k).normalize(), fov: lerp(a.fov, b.fov, k) };
}

export default class DnaOpenScene extends Scene {
  bg = makePaperPass();
  draw = new Layer2D();
  cam = new Cam(18);
  glint = new LineBatch(64, { screen2D: true, blend: 'add' });
  tSparks = 0;
  helix!: EngravedHelix;
  tgt = v3(0, 0, 0);
  T!: PlateTimes;
  l1!: Line; l2!: Line; l3!: Line;
  tE = 0; tYour = 0; tThat = 0; tSur = 0; d1 = 0; d4 = 0; tEnd = 0;
  e1 = 0; dv = 0;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.l1 = ly.get('sparks of AGI');
    this.l2 = ly.get('circuits make me');
    this.l3 = ly.get('no surprise');
    const db = au.downbeats;
    this.T = { d0: db[0]!, sing: this.l1.words[0]!.start };
    this.d1 = db[1]!;
    this.tE = findWord(this.l1, 'eyes').start;
    this.tSparks = findWord(this.l1, 'sparks').start;
    this.tYour = this.l2.words[0]!.start;
    this.tThat = this.l3.words[0]!.start;
    this.tSur = findWord(this.l3, 'surprise').start;
    this.tEnd = this.ctx.end;
    this.d4 = db.find((d) => d > this.tYour + 1)!; // the downbeat inside "nervous" (7.51)
    this.e1 = this.tE + 0.8;
    this.dv = this.tSur - 0.3;
    const { bps } = plateHelix();
    this.helix = new EngravedHelix(bps);
    const pt = plateTarget(this.helix);
    this.tgt = v3(pt.x, pt.y, pt.z);
    // "Your circuits make me nervous," rides beside the near backbone: anchor it to the backbone point
    // that sits at the row's spot when the line starts, and let the turning tower carry it
    const cs = this.camAt(this.e1 + 0.05);
    lookUp(this.cam, cs.pos, cs.tgt, cs.up, cs.fov);
    let best = 1e9;
    for (let i = 0; i < this.helix.n; i++) {
      for (const P of [this.helix.bps[i]!.a, this.helix.bps[i]!.b]) {
        const q = this.cam.proj(P.x, P.y, P.z);
        if (q.w < 0.4) continue;
        const d = Math.hypot(q.x - ROW2.ax, q.y - ROW2.ay) + q.w * 30;
        if (d < best) { best = d; this.anchor = P.clone(); }
      }
    }
    const q0 = this.cam.proj(this.anchor.x, this.anchor.y, this.anchor.z);
    this.aOff = { x: ROW2.x - q0.x, y: ROW2.y - q0.y };
  }
  anchor = v3(0, 0, 0);
  aOff = { x: 0, y: 0 };

  // ------------------------------------------------------------------ camera
  private plate(t: number): CamState {
    const push = prog(t, this.d1, this.tE, ease.inOutCubic);
    return orbitState(this.tgt, 0.1 * push, PLATE_PITCH, distFor(PLATE_PX_NM * lerp(1, 1.2, push)), 0, PLATE_FOV);
  }
  /** The spiral tower: below and outside the major groove, looking up the axis; it turns and climbs slowly. */
  private tower(t: number): CamState {
    const u = t - this.e1;
    const y = -5.4 + 0.45 * u, th = strandAngle(-5.4) + 255 * DEG + TOWER.spin * u;
    const R = TOWER.R;
    const pos = v3(R * Math.cos(th), y, -R * Math.sin(th));
    const tt = th + TOWER.dth;
    const tgt = v3(TOWER.rT * Math.cos(tt), y + TOWER.dy, -TOWER.rT * Math.sin(tt));
    const up = v3(Math.cos(th), 0, -Math.sin(th));
    // slide the view so the tower stands right of centre (the lyric column keeps the left third)
    const right = tgt.clone().sub(pos).normalize().cross(up).normalize();
    pos.addScaledVector(right, -TOWER.shift); tgt.addScaledVector(right, -TOWER.shift);
    return { pos, tgt, up, fov: TOWER.fov };
  }
  /** Dive: into the first base pair's major groove, a little below it, the rung lying across the frame. */
  private dive(t: number): CamState {
    const bp = this.helix.bps[FIRST]!;
    const phiM = strandAngle(0) + 255 * DEG;
    const yaw = Math.atan2(Math.cos(phiM), -Math.sin(phiM));
    const k = prog(t, this.dv, this.tEnd, ease.linear);
    return orbitState(bp.c.clone(), yaw, DIVE.pitch, lerp(DIVE.dist, DIVE.dist * 0.92, k), 0, DIVE.fov);
  }
  private camAt(t: number): CamState {
    if (t < this.tE) return this.plate(t);
    if (t < this.e1) return blendState(this.plate(t), this.tower(t), ease.inOutCubic(prog(t, this.tE, this.e1)));
    if (t < this.d4) return this.tower(t);
    if (t < this.dv) return blendState(this.tower(t), this.dive(t), ease.inOutCubic(prog(t, this.d4, this.dv)));
    return this.dive(t);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const e0 = this.tE, e1 = this.e1;
    // leaving the plate: the field opens past the frame edges
    const leave = prog(t, e0, e1, ease.inOutCubic);
    const fieldR = lerp(FIELD_R, 1500, ease.inCubic(leave));
    // the dive: an ink disc opens from the groove floor at the centre and swallows the plate
    const holeR = keys(t, [[this.tThat - 0.02, 0], [this.tThat + 0.4, 690, ease.outCubic], [this.tSur - 0.02, 1180, ease.inOutCubic]]);
    const dark = prog(t, this.tThat + 0.12, this.tSur - 0.02);
    const cs = this.camAt(t);
    lookUp(this.cam, cs.pos, cs.tgt, cs.up, cs.fov);
    // it opens on the bracketed base pair and drifts to the frame centre as it grows
    const hc = this.helix.bps[FIRST]!.c, hp = this.cam.proj(hc.x, hc.y, hc.z);
    const hk = prog(holeR, 0, 700, ease.inOutCubic);
    const hole = { x: lerp(hp.x, CX, hk), y: lerp(hp.y, CY, hk), r: holeR };
    const u = this.bg.u;
    (u.uField!.value as THREE.Vector3).set(CX, CY, fieldR);
    u.uFieldA!.value = 1 - leave;
    u.uDarkA!.value = holeR > 0 ? 1 : 0;
    (u.uDark!.value as THREE.Vector3).set(hole.x, hole.y, holeR);
    this.bg.render(renderer, out);

    const c = this.draw.ctx;
    this.draw.clear();
    const s = plateState(t, this.T);
    if (leave <= 0) {
      drawPlate(c, this.helix, this.cam, s, { pxNm: PLATE_PX_NM * lerp(1, 1.2, prog(t, this.d1, this.tE, ease.inOutCubic)) });
    } else {
      const ruleK = prog(t, this.tSur, this.tSur + 0.55, ease.linear);
      this.helix.draw(c, this.cam, {
        focus: FIRST, clip: leave < 1 ? { x: CX, y: CY, r: fieldR - 1 } : null,
        gloom: 0.3 * prog(t, this.d4, this.tSur), heroLit: prog(holeR, 90, 260), hole,
        rule: ruleK, ruleIdx: FIRST, ruleY: RULE.y, ruleX0: RULE.x0, ruleX1: RULE.x1,
      });
      drawFieldRing(c, CX, CY, fieldR, 1 - leave);
      // the bracket keeps its base through the turn, then lets go as the dive begins
      const bc = this.helix.baseCentre(this.cam, FIRST);
      const bA = 1 - prog(t, e0 + 0.2, e0 + 0.55);
      if (bc.scr.w > 0.2) {
        const hw = clamp(bc.halfLen * bc.scr.s + 16, 20, 200), hh = clamp(0.3 * bc.scr.s, 20, 70);
        bracketBox(c, bc.scr.x, bc.scr.y, hw, hh, { alpha: bA, k: 11 });
        orangePoint(c, bc.scr.x, bc.scr.y, 5, bA);
      }
      scaleBar(c, PLATE_PX_NM * 1.2, '1 nm', 1 - prog(t, e0, e0 + 0.25));
    }

    // ---- lyrics (same canvas: one upload per frame)
    const tc = c;
    const fam = F.archivo(100, 800);
    const w = this.l1.words;
    const a1 = 1 - prog(t, this.tYour + 0.05, this.tYour + 0.35);
    karaokeRow(tc, w.slice(0, 3), 128, 420, fam, 76, t, a1, { on: 'ink' });
    karaokeRow(tc, w.slice(3, 5), 128, 510, fam, 76, t, a1, { on: 'ink' });
    karaokeRow(tc, w.slice(5), 128, 600, fam, 76, t, a1, { on: 'ink' });
    {
      const q = this.cam.proj(this.anchor.x, this.anchor.y, this.anchor.z);
      // before the tower settles the rows wait at their start; then they ride the backbone's vertical travel
      const k = prog(t, this.e1 - 0.25, this.e1 + 0.05, ease.inOutCubic);
      const x = ROW2.x, y = clamp(lerp(ROW2.y, q.y + this.aOff.y, k), 250, 880);
      const a2 = 1 - prog(t, this.tThat, this.tThat + 0.2);
      const w2 = this.l2.words;
      karaokeRow(tc, w2.slice(0, 2), x, y, fam, 76, t, a2, { on: 'ink' });
      karaokeRow(tc, w2.slice(2), x, y + 90, fam, 76, t, a2, { on: 'ink' });
    }
    // "that's no surprise" sits on the rule-to-be: bone inside the ink disc, ink outside it
    tc.save(); tc.beginPath(); tc.arc(hole.x, hole.y, Math.max(0.01, holeR), 0, Math.PI * 2); tc.clip();
    karaokeRow(tc, this.l3.words, RULE.x0, RULE.y - 40, fam, 76, t, 1, { on: 'bone' });
    tc.restore();
    if (holeR < 1180) {
      tc.save(); tc.beginPath(); tc.rect(0, 0, 1920, 1080); tc.arc(hole.x, hole.y, Math.max(0.01, holeR), 0, Math.PI * 2, true); tc.clip('evenodd');
      karaokeRow(tc, this.l3.words, RULE.x0, RULE.y - 40, fam, 76, t, 1, { on: 'ink' });
      tc.restore();
    }
    comp.draw(renderer, this.draw.upload(), out);
    // "sparks": the orange point glints once (HDR, so the bloom takes it)
    const gA = 0.7 * Math.pow(0.5, Math.max(0, t - this.tSparks) / 0.16) * prog(t, this.tSparks - 0.03, this.tSparks);
    if (gA > 0.01 && leave < 0.5) {
      const bc = this.helix.baseCentre(this.cam, FIRST);
      signalGlint(this.glint, bc.scr.x, bc.scr.y, gA);
      this.glint.render(renderer, out);
    }
    return { paper: 1 - dark, frame: 1 - dark, bloom: 0.2, bloomThreshold: 1.2, vignette: 0.12, grain: 0.04, halation: 0.05, ca: 0.4 };
  }
}
