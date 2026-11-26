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

const SKYLINE_SRC = "/boston-skyline.jpg";
const SKYLINE_W = 1024;
const SKYLINE_H = 492;
const SKYLINE_ASPECT = SKYLINE_W / SKYLINE_H;
const STATIC_TIME_SEC = 2.4;

const BOSTON_BACKDROP_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSkylineTex;
uniform sampler2D uAtlasTex;
uniform vec2 uGridSize;
uniform vec2 uSkylineTexel;
uniform vec2 uAtlasDims;
uniform float uAspect;
uniform float uTime;
uniform float uScroll;
uniform float uScrollVel;
uniform float uReveal;
uniform float uHasSkyline;
uniform float uIsDark;
uniform vec2 uPointer;
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

vec2 screenToSkylineUv(vec2 uv) {
  // Edge-to-edge cover framing (zero seams or blank bars across all viewports)
  float coverZoom = 1.06;
  float spanX = clamp((uAspect / IMG_ASPECT) / coverZoom, 0.36, 1.0);
  float imgHeightVh = (uAspect / IMG_ASPECT) / spanX;

  vec2 ptr = (uPointer - 0.5) * 2.0;
  float panRangeX = max(0.0, 1.0 - spanX);
  float panX = clamp(
    uScroll * panRangeX + ptr.x * min(0.014, panRangeX * 0.5 + 0.007),
    0.0,
    panRangeX
  );

  float extraH = max(0.0, imgHeightVh - 1.0);
  float topOffset =
    -extraH * mix(0.25, 0.78, uScroll) -
    ptr.y * 0.012 -
    clamp(uScrollVel * 0.010, -0.02, 0.02);

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

  vec2 texUv = screenToSkylineUv(cellCenterUv);
  float waterMask = smoothstep(0.648, 0.676, texUv.y);
  float ripple = (
    sin(texUv.y * 95.0 - uTime * 1.45 + texUv.x * 14.0 + uScroll * 5.0) * 0.6 +
    sin(texUv.y * 165.0 + uTime * 1.05 - texUv.x * 22.0) * 0.4
  ) * 0.0028 * waterMask;

  vec2 sampleUv = vec2(clamp(texUv.x + ripple, 0.001, 0.999), clamp(texUv.y, 0.001, 0.999));
  vec3 rgb = samplePhoto(sampleUv);
  float lum = rgbLum(rgb);

  // Micro-contrast against neighboring texels keeps windows and silhouettes sharp
  vec2 stepUv = max(uSkylineTexel * 1.5, vec2(0.75) / uGridSize);
  float nL = rgbLum(samplePhoto(sampleUv + vec2(-stepUv.x, 0.0)));
  float nR = rgbLum(samplePhoto(sampleUv + vec2(stepUv.x, 0.0)));
  float nT = rgbLum(samplePhoto(sampleUv + vec2(0.0, -stepUv.y)));
  float nB = rgbLum(samplePhoto(sampleUv + vec2(0.0, stepUv.y)));
  float avgNbr = (nL + nR + nT + nB) * 0.25;
  float localDiff = abs(lum - avgNbr);

  // Subtle Charles River shimmer
  float waterShimmer = 0.92 + 0.08 * sin(texUv.y * 120.0 - uTime * 1.6 + texUv.x * 11.0);
  lum = mix(lum, clamp(lum * waterShimmer, 0.0, 1.0), waterMask);

  // Warm city windows & waterfront beacons with faint nocturnal twinkle
  float warmth = clamp((rgb.r - rgb.b) * 1.9, 0.0, 1.0);
  float windowBase = smoothstep(0.32, 0.72, lum) * warmth * (1.0 - smoothstep(0.0, 0.45, texUv.y) * 0.4);
  float twinkleSeed = hash21(floor(texUv * vec2(260.0, 125.0)));
  float twinkle = 0.84 + 0.16 * sin(uTime * (1.3 + twinkleSeed * 2.1) + twinkleSeed * 6.28318);
  float isWindow = windowBase * twinkle;

  // Contrast S-curve & cohesive 3-stop twilight tint blended with photo RGB
  float shapedLum = smoothstep(0.06, 0.94, lum);
  vec3 shadowTint = vec3(0.08, 0.07, 0.14);
  vec3 midTint = vec3(0.47, 0.38, 0.58);
  vec3 highTint = vec3(0.88, 0.71, 0.67);
  vec3 duoTint = shapedLum < 0.5
    ? mix(shadowTint, midTint, shapedLum * 2.0)
    : mix(midTint, highTint, (shapedLum - 0.5) * 2.0);
  vec3 tintedPhoto = mix(duoTint, rgb, 0.38 + warmth * 0.30);

  // Dense micro-ASCII atlas lookup
  float rampCount = float(${ATLAS_SPEC.asciiRamp.length});
  float glyphDensity = uIsDark > 0.5
    ? clamp(pow(clamp(lum, 0.0, 1.0), 0.90) * 0.94 + localDiff * 0.55 + isWindow * 0.25, 0.03, 0.999)
    : clamp((1.0 - lum) * 0.90 + localDiff * 0.50 + isWindow * 0.18, 0.03, 0.999);

  float glyphIdx = floor(glyphDensity * rampCount);
  vec2 insetCellUv = clamp(cellUv, 0.04, 0.96);
  vec2 atlasUv = vec2(
    (glyphIdx + insetCellUv.x) / uAtlasDims.x,
    (float(${ATLAS_SPEC.rowAscii}) + (1.0 - insetCellUv.y)) / uAtlasDims.y
  );
  float glyphAlpha = texture(uAtlasTex, atlasUv).a;

  // Photographic cell blend: subtle tonal bed + crisp engraved micro-ASCII glyph
  vec3 cellRgb;
  if (uIsDark > 0.5) {
    vec3 cellBed = tintedPhoto * (0.28 + 0.34 * lum);
    vec3 cellGlyph = tintedPhoto * (0.85 + 0.45 * glyphDensity) + vec3(0.12, 0.08, 0.04) * isWindow;
    cellRgb = mix(cellBed, clamp(cellGlyph, 0.0, 1.0), glyphAlpha * 0.88);
  } else {
    float invLum = 1.0 - lum;
    vec3 darkInk = mix(vec3(0.16, 0.13, 0.24), tintedPhoto * 0.62, 0.50);
    vec3 skyWash = mix(uPaperColor, tintedPhoto, 0.34);
    vec3 cellBed = mix(skyWash, darkInk, smoothstep(0.28, 0.88, invLum) * 0.28);
    vec3 cellGlyph = mix(tintedPhoto * 0.86, darkInk, smoothstep(0.18, 0.82, invLum));
    cellRgb = mix(cellBed, cellGlyph, glyphAlpha * 0.86);
  }

  // Calibrated central reading-lane softening + top fixed-nav feather
  float centerDist = abs(cellCenterUv.x - 0.5) * 2.0;
  float centerWeight = smoothstep(0.38, 0.94, centerDist);
  float laneMin = uIsDark > 0.5 ? 0.50 : 0.46;
  float laneAtten = mix(laneMin, 1.0, centerWeight);
  float topFeather = smoothstep(0.0, 0.10, 1.0 - cellCenterUv.y);
  float maxVis = uIsDark > 0.5 ? 0.54 : 0.42;

  float vis = uReveal * maxVis * laneAtten * topFeather;
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
  scrollVel: number;
  reveal: number;
  pointerX: number;
  pointerY: number;
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);

  const u = {
    uSkylineTex: gl.getUniformLocation(prog, "uSkylineTex"),
    uAtlasTex: gl.getUniformLocation(prog, "uAtlasTex"),
    uGridSize: gl.getUniformLocation(prog, "uGridSize"),
    uSkylineTexel: gl.getUniformLocation(prog, "uSkylineTexel"),
    uAtlasDims: gl.getUniformLocation(prog, "uAtlasDims"),
    uAspect: gl.getUniformLocation(prog, "uAspect"),
    uTime: gl.getUniformLocation(prog, "uTime"),
    uScroll: gl.getUniformLocation(prog, "uScroll"),
    uScrollVel: gl.getUniformLocation(prog, "uScrollVel"),
    uReveal: gl.getUniformLocation(prog, "uReveal"),
    uHasSkyline: gl.getUniformLocation(prog, "uHasSkyline"),
    uIsDark: gl.getUniformLocation(prog, "uIsDark"),
    uPointer: gl.getUniformLocation(prog, "uPointer"),
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
    },
    uploadSkyline: (img: HTMLImageElement) => {
      if (gl.isContextLost()) return;
      texW = Math.max(1, img.naturalWidth || SKYLINE_W);
      texH = Math.max(1, img.naturalHeight || SKYLINE_H);
      gl.bindTexture(gl.TEXTURE_2D, skylineTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
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
      gl.uniform2f(u.uAtlasDims, ATLAS_SPEC.cols, ATLAS_SPEC.rows);
      gl.uniform1f(u.uAspect, state.aspect);
      gl.uniform1f(u.uTime, state.timeSec);
      gl.uniform1f(u.uScroll, state.scroll);
      gl.uniform1f(u.uScrollVel, state.scrollVel);
      gl.uniform1f(u.uReveal, state.reveal);
      gl.uniform1f(u.uHasSkyline, hasSkyline ? 1.0 : 0.0);
      gl.uniform1f(u.uIsDark, state.theme.isDark ? 1.0 : 0.0);
      gl.uniform2f(u.uPointer, state.pointerX, state.pointerY);

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
      const { cssW, cssH, widthPx, scroll, timeSec, reveal, theme, pointerX, pointerY } = state;
      const dpr = widthPx / Math.max(1, cssW);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rgbToCss(theme.paper);
      ctx.fillRect(0, 0, cssW, cssH);

      if (reveal <= 0.002 || !pixels) {
        ctx.restore();
        return;
      }

      const cellW = 7;
      const cellH = 10;
      const cols = Math.max(48, Math.floor(cssW / cellW));
      const rows = Math.max(32, Math.floor(cssH / cellH));
      const actualCellW = cssW / cols;
      const actualCellH = cssH / rows;
      const aspect = cssW / Math.max(1, cssH);
      const ramp = ATLAS_SPEC.asciiRamp;

      const coverZoom = 1.06;
      const spanX = clamp((aspect / SKYLINE_ASPECT) / coverZoom, 0.36, 1.0);
      const imgHeightVh = (aspect / SKYLINE_ASPECT) / spanX;
      const panRangeX = Math.max(0, 1 - spanX);
      const ptrX = (pointerX - 0.5) * 2;
      const ptrY = (pointerY - 0.5) * 2;
      const panX = clamp(
        scroll * panRangeX + ptrX * Math.min(0.014, panRangeX * 0.5 + 0.007),
        0,
        panRangeX,
      );
      const extraH = Math.max(0, imgHeightVh - 1);
      const topOffset = -extraH * mixNum(0.25, 0.78, scroll) - ptrY * 0.012;

      ctx.font = `500 9px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const laneMin = theme.isDark ? 0.5 : 0.46;
      const maxVis = theme.isDark ? 0.52 : 0.4;

      for (let r = 0; r < rows; r++) {
        const screenYTop = (r + 0.5) / rows;
        const topFeather = smoothstep(0, 0.1, screenYTop);
        if (topFeather <= 0.01) continue;

        const texY = clamp01((screenYTop - topOffset) / Math.max(0.001, imgHeightVh));
        const waterMask = smoothstep(0.648, 0.676, texY);
        const py = Math.min(imgH - 1, Math.floor(texY * imgH));

        for (let c = 0; c < cols; c++) {
          const nx = (c + 0.5) / cols;
          const ripple =
            Math.sin(texY * 95 - timeSec * 1.45 + nx * 14 + scroll * 5) * 0.0028 * waterMask;
          const texX = clamp01(panX + nx * spanX + ripple);
          const px = Math.min(imgW - 1, Math.floor(texX * imgW));
          const offset = (py * imgW + px) * 4;
          const pr = (pixels[offset] ?? 0) / 255;
          const pg = (pixels[offset + 1] ?? 0) / 255;
          const pb = (pixels[offset + 2] ?? 0) / 255;
          const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          const warmth = clamp01((pr - pb) * 1.9);

          const shapedLum = smoothstep(0.06, 0.94, lum);
          const duo =
            shapedLum < 0.5
              ? mixVec3(shadowTint, midTint, shapedLum * 2)
              : mixVec3(midTint, highTint, (shapedLum - 0.5) * 2);
          const tinted = mixVec3(duo, [pr, pg, pb], 0.38 + warmth * 0.3);
          const tintedRgb = { r: tinted[0], g: tinted[1], b: tinted[2] };

          const centerWeight = smoothstep(0.38, 0.94, Math.abs(nx - 0.5) * 2);
          const vis = reveal * maxVis * mixNum(laneMin, 1, centerWeight) * topFeather;

          const bedRgb = theme.isDark
            ? {
                r: tinted[0] * (0.28 + 0.34 * lum),
                g: tinted[1] * (0.28 + 0.34 * lum),
                b: tinted[2] * (0.28 + 0.34 * lum),
              }
            : mixRgb(theme.paper, tintedRgb, 0.32 * (1 - lum * 0.6));

          const x = c * actualCellW;
          const y = r * actualCellH;
          ctx.fillStyle = rgbToCss(bedRgb, vis * 0.65);
          ctx.fillRect(x, y, actualCellW + 0.5, actualCellH + 0.5);

          const density = theme.isDark
            ? clamp(Math.pow(lum, 0.9) * 0.94, 0.03, 0.999)
            : clamp((1 - lum) * 0.9, 0.03, 0.999);
          const glyph = ramp[Math.min(ramp.length - 1, Math.floor(density * ramp.length))] ?? ".";
          if (glyph === " ") continue;

          const glyphRgb = theme.isDark
            ? tintedRgb
            : mixRgb(tintedRgb, { r: 0.16, g: 0.13, b: 0.24 }, smoothstep(0.18, 0.82, 1 - lum));
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

  const atlasCanvas = buildGlyphAtlasCanvas();
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

    cols = clamp(Math.round(cssW / 5.4), 96, 300);
    rows = clamp(Math.round(cssH / 8.4), 56, 144);

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
      skylineImg.onload = null;
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
