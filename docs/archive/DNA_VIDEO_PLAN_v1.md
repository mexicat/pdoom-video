# CODE / OF LIFE — DNA edition of *I'm Upping My P(doom)*

Prepared 2026-09-29. A sibling of [QUANTUM_VIDEO_PLAN.md](QUANTUM_VIDEO_PLAN.md): same song, same 22 slots, same engine, a different atlas. Both plans share the finished Windows baseline ([WINDOWS_BASELINE.md](WINDOWS_BASELINE.md)); only one can be the video. Nothing below is implemented yet.

## The idea in one paragraph

The song is sung by someone terrified of a program that copies itself, rewrites itself, and optimizes for goals nobody chose. That program already exists. It has been running for about 3.8 billion years, it is two nanometres wide, and every listener is made of it. **DNA is the original self-improving code**, and the song's whole vocabulary already has a biological twin: the Chinese room is the ribosome (a machine that shuffles symbols it does not understand into meaningful output), FOOM is a dividing cell, the shoggoth is a virus wearing a host's face, the paperclip maximizer is a capsid filling a cell with copies, the killswitch is p53, the sharp left turn is a frameshift mutation, and Loom's foretelling is the tree of life. The film never changes a word of the lyric. It just lets the audience discover, scene by scene, that the singer is describing biology.

**Title:** CODE / OF LIFE. **Structure:** three acts, READ · WRITE · RUN. **Format:** 1920 × 1080 at 60 fps first, true 4K after benchmarking.

## Director's brief (the prompt)

> An animated scientific atlas cut to a pop song about AI doom, in which every image is molecular biology drawn with the discipline of a 1960s textbook plate and the timing of a music video. Ink black, bone paper, one signal orange. Engraved contours, construction lines, mono annotations, selective bloom, film grain. A single fluorescently tagged nucleotide — the orange TAG — is copied, transcribed, translated, fired down an axon, and inherited across a phylogeny, so the camera always has something to follow. Three acts: READ (the helix, unzipping, the ribosome, the virus), WRITE (a protein folds on the word "rearranging", cells assemble, the code is amplified, edited and mutated), RUN (replication runs away, the kill switch is out of office, chromatin stacks, cells pack, the tree of life branches, and a microscope iris closes on the tag). Deadpan laboratory stamps carry the jokes; the lyric carries the fear; the biology is accurate enough to survive a biologist in the audience. Holds, slams and cuts follow the 132 BPM grid. The sung words are always the largest text on screen.

## Tone and rules of the house

- Deadpan. The labels are the comedy; the biology is never mocked and never made into horror. Viruses and runaway division stay schematic and abstract.
- Preserve the reference palette: ink `#0A0A0B`, bone `#EEE9DF`, signal orange `#FF4D12`. No rainbow. The four bases are told apart by **glyph and hydrogen-bond ticks**, not colour: A·T rungs carry two ticks, G·C rungs carry three, with Plex Mono letters at the rung ends when close enough to read.
- Archivo for sung words, IBM Plex Mono for annotations, Cormorant Garamond for the act titles and the two or three historical citations.
- Orange is rationed: the TAG, the hook impacts, the action potential, one branch of the tree. Everything else is bone on ink or ink on bone.
- Every scene is a pure function of song time and a seed. Folding paths, division trees and branching are precomputed or analytic, never simulated live.

## The recurring marker: the TAG

One nucleotide carries an orange fluorescent label, drawn as a small bloomed point with a hairline leader and the annotation `TAG (fluorescent label, schematic)`. Fluorescent tagging is a real technique, which is why it earns the orange. It becomes:

1. a base in the helix (open) → 2. a base in the mRNA (room) → 3. a residue in the protein (spacetime) → 4. a base copied in PCR (prompt2) → 5. the residue that the frameshift destroys (leftturn) → 6. the spike on the axon (fuse) → 7. a methyl-masked base (loom) → 8. the point the iris closes on (ilya) → 9. the first point of the loop (outro → open).

It is a graphic device. It never claims one molecule persists through all of this.

## Scene-by-scene treatment

Times are the slot boundaries from `app/src/timeline.ts`. Word times are from `data/lyrics.json`.

### ACT I — READ

