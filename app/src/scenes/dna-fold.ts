// DNA edition, `spacetime` slot — the hero fold (docs/DNA_VIDEO_PLAN.md, "Hero choreography").
//  "We had a stable training run,": a chain leaves the ribosome exit tunnel in measured eighth-note
//      steps; the orange focus bracket waits at the tunnel mouth until its residue emerges into it.
//  "But now the singularity's begun": flat paper contours gain relief and become a schematic
//      free-energy funnel under the chain; the camera cranes up and follows the chain to it.
//  "And you're optimizing, accelerating,": helices and the β-hairpin snap into shape on the beat,
//      then the elements collapse into the native fold (one continuous chain, one camera axis).
//  "I feel my atoms rearranging": crane up to an overhead view of the paper; the key light swings low;
//      the protein's cast shadow resolves into ATOMS, then redistributes into REARRANGING. The shadow
//      words are an editorial composite (authored mattes), the molecule stays intact.
// Everything is a pure function of song time.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, glyphX, layout, textPathCommands, textPoints } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { clamp, lerp, ease, prog, keys, smoothstep, window01, noise2, type Key } from '../engine/util';
import {
  N_RES, CA, EXIT, FOLD_C, PAPER_Y, RES_SS, Track, buildSSEs, residuePositions, traceAt, ribbonHalfWidth,
  type SSE, type ElemState,
} from './dna-fold-geo';

type Pt = { x: number; y: number };
type Proj = { x: number; y: number; w: number; s: number };

const S_PER_RES = 8; // ribbon samples per residue
const TAG = 57; // the residue the orange focus bracket follows (helix B)
const FOV = 30;
const S0 = new THREE.Vector3(FOLD_C.x + 3.6, PAPER_Y, FOLD_C.z + 2.8); // where the shadow words fall

function findWord(line: Line, q: string): Word {
  const n = norm(q);
  const w = line.words.find((x) => norm(x.w) === n);
  if (!w) throw new Error(`word not found: ${q}`);
  return w;
}
const orbit = (tgt: THREE.Vector3, yaw: number, pitch: number, dist: number) =>
  new THREE.Vector3(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
const dirAzEl = (az: number, el: number) => new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));

/**
 * Text outline as a Path2D built straight from the glyph commands. (textPath2D goes through SVG path
 * data, which comes out malformed for Archivo's O here: the parser stops there and the fill ends mid-word.)
 */
function glyphPath(text: string, fam: string, size: number, x: number, y: number): Path2D {
  const p = new Path2D();
  for (const c of textPathCommands(text, fam, size, x, y) as any[]) {
    if (c.type === 'M') p.moveTo(c.x, c.y);
    else if (c.type === 'L') p.lineTo(c.x, c.y);
    else if (c.type === 'Q') p.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
    else if (c.type === 'C') p.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else if (c.type === 'Z') p.closePath();
  }
  return p;
}

/** Characters of a word row sung by t (fractional), for a left-to-right karaoke wipe. */
function sungChars(ws: Word[], t: number) {
  let n = 0;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!, p = Lyrics.wordProgress(w, t);
    n += p * w.w.length;
    if (p < 1) return n;
    if (i < ws.length - 1) n += 1;
  }
  return n;
}

interface ShadowWord { text: string; fam: string; fs: number; k: number; lay: ReturnType<typeof layout>; pts: Pt[]; path: Path2D }

