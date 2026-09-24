// `spacetime` helper: the phosphor graticule and the point-mass gravitational lens.
// One fullscreen pass renders the scope glass of movement 1 (lens off) and the singularity of
// movement 2 (lens on): every pixel is traced back through the thin-lens equation
//   beta = theta * (1 - thetaE^2 / |theta|^2)
// to the source plane, where the graticule (an analytic, box-filtered grid) and a Canvas2D
// "source" layer (the lyric, drawn flat) are looked up. Inside the Einstein ring this yields the
// flipped secondary image; inside the shadow radius everything is black; a photon ring sits on
// the shadow's edge. A frame-dragging swirl twists the source plane near the hole.
import * as THREE from 'three';
import { FSPass, W, H, SCALE, scaleContext2D } from '../engine/gl';

const FRAG = /* glsl */ `
uniform vec2 uC;            // lens centre (screen px, y down)
uniform float uRs;          // shadow radius (px)
uniform float uThE;         // Einstein radius (px)
uniform float uSwirl;       // frame-dragging twist (rad at the Einstein ring)
uniform vec2 uGridOff;      // graticule origin relative to the lens centre, in plane px (y up)
uniform float uPitch;       // tilt of the source plane away from the camera (rad)
uniform float uF;           // focal length (px) for the tilted plane
uniform float uGridPx;      // px per division
uniform float uGridRot;     // source-plane rotation (rad)
uniform vec2 uGridExt;      // half extent of the ruled area (divisions)
uniform float uGridA;       // graticule intensity
uniform float uGridDraw;    // 0..1 the graticule etching in from the centre
uniform float uTicks;       // centre-axis ticks and dotted subdivisions
uniform sampler2D uTex;     // source-plane layer (premultiplied, sRGB)
uniform float uTexA;
uniform float uRing;        // photon ring intensity
uniform float uRingPh;      // bright side of the ring (Doppler), rad
uniform float uGlow;        // phosphor glass glow (movement 1)
uniform float uKick;
uniform float uHeat;        // warm lensed haze around the hole
uniform float uTime;
uniform float uLine;        // hairline width (px)
uniform float uMinor;       // 0..1 minor rulings every 0.2 division
uniform vec3 uBeam;         // the scope's beam (screen px, intensity): it lights the etched glass as it sweeps

// box-filtered grid (after I. Quilez): coverage of lines of relative width 1/N
float gridCov(vec2 p, float N) {
  vec2 w = max(abs(dFdx(p)), abs(dFdy(p))) + 1e-5;
  vec2 a = p + 0.5 * w, b = p - 0.5 * w;
  vec2 i = (floor(a) + min(fract(a) * N, 1.0) - floor(b) - min(fract(b) * N, 1.0)) / (N * w);
  return 1.0 - (1.0 - i.x) * (1.0 - i.y);
}
float lineCov(float p, float N) {
  float w = abs(dFdx(p)) + abs(dFdy(p)) + 1e-5;
  float a = p + 0.5 * w, b = p - 0.5 * w;
  return (floor(a) + min(fract(a) * N, 1.0) - floor(b) - min(fract(b) * N, 1.0)) / (N * w);
}

void main() {
  vec2 p = vec2(vUv.x * ${W}.0, (1.0 - vUv.y) * ${H}.0);
  vec2 d = p - uC;
  float r = length(d);
  // ---- lens: image plane -> source plane
  float k = uThE * uThE / max(r * r, 1e-2);
  vec2 b = d * (1.0 - k);
  float sw = uSwirl * min(k, 6.0);
  b = mat2(cos(sw), sin(sw), -sin(sw), cos(sw)) * b;
  vec2 s = uC + b;

  // ---- graticule in the source plane (divisions, y up). The plane can be pitched away from the
  // camera (a floor receding behind the hole): cast a ray through the (rolled) source point.
  vec2 sr = mat2(cos(uGridRot), -sin(uGridRot), sin(uGridRot), cos(uGridRot)) * (s - uC);
  vec3 dir = vec3(sr.x / uF, -sr.y / uF, 1.0);
  float cp = cos(uPitch), sp = sin(uPitch);
  float den = -dir.y * sp + dir.z * cp;
  float tt = uF * cp / max(den, 1e-4);
  vec3 X = tt * dir;
  vec2 ab = vec2(X.x, X.y * cp + (X.z - uF) * sp);
  vec2 q = (ab - uGridOff) / uGridPx;
  float far = step(1e-4, den) * exp(-max(tt / uF - 1.0, 0.0) * 0.16);
  float N = uGridPx / uLine;
  vec2 ext = uGridExt * uGridDraw;
  float inside = step(abs(q.x), ext.x + 0.004) * step(abs(q.y), ext.y + 0.004);
  float g = gridCov(q, N) * inside;
  // brighter centre axes
  float ax = max(lineCov(q.x + 0.5, N * 0.55) * step(abs(q.y), ext.y), lineCov(q.y + 0.5, N * 0.55) * step(abs(q.x), ext.x));
  ax *= step(abs(q.x), ext.x + 0.01) * step(abs(q.y), ext.y + 0.01);
  // ticks every 0.2 div on the centre axes, dotted subdivisions on all major lines
  float tk = 0.0;
  if (uTicks > 0.0) {
    float t1 = lineCov(q.x * 5.0 + 0.5, N * 0.2) * step(abs(q.y), 0.07) * step(abs(q.x), ext.x);
    float t2 = lineCov(q.y * 5.0 + 0.5, N * 0.2) * step(abs(q.x), 0.07) * step(abs(q.y), ext.y);
    vec2 f5 = abs(fract(q * 5.0) - 0.5);
    vec2 fl = abs(fract(q + 0.5) - 0.5);
    vec2 wq = fwidth(q);
    float dots = pxLine(0.5 - f5.x, 0.0, 2.2 * wq.x * 5.0) * pxLine(fl.y, 0.0, 1.6 * wq.y);
    dots = max(dots, pxLine(0.5 - f5.y, 0.0, 2.2 * wq.y * 5.0) * pxLine(fl.x, 0.0, 1.6 * wq.x));
    tk = (max(t1, t2) * 0.9 + dots * 0.35) * inside * uTicks;
  }
  float mn = uMinor > 0.0 ? gridCov(q * 5.0, N / 5.0) * inside * uMinor : 0.0;
  float lum = uGridA * (0.26 * g + 0.34 * ax + 0.45 * tk + 0.1 * mn) * far;

  vec3 col = C_INK;
  // phosphor glass: a faint warm glow in the middle of the screen
  float rc = length((vUv - 0.5) * vec2(16.0 / 9.0, 1.0));
  col += C_BLOOD * 0.02 * uGlow * (1.0 - smoothstep(0.0, 0.9, rc)) * (1.0 + 0.5 * uKick);
  col += C_INK2 * 0.45 * (1.0 - smoothstep(0.1, 1.0, rc));
  // warm lensed haze hugging the hole
  float hz = uHeat * exp(-max(r - uRs, 0.0) / (uRs * 0.9 + 1.0)) * (0.7 + 0.3 * sin(atan(d.y, d.x) * 3.0 - uTime * 2.0));
  col += C_BLOOD * 0.35 * hz + C_SIGNAL * 0.05 * hz;
  float bl = uBeam.z * exp(-length(p - uBeam.xy) / 260.0);
  col += mix(C_ASH, C_BONE, 0.5) * lum * (1.0 + 1.6 * bl) + C_EMBER * lum * 0.5 * bl;

  // ---- the source layer (lyric), lensed
  vec2 tuv = vec2(s.x / ${W}.0, 1.0 - s.y / ${H}.0);
  vec4 tx = texture(uTex, tuv);   // sampled in uniform control flow (derivatives pick the mip)
  tx *= uTexA * step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
  col = col * (1.0 - tx.a) + tx.rgb * 0.8;   // bone type stays under the bloom threshold

  // ---- shadow and photon ring
  if (uRs > 0.0) {
    float aa = 1.2;
    float shadow = smoothstep(uRs - aa, uRs + aa, r);
    col *= shadow;
    float ang = atan(d.y, d.x);
    float dop = 0.55 + 0.45 * cos(ang - uRingPh);
    float x = r - uRs;
    float core = exp(-x * x / (2.0 * 1.3 * 1.3)) * step(-2.5, x);
    float glow = exp(-max(x, 0.0) / (5.0 + uRs * 0.05)) * smoothstep(-2.0, 0.5, x);
    float wide = exp(-max(x, 0.0) / (uRs * 0.35 + 8.0)) * smoothstep(-2.0, 2.0, x);
    float n2 = exp(-pow(r - uRs * 1.045, 2.0) / 1.2);   // the fainter secondary ring
    vec3 ring = vec3(1.9, 1.45, 1.05) * core * (0.45 + 0.8 * dop)
              + C_EMBER * 0.95 * glow * (0.35 + dop)
              + C_SIGNAL * 0.3 * wide * (0.4 + dop)
              + vec3(1.2, 0.7, 0.4) * n2 * 0.5 * dop;
    col += ring * uRing * (1.0 + 0.8 * uKick);
  }
  fragColor = vec4(col, 1.0);
}`;