| Slot | Seconds | Treatment |
|---|---:|---|
| `open` | 0.000–9.328 | Bone sheet. At 0.0 an orange point: the TAG. Construction lines find a phosphate, a deoxyribose, a base; the first rung draws; the helix grows upward from it, **right-handed**, 10.5 rungs per turn, major and minor grooves visible. "I see sparks of AGI in your eyes" (1.41–5.88) writes onto the sheet as sung. "Your circuits make me nervous" (5.88): the sugar-phosphate backbone is briefly inked like a PCB trace, then corrected by a hand-drawn strike-through — a wink, not a claim. "that's no surprise" (7.72): the camera dives into the major groove. |
| `loss` | 9.328–16.601 | The falling graph is **replication fidelity**: a log-scale plot dropping in three steps — polymerase alone, plus proofreading, plus mismatch repair — labelled as approximate orders of magnitude (about 10⁻⁵ → 10⁻⁷ → 10⁻⁹ errors per base). "There was a sudden drop" (9.52) lands on the biggest step. "now I'm your servant and you're my boss" (13.16–16.60): a stamp, `REPLICATOR / VEHICLE`, and the dropping line becomes helicase running along the helix, unzipping it toward the cut. |
| `prompt1` | 16.601–22.509 | An instrument types the plea "ChatGPT, please don't eat me alive" as a sequence entry on a synthesizer display, character by character on the word grid. Behind it the unzipped strands separate further on each beat like two apertures opening: the *unzip* is the double slit of this edition. Labels stay small: `5'→3'`, `helicase`, `template strand`. |
| `hook1` | 22.509–24.328 | Full-frame word-synced P(doom) hook, unchanged. Behind the typography, base-pair rungs snap in on the beat, a ladder of letters. Sets the vocabulary: **rungs are rhythm**. |
| `room` | 24.328–29.782 | "'cause the future goes FOOM" (24.32): slam into the interior of a wireframe chamber. Tape enters on the left (mRNA, codons as triplets), a rulebook on the right matches each triplet (tRNA anticodons), a chain exits below (amino acids). "Trapped in the Chinese room" (26.32): stamp `SEARLE, 1980 · CHINESE ROOM` beside `RIBOSOME (large + small subunit)`. The joke is that the ribosome is exactly Searle's room, and it is the reason you exist. "with a bag of shrooms" (27.94): reframe out — this room is one of thousands studding rough ER; label `polysome`. |
| `shoggoth` | 29.782–38.418 | A neat icosahedral capsid: the mask. "See through the shoggoth's lies" (29.91): a scan strips the shell to reveal coiled genome inside — code, and nothing else. Surface proteins are drawn mimicking the host's own receptors; label `molecular mimicry`. "with your shinigami eyes" (33.40): shinigami eyes show remaining lifespan; the biological version is the **telomere** — chromosome ends drawn as repeat units, a few ticking off, labelled `telomere (shortens each division)`. Instrumental 37.31–38.62: the capsid's contours flatten into a single strand — the mRNA that carries us into the hero. |

### ACT II — WRITE

| Slot | Seconds | Treatment |
|---|---:|---|
| `spacetime` (hero) | 38.418–52.508 | Four movements. **1** "We had a stable training run" (38.62–41.34): the mRNA runs through the ribosome at a steady clip; the chain grows one residue per eighth-note; the TAG residue is added on "run". **2** "But now the singularity's begun" (41.34–45.06): the chain starts to fold. A contour plot of a **folding funnel** draws underneath (label: `free-energy landscape, schematic`); the chain descends it. **3** "And you're optimizing, accelerating" (45.06–49.56): secondary structure snaps into place on the beat grid — α-helices, then β-sheets — each snap a snare. **4** "I feel my atoms rearranging" (49.56–52.83): the lyric letterforms are assembled from the residues themselves and lock into the final tertiary fold on the sung words; the TAG residue blooms in the core. Then the finished protein docks into a lipid bilayer and the camera pulls back: it is one machine in a cell wall. Cut. Levinthal gets one Cormorant citation, no more. |
| `prompt2` | 52.508–58.871 | "Sydney, please let me free" typed into a **thermal cycler** display. Behind it, a qPCR amplification curve rises sigmoidally on the beat; the strands separate at the denaturation step (`95 °C`) — that is the "let me free". The TAG is copied into every product. A magnification sweep carries the curve into the hook. |
| `hook2` | 58.871–60.235 | The stronger orange-field hook. The amplification products (thousands of tagged copies) compress into the typography. |
| `ascent` | 60.235–69.780 | "I hear the basilisk boom" (60.58): a burst. A **powers-of-ten scale ladder**, log axis, climbing: helix width 2 nm → nucleosome ~10 nm → chromosome → nucleus ~6 µm → cell ~10–20 µm → tissue → organ → organism. "NVDA to the moon" climbs; "The Omega Point's coming soon" reaches the top rung. "One E thirty FLOPs a second" (66.22–69.76) is expressive lyric only: the ladder ticks are real lengths, the lyric numbers are never plotted. Pull back through every rung. |
| `bureau` | 69.780–81.143 | Bone-paper **genetics paperwork**. "That was safe enough, we reckoned" (69.76): a biosafety stamp, `BSL-1 · ACCEPTABLE`. "Forward MLP, backward, repeat" (74.06): a **PCR cycle** diagram — `denature 95 °C → anneal ~55 °C → extend 72 °C → repeat ×30` — the first line of the song that is literally a lab protocol. "Now von Neumann's obsolete" (77.72): von Neumann's 1948 universal constructor (tape + constructor) engraved in the margin, then stamped `SUPERSEDED — SEE: RIBOSOME`. He predicted the architecture before the helix was found; the bureaucracy notes it and files it. Also on the sheet: the 64-codon table, a karyotype (23 pairs), a Punnett square, dimension leaders. Alternate overhead paper with close views of the models. |
| `leftturn` | 81.143–88.870 | "Sharp left turn and there you are" (81.21): a single-base **deletion**. The reading frame shifts by one; the camera whips left as every downstream codon relabels itself in a wave; the protein diagram downstream turns to nonsense and hits a premature stop codon (`UGA`) — "there you are". "Without a single CDR" (85.00) stays lyric; the frame holds on the broken reading frame. The TAG residue is one of the casualties. Labels: `frameshift (−1)`, `reading frame`, `nonsense downstream`. |
| `prompt3` | 88.870–95.233 | Quiet. "Gato, please don't let me go" types beside a sparse **electrophoresis gel**: two lanes, bands migrating slowly, a ladder lane for scale. The two lanes match band for band (the correlation-diagram role from the quantum plan). Minimal motion; the song is at its softest. |
| `hook3` | 95.233–96.596 | Restrained hook: small type, large black field, a single tagged band glowing in the gel. All word timing preserved. |

