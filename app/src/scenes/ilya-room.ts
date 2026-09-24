// FIG. 14's world as a function of song time: the timings (from the lyrics and the beat grid), the
// camera path, the lid, the lights, and the screen's contents (withheld). Rendered by ilya.ts, and by
// loom.ts as the bottom level of its Droste recursion (so the dive lands exactly on our first frame).
import * as THREE from 'three';
import { FSPass, W, H, SCALE, scaleContext2D } from '../engine/gl';
import type { Lyrics, Line, Word } from '../engine/lyrics';
import type { AudioData } from '../engine/audio';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, keys, lerp, noise1, prog, smoothstep, TAU } from '../engine/util';
import type { LineBatch } from '../engine/lines';
import { FRAG_ILYA, ILYA } from './ilya-glsl';
import { unicorn } from './open-geo';

export type V3 = [number, number, number];
export interface Cam { pos: V3; R: V3; U: V3; F: V3; focal: number }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const mix3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export function lookAt(pos: V3, target: V3, fovDeg: number, roll = 0): Cam {
  const Fw = norm(sub(target, pos));
  let R = norm(cross(Fw, [0, 1, 0]));
  let U = cross(R, Fw);
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    [R, U] = [add(mul(R, c), mul(U, s)), add(mul(U, c), mul(R, -s))];
  }
  return { pos, R, U, F: Fw, focal: (H / 2) / Math.tan((fovDeg * Math.PI) / 360) };
}
/** World point -> screen px (y down); z = depth along the view axis. */
export function project(c: Cam, p: V3) {
  const q = sub(p, c.pos);
  const z = dot(q, c.F);
  return { x: W / 2 + (dot(q, c.R) / z) * c.focal, y: H / 2 - (dot(q, c.U) / z) * c.focal, z };
}

const HINGE = ILYA.hinge;
const lidDir = (a: number): V3 => [0, Math.sin(a), Math.cos(a)];
const lidNrm = (a: number): V3 => [0, -Math.cos(a), Math.sin(a)];
/** World position of a point on the lid's inner face: x across, u along the lid from the hinge. */
export function lidPoint(a: number, x: number, u: number): V3 {
  return add(add(HINGE, [x, 0, 0]), mul(lidDir(a), u));
}
const LID_OPEN = (112 * Math.PI) / 180;
/** Screen centre with the lid open: the thing the camera circles. */
const S0 = lidPoint(LID_OPEN, 0, (ILYA.scrU[0] + ILYA.scrU[1]) / 2);

export class IlyaTimes {
  start: number; end: number;
  l1: Line; l2: Line;
  what: Word; see: Word; well: Word; never: Word; know: Word;
  was: Word; it: Word; all: Word; forW: Word; show: Word;
  slam: number; slit: number; dark: number; ledOff: number; knowBar: number; meet: number;
  constructor(ly: Lyrics, au: AudioData, start: number, end: number) {
    this.start = start; this.end = end;
    this.l1 = ly.get('What did Ilya');
    this.l2 = ly.get('all for show');
    const w1 = this.l1.words, w2 = this.l2.words;
    const find = (ws: Word[], re: RegExp, i: number) => ws.find((w) => re.test(w.w)) ?? ws[i]!;
    this.what = w1[0]!; this.see = find(w1, /see/i, 3); this.well = find(w1, /we'?ll/i, 4);
    this.never = find(w1, /never/i, 5); this.know = find(w1, /know/i, 6);
    this.was = w2[0]!; this.it = w2[1]!; this.all = find(w2, /^all/i, 2); this.forW = find(w2, /^for/i, 3); this.show = find(w2, /show/i, 4);
    const down = (t: number) => au.downbeats.reduce((b, d) => (Math.abs(d - t) < Math.abs(b - t) ? d : b), au.downbeats[0] ?? t);
    const beatAfter = (t: number) => au.timeOfBeat(Math.ceil(au.beatAt(t) - 1e-3));
    // the redaction bar lands on the downbeat inside "see?"
    this.slam = down(this.see.start + 0.1);
    // the lid is down to a slit on the downbeat after "know" starts; the slit dies on the next beat
    this.slit = down(this.know.start + 0.3);
    this.dark = beatAfter(this.slit + 0.2);
    // the sleep light goes out a beat before "Was" (a beat of true black before the spot)
    this.ledOff = au.timeOfBeat(Math.floor(au.beatAt(this.was.start - 0.05)));
    // "know" is withheld on the downbeat while the sleep light breathes
    this.knowBar = au.downbeats.find((d) => d > this.dark + 0.4 && d < this.ledOff) ?? (this.dark + this.ledOff) / 2;
    // the curtains meet on the beat before "show?"
    this.meet = au.timeOfBeat(Math.floor(au.beatAt(this.show.start - 0.05)));
  }
}

export interface RoomState {
  cam: Cam;
  lidA: number; screenI: number; ledI: number; props: number; chairOn: number;
  emitRect: [number, number, number, number];
  stageOn: number; spotI: number; curtainK: number; fillI: number; hazeK: number; bounceI: number; gain: number;
  /** redaction bar slam 0..1 (texture), and the screen texture needs a redraw */
  bar: number;
  theatre: boolean;
}

export class IlyaRoom {
  pass: FSPass;
  T: IlyaTimes;
  screenCv = document.createElement('canvas');
  screenTex: THREE.CanvasTexture;
  /** The back of the lid, the owner's sticker collection (lid-local uv, seen from behind). */
  stickerCv = document.createElement('canvas');
  stickerTex: THREE.CanvasTexture;
  private lastBar = -1;

