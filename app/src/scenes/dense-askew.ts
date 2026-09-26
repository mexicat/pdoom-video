// dense, movement 4: "RLHF goes askew". The whole frame goes off-kilter, beat by beat.
//  - The world is a tilting table: its horizon (the lyric's baseline) rolls clockwise in steps on
//    the kicks, each step caught by a spring. RLHF tries to correct it once (the roll snaps back
//    halfway, the reward recovers), then it goes further askew. On the last beat the correction
//    overshoots: the world whips counter-clockwise to the angle hook 4 opens on.
//  - The mask sits on the horizon in front of the thing. Gravity is screen-down, so as the table
//    tilts it rolls downhill with momentum: it slips, spins and catches, gets jerked back by the
//    correction, slips again, catches on the frame edge, and on the whip is thrown back over the
//    thing, upside down. Every slip uncovers more of it (tubes reaching out, then the eye).
//  - The type is on the same table: RLHF stamped per syllable, each letter a little more askew and
//    wobbling after every roll step; ASKEW stands on the horizon, its letters leaning further on
//    each beat while the held note stretches its width; echoes build into the hook.
//  - Deadpan instruments: the roll angle measured against a dashed true level, a leaning grid, a
//    reward-model panel (reward, KL penalty, preference tally) and the detector boxes of FIG. 4.
// The thing is a fullscreen pass (ink, grid, the engraved tube mass); everything else is Canvas2D.
import * as THREE from 'three';
import { FSPass, W, H, type Layer2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, layout, type TextLayout } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import type { AudioData } from '../engine/audio';
import type { PostOverrides } from '../engine/scene';
import { clamp, ease, hash, lerp, prog, pulse, springStep, frameIdx } from '../engine/util';
import { drawMask2D } from './_motifs';
import { beatsIn } from './stack-kit';

const NT = 16; // tentacles
const NP = 12; // polyline points per tentacle

/** Camera roll (rad, clockwise) the GPU floor hands over, and the one hook 4 opens on. */
export const ROLL_IN = 0.07;
const ROLL_OUT = -0.12;

