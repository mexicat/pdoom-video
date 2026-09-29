# Quantum physics & molecules — video production plan

Prepared 2026-09-28; Windows baseline independently verified later the same day. The complete quantum asset library has now been generated and checked; see [asset delivery](QUANTUM_ASSETS.md). The animated quantum scenes have not yet been assembled. See [Windows baseline verification](WINDOWS_BASELINE.md) for setup and test results.

## Confirmed direction

Create a quantum physics and molecules edition of the reference video using **the exact existing recording**, `audio/pdoom.mp3`. Keep its vocals, arrangement, playback speed, and duration. The user explicitly chose the reference song instead of a newly written song.

The result is a science-themed music video set to the original AI-themed lyrics. The singing will still mention AGI, ChatGPT, P(doom), and the other original subjects. On-screen karaoke must match those sung words; separate small scientific labels identify the new visuals. Do not silently substitute quantum lyrics over the existing vocals.

Working visual title: **MATTER / IN MOTION**. Format: landscape 16:9, 1920 × 1080 at 60 fps first; true 3840 × 2160 at 60 fps after measuring export cost.

## What was cloned and verified

- Repository: <https://github.com/mexicat/pdoom-video>.
- Workspace: `C:\Users\USER\Pictures\ai-motion-video`.
- Reference commit: `e5c31bcfe2a611df83355861d07f3b72597c060f`, on `main`.
- Original title: *I'm Upping My P(doom)*. The bundled recording is the Claude-Pop version identified in the upstream README.
- Audio: MP3, stereo, 48 kHz; `ffprobe` reports **156.650667 seconds**, or **2:36.65**.
- Committed timing analysis: **132.007 BPM**, 46 lyric lines, 227 timed words, beat/downbeat grids, section markers, onsets, and loudness envelopes.
- Edit: **22 timeline entries**, using 17 distinct principal scene modules. Repeated prompts and hooks share implementations.
- Rendering stack: TypeScript, Three.js/WebGL, Canvas2D typography, GLSL effects, Vite, Bun, headless Chrome through Playwright, and FFmpeg.
- Read the README, treatment, engine guide, renderer script, configuration, and relevant engine/scene source through the code knowledge graph. Indexed the repository as `pdoom-video`.
- Inspected the 14 committed scene stills in a generated contact sheet. These are reference assets, not a fresh render of the application. The upstream README also notes that its YouTube upload is an earlier render.
- Audio SHA-256: `7CDD9E61061F5F118370E58A9C46666A3EE92B8442E8B7FAE497D992991C6647`.

Local audit artifacts: `out/reference/reference-contact-sheet.jpg` and `out/reference/timeline-audit.json`. The `out/` directory is ignored by Git.

The repository licenses its code under MIT; its README explicitly excludes the song and lyrics from that license. Preserve the existing author and music credits; cloning the repository does not establish music redistribution permission.

## Visual direction

Treat the video as an animated scientific atlas. Each scene has a distinct composition, while the palette, typography, grain, and recurring orange marker hold it together.

Preserve the reference's ink black (`#0A0A0B`), bone (`#EEE9DF`), and signal orange (`#FF4D12`). Alternate dark laboratory views with occasional bone-paper diagrams. Keep Archivo for the sung words, IBM Plex Mono for scientific annotations, and restrained Cormorant Garamond for selected mathematical or title moments.

Use engraved contours, fine construction lines, crisp type, selective orange bloom, depth, and light grain. Let a recurring orange energy/measurement marker guide the camera through the film. Its identity may change between scenes; it is a graphic motif, not a claim that one electron follows a visible classical trajectory throughout the universe.

Build motion around holds, sudden changes, and controlled camera moves: kick-driven impacts, snare-driven reframing, and cuts aligned to the inherited beat grid. Integrate the lyrics into plots, instrument panels, molecular drawings, and the environment. Avoid a permanent subtitle strip competing with the imagery.

The narrative moves through **waves → measurement → atomic structure → molecules → extended matter → measurement again**. Transform one scene's geometry into the next wherever practical: a waveform becomes a probability contour, a contour becomes a bond-density surface, and a bond becomes a crystal edge.

## Scene-by-scene treatment

