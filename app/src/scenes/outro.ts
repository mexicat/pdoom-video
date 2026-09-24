// OUTRO — the fuse reaches the end: detonation at P(DOOM) 1.00, then the number keeps going
// up (overflow: past 1, a log ruler, walls of zeros, ∞), the end card (= ∞ → 8 → 0/0 → NaN), a
// collapse to the spark, and a lone "↻ Regenerate" that gets clicked: every plate rewinds, the
// opening plays backwards and parks on the video's first frame, so the end loops into the start.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, layout, textPathCommands } from '../engine/type';
import { clamp, ease, hash, lerp, mulberry32, prog, smoothstep, TAU } from '../engine/util';
import { sparkHead, sparkParticles } from './_motifs';
import { drawReadout } from '../engine/hud';
import OpenScene from './open';

const PLATES = [
  'Sparks', 'Training loss', 'The room', 'Shoggoth', 'A stable run', 'Ascent', 'Paperwork', 'Trajectory',
  'Paperclips', 'The fuse', 'Architecture', 'Scale', 'Loom', 'What was seen',
];

/** How far into the opening (s) the rewind picks it up. */
const OPEN_REWIND = 6.5;
/** Beats (from the outro start) where the overflow and the end card begin. */
const OVER0 = 4, CARD0 = 20;
/** The detonation's readout (drawReadout origin and scale); the overflow continues from it. */
const RX = 170, RY = 700, RK = 5.2;

export default class Outro extends Scene {
  private plateTex: (THREE.Texture | null)[] = [];
  private lines = new LineBatch(20000);
  private ui = new Layer2D();
  private placeholder = new Layer2D();
  private plate = new FSPass(/* glsl */ `
    uniform sampler2D tex; uniform float zoom, rot, duo, kick, alpha; uniform vec2 shift;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
      p = rot2(rot) * p / zoom + shift;
      vec2 uv = p / vec2(16.0 / 9.0, 1.0) + 0.5;
      float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      vec2 o = (uv - 0.5) * kick * 0.012;
      vec3 c = vec3(texture(tex, uv + o).r, texture(tex, uv).g, texture(tex, uv - o).b);
      float l = luma(c);
      // duotone print treatment: ink -> signal -> bone
      vec3 d = mix(C_INK, C_SIGNAL * 1.2, smoothstep(0.02, 0.35, l));
      d = mix(d, C_BONE, smoothstep(0.35, 0.8, l));
      c = mix(c, d, duo);
      fragColor = vec4(c * inside * alpha, 1.0);
    }`, { tex: { value: null }, zoom: { value: 1 }, rot: { value: 0 }, duo: { value: 0 }, kick: { value: 0 }, alpha: { value: 1 }, shift: { value: new THREE.Vector2() } });
  private beats: number[] = [];
  private out: THREE.WebGLRenderTarget | null = null;
  /** A private instance of the opening, played backwards at the very end. */
  private open: OpenScene | null = null;
  private openEnd = 9;

