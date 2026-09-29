// prompt1 ("ChatGPT, please don't eat me alive") — the plea is typed into the open gap of a replication
// fork. A zipped right-handed B-DNA enters from the left edge, unwinds and forks; the two separated
// strands run off the right edge above and below the words like shutters, bases exposed toward the
// text. They open for the plea, then close very slowly over it; the orange bracket waits over one
// unpaired base. On "alive" the helix untwists into the flat ladder diagram and every base lines up in
// register on the downbeat: the rung geometry the first chorus strikes.
// Pure function of song time.
import * as THREE from 'three';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, keys, lerp, noise2, prog, smoothstep, window01, type Key } from '../engine/util';
import {
  BDNA, Cam, HBONDS, PAIR, findWord, focusBracket, makeBackdrop, monoLabel, sequence, LIN, rgba,
  type Base, type Proj, type RGB,
} from './dna-kit';
import { Memo, typedRow, type Plate } from './dna-prompt-type';

const N = 150; // base pairs (bp 0 is near the camera, off the left edge)
const X0 = -14; // world x of bp 0 (nm); the axis runs along +x at y = z = 0
const XF = 14.5; // the fork, far away on the right: strands apart for x < XF, zipped beyond
const TUBE = 0.2, STUB = 0.17; // backbone tube and base slab widths, nm
/** Base (half-rung) length from the backbone, nm: purines (A, G) are two-ring, pyrimidines (C, T) one-ring; a pair spans 1.84. */
const baseLen = (b: Base) => (b === 'A' || b === 'G' ? 1.04 : 0.8);

interface BP { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; da: THREE.Vector3; db: THREE.Vector3; open: number; base: Base }

export class ForkPlate implements Plate {
  bg = makeBackdrop();
  bgMemo = new Memo();
  L = new LineBatch(14000, { screen2D: true, blend: 'normal' });
  text = new Layer2D();
  cam = new Cam(30);
  seq: Base[] = sequence(N, 17);
  line!: Line;
  tA = 0; tAlive = 0; tLock = 0; tEnd = 0; tS = 0;
  kRo: Key[] = [];
  bpBr = 0; // the bracketed base (strand 1)
  bps: BP[] = Array.from({ length: N }, () => ({
    a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(),
    da: new THREE.Vector3(), db: new THREE.Vector3(), open: 0, base: 'A' as Base,
  }));

  constructor(private ctx: SceneCtx) {}

  init() {
    const { lyrics, audio } = this.ctx;
    this.tS = this.ctx.start; this.tEnd = this.ctx.end;
    this.line = lyrics.get('ChatGPT, please');
    this.tAlive = findWord(this.line, 'alive').start;
    // the lock lands on the last downbeat before the cut (the chorus's first bar)
    this.tLock = audio.downbeats.filter((d) => d < this.tEnd - 0.1).pop() ?? this.tEnd - 0.45;
    this.tA = this.line.words[0]!.start;
    // shutters: open for the plea, then close very slowly over it, then settle into register
    this.kRo = [[this.tS, 2.75], [this.tS + 0.9, 3.5, ease.outCubic], [this.tAlive, 3.22, ease.inOutQuad], [this.tLock, 3.18, ease.inOutCubic]];
    // the bracket waits over an unpaired base on the top strand, right of the words
    this.bpBr = Math.round((9.0 - X0) / BDNA.rise);
    this.bps.forEach((q, i) => (q.base = this.seq[i]!));
  }

