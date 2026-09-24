// "Trajectory, revised". Verse 3, part 2. One continuous drawing sheet, the camera never at rest.
//  1. "Sharp left turn": a top-down engineering roadmap (SRR · PDR · CDR · TRR · LAUNCH); the
//     spark runs the planned route, lyrics painted on it as road markings; on "left" it swerves
//     90° and the camera whips round with it (true multi-tap motion blur), leaving the plan.
//  2. "and there you are": AND / THERE keep being painted on the new road as the spark brakes
//     into terra incognita; on "there" it lands in a crater, a survey marker drops and the
//     contour lines ripple. On "you" the camera cranes out with a quarter-turn: the crater is an
//     eye, the terrain is the mask (a topographic smile). YOU / ARE are stamped on it as map
//     labels; the second eye lights; a deadpan callout files it as an unplanned object.
//  3. "Without a single CDR": a whip north to the review schedule on the same sheet. Time runs
//     along x at the song's rate: the lyric words are Gantt bars filled as sung, cascading into
//     the milestone lane; SRR and PDR are stamped on the beats; the playhead stalls at an empty,
//     dashed CDR slot while the camera punches in on each syllable; then it zips past TRR
//     (skipped) to LAUNCH (ahead of schedule). Everything drains but the empty slot, which
//     folds into the orange caret of the next prompt.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, keys, lerp, prog, pulse } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';
import { MAP, FACE, EYE_R, routeAt, ROUTE_LA, ROUTE_LC, ROUTE_EYE, drawMap, makeMarksTexture, canvasTex, makeMapPass, WorldLayer } from './leftturn-map';
import { GANTT, Schedule } from './leftturn-gantt';
import { PDoom, formatPDoom } from '../engine/hud';

function wordOf(l: Line, s: string): Word {
  const q = norm(s);
  return l.words.find((w) => norm(w.w).includes(q)) ?? l.words[0]!;
}

type Cam = { x: number; y: number; rot: number; zoom: number };

/** Blend two camera poses (zoom in log space). */
function mixCam(a: Cam, b: Cam, k: number): Cam {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), rot: lerp(a.rot, b.rot, k), zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)) };
}

/** The gato prompt's caret on its first frame (screen px): the slot lands exactly there. */
const CARET = { x: 1150, y: 631, w: 5.6, h: 86 };

export default class LeftTurn extends Scene {
  map!: ReturnType<typeof makeMapPass>;
  ov = new WorldLayer();
  glow = new LineBatch(6000);
  pd!: PDoom;
  sch!: Schedule;
  T = {
    l5: null as unknown as Line, l6: null as unknown as Line,
    sharp: 0, left: 0, turn: 0, and: 0, there: 0, you: 0, youEnd: 0, are: 0, without: 0, cdr: 0,
    tPDR: 0, db1: 0, call: 0, whip0: 0, snare: 0, launch: 0, drain0: 0, cdrSyl: [] as number[],
    beats: [] as number[],
  };

