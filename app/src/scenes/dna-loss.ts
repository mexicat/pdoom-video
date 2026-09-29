// DNA edition, `loss` slot (docs/DNA_VIDEO_PLAN.md, slot `loss`; stamp table).
//  carry-in "that’s no surprise": its last syllable finishes over a bare chart: the rule the previous
//      shot straightened out of a helix rung is the baseline; a log axis rises from it.
//  "There was a sudden drop in your training loss,": a schematic replication-error plot draws in and
//      descends through base selection and proofreading; on "drop" the line falls off a cliff (repair)
//      and keeps going as the contour of an opening replication fork: the curve is the upper parental
//      strand, the baseline the lower one, and to the right of the pen they are one right-handed duplex.
//      The camera dives into the pen tip until the fork and its helicase ring crop the frame.
//  "now I’m your servant and you’re my boss": on "servant" the label gives way to the stamp
//      REPLICATOR / SURVIVAL MACHINE — DAWKINS, 1976. On "boss" the camera swings back square and pulls
//      out along the fork's arms: the graph's two edges are now two separated strands (prompt1's shutters).
// Everything is a pure function of song time.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font, glyphX } from '../engine/type';
import { type Line, type Word } from '../engine/lyrics';
import { clamp, lerp, ease, prog, keys, smoothstep, window01, type Key } from '../engine/util';
import { Cam, LIN, rgba, karaokeRow, monoLabel, rubberStamp, findWord, makeBackdrop, sungChars, sc, type Proj } from './dna-kit';
import { RISE, forkBPs, drawFork, type ForkShape } from './dna-loss-fork';

// ------------------------------------------------------------------ the plot, in world nm (chart plane z = 0)
const XL = -640 / 3; // the y axis: rises from the left end of the previous shot's rule (screen x 360)
const XR = 340; // right end of the rule
const HA = 108, HB = 60, DU = 12; // selection plateau, proofreading plateau, floor after repair
const XS = -115, WS = 3.2; // proofreading step
const XC = 0, WC = 1.25; // the drop (repair)
const LF = 16; // length over which the fork's upper arm leaves the duplex
const sig = (u: number) => 1 / (1 + Math.exp(-u));
const chartTop = (x: number) => DU + (HB - DU) * sig((XC - x) / WC) + (HA - HB) * sig((XS - x) / WS);
const Y_BASE = -1; // the baseline is the duplex's lower edge / the lower arm
const FOV = 30;

/** A karaoke row without its own anticipation (the caller fades it in), for rows split into pieces. */
function wipeRow(c: CanvasRenderingContext2D, ws: Word[], x: number, y: number, fam: string, size: number, t: number, alpha: number, on = 'bone') {
  if (alpha <= 0.001 || !ws.length) return;
  const txt = ws.map((w) => w.w).join(' ');
  c.font = font(fam, size);
  const wTot = c.measureText(txt).width;
  const k = sungChars(ws, t), ki = Math.floor(k);
  const xa = ki >= txt.length ? wTot : glyphX(txt, ki, fam, size);
  const xb = ki + 1 >= txt.length ? wTot : glyphX(txt, ki + 1, fam, size);
  const xs = ki >= txt.length ? wTot : lerp(xa, xb, k - ki);
  c.fillStyle = rgba(on, 0.3 * alpha);
  c.fillText(txt, x, y);
  if (xs > 0) {
    c.save();
    c.beginPath(); c.rect(x - 60, y - size * 1.3, xs + 60, size * 1.8); c.clip();
    c.fillStyle = rgba(on, alpha);
    c.fillText(txt, x, y);
    c.restore();
  }
}

export default class DnaLossScene extends Scene {
  bg = makeBackdrop();
  cam = new Cam(FOV);
  chart = new LineBatch(8000, { screen2D: true, blend: 'normal' });
  fork = new LineBatch(26000, { screen2D: true, blend: 'normal' });
  text = new Layer2D();

