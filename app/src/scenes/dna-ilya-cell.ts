// The dividing cell for the DNA edition's `ilya` scene (dna-ilya.ts): an engraved animal cell in mitosis
// seen in a circular microscope field. Schematic: eight chromosomes instead of a real karyotype, and the
// phases compressed into seconds.
//   metaphase  — sister-chromatid pairs aligned on the plate; kinetochore fibres from both poles,
//                interpolar fibres overlapping in the middle, astral rays toward the cortex;
//   anaphase   — the sisters separate and are drawn to opposite poles, centromere first (V shapes);
//                then the poles move apart and the cell elongates;
//   telophase  — a cleavage furrow pinches the middle; nuclear envelopes begin to re-form around the
//                two chromosome sets.
// Geometry is in field units (the field radius = 1), rotated so the spindle runs slightly uphill.
import { rgba } from '../engine/palette';
import { clamp, lerp, mulberry32, smoothstep } from '../engine/util';

export interface MitosisState {
  /** 0 metaphase → 1 chromatids at the poles. */
  ana: number;
  /** 0 → 1 anaphase B: poles apart, cell elongated. */
  elong: number;
  /** 0 → ~0.8 cleavage furrow depth. */
  furrow: number;
  /** 0 → 1 nuclear envelopes re-forming. */
  env: number;
  /** Song time, for the metaphase chromosomes' small oscillation. */
  t: number;
}

interface Chromo { v: number; len: number; f: number; tau: number; ph: number }
interface Neighbour { u: number; v: number; r: number; rot: number; nu: number; nv: number; nr: number; seed: number }

const PHI = -0.3; // spindle axis angle on screen
const cP = Math.cos(PHI), sP = Math.sin(PHI);

export class MitoticCell {
  chromos: Chromo[] = [];
  neigh: Neighbour[] = [];
  constructor(seed = 131) {
    const rnd = mulberry32(seed);
    // eight chromosomes along the plate, centromeres ~0.095 apart, the centre falling between two of them
    const vs = [-0.335, -0.24, -0.145, -0.048, 0.048, 0.145, 0.24, 0.335];
    for (const v of vs) {
      this.chromos.push({
        v: v + (rnd() - 0.5) * 0.016,
        len: lerp(0.078, 0.125, rnd()),
        f: lerp(0.25, 0.5, rnd()),
        tau: (rnd() - 0.5) * 1.2,
        ph: rnd() * 6.28,
      });
    }
    // interphase neighbours at the field's edge (above and below the plate, away from the spindle axis)
    for (const [ang, r] of [[1.3, 0.44], [2.25, 0.4], [-1.42, 0.46], [-2.3, 0.38], [0.62, 0.3]] as const) {
      const d = 1.22 + r * 0.2;
      this.neigh.push({ u: Math.cos(ang) * d, v: Math.sin(ang) * d, r, rot: rnd() * 3, nu: (rnd() - 0.5) * 0.15, nv: (rnd() - 0.5) * 0.15, nr: r * lerp(0.38, 0.46, rnd()), seed: Math.floor(rnd() * 1000) });
    }
  }