The times below were derived from the current lyric anchors and beat-snapping rules in `app/src/timeline.ts`, not rounded music-section labels. Keep these boundaries for the first adaptation. Names in the first column are existing timeline IDs; the proposed modules can use new descriptive names.

| Existing slot | Seconds | Quantum edition |
|---|---:|---|
| `open` | 0.000–9.328 | A scientific construction sheet draws itself from an orange point. Build a hydrogen probability-density illustration and coordinate axes. The original opening words write onto the sheet as sung. Camera dives through the drawing. |
| `loss` | 9.328–16.601 | The falling graph becomes an electron energy-level transition. A highlighted level drops; an emitted photon travels along the cut. Use the annotation `ΔE = hν` and distinguish the energy-level diagram from a spatial electron path. |
| `prompt1` | 16.601–22.509 | A measurement instrument types the original plea. A separate double-slit apparatus forms behind it; two aperture lines open on beats. Keep scientific labels distinct from the lyric text. |
| `hook1` | 22.509–24.328 | Preserve the full-frame, word-synced P(doom) hook. Interference bands snap into place behind the typography, setting the quantum visual vocabulary. |
| `room` | 24.328–29.782 | Rush into a particle-in-a-box illustration: a wireframe chamber containing standing-wave modes. On the final phrase, reframe into a molecular model as a transition in scale. |
| `shoggoth` | 29.782–38.418 | A scan reveals orbital structure underneath a simple outer silhouette. Engraved isosurfaces and nodal planes replace the creature imagery. End by flattening the contours into a single wave. |
| `spacetime` | 38.418–52.508 | Hero sequence: a wave packet propagates, resolves into an electron-density view, then transitions into water molecules. Give the existing “atoms rearranging” line its strongest visual payoff: bond diagrams and lyric letterforms recompose on the sung words. |
| `prompt2` | 52.508–58.871 | The second typed plea appears on a spectroscopy instrument. Spectral peaks activate on the beat. A magnification sweep carries the instrument trace into the next hook. |
| `hook2` | 58.871–60.235 | Repeat the hook with the reference's stronger orange-field treatment. Spectral lines compress into the huge typography. |
| `ascent` | 60.235–69.780 | Climb a quantized energy ladder, then pull back through atom, molecule, and repeating material structure. The original lyrics remain expressive text; do not present their numbers or claims as measured quantum quantities. |
| `bureau` | 69.780–81.143 | Bone-paper molecular atlas: H₂O, CO₂, and CH₄ diagrams, geometry annotations, dimension leaders, and deadpan laboratory stamps. Alternate overhead drawings with close views of the models. |
| `leftturn` | 81.143–88.870 | A wave packet encounters a finite barrier. Show both reflected and transmitted amplitudes in a labeled tunneling schematic. Follow the transmitted component with the reference's sharp camera turn. |
| `prompt3` | 88.870–95.233 | Quiet instrument scene: the third original plea types beside a sparse two-system correlation diagram. Reduce motion and density to follow the song's quieter passage. |
| `hook3` | 95.233–96.596 | The restrained hook: small typography, large black field, and a brief correlated-pair measurement cue. Preserve all sung-word timing. |
| `paperclips` | 96.596–102.051 | A bond unit repeats into a crystal lattice. Glide through the growing structure using instanced geometry; lyric fragments sit on occasional flat annotation planes. |
| `fuse` | 102.051–109.778 | The orange line becomes an energy-transfer motif across bonds. Transition into a vibrating molecular mode, with the audio shaping the illustration's amplitude. Identify it as stylized motion, not a real-time physical frequency. |
| `stack` | 109.778–115.232 | Fall through stacked molecular-orbital diagrams and repeated material layers. Strong perspective and interrupted camera moves retain the reference's architectural energy. |
| `dense` | 115.232–124.322 | Increase the number of visible lattice sites and density contours; pressure comes from framing, type, and repetition. A barrier illustration gives way to a transmitted wave on a stressed phrase. |
| `hook4` | 124.322–126.140 | Maximum-scale hook: layered type, molecular forms, and a controlled orange impact. Keep the lyric readable despite the increased complexity. |
| `loom` | 126.140–131.595 | An interference diagram draws alternative contributions and combines them into a visible intensity pattern. Branching lines are a visual device; avoid presenting them as proof of literal universe splitting. |
| `ilya` | 131.595–140.230 | Quiet measurement laboratory. Detector events appear one by one, followed by a readable accumulated distribution. Finish with a shutter narrowing to the orange point. |
| `outro` | 140.230–156.651 | A rhythmic recap travels through molecular lattice, bond, orbital, and wave. End on the opening scientific sheet for a visual loop. Retain the recording's existing musical ending; do not change the audio to force an audio loop. |