  lPrev!: Line; l1!: Line; l2!: Line;
  wDrop!: Word; wServ!: Word; wBoss!: Word; wIn!: Word;
  tS = 0; tE = 0;
  kX: Key[] = []; // pen head / junction x
  kLogS: Key[] = []; kSX: Key[] = []; kSY: Key[] = []; kYaw: Key[] = []; kPitch: Key[] = [];
  steps: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.tS = this.ctx.start; this.tE = this.ctx.end;
    this.lPrev = ly.get('no surprise');
    this.l1 = ly.get('sudden drop');
    this.l2 = ly.get('your servant');
    this.wDrop = findWord(this.l1, 'drop');
    this.wIn = findWord(this.l1, 'in');
    this.wServ = findWord(this.l2, 'servant');
    this.wBoss = findWord(this.l2, 'boss');
    const t0 = this.l1.words[0]!.start, tD = this.wDrop.start;
    const lin = ease.linear;
    // pen: across the selection plateau and down the proofreading step while "There was a sudden" is sung,
    // off the cliff on "drop", then racing along the floor (unzipping) as the camera dives into it
    this.kX = [[t0, XL], [tD, -12, lin], [tD + 0.26, 5, ease.inQuad], [tD + 1.55, 64, ease.outCubic]];
    // after that the helicase ratchets on the beats
    const b0 = Math.ceil(au.beatAt(tD + 1.55));
    for (let b = b0; au.timeOfBeat(b) < this.tE + 0.5; b++) this.steps.push(au.timeOfBeat(b));

