// PROMPT x3 — the pre-choruses. A thin prompt field in a vast dark field; the plea is
// typed as tokens exactly on the sung word starts, each with a tiny next-token
// distribution flickering above it; ⏎ launches the chorus.
//   chatgpt: an engraved throat of rings pulling in, rushing at camera on ⏎
//   sydney : vertical bars closing in on the beat; the reply draws one unsettling smile
//   gato   : the prompt floats alone; letters drift apart; the cursor holds the last letter
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { rgba } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import { Lyrics, norm, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, noise1, prog, smoothstep, TAU } from '../engine/util';
import { sparkHead, sparkParticles, MASK } from './_motifs';
import { SPECS, REPLY, META, type Variant, type Cand } from './prompt-data';
import { PDoom, formatPDoom } from '../engine/hud';

interface Tok {
  text: string; // visible text
  ci: number; // char index of first visible char in the plea
  n: number; // visible char count
  space: boolean; // token carries a leading space
  t0: number; // appear time (sung start for the first token of a word)
  word: Word;
  first: boolean; // first token of its word
  dist: Cand[] | null;
  pick: number;
  id: number; // fake token id
  tPopEnd: number; // popup collapse start
}

interface Cam { cx: number; cy: number; zoom: number; rot: number }
interface Shot { t: number; zoom: number; focus: 'caret' | 'typed' | 'field' | 'key'; rot: number; push: number; blend: number; dy?: number }

const FS = 60; // token font size (UI px)
const POP_PRE = 0.16; // distribution appears this long before the sampled token

export default class Prompt extends Scene {
  variant: Variant = 'chatgpt';
  ui = new Layer2D();
  glow = new LineBatch(3000);
  comp!: FSPass;
  line!: Line;
  toks: Tok[] = [];
  text = '';
  adv = 36;
  fam = F.mono(400);
  // UI geometry (UI space = 1920x1080 plane before the camera)
  fx0 = 0; fx1 = 0; fy0 = 0; fy1 = 0; tx0 = 0; base = 0; keyX = 0;
  tFirst = 0; tLast = 0; tEnter = 0; tEnd = 0; tShut = 0; tSmile0 = 0; tSmile1 = 0;
  pd!: PDoom;
  shots: Shot[] = [];
  reply = '';

  override init() {
    const { lyrics, params, start, end, audio } = this.ctx;
    this.variant = (params.variant ?? 'chatgpt') as Variant;
    this.tEnd = end;
    this.pd = new PDoom(lyrics);
    // the plea: the line that starts inside our window
    const cands = lyrics.linesIn(start, end).filter((l) => l.start >= start - 0.25 && l.start < end - 0.5);
    this.line = cands[0] ?? lyrics.linesIn(start, end)[0]!;
    const words = this.line.words;
    this.text = words.map((w) => w.w).join(' ');
    this.adv = measure('0', this.fam, FS);

    // tokens
    const specs = SPECS[this.variant];
    let ci = 0;
    words.forEach((w, wi) => {
      if (wi > 0) ci += 1; // the space
      let pieces = specs[norm(w.w)];
      if (!pieces || pieces.map((p) => p.s).join('') !== w.w) pieces = [{ s: w.w, dist: [[w.w, 0.5], ['…', 0.12]] }];
      const syl = w.syl && w.syl.length === pieces.length ? w.syl : null;
      let off = 0;
      pieces.forEach((p, pi) => {
        const t0 = pi === 0 ? w.start : syl ? syl[pi]![0] : w.start + pi * Math.min(0.09, (w.end - w.start) / pieces!.length);
        this.toks.push({
          text: p.s, ci: ci + off, n: p.s.length, space: wi > 0 && pi === 0, t0, word: w, first: pi === 0,
          dist: p.dist ?? null, pick: p.pick ?? 0, id: 1000 + Math.floor(hash(wi, pi, 7) * 98000), tPopEnd: 0,
        });
        off += p.s.length;
      });
      ci += w.w.length;
    });
    this.toks.forEach((k, i) => {
      const next = this.toks[i + 1];
      const long = k.first && k.word.end - k.word.start > 1.5 && (!next || next.word !== k.word);
      const hold = long ? k.word.end - k.t0 - 0.45 : this.variant === 'gato' ? 0.9 : 0.62;
      k.tPopEnd = Math.max(k.t0 + 0.2, Math.min(k.t0 + hold, next ? next.t0 - POP_PRE - 0.1 : k.t0 + hold));
    });
    this.tFirst = words[0]!.start;
    this.tLast = words[words.length - 1]!.start;
    const beatsBefore = this.variant === 'sydney' ? 2 : 1;
    const gap = this.variant === 'sydney' ? 0.2 : 0.35;
    // ⏎ on the grid: the first beat (gato: 8th) after the last word, never later than end - 0.2
    const want = Math.max(this.tLast + gap, audio.timeOfBeat(Math.round(audio.beatAt(end)) - beatsBefore));
    const q = this.variant === 'gato' ? 2 : 1;
    const bq = Math.min(Math.ceil((audio.beatAt(want) - 0.06) * q) / q, Math.floor(audio.beatAt(end - 0.2) * q) / q);
    this.tEnter = clamp(audio.timeOfBeat(bq), start + 0.5, end - 0.2);
    this.reply = REPLY[this.variant] ?? '';
    const nextL = lyrics.nextLine(this.line.start + 0.01);
    const nextW = nextL ? nextL.words[0]!.start : end;
    this.tShut = clamp(Math.min(end, nextW), this.tEnter + 0.35, end); // bars slam shut on the hook's pickup
    this.tSmile0 = this.tEnter + 0.1;
    this.tSmile1 = Math.min(this.tEnter + 0.46, this.tShut - 0.18);

    // layout: field centred, text left-aligned inside
    const textW = this.adv * this.text.length;
    const padL = 96, padR = 150;
    const fw = Math.max(1180, textW + padL + padR);
    this.fx0 = (W - fw) / 2; this.fx1 = this.fx0 + fw;
    const cy = this.variant === 'sydney' ? 500 : 530;
    this.fy0 = cy - 64; this.fy1 = cy + 64;
    this.tx0 = this.fx0 + padL;
    this.base = cy + FS * 0.34;
    this.keyX = this.fx1 - 78;

    // compositor + background/foreground per variant
    this.comp = new FSPass(SHADERS[this.variant], {
      ui: { value: this.ui.texture }, t: { value: 0 }, lt: { value: 0 }, aspect: { value: W / H },
      camZ: { value: 0 }, glow: { value: 0 }, vp: { value: [0, 0] }, rot: { value: 0 }, rush: { value: 0 }, swallow: { value: 0 },
      beat: { value: 0 }, hotBoost: { value: 1.2 }, spacing: { value: 400 }, barW: { value: 22 }, barCx: { value: W / 2 }, shut: { value: 0 },
      zoomBlur: { value: 0 }, zbCenter: { value: [0.5, 0.5] }, uiAlpha: { value: 1 }, light: { value: 0 },
    });

    this.shots = this.makeShots();
    this.comp.u.hotBoost!.value = this.variant === 'gato' ? 0.25 : this.variant === 'sydney' ? 0.9 : 1.2;
  }

