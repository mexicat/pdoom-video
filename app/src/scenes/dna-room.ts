// DNA edition, `room` slot (24.328–29.782; docs/DNA_VIDEO_PLAN.md, row `room`).
//  "'cause the future goes": the chamber the hook's ladder opened. A ribosome, seen whole in the dark
//      (engraved masses, large subunit over small, the mRNA tape threading between them 5'→3'), steps
//      along its message one codon per beat. The orange focus bracket rides one incoming codon.
//  "FOOM": the camera slams in and the ribosome is shown in section (cutaway): section-lined cut faces,
//      the intersubunit cavity with tRNAs in the E · P · A sites (anticodons pairing with the codons,
//      two or three H-bond ticks), the polypeptide in the exit tunnel. FOOM lands with the slam.
//  "Trapped in the Chinese room,": elongation on the beat: translocation, a charged tRNA docks, the
//      chain transfers. The bracketed codon is read: the bracket hops from the codon to its amino acid,
//      which then travels up the tunnel. The tiny label `translation` accompanies "Trapped in the"; on
//      "Chinese" it is overstamped CF. SEARLE, 1980 (a comparison, not a claim of equivalence).
//  "with a bag of shrooms": pull back: the mRNA curls into a closed loop carrying seven ribosomes, each
//      with a nascent chain whose length grows toward the 3' end (a polysome, schematic). Their curved
//      silhouettes make the circle the next slot's scanning aperture opens on. No mushrooms.
// Pure function of song time.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { lerp, ease, prog, smoothstep, pulse, hash, frameIdx, window01 } from '../engine/util';
import { findWord, karaokeRow, monoLabel, rubberStamp, focusBracket } from './dna-kit';
import {
  NT, CODON, RS, TAPE, CAV, TUNNEL_EXIT, TRNA_TOP, ANTICODON_Y, TUNNEL,
  COMP, HB, translate, senseCodons, lengths, atLength, chainCoil, trnaGlyph,
  type Pt, type Aff, type TRNAGlyph,
} from './dna-room-geo';
import { RIBO_FRAG, RIBO_MAX } from './dna-room-glsl';

const J0 = 12; // codon index at the P site when the slot opens
const M0 = 38; // residues already in the chain then
const TR = 0.16; // translocation duration (s)
const N_RIB = 7; // ribosomes on the closed loop (the eighth slot is where the 5' cap meets the poly(A) tail)
const S_END = 0.15; // final zoom
const RING_R = 262; // screen radius of the mRNA loop at the end
const RING_C: Pt = { x: 1270, y: 540 }; // = the shoggoth slot's aperture centre
const R_W = RING_R / S_END; // world radius of the loop
const D_SIGMA = (2 * Math.PI * R_W) / (N_RIB + 1);
const HOP = 5; // the bracketed codon: J0 + HOP
const O_PRE: Pt = { x: 1300, y: 648 }; // screen position of the P site before / after the slam
const O_CUT: Pt = { x: 1384, y: 702 };