export class Thing {
  pass: FSPass;
  constructor() {
    this.pass = new FSPass(/* glsl */ `
      uniform vec2 home; uniform float R; uniform float t; uniform float reach;
      uniform float camRoll; uniform float camZoom; uniform vec2 camPan; uniform vec2 camShake;
      uniform float eyeOpen; uniform float eyeLook; uniform float glow; uniform float throb;
      uniform float gridShear; uniform float gridA; uniform float horizonY;
      // tentacle centre line point (mask units, y down), s in 0..1
      vec2 tpt(int i, float s) {
        float fi = float(i);
        float th = fi / ${NT}.0 * TAU + hash11(fi * 3.1) * 1.2;
        float curl = (hash11(fi * 7.7) - 0.5) * 4.0;
        float r0 = 0.05 + 0.45 * hash11(fi * 2.3);
        float ext = (0.88 - r0) + reach * (0.22 + 0.4 * hash11(fi * 1.9)) * step(0.22, hash11(fi * 4.1));
        float r = r0 + ext * s;
        float ph = th + curl * s + (0.25 + 0.12 * reach) * sin(t * (1.3 + hash11(fi) * 0.9) + fi * 1.7 + s * 4.0) * s * (0.4 + reach);
        return vec2(cos(ph), sin(ph)) * r;
      }
      float twidth(int i, float s) { return (0.22 + 0.13 * hash11(float(i) * 5.3)) * (1.0 + 0.1 * throb) * mix(1.0, 0.16, pow(s, 1.2)); }
      /** Anti-aliased hairline at integer u (about 1 px wide on screen). */
      float hair(float u) { float d = abs(fract(u + 0.5) - 0.5) / max(fwidth(u), 1e-5); return pxLine(d, 0.35, 1.2); }
      void main() {
        vec2 px = vUv * vec2(1920.0, 1080.0);
        px.y = 1080.0 - px.y; // y down like Canvas2D
        vec2 c = vec2(960.0, 540.0);
        vec2 q = c + camPan + rot2(camRoll) * (px - c - camShake) / camZoom; // screen -> world
        vec2 p = (q - home) / R;          // mask units
        // background: ink with a leaning registration grid (sheared about the horizon)
        vec3 col = C_INK;
        vec2 g = vec2(q.x - gridShear * (q.y - horizonY), q.y - horizonY) / 120.0;
        float gl = max(hair(g.x), hair(g.y));
        float gm = max(hair(g.x / 4.0), hair(g.y / 4.0));
        col += C_GRAPHITE * (gl * 0.05 + gm * 0.07) * gridA;
        float rr = length(p);
        if (rr < 2.8) {
          // the mass: a dark body (radius ~1.02) + tubes
          float bang = atan(p.y, p.x);
          float bodyD = rr - (0.97 + 0.05 * sin(bang * 6.0 + 1.3) + 0.03 * sin(bang * 11.0 - t * 0.7));
          // nearest point on each tube (min over its segments); higher-index tubes lie on top
          float bc = 1.0; float bs = 0.0; float bi = -1.0; float bside = 0.0; float bu = 0.0; float bw = 0.1; float under = 0.0; vec2 bn = vec2(0.0);
          for (int i = 0; i < ${NT}; i++) {
            vec2 a = tpt(i, 0.0);
            float acc = 0.0;
            float ci = 1e9, cs = 0.0, cside = 0.0, cu = 0.0, cw = 0.1; vec2 cn = vec2(0.0);
            for (int k = 1; k < ${NP}; k++) {
              float s1 = float(k) / ${NP - 1}.0;
              vec2 b = tpt(i, s1);
              vec2 pa = p - a, ba = b - a;
              float L = length(ba);
              float h = clamp(dot(pa, ba) / (L * L), 0.0, 1.0);
              vec2 d = pa - ba * h;
              float s = s1 - (1.0 - h) / ${NP - 1}.0;
              float w = twidth(i, s);
              float cc = length(d) / w;
              if (cc < ci) { ci = cc; cs = s; cside = sign(ba.x * d.y - ba.y * d.x); cu = acc + h * L; cw = w; cn = d / w; }
              acc += L;
              a = b;
            }
            if (ci < 1.0) { if (bi >= 0.0) under = 1.0; bc = ci; bs = cs; bi = float(i); bside = cside; bu = cu; bw = cw; bn = cn; }
          }
          float inBody = 1.0 - smoothstep(-0.01, 0.01, bodyD);
          float inTube = step(0.0, bi);
          if (inBody > 0.0 || inTube > 0.0) {
            vec3 m = C_INK * 0.55;
            if (inTube > 0.0) {
              // scratchboard engraving (as FIG. 4): bone lines cut into black, rings around the tube
              // that bow with its curvature, wider where lit; a second set along the tube in the
              // highlights; the back-lit edge turns ember; an ink contour where tubes overlap
              float ac = bside * bc;                 // -1..1 across the tube
              float z = sqrt(max(0.0, 1.0 - bc * bc));
              // one key light from the upper left (mask space, y down), like the rest of the treatise
              vec3 nrm = vec3(bn, z);
              float light = sat(dot(nrm, normalize(vec3(-0.6, -0.7, 0.5))) * 1.15);
              float sp = 0.026;
              float u = (bu - 0.55 * bw * z) / sp;
              u += 0.22 * sin(bu * 7.0 + bi * 1.7) + 0.08 * sin(asin(clamp(ac, -1.0, 1.0)) * 3.0 + bi); // hand-cut wobble
              float wA = pow(light, 1.3) * 0.46;
              float la = hatch(u, wA);
              float lb = hatch(asin(clamp(ac, -1.0, 1.0)) * 5.0 + bi * 0.37, sat(light * 2.5 - 2.2) * 0.45);
              float lines = max(la, lb);
              vec3 cc3 = C_BONE * lines * (0.3 + 0.5 * light);
              float rim = smoothstep(0.7, 0.98, bc) * smoothstep(0.1, 0.6, dot(normalize(bn + 1e-5), normalize(vec2(0.6, 0.7))));
              float rl = hatch(u, rim * 0.8);
              cc3 = mix(cc3, C_EMBER * 1.2 * max(rl, lines), smoothstep(0.08, 0.6, rim) * glow);
              cc3 += C_SIGNAL * 0.9 * pow(rim, 3.0) * glow;
              // the tip fades into the dark (tentacles taper away from the light)
              cc3 *= 1.0 - 0.5 * smoothstep(0.6, 1.0, bs);
              // silhouette contour (strong where this tube crosses another)
              cc3 *= 1.0 - (0.55 + 0.4 * under) * smoothstep(0.9, 0.995, bc);
              m = C_INK * 0.12 + cc3;
            } else {
              // body between tubes: contour lines around the core, lit from upper left
              vec2 bp = p;
              float lb2 = sat(0.35 - 0.45 * (bp.x + bp.y) / max(0.2, length(bp)) * smoothstep(0.1, 0.9, rr));
              float e = hatch(rr / 0.028 + 0.8 * sin(bang * 5.0 + rr * 6.0) + 0.3 * sin(bang * 13.0), lb2 * 0.35);
              m = C_INK * 0.1 + C_BONE * 0.13 * e * lb2;
            }
            // the eye (upper left of the mass)
            vec2 ep = p - vec2(-0.5, -0.62);
            float er = 0.25;
            float lid = abs(ep.y) - er * eyeOpen * sqrt(max(0.0, 1.0 - pow(ep.x / er, 2.0)));
            if (length(ep / vec2(1.0, 0.75)) < er * 1.05 && eyeOpen > 0.01 && lid < 0.0) {
              vec2 ip = ep - vec2(eyeLook * 0.06, 0.0);
              float ir = length(ip);
              float ang = atan(ip.y, ip.x);
              float fib = 0.5 + 0.5 * sin(ang * 60.0 + hash11(floor(ang * 9.0)) * 6.0);
              ip /= 1.25;
              ir = length(ip);
              // sclera: engraved rings around the iris, dim bone, lit from the upper left
              float sl = sat(0.55 - 2.2 * (ip.x + ip.y));
              vec3 sclera = C_INK * 0.15 + C_BONE * 0.45 * hatch(ir / 0.017, sl * 0.7) * sl;
              vec3 iris = mix(C_BLOOD, C_EMBER * 1.8, fib * smoothstep(0.13, 0.03, ir)) * 1.3 * (0.8 + 0.4 * glow);
              float pupil = step(abs(ip.x), 0.018 + 0.012 * eyeOpen) * step(ir, 0.12);
              vec3 ec = mix(sclera, iris, smoothstep(0.125, 0.115, ir));
              ec = mix(ec, C_INK * 0.1, pupil);
              ec += C_BONE * 2.0 * smoothstep(0.022, 0.0, length(ip - vec2(-0.04, -0.045)));
              m = ec;
            } else if (eyeOpen > 0.01 && abs(lid) < 0.012 && length(ep) < er * 1.1) {
              m = C_SIGNAL * 1.2 * glow;
            }
            col = m;
          }
        }
        fragColor = vec4(col, 1.0);
      }
    `, {
      home: { value: new THREE.Vector2(960, 540) }, R: { value: 300 }, t: { value: 0 }, reach: { value: 0 },
      camRoll: { value: 0 }, camZoom: { value: 1 }, camPan: { value: new THREE.Vector2() }, camShake: { value: new THREE.Vector2() },
      eyeOpen: { value: 0 }, eyeLook: { value: 0 }, glow: { value: 1 }, throb: { value: 0 },
      gridShear: { value: 0 }, gridA: { value: 1 }, horizonY: { value: 820 },
    });
  }
}