  override async init() {
    const loader = new THREE.TextureLoader();
    this.plateTex = await Promise.all(
      PLATES.map((_, i) => new Promise<THREE.Texture | null>((res) => {
        const n = String(i + 1).padStart(2, '0');
        loader.load(`plates/fig${n}.jpg`, (t) => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null));
      })),
    );
    const { audio, lyrics } = this.ctx;
    // the opening's window, as the timeline cuts it (on the beat at/before "There was a sudden drop")
    const s0 = lyrics.get('There was a sudden drop').words[0]!.start;
    this.openEnd = audio.timeOfBeat(Math.floor(audio.beatAt(s0 + 0.02)));
    this.open = new OpenScene({ ...this.ctx, id: 'open@outro', params: {}, start: 0, end: this.openEnd });
    await this.open.init();
    this.beats = audio.beats.filter((b) => b >= this.ctx.start - 0.05 && b < this.ctx.end);
    if (this.beats.length === 0 || this.beats[0]! > this.ctx.start + 0.05) this.beats.unshift(this.ctx.start);
  }

  /** Beat index (fractional) relative to the outro start. */
  private rb(t: number) {
    const b = this.beats;
    let i = 0;
    while (i + 1 < b.length && b[i + 1]! <= t) i++;
    const next = b[i + 1] ?? b[i]! + 0.4644;
    return i + clamp((t - b[i]!) / (next - b[i]!));
  }
  private tb(i: number) { const b = this.beats; return i < b.length ? b[i]! : b[b.length - 1]! + (i - b.length + 1) * 0.4644; }

  private drawPlaceholder(i: number) {
    const L = this.placeholder; L.clear(i % 2 ? '#0d0d0e' : '#141415');
    const c = L.ctx;
    c.strokeStyle = rgba('graphite', 0.8); c.lineWidth = 1;
    for (let y = 0; y < H; y += 9) { c.beginPath(); c.moveTo(0, y + Math.sin(y * 0.02 + i) * 30); c.lineTo(W, y + Math.cos(y * 0.013 + i) * 30); c.stroke(); }
    c.fillStyle = rgba('bone'); c.font = font(F.mono(500), 64); c.fillText(String(i + 1).padStart(2, '0'), 120, 400);
    c.font = font(F.serif(400, true), 96); c.fillText(PLATES[i]!, 120, 560);
    return L.upload();
  }

  /**
   * The overflow, 4 bars after the detonation: P(doom) keeps being upped.
   * Bar 1: the readout's bar runs past 1.0 (the end cap snaps) · bar 2: a log ruler flies by
   * (π, 10, 42, 1,000) · bar 3: walls of zeros (1e9, 1e30, 1e100, 1e1000) · bar 4: the spark
   * traces ∞, then a 16th-note recap of the climb. `s` = beats since the overflow started.
   */
  private overflow(f: Frame, s: number, post: Record<string, any>) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const bar = Math.floor(s / 4), step = Math.floor(s) % 4, local = s - Math.floor(s);
    const hit = Math.pow(1 - clamp(local / 0.35), 3); // decays over each beat's first third
    const lb = this.lines; lb.clear();
    const L = this.ui; L.clear(); const c = L.ctx;
    const sig2: [number, number, number] = [LIN.signal[0] * 2.2, LIN.signal[1] * 2.2, LIN.signal[2] * 2.2];
    post.flash = step === 0 ? Math.pow(1 - clamp(local / 0.06), 2) * 0.04 : 0; // flash is additive linear: keep it tiny
    post.shake = [Math.sin(t * 83) * 9 * hit, Math.cos(t * 71) * 7 * hit];
    post.bloom = 0.9;

    if (bar === 0) {
      // the readout from the detonation: the bar runs past its end cap, the camera backs off
      const vals = [1.01, 1.1, 1.5, 2.0];
      const prev = step === 0 ? 1 : vals[step - 1]!, cur = vals[step]!;
      const v = lerp(prev, cur, ease.outExpo(clamp(local / 0.3)));
      const bw = 220 * RK;
      const zoom = Math.max(0.8, Math.min(1, 1580 / (bw * v))) * (1 + 0.035 * hit);
      c.save();
      c.translate(RX, RY); c.scale(zoom, zoom); c.translate(-RX, -RY);
      drawReadout(c, RX, RY, 1, { scale: RK, text: cur.toFixed(2), digits: rgba('bone', 1), label: rgba('signal', 1), bar: false });
      const by = RY + 16 * RK;
      // track 0..1 with its ticks, then the dashed extension and integer ticks beyond it
      c.fillStyle = rgba('bone', 0.18);
      c.fillRect(RX, by, bw, RK);
      for (let i = 0; i <= 10; i++) c.fillRect(RX + (bw * i) / 10, by - (i % 5 === 0 ? 5 : 3) * RK, RK, (i % 5 === 0 ? 5 : 3) * RK);
      c.fillStyle = rgba('ash', 0.45);
      for (let x = RX + bw; x < RX + bw * v; x += 7 * RK) c.fillRect(x, by, 3.5 * RK, RK * 0.8);
      c.font = font(F.mono(500), 9 * RK); c.fillStyle = rgba('ash', 0.9);
      for (let n = 2; n <= Math.floor(v + 1e-6); n++) {
        c.fillRect(RX + bw * n, by - 5 * RK, RK, 10 * RK);
        c.fillText(String(n), RX + bw * n - 2.5 * RK, by + 17 * RK);
      }
      c.fillStyle = rgba('signal', 1);
      c.fillRect(RX, by - RK, bw * v, 3 * RK);
      // the end cap at 1.0 snaps on the first push and its halves drift apart
      const snap = s >= 0.02 ? ease.outCubic(clamp(s / 1.5)) : 0;
      c.fillStyle = rgba('bone', 0.9);
      for (const sg of [-1, 1]) {
        c.save();
        c.translate(RX + bw, by + sg * 6 * RK * (1 + snap * 0.6));
        c.rotate(sg * snap * 0.5);
        c.fillRect(-0.75 * RK, -4 * RK, 1.5 * RK, 8 * RK);
        c.restore();
      }
      c.font = font(F.mono(500), 7 * RK); c.fillStyle = rgba('ash', 0.9 - 0.5 * snap);
      c.fillText('max', RX + bw - 7 * RK, by - 10 * RK);
      c.restore();
      if (s >= 1) {
        const typed = Math.floor(prog(s, 1, 2.2) * 60);
        c.font = font(F.mono(400), 22); c.fillStyle = rgba('ash', 0.95);
        c.fillText('¹ Kolmogorov (1933): P(Ω) = 1.  Deprecated.'.slice(0, typed), RX, 990);
      }
    } else if (bar === 1) {
      // a log ruler flies past under a marker; the number, huge, top left
      const vals = [3.14, 10, 42, 1000], texts = ['3.14', '10.00', '42.00', '1,000.00'];
      const notes = ['≈ π (irrational)', 'an order of magnitude', 'the answer (question pending)', 'units: dooms'];
      const prev = step === 0 ? 2 : vals[step - 1]!, cur = vals[step]!;
      const e = ease.outExpo(clamp(local / 0.4));
      const lv = lerp(Math.log10(prev), Math.log10(cur), e);
      const speed = (1 - e) * Math.abs(Math.log10(cur) - Math.log10(prev)); // for speed lines
      const PPD = 1000, XM = W * 0.7, YR = 780;
      const xOf = (val: number) => XM + (Math.log10(val) - lv) * PPD;
      // ruler
      c.fillStyle = rgba('bone', 0.25); c.fillRect(0, YR, W, 2);
      c.font = font(F.mono(500), 22);
      for (let d = -1; d <= 5; d++) for (let n = 1; n <= 9; n++) {
        const val = n * Math.pow(10, d), x = xOf(val);
        if (x < -40 || x > W + 40) continue;
        const major = n === 1;
        c.fillStyle = rgba('bone', major ? 0.85 : 0.35);
        c.fillRect(x - 1, YR - (major ? 26 : 12), 2, major ? 26 : 12);
        if (major) c.fillText(val >= 1000 ? `${val / 1000}k` : String(val), x - 8, YR + 44);
      }
      // the fill up to the marker, glowing, and the spark riding the marker
      lb.seg2(-20, YR - 3, XM, YR - 3, 7, sig2, 1);
      sparkHead(lb, XM, YR - 3, t, 1.1, 1);
      const rnd = mulberry32(7 + Math.floor(s));
      for (let i = 0; i < 40; i++) {
        const y = 640 + rnd() * 280, x = rnd() * W, len = 40 + rnd() * 300;
        lb.seg2(x, y, x + len * Math.min(1, speed * 2), y, 1, [LIN.bone[0] * 0.5, LIN.bone[1] * 0.5, LIN.bone[2] * 0.5], clamp(speed * 1.5) * 0.18);
      }
      // the number
      const pop = 1 + 0.06 * hit;
      c.save();
      c.translate(120, 520); c.scale(pop, pop);
      c.font = font(F.mono(500), 30); c.letterSpacing = '9px'; c.fillStyle = rgba('signal');
      c.fillText('P(DOOM)', 6, -250);
      c.letterSpacing = '0px';
      c.font = font(F.mono(400), 280); c.fillStyle = rgba('bone');
      c.fillText(texts[step]!, 0, 0);
      c.restore();
      c.font = font(F.mono(400), 24); c.fillStyle = rgba('signal', clamp(local * 4));
      c.fillText(notes[step]!, XM + 24, YR - 40);
    } else if (bar === 2) {
      // walls of zeros: 1 followed by N zeros, typed out and fitted to the frame
      const Ns = [9, 30, 100, 1000], sci = ['1e9', '1e30', '1e100', '1e1000'];
      const notes = ['(a billion)', '(one E thirty — see above)', '(a googol)', '(does not fit)'];
      const N = Ns[step]!;
      // digit groups of three from the right ("1 000 000 000"), wrapped between groups
      const digits = '1' + '0'.repeat(N);
      const groups: string[] = [];
      for (let i = digits.length; i > 0; i -= 3) groups.unshift(digits.slice(Math.max(0, i - 3), i));
      const nChars = digits.length + groups.length - 1;
      const AX = 120, AY = 170, AW = W - 240, AH = 700;
      // one line if it fits big, else fill the area: shrink until the greedy wrap fits
      let size = Math.min(210, AW / (nChars * 0.6));
      if (size < 120) size = Math.min(210, Math.sqrt((AW * AH) / (0.6 * 1.15 * nChars)));
      let lines: string[] = [];
      for (let it = 0; it < 30; it++) {
        c.font = font(F.mono(400), size);
        const cw = c.measureText('0').width;
        lines = [];
        let cur = '';
        for (const g of groups) {
          const next = cur ? `${cur} ${g}` : g;
          if (next.length * cw > AW && cur) { lines.push(cur); cur = g; } else cur = next;
        }
        lines.push(cur);
        if (lines.length * size * 1.15 <= AH) break;
        size *= 0.94;
      }
      const nTotal = lines.reduce((n, l) => n + l.length, 0);
      const typed = Math.floor(nTotal * ease.outCubic(clamp(local / 0.55))) + 1;
      const pop = 1 + 0.05 * hit;
      c.save();
      c.translate(W / 2, AY + AH / 2); c.scale(pop, pop); c.translate(-W / 2, -(AY + AH / 2));
      let k = 0;
      lines.forEach((ln, li) => {
        const y = AY + size * 0.85 + li * size * 1.15;
        if (y > AY + AH + size) return;
        let x = AX;
        for (const ch of Array.from(ln)) {
          if (k >= typed) return;
          c.fillStyle = k === 0 ? rgba('signal') : rgba('bone', 0.92);
          c.fillText(ch, x, y);
          x += c.measureText(ch).width; k++;
        }
      });
      c.restore();
      c.font = font(F.mono(500), 26); c.letterSpacing = '8px'; c.fillStyle = rgba('signal');
      c.fillText('P(DOOM) =', AX, 120);
      c.letterSpacing = '0px';
      c.textAlign = 'right';
      c.font = font(F.mono(400), 72); c.fillStyle = rgba('signal');
      c.fillText(sci[step]!, W - 120, 1000);
      c.font = font(F.mono(400), 22); c.fillStyle = rgba('ash');
      c.fillText(notes[step]!, W - 120, 1000 - 90);
      c.textAlign = 'left';
    } else {
      // the spark traces ∞; the last two beats flick back through the whole climb
      const s3 = s - 12;
      const cx = W / 2, cy = H / 2 + 30, A = 720;
      const lem = (u: number) => { const d = 1 + Math.sin(u) ** 2; return { x: cx + (A * Math.cos(u)) / d, y: cy + (A * Math.sin(u) * Math.cos(u)) / d }; };
      const uOf = (b: number) => TAU * 0.25 + 1.5 * TAU * ease.inOutCubic(clamp(b / 2)) + TAU * Math.max(0, b - 2);
      if (s3 < 2) {
        const u = uOf(s3), trail = Math.min(u - TAU * 0.25, TAU * 0.95);
        const n = 260;
        for (let i = 0; i < n; i++) {
          const u0 = u - trail * (i / n), u1 = u - trail * ((i + 1) / n);
          const p = lem(u0), q = lem(u1), fade = 1 - i / n;
          lb.seg2(p.x, p.y, q.x, q.y, 5 * fade + 1, sig2, fade);
        }
        const h = lem(u);
        sparkParticles(lb, t, (tt) => { const b = this.rb(tt) - OVER0 - 12; return b >= 0 && b < 2 ? lem(uOf(b)) : null; }, { rate: 90, intensity: 1, speed: 220 });
        sparkHead(lb, h.x, h.y, t, 1.3, 1);
        c.font = font(F.mono(500), 30); c.letterSpacing = '9px'; c.fillStyle = rgba('signal');
        c.fillText('P(DOOM) =', cx - A, cy - 300);
        c.letterSpacing = '0px';
        c.font = font(F.mono(400), 22); c.fillStyle = rgba('ash', clamp((s3 - 0.5) * 2));
        c.fillText('¹ upper bound removed', cx - A, cy + 330);
      } else {
        // 16th notes: the climb replayed, landing on ∞
        const seq = ['1.00', '1.50', '3.14', '42.00', '1,000', '1e30', '1e100', '∞'];
        const i = Math.min(seq.length - 1, Math.floor((s3 - 2) * 4));
        const size = i === seq.length - 1 ? 520 : 300 + hash(i, 5) * 160;
        c.save();
        c.font = font(F.mono(400), size);
        c.fillStyle = i % 2 ? rgba('signal') : rgba('bone');
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.translate(W / 2 + (hash(i, 2) - 0.5) * 300, H / 2 + (hash(i, 3) - 0.5) * 160);
        c.fillText(seq[i]!, 0, 0);
        c.restore();
        post.flash = 0;
      }
    }
    lb.render(renderer, this.out!);
    comp.draw(renderer, L.upload(), this.out!);
  }

  /**
   * The end card, 10 beats: the title as an equation, written by the spark — a bookend to the
   * opening's plotter pen. "I'm upping my" (Archivo, letter by letter on beats 0–2), construction
   * guides, then the spark traces the outlines of P(doom) (beat 3) and fills them; "=" slams in
   * (beat 4); ∞ is traced (a callback to the overflow) and numbered like an equation (1). Then the
   * value is simplified, one beat at a time: the ∞ topples a quarter turn into an 8 (beat 6), the 8
   * divides into 0/0 (beat 7), and on beat 8 — where the drums stop — 0/0 evaluates to NaN¹,
   * footnoted. `k` = beats since the card started (≥ 10: final state).
   */
  private geom: CardGeom | null = null;
  private cardGeom(c: CanvasRenderingContext2D): CardGeom {
    if (this.geom) return this.geom;
    const X = 150, Y1 = 420, Y2 = 740;
    const fP = F.serif(600, true), fT = F.serif(600), fR = F.serif(400), fV = F.archivo(100, 600);
    c.save();
    const wd = (f: string, sz: number, txt: string) => { c.font = font(f, sz); return c.measureText(txt).width; };
    const w100 = wd(fP, 100, 'P') + 2 + wd(fT, 100, '(doom)') + 14 + wd(fR, 100, '= NaN') + 40;
    const S = Math.min(300, (100 * (W - 150 - 170 - X)) / w100);
    const xP = X - 6, xDoom = xP + wd(fP, S, 'P') + S * 0.02;
    const xEq = xDoom + wd(fT, S, '(doom)') + S * 0.14;
    const xR = xEq + wd(fR, S, '= ');
    const line1: CardGeom['line1'] = [];
    let x = X;
    ["I'm", 'upping', 'my'].forEach((w, wi) => {
      Array.from(w).forEach((ch, j) => { line1.push({ ch, x: x + wd(fV, 150, w.slice(0, j)), word: wi, j }); });
      x += wd(fV, 150, w + ' ');
    });
    const nanW = wd(fR, S, 'NaN');
    c.restore();
    const pdoom = [...flatten(textPathCommands('P', fP, S, xP, Y2)), ...flatten(textPathCommands('(doom)', fT, S, xDoom, Y2))];
    const inf = flatten(textPathCommands('∞', fR, S, xR, Y2));
    const nan = flatten(textPathCommands('NaN', fR, S, xR, Y2));
    const box = (cs: P2[][]) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const ct of cs) for (const p of ct) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      return { x0, x1, y0, y1 };
    };
    const bi = box(inf), be = box(flatten(textPathCommands('=', fR, S, xEq, Y2)));
    this.geom = {
      S, X, Y1, Y2, xP, xDoom, xEq, xR, fP, fT, fR, fV, line1, pdoom, inf, nan, nanW,
      infC: { x: (bi.x0 + bi.x1) / 2, y: (bi.y0 + bi.y1) / 2 }, infW: bi.x1 - bi.x0, infH: bi.y1 - bi.y0,
      axis: (be.y0 + be.y1) / 2,
    };
    return this.geom;
  }

  /** Camera over the card: a slow push-in with punches on beats 3, 4, 6, 7 and 8. */
  private cardCam(k: number) {
    const kk = Math.min(k, 10);
    const punch = [3, 4, 6, 7, 8].reduce((s, b) => s + (kk >= b ? Math.pow(0.5, (kk - b) / 0.12) : 0), 0);
    return { z: 1 + 0.05 * ease.inOutCubic(kk / 10) + 0.012 * punch, dx: -18 * ease.inOutCubic(kk / 10) };
  }
  private camPt(k: number, p: P2): P2 {
    const { z, dx } = this.cardCam(k);
    return { x: W / 2 + (p.x - W / 2) * z + dx, y: H / 2 + (p.y - H / 2) * z };
  }

  /** Canvas part of the card (type fills, guides' labels, the value's metamorphosis, footnote). Also used by the implode. */
  private drawCardFills(c: CanvasRenderingContext2D, k: number, t: number) {
    const g = this.cardGeom(c);
    const { z, dx } = this.cardCam(k);
    c.save();
    c.translate(W / 2 + dx, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2);
    c.textBaseline = 'alphabetic';
    // line 1: letters rise into place, staggered, one word per beat
    c.font = font(g.fV, 150); c.fillStyle = rgba('bone');
    for (const L of g.line1) {
      const a = prog(k, L.word + L.j * 0.035, L.word + L.j * 0.035 + 0.3, ease.outExpo);
      if (a <= 0) continue;
      c.globalAlpha = a;
      c.fillText(L.ch, L.x, g.Y1 + (1 - a) * 46);
    }
    c.globalAlpha = 1;
    // construction guide labels (the lines themselves are in drawCardLines)
    const guide = prog(k, 2.6, 3.2, ease.outExpo) * (1 - prog(k, 5.2, 5.8));
    if (guide > 0) {
      c.font = font(F.mono(400), 17); c.fillStyle = rgba('ash', 0.8 * guide);
      c.fillText('baseline', W - 150 - 90, g.Y2 + 26);
      c.fillText('x-height', W - 150 - 90, g.Y2 - g.S * 0.42 - 10);
      c.fillText(`${g.S.toFixed(0)} pt`, g.X, g.Y2 + 26);
    }
    // P(doom): fills in as its traced outline closes
    const fillP = prog(k, 3.78, 4.0);
    if (fillP > 0) {
      c.globalAlpha = fillP;
      c.fillStyle = rgba('signal');
      c.font = font(g.fP, g.S); c.fillText('P', g.xP, g.Y2);
      c.font = font(g.fT, g.S); c.fillText('(doom)', g.xDoom, g.Y2);
      c.globalAlpha = 1;
    }
    if (k >= 4) {
      // "=" slams in from the right
      const slam = ease.outExpo(clamp((k - 4) / 0.22));
      c.save();
      c.globalAlpha = slam;
      c.translate(g.xEq + (1 - slam) * 160, g.Y2);
      c.font = font(g.fR, g.S); c.fillStyle = rgba('bone');
      c.fillText('=', 0, 0);
      c.restore();
      this.drawValue(c, g, k, t);
      // the equation number types in
      const num = '(1)', nT = Math.floor(prog(k, 5.0, 5.3) * (num.length + 0.99));
      c.font = font(F.mono(400), 40); c.fillStyle = rgba('ash', 0.9);
      c.textAlign = 'right';
      if (nT > 0) c.fillText(num.slice(0, nT).padEnd(num.length, ' '), W - 150, g.Y2 - g.S * 0.25);
      c.textAlign = 'left';
      const rule = prog(k, 8.35, 8.65, ease.outExpo);
      if (rule > 0) {
        c.fillStyle = rgba('bone', 0.25); c.fillRect(g.X, 880, 260 * rule, 1);
        const note = '¹ estimate no longer defined', nn = Math.floor(prog(k, 8.45, 9.2) * note.length);
        c.font = font(F.mono(400), 24); c.fillStyle = rgba('ash');
        c.fillText(note.slice(0, nn), g.X, 924);
      }
    }
    c.restore();
  }

  /**
   * The right-hand side, simplified one beat at a time. ∞ (fills once traced) leans back on the
   * upbeat, then on beat 6 hops and turns a quarter (echo trails), landing with a squash: an 8. Its
   * waist thins; on beat 7 the loops pull apart on taffy strands that snap with a spark, round off
   * into two zeros, and two sparks run out from the snap drawing the fraction bar: 0/0. It trembles
   * (the image splits into colour fringes); on beat 8 — the drums stop — it collapses onto its bar,
   * a shockwave, and the bar inflates into NaN¹. Each new form flashes hot along its outline and
   * cools (the spark's heat), in step with the lines in drawValueLines.
   */
  private eightXf(k: number, g: CardGeom) {
    const u = clamp((k - 6) / 0.34);
    const rot = k < 6 ? -0.12 * ease.inOutQuad(prog(k, 5.6, 6.0)) : lerp(-0.12, Math.PI / 2, ease.outBack(u, 1.4));
    const lift = k < 6 ? 0 : -0.16 * g.S * Math.sin(Math.PI * clamp(u / 0.85));
    const sc = lerp(1, 0.9, ease.inOutCubic(prog(k, 6, 6.34)));
    const sq = k < 6.29 ? 0 : Math.exp(-(k - 6.29) / 0.06) * Math.cos((k - 6.29) * 30); // landing squash
    const pinch = ease.inQuad(prog(k, 6.72, 7.0));
    return { rot, lift, sx: sc * (1 - 0.09 * sq + 0.07 * pinch), sy: sc * (1 + 0.07 * sq - 0.1 * pinch) };
  }
  /** A point of the ∞ outline under eightXf. */
  private eightPt(g: CardGeom, x: ReturnType<Outro['eightXf']>, p: P2): P2 {
    const dx = (p.x - g.infC.x) * x.sx, dy = (p.y - g.infC.y) * x.sy, c = Math.cos(x.rot), s = Math.sin(x.rot);
    return { x: g.infC.x + c * dx - s * dy, y: g.infC.y + x.lift + s * dx + c * dy };
  }
  /** 0/0 geometry at card beat k: zero centres (±), size factor, bar reach, collapse, tremble. */
  private fracState(k: number, g: CardGeom, t: number) {
    const S = g.S;
    const loopR = (g.infW * 0.9) / 4;
    const u = ease.outBack(clamp((k - 7.05) / 0.22), 1.3);
    const col = k < 8 ? 0 : ease.inCubic(prog(k, 8.0, 8.12));
    const trem = 2.8 * Math.pow(prog(k, 7.35, 8.0), 2);
    return {
      cx: g.infC.x + trem * Math.sin(t * 97), cy: g.axis + trem * Math.cos(t * 83),
      off: lerp(loopR, 0.37 * S, u), f: lerp(loopR / (0.25 * S), 1, u),
      zipL: ease.outExpo(prog(k, 7.08, 7.34)), col, a: ease.outQuad(prog(k, 7.04, 7.12)),
    };
  }
  /** NaN's inflate transform (from the collapsed bar). */
  private nanXf(k: number, g: CardGeom) {
    const e = ease.outExpo(prog(k, 8.12, 8.46));
    return { cx: lerp(g.infC.x, g.xR + g.nanW / 2, e), sx: lerp((0.68 * g.S) / g.nanW, 1, e), sy: lerp(0.03, 1, e) };
  }

  private drawValue(c: CanvasRenderingContext2D, g: CardGeom, k: number, t: number) {
    const S = g.S, ex = g.infC.x, ey = g.infC.y;
    const bone = rgba('bone');
    // ∞ → 8, and the 8's halves while they pull apart
    const fillA = prog(k, 4.75, 4.95);
    if (fillA > 0 && k < 7.16) {
      const x = this.eightXf(k, g);
      const drawEight = () => {
        c.translate(ex, ey + x.lift); c.rotate(x.rot); c.scale(x.sx, x.sy);
        c.font = font(g.fR, S); c.fillStyle = bone;
        c.fillText('∞', g.xR - ex, g.Y2 - ey);
      };
      if (k < 7) {
        c.save(); c.globalAlpha = fillA; drawEight(); c.restore();
      } else {
        const d = this.fracState(k, g, t).off - (g.infW * 0.9) / 4 + 0.05 * S * prog(k, 7.0, 7.05);
        const wy = ey + x.lift;
        for (const sg of [-1, 1]) {
          c.save();
          c.globalAlpha = 1 - prog(k, 7.06, 7.15);
          c.beginPath(); c.rect(ex - S, sg < 0 ? wy - 2 * S : wy, 2 * S, 2 * S); c.clip();
          c.translate(0, sg * d);
          drawEight();
          c.restore();
        }
        // taffy: the crossing strokes stretch between the halves, thin out and snap at 7.06
        const s = prog(k, 7.0, 7.06);
        if (s < 1) {
          c.save();
          c.strokeStyle = bone; c.lineCap = 'round';
          c.lineWidth = Math.max(0.5, 0.028 * S * (1 - s) ** 1.5);
          const w = 0.07 * S;
          for (const sg of [-1, 1]) {
            c.beginPath();
            c.moveTo(ex - sg * w, wy - d);
            c.bezierCurveTo(ex - sg * w * 0.3, wy - d * 0.2, ex + sg * w * 0.3, wy + d * 0.2, ex + sg * w, wy + d);
            c.stroke();
          }
          c.restore();
        }
      }
    }
    // 0/0
    if (k >= 7.04 && k < 8.12) {
      const q = this.fracState(k, g, t);
      c.save();
      c.translate(q.cx, q.cy); c.scale(1 + 0.15 * q.col, 1 - q.col);
      c.fillStyle = bone;
      c.globalAlpha = q.a;
      for (const sg of [-1, 1]) {
        c.beginPath();
        c.ellipse(0, sg * q.off, 0.18 * S * q.f, 0.25 * S * q.f, 0, 0, TAU);
        c.ellipse(0, sg * q.off, 0.105 * S * q.f, 0.205 * S * q.f, 0, 0, TAU);
        c.fill('evenodd');
      }
      c.globalAlpha = 1;
      c.fillRect(-0.34 * S * q.zipL, -0.017 * S, 0.68 * S * q.zipL, 0.034 * S);
      c.restore();
    }
    // the flattened fraction — just its bar now — inflates into NaN (hot, cooling to ash), then ¹
    if (k >= 8.12) {
      const x = this.nanXf(k, g);
      const cool = ease.outCubic(prog(k, 8.12, 8.9));
      c.save();
      c.translate(x.cx, g.axis); c.scale(x.sx, x.sy);
      c.font = font(g.fR, S); c.fillStyle = mixHex('#ffb27a', rgba('ash'), cool);
      c.fillText('NaN', -g.nanW / 2, g.Y2 - g.axis);
      c.restore();
      const sup = ease.outBack(clamp((k - 8.4) / 0.25));
      if (sup > 0) {
        c.globalAlpha = clamp(sup);
        c.font = font(g.fR, S * 0.3 * sup); c.fillStyle = rgba('ash');
        c.fillText('¹', g.xR + g.nanW + 8, g.Y2 - S * 0.42);
        c.globalAlpha = 1;
      }
    }
  }

  /** The value's lines: echo trails, hot outlines that cool, the snap, the bar's sparks, the collapse. */
  private drawValueLines(lb: LineBatch, g: CardGeom, k: number, t: number, P: (p: P2) => P2) {
    if (k < 5.5) return;
    const S = g.S;
    const heat = (k0: number, tau = 0.22) => (k < k0 ? 0 : Math.exp(-(k - k0) / tau));
    const hotC = (i: number): [number, number, number] => [LIN.signal[0] * 2.4 * i, LIN.signal[1] * 2.4 * i, LIN.signal[2] * 2.4 * i];
    const poly = (pts: P2[], w: number, i: number, a = 1) => { for (let j = 1; j < pts.length; j++) { const p = P(pts[j - 1]!), q = P(pts[j]!); lb.seg2(p.x, p.y, q.x, q.y, w, hotC(i), a); } };
    // ∞ → 8: echo trails while it turns; the outline flashes as it lands, glows as the waist thins
    if (k >= 6 && k < 7) {
      if (k < 6.4) for (let j = 1; j <= 3; j++) {
        const x = this.eightXf(k - j * 0.04, g);
        for (const ct of g.inf) poly(ct.map((p) => this.eightPt(g, x, p)), 1.5, 0.85, 0.36 * (1 - j / 4) * (1 - prog(k, 6.25, 6.4)));
      }
      const h = Math.max(heat(6.28, 0.18), 0.8 * prog(k, 6.72, 7.0) ** 2);
      if (h > 0.02) { const x = this.eightXf(k, g); for (const ct of g.inf) poly(ct.map((p) => this.eightPt(g, x, p)), 2.2, h, 1); }
    }
    const kOf = (tt: number) => this.rb(tt) - CARD0;
    const burst = (k0: number, k1: number, at: () => P2, rate: number, speed: number, seed: number, life = 0.5) => {
      if (k < k0 || k > k1 + 1.2) return;
      sparkParticles(lb, t, (tt) => { const kk = kOf(tt); return kk >= k0 && kk < k1 ? P(at()) : null; }, { rate, intensity: 1.2, speed, seed, life });
      const h = Math.pow(0.5, Math.max(0, k - k0) / 0.12);
      if (h > 0.02) { const q = P(at()); sparkHead(lb, q.x, q.y, t, 0.5 + 0.9 * h, h); }
    };
    // beat 7: the snap
    const waist = { x: g.infC.x, y: g.infC.y + this.eightXf(7, g).lift };
    burst(7.06, 7.11, () => waist, 1600, 440, 23);
    // 0/0: the zeros' outlines flash as they round off; two sparks run the bar out and it cools
    if (k >= 7.04 && k < 8.3) {
      const q = this.fracState(Math.min(k, 8.12), g, t);
      const hz = heat(7.08, 0.22) + 0.9 * prog(k, 7.6, 8.0) ** 3; // they glow again as they destabilise
      if (hz > 0.02 && k < 8.12) {
        for (const sg of [-1, 1]) for (const [rx, ry] of [[0.18, 0.25], [0.105, 0.205]] as const) {
          const pts: P2[] = [];
          for (let j = 0; j <= 48; j++) {
            const a = (j / 48) * TAU;
            pts.push({ x: q.cx + Math.cos(a) * rx * S * q.f * (1 + 0.15 * q.col), y: q.cy + (sg * q.off + Math.sin(a) * ry * S * q.f) * (1 - q.col) });
          }
          poly(pts, 2, hz, q.a);
        }
      }
      const hb = heat(7.1, 0.3) + 1.6 * prog(k, 7.85, 8.12) ** 2;
      if (hb > 0.02) {
        const L = 0.34 * S * q.zipL;
        const a = P({ x: q.cx - L, y: q.cy }), b = P({ x: q.cx + L, y: q.cy });
        lb.seg2(a.x, a.y, b.x, b.y, 0.034 * S * (k < 8.12 ? 1 : 1 - prog(k, 8.12, 8.3)), hotC(Math.min(1.6, hb)), 1);
      }
      if (k >= 7.08 && q.zipL < 0.995) for (const sg of [-1, 1]) {
        const p = P({ x: q.cx + sg * 0.34 * S * q.zipL, y: q.cy });
        sparkHead(lb, p.x, p.y, t, 0.6, 1 - q.zipL);
      }
    }
    // beat 8: the collapse — a burst, a flat shockwave along the line, NaN's outline hot, cooling
    const ctr = { x: g.infC.x, y: g.axis };
    burst(8.1, 8.16, () => ctr, 2400, 640, 29, 0.6);
    if (k >= 8.12 && k < 9) {
      const e = ease.outCubic(prog(k, 8.12, 8.75)), fade = 1 - prog(k, 8.3, 8.75);
      const rx = lerp(0.3, 4.2, e) * S, ry = rx * 0.16;
      const ring: P2[] = [];
      for (let j = 0; j <= 96; j++) { const a = (j / 96) * TAU; ring.push({ x: ctr.x + Math.cos(a) * rx, y: ctr.y + Math.sin(a) * ry }); }
      poly(ring, 1.5 + 2 * (1 - e), 0.9 * fade, fade);
      const h = heat(8.12, 0.3);
      if (h > 0.02) {
        const x = this.nanXf(k, g), c0 = g.xR + g.nanW / 2;
        for (const ct of g.nan) poly(ct.map((p) => ({ x: x.cx + (p.x - c0) * x.sx, y: g.axis + (p.y - g.axis) * x.sy })), 2.2, h, 1);
      }
    }
  }

  /** Line part of the card: guides, the spark tracing P(doom) and ∞, and the value's lines. */
  private drawCardLines(lb: LineBatch, k: number, t: number) {
    const g = this.cardGeom(this.ui.ctx);
    const P = (p: P2) => this.camPt(k, p);
    const hot: [number, number, number] = [LIN.signal[0] * 2.4, LIN.signal[1] * 2.4, LIN.signal[2] * 2.4];
    const boneC: [number, number, number] = [LIN.bone[0] * 0.5, LIN.bone[1] * 0.5, LIN.bone[2] * 0.5];
    // construction guides: baseline and x-height, drawn across on beat 3's upbeat
    const guide = prog(k, 2.6, 3.2, ease.outExpo), gOut = 1 - prog(k, 5.2, 5.8);
    if (guide > 0 && gOut > 0) {
      const x1 = lerp(g.X, W - 150, guide);
      for (const [y, a] of [[g.Y2, 0.5], [g.Y2 - g.S * 0.42, 0.25], [g.Y2 - g.S * 0.68, 0.18]] as const) {
        const p = P({ x: g.X - 40, y }), q = P({ x: x1, y });
        lb.seg2(p.x, p.y, q.x, q.y, 1, boneC, a * gOut);
      }
    }
    // tracing: every contour at once, staggered left to right, each with a spark
    const trace = (contours: P2[][], k0: number, dur: number, stagger: number, fade: number) => {
      contours.forEach((ct, ci) => {
        const r = ease.inOutCubic(prog(k, k0 + ci * stagger, k0 + ci * stagger + dur));
        if (r <= 0 || fade <= 0) return;
        const head = drawPartial(lb, ct, r, (p) => P(p), 2.2, hot, fade);
        if (r < 1 && head) sparkHead(lb, P(head).x, P(head).y, t, 0.55, 1);
      });
    };
    trace(g.pdoom, 3.0, 0.62, 0.03, 1 - prog(k, 3.95, 4.6));
    if (k >= 4.05) trace(g.inf, 4.08, 0.62, 0.05, 1 - prog(k, 4.9, 5.5));
    this.drawValueLines(lb, g, k, t, P);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    this.out = out;
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const rb = this.rb(t);
    const nBeats = this.beats.length;
    // phases (in beats from the outro start)
    // 36 beats: bar 1 detonation, 4 bars of overflow, 10 beats of end card (0/0 = NaN lands where the
    // drums stop), then ~6 beats of decay: collapse, regenerate, and the rewind back to the first frame.
    const FADE0 = Math.min(CARD0 + 10, nBeats - 6);
    const post: Record<string, any> = { bloom: 0.8, hud: 1 };

    renderer.setRenderTarget(out);
    renderer.setClearColor(new THREE.Color(0, 0, 0), 1);
    renderer.clear();

    // ---------------------------------------------------------------- overflow: P(doom) keeps going up
    if (rb >= OVER0 && rb < CARD0) this.overflow(f, rb - OVER0, post);

    // ---------------------------------------------------------------- detonation (first bar)
    if (rb < OVER0) {
      const lb = this.lines; lb.clear();
      const t0 = this.tb(0);
      const age = t - t0;
      const rnd = mulberry32(99);
      const cx = W / 2, cy = H / 2;
      const grow = ease.outExpo(clamp(age / 1.4));
      const fadeOut = 1 - smoothstep(OVER0 - 0.7, OVER0, rb);
      for (let i = 0; i < 2600; i++) {
        const a = rnd() * TAU, sp = 0.2 + rnd() ** 2 * 1.4, r0 = rnd() * 40;
        const len = 60 + rnd() * 380;
        const r1 = r0 + grow * sp * 1400;
        const hot = rnd() < 0.3;
        const col: [number, number, number] = hot ? [LIN.ember[0] * 3, LIN.ember[1] * 3, LIN.ember[2] * 3] : [LIN.bone[0] * 0.8, LIN.bone[1] * 0.8, LIN.bone[2] * 0.8];
        const tail = Math.max(r0, r1 - len * (0.3 + grow));
        lb.seg2(cx + Math.cos(a) * tail, cy + Math.sin(a) * tail, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, hot ? 1.8 : 1, col, fadeOut * (1 - grow * 0.4));
      }
      // shockwave rings on each beat of the first bar
      for (let k = 0; k < 4; k++) {
        const tk = this.tb(k);
        const ak = t - tk;
        if (ak < 0 || ak > 1.2) continue;
        const R = ease.outCubic(ak / 1.2) * 1300;
        const segs = 180;
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * TAU, a1 = ((s + 1) / segs) * TAU;
          lb.seg2(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, 2.5 * (1 - ak / 1.2) + 0.5, [LIN.signal[0] * 2, LIN.signal[1] * 2, LIN.signal[2] * 2], (1 - ak / 1.2) * fadeOut);
        }
      }
      lb.render(renderer, out);
      post.flash = Math.pow(0.5, age / 0.045) * 1.2;
      post.shake = [Math.sin(t * 90) * 14 * Math.pow(0.5, age / 0.4), Math.cos(t * 77) * 14 * Math.pow(0.5, age / 0.4)];
      // the number, finally: P(DOOM) 1.00, huge, blown about by the rings
      const L = this.ui; L.clear(); const c = L.ctx;
      const show = smoothstep(0.05, 0.2, age);
      if (show > 0) {
        c.globalAlpha = show;
        const k = RK * (1 + 0.04 * f.a.kick);
        const jx = Math.sin(t * 61) * 6 * Math.pow(0.5, age / 0.5), jy = Math.cos(t * 47) * 6 * Math.pow(0.5, age / 0.5);
        drawReadout(c, RX + jx, RY + jy, 1, { scale: k, text: '1.00', digits: rgba('bone', 1), label: rgba('signal', 1) });
      }
      comp.draw(renderer, L.upload(), out);
    }

    // ---------------------------------------------------------------- end card
    if (rb >= CARD0 && rb < FADE0) {
      const k = rb - CARD0; // beats into the card (see drawCardFills)
      const L = this.ui; L.clear();
      this.drawCardFills(L.ctx, k, t);
      comp.draw(renderer, L.upload(), out);
      const lb = this.lines; lb.clear();
      this.drawCardLines(lb, k, t);
      lb.render(renderer, out);
      post.flash = 0;
      const jolt = (k0: number, d: number, a: number) => (k >= k0 && k < k0 + d ? a * (1 - (k - k0) / d) : 0);
      post.shake = [Math.sin(t * 80) * (jolt(4, 0.4, 7) + jolt(6, 0.35, 6)), Math.sin(t * 70) * (jolt(7, 0.25, 3) + jolt(8.1, 0.35, 7))];
      post.bloom = 0.35; post.halation = 0; // keep the bone type crisp, let the spark glow
      // 0/0 destabilises: colour fringes build up, then spike on the collapse
      post.ca = 1.2 + (k < 8.12 ? 6 * prog(k, 7.35, 8.1) ** 2 : 7 * Math.exp(-(k - 8.12) / 0.15));
    }

    // ---------------------------------------------------------------- collapse, regenerate, rewind to the top
    if (rb >= FADE0) {
      const k = rb - FADE0; // beats into the tail (~6 beats of decay after the drums stop)
      // click on beat 3; the plates rewind (accelerating) until R1; then the opening itself plays
      // backwards, decelerating, and parks on its first frame — the video's first frame — at R2
      const CLICK = 3, R0 = CLICK + 0.12, R1 = 4.3, R2 = 6.0;
      const lb = this.lines; lb.clear();
      const cx = W / 2, cy = H / 2 - 40;
      const L = this.ui; L.clear(); const c = L.ctx;
      // the frame closes back in around the chat window (it is the opening's frame too)
      post.frame = prog(k, 0.6, 1.5, ease.inOutCubic);

      if (k < R0) {
        if (k < 0.7) {
          // the end card implodes into the spark
          const q = ease.inExpo(clamp(k / 0.6));
          c.save();
          c.translate(cx, cy); c.scale(1 - q, 1 - q); c.translate(-cx, -cy);
          c.globalAlpha = 1 - q * 0.6;
          this.drawCardFills(c, 99, t);
          c.restore();
          post.bloom = 0.25; post.halation = 0;
        }
        const head = (tt: number) => ({ x: cx + Math.sin(tt * 1.3) * 6, y: cy + Math.cos(tt * 1.7) * 4 });
        const alive = (tt: number) => this.rb(tt) >= FADE0 + 0.35;
        const glow = smoothstep(0.35, 0.65, k) * (1 - smoothstep(CLICK, CLICK + 0.12, k));
        sparkParticles(lb, t, (tt) => (alive(tt) ? head(tt) : null), { rate: 50 * glow, intensity: glow, speed: 150 });
        if (glow > 0.01) sparkHead(lb, head(t).x, head(t).y, t, 1.2, glow);
        lb.render(renderer, out);
        // the button and the cursor
        const bIn = smoothstep(0.9, 1.4, k);
        if (bIn > 0) {
          const bw = 420, bh = 88, bx = cx - bw / 2, by = cy + 170;
          const pressed = k >= CLICK;
          c.globalAlpha = bIn;
          c.lineWidth = 1.5;
          c.strokeStyle = rgba('bone', 0.85);
          c.fillStyle = pressed ? rgba('bone', 0.9) : rgba('ink2', 0.9);
          roundRect(c, bx, by, bw, bh, 14); c.fill(); c.stroke();
          c.fillStyle = pressed ? rgba('ink') : rgba('bone');
          c.font = font(F.mono(500), 32);
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('↻  Regenerate', cx, by + bh / 2 + 1);
          c.textAlign = 'left'; c.textBaseline = 'alphabetic';
          c.font = font(F.mono(400), 16); c.fillStyle = rgba('ash', 0.8);
          c.fillText('this response could not be verified', bx + 34, by + bh + 34);
          // cursor glides in, hovers, clicks on the beat
          const m = prog(k, 1.4, CLICK - 0.15, ease.inOutCubic);
          const px = lerp(W * 0.8, cx + 60, m), py = lerp(H * 0.9, by + bh / 2 + 10, m);
          drawCursor(c, px, py, pressed ? 0.88 : 1);
        }
        comp.draw(renderer, L.upload(), out);
        post.flash = k >= CLICK ? 0.8 * (1 - clamp((k - CLICK) / 0.12)) : 0;
      } else if (k < R1) {
        // rewind: the plates flash past backwards, faster and faster (the last one before the
        // opening is `loss`; the opening itself is live)
        const n = PLATES.length - 1;
        const idx = n - Math.min(n - 1, Math.floor(ease.inQuad(prog(k, R0, R1)) * n));
        const u = this.plate.u;
        u.tex!.value = this.plateTex[idx] ?? this.drawPlaceholder(idx);
        u.zoom!.value = 1.0; u.rot!.value = 0; u.duo!.value = idx % 2; u.kick!.value = 1; u.alpha!.value = 1;
        (u.shift!.value as THREE.Vector2).set(0, Math.sin(t * 173) * 0.02);
        this.plate.render(renderer, out);
        post.ca = 6; post.grain = 0.12;
      } else {
        // the opening, backwards, braking to a stop on its first frame
        const tau = Math.max(0, OPEN_REWIND * Math.pow(1 - prog(k, R1, R2), 2));
        const ov = this.renderOpen(tau, out);
        Object.assign(post, ov ?? {});
        const brake = 1 - prog(k, R1, R1 + 0.8);
        post.ca = (ov?.ca ?? 1.2) + 5 * brake; post.grain = lerp(0.05, 0.1, brake);
        post.frame = 1; post.hud = 1;
      }
    }
    return post;
  }

  /** The opening scene at its own time `tau` (seconds from the song start), into `out`. */
  private renderOpen(tau: number, out: THREE.WebGLRenderTarget) {
    const o = this.open;
    if (!o) return undefined;
    const au = this.ctx.audio;
    const beat = au.beatAt(tau), bar = au.barAt(tau);
    return o.render({
      t: tau, dt: 1 / 60, lt: tau, p: tau / Math.max(1e-3, this.openEnd), start: 0, end: this.openEnd, seeked: true, preroll: false,
      beat, bar, beatPhase: beat - Math.floor(beat), barPhase: bar - Math.floor(bar), a: au.sample(tau), under: null, tin: 1, tout: 0,
    }, out) as Record<string, any> | undefined;
  }
}

