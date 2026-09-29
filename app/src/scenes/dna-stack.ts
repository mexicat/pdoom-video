// DNA edition, `stack` slot (109.778–115.232): “Just transformers all the way!” / Till you learned to disobey
// The bridge; the full band returns at bar 61 (111.14).
//  • A chromatin fibre's contour sweeps through the frame: right-handed B-DNA wrapped round histone
//    discs (beads on a string). A wide lens dollies in until one nucleosome towers over the lens:
//    `nucleosome · ~147 bp per histone octamer`.
//  • Bar 61: the fibre's irregular loops stand on the plane like arches and fold down, on the eighth
//    notes. The camera is interrupted on the snares (hard reframes): the field; one loop falling
//    over the lens; a wave of loops folding "all the way" to the horizon
//    (`higher-order packing · models differ`; no regular 30-nm ladder).
//  • “disobey”: one region becomes accessible (its two nucleosomes slide apart), a transcription
//    bubble opens and an RNA strand (A U G C) peels off: a schematic example; the focus bracket marks
//    where it starts.
//  • Downbeat: pull back overhead until the looped silhouettes are the outlines of dense's first cells.
// Pure function of song time (geometry precomputed in init; the sliding site is recomputed from t).
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, lerp, ease, prog, smoothstep, hash, window01 } from '../engine/util';
import { karaokeRow, monoLabel, focusBracket, findWord, helix, LIN, rgba, BDNA } from './dna-kit';
import { CellField, fieldSchedule } from './dna-dense-field';
import { buildChromatin, bendW, FibreAxis, wrapAt, CORE_R, CORE_HH, K, PHI, STALK, type Chromatin, type Nuc } from './dna-stack-geo';
import { denseRows } from './dna-dense-type';

type V3 = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const MAXSEG = 300000, MAXIT = 110000;
const TUBE = 0.3; // backbone tube width, nm
const RNA_CODE = ['A', 'U', 'G', 'C']; // RNA: U in place of T

interface Shot { pos: V3; tgt: V3; fov: number; roll: number; up?: V3; fogRef?: number }

export default class DnaStack extends Scene {
  // dna-kit's ink ground (its raised centre) without the paper-fibre noise, which this slot never shows
  bg = new FSPass(/* glsl */ `
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      fragColor = vec4(C_INK + C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, length(p))), 1.0);
    }`);
  L = new LineBatch(MAXSEG, { screen2D: true, blend: 'normal' });
  text = new Layer2D();
  ch!: Chromatin;
  f0 = 0.66;
  cam = new THREE.PerspectiveCamera(50, W / H, 0.05, 20000);
  vp = new Float32Array(16);
  kpx = 1; camP = v3(); camR = v3(); camU = v3(); camB = v3();
  light = v3();
  // painter's sort buffers
  sb = new Float32Array(MAXSEG * 9); nseg = 0;
  idep = new Float32Array(MAXIT); ist = new Int32Array(MAXIT); icnt = new Int32Array(MAXIT); nit = 0;
  ord = new Int32Array(MAXIT); bucket = new Int32Array(4097);
  sx = new Float32Array(420 * 9);
  // disc scratch
  rt = new Float32Array(400 * 4); rb = new Float32Array(400 * 4); fr = new Uint8Array(400); shd = new Float32Array(400); poly = new Float32Array(800);
  // per-frame loop fold state
  fa = new Float32Array(0); fc = new Float32Array(0); fs = new Float32Array(0);
  linkDim = 1;

  // timing
  tS = 0; tE = 0; tBand = 0; tDis = 0; tPull = 0; tSettle = 0; tTx = 0;
  snares: number[] = []; eighths: number[] = [];
  l1!: Line; l2!: Line;
  hero = 0; heroNucs: number[] = []; xLoop = 0; b3Pos = v3(); b3Tgt = v3();
  rows!: ReturnType<typeof denseRows>;

  // the accessible site
  siteA = 0; siteB = 0; e1 = 0; // index of the linker element before siteA
  r0 = 0; r1 = 0; st!: { A: Float32Array; B: Float32Array; C: Float32Array };
  nucOff = new Map<number, V3>();
  siteKey = ''; iT = 0; ip = 0; nR = 0; rna: { p: V3; stub: V3 }[] = [];
  slideBp = 0;

  override async init() {
    const { audio: au, lyrics: ly } = this.ctx;
    this.tS = this.ctx.start; this.tE = this.ctx.end;
    this.l1 = ly.get('transformers all the way');
    this.l2 = ly.get('Till you learned');
    const tTrans = findWord(this.l1, 'transformers').start;
    this.tBand = au.downbeats.find((d) => d > tTrans) ?? tTrans + 0.5;
    this.tDis = findWord(this.l2, 'disobey').start;
    this.tPull = au.downbeats.find((d) => d > this.tDis) ?? this.tDis + 0.5;
    this.tSettle = this.tE - 0.06;
    this.tTx = this.tDis + 0.14;
    const bb = Math.round(au.beatAt(this.tBand));
    this.snares = [1, 3, 5, 7].map((k) => au.timeOfBeat(bb + k));
    for (let k = 0; k <= 14; k++) this.eighths.push(au.timeOfBeat(bb + k * 0.5));

    const sch = fieldSchedule(au, ly);
    const field = new CellField(sch.rounds);
    this.f0 = sch.fill(this.tE);
    this.ch = buildChromatin(field, this.f0);
    const ch = this.ch, n = ch.loops.length;
    this.fa = new Float32Array(n); this.fc = new Float32Array(n); this.fs = new Float32Array(n);
    // the hero loop (nearest the frame centre) lies flat throughout
    const best = ch.hero;
    let bd = Infinity;
    this.hero = best;
    const HL = ch.loops[best]!;
    this.heroNucs = ch.nucs.map((q, i) => ({ q, i })).filter((o) => o.q.loop === best).sort((a, b) => a.q.uu - b.q.uu).map((o) => o.i);
    this.topNuc = this.heroNucs.map((i) => ch.nucs[i]!.c).reduce((b, c) => (c.z < b.z ? c : b)).clone();
    // X: the loop that falls over the lens in B2 (the hero's nearest neighbour)
    let bx = -1; bd = Infinity;
    ch.loops.forEach((L, k) => { if (k === best) return; const d = Math.hypot(L.cx - HL.cx, L.cz - HL.cz); if (d < bd) { bd = d; bx = k; } });
    this.xLoop = bx;
    // B3's camera: high over the field's lower-right corner, raking toward the upper left
    this.b3Pos = v3(330, -6, 260); this.b3Tgt = v3(-620, 60, -330);
    // standing angles and landing times: two slam on the band's return, X over the lens, the rest a wave
    const rest = ch.loops.map((L, k) => ({ k, L })).filter((o) => o.k !== best && o.k !== bx);
    rest.forEach((o) => { o.L.phi0 = (70 + 34 * hash(o.k, 2)) * Math.PI / 180; });
    ch.loops[bx]!.phi0 = 96 * Math.PI / 180;
    ch.loops[bx]!.tFold = au.timeOfBeat(bb + 2);
    const dB3 = (L: { cx: number; cz: number }) => Math.hypot(L.cx - this.b3Pos.x, L.cz - this.b3Pos.z);
    rest.sort((a, b) => dB3(a.L) - dB3(b.L));
    const eP = v3(HL.cx, 0, HL.cz).addScaledVector(this.b1Dir, 190);
    const early = rest.slice().sort((a, b) => Math.hypot(a.L.cx - eP.x, a.L.cz - eP.z) - Math.hypot(b.L.cx - eP.x, b.L.cz - eP.z)).slice(0, 2).map((o) => o.k);
    const wave = rest.filter((o) => !early.includes(o.k));
    early.forEach((k) => { ch.loops[k]!.tFold = this.eighths[1]!; });
    const w0 = 6, w1 = 13; // eighths 112.73 .. 114.09
    wave.forEach((o, r) => { o.L.tFold = this.eighths[Math.min(w1, w0 + Math.floor((r / wave.length) * (w1 - w0 + 1)))]!; });
    this.rows = denseRows(ly);
    this.initSite();
    // the site camera's screen-up, for the RNA's exit direction (so it peels into the frame)
    this.cPose = this.sitePose();
    { const sc = this.cPose; const f = sc.tgt.clone().sub(sc.pos).normalize(); const up = sc.up.clone().applyAxisAngle(f, sc.roll); const r = f.clone().cross(up).normalize(); this.cUp = r.clone().cross(f).normalize(); }
  }

