// prompt2 ("Sydney, please let me free") — a thermal-cycler plate on bone paper.
//  52.508–52.825: the hero fold still plays underneath (the timeline overlaps it so "rearranging"
//      finishes). Its light pool widens into the instrument sheet; the fold's protein and "I feel my"
//      fade; REARRANGING stays registered, then erodes along the sheet's rulings into the template:
//      the word's cap line and baseline become the two strands (the graph paper is registered to them).
//  "Sydney," (held): cycle 1, slow and labelled — denature (the strands part), anneal (primers dock at
//      their sites), extend (a polymerase copies each strand from its primer).
//  "please let me free": cycles 2–5 accelerate; the primer-to-primer product appears and takes over,
//      so the copies line up like a justified column of type; one amplification curve rises and
//      plateaus. The orange focus bracket marks one sequence position and repeats on every copy
//      (a marker on the copied sequence, not an inherited dye).
// Strand genealogy is exact for the schematic: a primer copies its template from the primer site to the
// template's end, so defined-length products accumulate from cycle 2 on. Pure function of song time.
import * as THREE from 'three';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, lerp, prog, smoothstep, window01 } from '../engine/util';
import { HBONDS, PAIR, focusBracket, monoLabel, sequence, LIN, rgba, type Base, type RGB } from './dna-kit';
import { Memo, typedRow, type Plate } from './dna-prompt-type';

// ---- the plate's geometry (logical px; the sheet's graph paper is registered to it)
const SP = 25; // px per base pair, and the graph-paper pitch
const NBP = 64; // template length (bp)
const X0 = 160; // template's left end
const IA = 15, IB = 51, LP = 5; // amplicon [IA, IB) between the primer sites; primer length
const IBR = 40; // the bracketed position (inside the amplicon)
const Y0 = 440, Y1 = 840, YC = 640, H0 = 125; // product band; the template's centre and rail gap
const GEN = 5; // generations shown (1 → 32 duplexes)
const GRID_OX = 22.5, GRID_OY = 2.5; // grid offsets: rungs sit on the verticals, rails on the horizontals
const bpX = (i: number) => X0 + (i + 0.5) * SP;
const lenPur = 0.49, lenPyr = 0.37; // half-rung lengths as a fraction of the rail gap (a pair leaves 0.14 for H-bonds)
const HB = 0.14;

interface Ext { s: number; e: number } // bp extent [s, e) of a strand
interface Dup { f: Ext; r: Ext } // F: top rail (5'→3' left to right); R: bottom rail (antiparallel)

// the paper sheet: ink ↔ bone paper with the fold's light pool, plus faint graph paper drawn in
const SHEET = /* glsl */ `
uniform float uPaper; uniform vec2 uPoolC; uniform vec2 uPoolR; uniform float uPool;
uniform float uGrid; uniform vec2 uGridC; uniform float uGridR;
float gridLine(float v, float off, float sp) { float d = abs(mod(v - off + 0.5 * sp, sp) - 0.5 * sp); return pxLine(d * PX_SCALE, 0.0, 1.0); }
void main() {
  vec2 px = FRAG_PX;
  vec2 q = vec2(px.x, 1080.0 - px.y); // y down, logical
  vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 ink = C_INK + C_INK2 * 0.5 * (1.0 - smoothstep(0.1, 1.0, length(p)));
  float fib = fbm(px * vec2(0.010, 0.022), 4) * 0.5 + fbm(px * 0.06, 2) * 0.25;
  vec3 paper = C_BONE * (0.9 + 0.06 * fib) * vec3(1.0, 0.985, 0.95);
  vec3 sheet = paper * (1.0 - 0.16 * smoothstep(0.45, 1.1, length(p)));
  vec3 c = mix(ink, sheet, uPaper);
  vec2 d = (q - uPoolC) / uPoolR;
  c = mix(c, paper, exp(-dot(d, d) * 1.35) * uPool);
  // graph paper: minor lines every ${SP} px, major every 5
  float mnr = max(gridLine(q.x, ${GRID_OX.toFixed(1)}, ${SP.toFixed(1)}), gridLine(q.y, ${GRID_OY.toFixed(1)}, ${SP.toFixed(1)}));
  float mjr = max(gridLine(q.x, ${(GRID_OX + 2 * SP).toFixed(1)}, ${(5 * SP).toFixed(1)}), gridLine(q.y, ${(GRID_OY + 2 * SP).toFixed(1)}, ${(5 * SP).toFixed(1)}));
  float rv = 1.0 - smoothstep(uGridR - 160.0, uGridR, length((q - uGridC) * vec2(0.62, 1.0)));
  float lum = smoothstep(0.25, 0.7, luma(c));
  c = mix(c, C_INK, (0.045 * mnr + 0.06 * mjr) * rv * uGrid * lum);
  fragColor = vec4(c, 1.0);
}`;