  /** Geometry at t. `flat` untwists everything into the ladder diagram. */
  private build(t: number, Ro: number, flat: number) {
    const tw = BDNA.twist * (1 - flat);
    const wob = (1 - flat) * smoothstep(this.tS, this.tS + 0.8, t);
    // unwinding: inside the fork the twist is spent (integrated from the fork outward, so no jumps)
    const ua = (x: number) => 1 - smoothstep(XF - 1.2, XF + 1.6, x);
    const iF = Math.round((XF - X0) / BDNA.rise);
    const theta = new Float64Array(N);
    theta[iF] = 0;
    for (let i = iF - 1; i >= 0; i--) theta[i] = theta[i + 1]! - tw * (1 - ua(X0 + (i + 0.5) * BDNA.rise));
    for (let i = iF + 1; i < N; i++) theta[i] = theta[i - 1]! + tw * (1 - ua(X0 + (i - 0.5) * BDNA.rise));
    const sway = 0.2 * wob;
    for (let i = 0; i < N; i++) {
      const q = this.bps[i]!;
      const x = X0 + i * BDNA.rise;
      const u = ua(x);
      const sep = 1 - smoothstep(XF - 4.2, XF + 0.6, x); // a long V: the strands part gradually from the fork
      const r = 1 + (Ro - 1) * ease.inOutQuad(sep);
      const th1 = theta[i]!, th2 = th1 + lerp(BDNA.minor, Math.PI, Math.max(u, flat));
      // the free strands sway slowly (they are unpaired and floppy)
      const s1 = sway * sep * noise2(x * 0.11, t * 0.23, 3), s2 = sway * sep * noise2(x * 0.11 + 40, t * 0.21, 5);
      const z1 = 0.9 * sway * sep * noise2(x * 0.07, t * 0.17, 9), z2 = 0.9 * sway * sep * noise2(x * 0.07 + 13, t * 0.19, 11);
      q.c.set(x, 0, 0);
      q.a.set(x, r * Math.cos(th1) + s1, r * Math.sin(th1) + z1);
      q.b.set(x, r * Math.cos(th2) + s2, r * Math.sin(th2) + z2);
      q.open = sep;
      // stubs point at the partner across the pair (a straight rung when closed); unpaired ones wobble a little
      const w = 0.22 * wob * sep;
      const my = (q.a.y + q.b.y) / 2, mz = (q.a.z + q.b.z) / 2;
      for (const [P, D, sd] of [[q.a, q.da, 1], [q.b, q.db, 2]] as const) {
        D.set(0, my - P.y, mz - P.z).normalize();
        const w1 = w * noise2(i * 0.37, t * 0.45, 20 + sd), w2 = w * 0.3 * noise2(i * 0.41, t * 0.4, 30 + sd);
        // rotate about the axis (x) by w1, lean along the axis by w2
        const cy = D.y, cz = D.z, c1 = Math.cos(w1), n1 = Math.sin(w1);
        D.set(w2, cy * c1 - cz * n1, cy * n1 + cz * c1).normalize();
      }
    }
  }

  private camera(t: number, flat: number) {
    // an oblique look down the corridor between the strands, drifting in; squares up on "alive"
    const k = prog(t, this.tS, this.tAlive, ease.inOutQuad);
    const yaw = lerp(-0.4, -0.35, k) * (1 - flat);
    const pitch = lerp(0.07, 0.05, k) * (1 - flat);
    const dist = lerp(lerp(22, 20.8, k), 21, flat);
    this.cam.orbit({ x: lerp(4, 4.6, flat), y: 0, z: 0 }, yaw, pitch, dist);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const flat = prog(t, this.tAlive + 0.05, this.tLock, ease.inOutCubic);
    const Ro = keys(t, this.kRo);
    this.camera(t, flat);
    this.build(t, Ro, flat);

    // the ink backdrop never changes: drawn once
    const bgTex = this.bgMemo.get('ink', (rt) => { this.bg.u.uPaper!.value = 0; this.bg.u.uPool!.value = 0; this.bg.render(renderer, rt); });
    comp.draw(renderer, bgTex, out, { mode: 'replace' });

    const pc = this.drawStrands(t, flat);
    this.L.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    this.drawLetters(c, t, flat);
    this.drawBracket(c, t, pc);
    this.drawLabel(c, t);
    this.drawLyrics(c, t, f.beat);
    comp.draw(renderer, this.text.upload(), out);
    const lockHit = t >= this.tLock ? Math.pow(0.5, (t - this.tLock) / 0.08) : 0;
    return { bloom: 0.4, bloomThreshold: 0.9, vignette: 0.45, ca: 0.5, zoom: 1 + 0.0025 * (f.a.kick ?? 0) + 0.006 * lockHit };
  }

