// "Trajectory, revised": the drawing sheet. One big map drawn once into a canvas (y down, north
// up), rendered by a shader with a 2D camera (pan, rotation, zoom, a keystone tilt for depth) and
// true multi-tap motion blur over the camera path. On top of the static drawing the shader adds a
// procedural drafting grid (crisp at any zoom), the road markings, the spark's burnt trail, and
// the terra incognita west of the route as a topographic survey whose relief is the mask
// (dome, two eye pits, one smile groove). A per-frame world-space overlay canvas (labels, the
// review schedule) is sampled through the same camera, so it shares the keystone and the blur.
import * as THREE from 'three';
import { FSPass, SCALE } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { MASK } from './_motifs';

export const MAP = {
  size: 4096,
  PX: 3000, // the planned route runs north along x = PX
  Y0: 3900, // start ("you are here")
  TURN_Y: 2800, // the swerve
  RT: 60, // corner radius
  ms: [
    { code: 'SRR', name: 'System Requirements Review', y: 3580, date: 'T−120 d' },
    { code: 'PDR', name: 'Preliminary Design Review', y: 3200, date: 'T−90 d' },
    { code: 'CDR', name: 'Critical Design Review', y: 2440, date: 'T−45 d' },
    { code: 'TRR', name: 'Test Readiness Review', y: 1900, date: 'T−14 d' },
    { code: 'LAUNCH', name: '', y: 1300, date: 'T−0' },
  ],
  SHARP_Y: 3390,
  LEFT_Y: 2990,
  TURN_X: 2560,
  AND_X: 2035,
  THERE_X: 1872,
};

/** The unplanned object: the mask as terrain, west of the turn. Its right eye sits on the new road. */
export const FACE = { x: 1350, y: MAP.TURN_Y - MASK.eyeY * 1000, r: 1000 };
export const EYE_R = { x: FACE.x + MASK.eyeX * FACE.r, y: FACE.y + MASK.eyeY * FACE.r };
export const EYE_L = { x: FACE.x - MASK.eyeX * FACE.r, y: FACE.y + MASK.eyeY * FACE.r };

/** Arc-length along the route (north, corner, west) -> world point & heading (radians, y down). */
export function routeAt(s: number) {
  const { PX, Y0, TURN_Y, RT } = MAP;
  const LA = Y0 - (TURN_Y + RT);
  const LC = (RT * Math.PI) / 2;
  if (s <= LA) return { x: PX, y: Y0 - s, a: -Math.PI / 2 };
  if (s <= LA + LC) {
    const phi = (s - LA) / RT;
    return { x: PX - RT + RT * Math.cos(phi), y: TURN_Y + RT - RT * Math.sin(phi), a: -Math.PI / 2 - phi };
  }
  return { x: PX - RT - (s - LA - LC), y: TURN_Y, a: Math.PI };
}
export const ROUTE_LA = MAP.Y0 - (MAP.TURN_Y + MAP.RT);
export const ROUTE_LC = (MAP.RT * Math.PI) / 2;
/** Arc length at which the trajectory reaches the right eye. */
export const ROUTE_EYE = ROUTE_LA + ROUTE_LC + (MAP.PX - MAP.RT - EYE_R.x);

function canvas(n: number) {
  const cv = document.createElement('canvas');
  cv.width = n; cv.height = n;
  return cv;
}

