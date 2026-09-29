# Russian video edition

This branch renders «Повышен риск конца» with the original scene animations and a user-supplied Russian recording. The Russian preview is the default; add `?lang=en` for the English edition.

## Build and render

Install [Bun](https://bun.sh/), FFmpeg, and Chrome or Brave. From the repository root:

```sh
cd app && bun install && cd ..
python3 analysis/render_russian.py
python3 analysis/verify_russian_render.py
```

The output is `out/ru/pdoom-ru-v2.mp4`: 1920×1080, 60 fps, H.264 CRF 16, 12 temporal samples with a 0.5 shutter, and stereo AAC. The render script exports 15-second sections, verifies each frame count, resumes valid sections, and muxes the checked video with `audio/pdoom-ru-v2.m4a`. It invalidates cached sections when scene code, Russian fonts or plates, timing data, or the audio master changes. The verification script probes the final streams and fully decodes the file.

For a browser preview, run `cd app && bunx vite`. For a single frame or a custom export, run from `app/`:

```sh
bun scripts/render.ts stills --lang ru --t 20,49,92,142,202 --out ../out/ru/stills
bun scripts/render.ts video --lang ru --fps 60 --samples 12 --out ../out/ru/custom.mp4
```

The renderer starts a private Vite server. Use `--lang en` to export the English edition.

## Source and timing

`audio/pdoom-ru-v2.m4a` is the supplied second recording. Its source ID, duration, and checksum are recorded in `audio/pdoom-ru-v2.source.json`. `lyrics/ru/lyrics.txt` contains the sung text. `data/ru/lyrics.json` contains the reviewed, model-assisted word alignment; `data/ru/timing-overrides.json` records corrections to ambiguous starts. `data/ru/audio.json` contains mix-band envelopes and onset estimates.

`app/src/ru/timeline.ts` maps the original animation clock to Russian vocal phrases. It retains all 22 original timeline entries and their scene classes. A 15.433-second credit and title sequence precedes the original plotter scene; a 7.4-second appendix follows the original outro. This phrase alignment preserves the original choreography, while the Russian recording drives audio envelopes. The word timings are model-assisted and are not sample-accurate.

`app/src/ru/words.ts` supplies Russian display words for the original scene cues, and `app/src/ru/strings.ts` translates scene labels and annotations. `app/src/ru/intro.ts` and `bookends.ts` draw the added opening and appendix. The Russian font derivatives, source font, license, and outline data are in `app/public/fonts/ru/`; `python3 analysis/russian_fonts.py` regenerates the derived assets with FontTools. The localized rewind thumbnails are in `app/public/plates/ru/` and can be regenerated with `cd app && bun scripts/render.ts plates --lang ru` after changing scene text.

Original code and visual design: mexicat/pdoom-video. The root README gives the original lyric and recording credits. The Russian recording was supplied by the adaptation author. The MIT license covers the code, not the music or lyrics; bundled fonts retain their own licenses.