  // ------------------------------------------------------------------ strands (painter's sorted)
  private drawStrands(t: number, flat: number): Proj[] {
    const L = this.L, cam = this.cam, bps = this.bps;
    L.clear();
    const col = LIN.bone, ink = LIN.ink;
    const light = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
    type Item = { d: number; f: () => void };
    const items: Item[] = [];
    const pc = bps.map((q) => cam.proj(q.c.x, q.c.y, q.c.z));
    const fogRef = cam.proj(0, 0, 0).w;
    const fog = (w: number) => lerp(1, 0.45, smoothstep(-2, 6, w - fogRef));
    const shadeT = (d: THREE.Vector3) => 0.32 + 0.68 * Math.sqrt(Math.max(0, 1 - (d.dot(light) / Math.max(1e-6, d.length())) ** 2));
    const appear = 1; // a hard cut: the previous plate's graph edges became these strands
    const tube = (p: Proj, q: Proj, w0: THREE.Vector3, w1: THREE.Vector3) => {
      const d = new THREE.Vector3().subVectors(w1, w0);
      const sh = shadeT(d) * fog((p.w + q.w) / 2);
      const wpx = Math.max(1.2, TUBE * (p.s + q.s) / 2);
      items.push({
        d: (p.w + q.w) / 2, f: () => {
          const dl = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          let ux = -(q.y - p.y) / dl, uy = (q.x - p.x) / dl; // unit normal, flipped to point down the screen
          if (uy < 0) { ux = -ux; uy = -uy; }
          const h = wpx / 2;
          // an engraved cylinder lit from above: shadow tone, lit band, highlight, hatching in the shadow
          const s0 = sh * 0.5, hl = Math.min(1.05, sh * 1.22);
          L.seg2(p.x, p.y, q.x, q.y, wpx, [col[0] * s0, col[1] * s0, col[2] * s0], appear);
          L.seg2(p.x - ux * h * 0.3, p.y - uy * h * 0.3, q.x - ux * h * 0.3, q.y - uy * h * 0.3, wpx * 0.66, [col[0] * sh, col[1] * sh, col[2] * sh], appear);
          L.seg2(p.x - ux * h * 0.5, p.y - uy * h * 0.5, q.x - ux * h * 0.5, q.y - uy * h * 0.5, wpx * 0.16, [col[0] * hl, col[1] * hl, col[2] * hl], appear);
          if (wpx > 6) {
            const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
            L.seg2(mx + ux * h * 0.42, my + uy * h * 0.42, mx + ux * h * 0.95, my + uy * h * 0.95, 1.05, ink, 0.7 * appear);
          }
          L.seg2(p.x + ux * (h + 0.5), p.y + uy * (h + 0.5), q.x + ux * (h + 0.5), q.y + uy * (h + 0.5), 1.4, ink, 0.9 * appear);
          L.seg2(p.x - ux * (h + 0.5), p.y - uy * (h + 0.5), q.x - ux * (h + 0.5), q.y - uy * (h + 0.5), 1.3, ink, 0.9 * appear);
        },
      });
    };
    // backbones, interpolated around the axis between base pairs
    const sub = 3;
    const P = new THREE.Vector3(), prev = new THREE.Vector3(), ra = new THREE.Vector3(), rb = new THREE.Vector3(), r = new THREE.Vector3();
    for (const strand of [0, 1]) {
      for (let i = 0; i < N - 1; i++) {
        const A = strand === 0 ? bps[i]!.a : bps[i]!.b, B = strand === 0 ? bps[i + 1]!.a : bps[i + 1]!.b;
        const C0 = bps[i]!.c, C1 = bps[i + 1]!.c;
        prev.copy(A);
        let pp = cam.proj(prev.x, prev.y, prev.z);
        ra.subVectors(A, C0); rb.subVectors(B, C1);
        const la = ra.length(), lb = rb.length();
        const qa = ra.clone().normalize(), qb = rb.clone().normalize();
        const ang = Math.acos(clamp(qa.dot(qb), -1, 1));
        for (let k = 1; k <= sub; k++) {
          const u = k / sub;
          if (ang > 1e-4) {
            const sa = Math.sin((1 - u) * ang) / Math.sin(ang), sb = Math.sin(u * ang) / Math.sin(ang);
            r.copy(qa).multiplyScalar(sa).addScaledVector(qb, sb).setLength(lerp(la, lb, u));
          } else r.copy(ra).lerp(rb, u);
          P.copy(C0).lerp(C1, u).add(r);
          const pq = cam.proj(P.x, P.y, P.z);
          tube(pp, pq, prev.clone(), P.clone());
          prev.copy(P); pp = pq;
        }
      }
    }
    // bases: a short glycosidic stem and an outlined slab (purines longer than pyrimidines, so every pair
    // spans the same width); where the pair is closed, hydrogen-bond ticks: A·T two, G·C three
    const slab = (P: THREE.Vector3, D: THREE.Vector3, len: number, sh: number, open: number): { d: number; tip: Proj } => {
      const p0 = cam.proj(P.x, P.y, P.z);
      const m = P.clone().addScaledVector(D, 0.2), e = P.clone().addScaledVector(D, len);
      const pm = cam.proj(m.x, m.y, m.z), pe = cam.proj(e.x, e.y, e.z);
      const d = (p0.w + pe.w) / 2;
      const w = Math.max(1.6, STUB * (pm.s + pe.s) / 2);
      const fsh = sh * fog(d);
      items.push({
        d: d + 0.04, f: () => {
          if (open < 0.5 || w < 5) {
            // paired (or small): a plain rung half, as in the kit's helix
            L.seg2(p0.x, p0.y, pe.x, pe.y, Math.max(1.3, w * 0.7), [col[0] * fsh, col[1] * fsh, col[2] * fsh], appear);
            return;
          }
          // engraved: a bone stem, then the base ring as a dark slab outlined in bone hairline
          L.seg2(p0.x, p0.y, pm.x, pm.y, Math.max(1.2, w * 0.28), [col[0] * fsh, col[1] * fsh, col[2] * fsh], appear);
          const dl = Math.hypot(pe.x - pm.x, pe.y - pm.y) || 1, ux = (pe.x - pm.x) / dl, uy = (pe.y - pm.y) / dl;
          const nx = -uy * w / 2, ny = ux * w / 2, cap = Math.min(w / 2, dl / 2 - 0.01);
          const ax = pm.x + ux * cap, ay = pm.y + uy * cap, bx = pe.x - ux * cap, by = pe.y - uy * cap;
          L.seg2(ax, ay, bx, by, w, [ink[0] * 1.6, ink[1] * 1.6, ink[2] * 1.6], appear);
          const lc: RGB = [col[0] * fsh, col[1] * fsh, col[2] * fsh], lw = Math.max(1.1, w * 0.12);
          L.seg2(pm.x + nx, pm.y + ny, pe.x + nx, pe.y + ny, lw, lc, appear);
          L.seg2(pm.x - nx, pm.y - ny, pe.x - nx, pe.y - ny, lw, lc, appear);
          L.seg2(pe.x + nx, pe.y + ny, pe.x - nx, pe.y - ny, lw, lc, appear);
          L.seg2(pm.x + nx, pm.y + ny, pm.x - nx, pm.y - ny, lw, lc, appear);
        },
      });
      return { d, tip: pe };
    };
    bps.forEach((q) => {
      const bA = q.base, bB = PAIR[q.base];
      const A = slab(q.a, q.da, baseLen(bA), 0.66, q.open), B = slab(q.b, q.db, baseLen(bB), 0.56, q.open);
      const ea = q.a.clone().addScaledVector(q.da, baseLen(bA)), eb = q.b.clone().addScaledVector(q.db, baseLen(bB));
      const gap = ea.distanceTo(eb);
      const tick = (1 - smoothstep(0.25, 0.6, gap)) * appear;
      if (tick > 0.01) {
        const nH = HBONDS[q.base];
        const ta = A.tip, tb = B.tip;
        const rx = tb.x - ta.x, ry = tb.y - ta.y, rl = Math.hypot(rx, ry) || 1, nx = -ry / rl, ny = rx / rl;
        const tl = Math.max(2.5, STUB * ta.s * 0.6), sh = 0.72 * fog((A.d + B.d) / 2);
        items.push({
          d: (A.d + B.d) / 2 + 0.02, f: () => {
            for (let k = 0; k < nH; k++) {
              const u = (k + 1) / (nH + 1), cx = lerp(ta.x, tb.x, u), cy = lerp(ta.y, tb.y, u);
              L.seg2(cx - nx * tl, cy - ny * tl, cx + nx * tl, cy + ny * tl, 1.1, [col[0] * sh, col[1] * sh, col[2] * sh], 0.9 * tick);
            }
          },
        });
      }
    });
    items.sort((x, y) => y.d - x.d);
    for (const it of items) it.f();
    void flat;
    return pc;
  }