  // ------------------------------------------------------------------ camera
  private makeShots(): Shot[] {
    const w = this.line.words, s = this.ctx.start;
    const ws = (i: number) => w[Math.min(i, w.length - 1)]!.start;
    if (this.variant === 'chatgpt') return [
      { t: s, zoom: 2.7, focus: 'caret', rot: 0, push: 0.05, blend: 0 },
      { t: ws(0), zoom: 2.25, focus: 'caret', rot: 0, push: 0.03, blend: 0 },
      { t: ws(1), zoom: 1.5, focus: 'typed', rot: -0.018, push: 0.04, blend: 0 },
      { t: ws(3), zoom: 2.0, focus: 'caret', rot: 0.014, push: 0.05, blend: 0 },
      { t: ws(5), zoom: 1.08, focus: 'field', rot: 0, push: 0.035, blend: 0 },
      { t: this.tEnter, zoom: 1.12, focus: 'field', rot: 0, push: 0, blend: 0 },
    ];
    if (this.variant === 'sydney') {
      const au = this.ctx.audio;
      const b0 = Math.ceil(au.beatAt(ws(0)) + 0.5);
      const hold = [2, 4].map((k) => au.timeOfBeat(b0 + k)).filter((x) => x < ws(1) - 0.3);
      return [
      { t: s, zoom: 1.9, focus: 'caret', rot: 0, push: 0.04, blend: 0 },
      { t: ws(0), zoom: 1.6, focus: 'caret', rot: 0, push: 0.06, blend: 0 },
      ...hold.map((t, i): Shot => ({ t, zoom: i === 0 ? 2.5 : 1.25, focus: i === 0 ? 'caret' : 'typed', rot: i === 0 ? -0.03 : 0.02, push: 0.06, blend: 0, dy: i === 0 ? 30 : 0 })),
      { t: ws(1), zoom: 1.32, focus: 'typed', rot: 0.012, push: 0.05, blend: 0 },
      { t: ws(3), zoom: 1.75, focus: 'caret', rot: -0.01, push: 0.05, blend: 0 },
      { t: ws(4), zoom: 1.05, focus: 'field', rot: 0, push: 0.03, blend: 0, dy: 40 },
      { t: this.tEnter, zoom: 0.92, focus: 'field', rot: 0, push: 0.05, blend: 0.25, dy: 150 },
    ];
    }
    // gato: slow, floating; no cuts, only long eases
    return [
      { t: s, zoom: 1.6, focus: 'caret', rot: 0.0, push: 0.02, blend: 0 },
      { t: ws(0), zoom: 1.45, focus: 'caret', rot: 0.0, push: 0.0, blend: 1.2 },
      { t: ws(2), zoom: 1.2, focus: 'typed', rot: 0.0, push: 0.0, blend: 1.4 },
      { t: ws(4), zoom: 1.0, focus: 'field', rot: 0.0, push: 0.0, blend: 1.6 },
      { t: ws(5), zoom: 0.9, focus: 'field', rot: 0.0, push: 0.0, blend: 1.4, dy: -20 },
    ];
  }

  /** Caret x (UI space) with a smooth follow (for the camera). */
  private caretX(t: number, smooth: number) {
    let x = this.tx0;
    for (const k of this.toks) {
      if (k.t0 > t) break;
      const target = this.tx0 + (k.ci + k.n) * this.adv;
      const before = this.tx0 + (k.ci - (k.space ? 1 : 0)) * this.adv;
      x = smooth > 0 ? lerp(before, target, ease.outExpo(clamp((t - k.t0) / smooth))) : target;
    }
    return x;
  }

  private focusOf(sh: Shot, t: number, z: number): { x: number; y: number } {
    const fcy = (this.fy0 + this.fy1) / 2 - 40 + (sh.dy ?? 0);
    if (sh.focus === 'caret') return { x: this.caretX(t, 0.45) - 180 / z, y: fcy - 40 / z };
    if (sh.focus === 'typed') return { x: (this.tx0 + this.caretX(t, 0.45)) / 2 + 40, y: fcy - 20 };
    if (sh.focus === 'key') return { x: this.keyX, y: fcy };
    return { x: W / 2, y: fcy };
  }

