# CODE / OF LIFE — DNA director's treatment, revision 2

Prepared 2026-09-29. Creative direction for the DNA edition of *I'm Upping My P(doom)*. Status: treatment and production brief; DNA scenes and assets described here are not yet built. The previous treatment is preserved in [archive/DNA_VIDEO_PLAN_v1.md](archive/DNA_VIDEO_PLAN_v1.md). The existing quantum assets remain available separately.

**The idea:** we begin by examining the machinery of life; we end by discovering that the observer is made of the machinery.

**Title:** CODE / OF LIFE. **Acts:** READ · COPY · BECOME. **Emotional arc:** curiosity → delight → unease → recognition. **Final silent title:** THE OBSERVER IS ALIVE.

Use [DNA_DIRECTOR_PROMPT.md](DNA_DIRECTOR_PROMPT.md) as the copyable director's prompt. This document specifies how to turn it into the timed film.

## The dramatic engine

The singer fears systems that copy, transform, and exceed human control. Biology gives those fears a visual vocabulary, but also gives the film its answer: copying and transformation make living beings possible. The ending should restore wonder without dismissing the unease.

Begin with the confidence of a scientific plate: centered subject, ruled margins, a single orange focus mark. As sequences become proteins and copies multiply, the objects gain depth and press beyond their neat frames. One missing nucleotide breaks the visual order. The final act moves through several explicitly separate biological examples, then pulls back to reveal the observer. We have spent the film looking at processes that also make looking possible.

Let the change in visual order carry the story. The sequence is a protagonist by association, not a conscious character. DNA is not an intentional optimizer, and evolution is not a program pursuing a universal goal. Avoid declaring biology equivalent to AI or claiming the lyrics secretly describe scientific facts.

## What stays locked