  // ------------------------------------------------------------------ the accessible site
  private initSite() {
    const ch = this.ch, hn = this.heroNucs;
    const m = Math.floor(hn.length * 0.62);
    this.siteA = hn[m]!; this.siteB = hn[m + 1]!;
    const el = ch.axis.elems;
    const eA = el.findIndex((e) => e.kind === 0 && e.nuc === this.siteA);
    this.e1 = eA - 1;
    const E1 = el[eA - 1]!, E5 = el[eA + 3]!;
    this.r0 = E1.bp0; this.r1 = E5.bp0 + E5.nbp;
    this.st = { A: ch.A.slice(this.r0 * 3, this.r1 * 3), B: ch.B.slice(this.r0 * 3, this.r1 * 3), C: ch.C.slice(this.r0 * 3, this.r1 * 3) };
  }
  /** Slide (bp moved by each nucleosome) and polymerase position at t. */
  private siteState(t: number) {
    const el = this.ch.axis.elems, E1 = el[this.e1]!, E5 = el[this.e1 + 4]!;
    const maxB = Math.max(0, Math.min(26, Math.min(E1.nbp, E5.nbp) - 8));
    const m = prog(t, this.tDis - 0.02, this.tDis + 0.2, ease.outCubic);
    const slide = Math.round(m * maxB);
    const E3 = el[this.e1 + 2]!;
    const iT = E3.bp0 - maxB + Math.round((E3.nbp + 2 * maxB) / 2) - 16; // transcription start: mid-way along the freed stretch
    const ip = iT + Math.max(0, t - this.tTx) * 80; // 80 nt/s: schematic, a little faster than typical elongation
    return { slide, iT, ip, open: prog(t, this.tTx - 0.1, this.tTx + 0.05) };
  }
  private bubble(i: number, ip: number, open: number) {
    if (open <= 0) return 0;
    const lo = Math.max(this.iT - 3, ip - 13);
    const a = smoothstep(lo - 1.5, lo + 1.5, i) * (1 - smoothstep(ip + 1.5, ip + 4, i));
    return a * open;
  }
  private updateSite(t: number) {
    const ch = this.ch, s = this.siteState(t);
    this.ss = s;
    // Cache only identical geometry inputs. Rounded keys made nearby shutter samples reuse whichever
    // geometry was rendered first, so the same time could change after an out-of-order seek.
    const key = `${s.slide}|${s.open > 0 ? s.ip : 'x'}|${s.open}`;
    this.iT = s.iT; this.ip = s.ip; this.nR = s.open > 0 ? Math.max(0, Math.floor(s.ip - s.iT)) : 0;
    if (key === this.siteKey) return;
    this.siteKey = key;
    const r0 = this.r0, r1 = this.r1, n = r1 - r0;
    this.nucOff.clear();
    if (s.slide === 0 && s.open <= 0) {
      ch.A.set(this.st.A, r0 * 3); ch.B.set(this.st.B, r0 * 3); ch.C.set(this.st.C, r0 * 3);
      this.slideBp = 0; this.rna = [];
      return;
    }
    this.slideBp = s.slide;
    const el = ch.axis.elems;
    const E1 = el[this.e1]!, E3 = el[this.e1 + 2]!, E5 = el[this.e1 + 4]!;
    if (E1.kind !== 1 || E5.kind !== 1 || E3.kind !== 1) return;
    const qa = ch.nucs[this.siteA]!, qb = ch.nucs[this.siteB]!;
    const dir = qb.c.clone().sub(qa.c).normalize();
    const ds = s.slide * BDNA.rise * 0.8;
    const offA = dir.clone().multiplyScalar(-ds), offB = dir.clone().multiplyScalar(ds);
    this.nucOff.set(this.siteA, offA); this.nucOff.set(this.siteB, offB);
    const A2: Nuc = { ...qa, c: qa.c.clone().add(offA) }, B2: Nuc = { ...qb, c: qb.c.clone().add(offB) };
    const ax = new FibreAxis([A2, B2]);
    const P0 = v3(), T0 = v3(), P1 = v3(), T1 = v3();
    const lk = (a: V3, ta: V3, b: V3, tb: V3, nb: number) => { const d = a.distanceTo(b), mg = Math.max(d, nb * BDNA.rise * 0.9); ax.addLinker(a, ta.clone().multiplyScalar(mg), b, tb.clone().multiplyScalar(mg), nb); };
    wrapAt(A2, 0, P1, T1);
    lk(E1.p0, E1.m0.clone().normalize(), P1, T1, E1.nbp - s.slide);
    ax.addWrap(0);
    wrapAt(A2, PHI, P0, T0); wrapAt(B2, 0, P1, T1);
    lk(P0, T0, P1, T1, E3.nbp + 2 * s.slide);
    ax.addWrap(1);
    wrapAt(B2, PHI, P0, T0);
    lk(P0, T0, E5.p1, E5.m1.clone().normalize(), E5.nbp - s.slide);
    // strand a's direction at the range start, so the recomputed stretch continues the static helix
    const e1 = v3(this.st.A[0]! - this.st.C[0]!, this.st.A[1]! - this.st.C[1]!, this.st.A[2]! - this.st.C[2]!).normalize();
    const bps = helix(n, (sa, p, tt) => ax.at(sa / BDNA.rise, p, tt), {
      seq: ch.seq.slice(r0, r1), phase: 0, e1, sep: (i) => this.bubble(r0 + i, s.ip, s.open), open: 1.15,
    });
    // twist mismatch at the far end: spread the correction over the last linker
    const last = n - 1, lo = n - (E5.nbp - s.slide);
    const cn = bps[last]!.c, rn = bps[last]!.a.clone().sub(cn).normalize();
    const rs = v3(this.st.A[last * 3]! - this.st.C[last * 3]!, this.st.A[last * 3 + 1]! - this.st.C[last * 3 + 1]!, this.st.A[last * 3 + 2]! - this.st.C[last * 3 + 2]!).normalize();
    const tEnd = bps[last]!.c.clone().sub(bps[last - 1]!.c).normalize();
    const dl = Math.atan2(rn.clone().cross(rs).dot(tEnd), rn.dot(rs));
    for (let i = 0; i < n; i++) {
      const q = bps[i]!;
      if (i >= lo) {
        const w = smoothstep(lo, last, i);
        const tn = bps[Math.min(last, i + 1)]!.c.clone().sub(bps[Math.max(0, i - 1)]!.c).normalize();
        q.a.sub(q.c).applyAxisAngle(tn, dl * w).add(q.c);
        q.b.sub(q.c).applyAxisAngle(tn, dl * w).add(q.c);
      }
      const o = (r0 + i) * 3;
      ch.A[o] = q.a.x; ch.A[o + 1] = q.a.y; ch.A[o + 2] = q.a.z;
      ch.B[o] = q.b.x; ch.B[o + 1] = q.b.y; ch.B[o + 2] = q.b.z;
      ch.C[o] = q.c.x; ch.C[o + 1] = q.c.y; ch.C[o + 2] = q.c.z;
    }
    // the RNA: its 3′ end pairs with the template (strand b) at the polymerase; ~8 nt of hybrid, then it peels away
    this.rna = [];
    const nR = this.nR;
    if (nR > 0) {
      const at = (arr: Float32Array, i: number) => v3(arr[i * 3]!, arr[i * 3 + 1]!, arr[i * 3 + 2]!);
      const ipI = Math.min(r1 - 2, Math.floor(s.ip));
      const hyb = Math.min(8, nR);
      for (let j = nR - 1; j >= 0; j--) {
        const back = nR - 1 - j; // nt behind the 3′ end
        if (back < hyb) {
          const i = ipI - back;
          const b = at(ch.B, i), c = at(ch.C, i);
          const p = b.clone().lerp(c, 0.42);
          this.rna.push({ p, stub: b.clone().sub(p).multiplyScalar(0.8) });
        } else {
          const i0 = ipI - hyb;
          const b = at(ch.B, i0), c = at(ch.C, i0), tn = at(ch.C, i0 + 1).sub(at(ch.C, i0 - 1)).normalize();
          const out = this.cUp.clone().addScaledVector(tn, -this.cUp.dot(tn)).normalize(), side = out.clone().cross(tn).normalize();
          const d = (back - hyb + 1) * 0.62;
          const p = b.clone().lerp(c, 0.42).addScaledVector(out, 1.2 + d * 0.9).addScaledVector(tn, -d * 0.3)
            .addScaledVector(side, 0.9 * Math.sin(d * 0.8) + 0.03 * d * d);
          const stubDir = side.clone().multiplyScalar(back % 2 ? 1 : -1).addScaledVector(tn, -0.3).normalize();
          this.rna.push({ p, stub: stubDir.multiplyScalar(0.85) });
        }
      }
      this.rna.reverse(); // 5′ → 3′
    }
  }

