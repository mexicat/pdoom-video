// The edit: which scene plays when. Boundaries are anchored to lyric lines and snapped
// to the beat grid, so they follow the aligned data (data/lyrics.json, data/audio.json).
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut on the last beat at/before the first word of the matching line (never after the word). */
  const cut = (q: string, nth = 0, tol = 0.02) => {
    const s = ly.get(q, nth).words[0]!.start;
    return au.timeOfBeat(Math.floor(au.beatAt(s + tol)));
  };
  /** Nearest downbeat to the end of a line. */
  const after = (q: string, nth = 0) => {
    const e = ly.get(q, nth).end;
    return au.downbeats.reduce((b, d) => (Math.abs(d - e) < Math.abs(b - e) ? d : b), au.downbeats[0] ?? e);
  };

  const b = {
    loss: cut('There was a sudden drop'),
    pre1: cut('ChatGPT, please'),
    hook1: cut("I'm upping", 0),
    room: cut("'cause the future goes FOOM"),
    shog: cut("See through the shoggoth"),
    space: cut('We had a stable'),
    pre2: cut('Sydney'),
    hook2: cut("I'm upping", 1),
    ascent: cut('I hear the basilisk'),
    bureau: cut('That was safe enough'),
    left: cut('Sharp left turn'),
    pre3: cut('Gato'),
    hook3: cut("I'm upping", 2),
    clips: cut('as paperclips'),
    fuse: cut('Too late now'),
    stack: cut('transformers all the way'),
    dense: cut('Post-Chinchilla', 0, 0.05), // 'Post' starts 32 ms before its beat; don't cut 'disobey' in half
    hook4: cut("I'm upping", 3),
    loom: cut('Just as foretold'),
    ilya: cut('What did Ilya'),
    // the outro section from the music analysis if present (the last word may be a long held note)
    outro: au.sections.find((x) => x.name === 'outro')?.start ?? after('Was it all for show'),
    end: au.duration,
  };

  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });

  return [
    E('open', 'open', 0, b.loss),
    E('loss', 'loss', b.loss, b.pre1),
    E('prompt1', 'prompt', b.pre1, b.hook1, { params: { variant: 'chatgpt' } }),
    E('hook1', 'hook', b.hook1, b.room, { params: { n: 1 } }),
    E('room', 'room', b.room, b.shog),
    // (its half-res G-buffer sparkles along the silhouettes from one sub-frame to the next: noise the adaptive
    // sampler would chase to 324 sub-frames, though 108 already can't be told from 324)
    E('shoggoth', 'shoggoth', b.shog, b.space, { maxSamples: 108 }),
    E('spacetime', 'spacetime', b.space, b.pre2),
    E('prompt2', 'prompt', b.pre2, b.hook2, { params: { variant: 'sydney' } }),
    E('hook2', 'hook', b.hook2, b.ascent, { params: { n: 2 } }),
    E('ascent', 'ascent', b.ascent, b.bureau),
    E('bureau', 'bureau', b.bureau, b.left),
    E('leftturn', 'leftturn', b.left, b.pre3),
    E('prompt3', 'prompt', b.pre3, b.hook3, { params: { variant: 'gato' } }),
    E('hook3', 'hook', b.hook3, b.clips, { params: { n: 3 } }),
    E('paperclips', 'paperclips', b.clips, b.fuse),
    E('fuse', 'fuse', b.fuse, b.stack),
    E('stack', 'stack', b.stack, b.dense),
    E('dense', 'dense', b.dense, b.hook4),
    E('hook4', 'hook', b.hook4, b.loom, { params: { n: 4 } }),
    E('loom', 'loom', b.loom, b.ilya),
    E('ilya', 'ilya', b.ilya, b.outro),
    E('outro', 'outro', b.outro, b.end),
  ];
}
