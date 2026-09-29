// DNA edition — the four choruses, "I'm upping my P(doom)" (docs/DNA_VIDEO_PLAN.md, rows hook1..hook4).
// One module, four emotional scales; `params.n` picks the stage:
//   1 (22.509–24.328) one ladder striking into type: a flat B-DNA ladder whose rungs snap shut as the
//     voice reaches them; after DOOM a rung sweeps across and the rails part into a chamber (→ room).
//   2 (58.871–60.235) abundance: amplification products double on the eighth notes, then align into
//     each hook word over a brief orange field; at the end the field separates into windows at
//     different scales (→ ascent's atlas).
//   3 (95.233–96.596) absence: a lonely line of type a third of the usual width in a black field,
//     beside the empty orange focus bracket (the deleted base's), no flash.
//   4 (124.322–126.140) recognition before release: each enormous word lands on a field of cells and
//     casts its shadow; P(DOOM)'s counter is a microscope circle, and DOOM puts the orange point in it.
// Every sung word is on screen and synced (the carried-in line's tail included); P(doom) rolls on its
// dial as decoration of the lyric. Pure function of song time.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { hookData, type Stage } from './dna-hook-type';
import { LadderHook } from './dna-hook-ladder';
import { CopiesHook } from './dna-hook-copies';
import { AbsenceHook } from './dna-hook-absence';
import { CellsHook } from './dna-hook-cells';

export default class DnaHook extends Scene {
  stage!: Stage;
  override async init() {
    const h = hookData(this.ctx);
    this.stage = h.n === 1 ? new LadderHook(h) : h.n === 2 ? new CopiesHook(h) : h.n === 3 ? new AbsenceHook(h) : new CellsHook(h);
    await this.stage.init();
  }
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    return this.stage.render(f, out);
  }
}