// the fold's frame over the sheet: everything fades except the word, which erodes along the rulings
const HANDOFF = /* glsl */ `
uniform sampler2D uUnder; uniform float uK1; uniform float uK2; uniform vec4 uRect;
void main() {
  vec3 u = texture(uUnder, vUv).rgb;
  vec2 q = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  float inR = smoothstep(uRect.x - 20.0, uRect.x, q.x) * (1.0 - smoothstep(uRect.z, uRect.z + 20.0, q.x))
            * smoothstep(uRect.y - 20.0, uRect.y, q.y) * (1.0 - smoothstep(uRect.w, uRect.w + 20.0, q.y));
  float word = inR * (1.0 - smoothstep(0.1, 0.42, luma(u)));
  // distance to the nearest horizontal ruling; the letters thin toward it, then go
  float g = abs(mod(q.y - ${GRID_OY.toFixed(1)} + ${(0.5 * SP).toFixed(1)}, ${SP.toFixed(1)}) - ${(0.5 * SP).toFixed(1)});
  float keepR = ${(0.5 * SP).toFixed(1)} * (1.0 - uK2) + 0.6;
  float keep = (1.0 - smoothstep(keepR - 1.2, keepR + 1.2, g)) * (1.0 - smoothstep(0.82, 1.0, uK2));
  float a = (1.0 - uK1) * (1.0 - word) + word * keep;
  fragColor = vec4(u, a);
}`;

export class PcrPlate implements Plate {
  sheet = new FSPass(SHEET, {
    uPaper: { value: 0 }, uPoolC: { value: new THREE.Vector2(1035, 618) }, uPoolR: { value: new THREE.Vector2(1037, 539) }, uPool: { value: 1 },
    uGrid: { value: 0 }, uGridC: { value: new THREE.Vector2(1065, 640) }, uGridR: { value: 0 },
  });
  handoff = new FSPass(HANDOFF, {
    uUnder: { value: null }, uK1: { value: 0 }, uK2: { value: 0 }, uRect: { value: new THREE.Vector4(330, 548, 1800, 735) },
  }, { blending: THREE.NormalBlending, transparent: true });
  L = new LineBatch(26000, { screen2D: true, blend: 'normal' });
  text = new Layer2D();
  sheetMemo = new Memo();
  line!: Line;
  seq: Base[] = sequence(NBP, 52);
  gens: Dup[][] = [];
  /** Cycle windows [start, end] and phase splits (denature | anneal | extend). */
  cyc: { t0: number; t1: number; a: number; b: number }[] = [];
  tS = 0; tSyd = 0; tSet = 0; tEnd = 0;

  constructor(private ctx: SceneCtx) {}

  init() {
    const { lyrics, audio } = this.ctx;
    this.tS = this.ctx.start; this.tEnd = this.ctx.end;
    this.line = lyrics.get('Sydney, please');
    this.tSyd = this.line.words[0]!.start;
    // genealogy: a reverse primer copies an F strand from IB back to its 5' end; a forward primer
    // copies an R strand from IA to its 5' end (so primer-to-primer products appear from cycle 2 on)
    this.gens = [[{ f: { s: 0, e: NBP }, r: { s: 0, e: NBP } }]];
    for (let g = 0; g < GEN; g++) {
      const nx: Dup[] = [];
      for (const d of this.gens[g]!) {
        nx.push({ f: d.f, r: { s: d.f.s, e: IB } });
        nx.push({ f: { s: IA, e: d.r.e }, r: d.r });
      }
      this.gens.push(nx);
    }
    // cycles on the beat grid: cycle 1 over "Sydney," (two beats a step), cycles 2–3 two beats each,
    // cycles 4–5 one beat each; the copies set on the last downbeat before the cut
    const kD = Math.ceil(audio.beatAt(this.tSyd) - 1e-3);
    const b = (k: number) => audio.timeOfBeat(kD + k);
    this.cyc = [
      { t0: b(0), t1: b(6), a: 1 / 3, b: 2 / 3 },
      { t0: b(6), t1: b(8), a: 0.3, b: 0.55 },
      { t0: b(8), t1: b(10), a: 0.3, b: 0.55 },
      { t0: b(10), t1: b(11), a: 0.3, b: 0.55 },
      { t0: b(11), t1: b(12), a: 0.3, b: 0.55 },
    ];
    this.tSet = b(12);
  }

