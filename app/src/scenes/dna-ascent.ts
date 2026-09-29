// DNA edition, `ascent` slot (docs/DNA_VIDEO_PLAN.md) — chorus 2, full band: a nesting scale atlas.
// Six engraved plates hang off a log-scale spine (1 nm … 1 m, decade ticks with log minor ticks), each at
// the value of its own scale bar: DNA 2 nm, nucleosome 10 nm, nucleus 2 µm, cell 10 µm, tissue 50 µm,
// organism 1 cm. Each is its own framed figure; a hairline ties its bar to the spine; nothing zooms from one
// object into another. The ladder recedes up a slope, so the windows converge on a vanishing point far above.
// Plates print in as the camera arrives on the beat; plates passing the camera fall out of focus.
//  carry-in: "…P(doom)" completes top left over the DNA plate.
//  "I hear the basilisk boom": climb to the nucleosome; on "boom" (downbeat) leap 2.3 decades to the nucleus.
//  "NVDA to the moon": cell, tissue on the beats; leap to the organism on "moon" (downbeat).
//  "The Omega Point's coming soon": pull back past the camera to the whole ladder; the frames beyond the
//      organism are blank and converge on one point, lit on "Point's".
//  "One E thirty FLOPs a second": the lyric stays lyric (never on the spine). On the held "second" one
//      small blank frame turns to paper, flies to the camera and becomes the bureau's form (next slot).
// Everything is a pure function of song time.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { type Word } from '../engine/lyrics';
import { clamp, lerp, ease, prog, keys, smoothstep, pulse, type Key } from '../engine/util';
import { karaokeRow, findWord, focusBracket, monoLabel } from './dna-kit';
import { buildPlates, PLW, PLH, type Plate } from './dna-ascent-plates';
import { makePaperPass, drawFormCached, FORM, ROW1 } from './dna-bureau-form';

const UNIT = 62.5; // plate px per ladder world unit (plates are 16 x 10 units)
const HW = PLW / UNIT / 2, HH = PLH / UNIT / 2;
const BAR_Y = 580; // plate px: the scale bar's line
const DY = 9, DZ = 18, XO = 11; // ladder: per decade up and away; plates alternate either side of the spine
const FOC = 1484; // px (40° vertical field)
const D0 = 24; // climb: camera distance to the plate in focus

type Rect = { x: number; y: number; w: number; h: number };
interface Slot { u: number; side: number; plate: Plate | null; tPrint: number }
interface CamS { x: number; y: number; z: number; px: number; py: number; f: number; ref: number }
interface Row { ws: Word[]; x: number; y: number; fam: string; size: number; align?: 'left' | 'right'; out: [number, number] }

const LABELS: [number, string][] = [[0, '1 nm'], [1, '10 nm'], [2, '100 nm'], [3, '1 µm'], [4, '10 µm'], [5, '100 µm'], [6, '1 mm'], [7, '1 cm'], [8, '10 cm'], [9, '1 m']];

export default class DnaAscent extends Scene {
  bg = makePaperPass();
  L = new Layer2D();
  glow = new LineBatch(64, { screen2D: true, blend: 'add' });
  plates: Plate[] = [];
  slots: Slot[] = [];
  rows: Row[] = [];
  kU: Key[] = [];
  B: (k: number) => number = (k) => k;
  tOpen = 0; tPull0 = 0; tPull1 = 0; tPoint = 0; tDet = 0; tFly0 = 0; tPrint0 = 0; tPrint1 = 0;
  hits: number[] = [];
  paperSlot = 6;

  override init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    const b0 = Math.round(au.beatAt(this.ctx.start));
    const B = (k: number) => au.timeOfBeat(b0 + k);
    this.B = B;
    this.plates = buildPlates();
    // slots: the six plates, then blank frames continuing up the ladder
    const arrive = [B(0) - 1, B(2), B(4), B(5), B(6), B(8)];
    this.plates.forEach((p, i) => this.slots.push({ u: p.u, side: i % 2 === 0 ? 1 : -1, plate: p, tPrint: arrive[i]! }));
    for (let j = 0; j < 28; j++) this.slots.push({ u: 7.7 + 0.7 * j, side: j % 2 === 0 ? 1 : -1, plate: null, tPrint: 1e9 });