  override init() {
    this.map = makeMapPass(canvasTex(drawMap(), true), makeMarksTexture(), this.ov);
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.pd = new PDoom(ly);
    const T = this.T;
    const beatAfter = (t: number) => au.timeOfBeat(Math.ceil(au.beatAt(t) - 1e-6));
    const beatBefore = (t: number) => au.timeOfBeat(Math.floor(au.beatAt(t) + 1e-6));
    const downAfter = (t: number) => au.downbeats.find((d) => d >= t - 1e-6) ?? beatAfter(t);
    T.l5 = ly.get('Sharp left');
    T.l6 = ly.get('single CDR');
    T.sharp = wordOf(T.l5, 'sharp').start;
    T.left = wordOf(T.l5, 'left').start;
    T.turn = wordOf(T.l5, 'turn').start;
    T.and = wordOf(T.l5, 'and').start;
    T.there = wordOf(T.l5, 'there').start;
    const you = wordOf(T.l5, 'you');
    T.you = you.start; T.youEnd = you.end;
    T.are = wordOf(T.l5, 'are').start;
    T.without = wordOf(T.l6, 'without').start;
    const cdr = wordOf(T.l6, 'cdr');
    T.cdr = cdr.start;
    T.cdrSyl = cdr.syl && cdr.syl.length >= 3 ? cdr.syl.map((s) => s[0]) : [0, 1, 2].map((i) => cdr.start + i * 0.4);
    T.tPDR = beatAfter(T.sharp + 0.12);
    T.db1 = downAfter(T.you);
    T.call = beatAfter(T.are + 0.2);
    T.whip0 = Math.max(beatBefore(T.without), T.without - 0.3) - 0.03;
    const SRR = beatAfter(T.without + 0.05);
    const PDR = downAfter(SRR + 0.05);
    const TRR = downAfter(T.cdrSyl[1]!);
    T.launch = beatAfter(T.cdrSyl[2]! + 0.1);
    T.snare = beatBefore(T.cdr);
    T.drain0 = beatBefore(this.ctx.end - 0.05);
    T.beats = [];
    for (let b = Math.floor(au.beatAt(T.without - 1)); au.timeOfBeat(b) < this.ctx.end + 1; b++) T.beats.push(au.timeOfBeat(b));
    const head = T.l6.words.filter((w) => norm(w.w) !== 'cdr');
    this.sch = new Schedule({
      t0: T.without, words: head, cdr, syl: T.cdrSyl, SRR, PDR, TRR, LAUNCH: T.launch,
      zip0: T.launch - 0.24, beats: T.beats, downbeats: au.downbeats.filter((d) => d > T.without - 1 && d < this.ctx.end + 1),
      drain0: T.drain0, end: this.ctx.end,
    }, formatPDoom(this.pd.value(T.without)));
  }

  // ---------------------------------------------------------------- the spark on the route
  sparkS(t: number) {
    const T = this.T, s0 = this.ctx.start;
    const srr = MAP.Y0 - MAP.ms[0]!.y, pdr = MAP.Y0 - MAP.ms[1]!.y;
    const tc = T.left + 0.13, sc = ROUTE_LA + ROUTE_LC + 40;
    if (t < tc) {
      return keys(t, [[s0 - 0.1, 0], [T.sharp, srr, ease.inQuad], [T.tPDR, pdr, ease.linear], [T.left, ROUTE_LA - 10, ease.linear], [tc, sc, ease.linear]]);
    }
    // out of the corner at speed, braking into the crater on "there" (cubic Hermite, v1 = 0)
    const D = ROUTE_EYE - sc, dur = T.there - tc, v0 = (ROUTE_LC + 50) / 0.13;
    const u = clamp((t - tc) / dur);
    return sc + (u * u * u - 2 * u * u + u) * v0 * dur + (-2 * u * u * u + 3 * u * u) * D;
  }

  // ---------------------------------------------------------------- camera
  /** Chase, brake, land: the camera rides behind the spark, then settles over the crater. */
  camLand(t: number): Cam {
    const T = this.T;
    const sp = routeAt(this.sparkS(t));
    const turn = (Math.PI / 2) * prog(t, T.left - 0.02, T.left + 0.24, ease.inOutCubic);
    const hx = -Math.sin(turn), hy = -Math.cos(turn); // forward (screen up) in world coords
    const lead = keys(t, [[T.turn + 0.25, 230], [T.and, -40, ease.inOutQuad], [T.there, 20, ease.inOutQuad]]);
    let zoom = keys(t, [[this.ctx.start, 0.78], [T.sharp, 0.86, ease.outCubic], [T.left, 1.0, ease.inOutQuad], [T.left + 0.2, 1.12, ease.outCubic], [T.turn + 0.3, 0.95, ease.inOutQuad], [T.there, 1.02, ease.inOutCubic]]);
    // the landing punch, then a slow creep in
    zoom *= 1 + 0.32 * ease.outExpo(prog(t, T.there, T.there + 0.3)) + 0.07 * prog(t, T.there + 0.3, T.you, ease.inOutQuad);
    if (t > T.there + 0.2) zoom *= 1 + 0.03 * this.ctx.audio.hit('kick', t, 0.09);
    const rot = turn + 0.09 * prog(t, T.there, T.you + 0.2, ease.inOutQuad);
    return { x: sp.x + hx * lead, y: sp.y + hy * lead, rot, zoom };
  }