/** Mix two CSS colours (#rrggbb or rgba()) → rgb() string. */
function mixHex(a: string, b: string, k: number) {
  const parse = (s: string) => s.startsWith('#') ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) : s.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const pa = parse(a), pb = parse(b);
  return `rgb(${[0, 1, 2].map((i) => Math.round(pa[i]! + (pb[i]! - pa[i]!) * k)).join(',')})`;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function drawCursor(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y); c.scale(1.4 * s, 1.4 * s);
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(0, 17); c.lineTo(4.2, 13); c.lineTo(7.2, 19.5); c.lineTo(9.6, 18.4); c.lineTo(6.7, 12.2); c.lineTo(12.3, 12.2); c.closePath();
  c.fillStyle = rgba('bone'); c.fill();
  c.lineWidth = 1; c.strokeStyle = rgba('ink'); c.stroke();
  c.restore();
}

type P2 = { x: number; y: number };
interface CardGeom {
  S: number; X: number; Y1: number; Y2: number; xP: number; xDoom: number; xEq: number; xR: number;
  fP: string; fT: string; fR: string; fV: string;
  line1: { ch: string; x: number; word: number; j: number }[];
  pdoom: P2[][]; inf: P2[][]; nan: P2[][]; nanW: number;
  /** the ∞'s bounding-box centre and size, and the math axis (the "=" sign's centre line) */
  infC: P2; infW: number; infH: number; axis: number;
}