/** The static drawing: planned route, milestones, annotations, title block (grid & terrain are procedural). */
export function drawMap(): HTMLCanvasElement {
  const N = MAP.size;
  const cv = canvas(N);
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, N, N);
  const { PX, Y0, ms } = MAP;
  // schedule envelope
  c.strokeStyle = rgba('ash', 0.55);
  c.lineWidth = 2;
  c.setLineDash([3, 12]);
  for (const s of [-110, 110]) { c.beginPath(); c.moveTo(PX + s, Y0 + 60); c.lineTo(PX + s, 900); c.stroke(); }
  c.setLineDash([]);
  c.save();
  c.translate(PX + 128, 2150); c.rotate(-Math.PI / 2);
  c.font = font(F.mono(500), 20); c.fillStyle = rgba('ash', 0.75); c.letterSpacing = '4px';
  c.fillText('±3σ SCHEDULE ENVELOPE', 0, 0);
  c.restore();
  // planned route: dashed centre line continuing past every milestone, arrow at the top
  c.strokeStyle = rgba('bone', 0.85);
  c.lineWidth = 5;
  c.setLineDash([46, 30]);
  c.beginPath(); c.moveTo(PX, Y0); c.lineTo(PX, 1050); c.stroke();
  c.setLineDash([]);
  c.fillStyle = rgba('bone', 0.85);
  c.beginPath(); c.moveTo(PX, 990); c.lineTo(PX - 22, 1050); c.lineTo(PX + 22, 1050); c.closePath(); c.fill();
  // milestones
  for (const m of ms) {
    const y = m.y;
    c.save();
    c.translate(PX, y);
    if (m.code === 'LAUNCH') {
      c.strokeStyle = rgba('bone', 1); c.lineWidth = 4;
      c.beginPath(); c.moveTo(0, -40); c.lineTo(36, 26); c.lineTo(-36, 26); c.closePath(); c.stroke();
    } else {
      c.fillStyle = rgba('ink', 1); c.strokeStyle = rgba('bone', 1); c.lineWidth = 4;
      c.beginPath(); c.moveTo(0, -34); c.lineTo(34, 0); c.lineTo(0, 34); c.lineTo(-34, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = rgba('bone', 1); c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();
    }
    // leader + label
    c.strokeStyle = rgba('ash', 0.8); c.lineWidth = 2;
    c.beginPath(); c.moveTo(44, 0); c.lineTo(150, 0); c.lineTo(170, -30); c.stroke();
    c.font = font(F.mono(600), 64); c.fillStyle = rgba('bone', 1); c.textBaseline = 'alphabetic';
    c.fillText(m.code, 180, -40);
    c.font = font(F.mono(400), 26); c.fillStyle = rgba('ash', 1);
    if (m.name) c.fillText(m.name, 182, 2);
    c.font = font(F.mono(500), 22); c.fillStyle = rgba('graphite', 1);
    c.fillText(m.date, 182, 36);
    // status box (left of the marker)
    c.strokeStyle = rgba('bone', 0.9); c.lineWidth = 3;
    c.strokeRect(-158, -26, 52, 52);
    c.font = font(F.mono(500), 16); c.fillStyle = rgba('graphite', 1);
    c.fillText('STATUS', -166, 50);
    c.restore();
  }
  // "you are here"
  c.save();
  c.translate(PX, Y0);
  c.strokeStyle = rgba('bone', 0.9); c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(-180, 0); c.lineTo(-40, 0); c.stroke();
  c.beginPath(); c.moveTo(-40, 0); c.lineTo(-58, -10); c.lineTo(-58, 10); c.closePath(); c.fillStyle = rgba('bone', 0.9); c.fill();
  c.font = font(F.mono(600), 26); c.fillStyle = rgba('bone', 0.95); c.textAlign = 'right';
  c.fillText('YOU ARE HERE', -196, 9);
  c.restore();
  // time ruler on the left of the route
  c.fillStyle = rgba('ash', 0.6);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  for (let y = Y0, i = 0; y > 1000; y -= 50, i++) {
    const big = i % 6 === 0;
    c.fillRect(PX - 300, y, big ? 40 : 18, 2);
    if (big) { c.font = font(F.mono(500), 20); c.fillText(months[(i / 6) % 12]!, PX - 250, y + 7); }
  }
  c.fillRect(PX - 300, 1000, 2, Y0 - 1000);
  // critical path callout
  c.font = font(F.mono(400, true), 24); c.fillStyle = rgba('ash', 0.9); c.textAlign = 'left';
  c.fillText('critical path (do not deviate)', PX + 190, 2800);
  c.strokeStyle = rgba('ash', 0.7); c.lineWidth = 2;
  c.beginPath(); c.moveTo(PX + 185, 2792); c.lineTo(PX + 30, 2792); c.stroke();
  // compass
  c.save(); c.translate(3700, 1500);
  c.strokeStyle = rgba('bone', 0.8); c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, 70, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(0, -95); c.lineTo(14, 0); c.lineTo(0, 95); c.lineTo(-14, 0); c.closePath(); c.stroke();
  c.fillStyle = rgba('bone', 0.9); c.beginPath(); c.moveTo(0, -95); c.lineTo(14, 0); c.lineTo(-14, 0); c.closePath(); c.fill();
  c.font = font(F.serif(600), 44); c.textAlign = 'center'; c.fillText('N', 0, -110);
  c.restore();
  // title block
  c.save(); c.translate(3330, 3620);
  c.strokeStyle = rgba('bone', 0.9); c.lineWidth = 3; c.strokeRect(0, 0, 640, 330);
  c.lineWidth = 1.5;
  for (const y of [70, 130, 190, 250]) { c.beginPath(); c.moveTo(0, y); c.lineTo(640, y); c.stroke(); }
  c.beginPath(); c.moveTo(320, 130); c.lineTo(320, 330); c.stroke();
  c.font = font(F.mono(600), 30); c.fillStyle = rgba('bone', 1); c.textAlign = 'left';
  c.fillText('ROADMAP — AGI, v1.0', 18, 46);
  c.font = font(F.mono(400), 20); c.fillStyle = rgba('ash', 1);
  c.fillText('REV C · SUPERSEDES REV B (ALSO FINE)', 18, 108);
  const cells: [string, string, number, number][] = [
    ['DRAWN', 'ALIGNMENT TEAM', 18, 168], ['CHECKED', '—', 338, 168],
    ['APPROVED', 'PENDING', 18, 228], ['SCALE', 'NOT TO SCALE', 338, 228],
    ['SHEET', '1 OF 1', 18, 300], ['DATE', 'SOON', 338, 300],
  ];
  for (const [k, v, x, y] of cells) {
    c.font = font(F.mono(500), 14); c.fillStyle = rgba('graphite', 1); c.fillText(k, x, y - 26);
    c.font = font(F.mono(500), 22); c.fillStyle = rgba('bone', 0.95); c.fillText(v, x, y);
  }
  c.restore();
  return cv;
}

