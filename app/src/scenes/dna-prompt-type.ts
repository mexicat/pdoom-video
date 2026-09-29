// Shared bits of the DNA pre-chorus plates (dna-prompt.ts): the plea's karaoke rows with a typed-input
// caret riding the wipe head, and the per-variant plate interface. Pure functions of song time.
import type * as THREE from 'three';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { makeRT } from '../engine/gl';
import { rgba } from '../engine/palette';
import { font, glyphX } from '../engine/type';
import { Lyrics, type Word } from '../engine/lyrics';
import { lerp, prog } from '../engine/util';
import { karaokeRow, sungChars, type RowOpts } from './dna-kit';

export interface Plate {
  init(): void | Promise<void>;
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides;
}
export type PlateCtor = new (ctx: SceneCtx) => Plate;

/** Where the karaoke wipe of a row is (logical px), and whether the row is still being sung. */
export function wipeHead(c: CanvasRenderingContext2D, ws: Word[], x: number, fam: string, size: number, t: number, align: RowOpts['align'] = 'left') {
  const txt = ws.map((w) => w.w).join(' ');
  c.font = font(fam, size);
  const wTot = c.measureText(txt).width;
  const x0 = align === 'right' ? x - wTot : align === 'center' ? x - wTot / 2 : x;
  const k = sungChars(ws, t), ki = Math.floor(k);
  const xa = ki >= txt.length ? wTot : glyphX(txt, ki, fam, size);
  const xb = ki + 1 >= txt.length ? wTot : glyphX(txt, ki + 1, fam, size);
  const xs = ki >= txt.length ? wTot : lerp(xa, xb, k - ki);
  const last = ws[ws.length - 1]!;
  return { x0, w: wTot, head: x0 + xs, started: t >= ws[0]!.start, done: Lyrics.wordProgress(last, t) >= 1 };
}

/**
 * A karaoke row (dna-kit's karaokeRow) plus a thin typed-input caret at the wipe head: it rides the
 * voice while the row is sung and blinks on the beat grid while it waits. Returns the row geometry.
 */
export function typedRow(
  c: CanvasRenderingContext2D, ws: Word[], x: number, y: number, fam: string, size: number, t: number, alpha: number,
  o: RowOpts & { caret?: number; beat?: number; caretCol?: string } = {},
) {
  const w = karaokeRow(c, ws, x, y, fam, size, t, alpha, o);
  const g = wipeHead(c, ws, x, fam, size, t, o.align);
  const ca = (o.caret ?? 0) * alpha * prog(t, ws[0]!.start - 0.25, ws[0]!.start);
  if (w > 0 && ca > 0.001 && !g.done) {
    const ph = (o.beat ?? 0) - Math.floor(o.beat ?? 0);
    const singing = ws.some((q) => t > q.start && t < q.end);
    const blink = singing ? 1 : ph < 0.5 ? 1 : 0.15;
    c.fillStyle = rgba(o.caretCol ?? o.on ?? 'bone', 0.9 * ca * blink);
    const cw = Math.max(3, size * 0.035);
    c.fillRect(g.head + size * 0.04, y - size * 0.74, cw, size * 0.86);
  }
  return { ...g, drawn: w };
}

/**
 * A memoised full-frame layer (a backdrop whose parameters have stopped changing): `key` null means
 * "live, redraw every call"; a constant key draws once and reuses the target. The image is a pure
 * function of the key, so sub-frames in any order agree (no accumulated state).
 */
export class Memo {
  rt = makeRT();
  private key: string | null = null;
  get(key: string | null, draw: (rt: THREE.WebGLRenderTarget) => void): THREE.Texture {
    if (key === null || key !== this.key) { draw(this.rt); this.key = key; }
    return this.rt.texture;
  }
}