  // ------------------------------------------------------------------ camera
  private setCam(s: Shot) {
    const c = this.cam;
    c.fov = s.fov; c.position.copy(s.pos);
    const up = (s.up ?? v3(0, 1, 0)).clone();
    const f = s.tgt.clone().sub(s.pos).normalize();
    if (s.roll) up.applyAxisAngle(f, s.roll);
    c.up.copy(up); c.lookAt(s.tgt);
    c.updateMatrixWorld(); c.updateProjectionMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    this.vp.set(m.elements);
    this.kpx = H / 2 / Math.tan((s.fov * Math.PI) / 360);
    this.camP.copy(s.pos);
    this.camR.setFromMatrixColumn(c.matrixWorld, 0); this.camU.setFromMatrixColumn(c.matrixWorld, 1); this.camB.setFromMatrixColumn(c.matrixWorld, 2);
    this.light.set(0, 0, 0).addScaledVector(this.camR, -0.55).addScaledVector(this.camU, 0.62).addScaledVector(this.camB, 0.55).normalize();
  }
  private heroAt(f: number) {
    const hn = this.heroNucs;
    return this.ch.nucs[hn[Math.max(0, Math.min(hn.length - 1, Math.round(f * (hn.length - 1))))]!]!.c;
  }
  private siteCentre() {
    const a = this.ch.nucs[this.siteA]!.c, b = this.ch.nucs[this.siteB]!.c;
    return a.clone().lerp(b, 0.5);
  }
  private shot(t: number): Shot {
    const ch = this.ch, HL = ch.loops[this.hero]!;
    const cen = v3(HL.cx, 0, HL.cz), UP = v3(0, 1, 0);
    const [s1, s2, s3] = this.snares as [number, number, number, number];
    // A, B1–B3 look from just below the loops' plane: the loops rise above the horizon and the lower
    // frame stays empty ink for the type
    if (t < this.tBand) {
      // A: fuse's axon terminal becomes the hero loop, seen from overhead (its ring opens into two
      // parallel fibres, the stalk); then the lens falls through the loop and tilts up to the fibre
      const st = ch.stalk, pxnm0 = 195 / st.r, h0 = this.kpxFor(40) / pxnm0;
      const e = ease.inOutCubic(prog(t, this.tS + 0.16, this.tBand - 0.2));
      const N = this.topNuc;
      const x0 = HL.cx, z0 = HL.cz - 50 / pxnm0, xE = N.x, zE = N.z + 24, yE = -4;
      const pos = v3(lerp(x0, xE, e), yE + (h0 - yE) * (1 - e) ** 2.4, lerp(z0, zE, e));
      const pitch = lerp(-Math.PI / 2, 0.12, smoothstep(0.12, 1, e));
      const f = v3(0, Math.sin(pitch), -Math.cos(pitch)), up = v3(0, Math.cos(pitch), Math.sin(pitch));
      return { pos, tgt: pos.clone().add(f), fov: lerp(40, 66, smoothstep(0.2, 1, e)), roll: -0.08 * e, up, fogRef: Math.max(24, pos.y + 20) };
    }
    if (t < s1) {
      // B1: bar 61 — a colonnade of standing loops; the first two slam down on the eighth
      const u = prog(t, this.tBand, s1);
      const d = this.b1Dir;
      const pos = cen.clone().addScaledVector(d, -50 + 25 * u).add(v3(0, -14, 0));
      return { pos, tgt: pos.clone().addScaledVector(d, 300).add(v3(0, 300 * Math.tan(0.16), 0)), fov: 66, roll: 0.05 };
    }
    if (t < s2) {
      // B2: under loop X as it falls over the lens
      const X = ch.loops[this.xLoop]!, u = prog(t, s1, s2);
      const Bx = v3(X.bx, 0, X.bz), Tx = v3(X.tx, 0, X.tz);
      const inner = v3(X.cx - X.bx, 0, X.cz - X.bz), rX = inner.length(); inner.normalize();
      const pos = Bx.clone().addScaledVector(inner, rX * 1.2 + 8 * u).add(v3(0, -18, 0)).addScaledVector(Tx, 10);
      const tgt = pos.clone().addScaledVector(inner, -200).addScaledVector(Tx, -12).add(v3(0, 200 * Math.tan(0.26), 0));
      return { pos, tgt, fov: 80, roll: -0.14 };
    }
    if (t < s3) {
      // B3: the wave folds "all the way" to the horizon
      const u = prog(t, s2, s3);
      const pos = this.b3Pos.clone().add(v3(-26 * u, 0, -18 * u));
      const d = this.b3Tgt.clone().sub(this.b3Pos).setY(0).normalize();
      return { pos, tgt: pos.clone().addScaledVector(d, 400).add(v3(0, 400 * Math.tan(0.12), 0)), fov: 70, roll: 0.14 };
    }
    // C → D: above the plane, square on the linker that opens (nucleosomes left and right, the RNA
    // peeling up into the empty upper right); then the pull back overhead onto dense's framing
    const c = this.cPose, drift = prog(t, s3, this.tPull);
    const p0 = c.pos.clone().lerp(c.tgt, 0.1 * drift), tc = c.tgt;
    const endPos = v3(0, this.kpxFor(40) / K, 0), endTgt = v3(0, 0, 0);
    const u = prog(t, this.tPull, this.tSettle);
    if (u <= 0) return { pos: p0, tgt: tc, fov: 40, roll: c.roll, up: c.up };
    const e = ease.inOutCubic(u);
    const hgt = Math.exp(lerp(Math.log(p0.y), Math.log(endPos.y), ease.inOutQuad(u)));
    const pos = p0.clone().lerp(endPos, e); pos.y = hgt;
    const tgt = tc.clone().lerp(endTgt, e);
    const up2 = c.up.clone().applyAxisAngle(c.tgt.clone().sub(c.pos).normalize(), c.roll).lerp(v3(0, 0, -1), smoothstep(0.2, 0.85, e)).normalize();
    return { pos, tgt, fov: 40, roll: 0, up: up2 };
  }
  b1Dir = v3(-0.83, 0, 0.55).normalize();
  topNuc = v3();
  cUp = v3(0, 1, 0);
  cPose = { pos: v3(), tgt: v3(), up: v3(0, 1, 0), roll: 0 };
  /** The site shot: the camera square on the linker's midpoint, rolled so the fibre rises to the right. */
  private sitePose() {
    const ch = this.ch, el = ch.axis.elems, E3 = el[this.e1 + 2]!;
    const im = E3.bp0 + (E3.nbp >> 1);
    const mid = v3(ch.C[im * 3]!, ch.C[im * 3 + 1]!, ch.C[im * 3 + 2]!);
    const dL = ch.nucs[this.siteB]!.c.clone().sub(ch.nucs[this.siteA]!.c).setY(0).normalize();
    const HL = ch.loops[this.hero]!;
    let dN = v3(-dL.z, 0, dL.x);
    if (dN.dot(v3(HL.cx - mid.x, 0, HL.cz - mid.z)) < 0) dN.negate(); // look from inside the loop
    const d = 42, el0 = 0.95;
    const pos = mid.clone().addScaledVector(dN, d * Math.cos(el0)).add(v3(0, d * Math.sin(el0), 0));
    const f = mid.clone().sub(pos).normalize(), r = f.clone().cross(v3(0, 1, 0)).normalize(), u = r.clone().cross(f);
    // place the midpoint right of and below the centre
    const tgt = mid.clone().addScaledVector(r, -0.06 * d).addScaledVector(u, 0.12 * d);
    // roll so the fibre through A and B rises ~16° to the right on screen (tried both ways, measured)
    const a = ch.nucs[this.siteA]!.c, b = ch.nucs[this.siteB]!.c;
    const screenAng = (roll: number) => {
      this.setCam({ pos, tgt, fov: 40, roll });
      const pa = this.pjc(a), pb = this.pjc(b);
      const [l, rr] = pa.x < pb.x ? [pa, pb] : [pb, pa];
      return Math.atan2(l.y - rr.y, rr.x - l.x); // rising to the right is positive
    };
    let best = 0, bErr = Infinity;
    for (let k = -24; k <= 24; k++) {
      const roll = (k / 24) * Math.PI / 2, e = Math.abs(screenAng(roll) - 0.28);
      if (e < bErr) { bErr = e; best = roll; }
    }
    return { pos, tgt, up: v3(0, 1, 0), roll: best };
  }
  /** A standing loop's top in B3's view, for the packing label's leader. */
  private packAnchor() {
    let best = null as { x: number; y: number } | null, bd = Infinity;
    this.ch.loops.forEach((L, k) => {
      if (Math.abs(this.fa[k]!) < 0.5) return;
      const top = this.rotP(v3(L.cx, 0, L.cz), k, 0.5);
      const q = this.pjc(top);
      if (q.w < 1 || q.x < 300 || q.x > 1600 || q.y < 150 || q.y > 620) return;
      const d = Math.hypot(q.x - 1150, q.y - 560);
      if (d < bd) { bd = d; best = { x: q.x, y: q.y }; }
    });
    return best;
  }
  private kpxFor(fov: number) { return H / 2 / Math.tan((fov * Math.PI) / 360); }

