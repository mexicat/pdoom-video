// prompt3 ("Gato, please don't let me go") — the song's softest passage (a breakdown, no drums), so the
// plate barely moves. A schematic agarose gel on a large black field: a size ladder and two sample
// lanes. Lane 2 lacks one band; the EMPTY orange focus bracket waits at that band's expected place
// (motif step "Wait": the base deleted in the previous scene left its bracket around nothing).
// An explicitly schematic assay: not a claim that a gel resolves a one-base deletion.
//  88.870: the previous scene's sequence brackets have lengthened into lanes; the lanes draw down from
//          the wells while "Without a single CDR" finishes (its held R runs to 89.280).
//  "Gato, please": the bands resolve, top to bottom; the empty bracket settles at the gap.
//  "don't let me go": hold; a slow push toward the gap.
// Pure function of song time.
import * as THREE from 'three';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { F } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { ease, lerp, prog, smoothstep, window01 } from '../engine/util';
import { focusBracket, monoLabel, rgba } from './dna-kit';
import { Memo, typedRow, type Plate } from './dna-prompt-type';

// gel geometry (logical px, y down)
const LANES = [420, 572, 724]; // ladder, sample 1, sample 2
const LANE_HW = 46;
const WELL_Y = 214;
const Y_TOP = 268, Y_BOT = 872; // 2000 bp .. 100 bp (log mobility)
const SIZES = [2000, 1500, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];
const S1 = [1200, 650, 320], S2 = [1200, 320]; // lane 2 lacks the 650 bp band
const GAP_BP = 650;
const MAXB = 24;
const yOf = (bp: number) => Y_TOP + ((Math.log10(2000) - Math.log10(bp)) / (Math.log10(2000) - Math.log10(100))) * (Y_BOT - Y_TOP);

const GEL = /* glsl */ `
uniform vec4 uB[${MAXB}]; // x, y, half width, sigma y
uniform float uA[${MAXB}]; // intensity
uniform int uN;
uniform float uLane; uniform float uSlab; uniform float uLaneY;
void main() {
  vec2 q = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 p = (vUv - 0.5) * vec2(16.0 / 9.0, 1.0);
  vec3 c = C_INK + C_INK2 * 0.35 * (1.0 - smoothstep(0.1, 1.0, length(p)));
  // the slab: a barely lighter field with a soft agarose grain, lit from the lanes
  vec2 sl = vec2(${(LANES[0]! - 120).toFixed(1)}, ${(LANES[2]! + 120).toFixed(1)});
  float slab = smoothstep(sl.x - 1.5, sl.x + 1.5, q.x) * (1.0 - smoothstep(sl.y - 1.5, sl.y + 1.5, q.x))
             * smoothstep(${(WELL_Y - 44).toFixed(1)}, ${(WELL_Y - 40).toFixed(1)}, q.y) * (1.0 - smoothstep(930.0, 934.0, q.y));
  if (q.x < sl.x - 40.0 || q.x > sl.y + 40.0 || q.y < ${(WELL_Y - 80).toFixed(1)} || q.y > 970.0) { fragColor = vec4(c, 1.0); return; }
  float grain = fbm(q * 0.018, 3) * 0.5 + 0.5;
  c += C_INK2 * (0.55 + 0.25 * grain) * slab * uSlab;
  // lanes: a faint smear where DNA ran (drawn down from the wells)
  float lane = 0.0;
  ${LANES.map((x, i) => `lane += (1.0 - smoothstep(${(LANE_HW - 6).toFixed(1)}, ${(LANE_HW + 2).toFixed(1)}, abs(q.x - ${x.toFixed(1)}))) * ${i === 0 ? '0.6' : '1.0'};`).join('\n  ')}
  float run = smoothstep(${WELL_Y.toFixed(1)}, ${(WELL_Y + 30).toFixed(1)}, q.y) * (1.0 - smoothstep(uLaneY - 40.0, uLaneY, q.y));
  c += C_ASH * 0.018 * lane * run * uLane * (0.7 + 0.3 * grain);
  // bands: soft gaussian bars with a slight smile, and a wide faint glow
  float acc = 0.0, glow = 0.0;
  for (int i = 0; i < ${MAXB}; i++) {
    if (i >= uN) break;
    vec4 b = uB[i];
    float dx = (q.x - b.x) / b.z;
    float edge = 1.0 - smoothstep(0.78, 1.0, abs(dx));
    float y = b.y - 3.0 * dx * dx;
    float dy = (q.y - y) / b.w;
    acc += uA[i] * exp(-dy * dy) * edge * (0.9 + 0.1 * grain);
    float gx = max(abs(q.x - b.x) - b.z * 0.8, 0.0);
    glow += uA[i] * exp(-(gx * gx + (q.y - y) * (q.y - y)) / (2.0 * 14.0 * 14.0));
  }
  c += C_BONE * (1.02 * acc + 0.06 * glow);
  fragColor = vec4(c, 1.0);
}`;

