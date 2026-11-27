import {
  CHARSET_FONT_STACK,
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

const SKYLINE_SRC = "/boston-skyline.jpg";
const SKYLINE_W = 2560;
const SKYLINE_H = 1250;
const SKYLINE_ASPECT = SKYLINE_W / SKYLINE_H;
const STATIC_TIME_SEC = 2.4;

// 32-character perceptually ordered photographic micro-ASCII ramp (POT 1024x64 atlas)
const MICRO_RAMP = " .'`^,:;-~=+*!?/|1()[]{}oxae#%8@";
const MICRO_ATLAS_CELL_W = 32;
const MICRO_ATLAS_CELL_H = 64;

function buildMicroAtlasCanvas(existing?: HTMLCanvasElement): HTMLCanvasElement {
  const cols = MICRO_RAMP.length;
  const canvas = existing ?? document.createElement("canvas");
  canvas.width = cols * MICRO_ATLAS_CELL_W;
  canvas.height = MICRO_ATLAS_CELL_H;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 44px ${CHARSET_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";

  for (let col = 0; col < cols; col++) {
    const ch = MICRO_RAMP[col] ?? " ";
    if (ch === " ") continue;
    const x = col * MICRO_ATLAS_CELL_W;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, MICRO_ATLAS_CELL_W, MICRO_ATLAS_CELL_H);
    ctx.clip();
    ctx.fillText(ch, x + MICRO_ATLAS_CELL_W * 0.5, MICRO_ATLAS_CELL_H * 0.52);
    ctx.restore();
  }
  return canvas;
}

const BOSTON_BACKDROP_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSkylineTex;
uniform sampler2D uAtlasTex;
uniform vec2 uGridSize;
uniform vec2 uSkylineTexel;
uniform float uAspect;
uniform float uTime;
uniform float uScroll;
uniform float uReveal;
uniform float uHasSkyline;
uniform float uIsDark;
uniform vec3 uPaperColor;
uniform vec3 uInkColor;
uniform vec3 uMutedColor;
uniform vec3 uAccentColor;
uniform vec3 uAccentSecondaryColor;

const float IMG_ASPECT = ${(SKYLINE_W / SKYLINE_H).toFixed(6)};

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Branchless 4x4 ordered Bayer threshold in [-0.5, 0.5]
float bayer4x4(vec2 cellIdx) {
  int x = int(mod(cellIdx.x, 4.0));
  int y = int(mod(cellIdx.y, 4.0));
  int a0 = x & 1;
  int b0 = y & 1;
  int a1 = (x >> 1) & 1;
  int b1 = (y >> 1) & 1;
  int val = (((a0 ^ b0) * 2 + b0) * 4) + ((a1 ^ b1) * 2 + b1);
  return (float(val) + 0.5) / 16.0 - 0.5;
}

vec2 screenToSkylineUv(vec2 uv) {
  // Edge-to-edge cover framing (zero seams or blank bars across all viewports)
  float coverZoom = 1.06;
  float spanX = clamp((uAspect / IMG_ASPECT) / coverZoom, 0.36, 1.0);
  float imgHeightVh = (uAspect / IMG_ASPECT) / spanX;

  float panRangeX = max(0.0, 1.0 - spanX);
  float panX = clamp(uScroll * panRangeX, 0.0, panRangeX);

  float extraH = max(0.0, imgHeightVh - 1.0);
  float topOffset = -extraH * mix(0.38, 0.60, uScroll);

  float screenYTop = 1.0 - uv.y;
  float texX = panX + uv.x * spanX;
  float texY = (screenYTop - topOffset) / max(0.001, imgHeightVh);
  return vec2(texX, texY);
}

float rgbLum(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 samplePhoto(vec2 texUv) {
  return texture(uSkylineTex, clamp(texUv, 0.001, 0.999)).rgb;
}

void main() {
  if (uReveal <= 0.001 || uHasSkyline < 0.5) {
    fragColor = vec4(uPaperColor, 1.0);
    return;
  }

  vec2 cellIdx = floor(vUv * uGridSize);
  vec2 cellCenterUv = (cellIdx + 0.5) / uGridSize;
  vec2 cellUv = fract(vUv * uGridSize);

  vec2 cellTexUv = screenToSkylineUv(cellCenterUv);
  vec2 pixelTexUv = screenToSkylineUv(vUv);

  float waterMask = smoothstep(0.754, 0.778, pixelTexUv.y);
  float ripple = (
    sin(pixelTexUv.y * 85.0 - uTime * 0.55 + pixelTexUv.x * 14.0) * 0.50 +
    sin(pixelTexUv.y * 150.0 + uTime * 0.38 - pixelTexUv.x * 20.0) * 0.30 +
    cos(pixelTexUv.y * 220.0 - uTime * 0.78 + pixelTexUv.x * 32.0) * 0.20
  ) * 0.0028 * waterMask;

  vec2 cellSampleUv = vec2(clamp(cellTexUv.x + ripple, 0.001, 0.999), clamp(cellTexUv.y, 0.001, 0.999));
  vec2 pixelSampleUv = vec2(clamp(pixelTexUv.x + ripple, 0.001, 0.999), clamp(pixelTexUv.y, 0.001, 0.999));

  // Sub-cell photographic sampling preserves sharp building silhouettes & tiny window panes
  vec3 rgbCell = samplePhoto(cellSampleUv);
  vec3 rgbPhoto = samplePhoto(pixelSampleUv);
  vec3 rgb = mix(rgbCell, rgbPhoto, 0.54);
  float lum = rgbLum(rgb);

  // Fine micro-contrast against neighboring texels keeps windows and rooflines razor-sharp
  vec2 stepUv = max(uSkylineTexel * 1.25, vec2(0.5) / uGridSize);
  float nL = rgbLum(samplePhoto(pixelSampleUv + vec2(-stepUv.x, 0.0)));
  float nR = rgbLum(samplePhoto(pixelSampleUv + vec2(stepUv.x, 0.0)));
  float nT = rgbLum(samplePhoto(pixelSampleUv + vec2(0.0, -stepUv.y)));
  float nB = rgbLum(samplePhoto(pixelSampleUv + vec2(0.0, stepUv.y)));
  float avgNbr = (nL + nR + nT + nB) * 0.25;
  float localDiff = abs(lum - avgNbr);

  // Slow drifting twilight sky sheen
  float skyMask = 1.0 - smoothstep(0.32, 0.56, pixelTexUv.y);
  float skyWave = (
    sin(pixelTexUv.x * 5.2 - uTime * 0.16 + pixelTexUv.y * 3.4) * 0.6 +
    cos(pixelTexUv.x * 8.6 + uTime * 0.11 - pixelTexUv.y * 2.2) * 0.4
  ) * 0.036 * skyMask;
  lum = clamp(lum + skyWave, 0.0, 1.0);

  // Calm Harbor water shimmer & soft specular glints
  float waterShimmer = 0.94 + 0.06 * sin(pixelTexUv.y * 105.0 - uTime * 0.65 + pixelTexUv.x * 9.0);
  float waterSparkle = pow(
    0.5 + 0.5 * sin(pixelTexUv.y * 130.0 - uTime * 0.68 + pixelTexUv.x * 22.0) *
      cos(pixelTexUv.x * 36.0 - uTime * 0.35),
    5.0
  ) * waterMask * 0.14;
  lum = mix(lum, clamp(lum * waterShimmer + waterSparkle, 0.0, 1.0), waterMask);

  // Calm city windows & rooftop beacons with gentle twinkle & slow pulses
  float warmth = clamp((rgb.r - rgb.b) * 1.9, 0.0, 1.0);
  float windowBase = smoothstep(0.28, 0.68, lum) * warmth * (1.0 - smoothstep(0.0, 0.45, pixelTexUv.y) * 0.4);
  float twinkleSeed = hash21(floor(cellTexUv * vec2(340.0, 165.0)));
  float twinkle = 0.72 + 0.28 * sin(uTime * (0.45 + twinkleSeed * 0.85) + twinkleSeed * 6.28318);
  float pulse = pow(
    0.5 + 0.5 * sin(uTime * (0.30 + twinkleSeed * 0.55) + twinkleSeed * 12.566),
    6.0
  ) * 0.22;
  float isWindow = windowBase * (twinkle + pulse);

  // Contrast S-curve & cohesive 3-stop twilight tint blended with vivid photo RGB
  float shapedLum = smoothstep(0.05, 0.90, lum);
  vec3 shadowTint = vec3(0.08, 0.07, 0.14);
  vec3 midTint = vec3(0.47, 0.38, 0.58);
  vec3 highTint = vec3(0.88, 0.71, 0.67);
  vec3 duoTint = shapedLum < 0.5
    ? mix(shadowTint, midTint, shapedLum * 2.0)
    : mix(midTint, highTint, (shapedLum - 0.5) * 2.0);
  vec3 tintedPhoto = mix(duoTint, rgb, 0.56 + warmth * 0.30);

  // Ordered-dithered 32-char micro-ASCII atlas lookup with calm glyph breath
  float cellSeed = hash21(cellIdx);
  float glyphBreath = sin(uTime * (0.55 + cellSeed * 0.65) + cellSeed * 6.28318) * 0.016 * (0.45 + 0.55 * max(skyMask, waterMask));
  float dither = bayer4x4(cellIdx) * 0.042 + glyphBreath;
  float rampCount = float(${MICRO_RAMP.length});
  float glyphDensity = uIsDark > 0.5
    ? clamp(pow(clamp(lum, 0.0, 1.0), 0.85) * 0.95 + localDiff * 0.72 + isWindow * 0.32 + dither, 0.02, 0.999)
    : clamp((1.0 - lum) * 0.93 + localDiff * 0.66 + isWindow * 0.22 + dither, 0.02, 0.999);

  float glyphIdx = floor(glyphDensity * rampCount);
  vec2 insetCellUv = clamp(cellUv, 0.06, 0.94);
  vec2 atlasUv = vec2(
    (glyphIdx + insetCellUv.x) / rampCount,
    1.0 - insetCellUv.y
  );
  float glyphAlpha = texture(uAtlasTex, atlasUv).a;

  // Ultra-HD photographic micro-ASCII cell blend
  vec3 cellRgb;
  if (uIsDark > 0.5) {
    vec3 cellBed = tintedPhoto * (0.24 + 0.48 * lum);
    vec3 cellGlyph = tintedPhoto * (1.02 + 0.54 * glyphDensity) + vec3(0.22, 0.15, 0.07) * isWindow;
    cellRgb = mix(cellBed, clamp(cellGlyph, 0.0, 1.0), glyphAlpha * 0.88);
  } else {
    float invLum = 1.0 - lum;
    vec3 darkInk = mix(vec3(0.11, 0.09, 0.19), tintedPhoto * 0.56, 0.48);
    vec3 skyWash = mix(uPaperColor, tintedPhoto, 0.40);
    vec3 cellBed = mix(skyWash, darkInk, smoothstep(0.24, 0.86, invLum) * 0.36);
    vec3 cellGlyph = mix(tintedPhoto * 0.88, darkInk, smoothstep(0.16, 0.80, invLum));
    cellRgb = mix(cellBed, cellGlyph, glyphAlpha * 0.86);
  }

  // Smooth uniform cubic crossfade across Hero -> Skyline transition
  float centerDist = abs(cellCenterUv.x - 0.5) * 2.0;
  float centerWeight = smoothstep(0.38, 0.94, centerDist);
  float laneMin = uIsDark > 0.5 ? 0.62 : 0.54;
  float laneAtten = mix(laneMin, 1.0, centerWeight);
  float topFeather = smoothstep(0.0, 0.10, 1.0 - cellCenterUv.y);
  float maxVis = uIsDark > 0.5 ? 0.78 : 0.58;

  float easedReveal = uReveal * uReveal * (3.0 - 2.0 * uReveal);
  float vis = easedReveal * maxVis * laneAtten * topFeather;
  vec3 outRgb = mix(uPaperColor, cellRgb, vis);
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

function mixNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixVec3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
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
  reveal: number;
  theme: ThemeColors;
}

interface BackdropBackend {
  uploadAtlas: (atlas: HTMLCanvasElement) => void;
  uploadSkyline: (img: HTMLImageElement) => void;
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

  const prog = createProgram(gl, FULLSCREEN_VERTEX_SHADER, BOSTON_BACKDROP_FRAGMENT);
  const vao = gl.createVertexArray();
  const skylineTex = gl.createTexture();
  const atlasTex = gl.createTexture();

  if (!prog || !vao || !skylineTex || !atlasTex) {
    if (prog) gl.deleteProgram(prog);
    if (vao) gl.deleteVertexArray(vao);
    if (skylineTex) gl.deleteTexture(skylineTex);
    if (atlasTex) gl.deleteTexture(atlasTex);
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, skylineTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );

  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
  gl.generateMipmap(gl.TEXTURE_2D);

  const u = {
    uSkylineTex: gl.getUniformLocation(prog, "uSkylineTex"),
    uAtlasTex: gl.getUniformLocation(prog, "uAtlasTex"),
    uGridSize: gl.getUniformLocation(prog, "uGridSize"),
    uSkylineTexel: gl.getUniformLocation(prog, "uSkylineTexel"),
    uAspect: gl.getUniformLocation(prog, "uAspect"),
    uTime: gl.getUniformLocation(prog, "uTime"),
    uScroll: gl.getUniformLocation(prog, "uScroll"),
    uReveal: gl.getUniformLocation(prog, "uReveal"),
    uHasSkyline: gl.getUniformLocation(prog, "uHasSkyline"),
    uIsDark: gl.getUniformLocation(prog, "uIsDark"),
    uPaperColor: gl.getUniformLocation(prog, "uPaperColor"),
    uInkColor: gl.getUniformLocation(prog, "uInkColor"),
    uMutedColor: gl.getUniformLocation(prog, "uMutedColor"),
    uAccentColor: gl.getUniformLocation(prog, "uAccentColor"),
    uAccentSecondaryColor: gl.getUniformLocation(prog, "uAccentSecondaryColor"),
  };

  let screenW = Math.max(1, canvas.width);
  let screenH = Math.max(1, canvas.height);
  let texW = SKYLINE_W;
  let texH = SKYLINE_H;
  let hasSkyline = false;

  return {
    uploadAtlas: (nextAtlas: HTMLCanvasElement) => {
      if (gl.isContextLost()) return;
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, nextAtlas);
      gl.generateMipmap(gl.TEXTURE_2D);
    },
    uploadSkyline: (img: HTMLImageElement) => {
      if (gl.isContextLost()) return;
      texW = Math.max(1, img.naturalWidth || SKYLINE_W);
      texH = Math.max(1, img.naturalHeight || SKYLINE_H);
      gl.bindTexture(gl.TEXTURE_2D, skylineTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      hasSkyline = true;
    },
    resize: (widthPx: number, heightPx: number) => {
      screenW = Math.max(1, widthPx);
      screenH = Math.max(1, heightPx);
    },
    render: (state: BackdropState) => {
      if (gl.isContextLost()) return;

      gl.bindVertexArray(vao);
      gl.viewport(0, 0, screenW, screenH);
      gl.useProgram(prog);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, skylineTex);
      gl.uniform1i(u.uSkylineTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(u.uAtlasTex, 1);

      gl.uniform2f(u.uGridSize, state.cols, state.rows);
      gl.uniform2f(u.uSkylineTexel, 1 / texW, 1 / texH);
      gl.uniform1f(u.uAspect, state.aspect);
      gl.uniform1f(u.uTime, state.timeSec);
      gl.uniform1f(u.uScroll, state.scroll);
      gl.uniform1f(u.uReveal, state.reveal);
      gl.uniform1f(u.uHasSkyline, hasSkyline ? 1.0 : 0.0);
      gl.uniform1f(u.uIsDark, state.theme.isDark ? 1.0 : 0.0);

      const { paper, ink, muted, accent, accentSecondary } = state.theme;
      gl.uniform3f(u.uPaperColor, paper.r, paper.g, paper.b);
      gl.uniform3f(u.uInkColor, ink.r, ink.g, ink.b);
      gl.uniform3f(u.uMutedColor, muted.r, muted.g, muted.b);
      gl.uniform3f(u.uAccentColor, accent.r, accent.g, accent.b);
      gl.uniform3f(
        u.uAccentSecondaryColor,
        accentSecondary.r,
        accentSecondary.g,
        accentSecondary.b,
      );

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },
    destroy: () => {
      gl.deleteVertexArray(vao);
      gl.deleteTexture(skylineTex);
      gl.deleteTexture(atlasTex);
      gl.deleteProgram(prog);
    },
  };
}

function createCanvas2DBackdrop(canvas: HTMLCanvasElement): BackdropBackend | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let pixels: Uint8ClampedArray | null = null;
  let imgW = SKYLINE_W;
  let imgH = SKYLINE_H;

  const shadowTint = [0.08, 0.07, 0.14] as const;
  const midTint = [0.47, 0.38, 0.58] as const;
  const highTint = [0.88, 0.71, 0.67] as const;

  return {
    uploadAtlas: () => {},
    uploadSkyline: (img: HTMLImageElement) => {
      imgW = Math.max(1, img.naturalWidth || SKYLINE_W);
      imgH = Math.max(1, img.naturalHeight || SKYLINE_H);
      const off = document.createElement("canvas");
      off.width = imgW;
      off.height = imgH;
      const offCtx = off.getContext("2d", { willReadFrequently: true });
      if (!offCtx) return;
      offCtx.drawImage(img, 0, 0, imgW, imgH);
      pixels = offCtx.getImageData(0, 0, imgW, imgH).data;
    },
    resize: () => {},
    render: (state: BackdropState) => {
      const { cssW, cssH, widthPx, scroll, timeSec, reveal, theme } = state;
      const dpr = widthPx / Math.max(1, cssW);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rgbToCss(theme.paper);
      ctx.fillRect(0, 0, cssW, cssH);

      if (reveal <= 0.002 || !pixels) {
        ctx.restore();
        return;
      }

      const cellW = 4.5;
      const cellH = 7;
      const cols = Math.max(64, Math.floor(cssW / cellW));
      const rows = Math.max(44, Math.floor(cssH / cellH));
      const actualCellW = cssW / cols;
      const actualCellH = cssH / rows;
      const aspect = cssW / Math.max(1, cssH);
      const ramp = MICRO_RAMP;

      const coverZoom = 1.06;
      const spanX = clamp((aspect / SKYLINE_ASPECT) / coverZoom, 0.36, 1.0);
      const imgHeightVh = (aspect / SKYLINE_ASPECT) / spanX;
      const panRangeX = Math.max(0, 1 - spanX);
      const panX = clamp(scroll * panRangeX, 0, panRangeX);
      const extraH = Math.max(0, imgHeightVh - 1);
      const topOffset = -extraH * mixNum(0.38, 0.6, scroll);

      ctx.font = `600 6.5px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const laneMin = theme.isDark ? 0.62 : 0.54;
      const maxVis = theme.isDark ? 0.74 : 0.56;
      const easedReveal = reveal * reveal * (3 - 2 * reveal);

      for (let r = 0; r < rows; r++) {
        const screenYTop = (r + 0.5) / rows;
        const topFeather = smoothstep(0, 0.1, screenYTop);
        if (topFeather <= 0.01) continue;

        const texY = clamp01((screenYTop - topOffset) / Math.max(0.001, imgHeightVh));
        const waterMask = smoothstep(0.754, 0.778, texY);
        const skyMask = 1 - smoothstep(0.32, 0.56, texY);
        const py = Math.min(imgH - 1, Math.floor(texY * imgH));

        for (let c = 0; c < cols; c++) {
          const nx = (c + 0.5) / cols;
          const ripple =
            (Math.sin(texY * 85 - timeSec * 0.55 + nx * 14) * 0.5 +
              Math.sin(texY * 150 + timeSec * 0.38 - nx * 20) * 0.3 +
              Math.cos(texY * 220 - timeSec * 0.78 + nx * 32) * 0.2) *
            0.0028 *
            waterMask;
          const texX = clamp01(panX + nx * spanX + ripple);
          const px = Math.min(imgW - 1, Math.floor(texX * imgW));
          const offset = (py * imgW + px) * 4;
          const pr = (pixels[offset] ?? 0) / 255;
          const pg = (pixels[offset + 1] ?? 0) / 255;
          const pb = (pixels[offset + 2] ?? 0) / 255;
          let lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          const skyWave =
            (Math.sin(texX * 5.2 - timeSec * 0.16 + texY * 3.4) * 0.6 +
              Math.cos(texX * 8.6 + timeSec * 0.11 - texY * 2.2) * 0.4) *
            0.036 *
            skyMask;
          const waterSparkle =
            Math.pow(
              0.5 +
                0.5 *
                  Math.sin(texY * 130 - timeSec * 0.68 + texX * 22) *
                  Math.cos(texX * 36 - timeSec * 0.35),
              5,
            ) *
            waterMask *
            0.14;
          lum = clamp01(lum + skyWave + waterSparkle);
          const warmth = clamp01((pr - pb) * 1.9);

          const shapedLum = smoothstep(0.05, 0.9, lum);
          const duo =
            shapedLum < 0.5
              ? mixVec3(shadowTint, midTint, shapedLum * 2)
              : mixVec3(midTint, highTint, (shapedLum - 0.5) * 2);
          const tinted = mixVec3(duo, [pr, pg, pb], 0.56 + warmth * 0.3);
          const tintedRgb = { r: tinted[0], g: tinted[1], b: tinted[2] };

          const centerWeight = smoothstep(0.38, 0.94, Math.abs(nx - 0.5) * 2);
          const vis = easedReveal * maxVis * mixNum(laneMin, 1, centerWeight) * topFeather;

          const bedRgb = theme.isDark
            ? {
                r: tinted[0] * (0.24 + 0.48 * lum),
                g: tinted[1] * (0.24 + 0.48 * lum),
                b: tinted[2] * (0.24 + 0.48 * lum),
              }
            : mixRgb(theme.paper, tintedRgb, 0.4 * (1 - lum * 0.6));

          const x = c * actualCellW;
          const y = r * actualCellH;
          ctx.fillStyle = rgbToCss(bedRgb, vis * 0.65);
          ctx.fillRect(x, y, actualCellW + 0.5, actualCellH + 0.5);

          const density = theme.isDark
            ? clamp(Math.pow(lum, 0.85) * 0.95, 0.02, 0.999)
            : clamp((1 - lum) * 0.93, 0.02, 0.999);
          const glyph = ramp[Math.min(ramp.length - 1, Math.floor(density * ramp.length))] ?? ".";
          if (glyph === " ") continue;

          const glyphRgb = theme.isDark
            ? tintedRgb
            : mixRgb(tintedRgb, { r: 0.11, g: 0.09, b: 0.19 }, smoothstep(0.16, 0.8, 1 - lum));
          ctx.fillStyle = rgbToCss(glyphRgb, vis);
          ctx.fillText(glyph, x + actualCellW * 0.5, y + actualCellH * 0.5);
        }
      }
      ctx.restore();
    },
    destroy: () => {
      pixels = null;
    },
  };
}

export function mountAsciiBackdrop(canvas: HTMLCanvasElement): BackdropHandle {
  let destroyed = false;
  let reducedMotion = isReducedMotionPreferred();
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;
  let themeColors = resolveThemeColors();

  const atlasCanvas = buildMicroAtlasCanvas();
  let backend: BackdropBackend | null = createWebGL2Backdrop(canvas, atlasCanvas);
  if (!backend) {
    backend = createCanvas2DBackdrop(canvas);
  }

  let loadedSkylineImg: HTMLImageElement | null = null;

  let cssW = 1;
  let cssH = 1;
  let widthPx = 1;
  let heightPx = 1;
  let cols = 180;
  let rows = 84;
  let aspect = 16 / 9;

  let timeSec = reducedMotion ? STATIC_TIME_SEC : 0;
  let scrollTarget = 0;
  let scrollSmooth = 0;
  let revealSmooth = 0;
  let revealTarget = 0;
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
    revealTarget = smoothstep(vh * 0.25, vh * 1.05, y);

    if (snap || reducedMotion) {
      scrollSmooth = scrollTarget;
      revealSmooth = revealTarget;
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
      reveal: revealSmooth,
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

    cols = clamp(Math.round(cssW / 2.4), 160, 680);
    rows = clamp(Math.round(cssH / 3.8), 96, 280);

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

    const kScroll = 1 - Math.exp(-dt * 4.5);
    scrollSmooth += (scrollTarget - scrollSmooth) * kScroll;
    revealSmooth += (revealTarget - revealSmooth) * kScroll;

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
    sampleScrollMetrics(reducedMotion);
    if (reducedMotion) {
      renderSingleFrame();
    } else if (revealTarget > 0.001) {
      ensureLoopRunning();
    }
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
    if (loadedSkylineImg) {
      backend?.uploadSkyline(loadedSkylineImg);
    }
    syncSize();
    renderSingleFrame();
    ensureLoopRunning();
  };

  const skylineImg = new Image();
  skylineImg.decoding = "async";
  skylineImg.onload = () => {
    if (destroyed) return;
    loadedSkylineImg = skylineImg;
    backend?.uploadSkyline(skylineImg);
    renderSingleFrame();
  };
  skylineImg.src = SKYLINE_SRC;

  window.addEventListener("scroll", onScroll, { passive: true });
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
      buildMicroAtlasCanvas(atlasCanvas);
      backend?.uploadAtlas(atlasCanvas);
      renderSingleFrame();
    });
  }

  return {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      skylineImg.onload = null;
      stopLoop();
      window.removeEventListener("scroll", onScroll);
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