  // ------------------------------------------------------------------ fold state
  private foldState(t: number) {
    this.ch.loops.forEach((L, k) => {
      let a = 0;
      if (k !== this.hero) {
        const sway = 0.06 * Math.sin(0.9 * t + k * 1.7);
        const fall = prog(t, L.tFold - 0.32, L.tFold, ease.inQuad);
        const dt = t - L.tFold;
        const bounce = dt > 0 ? 0.1 * Math.sin(dt * 24) * Math.exp(-dt * 10) : 0;
        a = (L.phi0 + sway) * (1 - fall) + L.phi0 * Math.max(0, bounce);
      }
      this.fa[k] = a * L.lift; this.fc[k] = Math.cos(this.fa[k]!); this.fs[k] = Math.sin(this.fa[k]!);
    });
  }
  /** Flat-state point (arr at i) of loop lp / ring parameter u, folded, into out[o..o+2]. */
  private xf(arr: Float32Array, i: number, lp: number, u: number, out: Float32Array, o: number) {
    let x = arr[i * 3]!, y = arr[i * 3 + 1]!, z = arr[i * 3 + 2]!;
    if (lp >= 0) {
      const a0 = this.fa[lp]!;
      if (a0 !== 0) {
        const L = this.ch.loops[lp]!, w = bendW(u);
        let c = this.fc[lp]!, s = this.fs[lp]!;
        if (w < 1) { const a = a0 * w; c = Math.cos(a); s = Math.sin(a); }
        const vx = x - L.bx, vy = y, vz = z - L.bz, tx = L.tx, tz = L.tz;
        const dot = tx * vx + tz * vz, k1 = 1 - c;
        x = L.bx + vx * c + (-tz * vy) * s + tx * dot * k1;
        y = vy * c + (tz * vx - tx * vz) * s;
        z = L.bz + vz * c + (tx * vy) * s + tz * dot * k1;
      }
    }
    out[o] = x; out[o + 1] = y; out[o + 2] = z;
  }
  private xv = new Float32Array(3); private xo = new Float32Array(3);
  private rotP(v: V3, lp: number, u: number): V3 {
    this.xv[0] = v.x; this.xv[1] = v.y; this.xv[2] = v.z;
    this.xf(this.xv, 0, lp, u, this.xo, 0);
    return v3(this.xo[0], this.xo[1], this.xo[2]);
  }
  private rotD(v: V3, lp: number, u: number): V3 {
    if (lp < 0 || this.fa[lp] === 0) return v.clone();
    const L = this.ch.loops[lp]!;
    return this.rotP(v3(v.x + L.bx, v.y, v.z + L.bz), lp, u).sub(v3(L.bx, 0, L.bz));
  }
  private pj(x: number, y: number, z: number, out: Float32Array, o: number) {
    const m = this.vp;
    const X = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, Y = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, Wc = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    const w = Math.max(0.05, Wc);
    out[o] = (X / w * 0.5 + 0.5) * W; out[o + 1] = (1 - (Y / w * 0.5 + 0.5)) * H; out[o + 2] = Wc; out[o + 3] = this.kpx / w;
    return Wc > 0.5;
  }
  private pq = new Float32Array(4);
  private pjc(p: V3) { this.pj(p.x, p.y, p.z, this.pq, 0); return { x: this.pq[0]!, y: this.pq[1]!, w: this.pq[2]!, s: this.pq[3]! }; }

