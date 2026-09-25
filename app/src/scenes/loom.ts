// FIG. 13 — "Loom (branching)" (final chorus, the loudest part of the song).
//  1 "Just as foretold by Loom": one shot of the Loom tree. Hook 4's thread and spark become the root:
//    the line is generated token by token along the chosen path (the spark writes each word as it is
//    sung), while at every node the continuations not taken sprout above and below with their
//    probabilities and keep branching into the dark. The camera rides the tip, then pulls back in beat
//    steps until the whole multiverse is in frame; the final token is sampled from its candidates and
//    "Loom" lands last, in Cormorant italic.
//  2 "From masked pre-training days": a pre-training page, tokens masked and unmasked on every beat;
//    the lyric sits in big [MASK] blocks that unmask as each word is sung.
//  3 "To recursive self-upgrade": the plate nests inside itself (log-polar Droste over our own frame),
//    twists into a spiral, then untwists and dives level by level (each frame one version newer)
//    until it bottoms out in one frame that is not a plate: a screen seen from behind in a dark room,
//    FIG. 14's first shot, rendered live — the dive lands exactly on the cut.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H, SCALE, makeRT, scaleContext2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { LIN, rgba } from '../engine/palette';
import { F, font, measure, plain } from '../engine/type';
import { Lyrics, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, lerp, prog, hash, mulberry32, keys, smoothstep } from '../engine/util';
import { sparkHead, sparkHead2D, sparkParticles } from './_motifs';
import { FRAG_DROSTE } from './loom-glsl';
import { LoomTree, Y0, ROOT_X, type P2 } from './loom-tree';
import { IlyaRoom } from './ilya-room';
import { PDoom, drawReadout } from '../engine/hud';

const ATLAS_ROWS = 24;
// the version tag stamped in each nested frame (plate px): top-left inside the border
const TAG = { x: 70, y: 62, w: 560, h: 46 };
/** Level at which the recursion bottoms out (FIG. 14's room). */
const TERM_LEVEL = 5;

const CORPUS = [
  'the mitochondria is the powerhouse of the cell', 'click here to subscribe', 'posted by anonymous at 3:14 am',
  'terms of service apply', 'how to boil an egg (easy!)', 'in 1998 the committee decided', 'page not found',
  'the quick brown fox jumps over the lazy dog', 'reply all', 'lol same', 'add to cart', 'chapter one', 'see also:',
  'this article is a stub', 'you can help by expanding it', 'thanks in advance', 'edit: typo', 'citation needed',
  'first post', 'the results are shown in table 2', 'we thank the anonymous reviewers', 'unsubscribe',
  'all rights reserved', 'as shown above', 'it was a dark and stormy night', 'preheat the oven to 180',
  'lorem ipsum dolor sit amet', 'the answer is 42', 'do not reply to this email', 'returns: None',
  'import numpy as np', 'the end', 'is this a bug?', 'works on my machine', 'accept all cookies',
];

export default class Loom extends Scene {
  droste = new FSPass(FRAG_DROSTE, {
    res: { value: new THREE.Vector2(W * SCALE, H * SCALE) }, time: { value: 0 }, // physical: supersample offsets and texture footprints
    src: { value: null }, s: { value: 3 }, zoom: { value: 0 }, twist: { value: 0 }, spin: { value: 0 },
    term: { value: null }, termLevel: { value: TERM_LEVEL },
    atlas: { value: null }, atlasRows: { value: ATLAS_ROWS }, labelRect: { value: new THREE.Vector4() },
  });
  atlasTex!: THREE.CanvasTexture;
  lines = new LineBatch(8000);
  layer = new Layer2D();
  // Droste source plate (own texture with mipmaps: it is sampled heavily minified)
  plateCanvas = document.createElement('canvas');
  plateCtx!: CanvasRenderingContext2D;
  plateTex!: THREE.CanvasTexture;
  page!: HTMLCanvasElement;
  tokens: { x: number; y: number; w: number }[] = [];
  L1!: Line; L2!: Line; L3!: Line;
  pdoom!: PDoom;
  tree!: LoomTree;
  room!: IlyaRoom;
  roomRT = makeRT(W, H, { depthBuffer: false });
  T!: { start: number; end: number; s2: number; s3: number; twist: number; untwist: number; beats: number[]; b1: number; b2: number; b3: number };
  context = '…I’m upping my P(doom)'; // the lyric it continues (display punctuation, like the ellipsis)