const mul = (m: Aff, n: Aff): Aff => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const ap = (m: Aff, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

export default class DnaRoomScene extends Scene {
  ribo = new FSPass(RIBO_FRAG, {
    uN: { value: 0 },
    uInv: { value: Array.from({ length: RIBO_MAX }, () => new THREE.Vector4()) },
    uOrg: { value: Array.from({ length: RIBO_MAX }, () => new THREE.Vector2()) },
    uPar: { value: Array.from({ length: RIBO_MAX }, () => new THREE.Vector4()) },
    uFlash: { value: 0 },
  });
  art = new Layer2D();
  text = new Layer2D();

  l1!: Line; l2!: Line; l3!: Line;
  tFoom = 0; tTrap = 0; tChin = 0; tWith = 0; tRing = 0;
  beats: number[] = [];
  codons: string[] = [];
  pCav = new Path2D();
  tunnelPts: Pt[] = [];
  coils: Pt[][] = [];
  glyph!: TRNAGlyph;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.l1 = ly.get("'cause the future goes FOOM");
    this.l2 = ly.get('Trapped in the Chinese room');
    this.l3 = ly.get('with a bag of shrooms');
    this.tFoom = findWord(this.l1, 'FOOM').start;
    this.tTrap = this.l2.words[0]!.start;
    this.tChin = findWord(this.l2, 'Chinese').start;
    this.tWith = this.l3.words[0]!.start;
    for (let i = Math.round(au.beatAt(this.ctx.start)); au.timeOfBeat(i) < this.ctx.end + 1; i++) this.beats.push(au.timeOfBeat(i));
    // the loop has closed on the downbeat before the cut
    this.tRing = au.downbeats.filter((d) => d < this.ctx.end - 0.1).pop() ?? this.ctx.end - 0.45;
    this.codons = senseCodons(J0 + 40, 11);
    this.codons[J0 + HOP] = 'UGG'; // Trp: the codon the bracket follows (one codon, one meaning)
    this.pCav.ellipse(CAV.x, CAV.y, CAV.rx, CAV.ry, 0, 0, Math.PI * 2);
    // the tunnel up to the solvent side, then the free chain
    this.tunnelPts = TUNNEL.filter((p) => p.y >= TUNNEL_EXIT.y + 2);
    this.tunnelPts.push({ ...TUNNEL_EXIT });
    for (let k = 0; k < N_RIB; k++) this.coils.push(chainCoil(90, 40 + k));
    this.glyph = trnaGlyph();
  }

  // ------------------------------------------------------------------ the elongation clock
  /** Continuous codon index at the P site (one translocation per beat). */
  private pSite(t: number) {
    let p = J0;
    for (let i = 1; i < this.beats.length; i++) p += prog(t, this.beats[i]!, this.beats[i]! + TR, ease.outCubic);
    return p;
  }
  /** Progress of a step of the cycle in which codon j's tRNA arrives (a, b: seconds after that beat). */
  private phase(j: number, t: number, a: number, b: number, fn = ease.outCubic) {
    const c = j - J0 - 1;
    if (c < 0) return 1;
    if (c >= this.beats.length) return 0;
    return prog(t, this.beats[c]! + a, this.beats[c]! + b, fn);
  }
  private arrival(j: number, t: number) { return this.phase(j, t, 0.16, 0.3); }
  private transfer(j: number, t: number) { return this.phase(j, t, 0.32, 0.42, ease.inOutCubic); }
  /** Residues in the main chain (continuous through each peptidyl transfer). */
  private residues(t: number) {
    let m = M0;
    for (let j = J0 + 1; j < J0 + 1 + this.beats.length; j++) m += this.transfer(j, t);
    return m;
  }

  // ------------------------------------------------------------------ the camera
  private view(t: number) {
    const slam = prog(t, this.tFoom, this.tFoom + 0.11, (x) => ease.outBack(x, 1.4));
    const s0 = t < this.tFoom
      ? lerp(0.64, 0.72, prog(t, this.ctx.start, this.tFoom, ease.inOutQuad))
      : lerp(0.72, 1.0, slam) * lerp(1, 1.04, prog(t, this.tFoom + 0.3, this.tWith, ease.inOutQuad));
    const ps = prog(t, this.tFoom, this.tFoom + 0.11, ease.outCubic);
    const p0a: Pt = { x: lerp(O_PRE.x, O_CUT.x, ps), y: lerp(O_PRE.y, O_CUT.y, ps) };
    const eZ = prog(t, this.tWith - 0.06, this.tRing, ease.inOutCubic);
    const s = s0 * Math.exp(lerp(0, Math.log(S_END / s0), eZ));
    const p0 = { x: lerp(p0a.x, RING_C.x, eZ), y: lerp(p0a.y, RING_C.y - RING_R, eZ) };
    const kap = prog(t, this.tWith + 0.05, this.tRing - 0.3, ease.inOutQuad) / R_W;
    const rot = 0.05 * Math.max(0, t - this.tRing);
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const dx = p0.x - RING_C.x, dy = p0.y - RING_C.y;
    const V: Aff = [s * cr, s * sr, -s * sr, s * cr, RING_C.x + cr * dx - sr * dy, RING_C.y + sr * dx + cr * dy];
    return { s, V, kap };
  }
  /** Point and tangent angle on the mRNA at arc length σ (world px; the main ribosome's P site at 0). */
  private arc(sig: number, kap: number) {
    if (kap < 1e-9) return { x: sig, y: 0, a: 0 };
    const ph = kap * sig;
    return { x: Math.sin(ph) / kap, y: (1 - Math.cos(ph)) / kap, a: ph };
  }
  private ribM(V: Aff, k: number, kap: number): Aff {
    if (k === 0) return V;
    const q = this.arc(k * D_SIGMA, kap);
    return mul(V, [Math.cos(q.a), Math.sin(q.a), -Math.sin(q.a), Math.cos(q.a), q.x, q.y]);
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const { s, V, kap } = this.view(t);
    const P = this.pSite(t);
    const m = this.residues(t);
    const cut = t >= this.tFoom ? smoothstep(0.27, 0.35, s) : 0;
    const aK = smoothstep(0.36, 0.22, s); // the loop's other ribosomes come into view

    // ---- masses (GL): the main ribosome, then the others on the loop
    const ribs: { M: Aff; k: number }[] = [{ M: V, k: 0 }];
    if (aK > 0.01) for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const M = this.ribM(V, k, kap);
      if (this.onScreen(M)) ribs.push({ M, k });
    }
    const U = this.ribo.u;
    ribs.forEach(({ M, k }, i) => {
      const det = M[0] * M[3] - M[1] * M[2];
      (U.uInv!.value as THREE.Vector4[])[i]!.set(M[3] / det, -M[2] / det, -M[1] / det, M[0] / det);
      (U.uOrg!.value as THREE.Vector2[])[i]!.set(M[4], M[5]);
      (U.uPar!.value as THREE.Vector4[])[i]!.set(k === 0 ? cut : 0, k === 0 ? 1 : aK, Math.hypot(M[0], M[1]), Math.atan2(M[1], M[0]));
    });
    U.uN!.value = ribs.length;
    U.uFlash!.value = t >= this.tFoom ? pulse(t, this.tFoom, 0.12) : 0;
    this.ribo.render(renderer, out);

    // ---- molecules (Canvas): tRNAs, chains, the mRNA
    const c = this.art.ctx;
    this.art.clear();
    for (const { M, k } of ribs) if (k !== 0) this.drawChain(c, M, s, this.coils[k + 3]!, Math.max(18, m + k * 9), null, aK, false);
    if (cut > 0.001) this.drawTRNAs(c, V, cut, P, t);
    const anchor = this.anchor(P, t);
    this.drawChain(c, V, s, this.coils[3]!, m, anchor, 1, cut > 0.001);
    this.drawTape(c, V, s, kap, P);
    c.setTransform(1, 0, 0, 1, 0, 0);
    comp.draw(renderer, this.art.upload(), out);

    // ---- lyrics, label, stamp, bracket
    this.drawText(t, V, s, kap, P, m);
    comp.draw(renderer, this.text.upload(), out);

    const sh = t >= this.tFoom ? 14 * pulse(t, this.tFoom, 0.07) : 0;
    const fi = frameIdx(t);
    return {
      bloom: 0.42, bloomThreshold: 0.9, vignette: 0.42,
      zoom: 1 + 0.003 * (f.a.kick ?? 0),
      shake: [sh * (hash(fi, 1) - 0.5) * 2, sh * (hash(fi, 2) - 0.5) * 2],
    };
  }

  private onScreen(M: Aff) {
    const o = ap(M, 0, -200), rr = 900 * Math.hypot(M[0], M[1]);
    return o.x > -rr && o.x < 1920 + rr && o.y > -rr && o.y < 1080 + rr;
  }

  // ------------------------------------------------------------------ mRNA tape
  private drawTape(c: CanvasRenderingContext2D, V: Aff, s: number, kap: number, P: number) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    const half = Math.PI * R_W - 110; // the loop's two ends meet at the bottom
    const n = 400;
    c.lineJoin = 'round'; c.lineCap = 'butt';
    const rail = (side: number) => {
      c.beginPath();
      let started = false;
      for (let i = 0; i <= n; i++) {
        const sig = -half + (2 * half * i) / n;
        const q = this.arc(sig, kap);
        const p = ap(V, q.x - Math.sin(q.a) * TAPE * side, q.y + Math.cos(q.a) * TAPE * side);
        if (p.x < -300 || p.x > 2220 || p.y < -300 || p.y > 1380) { started = false; continue; }
        if (!started) { c.moveTo(p.x, p.y); started = true; } else c.lineTo(p.x, p.y);
      }
      c.stroke();
    };
    c.strokeStyle = rgba('bone', lerp(0.6, 0.8, smoothstep(0.5, 0.2, s))); c.lineWidth = Math.max(1.1, 1.6 * Math.min(1, s * 2.2));
    rail(-1); rail(1);
    // the 5' cap and the poly(A) tail where the loop closes (once it has closed)
    const closeA = smoothstep(0.75, 1, kap * R_W);
    if (closeA > 0) {
      const a = this.arc(-half, kap), b = this.arc(half, kap);
      const pa = ap(V, a.x, a.y), pb = ap(V, b.x, b.y);
      c.fillStyle = rgba('bone', 0.85 * closeA);
      c.beginPath(); c.arc(pa.x, pa.y, 4.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = rgba('bone', 0.65 * closeA); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(pb.x, pb.y);
      for (let i = 1; i <= 16; i++) { const u = i / 16; c.lineTo(pb.x - 4 - u * 22 + Math.sin(u * 11) * 3, pb.y + 7 + u * 14 + Math.cos(u * 11) * 2.5); }
      c.stroke();
    }
    // codon letters and codon-boundary ticks while the letters are legible
    const la = smoothstep(0.36, 0.5, s);
    if (la <= 0.01) return;
    c.font = font(F.mono(500), 24);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const jA = Math.floor(P - 12 / s), jB = Math.ceil(P + 12 / s);
    for (let j = Math.max(0, jA); j <= Math.min(this.codons.length - 1, jB); j++) {
      const cd = this.codons[j]!;
      for (let b = 0; b < 3; b++) {
        const q = this.arc((j - P) * CODON + (b - 1) * NT, kap);
        const p = ap(V, q.x, q.y);
        if (p.x < -40 || p.x > 1960) continue;
        const ca = Math.cos(q.a), sa = Math.sin(q.a);
        const A = V[0] * ca + V[2] * sa, B = V[1] * ca + V[3] * sa;
        c.setTransform(A, B, -B, A, p.x, p.y);
        c.fillStyle = rgba('bone', 0.9 * la);
        c.fillText(cd[b]!, 0, 1);
        if (b === 2) { c.fillStyle = rgba('bone', 0.55 * la); c.fillRect(NT / 2 - 0.8, TAPE, 1.6, 9); }
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }

  // ------------------------------------------------------------------ tRNAs in the E · P · A sites
  private trnaX(j: number, P: number) { return (j - P) * CODON; }
  private drawTRNAs(c: CanvasRenderingContext2D, M: Aff, alpha: number, P: number, t: number) {
    const G = this.glyph;
    const lw = 1 / Math.hypot(M[0], M[1]);
    c.save();
    c.setTransform(...M);
    c.beginPath(); c.rect(-CAV.rx - 10, CAV.y - CAV.ry, CAV.rx * 2 + 20, CAV.ry * 2); c.clip();
    c.clip(this.pCav);
    c.font = font(F.mono(500), 22);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let j = Math.floor(P) - 2; j <= Math.floor(P) + 1; j++) {
      if (j < 0 || j >= this.codons.length) continue;
      const r = j - P;
      const arr = this.arrival(j, t);
      if (arr <= 0 || r > 1.001) continue;
      const exitA = 1 - smoothstep(-1.02, -1.55, r);
      const a = alpha * arr * exitA;
      if (a <= 0.01) continue;
      const x = this.trnaX(j, P) + (r < -1 ? (r + 1) * 40 : 0);
      const y = -34 * (1 - arr) + (r < -1 ? (r + 1) * 60 : 0);
      c.save();
      c.translate(x, y);
      c.fillStyle = rgba('#252325', a); c.fill(G.body); c.fill(G.loops);
      c.strokeStyle = rgba('bone', 0.82 * a); c.lineWidth = 1.5 * lw;
      c.stroke(G.body); c.stroke(G.loops);
      c.strokeStyle = rgba('bone', 0.72 * a); c.lineWidth = 1.3 * lw; c.stroke(G.stems);
      c.strokeStyle = rgba('ash', 0.75 * a); c.lineWidth = 1 * lw; c.stroke(G.ticks);
      // anticodon: complementary to the codon, base by base; H-bond ticks down to the codon
      const cd = this.codons[j]!;
      const pa = a * smoothstep(0.6, 1, arr);
      for (let b = 0; b < 3; b++) {
        const bx = (b - 1) * NT;
        c.fillStyle = rgba('bone', 0.94 * a);
        c.fillText(COMP[cd[b]!]!, bx, ANTICODON_Y + 1);
        const nH = HB[cd[b]!]!;
        c.fillStyle = rgba('bone', 0.75 * pa);
        for (let k = 0; k < nH; k++) c.fillRect(bx + (k - (nH - 1) / 2) * 5 - 0.6, -29, 1.2, 10 - y);
      }
      // the amino acid it carries, until it is transferred to the chain
      if (j > J0 && this.transfer(j, t) <= 0) {
        c.fillStyle = rgba('bone', a); c.beginPath(); c.arc(TRNA_TOP.dx, TRNA_TOP.y, 10, 0, Math.PI * 2); c.fill();
        c.fillStyle = rgba('ink', a); c.font = font(F.mono(600), 12); c.fillText(translate(cd), TRNA_TOP.dx, TRNA_TOP.y + 0.5);
        c.font = font(F.mono(500), 22);
      }
      c.restore();
    }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.restore();
  }

  /** The peptidyl-tRNA's acceptor end (local px), where the chain is attached. */
  private anchor(P: number, t: number): Pt {
    let jt = J0;
    for (let j = J0 + 1; j < J0 + 1 + this.beats.length; j++) if (this.transfer(j, t) > 0) jt = j; else break;
    const tf = jt === J0 ? 1 : this.transfer(jt, t);
    const xa = this.trnaX(jt - 1, P) + TRNA_TOP.dx, xb = this.trnaX(jt, P) + TRNA_TOP.dx;
    return { x: lerp(xa, xb, tf), y: TRNA_TOP.y };
  }

  // ------------------------------------------------------------------ nascent chain
  private chainPts: Pt[] = [];
  private chainL = new Float64Array(0);
  private drawChain(c: CanvasRenderingContext2D, M: Aff, s: number, coil: Pt[], n: number, anchor: Pt | null, alpha: number, inTunnel: boolean) {
    const pts = this.chainPts;
    pts.length = 0;
    pts.push(anchor ?? { x: TRNA_TOP.dx, y: TRNA_TOP.y });
    for (const p of this.tunnelPts) pts.push(p);
    for (let i = 1; i < coil.length; i++) pts.push(coil[i]!);
    const L = (this.chainL = lengths(pts));
    const exitS = L[this.tunnelPts.length]!; // arc length where the chain leaves the tunnel
    // residue q (0 = the N-terminal Met) sits at depth d = n - 1 - q from the anchor; d < 0 is still on its tRNA
    const scr: Pt[] = [];
    const tmp: Pt = { x: 0, y: 0 };
    const sMin = inTunnel ? 0 : exitS;
    for (let q = 0; q <= Math.floor(n); q++) {
      const d = n - 1 - q;
      if (d < 0 || d * RS < sMin - 1) break;
      atLength(pts, L, d * RS, tmp);
      scr.push(ap(M, tmp.x, tmp.y));
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (scr.length === 0) return;
    if (!inTunnel) { const e = ap(M, TUNNEL_EXIT.x, TUNNEL_EXIT.y); scr.push(e); }
    c.strokeStyle = rgba('bone', 0.85 * alpha); c.lineWidth = Math.max(1.7, 3.2 * s);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    scr.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
    c.stroke();
    if (!inTunnel) scr.pop();
    const big = s > 0.5;
    const r = Math.max(2.1, 9 * s);
    c.fillStyle = rgba('bone', 0.95 * alpha);
    if (big) { c.strokeStyle = rgba('ink', 0.9 * alpha); c.lineWidth = 1.2; }
    for (const p of scr) {
      c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill();
      if (big) c.stroke();
    }
    if (big && anchor) {
      // one-letter residue codes on the beads near the tunnel entrance (legible only up close)
      const la = smoothstep(0.62, 0.85, s) * alpha;
      if (la > 0.01) {
        c.font = font(F.mono(600), 11); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = rgba('ink', la);
        for (let i = Math.max(0, scr.length - 24); i < scr.length; i++) {
          const j = J0 + (i - (M0 - 1)); // residue i came from codon j
          if (j >= 0 && j < this.codons.length) c.fillText(translate(this.codons[j]!), scr[i]!.x, scr[i]!.y + 0.5);
        }
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      }
    }
  }

  // ------------------------------------------------------------------ lyrics, label, stamp, bracket
  private drawText(t: number, V: Aff, s: number, kap: number, P: number, m: number) {
    const c = this.text.ctx;
    this.text.clear();
    const l1 = this.l1, l2 = this.l2, l3 = this.l3;
    // I: top left; FOOM lands with the slam
    const a1 = 1 - prog(t, l1.end + 0.1, l1.end + 0.42);
    karaokeRow(c, l1.words.slice(0, 4), 130, 250, F.archivo(100, 700), 64, t, a1);
    const wF = l1.words[4]!;
    if (t > wF.start - 0.12 && a1 > 0) {
      const k = 1 + 0.2 * (1 - prog(t, wF.start, wF.start + 0.09, ease.outCubic));
      c.save();
      c.translate(130, 540); c.scale(k, k); c.translate(-130, -540);
      karaokeRow(c, [wF], 130, 540, F.archivo(112.5, 900), 250, t, a1, { lead: 0.12 });
      c.restore();
    }
    // II: bottom left
    const a2 = 1 - prog(t, l2.end + 0.04, l2.end + 0.34);
    karaokeRow(c, l2.words.slice(0, 3), 130, 812, F.archivo(100, 700), 64, t, a2);
    karaokeRow(c, l2.words.slice(3), 130, 936, F.archivo(87.5, 900), 124, t, a2);
    // III: top left again (the shoggoth slot carries it on at the same place)
    karaokeRow(c, l3.words.slice(0, 3), 130, 212, F.archivo(100, 700), 64, t, 1, { lead: 0.3 });
    karaokeRow(c, l3.words.slice(3), 130, 346, F.archivo(100, 900), 132, t, 1, { lead: 0.3 });

    // label `translation` with "Trapped in the", overstamped on "Chinese"
    const aL = window01(t, this.tTrap - 0.04, this.tWith + 0.2, 0.18, 0.3);
    const tgt = ap(V, -196, -150);
    const lx = 590, ly = 652;
    const stamped = prog(t, this.tChin, this.tChin + 0.09);
    monoLabel(c, 'translation', lx, ly, tgt.x, tgt.y, aL * lerp(1, 0.75, stamped));
    rubberStamp(c, 'CF. SEARLE, 1980', lx + 92, ly - 30, t, { t0: this.tChin, size: 28, rot: -0.07, seed: 3, alpha: 0.92 * (1 - prog(t, this.tWith - 0.02, this.tWith + 0.3)) });
    // the polysome, once its loop has closed
    const ring = this.arc(2 * D_SIGMA, kap);
    const rp = ap(V, ring.x + Math.sin(ring.a) * 420, ring.y - Math.cos(ring.a) * 420);
    monoLabel(c, 'polysome · schematic', 1636, 772, rp.x, rp.y, window01(t, this.tRing - 0.3, this.ctx.end + 1, 0.3, 0.1));

    // the orange focus bracket: around its codon, then on that codon's amino acid, then up the tunnel
    const jb = J0 + HOP;
    const hop = this.phase(jb, t, 0.3, 0.44, ease.inOutCubic);
    const rB = jb - P;
    const onCodon = ap(V, rB * CODON, 0);
    let res: Pt;
    if (this.transfer(jb, t) < 1) res = ap(V, this.trnaX(jb, P) + TRNA_TOP.dx, TRNA_TOP.y);
    else {
      const d = m - 1 - (M0 - 1 + HOP); // depth of the bracketed residue along the (main) chain
      const q = atLength(this.chainPts, this.chainL, d * RS);
      res = ap(V, q.x, q.y);
    }
    const x = lerp(onCodon.x, res.x, hop), y = lerp(onCodon.y, res.y, hop) - Math.sin(Math.PI * hop) * 30 * s;
    const bA = smoothstep(0.24, 0.42, s);
    const hs = lerp((CODON / 2 + 6) * s, 15 * Math.max(0.6, s), hop);
    focusBracket(c, x, y, { size: hs, alpha: bA, dot: hop });
  }
}