- Exact existing `audio/pdoom.mp3`: approximately 156.650667 seconds, 132.007 BPM, stereo 48 kHz. No remix, replacement song, added narration, or added sound effects.
- All 46 lyric lines and 227 timed words in `data/lyrics.json`, including their original AI references. Preserve acronym syllable timings and the original vocal tail.
- All 22 slots and boundaries as defined in `app/src/timeline.ts` (`out/reference/timeline-audit.json` is a generated, git-ignored snapshot of it); retain the reference timeline as a selectable comparison when implementation begins.
- Ink `#0A0A0B`, bone `#EEE9DF`, signal orange `#FF4D12`. Archivo lyrics, IBM Plex Mono annotations, Cormorant Garamond titles.
- First production target: 1920 × 1080, 60 fps. Output preference: `D:\pdoom-dna\`. Check drive availability and free space before rendering. Benchmark before committing to 4K or a full export.

## Visual direction

**Scientific engraving with physical depth.** Fine contours and cross-hatching rise from paper into shallow relief, then into deep molecular spaces. Hard side-light gives structures weight. A helix can fill the frame like architecture; its recognizable groove and base-pair geometry keep it molecular. Avoid decorative floating atoms, rainbow molecules, generic neon tunnels, and indiscriminate particle showers.

**Three scales of attention.** Each shot gets one dominant structure, one lyric event, and at most one explanatory label. Supporting details appear only when the camera arrives at them. The audience should recognize the action at phone size before noticing a scientific annotation.

**Three motion speeds.** Sustained vocals allow a slow orbit or held silhouette. Beats drive assembly and framing. Short impacts punctuate a reveal. Keep a stable viewing axis during the hero fold; reserve the disruptive whip for the frameshift. Do not shake every camera or hit every snare with a cut.

**Typography has physical consequences.** A word can occlude a model, cast a shadow, compress a field, or expose negative space. Its readable face stays clean. Scientific letter sequences and the sung lyrics are separate layers. Large lyrics never become unreadable molecular decoration.

**The paper remembers.** An orange outline, a missing notch, or a displaced registration mark can persist across an editorial cut. These graphic traces bind different scientific examples into one film without suggesting a literal causal chain between them.

## Orange motif: attention, then absence

Rename the former fluorescent TAG to **FOCUS** in production notes. It is an editorial marker, usually a tiny dot with an open registration bracket. It is not a fluorophore transferred through transcription, translation, inheritance, or nerve impulses.

1. **Discover:** bracket one base in the opening helix.
2. **Follow:** match-cut the bracket to a codon and then to a residue. Brief changes of carrier make each handoff legible.
3. **Multiply:** repeat graphic brackets across an array of amplification products. No claim of inherited dye.
4. **Lose:** delete the highlighted nucleotide. Leave its bracket around empty space.
5. **Wait:** retain that empty bracket through the quiet gel scene and third hook.
6. **Resume:** match-cut the bracket to a new signaling event on an axon. Its return is a new subject, not a repaired mutation.
7. **Recognize:** the bracket becomes a reflection in the observer's eye, then returns to the opening composition.

Orange changes dramatic meaning: discovery → abundance → absence → attention. Full orange fields are reserved for brief hook impacts; sustained scientific scenes use it sparingly.

## Slot-by-slot direction

Times below are locked scene boundaries, not lyric cutoffs. The global lyric layer continues across them as specified later.

### ACT I — READ: a sequence becomes a world

| Slot | Seconds | Image, lyric event, and transition |
|---|---:|---|
| `open` | 0.000–9.328 | An orange point sits inside a circular microscope field on bone paper. A hairline finds a base; paired strands grow around it into right-handed B-DNA. On “eyes,” rotate until the groove resembles a narrow architectural passage. “Circuits” travels beside the backbone as lyric, without labeling DNA an electrical circuit. Dive into the groove; one rung straightens into the next chart's tick. |
| `loss` | 9.328–16.601 | A schematic replication-error plot descends through proofreading and repair. On “drop,” the line falls sharply and continues as the contour of an opening replication fork. The machinery becomes large enough to crop beyond the frame. Use `error reduction · schematic`; reserve organism-specific rates for sourced assets. The graph's two edges become separated strands. |
| `prompt1` | 16.601–22.509 | The original plea types onto an instrument's annotation plane. Two separated strands frame the words like shutters. Their slow movement makes the request feel vulnerable. The bracket waits over one base; the strands line up into the rung geometry of the hook. |
| `hook1` | 22.509–24.328 | First chorus: one ladder, one typographic impact. Preserve “alive” until 22.760, then hit each hook word at its word time. A rung sweeps across the frame as the opening of a chamber. |
| `room` | 24.328–29.782 | A cutaway ribosome: mRNA enters, tRNAs dock, a chain emerges. “Chinese room” accompanies the tiny label `translation`; the Searle analogy belongs in notes, not a claim of literal equivalence. Pull back to a polysome, several ribosomes on one mRNA. Their curved silhouettes establish the circular shape used in the next cut. Do not force a mushroom illustration into the last lyric. |
| `shoggoth` | 29.782–38.418 | A circular scanning aperture reveals a schematic icosahedral viral capsid in layers: shell, then packaged genome. No monster or invented host disguise. Cut on “shinigami eyes” to chromosome-end repeat blocks viewed through paired apertures. A few repeats shorten in a compressed sequence, labeled `telomere dynamics · schematic`; no countdown to death. The two apertures merge into one inspection light over the hero chain. |

### ACT II — COPY: beauty, abundance, one missing letter

| Slot | Seconds | Image, lyric event, and transition |
|---|---:|---|
| `spacetime` | 38.418–52.508 | Signature protein-folding scene. A chain emerges steadily, then folds above a paper surface that deepens into a free-energy contour landscape. Secondary motifs become readable without turning into an orderly universal folding recipe. On “atoms,” an enlarged shadow resolves into ATOMS; on “rearranging,” the shadow redistributes into REARRANGING. The molecule remains a continuous structure. Carry that word across the cut. Detailed choreography below. |
| `prompt2` | 52.508–58.871 | Open with the hero's shadow still registered on the paper until 52.825. Then a thermal-cycler view: parallel strands separate, primers align, products accumulate across successive schematic cycles. The original Sydney plea remains the lyric. A single amplification curve is enough; repeated products match-cut into type. |
| `hook2` | 58.871–60.235 | Abundance: copies occupy the field and align into the large hook silhouette over a brief orange background. “Free” holds until 59.130; the hook's final word survives into `ascent` until 60.580. Copies separate into windows at different scales. |
| `ascent` | 60.235–69.780 | A nesting atlas opens: DNA → nucleosome → nucleus → cell → tissue → organism. Each level appears in a distinct frame with its own scale bar; never a continuous physically plausible zoom between arbitrary objects. The frames stretch far beyond the camera. Keep the lyric's FLOPs figure as lyric, not biological measurement. One small frame becomes the next paper form. |
| `bureau` | 69.780–81.143 | The film's dry joke: a beautiful paper form stamped `REVIEW COMPLETE` continues extruding copies beyond its own margin. On “Forward MLP, backward, repeat,” a three-step PCR wheel advances: separate, anneal, extend. This is an editorial analogy, not backpropagation. On “von Neumann,” place an abstract constructor diagram next to a cell and stamp `DIFFERENT MACHINERY. SAME QUESTION.` No claim that a ribosome is a universal constructor. Remove the extra Punnett square, karyotype, and codon-table clutter. A paper rule becomes a sequence baseline. |
| `leftturn` | 81.143–88.870 | On “Sharp left turn,” remove exactly one base. The triplet brackets slide by one while the camera whips left. Downstream codons regroup into a designed example ending at a premature STOP. The highlighted base vanishes; its orange bracket remains empty. The rest of the shot holds the consequence rather than inventing more destruction. Sequence brackets lengthen into gel lanes. |
| `prompt3` | 88.870–95.233 | Two sample lanes and a size ladder occupy a large black field. This is an explicitly separate schematic assay, not a claim that an ordinary gel resolves a one-base deletion. One lane lacks a chosen band; the empty bracket waits at its expected location. Minimal movement under “Gato, please don't let me go.” |
| `hook3` | 95.233–96.596 | Absence: a restrained hook at roughly a third of the usual type width, with generous empty space. “Go” persists until 95.470, then the hook begins. Its last word continues until 96.840. The empty bracket, rather than a flash, is the visual accent. |

### ACT III — BECOME: the observer belongs to the picture

| Slot | Seconds | Image, lyric event, and transition |
|---|---:|---|
| `paperclips` | 96.596–102.051 | Capsid subunits assemble into shells until gaps in the field disappear. At 98.820, a clean editorial cut changes the subject to a separate cell-control diagram: `p53 / OUT OF OFFICE`, with `tumor-suppressor pathway · schematic` as the one explanatory annotation. A checkpoint remains open and proliferating cells crop against the frame. This cut separates viral assembly from tumor biology. The narrowing gap becomes a dark channel. |
| `fuse` | 102.051–109.778 | After the previous lyric finishes, illumination propagates along a myelinated axon and brightens successive nodes on musical accents. The orange bracket follows a new event. Show an electrical-wave graphic, not a bead physically flying along the nerve. A synaptic gap briefly opens the composition. The “orthogonality” phrase remains poetic accompaniment. The axon contour match-cuts to a chromatin loop. |
| `stack` | 109.778–115.232 | A DNA segment wraps nucleosomes; an irregular field of loops folds through the camera. No mandatory 30-nm-fiber ladder. On “disobey,” one region becomes accessible and transcription begins in a schematic example. Pull back until the looped silhouettes rhyme with the borders of neighboring cells. |
| `dense` | 115.232–124.322 | A field of cells progressively consumes the negative space. At “safety fence,” a few cross a hatched basement membrane, labeled `local invasion · schematic`. At “RLHF goes askew,” the camera stays within the cell-growth subject: a stylized inhibitory signal reaches a receptor but the downstream diagram fails to change. Label `growth control disrupted`; do not introduce a rushed immune-training equivalence. One cell boundary enlarges into the counter of the next giant word. |
| `hook4` | 124.322–126.140 | Recognition before release: one enormous hook word casts a shadow across the cellular field. Its negative space echoes the opening microscope circle. One controlled orange impact. Do not pile helix, virus, neuron, and cells into an unreadable collage. |
| `loom` | 126.140–131.595 | The field resolves into a branching phylogeny with equally weighted living tips. A small inset on “masked” shows one promoter-region methylation example, marked `regulation · context dependent`. The branching continues under “self-upgrade,” with no upward progress arrow. Pull toward a root marked LUCA, then match its circular node to a microscope field. |
| `ilya` | 131.595–140.230 | Quiet. Hold on a dividing cell under an objective. Pull back from the field into the reflection in an observer's eye, echoing “eyes” from the opening. The circular aperture closes during the final question; retain the sung “show?” into the outro until 140.550. No claim about what the real Ilya saw. The viewpoint now makes the observer part of the composition. |
| `outro` | 140.230–156.651 | Finish the lyric first. During the original vocal chant, reveal a spare anatomical outline of the observer, with nested windows recalling cell, protein, and helix. The subtitle `THE OBSERVER IS ALIVE.` appears only after 140.550; it is silent editorial text. Return through a few spacious scale cuts to the opening paper and focus point. Resolve by roughly 153.600 and hold through the untouched audio tail. This is a visual loop, not a claim that the song loops seamlessly. The outro vocal is real but untranscribed: the vocal stem in `data/audio.json` stays at sung-verse level with 25 note onsets from 140.71 to 153.74 s, while neither `data/lyrics.json` nor `lyrics/lyrics.src.js` has words after 140.550. Listen to it before designing over it; if it carries words, they need timing and karaoke like every other sung line. |

## Hero choreography: the shot that proves the film

The core scene lasts 14.090 seconds. Its final lyric resolves in the next slot. Render a proof spanning 38.418–53.000 so the handoff can be judged with audio.

| Absolute time | Staging | Reading priority |
|---|---|---|
| 38.418–38.620 | Establish the ribosome exit and a short continuous chain. Bracket changes carrier through a visible match cut. | Subject before lyric. |
| 38.620–41.340 | “Stable training run”: measured chain extension; camera almost locked. The orange accent marks one residue. | Stable geometry and sung text. |
| 41.340–45.060 | Paper contours gain relief and become a schematic energy landscape. Follow the chain as contacts develop; retain a clear silhouette. | One continuous chain, one camera axis. |
| 45.060–49.562 | Folding gathers pace; selected helices and sheets become readable. Side-light gives the fold sculptural weight. Use precomputed keyframes, not live physical simulation. | Form first; tiny `folding · schematic` label. |
| 49.562–50.480 | “I feel my”: hold the folded structure and begin rotating the light. The shadow stretches onto a flat receiving plane. | Prepare the reveal without spoiling it. |
| 50.480–51.380 | “Atoms”: shadow and an authored typographic matte align to ATOMS. | Exact word silhouette; molecule remains intact. |
| 51.380–52.508 | “Rearranging”: transition the authored shadow to REARRANGING. Widen framing to accommodate its length; keep the lyric face sharp. | Full readable word, not scattered letters. |
| 52.508–52.825 | In `prompt2`, preserve the shadow's screen-space transform while its receiving plane becomes the instrument sheet. | No restart, truncation, or duplicate word. |
| 52.825–53.000 | Sydney begins; the lyric layer advances and the next subject comes into focus. | Clean ownership transfer. |

The shadow typography is an editorial composite, not a claim that a real protein casts those words. Use an authored shadow matte for the illusion and a separate unblurred lyric face for legibility. Do not distort molecular connectivity to form letters. Avoid a rushed membrane-docking step: it adds a second biological claim without time to establish a membrane protein.

## Timing contract

Use song time for lyrics and slot-local time for scene motion. Render the lyric layer once above the scene transition, or share a persistent word state between scenes. Never restart karaoke progress on a cut. A hook slot can begin before its hook is sung and end before its final word finishes.

The following long carryovers need explicit design:

| Incoming slot | Cut time | Carry until | Ongoing line |
|---|---:|---:|---|
| `loss` | 9.328 | 9.520 | that's no surprise |
| `hook1` | 22.509 | 22.760 | ChatGPT, please don't eat me alive |
| `shoggoth` | 29.782 | 29.907 | with a bag of shrooms |
| `prompt2` | 52.508 | 52.825 | I feel my atoms rearranging |
| `hook2` | 58.871 | 59.130 | Sydney, please let me free |
| `ascent` | 60.235 | 60.580 | I'm upping my P(doom) |
| `leftturn` | 81.143 | 81.210 | Now von Neumann's obsolete |
| `prompt3` | 88.870 | 89.280 | Without a single CDR |
| `hook3` | 95.233 | 95.470 | Gato, please don't let me go |
| `paperclips` | 96.596 | 96.840 | I'm upping my P(doom), |
| `fuse` | 102.051 | 102.460 | Now there's nowhere left to go |
| `hook4` | 124.322 | 124.520 | RLHF goes askew |
| `ilya` | 131.595 | 131.636 | To recursive self-upgrade |
| `outro` | 140.230 | 140.550 | Was it all for show? |

The same global rule handles lines beginning just before the `prompt1`, `room`, `bureau`, `dense`, and `loom` cuts. These are already in progress when the new slot appears. Do not shift word timestamps to a beat grid; use the beat grid for supporting motion. Existing timing estimates have uncertainty, especially the final chorus (per-word `conf` in `data/lyrics.json` averages 0.73 there, against 0.79–0.92 for every other section; the 124.52 s "I'm upping my P(doom)" is the least certain line in the song, average 0.39, minimum 0.35): retain the supplied alignment and judge it against playback.

## Scientific guardrails for asset creation

| Subject | Production requirement |
|---|---|
| DNA | Right-handed B-DNA, antiparallel strands, correct pairing, distinct major/minor grooves. Approximate width 2 nm, rise 0.34 nm per base pair, 10.5 bp per turn, giving roughly 3.6 nm pitch for this chosen model. Do not present those rounded values as universal constants. |
| Hydrogen bonds and RNA | A–T two bond ticks; G–C three. RNA uses U. Keep transcription distinct from translation; show an explicit editorial cut when skipping between them. |
| Translation | Two ribosomal subunits, tRNAs, triplet reading 5′→3′, growing polypeptide. Human reading or consciousness is not implied. The Chinese-room comparison is philosophical. |
| Folding | A schematic pathway through selected conformations, not a measured trajectory or exhaustive search. Secondary and tertiary structure can develop together. Either credit a chosen public structure and its source/license or call the entire fold schematic. |
| Frameshift | Use this short synthetic coding example: DNA `ATG CTA AAG GCT GGA TAA`, transcribed as RNA `AUG CUA AAG GCU GGA UAA`. Delete the fourth DNA base, C; the altered RNA groups as `AUG UAA AGG CUG GAU AA`. Its second codon is now STOP instead of the original sixth codon. The final two bases are an incomplete triplet; dim everything beyond the early stop rather than translating it. Do not claim every possible frameshift changes every amino acid. |
| Telomeres | Show schematic dynamics and possible shortening, not remaining lifetime. Cell type and telomerase affect behavior. |
| PCR | A lab amplification process with primers and polymerase. If temperature labels are used, mark them typical and protocol-dependent. Never call MLP training a PCR protocol or imply a label copies itself automatically. |
| Virus and p53 | Use a stated schematic capsid architecture. A virion is not simply naked code; viral contents vary. p53 participates in stress responses, arrest, and apoptosis; it is not a sole kill switch. Keep viral and tumor vignettes visibly separate. |
| Axon | Depolarization propagates and is regenerated at nodes; the orange animation indicates activity, not one moving ion or molecule. Beat timing and distances are stylized. |
| Chromatin | Nucleosomes contain about 147 bp wrapped around a histone octamer. Draw variable loops and packing; no universally mandatory regular 30-nm intermediate. |
| Regulation and invasion | Methylation is context dependent. Accessibility is not automatically expression. Crossing a basement membrane depicts local invasion, not the full process of metastasis. |
| Evolution and LUCA | A schematic lineage tree with no privileged top. LUCA means last universal common ancestor, not first life. Branching omits real reticulation and gene transfer; do not claim it is a complete phylogeny. No foresight or universal self-upgrade. |
| Observer | Nested anatomical images are montage across scales, not live optical resolution through skin into DNA. Keep model, analogy, and observation distinguishable. |

Put detailed explanations and source credits in the asset notes. On-screen annotations should clarify the current image without competing with the music. Reference historical ideas only when their citation earns screen time; no unsupported 1948 priority claim or Hooke-cork footage presented as living dividing cells.

## Asset brief and build order

Prefer controllable geometry, vector masks, and engine-rendered type. Optional generated raster art can establish engraving, paper, or lighting references; it should not supply letter-perfect lyrics or trusted molecular geometry.

| Asset family | Required outputs | Acceptance check |
|---|---|---|
| Hero fold | Continuous backbone, selected conformation keyframes, schematic landscape, orange residue marker, two shadow masks, lyric handoff state | Stable topology; readable ATOMS and REARRANGING; deterministic seeking. |
| Helix and sequence | Groove-aware helix, base glyphs, pair ticks, replication fork, RNA ribbon, verified frameshift sequence and codon grouping | Handedness and pairing checked from multiple camera angles; deletion and stop verified. |
| Molecular machinery | Schematic ribosome/tRNAs, capsid/subunits, nucleosomes and chromatin loops | Distinct silhouettes, no false physical handoffs, appropriate scale labels. |
| Assays and control | PCR stages, gel bands and ladder, telomere blocks, p53/control diagram | Schematic examples stated; no invented quantitative result presented as data. |
| Cells and signaling | Cell field, invasion boundary, myelinated axon, nodes and activity wave | Readable at reduced size; instancing and bounded motion. |
| Ending | Phylogeny, microscope, observer eye/outline, nested scale windows, final circle | Final reveal understood without explanatory narration; opening/ending composition aligns. |
| Graphic system | Paper texture, restrained grain, linework, focus bracket, stamps, hook layouts | Palette and type consistent; textures never obscure lyrics. |

1. **Hero proof:** build and render 38.418–53.000 with original audio, including the cross-slot lyric. Start with low sampling to judge composition, then sample a short interval at production quality. Save under `D:\pdoom-dna\hero\` after checking the drive.
2. **Opening and ending proof:** build the helix, microscope circle, observer reveal, and final hold. Establish the payoff before filling the middle.
3. **Frameshift and hook proof:** verify the sequence; create four distinct chorus layouts and the empty-marker transition.
4. **Remaining assets and slots:** implement shared geometry and one scene at a time, preserving reference and quantum work. Track asset source, scientific status, units, and dependencies in a DNA manifest.
5. **Editorial draft:** preview all cuts with audio, sample both sides of all 21 boundaries, inspect word carryovers, and regenerate DNA outro plates after scene layouts settle.
6. **Final export:** benchmark the actual fold, cell field, and chromatin scenes. Choose sampling and resolution from measured quality and cost; previous reference-scene timings are not a reliable whole-film estimate. Verify duration, audio sync, frame dimensions, and the final hold.

When implementation begins, reuse the existing playback, audio-feature, typography, and post-processing engine. Add DNA scene modules and helpers; preserve timeline anchors. Render motion as pure functions of time with seeded/precomputed geometry so scrubbing and offline rendering agree. Determine exact integration points through code discovery before editing the runtime.

## Completion criteria

- The observer reveal is legible, and the orange motif's absence has an emotional payoff.
- The exact original song and timed lyrics survive intact; all 22 slot boundaries match `app/src/timeline.ts`.
- The hero shadow illusion reads cleanly and finishes its lyric across the cut.
- Each hook has a distinct scale and role; the third has enough empty space to feel different.
- Scientific geometry and labels pass the guardrails; every synthetic example is identified and checked.
- The film never implies one fluorophore becomes a protein, a nerve impulse, and a descendant.
- All explanatory text is subordinate to the current lyric. No inherited reference/quantum imagery remains in the DNA scene selection or its recap plates.
- Export settings are validated by the actual DNA implementation. This document alone does not count as generated assets or a rendered film.