    // camera: stepped climb on the beats, leaps on "boom" and "moon"
    const lA = ly.get('basilisk'), lB = ly.get('to the moon'), lC = ly.get('Omega'), lD = ly.get('FLOPs');
    const land = (x: number) => ease.outBack(x, 1.1);
    const leap = (x: number) => ease.inOutCubic(x);
    this.kU = [
      [B(0), 0.3], [B(1) + 0.1, 0.34, ease.linear], [B(2), 1.0, land],
      [B(4) - 0.34, 1.05, ease.linear], [B(4), 3.3, leap],
      [B(5) - 0.22, 3.35, ease.linear], [B(5), 4.0, land],
      [B(6) - 0.22, 4.04, ease.linear], [B(6), 4.7, land],
      [B(8) - 0.42, 4.78, ease.linear], [B(8), 7.0, leap],
      [B(10), 7.08, ease.linear],
    ];
    this.hits = [B(4), B(8)];
    this.tOpen = B(1) - 0.08;
    this.tPull0 = lC.words[0]!.start;
    this.tPoint = findWord(lC, 'Point’s').start;
    this.tPull1 = B(10);
    this.tDet = B(16);
    this.tFly0 = B(16) + 0.2;
    this.tPrint0 = B(17);
    this.tPrint1 = B(20);