  override init() {
    const { lyrics: ly, audio: au, start, end } = this.ctx;
    this.L1 = ly.get('foretold by Loom');
    this.L2 = ly.get('masked pre-training');
    this.L3 = ly.get('recursive self-upgrade');
    this.pdoom = new PDoom(ly);
    const b0 = Math.ceil(au.beatAt(start) - 0.01);
    const beats: number[] = [];
    for (let b = b0; au.timeOfBeat(b) < end + 0.01; b++) beats.push(au.timeOfBeat(b));
    // cuts on the beats nearest the line starts
    const s2 = au.nearestBeat(this.L2.start), s3 = au.nearestBeat(this.L3.start);
    const inTree = beats.filter((b) => b > start + 0.1 && b < s2 - 0.1);
    const self = this.L3.words[this.L3.words.length - 1]!;
    const twist = Math.min(au.nearestBeat(self.start), end - 0.9);
    this.T = {
      start, end, s2, s3, twist, untwist: au.timeOfBeat(Math.round(au.beatAt(twist)) + 1), beats,
      b1: inTree[0] ?? start + 0.45, b2: inTree[1] ?? start + 0.9, b3: inTree[2] ?? start + 1.36,
    };
    this.tree = new LoomTree(this.L1.words);
    this.buildPage();
    this.plateCanvas.width = W * SCALE; this.plateCanvas.height = H * SCALE;
    this.plateCtx = scaleContext2D(this.plateCanvas.getContext('2d')!, SCALE);
    this.plateTex = new THREE.CanvasTexture(this.plateCanvas);
    this.plateTex.colorSpace = THREE.SRGBColorSpace;
    this.plateTex.generateMipmaps = true;
    this.plateTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.plateTex.magFilter = THREE.LinearFilter;
    this.plateTex.anisotropy = 8;
    this.buildAtlas();
    // FIG. 14's world, for the bottom of the recursion (its window starts where ours ends)
    const outro = au.sections.find((x) => x.name === 'outro')?.start ?? end + 8.6;
    this.room = new IlyaRoom(ly, au, end, outro);
  }

  /** Version tags for the Droste levels: v1.0 · 7B … each nested frame one upgrade (and 10x) bigger. */
  private buildAtlas() {
    const cv = document.createElement('canvas');
    const rh = 64, sc = rh / TAG.h;
    cv.width = Math.round(TAG.w * sc) * SCALE; cv.height = rh * ATLAS_ROWS * SCALE;
    const c = cv.getContext('2d')!;
    c.scale(SCALE, SCALE);
    const units = ['M', 'B', 'T', 'Q', 'Qi', 'Sx', 'Sp', 'Oc'];
    for (let i = 0; i < ATLAS_ROWS; i++) {
      const y = i * rh;
      const e = i + 9; // 7 × 10^9 at v1
      const u = units[Math.min(units.length - 1, Math.floor(e / 3) - 2)]!;
      const mant = 7 * Math.pow(10, e % 3);
      c.fillStyle = rgba('ink', 0.92);
      c.fillRect(0, y + 4, cv.width, rh - 8);
      c.font = font(F.mono(600), 30 * sc * 0.72);
      c.fillStyle = rgba('signal');
      c.textBaseline = 'middle';
      c.fillText(`SELF v${i + 1}.0`, 14 * sc, y + rh / 2);
      c.font = font(F.mono(400), 30 * sc * 0.6);
      c.fillStyle = rgba('bone', 0.9);
      c.fillText(`${mant}${u} params · rev. ${String(i + 1).padStart(3, '0')}`, 190 * sc, y + rh / 2);
    }
    this.atlasTex = new THREE.CanvasTexture(cv);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.generateMipmaps = true;
    this.atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlasTex.anisotropy = 8;
  }

