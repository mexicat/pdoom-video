// FIG. 14 — "What was seen" (revision 2: no eye, no index of plates).
// The Droste of FIG. 13 bottoms out in one screen, seen from behind in a dark room: we only see its
// glow and what it lights. "What did Ilya see?": the camera circles round to the front; whatever is on
// the screen is redacted as we get there. "We'll never know": the lid is pushed down word by word; the
// light collapses to a slit, the slit to a point (the sleep light), and the word "know" is redacted
// too. Black. "Was it all for show?": a spotlight thunks on — on nothing, centre stage of an empty
// theatre (the props have been struck; their spike marks remain); the question is lettered on the
// proscenium, word by word; in the silence the curtains close, the light leaking through the seam
// collapses to a point at the exact centre of the frame: the spark the outro detonates.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import { Lyrics, type Word } from '../engine/lyrics';
import { clamp, ease, lerp, noise1, prog, pulse, smoothstep } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';
import { IlyaRoom, project, type Cam, type V3 } from './ilya-room';
import { ILYA } from './ilya-glsl';

export default class IlyaScene extends Scene {
  room!: IlyaRoom;
  layer = new Layer2D();
  glow = new LineBatch(4000, { blend: 'add' });
  slit = new LineBatch(64, { blend: 'max' });
  /** the beat the curtains meet on (the one before "show?") */
  tMeet = 0;

  override init() {
    const { lyrics, audio, start, end } = this.ctx;
    this.room = new IlyaRoom(lyrics, audio, start, end);
    this.tMeet = this.room.T.meet;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const T = this.room.T;
    const st = this.room.state(t);
    this.room.render(renderer, out, t, st);

    const L = this.layer; L.clear();
    const c = L.ctx;
    this.drawLine1(c, t);
    if (st.theatre) this.drawInscription(c, t, st.cam, st.spotI);
    comp.draw(renderer, L.upload(), out);

    const lb = this.glow; lb.clear();
    this.slit.clear();
    this.room.dust(lb, t, st, prog(t, this.ctx.start + 0.05, this.ctx.start + 0.5));
    if (st.theatre) this.drawSlit(lb, t, st.cam);
    this.slit.render(renderer, out);
    lb.render(renderer, out);

    const slam = t >= T.slam ? pulse(t, T.slam, 0.07) : 0;
    const thunk = t >= T.was.start ? pulse(t, T.was.start, 0.05) : 0;
    const endK = smoothstep(T.show.start, this.ctx.end, t);
    return {
      bloom: 0.85 + 0.2 * endK, bloomThreshold: 0.9, bloomKnee: 0.25,
      vignette: 0.45,
      shake: [noise1(t * 70, 1) * 7 * slam, noise1(t * 67, 2) * 7 * slam],
      flash: 0.018 * thunk,
      grain: 0.06,
    };
  }

  // ---------------------------------------------------------------- "What did Ilya see? / We'll never know"
  private drawLine1(c: CanvasRenderingContext2D, t: number) {
    const T = this.room.T;
    const ws = T.l1.words;
    const fadeAll = 1 - prog(t, T.ledOff - 0.05, T.ledOff + 0.2, ease.inQuad);
    if (fadeAll <= 0 || t < ws[0]!.start - 0.05) return;
    const split = ws.indexOf(T.well);
    const rows: Word[][] = split > 0 ? [ws.slice(0, split), ws.slice(split)] : [ws];
    const fs = 62, x0 = 150, y0 = 214, lh = 76; // up in the dark above the desk: no backing needed
    const fam = F.serif(400, true);
    c.save();
    c.textBaseline = 'alphabetic';
    c.font = font(fam, fs);
    const sp = measure(' ', fam, fs);
    rows.forEach((row, ri) => {
      let x = x0;
      const y = y0 + ri * lh;
      for (const w of row) {
        const k = prog(t, w.start - 0.03, w.start + 0.14, ease.outCubic);
        const ww = measure(w.w, fam, fs);
        if (k > 0) {
          const p = Lyrics.wordProgress(w, t);
          const cool = prog(t, w.end, w.end + 0.25);
          const hot = p > 0 && cool < 1 ? 1 - cool : 0;
          c.globalAlpha = k * fadeAll;
          c.fillStyle = hot > 0.02 ? mixRgba('bone', 'signal', hot, 0.95) : rgba('bone', 0.93);
          c.fillText(w.w, x, y + (1 - k) * 10);
          if (w === T.know) this.redactWord(c, t, x, y, ww, fs);
        }
        x += ww + sp;
      }
    });
    c.restore();
  }

  /** "know" is withheld too: a bar wipes over it on the downbeat while the sleep light breathes. */
  private redactWord(c: CanvasRenderingContext2D, t: number, x: number, y: number, w: number, fs: number) {
    const T = this.room.T;
    const k = prog(t, T.knowBar, T.knowBar + 0.12, ease.outCubic);
    if (k <= 0) return;
    const bx = x - 8, by = y - fs * 0.78, bh = fs * 0.98, bw = (w + 16) * k;
    c.save();
    c.globalAlpha = 1;
    c.fillStyle = rgba('ink2', 1);
    c.fillRect(bx, by, bw, bh);
    c.strokeStyle = rgba('bone', 0.28);
    c.lineWidth = 1;
    c.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    if (k > 0.9) {
      c.font = font(F.mono(500), 12);
      c.letterSpacing = '3px';
      c.fillStyle = rgba('signal', 0.9 * prog(t, T.knowBar + 0.1, T.knowBar + 0.2));
      c.fillText('WITHHELD', bx, by + bh + 20);
    }
    c.restore();
  }

