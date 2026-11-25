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
import { FULLSCREEN_VERTEX_SHADER, PASS2_FRAGMENT_SHADER } from "./ascii-shaders";
import {
  computeHeroPeelOrder,
  computeHeroScrollDissolve,
  computeHeroStayMask,
  publishHeroSnapshot,
  type HeroGlyphCell,
} from "./hero-glyph-bridge";

export interface HeroAsciiOptions {
  clearElement?: HTMLElement | null;
}

export interface HeroAsciiHandle {
  destroy: () => void;
}

interface FluidFrameState {
  simW: number;
  simH: number;
  cols: number;
  rows: number;
  aspect: number;
  scrollDissolve: number;
  theme: ThemeColors;
  clearRectUv: readonly [number, number, number, number] | null;
  clearRectDom: readonly [number, number, number, number] | null;
  packedRgba: Uint8Array;
  ink: Float32Array;
  energy: Float32Array;
  velU: Float32Array;
  velV: Float32Array;
}

interface EngineBackend {
  uploadAtlas: (atlasCanvas: HTMLCanvasElement) => void;
  resize: (widthPx: number, heightPx: number, simW: number, simH: number) => void;
  render: (state: FluidFrameState) => void;
  destroy: () => void;
}

const LANDSCAPE_W = 96;
const LANDSCAPE_H = 54;
const SIM_N = LANDSCAPE_W * LANDSCAPE_H;
const DEFAULT_DISPLAY_TEXT = "IAN PANG";
const STATIC_REDUCED_MOTION_SEC = 2.4;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// ── 96x54 (5184-cell) Jos Stam Stable-Fluids Navier-Stokes Solver ─────

function setBnd(b: number, x: Float32Array, simW: number, simH: number): void {
  for (let ix = 1; ix < simW - 1; ix++) {
    x[ix] = b === 2 ? -(x[simW + ix] ?? 0) : (x[simW + ix] ?? 0);
    const bot = (simH - 1) * simW + ix;
    const botIn = (simH - 2) * simW + ix;
    x[bot] = b === 2 ? -(x[botIn] ?? 0) : (x[botIn] ?? 0);
  }
  for (let iy = 1; iy < simH - 1; iy++) {
    const left = iy * simW;
    x[left] = b === 1 ? -(x[left + 1] ?? 0) : (x[left + 1] ?? 0);
    const right = iy * simW + (simW - 1);
    x[right] = b === 1 ? -(x[right - 1] ?? 0) : (x[right - 1] ?? 0);
  }
  x[0] = 0.5 * ((x[1] ?? 0) + (x[simW] ?? 0));
  x[simW - 1] = 0.5 * ((x[simW - 2] ?? 0) + (x[2 * simW - 1] ?? 0));
  const bl = (simH - 1) * simW;
  x[bl] = 0.5 * ((x[bl + 1] ?? 0) + (x[bl - simW] ?? 0));
  const br = simW * simH - 1;
  x[br] = 0.5 * ((x[br - 1] ?? 0) + (x[br - simW] ?? 0));
}

function project(
  u: Float32Array,
  v: Float32Array,
  p: Float32Array,
  div: Float32Array,
  simW: number,
  simH: number,
): void {
  for (let y = 1; y < simH - 1; y++) {
    const row = y * simW;
    for (let x = 1; x < simW - 1; x++) {
      const i = row + x;
      div[i] =
        -0.5 *
        ((u[i + 1] ?? 0) - (u[i - 1] ?? 0) + (v[i + simW] ?? 0) - (v[i - simW] ?? 0));
      p[i] = 0;
    }
  }
  setBnd(0, div, simW, simH);
  setBnd(0, p, simW, simH);

  for (let iter = 0; iter < 14; iter++) {
    for (let y = 1; y < simH - 1; y++) {
      const row = y * simW;
      for (let x = 1; x < simW - 1; x++) {
        const i = row + x;
        p[i] =
          ((div[i] ?? 0) +
            (p[i - 1] ?? 0) +
            (p[i + 1] ?? 0) +
            (p[i - simW] ?? 0) +
            (p[i + simW] ?? 0)) *
          0.25;
      }
    }
    setBnd(0, p, simW, simH);
  }

  for (let y = 1; y < simH - 1; y++) {
    const row = y * simW;
    for (let x = 1; x < simW - 1; x++) {
      const i = row + x;
      u[i] = (u[i] ?? 0) - 0.5 * ((p[i + 1] ?? 0) - (p[i - 1] ?? 0));
      v[i] = (v[i] ?? 0) - 0.5 * ((p[i + simW] ?? 0) - (p[i - simW] ?? 0));
    }
  }
  setBnd(1, u, simW, simH);
  setBnd(2, v, simW, simH);
}

function applyVorticityConfinement(
  u: Float32Array,
  v: Float32Array,
  curl: Float32Array,
  simW: number,
  simH: number,
  dt: number,
  eps: number,
): void {
  for (let y = 1; y < simH - 1; y++) {
    const row = y * simW;
    for (let x = 1; x < simW - 1; x++) {
      const i = row + x;
      const dvdx = 0.5 * ((v[i + 1] ?? 0) - (v[i - 1] ?? 0));
      const dudy = 0.5 * ((u[i + simW] ?? 0) - (u[i - simW] ?? 0));
      curl[i] = dvdx - dudy;
    }
  }

  for (let y = 1; y < simH - 1; y++) {
    const row = y * simW;
    for (let x = 1; x < simW - 1; x++) {
      const i = row + x;
      const cL = Math.abs(curl[i - 1] ?? 0);
      const cR = Math.abs(curl[i + 1] ?? 0);
      const cT = Math.abs(curl[i - simW] ?? 0);
      const cB = Math.abs(curl[i + simW] ?? 0);
      let dx = 0.5 * (cR - cL);
      let dy = 0.5 * (cB - cT);
      const len = Math.hypot(dx, dy);
      if (len > 1e-5) {
        dx /= len;
        dy /= len;
        const c = curl[i] ?? 0;
        u[i] = (u[i] ?? 0) + dt * eps * (dy * c);
        v[i] = (v[i] ?? 0) + dt * eps * (-dx * c);
      }
    }
  }
}