  private camAt(t: number): Cam {
    const shots = this.shots;
    let i = 0;
    while (i + 1 < shots.length && shots[i + 1]!.t <= t) i++;
    const eval1 = (sh: Shot): Cam => {
      const z = sh.zoom * (1 + sh.push * Math.max(0, t - sh.t));
      const f = this.focusOf(sh, t, z);
      return { cx: f.x, cy: f.y, zoom: z, rot: sh.rot };
    };
    const cur = eval1(shots[i]!);
    const sh = shots[i]!;
    if (sh.blend > 0 && i > 0) {
      const k = ease.inOutCubic(clamp((t - sh.t) / sh.blend));
      const prev = eval1(shots[i - 1]!);
      return { cx: lerp(prev.cx, cur.cx, k), cy: lerp(prev.cy, cur.cy, k), zoom: Math.exp(lerp(Math.log(prev.zoom), Math.log(cur.zoom), k)), rot: lerp(prev.rot, cur.rot, k) };
    }
    return cur;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const t = f.t, v = this.variant;
    const cam = this.camAt(t);
    // micro reactions: token arrivals kick the camera a hair
    let kick = 0;
    for (const k of this.toks) if (k.first) kick = Math.max(kick, k.t0 <= t ? Math.pow(0.5, (t - k.t0) / 0.07) : 0);
    const beatPulse = Math.pow(1 - f.beatPhase, 5);
    let zoom = cam.zoom * (1 + 0.012 * kick * (v === 'gato' ? 0.2 : 1) + (v === 'gato' ? 0 : 0.004 * beatPulse));
    let rot = cam.rot;
    let cx = cam.cx, cy = cam.cy;
    // ⏎ phases
    const ent = clamp((t - this.tEnter) / Math.max(0.05, this.tEnd - this.tEnter));
    if (v === 'chatgpt' && t >= this.tEnter) {
      // the prompt is swallowed: sucked toward the throat's centre
      const k = ease.inCubic(clamp((t - this.tEnter - 0.04) / (this.tEnd - this.tEnter - 0.04)));
      zoom *= 1 - 0.93 * k;
      rot += 0.9 * k * k;
      // sucked toward the pit (the throat's vanishing point sits near frame centre)
      cx = lerp(cx, W / 2, k); cy = lerp(cy, H / 2 - 40, k);
    }
    if (v === 'gato') {
      // floating: slow drift and bob
      cx += noise1(t * 0.23, 3) * 22; cy += noise1(t * 0.19, 5) * 14; rot += noise1(t * 0.15, 9) * 0.012;
    }

    // ---- UI layer
    const L = this.ui; L.clear();
    const c = L.ctx;
    const cs = Math.cos(rot) * zoom, sn = Math.sin(rot) * zoom;
    c.setTransform(cs, sn, -sn, cs, W / 2 - (cs * cx - sn * cy), H / 2 - (sn * cx + cs * cy));
    const hair = 1 / zoom;
    const toScreen = (x: number, y: number) => ({ x: cs * (x - cx) - sn * (y - cy) + W / 2, y: sn * (x - cx) + cs * (y - cy) + H / 2 });

    const shut = v === 'sydney' ? ease.inQuart(prog(t, this.tShut - 0.12, this.tShut - 0.005)) : 0;
    this.drawField(c, t, hair, ent);
    this.drawTokens(c, t, hair);
    this.drawPopups(c, t, hair);
    const caret = this.drawCaret(c, t, hair, ent);
    let smileHead: { x: number; y: number } | null = null;
    if (v === 'sydney') smileHead = this.drawReply(c, t, hair);
    L.upload();

    // ---- composite
    const u = this.comp.u;
    u.t!.value = t; u.lt!.value = f.lt; u.beat!.value = beatPulse;
    if (v === 'chatgpt') {
      const lt = t - this.ctx.start, dur = this.tEnd - this.ctx.start;
      const rushK = clamp((t - this.tEnter) / (this.tEnd - this.tEnter));
      u.camZ!.value = lt * 0.42 + 2.2 * Math.pow(lt / dur, 2.4) + 16 * Math.pow(rushK, 2.2);
      const eat = this.line.words.find((w) => norm(w.w) === 'eat');
      u.swallow!.value = eat ? clamp((t - eat.start) / 0.9, 0, 2) : 2;
      u.glow!.value = 0.25 + 0.5 * Math.pow(lt / dur, 2) + 6 * Math.pow(rushK, 3) + 0.25 * beatPulse;
      u.rush!.value = rushK;
      // tunnel parallax: vanishing point drifts against the camera
      (u.vp!.value as number[])[0] = -(cx - W / 2) / W * 0.12 + noise1(t * 0.3, 1) * 0.02;
      (u.vp!.value as number[])[1] = (cy - H / 2) / H * 0.08 + 0.02 + noise1(t * 0.27, 2) * 0.015;
      u.rot!.value = t * 0.05 + 0.4 * Math.pow(rushK, 2);
      u.zoomBlur!.value = 0.18 * Math.pow(rushK, 2);
    }
    if (v === 'sydney') {
      const b0 = this.ctx.audio.beatAt(this.ctx.start);
      const nb = Math.max(1, Math.round(this.ctx.audio.beatAt(this.tEnd) - b0));
      const bi = f.beat - b0;
      // close in one notch per beat, snapping in the first 1/5 of the beat
      const steps = Math.floor(bi) + ease.outExpo(clamp((bi - Math.floor(bi)) * 5));
      const k = clamp(steps / nb);
      const zb = 1 + (zoom - 1) * 0.55;
      u.spacing!.value = lerp(520, 170, Math.pow(k, 0.85)) * zb;
      u.barW!.value = lerp(12, 17, k) * zb;
      u.barCx!.value = W / 2 - (cx - W / 2) * zb * 0.35;
      u.shut!.value = shut;
      u.light!.value = kick;
    }
    if (v === 'gato') {
      u.glow!.value = 0.5 + 0.5 * smoothstep(this.tFirst - 0.5, this.tFirst + 1, t);
    }
    this.comp.render(renderer, out);

    // ---- glow pass: the caret spark / the smile-drawing spark
    this.glow.clear();
    if (caret && v !== 'gato') {
      const p = toScreen(caret.x, caret.y);
      if (caret.hot > 0.01) sparkHead(this.glow, p.x, p.y, t, 0.5 * Math.sqrt(zoom), caret.hot);
    }
    if (smileHead) {
      const s = toScreen(smileHead.x, smileHead.y);
      sparkHead(this.glow, s.x, s.y, t, 0.8, 1.2);
      sparkParticles(this.glow, t, (tb) => {
        const h = this.smileHeadAt(tb);
        return h ? toScreen(h.x, h.y) : null;
      }, { rate: 110, life: 0.35, speed: 200, intensity: 0.9, seed: 5 });
    }
    if (this.glow.count) this.glow.render(renderer, out);

    // ---- post
    const o: PostOverrides = { bloomThreshold: 0.95, bloomKnee: 0.25, bloom: 0.7, vignette: 0.45 };
    if (v === 'chatgpt') {
      const rushK = clamp((t - this.tEnter) / (this.tEnd - this.tEnter));
      o.flash = 0.9 * Math.pow(prog(t, this.tEnd - 0.1, this.tEnd - 1 / 60), 2);
      o.shake = [noise1(t * 40, 1) * 9 * rushK * rushK, noise1(t * 40, 2) * 9 * rushK * rushK];
      o.bloom = 0.7 + 0.8 * rushK;
      o.ca = 1.2 + 5 * rushK * rushK;
    }
    if (v === 'sydney') {
      o.shake = [noise1(t * 30, 3) * 6 * shut, 0];
    }
    if (v === 'gato') { o.vignette = 0.6; o.grain = 0.065; }
    return o;
  }