  // ---------------------------------------------------------------- "Was it all for show?" on the proscenium
  private drawInscription(c: CanvasRenderingContext2D, t: number, cam: Cam, spotI: number) {
    const T = this.room.T;
    const ws = T.l2.words;
    // the fascia's front face (world): x ±4.95, y 5.38 ± 0.46, z 3.1
    const a = project(cam, [-4.95, 5.84, 3.1] as V3), b = project(cam, [4.95, 4.92, 3.1] as V3);
    const fx0 = a.x, fx1 = b.x, fy0 = a.y, fy1 = b.y;
    const fw = fx1 - fx0, fh = fy1 - fy0;
    const fam = F.serif(600, false);
    const text = ws.map((w) => w.w.toUpperCase());
    const track = 0.16;
    let size = fh * 0.5;
    const total = (s: number) => text.reduce((acc, s2) => acc + measure(s2, fam, s, s * track), 0) + (text.length - 1) * s * 0.55;
    size = Math.min(size, (fw * 0.8 / total(100)) * 100);
    const tw = total(size);
    let x = fx0 + (fw - tw) / 2;
    const y = fy0 + fh * 0.5 + size * 0.34;
    const lit = clamp(spotI);
    const endFade = 1 - smoothstep(this.ctx.end - 0.1, this.ctx.end - 0.03, t);
    c.save();
    c.textBaseline = 'alphabetic';
    c.font = font(fam, size);
    c.letterSpacing = `${size * track}px`;
    ws.forEach((w, i) => {
      const s = text[i]!;
      const sw = measure(s, fam, size, size * track);
      const p = Lyrics.wordProgress(w, t);
      const on = prog(t, w.start - 0.02, w.start + 0.08, ease.outCubic);
      // carved and unlit until sung
      c.shadowBlur = 0;
      c.globalAlpha = endFade;
      c.fillStyle = rgba('bone', 0.1 * lit);
      c.fillText(s, x, y);
      if (on > 0) {
        c.shadowColor = rgba('signal', 0.8);
        c.shadowBlur = size * 0.35;
        c.globalAlpha = on * endFade;
        c.fillStyle = p < 1 ? rgba('signal', 1) : mixRgba('signal', 'ember', 0.35, 1);
        c.fillText(s, x, y);
      }
      x += sw + size * 0.55;
    });
    c.restore();
  }

  // ---------------------------------------------------------------- the seam's light, collapsing to the spark
  private drawSlit(lb: LineBatch, t: number, cam: Cam) {
    const T = this.room.T;
    const end = this.ctx.end;
    const t0 = this.tMeet - 0.12;
    if (t < t0) return;
    const top = project(cam, [0, 4.85, ILYA.seamZ] as V3), bot = project(cam, [0, 0.02, ILYA.seamZ] as V3);
    const cx = W / 2, cy = H / 2;
    const appear = prog(t, t0, this.tMeet + 0.02, ease.outCubic);
    // collapse: both ends race to the centre on "show?", reaching it just before the cut
    const col = prog(t, T.show.start + 0.01, end - 0.045, ease.inQuart);
    const y0 = lerp(top.y, cy, col), y1 = lerp(bot.y, cy, col);
    const heat = 0.8 + 2.4 * col;
    // one clean hairline (max-blended so joints don't double up), brighter low down where the pool is
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = lerp(y0, y1, i / n), b = lerp(y0, y1, (i + 1) / n);
      const u = (i + 0.5) / n;
      const I = appear * heat * (0.5 + 0.5 * Math.pow(u, 2.5));
      this.slit.seg2(cx, a, cx, b, 1.5, [LIN.bone[0] * 1.1 * I, LIN.bone[1] * 0.95 * I, LIN.bone[2] * 0.8 * I], 1);
      this.slit.seg2(cx, a, cx, b, 7, [LIN.ember[0] * 0.3 * I, LIN.ember[1] * 0.3 * I, LIN.ember[2] * 0.3 * I], 0.5);
    }
    // the point: the spark, alone on black, at the exact centre
    const pk = prog(t, end - 0.07, end - 0.01, ease.outCubic);
    if (pk > 0) {
      sparkParticles(lb, t, (tb) => (tb < end - 0.07 ? null : { x: cx, y: cy }), { rate: 120, speed: 200, life: 0.3, seed: 14, intensity: 0.9 * pk });
      sparkHead(lb, cx, cy, t, 0.6 + 0.6 * pk, 0.6 + 1.2 * pk);
    }
  }
}

function mixRgba(a: string, b: string, k: number, alpha: number) {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgba(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')},${alpha})`;
}
