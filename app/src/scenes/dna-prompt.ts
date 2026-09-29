// DNA edition, the three pre-chorus pleas (docs/DNA_VIDEO_PLAN.md, slots prompt1/2/3). One module,
// three instrument plates chosen by `ctx.params.variant`; in each the plea is typed onto the plate's
// annotation plane (Archivo karaoke rows with a typed-input caret on the wipe head):
//   chatgpt (prompt1): a replication fork; the separated strands frame the words like shutters and
//                      line up into the ladder's rung geometry for hook1        → dna-prompt-fork.ts
//   sydney  (prompt2): takes over the hero fold's REARRANGING shadow on bone paper (the timeline
//                      overlaps the fold until "Sydney" starts), then a thermal-cycler plate:
//                      denature, anneal, extend, copies accumulate; one amplification curve;
//                      the copies set like lines of type for hook2               → dna-prompt-pcr.ts
//   gato    (prompt3): quiet; a schematic gel, two sample lanes and a size ladder on black; one
//                      lane lacks a band and the empty orange bracket waits there → dna-prompt-gel.ts
// Everything is a pure function of song time.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import type { Plate } from './dna-prompt-type';
import { ForkPlate } from './dna-prompt-fork';
import { PcrPlate } from './dna-prompt-pcr';
import { GelPlate } from './dna-prompt-gel';

export default class DnaPrompt extends Scene {
  // prompt2 composites the fold's frame (f.under) itself during the overlap
  override handlesTransition = true;
  plate!: Plate;

  override async init() {
    const v = this.ctx.params.variant ?? 'chatgpt';
    this.plate = v === 'sydney' ? new PcrPlate(this.ctx) : v === 'gato' ? new GelPlate(this.ctx) : new ForkPlate(this.ctx);
    await this.plate.init();
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    return this.plate.render(f, out);
  }
}