  // ------------------------------------------------------------------ drawing
  private drawField(c: CanvasRenderingContext2D, t: number, hair: number, ent: number) {
    const v = this.variant;
    const { fx0, fx1, fy0, fy1 } = this;
    const appear = v === 'gato' ? smoothstep(this.ctx.start, this.ctx.start + 0.8, t) : 1;
    c.save();
    c.globalAlpha = appear;
    // an ink slot cut into the plate, behind the text
    c.fillStyle = rgba('ink', v === 'gato' ? 0.0 : 0.9);
    c.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    // hairline field
    c.lineWidth = hair;
    c.strokeStyle = rgba('bone', v === 'gato' ? 0.28 : 0.42);
    if (v === 'gato') {
      // fragile: the outline is broken into dashes that breathe
      c.setLineDash([22, 9 + 6 * (0.5 + 0.5 * Math.sin(t * 0.9))]);
      c.lineDashOffset = -t * 6;
    }
    c.strokeRect(fx0 + 0.5 * hair, fy0 + 0.5 * hair, fx1 - fx0, fy1 - fy0);
    c.setLineDash([]);
    // corner ticks (registration marks)
    c.strokeStyle = rgba('bone', 0.6);
    c.beginPath();
    const tk = 14;
    for (const [x, y, sx, sy] of [[fx0, fy0, -1, -1], [fx1, fy0, 1, -1], [fx0, fy1, -1, 1], [fx1, fy1, 1, 1]] as const) {
      c.moveTo(x + sx * 6, y); c.lineTo(x + sx * (6 + tk), y);
      c.moveTo(x, y + sy * 6); c.lineTo(x, y + sy * (6 + tk));
    }
    c.stroke();
    // prompt glyph
    c.font = font(F.mono(400), 44);
    c.fillStyle = rgba('ash', 0.7);
    c.textBaseline = 'alphabetic';
    c.fillText('›', fx0 + 34, this.base - 4);
    // labels (below the field)
    const nTok = this.toks.filter((k) => k.t0 <= t).length;
    c.font = font(F.mono(500), 13);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('bone', 0.6);
    c.fillText('PROMPT', fx0, fy1 + 30);
    const pw = measure('PROMPT', F.mono(500), 13, 3) + 14;
    c.fillStyle = rgba('signal', 0.9);
    c.fillText(META[v].no, fx0 + pw, fy1 + 30);
    c.letterSpacing = '0px';
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba('ash', 0.75);
    c.fillText(META[v].params, fx0, fy1 + 52);
    // P(doom) cameo: the live estimate, in the fine print
    const pdTxt = 'P(doom) ';
    const pdNum = formatPDoom(this.pd.value(t));
    c.fillText(pdTxt, fx0, fy1 + 74);
    const pdx = fx0 + measure(pdTxt, F.mono(400), 13);
    c.fillStyle = rgba('bone', 0.85);
    c.fillText(pdNum, pdx, fy1 + 74);
    c.fillStyle = rgba('ash', 0.75);
    c.fillText(` · ${META[v].pd}`, pdx + measure(pdNum, F.mono(400), 13), fy1 + 74);
    c.textAlign = 'right';
    c.letterSpacing = '3px';
    c.font = font(F.mono(500), 13);
    c.fillStyle = rgba('bone', 0.6);
    c.fillText(`CONTEXT ${String(nTok).padStart(2, '0')} / 8192`, fx1, fy1 + 30);
    c.letterSpacing = '0px';
    c.font = font(F.mono(400), 13);
    c.fillStyle = rgba('ash', 0.75);
    c.fillText('⏎ send  (irreversible)', fx1, fy1 + 52);
    c.textAlign = 'left';
    // keycap
    const press = t >= this.tEnter ? Math.pow(0.5, (t - this.tEnter) / 0.12) : 0;
    const armed = t >= this.tLast + 0.1 ? 1 : 0;
    const kx = this.keyX, ky = (fy0 + fy1) / 2, ks = 30 * (1 - 0.1 * press);
    c.lineWidth = hair * (1 + armed);
    const lit = t >= this.tEnter ? (v === 'gato' ? 0.35 + 0.3 * press : 1) : 0;
    if (lit > 0) { c.fillStyle = rgba('signal', lit); c.fillRect(kx - ks, ky - ks, ks * 2, ks * 2); }
    c.strokeStyle = lit > 0 ? rgba('signal', 1) : rgba('bone', 0.35 + 0.35 * armed * (0.5 + 0.5 * Math.cos(t * TAU * 2)));
    c.strokeRect(kx - ks, ky - ks, ks * 2, ks * 2);
    // return arrow glyph
    c.strokeStyle = lit > 0.5 ? rgba('ink', 1) : rgba('bone', 0.8);
    c.lineWidth = 2.2 * (1 - 0.1 * press);
    c.lineCap = 'square'; c.lineJoin = 'miter';
    const a = ks * 0.42;
    c.beginPath();
    c.moveTo(kx + a, ky - a); c.lineTo(kx + a, ky + a * 0.25); c.lineTo(kx - a, ky + a * 0.25);
    c.moveTo(kx - a + a * 0.45, ky + a * 0.25 - a * 0.45); c.lineTo(kx - a, ky + a * 0.25); c.lineTo(kx - a + a * 0.45, ky + a * 0.25 + a * 0.45);
    c.stroke();
    c.restore();
    void ent;
  }

