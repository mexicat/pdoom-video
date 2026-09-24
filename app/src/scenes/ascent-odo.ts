// FIG. 6 / movement 4: a mechanical odometer of 31 digit drums (engraved cylinders).
// Odometer space: px at zoom 1, origin at the centre of the row, y UP.
import * as THREE from 'three';
import { FSPass, SCALE } from '../engine/gl';
import { F, font } from '../engine/type';

export const ODO = { N: 31, pitch: 50, face: 42, group: 170, gap: 20, winH: 48, R: 86 };
/** Right edge of the ones drum (so the whole row is centred). */
export const ODO_XR = (10 * ODO.group + ODO.pitch) / 2;

/** Centre x of drum j counted from the right (j = 0 is the ones drum). */
export function drumX(j: number) {
  const g = Math.floor(j / 3), w = j % 3;
  return ODO_XR - g * ODO.group - w * ODO.pitch - ODO.pitch / 2;
}

export function makeDigitAtlas(): THREE.CanvasTexture {
  const cw = 128, ch = 160;
  const cv = document.createElement('canvas');
  cv.width = cw * SCALE; cv.height = ch * 10 * SCALE; // SCALE x texels at 4K output
  const c = cv.getContext('2d')!;
  c.scale(SCALE, SCALE);
  c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = font(F.archivo(75, 700), 128);
  for (let k = 0; k < 10; k++) {
    c.save(); c.translate(cw / 2, k * ch + ch / 2); c.fillText(String(k), 0, 6); c.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export const ODO_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uCam;      // odometer-space point at screen centre
uniform float uZoom, uT, uHot, uSheen, uThunk;
uniform float uPos[31];  // drum positions, j = 0 is the ones drum (value 0..10)
uniform float uBlur[31]; // motion blur in digits
uniform sampler2D uAtlas;

const float PITCH = ${ODO.pitch.toFixed(1)};
const float FACE = ${ODO.face.toFixed(1)};
const float GROUP = ${ODO.group.toFixed(1)};
const float WINH = ${ODO.winH.toFixed(1)};
const float RAD = ${ODO.R.toFixed(1)};
const float XR = ${ODO_XR.toFixed(1)};

float digitInk(float d, float u) {
  // d: digit coordinate (integer = centred glyph), u: 0..1 across the face
  float k = floor(d + 0.5);
  float local = fract(d + 0.5);          // 0 = lower edge of the cell, 1 = upper
  float cell = mod(k, 10.0);
  float v = (cell + local) / 10.0;
  return texture(uAtlas, vec2(u, v)).a;
}

void main() {
  vec2 p = uCam + (FRAG_PX - 0.5 * uRes) / uZoom;
  float px = 1.0 / uZoom;
  // housing: dark engraved metal plate
  float plate = hatch((p.x * 0.35 + p.y) / 5.0, 0.18 + 0.1 * snoise(p * 0.004));
  vec3 col = C_INK2 * 0.9 + C_GRAPHITE * 0.16 * plate;
  // plate edge (the counter's body): a rounded slab around the row
  float body = sdBox(p, vec2(XR + 60.0, WINH + 56.0)) - 18.0;
  col = mix(C_INK, col, 1.0 - smoothstep(-px, px, body));
  col += C_ASH * 0.35 * (1.0 - smoothstep(0.0, 1.5 * px, abs(body))) ;
  col += C_ASH * 0.12 * (1.0 - smoothstep(0.0, 1.2 * px, abs(body + 10.0)));

  float xr = XR - p.x;
  float g = floor(xr / GROUP);
  float w = xr - g * GROUP;
  float inRow = step(0.0, xr) * step(xr, 11.0 * GROUP) ;
  float dj = floor(w / PITCH);
  float j = g * 3.0 + dj;
  bool inGroup = w < 3.0 * PITCH && j < 30.5 && xr >= 0.0;
  if (inGroup) {
    float lx = w - dj * PITCH;               // 0..PITCH from the right edge of the slot
    float fx = PITCH * 0.5 - lx;             // -25..25, + to the left
    float win = sdBox(vec2(fx, p.y), vec2(FACE * 0.5 + 3.0, WINH)) - 3.0;
    // window bevel
    col = mix(col, C_INK * 0.5, 1.0 - smoothstep(-px, px, win - 5.0));
    col += C_BONE * 0.25 * (1.0 - smoothstep(0.0, 1.2 * px, abs(win - 5.0))) * step(0.0, p.y);
    if (win < 0.0) {
      int ji = int(j + 0.5);
      float pos = 0.0, blur = 0.0;
      for (int i = 0; i < 31; i++) { if (i == ji) { pos = uPos[i]; blur = uBlur[i]; } }
      float yy = clamp(p.y / RAD, -0.999, 0.999);
      float th = asin(yy);
      float cth = cos(th);
      float d = pos - th / (TAU / 10.0);
      float u = 0.5 + fx / FACE;
      float inkc = 0.0;
      if (blur < 0.05) inkc = digitInk(d, u);
      else {
        float b = min(blur, 10.0);
        for (int s = 0; s < 10; s++) {
          float o = (float(s) / 9.0 - 0.5) * b;
          inkc += digitInk(d + o, u);
        }
        inkc /= 10.0;
      }
      bool face = abs(fx) < FACE * 0.5;
      // cylinder shading + engraved latitude lines toward the edges
      float shade = mix(0.18, 1.0, pow(cth, 1.4));
      float lat = hatch(th * 26.0, sat((1.0 - cth) * 2.4 - 0.1));
      vec3 faceCol = C_BONE * 0.86 * shade * (1.0 - 0.75 * lat);
      // a sheen that sweeps on the beat
      faceCol += C_BONE * 0.25 * exp(-pow((p.x - uSheen) / 120.0, 2.0)) * pow(cth, 6.0);
      bool hot = abs(j - 30.0) < 0.5;
      vec3 digCol = hot ? C_SIGNAL * (0.9 + 1.4 * uHot) : C_INK * 0.6;
      vec3 c = mix(faceCol, digCol * mix(1.0, shade, hot ? 0.3 : 1.0), inkc * (hot ? 1.0 : 0.95));
      if (hot) c += C_SIGNAL * 0.08 * uHot * pow(cth, 3.0);
      // rims between drums: knurled
      float rim = hatch((p.y + th * 2.0) / 3.0, 0.45) * shade;
      vec3 rimCol = C_INK2 + C_ASH * 0.4 * rim;
      c = face ? c : rimCol;
      // shadow of the window's upper lip
      c *= mix(0.35, 1.0, smoothstep(WINH, WINH - 22.0, p.y)) * mix(0.55, 1.0, smoothstep(-WINH, -WINH + 14.0, p.y));
      col = c;
    }
  }
  // thunk: the whole counter flashes faintly on the lock
  col *= 1.0 + 0.15 * uThunk;
  fragColor = vec4(col, 1.0);
}`;

export function makeOdoPass(atlas: THREE.Texture) {
  return new FSPass(ODO_FRAG, {
    uRes: { value: new THREE.Vector2(1920, 1080) }, uCam: { value: new THREE.Vector2() }, uZoom: { value: 1 },
    uT: { value: 0 }, uHot: { value: 0 }, uSheen: { value: -5000 }, uThunk: { value: 0 },
    uPos: { value: new Array(31).fill(0) }, uBlur: { value: new Array(31).fill(0) },
    uAtlas: { value: atlas },
  });
}
