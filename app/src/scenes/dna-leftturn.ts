// DNA edition, `leftturn` slot (docs/DNA_VIDEO_PLAN.md, slot `leftturn`; guardrail "Frameshift").
// A typeset plate on bone paper: the synthetic coding example, DNA (coding strand) above its mRNA, the
// mRNA's reading frame in square codon brackets, the translation below it.
//   DNA  ATG CTA AAG GCT GGA TAA → mRNA AUG CUA AAG GCU GGA UAA → Met Leu Lys Ala Gly STOP
//  carry-in "Now von Neumann’s obsolete": its tail finishes over the symmetric plate; the paper rule the
//      previous shot handed over is the DNA row's baseline; the orange focus bracket sits on base 4, C.
//  "Sharp": the C is deleted. Its bracket stays, around nothing (orange motif step "Lose").
//  "left turn": the camera whips left, the one disruptive whip in the film, and settles off-axis; in the
//      mRNA the missing U closes up, so every downstream letter slides one place and the triplet brackets
//      now hold AUG UAA AGG CUG GAU AA (the last two bases an incomplete triplet).
//  "and there you are": the second codon is now STOP, not the sixth; everything past it is dimmed, not
//      translated. The shot holds the consequence. Label: frameshift (−1) · synthetic example.
//  "Without a single CDR": the camera squares up and pulls back, the paper goes dark, the letters leave and
//      the first three codon brackets lengthen into gel lanes; the empty bracket goes to wait in the third
//      lane, where prompt3's gel has its missing band. The held "CDR" hands over at prompt3's row.
// Everything is a pure function of song time.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { type Line, type Word } from '../engine/lyrics';
import { clamp, lerp, ease, prog, keys, smoothstep, window01, type Key } from '../engine/util';
import { Cam, rgba, karaokeRow, monoLabel, focusBracket, findWord, makeBackdrop } from './dna-kit';

// ------------------------------------------------------------------ the example (docs/DNA_VIDEO_PLAN.md guardrails)
const DNA = 'ATGCTAAAGGCTGGATAA';
const RNA = DNA.replace(/T/g, 'U');
const DEL = 3; // the fourth DNA base, C
const MUT = RNA.slice(0, DEL) + RNA.slice(DEL + 1); // AUGUAAAGGCUGGAUAA
const AA_BEFORE = ['Met', 'Leu', 'Lys', 'Ala', 'Gly', 'STOP'];
if (DNA[DEL] !== 'C' || MUT.match(/.{1,3}/g)!.join(' ') !== 'AUG UAA AGG CUG GAU AA') throw new Error('frameshift example is wrong');

// ------------------------------------------------------------------ plate geometry (page px; y down)
const FS = 62; // sequence letters, IBM Plex Mono
const ADV = FS * 0.6 + 6; // Plex Mono advance plus a little tracking (room for the focus bracket)
const PADB = 7; // bracket clearance beyond the outer letters
const HB = 1.5 * ADV + PADB; // bracket half width
const SF = 50 / HB; // final camera scale: bracket half width → 50 px (prompt3's lanes)
const P = 152 / SF; // codon pitch → lanes 152 px apart at the end (prompt3: 420, 572, 724)
const X0 = 960 - (5 * P + 2 * ADV) / 2; // first letter centre
const Y_DNA = 420, Y_RNA = 566, Y_AA = 604;
const BR_T = Y_RNA - FS * 0.74 - 12, BR_B = Y_RNA + 20; // codon bracket top / bottom
const SERIF = 10;
const slotX = (j: number) => X0 + Math.floor(j / 3) * P + (j % 3) * ADV;
const codonX = (k: number) => X0 + k * P + ADV;
// final framing: codon 0 at screen x 420, bracket tops (lane serifs) at screen y 228
const UC = codonX(0) + (960 - 420) / SF;
const VC = BR_T + (540 - 228) / SF;
const LANE_END_Y = 470; // screen y the lanes reach by the cut (prompt3 starts them there)
// prompt3 (dna-prompt-gel.ts): the empty bracket waits in lane 3 at its missing 650 bp band (log mobility 2000..100 bp → y 268..872)
const BRACKET_TO: [number, number] = [724, 268 + ((Math.log10(2000) - Math.log10(650)) / (Math.log10(2000) - Math.log10(100))) * (872 - 268)];

type Pt = { x: number; y: number };

export default class DnaLeftturnScene extends Scene {
  bg = makeBackdrop();
  cam = new Cam(30);
  page = new Layer2D();
  text = new Layer2D();