  /** Per-glyph drift for the gato variant (UI px offset + rotation). */
  private drift(ci: number, t: number, _typedAt: number): { dx: number; dy: number; r: number } {
    if (this.variant !== 'gato') return { dx: 0, dy: 0, r: 0 };
    const tok = this.toks.find((k) => ci >= k.ci - (k.space ? 1 : 0) && ci < k.ci + k.n) ?? this.toks[this.toks.length - 1]!;
    const ts = tok.word.end + 0.35;
    const age = t - ts;
    if (age <= 0) return { dx: 0, dy: 0, r: 0 };
    const last = this.text.length - 1;
    const D = (last - ci) * this.adv; // distance from the held letter
    const k = Math.pow(age, 1.3) * smoothstep(0, 0.8, age);
    return {
      dx: -D * 0.045 * k,
      dy: ((hash(ci, 11) - 0.5) * 34 - 10 * (D / 900)) * k + Math.sin(t * 0.8 + ci * 1.7) * 2 * Math.min(1, age),
      r: (hash(ci, 13) - 0.5) * 0.16 * k * Math.min(1, D / 200),
    };
  }

  private drawTokens(c: CanvasRenderingContext2D, t: number, hair: number) {
    const v = this.variant;
    const adv = this.adv, base = this.base;
    c.save();
    c.font = font(this.fam, FS);
    c.textBaseline = 'alphabetic';
    for (const k of this.toks) {
      if (k.t0 > t) break;
      const x0 = this.tx0 + (k.ci - (k.space ? 1 : 0)) * adv;
      const xv = this.tx0 + k.ci * adv;
      const x1 = this.tx0 + (k.ci + k.n) * adv;
      const age = t - k.t0;
      const w = k.word;
      const sung = t < w.end;
      const cool = prog(t, w.end, w.end + 0.35);
      const flash = Math.pow(0.5, age / 0.06);
      const drop = (1 - ease.outExpo(clamp(age / 0.18))) * -10;
      const fade = v === 'gato' ? 1 - 0.55 * prog(t, k.t0 + 2.2, k.t0 + 5) : 1;
      // token bracket (with the leading space inside it) + id
      const by = base + 18;
      const bw = x1 - x0 - 6;
      const bAlpha = (v === 'gato' ? 0.3 : 0.4) * fade * (1 - prog(t, k.t0 + 0.8, k.t0 + 3) * 0.4);
      c.fillStyle = rgba('bone', bAlpha);
      c.fillRect(x0 + 3, by, bw, hair);
      c.fillRect(x0 + 3, by - 5, hair, 5);
      c.fillRect(x0 + 3 + bw - hair, by - 5, hair, 5);
      c.font = font(F.mono(400), 10);
      c.fillStyle = rgba('ash', 0.55 * fade);
      c.fillText(String(k.id), x0 + 5, by + 14);
      c.font = font(this.fam, FS);
      if (k.space) { c.fillStyle = rgba('graphite', 0.9 * fade); c.fillRect(x0 + adv * 0.5 - 2, base - FS * 0.2, 3, 3); }
      // glyphs
      let txt = k.text, gx0 = 0;
      if (v === 'sydney' && k.first && k.word === this.line.words[0] && t > k.t0 + 0.5 && t < w.end - 0.3) {
        const b = this.ctx.audio.beatAt(t);
        if (b - Math.floor(b) < 0.075 && Math.floor(b) % 2 === 1) { txt = 'Bing,'; gx0 = 7; }
      }
      for (let i = 0; i < Math.min(k.n, txt.length); i++) {
        const ch = txt[i]!;
        const d = this.drift(k.ci + i, t, k.t0);
        const gx = xv + i * adv + d.dx + gx0, gy = base + drop + d.dy;
        let col: string;
        if (gx0) col = rgba('bone', 0.9);
        else if (sung || cool < 1) {
          const a = 1;
          col = flash > 0.05 ? rgba('ember', a) : cool > 0 ? mixc('signal', 'bone', cool) : rgba('signal', a);
        } else col = rgba('bone', 0.95 * fade);
        c.fillStyle = col;
        if (d.r !== 0) {
          c.save(); c.translate(gx + adv / 2, gy - FS * 0.35); c.rotate(d.r); c.fillText(ch, -adv / 2, FS * 0.35); c.restore();
        } else c.fillText(ch, gx, gy);
      }
    }
    // karaoke: sung progress along each word's brackets
    for (const w of this.line.words) {
      if (w.start > t) break;
      const p = Lyrics.wordProgress(w, t);
      const ks = this.toks.filter((k) => k.word === w && k.t0 <= t);
      if (!ks.length) continue;
      const first = ks[0]!, lastK = ks[ks.length - 1]!;
      const x0 = this.tx0 + (first.ci - (first.space ? 1 : 0)) * adv + 3;
      const x1 = this.tx0 + (lastK.ci + lastK.n) * adv - 3;
      const done = prog(t, w.end, w.end + 0.4);
      const alpha = (v === 'gato' ? 0.7 : 1) * (1 - 0.75 * done);
      c.fillStyle = rgba('signal', alpha);
      c.fillRect(x0, base + 17, (x1 - x0) * p, 3);
    }
    c.restore();
  }

