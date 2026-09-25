// Single-stroke (engraving/plotter) fonts: EMS/Hershey SVG fonts rendered as polylines,
// so text can be *written* progressively by a moving point (the spark). The fonts carry no kerning
// and no curly quotes: pairs are kerned optically (see `pairKern`) and ’ ‘ “ ” … are built from their
// own ' and . glyphs.
import { type V2, polylineLengths } from './util';

export const STROKE_FONTS = {
  script: 'EMSAllure.svg', // flowing cursive
  hscript: 'HersheyScript1.svg', // classic Hershey script
  sans: 'HersheySans1.svg', // plotter sans
  readable: 'EMSReadability.svg', // clean single-line sans
  tech: 'EMSTech.svg', // technical lettering
  serif: 'HersheySerifMed.svg',
  osmotron: 'EMSOsmotron.svg', // geometric/techno
  felix: 'EMSFelix.svg', // brushy
} as const;
export type StrokeFontName = keyof typeof STROKE_FONTS;

/** Connected scripts: kerning would break the joins between letters. */
const SCRIPTS = new Set<StrokeFontName>(['script', 'hscript']);

interface SGlyph { adv: number; strokes: V2[][] }
interface SFont {
  upm: number; ascent: number; descent: number; xh: number; cap: number; glyphs: Map<string, SGlyph>; missingAdv: number;
  /** Measured from the outlines (the files' x-height / cap-height attributes are placeholders). */
  base: number; xTop: number; capTop: number;
  /** Profile bands: [yLo, yLo + ROWS*dy] covers every glyph's ink. */
  yLo: number; dy: number;
  prof: Map<string, Profile | null>; kern: Map<string, number>; target: { lc: number; uc: number } | null;
}
const fonts = new Map<StrokeFontName, SFont>();

export async function loadStrokeFonts() {
  await Promise.all(
    (Object.keys(STROKE_FONTS) as StrokeFontName[]).map(async (k) => {
      const txt = await (await fetch(`fonts/stroke/${STROKE_FONTS[k]}`)).text();
      const f = parseSvgFont(txt);
      addTypographic(f);
      fonts.set(k, f);
    }),
  );
}

const inkBox = (strokes: V2[][]) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, x1, y0, y1 };
};
const moved = (g: SGlyph, dx: number, dy = 0): V2[][] => g.strokes.map((s) => s.map((p) => ({ x: p.x + dx, y: p.y + dy })));

/** Curly quotes and the ellipsis, built from the font's own ' and . (in Hershey the ' is already comma-shaped). */
function addTypographic(f: SFont) {
  const G = f.glyphs, q = G.get("'"), dot = G.get('.');
  if (q && q.strokes.length) {
    const b = inkBox(q.strokes), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const turned: SGlyph = { adv: q.adv, strokes: q.strokes.map((s) => s.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y }))) };
    const dbl = (g: SGlyph): SGlyph => {
      const off = b.x1 - b.x0 + 0.07 * f.upm;
      return { adv: g.adv + off, strokes: [...g.strokes, ...moved(g, off)] };
    };
    if (!G.has('\u2019')) G.set('\u2019', q);
    if (!G.has('\u2018')) G.set('\u2018', turned);
    if (!G.has('\u201D')) G.set('\u201D', dbl(q));
    if (!G.has('\u201C')) G.set('\u201C', dbl(turned));
  }
  if (dot && !G.has('…')) {
    const step = dot.adv * 0.72;
    G.set('…', { adv: dot.adv + 2 * step, strokes: [...dot.strokes, ...moved(dot, step), ...moved(dot, 2 * step)] });
  }
}