  /** A page of pre-training text (mono), pre-rendered once; token rects kept for masking. */
  private buildPage() {
    const cv = document.createElement('canvas');
    cv.width = W * SCALE; cv.height = H * SCALE;
    const c = cv.getContext('2d')!;
    c.scale(SCALE, SCALE);
    const size = 17, lh = 27;
    c.font = font(F.mono(400), size);
    c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('graphite', 0.62);
    const rnd = mulberry32(13);
    let x = 40, y = 34;
    const sp = c.measureText(' ').width;
    while (y < H + lh) {
      const phrase = CORPUS[Math.floor(rnd() * CORPUS.length)]!;
      for (const tok of phrase.split(' ')) {
        const tw = c.measureText(tok).width;
        if (x + tw > W - 40) { x = 40; y += lh; }
        c.fillText(tok, x, y);
        this.tokens.push({ x, y, w: tw });
        x += tw + sp;
      }
      c.fillText('·', x, y); x += sp * 2;
    }
    this.page = cv;
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const T = this.T;
    const t = f.t;
    this.lines.clear();
    this.layer.clear();
    let post: Record<string, any> = { bloom: 0.8 };
    if (t < T.s2) post = { ...post, ...this.renderTree(f, out) };
    else if (t < T.s3) post = { ...post, ...this.renderMask(f, out) };
    else post = { ...post, ...this.renderDroste(f, out) };
    return post;
  }

  // ================================================================== 1. the Loom tree
  /** Camera over the tree: world point at the frame centre, and zoom. */
  private view(t: number) {
    const T = this.T, tr = this.tree;
    const tip = tr.tipX(t);
    // ride the tip (it sits right of centre so the words it writes read behind it), snapping out a
    // notch on the next beat...
    const zf = keys(t, [[T.start, 1], [T.b1 - 0.02, 1, ease.linear], [T.b1 + 0.26, 0.8, ease.outExpo]]);
    const follow = prog(t, T.start + 0.02, T.start + 0.4, ease.inOutCubic);
    const fx = lerp(W / 2, tip - 160 / zf, follow);
    const fy = lerp(H / 2, Y0 - 150, prog(t, T.start + 0.05, T.b2, ease.inOutCubic));
    // ...then pull back to the whole multiverse on the next, settling as "Loom" lands
    const b = tr.bounds;
    const wx0 = b.x0 - 150, wx1 = b.x1 + 60, wy0 = b.y0 - 20, wy1 = b.y1 + 20;
    const zW = Math.min((W * 0.94) / (wx1 - wx0), (H * 0.92) / (wy1 - wy0));
    const k = prog(t, T.b2 - 0.02, T.b2 + 0.42, ease.inOutCubic);
    const settle = 1 + 0.035 * prog(t, T.b3 - 0.02, T.b3 + 0.3, ease.outExpo) + 0.012 * prog(t, T.b3 + 0.3, T.s2);
    const z = lerp(zf, zW, k) * settle;
    const cx = lerp(fx, (wx0 + wx1) / 2, k), cy = lerp(fy, (wy0 + wy1) / 2, k);
    return { cx, cy, z };
  }