## Scientific presentation rules

The imagery should be recognizable and defensible, while remaining an expressive music video.

- Use electron probability densities, orbital shapes, and labeled energy levels. A decorative circle is not a literal electron orbit.
- Separate wavefunction phase from probability density: `ρ = |ψ|²`; if phase is shown, distinguish it through hatch direction or a legend without adding a rainbow palette.
- Show a double-slit interference distribution rather than drawing one localized particle visibly splitting into two classical balls.
- Show reflected and transmitted components in tunneling. Do not imply that tunneling requires the particle to gain enough energy to climb over the barrier.
- Entanglement imagery shows correlations, not a controllable message traveling faster than light.
- Use plausible molecular geometry: water bent at about 104.5°, carbon dioxide linear, methane tetrahedral at about 109.5°. Ball-and-stick models and enlarged nuclei should be identified as schematic when scale could mislead.
- Keep decorative P(doom) typography associated with the original lyric. Do not relabel its escalating values as scientific measurement probabilities or carry the original probability-greater-than-one gag into a physics plot.
- Do not add black-hole imagery merely as shorthand for quantum physics. This treatment centers on microscopic matter and quantum chemistry.

## Reuse and implementation map

| Component | Action |
|---|---|
| `audio/pdoom.mp3`, `data/audio.json`, `data/lyrics.json`, `lyrics/lyrics.src.js` | Reuse unchanged. No new song, stem separation, speech transcription, or forced alignment is needed. |
| `app/src/engine/` | Reuse deterministic playback, line rendering, typography, audio features, compositing, and post-processing. Keep the existing `PDoom` helper only where it serves the sung hook. |
| `app/src/scenes/_motifs.ts` | Reuse suitable orange-line primitives. Add quantum-specific helpers separately; existing creature/mask motifs are not part of the new treatment. |
| `app/src/scenes/quantum-*.ts` | Add the new scene classes and small shared geometry helpers. Hydrogen orbital illustrations can use analytic functions; molecular geometry can use explicit coordinates and instancing. |
| `app/src/timeline.ts` | Keep the current lyric anchors, timing, and repeated-section structure; wire those slots to the quantum modules. Preserve an accessible reference timeline for comparisons. |
| `app/src/main.ts` | Retain the existing soundtrack path and preview controls; add reference/quantum selection only if needed for comparison. |
| `app/vite.config.ts` | Make repository-root audio/data resolvable on Windows without depending on Unix symlinks. |
| `app/scripts/render.ts` | Make browser graphics options platform-aware and add an explicit output choice for the quantum edition. Retain the original audio input. |
| `app/plates.json`, `app/public/plates/` | Generate a separate quantum plate set after scenes settle; ensure the ending uses quantum snapshots rather than original scene thumbnails. |

Every new scene should depend on song time and seeded randomness. This supports seeking, identical repeated captures, and the engine's out-of-order subframe rendering. Use analytic motion or precomputed paths rather than a live simulation that changes with frame order.

## Windows readiness findings

Node 24.17.0, Chrome, FFmpeg, FFprobe, and uv are available. Bun 1.4.2 and renderer dependencies are now installed. The current executor's PATH has not refreshed, so verification invoked Bun by its absolute installation path. Chrome's actual WebGL context reports AMD Radeon graphics through Direct3D 11.

Two repository entries, `app/public/audio` and `app/public/data`, remain ordinary text files containing symlink targets. The Vite development server now rewrites `/audio/` and `/data/` requests through its repository-root file server, so these stubs no longer block preview or offline rendering. Audio, JSON, fonts, and HTTP byte ranges were verified. Packaged static-viewer asset copying is still outside this baseline.

The renderer now selects Direct3D 11 on Windows, Metal on macOS, and Chrome's default elsewhere, with an explicit override available. Its private server now launches the current Bun executable and the installed Vite CLI directly; verification first reproduced the missing-`bunx` failure, then confirmed the fix through a complete MP4 export. Relative still/contact-sheet output paths are resolved to absolute paths for Bun's Windows directory-creation behavior.

