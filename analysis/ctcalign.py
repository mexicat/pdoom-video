"""CTC forced alignment of the full lyric text against the vocal stem.

* Emissions: two char-level CTC models (MMS_FA, wav2vec2 LV60K-960h) mapped to
  a common alphabet (blank, a-z, ').  They can be used individually or fused
  (probability mixture) for a more robust single path.
* All lines are aligned in ONE Viterbi pass over the whole song.  A "garbage"
  star token sits between lines (and at both ends); its per-frame score is
  (best token log-prob - margin), so it absorbs ad-libs / backing vocals /
  outro that are not in the lyric text, while lyric words still win wherever
  they really match.
* Optional per-subword time windows ("anchors") constrain the path; used for
  manually verified hard spots.
"""
import common  # noqa: F401
import numpy as np
import numba
import torchaudio
from pron import pron

FRAME = 0.02  # s per emission frame
N_FRAMES = 7833
ALPHA = ["-"] + list("abcdefghijklmnopqrstuvwxyz'")
AIDX = {c: i for i, c in enumerate(ALPHA)}


def _common_logp(model):
    em = np.load(common.WORK / f"emission_{model}.npy").astype(np.float64)
    if len(em) < N_FRAMES:
        em = np.concatenate([em, np.repeat(em[-1:], N_FRAMES - len(em), 0)])
    if model.startswith("mms"):
        labs = list(torchaudio.pipelines.MMS_FA.get_labels(star=None))
    else:
        labs = list(torchaudio.pipelines.WAV2VEC2_ASR_LARGE_LV60K_960H.get_labels())
    out = np.full((em.shape[0], len(ALPHA)), -1e4)
    blank_cols = [labs.index("-")] + ([labs.index("|")] if "|" in labs else [])
    out[:, 0] = np.logaddexp.reduce(em[:, blank_cols], axis=1)
    for i, c in enumerate(labs):
        k = c.lower()
        if k in AIDX and k != "-":
            out[:, AIDX[k]] = em[:, i]
    out -= np.logaddexp.reduce(out, axis=1, keepdims=True)
    return out


def emissions(kind):
    """kind: '<model>[_<source>]' with model in mms|lv60k|fused, source in
    ''(demucs mono)|lead|vocL|vocR; or 'fused6' = mixture of both models on
    mono, left and right channels."""
    if kind == "fused6":
        es = [_common_logp(m + s) for m in ("mms", "lv60k") for s in ("", "_vocL", "_vocR")]
        return np.logaddexp.reduce(np.stack(es), axis=0) - np.log(len(es))
    if kind.startswith("fused"):
        suf = kind[len("fused"):]
        a, b = _common_logp("mms" + suf), _common_logp("lv60k" + suf)
        return np.logaddexp(a, b) - np.log(2)
    return _common_logp(kind)


@numba.njit(cache=True)
def _viterbi(E, tgt, lo, hi):
    T = E.shape[0]
    L = len(tgt)
    S = 2 * L + 1
    NEG = -1e18
    prev = np.full(S, NEG)
    cur = np.full(S, NEG)
    bp = np.zeros((T, S), np.int8)  # 0 stay, 1 from s-1, 2 from s-2
    # t = 0
    prev[0] = E[0, 0]
    if lo[0] <= 0 <= hi[0]:
        prev[1] = E[0, tgt[0]]
    for t in range(1, T):
        for s in range(S):
            if s % 2 == 1:
                j = (s - 1) // 2
                if t < lo[j] or t > hi[j]:
                    cur[s] = NEG
                    continue
                e = E[t, tgt[j]]
            else:
                e = E[t, 0]
            best = prev[s]
            arg = 0
            if s >= 1 and prev[s - 1] > best:
                best = prev[s - 1]
                arg = 1
            if s >= 2 and s % 2 == 1:
                j = (s - 1) // 2
                if tgt[j] != tgt[j - 1] and prev[s - 2] > best:
                    best = prev[s - 2]
                    arg = 2
            cur[s] = best + e
            bp[t, s] = arg
        for s in range(S):
            prev[s] = cur[s]
    # end in last token or final blank
    if prev[S - 1] >= prev[S - 2]:
        s = S - 1
    else:
        s = S - 2
    score = prev[s]
    path = np.zeros(T, np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        a = bp[t, s]
        s -= a
    return path, score


def build_targets(lines_tokens, pron_override=None):
    """Returns (tgt ids, index list, star id). index: (li, ti, si, pos_a, pos_b)."""
    star = len(ALPHA)
    tgt, index = [star], []
    for li, toks in enumerate(lines_tokens):
        for ti, tok in enumerate(toks):
            subs = (pron_override or {}).get((li, ti)) or pron(tok)
            for si, sw in enumerate(subs):
                a = len(tgt)
                tgt.extend(AIDX[c] for c in sw)
                index.append((li, ti, si, a, len(tgt)))
        tgt.append(star)
    return tgt, index, star


def align(E, lines_tokens, margin=1.5, anchors=None, pron_override=None, line_windows=None):
    """Global alignment.

    anchors: {(li, ti, si): (t_lo, t_hi)} seconds window for the subword's
             first char (t_lo) / last char (t_hi) occupancy.
    line_windows: {li: (t_lo, t_hi)} every token of the line must lie inside.
    Returns spans {(li, ti): [(start, end, meanprob, char_frames), ...]} per subword.
    """
    T = E.shape[0]
    star_col = E.max(axis=1, keepdims=True) - margin
    Ex = np.concatenate([E, star_col], axis=1)
    tgt, index, star = build_targets(lines_tokens, pron_override)
    tgt = np.array(tgt, np.int64)
    lo = np.zeros(len(tgt), np.int64)
    hi = np.full(len(tgt), T - 1, np.int64)
    for (li, ti, si, a, b) in index:
        if line_windows and li in line_windows:
            wl, wh = line_windows[li]
            lo[a:b] = np.maximum(lo[a:b], int(wl / FRAME))
            hi[a:b] = np.minimum(hi[a:b], int(wh / FRAME))
        if anchors and (li, ti, si) in anchors:
            wl, wh = anchors[(li, ti, si)]
            if wl is not None:
                lo[a:b] = np.maximum(lo[a:b], int(round(wl / FRAME)))
            if wh is not None:
                hi[a:b] = np.minimum(hi[a:b], int(round(wh / FRAME)))
    path, score = _viterbi(Ex, tgt, lo, hi)
    tokpos = np.where(path % 2 == 1, (path - 1) // 2, -1)
    P = np.exp(Ex[np.arange(T), np.where(tokpos >= 0, tgt[np.maximum(tokpos, 0)], 0)])
    spans = {}
    for (li, ti, si, a, b) in index:
        fr = np.where((tokpos >= a) & (tokpos < b))[0]
        chars = [np.where(tokpos == p)[0] for p in range(a, b)]
        spans.setdefault((li, ti), []).append(
            (fr.min() * FRAME, (fr.max() + 1) * FRAME, float(P[fr].mean()),
             [(c.min() * FRAME, (c.max() + 1) * FRAME) for c in chars]))
    return spans, float(score), path, tgt


def word_table(spans, lines_tokens):
    out = []
    for li, toks in enumerate(lines_tokens):
        for ti, tok in enumerate(toks):
            sp = spans[(li, ti)]
            out.append(dict(li=li, ti=ti, w=tok, start=sp[0][0], end=sp[-1][1],
                            conf=float(np.mean([s[2] for s in sp])),
                            subs=[(s[0], s[1]) for s in sp]))
    return out
