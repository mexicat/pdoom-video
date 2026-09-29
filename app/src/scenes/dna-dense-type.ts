// DNA edition, `dense`: the first phrase's lyric rows ("Post-Chinchilla, super-dense"), shared with
// `stack`, whose last frames already show the row dim because "Post" starts 32 ms before the cut.
import { F } from '../engine/type';
import type { Lyrics, Line } from '../engine/lyrics';
import { karaokeRow } from './dna-kit';

export const ROW1 = { x: 108, y: 830, fam: F.archivo(100, 700), size: 84 };
export const ROW2 = { x: 100, y: 980, fam: F.archivo(62, 900), size: 168 };

export function denseRows(ly: Lyrics) {
  const l: Line = ly.get('Post-Chinchilla');
  return {
    line: l,
    /** Both rows (the karaoke wipe follows the voice; each row anticipates its own first word). */
    draw(c: CanvasRenderingContext2D, t: number, alpha: number, on = 'bone') {
      karaokeRow(c, l.words.slice(0, 1), ROW1.x, ROW1.y, ROW1.fam, ROW1.size, t, alpha, { on });
      karaokeRow(c, l.words.slice(1), ROW2.x, ROW2.y, ROW2.fam, ROW2.size, t, alpha, { on, tracking: 0 });
    },
  };
}