  constructor(ly: Lyrics, private au: AudioData, start: number, end: number) {
    this.T = new IlyaTimes(ly, au, start, end);
    this.screenCv.width = 1024 * SCALE; this.screenCv.height = 576 * SCALE; scaleContext2D(this.screenCv.getContext('2d')!, SCALE);
    this.screenTex = new THREE.CanvasTexture(this.screenCv);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.generateMipmaps = true;
    this.screenTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.screenTex.anisotropy = 8;
    this.drawScreen(0);
    this.stickerCv.width = 1440; this.stickerCv.height = 1000; // 31 x 21.5 cm
    this.drawStickers();
    this.stickerTex = new THREE.CanvasTexture(this.stickerCv);
    this.stickerTex.colorSpace = THREE.SRGBColorSpace;
    this.stickerTex.generateMipmaps = true;
    this.stickerTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.stickerTex.anisotropy = 8;
    this.pass = new FSPass(FRAG_ILYA, {
      res: { value: new THREE.Vector2(W, H) }, time: { value: 0 },
      camPos: { value: new THREE.Vector3() }, camR: { value: new THREE.Vector3() }, camU: { value: new THREE.Vector3() }, camF: { value: new THREE.Vector3() },
      focal: { value: 1000 },
      lidA: { value: LID_OPEN }, screenI: { value: 1 }, ledI: { value: 0 }, props: { value: 1 }, chairOn: { value: 1 },
      emitRect: { value: new THREE.Vector4(0, 0, 1, 1) }, screenTex: { value: this.screenTex }, stickerTex: { value: this.stickerTex },
      stageOn: { value: 0 }, spotI: { value: 0 }, gain: { value: 1 }, curtainK: { value: 0 }, fillI: { value: 0 }, hazeK: { value: 0.3 }, bounceI: { value: 0 },
      spotPos: { value: new THREE.Vector3(0, 8.5, -2.6) }, spotDir: { value: new THREE.Vector3() }, spotCos: { value: new THREE.Vector2() },
    });
  }