  // ------------------------------------------------------------------ painter's items
  private begin(d: number) { if (this.nit >= MAXIT) return false; this.idep[this.nit] = d; this.ist[this.nit] = this.nseg; return true; }
  private end() { this.icnt[this.nit] = this.nseg - this.ist[this.nit]!; if (this.icnt[this.nit]! > 0) this.nit++; }
  private seg(ax: number, ay: number, bx: number, by: number, w: number, r: number, g: number, b: number, a: number) {
    if (this.nseg >= MAXSEG) return;
    const o = this.nseg++ * 9, s = this.sb;
    s[o] = ax; s[o + 1] = ay; s[o + 2] = bx; s[o + 3] = by; s[o + 4] = w; s[o + 5] = r; s[o + 6] = g; s[o + 7] = b; s[o + 8] = a;
  }
  /** Bone tube with ink rails. */
  private tube(ax: number, ay: number, bx: number, by: number, w: number, sh: number, al = 1, rails = true) {
    const bone = LIN.bone;
    this.seg(ax, ay, bx, by, w, bone[0] * sh, bone[1] * sh, bone[2] * sh, al);
    if (rails && w > 2.2) {
      const dl = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / dl * (w / 2 + 0.5), ny = (bx - ax) / dl * (w / 2 + 0.5);
      const ink = LIN.ink, rw = Math.min(1.6, 0.9 + w * 0.05);
      this.seg(ax + nx, ay + ny, bx + nx, by + ny, rw, ink[0], ink[1], ink[2], 0.92 * al);
      this.seg(ax - nx, ay - ny, bx - nx, by - ny, rw, ink[0], ink[1], ink[2], 0.92 * al);
    }
  }
  private flush() {
    const n = this.nit, L = this.L;
    L.clear();
    if (n === 0) return;
    let d0 = Infinity, d1 = -Infinity;
    for (let i = 0; i < n; i++) { const d = this.idep[i]!; if (d < d0) d0 = d; if (d > d1) d1 = d; }
    const NB = 4096, kq = (NB - 1) / Math.max(1e-6, d1 - d0), bk = this.bucket;
    bk.fill(0);
    for (let i = 0; i < n; i++) bk[NB - 1 - Math.floor((this.idep[i]! - d0) * kq)]!++;
    let acc = 0;
    for (let b = 0; b < NB; b++) { const c = bk[b]!; bk[b] = acc; acc += c; }
    for (let i = 0; i < n; i++) { const b = NB - 1 - Math.floor((this.idep[i]! - d0) * kq); this.ord[bk[b]!++] = i; }
    const s = this.sb;
    for (let r = 0; r < n; r++) {
      const it = this.ord[r]!, st = this.ist[it]!, cnt = this.icnt[it]!;
      for (let q = 0; q < cnt; q++) {
        const o = (st + q) * 9;
        L.seg(s[o]!, s[o + 1]!, 0, s[o + 2]!, s[o + 3]!, 0, s[o + 4]!, s[o + 5]!, s[o + 6]!, s[o + 7]!, s[o + 8]!);
      }
    }
  }

  // ------------------------------------------------------------------ drawing
  private fogRef = 100;
  /** The match cut's isolation: at first only the hero loop and its stalk are lit; the field fades in. */
  private presG = 1;