interface Band { x: number; y: number; hw: number; sig: number; a: number; t0: number }

export class GelPlate implements Plate {
  gel = new FSPass(GEL, {
    uB: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) },
    uA: { value: new Array(MAXB).fill(0) },
    uN: { value: 0 },
    uLane: { value: 0 }, uSlab: { value: 0 }, uLaneY: { value: WELL_Y },
  });
  text = new Layer2D();
  memo = new Memo();
  tStill = 0;
  prev!: Line; line!: Line;
  bands: Band[] = [];
  tS = 0; tG = 0; tDont = 0; tEnd = 0;

  constructor(private ctx: SceneCtx) {}

  init() {
    const { lyrics } = this.ctx;
    this.tS = this.ctx.start; this.tEnd = this.ctx.end;
    this.prev = lyrics.get('Without a single CDR');
    this.line = lyrics.get('Gato, please');
    this.tG = this.line.words[0]!.start;
    this.tDont = this.line.words[2]!.start;
    // the bands resolve top to bottom over "Gato," (the ladder first, then the samples)
    const mk = (x: number, bp: number, a: number, k: number, lane: number): Band => ({
      x, y: yOf(bp), hw: LANE_HW - 6, sig: bp >= 1000 ? 4.2 : 5.2, a, t0: this.tG - 0.25 + 0.06 * k + 0.12 * lane,
    });
    SIZES.forEach((bp, k) => this.bands.push(mk(LANES[0]!, bp, bp === 500 ? 1.15 : 0.62, k, 0)));
    S1.forEach((bp, k) => this.bands.push(mk(LANES[1]!, bp, 0.9, k * 3, 1)));
    S2.forEach((bp, k) => this.bands.push(mk(LANES[2]!, bp, 0.9, k * 3, 2)));
    // after the last band has resolved (and the lanes and slab are in) the gel is one constant image
    this.tStill = Math.max(this.tG + 0.2, this.tS + 0.6, ...this.bands.map((b) => b.t0 + 0.9));
  }

  private zoom(t: number) { return lerp(1, 1.035, prog(t, this.tG, this.tEnd, ease.inOutQuad)); }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    // (the lanes arrive as the previous scene's brackets, already long: they finish drawing down)
    const lanesK = lerp(0.35, 1, prog(t, this.tS, this.tG + 0.2, ease.outCubic));
    const tex = this.memo.get(t >= this.tStill ? 'gel' : null, (rt) => {
      const u = this.gel.u, tt = Math.min(t, this.tStill);
      const lk = lerp(0.35, 1, prog(tt, this.tS, this.tG + 0.2, ease.outCubic));
      u.uLane!.value = lk; u.uSlab!.value = prog(tt, this.tS, this.tS + 0.6);
      u.uLaneY!.value = lerp(WELL_Y + 30, Y_BOT + 40, lk);
      const B = u.uB!.value as THREE.Vector4[], A = u.uA!.value as number[];
      this.bands.forEach((b, i) => {
        // a band resolves from a soft blur into a sharp line
        const k = prog(tt, b.t0, b.t0 + 0.9, ease.outCubic);
        B[i]!.set(b.x, b.y, b.hw, b.sig * lerp(2.6, 1, k));
        A[i] = (b.a * k) / lerp(2.6, 1, k);
      });
      u.uN!.value = this.bands.length;
      this.gel.render(renderer, rt);
    });
    // a slow push toward the gap (the compositor zooms the gel image; the drawn marks follow exactly)
    const z = this.zoom(t), zc = { x: LANES[2]!, y: yOf(GAP_BP) };
    const cu = { x: zc.x / W, y: 1 - zc.y / H };
    comp.draw(renderer, tex, out, { mode: 'replace', scale: [1 / z, 1 / z], offset: [(cu.x - 0.5) * (1 - 1 / z), (cu.y - 0.5) * (1 - 1 / z)] });

    const c = this.text.ctx;
    this.text.clear();
    c.save();
    c.translate(zc.x, zc.y); c.scale(z, z); c.translate(-zc.x, -zc.y);
    this.drawWells(c, t, lanesK);
    this.drawBracket(c, t);
    this.drawLabel(c, t);
    c.restore();
    this.drawLyrics(c, t, f.beat);
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.45, bloomThreshold: 0.9, vignette: 0.55, grain: 0.055, ca: 0.4 };
  }

  private drawWells(c: CanvasRenderingContext2D, t: number, lanesK: number) {
    const a = 1;
    // lanes: the brackets from the previous scene, lengthened down the gel
    const yb = lerp(WELL_Y + 18, Y_BOT + 36, lanesK);
    for (const x of LANES) {
      c.fillStyle = rgba('ink', 0.95 * a);
      c.fillRect(x - LANE_HW + 4, WELL_Y - 7, (LANE_HW - 4) * 2, 14);
      c.strokeStyle = rgba('ash', 0.5 * a); c.lineWidth = 1;
      c.strokeRect(x - LANE_HW + 4.5, WELL_Y - 6.5, (LANE_HW - 4) * 2 - 1, 13);
      c.strokeStyle = rgba('graphite', 0.55 * a * (1 - 0.6 * smoothstep(0.6, 1, lanesK)));
      c.beginPath();
      for (const sx of [-1, 1]) {
        const xx = x + sx * (LANE_HW + 4);
        c.moveTo(xx - sx * 8, WELL_Y + 14); c.lineTo(xx, WELL_Y + 14); c.lineTo(xx, yb);
      }
      c.stroke();
    }
  }

  private drawBracket(c: CanvasRenderingContext2D, t: number) {
    // it was there before the bands: the expected place of the missing band. leftturn hands it over
    // at full opacity in exactly this place and size, so it is simply there from the first frame.
    focusBracket(c, LANES[2]!, yOf(GAP_BP), { size: 30, alpha: 1, empty: true });
  }

  private drawLabel(c: CanvasRenderingContext2D, t: number) {
    const a = window01(t, this.tG + 0.6, this.tDont + 0.9, 0.5, 0.6);
    monoLabel(c, 'gel electrophoresis · schematic', LANES[0]! - 104, 972, LANES[0]! - 60, yOf(300) + 4, a);
  }

  private drawLyrics(c: CanvasRenderingContext2D, t: number, beat: number) {
    const x = 900;
    // the carried-in line finishes its held "R", then leaves
    const aPrev = 1 - prog(t, this.prev.end + 0.12, this.prev.end + 0.7);
    if (aPrev > 0) typedRow(c, this.prev.words, x, 262, F.archivo(100, 700), 58, t, aPrev, { dim: 0.3 });
    const w = this.line.words;
    typedRow(c, w.slice(0, 2), x, 548, F.archivo(100, 700), 124, t, 1, { caret: 1, beat, dim: 0.26 });
    typedRow(c, w.slice(2), x + 2, 700, F.archivo(100, 700), 124, t, 1, { caret: 1, beat, dim: 0.26 });
  }
}
