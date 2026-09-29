// DNA edition, `shoggoth` slot (29.782–38.418; docs/DNA_VIDEO_PLAN.md, row `shoggoth`).
//  carry-in "…of shrooms": the polysome's circle becomes a circular scanning aperture (same place,
//      same size); the carried line finishes where it was.
//  "See through the shoggoth's": inside the aperture, a schematic icosahedral viral capsid over a
//      strip of host membrane with its receptors. A scan line sweeps the lens on "through the
//      shoggoth's": behind it the shell goes to wireframe and the packaged genome (a dsDNA spool)
//      shows: layers, shell then genome. Label `icosahedral capsid · schematic`.
//  "lies,": the capsid's spin locks with one vertex protein in profile, the one drawn in the host
//      receptor's glyph. A dashed copy of a host receptor lifts off the membrane into a loupe over it:
//      the binding cups coincide, the stalk and anchor do not. Stamp MOLECULAR MIMICRY. The held note
//      pulses the mismatch on the beats.
//  "with your shinigami eyes": cut on "shinigami" to paired apertures, two chromosome ends with
//      schematic TTAGGG repeat blocks and their 3' overhangs. On "eyes" each aperture blinks on alternate
//      beats and a repeat block is gone after each blink (a compressed sequence, no countdown).
//      Label `telomere dynamics · schematic`.
//  Instrumental: the two apertures merge into one inspection light that shrinks onto the spot where
//      the next slot (dna-fold) opens: its ribosome's exit tunnel, bracket waiting.
// Pure function of song time.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, lerp, ease, prog, window01 } from '../engine/util';
import { findWord, karaokeRow, monoLabel, rubberStamp, focusBracket, makeBackdrop } from './dna-kit';
import { ICO_V, ICO_F, axisAngle, mm, mv, alignRot, genomeSpool, glyph, REPEAT, BLOCK_W, type V3, type M3, type Pt } from './dna-shoggoth-geo';

// the capsid aperture sits where the room slot's polysome closed
const AP: Pt = { x: 1270, y: 540 };
const AP_R0 = 372, AP_R = 356;
const CAP: Pt = { x: 1252, y: 492 };
const CAP_R = 178;
const PERSP = 7;
const MIMIC = 5; // vertex index carrying the mimic protein
const MIMIC_DIR: V3 = [0.6, -0.66, 0.45]; // where it points when the spin locks (screen, y down, z to the viewer)
const SPIN_AX: V3 = [0.25, 1, 0.15];
const SPIN_W = 0.62;
const MEM_C: Pt = { x: AP.x, y: AP.y + 300 + 1400 }, MEM_R = 1400; // host membrane: a gentle arc
const LOUPE_R = 128;
// the eyes
const EYE_L: Pt = { x: 830, y: 640 }, EYE_R: Pt = { x: 1390, y: 640 }, EYE_RAD = 228;
// where dna-fold's first frame has its tunnel mouth and bracket
const FOLD_TUNNEL: Pt = { x: 560, y: 543 };
const LIGHT = normalize3([-0.5, -0.72, 0.55]);

