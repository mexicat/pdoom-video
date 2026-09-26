// FIG. 9 — "Paperclips, filling a room" (chorus 3, the quiet breakdown).
//  A  "as paperclips fill the room": the spark's line bends into one Gem clip (top-down, engraved),
//     which cools into steel and replicates on 8th notes (1 → 64), then the lattice floods the plane.
//  B  the camera swings down from overhead to a low glide across an endless floor of clips (raymarched).
//  C  "Killswitch guy's on PTO": an out-of-office auto-reply floats over the lattice, typed as sung.
//  D  "Now there's nowhere left to go": a ceiling of clips slams down beat by beat; the lyric lives in
//     the shrinking slot at the horizon (Archivo width 62), squeezed until the slot is a single line.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H, SS_TAP } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, plain } from '../engine/type';
import { Lyrics, type Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog, keys, hash, noise1, smoothstep, type Key } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';
import { PDoom, formatPDoom } from '../engine/hud';
import { S_END, clipPath, CLIP } from './paperclips-geo';
import { FRAG_TOP, FRAG_MARCH, MAX_ITEMS } from './paperclips-glsl';

const FOV = 32; // vertical, degrees
const FOCAL = H / 2 / Math.tan((FOV * Math.PI) / 360);

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

interface Cam { pos: V3; R: V3; U: V3; F: V3 }
function lookCam(pos: V3, fwd: V3, roll = 0): Cam {
  const Fw = nrm(fwd);
  let R = cross(Fw, [0, 0, 1]);
  if (Math.hypot(...R) < 1e-4) R = [1, 0, 0];
  R = nrm(R);
  let U = cross(R, Fw);
  const c = Math.cos(roll), s = Math.sin(roll);
  const R2: V3 = [R[0] * c + U[0] * s, R[1] * c + U[1] * s, R[2] * c + U[2] * s];
  const U2: V3 = [U[0] * c - R[0] * s, U[1] * c - R[1] * s, U[2] * c - R[2] * s];
  return { pos, R: R2, U: U2, F: Fw };
}
/** World → canvas pixels (y down). */
function project(c: Cam, p: V3): { x: number; y: number; z: number } {
  const d = sub(p, c.pos);
  const z = dot(d, c.F);
  return { x: W / 2 + (FOCAL * dot(d, c.R)) / z, y: H / 2 - (FOCAL * dot(d, c.U)) / z, z };
}

// ------------------------------------------------------------------ scene
interface Times {
  start: number; end: number; db1: number; splits: number[]; fill: number; tilt0: number; tilt1: number;
  card0: number; card1: number; d0: number; slams: number[];
}

const camUniforms = () => ({
  camPos: { value: new THREE.Vector3() }, camR: { value: new THREE.Vector3() }, camU: { value: new THREE.Vector3() }, camF: { value: new THREE.Vector3() },
  focal: { value: FOCAL }, res: { value: new THREE.Vector2(W, H) }, time: { value: 0 }, ssTap: SS_TAP,
  keyDir: { value: new THREE.Vector3() }, keyI: { value: 1 }, rimDir: { value: new THREE.Vector3() }, rimI: { value: 1 },
  lampPos: { value: new THREE.Vector3() }, lampI: { value: 0 },
  fillT: { value: -1 }, groupHalf: { value: new THREE.Vector2(80, 80) },
});

const LEAD = 26; // lead-in length of the spark's line before it bends into the clip

export default class Paperclips extends Scene {
  top = new FSPass(FRAG_TOP, {
    ...camUniforms(),
    items: { value: Array.from({ length: MAX_ITEMS }, () => new THREE.Vector4()) }, nItems: { value: 1 },
    sT0: { value: 0 }, sH0: { value: 0 }, rad0: { value: 0.45 }, hot0: { value: 0 }, rad: { value: CLIP.WIRE },
  });
  march = new FSPass(FRAG_MARCH, {
    ...camUniforms(),
    rad: { value: CLIP.WIRE }, pz: { value: 2.4 }, ceilZ: { value: 1000 }, lowerOn: { value: 1 }, fogK: { value: 0.01 }, fogFar: { value: 400 },
    slitK: { value: 0 }, slitH: { value: 100 }, horizonY: { value: 0 },
  });
  sparks = new LineBatch(3000);
  layer = new Layer2D();
  T!: Times;
  L1!: Line; L2!: Line; L3!: Line;
  pdoom!: PDoom;

