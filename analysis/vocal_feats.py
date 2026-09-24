"""Vocal-stem signal features used to arbitrate/refine word timings (cached).

hop = 5 ms. Features: rms (dB), pyin f0 + voiced prob, spectral flux onset
strength (log-mel), high-band (>2 kHz, consonant) energy, and a 'vocal
presence' mask.
"""
import common
import numpy as np
import librosa

SR = 22050
HOP = 110  # ~5 ms


def compute():
    y, sr = common.load_stem("vocals", sr=SR)
    t_len = 1 + len(y) // HOP
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=HOP, center=True)[0]
    S = np.abs(librosa.stft(y, n_fft=1024, hop_length=HOP, center=True)) ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=1024)
    hi = S[freqs > 2500].sum(0)
    mid = S[(freqs > 200) & (freqs < 2500)].sum(0)
    sib = S[(freqs > 4000) & (freqs < 10500)].sum(0)
    low = S[(freqs > 90) & (freqs < 1500)].sum(0)
    mel = librosa.feature.melspectrogram(S=S, sr=SR, n_mels=96, fmax=8000)
    logmel = librosa.power_to_db(mel, ref=np.max)
    onset = librosa.onset.onset_strength(S=logmel, sr=SR, hop_length=HOP, lag=2, max_size=3)
    f0, vflag, vprob = librosa.pyin(y, fmin=70, fmax=1000, sr=SR, frame_length=2048,
                                     hop_length=HOP, center=True)
    n = min(len(rms), len(f0), S.shape[1])
    np.savez_compressed(common.WORK / "vocal_feats.npz", hop_s=HOP / SR,
                        rms_db=librosa.amplitude_to_db(rms[:n], ref=1.0),
                        hi_db=librosa.power_to_db(hi[:n] + 1e-10),
                        mid_db=librosa.power_to_db(mid[:n] + 1e-10),
                        sib_ratio=librosa.power_to_db(sib[:n] + 1e-10) - librosa.power_to_db(low[:n] + 1e-10),
                        onset=onset[:n], f0=f0[:n], vprob=vprob[:n], voiced=vflag[:n])
    print("frames", n, "hop", HOP / SR)


if __name__ == "__main__":
    compute()