    const tDive0 = tD + 0.1, tDive1 = tD + 1.45;
    const tSw0 = this.wBoss.start - 0.62, tSw1 = this.wBoss.start + 0.3;
    this.kLogS = [[this.tS, Math.log(3.0)], [tDive0, Math.log(3.12), lin], [tDive1, Math.log(92), ease.inOutQuart],
      [this.l2.words[0]!.start, Math.log(104), lin], [this.wServ.start, Math.log(150), ease.inOutCubic], [tSw0, Math.log(156), lin],
      [tSw1, Math.log(34.6), ease.inOutCubic], [this.tE, Math.log(33.4), lin]];
    this.kSX = [[tDive0, 1000], [tDive1, 1010], [tSw0, 980], [tSw1, 960]];
    this.kSY = [[tDive0, 537], [tDive1, 470], [tSw0, 460], [tSw1, 478]];
    this.kYaw = [[tD + 0.9, 0], [tD + 2.2, -0.42], [tSw0, -0.5, lin], [tSw1, 0]];
    this.kPitch = [[tD + 0.9, 0], [tD + 2.2, 0.06], [tSw0, 0.07, lin], [tSw1, 0]];
  }

  // ------------------------------------------------------------------ time → state
  private penX(t: number) {
    let x = keys(t, this.kX);
    for (const s of this.steps) x += 1.1 * prog(t, s, s + 0.22, ease.outCubic);
    return x;
  }
  /** Fork shape at pen position x (the junction exists once the pen is off the cliff). */
  private shape(xH: number): ForkShape | null {
    if (xH < 4) return null;
    const lf = lerp(0.8, LF, smoothstep(4, 40, xH));
    return {
      xJ: xH, blend: 3.2,
      upper: (x) => chartTop(x) * smoothstep(0, lf, xH - x),
      lower: () => Y_BASE,
    };
  }
  private camera(t: number, xH: number) {
    const s = Math.exp(keys(t, this.kLogS));
    const tD = this.wDrop.start;
    const tSw0 = this.wBoss.start - 0.62, tSw1 = this.wBoss.start + 0.3;
    const sw = prog(t, tSw0, tSw1, ease.inOutCubic);
    const fx = lerp(0, xH, prog(t, tD + 0.05, tD + 0.75, ease.inOutCubic)) - 42 * sw;
    const fy = lerp(0, (DU + Y_BASE) / 2, sw);
    const yaw = keys(t, this.kYaw), pitch = keys(t, this.kPitch);
    const sx = keys(t, this.kSX), sy = keys(t, this.kSY);
    const dist = (1080 / 2 / Math.tan((FOV * Math.PI) / 360)) / s;
    const tgt = new THREE.Vector3(fx, fy, 0);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    // shift camera and target together so the focus lands at (sx, sy) instead of the centre
    const off = right.multiplyScalar((960 - sx) / s).add(up.multiplyScalar((sy - 540) / s));
    const pos = tgt.clone().addScaledVector(dir, dist).add(off);
    this.cam.look({ x: pos.x, y: pos.y, z: pos.z }, { x: tgt.x + off.x, y: tgt.y + off.y, z: tgt.z + off.z }, FOV);
    return { s, fx, fy };
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const xH = this.penX(t);
    const sh = this.shape(xH);
    const { s, fx, fy } = this.camera(t, xH);
    const dA = smoothstep(6, 16, s); // fork detail vs chart hairlines
    const gA = Math.floor((fx - 46) / RISE), gB = Math.ceil((fx + 52) / RISE);
    const xA = gA * RISE, xB = gB * RISE;

    this.bg.u.uPaper!.value = 0; this.bg.u.uPool!.value = 0;
    this.bg.render(renderer, out);

    // ---- chart hairlines (the plot as drawn at arm's length)
    this.drawChart(t, xH, sh, s, dA, xA, xB);
    this.chart.render(renderer, out);

    // ---- the fork
    const B = this.fork;
    B.clear();
    if (sh && dA > 0.002) {
      const bps = forkBPs(gA, gB, sh);
      const pf = this.cam.proj(fx, fy, 0);
      // helicase: a hexameric ring around the upper strand just behind the junction
      const xr = sh.xJ - 2.4;
      const ir = clamp(Math.round((xr - xA) / RISE), 1, bps.length - 2);
      const cR = bps[ir]!.a.clone();
      const ax = new THREE.Vector3(1, (sh.upper(xr + 0.5) - sh.upper(xr - 0.5)), 0).normalize();
      const ringA = smoothstep(18, 40, s);
      drawFork(B, this.cam, bps, {
        alpha: dA, fogRef: pf.w, fogSpan: 7,
        ring: ringA > 0.01 ? { c: cR, axis: ax, R: 1.15 * ringA, r: 0.5 * ringA, spin: 0.6 * t } : undefined,
      });
    }
    B.render(renderer, out);

    // ---- lyrics, label, stamp, chart type
    this.drawText(t, xH, sh, s);
    comp.draw(renderer, this.text.upload(), out);

    return { bloom: 0.35, bloomThreshold: 0.9, vignette: 0.42, ca: 0.4, halation: 0.12 };
  }

  // ------------------------------------------------------------------ chart
  private drawChart(t: number, xH: number, sh: ForkShape | null, s: number, dA: number, xA: number, xB: number) {
    const L = this.chart;
    L.clear();
    const cam = this.cam;
    const bone = LIN.bone, ash = LIN.ash, gr = LIN.graphite;
    const hideIn = (x: number) => (x > xA + 3 && x < xB - 3 ? 1 - dA : 1);
    const poly = (xs: number[], ys: number[], w: number, col: [number, number, number], a: number, fade = true) => {
      let p: Proj | null = null;
      for (let i = 0; i < xs.length; i++) {
        const q = cam.proj(xs[i]!, ys[i]!, 0);
        if (p) {
          const off = (p.x < -20 && q.x < -20) || (p.x > 1940 && q.x > 1940) || (p.y < -20 && q.y < -20) || (p.y > 1100 && q.y > 1100);
          const aa = a * (fade ? hideIn((xs[i]! + xs[i - 1]!) / 2) : 1);
          if (!off && aa > 0.002) L.seg2(p.x, p.y, q.x, q.y, w, col, aa);
        }
        p = q;
      }
    };
    const tS = this.tS;
    const chartA = 1 - smoothstep(4.2, 7.5, s); // axis, ticks: gone once we're inside the fork
    // the rule (baseline): already there at the cut
    {
      const xs: number[] = [], ys: number[] = [];
      // at the cut it spans screen x 360–1560 like the open's rule, then runs out to the frame edges
      const g = prog(t, tS + 0.1, tS + 0.55, ease.inOutCubic);
      const r0 = lerp(XL, -360, g), r1 = lerp(560 / 3, XR, g);
      for (let x = r0; x <= r1; x += 2) { xs.push(x); ys.push(Y_BASE); }
      xs.push(r1); ys.push(Y_BASE);
      poly(xs, ys, lerp(3, 1.6, g), bone, 0.9); // the open's rule is ~3 px: start there, thin as it runs out
    }
    if (chartA > 0.002) {
      // y axis rises out of the rule; log ticks, no numbers (schematic)
      const ax = prog(t, tS + 0.2, tS + 0.5, ease.outCubic);
      const yTop = lerp(Y_BASE, 128, ax);
      poly([XL, XL], [Y_BASE, yTop], 1.4, ash, 0.85 * chartA, false);
      for (let k = 0; k < 5; k++) {
        const y = 14 + k * 25;
        const a = prog(t, tS + 0.3 + 0.06 * k, tS + 0.42 + 0.06 * k) * chartA;
        if (y < yTop && a > 0) poly([XL - 3, XL], [y, y], 1.2, ash, 0.8 * a, false);
      }
      // stage boundaries on the x axis
      for (const x of [XS, XC]) {
        const a = prog(xH, x - 10, x) * chartA;
        if (a > 0) poly([x, x], [Y_BASE, Y_BASE - 3], 1.2, ash, 0.7 * a, false);
      }
    }
    // the curve: the error plot, then (once the pen is off the cliff) the fork's upper arm
    const xEnd = sh ? sh.xJ : xH;
    if (xEnd > XL + 0.5) {
      const xs: number[] = [], ys: number[] = [];
      const step = s > 20 ? 0.34 : 0.7;
      for (let x = XL; x < xEnd; x += step) { xs.push(x); ys.push(sh ? sh.upper(x) : chartTop(x)); }
      xs.push(xEnd); ys.push(sh ? sh.upper(xEnd) : chartTop(xEnd));
      poly(xs, ys, 2.0, bone, 1);
      // engraved fill: 45° hatching between the baseline and the curve (the fork's mouth, later)
      const hA = 0.5 * (1 - smoothstep(3.3, 5.5, s)) * prog(t, this.l1.words[0]!.start + 0.3, this.l1.words[0]!.start + 0.7);
      if (hA > 0.01) {
        const sp = 11 / s; // 11 px apart
        const ch = (x: number) => (sh ? sh.upper(x) : chartTop(x));
        // lines y − Y_BASE = x − x0, clipped to the axis, the pen and the curve
        const inside = (x: number, y: number) => x < xEnd && y < ch(x) - 0.6;
        for (let x0 = XL - HA + sp * 0.5; x0 < xEnd; x0 += sp) {
          const xs0 = Math.max(x0, XL + 0.5), ys0 = Y_BASE + 0.4 + (xs0 - x0);
          if (!inside(xs0, ys0)) continue;
          let u = 0;
          const du = 1.2;
          while (inside(xs0 + u, ys0 + u)) u += du;
          let lo = Math.max(0, u - du), hi = u;
          for (let r = 0; r < 5; r++) { const m = (lo + hi) / 2; if (inside(xs0 + m, ys0 + m)) lo = m; else hi = m; }
          if (lo > 0.3) poly([xs0, xs0 + lo], [ys0, ys0 + lo], 1, gr, hA, false);
        }
      }
      // pen tip while it is still a plot
      const tipA = (1 - smoothstep(3.3, 6, s)) * prog(t, this.l1.words[0]!.start - 0.1, this.l1.words[0]!.start);
      if (tipA > 0) {
        const p = cam.proj(xEnd, sh ? sh.upper(xEnd) : chartTop(xEnd), 0);
        L.seg2(p.x, p.y, p.x + 0.01, p.y, 7, sc(bone, 1.15), tipA);
      }
    }
  }

  // ------------------------------------------------------------------ type
  private drawText(t: number, xH: number, sh: ForkShape | null, s: number) {
    const c = this.text.ctx;
    this.text.clear();
    const cam = this.cam;
    const l1 = this.l1, l2 = this.l2;

    // carry-in: the tail of "surprise" finishes, then the row leaves
    // (where the open left it: sitting on the rule, dna-open.ts RULE)
    karaokeRow(c, this.lPrev.words, 360, 500, F.archivo(100, 800), 76, t, 1 - prog(t, this.lPrev.end + 0.02, this.lPrev.end + 0.28));

    // two lyric rows in the bottom band (R1, R2), under the plot and under the fork
    const R1 = 830, R2 = 940, X0 = 130;
    // line 1: "There was a sudden" + "drop" (the word drops with the curve), then "in your training loss,"
    const fam1 = F.archivo(100, 800), fs1 = 96;
    const out1 = 1 - prog(t, l1.end + 0.01, l1.end + 0.17);
    const a1 = prog(t, l1.words[0]!.start - 0.4, l1.words[0]!.start - 0.1) * out1;
    const iDrop = l1.words.indexOf(this.wDrop);
    const head = l1.words.slice(0, iDrop), full = l1.words.slice(0, iDrop + 1).map((w) => w.w).join(' ');
    wipeRow(c, head, X0, R1, fam1, fs1, t, a1);
    const xd = X0 + glyphX(full, full.length - this.wDrop.w.length, fam1, fs1);
    const fall = 36 * prog(t, this.wDrop.start + 0.02, this.wDrop.start + 0.26, ease.inCubic);
    wipeRow(c, [this.wDrop], xd, R1 + fall, fam1, fs1, t, a1);
    karaokeRow(c, l1.words.slice(iDrop + 1), X0, R2, fam1, fs1, t, out1);

    // line 2, same rows
    const iServ = l2.words.indexOf(this.wServ);
    karaokeRow(c, l2.words.slice(0, iServ + 1), X0, R1, fam1, fs1, t, 1, { lead: 0.2 });
    karaokeRow(c, l2.words.slice(iServ + 1), X0, R2, fam1, fs1, t, 1, { lead: 0.3 });

    // chart type: stage names under the baseline, while the plot is a plot
    const chartA = 1 - smoothstep(3.6, 5.2, s);
    if (chartA > 0.01) {
      c.font = font(F.mono(400), 13);
      c.textAlign = 'center';
      for (const [x, name] of [[(XL + XS) / 2, 'selection'], [(XS + XC) / 2, 'proofreading'], [XC + 45, 'repair']] as const) {
        const a = prog(xH, x - 30, x) * chartA;
        if (a <= 0.01) continue;
        const p = cam.proj(x, Y_BASE, 0);
        c.fillStyle = rgba('graphite', 0.95 * a);
        c.fillText(name, p.x, p.y + 30);
      }
      c.textAlign = 'left';
    }

    // the one label: on the plot, then on the fork's upper arm (the same curve), until the stamp replaces it
    const tServ = this.wServ.start;
    // (once the pen has drawn the point it points at)
    const t0 = this.l1.words[0]!.start, tAnc = t0 + ((XS + 30 - XL) / (-12 - XL)) * (this.wDrop.start - t0);
    const aPlot = window01(t, tAnc, this.wDrop.start + 0.3, 0.25, 0.3);
    if (aPlot > 0.01) {
      const p = cam.proj(XS + 30, chartTop(XS + 30), 0);
      monoLabel(c, 'error reduction · schematic', p.x + 40, p.y - 58, p.x, p.y - 4, aPlot);
    }
    const aFork = sh ? prog(t, this.wDrop.start + 1.7, this.wDrop.start + 2.0) * (t < tServ ? 1 : 0) : 0;
    if (aFork > 0.01 && sh) {
      const x = sh.xJ - 4.5;
      const p = cam.proj(x, sh.upper(x), 0);
      const lx = clamp(p.x + 60, 140, 1500), ly = clamp(p.y - 70, 140, 900);
      monoLabel(c, 'error reduction · schematic', lx, ly, p.x, p.y, aFork);
    }

    // the stamp, on "servant"
    rubberStamp(c, 'REPLICATOR / SURVIVAL MACHINE', 1455, 905, t, { t0: tServ, sub: 'DAWKINS, 1976', size: 34, rot: -0.045, seed: 7 });
  }
}