  // ------------------------------------------------------------------ layout
  private cy(g: number, j: number) { return g === 0 ? YC : Y0 + (j + 0.5) * (Y1 - Y0) / (1 << g); }
  private hg(g: number) { return g === 0 ? H0 : Math.min(H0, 0.55 * (Y1 - Y0) / (1 << g)); }

  /** Where the cycle stands at t: the generation being made and the three phase progresses. */
  private phase(t: number) {
    for (let k = 0; k < this.cyc.length; k++) {
      const c = this.cyc[k]!;
      if (t < c.t1 || k === this.cyc.length - 1) {
        const u = clamp((t - c.t0) / (c.t1 - c.t0));
        if (t < c.t0) return { g: k, den: 0, ann: 0, ext: 0, done: k === 0 ? 0 : 1 };
        return { g: k, den: prog(u, 0, c.a, ease.inOutCubic), ann: prog(u, c.a, c.b, ease.outCubic), ext: prog(u, c.b, 1, ease.inOutQuad), done: 0 };
      }
    }
    return { g: GEN - 1, den: 1, ann: 1, ext: 1, done: 0 };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    // ---- sheet: the fold's pool widens into the full sheet; the graph paper draws in from the word
    const kPaper = prog(t, this.tS + 0.05, this.tSyd + 0.55, ease.inOutCubic);
    const gridR = lerp(0, 2300, prog(t, this.tS + 0.06, this.tSyd + 0.35, ease.inOutQuad));
    const still = kPaper >= 1 && gridR >= 2300; // from here on the sheet is one constant image
    const sheet = this.sheetMemo.get(still ? 'sheet' : null, (rt) => {
      const u = this.sheet.u;
      u.uPaper!.value = kPaper; u.uPool!.value = 1 - kPaper; u.uGrid!.value = 1; u.uGridR!.value = gridR;
      this.sheet.render(renderer, rt);
    });
    comp.draw(renderer, sheet, out, { mode: 'replace' });

    // ---- molecules
    this.L.clear();
    const ph = this.phase(t);
    const draw = prog(t, this.tS + 0.12, this.tSyd - 0.02, ease.inOutCubic); // the template draws in
    this.drawMolecules(t, ph, draw);
    this.drawCurve(t);
    this.L.render(renderer, out);

    // ---- the fold's frame, registered, while it lasts
    if (f.under && f.tin < 1) {
      const h = this.handoff.u;
      h.uUnder!.value = f.under;
      h.uK1!.value = prog(t, this.tS, this.tS + 0.16, ease.inOutQuad);
      h.uK2!.value = prog(t, this.tS + 0.12, this.tSyd - 0.01, ease.inQuad);
      this.handoff.render(renderer, out);
    }

    // ---- lyrics, bracket(s), polymerase, label
    const c = this.text.ctx;
    this.text.clear();
    this.drawPolymerase(c, ph);
    this.drawBrackets(c, t, ph);
    this.drawLabel(c, t, ph);
    this.drawLyrics(c, t, f.beat);
    comp.draw(renderer, this.text.upload(), out);
    // (matches the fold's post through the overlap)
    return { bloom: 0.42, bloomThreshold: 0.9, vignette: lerp(0.42, 0.34, kPaper), ca: lerp(1.2, 0.5, kPaper), zoom: 1 + 0.003 * (f.a.kick ?? 0) };
  }