  /** The reveal: the whole face, north up. */
  camWide(t: number): Cam {
    const T = this.T;
    // lands on the downbeat, punches on "are", reframes tighter with a roll on the snare
    const snap = ease.outExpo(prog(t, T.call, T.call + 0.22));
    const z = 0.43 * (1 + 0.05 * prog(t, T.db1, T.whip0 + 0.1, ease.inOutQuad)) * (1 + 0.05 * pulse(t, T.are, 0.1)) * (1 + 0.17 * snap);
    const rot = -0.02 * prog(t, T.db1, T.call, ease.inOutQuad) + 0.045 * ease.outBack(prog(t, T.call, T.call + 0.3));
    return { x: FACE.x + 60 - 150 * snap, y: FACE.y + 40 + 45 * snap, rot, zoom: z };
  }

  /** Tracking the playhead along the schedule, punching on the stamps. */
  camTrack(t: number): Cam {
    const T = this.T, S = this.sch.T;
    let z = 1.22 * (1 + 0.05 * ease.outExpo(prog(t, S.PDR, S.PDR + 0.25)));
    z *= 1 + 0.05 * pulse(t, S.SRR, 0.08) + 0.06 * pulse(t, S.PDR, 0.08);
    z *= 1 - 0.07 * prog(t, T.snare, T.cdr, ease.inQuad);
    const rot = -0.025 + 0.05 * ease.outBack(prog(t, S.PDR, S.PDR + 0.35));
    // the playhead sits left of centre; each stamp shoves the camera forward a touch
    const surge = 26 * (pulse(t, S.SRR, 0.1) + pulse(t, S.PDR, 0.1));
    const off = this.screenToWorldOffset(960 - 600 + surge, 0, rot, z);
    return { x: this.sch.X(t) + off.x, y: GANTT.GL - 222 + off.y, rot, zoom: z };
  }

  /** The empty slot, one punch per syllable. */
  camSlot(t: number): Cam {
    const T = this.T;
    const [, D, R] = T.cdrSyl as [number, number, number];
    let z = 2.1 * (1 + 0.1 * prog(t, T.cdr, D, ease.inOutQuad)) * (1 + 0.16 * ease.outExpo(prog(t, D, D + 0.14))) * (1 + 0.18 * ease.outExpo(prog(t, R, R + 0.14)));
    // the snare between the syllables nudges the frame: a punch and a small roll
    const sn = this.ctx.audio.events('snare', T.cdr + 0.2, D - 0.05).map((e) => e[0]);
    let roll = 0;
    for (const s of sn) { z *= 1 + 0.06 * pulse(t, s, 0.1); roll += 0.025 * ease.outBack(prog(t, s, s + 0.25)); }
    const rot = roll + 0.035 * ease.outExpo(prog(t, D, D + 0.14)) - 0.08 * ease.outExpo(prog(t, R, R + 0.14));
    const s = this.sch.slot;
    return { x: s.x + 190 + 20 * prog(t, T.cdr, T.launch), y: s.y + 10, rot, zoom: z };
  }

  /** The reveal of the whole schedule, then the push into the slot, anchored where the caret will be. */
  camEnd(t: number): Cam {
    const T = this.T, end = this.ctx.end;
    // the whole schedule, drifting in
    const x0 = this.sch.X(T.without - 0.45), x1 = this.sch.X(T.launch) + 150;
    const wide: Cam = { x: (x0 + x1) / 2, y: GANTT.GL - 190, rot: 0.012 * prog(t, T.launch, T.drain0), zoom: 0.95 * (1 + 0.035 * prog(t, T.launch + 0.3, T.drain0 + 0.2)) };
    // then the push into the slot, anchored where the prompt's caret will be
    const zEnd = (CARET.h / 2) / GANTT.DS;
    const k = ease.inOutCubic(prog(t, T.drain0, end - 0.07));
    const z = Math.exp(lerp(Math.log(wide.zoom), Math.log(zEnd), k));
    const s = this.sch.slot;
    const anch: Cam = { x: s.x - (CARET.x - W / 2) / z, y: s.y - (CARET.y - H / 2) / z, rot: 0, zoom: z };
    const c = mixCam(wide, anch, k);
    c.zoom = z;
    return c;
  }

