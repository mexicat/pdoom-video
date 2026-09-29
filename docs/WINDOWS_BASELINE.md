# Windows reference baseline — verification

Verified 2026-09-28 against the current working tree. This checks the original video renderer, not the planned quantum adaptation.

## Result

The functional Windows baseline works: assets load, TypeScript checks pass, Chrome renders through the AMD GPU, and the Chrome → WebSocket → Bun → FFmpeg pipeline produces a valid MP4 with the original audio.

One discrepancy in the supplied progress report was confirmed and fixed: private-server startup still used `bunx` from PATH. Calling the installed Bun executable from the current stale-PATH shell reproduced `Executable not found in $PATH: "bunx"`. The renderer now starts the local Vite CLI with `process.execPath`, reports startup failure, and bounds the readiness wait. A full short export using automatic server startup passed afterward.

## Checks performed

| Check | Observed result |
|---|---|
| Bun executable | Version 1.4.2 installed under WinGet; invoked by absolute path because this executor's PATH is stale. |
| TypeScript application | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` passed. |
| TypeScript renderer | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.scripts.json` passed, including the additional startup fix. |
| Audio request | HTTP 200, `audio/mpeg`, 3,437,188 bytes. |
| Audio seek request | `Range: bytes=0-127` returned HTTP 206, 128 bytes, and `Content-Range: bytes 0-127/3437188`. |
| Timing data | Both `/data/audio.json` and `/data/lyrics.json` returned HTTP 200 with JSON MIME types and their expected sizes. |
| Font | Archivo-w1000-300.ttf returned HTTP 200; downloaded bytes exactly matched the 121,492-byte local font. |
| Actual WebGL context | `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)`. |
| Browser/scene probe | Hook scene ready; no page errors or scene initialization errors. |
| Reported 404 | Chrome DevTools Network events identified `/favicon.ico`. It is unrelated to video assets. |
| Hook visuals | Inspected the existing contact sheet and a frame extracted from the new MP4; large lyric typography is present and upright. The source explicitly contains brief palette inversions at word slams. |
| Encoding | H.264 video, 1920 × 1080, 60/1 fps, 102 frames, 1.700000 seconds. |
| Encoded audio | AAC, 48 kHz, stereo, 1.700000 seconds. |
| Decode check | FFmpeg decoded the complete test MP4 without errors. |
| Source soundtrack | SHA-256 remains `7CDD9E61061F5F118370E58A9C46666A3EE92B8442E8B7FAE497D992991C6647`. |
| Patch whitespace | `git diff --check` passed. Git also printed its existing LF/CRLF conversion notice. |

## Output and performance

`out/baseline/verified-hook.mp4` is the new 1.7-second proof export, covering source time 22.6–24.3 seconds. Its file size is 5,015,466 bytes. This is a draft-quality validation clip, using one subframe, the ultrafast x264 preset, and CRF 23.

The export reported 102 frames in 13.1 seconds, about 7.9 output frames per second, excluding initial server/browser startup. A separate spacetime probe from 38.5–38.7 seconds measured 13 frames at one sample: average 110.2 ms, median 106.8 ms, 95th percentile 159.4 ms.

The pre-existing adaptive benchmark from 38.4–42.4 seconds was still running during these checks, and its GPU process continued accumulating CPU time. It was left running. Its final output was not available to this verification pass. Concurrent GPU load and the small sample windows make these preliminary figures unsuitable for extrapolating a final 4K render time.

That benchmark has since completed (`perf --from 38.4 --to 42.4`, 241 frames, current `spacetime` scene, 1080p):

| Sampling | Avg per frame | Median | p95 | Max | Sub-frames chosen (count:frames) |
|---|---:|---:|---:|---:|---|
| `--samples 1` | 115.3 ms | 113.1 ms | 129.2 ms | 264.4 ms | 1:241 |
| `--samples auto --shutter 0.2` | 5,841 ms | 4,612 ms | 10,009 ms | 32,060 ms | 12:5 36:115 108:116 324:5 |

The adaptive run overlapped the verification pass above for part of its duration, so treat it as an upper-leaning figure. A separate 2-second export (`video --from 38.4 --to 40.4 --samples 4 --shutter 0.2`, automatic private server, default `slow` preset, CRF 16) wrote 120 frames in 68.5 s, about 0.57 s per frame, and ffprobe reported H.264 1920 × 1080 at 60/1 fps with 48 kHz AAC and a 2.000000-second duration. No private Vite listener remained afterward.

Order of magnitude only, taken from this one slot: the song's roughly 9,400 frames would take about 1.5 hours at `--samples 4` and about 15 hours at `--samples auto --shutter 0.2` in 1080p. Scene cost varies widely, and 4K multiplies the pixel work by four, so benchmark each heavy quantum scene before scheduling a final render.

Use fixed, low sample counts for early draft clips. Measure a short representative adaptive export before committing to the full film. A successfully running benchmark is not itself a completed performance result.

## Reproduction

Run from the `app` directory. In a shell with refreshed PATH, use `bun`; otherwise invoke:

```powershell
$bunExe = 'C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\Oven-sh.Bun_Microsoft.Winget.Source_8wekyb3d8bbwe\bun-windows-x64\bun.exe'
& $bunExe scripts/render.ts video --from 22.6 --to 24.3 --only hook1 --fps 60 --samples 1 --preset ultrafast --crf 23 --out ../out/baseline/verified-hook.mp4
```

The renderer reuses a reachable preview server or starts a private one. The verification deliberately supplied an unreachable `--url http://127.0.0.1:1` to exercise private-server startup without `bunx` on PATH.

Additional evidence is in `out/baseline/browser-verification.json`, `verified-video-frame.png`, and `verified-live-frame.png`. These output artifacts are ignored by Git.

Not verified here: a full-duration export, 4K performance, packaged static-viewer assets, or any new quantum scene. The next creative implementation step remains the approximately 14-second wave-to-molecule scene.