  // ------------------------------------------------------------------ molecules
  /**
   * One strand as a rail with its bases (half-rungs) toward the partner. `dir` +1 = bases hang down
   * (F, top rail), −1 = up (R). `ext` is the bp range present; `pairedFrom/To` the range whose H-bond
   * ticks show; `x0/x1` clip in px (drawing in).
   */
  private strand(ext: Ext, y: number, dir: number, gap: number, isF: boolean, alpha: number, x0 = -1e9, x1 = 1e9, ticks = 0, pair?: Ext) {
    if (alpha <= 0.002 || ext.e <= ext.s) return;
    const L = this.L, ink = LIN.ink;
    const xa = Math.max(x0, X0 + ext.s * SP), xb = Math.min(x1, X0 + ext.e * SP);
    if (xb <= xa) return;
    const rw = gap > 60 ? 3.4 : gap > 20 ? 2.5 : 1.6;
    L.seg2(xa, y, xb, y, rw, ink, 0.94 * alpha);
    // a primer is the 5' end of every copy (F copies start at IA, R copies end at IB): drawn heavier
    const pr = isF ? (ext.s === IA ? { s: IA, e: IA + LP } : null) : (ext.e === IB ? { s: IB - LP, e: IB } : null);
    if (pr) {
      const pa = Math.max(xa, X0 + pr.s * SP), pb = Math.min(xb, X0 + pr.e * SP);
      if (pb > pa) L.seg2(pa, y - dir * rw * 0.6, pb, y - dir * rw * 0.6, rw * 1.9, ink, 0.94 * alpha);
    }
    const simple = gap < 16;
    const bw = gap > 60 ? 2.4 : gap > 20 ? 1.9 : 1.3;
    for (let i = Math.floor(ext.s); i < Math.ceil(ext.e); i++) {
      const x = bpX(i);
      if (x < xa || x > xb) continue;
      const bF = this.seq[i]!, b = isF ? bF : PAIR[bF];
      const pur = b === 'A' || b === 'G';
      const len = simple ? gap * 0.44 : gap * (pur ? lenPur : lenPyr);
      L.seg2(x, y, x, y + dir * len, bw, ink, 0.85 * alpha);
      // purines end in a small bar (two rings), pyrimidines don't: the copies' barcode repeats exactly
      if (!simple && pur && gap > 40) L.seg2(x - 3.5, y + dir * len, x + 3.5, y + dir * len, 1.4, ink, 0.8 * alpha);
      if (ticks > 0 && pair && x >= X0 + pair.s * SP && x <= X0 + pair.e * SP && gap > 30 && isF) {
        const n = HBONDS[bF], yb = y + len, ye = yb + gap * HB;
        for (let k = 0; k < n; k++) {
          const yy = lerp(yb, ye, (k + 1) / (n + 1));
          L.seg2(x - 3, yy, x + 3, yy, 1.1, ink, 0.7 * alpha * ticks);
        }
      }
    }
  }

  /** A complete duplex (F on top, R below) at centre cy, rail gap h. */
  private duplex(d: Dup, cy: number, h: number, alpha: number, x0 = -1e9, x1 = 1e9, ticks = 1) {
    const pair = { s: Math.max(d.f.s, d.r.s), e: Math.min(d.f.e, d.r.e) };
    this.strand(d.f, cy - h / 2, 1, h, true, alpha, x0, x1, ticks, pair);
    this.strand(d.r, cy + h / 2, -1, h, false, alpha, x0, x1);
  }