/**
 * Road markings & stamps, one per channel: R = SHARP, G = LEFT + turn arrow (east) / THERE (west),
 * B = TURN (east) / AND (west), A = check marks. The shader splits the shared channels by x.
 */
export function makeMarksTexture(): THREE.DataTexture {
  const N = 4096, S = N / MAP.size;
  const cv = canvas(N);
  const c = cv.getContext('2d')!;
  c.scale(S, S);
  const fam = F.archivo(62, 900);
  const stretch = 2.3;
  const paint = (txt: string, x: number, y: number, rot: number, col: string, size = 118, st = stretch) => {
    c.save();
    c.translate(x, y); c.rotate(rot); c.scale(1, st);
    c.font = font(fam, size);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = col;
    c.fillText(txt, 0, 0);
    c.restore();
  };
  c.globalCompositeOperation = 'lighter';
  paint('SHARP', MAP.PX, MAP.SHARP_Y, 0, 'rgb(255,0,0)');
  paint('LEFT', MAP.PX, MAP.LEFT_Y, 0, 'rgb(0,255,0)');
  // turn arrow: stem north, bending west, head pointing west
  c.save();
  c.strokeStyle = 'rgb(0,255,0)'; c.fillStyle = 'rgb(0,255,0)';
  c.lineWidth = 26; c.lineCap = 'butt';
  const ax = MAP.PX, ay = MAP.LEFT_Y - 190;
  c.beginPath(); c.moveTo(ax, ay + 80); c.lineTo(ax, ay - 20); c.arc(ax - 70, ay - 20, 70, 0, -Math.PI / 2, true); c.lineTo(ax - 120, ay - 90); c.stroke();
  c.beginPath(); c.moveTo(ax - 190, ay - 90); c.lineTo(ax - 120, ay - 140); c.lineTo(ax - 120, ay - 40); c.closePath(); c.fill();
  c.restore();
  paint('TURN', MAP.TURN_X, MAP.TURN_Y, -Math.PI / 2, 'rgb(0,0,255)');
  paint('AND', MAP.AND_X, MAP.TURN_Y, -Math.PI / 2, 'rgb(0,0,255)', 100, 1.75);
  paint('THERE', MAP.THERE_X, MAP.TURN_Y, -Math.PI / 2, 'rgb(0,255,0)', 100, 1.75);
  const rgb = c.getImageData(0, 0, N, N).data;
  // check marks
  const cvA = canvas(N);
  const a = cvA.getContext('2d')!;
  a.scale(S, S);
  for (const m of MAP.ms.slice(0, 2)) {
    a.save(); a.translate(MAP.PX - 132, m.y);
    a.strokeStyle = '#fff'; a.lineWidth = 11; a.lineCap = 'round'; a.lineJoin = 'round';
    a.beginPath(); a.moveTo(-26, 0); a.lineTo(-6, 22); a.lineTo(34, -34); a.stroke();
    a.restore();
  }
  const al = a.getImageData(0, 0, N, N).data;
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[i]!; data[i + 1] = rgb[i + 1]!; data[i + 2] = rgb[i + 2]!; data[i + 3] = al[i + 3]!;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

export function canvasTex(cv: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.flipY = false;
  t.premultiplyAlpha = false;
  t.needsUpdate = true;
  return t;
}

/**
 * A world-space overlay: a canvas holding the *flat* camera view (before the keystone) at a
 * density of S texels per screen pixel, drawn every frame with the camera's affine transform and
 * sampled by the map shader through the full camera model.
 */
export class WorldLayer {
  static S = 1.2 * SCALE; // texels per logical px: SCALE x denser at 4K output
  cv = document.createElement('canvas');
  c: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  cam = { x: 0, y: 0, rot: 0, zoom: 1 };
  constructor(public w = 2880 * SCALE, public h = 1620 * SCALE) {
    this.cv.width = w; this.cv.height = h;
    this.c = this.cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.flipY = false;
  }
  /** Clear and set the world transform for camera `cam`. */
  begin(cam: { x: number; y: number; rot: number; zoom: number }) {
    const c = this.c;
    this.cam = { ...cam };
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0; c.setLineDash([]);
    c.clearRect(0, 0, this.w, this.h);
    this.world();
  }
  /** Reset to the world transform (x right, y down, world units). */
  world() {
    const { x, y, rot, zoom } = this.cam, S = WorldLayer.S;
    const k = S * zoom, cs = Math.cos(rot) * k, sn = Math.sin(rot) * k;
    this.c.setTransform(cs, sn, -sn, cs, this.w / 2 - (cs * x - sn * y), this.h / 2 - (sn * x + cs * y));
  }
  /** World units per screen pixel (for hairlines). */
  get px() { return 1 / this.cam.zoom; }
  upload() { this.tex.needsUpdate = true; return this.tex; }
}

export const MAP_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform sampler2D uMap, uMarks, uOv;
uniform vec4 uCamA, uCamB;   // (x, y, rot, zoom) at t and at t - shutter
uniform float uTaps, uK, uReveal, uT, uTrail, uHeat, uHaze, uDim, uTopo, uPool;
uniform vec4 uMarkOn, uMarkHot;
uniform vec2 uMarkOn2, uMarkHot2; // AND, THERE
uniform vec2 uChecks;        // SRR, PDR check visibility
uniform vec4 uOvCam;         // overlay canvas camera
uniform vec2 uOvSize;
uniform float uOvS;
uniform vec3 uFace;          // centre, radius (world)
uniform vec2 uEye;           // right / left eye glow
uniform float uEyePulse;
uniform vec4 uWave;          // origin, radius, amplitude (contour shockwave)
uniform vec4 uRip;           // beat ripples from the face centre: (radius, amp) x 2
const float MAPN = ${MAP.size.toFixed(1)};
const float PX = ${MAP.PX.toFixed(1)};
const float Y0 = ${MAP.Y0.toFixed(1)};
const float TY = ${MAP.TURN_Y.toFixed(1)};
const float RT = ${MAP.RT.toFixed(1)};
const float CHECK_SPLIT = ${((MAP.ms[0]!.y + MAP.ms[1]!.y) / 2).toFixed(1)};
const float WEST_SPLIT = ${((MAP.TURN_X + MAP.AND_X) / 2).toFixed(1)};
const float EX = ${MASK.eyeX.toFixed(4)};
const float EY = ${MASK.eyeY.toFixed(4)};
const float ER = ${MASK.eyeR.toFixed(4)};
const float SCY = ${MASK.smileCY.toFixed(4)};
const float SR = ${MASK.smileR.toFixed(4)};
const float SA0 = ${MASK.smileA0.toFixed(5)};
const float SA1 = ${MASK.smileA1.toFixed(5)};
const float SW = ${MASK.smileW.toFixed(4)};

vec2 toWorld(vec2 fc, vec4 cam) {
  vec2 s = vec2(fc.x, uRes.y - fc.y) - 0.5 * uRes;   // centred, y down
  float fy = s.y / (1.0 + uK * s.y);
  float fx = s.x * (1.0 - uK * fy);
  vec2 f = vec2(fx, fy) / cam.w;
  float c = cos(cam.z), sn = sin(cam.z);
  // inverse of R(rot): R(-rot)
  vec2 w = vec2(c * f.x + sn * f.y, -sn * f.x + c * f.y);
  return cam.xy + w;
}

// distance to the route and arc length at the closest point
vec2 route(vec2 p) {
  float LA = Y0 - (TY + RT);
  float LC = RT * 1.5707963;
  float yA = clamp(p.y, TY + RT, Y0);
  float dA = length(p - vec2(PX, yA));
  float sA = Y0 - yA;
  vec2 cc = vec2(PX - RT, TY + RT);
  vec2 q = p - cc;
  float phi = clamp(atan(-q.y, q.x), 0.0, 1.5707963);
  vec2 pa = cc + RT * vec2(cos(phi), -sin(phi));
  float dC = length(p - pa);
  float sC = LA + phi * RT;
  float xB = min(p.x, PX - RT);
  float dB = length(p - vec2(xB, TY));
  float sB = LA + LC + (PX - RT - xB);
  vec2 r = vec2(dA, sA);
  if (dC < r.x) r = vec2(dC, sC);
  if (dB < r.x) r = vec2(dB, sB);
  return r;
}

// ---- the terrain: gentle noise + the mask as relief (heights in contour intervals)
float smileDist(vec2 p) {
  vec2 q = p - vec2(0.0, SCY);
  float a = atan(q.y, q.x);
  if (a > SA0 && a < SA1) return abs(length(q) - SR);
  vec2 c0 = vec2(cos(SA0), sin(SA0)) * SR, c1 = vec2(cos(SA1), sin(SA1)) * SR;
  return min(length(q - c0), length(q - c1));
}
float faceH(vec2 p) {
  float r = length(p);
  float edge = smoothstep(1.0, 0.9, r);
  float dome = sqrt(max(0.0, 1.0 - r * r * 0.8));
  float h = (2.6 + 4.4 * dome) * edge;
  float e = min(length(p - vec2(EX, EY)), length(p - vec2(-EX, EY)));
  h -= 4.6 * sqrt(max(0.0, 1.0 - pow(e / (ER * 1.45), 2.0)));
  float s = smileDist(p);
  h -= 3.4 * exp(-pow(s / (SW * 0.95), 2.0));
  return h;
}
float terrain(vec2 w) {
  vec2 q = w + 260.0 * vec2(snoise(w * 0.0007 + vec2(1.3, 9.1)), snoise(w * 0.0007 + vec2(5.2, 0.4)));
  return dot(q, vec2(-0.0042, 0.0052)) + 1.1 * snoise(q * 0.0011 + vec2(3.1, 1.7)) + 0.35 * snoise(w * 0.003 + vec2(7.7, 2.3));
}

float gridCov(float d, float wpx) {
  // d: distance to the line in px; lines never thinner than ~0.8 px (alpha takes over)
  float w = max(wpx, 0.8);
  return (1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, d)) * min(1.0, wpx / 0.8);
}