/** opentype path commands → polylines (one per contour). */
function flatten(cmds: any[], steps = 10): P2[][] {
  const out: P2[][] = [];
  let cur: P2[] = [], x0 = 0, y0 = 0, sx = 0, sy = 0;
  for (const c of cmds) {
    if (c.type === 'M') { if (cur.length > 1) out.push(cur); cur = [{ x: c.x, y: c.y }]; x0 = sx = c.x; y0 = sy = c.y; }
    else if (c.type === 'L') { cur.push({ x: c.x, y: c.y }); x0 = c.x; y0 = c.y; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= steps; i++) { const u = i / steps, v = 1 - u; cur.push({ x: v * v * x0 + 2 * v * u * c.x1 + u * u * c.x, y: v * v * y0 + 2 * v * u * c.y1 + u * u * c.y }); }
      x0 = c.x; y0 = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const u = i / steps, v = 1 - u;
        cur.push({ x: v * v * v * x0 + 3 * v * v * u * c.x1 + 3 * v * u * u * c.x2 + u * u * u * c.x, y: v * v * v * y0 + 3 * v * v * u * c.y1 + 3 * v * u * u * c.y2 + u * u * u * c.y });
      }
      x0 = c.x; y0 = c.y;
    } else if (c.type === 'Z') { cur.push({ x: sx, y: sy }); if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Draw the first `r` (0..1, by length) of a polyline; returns the head point. */
function drawPartial(lb: LineBatch, pts: P2[], r: number, tf: (p: P2) => P2, width: number, rgb: [number, number, number], alpha: number): P2 | null {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  let left = r * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, len = Math.hypot(b.x - a.x, b.y - a.y);
    const f = len > 0 ? Math.min(1, left / len) : 1;
    const e = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    const A = tf(a), E = tf(e);
    lb.seg2(A.x, A.y, E.x, E.y, width, rgb, alpha);
    left -= len;
    if (left <= 0) return e;
  }
  return pts[pts.length - 1] ?? null;
}