  private drawMolecules(t: number, ph: ReturnType<PcrPlate['phase']>, draw: number) {
    const g = ph.g;
    const setK = prog(t, this.tSet, this.tSet + 0.25, ease.inOutCubic);
    if (ph.den <= 0) {
      // a finished generation (the template before cycle 1)
      const gg = ph.done ? g : g;
      const ds = this.gens[gg]!;
      const h = this.hg(gg);
      const xm = 1065, half = lerp(0, 1000, draw);
      ds.forEach((d, j) => this.duplex(d, this.cy(gg, j), h, 1, gg === 0 ? xm - half : -1e9, gg === 0 ? xm + half : 1e9, gg === 0 ? smoothstep(0.8, 1, draw) : 1));
      return;
    }
    const last = g === GEN - 1 && t >= this.cyc[GEN - 1]!.t1;
    if (last) {
      // set like type: the primer-to-primer copies stay; overhangs and the long strands fade
      const ds = this.gens[GEN]!, h = this.hg(GEN);
      ds.forEach((d, j) => {
        const cy = this.cy(GEN, j);
        const defined = d.f.s === IA && d.f.e === IB && d.r.s === IA && d.r.e === IB;
        const a = defined ? 1 : lerp(1, 0.14, setK);
        this.duplex(d, cy, h, a);
      });
      return;
    }
    const ds = this.gens[g]!, nx = this.gens[g + 1]!;
    const h0 = this.hg(g), h1 = this.hg(g + 1);
    ds.forEach((d, j) => {
      // denature: the pair parts; each strand travels to its slot in the next generation
      const yF = lerp(this.cy(g, j) - h0 / 2, this.cy(g + 1, 2 * j) - h1 / 2, ph.den);
      const yR = lerp(this.cy(g, j) + h0 / 2, this.cy(g + 1, 2 * j + 1) + h1 / 2, ph.den);
      const gap = lerp(h0, h1, ph.den);
      const tick = 1 - smoothstep(0, 0.25, ph.den);
      const pair = { s: Math.max(d.f.s, d.r.s), e: Math.min(d.f.e, d.r.e) };
      this.strand(d.f, yF, 1, gap, true, 1, -1e9, 1e9, tick, pair);
      this.strand(d.r, yR, -1, gap, false, 1);
      if (ph.ann <= 0) return;
      // anneal: primers dock at their sites (drifting in from the solution); extend: they grow to the template's end
      const nF = nx[2 * j]!, nR = nx[2 * j + 1]!; // nF: template F + new R; nR: new F + template R
      const off = (1 - ph.ann) * h1 * 0.9;
      const aP = smoothstep(0, 0.45, ph.ann);
      const grow = (from: number, to: number) => lerp(from, to, ph.ext);
      // new R strand under the F template: primer at [IB−LP, IB), grows leftward to nF.r.s
      const rS = grow(IB - LP, nF.r.s);
      const cyF = this.cy(g + 1, 2 * j), cyR = this.cy(g + 1, 2 * j + 1);
      const tickF = smoothstep(0.8, 1.0, ph.ann);
      this.strand({ s: rS, e: IB }, cyF + h1 / 2 + off, -1, h1, false, aP);
      if (tickF > 0) this.strandTicks(nF.f, { s: rS, e: IB }, cyF - h1 / 2, h1, tickF * aP);
      // new F strand over the R template: primer at [IA, IA+LP), grows rightward to nR.f.e
      const fE = grow(IA + LP, nR.f.e);
      this.strand({ s: IA, e: fE }, cyR - h1 / 2 - off, 1, h1, true, aP, -1e9, 1e9, tickF, { s: IA, e: fE });
    });
  }

  /** H-bond ticks of an F strand (template) where a new partner has formed below it. */
  private strandTicks(ext: Ext, pair: Ext, y: number, gap: number, a: number) {
    if (gap <= 30) return;
    const L = this.L, ink = LIN.ink;
    const lo = Math.max(ext.s, pair.s), hi = Math.min(ext.e, pair.e);
    for (let i = Math.floor(lo); i < Math.ceil(hi); i++) {
      const x = bpX(i);
      if (x < X0 + lo * SP || x > X0 + hi * SP) continue;
      const bF = this.seq[i]!, pur = bF === 'A' || bF === 'G';
      const yb = y + gap * (pur ? lenPur : lenPyr), ye = yb + gap * HB, n = HBONDS[bF];
      for (let k = 0; k < n; k++) {
        const yy = lerp(yb, ye, (k + 1) / (n + 1));
        L.seg2(x - 3, yy, x + 3, yy, 1.1, ink, 0.7 * a);
      }
    }
  }

