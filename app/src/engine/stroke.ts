// Single-stroke (engraving/plotter) fonts: EMS/Hershey SVG fonts rendered as polylines,
// so text can be *written* progressively by a moving point (the spark).
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

interface SGlyph { adv: number; strokes: V2[][] }
interface SFont { upm: number; ascent: number; descent: number; xh: number; cap: number; glyphs: Map<string, SGlyph>; missingAdv: number }
const fonts = new Map<StrokeFontName, SFont>();

export async function loadStrokeFonts() {
  await Promise.all(
    (Object.keys(STROKE_FONTS) as StrokeFontName[]).map(async (k) => {
      const txt = await (await fetch(`fonts/stroke/${STROKE_FONTS[k]}`)).text();
      fonts.set(k, parseSvgFont(txt));
    }),
  );
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
  return {
    upm: parseFloat(ff.getAttribute('units-per-em') ?? '1000'),
    ascent: parseFloat(ff.getAttribute('ascent') ?? '800'),
    descent: parseFloat(ff.getAttribute('descent') ?? '-200'),
    xh: parseFloat(ff.getAttribute('x-height') ?? '300'),
    cap: parseFloat(ff.getAttribute('cap-height') ?? '500'),
    glyphs,
    missingAdv: defAdv,
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

/** Lay out a string in a stroke font at `size` px (em size). */
export function strokeText(text: string, fontName: StrokeFontName = 'script', size = 100, tracking = 0): StrokeText {
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
