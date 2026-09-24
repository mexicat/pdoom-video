# Engine guide (for scene authors)

The video is a web app (`app/`, TypeScript + three.js, run with bun + Vite) that renders any song time `t` deterministically at 1920×1080 (or at 2× that, 3840×2160, with `?scale=2`; see "Output scale" below). The same code drives the live preview and the offline 60 fps export.

## Running things

- Dev server (probably already running): `cd app && bunx vite --port 5173`. Preview: http://localhost:5173/?t=23.0 (space = play/pause, ←/→ = ±1 s, shift = ±5 s, `,`/`.` = ±1 frame, `[`/`]` = previous/next timeline entry, `l` = loop the current entry, `h` = hide the UI).
- Stills (the main way to check your work — then LOOK at the PNGs with the Read tool): `cd app && bun scripts/render.ts stills --t 12.5,13.0,14.2 --only open --out ../out/wip/open`
- Contact sheet of a time range: `bun scripts/render.ts sheet --from 1.5 --to 9 --n 16 --cols 4 --only open --out ../out/wip/open/sheet.png`
- Short video clip (to judge motion: extract frames with ffmpeg, or just trust the math): `bun scripts/render.ts video --from 20 --to 25 --only hook --out ../out/wip/hook.mp4 --preset veryfast`
- `--only a,b` loads only those timeline entries (fast, and isolates you from other people's broken scenes). Without a matching entry nothing renders (black), so the entry must exist in `src/timeline.ts`.
- Typecheck just your files: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep scenes/yourscene`.
- The render script prints `SCENE ERRORS` and browser console errors — read them.
- 4K: add `--scale 2` to any mode (`stills` then saves full-resolution 3840×2160 PNGs). Check your scene at both scales: downscaled, the 4K frame should look like the 1080p one, only sharper.

## Data

- `lyrics` (`src/engine/lyrics.ts`): `lines[]` with `text,start,end,words[]`, each word `{w,start,end}` (word-level, aligned to the vocal). Find lines by content, never hard-code times: `const l = this.ctx.lyrics.get('sudden drop')` → `l.words[3].start`. Helpers: `Lyrics.wordProgress(word, t)` (0..1 sung progress), `Lyrics.lineCharProgress(line, t)` (chars sung so far — for per-glyph wipes), `lyrics.findWords('P(doom)')`.
- `audio` (`src/engine/audio.ts`): `beats[]`, `downbeats[]`, `sections[]`, `beatAt(t)` (continuous beat index), `barAt(t)`, `timeOfBeat(i)`, `nearestBeat(t)`, `events('kick'|'snare'|'hat'|'vocal', t0, t1)`, `env(name, t)` for `rms|low|mid|high|vocal|drums|bass|other` (0..1), `hit(kind, t, halfLife)` decaying pulses.
- Every `Frame` already carries `f.a` = `{rms,low,mid,high,vocal,drums,bass,other,kick,snare,hat,vonset}` and `f.beat,f.bar,f.beatPhase,f.barPhase`.

## Writing a scene

One file `app/src/scenes/<name>.ts`, default-exporting a class extending `Scene` (`src/engine/scene.ts`):

```ts
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H, clearRT } from '../engine/gl';

