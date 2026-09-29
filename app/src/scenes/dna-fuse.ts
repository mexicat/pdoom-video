// DNA edition, `fuse` slot (102.051–109.778), the tail of the quiet third chorus (docs/DNA_VIDEO_PLAN.md).
//  carry-in  "Now there’s nowhere left to go" finishes in the dark channel it was squeezed into; the
//            channel is now the interior of an axon (the cell masses’ place is taken by myelin, which
//            is itself made by cells: a graphic match, not a causal one). The empty bracket waits
//            on the same line, where paperclips and hook3 left it.
//  "Too late now, we lit the fuse": a schematic longitudinal section of a myelinated axon — compact
//      myelin lamellae, paranodal loops, Schwann-cell nuclei, bare nodes of Ranvier with their Na⁺
//      channels. On the musical accents (snares and the stronger kicks) the action potential is
//      regenerated node by node: each node flashes signal orange, a local current runs ahead inside
//      the axon to the next node, and a V(x) trace above the axon draws the travelling spike. No
//      bead flies along the nerve; the orange marks activity. The fourth node fires inside the empty
//      bracket: it closes around it and gains its dot — a new subject (motif step "Resume").
//  "Orthogonality thesis blues" (poetic accompaniment, no label): the camera reframes on each accent
//      so the bracket stays on the event as it jumps node to node.
//  music: the wave reaches the terminal; the frame opens on the synaptic gap (a vertical dark
//      channel after all the horizontal ones); vesicles release on the kick. Then everything but the
//      axon’s contour dims: a stalk ending in a loop (the bouton), for the match cut to a chromatin
//      loop in `stack`.
// Pure function of song time.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, hash, keys, lerp, prog, smoothstep, window01, type Key } from '../engine/util';
import { focusBracket, karaokeRow, monoLabel } from './dna-kit';
import { CAP, inkBackdrop } from './dna-hook-type';
import {
  AX, BONE, EMB, GRAPH, INK, SIG, apWave, axonR, drawAxon, drawSchwannNucleus, drawSheath, drawSynapse, sxOf, syOf, terminalAt,
  type Terminal, type View,
} from './dna-fuse-axon';