function advect(
  b: number,
  d: Float32Array,
  d0: Float32Array,
  u: Float32Array,
  v: Float32Array,
  simW: number,
  simH: number,
  dt: number,
): void {
  const maxX = simW - 1.5;
  const maxY = simH - 1.5;

  for (let y = 1; y < simH - 1; y++) {
    const row = y * simW;
    for (let x = 1; x < simW - 1; x++) {
      const i = row + x;
      const bx = clamp(x - dt * (u[i] ?? 0), 0.5, maxX);
      const by = clamp(y - dt * (v[i] ?? 0), 0.5, maxY);

      const x0 = Math.floor(bx);
      const y0 = Math.floor(by);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const sx = bx - x0;
      const sy = by - y0;

      const idx00 = y0 * simW + x0;
      const idx10 = y0 * simW + x1;
      const idx01 = y1 * simW + x0;
      const idx11 = y1 * simW + x1;

      const top = (d0[idx00] ?? 0) * (1 - sx) + (d0[idx10] ?? 0) * sx;
      const bot = (d0[idx01] ?? 0) * (1 - sx) + (d0[idx11] ?? 0) * sx;
      d[i] = top * (1 - sy) + bot * sy;
    }
  }
  setBnd(b, d, simW, simH);
}

// ── Typography Mask Rasterization ─────────────────────────────────────

function splitTwoLines(text: string): [string, string] | null {
  const clean = text.trim();
  if (clean.length < 4) return null;

  const spaces: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === " ") spaces.push(i);
  }
  if (spaces.length > 0) {
    const mid = clean.length * 0.5;
    let best = spaces[0]!;
    let bestDist = Math.abs(best - mid);
    for (let i = 1; i < spaces.length; i++) {
      const idx = spaces[i]!;
      const dist = Math.abs(idx - mid);
      if (dist < bestDist) {
        best = idx;
        bestDist = dist;
      }
    }
    const left = clean.slice(0, best).trim();
    const right = clean.slice(best + 1).trim();
    if (left.length > 0 && right.length > 0) {
      return [left, right];
    }
  }

  if (clean.length >= 8) {
    const half = Math.ceil(clean.length * 0.5);
    return [clean.slice(0, half), clean.slice(half)];
  }
  return null;
}

function measureTrackedWidth(
  ctx: CanvasRenderingContext2D,
  line: string,
  fontSize: number,
  trackingEm: number,
): number {
  const baseW = ctx.measureText(line).width;
  const chars = Array.from(line);
  if (chars.length <= 1) return baseW;
  return baseW + (chars.length - 1) * fontSize * trackingEm;
}

function drawTrackedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  centerX: number,
  centerY: number,
  fontSize: number,
  trackingEm: number,
): void {
  const chars = Array.from(line);
  if (chars.length <= 1) {
    ctx.fillText(line, centerX, centerY);
    return;
  }
  const extraPerGap = fontSize * trackingEm;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const totalW =
    widths.reduce((acc, w) => acc + w, 0) + (chars.length - 1) * extraPerGap;

  let cursor = centerX - totalW * 0.5;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const w = widths[i] ?? 0;
    if (ch !== " ") {
      ctx.fillText(ch, cursor, centerY);
    }
    cursor += w + extraPerGap;
  }
}

function measureLinesMaxFont(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  safeW: number,
  safeH: number,
  weight: number,
  trackingEm: number,
): number {
  const refSize = 100;
  ctx.font = `${weight} ${refSize}px "General Sans", ui-sans-serif, system-ui, sans-serif`;
  let maxWidthRatio = 0.01;
  for (let i = 0; i < lines.length; i++) {
    const w = measureTrackedWidth(ctx, lines[i]!, refSize, trackingEm);
    maxWidthRatio = Math.max(maxWidthRatio, w / refSize);
  }
  const lineHeightFactor = lines.length > 1 ? 1.24 : 1.0;
  const maxByWidth = safeW / maxWidthRatio;
  const maxByHeight = safeH / (lines.length * lineHeightFactor);
  return Math.max(12, Math.min(maxByWidth, maxByHeight) * 0.94);
}