// ------------------------------------------------------------------ optical kerning
// The fonts' sidebearings already space plain pairs (nn, oo, ...); what they lack is kerning for shapes
// that leave a hole — overhangs and diagonals (To, Yo, We, AV, LT, r., ...). For those pairs, the ink is
// reduced to left/right profiles (extreme x per horizontal band, widened steeply so a T's arm shades
// the bands under it) and the right glyph moves in until the closest approach over the zone both
// letters share (x-height for lowercase, cap height otherwise) comes most of the way to the font's own
// n/o pairs.
const ROWS = 90; // bands over the glyphs' vertical extent
const SHADE = 0.4; // ink d units above/below a band counts as SHADE*d further out in it
/** Glyphs whose right side overhangs or slants (they can kern with what follows). */
const OPEN_R = new Set('AFLPTVWYKXfrvwyk7\'"\u2019\u201D'.split(''));
/** Glyphs whose left side slants or tucks under (they can kern with what precedes). */
const OPEN_L = new Set('AJTVWYXvwyj.,\'"\u2019\u201D\u2026'.split(''));
const CLEAR = 0.1; // em: the inks never come closer than this (measured at 45°, so diagonals count)
/** Only part of the way: equal closest approach would pack diagonals and rounds tighter than the eye wants. */
const STRENGTH = 0.6;
interface Profile { l: Float32Array; r: Float32Array; l45: Float32Array; r45: Float32Array } // NaN where no ink

function profile(f: SFont, ch: string): Profile | null {
  if (f.prof.has(ch)) return f.prof.get(ch)!;
  const g = f.glyphs.get(ch);
  let p: Profile | null = null;
  if (g && g.strokes.length) {
    const l = new Float32Array(ROWS).fill(NaN), r = new Float32Array(ROWS).fill(NaN);
    const put = (x: number, y: number) => {
      const i = Math.floor((y - f.yLo) / f.dy);
      if (i < 0 || i >= ROWS) return;
      if (!(l[i]! <= x)) l[i] = x;
      if (!(r[i]! >= x)) r[i] = x;
    };
    for (const s of g.strokes) {
      if (s.length === 1) put(s[0]!.x, s[0]!.y);
      for (let k = 1; k < s.length; k++) {
        const a = s[k - 1]!, b = s[k]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (f.dy * 0.35)));
        for (let j = 0; j <= n; j++) put(a.x + ((b.x - a.x) * j) / n, a.y + ((b.y - a.y) * j) / n);
      }
    }
    // widen: a band sees the ink of its neighbours, set back in proportion to their vertical distance
    const widen = (k: number) => {
      const lw = new Float32Array(ROWS).fill(NaN), rw = new Float32Array(ROWS).fill(NaN);
      for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < ROWS; j++) {
          const d = Math.abs(i - j) * f.dy * k;
          if (!Number.isNaN(l[j]!) && !(lw[i]! <= l[j]! + d)) lw[i] = l[j]! + d;
          if (!Number.isNaN(r[j]!) && !(rw[i]! >= r[j]! - d)) rw[i] = r[j]! - d;
        }
      }
      return [lw, rw] as const;
    };
    const [lw, rw] = widen(SHADE), [l45, r45] = widen(1);
    p = { l: lw, r: rw, l45, r45 };
  }
  f.prof.set(ch, p);
  return p;
}

const isLower = (ch: string) => ch !== ch.toUpperCase() && ch === ch.toLowerCase();
const isLetter = (ch: string) => /[\p{L}\p{N}]/u.test(ch);

/** Closest approach (font units) of b to a, set at a's advance, over the zone they share. */
function approach(f: SFont, a: string, b: string): number | null {
  const pa = profile(f, a), pb = profile(f, b);
  if (!pa || !pb) return null;
  const adv = f.glyphs.get(a)!.adv;
  const lower = isLower(a) || isLower(b) || !isLetter(a) || !isLetter(b);
  const top = lower ? f.xTop : f.capTop;
  const i0 = Math.max(0, Math.floor((f.base - f.yLo) / f.dy)), i1 = Math.min(ROWS - 1, Math.floor((top - f.yLo) / f.dy));
  let m = Infinity;
  for (let i = i0; i <= i1; i++) {
    const ra = pa.r[i]!, lb = pb.l[i]!;
    if (!Number.isNaN(ra) && !Number.isNaN(lb)) m = Math.min(m, adv + lb - ra);
  }
  return m === Infinity ? null : m;
}