export default class MyScene extends Scene {
  bg = new FSPass(`uniform float t; void main(){ fragColor = vec4(C_INK, 1.0); }`, { t: { value: 0 } });
  text = new Layer2D();
  async init() { /* build geometry, precompute text outlines, etc. */ }
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    this.bg.u.t!.value = f.t;
    this.bg.render(renderer, out);            // fullscreen shader → out (overwrites)
    const c = this.text.ctx; this.text.clear(); /* draw with Canvas2D */
    comp.draw(renderer, this.text.upload(), out); // alpha-over onto out
    return { bloom: 0.7 };                   // post overrides (optional)
  }
}
```

Rules:

- **Deterministic**: output must be a pure function of `f.t` (and seeded randomness: `mulberry32(seed)`, `hash(...)`). Never use `Math.random()`, `Date.now()` or `performance.now()` for visuals. If you need simulation state (particles, feedback buffers), set `stateful = true`, reset in `reset()`, integrate with `f.dt`, and the engine will fast-forward after seeks.
- `render()` must fully overwrite `out` (a HalfFloat linear-HDR target). Colours are **linear**; values > ~0.85 bloom. Use palette constants (`C_INK`, `C_BONE`, `C_SIGNAL`… in GLSL; `LIN.signal` in TS for GL; `rgba('signal', a)` for Canvas2D).
- `ctx.params` holds the timeline entry's params (one module can serve several entries); `ctx.start/ctx.end` its window; `f.lt`/`f.p` local time/progress.
- Transitions: by default the engine crossfades overlapping entries. For custom transitions set `handlesTransition = true` and composite `f.under` (the previous scene's frame) yourself using `f.tin` (0→1 over the overlap). Most cuts should be hard cuts on downbeats (no overlap) — that's the default when windows touch.
- Post overrides you can return: `exposure, bloom, bloomThreshold, bloomKnee, bloomRadius, halation, ca, grain, vignette, hud (HUD opacity), fade, flash, shake:[x,y], zoom, invert, pdoomText, hudCorruption`. Defaults in `src/engine/post.ts`.
- Performance: aim for < 25 ms/frame. Canvas2D layers cost ~2–4 ms to upload each; don't use more than 2–3 per scene. Precompute in `init()`.
- Don't edit files outside your scene files (and your own helper files named `scenes/<name>-*.ts`). Engine changes: ask the lead (report in your final message what you'd need). Do not edit `src/timeline.ts`.

## Toolbox

- `gl.ts`: `FSPass(frag, uniforms)` fullscreen GLSL3 pass (has `vUv`, writes `fragColor`, gets `GLSL_COMMON`), `Compositor` via `this.ctx.comp.draw(renderer, tex, target, {mode:'normal'|'add'|'screen'|'multiply'|'max', opacity, tint, scale, offset})`, `Layer2D` (1920×1080 logical Canvas2D → sRGB texture), `makeRT()` (screen-sized HDR target; `makeRT(w, h)` takes logical px), `clearRT(renderer, rt, [r,g,b])`, `SCALE`/`PW`/`PH` (output scale and physical size).
- `glsl/common.ts` (`GLSL_COMMON`, prepended to FSPass; import it into your own ShaderMaterials): palette consts, `hash*`, `snoise(vec2|vec3)`, `fbm`, `curl2`, 2D/3D SDFs, `smin`, `aaFill`, `aaStroke`, **`hatch(u, darkness)` and `engrave(uv, darkness, freq, angle)`** for engraving-style shading, `heat(x)` orange ramp, `toSRGB/toLinear`.
- `lines.ts`: `LineBatch(capacity, {screen2D, worldWidth, blend})` — GPU capsule segments, 2D pixels (y down) or 3D with a camera. `seg2`, `seg`, `polyline`, `render(renderer, out, camera?)`. Colours linear, can exceed 1 for glow. Good for 10k–200k segments.
- `type.ts`: fonts. `F.archivo(width 62–125, weight 300–900)` (grotesk with width steps 62/75/87.5/100/112.5/125), `F.archivoItalic()`, `F.serif(weight, italic)` (Cormorant Garamond), `F.mono(weight, italic)` (IBM Plex Mono). `font(family, px)` → CSS font string. `layout(text, family, size, tracking)` → per-glyph x/advance. `fitSize`, `measure`, `textPath2D` (opentype outline as Path2D), `textPathCommands`, `textPoints(text, family, size, step)` (points filling the glyphs — "text made of atoms").
- `stroke.ts`: single-stroke plotter/engraving fonts (`script`, `hscript`, `sans`, `readable`, `tech`, `serif`, `osmotron`, `felix`): `strokeText(text, font, size)`, `drawStrokeText(ctx2d, st, lengthPx)` → returns pen head position, `writtenLength(st, charTimes, t)` to sync writing to word timings.
- `util.ts`: `clamp, lerp, remap, smoothstep, ease.*, prog(x,a,b,ease), keys(t, [[t,v,ease],...]), springStep, pulse, mulberry32, hash, noise1/2/3, fbm1/2, polylineLengths, pointAtLength, window01`.
- `hud.ts`: the global HUD (crop marks; optional captions from timeline entries, unused since revision 2; the bottom-left P(doom) readout is OFF unless a scene returns `post.pdoom > 0`). P(doom) is staged inside plates: `new PDoom(lyrics).value(t)`, `formatPDoom(v)`, and `drawReadout(ctx2d, x, y, v, {scale})` to draw the instrument anywhere. `PDoom.value(t)` is available as `engine.hud.pdoom` — if you need the value in a scene, recompute with `new PDoom(this.ctx.lyrics).value(t)`.

## Output scale (4K)

`?scale=2` (render.ts `--scale 2`) renders a true 3840×2160 frame. Scenes keep laying out in logical 1920×1080 px (`W`, `H`, `ctx.W`, `ctx.H` never change); the engine handles the rest:

- Render targets: `out`, the engine's targets and `makeRT()` are physical (`PW`×`PH`). `makeRT(w, h)` takes logical px and allocates `w*SCALE`×`h*SCALE`; pass `{ pxScale: 1 }` for a data-sized target whose resolution must not follow the output.
- `Layer2D`: the backing canvas is `SCALE`× larger and its context is pre-scaled, so drawing code works in logical px. `setTransform`/`resetTransform`/`getTransform`, `shadowBlur`, `shadowOffsetX/Y` and `filter` px lengths are patched to stay logical. Not patched: `canvas.width/height` and `getImageData`/`putImageData` are physical px, and `drawImage(layer.canvas, x, y)` needs an explicit size. `new Layer2D(w, h, 1)` makes a deliberately low-res layer (e.g. a soft glow). `scaleContext2D(ctx, SCALE)` applies the same patch to your own canvas.
- `LineBatch`: coordinates and widths stay logical; the AA feather and the hairline floor work in physical px, so hairlines stay crisp.
- GLSL (`GLSL_COMMON`): `gl_FragCoord`, `fwidth` and `dFdx` are physical. Use `FRAG_PX` (the fragment position in logical px) instead of `gl_FragCoord.xy` whenever it is combined with logical sizes, and `PX_SCALE` to convert. A line whose width comes from `fwidth` ("a 1.2 px hairline": `1.0 - smoothstep(a, b, d / fwidth(u))`) gets thinner and fainter at 4K: write it as `pxLine(d, a, b)`, which is identical at 1× and keeps the 1× ink with sharper edges at 4K (`rampLine` does the same for the linear-ramp idiom). `hatch`, `engrave` and `aaStroke` already do this. LOD thresholds and supersampling offsets expressed in pixels should be logical (`fwidth(u) * PX_SCALE`, offsets `/ PX_SCALE`).
- Offscreen canvases used as textures (atlases, text planes) keep their own size: make them `SCALE`× larger (with `ctx.scale(SCALE, SCALE)`) if they are shown large, or they look soft at 4K.
- Post (bloom, halation, CA, grain, vignette) and the HUD scale automatically; the bloom pyramid stays at the logical resolution.

## Shared motifs (`app/src/scenes/_motifs.ts`)

Use these so recurring motifs look identical across plates: `sparkHead(lineBatch, x, y, t, scale, intensity)` + `sparkParticles(lineBatch, t, headAt, opts)` (the spark, drawn with a 2D additive `LineBatch`), `sparkHead2D` (Canvas2D fallback), and the mask: `drawMask2D(ctx, x, y, R, rot)`, `MASK` geometry constants and `GLSL_MASK` (`sdMaskInk(p)` in mask units, y down). Read-only for scene agents; ask the lead for changes.