  private drawPopups(c: CanvasRenderingContext2D, t: number, hair: number) {
    const v = this.variant;
    for (const k of this.toks) {
      if (!k.dist) continue;
      const a0 = k.t0 - POP_PRE, a1 = k.tPopEnd + 0.12;
      if (t < a0 || t > a1) continue;
      const built = clamp((t - a0) / POP_PRE); // flicker phase (computing)
      const picked = t >= k.t0;
      const collapse = ease.inCubic(prog(t, k.tPopEnd, k.tPopEnd + 0.12));
      const ax = this.tx0 + k.ci * this.adv;
      const ay = this.fy0 - 26;
      const rows = k.dist;
      const rh = 21, headH = 20;
      const hgt = headH + rows.length * rh + 6;
      const pw = 290;
      c.save();
      // collapse toward the anchor
      c.translate(ax, ay);
      c.scale(1, 1 - collapse);
      c.globalAlpha = (v === 'gato' ? 0.85 : 1) * (1 - collapse * 0.6);
      // leader line to the token
      c.fillStyle = rgba('bone', 0.5);
      c.fillRect(0, 0, hair, this.base - FS * 0.82 - ay);
      c.fillRect(-3, this.base - FS * 0.82 - ay, 7, hair);
      // panel
      c.fillStyle = rgba('ink', 0.86);
      c.fillRect(0, -hgt, pw, hgt);
      c.fillStyle = rgba('bone', 0.35);
      c.fillRect(0, -hgt, pw, hair);
      c.fillRect(0, -hgt, hair, hgt);
      // header
      c.textBaseline = 'alphabetic';
      c.font = font(F.mono(400), 11);
      c.fillStyle = rgba('ash', 0.85);
      c.fillText('p( next | context )', 10, -hgt + 14);
      c.textAlign = 'right';
      c.fillText(picked ? 'sampled' : 'computing…', pw - 8, -hgt + 14);
      c.textAlign = 'left';
      const pmax = rows[0]![1];
      rows.forEach(([txt, p0], i) => {
        const unstable = v === 'sydney' && picked && t > k.t0 + 0.25;
        const p = unstable ? clamp(p0 * (1 + 0.5 * noise1(t * 2.7 + i * 7.3, k.id)), 0.001, 0.99) : p0;
        const y = -hgt + headH + (i + 1) * rh - 5;
        const isPick = i === k.pick;
        const fl = hash(i, Math.floor(t * 60), k.id) < 0.25 + 0.75 * built;
        if (!picked && !fl) return;
        const jitter = picked ? 1 : 0.3 + 0.7 * built + (hash(i, Math.floor(t * 30), 3) - 0.5) * 0.5 * (1 - built);
        const on = picked && isPick;
        const flashRow = on ? Math.pow(0.5, (t - k.t0) / 0.08) : 0;
        if (on) { c.fillStyle = rgba('signal', 0.14 + 0.5 * flashRow); c.fillRect(1, y - 15, pw - 1, rh - 1); }
        c.font = font(F.mono(on ? 500 : 400), 14);
        c.fillStyle = on ? rgba('signal', 1) : rgba(picked ? 'ash' : 'bone', picked ? 0.8 : 0.55);
        c.fillText((on ? '▸ ' : '  ') + txt, 8, y);
        const bx = 160, bwm = 80;
        const bw = clamp((bwm * p) / pmax * clamp(jitter, 0, 1.2), 1.5, bwm);
        c.fillStyle = on ? rgba('signal', 1) : rgba('bone', picked ? 0.3 : 0.45);
        c.fillRect(bx, y - 9, bw, 7);
        c.font = font(F.mono(400), 12);
        c.fillStyle = on ? rgba('signal', 1) : rgba('ash', 0.8);
        c.textAlign = 'right';
        c.fillText(p >= 0.1 ? p.toFixed(2) : p >= 0.01 ? p.toFixed(2) : p.toFixed(3), pw - 8, y);
        c.textAlign = 'left';
      });
      c.restore();
    }
  }

  private drawCaret(c: CanvasRenderingContext2D, t: number, hair: number, ent: number) {
    const v = this.variant;
    const last = this.toks.filter((k) => k.t0 <= t).pop();
    let x = this.caretX(t, 0.0) + 4;
    const sinceTok = last ? t - last.t0 : 99;
    const beat = this.ctx.audio.beatAt(t);
    const bph = beat - Math.floor(beat);
    let on = sinceTok < 0.45 || bph < 0.5;
    if (v === 'chatgpt' && t > this.tEnter + 0.05) on = false;
    let y0 = this.base - FS * 0.78, y1 = this.base + FS * 0.12;
    if (v === 'gato' && last) {
      // the cursor holds on to the last letter: it follows its drift
      const d = this.drift(this.text.length - 1, t, last.t0);
      x += d.dx; y0 += d.dy; y1 += d.dy;
      on = true;
    }
    if (!on) return null;
    c.fillStyle = rgba('signal', v === 'gato' ? 0.9 : 1);
    c.fillRect(x, y0, 3.5, y1 - y0);
    void hair; void ent;
    return { x: x + 1.75, y: y0 + 4, hot: v === 'gato' ? 0 : sinceTok < 0.3 ? 0.35 * Math.pow(0.5, sinceTok / 0.1) : 0 };
  }