const CY = 591; // the channel line (paperclips' dark channel, the bracket's line)
const BRX = 1476; // the bracket's column (hook3 → paperclips → here)
const Z0 = 44 / AX.ra; // the axon interior matches paperclips' final channel (88 px)
const RES = 3; // the 4th firing happens inside the bracket
type RGB = [number, number, number];
const sc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export default class DnaFuse extends Scene {
  bg = inkBackdrop();
  L = new LineBatch(48000, { screen2D: true, blend: 'normal' });
  G = new LineBatch(6000, { screen2D: true, blend: 'add' });
  text = new Layer2D();

  tS = 0; tEnd = 0;
  lCarry!: Line; lF!: Line; lO!: Line;
  fires: number[] = []; // firing times of nodes 0..n-1 (node RES sits under the bracket at world x = 0)
  nodeX: number[] = [];
  T!: Terminal;
  tHemi = 0; tBouton = 0; tRel = 0; tSyn0 = 0; tSyn1 = 0; tEnd0 = 0;
  kCx: Key[] = []; kZ: Key[] = []; kAx: Key[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.tS = this.ctx.start; this.tEnd = this.ctx.end;
    this.lCarry = ly.get('nowhere left');
    this.lF = ly.get('Too late now');
    this.lO = ly.get('Orthogonality');
    // accents after the carried line: every snare and the stronger kicks, at least 0.3 s apart
    const t0 = this.lCarry.end, t1 = this.lO.end - 0.3;
    const ev = [...au.events('snare', t0, t1), ...au.events('kick', t0, t1).filter(([, s]) => s >= 0.2)].map(([tt]) => tt).sort((a, b) => a - b);
    for (const tt of ev) if (!this.fires.length || tt - this.fires[this.fires.length - 1]! >= 0.3) this.fires.push(tt);
    if (this.fires.length < RES + 2) {
      // fallback: the beat grid
      this.fires = [];
      for (let b = Math.ceil(au.beatAt(t0)); au.timeOfBeat(b) < t1; b++) this.fires.push(au.timeOfBeat(b));
    }
    this.nodeX = this.fires.map((_, k) => (k - RES) * AX.lint);
    const nL = this.fires.length - 1, tL = this.fires[nL]!;
    this.T = terminalAt(this.nodeX[nL]!);
    this.tHemi = tL + 0.42;
    this.tBouton = this.tHemi + 0.32;
    const kAfter = au.events('kick', this.tBouton + 0.2, this.tEnd - 0.25).filter(([, s]) => s >= 0.2);
    this.tRel = kAfter.length ? kAfter[0]![0] : au.timeOfBeat(Math.ceil(au.beatAt(this.tBouton + 0.3)));
    this.tSyn0 = tL + 0.12; this.tSyn1 = tL + 0.8;
    this.tEnd0 = this.tEnd - 0.36;

    // camera: holds while the first nodes fire, then reframes on each accent so the new node lands in the bracket
    const io = ease.inOutCubic;
    this.kCx = [[this.tS, 0]];
    for (let k = RES + 1; k <= nL; k++) {
      const tf = this.fires[k]!;
      this.kCx.push([tf - 0.3, this.nodeX[k - 1]!], [tf - 0.02, this.nodeX[k]!, io]);
    }
    const T = this.T;
    // the synapse opens the frame, then the bouton's contour is centred for the match cut
    this.kCx.push([this.tSyn0, this.nodeX[nL]!], [this.tSyn1, T.xCleft - 60, io], [this.tEnd0, T.xCleft - 64], [this.tEnd, T.bx, io]);
    this.kZ = [[this.tS, Z0], [this.tSyn0, Z0], [this.tSyn1, 1.55, io], [this.tEnd0, 1.58], [this.tEnd, 2.3, io]];
    this.kAx = [[this.tS, BRX], [this.tSyn0, BRX], [this.tSyn1, 1060, io], [this.tEnd0, 1056], [this.tEnd, 960, io]];
  }

  private view(t: number): View {
    return { cx: keys(t, this.kCx), ax: keys(t, this.kAx), ay: CY, z: keys(t, this.kZ) };
  }
  /** Firing envelope of a node: a fast rise, then decay. */
  private flash(t: number, tf: number) {
    if (t < tf) return 0;
    return Math.min(1, (t - tf) / 0.02) * Math.pow(0.5, (t - tf) / 0.2);
  }
  /** Index of the last node fired by t (-1 before the first). */
  private active(t: number) {
    let k = -1;
    for (let i = 0; i < this.fires.length; i++) if (t >= this.fires[i]!) k = i;
    return k;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t, T = this.T;
    const v = this.view(t);
    this.bg.render(renderer, out);
    const L = this.L, G = this.G;
    L.clear(); G.clear();

    // visible world range
    const wx0 = v.cx + (-40 - v.ax) / v.z, wx1 = v.cx + (1960 - v.ax) / v.z;
    const endK = smoothstep(this.tEnd0, this.tEnd - 0.12, t); // the ending: all but the contour dims
    const aSheath = 1 - endK;

    const xs = this.nodeX, lint = AX.lint, g2 = AX.gap / 2;
    // ---- the rest of the fascicle: parallel fibres above and below, bright at the cut (they take the
    //      place of paperclips' cell masses), then the light isolates the one axon
    const aNb = 0.95 * (1 - prog(t, this.tS + 0.1, this.tS + 0.9, ease.inOutCubic));
    if (aNb > 0.01) {
      const far = terminalAt(1e7), pitch = 2 * (AX.ra + AX.my) + 20;
      for (const k of [-4, -3, -2, -1, 1, 2, 3]) {
        const vk: View = { ...v, ay: CY + k * pitch * v.z };
        if (Math.abs(vk.ay - 540) > 540 + (AX.ra + AX.my) * v.z + 30) continue;
        const ph = (hash(k, 71) - 0.5) * lint;
        const nk: number[] = [];
        for (let x = Math.floor((wx0 - ph) / lint) * lint + ph; x <= wx1 + lint; x += lint) nk.push(x);
        for (let i = 0; i + 1 < nk.length; i++) {
          for (const s of [-1, 1]) drawSheath(L, vk, nk[i]! + g2, nk[i + 1]! - g2, s, aNb, 0.9);
          drawSchwannNucleus(L, vk, (nk[i]! + nk[i + 1]!) / 2, (i + k) % 2 === 0 ? -1 : 1, i * 5 + k * 13 + 40, aNb);
        }
        drawAxon(L, vk, wx0, wx1, nk, far, aNb, 0.5);
      }
    }
    // ---- myelin: every internode (Schwann cell) in view; nodes left of the first firing continue off-frame
    const allNodes: number[] = [];
    for (let x = xs[0]! - 3 * lint; x <= xs[xs.length - 1]! + 1e-3; x += lint) allNodes.push(x);
    for (let i = 0; i < allNodes.length; i++) {
      const xa = allNodes[i]! + g2, xb = i + 1 < allNodes.length ? allNodes[i + 1]! - g2 : T.xHemi;
      if (xb < wx0 || xa > wx1) continue;
      for (const s of [-1, 1]) drawSheath(L, v, xa, xb, s, aSheath);
      drawSchwannNucleus(L, v, (xa + xb) / 2, i % 2 === 0 ? -1 : 1, i * 7 + 3, aSheath);
    }
    // ---- the axon membrane, Na⁺ channels, neurofilaments; the terminal and synapse
    drawAxon(L, v, Math.max(wx0, allNodes[0]! - lint), Math.min(wx1, T.xCleft), allNodes, T, 1, 1 - endK, endK);
    const aPost = smoothstep(this.tSyn0 + 0.1, this.tSyn1, t) * (1 - endK);
    if (T.bx - T.br < wx1) drawSynapse(L, v, T, t, this.tRel, 1 - endK, aPost);

    // ---- activity (additive): nodes flash on their accents, local currents run ahead inside the axon
    const ra = AX.ra;
    const hot = (k: number): RGB => sc(SIG, k);
    const nodeFlash = (xn: number, I: number) => {
      if (I <= 0.003) return;
      const X = sxOf(v, xn), yT = syOf(v, -ra), yB = syOf(v, ra), w = AX.gap * v.z;
      G.seg2(X - w / 2, yT, X + w / 2, yT, 5 * v.z, hot(2.6 * I), 1);
      G.seg2(X - w / 2, yB, X + w / 2, yB, 5 * v.z, hot(2.6 * I), 1);
      G.seg2(X, yT, X, yB, w * 1.1, hot(0.5 * I), 0.9);
      G.seg2(X, yT + 4, X, yB - 4, 60 * v.z, sc(SIG, 0.16 * I), 1);
    };
    this.fires.forEach((tf, k) => nodeFlash(xs[k]!, this.flash(t, tf)));
    nodeFlash(T.xHemi, this.flash(t, this.tHemi));
    // local current: a dashed arc inside the axon from the node that fired toward the next one
    const ka = this.active(t);
    if (ka >= 0 && t < this.tHemi + 0.2) {
      const x0 = xs[ka]!, x1 = ka + 1 < xs.length ? xs[ka + 1]! : T.xHemi;
      const tf = this.fires[ka]!, tn = ka + 1 < this.fires.length ? this.fires[ka + 1]! : this.tHemi;
      const grow = prog(t, tf + 0.02, tf + 0.2, ease.outCubic), fade = 1 - prog(t, tn - 0.05, tn + 0.05);
      const aa = grow > 0 ? fade * 0.9 : 0;
      if (aa > 0.01) {
        const n = 28;
        for (let j = 0; j < n; j++) {
          const u0 = j / n, u1 = (j + 0.55) / n;
          if (u0 > grow) break;
          const P = (u: number) => [sxOf(v, lerp(x0, x1, u)), syOf(v, ra * 0.42 - Math.sin(Math.PI * u) * ra * 0.25)] as const;
          const [ax_, ay_] = P(u0), [bx_, by_] = P(Math.min(u1, grow));
          G.seg2(ax_, ay_, bx_, by_, 1.8 * v.z, sc(EMB, 0.9), aa);
        }
        // arrowhead at the front
        const [hx, hy] = [sxOf(v, lerp(x0, x1, grow)), syOf(v, ra * 0.42 - Math.sin(Math.PI * grow) * ra * 0.25)];
        G.seg2(hx, hy, hx - 9 * v.z, hy - 5 * v.z, 1.8 * v.z, sc(EMB, 0.9), aa);
        G.seg2(hx, hy, hx - 9 * v.z, hy + 5 * v.z, 1.8 * v.z, sc(EMB, 0.9), aa);
      }
    }
    // the unmyelinated terminal conducts continuously: a travelling front from the heminode to the bouton
    const fr = prog(t, this.tHemi, this.tBouton, ease.inOutQuad);
    if (fr > 0 && fr < 1.2 && t < this.tEnd0) {
      const xf = lerp(T.xHemi, T.xCleft, fr);
      for (let x = T.xHemi; x < xf; x += 10) {
        const r = axonR(x, T), k = Math.exp(-(xf - x) / 70);
        if (r <= 0) continue;
        G.seg2(sxOf(v, x), syOf(v, -r), sxOf(v, x + 10), syOf(v, -axonR(x + 10, T) || -r), 3.5 * v.z, hot(1.6 * k), 1);
        G.seg2(sxOf(v, x), syOf(v, r), sxOf(v, x + 10), syOf(v, axonR(x + 10, T) || r), 3.5 * v.z, hot(1.6 * k), 1);
      }
    }
    // release: transmitter crosses the cleft on the kick
    const rel = t - this.tRel;
    if (rel > 0 && rel < 0.6 && endK < 1) {
      for (let k = 0; k < 26; k++) {
        const y = ((k * 37) % 120) - 60 + ((k * 13) % 7), u = clamp((rel - (k % 5) * 0.02) / 0.3);
        if (u <= 0) continue;
        const x = T.xCleft + 2 + u * (T.cleft - 4);
        G.seg2(sxOf(v, x), syOf(v, y), sxOf(v, x) + 0.01, syOf(v, y), 3.2 * v.z, hot(1.4 * (1 - rel / 0.6) * (1 - endK)), 1);
      }
    }

    // ---- the travelling spike: V(x) above the axon (stylized)
    const aTr = window01(t, this.fires[0]! - 0.3, this.tSyn0 + 0.45, 0.3, 0.3);
    const yb = 420, amp = 150;
    const V = (x: number) => {
      let s = 0;
      this.fires.forEach((tf, k) => {
        const A = apWave(t - tf);
        if (A === 0) return;
        const d = x - xs[k]!;
        s += A * (0.78 * Math.exp(-((d / 64) ** 2)) + 0.22 * Math.exp(-Math.abs(d) / (1.1 * lint)));
      });
      return s;
    };
    if (aTr > 0.01) {
      let px = -10, pv = V(v.cx + (px - v.ax) / v.z);
      for (let x = 0; x <= 1930; x += 6) {
        const val = V(v.cx + (x - v.ax) / v.z);
        const y0 = yb - pv * amp, y1 = yb - val * amp, m = Math.max(pv, val);
        L.seg2(px, y0, x, y1, 1.6, sc(BONE, 0.85), aTr);
        if (m > 0.08) G.seg2(px, y0, x, y1, 2.4, hot(2.2 * smoothstep(0.08, 0.6, m)), aTr);
        px = x; pv = val;
      }
      for (let x = 0; x < 1920; x += 18) L.seg2(x, yb, x + 7, yb, 1, sc(GRAPH, 1.2), aTr * 0.8);
    }
    L.render(renderer, out);
    G.render(renderer, out);

    // ---- type, labels, bracket
    const c = this.text.ctx;
    this.text.clear();
    c.textBaseline = 'alphabetic';
    const wN = this.lCarry.words;
    const aN = 1 - smoothstep(this.lCarry.end + 0.02, this.lCarry.end + 0.32, t);
    if (aN > 0) karaokeRow(c, wN, 150, CY + (72 * CAP) / 2, F.archivo(87.5, 700), 72, t, aN, { on: 'bone', dim: 0.3 });
    const wF = this.lF.words;
    const aF = 1 - smoothstep(this.lF.end + 0.05, this.lF.end + 0.4, t);
    karaokeRow(c, wF.slice(0, 3), 150, 846, F.archivo(100, 700), 84, t, aF);
    karaokeRow(c, wF.slice(3), 150, 962, F.archivo(112.5, 900), 118, t, aF);
    const wO = this.lO.words;
    const aO = 1 - smoothstep(this.lO.end + 0.1, this.lO.end + 0.45, t);
    karaokeRow(c, [wO[0]!], 150, 214, F.archivo(87.5, 900), 112, t, aO);
    karaokeRow(c, wO.slice(1), 150, 316, F.archivo(100, 700), 84, t, aO);

    // one label at a time
    const tRes = this.fires[RES]!;
    const n1 = xs[1]!;
    monoLabel(c, 'node of Ranvier', sxOf(v, n1) + 44, 744, sxOf(v, n1), syOf(v, ra + AX.my + 4), window01(t, this.fires[0]! + 0.12, tRes - 0.08, 0.25, 0.25));
    const vA = V(v.cx + (BRX - 40 - v.ax) / v.z);
    monoLabel(c, 'action potential · stylized', 1016, 250, BRX - 40, yb - vA * amp - 8, window01(t, tRes + 0.2, this.lO.words[1]!.start, 0.3, 0.3));

    // the bracket: empty until the event arrives in it, then it rides the signal to the synapse
    // on the event it opens out and settles around the whole node (membrane to membrane)
    const res = prog(t, tRes - 0.02, tRes + 0.16, (x) => ease.outBack(x, 2.2));
    let bx = BRX, by = CY, size = lerp(26, 56, res);
    let dot = 0;
    if (t >= tRes) {
      for (let k = RES; k < this.fires.length; k++) dot = Math.max(dot, 0.55 + 0.45 * this.flash(t, this.fires[k]!));
      for (let k = RES + 1; k < this.fires.length; k++) size -= 5 * this.flash(t, this.fires[k]!);
    }
    // to the active zone once the signal leaves the last node
    const toSyn = prog(t, this.tSyn0, this.tSyn1 + 0.1, ease.inOutCubic);
    if (toSyn > 0) {
      bx = lerp(BRX, sxOf(v, T.xCleft + T.cleft / 2), toSyn);
      size = lerp(size, 44 * v.z, toSyn);
      size -= 8 * this.flash(t, this.tRel) * v.z;
    }
    const bA = 1 - prog(t, this.tEnd0 - 0.05, this.tEnd0 + 0.25);
    if (t < tRes) focusBracket(c, bx, by, { size, empty: true, alpha: 0.95 });
    else focusBracket(c, bx, by, { size, alpha: 0.95 * bA, dot: dot * (1 - toSyn * 0.6) });
    comp.draw(renderer, this.text.upload(), out);

    return { bloom: 0.55, bloomThreshold: 0.85, vignette: 0.45, grain: 0.055, ca: 0.4, halation: 0.18, zoom: 1 + 0.003 * (f.a.kick ?? 0) };
  }
}
