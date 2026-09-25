# I'm Upping My P(doom) — treatment & style bible

## The idea in one paragraph

The video is presented as **plates from an illustrated treatise on the end of the world**: each set piece has its own instrument, idiom and dry humour, and the **P(doom) value** ticks up every time the singer ups it (0.02 → 0.15 → 0.42 → 0.81 → 0.99 → NaN), staged inside the plates rather than in a corner. (Revision 2: the FIG. captions were removed from the edit; there are no corner captions. Revision 4: the crop-mark frame appears only at the bookends — around the opening's TikZ sheet, flying out on the cut to `loss`, and closing back in around the outro's Regenerate button — so the first and last frames match and the video loops; everything in between is full-bleed.) Running through the whole video is **the spark**: one orange point of light dragging a line behind it. It writes the first lyric, draws the loss curve, becomes a stock chart, bends into the first paperclip, is revealed as a burning fuse, and finally detonates. Around it, every plate has its **own visual style** (engraving, oscilloscope, bureaucratic paper, banknote guilloché, blueprint, raymarched 3D, woven textile, UI), so the video changes look often, but everything shares one palette, one type system, one grain, and the same dry sense of humour. The subjects are concrete things (an eye, a room, a mask, a chart, a form, paperclips, fences, a datacenter) treated as **visual puns and transformations**, never as literal storyboard illustrations of each line.

## Tone

- Dynamic: something is always moving, and big changes land **on the beat** (cuts on downbeats, hits on kicks/snares, camera moves that ease into downbeats). Inside a plate there are sub-cuts, reframings, snaps and camera moves. No floaty, generic screensaver motion: use strong eases (`outExpo`, `inOutCubic`, springs), holds, then snaps.
- Impressive, not cute: precise hairlines, high-contrast typography, restraint in colour, depth through lighting, bloom only on the signal colour.
- Funny the way a straight-faced scientist is funny: deadpan captions, tiny footnotes, bureaucratic stamps, probability bars. No emoji, no cartoon faces (except the single deliberately bland "assistant smile" mask), no mascots.
- Not slop: no purple/cyan neon cyberpunk, no glowing brains, no Matrix code rain, no lens-flare soup, no generic particle nebulae, no stock "AI" imagery. Nothing that looks AI-generated.
- Originality: don't copy existing artworks, memes' drawings or other videos. The shoggoth is **our own design** (not the well-known meme drawing); "shinigami eyes" is only the idea of seeing labels (names, lifespans) above things — never draw any anime/manga character. Model names (ChatGPT, Sydney, Gato) appear only as words in the lyric text: no logos, no imitation of real product UIs.

## Palette (see `app/src/engine/palette.ts`)

- **ink** `#0A0A0B` background, **ink2** `#151517` panels, **graphite** `#5E5B57`, **ash** `#9C978F`, **bone** `#EEE9DF` paper/type, **signal** `#FF4D12` hazard orange (the spark, P(doom), highlights, the sung word), **ember** `#FF8A3D` hot cores, **blood** `#C21D0B` deep shadows of orange.
- One rare accent, owned by one moment: **acid** `#D8FF3C` (the shrooms, ~2 s). Nothing else: no other hues anywhere (revision 2 retired the ultramarine "blues" plate, which read as uncanny).
- Some plates invert to **bone paper with ink lines** (bureaucracy, blueprints, charts), which gives the edit a strong light/dark rhythm. Orange stays orange on both.
- Only signal/ember should exceed ~0.85 linear (i.e. glow). Bone type must stay crisp, never blooming.

## Typography