  // ---- Sydney: reply + the smile curve
  private smileGeom() {
    return { cx: (this.fx0 + this.fx1) / 2, cy: this.fy1 - 190, R: 800 };
  }
  private smileHeadAt(t: number): { x: number; y: number } | null {
    const t0 = this.tSmile0, t1 = this.tSmile1;
    if (t < t0) return null;
    const k = ease.inOutCubic(clamp((t - t0) / (t1 - t0)));
    const g = this.smileGeom();
    const a = lerp(MASK.smileA1 + 0.05, MASK.smileA0 - 0.05, k);
    return { x: g.cx + Math.cos(a) * g.R, y: g.cy + Math.sin(a) * g.R * 0.55 };
  }
  private drawReply(c: CanvasRenderingContext2D, t: number, hair: number) {
    if (t < this.tEnter) return null;
    const rx = this.tx0, ry = this.fy1 + 112;
    c.save();
    // typing indicator, then the reply streams in
    const tStream = this.tEnter + 0.07;
    c.font = font(F.mono(500), 13);
    c.letterSpacing = '3px';
    c.fillStyle = rgba('signal', 0.9);
    c.fillText('REPLY', rx - 96 + 8, ry);
    c.letterSpacing = '0px';
    c.font = font(F.mono(400), 30);
    if (t < tStream) {
      const n = 1 + (Math.floor((t - this.tEnter) * 20) % 3);
      c.fillStyle = rgba('bone', 0.6);
      c.fillText('·'.repeat(n), rx, ry);
    } else {
      const n = Math.min(this.reply.length, Math.floor((t - tStream) / 0.009));
      c.fillStyle = rgba('bone', 0.92);
      c.fillText(this.reply.slice(0, n), rx, ry);
    }
    // the smile: a single wide arc drawn by the spark
    const t0 = this.tSmile0, t1 = this.tSmile1;
    let head: { x: number; y: number } | null = null;
    if (t > t0) {
      const k = ease.inOutCubic(clamp((t - t0) / (t1 - t0)));
      const g = this.smileGeom();
      const aS = MASK.smileA1 + 0.05, aE = lerp(aS, MASK.smileA0 - 0.05, k);
      c.strokeStyle = rgba('signal', 1);
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.beginPath();
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const a = lerp(aS, aE, i / N);
        const x = g.cx + Math.cos(a) * g.R, y = g.cy + Math.sin(a) * g.R * 0.55;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      if (k < 1) head = this.smileHeadAt(t);
    }
    c.restore();
    void hair;
    return head;
  }
}

function mixc(a: string, b: string, k: number) {
  const pa = rgba(a).match(/\d+/g)!.map(Number), pb = rgba(b).match(/\d+/g)!.map(Number);
  return `rgba(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')},1)`;
}

// ------------------------------------------------------------------ shaders
const UI_OVER = /* glsl */ `
uniform sampler2D ui; uniform float hotBoost; uniform float uiAlpha; uniform float zoomBlur; uniform vec2 zbCenter;
vec3 overUI(vec3 col, vec2 uv) {
  vec4 u = texture(ui, uv);
  if (zoomBlur > 0.0) {
    vec4 acc = u; float wsum = 1.0;
    for (int i = 1; i < 8; i++) { float k = float(i) / 7.0; vec4 s = texture(ui, mix(uv, zbCenter, k * zoomBlur)); acc += s * (1.0 - k * 0.6); wsum += 1.0 - k * 0.6; }
    u = acc / wsum;
    u.rgb /= max(u.a, 1e-3);
  }
  float hot = smoothstep(0.25, 0.7, u.r - u.g * 1.3);
  vec3 c = u.rgb * (1.0 + hotBoost * hot);
  return mix(col, c, u.a * uiAlpha);
}`;

