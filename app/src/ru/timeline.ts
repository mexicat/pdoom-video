import { makeTimeline } from '../timeline';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Lyrics } from '../engine/lyrics';
import { AudioData, type AudioJSON } from '../engine/audio';
import type { TimelineEntry } from '../engine/engine';
import sourceLyrics from '../../../data/lyrics.json';
import sourceAudio from '../../../data/audio.json';
import { localizedLyrics } from './words';

export let toRecordingTime = (t: number): number => t;

/** Preserve the original animation clock; align its sung phrases to this performance. */
export function makeRussianTimeline(lyrics: Lyrics, audio: AudioData): TimelineEntry[] {
  const source = new Lyrics(sourceLyrics);
  const opening = lyrics.lines[0]!.start - source.lines[0]!.start;
  const appendix = audio.duration - 7.4;
  const points: [number, number][] = [[0, opening]];
  source.lines.forEach((l, i) => {
    points.push([l.start, lyrics.lines[i]!.start]);
    const next = source.lines[i + 1];
    if (next && (next.start > l.end + .01) && (!lyrics.lines[i+1] || lyrics.lines[i+1]!.start > lyrics.lines[i]!.end + .01)) points.push([l.end, lyrics.lines[i]!.end]);
  });
  const sourceOutro = sourceAudio.sections.find(s=>s.name==='outro')!.start;
  points.push([sourceOutro, lyrics.lines.at(-1)!.end + .2]);
  points.push([sourceAudio.duration, appendix]);
  points.sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<points.length;i++) if(points[i]![0]<=points[i-1]![0] || points[i]![1]<=points[i-1]![1]) throw new Error('Non-monotonic Russian time map');
  const map = (t: number, axis: 0 | 1) => {
    let i = 1;
    while (i < points.length - 1 && points[i]![axis] < t) i++;
    const a = points[i-1]!, b = points[i]!, out = 1-axis;
    return a[out]! + (b[out]!-a[out]!) * (t-a[axis]) / (b[axis]-a[axis]);
  };
  const toReal = (t:number) => map(t,0), toSource = (t:number) => map(t,1);
  toRecordingTime = toReal;
  const au = new AudioData({...sourceAudio, features: {}} as unknown as AudioJSON);
  // Original beat-index choreography with envelopes driven by the new recording.
  au.env = (name,t) => audio.env(name,toReal(t));
  au.hit = (kind,t,halfLife) => audio.hit(kind,toReal(t),halfLife);
  const localized = localizedLyrics(source, lyrics, toSource);
  const original = makeTimeline(source, au).map(entry => ({
    ...entry, start: toReal(entry.start), end: toReal(entry.end),
    load: async () => {
      const { default: Original } = await entry.load();
      return { default: class RussianScene extends Scene {
        original: Scene;
        constructor(ctx: SceneCtx) {
          super(ctx);
          this.original = new Original({...ctx, start:entry.start,end:entry.end,audio:au,lyrics:localized});
          this.stateful=this.original.stateful; this.handlesTransition=this.original.handlesTransition;
          this.prerollMax=this.original.prerollMax;
        }
        override async init() { await this.original.init(); }
        override reset() { this.original.reset(); }
        override dispose() { this.original.dispose(); }
        render(f:Frame,out:any) {
          const t=toSource(f.t), beat=au.beatAt(t),bar=au.barAt(t);
          return this.original.render({...f,t,dt:t-toSource(f.t-f.dt),lt:t-entry.start,p:(t-entry.start)/(entry.end-entry.start),start:entry.start,end:entry.end,beat,bar,beatPhase:beat-Math.floor(beat),barPhase:bar-Math.floor(bar),a:audio.sample(f.t)},out);
        }
      }};
    },
  }));
  const bookend = () => import('./bookends');
  return [
    {id:'ru-credits',start:0,end:opening,load:()=>import('./intro'),params:{kind:'intro'}},
    ...original,
    {id:'ru-appendix',start:appendix,end:audio.duration,load:bookend,params:{kind:'appendix', rewindAudio:au, rewindLyrics:localized, rewindStart:sourceOutro, rewindEnd:sourceAudio.duration}},
  ];
}