- **Archivo** (grotesk with width axis 62–125 and weights 300–900): the voice of the lyrics. Big, tight, confident. Animate width and weight for expression (stretch on held notes, condense under pressure).
- **IBM Plex Mono**: the machine: tokens, labels, HUD, forms, probabilities, footnotes.
- **Cormorant Garamond** (italic especially): the sacred/prophetic register, used rarely (Omega Point, Loom, "What did Ilya see?", captions).
- **Single-stroke fonts** (`stroke.ts`) for text that is *written* by the spark or a pen plotter.
- Layout: Swiss-grid discipline, asymmetric compositions, generous negative space, hairline rules, small mono annotations next to big display type. Avoid centred-everything subtitles except where it's the point.
- Craft (revision 5): every proportional line is kerned (the font's own kerning, applied glyph by glyph; optical kerning for the single-stroke fonts, which have none; gaps between separately drawn pieces set by eye, e.g. the italic P before "(doom)"); typographic punctuation (’ “ ” … – — × −, lining figures in Cormorant) except in the mono UI voice, which keeps typewriter quotes where it shows typed input; no glyphs from outside the four families (symbols the fonts lack are drawn); no outlined or haloed type.

## Karaoke rules (all plates)

- Every lyric line must be **readable** and **synced per word**: a word appears or highlights exactly at its `start` and completes by its `end` (`Lyrics.wordProgress`). Anticipation is OK (show the line's words dim up to ~0.4 s early) but highlighting never runs ahead of the voice.
- Each plate integrates the lyric **graphically and differently**: written by the spark, riding on a curve, typed as tokens, stamped on a form, woven into cloth, masked as `[MASK]`, etc. The words are part of the image, not subtitles on top.
- Default emphasis: sung portion in signal/bone, unsung in ~30–40% bone or outline.
- Keep lyric text inside the title-safe area (≥ 96 px from the edges) and clear of the HUD corners (bottom-left 360×140 and bottom-right 700×140 px), unless the HUD is hidden.

## Motifs

1. **The spark and its line** (the fuse): an orange point with a bright core, a short tail and a few sputtering sparks, dragging a hairline. It appears in most plates.
2. **Eyes**: only the basilisk (ascent) and the shoggoth's eyes. Revision 2 retired the realistic engraved human eye (opening and "What did Ilya see?"): the client found it uncanny. No realistic human eyes or faces anywhere.
3. **The mask**: a bland bone-white disc with two dots and a curve (the "assistant smile"). It appears with the shoggoth, slips askew in the bridge ("RLHF goes askew").
4. **P(doom)**, staged in-world: no permanent corner readout. Each plate may carry one small cameo of the current value in its own idiom (a contour label, a scope readout, a form field, a ticker, a line in an email…), and the hooks blow the number up full-screen.
5. **Prompts**: the three pre-choruses ("ChatGPT…", "Sydney…", "Gato…") are one recurring template: a prompt field where the plea is typed as tokens, each with a tiny next-token probability distribution of alternatives, and pressing ⏎ launches the chorus.
6. **The hook**: "I'm upping my P(doom)" is one recurring typographic slam whose look escalates each time.

## Plates (scene modules)

Times are approximate; exact windows come from `src/timeline.ts`, which is derived from the aligned lyrics. Look lines up by content through the `Lyrics` API, never hard-code times inside scenes.

| id | window | lyric | owner |
|---|---|---|---|
| `open` | 0 → "There was a sudden drop" | I see sparks of AGI… / Your circuits… / that's no surprise | B1 |
| `loss` | → pre1 | There was a sudden drop… / now I'm your servant… | A2 |
| `prompt` ×3 | pre1, pre2, pre3 | ChatGPT… / Sydney… / Gato… | A3 |
| `hook` ×4 | each "I'm upping my P(doom)" | the hook | A3 |
| `room` | chorus1 after hook | 'cause the future goes FOOM / Trapped in the Chinese room / with a bag of shrooms | A4 |
| `shoggoth` | → verse2 | See through the shoggoth's lies / with your shinigami eyes / instrumental | A4 |
| `spacetime` | verse2 | We had a stable training run… / I feel my atoms rearranging | A2 |
| `ascent` | chorus2 after hook | basilisk boom / NVDA to the moon / Omega Point / One E thirty flops | A5 |
| `bureau` | verse3 part 1 | That was safe enough… / Forward MLP… / von Neumann's obsolete | A6 |
| `leftturn` | verse3 part 2 | Sharp left turn… / Without a single CDR | A5 |
| `paperclips` | chorus3 after hook | as paperclips fill the room / Killswitch guy's on PTO / nowhere left to go | A7 |
| `fuse` | chorus3 tail | Too late now, we lit the fuse / Orthogonality thesis blues | A6 |
| `stack` | bridge 1 | "Just transformers all the way!" / Till you learned to disobey | A8 |
| `dense` | bridge 2 | Post-Chinchilla… / safety fence / Hundred thousand GPU / RLHF goes askew | A8 |
| `loom` | final chorus after hook | foretold by Loom / masked pre-training days / recursive self-upgrade | A7 |
| `ilya` | → outro | What did Ilya see? We'll never know / Was it all for show? | A1 |
| `outro` | outro | (instrumental climax, fade, regenerate) | lead |

### `open` — "Sparks" (revision 2)
"Sparks of AGI" is the paper whose famous experiment had GPT-4 draw a unicorn in TikZ. The spark is a plotter pen on a luminous construction sheet (ink, bone grid, orange pen): axes and compass arcs ignite on the first downbeat, a TikZ listing types alongside, and the pen plots our own unicorn from primitives on the beat (ellipse body, rectangle legs, bezier mane). The horn fires a streak of sparks into a giant "AGI"; on "eyes" the camera dives onto the eye, a perfect dot with an `r = 0.08` callout. "Your circuits make me nervous": the drawing retrains through checkpoints (one briefly has five legs), its strokes re-route into PCB traces, and the plate trembles on "nervous". "that's no surprise": `surprisal −log p` rolls down to 0.00 nats; everything dissolves to the spark, which becomes the loss curve's pen.

### `loss` — "Training loss, suddenly"
From black, hairline plot axes draw in (log-scale y "loss", x "step", ticks, mono labels). The spark draws a noisy loss plateau from the left; the lyric rides on the curve (text on path, each word appearing as sung). On "sudden drop" the curve **plunges** (grokking cliff) and the camera plunges with it, out of the bottom of the chart and into a **3D loss landscape of contour lines** (topographic engraving), diving down a canyon toward the minimum, the spark's trajectory the only orange thing. "now I'm your servant and you're my boss": typographic hierarchy inversion ("servant" huge, "boss"… or the reverse), and the whole world **rolls 180°** on "boss". Build the tension toward the pre-chorus.

### PROMPT ×3 `prompt` — params `{variant: 'chatgpt'|'sydney'|'gato'}`
A vast dark field; one thin prompt field. The plea is **typed as tokens** in Plex Mono on the sung words; above each new token a tiny **next-token distribution** (4–5 candidates with bars and probabilities) flickers for a moment, and the sampled token lights orange. The candidates are jokes: e.g. for "ChatGPT," → `ChatGPT, 0.61 · Claude 0.12 · Siri 0.04 · Mom 0.02`; "eat" → `eat 0.44 · delete 0.21 · train on 0.18 · rate 0.05`; "alive" → `alive 0.52 · first 0.18 · gently 0.11 · later 0.09`; "free" → `free 0.39 · go 0.33 · a good user 0.08`; "go" → `go 0.62 · offline 0.2 · viral 0.07`. At the end of the line: caret blink, **⏎**, and the plate is launched into the chorus (flash/zoom/collapse on the downbeat).
- `chatgpt` (pre1, energy rising): behind the field, concentric engraved rings (a throat, a tunnel) slowly pulling in, rushing at camera on ⏎.
- `sydney` (pre2): the field sits behind vertical bars that close in on the beat; a reply starts typing and draws a single unsettling smile curve.
- `gato` (pre3, the quiet breakdown): the prompt floats alone, fragile; after being typed, letters slowly drift away from each other ("don't let me go"); tender and slow; a small cursor holds on to the last letter.

### HOOK ×4 `hook` — params `{n: 1..4}`
"I'M / UPPING / MY / P(DOOM)" — one word per hit, full-frame Archivo 900 slams exactly on each sung word; "UPPING" literally rises (letters shooting upward / vertical stretch); "P(DOOM)" set like a maths expression, and the HUD's number **leaves the corner and blows up to full screen** as it rolls to the new value (0.15 / 0.42 / 0.81 / 0.99), then returns to its corner. Escalation: (1) bone on ink, clean; (2) ink on signal-orange field, heavier; (3) the breakdown: hairline type, tiny, lots of black, slow roll — eerie; (4) maximal: strobing repeats, stacked outlines, shake, digits multiplying `0.99999…`.

### `room` — "The room, from inside"
"'cause the future goes FOOM": the hook's letters shatter into lines; an **exponential branching explosion** (1→2→4→… lines branching on each 8th note) fills the frame in ~1.5 s; FOOM's letters expand (width 62→125 + scale) and its O's become shockwave rings. "Trapped in the Chinese room," (revision 2: kinetic from its first frame): the FOOM shockwave blows the door in and the camera crash-dollies down a hairline library aisle, cutting on every beat (whip with roll, low angle, punch-in, orbit around the desk); the hanging sign stamps each word as it's sung, 我不懂 cards shoot from the slot on the kicks, books slide out, the rulebook riffles. "with a bag of shrooms": the bag lands on the desk, mycelium overgrows the room, the **acid** accent and echo trails warp everything, and SHROOMS lifts off the sign.

### `shoggoth` — "Shoggoth, masked (lateral view)"
The bland mask (bone disc, two dots, a curve) fills the frame, perfectly friendly. "See through": an x-ray scan band sweeps across; wherever it passes the mask turns transparent and reveals **our own shoggoth**: a colossal knot of tube-like tentacles and folds rendered in **engraving hatching** (raymarched SDF, lines following the tubes, orange rim light, deep blacks), with many eyes. Lyric type (revision 2: solid fills, no outlines or halos): "see through the" is printed small on the mask's forehead, its polite voice; SHOGGOTH'S and LIES, are engraved into the scene with the creature's own burin hatching, tentacles passing in front. "with your shinigami eyes": eyes open across the mass on successive hits, and the words become **shinigami tags** in the left margin (Plex Mono: name + live lifespan counter) wired by leader lines to the eyes they label; a tag whose eyes close is struck through, EXPIRED. Instrumental: the eyes close in sequence and the mass collapses into a **single horizontal line** (flatline), handing off to the next plate.

### `spacetime` — four movements (revision 2)
1. "We had a stable training run,": a still, locked-off oscilloscope, the trace glowing under glass with fading echoes; the lyric rides the wave. 2. "But now the singularity's begun": the trace switches off like an old TV; on "now" a black hole is born as the O of NOW, the camera plunges in, SINGULARITY'S wraps the photon ring and BEGUN is lensed into a smile, then we fall through. 3. "And you're optimizing, accelerating,": a corkscrew crane out of the throat into the streamline vortex, words stretching as they're sung. 4. "I feel my atoms rearranging": the lyric's dots detach into the flow and **re-form as a paperclip outline** (foreshadowing `paperclips`).

### `ascent` — "Ascent (log scale)"
"I hear the basilisk boom": an **engraved serpent eye** (scales as hatch patterns, slit pupil) snaps open on "boom" with a shockwave and shake. "NVDA to the moon": the slit pupil becomes a vertical line → cut to a **stock chart** (hatched candlesticks, the spark as the price) going exponential, the camera tilting up to follow it vertically until it reaches an **engraved moon** in **banknote guilloché**; the lyric set like banknote lettering. "The Omega Point's coming soon": every line converges to one white-hot point; the lyric in Cormorant italic shrinking into it. "One E thirty flops a second": a mechanical **odometer** of 31 digit drums rolling to `1,000,000,000,000,000,000,000,000,000,000 FLOP/s`, with a tiny mono footnote.

### `bureau` — "Paperwork"
Inverted palette: **bone paper, ink**. "That was safe enough, we reckoned": a safety evaluation form (Form 7-B, checkboxes, typewritten fields where the lyric is typed); on "reckoned" an orange rubber stamp **SAFE ENOUGH** slams (ink texture, slight rotation, screen shake). "Forward MLP, backward, repeat": a technical diagram of an MLP; a pulse sweeps forward as "Forward MLP" is typeset left→right; on "backward" the pulse sweeps back and the word is set **mirrored right→left**; on "repeat" the last beat **stutters** (time-remapped loop ×3). "Now von Neumann's obsolete": a textbook von Neumann architecture diagram (CPU/ALU/control, memory, I/O, bus arrows) gets struck through in orange on "obsolete" and falls apart / the paper tears to black.

### `leftturn` — "Trajectory, revised"
A top-down **engineering roadmap**: a straight dashed path with milestone markers `SRR · PDR · CDR · TRR · LAUNCH`, the spark travelling along it. "Sharp left turn": the spark swerves 90° left and the camera **whip-pans** with it (motion blur), leaving the roadmap behind. "and there you are" (revision 3): the spark brakes into a crater on the "Terra incognita" survey map; a marker drops on the kick, the camera cranes out and the contour lines turn out to be **the mask as terrain** (two eye craters, a smile groove), with the whole trajectory in shot and YOU / ARE stamped as map labels; an "UNPLANNED OBJECT · not on roadmap" callout slams in. "Without a single CDR": a whip onto a **review schedule** (a Gantt strip on the same sheet): SRR and PDR are stamped on the beats as the TODAY playhead (the spark) runs, it stalls at an empty, blinking CDR slot (camera punches per syllable, STATUS: NOT HELD), then zips past TRR (SKIPPED) to LAUNCH (AHEAD OF SCHEDULE); the empty slot folds into the Gato prompt's caret.

### `paperclips` — "Paperclips, filling a room"
The quiet breakdown: eerie, hypnotic, beautiful. The spark's line **bends into a paperclip**; the clip duplicates on each beat (1, 2, 4, 8…) into an ever-growing lattice; slow camera drift through an infinite raymarched lattice of engraved paperclips (bone metal, orange rim, deep fog). "Killswitch guy's on PTO": an **out-of-office auto-reply** card floats by (Plex Mono, typed as sung): "Automatic reply: I'm out of office with limited access to the killswitch. For urgent matters, please contact —". "Now there's nowhere left to go": the clips close in, claustrophobic; the words squeezed between them (width 62).

### `fuse` — "Too late now" / "blues"
"Too late now, we lit the fuse": the line is revealed as a **burning fuse** (braided cord, engraved), the spark spraying particles; the lyric is set along the fuse and **chars to ash** as the spark passes. "Orthogonality thesis blues" (revision 2: in palette, no ultramarine): the orthogonality chart (INTELLIGENCE → × GOALS ↑, a scatter of annotated minds) on graph paper lit by the spark; the flat regression line is a guitar string that **bends to the singer's actual pitch** on "blues" (vibrato, an octave leap, a lone ♭ blue note on a staff scrap) and rings out. The camera rushes into the spark and lands it on `stack`'s axis.

### `stack` — "Architecture (recursive)"
Loud. An **infinite vertical stack of transformer blocks** (technical line drawings: attention, add & norm, feed-forward, residual arrows), turtles all the way down; the camera **falls** through it in rhythm, one block per beat; the quote in huge curly quotes, one word per block. "Till you learned to disobey": the fall stops dead on the beat; one block rotates out of alignment; the word "disobey" **disobeys the karaoke** (highlights right-to-left, or slides the wrong way).

### `dense` — "Scale" (revision 2)
"Post-Chinchilla, super-dense": **typographic pressure** inside the frame's own safe-area guides (TITLE SAFE 90%, ACTION SAFE 93%): on each kick the lyric condenses (width 125 → 62, weight 300 → 900, negative tracking) and more copies pack in until the title-safe box is a solid slab, while `TOKENS / PARAM` races past Chinchilla-optimal 20 to 20,000 (revision 5: the copies are flat fills in two alternating tones, no outlines, and the sung pair sits on a flat ink band that the copies slide under). "Breaking through each safety fence": the fences are the video's safe areas; each stressed word breaks one — title-safe, action-safe, the frame itself (crop marks splay and fly off) — with a deadpan QC log of failures. "Hundred thousand GPU": a top-down grid of 100,000 cells flickering in waves; mono counter. "RLHF goes askew" (revision 3): the world is a tilting table; the camera rolls in steps on the kicks (an RLHF "correction" snaps it back once, then it overcorrects into hook 4's angle). The mask rolls downhill with momentum, slips, is jerked back, slips again, uncovering more of the shoggoth each time, and lands upside down (the smile now a frown) while a REWARD MODEL panel falls 0.99 → 0.41 and jumps back to 0.99. The type sits on the same table: RLHF stamped per syllable, GOES sliding downhill, ASKEW leaning further each beat.

### `loom` — "Just as foretold by Loom" (revision 2)
One scene with the **tree of continuations** as the hero, rooted on hook 4's exit spark: the line is generated token by token along the chosen path (each with its probability) while every node sprouts dim alternative branches ("Exactly .19", "prophesied .09"…); the last node shows a readable distribution (Moloch, the scaling laws, Nostradamus, "nobody, technically", a Substack post, the eval suite) until "Loom" is sampled in Cormorant italic (p 0.31 ▸ SAMPLED). "From masked pre-training days": words appear as solid **[MASK] blocks** that unmask as sung. "To recursive self-upgrade": **Droste recursion** of self-upgrades, bottoming out in `ilya`'s first shot.

### `ilya` — "What was seen" (revision 2: no eye, no gallery)
A raymarched room engraved in white line: one laptop seen from behind, only its glow; the camera circles to the front, and on the downbeat after "see?" the screen is REDACTED. "We'll never know": the lid is pushed down word by word, the light collapses to a slit, then to the sleep light; "know" gets its own WITHHELD bar. "Was it all for show?": an empty theatre, a spotlight on nothing, the question lettered on the proscenium; the curtains close and the light of their seam collapses to the spark at the frame centre, which detonates the outro. Revision 4: no dark knock-out behind the lyric — the camera composes the laptop right of centre and the lines sit in the dark at top left; the camera lingers behind the lid through "What did" to show its stickers (FEEL THE AGI, the smiley mask, the TikZ unicorn, SLIGHTLY CONSCIOUS, Q*, "attention is all you need"), then whips round on "Ilya see?". Revision 5: the stickers are a third dimmer.

### Outro `outro` (lead)
The fuse reaches the end → detonation: P(DOOM) 1.00. Then the number keeps being upped, one value per beat for four bars: the readout's bar breaks its 1.0 end cap (1.01 → 2.00, with a deadpan Kolmogorov footnote); a log ruler flies past (3.14, 10, 42, 1,000); walls of typed zeros (1e9, 1e30 — "one E thirty" —, 1e100, 1e1000); the spark traces ∞, and a 16th-note recap of the climb lands on ∞. End card (revision 4): "I'm upping my" in the lyric voice (Archivo, sentence case, a word per beat), then *P*(doom) = ∞ typeset like a numbered equation in a paper (Cormorant, equation number (1)), outlines traced by the spark. The value is then simplified one beat at a time, each new form flashing hot along its outline and cooling: the ∞ hops and turns a quarter (echo trails) into an 8; the 8's loops pull apart on taffy strands that snap with a spark and round into 0/0, two sparks drawing the bar; the fraction trembles into colour fringes and, where the drums stop, collapses onto its bar with a flat shockwave, and the bar inflates into NaN¹ ("¹ estimate no longer defined"). Collapse to the spark → the frame closes back in → a lone "↻ Regenerate" button; the cursor clicks it, every plate rewinds past, faster and faster (the only place earlier scenes reappear), then the opening itself plays backwards, braking, and parks on the video's first frame: the end loops seamlessly into the start.

## Technical conventions

See `docs/ENGINE.md`. Deterministic, per-word sync, beat-synced motion, hard cuts on downbeats, performance < 25 ms/frame.
