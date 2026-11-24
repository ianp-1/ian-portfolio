import { ATLAS_SPEC } from "./ascii-atlas";

export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 pos;
  if (gl_VertexID == 0) {
    pos = vec2(-1.0, -1.0);
  } else if (gl_VertexID == 1) {
    pos = vec2(3.0, -1.0);
  } else {
    pos = vec2(-1.0, 3.0);
  }
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export const PASS1_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform float uAspect;
uniform int uSceneA;
uniform int uSceneB;
uniform float uSceneBlend;
uniform vec2 uOrbit;
uniform vec2 uPointer;
uniform vec2 uPointerVel;
uniform float uPointerActive;
uniform vec4 uShockwaves[4];

const float PI = 3.14159265359;

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 curlNoise(vec2 p) {
  const float eps = 0.04;
  float n1 = noise2(p + vec2(0.0, eps));
  float n2 = noise2(p - vec2(0.0, eps));
  float n3 = noise2(p + vec2(eps, 0.0));
  float n4 = noise2(p - vec2(eps, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * eps);
}

void evalShockwaves(vec2 uv, float aspect, out float energy, out vec2 disp) {
  energy = 0.0;
  disp = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 sw = uShockwaves[i];
    if (sw.z < 0.0 || sw.z >= 1.0) continue;
    vec2 d = uv - sw.xy;
    d.x *= aspect;
    float dist = length(d);
    float radius = sw.z * 0.92;
    float fade = (1.0 - sw.z) * sw.w;
    float ring = exp(-pow((dist - radius) * 18.0, 2.0)) * fade;
    float tail = exp(-pow((dist - radius * 0.78) * 26.0, 2.0)) * 0.4 * fade;
    float e = ring + tail;
    energy += e;
    if (dist > 0.001) {
      disp += (d / dist) * ring * 0.025;
    }
  }
  energy = clamp(energy, 0.0, 1.2);
}

// ── Scene 0: Raymarched 3D Ferrofluid Metaballs ──────────────────────
float ferroSdf(vec3 p, float t, vec3 attractor, float ptrActive, float shockEnergy) {
  float d = length(p) - 0.62;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float phase = fi * 1.2566 + t * (0.55 + fi * 0.07);
    vec3 lobe = vec3(
      sin(phase * 1.1 + fi) * 0.72,
      cos(phase * 0.9 - fi * 0.5) * 0.56,
      sin(phase * 0.7 + 1.3) * 0.65
    );
    float r = 0.30 + 0.06 * sin(t * 1.3 + fi * 2.1);
    d = smin(d, length(p - lobe) - r, 0.44);
  }

  if (ptrActive > 0.01) {
    float ptrBall = length(p - attractor) - (0.28 * ptrActive + 0.08);
    d = smin(d, ptrBall, 0.52);
  }

  float spike = sin(p.x * 6.5 + t * 1.6) * sin(p.y * 6.5 - t * 1.2) * cos(p.z * 6.5 + t);
  d -= spike * (0.022 + shockEnergy * 0.035);
  return d;
}

vec3 ferroNormal(vec3 p, float t, vec3 attractor, float ptrActive, float shockEnergy) {
  const float e = 0.012;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * ferroSdf(p + k.xyy * e, t, attractor, ptrActive, shockEnergy) +
    k.yyx * ferroSdf(p + k.yyx * e, t, attractor, ptrActive, shockEnergy) +
    k.yxy * ferroSdf(p + k.yxy * e, t, attractor, ptrActive, shockEnergy) +
    k.xxx * ferroSdf(p + k.xxx * e, t, attractor, ptrActive, shockEnergy)
  );
}