vec3 shade(vec2 w, float zoom) {
  vec3 col = C_INK;
  // reveal: the drawing appears from the south
  float rev = smoothstep(uReveal - 40.0, uReveal + 40.0, w.y);
  // drafting grid (40 / 200 units)
  vec2 dmin = abs(fract(w / 40.0 + 0.5) - 0.5) * 40.0 * zoom;
  vec2 dmaj = abs(fract(w / 200.0 + 0.5) - 0.5) * 200.0 * zoom;
  float wmin = min(1.0 * zoom, 1.2), wmaj = min(1.5 * zoom, 1.7);
  float gmin = max(gridCov(dmin.x, wmin), gridCov(dmin.y, wmin));
  float gmaj = max(gridCov(dmaj.x, wmaj), gridCov(dmaj.y, wmaj));
  col = mix(col, C_GRAPHITE, max(0.12 * gmin, 0.3 * gmaj) * rev);

  // terra incognita: contours of the relief
  float region = uTopo * smoothstep(2620.0, 2380.0, w.x) * smoothstep(1500.0, 1760.0, w.y) * rev;
  vec2 p = (w - uFace.xy) / uFace.z;
  float fr = length(p);
  float fm = smoothstep(1.03, 0.97, fr);
  if (uTopo > 0.0) { // uniform branch: fwidth stays defined
    float fh = faceH(p);
    float dw = length(w - uWave.xy);
    float wave = uWave.w * exp(-pow((dw - uWave.z) / 90.0, 2.0));
    float dc = fr * uFace.z;
    float ripF = uRip.y * exp(-pow((dc - uRip.x) / 80.0, 2.0)) + uRip.w * exp(-pow((dc - uRip.z) / 80.0, 2.0));
    wave += ripF;
    float h = terrain(w) * (1.0 - 0.85 * fm) + fh + wave;
    float fwP = max(fwidth(h), 1e-4), fw = fwP * PX_SCALE; // contour interval per physical / logical px
    float f = abs(fract(h + 0.5) - 0.5);
    float lw = mix(1.0, 1.5, fm);
    float line = pxLine(f / fwP, lw * 0.5 - 0.5, lw * 0.5 + 0.5);
    // fine engraved sub-contours on the face (quarter interval)
    float f4 = abs(fract(h * 4.0 + 0.5) - 0.5);
    float fine = pxLine(f4 / (fwP * 4.0), 0.0, 1.0) * sat(1.6 - fw * 9.0) * fm;
    // index contour every 5th interval
    float idx = step(abs(mod(floor(h + 0.5), 5.0)), 0.5);
    float dens = sat(1.7 - fw * 2.2);            // fade where contours get denser than ~2 px
    // hillshade of the face (light from the north-west)
    vec2 e = vec2(0.004, 0.0);
    vec2 g = vec2(faceH(p + e.xy) - faceH(p - e.xy), faceH(p + e.yx) - faceH(p - e.yx)) / (2.0 * e.x);
    vec3 n = normalize(vec3(-g * 0.045, 1.0));
    float lam = dot(n, normalize(vec3(-0.55, -0.7, 0.55)));
    vec3 lineCol = mix(C_GRAPHITE * 0.85, mix(C_ASH * 0.8, C_BONE * 0.75, idx), fm);
    lineCol *= mix(1.0, 0.55 + 0.75 * sat(lam + 0.25), fm);
    // the beat's wavefront lights the contours it passes
    float front = sat(ripF * 1.2) * fm;
    lineCol = mix(lineCol, mix(C_BONE, C_EMBER, 0.35) * 1.1, front);
    float lineA = line * dens * mix(0.7, 1.0, max(idx, sat(ripF * 1.2) * fm));
    col = mix(col, C_INK2 * (0.5 + 1.3 * sat(lam)), 0.85 * fm * region);
    col = mix(col, C_GRAPHITE * (0.45 + 0.6 * sat(lam)), 0.55 * fine * region);
    col = mix(col, lineCol, lineA * region);
    col = mix(col, C_GRAPHITE * 0.5, (1.0 - dens) * 0.6 * region * fm);
  }

  vec2 uv = w / MAPN;
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
    vec4 m = texture(uMap, uv);
    col = mix(col, m.rgb, m.a * rev);
    // road markings
    vec4 mk = texture(uMarks, uv);
    vec3 paintCol = C_BONE * 0.95;
    vec3 hotCol = C_SIGNAL * 0.95;
    bool west = w.x < WEST_SPLIT;
    float onG = west ? uMarkOn2.y : uMarkOn.g, hotG = west ? uMarkHot2.y : uMarkHot.g;
    float onB = west ? uMarkOn2.x : uMarkOn.b, hotB = west ? uMarkHot2.x : uMarkHot.b;
    float pr = mk.r * uMarkOn.r, pg = mk.g * onG, pb = mk.b * onB;
    float wear = 0.8 + 0.2 * snoise(w * 0.05);
    col = mix(col, mix(paintCol, hotCol, uMarkHot.r) * wear, pr);
    col = mix(col, mix(paintCol, hotCol, hotG) * wear, pg);
    col = mix(col, mix(paintCol, hotCol, hotB) * wear, pb);
    float chk = mk.a * (w.y > CHECK_SPLIT ? uChecks.x : uChecks.y);
    col = mix(col, C_SIGNAL * 1.3, chk);
  }

  // the eye pits: molten when the face looks at you
  if (fm > 0.0) {
    float d1 = length(p - vec2(EX, EY)) / ER, d2 = length(p - vec2(-EX, EY)) / ER;
    float k1 = uEye.x, k2 = uEye.y;
    float pit1 = smoothstep(1.02, 0.88, d1), pit2 = smoothstep(1.02, 0.88, d2);
    vec3 m1 = heat(0.5 + 0.28 * k1 * (1.0 - d1 * d1)) * (1.0 + 0.5 * uEyePulse);
    vec3 m2 = heat(0.5 + 0.28 * k2 * (1.0 - d2 * d2)) * (1.0 + 0.5 * uEyePulse);
    col = mix(col, m1, pit1 * k1);
    col = mix(col, m2, pit2 * k2);
    col += C_SIGNAL * (0.18 + 0.2 * uEyePulse) * (k1 * exp(-max(d1 - 1.0, 0.0) * 1.6) * (1.0 - pit1) + k2 * exp(-max(d2 - 1.0, 0.0) * 1.6) * (1.0 - pit2));
  }

  col = mix(C_INK, col, uDim);

  // the overlay (labels, schedule), drawn in the flat camera view of uOvCam
  {
    vec2 d = w - uOvCam.xy;
    float c = cos(uOvCam.z), s = sin(uOvCam.z);
    vec2 f = vec2(c * d.x - s * d.y, s * d.x + c * d.y) * uOvCam.w;
    vec2 ouv = (f * uOvS + 0.5 * uOvSize) / uOvSize;
    if (ouv.x > 0.0 && ouv.x < 1.0 && ouv.y > 0.0 && ouv.y < 1.0) {
      vec4 o = texture(uOv, ouv);
      col = mix(col, o.rgb, o.a);
    }
  }

  // the spark's trail along the route (world width ~7px), hot near the head
  vec2 rt = route(w);
  if (rt.y <= uTrail && rt.x < 30.0) {
    float age = (uTrail - rt.y);
    float heat_ = exp(-age / 420.0);
    float wdt = 3.2 + 2.0 * heat_;
    float core = 1.0 - smoothstep(wdt - 1.2 / zoom, wdt + 1.2 / zoom, rt.x);
    vec3 tc = mix(C_BLOOD * 0.9, C_SIGNAL * 1.2, smoothstep(0.0, 0.3, heat_));
    tc = mix(tc, C_EMBER * 2.6, smoothstep(0.55, 1.0, heat_));
    col = mix(col, tc * uHeat, core);
    col += C_SIGNAL * 0.25 * exp(-rt.x / 16.0) * heat_ * uHeat;
  }
  return col;
}