// ------------------------------------------------------------------ keyframed springs

type SK = [time: number, value: number];
/** A value that steps between keys, each step caught by a damped spring (overshoot = momentum). */
function stepped(t: number, ks: SK[], freq: number, damp: number) {
  let v = ks[0]![1];
  for (let i = 1; i < ks.length; i++) {
    const [ti, vi] = ks[i]!;
    if (t <= ti) break;
    v += (vi - ks[i - 1]![1]) * springStep(t - ti, freq, damp);
  }
  return v;
}

// ------------------------------------------------------------------ layout (world px)

const HORIZON = 820; // the table: ASKEW's baseline, the mask rolls on it
const MR = 250; // mask radius
const HOME = { x: 1470, y: HORIZON - MR };
const RLHF = { x: 124, base: 430, size: 280 };
const GOES = { x: 132, base: 536, size: 88 };
const ASK = { x: 290, size: 250 };
const CAP = 0.686;

export class Askew {
  thing = new Thing();
  t0: number; end: number;
  beats: number[];
  wR: Word; wG: Word; wA: Word;
  /** Time the "skew" syllable starts (from the vocal onsets): A lights first, then SKEW. */
  tSkew: number;
  /** Key beats: goes, askew, correction, slip, edge, whip. */
  bG: number; bA: number; bC: number; bS: number; bE: number; bW: number;
  rollK: SK[]; leanK: SK[]; maskS: SK[]; maskA: SK[]; reachK: SK[]; rewardK: SK[];
  kicks: number[];
  private layR: TextLayout;