  /** Base letters at the tips of the exposed stubs (the sequence reads along both shutters). */
  private drawLetters(c: CanvasRenderingContext2D, t: number, flat: number) {
    const cam = this.cam;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const appear = smoothstep(this.tS, this.tS + 0.45, t);
    for (let i = 0; i < N; i++) {
      const q = this.bps[i]!;
      const al = appear * smoothstep(0.55, 0.9, q.open);
      if (al <= 0.01) continue;
      for (const [P, D, B] of [[q.a, q.da, q.base], [q.b, q.db, PAIR[q.base]]] as const) {
        const e = P.clone().addScaledVector(D, 1.34);
        const p = cam.proj(e.x, e.y, e.z);
        if (p.x < -20 || p.x > W + 20) continue;
        c.font = font(F.mono(500), clamp(0.25 * p.s, 10, 30));
        const fogA = lerp(1, 0.5, smoothstep(-2, 6, p.w - cam.proj(0, 0, 0).w));
        c.fillStyle = rgba('bone', 0.72 * al * fogA);
        c.fillText(B, p.x, p.y);
      }
    }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    void flat;
  }

  private drawBracket(c: CanvasRenderingContext2D, t: number, _pc: Proj[]) {
    const q = this.bps[this.bpBr]!;
    const e = q.a.clone().addScaledVector(q.da, 1.34);
    const p = this.cam.proj(e.x, e.y, e.z);
    const a = smoothstep(this.tS + 0.25, this.tS + 0.6, t);
    // it waits: a slow breath on the half-bars, a small settle when the bases lock
    const b = this.ctx.audio.beatAt(t);
    const breathe = 1 + 0.06 * Math.pow(1 - (b / 2 - Math.floor(b / 2)), 6);
    focusBracket(c, p.x, p.y, { size: 17 * breathe, alpha: a });
  }

  private drawLabel(c: CanvasRenderingContext2D, t: number) {
    const i = Math.round((2.0 - X0) / BDNA.rise);
    const q = this.bps[i]!;
    const e = q.b.clone().addScaledVector(q.db, -0.25);
    const p = this.cam.proj(e.x, e.y, e.z);
    const a = window01(t, this.tS + 1.0, findWord(this.line, 'eat').start, 0.35, 0.4);
    monoLabel(c, 'separated strands · unpaired bases', p.x + 150, p.y + 78, p.x, p.y + 6, a);
  }

  private drawLyrics(c: CanvasRenderingContext2D, t: number, beat: number) {
    const w = this.line.words;
    const x = 236;
    typedRow(c, w.slice(0, 1), x, 512, F.archivo(100, 900), 168, t, 1, { caret: 1, beat });
    typedRow(c, w.slice(1), x + 4, 646, F.archivo(100, 800), 104, t, 1, { caret: 1, beat });
  }
}
void H;