  // ------------------------------------------------------------------ amplification curve
  /** Cycle number shown on the curve at t: 1–3 slowly (the flat baseline), then it races to the plateau. */
  private cycleAt(t: number) {
    const c = this.cyc;
    if (t < c[0]!.t0) return 0;
    if (t < c[0]!.t1) return prog(t, c[0]!.t0, c[0]!.t1);
    if (t < c[2]!.t1) return 1 + prog(t, c[1]!.t0, c[2]!.t1) * 2;
    return 3 + 35 * prog(t, c[3]!.t0, this.tSet + 0.2, ease.inOutCubic);
  }
  private drawCurve(t: number) {
    const a = prog(t, this.tSyd + 0.1, this.tSyd + 0.6);
    if (a <= 0) return;
    const L = this.L, ink = LIN.ink;
    const cx0 = 1335, cx1 = 1760, cyT = 152.5, cyB = 377.5; // on the graph paper's major lines
    L.seg2(cx0, cyT - 12, cx0, cyB, 1.6, ink, 0.8 * a);
    L.seg2(cx0, cyB, cx1 + 10, cyB, 1.6, ink, 0.8 * a);
    for (let k = 0; k <= 40; k += 10) { const x = lerp(cx0, cx1, k / 40); L.seg2(x, cyB, x, cyB + 7, 1.2, ink, 0.7 * a); }
    const val = (cyc: number) => 0.03 + 0.92 / (1 + Math.exp(-(cyc - 24) / 2.1));
    const cNow = this.cycleAt(t);
    let px = cx0, py = cyB - (cyB - cyT) * val(0);
    const n = Math.max(2, Math.ceil(cNow * 4));
    for (let i = 1; i <= n; i++) {
      const cc = (cNow * i) / n;
      const x = lerp(cx0, cx1, cc / 40), y = cyB - (cyB - cyT) * val(cc);
      L.seg2(px, py, x, y, 2.2, ink, 0.92 * a);
      px = x; py = y;
    }
    L.seg2(px, py, px + 0.01, py, 8, ink, a);
  }

  // ------------------------------------------------------------------ annotations
  private drawPolymerase(c: CanvasRenderingContext2D, ph: ReturnType<PcrPlate['phase']>) {
    if (ph.den <= 0 || ph.ext <= 0 || ph.ext >= 1 || ph.g >= 3) return;
    const g = ph.g, h1 = this.hg(g + 1);
    const a = Math.min(smoothstep(0, 0.08, ph.ext), 1 - smoothstep(0.92, 1, ph.ext));
    this.gens[g]!.forEach((_, j) => {
      const nF = this.gens[g + 1]![2 * j]!, nR = this.gens[g + 1]![2 * j + 1]!;
      const heads: [number, number][] = [
        [X0 + lerp(IB - LP, nF.r.s, ph.ext) * SP, this.cy(g + 1, 2 * j) + h1 * 0.18],
        [X0 + lerp(IA + LP, nR.f.e, ph.ext) * SP, this.cy(g + 1, 2 * j + 1) - h1 * 0.18],
      ];
      for (const [x, y] of heads) blob(c, x, y, h1 * 0.36, h1 * 0.5, a);
    });
  }

  private drawBrackets(c: CanvasRenderingContext2D, t: number, ph: ReturnType<PcrPlate['phase']>) {
    const x = bpX(IBR);
    const a0 = prog(t, this.tSyd - 0.1, this.tSyd + 0.25);
    if (a0 <= 0) return;
    const size = (h: number) => clamp(h * 0.2, 5, 15);
    const one = (y: number, h: number, a = 1) => (h < 16 ? miniBracket(c, x, y, clamp(h * 0.42, 3, 6), a0 * a) : focusBracket(c, x, y, { size: size(h), alpha: a0 * a }));
    if (ph.den <= 0 || (ph.g === GEN - 1 && t >= this.cyc[GEN - 1]!.t1)) {
      const g = ph.den <= 0 ? ph.g : GEN, h = this.hg(g);
      this.gens[g]!.forEach((_, j) => one(this.cy(g, j), h));
      return;
    }
    const g = ph.g, h0 = this.hg(g), h1 = this.hg(g + 1);
    this.gens[g]!.forEach((_, j) => {
      const gap = lerp(h0, h1, ph.den);
      const yF = lerp(this.cy(g, j) - h0 / 2, this.cy(g + 1, 2 * j) - h1 / 2, ph.den);
      const yR = lerp(this.cy(g, j) + h0 / 2, this.cy(g + 1, 2 * j + 1) + h1 / 2, ph.den);
      // the pair's bracket splits onto the two parted strands, and rejoins a pair as each copy passes it
      const rS = lerp(IB - LP, this.gens[g + 1]![2 * j]!.r.s, ph.ext), fE = lerp(IA + LP, this.gens[g + 1]![2 * j + 1]!.f.e, ph.ext);
      const pF = ph.ext > 0 && rS <= IBR ? 1 : 0, pR = ph.ext > 0 && fE >= IBR + 1 ? 1 : 0;
      const sF = ph.den < 0.02 ? 0 : 1;
      const yFb = lerp(yF + gap * 0.26, this.cy(g + 1, 2 * j), pF), yRb = lerp(yR - gap * 0.26, this.cy(g + 1, 2 * j + 1), pR);
      if (sF === 0) { one(this.cy(g, j), h0); return; }
      one(lerp(this.cy(g, j), yFb, smoothstep(0, 0.3, ph.den)), gap);
      one(lerp(this.cy(g, j), yRb, smoothstep(0, 0.3, ph.den)), gap);
    });
  }