export class LensPass {
  pass: FSPass;
  constructor(tex: THREE.Texture) {
    this.pass = new FSPass(FRAG, {
      uC: { value: new THREE.Vector2(W / 2, H / 2) }, uRs: { value: 0 }, uThE: { value: 0 }, uSwirl: { value: 0 },
      uGridOff: { value: new THREE.Vector2(0, 0) }, uPitch: { value: 0 }, uF: { value: 1400 }, uGridPx: { value: 120 }, uGridRot: { value: 0 },
      uGridExt: { value: new THREE.Vector2(8, 4.5) }, uGridA: { value: 1 }, uGridDraw: { value: 1 }, uTicks: { value: 1 },
      uTex: { value: tex }, uTexA: { value: 1 }, uRing: { value: 0 }, uRingPh: { value: 0 }, uGlow: { value: 1 },
      uKick: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 }, uLine: { value: 1.25 }, uMinor: { value: 0 }, uBeam: { value: new THREE.Vector3(0, 0, 0) },
    });
  }
  get u() { return this.pass.u; }
  set(o: Partial<{ C: [number, number]; Rs: number; thE: number; swirl: number; gridOff: [number, number]; pitch: number; F: number; gridPx: number; gridRot: number; gridExt: [number, number]; gridA: number; gridDraw: number; ticks: number; texA: number; ring: number; ringPh: number; glow: number; kick: number; heat: number; time: number; line: number; minor: number; beam: [number, number, number] }>) {
    const u = this.pass.u;
    if (o.C) (u.uC!.value as THREE.Vector2).set(o.C[0], o.C[1]);
    if (o.gridOff) (u.uGridOff!.value as THREE.Vector2).set(o.gridOff[0], o.gridOff[1]);
    if (o.beam) (u.uBeam!.value as THREE.Vector3).set(o.beam[0], o.beam[1], o.beam[2]);
    if (o.gridExt) (u.uGridExt!.value as THREE.Vector2).set(o.gridExt[0], o.gridExt[1]);
    const map: Record<string, string> = { pitch: 'uPitch', F: 'uF', Rs: 'uRs', thE: 'uThE', swirl: 'uSwirl', gridPx: 'uGridPx', gridRot: 'uGridRot', gridA: 'uGridA', gridDraw: 'uGridDraw', ticks: 'uTicks', texA: 'uTexA', ring: 'uRing', ringPh: 'uRingPh', glow: 'uGlow', kick: 'uKick', heat: 'uHeat', time: 'uTime', line: 'uLine', minor: 'uMinor' };
    for (const [k, v] of Object.entries(o)) if (map[k] && typeof v === 'number') u[map[k]!]!.value = v;
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget) { this.pass.render(renderer, out); }
}

/** A 1920x1080 (logical; SCALE x backing like Layer2D) Canvas2D layer uploaded with mipmaps and premultiplied alpha (for lensed lookups). */
export class MipLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  constructor(public w = W, public h = H) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * SCALE; this.canvas.height = h * SCALE;
    this.ctx = scaleContext2D(this.canvas.getContext('2d')!, SCALE);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.premultiplyAlpha = true;
    this.texture.anisotropy = 8;
    this.texture.flipY = true;
  }
  clear() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.shadowBlur = 0;
    c.clearRect(0, 0, this.w, this.h);
  }
  upload() { this.texture.needsUpdate = true; return this.texture; }
}