export default class DnaFoldScene extends Scene {
  cam = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 400);
  vp = new THREE.Matrix4();
  v4 = new THREE.Vector4();
  bg = new FSPass(/* glsl */ `
    uniform vec2 uPoolC; uniform vec2 uPoolR; uniform float uPool;
    void main() {
      vec2 px = FRAG_PX;
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      vec3 c = C_INK + C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, length(p)));
      // the key light's pool on the paper (overhead view)
      vec2 q = (px - vec2(uPoolC.x, 1080.0 - uPoolC.y)) / uPoolR;
      float d = length(q);
      float f = exp(-d * d * 1.35) * uPool;
      float fib = fbm(px * vec2(0.010, 0.022), 4) * 0.5 + fbm(px * 0.06, 2) * 0.25;
      vec3 paper = C_BONE * (0.9 + 0.06 * fib) * vec3(1.0, 0.985, 0.95);
      c = mix(c, paper, f);
      fragColor = vec4(c, 1.0);
    }`, { uPoolC: { value: new THREE.Vector2(960, 540) }, uPoolR: { value: new THREE.Vector2(600, 330) }, uPool: { value: 0 } });
  soft = new Layer2D(W, H, 0.5); // cast shadow (soft by construction)
  paper = new Layer2D(); // ribosome engraving, crisp shadow mattes
  text = new Layer2D(); // lyrics, labels, focus bracket
  land = new LineBatch(12000, { screen2D: true, blend: 'add' });
  prot = new LineBatch(16000, { screen2D: true, blend: 'normal' });

  track!: Track;
  sses: SSE[] = [];
  P = Array.from({ length: N_RES }, () => new THREE.Vector3());

  // timing
  tS = 0; tEnd = 0; tRun = 0; tBut = 0; tAnd = 0; tI = 0; tAtoms = 0; tRe = 0;
  steps: number[] = []; stepN = 0; n0 = 10;
  snaps: number[] = [];
  l1!: Line; l2!: Line; l3!: Line; l4!: Line;
  kYaw: Key[] = []; kPitch: Key[] = []; kDist: Key[] = []; kTx: Key[] = []; kTy: Key[] = []; kTz: Key[] = [];

  // shadow words
  atoms!: ShadowWord; rearr!: ShadowWord;
  mapRA: Int32Array = new Int32Array(0);

  // per-frame sample buffers
  nS = N_RES * S_PER_RES + 2;
  sx = new Float32Array(this.nS * 3 * 2); // screen x,y of centre, edge+, edge−
  sw = new Float32Array(this.nS); // view depth
  sp = new Float32Array(this.nS); // px per world unit
  shade = new Float32Array(this.nS);
  hw = new Float32Array(this.nS);
  wx = new Float32Array(this.nS * 3); // world centre (for the cast shadow)
  order: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.tS = this.ctx.start; this.tEnd = this.ctx.end;
    this.l1 = ly.get('stable training run');
    this.l2 = ly.get('singularity');
    this.l3 = ly.get('optimizing');
    this.l4 = ly.get('atoms rearranging');
    this.tRun = this.l1.words[0]!.start;
    this.tBut = this.l2.words[0]!.start;
    this.tAnd = this.l3.words[0]!.start;
    this.tI = this.l4.words[0]!.start;
    this.tAtoms = findWord(this.l4, 'atoms').start;
    this.tRe = findWord(this.l4, 'rearranging').start;

    this.track = new Track();
    this.sses = buildSSEs(this.track);

    // emergence: measured steps on the eighth notes of "We had a stable training run,"
    const e0 = Math.ceil(au.beatAt(this.tRun) * 2 - 1e-3), e1 = Math.floor(au.beatAt(this.l1.end - 0.05) * 2);
    for (let e = e0; e <= e1; e++) this.steps.push(au.timeOfBeat(e / 2));
    this.stepN = (N_RES - this.n0) / Math.max(1, this.steps.length);
    // secondary structure snaps on the beats of "And you're optimizing": A, B, C, then the hairpin
    const b0 = Math.ceil(au.beatAt(this.tAnd) - 0.05);
    const bt = (k: number) => au.timeOfBeat(b0 + k);
    this.snaps = [bt(1), bt(4), bt(4), bt(2), bt(3)]; // element order: A, S1, S2, B, C

    // camera
    const tC0 = this.tI - 0.25, tC1 = this.tAtoms - 0.1, tW0 = this.tRe, tW1 = this.tRe + 0.55;
    const TA = S0.clone().add(new THREE.Vector3(-1.1, 0, -1.0));
    const io = ease.inOutCubic;
    this.kYaw = [[this.tS, 0], [this.tBut, 0], [this.tBut + 2.4, 0.32, io], [this.tAnd, 0.34], [tC0, -0.22, io], [tC1, 0, io]];
    this.kPitch = [[this.tS, 0.1], [this.tBut, 0.1], [this.tBut + 2.4, 0.52, io], [this.tAnd, 0.46], [tC0, 0.4], [tC1, 1.466, io]];
    this.kDist = [[this.tS, 10.8], [this.tBut, 10.2, ease.linear], [this.tBut + 2.4, 12.6, io], [this.tAnd, 12.4], [tC0, 12.2], [tC1, 17, io], [tW0, 17], [tW1, 21, ease.outCubic], [this.tEnd, 21.4, ease.linear]];
    this.kTx = [[this.tS, -1.3], [this.tBut, -1.1], [this.tBut + 2.4, FOLD_C.x, io], [tC0, FOLD_C.x], [tC1, TA.x, io]];
    // (the fold's bounding box sits ~0.55 above FOLD_C: the hairpin crowns it)
    this.kTy = [[this.tS, 0.4], [this.tBut, 0.4], [this.tBut + 2.4, -0.6, io], [this.tAnd, FOLD_C.y + 0.3], [tC0, FOLD_C.y + 0.55], [tC1, PAPER_Y, io]];
    this.kTz = [[this.tS, 0], [tC0, 0], [tC1, TA.z, io]];

    // shadow words: glyph points (for the morph) and outlines (the crisp matte), in paper units
    const mk = (text: string, fam: string, worldW: number): ShadowWord => {
      const fs = 220;
      const lay = layout(text, fam, fs);
      const k = worldW / lay.width;
      const raw = textPoints(text, fam, fs, 6, 7);
      const pts = raw.map((p) => ({ x: (p.x - lay.width / 2) * k, y: (p.y + 0.36 * fs) * k })).sort((a, b) => a.x - b.x);
      const path = glyphPath(text, fam, fs, -lay.width / 2, 0.36 * fs);
      return { text, fam, fs, k, lay, pts, path };
    };
    this.atoms = mk('ATOMS', F.archivo(100, 900), 8.2);
    this.rearr = mk('REARRANGING', F.archivo(87.5, 900), 15);
    this.mapRA = new Int32Array(this.rearr.pts.length);
    for (let j = 0; j < this.mapRA.length; j++) this.mapRA[j] = Math.floor((j * this.atoms.pts.length) / this.rearr.pts.length);
  }

  // ------------------------------------------------------------------ helpers
  private setCamera(t: number) {
    const tgt = new THREE.Vector3(keys(t, this.kTx), keys(t, this.kTy), keys(t, this.kTz));
    const pos = orbit(tgt, keys(t, this.kYaw), keys(t, this.kPitch), keys(t, this.kDist));
    this.cam.position.copy(pos);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
    this.cam.updateProjectionMatrix();
    this.vp.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
  }
  private proj(x: number, y: number, z: number): Proj {
    const v = this.v4.set(x, y, z, 1).applyMatrix4(this.vp);
    const w = Math.max(1e-3, v.w);
    return { x: (v.x / w * 0.5 + 0.5) * W, y: (1 - (v.y / w * 0.5 + 0.5)) * H, w, s: H / 2 / Math.tan((FOV * Math.PI) / 360) / w };
  }
  /** Residues emerged from the tunnel (continuous, stepped on the eighth notes). */
  private emerged(t: number) {
    let n = this.n0;
    for (const s of this.steps) n += this.stepN * prog(t, s, s + 0.13, ease.outCubic);
    return Math.min(N_RES, n);
  }
  private states(t: number): ElemState[] {
    const tW0 = this.tBut + 0.5, tV0 = this.tBut + 1.0, tU0 = this.tAnd - 0.6, tU1 = this.tI - 0.9;
    return this.sses.map((_, k) => {
      const w = prog(t, tW0 + 0.22 * k, tW0 + 1.0 + 0.22 * k, ease.inOutCubic);
      const vs = prog(t, tV0 + 0.3 * k, tV0 + 2.2 + 0.3 * k, ease.inOutCubic);
      const sn = this.snaps[k]!;
      const vsnap = prog(t, sn - 0.16, sn, (x) => ease.outBack(x, 2.2));
      const u = prog(t, tU0 + 0.32 * k, tU1 + 0.15 * k, ease.inOutCubic);
      return { w, v: 0.62 * vs + 0.38 * vsnap, u };
    });
  }
  /** Direction toward the key light: fixed upper-left-front, then it swings low so the shadow falls on S0. */
  private light(t: number) {
    const k = new THREE.Vector3(-0.55, 0.7, 0.45).normalize();
    const f = new THREE.Vector3(FOLD_C.x, FOLD_C.y, FOLD_C.z).sub(S0).normalize();
    const azK = Math.atan2(k.x, k.z), elK = Math.asin(k.y), azF = Math.atan2(f.x, f.z), elF = Math.asin(f.y);
    const e = prog(t, this.tI - 0.2, this.tAtoms, ease.inOutCubic);
    let dAz = azF - azK;
    while (dAz > Math.PI) dAz -= Math.PI * 2;
    while (dAz < -Math.PI) dAz += Math.PI * 2;
    return dirAzEl(azK + dAz * e + 0.55 * Math.sin(Math.PI * e), lerp(elK, elF, e));
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    this.outRT = out; this.aff = null;
    this.setCamera(t);
    const L = this.light(t);

    // ---- the chain
    const nOut = this.emerged(t);
    const st = this.states(t);
    residuePositions(this.track, this.sses, st, (i) => (nOut - 1 - i) * CA, this.P);
    const spin = Math.max(0, t - this.tI) * 0.3; // the finished fold turns slowly under the swinging light
    if (spin > 0) {
      const c = Math.cos(spin), s = Math.sin(spin);
      for (const p of this.P) {
        const x = p.x - FOLD_C.x, z = p.z - FOLD_C.z;
        p.x = FOLD_C.x + c * x + s * z; p.z = FOLD_C.z - s * x + c * z;
      }
    }
    const rEnd = Math.min(N_RES - 1, nOut - 1);
    const nS = Math.max(2, Math.floor(rEnd * S_PER_RES) + 1);
    const C = new THREE.Vector3(), Ta = new THREE.Vector3(), Tb = new THREE.Vector3(), T = new THREE.Vector3();
    const Na = new THREE.Vector3(), Nb = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), Bp = new THREE.Vector3();
    const cand = new THREE.Vector3(), Nf = new THREE.Vector3();
    const camPos = this.cam.position;
    const dRef = camPos.distanceTo(new THREE.Vector3(FOLD_C.x, FOLD_C.y, FOLD_C.z));
    for (let j = 0; j < nS; j++) {
      const r = Math.min(rEnd, j / S_PER_RES);
      traceAt(this.P, r, C);
      traceAt(this.P, Math.min(rEnd, r + 0.05), Tb); traceAt(this.P, Math.max(0, r - 0.05), Ta);
      T.subVectors(Tb, Ta).normalize();
      traceAt(this.P, Math.max(0, r - 0.5), Na); traceAt(this.P, Math.min(rEnd, r + 0.5), Nb);
      N.copy(Na).add(Nb).addScaledVector(C, -2);
      const curv = N.length();
      cand.crossVectors(T, N).normalize();
      if (j === 0) { B.crossVectors(T, new THREE.Vector3(0, 1, 0.3)).normalize(); }
      else { B.copy(Bp).addScaledVector(T, -Bp.dot(T)).normalize(); }
      const ss = RES_SS[Math.round(r)]!;
      if (ss !== 'L' && curv > 1e-4) {
        if (cand.dot(B) < 0) cand.negate();
        B.lerp(cand, clamp(curv / 0.04)).normalize();
      }
      if (j > 0 && B.dot(Bp) < 0) B.negate();
      Bp.copy(B);
      const hw = ribbonHalfWidth(r, this.sses, st);
      this.hw[j] = hw;
      const pc = this.proj(C.x, C.y, C.z);
      const p1 = this.proj(C.x + B.x * hw, C.y + B.y * hw, C.z + B.z * hw);
      const p2 = this.proj(C.x - B.x * hw, C.y - B.y * hw, C.z - B.z * hw);
      const o = j * 6;
      this.sx[o] = pc.x; this.sx[o + 1] = pc.y; this.sx[o + 2] = p1.x; this.sx[o + 3] = p1.y; this.sx[o + 4] = p2.x; this.sx[o + 5] = p2.y;
      this.sw[j] = pc.w; this.sp[j] = pc.s;
      this.wx[j * 3] = C.x; this.wx[j * 3 + 1] = C.y; this.wx[j * 3 + 2] = C.z;
      // shading: two-sided Lambert on the ribbon face, tubes by their tangent; depth fog
      let lam: number;
      if (hw > 0.07) { Nf.crossVectors(T, B).normalize(); lam = Math.abs(Nf.dot(L)); }
      else lam = 0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - T.dot(L) ** 2));
      const dCam = camPos.distanceTo(C);
      const fog = lerp(1, 0.42, smoothstep(-1.5, 3.5, dCam - dRef));
      this.shade[j] = (0.2 + 0.8 * Math.pow(lam, 1.15)) * fog;
    }

    // painter's order: far slabs first
    this.order.length = 0;
    for (let j = 0; j < nS - 1; j++) this.order.push(j);
    this.order.sort((a, b) => this.sw[b]! + this.sw[b + 1]! - this.sw[a]! - this.sw[a + 1]!);

    const bone = LIN.bone, ink = LIN.ink;
    const P = this.prot;
    P.clear();
    for (const j of this.order) {
      const o = j * 6, q = o + 6;
      const sh = (this.shade[j]! + this.shade[j + 1]!) / 2;
      const hw = this.hw[j]!;
      if (hw > 0.07) {
        const e1x = this.sx[o + 2]!, e1y = this.sx[o + 3]!, e2x = this.sx[o + 4]!, e2y = this.sx[o + 5]!;
        const dx = this.sx[q]! - this.sx[o]!, dy = this.sx[q + 1]! - this.sx[o + 1]!;
        const wFill = Math.max(1.6, Math.hypot(dx, dy) + 1.4);
        // fill: a cross-segment shortened by its own half-width so the round caps stay inside the edges
        const ex = e2x - e1x, ey = e2y - e1y, el = Math.hypot(ex, ey) || 1;
        const inset = Math.min(wFill / 2, el / 2 - 0.01) / el;
        P.seg2(e1x + ex * inset + dx / 2, e1y + ey * inset + dy / 2, e2x - ex * inset + dx / 2, e2y - ey * inset + dy / 2, wFill, [bone[0] * sh, bone[1] * sh, bone[2] * sh], 1);
        // engraved hatching in the ribbon's shadowed parts
        const dark = smoothstep(0.62, 0.18, sh);
        if (j % 2 === 0 && dark > 0.02) P.seg2(e1x + dx / 2, e1y + dy / 2, e2x + dx / 2, e2y + dy / 2, 1.1, ink, 0.85 * dark);
        // edge rails
        P.seg2(e1x, e1y, this.sx[q + 2]!, this.sx[q + 3]!, 1.5, ink, 0.95);
        P.seg2(e2x, e2y, this.sx[q + 4]!, this.sx[q + 5]!, 1.5, ink, 0.95);
      } else {
        // tube: bone core, then ink side rails offset in screen space (no outline arcs at the joints)
        const wpx = Math.max(1.4, 2 * hw * this.sp[j]!);
        const ax = this.sx[o]!, ay = this.sx[o + 1]!, bx = this.sx[q]!, by = this.sx[q + 1]!;
        const dl = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / dl * (wpx / 2 + 0.6), ny = (bx - ax) / dl * (wpx / 2 + 0.6);
        P.seg2(ax, ay, bx, by, wpx + 1.2, [bone[0] * sh, bone[1] * sh, bone[2] * sh], 1);
        P.seg2(ax + nx, ay + ny, bx + nx, by + ny, 1.4, ink, 0.95);
        P.seg2(ax - nx, ay - ny, bx - nx, by - ny, 1.4, ink, 0.95);
        // one tick per residue: the tube reads as a chain of amino acids, not a rope
        if (j % S_PER_RES === 0) P.seg2(ax + nx * 0.8, ay + ny * 0.8, ax - nx * 0.8, ay - ny * 0.8, 1.2, ink, 0.55);
      }
    }

    // ---- background (and the key light's pool once the camera is overhead)
    const pS0 = this.proj(S0.x, S0.y, S0.z);
    const poolK = prog(t, this.tI - 0.1, this.tI + 0.6, ease.inOutCubic);
    const wordW = lerp(this.atoms.lay.width * this.atoms.k, this.rearr.lay.width * this.rearr.k, prog(t, this.tRe, this.tRe + 0.4, ease.inOutCubic)) * pS0.s;
    (this.bg.u.uPoolC!.value as THREE.Vector2).set(pS0.x - 30, pS0.y - 20);
    (this.bg.u.uPoolR!.value as THREE.Vector2).set(wordW * 0.62 + 160, (wordW * 0.62 + 160) * 0.52);
    this.bg.u.uPool!.value = poolK;
    this.bg.render(renderer, out);

    // ---- cast shadow (soft), then the crisp mattes and the ribosome
    if (poolK > 0) this.drawShadow(t, L, pS0, nS);
    this.drawPaper(t, pS0);

    // ---- landscape (flat contours → funnel → paper again)
    this.drawLandscape(t, st);
    this.land.render(renderer, out);
    P.render(renderer, out);

    // ---- lyrics, labels, focus bracket
    this.drawText(t, nOut);
    comp.draw(renderer, this.text.upload(), out);

    return { bloom: 0.42, bloomThreshold: 0.9, vignette: 0.42, zoom: 1 + 0.003 * (f.a.kick ?? 0) };
  }

  // ------------------------------------------------------------------ cast shadow
  private drawShadow(t: number, L: THREE.Vector3, pS0: Proj, nS: number) {
    const { renderer, comp } = this.ctx;
    const c = this.soft.ctx;
    this.soft.clear();
    // paper → screen (the camera is near-overhead here: an affine map is exact enough)
    const px = this.proj(S0.x + 1, S0.y, S0.z), pz = this.proj(S0.x, S0.y, S0.z + 1);
    const A = { x: px.x - pS0.x, y: px.y - pS0.y }, Bv = { x: pz.x - pS0.x, y: pz.y - pS0.y };
    const toScr = (u: number, v: number): Pt => ({ x: pS0.x + A.x * u + Bv.x * v, y: pS0.y + A.y * u + Bv.y * v });
    const unit = Math.hypot(A.x, A.y);
    // the protein's real cast shadow, as paper coordinates, in chain order
    const chain: Pt[] = [];
    for (let j = 0; j < nS; j++) {
      const x = this.wx[j * 3]!, y = this.wx[j * 3 + 1]!, z = this.wx[j * 3 + 2]!;
      const s = (y - PAPER_Y) / Math.max(0.05, L.y);
      chain.push({ x: x - L.x * s - S0.x, y: z - L.z * s - S0.z });
    }
    const eA = prog(t, this.tAtoms, this.tAtoms + 0.32, ease.inOutCubic);
    const eR = prog(t, this.tRe, this.tRe + 0.4, ease.inOutCubic);
    const fade = prog(t, this.tI - 0.1, this.tI + 0.6);
    // everything is drawn opaque (a union: overlaps don't darken) and blurred; opacity is applied on composite
    c.fillStyle = rgba('ink', 1); c.strokeStyle = rgba('ink', 1);
    c.filter = 'blur(3px)';
    if (eA <= 0) {
      // two strokes: the whole chain at tube width, then the elements at ribbon width
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const pass of [0, 1]) {
        c.beginPath();
        let open = false;
        for (let j = 0; j < chain.length; j++) {
          const wide = this.hw[j]! > 0.07;
          if (pass === 1 && !wide) { open = false; continue; }
          const q = toScr(chain[j]!.x, chain[j]!.y);
          if (!open) { c.moveTo(q.x, q.y); open = true; } else c.lineTo(q.x, q.y);
        }
        c.lineWidth = (pass === 0 ? 0.13 : 0.34) * unit;
        c.stroke();
      }
    } else {
      const src = chain.filter((_, j) => j % 2 === 0).sort((a, b) => a.x - b.x);
      const A2 = this.atoms, R2 = this.rearr;
      const rA = Math.max(1.5, 6 * A2.k * unit * 0.75), rR = Math.max(1.5, 6 * R2.k * unit * 0.75);
      const dot = (x: number, y: number, r: number) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); };
      c.beginPath();
      if (eR <= 0) {
        for (let j = 0; j < A2.pts.length; j++) {
          const g = A2.pts[j]!, s = src[Math.floor((j * src.length) / A2.pts.length)]!;
          const q = toScr(lerp(s.x, g.x, eA), lerp(s.y, g.y, eA));
          dot(q.x, q.y, lerp(3, rA, eA));
        }
      } else {
        for (let j = 0; j < R2.pts.length; j++) {
          const g = R2.pts[j]!, s = A2.pts[this.mapRA[j]!]!;
          const q = toScr(lerp(s.x, g.x, eR), lerp(s.y, g.y, eR));
          dot(q.x, q.y, lerp(rA, rR, eR));
        }
      }
      c.fill();
    }
    c.filter = 'none';
    // before the crisp matte lands the soft shadow is the whole shadow; afterwards it is only its penumbra
    const crisp = Math.max(prog(t, this.tAtoms + 0.2, this.tAtoms + 0.34) * (1 - prog(t, this.tRe, this.tRe + 0.1)), prog(t, this.tRe + 0.3, this.tRe + 0.44));
    comp.draw(renderer, this.soft.upload(), this.outRT!, { opacity: lerp(0.5, 0.3, crisp) * fade });
    // crisp mattes go on the paper layer (drawn next); remember the affine for them
    this.aff = [A.x, A.y, Bv.x, Bv.y, pS0.x, pS0.y];
  }
  aff: number[] | null = null;
  outRT: THREE.WebGLRenderTarget | null = null;

  // ------------------------------------------------------------------ paper layer: ribosome + mattes
  private drawPaper(t: number, _pS0: Proj) {
    const { renderer, comp } = this.ctx;
    const c = this.paper.ctx;
    const ribA = 1 - prog(t, this.tBut + 1.2, this.tBut + 2.9);
    const aA = prog(t, this.tAtoms + 0.2, this.tAtoms + 0.34) * (1 - prog(t, this.tRe, this.tRe + 0.1));
    const aR = prog(t, this.tRe + 0.3, this.tRe + 0.44);
    if (ribA <= 0 && aA <= 0 && aR <= 0) return;
    this.paper.clear();
    if (ribA > 0) this.drawRibosome(c, ribA);
    if ((aA > 0 || aR > 0) && this.aff) {
      const [ax, ay, bx, by, ex, ey] = this.aff;
      for (const [w, a] of [[this.atoms, aA], [this.rearr, aR]] as [ShadowWord, number][]) {
        if (a <= 0) continue;
        c.setTransform(ax * w.k, ay * w.k, bx * w.k, by * w.k, ex, ey);
        c.fillStyle = rgba('ink', 0.9 * a);
        c.fill(w.path);
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    comp.draw(renderer, this.paper.upload(), this.outRT!);
  }

  private drawRibosome(c: CanvasRenderingContext2D, alpha: number) {
    const ex = new THREE.Vector3(EXIT.x, EXIT.y, EXIT.z);
    const RL = ex.clone().add(new THREE.Vector3(-7.2, 0.6, -4.2)), rL = ex.distanceTo(RL);
    const RS = RL.clone().add(new THREE.Vector3(1.4, 6.6, 1.6)), rS = 5.2;
    const blob = (ctr: THREE.Vector3, r: number, seed: number) => {
      const p = this.proj(ctr.x, ctr.y, ctr.z), R = r * p.s;
      const path = new Path2D();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const k = 1 + 0.045 * Math.sin(3 * a + seed) + 0.03 * Math.sin(7 * a + seed * 2) + 0.02 * Math.sin(13 * a + seed);
        const x = p.x + Math.cos(a) * R * k, y = p.y + Math.sin(a) * R * k * 0.96;
        if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
      }
      path.closePath();
      return { path, x: p.x, y: p.y, R };
    };
    const engrave = (b: { path: Path2D; x: number; y: number; R: number }) => {
      c.save();
      c.fillStyle = rgba('ink2', alpha); c.fill(b.path);
      c.clip(b.path);
      // light from the upper left: hatching thickens toward the lower right
      const g = c.createLinearGradient(b.x - b.R * 0.7, b.y - b.R * 0.7, b.x + b.R * 0.7, b.y + b.R * 0.7);
      g.addColorStop(0, rgba('ash', 0.1 * alpha)); g.addColorStop(1, rgba('ash', 0.55 * alpha));
      c.strokeStyle = g; c.lineWidth = 1;
      const step = 7, n = Math.ceil((b.R * 2.4) / step);
      c.beginPath();
      for (let i = -n; i <= n; i++) {
        const o = i * step;
        c.moveTo(b.x - b.R * 1.3 + o, b.y - b.R * 1.3); c.lineTo(b.x + b.R * 1.3 + o, b.y + b.R * 1.3);
      }
      c.stroke();
      const g2 = c.createLinearGradient(b.x, b.y, b.x + b.R * 0.8, b.y + b.R * 0.8);
      g2.addColorStop(0, rgba('ash', 0)); g2.addColorStop(1, rgba('ash', 0.3 * alpha));
      c.strokeStyle = g2;
      c.beginPath();
      for (let i = -n; i <= n; i++) {
        const o = i * step * 1.4;
        c.moveTo(b.x - b.R * 1.3 + o, b.y + b.R * 1.3); c.lineTo(b.x + b.R * 1.3 + o, b.y - b.R * 1.3);
      }
      c.stroke();
      c.restore();
      c.strokeStyle = rgba('ash', 0.35 * alpha); c.lineWidth = 1.2; c.stroke(b.path);
      // rim light on the lit side
      c.strokeStyle = rgba('bone', 0.45 * alpha); c.lineWidth = 1.6;
      c.beginPath(); c.arc(b.x, b.y, b.R * 0.985, Math.PI * 1.05, Math.PI * 1.45); c.stroke();
    };
    engrave(blob(RS, rS, 2.1));
    engrave(blob(RL, rL, 0.7));
    // the exit-tunnel mouth
    const m = this.proj(ex.x, ex.y, ex.z), r = 0.24 * m.s;
    c.fillStyle = rgba('ink', alpha);
    c.beginPath(); c.ellipse(m.x, m.y, r, r * 0.62, -0.3, 0, Math.PI * 2); c.fill();
    c.strokeStyle = rgba('bone', 0.55 * alpha); c.lineWidth = 1.2; c.stroke();
  }

  // ------------------------------------------------------------------ landscape
  private drawLandscape(t: number, st: ElemState[]) {
    const B = this.land;
    B.clear();
    const D = keys(t, [[this.tBut + 0.1, 0], [this.tBut + 2.3, 1, ease.outCubic], [this.tI - 0.6, 1], [this.tI + 0.35, 0, ease.inOutCubic]]);
    const a = keys(t, [[this.tBut - 0.25, 0], [this.tBut + 0.35, 0.55], [this.tI + 0.1, 0.55], [this.tI + 0.8, 0.1]]);
    if (a <= 0.001) return;
    const cx = FOLD_C.x, cz = FOLD_C.z;
    const height = (x: number, z: number) => {
      const r2 = (x - cx) ** 2 + (z - cz) ** 2;
      return PAPER_Y - D * (2.2 * Math.exp(-r2 / 7.5) - 0.26 * noise2(x * 0.7 + 3, z * 0.7 - 1));
    };
    const g = LIN.graphite;
    const col: [number, number, number] = [g[0] * 1.6, g[1] * 1.6, g[2] * 1.6];
    for (let k = 0; k < 14; k++) {
      const r0 = 0.45 + 0.52 * k;
      let prev: Proj | null = null;
      for (let i = 0; i <= 144; i++) {
        const th = (i / 144) * Math.PI * 2;
        const rr = r0 * (1 + 0.07 * noise2(Math.cos(th) * 1.3 + k * 0.4, Math.sin(th) * 1.3));
        const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
        const p = this.proj(x, height(x, z), z);
        if (prev) B.seg2(prev.x, prev.y, p.x, p.y, 1.1, col, a * (k % 4 === 0 ? 1 : 0.62));
        prev = p;
      }
    }
    for (let m = 0; m < 28; m++) {
      const th = (m / 28) * Math.PI * 2;
      let prev: Proj | null = null;
      for (let i = 0; i <= 40; i++) {
        const rr = 0.3 + (i / 40) * 7.2;
        const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
        const p = this.proj(x, height(x, z), z);
        if (prev) B.seg2(prev.x, prev.y, p.x, p.y, 0.9, col, a * 0.32 * D);
        prev = p;
      }
    }
    // the state point descends the funnel as the fold completes
    const fp = st.reduce((s, x) => s + x.u, 0) / st.length;
    const dotA = window01(t, this.tBut + 0.9, this.tI - 0.2, 0.4, 0.5) * D;
    if (dotA > 0) {
      const at = (q: number) => {
        const rr = lerp(4.6, 0.2, ease.inOutQuad(q)), th = 1.2 + 5.2 * q;
        const x = cx + Math.cos(th) * rr, z = cz + Math.sin(th) * rr;
        return this.proj(x, height(x, z) + 0.02, z);
      };
      let prev = at(Math.max(0, fp - 0.3));
      for (let i = 1; i <= 40; i++) {
        const q = Math.max(0, fp - 0.3 + (0.3 * i) / 40), p = at(q);
        B.seg2(prev.x, prev.y, p.x, p.y, 1.4, LIN.bone, dotA * (i / 40) * 0.8);
        prev = p;
      }
      B.seg2(prev.x, prev.y, prev.x + 0.01, prev.y, 7, LIN.bone, dotA);
    }
  }

  // ------------------------------------------------------------------ lyrics, labels, bracket
  private row(c: CanvasRenderingContext2D, ws: Word[], x: number, y: number, fam: string, size: number, t: number, alpha: number, align: 'left' | 'right' = 'left', on = 'bone') {
    // each row anticipates its own first word (never the whole line), so rows don't collide with the previous line
    alpha *= prog(t, ws[0]!.start - 0.4, ws[0]!.start - 0.1);
    if (alpha <= 0.001) return;
    const txt = ws.map((w) => w.w).join(' ');
    c.font = font(fam, size);
    const wTot = c.measureText(txt).width;
    const x0 = align === 'right' ? x - wTot : x;
    const k = sungChars(ws, t), ki = Math.floor(k);
    const xa = ki >= txt.length ? wTot : glyphX(txt, ki, fam, size);
    const xb = ki + 1 >= txt.length ? wTot : glyphX(txt, ki + 1, fam, size);
    const xs = ki >= txt.length ? wTot : lerp(xa, xb, k - ki);
    c.fillStyle = rgba(on, 0.3 * alpha);
    c.fillText(txt, x0, y);
    if (xs > 0) {
      c.save();
      c.beginPath(); c.rect(x0 - 40, y - size * 1.25, xs + 40, size * 1.7); c.clip();
      c.fillStyle = rgba(on, alpha);
      c.fillText(txt, x0, y);
      c.restore();
    }
  }
  private label(c: CanvasRenderingContext2D, text: string, x: number, y: number, ax: number, ay: number, a: number) {
    if (a <= 0.001) return;
    c.font = font(F.mono(400), 15);
    c.fillStyle = rgba('ash', 0.95 * a);
    c.fillText(text, x, y);
    c.strokeStyle = rgba('ash', 0.6 * a); c.lineWidth = 1;
    const lx = x - 8, ly = y - 5;
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(ax, ay); c.stroke();
    c.fillStyle = rgba('ash', 0.9 * a);
    c.beginPath(); c.arc(ax, ay, 2, 0, Math.PI * 2); c.fill();
  }
  private drawText(t: number, nOut: number) {
    const c = this.text.ctx;
    this.text.clear();
    const l1 = this.l1, l2 = this.l2, l3 = this.l3, l4 = this.l4;
    // I: the line comes out with the chain, top left
    this.row(c, l1.words, 130, 176, F.archivo(100, 700), 76, t, 1 - prog(t, l1.end + 0.05, l1.end + 0.45));
    // II: bottom left, over the rising contours
    const a2 = 1 - prog(t, l2.end + 0.02, l2.end + 0.3);
    this.row(c, l2.words.slice(0, 3), 130, 852, F.archivo(100, 800), 80, t, a2);
    this.row(c, l2.words.slice(3), 130, 968, F.archivo(112.5, 900), 104, t, a2);
    // III: bottom right; "accelerating," stretches as it is held
    const a3 = 1 - prog(t, l3.end + 0.02, l3.end + 0.3);
    const wAcc = l3.words[3]!, pAcc = Lyrics.wordProgress(wAcc, t);
    const widths = [75, 87.5, 100, 112.5, 125];
    this.row(c, l3.words.slice(0, 2), 1790, 736, F.archivo(100, 700), 60, t, a3, 'right');
    this.row(c, [l3.words[2]!], 1790, 856, F.archivo(100, 900), 116, t, a3, 'right');
    this.row(c, [wAcc], 1790, 972, F.archivo(widths[Math.min(4, Math.floor(pAcc * 5))]!, 900), 116, t, a3, 'right');
    // IV: "I feel my" top right; ATOMS / REARRANGING are the shadow on the paper
    this.row(c, l4.words.slice(0, 3), 1790, 196, F.archivo(100, 700), 88, t, 1, 'right');

    // labels (one explanatory label at a time)
    const m = this.proj(EXIT.x, EXIT.y, EXIT.z);
    this.label(c, 'ribosome · exit tunnel', m.x - 150, m.y - 96, m.x - 6, m.y - 12, window01(t, this.tS + 0.1, this.tBut + 0.1, 0.3, 0.35));
    {
      const th = -0.35, rr = 0.45 + 0.52 * 10, x = FOLD_C.x + Math.cos(th) * rr, z = FOLD_C.z + Math.sin(th) * rr;
      const p = this.proj(x, PAPER_Y, z);
      this.label(c, 'free-energy landscape · schematic', Math.min(1480, p.x + 24), Math.min(900, p.y + 46), p.x, p.y, window01(t, this.tBut + 0.9, this.tAnd + 0.1, 0.35, 0.3) * 0.95);
    }
    {
      const p = this.proj(FOLD_C.x + 1.55, FOLD_C.y + 1.1, FOLD_C.z);
      const a = this.proj(FOLD_C.x + 0.7, FOLD_C.y + 0.6, FOLD_C.z + 0.6);
      this.label(c, 'folding · schematic', p.x + 30, p.y - 20, a.x, a.y, window01(t, this.tAnd + 0.3, this.tI - 0.25, 0.3, 0.3));
    }

    // the orange focus bracket: waits at the tunnel mouth, then rides the tagged residue
    const e = (nOut - 1 - TAG) * CA;
    const P = this.P[TAG]!;
    const q = e < 0 ? this.proj(EXIT.x, EXIT.y, EXIT.z) : this.proj(P.x, P.y, P.z);
    const locked = smoothstep(-0.05, 0.25, e);
    const hs = lerp(20, 15, locked) * (1 + 0.08 * Math.sin(t * 7.3) * (1 - locked));
    const k = 7;
    c.strokeStyle = rgba('signal', 1); c.lineWidth = 2;
    c.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const x = q.x + sx * hs, y = q.y + sy * hs;
      c.moveTo(x - sx * k, y); c.lineTo(x, y); c.lineTo(x, y - sy * k);
    }
    c.stroke();
    if (locked > 0) {
      c.fillStyle = rgba('signal', locked);
      c.beginPath(); c.arc(q.x, q.y, 2.6, 0, Math.PI * 2); c.fill();
    }
  }
}
