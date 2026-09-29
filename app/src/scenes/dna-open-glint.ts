// A quiet glint on the orange point (HDR, so the bloom catches it): in the opening on "sparks", in
// the outro on the last sung notes. Draw into a screen2D additive LineBatch, then render it.
import { LineBatch } from '../engine/lines';
import { LIN } from '../engine/palette';

export function signalGlint(lb: LineBatch, x: number, y: number, a: number) {
  lb.clear();
  if (a <= 0.001) return;
  const s = LIN.signal;
  const col = (k: number): [number, number, number] => [s[0] * k, s[1] * k, s[2] * k];
  lb.seg2(x, y, x + 0.01, y, 30, col(0.35 * a), 0.5);
  lb.seg2(x, y, x + 0.01, y, 13, col(1.6 * a), 1);
  lb.seg2(x, y, x + 0.01, y, 7, col(3.2 * a), 1);
}