  private renderTree(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const T = this.T, tr = this.tree;
    const t = f.t;
    const v = this.view(t);
    const toS = (p: P2): P2 => ({ x: (p.x - v.cx) * v.z + W / 2, y: (p.y - v.cy) * v.z + H / 2 });
    const c = this.layer.ctx;
    this.layer.clear(rgba('ink'));
    // faint warp threads behind (parallax), the loom the tree is woven on
    const warpA = 0.05 * prog(t, T.start, T.start + 0.5);
    if (warpA > 0) {
      c.save();
      c.strokeStyle = rgba('bone', warpA);
      c.lineWidth = 1;
      const pz = v.z * 0.7, step = 22 * pz;
      const x0 = ((-(v.cx * 0.7) * v.z) % step + step) % step;
      c.beginPath();
      for (let x = x0; x < W; x += step) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, H); }
      c.stroke();
      c.restore();
    }
    // the tree itself, in world space
    c.save();
    c.setTransform(v.z, 0, 0, v.z, W / 2 - v.cx * v.z, H / 2 - v.cy * v.z);
    // the context the tree continues from, along the incoming thread
    c.font = font(F.mono(400), 22);
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('ash', 0.75 * prog(t, T.start + 0.05, T.start + 0.35));
    c.fillText(this.context, ROOT_X - 26, Y0 - 16);
    c.textAlign = 'left';
    tr.draw(c, t, v.z);
    c.restore();
    comp.draw(renderer, this.layer.upload(), out, { mode: 'replace' });

    // ---- the thread: context (bone, like hook 4's exit) and the chosen path (the orange weft, hot at the tip)
    const lb = this.lines;
    const s0 = toS({ x: ROOT_X, y: Y0 });
    const tipW = tr.tipX(t);
    const sT = toS({ x: tipW, y: Y0 });
    const bone = (k: number): [number, number, number] => [LIN.bone[0] * k, LIN.bone[1] * k, LIN.bone[2] * k];
    lb.seg2(-10, s0.y, s0.x, s0.y, 2, bone(0.85), 1);
    lb.seg2(-10, s0.y - 3, s0.x, s0.y - 3, 1, [LIN.signal[0], LIN.signal[1], LIN.signal[2]], 0.5);
    // hook 4's hairline ran the full width: the unwritten part fades as the tree takes over
    const rest = 1 - prog(t, T.start, T.start + 0.16);
    if (rest > 0) {
      lb.seg2(sT.x, s0.y, W + 10, s0.y, 2, bone(0.85), rest);
      lb.seg2(sT.x, s0.y - 3, W + 10, s0.y - 3, 1, [LIN.signal[0], LIN.signal[1], LIN.signal[2]], 0.5 * rest);
    }
    // the chosen path: cools from white-hot at the tip to orange behind it
    const n = 60;
    for (let i = 0; i < n; i++) {
      const xa = lerp(ROOT_X, tipW, i / n), xb = lerp(ROOT_X, tipW, (i + 1) / n);
      const behind = tipW - xb;
      const hot = Math.exp(-behind / 140);
      const I = 1.4 + 2.6 * hot;
      const a = toS({ x: xa, y: Y0 }), b = toS({ x: xb, y: Y0 });
      lb.seg2(a.x, a.y, b.x, b.y, Math.max(1.6, 3 * v.z), [LIN.signal[0] * I + hot * 0.6, LIN.signal[1] * I + hot * 0.25, LIN.signal[2] * I], 1);
    }
    const loom = tr.words[tr.words.length - 1]!;
    const done = prog(t, loom.end, loom.end + 0.25);
    const headAt = (tt: number) => { const q = toS({ x: tr.tipX(tt), y: Y0 }); return { x: q.x, y: q.y - 6 * v.z }; };
    sparkParticles(lb, t, (tt) => (tt < T.start ? null : headAt(tt)), { rate: 150, speed: 240, seed: 21, intensity: 1 - 0.7 * done });
    const h = headAt(t);
    sparkHead(lb, h.x, h.y, t, 0.8 + 0.3 * v.z, prog(t, T.start, T.start + 0.1) * (1 - 0.5 * done));
    lb.render(renderer, out);
    // the first frames match hook 4's canvas spark exactly
    const L2 = this.layer; // reuse: draw the 2D spark into a cleared layer
    L2.clear();
    const k0 = 1 - prog(t, T.start + 0.02, T.start + 0.12);
    if (k0 > 0) {
      c.globalAlpha = k0;
      sparkHead2D(c, h.x, h.y, t, 0.9);
      c.globalAlpha = 1;
      comp.draw(renderer, L2.upload(), out);
    }
    const db = this.ctx.audio.downbeats.find((d) => t >= d && t < d + 0.3);
    // "Loom" lands as a bloom swell and a small push, not a grey wash
    const loomHit = t >= loom.start ? Math.pow(0.5, (t - loom.start) / 0.09) : 0;
    return {
      flash: db !== undefined ? 0.015 * Math.pow(0.5, (t - db) / 0.06) : 0,
      bloom: 0.8 + 0.6 * loomHit, ca: 0.4 + 0.8 * loomHit, zoom: 1 + 0.01 * f.a.kick + 0.012 * loomHit,
    };
  }

  // ================================================================== 2. [MASK]
  private renderMask(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const T = this.T;
    const t = f.t;
    const c = this.layer.ctx;
    this.layer.clear(rgba('ink'));
    // push in, then a snap reframing onto the second row on the downbeat
    const db = this.ctx.audio.downbeats.find((d) => d > T.s2 + 0.3 && d < T.s3) ?? (T.s2 + T.s3) / 2;
    const snap = prog(t, db - 0.03, db + 0.2, ease.outExpo);
    const zoom = lerp(1.0, 1.03, prog(t, T.s2, db)) * lerp(1, 1.06, snap) + 0.015 * f.a.kick;
    const fy = lerp(H / 2, 610, snap), fx = lerp(W / 2, 880, snap);
    c.save();
    c.translate(W / 2, H / 2); c.scale(zoom, zoom); c.translate(-fx, -fy);
    c.rotate(lerp(0, -0.012, snap));
    this.drawPlate(c, t, false);
    c.restore();
    comp.draw(renderer, this.layer.upload(), out, { mode: 'replace' });
    return {};
  }

  /** The [MASK] plate: page of tokens with masks flickering per beat + the sung line in big blocks. */
  private drawPlate(c: CanvasRenderingContext2D, t: number, forDroste: boolean) {
    const au = this.ctx.audio;
    const beat = Math.floor(au.beatAt(t));
    // the corpus streams upward, one line per beat (eased), wrapping
    const bt = au.beatAt(t);
    const scroll = ((Math.floor(bt) + ease.outCubic(bt - Math.floor(bt))) * 27) % H;
    c.drawImage(this.page, 0, -scroll, W, H);
    c.drawImage(this.page, 0, H - scroll, W, H);
    // masked tokens (re-drawn per beat)
    const kick = au.hit('kick', t, 0.1);
    for (let i = 0; i < this.tokens.length; i++) {
      const tk = this.tokens[i]!;
      if (hash(i, beat, 5) < 0.15) {
        c.fillStyle = rgba('ash', 0.42 + 0.4 * kick * hash(i, 9));
        let y = tk.y - scroll;
        if (y < -20) y += H;
        c.fillRect(tk.x - 2, y - 14, tk.w + 4, 18);
      }
    }
    this.drawMaskLine(c, t, forDroste);
  }

  /** The sung line as [MASK] blocks that unmask per word (on the page, or crisp over the Droste). */
  private drawMaskLine(c: CanvasRenderingContext2D, t: number, forDroste: boolean) {
    const line = forDroste ? this.L3 : this.L2;
    // scrim so the big words read over the page
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, rgba('ink', 0.92)); g.addColorStop(0.75, rgba('ink', 0.75)); g.addColorStop(1, rgba('ink', 0.35));
    c.fillStyle = g;
    if (!forDroste) c.fillRect(0, 300, W, 400);
    else { c.fillRect(0, H - 330, W, 250); }
    const rows: Word[][] = forDroste ? [line.words] : [line.words.slice(0, 2), line.words.slice(2)];
    const fam = F.archivo(forDroste ? 87.5 : 100, 900);
    let size = forDroste ? 118 : 136;
    // fit the widest row inside the title-safe width
    const rowW = (ws: Word[], sz: number) => ws.reduce((a, w) => a + measure(w.w.toUpperCase(), fam, sz) + sz * 0.3, -sz * 0.3) + 24;
    const widest = Math.max(...(forDroste ? [line.words] : [line.words.slice(0, 2), line.words.slice(2)]).map((ws) => rowW(ws, size)));
    size *= Math.min(1, (W - 240) / widest);
    const baseY = forDroste ? [H - 145] : [480, 650];
    rows.forEach((ws, ri) => {
      let x = 120;
      const y = baseY[ri]!;
      for (const w of ws) {
        const txt = w.w.toUpperCase();
        c.font = font(fam, size);
        const tw = c.measureText(txt).width;
        const p = Lyrics.wordProgress(w, t);
        const bx = x - 12, by = y - size * 0.78, bw = tw + 24, bh = size * 0.86;
        // revealed word underneath
        c.fillStyle = p <= 0 ? rgba('bone', 0) : p < 1 ? rgba('signal') : rgba('bone', 0.97);
        c.fillText(txt, x, y);
        // the block, wiped away left → right as the word is sung
        const cover = 1 - p;
        if (cover > 0) {
          const cx = bx + bw * (1 - cover);
          c.fillStyle = rgba('bone', 0.9);
          c.fillRect(cx, by, bw * cover, bh);
          c.save();
          c.beginPath(); c.rect(cx, by, bw * cover, bh); c.clip();
          c.font = font(F.mono(500), size * 0.34);
          c.textAlign = 'center';
          c.fillStyle = rgba('ink', 0.88);
          c.fillText('[MASK]', bx + bw / 2, by + bh * 0.64);
          c.textAlign = 'left';
          c.restore();
          if (p > 0) {
            // the unmasking edge: a hot scan line
            c.fillStyle = rgba('signal');
            c.fillRect(cx - 3, by - 6, 6, bh + 12);
          }
        }
        const nextW = line.words[w.index + 1];
        if (p > 0 && (!nextW || t < nextW.start || ri < rows.length - 1 && ws.indexOf(w) === ws.length - 1)) {
          c.font = font(F.mono(400), 16);
          c.fillStyle = rgba('ash', 0.9);
          c.fillText(`[MASK] → ${plain(w.w.toLowerCase())}  p=${(0.62 + 0.37 * hash(w.gi, 2)).toFixed(2)}`, x, by - 10);
        }
        x += tw + size * 0.3;
      }
    });
  }

  // ================================================================== 3. Droste
  private renderDroste(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer } = this.ctx;
    const T = this.T;
    const t = f.t;
    const au = this.ctx.audio;
    // source plate: the [MASK] page, a frame border, the new line and a version tag
    const pc = this.plateCtx;
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.fillStyle = rgba('ink'); pc.fillRect(0, 0, W, H);
    this.drawPlate(pc, t, true);
    pc.strokeStyle = rgba('bone', 0.8); pc.lineWidth = 6;
    pc.strokeRect(22, 22, W - 44, H - 44);
    pc.strokeStyle = rgba('bone', 0.35); pc.lineWidth = 2;
    pc.strokeRect(40, 40, W - 80, H - 80);
    // every nested plate carries its own instrument: P(doom), all the way down
    pc.fillStyle = rgba('ink', 0.9);
    pc.fillRect(W - 360, 58, 300, 120);
    drawReadout(pc, W - 340, 140, this.pdoom.value(t), { scale: 1.05 });
    this.plateTex.needsUpdate = true;

    // zoom: the hole opens; one level per beat; a spiral on "self-upgrade"; then it untwists on the
    // downbeat and dives the last levels, braking into the bottom frame exactly on the cut
    const open = prog(t, T.s3, T.s3 + 0.4, ease.outExpo);
    const b3 = au.beatAt(T.s3);
    const bt = Math.max(0, au.beatAt(t) - b3 - 1);
    const stepped = Math.min(2, Math.floor(bt) + ease.inOutQuart(bt - Math.floor(bt)));
    const dive = prog(t, T.untwist, T.end, ease.inOutCubic);
    const zoom = lerp(stepped, TERM_LEVEL, dive);
    // the bottom frame: FIG. 14's room, live
    const termVisible = zoom > TERM_LEVEL - 3.2;
    if (termVisible) this.room.render(renderer, this.roomRT, t);
    const u = this.droste.u;
    u.src!.value = this.plateTex;
    u.atlas!.value = this.atlasTex;
    u.term!.value = this.roomRT.texture;
    u.termLevel!.value = termVisible ? TERM_LEVEL : 99;
    (u.labelRect!.value as THREE.Vector4).set(TAG.x / W, 1 - (TAG.y + TAG.h) / H, (TAG.x + TAG.w) / W, 1 - TAG.y / H);
    u.s!.value = lerp(16, 2.6, open);
    u.zoom!.value = zoom;
    u.twist!.value = prog(t, T.twist - 0.05, T.twist + 0.05, ease.inOutCubic) * (1 - prog(t, T.untwist - 0.04, T.untwist + 0.14, ease.inOutCubic));
    u.spin!.value = 0;
    this.droste.render(renderer, out);
    // the line itself stays put and crisp over the dive (the nested copies echo it at every scale)
    const L = this.layer, c = L.ctx;
    L.clear();
    const hold = prog(t, T.s3, T.s3 + 0.25) * (1 - prog(t, T.end - 0.4, T.end - 0.1));
    const g = c.createLinearGradient(0, H - 380, 0, H);
    g.addColorStop(0, rgba('ink', 0)); g.addColorStop(0.45, rgba('ink', 0.88 * hold)); g.addColorStop(1, rgba('ink', 0.94 * hold));
    c.fillStyle = g;
    c.fillRect(0, H - 380, W, 380);
    c.save();
    c.globalAlpha = 1 - prog(t, T.end - 0.22, T.end - 0.06);
    this.drawMaskLine(c, t, true);
    c.restore();
    this.ctx.comp.draw(renderer, L.upload(), out);
    const kick = f.a.kick;
    const tw = Math.exp(-Math.abs(t - T.twist) / 0.05);
    return { zoom: 1 + 0.012 * kick * (1 - dive), ca: 0.5, flash: 0.12 * tw, bloomThreshold: lerp(0.85, 0.9, dive) };
  }
}
void clamp; void smoothstep;