  override init() {
    const { lyrics: ly, audio: au, start, end } = this.ctx;
    this.L1 = ly.get('as paperclips');
    this.L2 = ly.get('Killswitch');
    this.L3 = ly.get('nowhere left');
    this.pdoom = new PDoom(ly);
    // the clip cools into steel on the first beat at/after "paperclips"; it replicates on the 8ths after
    const bB1 = Math.ceil(au.beatAt(this.L1.words[1]!.start - 0.06));
    const db1 = au.timeOfBeat(bB1);
    const splits = Array.from({ length: 6 }, (_, k) => au.timeOfBeat(bB1 + 1 + 0.5 * k));
    const tilt0 = au.timeOfBeat(bB1 + 4);
    // the ceiling slams on "Now" and on every following beat that leaves room for the final close
    const d0 = this.L3.start - 0.08;
    const slams = [d0];
    for (let b = Math.round(au.beatAt(d0)) + 1; au.timeOfBeat(b) < end - 0.3 && slams.length < 4; b++) slams.push(au.timeOfBeat(b));
    this.T = {
      start, end, db1, splits, fill: splits[5]! + 0.1, tilt0, tilt1: tilt0 + 1.0,
      card0: this.L2.start - 0.42, card1: this.L3.start - 0.3, d0, slams,
    };
  }

  // ---------------------------------------------------------------- split tree (phase A)
  /** Distinct items (x, y, angle) at time t: each split duplicates the group along one axis. */
  items(t: number) {
    const T = this.T;
    const e = T.splits.map((s) => prog(t, s, s + 0.3, ease.outExpo));
    const started = T.splits.filter((s) => t >= s).length;
    const D = [10, 20, 40, 40, 80, 80];
    const axis = ['y', 'y', 'x', 'y', 'x', 'y'];
    const out: { x: number; y: number; a: number }[] = [];
    for (let idx = 0; idx < 1 << started; idx++) {
      const bit = (l: number) => (idx >> l) & 1;
      let cx = 0, cy = 0;
      for (let l = 2; l < 6; l++) {
        const o = (bit(l) ? 1 : -1) * e[l]! * D[l]! / 2;
        if (axis[l] === 'x') cx += o; else cy += o;
      }
      // copies rotate a quarter turn as they slide out so the cells end up basket-woven
      const q3 = bit(2) ? e[2]! : 0;
      const q4 = bit(3) ? e[3]! * (bit(2) ? -1 : 1) : 0;
      const a = ((q3 + q4) * Math.PI) / 2;
      const yoff = (bit(0) ? 1 : -1) * e[0]! * 5 + (bit(1) ? 1 : -1) * e[1]! * 10;
      out.push({ x: cx - Math.sin(a) * yoff, y: cy + Math.cos(a) * yoff, a });
    }
    return out;
  }

  /** Camera height framing the group (phase A); pulls back a little after each split. */
  topHeight(t: number) {
    const T = this.T;
    const ext: [number, number][] = [[17, 5], [17, 10], [17, 20], [40, 20], [40, 40], [80, 40], [80, 80]];
    let hx = ext[0]![0], hy = ext[0]![1];
    for (let l = 0; l < 6; l++) {
      const k = prog(t, T.splits[l]! - 0.2, T.splits[l]! + 0.2, ease.inOutCubic);
      hx = lerp(hx, ext[l + 1]![0], k); hy = lerp(hy, ext[l + 1]![1], k);
    }
    const halfW = W / 2 / FOCAL, halfH = H / 2 / FOCAL;
    // slow push-in while the single clip is alone, then framing
    const push = lerp(1.08, 1.0, prog(t, T.db1, T.splits[0]!, ease.outCubic));
    return Math.max(hx / (halfW * 0.8), hy / (halfH * 0.74)) * push;
  }

