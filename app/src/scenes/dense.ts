// "Scale, post-Chinchilla". The bridge, part 2, in three movements cut on the beat:
//  1–2. "Post-Chinchilla, super-dense" / "Breaking through each safety fence": typographic
//     pressure. The lyric is compressed kick by kick inside the broadcast title-safe area until it
//     is a solid slab, then bursts through the frame's own safe areas (title-safe, action-safe, the
//     frame edge itself). See dense-press.ts.
//  3. "Hundred thousand GPU": top-down grid of 100,000 cells flickering in waves; the cells spell
//     the words; mono counter.
//  4. "RLHF goes askew": the whole frame goes off-kilter beat by beat: the table tilts, the type
//     leans, the mask rolls off the thing and is thrown back on upside down. See dense-askew.ts.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';
import { ease, lerp, prog, pulse, smoothstep } from '../engine/util';
import { rgba } from '../engine/palette';
import { GpuFloor } from './dense-gpu';
import { Askew, ROLL_IN } from './dense-askew';
import { Press } from './dense-press';
import { beatsIn, cutBeat } from './stack-kit';
import { PDoom, formatPDoom } from '../engine/hud';

export default class Dense extends Scene {
  gpu!: GpuFloor;
  askew!: Askew;
  press!: Press;
  hud = new Layer2D();
  glow = new LineBatch(256, { screen2D: true, blend: 'add' });
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  c2 = 0; c3 = 0; c4 = 0;
  beats: number[] = [];
  pd!: PDoom;

  override async init() {
    const { lyrics, audio } = this.ctx;
    this.L1 = lyrics.get('Post-Chinchilla');
    this.L2 = lyrics.get('safety fence');
    this.L3 = lyrics.get('Hundred thousand');
    this.L4 = lyrics.get('RLHF');
    this.c2 = cutBeat(audio, this.L2.words[0]!.start);
    this.c3 = cutBeat(audio, this.L3.words[0]!.start);
    this.c4 = cutBeat(audio, this.L4.words[0]!.start);
    this.beats = beatsIn(audio, this.ctx.start - 2, this.ctx.end + 1);
    this.pd = new PDoom(lyrics);
    this.press = new Press(audio, this.L1, this.L2, this.ctx.start, this.c2, this.c3);
    this.askew = new Askew(audio, this.L4, this.c4, this.ctx.end);
    this.gpu = new GpuFloor(this.L3.words.map((x) => x.w.replace(/[^A-Za-z]/g, '').toUpperCase()));
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t;
    if (t < this.c3) return this.renderPress(f, out);
    if (t < this.c4) return this.renderGpu(f, out);
    return this.renderAskew(f, out);
  }

  // ------------------------------------------------------------ 1–2. the press
  private renderPress(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const L = this.hud; L.clear();
    const post = this.press.draw(L.ctx, f.t, this.glow);
    this.ctx.comp.draw(renderer, L.upload(), out, { mode: 'replace' });
    if (this.glow.count) this.glow.render(renderer, out);
    return post;
  }

  private lastBeats(t: number, n = 4) {
    const k = this.beats.filter((b) => b <= t).slice(-n);
    while (k.length < n) k.unshift(-99);
    return k;
  }