Both TypeScript projects pass. A 1.7-second hook export produced 102 frames at 1080p60 with stereo AAC, decoded cleanly, and was visually inspected. A short spacetime probe averaged 110.2 ms per frame at one sample. The earlier long adaptive benchmark remained active during verification, so these are preliminary timings under concurrent GPU load, not a final whole-film estimate. That benchmark has since completed over 38.4–42.4 seconds: 115 ms per frame at one sample, and 5.8 s per frame (p95 10 s) with `--samples auto --shutter 0.2`. Measured on this slot only, that implies roughly 1.5 hours for a 1080p draft at `--samples 4` and about 15 hours for the final-quality 1080p settings; details are in the baseline document.

The optional audio-analysis environment includes Apple-specific MLX tooling and original-song-specific corrections. It is unnecessary for this adaptation because the existing song and timing data are retained. Do not spend time downloading its multi-gigabyte models for this task.

## Build sequence and reviewable deliverables

1. **Reference baseline.** Resolve Bun, asset serving, and browser backend compatibility. Run the original preview, a typecheck, a representative still, and a short reference export. Confirm fonts, audio, scene loading, and encoding work on this machine. Record actual performance before choosing final render settings.
2. **One complete hero scene.** Implement the 38.418–52.508 second sequence first: wave packet → electron density → molecules. Include the original lyrics and audio, final-style typography, one convincing camera transition, and selected stills. Render this roughly 14-second clip at 1080p60 as the first concrete proof of the direction.
3. **Shared visual building blocks.** Build orbital/contour helpers, labeled molecule geometry, deterministic wave diagrams, and instanced lattice geometry. Reuse these across scenes while varying composition and motion.
4. **Full timeline.** Implement the remaining slots, including the three prompts, four hook variants, light/dark rhythm, and visual handoffs. Keep the inherited timing data and soundtrack fixed.
5. **Editorial pass.** Render representative frames plus both sides of every scene boundary. Watch a full draft with audio. Adjust lyric placement, overstimulating effects, camera rhythm, and scientific labels. Regenerate the quantum recap plates.
6. **Final export.** Deliver a 1080p60 MP4 first. Use a few samples for drafts; benchmark adaptive sampling and `--shutter 0.2` for the final. Produce 4K60 only after a representative scene establishes practical time and memory cost. Final MP4 audio can follow the repository's AAC encoding; it remains the same performance and mix, without retiming or a replacement track.

Do not extrapolate the upstream author's M5 Pro render time to this Windows machine. The renderer can use up to 324 subframes for fast motion, and dense orbital volumes or lattices can make exports much slower than playback.

## Completion criteria

- The complete song plays once, unchanged in timing, with no replacement vocals or missing sections.
- Original lyrics highlight on their existing word times and remain legible inside the safe area.
- Every timeline interval loads; seeking and isolated scene rendering work without scene or browser errors.
- New visuals cover the full film, including the recap and ending; no accidental old creature, AI-room, or paperclip images remain.
- Repeat rendering at the same time produces the same scene, and adaptive sampling does not depend on accumulated simulation state.
- Contact sheets and the full draft show no blank cuts, missing fonts, clipped type, stray UI controls, or broken asset requests.
- Scientific labels and molecular geometry pass the rules above. Music-video metaphors are not presented as computed experimental results.
- FFprobe verifies the delivered dimensions, 60 fps, an audio stream, and duration within normal frame/audio encoding tolerance of the source.
- Preserve code/font/music attribution in the project and delivery notes.

## Current handoff

Completed: clone, initial graph indexing, source/documentation review, asset and audio inspection, exact timeline audit, reference contact sheet, this plan, the functional Windows baseline, and the complete 76-asset quantum library covering all 22 scene slots. See [baseline verification](WINDOWS_BASELINE.md) and [asset delivery](QUANTUM_ASSETS.md).

Next implementation action: assemble the 14-second wave-to-molecule hero clip using the generated plates, transparent layers, geometry, and numerical data. Original scenes, soundtrack, and timing files remain unchanged. Animated quantum scene implementations, adaptive export performance, and full-film/4K validation remain for later production.