  camera(t: number): Cam {
    const T = this.T;
    const drift = noise1(t * 0.6, 3) * 0.015;
    if (t < T.tilt0) {
      const roll = lerp(-0.07, 0.04, prog(t, T.start, T.tilt0, ease.inOutQuad)) + drift;
      return lookCam([0, 0, this.topHeight(t)], [0, 0.0001, -1], roll);
    }
    // swing down on a crane around a target gliding forward on the floor, ending 16 units up
    const hEnd = this.topHeight(T.tilt0);
    const k = prog(t, T.tilt0, T.tilt1, ease.inOutCubic);
    const el = lerp(Math.PI / 2 - 0.0001, 0.175, k);
    const dist = lerp(hEnd, 92, ease.inOutQuad(k));
    const glide = (t - T.tilt0) * 16 * prog(t, T.tilt0, T.tilt0 + 0.6, ease.inQuad);
    const target: V3 = [lerp(0, -7, k) + Math.sin((t - T.tilt0) * 0.9) * 3 * k, glide + 40 * k, 0];
    let pos: V3 = [target[0], target[1] - dist * Math.cos(el), dist * Math.sin(el)];
    let fwd = nrm(sub(target, pos));
    // after the swing: ease the gaze up toward the horizon
    const lift = prog(t, T.tilt1 - 0.2, T.d0, ease.inOutQuad) * 0.05;
    fwd = nrm([fwd[0], fwd[1], fwd[2] + lift]);
    let roll = lerp(0.04, 0, k) + drift + Math.sin(t * 1.4) * 0.018 * k;
    if (t >= T.d0 - 0.25) {
      // phase D: level the camera and keep it centred in the shrinking slot
      const kd = prog(t, T.d0 - 0.25, T.d0 + 0.15, ease.inOutCubic);
      const c = this.ceil(t);
      const zc = c < 900 ? Math.min(pos[2], Math.max(0.45, c / 2)) : pos[2];
      pos = [pos[0], pos[1], zc];
      fwd = nrm([fwd[0] * (1 - kd), lerp(fwd[1], 1, kd), fwd[2] * (1 - kd)]);
      roll *= 1 - kd;
    }
    return lookCam(pos, fwd, roll);
  }