  private fog(w: number) { return lerp(1, 0.2, smoothstep(this.fogRef * 0.85, this.fogRef * 2.8, w)); }
  private shadeDir(dx: number, dy: number, dz: number) {
    const l = Math.hypot(dx, dy, dz) || 1, c = (dx * this.light.x + dy * this.light.y + dz * this.light.z) / l;
    return 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - c * c));
  }

  private drawChunks() {
    const ch = this.ch, X = this.sx;
    const tmp = new Float32Array(4), tw = new Float32Array(3);
    for (const k of ch.chunks) {
      const mid = (k.bp0 + k.bp1) >> 1;
      this.xf(ch.C, mid, ch.loopOf[mid]!, ch.uOf[mid]!, tw, 0);
      if (!this.pj(tw[0]!, tw[1]!, tw[2]!, tmp, 0)) continue;
      const s = tmp[3]!, rad = (k.nuc >= 0 ? 7 : (k.bp1 - k.bp0) * 0.2 + 3) * s + 30;
      if (tmp[0]! < -rad || tmp[0]! > W + rad || tmp[1]! < -rad || tmp[1]! > H + rad) continue;
      const pr = k.loop === this.hero || k.loop === STALK ? 1 : this.presG;
      if (pr < 0.02) continue;
      const wpx = 2 * s, dim = (k.loop < 0 ? this.linkDim : 1) * pr;
      const i0 = k.bp0, i1 = Math.min(ch.nbp - 1, k.bp1);
      const n = i1 - i0 + 1;
      if (wpx < 5) {
        const step = Math.max(2, Math.ceil(5 / (BDNA.rise * s)));
        let prevOk = false, pxp = 0, pyp = 0, pwp = 0, wxp = 0, wyp = 0, wzp = 0, started = false;
        for (let i = i0; i <= i1; i = i === i1 ? i1 + 1 : Math.min(i1, i + step)) {
          this.xf(ch.C, i, ch.loopOf[i]!, ch.uOf[i]!, tw, 0);
          const ok = this.pj(tw[0]!, tw[1]!, tw[2]!, tmp, 0);
          if (ok && prevOk) {
            if (!started) { if (!this.begin((tmp[2]! + pwp) / 2)) return; started = true; }
            const sh = this.shadeDir(tw[0]! - wxp, tw[1]! - wyp, tw[2]! - wzp) * this.fog(tmp[2]!) * dim;
            this.tube(pxp, pyp, tmp[0]!, tmp[1]!, Math.max(1.1, wpx * 0.95 * lerp(0.75, 1, dim)), sh, 1, wpx > 2.3);
          }
          prevOk = ok; pxp = tmp[0]!; pyp = tmp[1]!; pwp = tmp[2]!; wxp = tw[0]!; wyp = tw[1]!; wzp = tw[2]!;
        }
        if (started) this.end();
        continue;
      }
      for (let j = 0; j < n; j++) {
        const i = i0 + j, lp = ch.loopOf[i]!, u = ch.uOf[i]!;
        this.xf(ch.A, i, lp, u, X, j * 9); this.xf(ch.B, i, lp, u, X, j * 9 + 3); this.xf(ch.C, i, lp, u, X, j * 9 + 6);
      }
      this.drawStrands(i0, n, wpx, dim);
    }
  }

  /** Strands (+ rungs) of base pairs i0..i0+n-1, already folded into this.sx. */
  private pa = new Float32Array(420 * 4); private pb = new Float32Array(420 * 4);
  private drawStrands(i0: number, n: number, wpx: number, dim: number) {
    const X = this.sx, pa = this.pa, pb = this.pb;
    for (let j = 0; j < n; j++) {
      this.pj(X[j * 9]!, X[j * 9 + 1]!, X[j * 9 + 2]!, pa, j * 4);
      this.pj(X[j * 9 + 3]!, X[j * 9 + 4]!, X[j * 9 + 5]!, pb, j * 4);
    }
    const full = wpx >= 11;
    const tmp = this.pq;
    for (const strand of [0, 3]) {
      const pp = strand === 0 ? pa : pb;
      for (let j = 0; j < n - 1; j++) {
        const o0 = j * 9 + strand, o1 = (j + 1) * 9 + strand;
        if (pp[j * 4 + 2]! < 0.5 || pp[(j + 1) * 4 + 2]! < 0.5) continue;
        const segPx = Math.hypot(pp[(j + 1) * 4]! - pp[j * 4]!, pp[(j + 1) * 4 + 1]! - pp[j * 4 + 1]!);
        const sub = full ? Math.max(1, Math.min(4, Math.ceil(segPx / 10))) : 1;
        let ax = pp[j * 4]!, ay = pp[j * 4 + 1]!, aw = pp[j * 4 + 2]!;
        let wx0 = X[o0]!, wy0 = X[o0 + 1]!, wz0 = X[o0 + 2]!;
        for (let q = 1; q <= sub; q++) {
          let bx: number, by: number, bw: number, wx1: number, wy1: number, wz1: number, sp: number;
          if (q === sub) { bx = pp[(j + 1) * 4]!; by = pp[(j + 1) * 4 + 1]!; bw = pp[(j + 1) * 4 + 2]!; sp = pp[(j + 1) * 4 + 3]!; wx1 = X[o1]!; wy1 = X[o1 + 1]!; wz1 = X[o1 + 2]!; }
          else {
            const u = q / sub;
            const c0x = X[j * 9 + 6]!, c0y = X[j * 9 + 7]!, c0z = X[j * 9 + 8]!, c1x = X[(j + 1) * 9 + 6]!, c1y = X[(j + 1) * 9 + 7]!, c1z = X[(j + 1) * 9 + 8]!;
            const rax = X[o0]! - c0x, ray = X[o0 + 1]! - c0y, raz = X[o0 + 2]! - c0z, rbx = X[o1]! - c1x, rby = X[o1 + 1]! - c1y, rbz = X[o1 + 2]! - c1z;
            const la = Math.hypot(rax, ray, raz) || 1, lb = Math.hypot(rbx, rby, rbz) || 1;
            const d = clamp((rax * rbx + ray * rby + raz * rbz) / (la * lb), -1, 1), ang = Math.acos(d);
            let rx: number, ry: number, rz: number;
            if (ang > 1e-4) { const sa = Math.sin((1 - u) * ang) / Math.sin(ang), sbb = Math.sin(u * ang) / Math.sin(ang); rx = rax / la * sa + rbx / lb * sbb; ry = ray / la * sa + rby / lb * sbb; rz = raz / la * sa + rbz / lb * sbb; }
            else { rx = rax / la; ry = ray / la; rz = raz / la; }
            const len = lerp(la, lb, u), rl = Math.hypot(rx, ry, rz) || 1;
            wx1 = lerp(c0x, c1x, u) + rx / rl * len; wy1 = lerp(c0y, c1y, u) + ry / rl * len; wz1 = lerp(c0z, c1z, u) + rz / rl * len;
            this.pj(wx1, wy1, wz1, tmp, 0); bx = tmp[0]!; by = tmp[1]!; bw = tmp[2]!; sp = tmp[3]!;
          }
          const sh = this.shadeDir(wx1 - wx0, wy1 - wy0, wz1 - wz0) * this.fog((aw + bw) / 2) * dim;
          if (this.begin((aw + bw) / 2)) { this.tube(ax, ay, bx, by, Math.max(1.2, TUBE * sp * (full ? 1 : 1.15)), sh); this.end(); }
          ax = bx; ay = by; aw = bw; wx0 = wx1; wy0 = wy1; wz0 = wz1;
        }
      }
    }
    const bone = LIN.bone;
    if (!full && wpx < 7) return;
    const every = full ? 1 : 2;
    for (let j = 0; j < n - 1; j += every) {
      const i = i0 + j;
      const ax = pa[j * 4]!, ay = pa[j * 4 + 1]!, bx = pb[j * 4]!, by = pb[j * 4 + 1]!;
      if (pa[j * 4 + 2]! < 0.5 || pb[j * 4 + 2]! < 0.5) continue;
      const d = (pa[j * 4 + 2]! + pb[j * 4 + 2]!) / 2, s = (pa[j * 4 + 3]! + pb[j * 4 + 3]!) / 2;
      const sepK = this.sepAt(i);
      const gap = lerp(0.08, 0.5, clamp(sepK));
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const hax = lerp(ax, mx, 1 - gap), hay = lerp(ay, my, 1 - gap), hbx = lerp(bx, mx, 1 - gap), hby = lerp(by, my, 1 - gap);
      const sh = 0.72 * this.fog(d) * dim, w = Math.max(1.1, 0.16 * s);
      if (!this.begin(d + 0.05)) return;
      if (!full) {
        this.seg(ax, ay, hax, hay, w, bone[0] * sh * 0.8, bone[1] * sh * 0.8, bone[2] * sh * 0.8, 0.8);
        this.seg(bx, by, hbx, hby, w, bone[0] * sh * 0.7, bone[1] * sh * 0.7, bone[2] * sh * 0.7, 0.8);
      } else {
        this.seg(ax, ay, hax, hay, w, bone[0] * sh, bone[1] * sh, bone[2] * sh, 1);
        this.seg(bx, by, hbx, hby, w, bone[0] * sh * 0.86, bone[1] * sh * 0.86, bone[2] * sh * 0.86, 1);
        const len = Math.hypot(bx - ax, by - ay);
        if (sepK < 0.5 && len > 16) {
          const nH = this.ch.base[i]! < 2 ? 2 : 3; // A·T two, G·C three
          const rx = hbx - hax, ry = hby - hay, rl = Math.hypot(rx, ry) || 1, nx = -ry / rl, ny = rx / rl;
          const tl = w * 0.9, ta = (1 - sepK * 2) * 0.9;
          for (let q = 0; q < nH; q++) {
            const u = (q + 1) / (nH + 1), cx = lerp(hax, hbx, u), cy = lerp(hay, hby, u);
            this.seg(cx - nx * tl, cy - ny * tl, cx + nx * tl, cy + ny * tl, 1.1, bone[0] * sh, bone[1] * sh, bone[2] * sh, ta);
          }
        }
      }
      this.end();
    }
  }
  private sepAt(i: number) {
    const s = this.ss;
    if (!s || s.open <= 0 || i < this.r0 || i >= this.r1) return 0;
    return this.bubble(i, s.ip, s.open);
  }
  ss: { slide: number; iT: number; ip: number; open: number } | null = null;

  /** Fill a convex screen polygon (x,y pairs) with scanline capsules inset so no cap leaves it. */
  private fillConvex(p: Float32Array, n: number, wMax: number, r: number, g: number, b: number, a: number) {
    // major axis: the farthest pair among a few candidates
    let bi = 0, bj = 0, bd = -1;
    const stp = Math.max(1, Math.floor(n / 12));
    for (let i = 0; i < n; i += stp) for (let j = i + stp; j < n; j += stp) {
      const d = (p[i * 2]! - p[j * 2]!) ** 2 + (p[i * 2 + 1]! - p[j * 2 + 1]!) ** 2;
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
    if (bd <= 0) return;
    const L = Math.sqrt(bd), dx = (p[bj * 2]! - p[bi * 2]!) / L, dy = (p[bj * 2 + 1]! - p[bi * 2 + 1]!) / L, ex = -dy, ey = dx;
    let e0 = Infinity, e1 = -Infinity;
    for (let i = 0; i < n; i++) { const e = p[i * 2]! * ex + p[i * 2 + 1]! * ey; if (e < e0) e0 = e; if (e > e1) e1 = e; }
    const span = e1 - e0;
    if (span < 0.5) return;
    const ns = Math.max(1, Math.ceil(span / wMax)), ws = span / ns;
    for (let k = 0; k < ns; k++) {
      const ek = e0 + (k + 0.5) * ws;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ai = p[i * 2]! * ex + p[i * 2 + 1]! * ey - ek, aj = p[j * 2]! * ex + p[j * 2 + 1]! * ey - ek;
        if ((ai <= 0) !== (aj <= 0)) {
          const u = ai / (ai - aj);
          const x = lerp(p[i * 2]!, p[j * 2]!, u), y = lerp(p[i * 2 + 1]!, p[j * 2 + 1]!, u);
          const d = x * dx + y * dy;
          if (d < lo) lo = d; if (d > hi) hi = d;
        }
      }
      if (!(hi > lo)) continue;
      const wv = ws + 0.7, inset = Math.min(wv / 2, (hi - lo) / 2 - 0.01);
      const a0 = lo + inset, a1 = hi - inset;
      this.seg(a0 * dx + ek * ex, a0 * dy + ek * ey, a1 * dx + ek * ex, a1 * dy + ek * ey, wv, r, g, b, a);
    }
  }

  /** Histone octamer discs: engraved cylinders (front of the band, the visible face, outlines). */
  private drawDiscs() {
    const ch = this.ch, tmp = this.pq;
    const bone = LIN.bone, ink = LIN.ink;
    const rt = this.rt, rb = this.rb, front = this.fr, shd = this.shd, poly = this.poly;
    for (let qi = 0; qi < ch.nucs.length; qi++) {
      const q = ch.nucs[qi]!;
      const off = this.nucOff.get(qi);
      const c = this.rotP(off ? q.c.clone().add(off) : q.c, q.loop, q.uu);
      if (!this.pj(c.x, c.y, c.z, tmp, 0)) continue;
      const s = tmp[3]!, rpx = CORE_R * s, depth = tmp[2]!;
      if (tmp[0]! < -rpx * 2 - 20 || tmp[0]! > W + rpx * 2 + 20 || tmp[1]! < -rpx * 2 - 20 || tmp[1]! > H + rpx * 2 + 20) continue;
      if (rpx < 0.8) continue;
      const n = this.rotD(q.n, q.loop, q.uu), u = this.rotD(q.u, q.loop, q.uu), v = this.rotD(q.v, q.loop, q.uu);
      const sg = n.x * (this.camP.x - c.x) + n.y * (this.camP.y - c.y) + n.z * (this.camP.z - c.z) >= 0 ? 1 : -1;
      const Kn = Math.max(10, Math.min(360, Math.round((Math.PI * 2 * rpx) / 4.5)));
      const ftx = c.x + n.x * sg * CORE_HH, fty = c.y + n.y * sg * CORE_HH, ftz = c.z + n.z * sg * CORE_HH;
      const fbx = c.x - n.x * sg * CORE_HH, fby = c.y - n.y * sg * CORE_HH, fbz = c.z - n.z * sg * CORE_HH;
      const fg = this.fog(depth) * (q.loop < 0 ? this.linkDim : 1) * (q.loop === this.hero || q.loop === STALK ? 1 : this.presG);
      if (fg < 0.02) continue;
      for (let k = 0; k < Kn; k++) {
        const a = (k / Kn) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const rx = u.x * ca + v.x * sa, ry = u.y * ca + v.y * sa, rz = u.z * ca + v.z * sa;
        const px = ftx + rx * CORE_R, py = fty + ry * CORE_R, pz = ftz + rz * CORE_R;
        this.pj(px, py, pz, rt, k * 4);
        this.pj(fbx + rx * CORE_R, fby + ry * CORE_R, fbz + rz * CORE_R, rb, k * 4);
        front[k] = rx * (this.camP.x - px) + ry * (this.camP.y - py) + rz * (this.camP.z - pz) > 0 ? 1 : 0;
        const lam = rx * this.light.x + ry * this.light.y + rz * this.light.z;
        shd[k] = (0.22 + 0.78 * Math.max(0, lam) ** 0.85) * fg;
      }
      if (!this.begin(depth)) return;
      // side band: generators on the front half (their bottom caps pulled inside the rim)
      const hatchStep = Math.max(1, Math.round(7 / Math.max(0.5, (Math.PI * 2 * rpx) / Kn)));
      for (let k = 0; k < Kn; k++) {
        if (!front[k]) continue;
        const k2 = (k + 1) % Kn;
        const gw = Math.hypot(rt[k2 * 4]! - rt[k * 4]!, rt[k2 * 4 + 1]! - rt[k * 4 + 1]!) + 1.0;
        const sh = shd[k]!;
        let mx0 = (rb[k * 4]! + rb[k2 * 4]!) / 2, my0 = (rb[k * 4 + 1]! + rb[k2 * 4 + 1]!) / 2;
        const mx1 = (rt[k * 4]! + rt[k2 * 4]!) / 2, my1 = (rt[k * 4 + 1]! + rt[k2 * 4 + 1]!) / 2;
        const gl = Math.hypot(mx1 - mx0, my1 - my0);
        if (gl > gw) { const f = (gw / 2) / gl; mx0 += (mx1 - mx0) * f; my0 += (my1 - my0) * f; }
        this.seg(mx0, my0, mx1, my1, gw, bone[0] * sh, bone[1] * sh, bone[2] * sh, 1);
        if (rpx > 10 && k % hatchStep === 0 && sh < 0.55 * fg) this.seg(mx0, my0, mx1, my1, 1, ink[0], ink[1], ink[2], 0.7 * smoothstep(0.55, 0.2, sh / fg));
      }
      // the visible face
      const lamF = sg * (n.x * this.light.x + n.y * this.light.y + n.z * this.light.z);
      const shF = (0.3 + 0.7 * Math.max(0, lamF) ** 0.9) * fg;
      for (let k = 0; k < Kn; k++) { poly[k * 2] = rt[k * 4]!; poly[k * 2 + 1] = rt[k * 4 + 1]!; }
      this.fillConvex(poly, Kn, rpx > 30 ? 4 : 3, bone[0] * shF, bone[1] * shF, bone[2] * shF, 1);
      // outlines: face rim, the front half of the far rim, the two silhouette generators
      const rimW = Math.min(1.8, 0.9 + rpx * 0.03);
      for (let k = 0; k < Kn; k++) {
        const k2 = (k + 1) % Kn;
        this.seg(rt[k * 4]!, rt[k * 4 + 1]!, rt[k2 * 4]!, rt[k2 * 4 + 1]!, rimW, ink[0], ink[1], ink[2], 0.95);
        if (front[k] && front[k2]) this.seg(rb[k * 4]!, rb[k * 4 + 1]!, rb[k2 * 4]!, rb[k2 * 4 + 1]!, rimW, ink[0], ink[1], ink[2], 0.95);
        if (front[k] !== front[k2]) this.seg(rb[k2 * 4]!, rb[k2 * 4 + 1]!, rt[k2 * 4]!, rt[k2 * 4 + 1]!, rimW, ink[0], ink[1], ink[2], 0.95);
      }
      if (rpx > 14) {
        this.pj(ftx, fty, ftz, tmp, 0);
        const cx = tmp[0]!, cy = tmp[1]!, ir = 0.58;
        for (let k = 0; k < Kn; k++) {
          const k2 = (k + 1) % Kn;
          this.seg(lerp(cx, rt[k * 4]!, ir), lerp(cy, rt[k * 4 + 1]!, ir), lerp(cx, rt[k2 * 4]!, ir), lerp(cy, rt[k2 * 4 + 1]!, ir), 1, ink[0], ink[1], ink[2], 0.3);
        }
      }
      this.end();
    }
  }

  /** The RNA strand (thin bone tube with base stubs). Returns the projected nucleotides for the letters. */
  private drawRNA(): { x: number; y: number; s: number; w: number; base: string; sx: number; sy: number }[] {
    const outp: { x: number; y: number; s: number; w: number; base: string; sx: number; sy: number }[] = [];
    const R = this.rna;
    if (R.length < 2) return outp;
    const tmp = new Float32Array(4), t2 = new Float32Array(4);
    let prev: { x: number; y: number; w: number; s: number } | null = null, pw: V3 | null = null;
    const bone = LIN.bone;
    R.forEach((nt, j) => {
      if (!this.pj(nt.p.x, nt.p.y, nt.p.z, tmp, 0)) { prev = null; return; }
      const cur = { x: tmp[0]!, y: tmp[1]!, w: tmp[2]!, s: tmp[3]! };
      const e = nt.p.clone().add(nt.stub);
      this.pj(e.x, e.y, e.z, t2, 0);
      const sh = this.fog(cur.w);
      if (this.begin(cur.w - 0.3)) {
        if (prev && pw) this.tube(prev.x, prev.y, cur.x, cur.y, Math.max(1.3, 0.32 * cur.s), this.shadeDir(nt.p.x - pw.x, nt.p.y - pw.y, nt.p.z - pw.z) * sh);
        this.seg(cur.x, cur.y, t2[0]!, t2[1]!, Math.max(1.1, 0.2 * cur.s), bone[0] * 0.85 * sh, bone[1] * 0.85 * sh, bone[2] * 0.85 * sh, 1);
        this.end();
      }
      const b = this.ch.base[Math.min(this.ch.nbp - 1, this.iT + j)]!;
      outp.push({ x: cur.x, y: cur.y, s: cur.s, w: cur.w, base: RNA_CODE[b]!, sx: t2[0]!, sy: t2[1]! });
      prev = cur; pw = nt.p;
    });
    return outp;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    this.updateSite(t);
    const sh = this.shot(t);
    this.setCam(sh);
    this.foldState(t);
    this.linkDim = lerp(1, 0.42, smoothstep(0.35, 1, prog(t, this.tPull, this.tSettle)));
    this.presG = prog(t, this.tS + 0.3, this.tS + 0.9, ease.inOutQuad);
    this.bg.render(renderer, out);
    this.nseg = 0; this.nit = 0;
    this.fogRef = sh.fogRef ?? sh.pos.distanceTo(sh.tgt);
    this.drawChunks();
    this.drawDiscs();
    const rnaPts = this.drawRNA();
    this.flush();
    this.L.render(renderer, out);
    this.drawText(t, rnaPts);
    comp.draw(renderer, this.text.upload(), out);
    const kick = f.a.kick ?? 0;
    return { bloom: 0.35, bloomThreshold: 0.92, ca: 0, vignette: 0.45, zoom: 1 + 0.004 * kick };
  }

  private drawText(t: number, rnaPts: ReturnType<DnaStack['drawRNA']>) {
    const c = this.text.ctx;
    this.text.clear();
    const l1 = this.l1, l2 = this.l2;
    const a1 = 1 - prog(t, l1.end + 0.08, l1.end + 0.3);
    karaokeRow(c, l1.words.slice(0, 1), 116, 800, F.archivo(100, 700), 70, t, a1);
    karaokeRow(c, l1.words.slice(1, 2), 104, 962, F.archivo(112.5, 900), 184, t, a1);
    karaokeRow(c, l1.words.slice(2), 1804, 800, F.archivo(100, 900), 104, t, a1, { align: 'right' });
    const a2 = 1 - prog(t, l2.end + 0.05, l2.end + 0.2);
    karaokeRow(c, l2.words.slice(0, 4), 116, 196, F.archivo(100, 700), 70, t, a2);
    karaokeRow(c, l2.words.slice(4), 104, 350, F.archivo(112.5, 900), 168, t, a2);
    this.rows.draw(c, t, 1, 'bone');
    // RNA letters (A U G C), when big enough to read
    if (rnaPts.length) {
      const sz = clamp(rnaPts[0]!.s * 0.95, 0, 17);
      if (sz >= 10) {
        c.font = font(F.mono(500), sz); c.textAlign = 'center'; c.textBaseline = 'middle';
        const fade = 1 - prog(t, this.tPull + 0.05, this.tPull + 0.2);
        for (const p of rnaPts) {
          const dx = p.sx - p.x, dy = p.sy - p.y, l = Math.hypot(dx, dy) || 1;
          c.fillStyle = rgba('bone', 0.9 * fade);
          c.fillText(p.base, p.sx + (dx / l) * sz * 0.8, p.sy + (dy / l) * sz * 0.8);
        }
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      }
    }
    // labels, one at a time
    const aN = window01(t, this.tBand - 0.62, this.tBand - 0.03, 0.2, 0.12);
    if (aN > 0) {
      const q = this.pjc(this.topNuc);
      monoLabel(c, 'nucleosome · ~147 bp per histone octamer', 1250, 650, q.x, q.y, aN);
    }
    const [, s2, s3] = this.snares as [number, number, number, number];
    const aP = window01(t, s2 + 0.12, s3 - 0.02, 0.2, 0.12);
    if (aP > 0) {
      const q = this.packAnchor();
      if (q) monoLabel(c, 'higher-order packing · models differ', 1250, 650, q.x, q.y, aP);
    }
    const aT = window01(t, this.tTx + 0.05, this.tPull + 0.12, 0.2, 0.12);
    if (aT > 0 && rnaPts.length) {
      const p = rnaPts[Math.floor(rnaPts.length * 0.4)]!;
      monoLabel(c, 'accessible region · transcription begins (schematic)', 1180, 984, p.x, p.y, aT);
    }
    // the focus bracket: where transcription starts
    const aB = prog(t, this.tTx, this.tTx + 0.08) * (1 - prog(t, this.tPull + 0.1, this.tSettle - 0.05));
    if (aB > 0) {
      const i = Math.min(this.ch.nbp - 1, this.iT);
      const q = this.pjc(v3(this.ch.A[i * 3]!, this.ch.A[i * 3 + 1]!, this.ch.A[i * 3 + 2]!));
      focusBracket(c, q.x, q.y, { size: 16, alpha: aB });
    }
  }
}