  private drawLabel(c: CanvasRenderingContext2D, t: number, ph: ReturnType<PcrPlate['phase']>) {
    // one label at a time, cycle 1 only: the three steps with typical (protocol-dependent) temperatures
    const c1 = this.cyc[0]!, d = c1.t1 - c1.t0;
    const steps: [string, number, number][] = [
      ['denature · typical 95 °C', c1.t0, c1.t0 + d / 3],
      ['anneal · typical 55 °C', c1.t0 + d / 3, c1.t0 + (2 * d) / 3],
      ['extend · typical 72 °C', c1.t0 + (2 * d) / 3, c1.t1],
    ];
    const h1 = this.hg(1);
    steps.forEach(([txt, a, b], k) => {
      const al = window01(t, a + 0.05, b - 0.02, 0.18, 0.18);
      if (al <= 0) return;
      // anchors: the parting rail's end / the docked primer / the copy's growing end
      const ax = k === 0 ? bpX(3) : k === 1 ? bpX(IA + 2) : bpX(30);
      const ay = k === 0 ? lerp(YC + H0 / 2, this.cy(1, 1) + h1 / 2, ph.den) + 8 : this.cy(1, 1) - h1 / 2 - 6;
      if (k === 2 && X0 + lerp(IA + LP, NBP, ph.ext) * SP < ax + 10) return;
      monoLabel(c, txt, ax + 36, 912, ax, ay, al, 'graphite');
    });
  }

  private drawLyrics(c: CanvasRenderingContext2D, t: number, beat: number) {
    const w = this.line.words;
    typedRow(c, w.slice(0, 1), 156, 292, F.archivo(100, 900), 176, t, 1, { on: 'ink', dim: 0.22, lead: 0.3, caret: 1, beat });
    typedRow(c, w.slice(1), 162, 404, F.archivo(100, 800), 92, t, 1, { on: 'ink', dim: 0.22, caret: 1, beat });
  }
}

/** A schematic polymerase: an engraved ellipse (paper fill, ink rim, hatching toward the lower right). */
function blob(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a: number) {
  if (a <= 0.01 || rx < 4) return;
  c.save();
  c.globalAlpha = a;
  c.beginPath(); c.ellipse(x, y, rx, ry, -0.35, 0, Math.PI * 2);
  c.fillStyle = rgba('bone', 0.96); c.fill();
  c.save(); c.clip();
  c.strokeStyle = rgba('ink', 0.55); c.lineWidth = 1;
  c.beginPath();
  for (let k = -8; k <= 8; k++) {
    const o = k * Math.max(3.5, rx * 0.16);
    const w = smoothstep(-0.2, 0.9, k / 8);
    if (w <= 0.05) continue;
    c.moveTo(x + o - ry, y - ry); c.lineTo(x + o + ry, y + ry);
  }
  c.stroke();
  c.restore();
  c.beginPath(); c.ellipse(x, y, rx, ry, -0.35, 0, Math.PI * 2);
  c.strokeStyle = rgba('ink', 0.9); c.lineWidth = 1.6; c.stroke();
  c.restore();
}

/** The focus bracket at copy scale: the kit's four corners and dot, with arms that fit a few px. */
function miniBracket(c: CanvasRenderingContext2D, x: number, y: number, hs: number, a: number) {
  if (a <= 0.001) return;
  const k = hs * 0.55;
  c.strokeStyle = rgba('signal', a); c.lineWidth = 1.3;
  c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const px = x + sx * hs, py = y + sy * hs;
    c.moveTo(px - sx * k, py); c.lineTo(px, py); c.lineTo(px, py - sy * k);
  }
  c.stroke();
  c.fillStyle = rgba('signal', a);
  c.beginPath(); c.arc(x, y, Math.max(1.1, hs * 0.28), 0, Math.PI * 2); c.fill();
}
void W; void H;
export type { RGB };