void main() {
  int taps = int(uTaps);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= taps) break;
    float k = taps > 1 ? float(i) / float(taps - 1) : 0.0;
    vec4 cam = mix(uCamA, uCamB, k);
    acc += shade(toWorld(FRAG_PX, cam), cam.w);
  }
  vec3 col = acc / float(max(taps, 1));
  // falloff toward the far (top) edge: depth haze into ink
  float top = FRAG_PX.y / uRes.y;
  col = mix(col, C_INK, smoothstep(0.55, 1.05, top) * uHaze);
  // the next plate's field (the lone prompt's pool of light and motes), faded in during the drain
  if (uPool > 0.0) {
    float glow = 0.5 * uPool;
    vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    col += C_ASH * 0.035 * glow * exp(-dot(p * vec2(0.8, 1.6), p * vec2(0.8, 1.6)) * 4.0);
    vec2 g = p * 18.0 + vec2(0.0, -uT * 0.12);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    vec2 h = hash22(id);
    vec2 o = (h - 0.5) * 0.7 + 0.08 * vec2(sin(uT * 0.3 + h.x * 6.0), cos(uT * 0.23 + h.y * 6.0));
    float d = length(f - o);
    float on = step(0.86, hash12(id + 7.0));
    col += C_BONE * on * 0.18 * smoothstep(0.035, 0.0, d) * glow;
  }
  fragColor = vec4(col, 1.0);
}`;

export function makeMapPass(map: THREE.Texture, marks: THREE.Texture, ov: WorldLayer) {
  return new FSPass(MAP_FRAG, {
    uRes: { value: new THREE.Vector2(1920, 1080) }, uMap: { value: map }, uMarks: { value: marks }, uOv: { value: ov.tex },
    uCamA: { value: new THREE.Vector4(MAP.PX, MAP.Y0, 0, 1) }, uCamB: { value: new THREE.Vector4(MAP.PX, MAP.Y0, 0, 1) },
    uTaps: { value: 1 }, uK: { value: 0.00035 }, uReveal: { value: 0 }, uT: { value: 0 }, uTrail: { value: 0 }, uHeat: { value: 1 },
    uHaze: { value: 0.55 }, uDim: { value: 1 }, uTopo: { value: 1 }, uPool: { value: 0 },
    uMarkOn: { value: new THREE.Vector4() }, uMarkHot: { value: new THREE.Vector4() },
    uMarkOn2: { value: new THREE.Vector2() }, uMarkHot2: { value: new THREE.Vector2() }, uChecks: { value: new THREE.Vector2() },
    uOvCam: { value: new THREE.Vector4(0, 0, 0, 1) }, uOvSize: { value: new THREE.Vector2(ov.w, ov.h) }, uOvS: { value: WorldLayer.S },
    uFace: { value: new THREE.Vector3(FACE.x, FACE.y, FACE.r) }, uEye: { value: new THREE.Vector2() }, uEyePulse: { value: 0 }, uRip: { value: new THREE.Vector4() }, uWave: { value: new THREE.Vector4(0, 0, 0, 0) },
  });
}