/** Optical kern (font units, <= 0) between two adjacent glyphs; 0 unless one of them leaves a hole. */
function pairKern(f: SFont, a: string, b: string): number {
  if (a === ' ' || b === ' ' || !(OPEN_R.has(a) || OPEN_L.has(b))) return 0;
  if (!isLetter(a) && !isLetter(b)) return 0;
  const key = a + b;
  const hit = f.kern.get(key);
  if (hit !== undefined) return hit;
  if (!f.target) {
    const mean = (ps: string[]) => { const v = ps.map((p) => approach(f, p[0]!, p[1]!) ?? 0); return v.reduce((x, y) => x + y, 0) / v.length; };
    f.target = { lc: mean(['nn', 'oo', 'no', 'on']), uc: mean(['HH', 'OO', 'HO', 'OH']) };
  }
  const m = approach(f, a, b);
  let k = 0;
  if (m !== null) {
    const lower = isLower(a) || isLower(b) || !isLetter(a) || !isLetter(b);
    k = Math.max(-0.15 * f.upm, Math.min(0, STRENGTH * ((lower ? f.target.lc : f.target.uc) - m)));
    // clearance over the full height (descenders, accents and arms included)
    const pa = profile(f, a)!, pb = profile(f, b)!, adv = f.glyphs.get(a)!.adv;
    let near = Infinity;
    for (let i = 0; i < ROWS; i++) {
      const ra = pa.r45[i]!, lb = pb.l45[i]!;
      if (!Number.isNaN(ra) && !Number.isNaN(lb)) near = Math.min(near, adv + lb - ra);
    }
    k = Math.max(k, Math.min(0, CLEAR * f.upm - near));
  }
  f.kern.set(key, k);
  return k;
}

function parseSvgFont(txt: string): SFont {
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  const ff = doc.querySelector('font-face')!;
  const fontEl = doc.querySelector('font')!;
  const defAdv = parseFloat(fontEl.getAttribute('horiz-adv-x') ?? '500');
  const glyphs = new Map<string, SGlyph>();
  doc.querySelectorAll('glyph').forEach((g) => {
    const u = g.getAttribute('unicode');
    if (u == null) return;
    const adv = parseFloat(g.getAttribute('horiz-adv-x') ?? String(defAdv));
    glyphs.set(u, { adv, strokes: parsePath(g.getAttribute('d') ?? '') });
  });
  let yLo = Infinity, yHi = -Infinity;
  for (const g of glyphs.values()) for (const st of g.strokes) for (const p of st) { yLo = Math.min(yLo, p.y); yHi = Math.max(yHi, p.y + 1); }
  const H = inkBox(glyphs.get('H')?.strokes ?? [[{ x: 0, y: 0 }, { x: 0, y: 700 }]]);
  const X = inkBox(glyphs.get('x')?.strokes ?? [[{ x: 0, y: 0 }, { x: 0, y: 450 }]]);
  return {
    upm: parseFloat(ff.getAttribute('units-per-em') ?? '1000'),
    ascent: parseFloat(ff.getAttribute('ascent') ?? '800'),
    descent: parseFloat(ff.getAttribute('descent') ?? '-200'),
    xh: parseFloat(ff.getAttribute('x-height') ?? '300'),
    cap: parseFloat(ff.getAttribute('cap-height') ?? '500'),
    glyphs,
    missingAdv: defAdv,
    base: H.y0, xTop: X.y1, capTop: H.y1,
    yLo, dy: (yHi - yLo) / ROWS,
    prof: new Map(), kern: new Map(), target: null,
  };
}