  /** World offset that puts the camera centre `dx,dy` screen px away (for a camera at rot, zoom). */
  screenToWorldOffset(dx: number, dy: number, rot: number, zoom: number) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return { x: (c * dx + s * dy) / zoom, y: (-s * dx + c * dy) / zoom };
  }

  camAt(t: number): Cam {
    const T = this.T;
    if (t < T.you) return this.camLand(t);
    const revEnd = T.db1 + 0.12;
    if (t < T.whip0) return mixCam(this.camLand(Math.min(t, revEnd)), this.camWide(t), 1 - Math.pow(1 - prog(t, T.you, revEnd), 3.2));
    if (t < T.without) {
      const k = ease.inOutCubic(prog(t, T.whip0, T.without));
      const c = mixCam(this.camWide(t), this.camTrack(t), k);
      c.zoom *= 1 - 0.45 * Math.sin(Math.PI * k);
      return c;
    }
    if (t < T.cdr - 0.02) return this.camTrack(t);
    if (t < T.launch - 0.03) return mixCam(this.camTrack(Math.min(t, T.cdr + 0.2)), this.camSlot(t), ease.outExpo(prog(t, T.cdr - 0.02, T.cdr + 0.18)));
    return mixCam(this.camSlot(Math.min(t, T.launch + 0.4)), this.camEnd(t), ease.outExpo(prog(t, T.launch - 0.03, T.launch + 0.4)));
  }

  kAt(t: number) {
    const T = this.T;
    return keys(t, [[T.you, 0.00035], [T.db1 + 0.1, 0.0002, ease.inOutCubic], [T.without, 0.00016, ease.inOutCubic], [T.launch, 0.00016], [T.drain0, 0.0001, ease.linear], [this.ctx.end - 0.08, 0, ease.inOutCubic]]);
  }

  /** How whip-like the camera move is right now (drives the in-shader shutter). */
  whipAt(t: number) {
    const T = this.T;
    return Math.max(
      prog(t, T.left - 0.05, T.left + 0.05) * (1 - prog(t, T.left + 0.2, T.left + 0.3)),
      prog(t, T.you, T.you + 0.05) * (1 - prog(t, T.db1 - 0.05, T.db1 + 0.1)),
      prog(t, T.whip0, T.whip0 + 0.05) * (1 - prog(t, T.without - 0.03, T.without + 0.03)),
      prog(t, T.cdr - 0.02, T.cdr) * (1 - prog(t, T.cdr + 0.08, T.cdr + 0.16)),
      prog(t, T.launch - 0.03, T.launch) * (1 - prog(t, T.launch + 0.15, T.launch + 0.3)),
    );
  }

  /** World (map px, y down) -> screen px with the keystone tilt. */
  project(wx: number, wy: number, c: Cam, K: number) {
    const dx = wx - c.x, dy = wy - c.y;
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    const fx = (cs * dx - sn * dy) * c.zoom, fy = (sn * dx + cs * dy) * c.zoom;
    const d = 1 - K * fy;
    return { x: W / 2 + fx / d, y: H / 2 + fy / d };
  }

  // ---------------------------------------------------------------- render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const T = this.T, t = f.t, s0 = this.ctx.start, end = this.ctx.end;
    const cam = this.camAt(t);
    const K = this.kAt(t);
    const whip = this.whipAt(t);
    const shutter = lerp(1 / 300, 1 / 80, whip);
    const camB = this.camAt(t - shutter);
    const u = this.map.u;
    (u.uCamA!.value as THREE.Vector4).set(cam.x, cam.y, cam.rot, cam.zoom);
    (u.uCamB!.value as THREE.Vector4).set(camB.x, camB.y, camB.rot, camB.zoom);
    const pa = this.project(cam.x + 900, cam.y - 500, cam, K), pb = this.project(cam.x + 900, cam.y - 500, camB, K);
    const pc = this.project(cam.x - 900, cam.y + 500, cam, K), pd = this.project(cam.x - 900, cam.y + 500, camB, K);
    const motion = Math.max(Math.hypot(pa.x - pb.x, pa.y - pb.y), Math.hypot(pc.x - pd.x, pc.y - pd.y));
    u.uTaps!.value = clamp(Math.ceil(motion / 3), 1, 16);
    u.uK!.value = K;
    u.uT!.value = t;
    // the drawing appears from the south as in the original cut; the north (schedule) is unveiled off-screen
    u.uReveal!.value = t < s0 + 0.5 ? lerp(MAP.Y0 + 300, 600, prog(t, s0 - 0.02, s0 + 0.35, ease.outCubic)) : -2000;
    u.uTrail!.value = this.sparkS(t);
    u.uHeat!.value = 1;
    u.uHaze!.value = keys(t, [[T.you, 0.55], [T.db1, 0.3], [T.without, 0.2], [end - 0.1, 0]]);
    // the drain: the sheet goes dark, only the slot remains
    const drain = prog(t, T.drain0, end - 0.12, ease.inOutQuad);
    u.uDim!.value = 1 - drain;
    u.uPool!.value = prog(t, T.drain0 + 0.1, end - 0.05, ease.inOutQuad);
    u.uTopo!.value = t < T.without + 0.1 ? 1 : 0;
    const wSharp = wordOf(T.l5, 'sharp'), wLeft = wordOf(T.l5, 'left'), wTurn = wordOf(T.l5, 'turn');
    const wAnd = wordOf(T.l5, 'and'), wThere = wordOf(T.l5, 'there');
    const on = (w: Word) => prog(t, w.start - 0.02, w.start + 0.04);
    const hot = (w: Word) => (t >= w.start && t < w.end + 0.08 ? 1 : 0);
    (u.uMarkOn!.value as THREE.Vector4).set(on(wSharp), on(wLeft), on(wTurn), 0);
    (u.uMarkHot!.value as THREE.Vector4).set(hot(wSharp), hot(wLeft), hot(wTurn), 0);
    (u.uMarkOn2!.value as THREE.Vector2).set(on(wAnd), on(wThere));
    (u.uMarkHot2!.value as THREE.Vector2).set(hot(wAnd), hot(wThere));
    (u.uChecks!.value as THREE.Vector2).set(prog(t, T.sharp, T.sharp + 0.04), prog(t, T.tPDR, T.tPDR + 0.04));
    (u.uEye!.value as THREE.Vector2).set(prog(t, T.there, T.there + 0.1), prog(t, T.are - 0.02, T.are + 0.08));
    // the face breathes on the beat: ripples through the contours, the eyes flare on the kicks
    const au = this.ctx.audio;
    const bi = Math.floor(au.beatAt(t));
    const rip = [bi, bi - 1].map((b) => {
      const tb = au.timeOfBeat(b), e = t - tb;
      const live = tb > T.there + 0.2 && tb < T.whip0 ? 1 : 0;
      return [1500 * e, live * 0.9 * Math.exp(-e / 0.45)] as const;
    });
    (u.uRip!.value as THREE.Vector4).set(rip[0]![0], rip[0]![1], rip[1]![0], rip[1]![1]);
    u.uEyePulse!.value = t > T.there + 0.2 && t < T.without ? au.hit('kick', t, 0.1) : 0;
    const we = t - T.there;
    (u.uWave!.value as THREE.Vector4).set(EYE_R.x, EYE_R.y, 1700 * Math.max(0, we), we > 0 ? 1.8 * Math.exp(-we / 0.35) : 0);

    // ---- the world overlay (labels, schedule), drawn with the current camera
    const L = this.ov;
    L.begin(cam);
    const c = L.c;
    if (t < T.there) this.drawStamps(c, t);
    if (t < T.without + 0.05) this.drawTerrain(c);
    if (t >= T.and - 0.3 && t < T.without + 0.05) this.drawArrival(c, t, L.px);
    if (t >= T.whip0 - 0.05) {
      const morph = ease.inOutCubic(prog(t, T.drain0 + 0.08, end - 0.1));
      this.sch.draw(c, t, L.px, {
        alpha: 1, keep: 1 - prog(t, T.drain0, T.drain0 + 0.3, ease.inOutQuad), morph,
        caret: { hw: (CARET.w / 2) / cam.zoom, hh: (CARET.h / 2) / cam.zoom },
      });
    }
    L.upload();
    (u.uOvCam!.value as THREE.Vector4).set(cam.x, cam.y, cam.rot, cam.zoom);
    this.map.render(renderer, out);

    // ---- the spark
    const g = this.glow; g.clear();
    if (t < T.there + 0.5) {
      const headAt = (tt: number) => { const p = routeAt(this.sparkS(tt)); return this.project(p.x, p.y, this.camAt(tt), this.kAt(tt)); };
      const hp = headAt(t);
      const I = 1 - prog(t, T.there + 0.05, T.there + 0.45);
      sparkParticles(g, t, headAt, { rate: 120, speed: 280, intensity: 1.1 * I, seed: 8, width: 2 });
      sparkHead(g, hp.x, hp.y, t, 1.5 * Math.min(cam.zoom, 1.2), 1.3 * I);
    }
    const S = this.sch.T;
    if (t > T.without - 0.1 && t < S.LAUNCH + 0.5) {
      const headAt = (tt: number) => this.project(this.sch.playX(tt), GANTT.GL, this.camAt(tt), this.kAt(tt));
      const hp = headAt(t);
      const I = prog(t, T.without - 0.1, T.without) * (1 - prog(t, S.LAUNCH + 0.1, S.LAUNCH + 0.45));
      const stall = t > T.cdr - 0.1 && t < S.zip0;
      sparkParticles(g, t, headAt, { rate: stall ? 50 : 110, speed: stall ? 160 : 240, intensity: 0.9 * I, seed: 12, width: 1.6 });
      sparkHead(g, hp.x, hp.y, t, 0.9 * Math.min(Math.sqrt(cam.zoom), 1.5), 1.2 * I);
    }
    g.render(renderer, out);

    // ---- post
    const corner = pulse(t, T.left, 0.08);
    const land = pulse(t, T.there, 0.07);
    const stampHit = Math.max(pulse(t, S.SRR, 0.06), pulse(t, S.PDR, 0.07), pulse(t, S.LAUNCH, 0.07));
    const sylHit = Math.max(...T.cdrSyl.map((s) => pulse(t, s, 0.06)));
    const sh = 10 * corner + 16 * land + 6 * stampHit + 7 * sylHit;
    return {
      bloom: lerp(0.75, 0.7, drain) - 0.2 * prog(t, T.there, T.there + 0.2) * (1 - prog(t, T.you, T.db1)), bloomThreshold: lerp(0.85, 0.95, drain), bloomKnee: lerp(0.5, 0.25, drain),
      vignette: lerp(0.45, 0.6, drain), grain: lerp(0.055, 0.065, drain),
      fade: 1 - prog(t, s0 - 0.02, s0 + 0.12),
      shake: [Math.sin(t * 93) * sh, Math.cos(t * 71) * sh * 0.8],
      ca: 1.2 + 4 * corner + 5 * whip + 2 * land,
      zoom: 1 + 0.03 * corner,
    };
  }

  // ---------------------------------------------------------------- overlay drawings
  /** "PASSED" beside the checks on the planned route. */
  drawStamps(c: CanvasRenderingContext2D, t: number) {
    const T = this.T;
    const stamp = (i: number, t0: number) => {
      if (t < t0) return;
      const m = MAP.ms[i]!;
      const e = t - t0;
      const a = prog(e, 0, 0.03) * (1 - prog(e, 0.5, 0.8));
      c.save(); c.translate(MAP.PX - 132, m.y - 70); c.rotate(-0.08);
      c.font = font(F.mono(600), 20); c.fillStyle = rgba('signal', a); c.textAlign = 'center';
      c.fillText('PASSED', 0, 0);
      c.restore();
    };
    stamp(0, T.sharp);
    stamp(1, T.tPDR);
  }

  /** Terra incognita, lettered along the upper rim of the unplanned object (a map label). */
  drawTerrain(c: CanvasRenderingContext2D) {
    c.save();
    c.font = font(F.serif(400, true), 84);
    c.fillStyle = rgba('ash', 0.75);
    c.textAlign = 'center';
    const label = 'Terra incognita';
    const R = FACE.r * 0.8;
    const wTot = c.measureText(label).width;
    let a = -Math.PI / 2 - (wTot / R) / 2;
    for (const ch of label) {
      const cw = c.measureText(ch).width;
      const am = a + cw / 2 / R;
      c.save();
      c.translate(FACE.x + Math.cos(am) * R, FACE.y + Math.sin(am) * R);
      c.rotate(am + Math.PI / 2);
      c.fillText(ch, 0, 0);
      c.restore();
      a += cw / R;
    }
    c.restore();
  }

  /** The landing marker, the map labels on the face, the callout. */
  drawArrival(c: CanvasRenderingContext2D, t: number, px: number) {
    const T = this.T;
    const wYou = wordOf(T.l5, 'you'), wAre = wordOf(T.l5, 'are');
    const col = (w: Word, vis: number) => {
      const p = Lyrics.wordProgress(w, t);
      if (p <= 0) return rgba('bone', 0.16 * vis);
      return p < 1 ? rgba('signal', 1) : rgba('bone', 1);
    };
    // the survey marker dropping on the crater
    const e = t - T.there;
    if (e > -0.14) {
      const fall = ease.inQuad(prog(e, -0.14, 0));
      const s = lerp(3.6, 1, fall);
      const ma = prog(e, -0.14, -0.06);
      const R0 = 132;
      c.save();
      c.translate(EYE_R.x, EYE_R.y);
      c.globalAlpha = ma;
      // drop shadow converging as it falls
      if (e < 0) {
        c.strokeStyle = rgba('ink', 0.6); c.lineWidth = 10 * px;
        c.beginPath(); c.arc(40 * (s - 1), 40 * (s - 1), R0 * s, 0, Math.PI * 2); c.stroke();
      }
      c.strokeStyle = rgba('bone', 0.95); c.lineWidth = 3 * px;
      c.beginPath(); c.arc(0, 0, R0 * s, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2 * px;
      for (let i = 0; i < 4; i++) {
        const an = (i + 0.5) * Math.PI / 2;
        c.beginPath();
        c.moveTo(Math.cos(an) * (R0 - 26) * s, Math.sin(an) * (R0 - 26) * s);
        c.lineTo(Math.cos(an) * (R0 + 44) * s, Math.sin(an) * (R0 + 44) * s);
        c.stroke();
      }
      // shock ring
      if (e > 0) {
        const rr = R0 * (1 + 5 * ease.outCubic(prog(e, 0, 0.5)));
        c.strokeStyle = rgba('signal', 0.8 * (1 - prog(e, 0.05, 0.5))); c.lineWidth = 2.5 * px;
        c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
    }

    // YOU / ARE: map labels stamped on the forehead and the chin
    const stampWord = (w: Word, text: string, x: number, y: number, size: number) => {
      const vis = prog(t, w.start - 0.15, w.start);
      if (vis <= 0) return;
      const k = t >= w.start ? 1 + 0.35 * Math.pow(0.5, (t - w.start) / 0.06) : 1;
      c.save();
      c.translate(x, y); c.scale(k, k);
      c.font = font(F.archivo(125, 900), size);
      c.textAlign = 'center';
      c.fillStyle = col(w, vis);
      c.fillText(text, 0, size * 0.36);
      c.restore();
    };
    stampWord(wYou, 'YOU', FACE.x, FACE.y - FACE.r * 0.5, 250);
    stampWord(wAre, 'ARE', FACE.x, FACE.y + FACE.r * 0.72, 250);

    // deadpan callout, filed on the snare
    const ca = prog(t, T.call - 0.01, T.call + 0.04);
    if (ca > 0) {
      const an = -Math.PI * 0.8;
      const ex = FACE.x + Math.cos(an) * FACE.r, ey = FACE.y + Math.sin(an) * FACE.r;
      const k = ease.outExpo(prog(t, T.call, T.call + 0.2));
      const lx = ex - 200 * k, ly = ey - 150 * k;
      c.save();
      c.globalAlpha = ca;
      c.strokeStyle = rgba('bone', 0.9); c.lineWidth = 2 * px;
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(lx, ly); c.lineTo(lx - 700 * k, ly); c.stroke();
      c.fillStyle = rgba('bone', 1);
      c.beginPath(); c.arc(ex, ey, 5 * px, 0, Math.PI * 2); c.fill();
      c.textAlign = 'right';
      c.font = font(F.mono(600), 68); c.fillStyle = rgba('bone', 1);
      c.fillText('UNPLANNED OBJECT', lx, ly - 26);
      c.font = font(F.mono(400), 50); c.fillStyle = rgba('ash', 1);
      c.fillText('not on roadmap', lx, ly + 66);
      c.restore();
    }
  }
}
