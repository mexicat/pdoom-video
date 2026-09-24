// GPU line batches: thousands of anti-aliased capsule segments per frame, in 2D pixel
// space (origin top-left, y down) or in 3D with any camera. Use for line fields,
// hatching, fur, flow streamlines, wireframes etc.
import * as THREE from 'three';
import { W, H, rtScale } from './gl';

const VERT = /* glsl */ `
precision highp float;
in vec3 position;          // quad corner: x in {0,1} along segment, y in {-1,1} across
in vec3 iA; in vec3 iB;     // segment endpoints
in vec4 iColor;             // linear rgb * intensity, alpha
in float iWidth;            // px (screen space) or world units (if worldWidth)
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
uniform vec2 res; uniform bool screen2D; uniform bool worldWidth; uniform float widthScale;
uniform float pxScale;      // physical px per logical px of the target: res is logical, AA works in physical px
out vec2 vLocal; out float vLen; out float vHalfW; out vec4 vColor;
vec4 toClip(vec3 p) {
  if (screen2D) return vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, p.z, 1.0);
  return projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
void main() {
  vec4 ca = toClip(iA), cb = toClip(iB);
  // clip against near plane crudely: skip segments behind camera
  if (ca.w <= 0.0 || cb.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 sa = ca.xy / ca.w * 0.5 * res * pxScale, sb = cb.xy / cb.w * 0.5 * res * pxScale; // physical pixels, centred
  float w = iWidth * widthScale * pxScale;
  if (worldWidth && !screen2D) {
    // approximate world width -> pixels using projection scale at each end
    float pa = projectionMatrix[1][1] * 0.5 * res.y * pxScale / ca.w, pb = projectionMatrix[1][1] * 0.5 * res.y * pxScale / cb.w;
    w = iWidth * widthScale * mix(pa, pb, position.x);
  }
  float hw = max(w * 0.5, 0.35) + 1.0; // +1px for AA
  vec2 d = sb - sa; float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float along = mix(-hw, len + hw, position.x);
  vec2 p = sa + dir * along + nrm * position.y * hw;
  float z = mix(ca.z / ca.w, cb.z / cb.w, position.x);
  gl_Position = vec4(p / (0.5 * res * pxScale), z, 1.0);
  vLocal = vec2(along, position.y * hw);
  vLen = len; vHalfW = max(w * 0.5, 0.35);
  // thin lines fade instead of shrinking below 0.7px (keeps hairlines smooth)
  vColor = iColor * vec4(1.0, 1.0, 1.0, min(1.0, w / 0.7));
}`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vLocal; in float vLen; in float vHalfW; in vec4 vColor;
out vec4 fragColor;
uniform bool premultiply;
void main() {
  float x = clamp(vLocal.x, 0.0, vLen);
  float d = length(vec2(vLocal.x - x, vLocal.y)) - vHalfW; // capsule SDF in px
  float a = clamp(0.5 - d, 0.0, 1.0) * vColor.a;
  if (a <= 0.0) discard;
  fragColor = premultiply ? vec4(vColor.rgb * a, a) : vec4(vColor.rgb, a);
}`;

export type LineBlend = 'add' | 'max' | 'normal';

export class LineBatch {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  mat: THREE.RawShaderMaterial;
  private a: Float32Array; private b: Float32Array; private c: Float32Array; private w: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  count = 0;
  scene = new THREE.Scene();
  cam2D = new THREE.OrthographicCamera(0, W, 0, H, -1, 1);

  /**
   * @param capacity max segments
   * @param opts.screen2D coordinates are pixels (x right, y down, z ignored) — default true
   * @param opts.worldWidth in 3D, widths are world units (perspective-scaled) instead of px
   * @param opts.blend 'add' (glow, default), 'max' (no double-brightness at joints), 'normal'
   */
  constructor(capacity: number, opts: { screen2D?: boolean; worldWidth?: boolean; blend?: LineBlend; depthTest?: boolean } = {}) {
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]);
    this.geo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.a = new Float32Array(capacity * 3); this.b = new Float32Array(capacity * 3);
    this.c = new Float32Array(capacity * 4); this.w = new Float32Array(capacity);
    this.attrs = [
      new THREE.InstancedBufferAttribute(this.a, 3), new THREE.InstancedBufferAttribute(this.b, 3),
      new THREE.InstancedBufferAttribute(this.c, 4), new THREE.InstancedBufferAttribute(this.w, 1),
    ];
    this.attrs.forEach((x) => x.setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iA', this.attrs[0]!); this.geo.setAttribute('iB', this.attrs[1]!);
    this.geo.setAttribute('iColor', this.attrs[2]!); this.geo.setAttribute('iWidth', this.attrs[3]!);
    const blend = opts.blend ?? 'add';
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        res: { value: new THREE.Vector2(W, H) }, screen2D: { value: opts.screen2D ?? true },
        worldWidth: { value: !!opts.worldWidth }, widthScale: { value: 1 }, pxScale: { value: 1 }, premultiply: { value: true },
      },
      transparent: true, depthWrite: false, depthTest: opts.depthTest ?? false,
      blending: THREE.CustomBlending,
    });
    const m = this.mat;
    if (blend === 'add') { m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; }
    if (blend === 'max') { m.blendEquation = THREE.MaxEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; }
    if (blend === 'normal') { m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  get capacity() { return this.w.length; }
  clear() { this.count = 0; }

  /** Add a segment. Color is LINEAR rgb (may exceed 1 for bloom), alpha 0..1. */
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, r: number, g: number, bl: number, alpha = 1) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.a[i * 3] = ax; this.a[i * 3 + 1] = ay; this.a[i * 3 + 2] = az;
    this.b[i * 3] = bx; this.b[i * 3 + 1] = by; this.b[i * 3 + 2] = bz;
    this.c[i * 4] = r; this.c[i * 4 + 1] = g; this.c[i * 4 + 2] = bl; this.c[i * 4 + 3] = alpha;
    this.w[i] = width;
  }
  /** 2D convenience. */
  seg2(ax: number, ay: number, bx: number, by: number, width: number, rgb: [number, number, number], alpha = 1) {
    this.seg(ax, ay, 0, bx, by, 0, width, rgb[0], rgb[1], rgb[2], alpha);
  }
  /** Polyline (2D or 3D points). */
  polyline(pts: { x: number; y: number; z?: number }[], width: number, rgb: [number, number, number], alpha = 1) {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!, q = pts[i]!;
      this.seg(p.x, p.y, p.z ?? 0, q.x, q.y, q.z ?? 0, width, rgb[0], rgb[1], rgb[2], alpha);
    }
  }

  /** Upload and draw into target (does not clear). For 3D pass the camera. */
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, camera?: THREE.Camera, widthScale = 1) {
    for (const at of this.attrs) { at.needsUpdate = true; at.addUpdateRange(0, this.count * at.itemSize); }
    this.geo.instanceCount = this.count;
    this.mat.uniforms.widthScale!.value = widthScale;
    // coordinates and widths are logical px of the target; AA and the hairline floor work in its physical px
    const rt = target, s = rtScale(rt);
    (this.mat.uniforms.res!.value as THREE.Vector2).set(rt ? rt.width / s : W, rt ? rt.height / s : H);
    this.mat.uniforms.pxScale!.value = s;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, camera ?? this.cam2D);
    for (const at of this.attrs) at.clearUpdateRanges();
  }
}