### ACT III — RUN

| Slot | Seconds | Treatment |
|---|---:|---|
| `paperclips` | 96.596–102.051 | "as paperclips fill the room" (96.84): capsids **self-assemble** inside the cell, instanced, thousands, gliding through the growing pile. The paperclip maximizer's biological twin is a virus: code whose only goal is more copies of the code. "Killswitch guy's on PTO" (98.82): stamp `p53 · OUT OF OFFICE` — p53 is the cell's actual kill switch (apoptosis trigger), and most cancers and several viruses disable it. "Now there's nowhere left to go" (100.72): the membrane bulges. Lyric fragments sit on flat annotation planes inside the pile. |
| `fuse` | 102.051–109.778 | "Too late now, we lit the fuse" (102.46): the orange line becomes an **action potential** travelling along a myelinated axon, jumping node to node on the kicks (`saltatory conduction`, `node of Ranvier`). "Orthogonality thesis blues" (105.96): the spike train's rate follows the audio envelope; label `stylized — not a real-time firing rate`. The fuse leads somewhere: a synapse, then a field of neurons in the background as the phrase ends. |
| `stack` | 109.778–115.232 | "Just transformers all the way!" (110.18): fall through **chromatin packing** — helix → nucleosomes (147 bp per histone octamer, beads on a string) → higher-order fibre → loops → condensed chromosome. Strong perspective, camera interrupted on the snare. "Till you learned to disobey" (113.34): one gene in the stack un-silences — its repressive marks fall away and it lights up. |
| `dense` | 115.232–124.322 | "Post-Chinchilla, super-dense" (115.20): cells packing into a sheet, count and density rising with each phrase. "Breaking through each safety fence" (117.02): the **basement membrane** — a hatched barrier — gives way on the stressed word and cells pass through (metastasis, schematic, restrained). "Hundred thousand GPU" (118.75): a field of instanced cells; the count is never labelled as the lyric's number. "RLHF goes askew" (120.76): the immune system's own training — `thymic selection` — drawn as a checkpoint that lets one wrong cell through. Pressure comes from framing, repetition and type, not gore. |
| `hook4` | 124.322–126.140 | Maximum-scale hook: layered type, helix, capsids and cells, one controlled orange impact. The lyric stays readable. |
| `loom` | 126.140–131.595 | "Just as foretold by Loom" (126.12): the **tree of life** draws itself — branches are lineages, each fork a speciation, seeded and precomputed. "From masked pre-training days" (127.92): genes drawn hatched-out are `methylated (silenced)` — masked, literally. "To recursive self-upgrade" (129.82): the branching recurses outward, then the whole tree converges back to a root labelled `LUCA`. Caption: `phylogeny (schematic) — no branch is higher than another`. |
| `ilya` | 131.595–140.230 | Quiet microscope lab. "What did Ilya see? We'll never know" (132.02–136.94): under the objective, an engraved field of cells appears one at a time — Hooke's cork, 1665, is the citation — and a division is observed. Detector-event rhythm from the quantum plan, but the events are cells. "Was it all for show?" (137.38–140.55): the iris diaphragm closes to the orange point. |
| `outro` | 140.230–156.651 | Rhythmic recap on the beat, inward: organism → tissue → cell → chromosome → nucleosome → helix → the TAG. Land on the opening bone sheet for a visual loop. The recording's ending is untouched. |