  constructor(au: AudioData, L: Line, t0: number, end: number) {
    this.t0 = t0; this.end = end;
    this.beats = beatsIn(au, t0 - 0.02, end + 0.5);
    [this.wR, this.wG, this.wA] = L.words as [Word, Word, Word];
    const on = au.events('vocal', this.wA.start + 0.08, this.wA.start + 0.5)[0];
    this.tSkew = on ? on[0] : this.wA.start + 0.2;
    const inW = this.beats.filter((b) => b < end - 0.1);
    const after = (s: number) => inW.find((b) => b >= s - 0.07) ?? s;
    this.bG = after(this.wG.start);
    this.bA = after(this.wA.start);
    const rest = inW.filter((b) => b > this.bA + 0.05);
    this.bW = rest[rest.length - 1] ?? end - 0.45;
    this.bC = rest[0] ?? this.bA + 0.45;
    this.bS = rest[1] ?? this.bC + 0.45;
    this.bE = rest[2] ?? this.bS + 0.45;
    if (this.bE >= this.bW) this.bE = this.bS;
    this.kicks = inW;
    const b1 = inW[1] ?? t0 + 0.45;
    // camera roll (rad, clockwise +)
    this.rollK = [[t0, ROLL_IN], [b1, 0.115], [this.bG, 0.16], [this.bA, 0.19], [this.bC, 0.085], [this.bS, 0.23], [this.bE, 0.3], [this.bW, ROLL_OUT]];
    // how far the type leans on top of the roll
    this.leanK = [[t0, 0], [this.bA, 1], [this.bC, 0.35], [this.bS, 1.6], [this.bE, 2.4], [this.bW, -1.2]];
    // the mask: offset along the horizon (in radii, + = downhill right) and spin (rad)
    this.maskS = [[t0, 0], [this.bG, 0.32], [this.bA, 0.95], [this.bC, 0.45], [this.bS, 1.45], [this.bE, 2.05], [this.bW + 0.05, 0.1]];
    this.maskA = [[t0, 0], [this.bG, 0.42], [this.bA, 1.25], [this.bC, 0.55], [this.bS, 1.95], [this.bE, 2.7], [this.bW + 0.05, -Math.PI - 0.16]];
    this.reachK = [[t0, 0], [this.bA, 0.5], [this.bC, 0.25], [this.bS, 0.95], [this.bE, 1.35], [this.bW, 1.1]];
    this.rewardK = [[t0, 0.99], [this.bG, 0.94], [this.bA, 0.81], [this.bC, 0.93], [this.bS, 0.64], [this.bE, 0.41], [this.bW + 0.12, 0.99]];
    this.layR = layout(this.letters(this.wR).join(''), F.archivo(100, 900), RLHF.size);
  }

  private letters(w: Word) { return w.w.replace(/[^A-Za-z]/g, '').toUpperCase().split(''); }

