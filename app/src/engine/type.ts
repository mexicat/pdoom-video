// Typography: font registry (Canvas2D via FontFace + outlines via opentype.js),
// glyph layout, text outlines as Path2D, and point sampling of text for particle effects.
import * as opentype from 'opentype.js';

/**
 * Font keys. Archivo comes in static width instances (w = wdth*10) x weights so we can
 * animate width in discrete steps: 620, 750, 875, 1000, 1125, 1250 and weights 300/500/700/900.
 */
export const ARCHIVO_WIDTHS = [620, 750, 875, 1000, 1125, 1250] as const;
export const ARCHIVO_WEIGHTS = [300, 500, 700, 900] as const;

type FontDef = { family: string; file: string };
const DEFS: FontDef[] = [];
for (const w of ARCHIVO_WIDTHS) for (const wt of ARCHIVO_WEIGHTS) DEFS.push({ family: `Archivo-${w}-${wt}`, file: `Archivo-w${w}-${wt}.ttf` });
for (const w of [750, 1000]) for (const wt of [400, 800]) DEFS.push({ family: `ArchivoItalic-${w}-${wt}`, file: `ArchivoItalic-w${w}-${wt}.ttf` });
for (const wt of [400, 600]) {
  DEFS.push({ family: `Cormorant-${wt}`, file: `Cormorant-${wt}.ttf` });
  DEFS.push({ family: `CormorantItalic-${wt}`, file: `CormorantItalic-${wt}.ttf` });
}
for (const [n, f] of [['300', 'Light'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'SemiBold'], ['700', 'Bold']] as const)
  DEFS.push({ family: `Plex-${n}`, file: `src/IBMPlexMono-${f}.ttf` });
DEFS.push({ family: 'PlexItalic-400', file: 'src/IBMPlexMono-Italic.ttf' });

/** Convenience family names. */
export const F = {
  /** Archivo at nearest available width/weight. width in [62..125] (percent), weight 300..900 */
  archivo(width = 100, weight = 700): string {
    const w = nearest(ARCHIVO_WIDTHS as unknown as number[], width * 10);
    const wt = nearest(ARCHIVO_WEIGHTS as unknown as number[], weight);
    return `Archivo-${w}-${wt}`;
  },
  archivoItalic(width = 100, weight = 800): string {
    return `ArchivoItalic-${width < 88 ? 750 : 1000}-${weight < 600 ? 400 : 800}`;
  },
  serif(weight = 400, italic = false): string {
    return `${italic ? 'CormorantItalic' : 'Cormorant'}-${weight < 500 ? 400 : 600}`;
  },
  mono(weight = 400, italic = false): string {
    if (italic) return 'PlexItalic-400';
    return `Plex-${nearest([300, 400, 500, 600, 700], weight)}`;
  },
};

function nearest(list: number[], v: number) {
  let best = list[0]!;
  for (const x of list) if (Math.abs(x - v) < Math.abs(best - v)) best = x;
  return best;
}

/** CSS font string for Canvas2D. */
export const font = (family: string, sizePx: number) => `${sizePx}px "${family}"`;

const otCache = new Map<string, opentype.Font>();
const bufCache = new Map<string, ArrayBuffer>();

export async function loadFonts(): Promise<void> {
  await Promise.all(
    DEFS.map(async (d) => {
      const buf = await (await fetch(`fonts/${d.file}`)).arrayBuffer();
      bufCache.set(d.family, buf);
      const ff = new FontFace(d.family, buf);
      await ff.load();
      document.fonts.add(ff);
    }),
  );
  await document.fonts.ready;
}

/** opentype.js Font for outline work (lazy-parsed). */
export function ot(family: string): opentype.Font {
  let f = otCache.get(family);
  if (!f) {
    const buf = bufCache.get(family);
    if (!buf) throw new Error(`font not loaded: ${family}`);
    f = opentype.parse(buf);
    otCache.set(family, f);
  }
  return f;
}