    // lyric rows (song-time karaoke; the row anticipates its own first word)
    const hook = ly.get("I'm upping", 1);
    const safe = ly.get('safe enough');
    const Fa = (w: number, wt: number) => F.archivo(w, wt);
    this.rows = [
      { ws: hook.words, x: 130, y: 196, fam: Fa(112.5, 900), size: 100, out: [hook.end + 0.02, hook.end + 0.24] },
      { ws: lA.words.slice(0, 3), x: 130, y: 842, fam: Fa(100, 700), size: 60, out: [lA.end + 0.02, lA.end + 0.26] },
      { ws: lA.words.slice(3), x: 130, y: 968, fam: Fa(112.5, 900), size: 126, out: [lA.end + 0.02, lA.end + 0.26] },
      { ws: lB.words.slice(0, 1), x: 1790, y: 862, fam: Fa(125, 900), size: 150, align: 'right', out: [lB.end + 0.02, lB.end + 0.26] },
      { ws: lB.words.slice(1), x: 1790, y: 980, fam: Fa(100, 800), size: 84, align: 'right', out: [lB.end + 0.02, lB.end + 0.26] },
      { ws: lC.words.slice(0, 3), x: 130, y: 830, fam: Fa(100, 800), size: 80, out: [lC.end + 0.02, lC.end + 0.22] },
      { ws: lC.words.slice(3), x: 130, y: 955, fam: Fa(112.5, 900), size: 124, out: [lC.end + 0.02, lC.end + 0.22] },
      { ws: lD.words.slice(0, 5), x: 130, y: 820, fam: Fa(100, 800), size: 72, out: [B(19) - 0.1, B(19) + 0.2] },
      { ws: lD.words.slice(5), x: 130, y: 975, fam: Fa(125, 900), size: 168, out: [1e9, 1e9] },
      // the bureau's first line starts 20 ms before the cut: same face, size and place as in `bureau`
      { ws: safe.words.slice(0, 4), x: ROW1.x, y: ROW1.y, fam: Fa(100, 800), size: 76, out: [1e9, 1e9] },
    ];
  }

  // ------------------------------------------------------------------ camera
  private xs(u: number) {
    const S = this.slots;
    if (u <= S[0]!.u) return S[0]!.side * XO;
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i]!, b = S[i + 1]!;
      if (u <= b.u) return lerp(a.side, b.side, ease.inOutQuad((u - a.u) / (b.u - a.u))) * XO;
    }
    return S[S.length - 1]!.side * XO;
  }
  private cam(t: number): CamS {
    const u = keys(t, this.kU);
    const py = lerp(640, 410, prog(t, this.B(1), this.B(2), ease.inOutCubic));
    const climb: CamS = { x: 0.62 * this.xs(u), y: u * DY + 4.3, z: u * DZ - D0, px: 930, py, f: FOC, ref: D0 };
    const e = prog(t, this.tPull0 - 0.05, this.tPull1, ease.inOutQuart);
    if (e <= 0) return climb;
    const dr = Math.max(0, t - this.tPull1);
    // the whole ladder on a long lens: the frames climb out of the top of the picture toward their vanishing point
    const tower: CamS = { x: 0, y: -9.5 + dr * 0.5, z: -95 + dr * 2.2, px: 1530, py: 1410, f: 2600, ref: 100 };
    return {
      x: lerp(climb.x, tower.x, e), y: lerp(climb.y, tower.y, e), z: lerp(climb.z, tower.z, e),
      px: lerp(climb.px, tower.px, e), py: lerp(climb.py, tower.py, e), f: Math.exp(lerp(Math.log(climb.f), Math.log(tower.f), e)), ref: lerp(climb.ref, tower.ref, e),
    };
  }

  /** Screen rect of a slot's plate, px per unit and depth; null if behind the camera. */
  private place(s: Slot, C: CamS) {
    const X = s.side * XO, Yb = s.u * DY, Z = s.u * DZ;
    const d = Z - C.z;
    if (d < 1.2) return null;
    const k = C.f / d; // px per unit
    const yTop = Yb - (PLH - BAR_Y) / UNIT + 2 * HH; // plate top edge (world)
    const x = C.px + k * (X - HW - C.x), y = C.py - k * (yTop - C.y);
    return { x, y, w: 2 * HW * k, h: 2 * HH * k, k, d };
  }
  private proj(C: CamS, X: number, Y: number, Z: number) {
    const d = Z - C.z;
    if (d < 1.2) return null;
    const k = C.f / d;
    return { x: C.px + k * (X - C.x), y: C.py - k * (Y - C.y), k, d };
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const C = this.cam(t);

    // the paper frame (the last small frame → the bureau's form)
    const sheet = this.sheet(t, C);
    this.bg.u.uPaper!.value = 0;
    this.bg.u.uRectOn!.value = sheet ? 1 : 0;
    if (sheet) {
      (this.bg.u.uRect!.value as THREE.Vector4).set(sheet.rect.x, sheet.rect.y, sheet.rect.w, sheet.rect.h);
      (this.bg.u.uMap!.value as THREE.Vector3).set(sheet.ox, sheet.oy, sheet.k);
    }
    // the Omega point's soft glow lives in the backdrop (float precision: no banding)
    {
      const pa0 = prog(t, this.tPoint - 0.04, this.tPoint + 0.02) * (1 - (sheet ? smoothstep(0.1, 0.5, sheet.e) : 0));
      const R = 120 + 60 * pulse(t, this.tPoint, 0.25);
      (this.bg.u.uGlow!.value as THREE.Vector4).set(C.px, C.py - (C.f * DY) / DZ, R, 0.075 * pa0 * (1 + 1.2 * pulse(t, this.tPoint, 0.25)));
    }
    this.bg.render(renderer, out);

    const c = this.L.ctx;
    this.L.clear();
    // everything behind the flying sheet is clipped away (it is nearest the camera)
    c.save();
    if (sheet) { c.beginPath(); c.rect(-10, -10, W + 20, H + 20); const r = sheet.rect; c.rect(r.x, r.y, r.w, r.h); c.clip('evenodd'); }
    this.drawSpine(c, t, C);
    this.drawPlates(c, t, C);
    c.restore();
    if (sheet) this.drawSheet(c, t, sheet);
    this.drawLyrics(c, t, sheet ? sheet.rect : null);
    comp.draw(renderer, this.L.upload(), out);

    // the Omega point: the ladder's vanishing point, lit on "Point's"
    const pa = prog(t, this.tPoint - 0.04, this.tPoint + 0.02) * (1 - (sheet ? smoothstep(0.1, 0.5, sheet.e) : 0));
    if (pa > 0) {
      const vx = C.px, vy = C.py - (C.f * DY) / DZ;
      const I = 1.4 + 3 * pulse(t, this.tPoint, 0.2);
      this.glow.clear();
      for (const [w, k] of [[5.5, 1]] as const) {
        const q = I * k;
        this.glow.seg2(vx, vy, vx + 0.01, vy, w, [LIN.bone[0] * q, LIN.bone[1] * q, LIN.bone[2] * q], pa);
      }
      this.glow.render(renderer, out);
    }

    const kick = f.a.kick ?? 0;
    const punch = this.hits.reduce((s, h) => s + pulse(t, h, 0.09), 0);
    const pap = sheet ? smoothstep(0.55, 0.95, sheet.e) : 0;
    return {
      bloom: lerp(0.5, 0.18, pap), bloomThreshold: lerp(0.9, 1.4, pap), vignette: lerp(0.42, 0.25, pap), paper: pap,
      grain: 0.05, ca: 0.35, zoom: 1 + 0.0035 * kick + 0.018 * punch, flash: 0.025 * pulse(t, this.hits[0]!, 0.05),
    };
  }

  // ------------------------------------------------------------------ the log spine
  private drawSpine(c: CanvasRenderingContext2D, t: number, C: CamS) {
    const uMax = lerp(0.6, 40, prog(t, this.tOpen, this.tOpen + 0.9, ease.inQuad));
    const near = (d: number) => smoothstep(0.75 * C.ref, 1.0 * C.ref, d);
    c.lineCap = 'butt';
    // the spine, one stroke per half decade (alpha follows depth)
    for (let u0 = -1; u0 < uMax; u0 += 0.5) {
      const u1 = Math.min(uMax, u0 + 0.5);
      const p = this.proj(C, 0, u0 * DY, u0 * DZ), q = this.proj(C, 0, u1 * DY, u1 * DZ);
      if (!p || !q) continue;
      if (Math.max(p.y, q.y) < -20 || Math.min(p.y, q.y) > H + 20) continue;
      const al = 0.5 * this.fog(q.d, C) * near(q.d);
      if (al < 0.01) continue;
      c.strokeStyle = rgba('bone', al); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
    }
    // decade ticks with log minor ticks (one path per decade); labels near the camera only
    c.font = font(F.mono(400), 13);
    for (let dec = -1; dec < 24; dec++) {
      if (dec > uMax) break;
      const p1 = this.proj(C, 0, dec * DY, dec * DZ);
      if (!p1 || p1.y < -60) continue;
      if (p1.y > H + 400) continue;
      const al = this.fog(p1.d, C) * near(p1.d);
      if (al < 0.01) continue;
      c.strokeStyle = rgba('bone', 0.45 * al); c.lineWidth = 0.9;
      c.beginPath();
      for (let m = 2; m <= 9; m++) {
        const u = dec + Math.log10(m);
        if (u > uMax) break;
        const p = this.proj(C, 0, u * DY, u * DZ);
        if (!p) continue;
        const tl = (m === 5 ? 0.42 : 0.28) * p.k;
        c.moveTo(p.x - tl, p.y); c.lineTo(p.x + tl, p.y);
      }
      c.stroke();
      const tl = 0.7 * p1.k;
      c.strokeStyle = rgba('bone', 0.8 * al); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(p1.x - tl, p1.y); c.lineTo(p1.x + tl, p1.y); c.stroke();
      if (dec >= 0 && dec <= 9) {
        const la = 0.8 * al * smoothstep(16, 30, p1.k);
        if (la > 0.01) { c.fillStyle = rgba('ash', la); c.fillText(LABELS[dec]![1], p1.x + tl + 6, p1.y + 4.5); }
      }
    }
  }
  private fog(d: number, C: CamS) { return lerp(1, 0.3, smoothstep(1.6 * C.ref, 6 * C.ref, d)); }

  // ------------------------------------------------------------------ plates
  private drawPlates(c: CanvasRenderingContext2D, t: number, C: CamS) {
    const vis: { s: Slot; r: NonNullable<ReturnType<DnaAscent['place']>>; i: number }[] = [];
    this.slots.forEach((s, i) => {
      if (i === this.paperSlot && t >= this.tDet) return; // it has become the sheet
      if (i > 0 && t < this.tOpen + 0.035 * (i - 1)) return; // the atlas opens up the ladder
      const r = this.place(s, C);
      if (!r || r.w < 2.5) return;
      if (r.x > W + 10 || r.x + r.w < -10 || r.y > H + 10 || r.y + r.h < -10) return;
      vis.push({ s, r, i });
    });
    vis.sort((a, b) => b.r.d - a.r.d);
    for (const { s, r, i } of vis) {
      // plates passing close to the camera fall out of focus and fade (they never crowd the lyrics)
      const nearF = lerp(0.1, 1, smoothstep(0.6 * C.ref, 0.92 * C.ref, r.d));
      const fa = nearF * this.fog(r.d, C) * (s.plate ? 1 : 1 - smoothstep(15, 26, s.u)) * (i > 0 ? prog(t, this.tOpen + 0.035 * (i - 1), this.tOpen + 0.035 * (i - 1) + 0.08) : 1);
      const kp = r.w / PLW; // screen px per plate px
      const p = s.plate;
      if (fa < 0.01) continue;
      // panel
      c.fillStyle = rgba('ink2', (p ? 0.97 : 0.6 * Math.min(1, fa * 1.5)) * nearF);
      c.fillRect(r.x, r.y, r.w, r.h);
      // engraving, printed in as the camera arrives
      if (p) {
        const pr = prog(t, s.tPrint - 0.14, s.tPrint + 0.16, ease.outQuad);
        if (pr > 0) {
          const cv = p.canvas;
          c.globalAlpha = Math.min(1, fa * 1.15);
          c.drawImage(cv, 0, 0, cv.width, cv.height * pr, r.x, r.y, r.w, r.h * pr);
          c.globalAlpha = 1;
          if (pr < 1) {
            c.strokeStyle = rgba('bone', 0.8 * (1 - pr)); c.lineWidth = 1.2;
            c.beginPath(); c.moveTo(r.x, r.y + r.h * pr); c.lineTo(r.x + r.w, r.y + r.h * pr); c.stroke();
          }
        }
      }
      // frame + registration corners
      const glowDet = i === this.paperSlot ? prog(t, this.tDet - 0.45, this.tDet - 0.05) : 0;
      c.strokeStyle = rgba('bone', (p ? 0.85 : 0.5 + 0.45 * glowDet) * fa); c.lineWidth = p ? 1.2 : 1 + glowDet;
      c.strokeRect(r.x, r.y, r.w, r.h);
      const ck = Math.min(14, 0.03 * r.w), off = Math.min(6, 0.012 * r.w);
      c.strokeStyle = rgba('bone', 0.55 * fa); c.lineWidth = 1;
      c.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const px = sx < 0 ? r.x - off : r.x + r.w + off, py = sy < 0 ? r.y - off : r.y + r.h + off;
        c.moveTo(px, py + -sy * ck); c.lineTo(px, py); c.lineTo(px + -sx * ck, py);
      }
      c.stroke();
      if (!p) continue;
      // scale bar on the spine side, and its hairline to the bar's value on the spine
      const L = s.side < 0 ? PLW - 40 - p.bar : 40, Rr = L + p.bar;
      const bx0 = r.x + L * kp, bx1 = r.x + Rr * kp, by = r.y + BAR_Y * kp;
      const ba = fa * prog(t, s.tPrint, s.tPrint + 0.2);
      if (ba > 0.01) {
        c.strokeStyle = rgba('bone', 0.95 * ba); c.lineWidth = Math.max(1.2, 3.2 * kp);
        c.beginPath(); c.moveTo(bx0, by); c.lineTo(bx1, by); c.stroke();
        c.lineWidth = Math.max(1, 1.6 * kp);
        c.beginPath(); c.moveTo(bx0, by - 7 * kp); c.lineTo(bx0, by + 7 * kp); c.moveTo(bx1, by - 7 * kp); c.lineTo(bx1, by + 7 * kp); c.stroke();
        const fs = 18 * kp;
        if (fs > 5.5) {
          c.font = font(F.mono(500), fs);
          c.fillStyle = rgba('bone', 0.95 * ba);
          c.textAlign = s.side < 0 ? 'right' : 'left';
          c.fillText(p.barText, s.side < 0 ? bx1 : bx0, by - 14 * kp);
          c.textAlign = 'left';
        }
        // leader to the spine
        const spine = this.proj(C, 0, s.u * DY, s.u * DZ);
        if (spine) {
          c.strokeStyle = rgba('bone', 0.35 * ba); c.lineWidth = 1;
          c.setLineDash([3, 3]);
          c.beginPath(); c.moveTo(s.side < 0 ? r.x + r.w + 4 : r.x - 4, spine.y); c.lineTo(spine.x, spine.y); c.stroke();
          c.setLineDash([]);
          c.fillStyle = rgba('bone', 0.8 * ba);
          c.beginPath(); c.arc(spine.x, spine.y, Math.max(1.5, 0.12 * r.k), 0, Math.PI * 2); c.fill();
        }
      }
      // the orange focus bracket rides one base pair of the DNA plate
      if (p.focus) focusBracket(c, r.x + p.focus.x * kp, r.y + p.focus.y * kp, { size: Math.max(5, 30 * kp), alpha: fa });
    }
    // one explanatory label, once the whole ladder is in view
    const la = clamp(Math.min(prog(t, this.tPull1 + 0.2, this.tPull1 + 0.5), 1 - prog(t, this.tPull1 + 1.4, this.tPull1 + 1.7)));
    if (la > 0) {
      const p = this.proj(C, 0, 9.5 * DY, 9.5 * DZ);
      if (p) {
        const txt = 'log scale · each frame a separate figure';
        c.font = font(F.mono(400), 15);
        monoLabel(c, txt, p.x - 330 - c.measureText(txt).width, p.y - 110, p.x - 4, p.y - 2, la);
      }
    }
  }

  // ------------------------------------------------------------------ the paper sheet
  private sheet(t: number, C: CamS) {
    if (t < this.tDet) return null;
    const s = this.slots[this.paperSlot]!;
    const r0 = this.place(s, C);
    if (!r0) return null;
    const e = prog(t, this.tFly0, this.ctx.end, ease.inOutCubic);
    const k0 = r0.w / FORM.w;
    const k = Math.exp(lerp(Math.log(k0), 0, e));
    const cx = lerp(r0.x + r0.w / 2, FORM.x + FORM.w / 2, e), cy = lerp(r0.y + r0.h / 2, FORM.y + FORM.h / 2, e);
    const ox = cx - (FORM.x + FORM.w / 2) * k, oy = cy - (FORM.y + FORM.h / 2) * k;
    // the sheet's paper margin grows until it covers the screen
    const m = 700 * smoothstep(0.15, 0.95, e);
    const rect: Rect = { x: ox + (FORM.x - m) * k, y: oy + (FORM.y - m) * k, w: (FORM.w + 2 * m) * k, h: (FORM.h + 2 * m) * k };
    return { e, k, ox, oy, rect };
  }
  private drawSheet(c: CanvasRenderingContext2D, t: number, S: { e: number; k: number; ox: number; oy: number }) {
    c.save();
    c.setTransform(S.k, 0, 0, S.k, S.ox, S.oy);
    // the frame's own hairline first, then the form prints in top to bottom
    const pr = prog(t, this.tPrint0, this.tPrint1, ease.inOutQuad);
    c.strokeStyle = rgba('ink', 0.88 * (1 - smoothstep(0.85, 1, pr))); c.lineWidth = Math.max(2.2, 1.2 / S.k);
    c.strokeRect(FORM.x, FORM.y, FORM.w, FORM.h);
    if (pr > 0) {
      c.save();
      c.beginPath(); c.rect(FORM.x - 20, FORM.y - 20, FORM.w + 40, (FORM.h + 40) * pr); c.clip();
      drawFormCached(c);
      c.restore();
      if (pr < 1) {
        const y = FORM.y - 20 + (FORM.h + 40) * pr;
        c.strokeStyle = rgba('ink', 0.25); c.lineWidth = 1.2 / S.k;
        c.beginPath(); c.moveTo(FORM.x, y); c.lineTo(FORM.x + FORM.w, y); c.stroke();
      }
    }
    c.restore();
  }

  // ------------------------------------------------------------------ lyrics
  private drawLyrics(c: CanvasRenderingContext2D, t: number, paper: Rect | null) {
    for (const r of this.rows) {
      const a = 1 - prog(t, r.out[0], r.out[1]);
      if (a <= 0.001) continue;
      const o = { align: r.align ?? 'left' as const };
      if (!paper) { karaokeRow(c, r.ws, r.x, r.y, r.fam, r.size, t, a, { ...o, on: 'bone' }); continue; }
      // where the paper has arrived under a row, the row is printed in ink
      c.save();
      c.beginPath(); c.rect(-10, -10, W + 20, H + 20); c.rect(paper.x, paper.y, paper.w, paper.h); c.clip('evenodd');
      karaokeRow(c, r.ws, r.x, r.y, r.fam, r.size, t, a, { ...o, on: 'bone' });
      c.restore();
      c.save();
      c.beginPath(); c.rect(paper.x, paper.y, paper.w, paper.h); c.clip();
      karaokeRow(c, r.ws, r.x, r.y, r.fam, r.size, t, a, { ...o, on: 'ink' });
      c.restore();
    }
  }
}