vec4 evalFerro(vec2 uv, float t, vec2 orbit, vec2 ptrUv, float ptrActive, float shockEnergy) {
  vec2 p = (uv * 2.0 - 1.0) * vec2(uAspect, 1.0);

  float yaw = orbit.x + t * 0.18;
  float pitch = clamp(orbit.y + 0.12, -0.95, 0.95);
  vec3 ro = vec3(0.0, 0.0, 3.15);
  ro.yz *= rot2(pitch);
  ro.xz *= rot2(yaw);

  vec3 forward = normalize(-ro);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 rd = normalize(forward * 1.55 + right * p.x + up * p.y);

  vec2 ptrScreen = (ptrUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  vec3 attractor = right * (ptrScreen.x * 1.1) + up * (ptrScreen.y * 1.1) + forward * 0.2;

  float tRay = 0.4;
  float minD = 10.0;
  bool hit = false;
  for (int i = 0; i < 36; i++) {
    vec3 pos = ro + rd * tRay;
    float d = ferroSdf(pos, t, attractor, ptrActive, shockEnergy);
    minD = min(minD, d);
    if (d < 0.005) {
      hit = true;
      break;
    }
    if (tRay > 5.8) break;
    tRay += d * 0.88;
  }

  float ptrDist = length(p - ptrScreen);
  float ptrEnergy = exp(-ptrDist * ptrDist * 5.0) * ptrActive * 0.55;

  if (!hit) {
    float aura = exp(-max(minD, 0.0) * 8.0) * 0.24;
    return vec4(
      clamp(aura + shockEnergy * 0.35, 0.0, 1.0),
      clamp(aura * 0.8 + shockEnergy * 0.45, 0.0, 1.0),
      clamp(ptrEnergy + shockEnergy, 0.0, 1.0),
      clamp(aura * 0.9, 0.0, 1.0)
    );
  }

  vec3 hitPos = ro + rd * tRay;
  vec3 n = ferroNormal(hitPos, t, attractor, ptrActive, shockEnergy);
  vec3 v = -rd;
  vec3 l1 = normalize(vec3(0.65, 0.85, 0.55));
  vec3 l2 = normalize(vec3(-0.75, -0.35, 0.5));

  float diff = max(dot(n, l1), 0.0) * 0.65 + max(dot(n, l2), 0.0) * 0.25;
  vec3 h1 = normalize(l1 + v);
  float spec = pow(max(dot(n, h1), 0.0), 26.0);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.3);

  float lum = clamp(0.18 + diff * 0.68 + spec * 0.55 + fresnel * 0.22, 0.0, 1.0);
  float accent = clamp(fresnel * 0.82 + spec * 0.75 + shockEnergy * 0.4, 0.0, 1.0);
  return vec4(lum, accent, clamp(ptrEnergy + shockEnergy, 0.0, 1.0), 1.0);
}

// ── Scene 1: 3D Topographic LiDAR Elevation Terrain ──────────────────
float terrainH(vec2 xz, float t, vec2 ptrWorld, float ptrActive, float shockEnergy) {
  float h = 0.0;
  vec2 q = xz * 0.85 + vec2(t * 0.14, -t * 0.18);
  h += (1.0 - abs(noise2(q) * 2.0 - 1.0)) * 0.58;
  h += noise2(q * 2.15 + vec2(2.7, 1.3)) * 0.28;
  h += sin(xz.x * 1.15 + t * 0.45) * cos(xz.y * 0.95 - t * 0.35) * 0.18;

  if (ptrActive > 0.01) {
    float pd = length(xz - ptrWorld);
    h += exp(-pd * pd * 1.2) * 0.48 * ptrActive;
  }
  h += shockEnergy * 0.22;
  return h;
}

