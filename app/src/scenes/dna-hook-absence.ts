// hook3 — "absence" (95.233–96.596). The quiet chorus after the gel.
// The cut takes away prompt3's gel and keeps only what it was waiting on: the EMPTY orange focus
// bracket at the missing band's place (leftturn deleted that base; the bracket stays empty until fuse),
// in the same spot, the gel's slow push continuing about it. "Gato, please don't let me go" finishes in
// prompt3's rows; then the hook arrives as one lonely line of type about a third of the frame wide, on
// the bracket's axis, each word appearing as it is sung. No flash: the bracket's corners tighten once
// on DOOM, the only accent. The P(doom) dial rolls in hairline bone, without orange.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, glyphX, measure } from '../engine/type';
import { ease, lerp, prog, pulse, smoothstep } from '../engine/util';
import { focusBracket, karaokeRow, sungChars } from './dna-kit';
import { CAP, dialValue, drawDial, inkWithLayer, karaokeSet, setPD, setPlain, type Hook, type Setting, type Stage } from './dna-hook-type';

// prompt3's last frame (dna-prompt-gel.ts): the bracket over lane 3's missing 650 bp band, the gel pushed
// in 1.035x about it; its lyric rows at x 900 (Archivo 700, 124 px, baselines 548 and 700)
const BR = { x: 724, y: 268 + ((Math.log10(2000) - Math.log10(650)) / (Math.log10(2000) - Math.log10(100))) * (872 - 268), size: 30 };
const Z0 = 1.035;
const X0 = 900; // the lyric column

export class AbsenceHook implements Stage {
  pass = inkWithLayer(0.35);
  T = new Layer2D();
  sets: Setting[] = [];
  xs: number[] = [];
  fam = F.archivo(75, 700);
  size = 60;
  base = 540;

  constructor(public h: Hook) {}

  init() {
    const h = this.h;
    // a third of the frame (the other choruses span it)
    const probe = measure(h.disp.join(' '), this.fam, 100) / 100;
    this.size = Math.round(Math.min(72, (W / 3 + 60) / probe));
    this.base = BR.y + (this.size * CAP) / 2; // on the bracket's axis
    const sp = measure(' ', this.fam, this.size);
    let x = X0;
    for (let k = 0; k < 4; k++) {
      const d = h.disp[k]!;
      const s = k === 3
        ? setPD(this.size, { doom: F.archivo(75, 700), p: F.archivoItalic(75, 800), tail: d.endsWith(',') ? ',' : undefined })
        : setPlain(d, this.fam, this.size);
      this.sets.push(s); this.xs.push(x);
      x += s.width + sp;
    }
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const h = this.h, t = f.t, { renderer } = h.ctx;
    const c = this.T.ctx; this.T.clear();
    c.textBaseline = 'alphabetic';

    // the carried line finishes in prompt3's rows, its caret riding the voice, then leaves at once
    const ca = 1 - smoothstep(h.carry.end, h.carry.end + 0.08, t);
    if (ca > 0) {
      const ws = h.carry.words, fam = F.archivo(100, 700), size = 124;
      karaokeRow(c, ws.slice(0, 2), X0, 548, fam, size, t, ca, { dim: 0.26 });
      const row2 = ws.slice(2);
      karaokeRow(c, row2, X0 + 2, 700, fam, size, t, ca, { dim: 0.26 });
      const txt = row2.map((q) => q.w).join(' '), k = sungChars(row2, t), ki = Math.floor(k);
      if (ki < txt.length) {
        const xs = lerp(glyphX(txt, ki, fam, size), glyphX(txt, ki + 1, fam, size), k - ki);
        c.fillStyle = rgba('bone', 0.9 * ca);
        c.fillRect(X0 + 2 + xs + size * 0.04, 700 - size * 0.74, Math.max(3, size * 0.035), size * 0.86);
      }
    }
    // the gel's slow push continues about the bracket
    const z = lerp(Z0, 1.06, ease.inOutQuad(f.p));
    c.save();
    c.translate(BR.x, BR.y); c.scale(z, z); c.translate(-BR.x, -BR.y);
    // the hook: each word appears as it is sung and lights with the voice
    for (let k = 0; k < 4; k++) {
      const w = h.words[k]!;
      const a = prog(t, w.start - 0.01, w.start + 0.06);
      if (a <= 0) continue;
      karaokeSet(c, this.sets[k]!, w, this.xs[k]!, this.base, t, { alpha: a, dim: 0.28 });
    }
    // the empty bracket; its corners tighten a little on each word and once, and stay, on DOOM
    let size = BR.size;
    for (let k = 0; k < 3; k++) size -= 1.2 * pulse(t, h.ws[k]!, 0.1);
    size -= 4 * ease.outCubic(prog(t, h.tDoom, h.tDoom + 0.08));
    focusBracket(c, BR.x, BR.y, { size, empty: true });
    // the dial, hairline and without orange: this chorus has no impact
    const da = prog(t, h.tP - 0.03, h.tP + 0.08);
    if (da > 0) drawDial(c, X0, this.base + 140, dialValue(h, t), {
      k: 1, alpha: da * 0.85, light: true, label: rgba('ash', 0.8), digits: rgba('bone', 0.8), track: rgba('bone', 0.18), fill: rgba('bone', 0.6), barW: 240,
    });
    c.restore();
    this.pass.u.tex!.value = this.T.upload();
    this.pass.render(renderer, out);
    return { bloom: 0.45, bloomThreshold: 0.9, vignette: 0.55, ca: 0.4, grain: 0.055 };
  }
}
