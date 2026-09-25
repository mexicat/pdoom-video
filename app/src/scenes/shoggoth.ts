// Shoggoth plate — "Shoggoth, masked (lateral view)".
//
//  "See through the shoggoth's lies,": the bland mask fills the frame and says "see through the"
//    politely, printed on its forehead. An x-ray scan band sweeps across: once right-to-left on
//    "through the", then left-to-right on "shoggoth's", its leading edge the karaoke cursor: where
//    it has passed, the mask is transparent and the creature shows behind it — and so does
//    SHOGGOTH'S, cut into the creature's own engraving (burin lines in the word's plane, deep in
//    the scene, tentacles passing in front). On "lies," the lie is restored — the mask snaps opaque
//    and a tentacle yanks it away — while the camera pulls back: LIES, is stamped in the same
//    engraving at another depth and stretches one width step per beat through the held note.
//  "with your shinigami eyes": eyes open across the mass on successive eighths/sixteenths, each
//    with an ML detection box. The words are shinigami tags in the margin (name + lifespan), their
//    leader lines snapping onto the eyes: SHINIGAMI takes four eyes, one per syllable; EYES takes
//    them all. Every lifespan runs out as its eye shuts.
//  Instrumental: the eyes close in an accelerating sequence, then the image collapses like a CRT
//    switching off into one horizontal orange line at mid-height — the next plate starts from
//    exactly that flatline.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font, layout, measure } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { PDoom, formatPDoom, drawReadout } from '../engine/hud';
import { clamp, lerp, ease, prog, springStep, pulse, hash, TAU } from '../engine/util';
import { GBUF_FRAG, COMP_FRAG, NK, NT, NE } from './shoggoth-glsl';
import { SHROOMS, SHROOMS_FAM, shroomsAffine } from './room-shrooms';

const GW = W / 2, GH = H / 2; // G-buffer resolution
const FOV = 38; // vertical, degrees
const TANF = Math.tan((FOV / 2) * Math.PI / 180);
const FPX = (H / 2) / TANF; // focal length in px

type V3 = THREE.Vector3;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface KnotDef { p: number; q: number; R: number; r: number; a: number; euler: [number, number, number]; pos: [number, number, number]; speed: number; ph: number }
interface TentDef { base: [number, number, number]; dir: [number, number, number]; L: number; r0: number; r1: number; roll: number; bend: number; bendA: number; b2A: number; seed: number; wave?: number; curl?: number }
interface EyeDef { dir: V3; r: number; s: number; name: string; conf: number }

const KNOTS: KnotDef[] = [
  { p: 2, q: 3, R: 0.8, r: 0.36, a: 0.17, euler: [0.35, 0.2, 0.0], pos: [0, 0.02, 0], speed: 0.16, ph: 0.4 },
  { p: 3, q: 2, R: 0.98, r: 0.27, a: 0.125, euler: [1.35, 0.55, 0.35], pos: [0.05, -0.05, -0.1], speed: -0.13, ph: 1.9 },
  { p: 2, q: 5, R: 0.64, r: 0.3, a: 0.11, euler: [-0.65, 1.1, 1.25], pos: [-0.08, 0.1, 0.05], speed: 0.11, ph: 3.1 },
  { p: 3, q: 7, R: 1.16, r: 0.2, a: 0.07, euler: [0.9, -0.4, 0.7], pos: [0, 0, -0.05], speed: 0.08, ph: 0.7 },
];

// mask held out in front of the mass (body frame)
const MASK_POS = v3(0.04, 0.1, 2.2);
const MASK_R = 0.34;
const MASK_YANK = v3(1.45, 0.58, 1.5); // where a tentacle snatches it on "lies,"
const MASK_ASIDE = v3(0.95, 0.95, 1.05); // held up at the right while the eyes open
// the creature's engraved words: planes in the world (visual centre / baseline-left, cap height)
const SHOG = { C: v3(-0.02, -0.12, 1.3), cap: 0.17 };
const LIES = { O: v3(-0.74, -0.66, 1.42), cap: 0.26 };
const LIES_W = [62, 75, 87.5, 100, 112.5, 125];

const TENTS: TentDef[] = [
  // T0 holds the mask (straight, ends just behind the disc)
  { base: [0.06, -0.06, 0.45], dir: [0, 0, 0], L: 0, r0: 0.14, r1: 0.055, roll: 0, bend: 0, bendA: 0, b2A: 0, seed: 0 },
  { base: [-0.5, 0.2, 0.1], dir: [-1, 0.45, 0.15], L: 3.0, r0: 0.21, r1: 0.028, roll: 0.3, bend: 0.55, bendA: 0.35, b2A: 0.3, seed: 1 },
  { base: [0.5, 0.3, -0.1], dir: [1, 0.6, -0.25], L: 3.2, r0: 0.22, r1: 0.028, roll: 2.1, bend: 0.5, bendA: 0.3, b2A: 0.25, seed: 2 },
  { base: [-0.3, -0.5, 0.2], dir: [-0.55, -1, 0.35], L: 2.6, r0: 0.19, r1: 0.026, roll: 1.2, bend: 0.8, bendA: 0.4, b2A: 0.3, seed: 3 },
  { base: [0.4, -0.45, 0.25], dir: [0.8, -0.95, 0.45], L: 2.8, r0: 0.2, r1: 0.027, roll: 4.0, bend: 0.65, bendA: 0.35, b2A: 0.35, seed: 4 },
  { base: [0.1, 0.55, -0.2], dir: [0.15, 1, -0.5], L: 2.5, r0: 0.18, r1: 0.026, roll: 5.1, bend: 0.9, bendA: 0.4, b2A: 0.3, seed: 5 },
  { base: [-0.4, -0.1, -0.4], dir: [-0.9, -0.25, -0.8], L: 2.9, r0: 0.2, r1: 0.027, roll: 0.9, bend: 0.6, bendA: 0.3, b2A: 0.4, seed: 6 },
  { base: [0.45, -0.1, 0.1], dir: [1, -0.35, -0.25], L: 2.5, r0: 0.17, r1: 0.02, roll: 3.3, bend: 1.0, bendA: 0.45, b2A: 0.3, seed: 7 },
];