function normalize3(v: V3): V3 { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

export default class DnaShoggothScene extends Scene {
  bg = makeBackdrop();
  art = new Layer2D();
  text = new Layer2D();

  lB!: Line; lS!: Line; lE!: Line; lNext!: Line;
  tSee = 0; tThrough = 0; tShog = 0; tLies = 0; tWith = 0; tShin = 0; tEyes = 0; tEyesEnd = 0;
  beats: number[] = [];
  rLock: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  genome: V3[] = [];
  gP: Pt[] = []; gZ: number[] = [];
  blinkL: number[] = []; blinkR: number[] = [];

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.lB = ly.get('with a bag of shrooms');
    this.lS = ly.get("See through the shoggoth's lies");
    this.lE = ly.get('with your shinigami eyes');
    this.lNext = ly.get('We had a stable training run');
    this.tSee = this.lS.words[0]!.start;
    this.tThrough = findWord(this.lS, 'through').start;
    this.tShog = findWord(this.lS, "shoggoth's").start;
    this.tLies = findWord(this.lS, 'lies,').start;
    this.tWith = this.lE.words[0]!.start;
    this.tShin = findWord(this.lE, 'shinigami').start;
    this.tEyes = findWord(this.lE, 'eyes').start;
    this.tEyesEnd = this.lE.end;
    for (let i = Math.ceil(au.beatAt(this.ctx.start) - 1e-3); au.timeOfBeat(i) < this.ctx.end + 0.5; i++) this.beats.push(au.timeOfBeat(i));
    // blinks on alternate beats of the held "eyes": left, right, left, right
    const bE = this.beats.filter((b) => b > this.tEyes + 0.3 && b < this.tEyesEnd - 0.2);
    bE.forEach((b, i) => (i % 2 === 0 ? this.blinkL : this.blinkR).push(b));
    this.blinkL = this.blinkL.slice(0, 2); this.blinkR = this.blinkR.slice(0, 2);
    this.rLock = alignRot(ICO_V[MIMIC]!, normalize3(MIMIC_DIR));
    this.genome = genomeSpool();
  }

  // ------------------------------------------------------------------ capsid pose
  private rot(t: number): M3 {
    // spin decelerates into the lock on "lies," (C1: linear, then quadratic into zero)
    const x = this.tLies - t;
    const E = x > 0.5 ? x - 0.25 : x > 0 ? x * x : 0;
    const drift = t > this.tLies + 1.6 ? -((t - this.tLies - 1.6) ** 2) * 0.12 : 0;
    return mm(axisAngle(SPIN_AX, -SPIN_W * E + drift), this.rLock);
  }
  private proj(v: V3, cx: number, cy: number, R: number): Pt & { z: number } {
    const k = PERSP / (PERSP - v[2]);
    return { x: cx + v[0] * R * k, y: cy + v[1] * R * k, z: v[2] };
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    this.bg.u.uPaper!.value = 0; this.bg.u.uPool!.value = 0;
    this.bg.render(renderer, out);

    const c = this.art.ctx;
    this.art.clear();
    if (t < this.tShin) this.drawCapsidShot(c, t);
    else this.drawEyesShot(c, t);
    c.setTransform(1, 0, 0, 1, 0, 0);
    comp.draw(renderer, this.art.upload(), out);

    this.drawText(t);
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.42, bloomThreshold: 0.9, vignette: 0.42, zoom: 1 + 0.003 * (f.a.kick ?? 0) };
  }

  // ------------------------------------------------------------------ the aperture (rim + reticle)
  private apertureField(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) {
    const g = c.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r);
    g.addColorStop(0, rgba('#1d1c1e', a)); g.addColorStop(1, rgba('#111113', a));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  private apertureRim(c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, t: number, clipOut?: { x: number; y: number; r: number }) {
    if (a <= 0.01) return;
    c.save();
    if (clipOut) {
      c.beginPath(); c.rect(0, 0, 1920, 1080); c.arc(clipOut.x, clipOut.y, clipOut.r, 0, Math.PI * 2, true); c.clip('evenodd');
    }
    c.strokeStyle = rgba('bone', 0.8 * a); c.lineWidth = 1.6;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    // reticle ticks outside the rim; the ring steps round a little on every beat
    const bi = this.beatIndex(t);
    const step = (Math.floor(bi) + ease.outCubic(clamp((bi % 1) * 4))) * (Math.PI / 90);
    c.strokeStyle = rgba('ash', 0.7 * a); c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 72; i++) {
      const an = step + (i / 72) * Math.PI * 2, L = i % 6 === 0 ? 12 : 5;
      c.moveTo(x + Math.cos(an) * (r + 5), y + Math.sin(an) * (r + 5));
      c.lineTo(x + Math.cos(an) * (r + 5 + L), y + Math.sin(an) * (r + 5 + L));
    }
    c.stroke();
    c.restore();
  }
  private beatIndex(t: number) {
    const au = this.ctx.audio;
    return au.beatAt(t);
  }

  // ------------------------------------------------------------------ shot 1: the capsid
  private drawCapsidShot(c: CanvasRenderingContext2D, t: number) {
    const r = lerp(AP_R0, AP_R, prog(t, this.ctx.start, this.ctx.start + 0.36, ease.outCubic));
    const open = prog(t, this.ctx.start, this.ctx.start + 0.16, ease.outCubic); // the field lights up inside the circle
    c.save();
    c.beginPath(); c.arc(AP.x, AP.y, r, 0, Math.PI * 2); c.clip();
    this.apertureField(c, AP.x, AP.y, r, 1);
    const R = this.rot(t);
    // scan: sweeps left → right across the lens on "through the shoggoth's"; behind it the shell is seen through
    const scanX = lerp(AP.x - r - 20, AP.x + r + 20, prog(t, this.tThrough, this.tLies - 0.08, ease.inOutQuad));
    const reclose = prog(t, this.tLies - 0.02, this.tLies + 0.22, ease.inOutCubic);
    const see = (t >= this.tThrough ? 1 : 0) * (1 - reclose);
    this.drawMembrane(c, t, open);
    this.drawCapsid(c, t, R, scanX, see, open);
    if (see > 0 && scanX > AP.x - r && scanX < AP.x + r) {
      const g = c.createLinearGradient(scanX - 60, 0, scanX + 4, 0);
      g.addColorStop(0, rgba('bone', 0)); g.addColorStop(1, rgba('bone', 0.12 * see));
      c.fillStyle = g; c.fillRect(scanX - 60, AP.y - r, 64, r * 2);
      c.fillStyle = rgba('bone', 0.9 * see); c.fillRect(scanX - 0.8, AP.y - r, 1.6, r * 2);
    }
    c.restore();
    this.apertureRim(c, AP.x, AP.y, r, 1, t);
    // the loupe on the mimic, after "lies,"
    this.drawLoupe(c, t, R);
  }

  private drawMembrane(c: CanvasRenderingContext2D, t: number, a: number) {
    // lipid bilayer: two arcs with head-group dots, receptors standing on it
    const angs = [-0.11, 0, 0.11];
    for (const [dr, al] of [[0, 0.7], [16, 0.5]] as const) {
      c.strokeStyle = rgba('bone', al * a); c.lineWidth = 1.3;
      c.beginPath(); c.arc(MEM_C.x, MEM_C.y, MEM_R - dr, -Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3); c.stroke();
    }
    c.fillStyle = rgba('ash', 0.6 * a);
    for (let i = -60; i <= 60; i++) {
      const an = -Math.PI / 2 + i * 0.0048;
      for (const dr of [-3, 19]) { const rr = MEM_R + dr; c.fillRect(MEM_C.x + Math.cos(an) * rr - 1, MEM_C.y + Math.sin(an) * rr - 1, 2, 2); }
    }
    angs.forEach((da, i) => {
      const an = -Math.PI / 2 + da;
      const x = MEM_C.x + Math.cos(an) * MEM_R, y = MEM_C.y + Math.sin(an) * MEM_R;
      c.save(); c.translate(x, y); c.rotate(an + Math.PI / 2);
      glyph(c, 'receptor', 1, 0.9 * a, { fill: '#1b1a1c' });
      c.restore();
    });
  }

  private drawCapsid(c: CanvasRenderingContext2D, t: number, R: M3, scanX: number, see: number, a: number) {
    const V = ICO_V.map((v) => mv(R, v));
    const P = V.map((v) => this.proj(v, CAP.x, CAP.y, CAP_R));
    const faces = ICO_F.map((fc, i) => {
      const a0 = V[fc[0]]!, b0 = V[fc[1]]!, c0 = V[fc[2]]!;
      const n = normalize3([(b0[1] - a0[1]) * (c0[2] - a0[2]) - (b0[2] - a0[2]) * (c0[1] - a0[1]), (b0[2] - a0[2]) * (c0[0] - a0[0]) - (b0[0] - a0[0]) * (c0[2] - a0[2]), (b0[0] - a0[0]) * (c0[1] - a0[1]) - (b0[1] - a0[1]) * (c0[0] - a0[0])]);
      return { i, fc, n, z: (a0[2] + b0[2] + c0[2]) / 3 };
    });
    // the see-through side of the scan: wireframe, genome, every protein
    if (see > 0.01) {
      c.save();
      c.beginPath(); c.rect(0, 0, scanX, 1080); c.clip();
      c.strokeStyle = rgba('ash', 0.35 * see * a); c.lineWidth = 1;
      c.beginPath();
      for (const fz of faces) for (let k = 0; k < 3; k++) { const p = P[fz.fc[k]!]!, q = P[fz.fc[(k + 1) % 3]!]!; c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
      c.stroke();
      this.drawGenome(c, R, see * a);
      for (let i = 0; i < 12; i++) this.drawProtein(c, V, P, i, 0.9 * see * a, t);
      c.restore();
    }
    // the opaque side
    c.save();
    if (see > 0.01) { c.beginPath(); c.rect(scanX, 0, 1920 - scanX, 1080); c.clip(); }
    for (let i = 0; i < 12; i++) if (V[i]![2] < 0.1) this.drawProtein(c, V, P, i, 0.75 * a, t);
    faces.filter((fz) => fz.n[2] > 0).sort((p, q) => p.z - q.z).forEach((fz) => this.drawFace(c, V, P, fz.fc, fz.n, a));
    for (let i = 0; i < 12; i++) if (V[i]![2] >= 0.1) this.drawProtein(c, V, P, i, 0.95 * a, t);
    c.restore();
  }

  private drawFace(c: CanvasRenderingContext2D, V: V3[], P: Pt[], fc: number[], n: V3, a: number) {
    const p0 = P[fc[0]!]!, p1 = P[fc[1]!]!, p2 = P[fc[2]!]!;
    const lam = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const v = 0.08 + 0.92 * Math.pow(lam, 1.6);
    c.save();
    c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.closePath();
    c.fillStyle = rgba('#161518', a); c.fill();
    c.clip();
    // engraved hatch, one direction per plane (along the face's first edge), denser where lit
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const step = lerp(8.5, 3.4, v);
    const cx = (p0.x + p1.x + p2.x) / 3, cy = (p0.y + p1.y + p2.y) / 3;
    c.strokeStyle = rgba('bone', lerp(0.16, 0.7, v) * a); c.lineWidth = 1;
    c.beginPath();
    for (let o = -CAP_R; o <= CAP_R; o += step) {
      const px = cx + nx * o, py = cy + ny * o;
      c.moveTo(px - dx * CAP_R, py - dy * CAP_R); c.lineTo(px + dx * CAP_R, py + dy * CAP_R);
    }
    c.stroke();
    c.restore();
    // capsomers: three hexamers per face (in the face's plane, so they foreshorten), pentamers at the vertices
    const A = V[fc[0]!]!, B = V[fc[1]!]!, C = V[fc[2]!]!;
    const e1 = normalize3([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
    const e2 = normalize3([n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]);
    const ring = (ctr: V3, rr: number, sides: number, rot: number) => {
      c.beginPath();
      for (let k = 0; k <= sides; k++) {
        const an = rot + (k / sides) * Math.PI * 2;
        const q: V3 = [ctr[0] + (e1[0] * Math.cos(an) + e2[0] * Math.sin(an)) * rr, ctr[1] + (e1[1] * Math.cos(an) + e2[1] * Math.sin(an)) * rr, ctr[2] + (e1[2] * Math.cos(an) + e2[2] * Math.sin(an)) * rr];
        const p = this.proj(q, CAP.x, CAP.y, CAP_R);
        if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
      }
      c.stroke();
    };
    c.strokeStyle = rgba('bone', lerp(0.3, 0.8, v) * a); c.lineWidth = 1.1;
    for (const [wa, wb, wc] of [[0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) {
      const q: V3 = [A[0] * wa + B[0] * wb + C[0] * wc, A[1] * wa + B[1] * wb + C[1] * wc, A[2] * wa + B[2] * wb + C[2] * wc];
      ring(q, 0.115, 6, 0.3);
    }
    // edges
    c.strokeStyle = rgba('bone', 0.55 * a); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.closePath(); c.stroke();
  }

  private drawProtein(c: CanvasRenderingContext2D, V: V3[], P: Pt[], i: number, a: number, t: number) {
    const v = V[i]!, tip: V3 = [v[0] * 1.32, v[1] * 1.32, v[2] * 1.32];
    const b = P[i]!, q = this.proj(tip, CAP.x, CAP.y, CAP_R);
    const len = Math.hypot(q.x - b.x, q.y - b.y), full = CAP_R * 0.32 * (PERSP / (PERSP - v[2]));
    const fore = clamp(len / Math.max(1, full), 0.05, 1);
    const k = full / 64;
    c.save();
    c.translate(b.x, b.y); c.rotate(Math.atan2(q.y - b.y, q.x - b.x) + Math.PI / 2); c.scale(1, fore);
    const dim = v[2] < 0 ? 0.55 : 1;
    // pentamer base
    c.fillStyle = rgba('#1b1a1c', a); c.strokeStyle = rgba('bone', 0.7 * a * dim); c.lineWidth = 1.1;
    c.beginPath(); c.ellipse(0, 0, 9 * k, 5 * k, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    glyph(c, i === MIMIC ? 'mimic' : 'spike', k, a * dim, { fill: '#1b1a1c', lw: 1.5 });
    c.restore();
  }

  private drawGenome(c: CanvasRenderingContext2D, R: M3, a: number) {
    const G = this.genome;
    if (this.gP.length !== G.length) { this.gP = G.map(() => ({ x: 0, y: 0 })); this.gZ = G.map(() => 0); }
    for (let i = 0; i < G.length; i++) {
      const v = mv(R, G[i]!), p = this.proj(v, CAP.x, CAP.y, CAP_R);
      this.gP[i]!.x = p.x; this.gP[i]!.y = p.y; this.gZ[i] = v[2];
    }
    // depth-cued in a few bands: far strands dim, near strands bright
    c.lineWidth = 1.5; c.lineJoin = 'round';
    for (let band = 0; band < 4; band++) {
      const z0 = -1 + band * 0.5, z1 = z0 + 0.5;
      c.strokeStyle = rgba('bone', a * lerp(0.2, 0.85, band / 3));
      c.beginPath();
      let pen = false;
      for (let i = 0; i < G.length; i++) {
        const z = this.gZ[i]!;
        if (z >= z0 && z < z1) {
          if (!pen) { const p = this.gP[Math.max(0, i - 1)]!; c.moveTo(p.x, p.y); pen = true; }
          c.lineTo(this.gP[i]!.x, this.gP[i]!.y);
        } else pen = false;
      }
      c.stroke();
    }
  }

  private drawLoupe(c: CanvasRenderingContext2D, t: number, R: M3) {
    const aL = prog(t, this.tLies + 0.1, this.tLies + 0.28, ease.outCubic) * (1 - prog(t, this.tShin - 0.02, this.tShin));
    const fly = prog(t, this.tLies, this.tLies + 0.3, ease.inOutCubic);
    if (aL <= 0.01 && fly <= 0) return;
    const v = mv(R, ICO_V[MIMIC]!);
    const b = this.proj(v, CAP.x, CAP.y, CAP_R);
    const tip = this.proj([v[0] * 1.32, v[1] * 1.32, v[2] * 1.32], CAP.x, CAP.y, CAP_R);
    const mid = { x: (b.x + tip.x) / 2, y: (b.y + tip.y) / 2 };
    // the loupe sits beside the mimic, nudged outward off the shell: a specimen comparison, upright
    const ox = mid.x - CAP.x, oy = mid.y - CAP.y, ol = Math.hypot(ox, oy) || 1;
    const lc = { x: mid.x + (ox / ol) * 40, y: mid.y + (oy / ol) * 40 };
    const KK = 2.6, dx = 42, baseY = lc.y + 78;
    const slotL = { x: lc.x - dx, y: baseY }, slotR = { x: lc.x + dx, y: baseY };
    const rx = MEM_C.x, ry = MEM_C.y - MEM_R; // the middle receptor on the membrane
    const r = LOUPE_R * lerp(0.6, 1, aL);
    if (aL > 0.01) {
      // registration: a dashed path from the receptor it was compared with
      c.save();
      c.setLineDash([2, 5]); c.strokeStyle = rgba('ash', 0.5 * aL); c.lineWidth = 1;
      const dl = Math.hypot(rx - lc.x, ry - lc.y);
      c.beginPath(); c.moveTo(rx, ry - 66); c.quadraticCurveTo((rx + lc.x) / 2 + 120, (ry + lc.y) / 2, lc.x + (rx - lc.x) * r / dl, lc.y + (ry - lc.y) * r / dl);
      c.stroke();
      c.restore();
      c.save();
      c.beginPath(); c.arc(lc.x, lc.y, r, 0, Math.PI * 2);
      c.fillStyle = rgba('#141315', 0.97 * aL); c.fill();
      c.clip();
      // the pair: host receptor (left, ash) and the viral mimic (right, bone), residue barcodes drawn
      const pulse = this.beats.filter((x) => x > this.tLies + 0.3 && x < this.tWith).reduce((sm, x) => Math.max(sm, t >= x ? Math.pow(0.5, (t - x) / 0.14) : 0), 0);
      if (fly >= 1) { c.save(); c.translate(slotL.x, slotL.y); glyph(c, 'receptor', KK, aL, { color: 'ash', fill: '#1b1a1c', lw: 1.8, detail: true }); c.restore(); }
      c.save(); c.translate(slotR.x, slotR.y); glyph(c, 'mimic', KK, aL, { fill: '#1b1a1c', lw: 1.8, detail: true }); c.restore();
      // the binding cups register exactly: guides run straight across both
      c.strokeStyle = rgba('bone', (0.45 + 0.45 * pulse) * aL); c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath();
      for (const u of [49, 53, 57]) { const y = baseY - u * KK; c.moveTo(slotL.x - 34, y); c.lineTo(slotR.x + 34, y); }
      c.stroke();
      c.setLineDash([]);
      c.restore();
      c.strokeStyle = rgba('bone', 0.85 * aL); c.lineWidth = 1.5;
      c.beginPath(); c.arc(lc.x, lc.y, r, 0, Math.PI * 2); c.stroke();
    }
    // the copy lifted off the membrane, flying into the loupe's left slot
    if (fly > 0 && fly < 1) {
      const x = lerp(rx, slotL.x, fly), y = lerp(ry, slotL.y, fly) - Math.sin(Math.PI * fly) * 70;
      c.save(); c.translate(x, y);
      glyph(c, 'receptor', lerp(1, KK, fly), 0.9, { color: 'ash', dash: [3, 3] });
      c.restore();
    }
  }

  // ------------------------------------------------------------------ shot 2: the eyes, then the merge
  private drawEyesShot(c: CanvasRenderingContext2D, t: number) {
    const tE = this.ctx.end;
    const m1 = prog(t, this.tEyesEnd + 0.05, this.tEyesEnd + 0.62, ease.inOutCubic); // the pair slide together
    const m2 = prog(t, this.tEyesEnd + 0.64, tE - 0.1, ease.inOutCubic); // one light settles on the tunnel
    const xm = (EYE_L.x + EYE_R.x) / 2;
    const blink = (bs: number[]) => bs.reduce((s, b) => s * (1 - 0.92 * Math.sin(Math.PI * prog(t, b - 0.075, b + 0.075))), 1);
    const grow = lerp(0.82, 1, prog(t, this.tShin, this.tShin + 0.14, ease.outCubic));
    const contentA = 1 - prog(t, this.tEyesEnd + 0.3, this.tEyesEnd + 0.64);
    const endA = prog(t, this.tEyesEnd + 0.6, tE - 0.2, ease.inOutQuad); // the next slot's surface under the light
    const rimA = 1 - prog(t, tE - 0.4, tE - 0.12);
    if (m2 <= 0) {
      const eyes = [
        { x: lerp(EYE_L.x, xm, m1), y: EYE_L.y, r: EYE_RAD * grow * blink(this.blinkL), bs: this.blinkL },
        { x: lerp(EYE_R.x, xm, m1), y: EYE_R.y, r: EYE_RAD * grow * blink(this.blinkR), bs: this.blinkR },
      ];
      eyes.forEach((e, i) => {
        c.save();
        c.beginPath(); c.arc(e.x, e.y, e.r, 0, Math.PI * 2); c.clip();
        this.apertureField(c, e.x, e.y, e.r, 1);
        if (contentA > 0.01) this.drawTelomeres(c, t, e.x, e.y, e.bs, contentA, i);
        c.restore();
      });
      this.apertureRim(c, eyes[0]!.x, eyes[0]!.y, eyes[0]!.r, rimA, t, eyes[1]);
      this.apertureRim(c, eyes[1]!.x, eyes[1]!.y, eyes[1]!.r, rimA, t, eyes[0]);
      return;
    }
    // one inspection light: it shrinks onto the tunnel mouth and its edge softens into a pool
    const x = lerp(xm, FOLD_TUNNEL.x, m2), y = lerp(EYE_L.y, FOLD_TUNNEL.y, m2), r = lerp(EYE_RAD, 128, m2);
    const soft = prog(t, tE - 0.45, tE - 0.1, ease.inOutQuad);
    c.save();
    c.beginPath(); c.rect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4); c.clip();
    this.apertureField(c, x, y, r * 1.05, 1);
    // the inspection light itself: a little brighter than the lens it was
    const gl = c.createRadialGradient(x - r * 0.2, y - r * 0.25, 0, x, y, r);
    gl.addColorStop(0, rgba('bone', 0.07)); gl.addColorStop(1, rgba('bone', 0));
    c.fillStyle = gl; c.fillRect(x - r, y - r, r * 2, r * 2);
    if (endA > 0.01) this.drawFoldHint(c, endA);
    // the light's edge: hard while it is an aperture, soft once it is a pool
    c.globalCompositeOperation = 'destination-in';
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(clamp(1 - 0.62 * soft - 0.004, 0, 0.995), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4);
    c.globalCompositeOperation = 'source-over';
    c.restore();
    this.apertureRim(c, x, y, r, rimA * (1 - soft), t);
  }

  /** Two sister-chromatid ends in one aperture: chromatin, repeat duplex, 3' overhang (x1.2, schematic). */
  private drawTelomeres(c: CanvasRenderingContext2D, t: number, x: number, y: number, bs: number[], a: number, which: number) {
    c.save();
    c.translate(x, y); c.scale(1.1, 1.1);
    // each blink takes a block off one of the two ends, alternately (the rows start at different lengths)
    const rows = [{ dy: -54, n0: which === 0 ? 4 : 3, own: [] as number[] }, { dy: 54, n0: which === 0 ? 3 : 4, own: [] as number[] }];
    bs.forEach((b, i) => rows[(i + which) % 2]!.own.push(b));
    for (const row of rows) this.drawEnd(c, t, row.dy, row.n0, row.own, a);
    c.restore();
  }
  private drawEnd(c: CanvasRenderingContext2D, t: number, y: number, n0: number, bs: number[], a: number) {
    const x0 = -140;
    let lost = 0, leaving = false, leaveP = 0;
    for (const b of bs) {
      const p = prog(t, b, b + 0.3, ease.outCubic);
      if (p >= 1) lost++; else if (p > 0) { leaving = true; leaveP = p; }
    }
    const n = n0 - lost;
    const tipX = x0 + n * BLOCK_W - (leaving ? ease.inOutCubic(leaveP) * BLOCK_W : 0);
    // chromatin: a hatched, rounded rod entering from the left
    const rod = new Path2D();
    rod.moveTo(-420, y - 38); rod.lineTo(x0 - 26, y - 38); rod.arc(x0 - 26, y, 38, -Math.PI / 2, Math.PI / 2); rod.lineTo(-420, y + 38); rod.closePath();
    c.fillStyle = rgba('#1a191b', a); c.fill(rod);
    c.save(); c.clip(rod);
    c.strokeStyle = rgba('bone', 0.34 * a); c.lineWidth = 1 / 1.1;
    c.beginPath();
    for (let o = -520; o < 160; o += 5.5) { c.moveTo(o, y - 42); c.lineTo(o + 84, y + 42); }
    c.stroke();
    c.restore();
    c.strokeStyle = rgba('bone', 0.7 * a); c.lineWidth = 1.3 / 1.1; c.stroke(rod);
    // the repeat duplex
    const top = y - 11, bot = y + 11;
    c.strokeStyle = rgba('bone', 0.88 * a); c.lineWidth = 1.5 / 1.1;
    c.beginPath(); c.moveTo(x0 - 40, top); c.lineTo(tipX, top); c.moveTo(x0 - 40, bot); c.lineTo(tipX, bot); c.stroke();
    c.strokeStyle = rgba('ash', 0.7 * a); c.lineWidth = 1 / 1.1;
    c.beginPath();
    for (let px = x0 + BLOCK_W / 12; px < tipX - 2; px += BLOCK_W / 6) { c.moveTo(px, top + 3); c.lineTo(px, bot - 3); }
    c.stroke();
    c.font = font(F.mono(500), 14); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * BLOCK_W;
      const dep = leaving && i === n - 1;
      const al = dep ? a * (1 - leaveP) : a;
      const dx = dep ? leaveP * 44 : 0, dy = dep ? (y < 0 ? -1 : 1) * leaveP * 16 : 0;
      c.strokeStyle = rgba('bone', 0.5 * al); c.lineWidth = 1 / 1.1;
      c.beginPath(); c.moveTo(bx + dx, top - 17 + dy); c.lineTo(bx + dx, bot + 17 + dy); c.stroke();
      c.fillStyle = rgba('bone', 0.94 * al); c.fillText(REPEAT, bx + BLOCK_W / 2 + dx, top - 11 + dy);
      c.fillStyle = rgba('ash', 0.62 * al); c.fillText('AATCCC', bx + BLOCK_W / 2 + dx, bot + 12 + dy);
      if (dep) {
        c.strokeStyle = rgba('bone', 0.8 * al); c.lineWidth = 1.5 / 1.1;
        c.beginPath(); c.moveTo(bx + dx, top + dy); c.lineTo(bx + BLOCK_W + dx, top + dy); c.moveTo(bx + dx, bot + dy); c.lineTo(bx + BLOCK_W + dx, bot + dy); c.stroke();
      }
    }
    // the 3' G-rich overhang: the top strand alone runs on one more repeat
    c.strokeStyle = rgba('bone', 0.88 * a); c.lineWidth = 1.5 / 1.1;
    c.beginPath(); c.moveTo(tipX, top);
    for (let i = 1; i <= 12; i++) { const u = i / 12; c.lineTo(tipX + u * 54, top + u * u * 11); }
    c.stroke();
    c.fillStyle = rgba('bone', 0.82 * a);
    c.save(); c.translate(tipX + 29, top - 10); c.rotate(0.14); c.fillText(REPEAT, 0, 0); c.restore();
    c.fillStyle = rgba('ash', 0.85 * a); c.font = font(F.mono(500), 11);
    c.fillText('3′', tipX + 60, top + 17);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  }

  /** Under the settling light: dna-fold's ribosome surface (hatched) and its exit-tunnel mouth. */
  private drawFoldHint(c: CanvasRenderingContext2D, a: number) {
    const x = FOLD_TUNNEL.x, y = FOLD_TUNNEL.y, R = 260;
    c.fillStyle = rgba('ink2', a); c.fillRect(x - R, y - R, R * 2, R * 2);
    c.strokeStyle = rgba('ash', 0.32 * a); c.lineWidth = 1;
    c.beginPath();
    for (let o = -R * 2; o <= R * 2; o += 7) { c.moveTo(x - R + o, y - R); c.lineTo(x + R + o, y + R); }
    c.stroke();
    c.strokeStyle = rgba('ash', 0.14 * a);
    c.beginPath();
    for (let o = -R * 2; o <= R * 2; o += 9.8) { c.moveTo(x - R + o, y + R); c.lineTo(x + R + o, y - R); }
    c.stroke();
    c.fillStyle = rgba('ink', a);
    c.beginPath(); c.ellipse(x + 1, y, 44, 28, -0.3, 0, Math.PI * 2); c.fill();
    c.strokeStyle = rgba('bone', 0.55 * a); c.lineWidth = 1.2; c.stroke();
  }

  // ------------------------------------------------------------------ lyrics, labels, stamp, bracket
  private drawText(t: number) {
    const c = this.text.ctx;
    this.text.clear();
    // carried in from the room slot, same place, same type
    const aB = 1 - prog(t, this.lB.end + 0.06, this.lB.end + 0.36);
    karaokeRow(c, this.lB.words.slice(0, 3), 130, 212, F.archivo(100, 700), 64, t, aB, { lead: 0.3 });
    karaokeRow(c, this.lB.words.slice(3), 130, 346, F.archivo(100, 900), 132, t, aB, { lead: 0.3 });
    // "See through the / shoggoth's lies," bottom left
    const aS = 1 - prog(t, this.lS.end + 0.05, Math.min(this.tShin, this.lS.end + 0.34));
    karaokeRow(c, this.lS.words.slice(0, 3), 130, 812, F.archivo(100, 700), 64, t, aS);
    karaokeRow(c, this.lS.words.slice(3), 130, 936, F.archivo(75, 900), 124, t, aS);
    // "with your / shinigami eyes" top left, over the eyes
    const aE = 1 - prog(t, this.tEyesEnd + 0.1, this.tEyesEnd + 0.5);
    karaokeRow(c, this.lE.words.slice(0, 2), 130, 212, F.archivo(100, 700), 64, t, aE);
    karaokeRow(c, this.lE.words.slice(2), 130, 346, F.archivo(100, 900), 132, t, aE);
    // dna-fold's first line anticipates exactly as it does there (so the cut doesn't pop it)
    karaokeRow(c, this.lNext.words, 130, 176, F.archivo(100, 700), 76, t, 1);

    // one annotation at a time
    const capA = window01(t, this.tSee - 0.05, this.tLies - 0.12, 0.25, 0.2);
    {
      const R = this.rot(t);
      const v = mv(R, ICO_V[2]!), p = this.proj(v, CAP.x, CAP.y, CAP_R * 0.8);
      monoLabel(c, 'icosahedral capsid · schematic', 1500, 190, p.x, p.y, capA);
    }
    rubberStamp(c, 'MOLECULAR MIMICRY', 1652, 150, t, { t0: this.tLies, size: 28, rot: -0.06, seed: 5, alpha: 0.92 * (1 - prog(t, this.tShin - 0.02, this.tShin)) });
    const telA = window01(t, this.tEyes - 0.2, this.tEyesEnd + 0.1, 0.3, 0.3);
    monoLabel(c, 'telomere dynamics · schematic', 1452, 962, EYE_R.x + 4, EYE_R.y + 72, telA);

    // the bracket waits where dna-fold's does
    const bA = prog(t, this.ctx.end - 0.3, this.ctx.end - 0.1, ease.outCubic);
    if (bA > 0) focusBracket(c, FOLD_TUNNEL.x, FOLD_TUNNEL.y, { size: 20, alpha: bA, dot: 0 });
  }
}

