// dense, movement 3: "Hundred thousand GPU".
// A top-down datacenter floor of exactly 100,000 cells (400 x 250, in pods and rack rows),
// flickering in activity waves. The lyric is spelled by the cells themselves: a 400x250 mask
// (one texel per GPU) says HUNDRED / THOUSAND / GPU and the cells light as each word is sung.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { F, font } from '../engine/type';

export const GX = 400, GY = 250;

export class GpuFloor {
  pass: FSPass;
  mask: THREE.DataTexture;
  /** World position (relative to the floor centre, y up) of a lit cell in the first letter. */
  focus: [number, number] = [0, 0];
  constructor(words: string[]) {
    // mask: R = in text, G = u within word, B = word index / 4
    const cv = document.createElement('canvas');
    cv.width = GX; cv.height = GY;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    const data = new Uint8Array(GX * GY * 4);
    const fam = F.archivo(100, 900);
    const rows = words.length;
    const top = 44, bot = 206; // keep the lyric inside the rows that stay on screen at full view
    const lineH = (bot - top) / rows;
    words.forEach((w, wi) => {
      c.clearRect(0, 0, GX, GY);
      c.fillStyle = '#fff';
      let size = lineH * 1.05;
      c.font = font(fam, size);
      let mw = c.measureText(w).width;
      if (mw > GX * 0.86) { size *= (GX * 0.86) / mw; c.font = font(fam, size); mw = c.measureText(w).width; }
      const x0 = Math.round((GX - mw) / 2);
      const base = Math.round(top + lineH * (wi + 1) - lineH * 0.1);
      c.fillText(w, x0, base);
      const im = c.getImageData(0, 0, GX, GY).data;
      if (wi === 0) {
        // a cell inside the first letter's stem: first lit column, middle row
        const midRow = Math.round(base - size * 0.36);
        for (let x = 0; x < GX; x++) if (im[(midRow * GX + x) * 4 + 3]! > 100) {
          const cx = x + 3, r = GY - 1 - midRow;
          const WX = GX + (GX / 20 - 1) * 1.2, WY = GY + (GY / 10 - 1) * 2.0;
          this.focus = [cx + Math.floor(cx / 20) * 1.2 + 0.5 - WX / 2, r + Math.floor(r / 10) * 2.0 + 0.5 - WY / 2];
          break;
        }
      }
      for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
        const a = im[(y * GX + x) * 4 + 3]!;
        if (a > 100) {
          // texture rows are bottom-up for sampling with vUv (y up)
          const o = ((GY - 1 - y) * GX + x) * 4;
          data[o] = 255;
          data[o + 1] = Math.round(((x - x0) / Math.max(1, mw)) * 255);
          data[o + 2] = wi * 64;
          data[o + 3] = 255;
        }
      }
    });
    this.mask = new THREE.DataTexture(data, GX, GY, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.mask.magFilter = THREE.NearestFilter;
    this.mask.minFilter = THREE.NearestFilter;
    this.mask.needsUpdate = true;

    this.pass = new FSPass(/* glsl */ `
      uniform sampler2D mask; uniform vec2 camC; uniform float camZ; uniform float camRot; uniform float t;
      uniform vec4 prog; uniform vec3 ghost; uniform vec4 beatT; uniform float detail; uniform float heatK; uniform float lit;
      const vec2 G = vec2(${GX}.0, ${GY}.0);
      // floor layout: pods of 20 columns (gap 1.2), rack rows of 10 (aisle 2.0)
      vec2 cellToWorld(vec2 c) {
        return vec2(c.x + floor(c.x / 20.0) * 1.2, c.y + floor(c.y / 10.0) * 2.0);
      }
      const vec2 WSIZE = vec2(${GX}.0 + ${GX / 20 - 1}.0 * 1.2, ${GY}.0 + ${GY / 10 - 1}.0 * 2.0);
      void main() {
        vec2 px = (vUv - 0.5) * vec2(1920.0, 1080.0);
        vec2 w = rot2(camRot) * px / camZ + camC + WSIZE * 0.5; // world units (1 = cell pitch)
        // invert layout: find pod/rack
        float podW = 20.0 + 1.2, rackH = 10.0 + 2.0;
        float pod = floor(w.x / podW), rack = floor(w.y / rackH);
        vec2 inPod = vec2(w.x - pod * podW, w.y - rack * rackH);
        vec2 cell = vec2(pod * 20.0 + floor(inPod.x), rack * 10.0 + floor(inPod.y));
        vec2 f = fract(inPod);
        bool valid = inPod.x < 20.0 && inPod.y < 10.0 && cell.x >= 0.0 && cell.y >= 0.0 && cell.x < G.x && cell.y < G.y;
        vec3 col = C_INK * 0.9;
        // floor: faint tile grid in aisles
        vec2 tile = fract(w / 3.0);
        float fw = fwidth(w.x) / 3.0;
        col += C_GRAPHITE * 0.05 * pxLine(min(tile.x, tile.y), 0.0, fw * 1.5);
        if (valid) {
          vec4 m = texture(mask, (cell + 0.5) / G);
          float wi = floor(m.b * 4.0 + 0.5);
          float pr = wi < 0.5 ? prog.x : (wi < 1.5 ? prog.y : prog.z);
          float isTxt = step(0.5, m.r) * step(m.g, pr) * step(0.0001, pr);
          float ghostTxt = step(0.5, m.r) * (1.0 - isTxt) * (wi < 0.5 ? ghost.x : (wi < 1.5 ? ghost.y : ghost.z));
          // activity: travelling waves + beat rings + hashed flicker
          float h = hash12(cell);
          vec2 cc = cell - G * 0.5;
          float a = 0.5 + 0.5 * sin(dot(cc, vec2(0.035, 0.021)) - t * 5.0 + h * 0.8);
          a *= 0.5 + 0.5 * sin(dot(cc, vec2(-0.012, 0.041)) + t * 3.3);
          for (int i = 0; i < 4; i++) {
            float dt = t - beatT[i];
            if (dt > 0.0 && dt < 1.2) {
              float r = dt * 260.0;
              float d = length(cc * vec2(1.0, 1.25));
              float fr = d - r;
              a += (exp(-pow(fr / 3.5, 2.0)) * 1.4 + step(fr, 0.0) * exp(fr / 30.0) * 0.35) * exp(-dt * 2.2);
            }
          }
          float flick = step(0.975, hash12(cell + floor(t * 24.0)));
          a = clamp(a * (0.7 + 0.45 * h) + flick * 0.3, 0.0, 1.4) * heatK;
          // cell body (square with a 12% gap), die + HBM detail at close range
          vec2 q = f - 0.5;
          float aa = fwidth(q.x) * 1.2;
          // the cell edge keeps its 1x softness in logical px (the colour is ~body^2, so a sharper edge brightens the floor)
          float aaB = aa * PX_SCALE;
          float body = 1.0 - smoothstep(0.41 - aaB, 0.41 + aaB, max(abs(q.x), abs(q.y)));
          float die = 1.0 - smoothstep(0.16 - aa, 0.16 + aa, max(abs(q.x), abs(q.y)));
          vec2 hq = abs(q) - vec2(0.27, 0.27);
          float hbm = (1.0 - smoothstep(0.05 - aa, 0.05 + aa, max(abs(hq.x), abs(hq.y) - 0.04))) * detail;
          float led = (1.0 - smoothstep(0.03 - aa, 0.03 + aa, length(q - vec2(0.32, -0.32)))) * detail;
          vec3 idle = C_INK2 * 1.6 + C_GRAPHITE * 0.12;
          vec3 hot = heat3(a);
          vec3 c = idle * body;
          c = mix(c, hot * 0.9 + idle * 0.3, body * (1.0 - detail * 0.55) * smoothstep(0.05, 0.9, a));
          c += hot * die * detail * (0.6 + a);
          c += C_GRAPHITE * 0.5 * hbm;
          c += C_EMBER * 2.0 * led * step(0.5, fract(h * 13.0 + t * 2.0));
          // lyric cells: solid bone, slightly glowing edge
          c = mix(c, C_BONE * (0.92 + 0.08 * die) * lit, isTxt * body);
          c = mix(c, C_BONE * 0.22, ghostTxt * body);
          col = mix(col, c, body) + c * (1.0 - body) * 0.0;
        }
        fragColor = vec4(col, 1.0);
      }
    `.replace('vec3 hot = heat3(a);', 'vec3 hot = heat(clamp(a * 0.62, 0.0, 0.9));'), {
      mask: { value: this.mask }, camC: { value: new THREE.Vector2() }, camZ: { value: 4 }, camRot: { value: 0 }, t: { value: 0 },
      prog: { value: new THREE.Vector4() }, ghost: { value: new THREE.Vector3() }, beatT: { value: new THREE.Vector4(-9, -9, -9, -9) }, detail: { value: 1 }, heatK: { value: 1 }, lit: { value: 1 },
    });
  }
  get worldSize() { return [GX + (GX / 20 - 1) * 1.2, GY + (GY / 10 - 1) * 2.0] as const; }
}