  /**
   * The lid's back: a few stickers, the only personal things in the room. Transparent elsewhere
   * (alpha = sticker coverage). Canvas px: 1440 x 1000 over the 31 x 21.5 cm lid, top = the lid's
   * top edge, as seen from behind.
   */
  private drawStickers() {
    const c = this.stickerCv.getContext('2d')!;
    const bone = '#ece4d6', ink = '#141312', sig = rgba('signal');
    c.clearRect(0, 0, 1440, 1000);
    const at = (x: number, y: number, rot: number, f: () => void) => { c.save(); c.translate(x, y); c.rotate(rot); f(); c.restore(); };
    const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
    const shadow = () => { c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 6; c.shadowOffsetY = 2; };
    const noShadow = () => { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; };
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // FEEL THE AGI: the big one, slightly crooked, one corner lifting
    at(430, 250, -0.07, () => {
      shadow(); rr(-270, -86, 540, 172, 18); c.fillStyle = sig; c.fill(); noShadow();
      c.fillStyle = ink; c.letterSpacing = '2px';
      let fs = 86;
      c.font = font(F.archivo(100, 800), fs);
      fs *= Math.min(1, 470 / c.measureText('FEEL THE AGI').width);
      c.font = font(F.archivo(100, 800), fs);
      c.fillText('FEEL THE AGI', 0, 5);
      c.letterSpacing = '0px';
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.moveTo(270, -86); c.lineTo(222, -86); c.lineTo(270, -40); c.closePath(); c.fill();
    });
    // the mask (see: the shoggoth)
    at(1150, 300, 0.12, () => {
      shadow(); c.beginPath(); c.arc(0, 0, 150, 0, TAU); c.fillStyle = bone; c.fill(); noShadow();
      c.fillStyle = ink;
      c.beginPath(); c.arc(-52, -36, 17, 0, TAU); c.arc(52, -36, 17, 0, TAU); c.fill();
      c.lineWidth = 15; c.lineCap = 'round'; c.strokeStyle = ink;
      c.beginPath(); c.arc(0, 8, 78, 0.18 * Math.PI, 0.82 * Math.PI); c.stroke();
    });
    // the TikZ unicorn, die-cut
    at(360, 690, 0.05, () => {
      const parts = unicorn(1);
      const k = 44;
      const path = () => {
        c.beginPath();
        for (const p of parts) {
          if (p.id === 'leg4') continue;
          p.pts.forEach((q, i) => (i ? c.lineTo(q.x * k, -q.y * k) : c.moveTo(q.x * k, -q.y * k)));
          if (p.closed) c.closePath();
        }
      };
      // white die-cut margin, then an ink ground, then the drawing
      shadow(); c.lineJoin = 'round'; c.lineCap = 'round';
      rr(-205, -215, 410, 400, 60); c.fillStyle = bone; c.fill(); noShadow();
      rr(-190, -200, 380, 370, 48); c.fillStyle = ink; c.fill();
      c.translate(0, -20);
      c.lineWidth = 5; c.strokeStyle = bone; path(); c.stroke();
      c.fillStyle = sig; c.beginPath();
      const horn = parts.find((p) => p.id === 'horn')!;
      horn.pts.forEach((q, i) => (i ? c.lineTo(q.x * k, -q.y * k) : c.moveTo(q.x * k, -q.y * k))); c.closePath(); c.fill();
      c.font = font(F.mono(500), 24); c.fillStyle = bone;
      c.fillText('\\draw[unicorn];', 0, 158);
    });
    // SLIGHTLY CONSCIOUS
    at(1000, 640, -0.16, () => {
      shadow(); c.beginPath(); c.ellipse(0, 0, 250, 108, 0, 0, TAU); c.fillStyle = bone; c.fill(); noShadow();
      c.lineWidth = 4; c.strokeStyle = ink; c.beginPath(); c.ellipse(0, 0, 232, 92, 0, 0, TAU); c.stroke();
      c.fillStyle = ink; c.font = font(F.mono(600), 44); c.letterSpacing = '4px';
      c.fillText('SLIGHTLY', 0, -22); c.fillText('CONSCIOUS', 0, 30);
      c.letterSpacing = '0px';
    });
    // Q*
    at(720, 470, 0.3, () => {
      const star = (R: number) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.48 : R; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); };
      shadow(); c.lineJoin = 'round'; star(118); c.fillStyle = bone; c.fill(); noShadow();
      star(104); c.fillStyle = ink; c.fill();
      c.fillStyle = sig; c.font = font(F.serif(600, true), 76); c.fillText('Q*', 0, 10);
    });
    // a bumper strip along the bottom
    at(930, 900, 0.02, () => {
      shadow(); c.fillStyle = ink; c.fillRect(-330, -38, 660, 76); noShadow();
      c.strokeStyle = bone; c.lineWidth = 3; c.strokeRect(-322, -30, 644, 60);
      c.fillStyle = bone; c.font = font(F.serif(500, true), 40);
      c.fillText('attention is all you need', 0, 3);
    });
  }

  /** The screen's contents: a glare we never read, then the bar. */
  private drawScreen(bar: number) {
    const c = this.screenCv.getContext('2d')!;
    const w = 1024, h = 576; // logical (the canvas is SCALE x)
    const g = c.createRadialGradient(w * 0.5, h * 0.48, 40, w * 0.5, h * 0.5, w * 0.62);
    g.addColorStop(0, '#fffaf2'); g.addColorStop(1, '#e8dccb');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // something is on it — a curve that goes up and keeps going, blocks of text — glimpsed through the
    // glare, never in focus, never readable
    c.save();
    c.filter = 'blur(6px)';
    c.strokeStyle = 'rgba(150,128,110,0.7)'; c.lineWidth = 16;
    c.beginPath();
    for (let i = 0; i <= 60; i++) { const x = 520 + i * 6.2; const y = 392 - Math.pow(i / 60, 5) * 222; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
    c.fillStyle = 'rgba(160,140,122,0.6)';
    c.fillRect(160, 196, 190, 56);
    for (let i = 0; i < 5; i++) c.fillRect(160, 272 + i * 26, 160 + ((i * 97) % 200), 12);
    c.restore();
    if (bar > 0) {
      // a censor band slapped across the screen (lands from above-camera: scale 1.5 -> 1)
      const k = clamp(bar);
      const sc = k < 1 ? lerp(1.5, 1, ease.inQuad(k)) : 1;
      c.save();
      c.translate(w / 2, h * 0.5); c.rotate(-0.045); c.scale(sc, sc);
      c.globalAlpha = clamp(k * 3);
      c.fillStyle = '#030303';
      // narrower than the screen, so its glow frames the bar on every side (it reads as a bar on a screen)
      c.fillRect(-w * 0.43, -h * 0.26, w * 0.86, h * 0.52);
      c.fillStyle = rgba('signal');
      c.font = font(F.mono(600), 58);
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      c.letterSpacing = '14px';
      c.fillText('REDACTED', 7, 2);
      c.restore();
    }
    this.screenTex.needsUpdate = true;
  }

  state(t: number): RoomState {
    const T = this.T, au = this.au;
    const theatre = t >= T.ledOff + 0.12;
    // ---------------------------------------------------------- the room
    // orbit: from straight behind the lid, round the left side, to a front three-quarter view by "see?";
    // then squares up to dead front and sinks to the laptop's lip as the lid comes down
    // (it lingers behind the lid through "What did" — the stickers — and whips round on "Ilya see?")
    const ilya = this.T.l1.words[2]!;
    const phi = keys(t, [[T.start - 1, Math.PI], [T.what.start, Math.PI + 0.05, ease.inOutQuad], [ilya.start, Math.PI + 0.3, ease.inOutQuad],
      [T.slam - 0.02, TAU - 0.5, ease.inOutCubic], [T.slam + 0.35, TAU - 0.46, ease.outCubic], [T.slit, TAU, ease.inOutCubic]]);
    const r = keys(t, [[T.start - 1, 0.92], [T.what.start, 0.86, ease.linear], [T.slam, 0.62, ease.inOutCubic],
      [T.well.start, 0.6, ease.linear], [T.slit, 0.56, ease.inOutCubic], [T.dark + 0.1, 0.3, ease.inOutCubic], [T.ledOff, 0.27, ease.linear]]);
    const hgt = keys(t, [[T.start - 1, 0.24], [T.what.start, 0.22, ease.linear], [T.slam, 0.13, ease.inOutCubic],
      [T.well.start, 0.12, ease.linear], [T.slit, 0.045, ease.inOutCubic], [T.dark + 0.1, 0.02, ease.inOutCubic]]);
    const led: V3 = ILYA.led;
    const gap: V3 = [0, 0.7728, 0.1085];
    const tgtK = prog(t, T.well.start, T.slit, ease.inOutCubic);
    let tgt = mix3(add(S0, [0, -0.02, 0]), gap, tgtK);
    tgt = mix3(tgt, led, prog(t, T.slit + 0.05, T.dark, ease.inOutCubic));
    const pos = add(tgt, [r * Math.sin(phi), hgt, r * Math.cos(phi)]);
    const fov = lerp(36, 30, tgtK), roll = 0.015 * Math.sin(phi) * (1 - tgtK);
    // compose the laptop right of centre while the lyric sits in the dark at top left; centred again
    // by the time the slit collapses to the sleep light (the point the theatre and the outro inherit)
    const side = prog(t, T.start, T.what.start + 0.3, ease.inOutCubic) * (1 - prog(t, T.slit - 0.4, T.slit + 0.1, ease.inOutCubic));
    const c0 = lookAt(pos, tgt, fov, roll);
    const roomCam = side > 0 ? lookAt(pos, add(tgt, mul(c0.R, -0.14 * r * side)), fov, roll) : c0;
    // the lid: pushed down word by word, to a slit on the downbeat, then shut
    const lidA = keys(t, [[T.well.start - 0.02, LID_OPEN], [T.never.start, 1.42, ease.outCubic], [T.know.start, 0.8, ease.outCubic],
      [T.slit, 0.07, ease.inOutCubic], [T.dark, 0.035, ease.linear], [T.dark + 0.25, 0.0, ease.inCubic]]);
    // the slit collapses sideways to a point (the sleep light), then the screen is off
    const col = prog(t, T.slit + 0.05, T.dark, ease.inOutCubic);
    const hw = lerp(0.5, 0.004, col);
    const emitRect: [number, number, number, number] = [0.5 - hw, 0, 0.5 + hw, 1];
    const screenI = (t < T.dark ? 1 : 0) * (1 + 0.06 * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1));
    // the sleep light breathes once, peaking on the downbeat, then goes out
    const midDown = T.knowBar;
    const ledI = t < T.dark - 0.08 ? 0 : keys(t, [[T.dark - 0.08, 0], [T.dark + 0.05, 1.0, ease.outCubic], [T.dark + 0.45, 0.35, ease.inOutQuad],
      [midDown, 1.0, ease.inOutQuad], [T.ledOff - 0.12, 0.25, ease.inOutQuad], [T.ledOff, 0, ease.inQuad]]);
    const bar = prog(t, T.slam - 0.07, T.slam);
    if (!theatre) {
      return {
        cam: roomCam, lidA, screenI, ledI, props: 1, chairOn: 0, emitRect,
        stageOn: 0, spotI: 0, curtainK: 0, fillI: 0, hazeK: 0.6, bounceI: 0, gain: 1, bar, theatre,
      };
    }
    // ---------------------------------------------------------- the theatre
    const k = prog(t, T.was.start, T.end, ease.inOutQuad);
    const cpos: V3 = [0, lerp(1.45, 1.4, k), lerp(14.2, 12.4, k)];
    const ctgt: V3 = [0, 2.9, ILYA.seamZ];
    const cam = lookAt(cpos, ctgt, 40);
    const on = t >= T.was.start ? keys(t, [[T.was.start, 0], [T.was.start + 0.025, 1.25, ease.linear], [T.was.start + 0.05, 0.55, ease.linear],
      [T.was.start + 0.1, 1.0, ease.outCubic]]) : 0;
    const curtainK = prog(t, T.forW.start, T.meet, ease.inOutCubic);
    // the pool is the only light: as the curtains close in front of it the house goes dark
    const shut = Math.pow(1 - curtainK, 1.4);
    return {
      cam, lidA: 0, screenI: 0, ledI: 0, props: 0, chairOn: 0, emitRect,
      stageOn: 1, spotI: on, curtainK, fillI: 0.006 * on * shut, hazeK: 0.3, bounceI: 0.14 * shut, gain: 1 - prog(t, T.meet, T.show.start + 0.08, ease.inQuad), bar: 1, theatre,
    };
  }

  /**
   * Dust in the light: motes drifting through the screen's glow (the room) or the spot's beam (the
   * theatre), lit by an estimate of the same lights, drawn as additive specks (soft when near).
   */
  dust(lb: LineBatch, t: number, st: RoomState, gain = 1) {
    const N = st.theatre ? 420 : 260;
    const cam = st.cam;
    const nS = lidNrm(st.lidA);
    const C = lidPoint(st.lidA, 0, (ILYA.scrU[0] + ILYA.scrU[1]) / 2);
    const area = 2 * ILYA.scrX * (ILYA.scrU[1] - ILYA.scrU[0]) * (st.emitRect[2] - st.emitRect[0]);
    const sp: V3 = [0, 8.6, -2.4], aim = norm(sub([0, 0, 0.1], sp));
    for (let i = 0; i < N; i++) {
      let p: V3;
      if (!st.theatre) {
        const bx = hash(i, 1), by = hash(i, 2), bz = hash(i, 3);
        p = [lerp(-0.55, 0.55, bx) + 0.02 * noise1(t * 0.3 + i, 4), 0.76 + ((by * 0.62 + t * 0.006 * (0.5 + hash(i, 5))) % 0.62),
          lerp(-0.25, 0.95, bz) + 0.015 * noise1(t * 0.25 + i * 3, 6)];
      } else {
        const u = hash(i, 7), v = hash(i, 8), w = hash(i, 9);
        const y = (v * 8.2 + t * 0.03 * (0.4 + hash(i, 10))) % 8.2;
        // spread around the beam's axis at that height
        const k = (8.6 - y) / 8.6;
        const ax = lerp(sp[0], 0, 1 - k), az = lerp(sp[2], 0.1, 1 - k);
        const r = (0.2 + 1.1 * (1 - k)) * Math.sqrt(u);
        const a = w * TAU + 0.1 * noise1(t * 0.2 + i, 11);
        p = [ax + Math.cos(a) * r, y, az + Math.sin(a) * r * 0.7];
      }
      let I = 0;
      if (!st.theatre) {
        const d = sub(p, C), dl = Math.hypot(d[0], d[1], d[2]);
        const ct = dot(d, nS) / dl;
        if (ct > 0 && st.screenI > 0) {
          I = st.screenI * area * ct / (Math.PI * dl * dl) * 14;
          I = I * I / (I + 0.4);
          // hidden behind the lid? (camera behind the screen plane, mote in front of it)
          const cr = sub(cam.pos, HINGE);
          if (dot(cr, nS) < 0) {
            const dir = sub(p, cam.pos);
            const sI = dot(sub(HINGE, cam.pos), nS) / dot(dir, nS);
            const X = add(cam.pos, mul(dir, sI));
            const lu = dot(sub(X, HINGE), lidDir(st.lidA));
            if (Math.abs(X[0]) < 0.16 && lu > -0.005 && lu < ILYA.lidL + 0.005) continue;
          }
        }
      } else if (st.spotI > 0) {
        const d = sub(p, sp), dl = Math.hypot(d[0], d[1], d[2]);
        const c = dot(d, aim) / dl;
        const cone = clamp((c - Math.cos(0.118)) / (Math.cos(0.1) - Math.cos(0.118)));
        I = st.spotI * cone * 30 / (dl * dl) * 0.9 * (1 - st.curtainK);
      }
      // only motes well inside the light: faint ones scattered in the dark read as stars
      if (I < 0.04) continue;
      I *= smoothstep(0.04, 0.25, I);
      const q = project(cam, p);
      if (q.z < 0.08 || q.x < -20 || q.x > W + 20 || q.y < -20 || q.y > H + 20) continue;
      const size = (st.theatre ? 0.004 : 0.0011) * cam.focal / q.z;
      const soft = clamp((size - 3) / 10);
      const tw = 0.6 + 0.4 * Math.sin(t * (2 + 3 * hash(i, 12)) + i);
      const k = Math.min(I, 2.5) * tw * gain * (1 - 0.8 * soft);
      lb.seg2(q.x, q.y, q.x + 0.01, q.y, clamp(size, st.theatre ? 1.1 : 1.6, 16), [LIN.bone[0] * k, LIN.bone[1] * 0.92 * k, LIN.bone[2] * 0.8 * k], 1 - 0.6 * soft);
    }
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, t: number, st = this.state(t)) {
    const u = this.pass.u;
    u.time!.value = t;
    const c = st.cam;
    (u.camPos!.value as THREE.Vector3).set(...c.pos);
    (u.camR!.value as THREE.Vector3).set(...c.R);
    (u.camU!.value as THREE.Vector3).set(...c.U);
    (u.camF!.value as THREE.Vector3).set(...c.F);
    u.focal!.value = c.focal;
    u.lidA!.value = st.lidA; u.screenI!.value = st.screenI; u.ledI!.value = st.ledI; u.props!.value = st.props; u.chairOn!.value = st.chairOn;
    (u.emitRect!.value as THREE.Vector4).set(...st.emitRect);
    u.stageOn!.value = st.stageOn; u.spotI!.value = st.spotI; u.curtainK!.value = st.curtainK; u.fillI!.value = st.fillI;
    u.hazeK!.value = st.hazeK; u.bounceI!.value = st.bounceI; u.gain!.value = st.gain;
    const sp: V3 = [0, 8.6, -2.4], aim: V3 = [0, 0, 0.1];
    (u.spotPos!.value as THREE.Vector3).set(...sp);
    (u.spotDir!.value as THREE.Vector3).set(...norm(sub(aim, sp)));
    (u.spotCos!.value as THREE.Vector2).set(Math.cos(0.118), Math.cos(0.108));
    const barQ = Math.round(st.bar * 40) / 40;
    if (barQ !== this.lastBar) { this.drawScreen(barQ); this.lastBar = barQ; }
    this.pass.render(renderer, target);
  }
}