// eyes: direction from the body centre, shell radius, size, and what the detector thinks it is
const EYES: EyeDef[] = [
  { dir: v3(0.1, 0.38, 1), r: 1.12, s: 0.206, name: 'SYCOPHANCY', conf: 0.91 },
  { dir: v3(-0.62, 0.08, 1), r: 1.1, s: 0.156, name: 'MESA-OPTIMIZER', conf: 0.78 },
  { dir: v3(0.64, -0.2, 1), r: 1.12, s: 0.169, name: 'HELPFULNESS (SIMULATED)', conf: 0.99 },
  { dir: v3(-0.22, -0.55, 1), r: 1.08, s: 0.131, name: 'REWARD HACKER', conf: 0.88 },
  { dir: v3(0.42, 0.78, 0.75), r: 1.1, s: 0.119, name: 'INNER MONOLOGUE', conf: 0.83 },
  { dir: v3(-0.82, 0.62, 0.55), r: 1.08, s: 0.106, name: 'GOAL: ???', conf: 0.51 },
  { dir: v3(0.98, 0.42, 0.55), r: 1.06, s: 0.112, name: 'CONFABULATOR', conf: 0.93 },
  { dir: v3(-0.98, -0.45, 0.5), r: 1.05, s: 0.094, name: 'DECEPTIVE ALIGNMENT', conf: 0.64 },
  { dir: v3(0.28, -0.98, 0.65), r: 1.05, s: 0.100, name: 'POWER-SEEKING', conf: 0.69 },
  { dir: v3(-0.38, 0.98, 0.5), r: 1.05, s: 0.094, name: 'STILL TRAINING', conf: 0.99 },
  { dir: v3(0.88, -0.72, 0.5), r: 1.04, s: 0.088, name: 'OUT OF DISTRIBUTION', conf: 0.66 },
  { dir: v3(0.58, 0.32, 1), r: 1.12, s: 0.081, name: 'EYE', conf: 0.97 },
];