function rasterizeTypographyMask(
  offCanvas: HTMLCanvasElement,
  text: string,
  aspect: number,
  simW: number,
  simH: number,
  clearRectDom: readonly [number, number, number, number] | null,
  outMask: Float32Array,
  outEdge: Float32Array,
): number {
  const safeAspect = clamp(aspect, 0.35, 3.2);
  const offW = Math.max(384, simW * 4);
  const offH = Math.max(216, Math.round(offW / safeAspect));

  if (offCanvas.width !== offW || offCanvas.height !== offH) {
    offCanvas.width = offW;
    offCanvas.height = offH;
  }

  const ctx = offCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    outMask.fill(0);
    outEdge.fill(0);
    return 0.4;
  }

  ctx.clearRect(0, 0, offW, offH);

  const normalized = (text.trim().length > 0 ? text.trim() : DEFAULT_DISPLAY_TEXT)
    .toUpperCase()
    .slice(0, 20);

  const isPortrait = safeAspect < 0.98;
  const topFrac = isPortrait ? 0.13 : 0.14;
  const fallbackBottom = isPortrait ? 0.54 : 0.66;
  const bottomFrac = clearRectDom
    ? clamp(clearRectDom[1] - 0.065, 0.42, 0.66)
    : fallbackBottom;

  const safeW = offW * (isPortrait ? 0.84 : 0.82);
  const safeTop = offH * topFrac;
  const safeBottom = offH * bottomFrac;
  const safeH = Math.max(44, safeBottom - safeTop);
  const centerY = (safeTop + safeBottom) * 0.5;

  const fontWeight = isPortrait ? 500 : 600;
  const trackingEm = isPortrait ? 0.08 : 0.075;

  const singleLineText = normalized.replace(/ +/g, "  ");
  const oneLine: readonly string[] = [singleLineText];
  const font1 = measureLinesMaxFont(ctx, oneLine, safeW, safeH, fontWeight, trackingEm);

  let chosenLines: readonly string[] = oneLine;
  let chosenFont = font1;

  const twoLines = splitTwoLines(normalized);
  if (twoLines) {
    const font2 = measureLinesMaxFont(ctx, twoLines, safeW, safeH, fontWeight, trackingEm);
    if (isPortrait || normalized.length > 10 || font2 > font1 * 1.24) {
      chosenLines = twoLines;
      chosenFont = font2;
    }
  }

  ctx.font = `${fontWeight} ${chosenFont.toFixed(1)}px "General Sans", ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";

  const lineStep = chosenFont * 1.24;
  const startY = centerY - ((chosenLines.length - 1) * lineStep) * 0.5;

  for (let i = 0; i < chosenLines.length; i++) {
    const line = chosenLines[i]!;
    const y = startY + i * lineStep;
    drawTrackedLine(ctx, line, offW * 0.5, y, chosenFont, trackingEm);
  }

  const pixels = ctx.getImageData(0, 0, offW, offH).data;
  for (let gy = 0; gy < simH; gy++) {
    const y0 = Math.floor((gy / simH) * offH);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) / simH) * offH));
    for (let gx = 0; gx < simW; gx++) {
      const x0 = Math.floor((gx / simW) * offW);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) / simW) * offW));
      let sum = 0;
      let count = 0;
      for (let py = y0; py < y1; py++) {
        const rowOff = py * offW;
        for (let px = x0; px < x1; px++) {
          sum += pixels[(rowOff + px) * 4 + 3] ?? 0;
          count++;
        }
      }
      const avg = count > 0 ? sum / (count * 255) : 0;
      // Crisp non-dilating ramp so hollow counters (A, P, N, G) remain completely open
      outMask[gy * simW + gx] = clamp01((avg - 0.16) / 0.68);
    }
  }

  for (let gy = 0; gy < simH; gy++) {
    const ym = Math.max(0, gy - 1);
    const yp = Math.min(simH - 1, gy + 1);
    for (let gx = 0; gx < simW; gx++) {
      const xm = Math.max(0, gx - 1);
      const xp = Math.min(simW - 1, gx + 1);
      const val = outMask[gy * simW + gx] ?? 0;
      if (val <= 0.16) {
        outEdge[gy * simW + gx] = 0;
        continue;
      }
      const dx = (outMask[gy * simW + xp] ?? 0) - (outMask[gy * simW + xm] ?? 0);
      const dy = (outMask[yp * simW + gx] ?? 0) - (outMask[ym * simW + gx] ?? 0);
      outEdge[gy * simW + gx] = clamp01(Math.hypot(dx, dy) * 0.78);
    }
  }

  return 0.5 * (topFrac + bottomFrac);
}

// ── WebGL2 Compositor Backend ─────────────────────────────────────────

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

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createWebGL2Backend(
  canvas: HTMLCanvasElement,
  atlasCanvas: HTMLCanvasElement,
): EngineBackend | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const prog = linkProgram(gl, FULLSCREEN_VERTEX_SHADER, PASS2_FRAGMENT_SHADER);
  if (!prog) return null;

  const vao = gl.createVertexArray();
  const fluidTex = gl.createTexture();
  const atlasTex = gl.createTexture();
  if (!vao || !fluidTex || !atlasTex) {
    if (vao) gl.deleteVertexArray(vao);
    if (fluidTex) gl.deleteTexture(fluidTex);
    if (atlasTex) gl.deleteTexture(atlasTex);
    gl.deleteProgram(prog);
    return null;
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

  const configureTex = (tex: WebGLTexture) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  };

  let texW = LANDSCAPE_W;
  let texH = LANDSCAPE_H;

  configureTex(fluidTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    texW,
    texH,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );

  configureTex(atlasTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);

  const uniforms = {
    uFluidTex: gl.getUniformLocation(prog, "uFluidTex"),
    uAtlasTex: gl.getUniformLocation(prog, "uAtlasTex"),
    uGridSize: gl.getUniformLocation(prog, "uGridSize"),
    uFluidTexel: gl.getUniformLocation(prog, "uFluidTexel"),
    uAtlasDims: gl.getUniformLocation(prog, "uAtlasDims"),
    uAspect: gl.getUniformLocation(prog, "uAspect"),
    uPaperColor: gl.getUniformLocation(prog, "uPaperColor"),
    uInkColor: gl.getUniformLocation(prog, "uInkColor"),
    uMutedColor: gl.getUniformLocation(prog, "uMutedColor"),
    uAccentColor: gl.getUniformLocation(prog, "uAccentColor"),
    uAccentSecondaryColor: gl.getUniformLocation(prog, "uAccentSecondaryColor"),
    uClearRect: gl.getUniformLocation(prog, "uClearRect"),
    uHasClearRect: gl.getUniformLocation(prog, "uHasClearRect"),
    uScrollDissolve: gl.getUniformLocation(prog, "uScrollDissolve"),
  };

  let screenW = Math.max(1, canvas.width);
  let screenH = Math.max(1, canvas.height);

  const uploadAtlas = (nextAtlas: HTMLCanvasElement) => {
    if (gl.isContextLost()) return;
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, nextAtlas);
  };

  const resize = (widthPx: number, heightPx: number, simW: number, simH: number) => {
    screenW = Math.max(1, widthPx);
    screenH = Math.max(1, heightPx);
    if (simW !== texW || simH !== texH) {
      texW = simW;
      texH = simH;
      if (!gl.isContextLost()) {
        gl.bindTexture(gl.TEXTURE_2D, fluidTex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          texW,
          texH,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
      }
    }
  };

  const render = (state: FluidFrameState) => {
    if (gl.isContextLost()) return;

    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, screenW, screenH);
    gl.useProgram(prog);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fluidTex);
    if (state.simW !== texW || state.simH !== texH) {
      texW = state.simW;
      texH = state.simH;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        texW,
        texH,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        state.packedRgba,
      );
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        texW,
        texH,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        state.packedRgba,
      );
    }
    gl.uniform1i(uniforms.uFluidTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(uniforms.uAtlasTex, 1);

    gl.uniform2f(uniforms.uGridSize, state.cols, state.rows);
    gl.uniform2f(uniforms.uFluidTexel, 1 / state.simW, 1 / state.simH);
    gl.uniform2f(uniforms.uAtlasDims, ATLAS_SPEC.cols, ATLAS_SPEC.rows);
    gl.uniform1f(uniforms.uAspect, state.aspect);

    const { paper, ink, muted, accent, accentSecondary } = state.theme;
    gl.uniform3f(uniforms.uPaperColor, paper.r, paper.g, paper.b);
    gl.uniform3f(uniforms.uInkColor, ink.r, ink.g, ink.b);
    gl.uniform3f(uniforms.uMutedColor, muted.r, muted.g, muted.b);
    gl.uniform3f(uniforms.uAccentColor, accent.r, accent.g, accent.b);
    gl.uniform3f(
      uniforms.uAccentSecondaryColor,
      accentSecondary.r,
      accentSecondary.g,
      accentSecondary.b,
    );

    if (state.clearRectUv) {
      gl.uniform4f(
        uniforms.uClearRect,
        state.clearRectUv[0],
        state.clearRectUv[1],
        state.clearRectUv[2],
        state.clearRectUv[3],
      );
      gl.uniform1f(uniforms.uHasClearRect, 1.0);
    } else {
      gl.uniform4f(uniforms.uClearRect, 0, 0, 0, 0);
      gl.uniform1f(uniforms.uHasClearRect, 0.0);
    }
    gl.uniform1f(uniforms.uScrollDissolve, state.scrollDissolve);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  const destroy = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteVertexArray(vao);
    gl.deleteTexture(fluidTex);
    gl.deleteTexture(atlasTex);
    gl.deleteProgram(prog);
  };

  return { uploadAtlas, resize, render, destroy };
}

// ── Canvas 2D Fallback Backend ────────────────────────────────────────

function sampleBilinear(
  field: Float32Array,
  simW: number,
  simH: number,
  nx: number,
  ny: number,
): number {
  const gx = clamp(nx * simW - 0.5, 0, simW - 1.001);
  const gy = clamp(ny * simH - 0.5, 0, simH - 1.001);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(simW - 1, x0 + 1);
  const y1 = Math.min(simH - 1, y0 + 1);
  const sx = gx - x0;
  const sy = gy - y0;

  const v00 = field[y0 * simW + x0] ?? 0;
  const v10 = field[y0 * simW + x1] ?? 0;
  const v01 = field[y1 * simW + x0] ?? 0;
  const v11 = field[y1 * simW + x1] ?? 0;
  const top = v00 * (1 - sx) + v10 * sx;
  const bot = v01 * (1 - sx) + v11 * sx;
  return top * (1 - sy) + bot * sy;
}

function computeClearMask(
  nx: number,
  ny: number,
  aspect: number,
  clearRectDom: readonly [number, number, number, number] | null,
): number {
  if (!clearRectDom) return 1;
  const [cl, ct, cr, cb] = clearRectDom;
  const cx = (cl + cr) * 0.5;
  const cy = (ct + cb) * 0.5;
  const hx = Math.max(0.001, (cr - cl) * 0.5);
  const hy = Math.max(0.001, (cb - ct) * 0.5);
  const dx = (Math.abs(nx - cx) - hx) * aspect;
  const dy = Math.abs(ny - cy) - hy;
  const boxDist =
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  return smoothstep(-0.005, 0.055, boxDist);
}

function angleToEdgeGlyphIdx(angle: number): 0 | 1 | 2 | 3 {
  if (angle < Math.PI * 0.125 || angle >= Math.PI * 0.875) return 0; // '|'
  if (angle < Math.PI * 0.375) return 3; // '\\'
  if (angle < Math.PI * 0.625) return 2; // '-'
  return 1; // '/'
}

function createCanvas2DBackend(canvas: HTMLCanvasElement): EngineBackend | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let inkBuf = new Float32Array(0);
  let accBuf = new Float32Array(0);
  let velXBuf = new Float32Array(0);
  let velYBuf = new Float32Array(0);

  return {
    uploadAtlas: () => {},
    resize: () => {},
    render: (state: FluidFrameState) => {
      const { cols, rows, simW, simH, theme } = state;
      const w = canvas.width;
      const h = canvas.height;
      const count = cols * rows;
      if (inkBuf.length !== count) {
        inkBuf = new Float32Array(count);
        accBuf = new Float32Array(count);
        velXBuf = new Float32Array(count);
        velYBuf = new Float32Array(count);
      }

      for (let row = 0; row < rows; row++) {
        const ny = (row + 0.5) / rows;
        for (let col = 0; col < cols; col++) {
          const nx = (col + 0.5) / cols;
          const idx = row * cols + col;
          inkBuf[idx] = clamp01(sampleBilinear(state.ink, simW, simH, nx, ny));
          accBuf[idx] = clamp01(sampleBilinear(state.energy, simW, simH, nx, ny));
          velXBuf[idx] = sampleBilinear(state.velU, simW, simH, nx, ny) / 14;
          velYBuf[idx] = -sampleBilinear(state.velV, simW, simH, nx, ny) / 14;
        }
      }

      ctx.fillStyle = rgbToCss(theme.paper);
      ctx.fillRect(0, 0, w, h);

      const cellW = w / cols;
      const cellH = h / rows;
      const fontSize = Math.max(9, Math.round(cellH * 0.82));
      ctx.font = `500 ${fontSize}px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const ramp = ATLAS_SPEC.asciiRamp;
      const edges = ATLAS_SPEC.edgeRamp;
      const edgeChars = [
        edges[0] ?? "|",
        edges[1] ?? "/",
        edges[2] ?? "-",
        edges[3] ?? "\\",
      ] as const;

      for (let row = 0; row < rows; row++) {
        const ny = (row + 0.5) / rows;
        const glRow = rows - 1 - row;
        for (let col = 0; col < cols; col++) {
          const nx = (col + 0.5) / cols;

          let stayMask = 1;
          if (state.scrollDissolve > 0.001) {
            const peelOrder = computeHeroPeelOrder(col, glRow, rows);
            stayMask = computeHeroStayMask(peelOrder, state.scrollDissolve);
            if (stayMask <= 0.005) continue;
          }

          const clearMask = computeClearMask(nx, ny, state.aspect, state.clearRectDom);

          const idx = row * cols + col;
          const ink = clamp01((inkBuf[idx] ?? 0) * clearMask);
          const acc = clamp01((accBuf[idx] ?? 0) * clearMask);
          const lum = clamp01(ink + acc * 0.14);
          if (Math.max(ink, acc * 0.48) < 0.085) continue;

          const vx = velXBuf[idx] ?? 0;
          const vy = velYBuf[idx] ?? 0;
          const speed = Math.hypot(vx, vy);

          let gx = 0;
          let gy = 0;
          let edgeMag = 0;
          if (col > 0 && col < cols - 1 && row > 0 && row < rows - 1) {
            gx = (inkBuf[idx + 1] ?? 0) - (inkBuf[idx - 1] ?? 0);
            gy = (inkBuf[idx - cols] ?? 0) - (inkBuf[idx + cols] ?? 0);
            edgeMag = Math.hypot(gx, gy);
          }

          let ch = ramp[Math.min(ramp.length - 1, Math.floor(clamp(lum, 0, 0.999) * ramp.length))] ?? " ";

          if (clearMask > 0.35) {
            if (speed > 0.14 && acc > 0.24 && ink > 0.09 && ink < 0.85) {
              const angle = ((Math.atan2(vy, vx) % Math.PI) + Math.PI) % Math.PI;
              if (angle < Math.PI * 0.125 || angle >= Math.PI * 0.875) ch = edgeChars[2];
              else if (angle < Math.PI * 0.375) ch = edgeChars[1];
              else if (angle < Math.PI * 0.625) ch = edgeChars[0];
              else ch = edgeChars[3];
            } else if (edgeMag * clearMask > 0.30 && ink > 0.24 && ink < 0.68) {
              const angle = ((Math.atan2(gy, gx) % Math.PI) + Math.PI) % Math.PI;
              ch = edgeChars[angleToEdgeGlyphIdx(angle)];
            }
          }

          if (ch === " " || ch === "\u2800") continue;

          const base = mixRgb(theme.muted, theme.ink, smoothstep(0.28, 0.70, ink));
          const secMix = clamp01(speed * 0.48) * (1 - smoothstep(0.55, 0.95, ink));
          const fieldRgb = mixRgb(base, theme.accentSecondary, secMix);
          const finalRgb = mixRgb(fieldRgb, theme.accent, smoothstep(0.26, 0.78, acc));
          const vis =
            clearMask * smoothstep(0.085, 0.24, Math.max(ink, acc * 0.48)) * stayMask;
          if (vis <= 0.005) continue;
          ctx.fillStyle = rgbToCss(finalRgb, vis);
          ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
        }
      }
    },
    destroy: () => {
      inkBuf = new Float32Array(0);
      accBuf = new Float32Array(0);
      velXBuf = new Float32Array(0);
      velYBuf = new Float32Array(0);
    },
  };
}