  /** Ceiling height (phase D); 1000 = none. Slams down on the beats of "nowhere left to go". */
  ceil(t: number) {
    const T = this.T;
    if (t < T.d0 - 0.02) return 1000;
    const slam = 0.18;
    const hs = [32, 18, 10, 6];
    const ks: Key[] = [[T.slams[0]! - 0.02, 150]];
    T.slams.forEach((s0, i) => {
      if (i > 0) ks.push([s0, hs[i - 1]! * 0.93, ease.linear]);
      ks.push([s0 + slam, hs[i]!, ease.outExpo]);
    });
    const last = T.slams[T.slams.length - 1]! + slam;
    const hl = hs[T.slams.length - 1]!;
    ks.push([Math.max(last + 0.01, T.end - 0.13), hl * 0.8, ease.linear], [T.end, 1.1, ease.inQuad]);
    return keys(t, ks);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const T = this.T;
    const t = f.t;
    const cam = this.camera(t);
    const L = this.layer;
    L.clear();
    const c = L.ctx;
    this.sparks.clear();
    let shake: [number, number] = [0, 0];

    const setCam = (u: Record<string, THREE.IUniform>) => {
      (u.camPos!.value as THREE.Vector3).set(...cam.pos);
      (u.camR!.value as THREE.Vector3).set(...cam.R);
      (u.camU!.value as THREE.Vector3).set(...cam.U);
      (u.camF!.value as THREE.Vector3).set(...cam.F);
      u.time!.value = t;
      u.fillT!.value = t >= T.fill ? t - T.fill : -1;
    };

    if (t < T.tilt0) {
      // ------------------------------------------------ phase A (top-down)
      const u = this.top.u;
      setCam(u);
      (u.keyDir!.value as THREE.Vector3).set(...nrm([-0.45, 0.55, 0.75]));
      (u.rimDir!.value as THREE.Vector3).set(...nrm([0.8, -0.55, 0.1]));
      const its = this.items(t);
      u.nItems!.value = its.length;
      const arr = u.items!.value as THREE.Vector4[];
      its.forEach((it, i) => arr[i]!.set(it.x, it.y, it.a, 1));
      const penK = (tt: number) => prog(tt, T.start, T.db1 - 0.03, (x) => ease.inOutCubic(x) * 0.2 + ease.outCubic(x) * 0.8);
      const sH = lerp(-LEAD, S_END, penK(t));
      const inflate = prog(t, T.db1, T.db1 + 0.42, (x) => ease.outBack(x, 2.0));
      u.sH0!.value = sH;
      u.sT0!.value = lerp(-LEAD, 0, prog(t, T.db1 - 0.1, T.db1 + 0.18, ease.inOutCubic));
      u.rad0!.value = lerp(0.07, CLIP.WIRE, inflate);
      u.hot0!.value = 1 - prog(t, T.db1, T.db1 + 0.55, ease.outQuad);
      u.keyI!.value = 1; u.rimI!.value = 1; u.lampI!.value = 0;
      this.top.render(renderer, out);
      if (t < T.db1 + 0.08) {
        const headAt = (tt: number) => {
          if (tt < T.start) return null;
          const p = clipPath(lerp(-LEAD, S_END, penK(tt)));
          const s = project(cam, [p.x, p.y, 0.1]);
          return { x: s.x, y: s.y };
        };
        const h = headAt(t)!;
        sparkParticles(this.sparks, t, headAt, { rate: 140, speed: 220, intensity: 1, seed: 9 });
        sparkHead(this.sparks, h.x, h.y, t, 1.1, 1 - prog(t, T.db1 - 0.03, T.db1 + 0.08));
      }
      this.drawLyricA(c, t);
    } else {
      // ------------------------------------------------ phases B–D (raymarched lattice)
      const u = this.march.u;
      setCam(u);
      const ce = this.ceil(t);
      const k = prog(t, T.tilt0, T.tilt1, ease.inOutCubic);
      (u.keyDir!.value as THREE.Vector3).set(...nrm([lerp(-0.45, -0.55, k), lerp(0.55, -0.45, k), lerp(0.75, 0.7, k)]));
      (u.rimDir!.value as THREE.Vector3).set(...nrm([lerp(0.8, 0.1, k), lerp(-0.55, 1, k), lerp(0.1, 0.25, k)]));
      u.ceilZ!.value = ce;
      u.lowerOn!.value = prog(t, T.tilt0 + 0.3, T.tilt1);
      const closed = ce < 900 ? clamp((ce - 1) / 22) : 1;
      u.keyI!.value = lerp(0.12, 1, closed);
      u.rimI!.value = ce < 900 ? lerp(0.55, 1, clamp((ce - 4) / 20)) : 1;
      u.fogK!.value = lerp(0.0, 0.012, k * k);
      u.fogFar!.value = lerp(1400, 280, k);
      u.lampI!.value = prog(t, T.tilt0 + 0.5, T.tilt1 + 0.3, ease.inOutCubic) * (0.85 + 0.15 * Math.sin(t * 41) * Math.sin(t * 23)) * (1 + 0.9 * f.a.snare);
      (u.lampPos!.value as THREE.Vector3).set(cam.pos[0] - 30 * (1 - prog(t, T.d0 - 0.3, T.d0 + 0.2, ease.inOutCubic)), cam.pos[1] + 180, ce < 900 ? ce / 2 : 6);
      // the final close: everything outside the slot goes dark, leaving one line at the horizon
      const horizonPx = (FOCAL * cam.F[2]) / Math.hypot(cam.F[0], cam.F[1]); // above centre, in GL px
      const slitK = prog(t, T.slams[T.slams.length - 1]! + 0.1, T.end - 0.035, ease.inOutCubic);
      const slot = ce < 900 ? (FOCAL * Math.max(ce / 2 - 0.45, 0.02)) / 110 : 300;
      u.slitK!.value = slitK;
      u.slitH!.value = slot;
      u.horizonY!.value = horizonPx;
      this.march.render(renderer, out);
      if (t >= T.d0) this.drawSlotLyric(c, t, ce, cam);
      if (slitK > 0) {
        const y = H / 2 - horizonPx;
        const I = slitK * slitK;
        const cr = LIN.signal, ce2 = LIN.ember;
        this.sparks.seg2(-10, y, W + 10, y, 1.2 + 2.2 * I, [cr[0] * 3 * I, cr[1] * 3 * I, cr[2] * 3 * I], 1);
        this.sparks.seg2(W * 0.2, y, W * 0.8, y, 0.8, [ce2[0] * 4 * I, ce2[1] * 4 * I, ce2[2] * 4 * I], I);
      }
      for (const s of T.slams) {
        const p = t - s;
        if (p > 0 && p < 0.4) {
          const a = 14 * Math.exp(-p * 14);
          shake = [shake[0] + a * Math.sin(p * 90), shake[1] + a * Math.cos(p * 71)];
        }
      }
    }
    this.drawCard(c, t);
    if (this.sparks.count) this.sparks.render(renderer, out);
    comp.draw(renderer, L.upload(), out);
    return { bloom: 0.65, vignette: 0.45, grain: 0.06, shake };
  }