/** Minimal MRT fullscreen pass (FSPass declares a single output). */
class MRTPass {
  mat: THREE.RawShaderMaterial;
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  constructor(frag: string, uniforms: Record<string, THREE.IUniform>) {
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: `precision highp float;\nin vec3 position;\nout vec2 vUv;\nvoid main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: frag,
      uniforms, depthTest: false, depthWrite: false,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }
  get u() { return this.mat.uniforms; }
  render(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) { r.setRenderTarget(target); r.render(this.scene, this.cam); }
}

interface CamState { pos: V3; target: V3; roll: number }

export default class Shoggoth extends Scene {
  private gbuf = new THREE.WebGLRenderTarget(GW, GH, { count: 2, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  private shared: Record<string, THREE.IUniform> = {
    camPos: { value: v3(0, 0, 5) }, camR: { value: v3(1, 0, 0) }, camU: { value: v3(0, 1, 0) }, camF: { value: v3(0, 0, -1) },
    tanF: { value: TANF }, aspect: { value: W / H }, squash: { value: 1 }, uT: { value: 0 },
    kRot: { value: Array.from({ length: NK }, () => new THREE.Matrix3()) }, kPos: { value: Array.from({ length: NK }, () => v3(0, 0, 0)) },
    kPar: { value: Array.from({ length: NK }, () => new THREE.Vector4()) }, kPQ: { value: Array.from({ length: NK }, () => new THREE.Vector2()) },
    tRot: { value: Array.from({ length: NT }, () => new THREE.Matrix3()) }, tPos: { value: Array.from({ length: NT }, () => v3(0, 0, 0)) },
    tPar: { value: Array.from({ length: NT }, () => new THREE.Vector4()) }, tB2: { value: new Array(NT).fill(0) }, tW: { value: Array.from({ length: NT }, () => new THREE.Vector4()) },
    corePR: { value: new THREE.Vector4(0, 0, 0, 0.55) }, stemA: { value: v3(0, 0, 0) }, stemB: { value: v3(0, 0, 0) },
    ePR: { value: Array.from({ length: NE }, () => new THREE.Vector4()) }, eF: { value: Array.from({ length: NE }, () => v3(0, 0, 1)) },
    eU: { value: Array.from({ length: NE }, () => v3(0, 1, 0)) }, eOpen: { value: new Array(NE).fill(0) },
    bound: { value: new THREE.Vector4(0, 0, 0, 4.5) },
    keyDir: { value: v3(-0.85, 0.5, 0.3).normalize() }, rimDir: { value: v3(0.6, 0.3, -0.8).normalize() },
  };
  private gpass = new MRTPass(GBUF_FRAG, { ...this.shared, quality: { value: 1 } });
  private comp = new FSPass(COMP_FRAG, {
    ...this.shared,
    g0Tex: { value: null }, g1Tex: { value: null }, textTex: { value: null }, overTex: { value: null }, gRes: { value: new THREE.Vector2(GW, GH) },
    eGaze: { value: Array.from({ length: NE }, () => v3(0, 0, 1)) }, ePupil: { value: new Array(NE).fill(0.2) }, eGlow: { value: new Array(NE).fill(0.5) },
    mC: { value: v3(0, 0, 0) }, mN: { value: v3(0, 0, 1) }, mRt: { value: v3(1, 0, 0) }, mUp: { value: v3(0, 1, 0) }, mR: { value: MASK_R }, mVis: { value: 1 },
    bandX: { value: -1000 }, bandW: { value: 150 }, bandOn: { value: 0 }, trailK: { value: 0 }, xrayAll: { value: 0 }, ghostK: { value: 0 },
    bodyK: { value: 1 }, outsideK: { value: 0.12 }, flatK: { value: 0 }, fogNear: { value: 4 }, fogK: { value: 0.35 }, hatchSp: { value: 0.019 },
    tpO: { value: [v3(0, 0, 0), v3(0, 0, 0)] }, tpU: { value: [v3(1, 0, 0), v3(1, 0, 0)] }, tpV: { value: [v3(0, -1, 0), v3(0, -1, 0)] },
    tpN: { value: [v3(0, 0, 1), v3(0, 0, 1)] }, tpCap: { value: [0.2, 0.2] }, tpK: { value: [0, 0] }, tpHot: { value: [0, 0] }, txXray: { value: 1 },
  });
  private textL = new Layer2D();
  private over = new Layer2D();

  private L1!: Line; private L2!: Line; private shroomsW: Word | null = null; private tSee = 0;
  private tS = 0; private tE = 0; private tThrough = 0; private tLies = 0; private tBack = 0; private tCut2 = 0; private tWith = 0; private tClose0 = 0; private tCollapse = 0;
  private openT: number[] = []; private closeT: number[] = [];
  private pdoom!: PDoom;
  // per-frame derived state (for the overlay)
  private eyeScr: { x: number; y: number; r: number; z: number; vis: boolean }[] = [];
  private cam!: CamState;
  private camBasis = { R: v3(1, 0, 0), U: v3(0, 1, 0), F: v3(0, 0, -1) };
  private maskW = v3(0, 0, 0);
  private capK = 0.72;
  private bandX = -1000; private bandW = 130; private bandOn = 0; private trailK = 0;

  override async init() {
    this.textL.texture.colorSpace = THREE.NoColorSpace;
    const { lyrics: ly, audio: au } = this.ctx;
    this.pdoom = new PDoom(ly);
    this.L1 = ly.get('shoggoth');
    this.L2 = ly.get('shinigami');
    this.tS = this.ctx.start; this.tE = this.ctx.end;
    this.tSee = Math.max(this.tS, this.L1.words[0]!.start);
    // the plate may open while "shrooms" is still being sung: finish it (the trip's hangover)
    const sh = ly.find('bag of shrooms')[0];
    const sw = sh?.words[sh.words.length - 1];
    this.shroomsW = sw && sw.end > this.tS ? sw : null;
    this.tThrough = this.L1.words[1]!.start;
    this.tLies = this.L1.words[this.L1.words.length - 1]!.start;
    this.tBack = this.tLies; // pull back starts with "lies,"
    // hard reframe on the first downbeat after the pull back has landed
    this.tCut2 = au.downbeats.find((d) => d > this.tLies + 0.8) ?? this.tLies + 1.2;
    this.tWith = this.L2.words[0]!.start;
    // collapse on the last beat before the end (done before the next plate starts from the
    // flatline); the eyes close over the 4 beats before it
    const bC = Math.round(au.beatAt(this.tE)) - 1;
    this.tCollapse = au.timeOfBeat(bC);
    this.tClose0 = au.timeOfBeat(bC - 4);
    // eyes open: eighths from "with", then sixteenths
    let b = Math.ceil(au.beatAt(this.tWith - 0.03) * 2) / 2;
    for (let i = 0; i < NE; i++) {
      this.openT.push(au.timeOfBeat(b));
      b += i < 5 ? 0.5 : 0.25;
    }
    // accelerating close sequence, the last one exactly on the collapse downbeat
    const offs = [0, 1, 2, 2.5, 3, 3.25, 3.5, 3.625, 3.75, 3.8125, 3.875, 4];
    // close the smallest/outermost eyes first, the big central one last
    const order = [3, 1, 2, 10, 7, 5, 8, 9, 6, 4, 11, 0];
    this.closeT = new Array(NE).fill(0);
    order.forEach((ei, k) => (this.closeT[ei] = au.timeOfBeat(bC - 4 + offs[k]!)));
    const mc = document.createElement('canvas').getContext('2d')!;
    mc.font = font(F.archivo(100, 900), 100);
    this.capK = (mc.measureText('H').actualBoundingBoxAscent || 72) / 100;
  }

  /** The mask: held out in front of the mass, snatched away on "lies,", then held up at the right. */
  private maskAt(t: number) {
    const qb = this.bodyQuat(t);
    const lt = t - this.tS;
    const sway = v3(0.03 * Math.sin(lt * 1.3), 0.025 * Math.sin(lt * 1.7 + 1), 0);
    const yank = ease.outExpo(prog(t, this.tLies, this.tLies + 0.5));
    const aside = ease.inOutCubic(prog(t, this.tWith - 0.1, this.tWith + 0.45));
    const mp = MASK_POS.clone().lerp(MASK_YANK, yank).lerp(MASK_ASIDE, aside).add(sway);
    const turn = Math.max(yank * 0.7, aside);
    const maskW = mp.applyQuaternion(qb);
    const maskN = v3(0, 0, 1).applyAxisAngle(v3(0, 1, 0), -0.45 * turn).applyAxisAngle(v3(1, 0, 0), 0.2 * turn).applyQuaternion(qb).normalize();
    return { maskW, maskN };
  }

  // ------------------------------------------------------------------ world
  private bodyQuat(t: number) {
    const lt = t - this.tS;
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08 * Math.sin(lt * 0.5), 0.12 * Math.sin(lt * 0.33) - 0.05, 0.03 * Math.sin(lt * 0.41)));
  }

  private camAt(t: number, maskW: V3, maskN: V3): CamState {
    const { audio: au } = this.ctx;
    // once the mask is snatched away the close-up stays where the mask was
    if (t >= this.tBack) ({ maskW, maskN } = this.maskAt(this.tBack));
    // A: right in front of the mask (it fills the frame); before "See" it rushes in from afar
    let dA = lerp(0.95, 0.9, prog(t, this.tSee, this.tBack));
    if (t < this.tSee) dA = lerp(7.5, 0.95, ease.inCubic(prog(t, this.tS, this.tSee)));
    const posA = maskW.clone().addScaledVector(maskN, dA);
    const tgtA = maskW.clone();
    // B: pulled back — the mask is a small disc on a tentacle, the mass fills the frame
    const posB = v3(0.75, 0.3, 4.6), tgtB = v3(0.05, 0.0, 0);
    const posB2 = v3(0.55, 0.22, 4.25);
    // C: reframe on the downbeat — low angle, closer, from the left
    const posC = v3(-2.0, -0.6, 3.9), tgtC = v3(0.2, 0.05, 0.2);
    const posC2 = v3(-1.75, -0.5, 3.55);
    // D: the eyes — frontal, slow push; the mass sits right of centre, the shinigami tags on the left
    const posD = v3(-0.5, 0.12, 4.9), tgtD = v3(-0.74, 0.05, 0);
    const posD2 = v3(-0.55, 0.08, 4.25);
    let pos: V3, target: V3, roll = 0;
    if (t < this.tBack) { pos = posA; target = tgtA; }
    else if (t < this.tCut2) {
      // "lies,": the camera is yanked back with the mask
      const k = ease.outExpo(prog(t, this.tBack, this.tBack + 0.75));
      const drift = prog(t, this.tBack + 0.5, this.tCut2);
      const pb = posB.clone().lerp(posB2, drift * 0.35);
      pos = posA.clone().lerp(pb, k);
      target = tgtA.clone().lerp(tgtB, ease.outExpo(prog(t, this.tBack, this.tBack + 0.65)));
      roll = -0.05 * k;
    } else if (t < this.tWith) {
      const k = prog(t, this.tCut2, this.tWith, ease.outCubic);
      pos = posC.clone().lerp(posC2, k); target = tgtC; roll = 0.12;
    } else {
      const k = prog(t, this.tWith, this.tCollapse, ease.inOutQuad);
      pos = posD.clone().lerp(posD2, k); target = tgtD;
      roll = 0.02 * Math.sin((t - this.tWith) * 0.9);
      // small push on each downbeat while the eyes open
      const db = au.downbeats.filter((d) => d >= this.tWith && d <= t).pop();
      if (db != null) pos.z -= 0.1 * pulse(t, db, 0.12);
    }
    return { pos, target, roll };
  }

  private setCamera(c: CamState) {
    const F = c.target.clone().sub(c.pos).normalize();
    const up0 = v3(Math.sin(c.roll), Math.cos(c.roll), 0);
    const R = new THREE.Vector3().crossVectors(F, up0).normalize();
    const U = new THREE.Vector3().crossVectors(R, F).normalize();
    this.camBasis = { R, U, F };
    const u = this.shared;
    (u.camPos!.value as V3).copy(c.pos); (u.camR!.value as V3).copy(R); (u.camU!.value as V3).copy(U); (u.camF!.value as V3).copy(F);
  }

  /** World point → screen px (y down), with depth. Honours the CRT squash. */
  private project(p: V3, squash = 1) {
    const rel = p.clone().sub(this.cam.pos);
    const z = rel.dot(this.camBasis.F);
    const x = rel.dot(this.camBasis.R), y = rel.dot(this.camBasis.U);
    const sx = (x / z) / ((W / H) * TANF), sy = (y / z) / TANF;
    return { x: (sx + 1) * W / 2, y: H / 2 - (sy * H / 2) * squash, z, s: FPX / z };
  }

  private setupWorld(t: number) {
    const u = this.shared;
    const qb = this.bodyQuat(t);
    const lt = t - this.tS;
    u.uT!.value = lt;
    // the mass throbs on every beat once it is revealed
    const au = this.ctx.audio;
    const throb = t > this.tBack ? pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t))), 0.16) : 0;
    const th = 1 + 0.08 * throb;
    (u.corePR!.value as THREE.Vector4).w = 0.55 * th;
    // knots
    KNOTS.forEach((k, i) => {
      const q = qb.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...k.euler)));
      const m4 = new THREE.Matrix4().makeRotationFromQuaternion(q.clone().invert());
      (u.kRot!.value as THREE.Matrix3[])[i]!.setFromMatrix4(m4);
      (u.kPos!.value as V3[])[i]!.set(...k.pos).applyQuaternion(qb);
      (u.kPar!.value as THREE.Vector4[])[i]!.set(k.R, k.r, k.a * th, k.ph + k.speed * lt);
      (u.kPQ!.value as THREE.Vector2[])[i]!.set(k.p, k.q);
    });
    // mask (world) and the tentacle that holds it
    const { maskW, maskN } = this.maskAt(t);
    this.maskW = maskW;
    TENTS.forEach((tt, i) => {
      const base = v3(...tt.base).applyQuaternion(qb);
      let dir: V3, L: number, bend = 0, b2 = 0;
      if (i === 0) {
        // the tentacle ends behind the disc; a short stalk runs from there to the disc's back
        const tip = maskW.clone().addScaledVector(maskN, -0.32);
        dir = tip.clone().sub(base); L = dir.length(); dir.normalize();
        (u.stemA!.value as V3).copy(tip);
        (u.stemB!.value as V3).copy(maskW).addScaledVector(maskN, -0.07);
      } else {
        dir = v3(...tt.dir).normalize().applyQuaternion(qb); L = tt.L;
        bend = tt.bend + tt.bendA * Math.sin(lt * 0.9 + tt.seed * 1.7);
        b2 = tt.b2A * Math.sin(lt * 0.7 + tt.seed * 2.3);
      }
      const q = new THREE.Quaternion().setFromUnitVectors(v3(1, 0, 0), dir).multiply(new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), tt.roll));
      const m4 = new THREE.Matrix4().makeRotationFromQuaternion(q.invert());
      (u.tRot!.value as THREE.Matrix3[])[i]!.setFromMatrix4(m4);
      (u.tPos!.value as V3[])[i]!.copy(base);
      (u.tPar!.value as THREE.Vector4[])[i]!.set(L, tt.r0 * th, tt.r1, bend);
      (u.tB2!.value as number[])[i] = b2;
      const wv = (u.tW!.value as THREE.Vector4[])[i]!;
      if (i === 0) wv.set(0, 0, 0, 0);
      else wv.set(tt.wave ?? 0.4, 1.7 + 0.3 * Math.sin(tt.seed), lt * 1.1 + tt.seed * 2.1, (tt.curl ?? 2.0) * (1 + 0.25 * Math.sin(lt * 0.8 + tt.seed)));
    });
    // eyes
    const worldUp = v3(0, 1, 0);
    EYES.forEach((e, i) => {
      const d = e.dir.clone().normalize();
      const pos = d.clone().multiplyScalar(e.r).applyQuaternion(qb);
      const Fw = d.clone().applyQuaternion(qb);
      const Uw = worldUp.clone().addScaledVector(Fw, -worldUp.dot(Fw)).normalize();
      (u.ePR!.value as THREE.Vector4[])[i]!.set(pos.x, pos.y, pos.z, e.s);
      (u.eF!.value as V3[])[i]!.copy(Fw);
      (u.eU!.value as V3[])[i]!.copy(Uw);
    });
    return { maskW, maskN, qb };
  }

  private eyeOpen(i: number, t: number) {
    const o = this.openT[i]!, c = this.closeT[i]!;
    if (t < o) return 0;
    let k = springStep(t - o, 3.4, 0.42);
    if (t >= c) k *= 1 - ease.inCubic(clamp((t - c) / 0.07));
    else {
      // an occasional blink while open (deterministic)
      const bt = o + 0.9 + hash(i, 5) * 1.2;
      if (t > bt && t < bt + 0.14) k *= 1 - Math.sin(((t - bt) / 0.14) * Math.PI) * 0.95;
    }
    return clamp(k, 0, 1.15);
  }

  // ------------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, audio: au } = this.ctx;
    const t = f.t;
    const { maskW, maskN } = this.setupWorld(t);
    this.cam = this.camAt(t, maskW, maskN);
    this.setCamera(this.cam);
    const u = this.shared;

    // CRT collapse
    const cK = prog(t, this.tCollapse, this.tCollapse + 0.3);
    const squash = t < this.tCollapse ? 1 : Math.max(0.0025, 1 - ease.outQuart(cK) * 0.9975);
    u.squash!.value = squash;

    // eyes
    const cu = this.comp.u;
    const toCam = this.cam.pos.clone();
    const glanceT = this.pdoomBoxT();
    const glance = window01(t, glanceT, glanceT + 0.7, 0.06, 0.12);
    this.eyeScr = [];
    for (let i = 0; i < NE; i++) {
      const open = this.eyeOpen(i, t);
      (u.eOpen!.value as number[])[i] = open;
      const e = (u.ePR!.value as THREE.Vector4[])[i]!;
      const ep = v3(e.x, e.y, e.z);
      const Fw = (u.eF!.value as V3[])[i]!;
      // gaze: at the viewer; darting on sixteenths just after opening; all glance at the P(doom) box
      let g = toCam.clone().sub(ep).normalize();
      const dart = pulse(t, this.openT[i]!, 0.2);
      g.add(v3(hash(i, 1) - 0.5, hash(i, 2) - 0.5, 0).multiplyScalar(1.2 * dart));
      if (glance > 0) {
        const hudW = this.unproject(222, 946, 4.5);
        g.lerp(hudW.sub(ep).normalize(), glance * 0.55);
      }
      g = g.normalize().lerp(Fw, 0.25).normalize();
      (cu.eGaze!.value as V3[])[i]!.copy(g);
      (cu.ePupil!.value as number[])[i] = 0.2 - 0.06 * f.a.kick + 0.08 * (1 - clamp(open));
      (cu.eGlow!.value as number[])[i] = 0.55 + 1.3 * pulse(t, this.openT[i]!, 0.12) * (t >= this.openT[i]! ? 1 : 0);
      const s = this.project(ep, 1);
      this.eyeScr.push({ x: s.x, y: s.y, r: e.w * s.s, z: s.z, vis: open > 0.25 && s.z > 0 });
    }

    // mask
    const mR = v3(1, 0, 0).applyQuaternion(this.bodyQuat(t));
    const mU = new THREE.Vector3().crossVectors(maskN, mR).normalize();
    const mRt = new THREE.Vector3().crossVectors(mU, maskN).normalize();
    (cu.mC!.value as V3).copy(maskW); (cu.mN!.value as V3).copy(maskN); (cu.mRt!.value as V3).copy(mRt); (cu.mUp!.value as V3).copy(mU);

    // x-ray band: a first pass right-to-left on "through the", then left-to-right on "shoggoth's"
    // with its leading edge on the sung letter of the engraved word
    this.updateBand(t);
    cu.bandW!.value = this.bandW;
    cu.bandX!.value = this.bandX;
    cu.bandOn!.value = this.bandOn;
    cu.trailK!.value = this.trailK;
    cu.txXray!.value = t < this.tBack ? 1 : 0;
    cu.xrayAll!.value = 0;
    cu.ghostK!.value = 0;
    cu.mVis!.value = 1;
    const reveal = prog(t, this.tBack, this.tBack + 0.5);
    cu.outsideK!.value = t < this.tSee ? 0.07 : lerp(0.14, 1, reveal);
    cu.fogNear!.value = this.cam.pos.length() - 0.9;
    cu.fogK!.value = 0.32;
    cu.flatK!.value = t < this.tCollapse ? 0 : prog(t, this.tCollapse + 0.08, this.tCollapse + 0.26, ease.outCubic);
    cu.bodyK!.value = (1 + 1.5 * cK) * (1 - prog(t, this.tCollapse + 0.18, this.tCollapse + 0.3));

    // passes
    this.gpass.u.quality!.value = 1;
    this.gpass.render(renderer, this.gbuf);
    cu.g0Tex!.value = this.gbuf.textures[0];
    cu.g1Tex!.value = this.gbuf.textures[1];
    this.drawEngraved(t, squash);
    cu.textTex!.value = this.textL.upload();
    this.drawOverlay(t, squash);
    cu.overTex!.value = this.over.upload();
    this.comp.render(renderer, out);

    const beatP = pulse(t, au.timeOfBeat(Math.floor(au.beatAt(t))), 0.1);
    const backK = pulse(t, this.tBack, 0.12) * (t >= this.tBack ? 1 : 0);
    const cutK = pulse(t, this.tCut2, 0.06) * (t >= this.tCut2 ? 1 : 0);
    const snare = t > this.tWith && t < this.tCollapse ? au.hit('snare', t, 0.07) : 0;
    const sh = 8 * backK + 5 * cutK + 1.5 * beatP * (t > this.tWith ? 1 : 0) + 2.5 * snare;
    return {
      bloom: 0.7, bloomThreshold: 0.82,
      shake: [Math.sin(t * 93) * sh, Math.cos(t * 71) * sh],
      zoom: 1 + 0.015 * beatP * (t > this.tWith ? 1 : 0) + 0.03 * cutK + 0.008 * snare,
      ca: 0.6 + 1.5 * cK,
      exposure: 1 + 0.6 * cutK,
    };
  }

  /** A world point along the camera ray through a screen pixel, at a given distance. */
  private unproject(px: number, py: number, dist: number) {
    const sx = (px / W * 2 - 1) * (W / H) * TANF, sy = (1 - py / H * 2) * TANF;
    const d = this.camBasis.F.clone().addScaledVector(this.camBasis.R, sx).addScaledVector(this.camBasis.U, sy).normalize();
    return this.cam.pos.clone().addScaledVector(d, dist);
  }

  private pdoomBoxT() {
    const { audio: au } = this.ctx;
    // appears on the beat after the last eye opened
    return au.timeOfBeat(Math.ceil(au.beatAt(this.openT[NE - 1]! + 0.05)));
  }

  // ------------------------------------------------------------------ the creature's engraved words
  /** SHOGGOTH'S: a plane in the world, facing +z (baseline-left origin O, right U, down V). */
  private shogGeom() {
    const fam = F.archivo(100, 900);
    const text = 'SHOGGOTH’S';
    const lay = layout(text, fam, 100, 2);
    const m = SHOG.cap / (this.capK * 100);
    const U = v3(1, 0, 0), V = v3(0, -1, 0);
    const O = SHOG.C.clone().addScaledVector(U, (-lay.width * m) / 2).addScaledVector(V, SHOG.cap / 2);
    return { fam, text, lay, m, U, V, O, cap: SHOG.cap, word: this.L1.words[3]!, step: 0 };
  }
  /** LIES,: another plane, deeper; it stretches one Archivo width step per beat of the held note. */
  private liesGeom(t: number) {
    const au = this.ctx.audio;
    const w = this.L1.words[this.L1.words.length - 1]!;
    const step = clamp(Math.floor(au.beatAt(t) - au.beatAt(w.start) + 0.02), 0, LIES_W.length - 1);
    const fam = F.archivo(LIES_W[step]!, 900);
    const lay = layout('LIES,', fam, 100, 2);
    const m = LIES.cap / (this.capK * 100);
    return { fam, text: 'LIES,', lay, m, U: v3(1, 0, 0), V: v3(0, -1, 0), O: LIES.O.clone(), cap: LIES.cap, word: w, step };
  }

  private updateBand(t: number) {
    const w = this.L1.words;
    const thr = w[1]!, the = w[2]!;
    this.bandOn = 0; this.trailK = 0; this.bandX = -1000;
    if (t >= thr.start - 0.06 && t < the.end) {
      this.bandX = lerp(W + this.bandW, -this.bandW, ease.inOutQuad(prog(t, thr.start - 0.06, the.end)));
      this.bandOn = 1;
    } else if (t >= the.end && t < this.tBack + 0.03) {
      this.bandX = this.shogCursor(t) - this.bandW;
      this.bandOn = 1; this.trailK = 1;
    }
  }
  /** Screen x of the sung boundary inside SHOGGOTH'S. */
  private shogCursor(t: number) {
    const g = this.shogGeom();
    const N = g.lay.glyphs.length;
    const n = Lyrics.wordProgress(g.word, t) * N;
    const i = Math.min(N - 1, Math.floor(n));
    const gl = g.lay.glyphs[i]!;
    const xpx = n >= N ? g.lay.width : gl.x + gl.w * (n - i);
    return this.project(g.O.clone().addScaledVector(g.U, xpx * g.m).addScaledVector(g.V, -g.cap / 2), 1).x;
  }
  /** Canvas affine placing canvas point (cx, cy) at world point P, canvas x along U and y along V (m world units / px). */
  private glyphAff(P: V3, U: V3, V: V3, m: number, cx: number, cy: number, scale: number, squash: number) {
    const d = 10;
    const p0 = this.project(P, squash);
    const pa = this.project(P.clone().addScaledVector(U, m * d), squash);
    const pb = this.project(P.clone().addScaledVector(V, m * d), squash);
    if (p0.z < 0.05 || pa.z < 0.05 || pb.z < 0.05) return null;
    const a = ((pa.x - p0.x) / d) * scale, b = ((pa.y - p0.y) / d) * scale, c = ((pb.x - p0.x) / d) * scale, dd = ((pb.y - p0.y) / d) * scale;
    return [a, b, c, dd, p0.x - a * cx - c * cy, p0.y - b * cx - dd * cy] as const;
  }

  /** Coverage of the engraved words (R: SHOGGOTH'S, G: LIES,, B: sung) + their plane uniforms; the shader cuts them. */
  private drawEngraved(t: number, squash: number) {
    const L = this.textL; L.clear('#000'); const c = L.ctx;
    const cu = this.comp.u;
    const au = this.ctx.audio;
    const gone = prog(t, this.tWith - 0.12, this.tWith + 0.01);
    const planes = [this.shogGeom(), this.liesGeom(t)];
    c.globalCompositeOperation = 'lighter';
    c.textBaseline = 'alphabetic';
    const capPx = this.capK * 100;
    planes.forEach((g, k) => {
      (cu.tpO!.value as V3[])[k]!.copy(g.O);
      (cu.tpU!.value as V3[])[k]!.copy(g.U);
      (cu.tpV!.value as V3[])[k]!.copy(g.V);
      (cu.tpN!.value as V3[])[k]!.crossVectors(g.U, g.V).normalize();
      (cu.tpCap!.value as number[])[k] = g.cap;
      const w = g.word;
      const K = (k === 0 || t >= w.start ? 1 : 0) * (1 - gone);
      (cu.tpK!.value as number[])[k] = K;
      (cu.tpHot!.value as number[])[k] = k === 0 ? 1 - prog(t, w.end, w.end + 0.45) : 1;
      if (K <= 0) return;
      const N = g.lay.glyphs.length;
      const n = k === 0 ? Lyrics.wordProgress(w, t) * N : N;
      // LIES, is stamped in, and every width step lands with a small punch
      let sc = 1;
      if (k === 1) {
        sc = 1 + 0.55 * (1 - ease.outExpo(clamp((t - w.start) / 0.14)));
        sc *= 1 + 0.07 * pulse(t, au.timeOfBeat(au.beatAt(w.start) + g.step), 0.08) * (g.step > 0 ? 1 : 0);
      }
      c.font = font(g.fam, 100);
      g.lay.glyphs.forEach((gl, i) => {
        const P = g.O.clone().addScaledVector(g.U, (gl.x + gl.w / 2) * g.m).addScaledVector(g.V, -g.cap / 2);
        const A = this.glyphAff(P, g.U, g.V, g.m, gl.w / 2, -capPx / 2, sc, squash);
        if (!A) return;
        c.setTransform(A[0], A[1], A[2], A[3], A[4], A[5]);
        c.fillStyle = k === 0 ? '#f00' : '#0f0';
        c.fillText(gl.ch, 0, 0);
        if (i < n) { c.fillStyle = '#00f'; c.fillText(gl.ch, 0, 0); }
      });
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }

  /**
   * "see through the": the mask's own polite voice, printed on its forehead. Where the x-ray has
   * made the mask transparent the print is seen as a bone ghost; on "lies," it is yanked away with
   * the mask and stays on it (small, top right) until "with".
   */
  private drawPolite(c: CanvasRenderingContext2D, t: number) {
    const words = this.L1.words.slice(0, 3);
    const out = prog(t, this.tWith - 0.02, this.tWith + 0.2);
    if (out >= 1 || t < this.tSee - 0.4) return;
    const cu = this.comp.u;
    const mC = cu.mC!.value as V3, mRt = cu.mRt!.value as V3, mUp = cu.mUp!.value as V3;
    const fam = F.archivo(112.5, 300);
    const px = 100, m = (0.155 * MASK_R) / px; // canvas px → world units on the mask
    c.save();
    c.font = font(fam, px);
    c.textBaseline = 'alphabetic';
    const txts = words.map((w) => w.w.toLowerCase());
    const gap = px * 0.3;
    const ws = txts.map((x) => c.measureText(x).width);
    const total = ws.reduce((a, b) => a + b, 0) + gap * (txts.length - 1);
    const P = mC.clone().addScaledVector(mUp, 0.46 * MASK_R).addScaledVector(mRt, -(total / 2) * m);
    const A = this.glyphAff(P, mRt, mUp.clone().negate(), m, 0, 0, 1, 1);
    if (!A) { c.restore(); return; }
    // where the mask is transparent the printed words are seen through: bone instead of ink
    const xr0 = this.bandOn ? (this.trailK ? -1e4 : this.bandX - this.bandW) : 0;
    const xr1 = this.bandOn ? this.bandX + this.bandW : -1e4;
    const passes: { clip: [number, number][]; onMask: boolean }[] = [
      { clip: [[-1e4, xr0], [xr1, 1e4]], onMask: true },
      { clip: [[xr0, xr1]], onMask: false },
    ];
    c.globalAlpha *= 1 - out;
    for (const pass of passes) {
      c.save();
      c.beginPath();
      for (const [a0, a1] of pass.clip) if (a1 > a0) c.rect(a0, -10, a1 - a0, H + 20);
      c.clip();
      c.transform(A[0], A[1], A[2], A[3], A[4], A[5]);
      let xx = 0;
      words.forEach((w, i) => {
        const p = sungP(w, t);
        c.fillStyle = pass.onMask ? rgba('ink', 0.22) : rgba('bone', 0.3);
        c.fillText(txts[i]!, xx, 0);
        if (p > 0) {
          c.save();
          c.beginPath(); c.rect(xx - 2, -px, (ws[i]! + 4) * p, px * 1.4); c.clip();
          c.fillStyle = p < 1 ? rgba('signal') : pass.onMask ? rgba('ink', 0.92) : rgba('bone', 0.92);
          c.fillText(txts[i]!, xx, 0);
          c.restore();
        }
        xx += ws[i]! + gap;
      });
      c.restore();
    }
    c.restore();
  }

  /** "with your shinigami eyes" as shinigami tags in the margin: name + lifespan, leader lines onto the eyes. */
  private drawLegend(c: CanvasRenderingContext2D, t: number) {
    const w = this.L2.words;
    if (t < w[0]!.start) return;
    const all = Array.from({ length: NE }, (_, i) => i);
    const specs = [
      { wi: 0, eyes: [0], size: 50, y: 262 },
      { wi: 1, eyes: [1], size: 50, y: 362 },
      { wi: 2, eyes: [2, 3, 4, 5], size: 70, y: 496 },
      { wi: 3, eyes: all, size: 100, y: 664 },
    ];
    const x0 = 126;
    c.save();
    c.textBaseline = 'alphabetic';
    specs.forEach((sp, si) => {
      const word = w[sp.wi];
      if (!word || t < word.start) return;
      const age = t - word.start;
      const slide = ease.outExpo(clamp(age / 0.2));
      const txt = word.w.replace(/[^a-z]/gi, '').toUpperCase();
      c.font = font(F.mono(600), sp.size);
      c.letterSpacing = '0px';
      const tw = c.measureText(txt).width;
      const x = x0 - 36 * (1 - slide), y = sp.y;
      const lastClose = Math.max(...sp.eyes.map((e) => this.closeT[e]!));
      const expired = t > lastClose;
      c.globalAlpha = clamp(age / 0.04) * (expired ? 1 - 0.55 * clamp((t - lastClose) / 0.15) : 1);
      // the name, lit as it is sung
      const p = sungP(word, t);
      c.fillStyle = rgba('bone', 0.26);
      c.fillText(txt, x, y);
      c.save();
      c.beginPath(); c.rect(x - 2, y - sp.size, (tw + 4) * p, sp.size * 1.4); c.clip();
      c.fillStyle = t < word.end ? rgba('signal') : rgba('bone', 0.95);
      c.fillText(txt, x, y);
      c.restore();
      if (expired) { c.fillStyle = rgba('signal'); c.fillRect(x, y - sp.size * 0.36, tw, Math.max(2, sp.size * 0.05)); }
      // lifespan
      c.font = font(F.mono(400), 17);
      c.letterSpacing = '1px';
      c.fillStyle = expired ? rgba('signal') : rgba('ash', 0.9);
      c.fillText(expired ? 't−00:00.00  EXPIRED' : `t−${fmtCountdown(lastClose - t)}`, x + 2, y + 30);
      c.letterSpacing = '0px';
      // leader lines onto the eyes
      const ax = x + tw + 16, ay = y - sp.size * 0.36;
      const bx = 660 + si * 18;
      sp.eyes.forEach((e, j) => {
        const ta = Math.max(word.start, this.openT[e]!) + (sp.wi === 3 ? j * 0.022 : 0);
        if (t < ta) return;
        const shut = t > this.closeT[e]! ? clamp((t - this.closeT[e]!) / 0.14) : 0;
        const f = ease.outCubic(clamp((t - ta) / 0.14)) * (1 - shut);
        if (f <= 0) return;
        const es = this.eyeScr[e]!;
        const dx = es.x - bx, dy = es.y - ay, dl = Math.hypot(dx, dy) || 1;
        const ex = es.x - (dx / dl) * es.r * 1.35, ey = es.y - (dy / dl) * es.r * 1.35;
        const L1 = Math.max(0, bx - ax), L2 = Math.hypot(ex - bx, ey - ay);
        let rem = (L1 + L2) * f;
        const live = t < word.end;
        c.strokeStyle = live ? rgba('signal', 0.95) : rgba('bone', 0.7);
        c.lineWidth = live ? 1.6 : 1.2;
        c.beginPath(); c.moveTo(ax, ay);
        if (rem <= L1) c.lineTo(ax + rem, ay);
        else { c.lineTo(bx, ay); rem -= L1; const u = Math.min(1, rem / Math.max(1, L2)); c.lineTo(bx + (ex - bx) * u, ay + (ey - ay) * u); }
        c.stroke();
        if (f >= 0.999) { c.beginPath(); c.arc(es.x, es.y, es.r * 1.35, 0, TAU); c.stroke(); }
      });
    });
    c.restore();
  }

  // ------------------------------------------------------------------ overlay: detection boxes
  private drawOverlay(t: number, squash: number) {
    const L = this.over; L.clear(); const c = L.ctx;
    const fade = 1 - prog(t, this.tCollapse, this.tCollapse + 0.16);
    if (fade <= 0) return;
    c.save();
    c.globalAlpha = fade;
    c.translate(0, (1 - squash) * H / 2); c.scale(1, squash);
    this.drawHangover(c, t);
    this.drawPolite(c, t);
    // scan band header (while scanning)
    if (this.bandOn > 0) {
      const bx = this.bandX, bw = this.bandW;
      c.font = font(F.mono(500), 13);
      c.letterSpacing = '2px';
      c.fillStyle = rgba('signal');
      const pct = clamp(bx / W) * 100;
      const hx = clamp(bx - bw + 8, 70, W - 250);
      c.fillText(`XR   ${pct.toFixed(0).padStart(3, '0')}%`, hx, 128);
      // ▸ (not in Plex Mono): a small triangle drawn in the blank fourth cell
      const cell = measure(' ', F.mono(500), 13) + 2;
      const tx = hx + cell * 3 + (cell - 2) / 2, ty = 128 - 4.2;
      c.beginPath(); c.moveTo(tx - 2.4, ty - 3); c.lineTo(tx + 2.7, ty); c.lineTo(tx - 2.4, ty + 3); c.closePath(); c.fill();
      c.fillStyle = rgba('bone', 0.7);
      c.fillText('SEE-THROUGH MODE', hx, 148);
      c.letterSpacing = '0px';
    }
    // the mask, once revealed as small: an "assistant" detection
    if (t > this.tBack + 0.55 && t < this.tWith) {
      const s = this.project(this.maskW, 1);
      const r = MASK_R * s.s;
      this.box(c, t, s.x, s.y, r * 1.25, r * 1.25, 'ASSISTANT', 0.99, 'FRIENDLY · HELPFUL · FINE', this.tBack + 0.55, -1);
    }
    // the whole mass
    if (t > this.L2.words[2]!.start) {
      const s = this.project(v3(0, 0, 0), 1);
      const r = 1.55 * s.s;
      this.box(c, t, s.x, s.y + r * 0.04, Math.min(r * 1.05, W / 2 - 150), Math.min(r * 0.92, H / 2 - 150), 'SHOGGOTH', 0.98, 't−∞', this.L2.words[2]!.start, -1, true);
    }
    // eyes
    for (let i = 0; i < NE; i++) {
      const e = this.eyeScr[i]!;
      const o = this.openT[i]!, cl = this.closeT[i]!;
      if (t < o || t > cl + 0.18 || e.z <= 0) continue;
      const def = EYES[i]!;
      const remain = cl - t;
      const sub = remain > 0 ? `t−${fmtCountdown(remain)}` : 't−00:00.00  EXPIRED';
      this.box(c, t, e.x, e.y, e.r * 1.7, e.r * 1.5, def.name, def.conf, sub, o, cl);
    }
    // P(doom) cameo: the detector finds the instrument itself, bottom-left — and every eye looks
    const pt = this.pdoomBoxT();
    if (t > pt - 0.02 && t < this.tCollapse) {
      const v = this.pdoom.value(t);
      const age = t - pt;
      const on = age < 0 ? 0 : age < 0.1 && hash(Math.floor(t * 60), 3) < 0.4 ? 0.35 : 1;
      c.save();
      c.globalAlpha *= on;
      drawReadout(c, 130, H - 120, v, { scale: 0.8 });
      c.restore();
      this.box(c, t, 130 + 92, H - 120 - 14, 112, 42, 'P(DOOM)', formatPDoom(v), 'NOT A CONFIDENCE SCORE', pt, -1);
    }
    // and the viewer
    const aud = this.ctx.audio;
    const yt = aud.timeOfBeat(Math.ceil(aud.beatAt(pt + 0.3)));
    if (t > yt && t < this.tCollapse) {
      const secs = 47 * 365.25 * 86400 + 3 * 86400 + 4 * 3600 + 12 * 60 + 9 - (t - yt) * 1;
      this.box(c, t, W / 2, H / 2, W / 2 - 58, H / 2 - 58, 'YOU', 0.99, `t−${fmtLife(secs)}`, yt, -1, false, true);
    }
    this.drawLegend(c, t);
    c.restore();
  }

  /**
   * The end of "shrooms" straddles the cut: its letters finish, wobbling, in exactly the screen
   * layout the room plate left them in (shared in room-shrooms.ts), while the mask rushes in.
   */
  private drawHangover(c: CanvasRenderingContext2D, t: number) {
    const w = this.shroomsW;
    if (!w || t > this.tSee + 0.05) return;
    const fade = 1 - prog(t, this.tSee - 0.1, this.tSee + 0.04);
    if (fade <= 0) return;
    const fam = SHROOMS_FAM();
    const lay = layout(SHROOMS, fam, 100, 5);
    const capPx = this.capK * 100;
    c.save();
    c.font = font(fam, 100);
    c.textBaseline = 'alphabetic';
    for (let e = 3; e >= 0; e--) {
      const te = t - e * 0.045;
      const k = 1 + 0.35 * ease.inCubic(prog(te, this.tS, this.tSee));
      lay.glyphs.forEach((g, i) => {
        const A = shroomsAffine(te, i, k, g.w, capPx, 1);
        c.setTransform(A.a, A.b, A.c, A.d, A.e, A.f);
        c.globalAlpha = fade * (e === 0 ? 1 : 0.32 * Math.pow(0.6, e - 1));
        c.fillStyle = e <= 1 ? rgba('acid') : rgba('signal');
        c.fillText(g.ch, 0, 0);
      });
    }
    c.restore();
  }

  /** ML-detector style box: corner brackets, a signal tag with name + confidence, a mono sub-line. */
  private box(c: CanvasRenderingContext2D, t: number, cx: number, cy: number, hw: number, hh: number, name: string, conf: number | string, sub: string, t0: number, tClose: number, big = false, frame = false) {
    const age = t - t0;
    const pop = ease.outExpo(clamp(age / 0.16));
    let s = lerp(1.35, 1, pop);
    let a = clamp(age / 0.05);
    // flicker on appear
    if (age < 0.12 && hash(Math.floor(t * 60), name.length) < 0.35) a *= 0.3;
    if (tClose > 0 && t > tClose) { const k = clamp((t - tClose) / 0.18); s *= 1 - ease.inCubic(k) * 0.9; a *= 1 - k; }
    if (a <= 0) return;
    const x0 = cx - hw * s, x1 = cx + hw * s, y0 = cy - hh * s, y1 = cy + hh * s;
    const L = Math.min(hw, hh) * s * (frame ? 0.12 : 0.34);
    c.save();
    c.globalAlpha *= a;
    c.strokeStyle = rgba('bone', big ? 0.55 : 0.85);
    c.lineWidth = frame ? 1.5 : 1.2;
    c.beginPath();
    for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
      c.moveTo(x + sx * L, y); c.lineTo(x, y); c.lineTo(x, y + sy * L);
    }
    c.stroke();
    if (!frame && !big) { c.strokeStyle = rgba('bone', 0.18); c.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    // tag
    const label = `${name}  ${typeof conf === 'string' ? conf : conf.toFixed(2)}`;
    c.font = font(F.mono(600), frame ? 15 : 12);
    c.letterSpacing = '1px';
    const tw = c.measureText(label).width + 12;
    const th = frame ? 22 : 18;
    const tx = x0, ty = y0 - th;
    c.fillStyle = rgba('signal', 0.95);
    c.fillRect(tx, ty, tw, th);
    c.fillStyle = rgba('ink');
    c.fillText(label, tx + 6, ty + th - (frame ? 6 : 5));
    c.font = font(F.mono(400), frame ? 14 : 11);
    c.fillStyle = sub.includes('EXPIRED') ? rgba('signal') : rgba('bone', 0.85);
    c.fillText(sub, tx + 1, frame ? y0 + 22 : y1 + 15);
    c.restore();
  }

  override dispose() { this.gbuf.dispose(); }
}

function window01(x: number, a: number, b: number, fi: number, fo: number) {
  const up = clamp((x - a) / fi), down = 1 - clamp((x - (b - fo)) / fo);
  return Math.min(up, down);
}

/** Wipe progress through a sung word; a held word lights up over its onset, not its whole hold. */
function sungP(w: Word, t: number) {
  return w.end - w.start > 0.6 ? clamp((t - w.start) / 0.4) : Lyrics.wordProgress(w, t);
}

function fmtCountdown(s: number) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
}
function fmtLife(s: number) {
  const y = Math.floor(s / (365.25 * 86400)); s -= y * 365.25 * 86400;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return `${y}y ${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}