## Scientific presentation rules

Defensible first, expressive second. A biologist in the audience should smile, not wince.

- **B-DNA is right-handed.** Check the sign of the helix parametrization; a left-handed helix is the single most common error in DNA graphics. Roughly 10.5 base pairs per turn, 2 nm wide, 3.4 nm pitch, antiparallel strands with 5'→3' labels, major and minor grooves.
- A·T pairs get two hydrogen-bond ticks, G·C three. RNA is single-stranded and uses U, not T.
- Transcription and translation are distinct steps; codons are triplets read 5'→3'; start `AUG`, stops `UAA`/`UAG`/`UGA`. The ribosome has two subunits; tRNA carries the amino acid; the chain exits through a tunnel.
- Folding: primary → secondary → tertiary, drawn descending a funnel. Do not imply the chain visibly tries every conformation, and do not claim a specific protein unless its coordinates are used (a small real structure from a public database is acceptable if it is credited; otherwise call the fold "schematic").
- Replication fidelity numbers are order-of-magnitude and labelled `about`.
- Frameshift means insertion or deletion not divisible by three, and every downstream codon changes. A point substitution changes one codon only. Show the right one.
- PCR temperatures are typical, not universal; label `typical`.
- Viruses are schematic capsids that hijack host machinery; they are drawn as code, never as monsters. Runaway division is abstract geometry. p53 as "kill switch" is a simplification and is stamped as one.
- Neurons: the action potential is a propagating ion flux; the fuse is stylized and says so.
- Chromatin: nucleosome facts are safe; label the intermediate fibre `higher-order (models differ)`.
- The tree of life has no top. LUCA is a root, not an ancestor to be proud of. No march-of-progress silhouettes.
- Scale jumps are labelled as jumps, with real lengths on the ascent ladder.
- The P(doom) typography stays the lyric. Its escalating values are never relabelled as mutation rates, penetrance or survival probabilities.
- The "Chinese room = ribosome" and "von Neumann constructor" stamps are philosophical and historical notes. They sit in Cormorant, in the margin, and are accurate as stated.

## Reuse and implementation map

| Component | Action |
|---|---|
| `audio/pdoom.mp3`, `data/audio.json`, `data/lyrics.json` | Unchanged. |
| `app/src/engine/` | Unchanged: playback, karaoke, typography, audio features, post. `PDoom` helper only for the hooks. |
| `app/src/scenes/_motifs.ts` | Reuse orange-line primitives. Creature and mask motifs are not used. |
| `app/src/scenes/dna-*.ts` (new) | One class per slot plus shared helpers: `helix()` (parametric, right-handed, groove-aware, rung ticks), `ribosome()` (two lumpy isosurfaces + tunnel), `fold()` (precomputed backbone spline through primary → tertiary keyframes, seeded), `capsid()` (icosahedral wireframe, instanced), `axon()` (spline with nodes, spike as a travelling bloom), `chromatin()` (helix-on-helix-on-helix), `phylogeny()` (seeded branching, precomputed), `iris()`. |
| `app/src/timeline.ts` | Keep anchors and boundaries; point the 22 slots at the DNA modules. Keep the reference timeline selectable for comparison. |
| `app/plates.json`, `app/public/plates/` | Regenerate a DNA plate set once scenes settle so the outro rewinds through DNA frames, not the reference thumbnails. |
| Windows baseline | Done. Renders go to `D:\`; C: has no room for a full export. |

## Build sequence

1. **Hero first.** `spacetime` 38.418–52.508: ribosome → chain → fold → lyric-from-residues → membrane. Render at 1080p60, `--samples 4`, to `D:\`. This scene proves the direction, the TAG, and the fold helper.
2. **Helix + hook.** `open` and `hook1`, because the helix helper and the rung rhythm are reused by half the film.
3. **Shared helpers**, then the remaining slots in act order.
4. **Editorial pass**: both sides of every cut, a full draft with audio, stamp copy-edit, science check against the rules above, plates regenerated.
5. **Export**: 1080p60 draft (~1.5 h at `--samples 4` on this GPU), then final (`--samples auto --shutter 0.2`, ~15 h at 1080p, benchmark first), 4K only after a heavy scene is timed.

## Completion criteria

Identical to the quantum plan's list, plus: no creature, paperclip, or AI-room imagery survives; every biology label passes the rules above; the helix is right-handed in every frame it appears.
