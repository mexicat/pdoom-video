// `fuse` helper: the sung pitch of "blues" and what follows it, as analysis data (like data/audio.json).
// Extracted from the lead-vocal stem (analysis/stems/karaoke/lead.wav) with pYIN, 10 ms steps,
// 3-sample median. Sample k is at (start of the word "blues" - 0.1 s + k / 100), so the curve is
// anchored to the lyric through the Lyrics API, never to absolute song time. Values are MIDI notes
// (60 = C4); null = unvoiced. The held note sits on C4 with a ~7 Hz vibrato, flips up an octave at
// the end of the word, then come a B-flat (the blue note) and a falling G-F phrase into the bridge.
export const BLUES_PITCH_PRE = 0.1;
export const BLUES_PITCH_RATE = 100;
export const BLUES_PITCH: (number | null)[] = [null,null,null,null,null,null,null,null,null,null,null,null,null,60.19,60.29,60.29,60.29,60.29,60.29,60.29,60.29,60.29,60.19,59.99,59.69,59.59,59.59,59.59,59.99,60.09,60.29,60.29,60.29,60.29,60.19,60.09,59.99,59.59,59.49,59.49,59.69,59.89,60.09,60.29,60.49,60.49,60.49,60.39,60.19,59.99,59.89,59.69,59.49,59.49,59.59,59.79,59.99,60.09,60.39,60.49,60.49,60.39,60.19,59.99,59.89,59.79,59.69,59.59,59.59,59.79,59.79,59.99,59.99,60.09,60.09,60.19,60.19,60.19,60.19,60.19,60.19,60.29,60.89,61.29,62.09,null,65.39,66.29,66.79,67.39,68.09,68.89,69.79,70.49,70.89,71.29,71.59,71.89,71.99,71.99,72.09,72.09,72.09,71.99,71.99,71.99,71.99,72.29,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,70.29,69.99,69.99,70.09,70.09,70.09,70.09,70.09,69.99,69.89,69.89,69.99,69.99,70.09,70.09,70.19,70.19,70.09,70.09,69.99,69.89,69.79,69.69,69.69,69.69,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,67.09,67.09,67.09,66.99,66.89,66.79,66.69,66.69,66.79,66.79,66.99,67.09,67.09,67.09,67.09,67.09,66.99,66.99,66.99,66.99,66.89,66.89,66.79,66.39,66.09,65.89,65.49,65.09,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.99,null,null,null,64.69,64.89,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.99,64.89,64.89,64.89,64.99,65.09,65.19,65.29,65.39,65.39,65.29,65.09,64.89,64.59,64.39,63.69,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null];

/** Pitch (MIDI) at time t, given the start of the word "blues"; null when unvoiced. */
export function bluesPitch(t: number, wordStart: number): number | null {
  const x = (t - wordStart + BLUES_PITCH_PRE) * BLUES_PITCH_RATE;
  const i = Math.floor(x);
  if (i < 0 || i >= BLUES_PITCH.length - 1) return null;
  const a = BLUES_PITCH[i], b = BLUES_PITCH[i + 1];
  if (a == null || b == null) return a ?? b ?? null;
  return a + (b - a) * (x - i);
}
