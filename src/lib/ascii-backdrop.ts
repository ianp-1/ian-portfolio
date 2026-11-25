import {
  ATLAS_SPEC,
  CHARSET_FONT_STACK,
  buildGlyphAtlasCanvas,
  isReducedMotionPreferred,
  mixRgb,
  observeDataTheme,
  observeReducedMotion,
  resolveThemeColors,
  rgbToCss,
  type ThemeColors,
} from "./ascii-atlas";
import { FULLSCREEN_VERTEX_SHADER } from "./ascii-shaders";

export interface BackdropHandle {
  destroy: () => void;
}

const FBO_W = 192;
const FBO_H = 108;
const STATIC_TIME_SEC = 2.4;

const PASS1_RAYMARCH_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform float uScroll;
uniform float uScrollVel;
uniform vec2 uPointer;
uniform float uAspect;

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

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  float m = p.x + p.y + p.z - s;
  vec3 q;
  if (3.0 * p.x < m) {
    q = p.xyz;
  } else if (3.0 * p.y < m) {
    q = p.yzx;
  } else if (3.0 * p.z < m) {
    q = p.zxy;
  } else {
    return m * 0.57735027;
  }
  float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
  return length(vec3(q.x, q.y - s + k, q.z - k));
}

// 1) Work: Twisted Toroidal Lattice + Sculptural Gyroid
float sdWorkSculpture(vec3 p) {
  vec3 q = p;
  q.xz *= rot2(uTime * 0.24 + uScroll * 2.2);
  q.xy *= rot2(0.38 + sin(uTime * 0.17) * 0.18 + uScrollVel * 0.18);
  vec3 twist = q;
  twist.xy *= rot2(q.z * 0.95);
  float dTorus = sdTorus(twist, vec2(1.18, 0.42));
  float gyroid = abs(dot(sin(q * 3.15), cos(q.yzx * 3.15))) / 3.15 - 0.075;
  float carved = max(dTorus, -gyroid * 0.65);
  float coreRing = sdTorus(q.xzy, vec2(0.72, 0.085));
  return smin(carved, coreRing, 0.14);
}

// 2) Experience: Sweeping Isometric Wave Ribbon Field + Orbital Band
float sdExperienceSculpture(vec3 p) {
  vec3 q = p;
  q.yz *= rot2(0.58);
  q.xz *= rot2(-0.36 + uScroll * 1.4 + uTime * 0.10);

  float h1 =
    sin(q.x * 2.0 - uTime * 0.9 + uScroll * 5.0) * 0.34 +
    cos(q.z * 2.3 + uTime * 0.65) * 0.24 +
    sin((q.x + q.z) * 3.4 - uTime * 0.4) * 0.11;
  float slab = abs(q.y + 0.10 - h1) - 0.125;
  float envelope = length(q * vec3(0.48, 0.44, 0.48)) - 1.24;
  float sheet = max(slab, envelope);

  vec3 r = p;
  r.xy *= rot2(-0.38);
  r.xz *= rot2(uTime * 0.22 + uScroll * 1.8);
  float horizonRing = sdTorus(r - vec3(0.0, 0.44, 0.0), vec2(1.42, 0.10));
  return smin(sheet * 0.72, horizonRing, 0.16);
}

// 3) Stack: Nested Hollow Octahedron + Dual Gyroscopic Rings
float sdStackSculpture(vec3 p) {
  vec3 q = p;
  q.xz *= rot2(uTime * 0.34 + uScroll * 2.4);
  q.yz *= rot2(0.46 + uTime * 0.21);
  float oct = sdOctahedron(q, 1.34);
  float tunnelX = length(q.yz) - 0.42;
  float tunnelY = length(q.xz) - 0.42;
  float tunnelZ = length(q.xy) - 0.42;
  float tunnels = min(tunnelX, min(tunnelY, tunnelZ));
  float cage = max(oct, -tunnels);

  vec3 r1 = p;
  r1.xy *= rot2(0.84 + uTime * 0.16);
  r1.yz *= rot2(0.54 + uScroll * 1.3);
  float ring1 = sdTorus(r1, vec2(1.48, 0.088));

  vec3 r2 = p;
  r2.yz *= rot2(-0.74 - uTime * 0.18);
  r2.xz *= rot2(-0.52 + uScroll * 1.7);
  float ring2 = sdTorus(r2, vec2(1.22, 0.082));

  return smin(cage, min(ring1, ring2), 0.10);
}