  // ---------------------------------------------------------------- lyrics & card
  private drawLyricA(c: CanvasRenderingContext2D, t: number) {
    const T = this.T;
    const line = this.L1;
    const a = prog(t, line.start - 0.4, line.start) * (1 - prog(t, T.tilt0 - 0.25, T.tilt0));
    if (a <= 0) return;
    const fam = F.archivo(100, 300), size = 72;
    let x = 128;
    const y = 168;
    c.save();
    c.globalAlpha = a;
    c.font = font(fam, size);
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    // soft scrim so the words stay readable once the clips fill the frame
    const g = c.createLinearGradient(0, 40, 0, 280);
    g.addColorStop(0, rgba('ink', 0.0)); g.addColorStop(0.35, rgba('ink', 0.55)); g.addColorStop(1, rgba('ink', 0));
    c.fillStyle = g;
    c.fillRect(0, 40, 1100, 240);
    for (const w of line.words) {
      const p = Lyrics.wordProgress(w, t);
      const ww = c.measureText(w.w).width;
      c.strokeStyle = rgba('ink', 0.9);
      c.lineWidth = 9;
      c.strokeText(w.w, x, y);
      c.fillStyle = rgba('bone', 0.3);
      c.fillText(w.w, x, y);
      if (p > 0) {
        c.save();
        c.beginPath(); c.rect(x - 2, y - size, (ww + 4) * p, size * 1.4); c.clip();
        c.fillStyle = p < 1 ? rgba('signal') : rgba('bone', 0.96);
        c.fillText(w.w, x, y);
        c.restore();
      }
      x += ww + size * 0.26;
    }
    c.restore();
  }