export interface Glyph {
  ch: string;
  i: number; // char index in string
  x: number; // left edge (px), relative to the text origin
  w: number; // advance width (px)
}
export interface TextLayout {
  text: string;
  family: string;
  size: number;
  width: number; // total advance width
  ascent: number;
  descent: number;
  glyphs: Glyph[];
}

let measureCtx: CanvasRenderingContext2D | null = null;
function mctx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

/**
 * Per-glyph horizontal layout (kerning-aware: x of glyph i = width of prefix [0..i)).
 * `tracking` is extra letter spacing in px.
 */
export function layout(text: string, family: string, size: number, tracking = 0): TextLayout {
  const c = mctx();
  c.font = font(family, size);
  const glyphs: Glyph[] = [];
  const chars = Array.from(text);
  let prefix = '';
  let prevW = 0;
  for (let i = 0; i < chars.length; i++) {
    const x = prevW + i * tracking;
    prefix += chars[i];
    const wNow = c.measureText(prefix).width;
    glyphs.push({ ch: chars[i]!, i, x, w: wNow - prevW });
    prevW = wNow;
  }
  const m = c.measureText(text || 'M');
  return {
    text, family, size,
    width: prevW + Math.max(0, chars.length - 1) * tracking,
    ascent: m.fontBoundingBoxAscent ?? size * 0.8,
    descent: m.fontBoundingBoxDescent ?? size * 0.2,
    glyphs,
  };
}

export function measure(text: string, family: string, size: number, tracking = 0) {
  const c = mctx();
  c.font = font(family, size);
  return c.measureText(text).width + Math.max(0, Array.from(text).length - 1) * tracking;
}

/** Largest font size (<= max) at which text fits in maxWidth. */
export function fitSize(text: string, family: string, maxWidth: number, max = 400, tracking = 0) {
  const w = measure(text, family, 100, tracking * 100 / max);
  return Math.min(max, (100 * maxWidth) / Math.max(1, w));
}

/**
 * Outline of text as opentype commands at (x, baselineY). Glyphs are placed one by one at the
 * Canvas2D-measured positions (so outlines line up with fillText) — this also sidesteps
 * opentype.js's unsupported GSUB lookups (e.g. Archivo's ccmp) that crash font.getPath().
 */
export function textPathCommands(text: string, family: string, size: number, x = 0, y = 0, tracking = 0) {
  const f = ot(family);
  const lay = layout(text, family, size, tracking);
  const cmds: opentype.PathCommand[] = [];
  for (const g of lay.glyphs) cmds.push(...f.charToGlyph(g.ch).getPath(x + g.x, y, size).commands);
  return cmds;
}

/** Outline of text as a Path2D at (x, baselineY). */
export function textPath2D(text: string, family: string, size: number, x = 0, y = 0, tracking = 0): Path2D {
  const p = new opentype.Path();
  p.commands = textPathCommands(text, family, size, x, y, tracking);
  return new Path2D(p.toPathData(3));
}

/**
 * Sample points inside the filled text (rasterized at `size`) on a jittered grid with spacing `step`.
 * Returns points relative to the text origin (left, baseline). Great for "text made of atoms".
 */
export function textPoints(text: string, family: string, size: number, step = 6, seed = 1): { x: number; y: number }[] {
  const lay = layout(text, family, size);
  const pad = Math.ceil(size * 0.3);
  const W = Math.ceil(lay.width + pad * 2), H = Math.ceil(size * 1.6);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.font = font(family, size);
  c.fillStyle = '#fff';
  c.textBaseline = 'alphabetic';
  const base = Math.round(size * 1.15);
  c.fillText(text, pad, base);
  const data = c.getImageData(0, 0, W, H).data;
  const out: { x: number; y: number }[] = [];
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const jx = x + (rnd() - 0.5) * step * 0.8, jy = y + (rnd() - 0.5) * step * 0.8;
      const ix = Math.max(0, Math.min(W - 1, Math.round(jx))), iy = Math.max(0, Math.min(H - 1, Math.round(jy)));
      if (data[(iy * W + ix) * 4 + 3]! > 128) out.push({ x: jx - pad, y: jy - base });
    }
  }
  return out;
}