// 4) Contact: Tilted Accretion Disk + Standing Horizon Ripples
float sdContactSculpture(vec3 p) {
  vec3 q = p;
  q.yz *= rot2(0.52 + sin(uTime * 0.21) * 0.08);
  q.xz *= rot2(uTime * 0.18 + uScroll * 1.2);
  float r = length(q.xz);
  float ripple = sin(r * 11.5 - uTime * 2.1) * 0.065 * smoothstep(2.2, 0.65, r);
  float disk = sdTorus(vec3(q.x, (q.y - ripple) * 1.9, q.z), vec2(1.28, 0.36));
  float outerHalo = sdTorus(q, vec2(1.78, 0.072));
  float voidCore = length(q) - 0.54;
  return max(smin(disk * 0.68, outerHalo, 0.12), -voidCore);
}

float mapScene(vec3 p) {
  float s = clamp(uScroll, 0.0, 1.0);
  // Checkpoints aligned evenly to 0.00 (Work), 0.333 (Experience), 0.667 (Stack), 1.00 (Contact)
  float w0 = 1.0 - smoothstep(0.12, 0.30, s);
  float w1 = smoothstep(0.12, 0.30, s) * (1.0 - smoothstep(0.45, 0.62, s));
  float w2 = smoothstep(0.45, 0.62, s) * (1.0 - smoothstep(0.76, 0.94, s));
  float w3 = smoothstep(0.76, 0.94, s);
  float wSum = max(0.0001, w0 + w1 + w2 + w3);

  float d = 0.0;
  if (w0 > 0.001) d += (w0 / wSum) * sdWorkSculpture(p);
  if (w1 > 0.001) d += (w1 / wSum) * sdExperienceSculpture(p);
  if (w2 > 0.001) d += (w2 / wSum) * sdStackSculpture(p);
  if (w3 > 0.001) d += (w3 / wSum) * sdContactSculpture(p);
  return d;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0028, -0.0028);
  return normalize(
    e.xyy * mapScene(p + e.xyy) +
    e.yyx * mapScene(p + e.yyx) +
    e.yxy * mapScene(p + e.yxy) +
    e.xxx * mapScene(p + e.xxx)
  );
}

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * vec2(uAspect, 1.0);
  vec2 ptr = (uPointer - 0.5) * 2.0;

  float camDist = uAspect < 0.9 ? 4.45 : 3.65;
  float azim = ptr.x * 0.24 + uScroll * 0.45;
  float elev = -ptr.y * 0.18 + clamp(uScrollVel * 0.09, -0.24, 0.24);

  vec3 ro = vec3(
    sin(azim) * cos(elev),
    sin(elev) + (0.5 - uScroll) * 0.22,
    cos(azim) * cos(elev)
  ) * camDist;

  vec3 forward = normalize(-ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 rd = normalize(forward * 1.48 + right * p.x + up * p.y);

  float t = 0.0;
  float minDist = 99.0;
  bool hit = false;

  for (int i = 0; i < 40; i++) {
    vec3 pos = ro + rd * t;
    float d = mapScene(pos);
    minDist = min(minDist, d);
    if (d < 0.0038) {
      hit = true;
      break;
    }
    t += d;
    if (t > 9.5) break;
  }

  float aura = exp(-minDist * 5.2) * 0.24;

  if (!hit) {
    fragColor = vec4(aura * 0.75, aura * 0.65, 0.5, 0.0);
    return;
  }

  vec3 pos = ro + rd * t;
  vec3 n = calcNormal(pos);

  vec3 keyDir = normalize(vec3(0.68 + ptr.x * 0.42, 0.85 - ptr.y * 0.25, 0.62));
  vec3 fillDir = normalize(vec3(-0.75, -0.35, 0.55));
  vec3 viewDir = -rd;

  float diffKey = max(dot(n, keyDir), 0.0);
  float diffFill = max(dot(n, fillDir), 0.0) * 0.34;
  vec3 halfVec = normalize(keyDir + viewDir);
  float spec = pow(max(dot(n, halfVec), 0.0), 22.0);
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.5);

  float depthFade = exp(-0.042 * max(0.0, t - 1.6) * max(0.0, t - 1.6));
  float lum = clamp((0.14 + diffKey * 0.72 + diffFill + spec * 0.45) * depthFade, 0.0, 1.0);
  float rim = clamp((fresnel * 0.88 + spec * 0.65) * depthFade, 0.0, 1.0);
  float sil = clamp(depthFade, 0.0, 1.0);

  fragColor = vec4(lum, rim, clamp(n.x * 0.5 + 0.5, 0.0, 1.0), sil);
}
`;

const PASS2_BACKDROP_COMPOSITOR = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uFieldTex;
uniform sampler2D uAtlasTex;
uniform vec2 uGridSize;
uniform vec2 uFieldTexel;
uniform vec2 uAtlasDims;
uniform float uAspect;
uniform float uReveal;
uniform float uIsDark;
uniform vec3 uPaperColor;
uniform vec3 uInkColor;
uniform vec3 uMutedColor;
uniform vec3 uAccentColor;
uniform vec3 uAccentSecondaryColor;

const float PI = 3.14159265359;

float sampleField(vec2 uv) {
  vec4 c = texture(uFieldTex, clamp(uv, 0.002, 0.998));
  return c.r * 0.55 + c.a * 0.75;
}

float angleToEdgeGlyph(float angle) {
  if (angle < PI * 0.125 || angle >= PI * 0.875) {
    return 0.0; // '|'
  } else if (angle < PI * 0.375) {
    return 3.0; // '\\'
  } else if (angle < PI * 0.625) {
    return 2.0; // '-'
  }
  return 1.0; // '/'
}

void main() {
  if (uReveal <= 0.001) {
    fragColor = vec4(uPaperColor, 1.0);
    return;
  }

  vec2 cellIdx = floor(vUv * uGridSize);
  vec2 cellCenterUv = (cellIdx + 0.5) / uGridSize;
  vec2 cellUv = fract(vUv * uGridSize);

  vec4 center = texture(uFieldTex, clamp(cellCenterUv, 0.002, 0.998));

  vec2 stepUv = max(uFieldTexel, 0.72 / uGridSize);
  float tl = sampleField(cellCenterUv + vec2(-stepUv.x, stepUv.y));
  float tc = sampleField(cellCenterUv + vec2(0.0, stepUv.y));
  float tr = sampleField(cellCenterUv + vec2(stepUv.x, stepUv.y));
  float ml = sampleField(cellCenterUv + vec2(-stepUv.x, 0.0));
  float mr = sampleField(cellCenterUv + vec2(stepUv.x, 0.0));
  float bl = sampleField(cellCenterUv + vec2(-stepUv.x, -stepUv.y));
  float bc = sampleField(cellCenterUv + vec2(0.0, -stepUv.y));
  float br = sampleField(cellCenterUv + vec2(stepUv.x, -stepUv.y));

  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float edgeMag = length(vec2(gx, gy));

  float lum = center.r;
  float rim = center.g;
  float sil = center.a;

  // Keep edge slashes crisp on silhouettes and volumetric creases
  bool activeEdge = edgeMag > 0.34 && (sil > 0.05 || rim > 0.14);
  float atlasRow = float(${ATLAS_SPEC.rowAscii});
  float glyphIdx = 0.0;

  if (activeEdge) {
    atlasRow = float(${ATLAS_SPEC.rowEdge});
    float eAngle = mod(atan(gy, gx), PI);
    glyphIdx = angleToEdgeGlyph(eAngle);
  } else {
    float count = float(${ATLAS_SPEC.asciiRamp.length});
    float density = clamp(lum * 0.85 + rim * 0.32, 0.0, 0.999);
    glyphIdx = floor(density * count);
  }

  vec2 insetCellUv = clamp(cellUv, 0.03, 0.97);
  vec2 atlasUv = vec2(
    (glyphIdx + insetCellUv.x) / uAtlasDims.x,
    (atlasRow + (1.0 - insetCellUv.y)) / uAtlasDims.y
  );

  float glyphAlpha = texture(uAtlasTex, atlasUv).a;

  // Soften central reading lane while leaving margins & rims sculptural
  float centerDist = abs(cellCenterUv.x - 0.5) * 2.0;
  float centerWeight = smoothstep(0.32, 0.86, centerDist);
  float laneMin = uIsDark > 0.5 ? 0.52 : 0.48;
  float laneAtten = mix(laneMin, 1.0, centerWeight);

  float maxVis = uIsDark > 0.5 ? 0.74 : 0.68;
  float fieldStrength = smoothstep(0.05, 0.34, max(lum, max(rim, edgeMag * 0.62)));

  vec3 baseColor = mix(uMutedColor, uInkColor, smoothstep(0.18, 0.72, lum));
  vec3 edgeColor = mix(baseColor, uAccentSecondaryColor, clamp(edgeMag * 0.7, 0.0, 0.75));
  vec3 glyphColor = mix(edgeColor, uAccentColor, smoothstep(0.28, 0.85, rim));

  float alpha = uReveal * maxVis * laneAtten * fieldStrength;
  vec3 outRgb = mix(uPaperColor, glyphColor, glyphAlpha * alpha);
  fragColor = vec4(outRgb, 1.0);
}
`;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const prog = gl.createProgram();
  if (!prog) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

