"""Quick high-res zoom plot of the vocal stem: python zoom.py t0 t1 [name]"""
import common, sys, json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import librosa

y, sr = common.load_stem("vocals", sr=22050)
f = dict(np.load(common.WORK / "vocal_feats.npz")); ht = float(f["hop_s"])
_d = json.loads((common.WORK / "align_debug.json").read_text())
dbg, alt = _d["words"], _d["alt"]


def zoom(t0, t1, name):
    a, b = int(t0 * sr), int(t1 * sr)
    seg = y[a:b]
    hop = 44
    S = librosa.amplitude_to_db(np.abs(librosa.stft(seg, n_fft=512, hop_length=hop)), ref=np.max)
    S2 = librosa.amplitude_to_db(np.abs(librosa.stft(seg, n_fft=2048, hop_length=hop)), ref=np.max)
    fr = librosa.fft_frequencies(sr=sr, n_fft=512)
    fr2 = librosa.fft_frequencies(sr=sr, n_fft=2048)
    i0, i1 = int(t0 / ht), int(t1 / ht); tt = np.arange(i0, i1) * ht
    fig, ax = plt.subplots(4, 1, figsize=(22, 13), sharex=True, gridspec_kw=dict(height_ratios=[2.2, 2, 1.2, 0.6]))
    ext = [t0, t0 + S.shape[1] * hop / sr]
    ax[0].imshow(S[fr <= 11000], origin="lower", aspect="auto", cmap="magma", vmin=-75, vmax=0, extent=ext + [0, 11000])
    ax[0].set_ylabel("wideband 0-11k")
    ax[1].imshow(S2[fr2 <= 3000], origin="lower", aspect="auto", cmap="magma", vmin=-75, vmax=0, extent=ext + [0, 3000])
    f0 = np.where(f["voiced"][i0:i1] > 0, f["f0"][i0:i1], np.nan)
    ax[1].plot(tt, f0, color="cyan", lw=1.2)
    ax[1].set_ylabel("narrowband 0-3k + f0")
    ax[2].plot(tt, f["rms_db"][i0:i1], "k", lw=1, label="rms")
    ax[2].plot(tt, np.clip(f["sib_ratio"][i0:i1], -60, 10) - 10, "tab:blue", lw=0.8, label="sib")
    ax[2].plot(tt, f["mid_db"][i0:i1] - 40, "tab:red", lw=0.8, label="mid-40")
    axb = ax[2].twinx(); axb.fill_between(tt, 0, f["onset"][i0:i1], color="tab:green", alpha=0.3)
    ax[2].legend(loc="upper left", fontsize=7); ax[2].set_ylim(-70, 5)
    P, OFF = 60 / 132, 0.708
    for n in range(int((t0 - OFF) / P * 4) - 1, int((t1 - OFF) / P * 4) + 2):
        tb = OFF + n * P / 4
        if t0 <= tb <= t1:
            for a_ in ax[2:]:
                a_.axvline(tb, color="gray", lw=[1.4, 0.4, 0.8, 0.4][n % 4], ls="-" if n % 4 == 0 else ":")
    for w in dbg:
        if w["end"] < t0 or w["start"] > t1: continue
        for a_ in ax[:3]:
            a_.axvline(w["start"], color="w" if a_ is not ax[2] else "r", lw=0.8)
        ax[3].plot([w["start"], w["end"]], [1, 1], lw=6, alpha=0.5, color="tab:red")
        ax[3].text(w["start"], 1.2, w["w"] + ("" if w.get("start_rule", "ctc") == "ctc" else " [" + w["start_rule"][:4] + "]"), fontsize=10, clip_on=True)
        for us in w.get("unit_starts", [])[1:]:
            ax[3].plot([us, us], [0.85, 1.15], color="tab:red", lw=2)
        ax[3].plot([w["ctc_start"], w["ctc_end"]], [0.6, 0.6], lw=6, alpha=0.5, color="tab:blue")
        i = dbg.index(w)
        ax[3].plot([alt["mms"][i]["start"]] * 2, [0.1, 0.45], color="tab:purple", lw=2)
        ax[3].plot([alt["lv60k"][i]["start"]] * 2, [0.1, 0.45], color="tab:orange", lw=2)
        ax[3].plot([alt["fused_lead"][i]["start"]] * 2, [0.1, 0.3], color="tab:green", lw=2)
        if w.get("whisper"):
            ax[3].plot([w["whisper"][0]] * 2, [0.1, 0.35], color="k", lw=2)
    ax[3].set_ylim(0, 1.6); ax[3].set_yticks([])
    ax[3].set_xticks(np.arange(np.ceil(t0 * 20) / 20, t1, 0.05), minor=True)
    ax[3].set_xticks(np.arange(np.ceil(t0 * 5) / 5, t1, 0.2))
    for a_ in ax: a_.grid(True, which="both", axis="x", alpha=0.25)
    ax[3].set_xlim(t0, t1)
    fig.tight_layout(); fig.savefig(common.QA / f"{name}.png", dpi=75)
    plt.close(fig)


if __name__ == "__main__":
    if sys.argv[1] == "lines":
        L = common.load_lyrics_src()
        only = [int(x) for x in sys.argv[2:]] or range(len(L))
        for li in only:
            ws = [w for w in dbg if w["li"] == li]
            a = min(ws[0]["start"], ws[0]["ctc_start"]) - 0.4
            b = max(ws[-1]["end"], ws[-1]["ctc_end"]) + 0.3
            n = int(np.ceil((b - a) / 3.6))
            edges = np.linspace(a, b, n + 1)
            for k in range(n):
                zoom(edges[k], edges[k + 1] + 0.15, f"zl_{li:02d}_{k}")
    else:
        t0, t1 = float(sys.argv[1]), float(sys.argv[2])
        zoom(t0, t1, sys.argv[3] if len(sys.argv) > 3 else f"zoom_{t0:.1f}")