const SHADERS: Record<Variant, string> = {
  // An engraved throat: rings (cartilage) and longitudinal folds, seen down its length.
  chatgpt: /* glsl */ `
uniform float t, lt, aspect, camZ, glow, rot, rush, swallow, beat;
uniform vec2 vp;
${UI_OVER}
// hairlines at integer v with a constant pixel width; fade to average tone when dense
float hairlines(float v, float wpx, float tone) {
  float fw = max(fwidth(v), 1e-5) * PX_SCALE;
  float sp = 1.0 / fw;                               // logical px per period
  float d = abs(fract(v + 0.5) - 0.5) * sp * PX_SCALE; // physical px
  float l = pxLine(d, wpx * 0.5 - 0.6, wpx * 0.5 + 0.6);
  float avg = min(1.0, wpx / sp) * 0.8;
  return mix(avg, l, smoothstep(2.2, 4.5, sp));
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  vec2 q = rot2(rot) * (p - vp);
  float r = length(q);
  float a = atan(q.y, q.x);
  vec2 dir = vec2(cos(a), sin(a));
  // organic cross-section (gentle, slowly turning)
  float wob = 1.0 + 0.045 * snoise(dir * 0.9 + vec2(t * 0.05, 3.1)) + 0.02 * snoise(dir * 2.1 + vec2(1.7, t * 0.08));
  float R = r / wob;
  float z = 0.5 / max(R, 1e-4);            // depth of the wall seen at this radius
  // swallow: a contraction wave travelling toward the camera
  float wz = mix(14.0, 0.2, sat(swallow / 1.1));
  float wave = exp(-pow(z - wz, 2.0) * 0.5) * (1.0 - smoothstep(1.1, 1.6, swallow));
  z *= 1.0 - 0.18 * wave;
  float u = z * 2.3 + camZ;                 // along-throat coordinate: one ring per unit
  float fu = fract(u);
  // cartilage rings: narrow ridges, wide soft grooves; lit by a headlamp at the camera
  float ridge = pow(0.5 + 0.5 * cos(TAU * (fu - 0.5)), 4.0);
  float face = smoothstep(0.25, 0.5, fu) * (1.0 - smoothstep(0.5, 0.75, fu));
  float fog = exp(-z * 0.2);
  float shade = (0.08 + 0.92 * max(ridge, face * 0.7)) * fog;
  shade *= 1.0 + 0.5 * beat + 1.4 * wave;
  // engraving: hairlines along the rings (perspective-spaced, constant pixel width)
  float lines = hairlines(u * 11.0, 0.5 + 1.7 * sat(shade), shade);
  // longitudinal folds in the grooves: short broken radial strokes
  float ang = a / TAU * 220.0 + 1.5 * snoise(vec2(u * 0.3, a * 1.5));
  float brk = smoothstep(0.1, 0.4, snoise(vec2(u * 1.3, floor(ang) * 0.37)));
  float folds = hairlines(ang, 0.9, 1.0) * brk * (1.0 - ridge) * fog * smoothstep(0.05, 0.3, r);
  vec3 col = C_INK;
  col += C_BONE * 0.34 * lines * (0.25 + 0.75 * sat(shade)) + C_ASH * 0.10 * folds;
  // speed streaks on the rush
  col += C_BONE * 0.3 * rush * rush * hatch(ang * 0.5, 0.18) * smoothstep(0.06, 0.5, r);
  // the pit: a deep ember glow at the vanishing point
  float g = exp(-r * mix(11.0, 1.4, sat(rush * rush))) * glow;
  col = mix(col, col * 0.3, smoothstep(0.25, 0.0, r) * 0.7);
  col += heat(0.3 + 0.45 * sat(g)) * g * 0.8;
  col = overUI(col, vUv);
  fragColor = vec4(col, 1.0);
}`,
  // Vertical bars in front of the prompt, closing in on the beat.
  sydney: /* glsl */ `
uniform float t, lt, aspect, spacing, barW, barCx, shut, beat, light;
${UI_OVER}
float barsCov(float x, float w) {
  float d = x - barCx;
  float m = mod(d, spacing) - spacing * 0.5;
  return m;
}
void main() {
  vec2 px = vUv * vec2(${W}.0, ${H}.0);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  // background: deep ink with a faint cold wall texture (engraved horizontal lines)
  float wall = hatch(px.y / 7.0, 0.08 + 0.1 * sat(snoise(p * 3.0 + 4.0)));
  vec3 col = C_INK + C_GRAPHITE * 0.05 * wall;
  col += C_ASH * 0.04 * exp(-dot(p, p) * 3.0);
  col = overUI(col, vUv);
  // shadows of the bars on the prompt plane (offset, soft)
  float m = barsCov(px.x - 26.0, barW);
  float sh = 1.0 - smoothstep(barW * 0.5 - 6.0, barW * 0.5 + 10.0, abs(m));
  col *= 1.0 - 0.72 * sh;
  // the bars: engraved iron cylinders, lit from the left
  float mb = barsCov(px.x, barW);
  float cov = aaFill(abs(mb) - barW * 0.5);
  float shutCov = aaFill(abs(mb) - mix(barW * 0.5, spacing * 0.5 + 2.0, shut));
  float s = clamp(mb / (barW * 0.5), -1.0, 1.0);
  vec3 n = vec3(s, 0.0, sqrt(max(0.0, 1.0 - s * s)));
  vec3 L = normalize(vec3(-0.7, 0.2, 0.7));
  float diff = max(0.0, dot(n, L));
  float spec = pow(max(0.0, dot(n, normalize(L + vec3(0, 0, 1)))), 30.0);
  float grain = snoise(vec2(px.x * 0.05, px.y * 0.004)) * 0.5 + 0.5;
  float eng = hatch(s * 4.0 + px.y * 0.002, diff * (0.55 + 0.3 * grain));
  vec3 bar = C_INK * 0.4 + C_BONE * (0.16 * eng + 0.55 * spec) * (1.0 + 0.6 * light);
  col = mix(col, bar, cov);
  col = mix(col, C_INK * 0.25, shutCov * (1.0 - cov) * step(0.001, shut));
  fragColor = vec4(col, 1.0);
}`,
  // Alone in the dark: a faint pool of light and a few slow motes.
  gato: /* glsl */ `
uniform float t, lt, aspect, glow, beat;
${UI_OVER}
void main() {
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  vec3 col = C_INK;
  col += C_ASH * 0.035 * glow * exp(-dot(p * vec2(0.8, 1.6), p * vec2(0.8, 1.6)) * 4.0);
  // motes: sparse points drifting upward very slowly
  vec2 g = p * 18.0 + vec2(0.0, -t * 0.12);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 h = hash22(id);
  vec2 o = (h - 0.5) * 0.7 + 0.08 * vec2(sin(t * 0.3 + h.x * 6.0), cos(t * 0.23 + h.y * 6.0));
  float d = length(f - o);
  float on = step(0.86, hash12(id + 7.0));
  col += C_BONE * on * 0.18 * smoothstep(0.035, 0.0, d) * glow;
  col = overUI(col, vUv);
  fragColor = vec4(col, 1.0);
}`,
};