interface BackdropState {
  cssW: number;
  cssH: number;
  widthPx: number;
  heightPx: number;
  cols: number;
  rows: number;
  aspect: number;
  timeSec: number;
  scroll: number;
  scrollVel: number;
  reveal: number;
  pointerX: number;
  pointerY: number;
  theme: ThemeColors;
}

interface BackdropBackend {
  uploadAtlas: (atlas: HTMLCanvasElement) => void;
  resize: (widthPx: number, heightPx: number) => void;
  render: (state: BackdropState) => void;
  destroy: () => void;
}

function createWebGL2Backdrop(
  canvas: HTMLCanvasElement,
  atlasCanvas: HTMLCanvasElement,
): BackdropBackend | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const progPass1 = createProgram(gl, FULLSCREEN_VERTEX_SHADER, PASS1_RAYMARCH_FRAGMENT);
  const progPass2 = createProgram(gl, FULLSCREEN_VERTEX_SHADER, PASS2_BACKDROP_COMPOSITOR);
  const vao = gl.createVertexArray();
  const fbo = gl.createFramebuffer();
  const fieldTex = gl.createTexture();
  const atlasTex = gl.createTexture();

  if (!progPass1 || !progPass2 || !vao || !fbo || !fieldTex || !atlasTex) {
    if (progPass1) gl.deleteProgram(progPass1);
    if (progPass2) gl.deleteProgram(progPass2);
    if (vao) gl.deleteVertexArray(vao);
    if (fbo) gl.deleteFramebuffer(fbo);
    if (fieldTex) gl.deleteTexture(fieldTex);
    if (atlasTex) gl.deleteTexture(atlasTex);
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, fieldTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, FBO_W, FBO_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTex, 0);
  const fboComplete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  if (!fboComplete) {
    gl.deleteProgram(progPass1);
    gl.deleteProgram(progPass2);
    gl.deleteVertexArray(vao);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(fieldTex);
    gl.deleteTexture(atlasTex);
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);

  const u1 = {
    uTime: gl.getUniformLocation(progPass1, "uTime"),
    uScroll: gl.getUniformLocation(progPass1, "uScroll"),
    uScrollVel: gl.getUniformLocation(progPass1, "uScrollVel"),
    uPointer: gl.getUniformLocation(progPass1, "uPointer"),
    uAspect: gl.getUniformLocation(progPass1, "uAspect"),
  };

  const u2 = {
    uFieldTex: gl.getUniformLocation(progPass2, "uFieldTex"),
    uAtlasTex: gl.getUniformLocation(progPass2, "uAtlasTex"),
    uGridSize: gl.getUniformLocation(progPass2, "uGridSize"),
    uFieldTexel: gl.getUniformLocation(progPass2, "uFieldTexel"),
    uAtlasDims: gl.getUniformLocation(progPass2, "uAtlasDims"),
    uAspect: gl.getUniformLocation(progPass2, "uAspect"),
    uReveal: gl.getUniformLocation(progPass2, "uReveal"),
    uIsDark: gl.getUniformLocation(progPass2, "uIsDark"),
    uPaperColor: gl.getUniformLocation(progPass2, "uPaperColor"),
    uInkColor: gl.getUniformLocation(progPass2, "uInkColor"),
    uMutedColor: gl.getUniformLocation(progPass2, "uMutedColor"),
    uAccentColor: gl.getUniformLocation(progPass2, "uAccentColor"),
    uAccentSecondaryColor: gl.getUniformLocation(progPass2, "uAccentSecondaryColor"),
  };

  let screenW = Math.max(1, canvas.width);
  let screenH = Math.max(1, canvas.height);

  return {
    uploadAtlas: (nextAtlas: HTMLCanvasElement) => {
      if (gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, nextAtlas);
    },
    resize: (widthPx: number, heightPx: number) => {
      screenW = Math.max(1, widthPx);
      screenH = Math.max(1, heightPx);
    },
    render: (state: BackdropState) => {
      if (gl.isContextLost()) return;

      gl.bindVertexArray(vao);

      if (state.reveal > 0.001) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, FBO_W, FBO_H);
        gl.useProgram(progPass1);
        gl.uniform1f(u1.uTime, state.timeSec);
        gl.uniform1f(u1.uScroll, state.scroll);
        gl.uniform1f(u1.uScrollVel, state.scrollVel);
        gl.uniform2f(u1.uPointer, state.pointerX, state.pointerY);
        gl.uniform1f(u1.uAspect, state.aspect);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, screenW, screenH);
      gl.useProgram(progPass2);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTex);
      gl.uniform1i(u2.uFieldTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(u2.uAtlasTex, 1);

      gl.uniform2f(u2.uGridSize, state.cols, state.rows);
      gl.uniform2f(u2.uFieldTexel, 1 / FBO_W, 1 / FBO_H);
      gl.uniform2f(u2.uAtlasDims, ATLAS_SPEC.cols, ATLAS_SPEC.rows);
      gl.uniform1f(u2.uAspect, state.aspect);
      gl.uniform1f(u2.uReveal, state.reveal);
      gl.uniform1f(u2.uIsDark, state.theme.isDark ? 1.0 : 0.0);

      const { paper, ink, muted, accent, accentSecondary } = state.theme;
      gl.uniform3f(u2.uPaperColor, paper.r, paper.g, paper.b);
      gl.uniform3f(u2.uInkColor, ink.r, ink.g, ink.b);
      gl.uniform3f(u2.uMutedColor, muted.r, muted.g, muted.b);
      gl.uniform3f(u2.uAccentColor, accent.r, accent.g, accent.b);
      gl.uniform3f(
        u2.uAccentSecondaryColor,
        accentSecondary.r,
        accentSecondary.g,
        accentSecondary.b,
      );

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    destroy: () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteVertexArray(vao);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(fieldTex);
      gl.deleteTexture(atlasTex);
      gl.deleteProgram(progPass1);
      gl.deleteProgram(progPass2);
    },
  };
}