/** These fonts only use M/L (absolute) commands; y is up in font units. */
function parsePath(d: string): V2[][] {
  const out: V2[][] = [];
  const tok = d.match(/[MLml]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let cur: V2[] | null = null;
  let cmd = 'M';
  for (let i = 0; i < tok.length; ) {
    const t = tok[i]!;
    if (/[MLml]/.test(t)) { cmd = t.toUpperCase(); i++; continue; }
    const x = parseFloat(tok[i]!), y = parseFloat(tok[i + 1]!);
    i += 2;
    if (cmd === 'M') { cur = [{ x, y }]; out.push(cur); cmd = 'L'; }
    else cur?.push({ x, y });
  }
  return out;
}

export interface StrokeText {
  /** Polylines in px, origin at left baseline, y down. */
  strokes: V2[][];
  /** For each stroke: index of the char it belongs to. */
  charOf: number[];
  /** Cumulative length at the start of each stroke & total (for progressive writing). */
  startLen: number[];
  lens: Float32Array[];
  total: number;
  width: number;
  /** Char index -> [startLen, endLen] of its strokes (for syncing writing to word timings). */
  charRange: [number, number][];
  size: number;
  capHeight: number;
}

/**
 * Lay out a string in a stroke font at `size` px (em size). Letter pairs are kerned optically unless
 * `kern` is false (default: on, except for the connected scripts).
 */
export function strokeText(text: string, fontName: StrokeFontName = 'script', size = 100, tracking = 0, kern = !SCRIPTS.has(fontName)): StrokeText {
  const f = fonts.get(fontName);
  if (!f) throw new Error(`stroke font not loaded: ${fontName}`);
  const s = size / f.upm;
  const strokes: V2[][] = [];
  const charOf: number[] = [];
  let x = 0;
  const chars = Array.from(text);
  chars.forEach((ch, ci) => {
    const g = f.glyphs.get(ch);
    for (const st of g?.strokes ?? []) {
      strokes.push(st.map((p) => ({ x: x + p.x * s, y: -p.y * s })));
      charOf.push(ci);
    }
    x += (g?.adv ?? f.missingAdv) * s + tracking;
    if (kern && ci + 1 < chars.length) x += pairKern(f, ch, chars[ci + 1]!) * s;
  });
  const lens = strokes.map((p) => polylineLengths(p));
  const startLen: number[] = [];
  let acc = 0;
  for (const L of lens) { startLen.push(acc); acc += L[L.length - 1] ?? 0; }
  const charRange: [number, number][] = chars.map(() => [Infinity, -Infinity]);
  strokes.forEach((_, i) => {
    const r = charRange[charOf[i]!]!;
    r[0] = Math.min(r[0], startLen[i]!);
    r[1] = Math.max(r[1], startLen[i]! + (lens[i]![lens[i]!.length - 1] ?? 0));
  });
  // chars without strokes (spaces) inherit the position of the previous char's end
  let last = 0;
  for (const r of charRange) {
    if (r[0] === Infinity) { r[0] = last; r[1] = last; }
    last = r[1];
  }
  return { strokes, charOf, startLen, lens, total: acc, width: x - tracking, charRange, size, capHeight: f.cap * s };
}

/**
 * Draw the first `len` px of a StrokeText into a Canvas2D context (already transformed).
 * Returns the pen position (the "spark" head) or null if nothing drawn.
 */
export function drawStrokeText(c: CanvasRenderingContext2D, st: StrokeText, len: number): { x: number; y: number; angle: number } | null {
  let head: { x: number; y: number; angle: number } | null = null;
  c.beginPath();
  for (let i = 0; i < st.strokes.length; i++) {
    const s0 = st.startLen[i]!;
    if (s0 >= len) break;
    const pts = st.strokes[i]!, L = st.lens[i]!;
    const remain = len - s0;
    c.moveTo(pts[0]!.x, pts[0]!.y);
    let j = 1;
    for (; j < pts.length && L[j]! <= remain; j++) c.lineTo(pts[j]!.x, pts[j]!.y);
    if (j < pts.length) {
      const a = pts[j - 1]!, b = pts[j]!;
      const u = (remain - L[j - 1]!) / Math.max(1e-6, L[j]! - L[j - 1]!);
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
      c.lineTo(x, y);
      head = { x, y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    } else {
      const a = pts[pts.length - 2] ?? pts[0]!, b = pts[pts.length - 1]!;
      head = { x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
  }
  c.stroke();
  return head;
}

/**
 * Map song time -> written length so each char is written while its word is sung.
 * `charTimes[i]` = [start, end] time for char i (e.g. derived from word timings).
 */
export function writtenLength(st: StrokeText, charTimes: [number, number][], t: number): number {
  let len = 0;
  for (let i = 0; i < st.charRange.length; i++) {
    const [a, b] = st.charRange[i]!;
    const [t0, t1] = charTimes[i] ?? [Infinity, Infinity];
    if (t >= t1) len = b;
    else if (t > t0) { len = a + (b - a) * ((t - t0) / Math.max(1e-3, t1 - t0)); break; }
    else break;
  }
  return len;
}