  /**
   * Draw into the current clip (the field). `R` is the field radius in px; `hatch` the engraving line
   * spacing in px (kept constant in px so the reflection in the eye does not turn to mush).
   */
  draw(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, st: MitosisState, o: { hatch?: number; alpha?: number } = {}) {
    const a = o.alpha ?? 1;
    if (a <= 0.001 || R < 2) return;
    const hp = o.hatch ?? 4.2;
    const X = (u: number, v: number) => cx + R * (u * cP - v * sP);
    const Y = (u: number, v: number) => cy + R * (u * sP + v * cP);
    const lw = (w: number) => Math.max(0.6, Math.min(w, w * R / 260));
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';

    // ---- neighbours (interphase), cropped by the field
    for (const nb of this.neigh) this.drawNeighbour(c, nb, X, Y, R, hp, a, lw);

    // ---- the dividing cell's outline (ellipse, elongating; the furrow pinches the middle)
    const A = lerp(0.72, 0.88, st.elong), B = lerp(0.66, 0.53, st.elong);
    const cell = new Path2D();
    const N = 120;
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * Math.PI * 2;
      const wob = 1 + 0.018 * Math.sin(3 * th + 1.1) + 0.012 * Math.sin(5 * th + 2.3);
      const u = Math.cos(th) * A * wob;
      let v = Math.sin(th) * B * wob;
      v *= 1 - st.furrow * Math.exp(-((u / 0.17) ** 2));
      const x = X(u, v), y = Y(u, v);
      k ? cell.lineTo(x, y) : cell.moveTo(x, y);
    }
    cell.closePath();
    c.fillStyle = `rgba(236,231,221,${0.9 * a})`; c.fill(cell);
    // engraved shade: diagonal lines, dense toward the lower right (light from the upper left)
    c.save(); c.clip(cell);
    const gr = c.createLinearGradient(cx - R * 0.5, cy - R * 0.5, cx + R * 0.6, cy + R * 0.6);
    gr.addColorStop(0, rgba('ink', 0)); gr.addColorStop(0.55, rgba('ink', 0.1 * a)); gr.addColorStop(1, rgba('ink', 0.42 * a));
    c.strokeStyle = gr; c.lineWidth = lw(0.9);
    c.beginPath();
    const ext = R * 0.95;
    for (let q = -ext * 2; q < ext * 2; q += hp) { c.moveTo(cx + q - ext, cy - ext); c.lineTo(cx + q + ext, cy + ext); }
    c.stroke();
    c.restore();
    // cortex: a firm line and a fainter one just inside it
    c.strokeStyle = rgba('ink', 0.85 * a); c.lineWidth = lw(1.6); c.stroke(cell);
    c.save(); c.translate(cx, cy); c.scale(0.965, 0.965); c.translate(-cx, -cy);
    c.strokeStyle = rgba('ink', 0.28 * a); c.lineWidth = lw(1); c.stroke(cell);
    c.restore();

    // ---- spindle
    const U = lerp(0.46, 0.62, st.elong); // pole position along the axis
    const poles = [-1, 1];
    // astral rays toward the cortex
    c.strokeStyle = rgba('ink', 0.32 * a); c.lineWidth = lw(0.8);
    c.beginPath();
    for (const k of poles) {
      for (let i = 0; i < 15; i++) {
        const ang = (k > 0 ? 0 : Math.PI) + lerp(-1.25, 1.25, i / 14) + 0.04 * Math.sin(i * 2.3);
        const len = lerp(0.1, 0.19, 0.5 + 0.5 * Math.sin(i * 1.7 + k));
        const u0 = k * U + Math.cos(ang) * 0.035, v0 = Math.sin(ang) * 0.035;
        c.moveTo(X(u0, v0), Y(u0, v0)); c.lineTo(X(k * U + Math.cos(ang) * len, Math.sin(ang) * len), Y(k * U + Math.cos(ang) * len, Math.sin(ang) * len));
      }
    }
    c.stroke();
    // interpolar fibres: from each pole past the middle (they bundle into the midzone as the furrow closes)
    c.strokeStyle = rgba('ink', 0.3 * a); c.lineWidth = lw(0.8);
    c.beginPath();
    for (const k of poles) {
      for (let i = 0; i < 7; i++) {
        const sp = lerp(-0.2, 0.2, i / 6) * (1 - 0.6 * st.furrow);
        const u1 = -k * U * 0.28;
        const v1 = Math.sin(sp) * U * 1.1 * (1 - 0.7 * st.furrow);
        c.moveTo(X(k * U, 0), Y(k * U, 0));
        c.quadraticCurveTo(X(k * U * 0.35, v1 * 0.9), Y(k * U * 0.35, v1 * 0.9), X(u1, v1 * 0.6), Y(u1, v1 * 0.6));
      }
    }
    c.stroke();

