// Shaders for FIG. 13 (loom): the log-polar Droste recursion of self-upgrades.

/**
 * Droste recursion over a source plate: rectangular nesting with scale s, optional log-polar
 * spiral twist (conformal, Escher-style) and a continuous zoom through the levels. The recursion
 * bottoms out at level `termLevel`: from there down the frame is `term` (FIG. 14's first shot, a
 * screen seen from behind in a dark room), so the dive lands exactly on the next plate. Source
 * texture has mipmaps; gradients are taken from the continuous mapping to avoid seams.
 */
export const FRAG_DROSTE = /* glsl */ `
uniform vec2 res; uniform float time;
uniform sampler2D src; uniform float s; uniform float zoom; uniform float twist; uniform float spin;
uniform sampler2D term; uniform float termLevel;
uniform sampler2D atlas; uniform float atlasRows; uniform vec4 labelRect; // plate uv: x0, y0, x1, y1 (y up)
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cexp(vec2 z) { return exp(z.x) * vec2(cos(z.y), sin(z.y)); }
vec2 clog(vec2 z) { return vec2(log(length(z)), atan(z.y, z.x)); }
vec3 sampleAt(vec2 z, float tw, out float level) {
  // z: centred, y up, units of half-height. Returns colour.
  float asp = res.x / res.y;
  float ls = log(s);
  vec2 L = clog(z);
  vec2 c = vec2(1.0, -tw * ls / TAU);
  vec2 W = cmul(L, c);
  W.x -= zoom * ls;
  W.y += spin;
  vec2 w = cexp(W);
  vec2 wRaw = w;
  // rectangular normalisation into [inner rect, outer rect]
  level = 0.0;
  for (int i = 0; i < 24; i++) {
    if (max(abs(w.x) / asp, abs(w.y)) < 1.0 / s) { w *= s; level += 1.0; } else break;
  }
  for (int i = 0; i < 24; i++) {
    if (max(abs(w.x) / asp, abs(w.y)) > 1.0) { w /= s; level -= 1.0; } else break;
  }
  // analytic screen-space gradients (d/dz of exp(c log z) = exp(W) c / z), so level seams don't blur
  vec2 dwdz = cmul(cexp(W), c);
  dwdz = vec2(dwdz.x * z.x + dwdz.y * z.y, dwdz.y * z.x - dwdz.x * z.y) / max(dot(z, z), 1e-8);
  if (level >= termLevel) {
    // the bottom of the recursion: one frame, not nested any further
    float k = pow(s, termLevel);
    vec2 wt = wRaw * k;
    vec2 tuv = vec2(wt.x / asp, wt.y) * 0.5 + 0.5;
    float px2t = 2.0 / res.y * k;
    vec2 tgx = dwdz * px2t, tgy = vec2(-dwdz.y, dwdz.x) * px2t;
    return textureGrad(term, tuv, vec2(tgx.x / asp, tgx.y) * 0.5, vec2(tgy.x / asp, tgy.y) * 0.5).rgb;
  }
  vec2 uv = vec2(w.x / asp, w.y) * 0.5 + 0.5;
  float px2 = 2.0 / res.y * pow(s, level);
  vec2 gx = dwdz * px2, gy = vec2(-dwdz.y, dwdz.x) * px2;
  vec2 gu = vec2(gx.x / asp, gx.y) * 0.5, gv = vec2(gy.x / asp, gy.y) * 0.5;
  vec3 col = textureGrad(src, uv, gu, gv).rgb;
  // per-level version tag: every nested frame is one upgrade newer
  vec2 lr = (uv - labelRect.xy) / (labelRect.zw - labelRect.xy);
  if (lr.x >= 0.0 && lr.x <= 1.0 && lr.y >= 0.0 && lr.y <= 1.0) {
    float row = clamp(level, 0.0, atlasRows - 1.0);
    vec2 auv = vec2(lr.x, 1.0 - (row + 1.0 - lr.y) / atlasRows);
    vec2 sc = 1.0 / (labelRect.zw - labelRect.xy);
    vec4 a = textureGrad(atlas, auv, gu * vec2(sc.x, sc.y / atlasRows), gv * vec2(sc.x, sc.y / atlasRows));
    col = mix(col, a.rgb / max(a.a, 1e-4), a.a);
  }
  return col;
}
vec3 drosteAt(vec2 uv) {
  vec2 z = (uv - 0.5) * vec2(res.x / res.y, 1.0) * 2.0;
  float lv0, lv1;
  vec3 a = sampleAt(z, 0.0, lv0);
  vec3 col = a;
  if (twist > 0.0) {
    vec3 b = sampleAt(z, 1.0, lv1);
    col = mix(a, b, twist);
  }
  return col;
}
void main() {
  vec3 col = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(k == 0 ? 0.125 : k == 1 ? 0.375 : k == 2 ? -0.125 : -0.375, k == 0 ? -0.375 : k == 1 ? 0.125 : k == 2 ? 0.375 : -0.125);
    col += drosteAt(vUv + o / res);
  }
  fragColor = vec4(col * 0.25, 1.0);
}`;