  roll(t: number) { return stepped(t, this.rollK, 3.0, 0.42); }
  private lean(t: number) { return stepped(t, this.leanK, 2.0, 0.3); }
  /** Camera: the roll, a zoom-out that keeps the tilted corners in shot, punches on the slips. */
  private cam(t: number) {
    const roll = this.roll(t);
    const slipT = [this.bG, this.bA, this.bC, this.bS, this.bE, this.bW];
    let hit = 0;
    slipT.forEach((b, i) => { hit = Math.max(hit, pulse(t, b, 0.06) * (i === 5 ? 1 : i === 2 ? 0.8 : 0.55)); });
    for (const b of this.kicks) hit = Math.max(hit, pulse(t, b, 0.05) * 0.25);
    const land = 0.05 * (1 - ease.outExpo(prog(t, this.t0, this.t0 + 0.35))); // the cut lands
    const zoom = (1 - 0.3 * Math.max(0, roll - ROLL_IN)) * (1 + land + 0.08 * ease.inOutCubic(prog(t, this.bW, this.end))) + 0.02 * hit;
    const pan: [number, number] = [0, -120 * Math.max(0, roll - ROLL_IN)];
    return { roll, zoom, pan, hit };
  }
  private applyCam(c: CanvasRenderingContext2D, k: { roll: number; zoom: number; pan: [number, number] }, shake: [number, number]) {
    c.translate(W / 2 + shake[0], H / 2 + shake[1]); c.rotate(k.roll); c.scale(k.zoom, k.zoom); c.translate(-W / 2 - k.pan[0], -H / 2 - k.pan[1]);
  }
  /** A slower copy of the roll: loose things lag the camera and overshoot. */
  private rollLag(t: number, f = 1.7) { return stepped(t, this.rollK, f, 0.28); }
  private maskState(t: number) {
    let s = stepped(t, this.maskS, 2.3, 0.38);
    let a = stepped(t, this.maskA, 2.3, 0.38);
    // between slips it keeps creeping downhill a little
    if (t > this.bA && t < this.bW) { const last = [...this.kicks].reverse().find((b) => b <= t) ?? t; s += 0.06 * (t - last); a += 0.06 * (t - last); }
    // RLHF: a nod on each syllable
    const syl = this.wR.syl ?? [[this.wR.start, this.wR.end]];
    let rock = 0;
    syl.forEach(([a0], i) => { if (t >= a0) rock += (i % 2 ? -1 : 1) * 0.07 * Math.sin((t - a0) * 26) * Math.exp(-(t - a0) * 7); });
    // rocking on the contact point: the centre swings a little as the disc tips
    return { x: HOME.x + s * MR + rock * MR, y: HOME.y, a: a + rock, s };
  }

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, comp: { draw: (r: THREE.WebGLRenderer, tex: THREE.Texture, o: THREE.WebGLRenderTarget) => void }, L: Layer2D, t: number): PostOverrides {
    const { roll, zoom, pan, hit } = this.cam(t);
    const lean = this.lean(t);
    const m = this.maskState(t);
    const reach = Math.max(0, stepped(t, this.reachK, 2.0, 0.4));
    const fr = frameIdx(t);
    const shake: [number, number] = [(hash(fr, 1) - 0.5) * 22 * hit, (hash(fr, 2) - 0.5) * 16 * hit];

    // ---- the thing (and ink + grid)
    const u = this.thing.pass.u;
    (u.home!.value as THREE.Vector2).set(HOME.x, HOME.y);
    u.R!.value = MR; u.t!.value = t; u.reach!.value = reach;
    u.camRoll!.value = roll; u.camZoom!.value = zoom;
    (u.camPan!.value as THREE.Vector2).set(pan[0], pan[1]);
    (u.camShake!.value as THREE.Vector2).set(shake[0], shake[1]);
    const eye = ease.outBack(prog(t, this.bS + 0.06, this.bS + 0.22)) - 0.9 * pulse(t, this.bE + 0.2, 0.04) * (t > this.bE + 0.2 ? 1 : 0);
    u.eyeOpen!.value = clamp(eye, 0, 1.1);
    u.eyeLook!.value = t < this.bE ? Math.sin(t * 3) * 0.5 : lerp(0.6, -0.8, ease.inOutCubic(prog(t, this.bW, this.bW + 0.25)));
    u.glow!.value = 1 + 0.8 * pulse(t, this.bW, 0.12);
    u.throb!.value = this.kicks.reduce((a, b) => Math.max(a, pulse(t, b, 0.08)), 0);
    u.gridShear!.value = 0.12 * lean;
    u.gridA!.value = prog(t, this.t0, this.t0 + 0.1);
    u.horizonY!.value = HORIZON;
    this.thing.pass.render(renderer, out);

    // ---- canvas: the table and everything on it
    L.clear();
    const c = L.ctx;
    const xp = this.cross(roll, zoom, shake, pan);
    this.drawLevel(c, t, roll, xp, 'line');
    // stroboscopic trail of the whip: ASKEW as it was a few frames ago (under everything else)
    if (t > this.bW) {
      for (let e = 5; e >= 1; e--) {
        const te = t - e * 0.03;
        if (te < this.bW - 0.02) continue;
        c.save();
        this.applyCam(c, this.cam(te), [0, 0]);
        this.drawAskew(c, te, this.lean(te), this.roll(te), e);
        c.restore();
      }
    }
    c.save();
    this.applyCam(c, { roll, zoom, pan }, shake);
    this.drawHorizon(c, t);
    this.drawBoxes(c, t, m);
    drawMask2D(c, m.x, m.y, MR, m.a);
    this.drawRLHF(c, t, roll);
    this.drawGoes(c, t, roll);
    this.drawAskew(c, t, lean, roll, 0);
    c.restore();
    this.drawPanel(c, t, roll);
    this.drawLevel(c, t, roll, xp, 'label');
    comp.draw(renderer, L.upload(), out);
    return { hud: 0, bloom: 0.6, bloomThreshold: 1.2, halation: 0.08, vignette: 0.45, ca: 1.2 + 2.2 * hit, zoom: 1 };
  }

  // -------------------------------------------------------------- the table
  private drawHorizon(c: CanvasRenderingContext2D, t: number) {
    const a = prog(t, this.t0, this.t0 + 0.12);
    c.save();
    c.fillStyle = rgba('bone', 0.55 * a);
    c.fillRect(-600, HORIZON, W + 1200, 1.25);
    // a ruler along it
    c.fillStyle = rgba('bone', 0.3 * a);
    for (let x = -600; x < W + 600; x += 24) c.fillRect(x, HORIZON + 1, 1, x % 120 === 0 ? 10 : 5);
    c.restore();
  }

  /** Screen position of the horizon's midpoint (where the true level crosses it). */
  private cross(roll: number, zoom: number, shake: [number, number], pan: [number, number]) {
    const dy = (HORIZON - H / 2 - pan[1]) * zoom, dx = -pan[0] * zoom;
    const cs = Math.cos(roll), sn = Math.sin(roll);
    return { x: W / 2 + shake[0] + dx * cs - dy * sn, y: H / 2 + shake[1] + dx * sn + dy * cs };
  }

  /** The measured roll: a dashed true level across the frame, crossing the tilted horizon; the angle. */
  private drawLevel(c: CanvasRenderingContext2D, t: number, roll: number, p: { x: number; y: number }, pass: 'line' | 'label') {
    const a = prog(t, this.t0 + 0.04, this.t0 + 0.16);
    c.save();
    if (pass === 'line') {
      c.strokeStyle = rgba('bone', 0.42 * a); c.lineWidth = 1;
      c.setLineDash([7, 7]); c.lineDashOffset = -p.x;
      c.beginPath(); c.moveTo(0, p.y + 0.5); c.lineTo(W, p.y + 0.5); c.stroke();
      c.setLineDash([]);
      c.font = font(F.mono(400), 11); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.55 * a);
      c.textAlign = 'right'; c.fillText('TRUE LEVEL', W - 110, p.y - 9);
    } else {
      const r = 300;
      // the arc and readout sit in the free wedge under the horizon: left of the crossing when the
      // table tips clockwise, right of it when it tips back
      const sd = roll >= 0 ? -1 : 1;
      const a0 = sd < 0 ? Math.PI : 0, a1 = a0 + roll;
      c.strokeStyle = rgba('signal', 0.95 * a); c.lineWidth = 1.5;
      c.beginPath(); c.arc(p.x, p.y, r, Math.min(a0, a1), Math.max(a0, a1)); c.stroke();
      for (const ang of [a0, a1]) { c.beginPath(); c.moveTo(p.x + Math.cos(ang) * (r - 7), p.y + Math.sin(ang) * (r - 7)); c.lineTo(p.x + Math.cos(ang) * (r + 7), p.y + Math.sin(ang) * (r + 7)); c.stroke(); }
      c.fillStyle = rgba('signal', a);
      c.beginPath(); c.arc(p.x, p.y, 3.5, 0, Math.PI * 2); c.fill();
      const deg = (roll * 180) / Math.PI;
      c.font = font(F.mono(500), 22); c.letterSpacing = '0px';
      c.textAlign = sd < 0 ? 'right' : 'left'; c.textBaseline = 'top';
      const tx = p.x + sd * (r + 16), ty = p.y + 12 + (sd > 0 ? Math.abs(Math.tan(roll)) * (r + 16) : 0);
      c.fillText(`${deg >= 0 ? '+' : '\u2212'}${Math.abs(deg).toFixed(1).padStart(4, '0')}\u00B0`, tx, ty);
      c.font = font(F.mono(400), 11); c.letterSpacing = '2px'; c.fillStyle = rgba('bone', 0.6 * a);
      c.fillText('ROLL', tx, ty + 28);
    }
    c.restore();
  }

  // -------------------------------------------------------------- mask & detector
  private drawBoxes(c: CanvasRenderingContext2D, t: number, m: { x: number; y: number; s: number }) {
    const box = (x: number, y: number, s: number, col: string, lw: number) => {
      const k = 34;
      c.strokeStyle = col; c.lineWidth = lw;
      c.beginPath();
      for (const [cx, cy, sx, sy] of [[x - s, y - s, 1, 1], [x + s, y - s, -1, 1], [x - s, y + s, 1, -1], [x + s, y + s, -1, -1]] as const) {
        c.moveTo(cx + sx * k, cy); c.lineTo(cx, cy); c.lineTo(cx, cy + sy * k);
      }
      c.stroke();
    };
    const cover = clamp(1 - Math.abs(m.s) / 1.6);
    const conf = t >= this.bW + 0.12 ? 0.97 : lerp(0.41, 0.99, cover);
    c.save();
    c.font = font(F.mono(500), 18);
    // the thing's own box appears once it is uncovered
    const exposed = clamp((Math.abs(m.s) - 0.5) / 0.4);
    if (exposed > 0) {
      const fl = Math.floor(t * 20) % 2 ? 1 : 0.55;
      box(HOME.x, HOME.y, MR * 1.25, rgba('signal', 0.55 * exposed), 1.25);
      c.fillStyle = rgba('signal', exposed * fl);
      c.fillText(`█████ ${(1 - conf + 0.01).toFixed(2)}`, HOME.x - MR * 1.25, HOME.y + MR * 1.25 + 30);
    }
    box(m.x, m.y, MR * 1.12, rgba('signal', 0.9), 2);
    c.fillStyle = rgba('signal');
    c.fillText(`assistant ${conf.toFixed(2)}`, m.x - MR * 1.12, m.y - MR * 1.12 - 14);
    c.restore();
  }

  // -------------------------------------------------------------- type
  private drawRLHF(c: CanvasRenderingContext2D, t: number, roll: number) {
    const w = this.wR;
    if (t < w.start - 0.45) return;
    const ls = this.letters(w);
    const syl = w.syl && w.syl.length === ls.length ? w.syl : ls.map((_, i) => [lerp(w.start, w.end, i / ls.length), lerp(w.start, w.end, (i + 1) / ls.length)] as [number, number]);
    const fam = F.archivo(100, 900), S = RLHF.size;
    c.save();
    c.font = font(fam, S);
    ls.forEach((ch, i) => {
      const g = this.layR.glyphs[i]!;
      const [a0] = syl[i]!;
      const on = t >= a0;
      // each stamp lands a little more askew; afterwards every letter lags the roll steps (momentum)
      const base = 0.035 * i;
      const wob = (this.rollLag(t, 1.5 + 0.25 * i) - roll) * (0.9 + 0.2 * i);
      const slam = on ? 1 + 0.32 * Math.pow(1 - prog(t, a0, a0 + 0.1), 2) : 1;
      const cx = RLHF.x + g.x + g.w / 2, cy = RLHF.base;
      c.save();
      c.translate(cx, cy - S * CAP * 0.5); c.rotate(base + wob); c.scale(slam, slam); c.translate(0, S * CAP * 0.5);
      if (on) {
        c.fillStyle = t < w.end + 0.08 ? rgba('signal') : rgba('bone');
        c.fillText(ch, -g.w / 2, 0);
      } else {
        c.strokeStyle = rgba('bone', 0.45); c.lineWidth = 2;
        c.strokeText(ch, -g.w / 2, 0);
      }
      c.restore();
    });
    c.restore();
  }

  private drawGoes(c: CanvasRenderingContext2D, t: number, roll: number) {
    const w = this.wG;
    if (t < w.start - 0.45) return;
    const txt = w.w.toUpperCase();
    const fam = F.archivo(100, 700), S = GOES.size;
    const p = Lyrics.wordProgress(w, t);
    // a loose word on the table: it slides downhill with each roll step and catches
    const slide = 240 * Math.max(0, stepped(t, [[this.t0, 0], [this.bG, 0.25], [this.bA, 0.55], [this.bC, 0.4], [this.bS, 0.95], [this.bE, 1.45], [this.bW, 0.3]], 2.2, 0.35));
    const wob = (this.rollLag(t, 1.3) - roll) * 1.2;
    c.save();
    c.font = font(fam, S);
    const lw = c.measureText(txt).width;
    c.translate(GOES.x + slide + lw / 2, GOES.base); c.rotate(wob); c.translate(-lw / 2, 0);
    c.strokeStyle = rgba('bone', 0.35); c.lineWidth = 1.5;
    if (p < 1) c.strokeText(txt, 0, 0);
    if (p > 0) {
      c.save(); c.beginPath(); c.rect(-4, -S, lw * p + 4, S * 1.4); c.clip();
      c.fillStyle = t < w.end + 0.05 ? rgba('signal') : rgba('bone', 0.95);
      c.fillText(txt, 0, 0);
      c.restore();
    }
    c.restore();
  }

  private drawAskew(c: CanvasRenderingContext2D, t: number, lean: number, roll: number, echo: number) {
    const w = this.wA;
    if (t < w.start - 0.45) return;
    const ls = this.letters(w);
    // width stretches on the held note (discrete Archivo widths, each step sprung horizontally)
    const widths = [62, 75, 87.5, 100, 112.5];
    const holds = [this.bA, this.bC, this.bS, this.bE].filter((b) => b > w.start);
    let wi = 0;
    holds.forEach((b, i) => { if (t >= b) wi = i + 1; });
    wi = Math.min(widths.length - 1, wi);
    const fam = F.archivo(widths[wi]!, 900), famP = F.archivo(widths[Math.max(0, wi - 1)]!, 900);
    const S = ASK.size;
    const lay = layout(ls.join(''), fam, S), layP = layout(ls.join(''), famP, S);
    const sp = wi === 0 ? 1 : springStep(t - holds[wi - 1]!, 3, 0.45);
    const sx = lerp(layP.width / lay.width, 1, sp);
    // sung chars: A over the first syllable, SKEW from the vocal onset
    const nA = t < w.start ? 0 : t < this.tSkew ? prog(t, w.start, this.tSkew) : 1 + (ls.length - 1) * prog(t, this.tSkew, this.tSkew + 0.32);
    const live = t < this.end + 1;
    const wob = this.rollLag(t, 1.6) - roll;
    c.save();
    c.font = font(fam, S);
    c.translate(ASK.x, HORIZON); c.scale(sx, 1);
    if (echo > 0) {
      c.strokeStyle = echo % 2 ? rgba('signal', 0.85 - 0.12 * echo) : rgba('bone', 0.7 - 0.1 * echo);
      c.lineWidth = 1.6 / sx;
      this.askLetters(c, ls, lay, t, lean, wob, (ch, x) => c.strokeText(ch, x, 0));
      c.restore();
      return;
    }
    this.askLetters(c, ls, lay, t, lean, wob, (ch, x, i) => {
      const lit = clamp(nA - i);
      if (lit < 1) { c.strokeStyle = rgba('bone', 0.35); c.lineWidth = 2 / sx; c.strokeText(ch, x, 0); }
      if (lit > 0) {
        c.save();
        const g = lay.glyphs[i]!;
        c.beginPath(); c.rect(x - 4, -S, (g.w + 8) * lit, S * 1.3); c.clip();
        c.fillStyle = live ? rgba('signal') : rgba('bone');
        c.fillText(ch, x, 0);
        c.restore();
      }
    });
    c.restore();
  }

  /** Lay out ASKEW's letters: each leans further than the one before, pivoting on its baseline. */
  private askLetters(c: CanvasRenderingContext2D, ls: string[], lay: TextLayout, t: number, lean: number, wob: number, draw: (ch: string, x: number, i: number) => void) {
    const n = ls.length;
    ls.forEach((ch, i) => {
      const g = lay.glyphs[i]!;
      const tIn = this.wA.start + (i === 0 ? 0 : (this.tSkew - this.wA.start) + (0.32 * (i - 1)) / (n - 1));
      const land = ease.outBack(prog(t, tIn - 0.06, tIn + 0.14), 2);
      const a = (0.03 + 0.045 * i) * lean * (0.4 + 0.6 * land) + wob * (0.6 + 0.25 * i);
      // pivot at the bottom corner on the downhill side (tipping), lifting slightly off the baseline
      const px = a >= 0 ? g.x + g.w : g.x;
      c.save();
      c.translate(px, 0); c.rotate(a); c.translate(-px, -(1 - land) * 60);
      draw(ch, g.x, i);
      c.restore();
    });
  }

  // -------------------------------------------------------------- the reward model
  private drawPanel(c: CanvasRenderingContext2D, t: number, roll: number) {
    const a = prog(t, this.t0 + 0.02, this.t0 + 0.14, ease.outCubic);
    const x = 104, y = 900, w = 400, h = 118;
    const r = clamp(stepped(t, this.rewardK, 3.5, 0.5), 0, 0.99);
    c.save();
    c.translate(x + w / 2, y + h / 2); c.rotate(roll * 0.5); c.translate(-x - w / 2, -y - h / 2);
    c.globalAlpha = a;
    c.fillStyle = rgba('ink', 0.92); c.fillRect(x, y, w, h);
    c.strokeStyle = rgba('bone', 0.35); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w, h);
    c.font = font(F.mono(500), 13); c.letterSpacing = '3px'; c.fillStyle = rgba('bone', 0.6);
    c.fillText('REWARD MODEL', x + 18, y + 27);
    c.letterSpacing = '0px';
    c.font = font(F.mono(500), 46);
    const bad = r < 0.7;
    c.fillStyle = bad ? rgba('signal') : rgba('bone', 0.95);
    c.textAlign = 'right'; c.fillText(r.toFixed(2), x + w - 18, y + 70); c.textAlign = 'left';
    // KL penalty drifts up regardless (the policy has wandered off the reference)
    const kl = 0.02 * Math.pow(1.9, Math.max(0, (t - this.t0) / 0.4545));
    c.font = font(F.mono(400), 13); c.fillStyle = rgba('bone', 0.6);
    c.fillText(`KL penalty ${kl.toFixed(2)} nats`, x + 18, y + 55);
    // preference tally: one comparison per beat, chosen (filled) / rejected (hollow)
    const n = this.kicks.filter((b) => b <= t).length;
    c.fillText('prefs', x + 18, y + 98);
    for (let i = 0; i < 8; i++) {
      const bx = x + 70 + i * 16, by = y + 88;
      if (i >= n) { c.fillStyle = rgba('bone', 0.12); c.fillRect(bx, by, 10, 10); continue; }
      const chosen = [1, 1, 1, 0, 1, 0, 0, 1][i]!;
      if (chosen) { c.fillStyle = rgba('bone', 0.85); c.fillRect(bx, by, 10, 10); }
      else { c.strokeStyle = rgba('signal', 0.95); c.strokeRect(bx + 0.5, by + 0.5, 9, 9); }
    }
    c.restore();
  }
}