  lPrev!: Line; l1!: Line; l2!: Line;
  wSharp!: Word; wLeft!: Word; wThere!: Word;
  tS = 0; tE = 0; tSlide = 0; tStop = 0; tBar1 = 0; tBar2 = 0;
  kYaw: Key[] = []; kS: Key[] = []; kTU: Key[] = []; kTV: Key[] = []; kRoll: Key[] = []; kPitch: Key[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.tS = this.ctx.start; this.tE = this.ctx.end;
    this.lPrev = ly.get('obsolete');
    this.l1 = ly.get('Sharp left turn');
    this.l2 = ly.get('single CDR');
    this.wSharp = findWord(this.l1, 'Sharp');
    this.wLeft = findWord(this.l1, 'left');
    this.wThere = findWord(this.l1, 'there');
    this.tSlide = this.wLeft.start;
    this.tStop = this.wThere.start;
    // downbeats after "Without": the camera squares up across the first bar, the lanes grow over the next
    const db = au.downbeats.filter((d) => d > this.l2.words[0]!.start - 0.05);
    this.tBar1 = db[0] ?? this.l2.words[0]!.start + 0.7;
    this.tBar2 = db[1] ?? this.tBar1 + 1.818;
    const tw0 = this.tSlide - 0.02, tw1 = this.tSlide + 0.46; // the whip
    const io = ease.inOutCubic, lin = ease.linear;
    const whip = (x: number) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2); // inOutQuint
    const uMid = 960, vMid = (Y_DNA + Y_AA) / 2 + 40;
    const tSq = this.tBar1 + 1.0; // squared up over the lanes-to-be
    this.kS = [[this.tS, 1.16], [tw0, 1.22, lin], [tw1, 1.4, whip], [tw1 + 0.4, 1.36], [this.tBar1, 1.44, lin], [tSq, SF, io]];
    this.kYaw = [[tw0, 0], [tw1, -0.66, whip], [tw1 + 0.4, -0.58], [this.tBar1, -0.53, lin], [tSq, 0, io]];
    this.kRoll = [[tw0, 0], [tw1, -0.07, whip], [tw1 + 0.4, -0.05], [this.tBar1, -0.045, lin], [tSq, 0, io]];
    this.kPitch = [[tw0, 0], [tw1, 0.1, whip], [this.tBar1, 0.12, lin], [tSq, 0, io]];
    this.kTU = [[this.tS, uMid], [tw0, uMid], [tw1, codonX(1) - 40, whip], [this.tBar1, codonX(1) + 10, lin], [tSq, UC, io]];
    this.kTV = [[this.tS, vMid], [tw0, vMid], [tw1, vMid + 60, whip], [this.tBar1, vMid + 66, lin], [tSq, VC, io]];
  }

  // ------------------------------------------------------------------ camera: page (u, v) → world (u, −v, 0)
  private setCam(t: number) {
    const s = keys(t, this.kS);
    const dist = (1080 / 2 / Math.tan((30 * Math.PI) / 360)) / s;
    this.cam.orbit({ x: keys(t, this.kTU), y: -keys(t, this.kTV), z: 0 }, keys(t, this.kYaw), keys(t, this.kPitch), dist, keys(t, this.kRoll), 30);
  }
  private pj(u: number, v: number) { return this.cam.proj(u, -v, 0); }
  /** Canvas transform that maps page px around (u, v) onto the screen (a local affine of the perspective). */
  private at(c: CanvasRenderingContext2D, u: number, v: number) {
    const p = this.pj(u, v), px = this.pj(u + 1, v), py = this.pj(u, v + 1);
    c.setTransform(px.x - p.x, px.y - p.y, py.x - p.x, py.y - p.y, p.x, p.y);
    return p;
  }

  // ------------------------------------------------------------------ state
  /** mRNA letter j (original index): where it sits (slot, fractional) and how visible it is. */
  private rnaLetter(j: number, t: number) {
    if (j < DEL) return { slot: j, a: 1, lift: 0 };
    if (j === DEL) return { slot: j, a: 1 - prog(t, this.tSlide - 0.05, this.tSlide + 0.12), lift: 0 };
    const t0 = this.tSlide + 0.04 + 0.022 * (j - DEL - 1);
    const e = prog(t, t0, t0 + 0.34, ease.inOutCubic);
    return { slot: j - e, a: 1, lift: Math.sin(Math.PI * e) * 14 };
  }
  private slotPos(slot: number) {
    const i = Math.floor(slot), f = slot - i;
    return f < 1e-4 ? slotX(i) : lerp(slotX(i), slotX(i + 1), f);
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    this.setCam(t);
    const tCDR = this.l2.words[3]!.start;
    const dark = prog(t, tCDR + 0.35, tCDR + 0.95, ease.inOutCubic); // paper → the gel's black field
    this.bg.u.uPaper!.value = 1 - dark; this.bg.u.uPool!.value = 0; this.bg.u.uSeed!.value = 2.3;
    this.bg.render(renderer, out);

    this.drawPage(t, dark);
    comp.draw(renderer, this.page.upload(), out);
    this.drawText(t, dark);
    comp.draw(renderer, this.text.upload(), out);
    // a small kick-driven push while the consequence holds (verse 3 has drums; none after the lights go down)
    const kick = (f.a.kick ?? 0) * window01(t, this.tSlide + 0.6, this.tBar2, 0.2, 0.4);
    return { paper: 1 - dark, bloom: lerp(0.15, 0.4, dark), bloomThreshold: 0.95, vignette: lerp(0.2, 0.5, dark), grain: 0.045, halation: 0.08, ca: 0.3, zoom: 1 + 0.004 * kick };
  }

  // ------------------------------------------------------------------ the plate
  private drawPage(t: number, dark: number) {
    const c = this.page.ctx;
    this.page.clear();
    const inkC = (a: number) => rgba('ink', a);
    const tCDR = this.l2.words[3]!.start;
    const letters = 1 - prog(t, tCDR + 0.15, tCDR + 0.75, ease.inOutCubic); // the type leaves; the lanes remain
    const shifted = prog(t, this.tSlide + 0.1, this.tSlide + 0.5);
    const stopK = prog(t, this.tStop, this.tStop + 0.22, ease.outCubic);
    const dimK = prog(t, this.tStop + 0.05, this.tStop + 0.45, ease.inOutCubic);
    const lanes = prog(t, this.tBar1 + 0.3, this.tBar2 + 0.3, ease.inOutCubic);

    // the paper rule under the DNA row (handed over by the previous shot)
    if (letters > 0.01) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.strokeStyle = inkC(0.75 * letters); c.lineWidth = 1.3;
      c.beginPath();
      let open = false;
      for (let u = -900; u <= 2900; u += 60) {
        const p = this.pj(u, Y_DNA + 18);
        const ok = p.w > 200 && p.x > -400 && p.x < 2300;
        if (ok) { if (open) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }
        open = ok;
      }
      c.stroke();
    }

    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    // ---- row captions and strand ends
    if (letters > 0.01) {
      c.font = font(F.mono(500), 15);
      c.fillStyle = inkC(0.55 * letters);
      for (const [lab, y] of [['DNA', Y_DNA - 17], ['mRNA', Y_RNA - 17], ['protein', Y_AA + 30]] as const) {
        this.at(c, X0 - 96, y);
        c.textAlign = 'right'; c.fillText(lab, 0, 0);
      }
      c.font = font(F.mono(400), 20);
      c.fillStyle = inkC(0.5 * letters);
      c.textAlign = 'center';
      for (const y of [Y_DNA, Y_RNA]) {
        this.at(c, X0 - 50, y - 4); c.fillText('5′', 0, 0);
        this.at(c, slotX(17) + 52, y - 4); c.fillText('3′', 0, 0);
      }
    }

    // ---- DNA row (coding strand): the C is deleted on "Sharp" and leaves a hole
    const del = prog(t, this.wSharp.start, this.wSharp.start + 0.16, ease.inCubic);
    c.font = font(F.mono(500), FS);
    for (let j = 0; j < DNA.length && letters > 0.01; j++) {
      let a = letters;
      let dy = 0;
      if (j === DEL) { a *= 1 - del; dy = -10 * del; }
      if (a <= 0.01) continue;
      this.at(c, slotX(j), Y_DNA + dy);
      c.fillStyle = inkC(a);
      c.fillText(DNA[j]!, 0, 0);
    }

    // ---- transcription hairlines: each mRNA base under the DNA base it copies. Past the deletion they
    //      lean, since every downstream base now sits one place to the left in the new frame.
    if (letters > 0.01) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.strokeStyle = inkC(0.3 * letters); c.lineWidth = 1;
      c.beginPath();
      for (let j = 0; j < DNA.length; j++) {
        const L = this.rnaLetter(j, t);
        const a = j === DEL ? 1 - del : 1;
        if (a < 0.5 || L.a < 0.5) continue;
        const p0 = this.pj(slotX(j), Y_DNA + 30), p1 = this.pj(this.slotPos(L.slot), BR_T - 8);
        c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y);
      }
      c.stroke();
    }

    // ---- mRNA row: the U closes up after the deletion, downstream letters slide one place
    for (let j = 0; j < RNA.length && letters > 0.01; j++) {
      const L = this.rnaLetter(j, t);
      if (L.a <= 0.01) continue;
      const newSlot = j < DEL ? j : j - 1;
      const dimmed = j > DEL && newSlot >= 6 ? dimK : 0; // past the new STOP
      this.at(c, this.slotPos(L.slot), Y_RNA - L.lift);
      c.fillStyle = inkC(L.a * letters * (1 - 0.72 * dimmed));
      c.fillText(RNA[j]!, 0, 0);
    }

    // ---- codon brackets (the reading frame, anchored at AUG); the first three become lanes
    for (let k = 0; k < 6; k++) {
      const isLane = k < 3;
      const dimmed = k >= 2 ? dimK * (isLane ? 1 - dark : 1) : 0; // the lanes come back up to strength on the gel
      const keep = isLane ? 1 : letters;
      const a = keep * (1 - 0.7 * dimmed);
      if (a <= 0.01) continue;
      const cx = codonX(k);
      const incomplete = k === 5 ? shifted : 0; // after the shift the last bracket holds two bases
      const heavy = k === 1 ? stopK : 0;
      const bot = lerp(BR_B, this.laneBottom(), isLane ? lanes : 0);
      const col = isLane ? this.laneCol(dark) : 'ink';
      const lw = lerp(1.6, 3.2, heavy) * (isLane ? lerp(1, 0.7, dark) : 1);
      for (const sx of [-1, 1] as const) {
        const x = cx + sx * HB;
        const pts: Pt[] = [{ x: x - sx * SERIF, y: BR_T }, { x, y: BR_T }, { x, y: bot }];
        if (lanes < 0.02 || !isLane) pts.push({ x: x - sx * SERIF, y: bot });
        const dashed = sx === 1 && incomplete > 0.5;
        this.strokePage(c, pts, col, a * (isLane ? lerp(0.85, 0.6, dark) : 0.85), lw, dashed);
      }
    }
    // wells at the lane tops, as the gel takes over
    const wellA = prog(t, this.tBar2 - 0.2, this.tBar2 + 0.4);
    if (wellA > 0.01) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      for (let k = 0; k < 3; k++) {
        const p = this.pj(codonX(k), BR_T - 14 / SF);
        c.fillStyle = rgba('ink', 0.95 * wellA);
        c.fillRect(p.x - 42, p.y - 7, 84, 14);
        c.strokeStyle = rgba('ash', 0.5 * wellA); c.lineWidth = 1;
        c.strokeRect(p.x - 41.5, p.y - 6.5, 83, 13);
      }
    }

    // ---- translation row: before, Met Leu Lys Ala Gly STOP; after "there", Met STOP and nothing past it
    c.textAlign = 'center';
    for (let k = 0; k < 6 && letters > 0.01; k++) {
      const old = k === 0 ? 1 : 1 - prog(t, this.tSlide + 0.05, this.tSlide + 0.3);
      const isStop = AA_BEFORE[k] === 'STOP';
      if (k === 0 || old > 0.01) {
        this.at(c, codonX(k), Y_AA + 34);
        c.font = font(F.mono(isStop ? 700 : 500), 26);
        c.fillStyle = inkC(0.8 * old * letters);
        c.fillText(AA_BEFORE[k]!, 0, 0);
      }
    }
    if (stopK > 0.01 && letters > 0.01) {
      this.at(c, codonX(1), Y_AA + 34 + 8 * (1 - stopK));
      c.font = font(F.mono(700), 26);
      c.fillStyle = inkC(0.95 * stopK * letters);
      c.fillText('STOP', 0, 0);
      // a rule closes the protein after its first residue
      const r0 = this.pj(codonX(0) - 40, Y_AA + 46), r1 = this.pj(codonX(1) + 44, Y_AA + 46);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.strokeStyle = inkC(0.6 * stopK * letters); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(r0.x, r0.y); c.lineTo(lerp(r0.x, r1.x, stopK), lerp(r0.y, r1.y, stopK)); c.stroke();
    }

    // ---- the orange focus bracket: on the C, then around its absence; at the end it goes to wait in lane 3
    this.drawFocus(c, t);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.textAlign = 'left';
  }

  private laneCol(dark: number) {
    // ink on the paper, graphite on the gel's black field like prompt3's lanes (hex mix: never drops out)
    const a = [0x0a, 0x0a, 0x0b], b = [0x6e, 0x6b, 0x66], k = smoothstep(0.3, 0.7, dark);
    return '#' + a.map((x, i) => Math.round(lerp(x, b[i]!, k)).toString(16).padStart(2, '0')).join('');
  }
  /** Page y of the lanes' lower ends at the cut (screen LANE_END_Y at the final framing). */
  private laneBottom() { return VC + (LANE_END_Y - 540) / SF; }

  private strokePage(c: CanvasRenderingContext2D, pts: Pt[], col: string, a: number, lw: number, dashed: boolean) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.strokeStyle = rgba(col, a); c.lineWidth = lw;
    c.lineJoin = 'miter'; c.lineCap = 'butt';
    if (dashed) c.setLineDash([4, 5]);
    c.beginPath();
    pts.forEach((q, i) => { const p = this.pj(q.x, q.y); if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); });
    c.stroke();
    if (dashed) c.setLineDash([]);
  }

  private drawFocus(c: CanvasRenderingContext2D, t: number) {
    const del = prog(t, this.wSharp.start, this.wSharp.start + 0.16);
    const go = prog(t, this.tBar2 - 0.2, this.tBar2 + 0.7, ease.inOutCubic);
    const u = slotX(DEL), v = Y_DNA - FS * 0.36;
    // a small tighten as the base goes (it doesn't let go)
    const pulse = Math.sin(Math.PI * clamp((t - this.wSharp.start) / 0.3)) * 0.12;
    const size = 26 * (1 - pulse);
    if (go <= 0) {
      this.at(c, u, v);
      focusBracket(c, 0, 0, { size, alpha: 1, empty: del > 0.5 });
      return;
    }
    // glide in screen space to prompt3's place for it
    c.setTransform(1, 0, 0, 1, 0, 0);
    const p = this.pj(u, v);
    const x = lerp(p.x, BRACKET_TO[0], go), y = lerp(p.y, BRACKET_TO[1], go);
    focusBracket(c, x, y, { size: lerp(26 * p.s, 30, go), alpha: 1, empty: true });
  }

  // ------------------------------------------------------------------ lyrics and the one label
  private drawText(t: number, dark: number) {
    const c = this.text.ctx;
    this.text.clear();
    const on = dark < 0.5 ? 'ink' : 'bone'; // flips while the paper is mid-grey (both read on it)
    const onK = (a: number) => a;
    // carry-in: the tail of "obsolete", in exactly bureau's two rows (dna-bureau.ts), so the cut
    // doesn't resize the line. "Now von Neumann's" is already sung: it leaves at once, clearing the
    // place "Sharp left turn" arrives in; the big "obsolete" finishes, then goes.
    const pw = this.lPrev.words;
    karaokeRow(c, pw.slice(0, 3), 130, 862, F.archivo(100, 800), 84, t, onK(1 - prog(t, this.tS, this.tS + 0.05)), { on });
    karaokeRow(c, pw.slice(3), 130, 975, F.archivo(125, 900), 130, t, onK(1 - prog(t, this.lPrev.end + 0.02, this.lPrev.end + 0.16)), { on });
    // "Sharp left turn" / "and there you are" (the first row anticipates only after the carry has cleared)
    const w1 = this.l1.words, iAnd = w1.findIndex((w) => w.w === 'and');
    const out1 = 1 - prog(t, this.l1.end, this.l1.end + 0.16);
    karaokeRow(c, w1.slice(0, iAnd), 130, 852, F.archivo(100, 900), 116, t, onK(out1), { on, lead: 0.06 });
    karaokeRow(c, w1.slice(iAnd), 130, 962, F.archivo(100, 800), 96, t, onK(out1), { on });
    // "Without a single CDR": one row; as the plate becomes the gel it settles where prompt3 carries it
    const m = prog(t, this.tBar2 - 0.1, this.tBar2 + 0.8, ease.inOutCubic);
    const size = lerp(100, 58, m), x = lerp(130, 900, m), y = lerp(748, 262, m);
    karaokeRow(c, this.l2.words, x, y, F.archivo(100, 700), size, t, onK(1), { on, lead: 0.1 });

    // the one explanatory label, pointing at the absence
    const la = window01(t, this.tSlide + 0.55, this.tBar1 + 0.2, 0.3, 0.3);
    if (la > 0.01) {
      const p = this.pj(slotX(DEL), Y_DNA - FS * 0.36 - 34);
      monoLabel(c, 'frameshift (−1) · synthetic example', clamp(p.x + 70, 140, 1400), clamp(p.y - 90, 120, 900), p.x + 6, p.y, la, 'graphite');
    }
  }
}