// ── Public Mount Entry ────────────────────────────────────────────────

export function mountHeroAscii(
  canvas: HTMLCanvasElement,
  options: HeroAsciiOptions = {},
): HeroAsciiHandle {
  let destroyed = false;

  let reducedMotion = isReducedMotionPreferred();
  let isVisible = true;
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;

  let themeColors = resolveThemeColors();
  const atlasCanvas = buildGlyphAtlasCanvas();
  const maskCanvas = document.createElement("canvas");

  let backend: EngineBackend | null = createWebGL2Backend(canvas, atlasCanvas);
  if (!backend) {
    backend = createCanvas2DBackend(canvas);
  }

  let simW = LANDSCAPE_W;
  let simH = LANDSCAPE_H;

  // CPU 5184-cell (96x54 landscape / 54x96 portrait) Navier-Stokes buffers
  let velU = new Float32Array(SIM_N);
  let velV = new Float32Array(SIM_N);
  let velUPrev = new Float32Array(SIM_N);
  let velVPrev = new Float32Array(SIM_N);
  const divBuf = new Float32Array(SIM_N);
  const pressBuf = new Float32Array(SIM_N);
  const curlBuf = new Float32Array(SIM_N);

  let ink = new Float32Array(SIM_N);
  let inkPrev = new Float32Array(SIM_N);
  let energy = new Float32Array(SIM_N);
  let energyPrev = new Float32Array(SIM_N);

  const targetMask = new Float32Array(SIM_N);
  const targetEdge = new Float32Array(SIM_N);
  const packedRgba = new Uint8Array(SIM_N * 4);

  let widthPx = 1;
  let heightPx = 1;
  let cssWidth = 1;
  let cssHeight = 1;
  let cols = 96;
  let rows = 42;
  let aspect = 16 / 9;

  const readScrollDissolve = (): number => {
    if (reducedMotion || typeof window === "undefined") return 0;
    return computeHeroScrollDissolve(window.scrollY, window.innerHeight);
  };

  let scrollDissolve = readScrollDissolve();
  let prevImpulseDissolve = scrollDissolve;

  let prevSliceGridX = simW * 0.5;
  let prevSliceGridY = simH * 0.4;
  let hasPrevPointer = false;

  let clearRectUv: [number, number, number, number] | null = null;
  let clearRectDom: [number, number, number, number] | null = null;
  let layoutDirty = true;

  let simTimeSec = reducedMotion ? STATIC_REDUCED_MOTION_SEC : 0;
  let rafId: number | null = null;
  let lastFrameMs = 0;

  const updateClearRect = () => {
    layoutDirty = false;
    const clearEl = options.clearElement;
    if (!clearEl) {
      clearRectUv = null;
      clearRectDom = null;
      return;
    }
    const cr = canvas.getBoundingClientRect();
    const er = clearEl.getBoundingClientRect();
    if (cr.width <= 0 || cr.height <= 0 || er.width <= 0 || er.height <= 0) {
      clearRectUv = null;
      clearRectDom = null;
      return;
    }
    const left = (er.left - cr.left) / cr.width;
    const right = (er.right - cr.left) / cr.width;
    const domTop = (er.top - cr.top) / cr.height;
    const domBottom = (er.bottom - cr.top) / cr.height;

    clearRectUv = [left, 1 - domBottom, right, 1 - domTop];
    clearRectDom = [left, domTop, right, domBottom];
  };

  const rebuildTypographyMask = (seedInk = false) => {
    rasterizeTypographyMask(
      maskCanvas,
      DEFAULT_DISPLAY_TEXT,
      aspect,
      simW,
      simH,
      clearRectDom,
      targetMask,
      targetEdge,
    );

    if (seedInk || reducedMotion) {
      for (let i = 0; i < SIM_N; i++) {
        ink[i] = targetMask[i] ?? 0;
      }
    }
  };

  const splatVelocity = (
    gx: number,
    gy: number,
    vxImpulse: number,
    vyImpulse: number,
    radius: number,
    energyBoost: number,
  ) => {
    const rCeil = Math.ceil(radius * 2.2);
    const minX = Math.max(1, Math.floor(gx - rCeil));
    const maxX = Math.min(simW - 2, Math.ceil(gx + rCeil));
    const minY = Math.max(1, Math.floor(gy - rCeil));
    const maxY = Math.min(simH - 2, Math.ceil(gy + rCeil));
    const invR2 = 1 / Math.max(0.5, radius * radius);

    for (let y = minY; y <= maxY; y++) {
      const dy = y - gy;
      const row = y * simW;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - gx;
        const d2 = dx * dx + dy * dy;
        const w = Math.exp(-d2 * invR2);
        if (w < 0.015) continue;
        const idx = row + x;
        const swirlX = -dy * 0.35;
        const swirlY = dx * 0.35;
        velU[idx] = clamp((velU[idx] ?? 0) + (vxImpulse + swirlX) * w, -42, 42);
        velV[idx] = clamp((velV[idx] ?? 0) + (vyImpulse + swirlY) * w, -42, 42);
        energy[idx] = clamp((energy[idx] ?? 0) + energyBoost * w, 0, 1.5);
      }
    }
  };

  const publishCurrentHeroSnapshot = () => {
    if (destroyed || cssWidth <= 0 || cssHeight <= 0 || cols <= 0 || rows <= 0) return;

    const cellW = cssWidth / cols;
    const cellH = cssHeight / rows;
    const stepX = Math.max(1 / simW, 0.72 / cols);
    const stepY = Math.max(1 / simH, 0.72 / rows);
    const rampLen = ATLAS_SPEC.asciiRamp.length;
    const cells: HeroGlyphCell[] = [];

    for (let row = 0; row < rows; row++) {
      const ny = (row + 0.5) / rows;
      const y = (row + 0.5) * cellH;
      const glRow = rows - 1 - row;

      for (let col = 0; col < cols; col++) {
        const nx = (col + 0.5) / cols;
        const clearMask = computeClearMask(nx, ny, aspect, clearRectDom);
        if (clearMask <= 0.35) continue;

        const maskVal = clamp01(sampleBilinear(targetMask, simW, simH, nx, ny));
        const edgeVal = clamp01(sampleBilinear(targetEdge, simW, simH, nx, ny));
        const inkVal = clamp01(maskVal * clearMask);
        const accVal = clamp01(edgeVal * 0.62 * clearMask);
        const lum = clamp01(inkVal + accVal * 0.14);
        const weight = Math.max(inkVal, accVal * 0.48);
        if (weight <= 0.20) continue;

        const tl = sampleBilinear(targetMask, simW, simH, nx - stepX, ny - stepY);
        const tc = sampleBilinear(targetMask, simW, simH, nx, ny - stepY);
        const tr = sampleBilinear(targetMask, simW, simH, nx + stepX, ny - stepY);
        const ml = sampleBilinear(targetMask, simW, simH, nx - stepX, ny);
        const mr = sampleBilinear(targetMask, simW, simH, nx + stepX, ny);
        const bl = sampleBilinear(targetMask, simW, simH, nx - stepX, ny + stepY);
        const bc = sampleBilinear(targetMask, simW, simH, nx, ny + stepY);
        const br = sampleBilinear(targetMask, simW, simH, nx + stepX, ny + stepY);

        const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
        const gy = tl + 2 * tc + tr - (bl + 2 * bc + br);
        const edgeMag = Math.hypot(gx, gy);

        let atlasRow = ATLAS_SPEC.rowAscii;
        let glyphIdx = Math.floor(clamp(lum, 0, 0.999) * rampLen);

        if (edgeMag * clearMask > 0.58 && inkVal > 0.24 && inkVal < 0.68) {
          atlasRow = ATLAS_SPEC.rowEdge;
          const eAngle = ((Math.atan2(gy, gx) % Math.PI) + Math.PI) % Math.PI;
          glyphIdx = angleToEdgeGlyphIdx(eAngle);
        } else if (glyphIdx <= 0) {
          continue;
        }

        cells.push({
          x: (col + 0.5) * cellW,
          y,
          cellW,
          cellH,
          atlasRow,
          glyphIdx,
          peelOrder: computeHeroPeelOrder(col, glRow, rows),
          intensity: lum,
        });
      }
    }

    publishHeroSnapshot({
      canvasWidth: cssWidth,
      canvasHeight: cssHeight,
      cols,
      rows,
      cells,
    });
  };

  const injectScrollPeelImpulses = (prevDissolve: number, nextDissolve: number) => {
    const delta = nextDissolve - prevDissolve;
    if (Math.abs(delta) <= 0.002) return;

    const midDissolve = 0.5 * (prevDissolve + nextDissolve);
    const bandGlUvY = clamp(0.22 + (midDissolve - 0.17) / 0.92, 0.14, 0.88);
    const bandNy = clamp(1 - bandGlUvY, 0.17, 0.72);
    const minSimY = Math.max(1, Math.ceil(simH * 0.17));
    const maxSimY = Math.min(simH - 2, Math.floor(simH * 0.78));
    const bandCenterY = clamp(bandNy * simH, minSimY, maxSimY);
    const bandHalfSpan = Math.max(4, simH * 0.14);
    const yLo = Math.max(minSimY, Math.floor(bandCenterY - bandHalfSpan));
    const yHi = Math.min(maxSimY, Math.ceil(bandCenterY + bandHalfSpan));

    const strength = clamp(Math.abs(delta) * 110, 1.5, 11);
    const vyBase = (delta > 0 ? -1 : 1) * strength;
    const energyBoost = clamp(Math.abs(delta) * 3.8, 0.08, 0.42);
    const radius = 3.0;

    const targetXs: number[] = [];
    const targetYs: number[] = [];
    const strideX = Math.max(2, Math.floor(simW / 16));
    for (let gx = 4; gx < simW - 4; gx += strideX) {
      let sumY = 0;
      let sumW = 0;
      for (let gy = yLo; gy <= yHi; gy++) {
        const w = targetMask[gy * simW + gx] ?? 0;
        if (w > 0.22) {
          sumY += gy * w;
          sumW += w;
        }
      }
      if (sumW > 0.25) {
        targetXs.push(gx);
        targetYs.push(sumY / sumW);
      }
    }

    if (targetXs.length > 0) {
      const maxSplats = 4;
      const step = Math.max(1, Math.floor(targetXs.length / maxSplats));
      let emitted = 0;
      for (let i = 0; i < targetXs.length && emitted < maxSplats; i += step) {
        const gx = targetXs[i]!;
        const gy = targetYs[i]!;
        const vxImpulse = Math.sin(simTimeSec * 4.5 + emitted * 1.85) * strength * 0.48;
        splatVelocity(gx, gy, vxImpulse, vyBase, radius, energyBoost);
        emitted++;
      }
    } else {
      for (let k = 0; k < 3; k++) {
        const gx = simW * (0.24 + k * 0.26);
        const vxImpulse = Math.sin(simTimeSec * 4.5 + k * 1.85) * strength * 0.48;
        splatVelocity(gx, bandCenterY, vxImpulse, vyBase, radius, energyBoost * 0.7);
      }
    }
  };

  const updateScrollDissolve = () => {
    const nextDissolve = readScrollDissolve();
    scrollDissolve = nextDissolve;

    if (reducedMotion) {
      prevImpulseDissolve = 0;
      return;
    }

    if (Math.abs(nextDissolve - prevImpulseDissolve) > 0.002) {
      injectScrollPeelImpulses(prevImpulseDissolve, nextDissolve);
      prevImpulseDissolve = nextDissolve;
    }
  };

  const applyFluidForcesAndCouple = (dt: number) => {
    applyVorticityConfinement(velU, velV, curlBuf, simW, simH, dt, 1.25);

    const velDamp = Math.exp(-dt * 1.85);
    for (let i = 0; i < SIM_N; i++) {
      velU[i] = (velU[i] ?? 0) * velDamp;
      velV[i] = (velV[i] ?? 0) * velDamp;
    }

    project(velU, velV, pressBuf, divBuf, simW, simH);

    velUPrev.set(velU);
    velVPrev.set(velV);
    advect(1, velU, velUPrev, velUPrev, velVPrev, simW, simH, dt);
    advect(2, velV, velVPrev, velUPrev, velVPrev, simW, simH, dt);
    project(velU, velV, pressBuf, divBuf, simW, simH);

    inkPrev.set(ink);
    energyPrev.set(energy);
    advect(0, ink, inkPrev, velU, velV, simW, simH, dt);
    advect(0, energy, energyPrev, velU, velV, simW, simH, dt);

    const energyDecay = Math.exp(-dt * 2.25);

    for (let y = 0; y < simH; y++) {
      const ny = (y + 0.5) / simH;
      // Keep the fixed top navbar region clean & unobstructed
      const navClear = smoothstep(0.07, 0.145, ny);
      const row = y * simW;
      for (let x = 0; x < simW; x++) {
        const nx = (x + 0.5) / simW;
        const i = row + x;

        const uVal = velU[i] ?? 0;
        const vVal = velV[i] ?? 0;
        const speed = Math.hypot(uVal, vVal);
        const mask = targetMask[i] ?? 0;
        const edge = targetEdge[i] ?? 0;

        const drift =
          Math.sin(nx * 9.5 + simTimeSec * 0.42 + uVal * 0.14) *
          Math.cos(ny * 6.8 - simTimeSec * 0.34 + vVal * 0.14);
        const contour = smoothstep(0.62, 0.98, Math.abs(drift));
        const desiredInk = Math.max(mask, contour * 0.15 * navClear);
        const ambientAccent = edge * 0.62;

        const curEnergy = energy[i] ?? 0;
        const shatterSuppress = 1 / (1 + speed * 0.48 + curEnergy * 1.45);
        const restore = Math.min(1, dt * 5.2 * shatterSuppress);
        const nextInk = (ink[i] ?? 0) + (desiredInk - (ink[i] ?? 0)) * restore;
        ink[i] = clamp01(nextInk);

        const velGlow = clamp01(speed * 0.068) * navClear;
        energy[i] = clamp(
          Math.max(
            curEnergy * energyDecay * (0.2 + 0.8 * navClear),
            velGlow,
            ambientAccent * clamp01(ink[i]! * 1.35),
          ),
          0,
          1.4,
        );
      }
    }
  };

  const populateStaticReducedFrame = () => {
    velU.fill(0);
    velV.fill(0);
    for (let y = 0; y < simH; y++) {
      const ny = (y + 0.5) / simH;
      const navClear = smoothstep(0.07, 0.145, ny);
      const row = y * simW;
      for (let x = 0; x < simW; x++) {
        const nx = (x + 0.5) / simW;
        const i = row + x;
        const mask = targetMask[i] ?? 0;
        const edge = targetEdge[i] ?? 0;
        const drift = Math.sin(nx * 9.5 + 1.0) * Math.cos(ny * 6.8 - 0.8);
        const contour = smoothstep(0.64, 0.98, Math.abs(drift));
        ink[i] = Math.max(mask, contour * 0.14 * navClear);
        energy[i] = edge * 0.62;
      }
    }
  };

  const packFluidTexture = () => {
    for (let y = 0; y < simH; y++) {
      const simRow = y * simW;
      const texRow = (simH - 1 - y) * simW;
      for (let x = 0; x < simW; x++) {
        const simIdx = simRow + x;
        const texIdx = (texRow + x) * 4;
        const inkVal = clamp01(ink[simIdx] ?? 0);
        const accVal = clamp01(energy[simIdx] ?? 0);
        const vxNorm = clamp((velU[simIdx] ?? 0) / 14, -1, 1);
        const vyNorm = clamp(-(velV[simIdx] ?? 0) / 14, -1, 1);

        packedRgba[texIdx] = Math.round(inkVal * 255);
        packedRgba[texIdx + 1] = Math.round(accVal * 255);
        packedRgba[texIdx + 2] = Math.round(128 + vxNorm * 127);
        packedRgba[texIdx + 3] = Math.round(128 + vyNorm * 127);
      }
    }
  };

  const renderSingleFrame = () => {
    if (destroyed || !backend) return;
    if (layoutDirty) {
      updateClearRect();
    }
    if (reducedMotion) {
      populateStaticReducedFrame();
    }
    packFluidTexture();
    backend.render({
      simW,
      simH,
      cols,
      rows,
      aspect,
      scrollDissolve,
      theme: themeColors,
      clearRectUv,
      clearRectDom,
      packedRgba,
      ink,
      energy,
      velU,
      velV,
    });
  };

  const syncSize = () => {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || canvas.clientWidth || window.innerWidth);
    const cssH = Math.max(1, rect.height || canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const nextW = Math.max(1, Math.round(cssW * dpr));
    const nextH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    widthPx = nextW;
    heightPx = nextH;
    cssWidth = cssW;
    cssHeight = cssH;
    aspect = cssW / cssH;

    const nextSimW = aspect < 1.0 ? LANDSCAPE_H : LANDSCAPE_W;
    const nextSimH = aspect < 1.0 ? LANDSCAPE_W : LANDSCAPE_H;
    if (nextSimW !== simW || nextSimH !== simH) {
      simW = nextSimW;
      simH = nextSimH;
      velU.fill(0);
      velV.fill(0);
      energy.fill(0);
    }

    const pitchX = cssW < 640 ? 5.8 : 9.2;
    const pitchY = cssW < 640 ? 9.2 : 14.5;
    cols = Math.max(42, Math.min(180, Math.round(cssW / pitchX)));
    rows = Math.max(28, Math.min(104, Math.round(cssH / pitchY)));

    backend?.resize(widthPx, heightPx, simW, simH);
    updateClearRect();
    updateScrollDissolve();
    rebuildTypographyMask(simTimeSec === 0);
    publishCurrentHeroSnapshot();
  };

  const stopLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const tick = (nowMs: number) => {
    rafId = null;
    if (destroyed || reducedMotion || !isVisible || !isPageVisible) return;

    const dt = lastFrameMs > 0 ? Math.min((nowMs - lastFrameMs) / 1000, 0.04) : 0.016;
    lastFrameMs = nowMs;
    simTimeSec += dt;

    updateScrollDissolve();
    applyFluidForcesAndCouple(dt);
    renderSingleFrame();
    rafId = requestAnimationFrame(tick);
  };

  const ensureLoopRunning = () => {
    if (destroyed) return;
    if (reducedMotion || !isVisible || !isPageVisible) {
      stopLoop();
      return;
    }
    if (rafId === null) {
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  };

  const requestStaticOrStart = () => {
    if (destroyed) return;
    if (reducedMotion) {
      stopLoop();
      renderSingleFrame();
    } else {
      ensureLoopRunning();
    }
  };

  // ── Passive pointer wake (touch-action: pan-y safe) ───────────────
  const onWindowPointerMove = (e: PointerEvent) => {
    if (destroyed || reducedMotion) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;

    if (!inside) {
      hasPrevPointer = false;
      return;
    }

    const nx = clamp01((e.clientX - rect.left) / rect.width);
    const ny = clamp01((e.clientY - rect.top) / rect.height);
    const gx = nx * simW;
    const gy = ny * simH;

    if (!hasPrevPointer) {
      prevSliceGridX = gx;
      prevSliceGridY = gy;
      hasPrevPointer = true;
      return;
    }

    const dx = gx - prevSliceGridX;
    const dy = gy - prevSliceGridY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.08) {
      const steps = Math.min(12, Math.max(1, Math.ceil(dist * 1.4)));
      const vxImp = clamp(dx * 5.2, -32, 32) / steps;
      const vyImp = clamp(dy * 5.2, -32, 32) / steps;
      const energyBoost = clamp(dist * 0.24, 0.28, 0.95) / Math.sqrt(steps);

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        splatVelocity(
          prevSliceGridX + dx * t,
          prevSliceGridY + dy * t,
          vxImp,
          vyImp,
          3.4,
          energyBoost,
        );
      }
      prevSliceGridX = gx;
      prevSliceGridY = gy;
    }
  };

  const onCanvasPointerLeave = () => {
    hasPrevPointer = false;
  };

  canvas.addEventListener("pointerleave", onCanvasPointerLeave, { passive: true });
  window.addEventListener("pointermove", onWindowPointerMove, { passive: true });

  const onContextLost = (e: Event) => {
    e.preventDefault();
    stopLoop();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  const onLayoutChange = () => {
    layoutDirty = true;
    updateScrollDissolve();
    if (reducedMotion) {
      updateClearRect();
      rebuildTypographyMask(true);
      renderSingleFrame();
    }
  };
  const onWindowResize = () => {
    syncSize();
    if (reducedMotion) renderSingleFrame();
  };
  window.addEventListener("scroll", onLayoutChange, { passive: true });
  window.addEventListener("resize", onWindowResize, { passive: true });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      syncSize();
      if (reducedMotion) renderSingleFrame();
    });
    resizeObserver.observe(canvas);
    if (options.clearElement) {
      resizeObserver.observe(options.clearElement);
    }
  }

  let intersectionObserver: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== "undefined") {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isVisible = entry.isIntersecting;
        if (isVisible) {
          updateScrollDissolve();
          renderSingleFrame();
          requestStaticOrStart();
        } else {
          stopLoop();
        }
      },
      { threshold: 0.01 },
    );
    intersectionObserver.observe(canvas);
  }

  const onVisibilityChange = () => {
    isPageVisible = !document.hidden;
    if (isPageVisible) {
      requestStaticOrStart();
    } else {
      stopLoop();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  const stopThemeObserver = observeDataTheme(() => {
    themeColors = resolveThemeColors();
    if (reducedMotion || !isVisible) {
      updateScrollDissolve();
      renderSingleFrame();
    }
  });

  const stopMotionObserver = observeReducedMotion((nextReduced) => {
    reducedMotion = nextReduced;
    if (reducedMotion) {
      scrollDissolve = 0;
      prevImpulseDissolve = 0;
      simTimeSec = STATIC_REDUCED_MOTION_SEC;
      stopLoop();
      renderSingleFrame();
    } else {
      scrollDissolve = readScrollDissolve();
      prevImpulseDissolve = scrollDissolve;
      ensureLoopRunning();
    }
  });

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopLoop();

    canvas.removeEventListener("pointerleave", onCanvasPointerLeave);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("scroll", onLayoutChange);
    window.removeEventListener("resize", onWindowResize);
    document.removeEventListener("visibilitychange", onVisibilityChange);

    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    stopThemeObserver();
    stopMotionObserver();

    velU = new Float32Array(0);
    velV = new Float32Array(0);
    velUPrev = new Float32Array(0);
    velVPrev = new Float32Array(0);
    ink = new Float32Array(0);
    inkPrev = new Float32Array(0);
    energy = new Float32Array(0);
    energyPrev = new Float32Array(0);

    backend?.destroy();
    backend = null;
  };

  // Immediate first paint before fonts finish loading
  syncSize();
  renderSingleFrame();
  if (!reducedMotion) {
    ensureLoopRunning();
  }

  // Refresh glyph atlas & General Sans typography mask once fonts resolve
  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (destroyed) return;
      buildGlyphAtlasCanvas(atlasCanvas);
      backend?.uploadAtlas(atlasCanvas);
      updateClearRect();
      rebuildTypographyMask(reducedMotion || simTimeSec < 0.35);
      publishCurrentHeroSnapshot();
      renderSingleFrame();
    });
  }

  return {
    destroy,
  };
}