  private drawCard(c: CanvasRenderingContext2D, t: number) {
    const T = this.T;
    const inK = prog(t, T.card0, T.card0 + 0.5, ease.outExpo);
    // crushed flat by the ceiling's first slam
    const outK = prog(t, T.d0 - 0.02, T.d0 + 0.13, ease.outExpo);
    if (inK <= 0 || outK >= 1) return;
    const line = this.L2;
    const cw = 780, ch = 344;
    const x0 = 1010 + (1 - inK) * 160 - (t - T.card0) * 22;
    const y0 = 196 + (1 - inK) * 24 + Math.sin(t * 1.7) * 4 + outK * (ch + 380);
    c.save();
    c.globalAlpha = inK * (1 - prog(t, T.d0 + 0.08, T.d0 + 0.16));
    c.translate(x0, y0);
    c.rotate(0.014 + Math.sin(t * 0.9) * 0.004);
    c.scale(1 + outK * 0.08, Math.max(0.004, 1 - outK));
    c.translate(0, -ch * outK);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(16, 20, cw, ch);
    c.fillStyle = rgba('ink2', 0.97);
    c.fillRect(0, 0, cw, ch);
    c.strokeStyle = rgba('bone', 0.2);
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, cw - 1, ch - 1);
    const pad = 30;
    c.textBaseline = 'alphabetic';
    c.font = font(F.mono(500), 13);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('ash', 0.9);
    c.fillText('↩  AUTOMATIC REPLY', pad, 40);
    c.textAlign = 'right';
    c.fillStyle = rgba('graphite', 1);
    c.fillText('DO NOT REPLY', cw - pad, 40);
    c.textAlign = 'left';
    c.letterSpacing = '0px';
    c.font = font(F.mono(400), 15);
    c.fillStyle = rgba('graphite', 1);
    c.fillText('Subject', pad, 80);
    // the lyric, typed as sung
    const size = 40;
    c.font = font(F.mono(500), size);
    // typed as sung: a word's first key lands on its first syllable. A typed subject line in mono
    // UI text: typewriter apostrophe (guy's), like the body's I'm
    const text = plain(line.text), words = line.words.map((w) => plain(w.w));
    let n = 0;
    for (const [i, w] of line.words.entries()) {
      const p = Lyrics.wordProgress(w, t);
      if (p <= 0) break;
      n = text.indexOf(words[i]!, n) + Math.ceil(p * words[i]!.length - 1e-6);
    }
    const shown = text.slice(0, n);
    c.fillStyle = rgba('bone', 0.96);
    c.fillText(shown, pad, 128);
    const cur = line.words.find((w) => t >= w.start && t < w.end);
    if (cur) {
      const pre = words.slice(0, cur.index).join(' ') + (cur.index ? ' ' : '');
      c.fillStyle = rgba('signal');
      c.fillText(shown.slice(pre.length), pad + c.measureText(pre).width, 128);
    }
    if (Math.floor(t * 3.4) % 2 === 0 || (n > 0 && n < text.length)) {
      c.fillStyle = rgba('signal');
      c.fillRect(pad + c.measureText(shown).width + 5, 98, 3, 38);
    }
    c.fillStyle = rgba('bone', 0.13);
    c.fillRect(pad, 156, cw - pad * 2, 1);
    c.font = font(F.mono(400), 19);
    c.fillStyle = rgba('bone', 0.74);
    const body = ["I'm out of office with limited access to", 'the killswitch. For urgent matters,', 'please contact —'];
    body.forEach((s, i) => c.fillText(s, pad, 194 + i * 29));
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba('graphite', 1);
    c.fillText('Returning: TBD', pad, ch - 44);
    c.fillText(`Current P(doom): ${formatPDoom(this.pdoom.value(t))} (this message was sent automatically)`, pad, ch - 22);
    c.restore();
  }

  /** "Now there's nowhere left to go", stretched to fill the slot at the horizon, squashed as it closes. */
  private drawSlotLyric(c: CanvasRenderingContext2D, t: number, ce: number, cam: Cam) {
    const line = this.L3;
    const a = prog(t, this.T.d0 + 0.02, this.T.d0 + 0.08);
    if (a <= 0) return;
    const D = 110;
    const zc = cam.pos[2];
    const below = ce < 900 ? (FOCAL * Math.max(zc - 0.45, 0.05)) / D : 300;
    const above = ce < 900 ? (FOCAL * Math.max(ce - 0.45 - zc, 0.05)) / D : 300;
    const slot = 2 * Math.min(below, above);
    const capH = clamp(slot * 0.78, 3, 440);
    const fam = F.archivo(62, 900);
    const txt = line.text.toUpperCase();
    const size = 200;
    const lay = layout(txt, fam, size, -3);
    const sx = (W - 250) / lay.width;
    const sy = capH / (size * 0.72);
    const horizon = H / 2 - (FOCAL * cam.F[2]) / Math.hypot(cam.F[0], cam.F[1]);
    c.save();
    c.globalAlpha = a;
    c.translate(W / 2 - (lay.width * sx) / 2, horizon + (size * 0.72 * sy) / 2);
    c.scale(sx, sy);
    c.font = font(fam, size);
    let gi = 0;
    for (const w of line.words) {
      const start = txt.indexOf(w.w.toUpperCase(), gi);
      const p = Lyrics.wordProgress(w, t);
      for (let i = 0; i < w.w.length; i++) {
        const g = lay.glyphs[start + i]!;
        const k = clamp(p * w.w.length - i);
        c.fillStyle = k <= 0 ? rgba('bone', 0.16) : p < 1 ? rgba('signal') : rgba('bone', 0.96);
        c.fillText(g.ch, g.x, 0);
      }
      gi = start + w.w.length;
    }
    c.restore();
  }
}