    // ---- chromosomes: sister chromatids (an X, joined at the centromere); kinetochore fibres to the poles
    const wC = Math.max(1.2, 0.021 * R);
    const kin: { x: number; y: number; k: number }[] = [];
    const chrom: { pts: { x: number; y: number }[]; k: number }[] = [];
    const osc = 1 - smoothstep(0, 0.2, st.ana);
    const w = 0.8 * smoothstep(0, 0.4, st.ana); // metaphase X → anaphase V
    for (const ch of this.chromos) {
      const du = Math.sin(ch.tau), dv = Math.cos(ch.tau); // the chromosome's long axis
      const nu = Math.cos(ch.tau), nv = -Math.sin(ch.tau); // across it, toward pole +1
      const jig = 0.008 * osc * Math.sin(st.t * 2.1 + ch.ph);
      const hl = ch.len; // arm lengths: p = f·len, q = (1-f)·len
      for (const k of poles) {
        const off0 = 0.008;
        // the sister's centromere: on the plate (metaphase), drawn to its pole (anaphase)
        const uc = lerp(k * off0 * nu, k * (U - 0.13), st.ana) + jig;
        const vc = lerp(ch.v + k * off0 * nv, ch.v * 0.56, st.ana);
        const arm = (sign: number, len: number) => {
          const pts: { x: number; y: number }[] = [];
          for (let q = 0; q <= 6; q++) {
            const sArc = (q / 6) * len;
            // metaphase: along the axis, the sisters' arms diverging a little (the X)
            const off = 0.013 * Math.pow(sArc / Math.max(1e-3, hl * 0.5), 1.2);
            const mu = du * sign * sArc + k * nu * off, mv = dv * sign * sArc + k * nv * off;
            // anaphase: the arms trail back toward the plate behind the centromere (a V)
            let au = lerp(du * sign, -k, 0.85), av = lerp(dv * sign, 0.5 * sign * Math.sign(dv || 1), 0.85);
            const al = Math.hypot(au, av) || 1; au /= al; av /= al;
            const droop = 0.3 * (q / 6) ** 2 * len;
            const u = uc + lerp(mu, au * sArc - k * droop, w), v = vc + lerp(mv, av * sArc, w);
            pts.push({ x: X(u, v), y: Y(u, v) });
          }
          return pts;
        };
        const p = arm(1, hl * ch.f), q = arm(-1, hl * (1 - ch.f));
        chrom.push({ pts: [...p.reverse(), ...q.slice(1)], k });
        kin.push({ x: X(uc, vc), y: Y(uc, vc), k });
      }
    }
    // kinetochore fibres (two per kinetochore), pole → centromere
    c.strokeStyle = rgba('ink', 0.42 * a); c.lineWidth = lw(0.85);
    c.beginPath();
    for (const q of kin) {
      const px = X(q.k * U, 0), py = Y(q.k * U, 0);
      for (const o2 of [-1, 1]) {
        const ox = -sP * o2 * R * 0.006, oy = cP * o2 * R * 0.006;
        c.moveTo(px, py); c.lineTo(q.x + ox, q.y + oy);
      }
    }
    c.stroke();
    // chromatids: ink rods with a pale engraved highlight on the lit side
    for (const ch of chrom) {
      c.beginPath();
      ch.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.strokeStyle = rgba('ink', 0.9 * a); c.lineWidth = wC; c.stroke();
      if (wC > 3) {
        c.save(); c.translate(-wC * 0.18, -wC * 0.18);
        c.strokeStyle = rgba('bone', 0.32 * a); c.lineWidth = wC * 0.26; c.stroke();
        c.restore();
      }
    }
    // centromeres: a small constriction mark
    if (wC > 2.5) {
      c.fillStyle = rgba('#1c1b1c', a);
      for (const q of kin) { c.beginPath(); c.arc(q.x, q.y, wC * 0.62, 0, Math.PI * 2); c.fill(); }
    }
    // centrosomes: stippled halo and a pair of centrioles at right angles
    const rnd = mulberry32(7);
    for (const k of poles) {
      const px = X(k * U, 0), py = Y(k * U, 0);
      c.fillStyle = rgba('ink', 0.5 * a);
      for (let i = 0; i < 16; i++) {
        const an = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.04 * R;
        c.beginPath(); c.arc(px + Math.cos(an) * rr, py + Math.sin(an) * rr, Math.max(0.5, 0.004 * R), 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = rgba('ink', 0.9 * a);
      const cl = 0.034 * R, cw = 0.013 * R;
      c.save(); c.translate(px, py); c.rotate(PHI);
      c.fillRect(-cl / 2, -cw / 2 - cw * 0.9, cl, cw);
      c.fillRect(cw * 0.3, -cl / 2 + cw * 0.4, cw, cl);
      c.restore();
    }
    // telophase: nuclear envelopes re-forming around each set (arcs closing)
    if (st.env > 0.01) {
      c.strokeStyle = rgba('ink', 0.55 * a * smoothstep(0, 0.3, st.env)); c.lineWidth = lw(1.1);
      for (const k of poles) {
        const u0 = k * (U - 0.11), ru = 0.1, rv = 0.24;
        const span = Math.PI * 2 * clamp(st.env);
        c.beginPath();
        for (let i = 0; i <= 48; i++) {
          const th = (k > 0 ? Math.PI : 0) + lerp(-span / 2, span / 2, i / 48);
          const x = X(u0 + Math.cos(th) * ru, Math.sin(th) * rv), y = Y(u0 + Math.cos(th) * ru, Math.sin(th) * rv);
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    }
    c.restore();
  }

  private drawNeighbour(c: CanvasRenderingContext2D, nb: Neighbour, X: (u: number, v: number) => number, Y: (u: number, v: number) => number, R: number, hp: number, a: number, lw: (w: number) => number) {
    const path = new Path2D();
    for (let k = 0; k <= 40; k++) {
      const th = (k / 40) * Math.PI * 2;
      const r = nb.r * (1 + 0.06 * Math.sin(3 * th + nb.rot) + 0.04 * Math.sin(2 * th + nb.seed));
      const u = nb.u + Math.cos(th) * r, v = nb.v + Math.sin(th) * r;
      k ? path.lineTo(X(u, v), Y(u, v)) : path.moveTo(X(u, v), Y(u, v));
    }
    path.closePath();
    const cx = X(nb.u, nb.v), cy = Y(nb.u, nb.v), rr = nb.r * R;
    c.save(); c.clip(path);
    const gr = c.createLinearGradient(cx - rr * 0.6, cy - rr * 0.6, cx + rr * 0.8, cy + rr * 0.8);
    gr.addColorStop(0, rgba('ink', 0)); gr.addColorStop(1, rgba('ink', 0.3 * a));
    c.strokeStyle = gr; c.lineWidth = lw(0.9);
    c.beginPath();
    for (let q = -rr * 2.4; q < rr * 2.4; q += hp) { c.moveTo(cx + q - rr * 1.3, cy - rr * 1.3); c.lineTo(cx + q + rr * 1.3, cy + rr * 1.3); }
    c.stroke();
    c.restore();
    c.strokeStyle = rgba('ink', 0.5 * a); c.lineWidth = lw(1.3); c.stroke(path);
    // nucleus with stippled chromatin and a nucleolus
    const nx = X(nb.u + nb.nu, nb.v + nb.nv), ny = Y(nb.u + nb.nu, nb.v + nb.nv), nr = nb.nr * R;
    c.fillStyle = rgba('ink', 0.07 * a);
    c.beginPath(); c.ellipse(nx, ny, nr, nr * 0.84, nb.rot, 0, Math.PI * 2); c.fill();
    c.strokeStyle = rgba('ink', 0.5 * a); c.lineWidth = lw(1.1); c.stroke();
    const rnd = mulberry32(nb.seed);
    c.fillStyle = rgba('ink', 0.4 * a);
    for (let i = 0; i < 22; i++) {
      const an = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * nr * 0.85;
      c.beginPath(); c.arc(nx + Math.cos(an) * r, ny + Math.sin(an) * r * 0.84, Math.max(0.5, (0.8 + rnd()) * R / 380), 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = rgba('ink', 0.55 * a);
    c.beginPath(); c.arc(nx + nr * 0.2, ny - nr * 0.15, Math.max(0.8, nr * 0.16), 0, Math.PI * 2); c.fill();
  }
}