function createCanvas2DBackdrop(canvas: HTMLCanvasElement): BackdropBackend | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  return {
    uploadAtlas: () => {},
    resize: () => {},
    render: (state: BackdropState) => {
      const { cssW, cssH, widthPx, heightPx, scroll, timeSec, reveal, theme, pointerX, pointerY } =
        state;
      const dpr = widthPx / Math.max(1, cssW);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rgbToCss(theme.paper);
      ctx.fillRect(0, 0, cssW, cssH);

      if (reveal <= 0.002) {
        ctx.restore();
        return;
      }

      const cellW = 11;
      const cellH = 17;
      const cols = Math.max(28, Math.floor(cssW / cellW));
      const rows = Math.max(20, Math.floor(cssH / cellH));
      const actualCellW = cssW / cols;
      const actualCellH = cssH / rows;
      const aspect = cssW / Math.max(1, cssH);
      const ramp = ATLAS_SPEC.asciiRamp;
      const cxOffset = (pointerX - 0.5) * 0.14;
      const cyOffset = (pointerY - 0.5) * 0.1;

      ctx.font = `500 13px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let r = 0; r < rows; r++) {
        const ny = (r + 0.5) / rows;
        const py = (ny - 0.5 + cyOffset) * 2;
        for (let c = 0; c < cols; c++) {
          const nx = (c + 0.5) / cols;
          const px = (nx - 0.5 + cxOffset) * 2 * aspect;
          const rad = Math.hypot(px, py);
          const ang = Math.atan2(py, px);
          const ringDist = Math.abs(rad - (0.85 + 0.14 * Math.sin(ang * 3 + timeSec * 0.8 + scroll * 5)));
          const band = Math.exp(-ringDist * ringDist * 18);
          if (band < 0.12) continue;

          const laneMin = theme.isDark ? 0.45 : 0.36;
          const margin = smoothstep(0.35, 0.9, Math.abs(nx - 0.5) * 2);
          const alpha = reveal * (theme.isDark ? 0.62 : 0.48) * mixNum(laneMin, 1, margin) * band;
          const glyph = ramp[Math.min(ramp.length - 1, Math.floor(clamp01(band) * ramp.length))] ?? ":";
          if (glyph === " ") continue;
          const colRgb = mixRgb(theme.muted, theme.accent, clamp01(band * 0.8));
          ctx.fillStyle = rgbToCss(colRgb, alpha);
          ctx.fillText(glyph, (c + 0.5) * actualCellW, (r + 0.5) * actualCellH);
        }
      }
      ctx.restore();
    },
    destroy: () => {},
  };
}

function mixNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function mountAsciiBackdrop(canvas: HTMLCanvasElement): BackdropHandle {
  let destroyed = false;
  let reducedMotion = isReducedMotionPreferred();
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;
  let themeColors = resolveThemeColors();

  const atlasCanvas = buildGlyphAtlasCanvas();
  let backend: BackdropBackend | null = createWebGL2Backdrop(canvas, atlasCanvas);
  if (!backend) {
    backend = createCanvas2DBackdrop(canvas);
  }

  let cssW = 1;
  let cssH = 1;
  let widthPx = 1;
  let heightPx = 1;
  let cols = 96;
  let rows = 54;
  let aspect = 16 / 9;

  let timeSec = reducedMotion ? STATIC_TIME_SEC : 0;
  let scrollTarget = 0;
  let scrollSmooth = 0;
  let prevScrollY = typeof window !== "undefined" ? window.scrollY : 0;
  let scrollVelTarget = 0;
  let scrollVelSmooth = 0;
  let revealSmooth = 0;
  let revealTarget = 0;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let pointerTargetX = 0.5;
  let pointerTargetY = 0.5;
  let rafId: number | null = null;
  let lastFrameMs = 0;

  let anchorScrollYs = [900, 2600, 3900, 4400];

  const measureSectionCheckpoints = () => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const vh = Math.max(1, window.innerHeight || cssH);
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const ids = ["work", "experience", "skills", "contact"] as const;
    const ys: number[] = [];
    for (let i = 0; i < ids.length; i++) {
      const el = document.getElementById(ids[i]!);
      if (el) {
        const topDoc = el.getBoundingClientRect().top + window.scrollY;
        ys.push(clamp(topDoc, 0, maxScroll));
      } else {
        ys.push((i / 3) * maxScroll);
      }
    }
    // Pin final checkpoint near maxScroll so Stack (~0.667) -> Contact (~1.0) separates cleanly
    ys[3] = Math.max(ys[2]! + 120, Math.min(maxScroll, ys[3]!));
    anchorScrollYs = ys;
  };

  const mapSectionPhase = (scrollY: number): number => {
    const y0 = anchorScrollYs[0] ?? 900;
    const y1 = Math.max(y0 + 1, anchorScrollYs[1] ?? 2600);
    const y2 = Math.max(y1 + 1, anchorScrollYs[2] ?? 3900);
    const y3 = Math.max(y2 + 1, anchorScrollYs[3] ?? 4400);
    if (scrollY <= y0) return 0;
    if (scrollY <= y1) return ((scrollY - y0) / (y1 - y0)) / 3;
    if (scrollY <= y2) return 1 / 3 + ((scrollY - y1) / (y2 - y1)) / 3;
    if (scrollY <= y3) return 2 / 3 + ((scrollY - y2) / (y3 - y2)) / 3;
    return 1;
  };

  const sampleScrollMetrics = (snap: boolean) => {
    if (typeof window === "undefined") return;
    const vh = Math.max(1, window.innerHeight || cssH);
    const y = Math.max(0, window.scrollY);
    scrollTarget = mapSectionPhase(y);
    revealTarget = smoothstep(vh * 0.15, vh * 0.72, y);

    if (snap || reducedMotion) {
      scrollSmooth = scrollTarget;
      revealSmooth = revealTarget;
      scrollVelTarget = 0;
      scrollVelSmooth = 0;
    }
  };

  const renderSingleFrame = () => {
    if (destroyed || !backend) return;
    backend.render({
      cssW,
      cssH,
      widthPx,
      heightPx,
      cols,
      rows,
      aspect,
      timeSec,
      scroll: scrollSmooth,
      scrollVel: scrollVelSmooth,
      reveal: revealSmooth,
      pointerX,
      pointerY,
      theme: themeColors,
    });
  };

  const syncSize = () => {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width || canvas.clientWidth || window.innerWidth);
    cssH = Math.max(1, rect.height || canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const nextW = Math.max(1, Math.round(cssW * dpr));
    const nextH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    widthPx = nextW;
    heightPx = nextH;
    aspect = cssW / cssH;

    cols = clamp(Math.round(cssW / 9.5), 42, 176);
    rows = clamp(Math.round(cssH / 15.0), 28, 100);

    backend?.resize(widthPx, heightPx);
    measureSectionCheckpoints();
    sampleScrollMetrics(true);
  };

  const stopLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const tick = (nowMs: number) => {
    rafId = null;
    if (destroyed || reducedMotion || !isPageVisible) return;

    const dt = lastFrameMs > 0 ? Math.min((nowMs - lastFrameMs) / 1000, 0.05) : 0.016;
    lastFrameMs = nowMs;
    timeSec += dt;

    const kScroll = 1 - Math.exp(-dt * 9.5);
    const kPtr = 1 - Math.exp(-dt * 5.5);
    scrollSmooth += (scrollTarget - scrollSmooth) * kScroll;
    revealSmooth += (revealTarget - revealSmooth) * kScroll;
    scrollVelTarget *= Math.exp(-dt * 8.0);
    scrollVelSmooth += (scrollVelTarget - scrollVelSmooth) * kScroll;
    pointerX += (pointerTargetX - pointerX) * kPtr;
    pointerY += (pointerTargetY - pointerY) * kPtr;

    if (revealSmooth > 0.001 || revealTarget > 0.001) {
      renderSingleFrame();
    }
    rafId = requestAnimationFrame(tick);
  };

  const ensureLoopRunning = () => {
    if (destroyed || reducedMotion || !isPageVisible) {
      stopLoop();
      return;
    }
    if (rafId === null) {
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  };

  const onScroll = () => {
    const curY = Math.max(0, window.scrollY);
    const dy = curY - prevScrollY;
    prevScrollY = curY;
    if (!reducedMotion) {
      scrollVelTarget = clamp(scrollVelTarget + dy * 0.012, -2.5, 2.5);
    }
    sampleScrollMetrics(reducedMotion);
    if (reducedMotion) {
      renderSingleFrame();
    } else if (revealTarget > 0.001) {
      ensureLoopRunning();
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (reducedMotion) return;
    pointerTargetX = clamp01(e.clientX / Math.max(1, window.innerWidth));
    pointerTargetY = clamp01(e.clientY / Math.max(1, window.innerHeight));
  };

  const onWindowResize = () => {
    syncSize();
    renderSingleFrame();
  };

  const onVisibilityChange = () => {
    isPageVisible = !document.hidden;
    if (isPageVisible) {
      ensureLoopRunning();
    } else {
      stopLoop();
    }
  };

  const onContextLost = (e: Event) => {
    e.preventDefault();
    stopLoop();
    backend?.destroy();
    backend = createCanvas2DBackdrop(canvas);
    syncSize();
    renderSingleFrame();
    ensureLoopRunning();
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("resize", onWindowResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("webglcontextlost", onContextLost);

  const stopThemeObserver = observeDataTheme(() => {
    themeColors = resolveThemeColors();
    renderSingleFrame();
  });

  const stopMotionObserver = observeReducedMotion((nextReduced) => {
    reducedMotion = nextReduced;
    if (reducedMotion) {
      timeSec = STATIC_TIME_SEC;
      stopLoop();
      sampleScrollMetrics(true);
      renderSingleFrame();
    } else {
      sampleScrollMetrics(false);
      ensureLoopRunning();
    }
  });

  syncSize();
  renderSingleFrame();
  ensureLoopRunning();

  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (destroyed) return;
      buildGlyphAtlasCanvas(atlasCanvas);
      backend?.uploadAtlas(atlasCanvas);
      renderSingleFrame();
    });
  }

  return {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onWindowResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      stopThemeObserver();
      stopMotionObserver();
      backend?.destroy();
      backend = null;
    },
  };
}