  // ------------------------------------------------------------ 3. GPU floor
  private renderGpu(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const t = f.t;
    const [wH, wT, wG] = this.L3.words as [any, any, any];
    const u = this.gpu.pass.u;
    const t0 = this.c3;
    // crane up: from one GPU (macro) to all 100,000 (exponential zoom), with a slow rotation
    // starts inside the stem of the first lit letter, pulls out fast so the word reads while sung
    const k = prog(t, t0 + 0.04, Math.max(t0 + 0.3, wH.start + 0.32), ease.outCubic);
    const zFar = 4.62;
    let z = Math.exp(lerp(Math.log(46), Math.log(zFar), k));
    const settle = prog(t, t0 + 0.9, this.c4, ease.linear);
    z *= 1 + 0.03 * settle;
    const beatsK = this.lastBeats(t);
    z *= 1 + pulse(t, beatsK[3]!, 0.07) * 0.02;
    const rot = lerp(0.35, 0.0, ease.outCubic(k)) - 0.04 * settle;
    // dutch roll begins on the last beat before RLHF (bridges into movement 4)
    const lastB = this.beats.filter((b) => b < this.c4 - 0.05).pop() ?? this.c4 - 0.45;
    const rollIn = prog(t, lastB, this.c4, ease.inCubic) * (ROLL_IN - 0.04);
    const [WX, WY] = this.gpu.worldSize;
    const fk = ease.inOutCubic(k);
    const cx = lerp(this.gpu.focus[0], 0, fk), cy = lerp(this.gpu.focus[1], 0, fk);
    void WX; void WY;
    (u.camC!.value as THREE.Vector2).set(cx, cy);
    u.camZ!.value = z; u.camRot!.value = rot - rollIn; u.t!.value = t; // shader +rot is counter-clockwise
    (u.prog!.value as THREE.Vector4).set(Lyrics.wordProgress(wH, t), Lyrics.wordProgress(wT, t), Lyrics.wordProgress(wG, t), 0);
    (u.ghost!.value as THREE.Vector3).set(smoothstep(wH.start - 0.4, wH.start, t), smoothstep(wT.start - 0.4, wT.start, t), smoothstep(wG.start - 0.4, wG.start, t));
    (u.beatT!.value as THREE.Vector4).set(beatsK[0]!, beatsK[1]!, beatsK[2]!, beatsK[3]!);
    u.detail!.value = smoothstep(7, 26, z);
    u.heatK!.value = 1;
    u.lit!.value = 1 + pulse(t, wG.start, 0.1) * 0.2;
    this.gpu.pass.render(renderer, out);
    // counter
    const L = this.hud; L.clear(); const c = L.ctx;
    const val = t < wT.start ? Math.round(100 * ease.outCubic(prog(t, wH.start, wH.start + 0.25))) : Math.round(lerp(100, 100000, ease.outExpo(prog(t, wT.start, wT.start + 0.35))));
    c.save();
    c.translate(W / 2, H / 2); c.rotate(rollIn + 0.04 * settle); c.translate(-W / 2, -H / 2);
    const pxX = 1335, pxY = 772;
    const ph = 178;
    c.fillStyle = rgba('ink', 0.9);
    c.fillRect(pxX, pxY, 380, ph);
    c.strokeStyle = rgba('bone', 0.35); c.lineWidth = 1; c.strokeRect(pxX + 0.5, pxY + 0.5, 380, ph);
    c.translate(pxX - 96, pxY - 88);
    c.font = font(F.mono(500), 14); c.letterSpacing = '3px'; c.fillStyle = rgba('bone', 0.6);
    c.fillText('ACCELERATORS ONLINE', 116, 116);
    c.letterSpacing = '0px';
    c.font = font(F.mono(500), 58); c.fillStyle = t >= wH.start ? rgba('bone', 0.95) : rgba('bone', 0.4);
    c.fillText(val.toLocaleString('en-US').padStart(7, ' '), 112, 178);
    c.font = font(F.mono(400), 14); c.fillStyle = rgba('bone', 0.5);
    c.fillText(`util ${(97 + 2.9 * Math.abs(Math.sin(t * 3.1))).toFixed(1)}%  ·  1.4 GW  ·  ${GXY} cells`, 116, 212);
    // P(doom) cameo: one more line on the dashboard, a hairline rule above it
    c.fillStyle = rgba('bone', 0.18); c.fillRect(116, 226, 348, 1);
    c.font = font(F.mono(500), 15); c.letterSpacing = '2px'; c.fillStyle = rgba('signal', 0.95);
    c.fillText(`P(DOOM) ${formatPDoom(this.pd.value(t))}`, 116, 250);
    c.letterSpacing = '0px'; c.font = font(F.mono(400), 13); c.fillStyle = rgba('bone', 0.45);
    c.textAlign = 'right'; c.fillText('scaling as planned', 116 + 348, 250); c.textAlign = 'left';
    c.restore();
    this.ctx.comp.draw(renderer, L.upload(), out);
    return { bloom: 0.55, vignette: 0.45, ca: 1.3 };
  }

  // ------------------------------------------------------------ 4. askew
  private renderAskew(f: Frame, out: THREE.WebGLRenderTarget) {
    return this.askew.render(this.ctx.renderer, out, this.ctx.comp, this.hud, f.t);
  }

}

const GXY = '400\u00D7250';
