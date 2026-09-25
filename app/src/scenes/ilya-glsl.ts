// Shader for FIG. 14 (ilya): a dark stage, raymarched and shaded as a white-line engraving.
//  - the room: a desk, a laptop (hinged lid, emissive screen), an empty chair; the screen is the only
//    light (analytic rectangle-light irradiance + one shadow ray), scattered in a faint haze;
//  - the theatre: proscenium arch, traveller curtains, a valance, raked rows of empty seats and one
//    spotlight on nothing (the props have been struck; their spike marks remain).
// World units are metres, y up; the laptop faces +z (the auditorium).

export const ILYA = {
  deskY: 0.75,
  hinge: [0, 0.766, -0.105] as [number, number, number],
  lidL: 0.215,
  scrU: [0.024, 0.1905] as [number, number], // screen extent along the lid, from the hinge
  scrX: 0.148, // screen half width
  led: [0, 0.7555, 0.1118] as [number, number, number],
  seamZ: 2.42, // curtain plane
};

const f = (x: number) => x.toFixed(5);

export const FRAG_ILYA = /* glsl */ `
uniform vec2 res;
uniform vec3 camPos, camR, camU, camF; uniform float focal;
uniform float time;
uniform float lidA, screenI, ledI, props, chairOn;
uniform vec4 emitRect;
uniform sampler2D screenTex, stickerTex;
uniform float stageOn, spotI, curtainK, fillI, hazeK, bounceI, gain;
uniform vec3 spotPos, spotDir; uniform vec2 spotCos;

const float DESK_Y = ${f(0.75)};
const vec3 HINGE = vec3(0.0, ${f(0.766)}, ${f(-0.105)});
const float LID_L = ${f(0.215)};
const vec2 SCR_U = vec2(${f(0.024)}, ${f(0.1905)});
const float SCR_X = ${f(0.148)};
const vec3 LED = vec3(0.0, ${f(0.7555)}, ${f(0.1118)});
const float SEAM_Z = ${f(2.42)};
// chair (seat centre), yaw
const vec3 CHAIR = vec3(0.34, 0.0, 0.66);
const float CHAIR_YAW = -0.55;

vec3 lidD() { return vec3(0.0, sin(lidA), cos(lidA)); }
vec3 lidN() { return vec3(0.0, -cos(lidA), sin(lidA)); }
vec3 lidLocal(vec3 p) { vec3 q = p - HINGE; return vec3(q.x, dot(q, lidD()), dot(q, lidN())); }
vec3 lidWorld(vec3 l) { return HINGE + vec3(l.x, 0.0, 0.0) + lidD() * l.y + lidN() * l.z; }

float sdRBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float sdCyl(vec3 p, float h, float r) { vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }

// ------------------------------------------------------------------ geometry
float mapLid(vec3 p) {
  vec3 l = lidLocal(p);
  return sdRBox(l - vec3(0.0, LID_L * 0.5, -0.0035), vec3(0.155, LID_L * 0.5, 0.003), 0.0025);
}
float mapBase(vec3 p) { return sdRBox(p - vec3(0.0, 0.758, 0.0), vec3(0.155, 0.008, 0.108), 0.004); }
float mapDesk(vec3 p) {
  float top = sdRBox(p - vec3(0.0, 0.732, 0.0), vec3(0.62, 0.018, 0.33), 0.004);
  vec3 q = vec3(abs(p.x) - 0.575, p.y - 0.36, abs(p.z) - 0.285);
  float legs = sdRBox(q, vec3(0.02, 0.36, 0.02), 0.003);
  float rail = sdRBox(vec3(p.x, p.y - 0.66, abs(p.z) - 0.285), vec3(0.56, 0.04, 0.008), 0.002);
  return min(top, min(legs, rail));
}
float mapChair(vec3 p) {
  vec3 q = p - CHAIR;
  float c = cos(CHAIR_YAW), s = sin(CHAIR_YAW);
  q.xz = mat2(c, -s, s, c) * q.xz;
  float seat = sdRBox(q - vec3(0.0, 0.47, 0.0), vec3(0.23, 0.03, 0.22), 0.025);
  // backrest, tilted back, on the far side from the desk (+z)
  vec3 b = q - vec3(0.0, 0.8, 0.25);
  float tb = 0.16; b.yz = mat2(cos(tb), -sin(tb), sin(tb), cos(tb)) * b.yz;
  float back = sdRBox(b, vec3(0.22, 0.25, 0.022), 0.03);
  float spine = sdRBox(q - vec3(0.0, 0.55, 0.235), vec3(0.03, 0.09, 0.012), 0.008);
  float post = sdCyl(q - vec3(0.0, 0.27, 0.0), 0.19, 0.022);
  // five-star base
  float a = atan(q.z, q.x);
  float sec = TAU / 5.0;
  float ai = floor(a / sec + 0.5) * sec;
  vec2 r = mat2(cos(ai), sin(ai), -sin(ai), cos(ai)) * q.xz;
  float leg = sdRBox(vec3(r.x - 0.15, q.y - 0.065, r.y), vec3(0.15, 0.014, 0.018), 0.008);
  float wheel = length(vec3(r.x - 0.29, q.y - 0.03, r.y)) - 0.03;
  return min(min(seat, back), min(min(post, spine), min(leg, wheel)));
}
float mapFloor(vec3 p) {
  if (stageOn < 0.5) return p.y;
  float deck = sdBox3(p - vec3(0.0, -0.6, -2.2), vec3(14.0, 0.6, 5.8)); // stage, apron edge at z=3.6
  float rake = max(p.z - 4.4, 0.0) * 0.14;
  float house = (p.y + 1.2 - rake) * 0.99;
  return min(deck, house);
}
float mapArch(vec3 p) {
  float wall = sdBox3(p - vec3(0.0, 3.5, 2.85), vec3(14.0, 7.0, 0.14));
  float hole = sdBox3(p - vec3(0.0, 2.35, 2.85), vec3(4.0, 2.35, 1.0));
  float a = max(wall, -hole);
  vec3 q = vec3(abs(p.x) - 4.42, p.y - 2.45, p.z - 3.0);
  a = min(a, sdRBox(q, vec3(0.36, 2.45, 0.1), 0.015));           // pilasters
  a = min(a, sdRBox(q - vec3(0.0, -2.3, 0.04), vec3(0.44, 0.16, 0.12), 0.015)); // plinths
  a = min(a, sdRBox(q - vec3(0.0, 2.5, 0.05), vec3(0.46, 0.1, 0.13), 0.015));   // capitals
  a = min(a, sdRBox(p - vec3(0.0, 5.38, 3.0), vec3(4.95, 0.46, 0.1), 0.015));   // fascia (inscription)
  a = min(a, sdRBox(p - vec3(0.0, 5.93, 3.07), vec3(5.25, 0.07, 0.18), 0.015)); // cornice
  a = min(a, sdRBox(p - vec3(0.0, 4.82, 3.05), vec3(4.95, 0.05, 0.14), 0.01));  // architrave
  return a;
}
float curtainEdge() { return mix(3.1, 0.004, curtainK); }
float mapCurtain(vec3 p, out float fu) {
  float edge = curtainEdge();
  float ax = abs(p.x);
  float span = 4.3 - edge;
  float u = (ax - edge) / span;
  fu = u;
  float bunch = 1.0 - span / 4.3;
  float amp = mix(0.055, 0.15, bunch);
  float ph = u * 8.0 * TAU + (p.x > 0.0 ? 0.0 : 2.1) + sin(u * 5.0 + p.y * 0.3) * 0.6;
  float hem = smoothstep(0.6, 0.0, p.y) * 0.05;          // the cloth pools a little at the floor
  float zc = SEAM_Z + amp * sin(ph) + hem * sin(ph * 1.0 + 1.0);
  float d = (abs(p.z - zc) - 0.018) * 0.45;
  float bx = max(edge - ax, ax - 4.45);
  float by = max(-p.y - 0.02, p.y - 4.9);
  return max(d, max(bx, by));
}
float mapValance(vec3 p) {
  float sc = 1.0 - abs(sin(p.x * PI / 0.9));
  float bottom = 4.28 + 0.13 * sc * sc;
  float zc = 2.66 + 0.035 * sin(p.x * TAU / 0.3);
  float d = (abs(p.z - zc) - 0.015) * 0.5;
  return max(d, max(abs(p.x) - 4.2, max(bottom - p.y, p.y - 4.95)));
}
float mapSeats(vec3 p) {
  if (p.z < 4.6) return 1e3;
  float rz = (p.z - 4.6) / 0.95;
  float k = floor(rz);
  float zk = 4.6 + (k + 0.5) * 0.95;
  float yk = -1.2 + (zk - 4.4) * 0.14;
  float sp = 0.56;
  float xi = floor(p.x / sp + 0.5);
  float xc = xi * sp;
  if (abs(xc) < 0.7) xc = sign(p.x) * 0.84;
  vec3 q = vec3(p.x - xc, p.y - yk, p.z - zk);
  float back = sdRBox(q - vec3(0.0, 0.66, 0.26), vec3(0.24, 0.32, 0.045), 0.05);
  float seat = sdRBox(q - vec3(0.0, 0.5, 0.05), vec3(0.22, 0.2, 0.045), 0.05);   // folded up: empty
  float arm = sdRBox(vec3(abs(q.x) - 0.28, q.y - 0.55, q.z - 0.06), vec3(0.025, 0.04, 0.25), 0.02);
  return min(min(back, seat), max(arm, -(abs(p.x) - 0.7)));
}

// material ids: 1 floor, 2 desk, 3 base, 4 lid, 5 chair, 6 arch, 7 curtain, 8 valance, 9 seats, 10 back wall
float map(vec3 p, out float mat) {
  float d = mapFloor(p); mat = 1.0;
  if (props > 0.5) {
    float dd = mapDesk(p); if (dd < d) { d = dd; mat = 2.0; }
    dd = mapBase(p); if (dd < d) { d = dd; mat = 3.0; }
    dd = mapLid(p); if (dd < d) { d = dd; mat = 4.0; }
    if (chairOn > 0.5) { dd = mapChair(p); if (dd < d) { d = dd; mat = 5.0; } }
  }
  if (stageOn > 0.5) {
    float dd = mapArch(p); if (dd < d) { d = dd; mat = 6.0; }
    float fu; dd = mapCurtain(p, fu); if (dd < d) { d = dd; mat = 7.0; }
    dd = mapValance(p); if (dd < d) { d = dd; mat = 8.0; }
    dd = mapSeats(p); if (dd < d) { d = dd; mat = 9.0; }
    dd = p.z + 6.5; if (dd < d) { d = dd; mat = 10.0; }
  }
  return d;
}
float mapOcc(vec3 p) {   // occluders for the screen light (not the lid itself)
  float d = mapFloor(p);
  if (props > 0.5) {
    d = min(d, mapDesk(p));
    d = min(d, mapBase(p));
    if (chairOn > 0.5) d = min(d, mapChair(p));
  }
  return d;
}
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0006, 0.0);
  float m;
  return normalize(vec3(map(p + e.xyy, m) - map(p - e.xyy, m), map(p + e.yxy, m) - map(p - e.yxy, m), map(p + e.yyx, m) - map(p - e.yyx, m)));
}
float march(vec3 ro, vec3 rd, out float mat) {
  float t = 0.02;
  mat = 0.0;
  for (int i = 0; i < 160; i++) {
    vec3 p = ro + rd * t;
    float m;
    float d = map(p, m);
    if (d < 0.00025 * t + 0.00005) { mat = m; return t; }
    t += d * 0.9;
    if (t > 60.0) break;
  }
  return -1.0;
}

// ------------------------------------------------------------------ light
// the emitting part of the screen (emitRect in screen uv), as 4 world corners, ccw seen from the front
void screenCorners(out vec3 c0, out vec3 c1, out vec3 c2, out vec3 c3) {
  float x0 = mix(-SCR_X, SCR_X, emitRect.x), x1 = mix(-SCR_X, SCR_X, emitRect.z);
  float u0 = mix(SCR_U.x, SCR_U.y, emitRect.y), u1 = mix(SCR_U.x, SCR_U.y, emitRect.w);
  c0 = lidWorld(vec3(x0, u0, 0.001)); c1 = lidWorld(vec3(x1, u0, 0.001));
  c2 = lidWorld(vec3(x1, u1, 0.001)); c3 = lidWorld(vec3(x0, u1, 0.001));
}
float edgeT(vec3 a, vec3 b, vec3 n) {
  float c = clamp(dot(a, b), -0.99999, 0.99999);
  vec3 cr = cross(a, b);
  float l = length(cr);
  return l < 1e-6 ? 0.0 : acos(c) * dot(cr / l, n);
}
/** Form factor of the emitting screen rectangle seen from p with normal n (Lambert's polygon formula). */
float screenFF(vec3 p, vec3 n) {
  vec3 c0, c1, c2, c3; screenCorners(c0, c1, c2, c3);
  vec3 ctr = 0.25 * (c0 + c1 + c2 + c3);
  if (dot(p - ctr, lidN()) <= 0.0) return 0.0;   // single-sided emitter
  vec3 v0 = normalize(c0 - p), v1 = normalize(c1 - p), v2 = normalize(c2 - p), v3 = normalize(c3 - p);
  float s = edgeT(v0, v1, n) + edgeT(v1, v2, n) + edgeT(v2, v3, n) + edgeT(v3, v0, n);
  return max(-s, 0.0) / TAU;
}
float softShadow(vec3 ro, vec3 rd, float tmax) {
  float res = 1.0, t = 0.004;
  for (int i = 0; i < 48; i++) {
    float h = mapOcc(ro + rd * t);
    res = min(res, 12.0 * h / t);
    t += clamp(h, 0.003, 0.08);
    if (res < 0.01 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}
vec3 screenCol() { return mix(C_BONE, C_EMBER, 0.28); }
vec3 spotCol() { return mix(C_BONE, C_EMBER, 0.14); }
float spotCone(vec3 p) {
  vec3 L = normalize(p - spotPos);
  return smoothstep(spotCos.x, spotCos.y, dot(L, spotDir));
}
/** Irradiance at a surface point (linear colour). */
vec3 lightAt(vec3 p, vec3 n) {
  vec3 E = vec3(0.0);
  if (screenI > 0.0 && props > 0.5) {
    float ff = screenFF(p, n);
    if (ff > 1e-5) {
      vec3 c0, c1, c2, c3; screenCorners(c0, c1, c2, c3);
      vec3 ctr = 0.25 * (c0 + c1 + c2 + c3);
      vec3 L = ctr - p; float dl = length(L);
      float sh = softShadow(p + n * 0.002, L / dl, dl - 0.01);
      E += screenCol() * ff * screenI * sh * 7.0;
    }
  }
  if (ledI > 0.0 && props > 0.5) {
    vec3 L = LED + vec3(0.0, 0.0, 0.003) - p; float d2 = dot(L, L);
    E += C_SIGNAL * ledI * 0.00004 * max(dot(n, normalize(L)), 0.0) / (d2 + 0.0001) * step(p.y, 0.7585);
  }
  if (spotI > 0.0) {
    vec3 L = spotPos - p; float d = length(L); L /= d;
    E += spotCol() * spotI * spotCone(p) * max(dot(n, L), 0.0) * 30.0 / (d * d);
    // the pool's bounce: a soft warm fill from the lit floor at centre stage
    vec3 B = vec3(0.0, 0.25, 0.4) - p; float db = length(B); B /= db;
    E += spotCol() * spotI * bounceI * max(dot(n, B), 0.0) / (1.0 + db * db * 0.35);
  }
  if (stageOn > 0.5) {
    float r = length((p - vec3(0.0, 1.8, 1.5)) * vec3(0.8, 1.0, 1.0));
    E += vec3(fillI) * (0.6 + 0.4 * max(n.z, 0.0)) / (1.0 + r * r * 0.06);
  }
  return E;
}

// ------------------------------------------------------------------ engraving
float hatchW(float u, float cov, float fw) {
  // box-filtered coverage of a line of half-width hw (line units) by a footprint of half-width aa
  float d = 0.5 - abs(fract(u) - 0.5);           // distance to the nearest line
  float hw = 0.5 * clamp(cov, 0.0, 1.0);
  float aa = max(fw * 0.5, 1e-3);
  float l = clamp(min(d + aa, hw) - max(d - aa, -hw), 0.0, 2.0 * aa) / (2.0 * aa);
  return mix(l, clamp(cov, 0.0, 1.0), smoothstep(0.35, 0.8, fw));
}
/** Lines at integer u (world spacing already divided out), density-LOD'd to >= ~3.2 px apart. */
float hatchLOD(float u, float cov, float fw) {
  float lv = log2(max(fw * 3.2, 1e-5));
  float l0 = max(floor(lv), 0.0);
  float k = lv > 0.0 ? fract(lv) : 0.0;
  float s0 = exp2(l0), s1 = s0 * 2.0;
  // (LOD by the logical-px footprint fw — the same line density at any output scale; AA per physical px)
  float h0 = hatchW(u / s0, cov, fw / (s0 * PX_SCALE)), h1 = hatchW(u / s1, cov, fw / (s1 * PX_SCALE));
  return mix(h0, h1, smoothstep(0.1, 0.9, k));
}
/** Pixel footprint of the world coordinate dot(p, axis) around a planar hit (neighbour-ray/plane intersections). */
float footprint(vec3 p, vec3 n, vec3 axis) {
  vec3 ro = camPos;
  float dn = dot(p - ro, n);
  vec3 rx = normalize(normalize(p - ro) + camR / focal), ry = normalize(normalize(p - ro) + camU / focal);
  float ax = dot(rx, n), ay = dot(ry, n);
  vec3 px = ro + rx * (dn / (abs(ax) < 1e-4 ? -1e-4 : ax));
  vec3 py = ro + ry * (dn / (abs(ay) < 1e-4 ? -1e-4 : ay));
  return max(abs(dot(px - p, axis)), abs(dot(py - p, axis)));
}
float toneOf(vec3 E) { float l = max(E.r, max(E.g, E.b)); return 1.0 - exp(-l * 2.2); }

vec3 shade(vec3 ro, vec3 rd, float t, float mat) {
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  if (dot(n, rd) > 0.0) n = -n;
  vec3 E = lightAt(p, n);
  float tone = toneOf(E);
  vec3 lc = E / max(max(E.r, max(E.g, E.b)), 1e-4);     // light hue (normalised)
  vec3 ink = C_BONE * 0.8;
  vec3 axis; float sp; float extra = 0.0;
  vec3 col = C_INK * 0.25;
  vec4 decal = vec4(0.0);
  if (mat < 1.5) {                       // stage boards, running up/downstage
    axis = vec3(1.0, 0.0, 0.0); sp = 0.012;
    float plank = floor(p.x / 0.15);
    float seam = 1.0 - smoothstep(0.004, 0.008, abs(fract(p.x / 0.15 + 0.5) - 0.5) * 0.15);
    float butt = 1.0 - smoothstep(0.003, 0.007, abs(fract(p.z / 2.4 + hash11(plank) ) - 0.5) * 2.4);
    tone *= (0.82 + 0.3 * hash11(plank * 3.7)) * (1.0 - 0.85 * max(seam, butt));
    if (stageOn > 0.5 && p.z > 3.6) { axis = vec3(0.0, 0.0, 1.0); tone *= 0.7; }
    // spike marks where the props stood (only once they have been struck)
    if (props < 0.5 && stageOn > 0.5) {
      vec2 q = p.xz;
      float tape = 0.0;
      for (int i = 0; i < 4; i++) {
        vec2 cn = vec2(i == 0 || i == 3 ? -0.6 : 0.6, i < 2 ? -0.31 : 0.31);
        vec2 d = (q - cn) * -sign(cn);     // >= 0 toward the prop's interior
        float ax = step(-0.006, d.x) * step(d.x, 0.13) * step(abs(d.y), 0.007);
        float az = step(-0.006, d.y) * step(d.y, 0.13) * step(abs(d.x), 0.007);
        tape = max(tape, max(ax, az));
      }
      if (tape > 0.5) return mix(C_INK, C_BONE * 0.82, clamp(tone * 2.2, 0.0, 1.0));
    }
  } else if (mat < 2.5) {                // desk
    if (abs(n.y) > 0.7) { axis = vec3(0.0, 0.0, 1.0); sp = 0.0032; tone *= 0.9; }
    else { axis = vec3(0.0, 1.0, 0.0); sp = 0.004; }
  } else if (mat < 3.5) {                // laptop base: keys in the deck, lit when the lid closes
    axis = vec3(0.0, 0.0, 1.0); sp = 0.0022;
    if (n.y > 0.7) {
      vec2 k = (p.xz - vec2(0.0, -0.035)) / vec2(0.0185, 0.0185);
      vec2 kf = abs(fract(k) - 0.5);
      float key = step(abs(p.x), 0.135) * step(abs(p.z + 0.035), 0.062) * step(max(kf.x, kf.y), 0.4);
      tone *= 0.55 + 0.6 * key;
      float pad = step(abs(p.x), 0.05) * step(abs(p.z - 0.07), 0.028);
      tone *= 1.0 - 0.35 * pad;
    }
  } else if (mat < 4.5) {                // lid: the screen is emissive, the rest dark aluminium
    vec3 l = lidLocal(p);
    if (l.z > -0.0012) {
      vec2 su = vec2(l.x / SCR_X * 0.5 + 0.5, (l.y - SCR_U.x) / (SCR_U.y - SCR_U.x));
      if (su.x > 0.0 && su.x < 1.0 && su.y > 0.0 && su.y < 1.0) {
        vec2 eu = (su - emitRect.xy) / max(emitRect.zw - emitRect.xy, vec2(1e-4));
        vec2 m2 = smoothstep(vec2(0.0), vec2(0.02), eu) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - eu);
        vec3 tx = texture(screenTex, su).rgb;
        float glow = screenI * m2.x * m2.y;
        return tx * glow * 1.7 * mix(vec3(1.0), C_EMBER / max(C_EMBER.r, 1e-3), 0.15) + C_INK * 0.4;
      }
      return C_INK * 0.3 + C_BONE * 0.02 * tone;       // bezel
    }
    axis = lidD(); sp = 0.0035;
    // the back: dark aluminium and the owner's stickers, just caught by the room's faint bounce
    // (more toward the top edge, which the screen's halo rims)
    float rim = smoothstep(0.35, 1.0, l.y / LID_L);
    float bounce = clamp(screenI, 0.0, 1.0) * props;
    tone = max(tone * 0.5, (0.013 + 0.02 * rim) * bounce);
    vec4 sk = texture(stickerTex, vec2(0.5 - l.x / 0.31, l.y / LID_L));
    decal = vec4(sk.rgb * (0.105 + 0.065 * rim) * bounce * mix(vec3(1.0), C_EMBER / max(C_EMBER.r, 1e-3), 0.12), sk.a);
  } else if (mat < 5.5) {                // chair
    axis = vec3(0.0, 1.0, 0.0); sp = 0.006;
  } else if (mat < 6.5) {                // arch
    if (abs(n.z) > 0.7 && abs(p.x) > 4.06 && abs(p.x) < 4.78 && p.y < 4.9) { axis = vec3(1.0, 0.0, 0.0); sp = 0.045; }  // fluted pilasters
    else { axis = vec3(0.0, 1.0, 0.0); sp = 0.03; }
  } else if (mat < 7.5) {                // curtain: blood velvet, lines along the folds
    float fu; mapCurtain(p, fu);
    axis = vec3(1.0, 0.0, 0.0); sp = 0.022;
    float fp = footprint(p, n, axis) / sp;
    float cov = hatchLOD(p.x / sp, pow(tone, 0.8) * 1.1, fp);
    float sheen = pow(clamp(tone * 1.4 - 0.5, 0.0, 1.0), 2.0);
    return mix(C_INK * 0.4, mix(C_BLOOD * 0.9, C_SIGNAL * 0.8, sheen), cov);
  } else if (mat < 8.5) {                // valance
    axis = vec3(1.0, 0.0, 0.0); sp = 0.012;
    float fp = footprint(p, n, axis) / sp;
    float cov = hatchLOD(p.x / sp, pow(tone, 0.8), fp);
    return mix(C_INK * 0.4, C_BLOOD * 0.85, cov);
  } else if (mat < 9.5) {                // seats: silhouettes, a rim of stage light along their tops
    vec3 toStage = normalize(vec3(0.0, 1.2, 0.5) - p);
    float rim = pow(clamp(dot(n, toStage), 0.0, 1.0), 6.0) * smoothstep(0.3, 0.9, n.y + 0.4);
    return C_INK * 0.35 + C_BONE * 0.5 * rim * clamp(spotI, 0.0, 1.0) * bounceI * 6.0;
  } else {                               // back wall
    axis = vec3(1.0, 0.0, 0.0); sp = 0.05;
    tone *= 0.5;
  }
  float fp = footprint(p, n, axis) / sp;
  float cov = hatchLOD(dot(p, axis) / sp, tone * 1.05, fp);
  return mix(mix(col, ink * mix(vec3(1.0), lc, 0.5), cov), decal.rgb, decal.a);
}

// ------------------------------------------------------------------ haze
vec3 hazeAt(vec3 x) {
  vec3 L = vec3(0.0);
  if (screenI > 0.0 && props > 0.5) {
    vec3 c0, c1, c2, c3; screenCorners(c0, c1, c2, c3);
    vec3 ctr = 0.25 * (c0 + c1 + c2 + c3);
    vec3 toC = ctr - x;
    float ff = screenFF(x, normalize(toC));
    // the desk and the laptop base block the light below the deck
    float below = x.y < DESK_Y + 0.016 && abs(x.x) < 0.62 && abs(x.z) < 0.33 ? 0.0 : 1.0;
    float underBase = x.y < 0.766 && abs(x.x) < 0.16 && x.z > -0.11 && x.z < 0.108 ? 0.0 : 1.0;
    L += screenCol() * ff * screenI * below * underBase;
  }
  if (spotI > 0.0) {
    vec3 d = x - spotPos; float dd = length(d);
    L += spotCol() * spotI * spotCone(x) * 30.0 / (dd * dd) * 0.35;
  }
  return L;
}
float hazeDens(vec3 x) { return 0.7 + 0.6 * snoise(x * vec3(2.2, 1.4, 2.2) + vec3(0.0, time * 0.09, time * 0.05)); }
vec3 volume(vec3 ro, vec3 rd, float tEnd, float jit) {
  if (hazeK <= 0.0) return vec3(0.0);
  vec3 acc = vec3(0.0);
  float tE = tEnd < 0.0 ? 60.0 : tEnd;
  if (stageOn < 0.5) {
    // the room: the scattering that matters is within a metre of the screen; sample densely around
    // the ray's closest approach to it, sparsely elsewhere
    vec3 c = lidWorld(vec3(0.0, 0.5 * (SCR_U.x + SCR_U.y), 0.0));
    float tc = max(dot(c - ro, rd), 0.0);
    float a = max(tc - 0.9, 0.0), b = min(tc + 0.9, tE);
    const int N = 36;
    float dt = max(b - a, 0.0) / float(N);
    for (int i = 0; i < N; i++) {
      vec3 x = ro + rd * (a + (float(i) + jit) * dt);
      float pocket = exp(-length(x - c) / 0.26);
      acc += hazeAt(x) * hazeDens(x) * pocket * dt;
    }
    // far tail (sparse)
    float a2 = b, b2 = min(tE, b + 5.0);
    float dt2 = max(b2 - a2, 0.0) / 8.0;
    for (int i = 0; i < 8; i++) {
      vec3 x = ro + rd * (a2 + (float(i) + jit) * dt2);
      acc += hazeAt(x) * exp(-length(x - c) / 0.26) * dt2;
    }
  } else {
    float t1 = min(tE, 40.0);
    const int N = 48;
    float dt = t1 / float(N);
    for (int i = 0; i < N; i++) {
      vec3 x = ro + rd * ((float(i) + jit) * dt);
      acc += hazeAt(x) * hazeDens(x * 0.35) * dt;
    }
  }
  return acc * hazeK;
}

vec3 ledGlow(vec3 ro, vec3 rd, float tMax) {
  if (ledI <= 0.0 || props < 0.5) return vec3(0.0);
  vec3 lp = LED - ro; float tl = dot(lp, rd);
  if (tl <= 0.0 || (tMax > 0.0 && tl > tMax + 0.01)) return vec3(0.0);
  float apx = length(lp - rd * tl) / tl * focal;
  float core = exp(-apx * apx / 10.0) * 5.0;
  float halo = exp(-apx * apx / 260.0) * 0.5 + 0.03 / (1.0 + apx * apx / 5000.0);
  return (vec3(1.0, 0.8, 0.62) * core + C_SIGNAL * halo) * ledI;
}

vec3 pixel(vec2 px, float jit, out float tHit) {
  vec3 rd = normalize(camF * focal + camR * px.x + camU * px.y);
  float mat;
  float t = march(camPos, rd, mat);
  tHit = t;
  vec3 col = C_INK * 0.2;
  if (t > 0.0) col = shade(camPos, rd, t, mat);
  return col;
}

void main() {
  vec2 px0 = vUv * res - 0.5 * res;
  vec3 col = vec3(0.0);
  float tc = -1.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(k == 0 ? 0.125 : k == 1 ? 0.375 : k == 2 ? -0.125 : -0.375, k == 0 ? -0.375 : k == 1 ? 0.125 : k == 2 ? 0.375 : -0.125);
    float th;
    col += pixel(px0 + o / PX_SCALE, 0.0, th); // (supersamples within one physical px)
    if (k == 0) tc = th;
  }
  col *= 0.25;
  vec3 rd = normalize(camF * focal + camR * px0.x + camU * px0.y);
  float jit = hash12(gl_FragCoord.xy + fract(time * 7.31) * 97.0);
  col += volume(camPos, rd, tc, jit);
  col += ledGlow(camPos, rd, tc);
  fragColor = vec4(col * gain, 1.0);
}`;