vec4 evalTerrain(vec2 uv, float t, vec2 orbit, vec2 ptrUv, float ptrActive, float shockEnergy) {
  vec2 p = (uv * 2.0 - 1.0) * vec2(uAspect, 1.0);

  float yaw = orbit.x * 0.65;
  float pitch = clamp(0.42 + orbit.y * 0.32, 0.18, 0.95);
  vec3 ro = vec3(sin(yaw) * 0.8, 1.95 + pitch * 0.9, 3.4);
  vec3 target = vec3(0.0, 0.25, -0.8);
  vec3 forward = normalize(target - ro);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 rd = normalize(forward * 1.45 + right * p.x + up * p.y);

  vec2 ptrWorld = vec2((ptrUv.x - 0.5) * uAspect * 3.8, (0.5 - ptrUv.y) * 3.2 - 0.6);

  float tRay = 0.5;
  float prevT = 0.5;
  bool hit = false;
  for (int i = 0; i < 40; i++) {
    vec3 pos = ro + rd * tRay;
    float h = terrainH(pos.xz, t, ptrWorld, ptrActive, shockEnergy);
    if (pos.y < h) {
      hit = true;
      break;
    }
    prevT = tRay;
    tRay += 0.16 + tRay * 0.045;
    if (tRay > 12.5) break;
  }

  if (!hit) {
    float horizonGlow = exp(-abs(p.y - 0.22) * 8.0) * 0.16;
    return vec4(
      clamp(horizonGlow + shockEnergy * 0.3, 0.0, 1.0),
      clamp(shockEnergy * 0.45, 0.0, 1.0),
      clamp(shockEnergy, 0.0, 1.0),
      clamp(horizonGlow, 0.0, 1.0)
    );
  }

  // Binary refinement
  float lo = prevT;
  float hi = tRay;
  for (int j = 0; j < 4; j++) {
    float mid = 0.5 * (lo + hi);
    vec3 mp = ro + rd * mid;
    if (mp.y < terrainH(mp.xz, t, ptrWorld, ptrActive, shockEnergy)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  float finalT = 0.5 * (lo + hi);
  vec3 hitPos = ro + rd * finalT;
  float h = terrainH(hitPos.xz, t, ptrWorld, ptrActive, shockEnergy);

  const float e = 0.05;
  float hx = terrainH(hitPos.xz + vec2(e, 0.0), t, ptrWorld, ptrActive, shockEnergy) -
             terrainH(hitPos.xz - vec2(e, 0.0), t, ptrWorld, ptrActive, shockEnergy);
  float hz = terrainH(hitPos.xz + vec2(0.0, e), t, ptrWorld, ptrActive, shockEnergy) -
             terrainH(hitPos.xz - vec2(0.0, e), t, ptrWorld, ptrActive, shockEnergy);
  vec3 n = normalize(vec3(-hx, 2.0 * e, -hz));

  float slope = max(dot(n, normalize(vec3(0.55, 0.78, 0.35))), 0.0);
  float contourDist = abs(fract(h * 7.5) - 0.5);
  float contour = smoothstep(0.14, 0.02, contourDist);
  float majorContour = smoothstep(0.09, 0.01, abs(fract(h * 2.5) - 0.5));
  float scanWave = exp(-pow((fract(hitPos.z * 0.14 + t * 0.24) - 0.5) * 9.0, 2.0));
  float distFade = smoothstep(12.0, 2.4, finalT);

  float lum = clamp((0.18 + slope * 0.45 + contour * 0.52 + scanWave * 0.28) * distFade, 0.0, 1.0);
  float accent = clamp((majorContour * 0.72 + contour * 0.35 + scanWave * 0.85) * distFade, 0.0, 1.0);
  float ptrProx = exp(-length(hitPos.xz - ptrWorld) * 0.9) * ptrActive;

  return vec4(lum, accent, clamp(ptrProx + shockEnergy, 0.0, 1.0), distFade);
}

// ── Scene 2: Rotating 3D Graticule Sphere & Orbital Scanline ─────────
vec4 evalOrbit(vec2 uv, float t, vec2 orbit, vec2 ptrUv, float ptrActive, float shockEnergy) {
  vec2 p = (uv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  vec3 ro = vec3(0.0, 0.0, 2.85);
  vec3 rd = normalize(vec3(p, -1.65));

  float radius = 0.94;
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float disc = b * b - c;

  float yaw = t * 0.32 + orbit.x;
  float pitch = 0.34 + orbit.y;
  vec2 ptrDir = (ptrUv - 0.5) * 0.45 * ptrActive;
  yaw += ptrDir.x;
  pitch += ptrDir.y;

  float lum = 0.0;
  float accent = 0.0;
  float presence = 0.0;

  // Orbital tilted ring intersection (plane tilted around X/Z)
  vec3 ringN = vec3(0.18, 0.92, 0.34);
  ringN.xz *= rot2(yaw * 0.4);
  ringN = normalize(ringN);
  float denom = dot(rd, ringN);
  if (abs(denom) > 0.001) {
    float tRing = -dot(ro, ringN) / denom;
    if (tRing > 0.0) {
      vec3 rHit = ro + rd * tRing;
      float rDist = length(rHit);
      float ringBand = smoothstep(0.032, 0.005, abs(rDist - 1.24));
      float behindSphere = (disc > 0.0 && tRing > (-b - sqrt(max(disc, 0.0)))) ? 0.35 : 1.0;
      float ringAngle = atan(rHit.z, rHit.x);
      float beacon = exp(-pow(sin(ringAngle - t * 1.15) * 4.5, 2.0)) * smoothstep(0.06, 0.005, abs(rDist - 1.24));
      lum = max(lum, ringBand * 0.65 * behindSphere + beacon * 0.6);
      accent = max(accent, beacon * 0.95 + ringBand * 0.25 * behindSphere);
      presence = max(presence, ringBand * behindSphere);
    }
  }

  if (disc > 0.0) {
    float sq = sqrt(disc);
    float tNear = -b - sq;
    float tFar = -b + sq;

    for (int passIdx = 0; passIdx < 2; passIdx++) {
      float tHit = passIdx == 0 ? tNear : tFar;
      float weight = passIdx == 0 ? 1.0 : 0.3;
      vec3 hitP = (ro + rd * tHit) / radius;

      vec3 q = hitP;
      q.xz *= rot2(yaw);
      q.yz *= rot2(pitch);

      float lat = asin(clamp(q.y, -1.0, 1.0));
      float lon = atan(q.z, q.x);

      float latLine = smoothstep(0.055, 0.012, abs(fract(lat / (PI / 8.0) - 0.5) - 0.5));
      float lonLine = smoothstep(0.055, 0.012, abs(fract(lon / (PI / 9.0) - 0.5) - 0.5));
      float equator = smoothstep(0.038, 0.008, abs(q.y));
      float grid = max(max(latLine, lonLine), equator);

      float scanLon = fract(lon / (2.0 * PI) - t * 0.22);
      float scanBeam = exp(-pow((scanLon - 0.5) * 14.0, 2.0));
      float scanLat = exp(-pow((q.y - sin(t * 0.7) * 0.55) * 6.0, 2.0));
      float rim = passIdx == 0 ? pow(1.0 - max(dot(hitP, -rd), 0.0), 2.5) : 0.0;

      float layerLum = (grid * 0.74 + rim * 0.36 + scanBeam * (0.25 + grid * 0.45)) * weight;
      float layerAcc = (scanBeam * (0.55 + grid * 0.45) + scanLat * equator * 0.8 + equator * 0.25) * weight;

      lum = max(lum, layerLum);
      accent = max(accent, layerAcc);
      presence = max(presence, weight * (0.28 + grid * 0.72));
    }
  }

  float ptrGlow = exp(-length(p - (ptrUv * 2.0 - 1.0) * vec2(uAspect, 1.0)) * 3.2) * ptrActive * 0.45;
  return vec4(
    clamp(lum + shockEnergy * 0.3, 0.0, 1.0),
    clamp(accent + shockEnergy * 0.4, 0.0, 1.0),
    clamp(ptrGlow + shockEnergy, 0.0, 1.0),
    clamp(presence, 0.0, 1.0)
  );
}

// ── Scene 3: Curl-Noise Fluid Wake ───────────────────────────────────
vec4 evalFlow(vec2 uv, float t, vec2 orbit, vec2 ptrUv, vec2 ptrVel, float ptrActive, float shockEnergy) {
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
  p += orbit * 0.25;

  vec2 ptrP = (ptrUv - 0.5) * vec2(uAspect, 1.0);
  vec2 dp = p - ptrP;
  float dist2 = dot(dp, dp);
  float wakeFalloff = exp(-dist2 * 8.5) * ptrActive;

  vec2 swirl = vec2(-dp.y, dp.x) * wakeFalloff * 1.4;
  vec2 dragWake = ptrVel * wakeFalloff * 2.4;

  vec2 v1 = curlNoise(p * 2.1 + vec2(t * 0.16, -t * 0.12)) + swirl + dragWake;
  vec2 adv = p + v1 * 0.28;
  vec2 v2 = curlNoise(adv * 3.4 - vec2(t * 0.11, t * 0.15));

  float vort = clamp(length(v1 + v2 * 0.5) * 0.48, 0.0, 1.0);
  float streamA = abs(sin((adv.x * 5.2 + adv.y * 3.6 + v2.x * 1.9) * PI));
  float streamB = abs(sin((adv.y * 6.0 - adv.x * 2.8 + v1.y * 2.2) * PI));

  float filament = smoothstep(0.32, 0.96, 1.0 - min(streamA, streamB));
  float wakeCrest = clamp(vort * 0.6 + wakeFalloff * 0.95 + length(dragWake) * 0.4, 0.0, 1.0);

  float topFade = smoothstep(0.955, 0.81, uv.y);
  float lum = clamp(filament * (0.45 + vort * 0.55) + wakeFalloff * 0.25 + shockEnergy * 0.35, 0.0, 1.0) * topFade;
  float accent = clamp(wakeCrest * (0.45 + filament * 0.6) + shockEnergy * 0.45, 0.0, 1.0) * topFade;
  float energy = clamp(wakeFalloff + shockEnergy, 0.0, 1.0) * topFade;
  float presence = clamp(0.25 + filament * 0.75, 0.0, 1.0) * topFade;

  return vec4(lum, accent, energy, presence);
}

vec4 evalSceneById(int id, vec2 uv, float t, vec2 orbit, vec2 ptrUv, vec2 ptrVel, float ptrActive, float shockEnergy) {
  if (id == 0) return evalFerro(uv, t, orbit, ptrUv, ptrActive, shockEnergy);
  if (id == 1) return evalTerrain(uv, t, orbit, ptrUv, ptrActive, shockEnergy);
  if (id == 2) return evalOrbit(uv, t, orbit, ptrUv, ptrActive, shockEnergy);
  return evalFlow(uv, t, orbit, ptrUv, ptrVel, ptrActive, shockEnergy);
}

void main() {
  float shockEnergy = 0.0;
  vec2 shockDisp = vec2(0.0);
  evalShockwaves(vUv, uAspect, shockEnergy, shockDisp);

  vec2 sampleUv = clamp(vUv + shockDisp * 0.5, 0.0, 1.0);

  vec4 procedural;
  if (uSceneA == uSceneB || uSceneBlend >= 0.999) {
    procedural = evalSceneById(uSceneB, sampleUv, uTime, uOrbit, uPointer, uPointerVel, uPointerActive, shockEnergy);
  } else if (uSceneBlend <= 0.001) {
    procedural = evalSceneById(uSceneA, sampleUv, uTime, uOrbit, uPointer, uPointerVel, uPointerActive, shockEnergy);
  } else {
    vec4 a = evalSceneById(uSceneA, sampleUv, uTime, uOrbit, uPointer, uPointerVel, uPointerActive, shockEnergy);
    vec4 b = evalSceneById(uSceneB, sampleUv, uTime, uOrbit, uPointer, uPointerVel, uPointerActive, shockEnergy);
    procedural = mix(a, b, smoothstep(0.0, 1.0, uSceneBlend));
  }

  fragColor = procedural;
}
`;

export const PASS2_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uAtlasTex;
uniform vec2 uGridSize;
uniform vec2 uFboTexel;
uniform vec2 uAtlasDims;
uniform float uAspect;
uniform int uCharset;
uniform vec3 uPaperColor;
uniform vec3 uInkColor;
uniform vec3 uMutedColor;
uniform vec3 uAccentColor;
uniform vec4 uClearRect;
uniform float uHasClearRect;

const float PI = 3.14159265359;

float sampleSignal(vec2 uv) {
  vec4 c = texture(uSceneTex, clamp(uv, 0.001, 0.999));
  return mix(c.r, c.a, 0.35);
}

void main() {
  vec2 cellIdx = floor(vUv * uGridSize);
  vec2 cellCenterUv = (cellIdx + 0.5) / uGridSize;
  vec2 cellUv = fract(vUv * uGridSize);

  vec4 center = texture(uSceneTex, cellCenterUv);

  // 3x3 Sobel gradient edge detection on FBO luminance/presence
  vec2 stepUv = max(uFboTexel, 0.72 / uGridSize);
  float tl = sampleSignal(cellCenterUv + vec2(-stepUv.x, stepUv.y));
  float tc = sampleSignal(cellCenterUv + vec2(0.0, stepUv.y));
  float tr = sampleSignal(cellCenterUv + vec2(stepUv.x, stepUv.y));
  float ml = sampleSignal(cellCenterUv + vec2(-stepUv.x, 0.0));
  float mr = sampleSignal(cellCenterUv + vec2(stepUv.x, 0.0));
  float bl = sampleSignal(cellCenterUv + vec2(-stepUv.x, -stepUv.y));
  float bc = sampleSignal(cellCenterUv + vec2(0.0, -stepUv.y));
  float br = sampleSignal(cellCenterUv + vec2(stepUv.x, -stepUv.y));

  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float edgeMag = length(vec2(gx, gy));

  // Negative-space feather clearing around hero copy
  float clearMask = 1.0;
  if (uHasClearRect > 0.5) {
    vec2 rectCenter = 0.5 * (uClearRect.xy + uClearRect.zw);
    vec2 rectHalf = max(vec2(0.001), 0.5 * (uClearRect.zw - uClearRect.xy));
    vec2 d = abs(cellCenterUv - rectCenter) - rectHalf;
    d.x *= uAspect;
    float boxDist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    clearMask = smoothstep(0.015, 0.16, boxDist);
  }

  float lum = clamp((center.r + center.b * 0.22) * clearMask, 0.0, 1.0);
  float presence = clamp(center.a * clearMask, 0.0, 1.0);

  float atlasRow = float(${ATLAS_SPEC.rowAscii});
  float glyphIdx = 0.0;

  if (uCharset == 0) {
    // ASCII luminance ramp + directional Sobel edges ('|', '/', '-', '\\')
    float count = float(${ATLAS_SPEC.asciiRamp.length});
    if (edgeMag * clearMask > 0.26 && (lum > 0.05 || presence > 0.16) && clearMask > 0.35) {
      atlasRow = float(${ATLAS_SPEC.rowEdge});
      float angle = mod(atan(gy, gx), PI);
      if (angle < PI * 0.125 || angle >= PI * 0.875) {
        glyphIdx = 0.0; // '|'
      } else if (angle < PI * 0.375) {
        glyphIdx = 3.0; // '\\'
      } else if (angle < PI * 0.625) {
        glyphIdx = 2.0; // '-'
      } else {
        glyphIdx = 1.0; // '/'
      }
    } else {
      atlasRow = float(${ATLAS_SPEC.rowAscii});
      glyphIdx = floor(clamp(lum, 0.0, 0.999) * count);
    }
  } else if (uCharset == 1) {
    // Braille dot progression
    atlasRow = float(${ATLAS_SPEC.rowBraille});
    float count = float(${ATLAS_SPEC.brailleRamp.length});
    float density = clamp(lum + edgeMag * 0.16 * clearMask, 0.0, 0.999);
    glyphIdx = floor(density * count);
  } else {
    // Block ramp
    atlasRow = float(${ATLAS_SPEC.rowBlock});
    float count = float(${ATLAS_SPEC.blockRamp.length});
    float density = clamp(lum + edgeMag * 0.12 * clearMask, 0.0, 0.999);
    glyphIdx = floor(density * count);
  }

  // Clamp cellUv slightly inside texel bounds to avoid bleeding adjacent atlas glyphs
  vec2 insetCellUv = clamp(cellUv, 0.03, 0.97);
  vec2 atlasUv = vec2(
    (glyphIdx + insetCellUv.x) / uAtlasDims.x,
    (atlasRow + (1.0 - insetCellUv.y)) / uAtlasDims.y
  );

  float glyphAlpha = texture(uAtlasTex, atlasUv).a;
  float accentWeight = clamp(center.g * 0.85 + center.b * 0.95, 0.0, 1.0);
  vec3 baseColor = mix(uMutedColor, uInkColor, smoothstep(0.24, 0.82, lum));
  vec3 glyphColor = mix(baseColor, uAccentColor, smoothstep(0.32, 0.88, accentWeight));

  float visibility = clearMask * smoothstep(0.03, 0.14, max(lum, presence * 0.5));
  vec3 outRgb = mix(uPaperColor, glyphColor, glyphAlpha * visibility);

  fragColor = vec4(outRgb, 1.0);
}
`;
