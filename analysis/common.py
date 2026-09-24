"""Shared paths / cache setup for the pdoom analysis scripts.

Import this module FIRST (before torch / huggingface / mlx imports) so that all
model downloads land in analysis/.cache/.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent          # analysis/
PROJECT = ROOT.parent                            # pdoom/
CACHE = ROOT / ".cache"
for var, sub in [("TORCH_HOME", "torch"), ("HF_HOME", "hf"), ("HF_HUB_CACHE", "hf/hub"),
                 ("XDG_CACHE_HOME", "xdg"), ("HUGGINGFACE_HUB_CACHE", "hf/hub"),
                 ("TRANSFORMERS_CACHE", "hf/transformers"), ("MPLCONFIGDIR", "mpl"),
                 ("NUMBA_CACHE_DIR", "numba"), ("UV_CACHE_DIR", "uv")]:
    os.environ.setdefault(var, str(CACHE / sub))
    (CACHE / sub).mkdir(parents=True, exist_ok=True)

AUDIO = PROJECT / "audio" / "pdoom.mp3"
STEMS = ROOT / "stems" / "htdemucs_ft" / "pdoom"
LYRICS_SRC = PROJECT / "lyrics" / "lyrics.src.js"
DATA = PROJECT / "data"
QA = ROOT / "qa"
WORK = ROOT / "work"          # intermediate results (whisper json, alignments)
QA.mkdir(exist_ok=True)
WORK.mkdir(exist_ok=True)
DATA.mkdir(exist_ok=True)


def load_lyrics_src():
    """Parse lyrics.src.js -> list of (start, end, text)."""
    import json, re
    src = LYRICS_SRC.read_text(encoding="utf-8")
    body = src[src.index("["): src.rindex("]") + 1]
    return [tuple(x) for x in json.loads(body)]


# The Demucs stems were rendered from an mp3 decode that did NOT trim the LAME
# encoder delay (1105 samples @ 48 kHz = 23.0 ms). The gapless decode of the mp3
# (ffmpeg / libsndfile / browsers) is our time reference, so stems are shifted
# earlier by 1015 samples @ 44.1 kHz (measured by cross-correlation, constant
# over the whole song).
STEM_OFFSET_SAMPLES = 1015
STEM_OFFSET_SEC = STEM_OFFSET_SAMPLES / 44100


def load_stem(name, sr=None, mono=True):
    """Load a Demucs stem, time-aligned to the gapless mp3 decode."""
    import soundfile as sf
    import numpy as np
    y, s = sf.read(STEMS / f"{name}.wav", dtype="float32", always_2d=True)
    assert s == 44100
    y = y[STEM_OFFSET_SAMPLES:]
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s


KARAOKE = ROOT / "stems" / "karaoke"


def load_lead(sr=None, mono=True):
    """Lead vocal only (mel-band-roformer karaoke model run on the mp3; already
    in gapless-mp3 time, no offset)."""
    import soundfile as sf
    import numpy as np
    y, s = sf.read(KARAOKE / "lead.wav", dtype="float32", always_2d=True)
    y = y.mean(axis=1) if mono else y.T
    if sr and sr != s:
        import soxr
        y = soxr.resample(y, s, sr) if mono else np.stack([soxr.resample(c, s, sr) for c in y])
        s = sr
    return y, s


def load_vocal_source(name, sr=None):
    """'vocals' = Demucs vocal stem (mono sum), 'vocL'/'vocR' = its left/right
    channel (choruses are double-tracked and panned L/R, so each channel is
    closer to a single voice), 'lead' = karaoke lead."""
    if name == "lead":
        return load_lead(sr)
    if name in ("vocL", "vocR"):
        y, s = load_stem("vocals", sr=sr, mono=False)
        return y[0 if name == "vocL" else 1], s
    return load_stem("vocals", sr=sr)


def load_mix(sr=44100, mono=True):
    import librosa
    y, s = librosa.load(str(AUDIO), sr=sr, mono=mono)
    return y, s
