import {
  ATLAS_SPEC,
  CHARSET_FONT_STACK,
  buildGlyphAtlasCanvas,
  getRampForCharset,
  isReducedMotionPreferred,
  mixRgb,
  observeDataTheme,
  observeReducedMotion,
  resolveThemeColors,
  rgbToCss,
  type ThemeColors,
} from "./ascii-atlas";
import {
  FULLSCREEN_VERTEX_SHADER,
  PASS1_FRAGMENT_SHADER,
  PASS2_FRAGMENT_SHADER,
} from "./ascii-shaders";

export type AsciiScene = "ferro" | "terrain" | "orbit" | "flow";
export type AsciiCharset = "ascii" | "braille" | "blocks";

export interface HeroAsciiOptions {
  clearElement?: HTMLElement | null;
  initialScene?: AsciiScene;
  initialCharset?: AsciiCharset;
}

export interface HeroAsciiHandle {
  setScene: (scene: AsciiScene) => void;
  setCharset: (charset: AsciiCharset) => void;
  triggerShockwave: (normX: number, normY: number) => void;
  destroy: () => void;
}

interface ShockwaveSlot {
  x: number;
  y: number;
  startMs: number;
  active: boolean;
}

interface RenderState {
  timeSec: number;
  aspect: number;
  cols: number;
  rows: number;
  sceneA: number;
  sceneB: number;
  sceneBlend: number;
  charset: AsciiCharset;
  orbitYaw: number;
  orbitPitch: number;
  pointerX: number;
  pointerY: number;
  pointerVelX: number;
  pointerVelY: number;
  pointerActive: number;
  shockwaves: readonly ShockwaveSlot[];
  nowMs: number;
  theme: ThemeColors;
  clearRectUv: readonly [number, number, number, number] | null;
  clearRectDom: readonly [number, number, number, number] | null;
}

interface EngineBackend {
  uploadAtlas: (atlasCanvas: HTMLCanvasElement) => void;
  resize: (widthPx: number, heightPx: number, cols: number, rows: number) => void;
  render: (state: RenderState) => void;
  destroy: () => void;
}

const SCENE_INDEX: Record<AsciiScene, number> = {
  ferro: 0,
  terrain: 1,
  orbit: 2,
  flow: 3,
};

const CHARSET_INDEX: Record<AsciiCharset, number> = {
  ascii: 0,
  braille: 1,
  blocks: 2,
};

const SHOCKWAVE_DURATION_MS = 1400;
const STATIC_REDUCED_MOTION_TIME_SEC = 2.6;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
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

  const prog1 = linkProgram(gl, FULLSCREEN_VERTEX_SHADER, PASS1_FRAGMENT_SHADER);
  const prog2 = linkProgram(gl, FULLSCREEN_VERTEX_SHADER, PASS2_FRAGMENT_SHADER);
  if (!prog1 || !prog2) {
    if (prog1) gl.deleteProgram(prog1);
    if (prog2) gl.deleteProgram(prog2);
    return null;
  }

  const vao = gl.createVertexArray();
  const fbo = gl.createFramebuffer();
  const fboTex = gl.createTexture();
  const atlasTex = gl.createTexture();

  if (!vao || !fbo || !fboTex || !atlasTex) {
    if (vao) gl.deleteVertexArray(vao);
    if (fbo) gl.deleteFramebuffer(fbo);
    if (fboTex) gl.deleteTexture(fboTex);
    if (atlasTex) gl.deleteTexture(atlasTex);
    gl.deleteProgram(prog1);
    gl.deleteProgram(prog2);
    return null;
  }

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

  const configureTexture = (tex: WebGLTexture, filter: number) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  };

  configureTexture(fboTex, gl.LINEAR);
  configureTexture(atlasTex, gl.LINEAR);

  // Upload initial glyph atlas
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);

  let fboWidth = 256;
  let fboHeight = 128;
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    fboWidth,
    fboHeight,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteVertexArray(vao);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(fboTex);
    gl.deleteTexture(atlasTex);
    gl.deleteProgram(prog1);
    gl.deleteProgram(prog2);
    return null;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const u1 = {
    uTime: gl.getUniformLocation(prog1, "uTime"),
    uAspect: gl.getUniformLocation(prog1, "uAspect"),
    uSceneA: gl.getUniformLocation(prog1, "uSceneA"),
    uSceneB: gl.getUniformLocation(prog1, "uSceneB"),
    uSceneBlend: gl.getUniformLocation(prog1, "uSceneBlend"),
    uOrbit: gl.getUniformLocation(prog1, "uOrbit"),
    uPointer: gl.getUniformLocation(prog1, "uPointer"),
    uPointerVel: gl.getUniformLocation(prog1, "uPointerVel"),
    uPointerActive: gl.getUniformLocation(prog1, "uPointerActive"),
    uShockwaves: [
      gl.getUniformLocation(prog1, "uShockwaves[0]"),
      gl.getUniformLocation(prog1, "uShockwaves[1]"),
      gl.getUniformLocation(prog1, "uShockwaves[2]"),
      gl.getUniformLocation(prog1, "uShockwaves[3]"),
    ] as const,
  };

  const u2 = {
    uSceneTex: gl.getUniformLocation(prog2, "uSceneTex"),
    uAtlasTex: gl.getUniformLocation(prog2, "uAtlasTex"),
    uGridSize: gl.getUniformLocation(prog2, "uGridSize"),
    uFboTexel: gl.getUniformLocation(prog2, "uFboTexel"),
    uAtlasDims: gl.getUniformLocation(prog2, "uAtlasDims"),
    uAspect: gl.getUniformLocation(prog2, "uAspect"),
    uCharset: gl.getUniformLocation(prog2, "uCharset"),
    uPaperColor: gl.getUniformLocation(prog2, "uPaperColor"),
    uInkColor: gl.getUniformLocation(prog2, "uInkColor"),
    uMutedColor: gl.getUniformLocation(prog2, "uMutedColor"),
    uAccentColor: gl.getUniformLocation(prog2, "uAccentColor"),
    uClearRect: gl.getUniformLocation(prog2, "uClearRect"),
    uHasClearRect: gl.getUniformLocation(prog2, "uHasClearRect"),
  };

  let screenW = canvas.width;
  let screenH = canvas.height;

  const uploadAtlas = (nextAtlas: HTMLCanvasElement) => {
    if (gl.isContextLost()) return;
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, nextAtlas);
  };

  const resize = (widthPx: number, heightPx: number, cols: number, rows: number) => {
    screenW = Math.max(1, widthPx);
    screenH = Math.max(1, heightPx);
    const nextFboW = Math.max(64, Math.min(512, cols * 2));
    const nextFboH = Math.max(48, Math.min(512, rows * 2));
    if (nextFboW !== fboWidth || nextFboH !== fboHeight) {
      fboWidth = nextFboW;
      fboHeight = nextFboH;
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        fboWidth,
        fboHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
    }
  };

  const render = (state: RenderState) => {
    if (gl.isContextLost()) return;

    gl.bindVertexArray(vao);

    // ── Pass 1: Scene -> RGBA8 FBO ────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, fboWidth, fboHeight);
    gl.useProgram(prog1);

    gl.uniform1f(u1.uTime, state.timeSec);
    gl.uniform1f(u1.uAspect, state.aspect);
    gl.uniform1i(u1.uSceneA, state.sceneA);
    gl.uniform1i(u1.uSceneB, state.sceneB);
    gl.uniform1f(u1.uSceneBlend, state.sceneBlend);
    gl.uniform2f(u1.uOrbit, state.orbitYaw, state.orbitPitch);
    gl.uniform2f(u1.uPointer, state.pointerX, 1.0 - state.pointerY);
    gl.uniform2f(u1.uPointerVel, state.pointerVelX, -state.pointerVelY);
    gl.uniform1f(u1.uPointerActive, state.pointerActive);

    for (let i = 0; i < 4; i++) {
      const slot = state.shockwaves[i];
      if (!slot || !slot.active) {
        gl.uniform4f(u1.uShockwaves[i] ?? null, 0.5, 0.5, -1.0, 0.0);
      } else {
        const age = (state.nowMs - slot.startMs) / SHOCKWAVE_DURATION_MS;
        if (age >= 1.0 || age < 0.0) {
          gl.uniform4f(u1.uShockwaves[i] ?? null, 0.5, 0.5, -1.0, 0.0);
        } else {
          gl.uniform4f(u1.uShockwaves[i] ?? null, slot.x, 1.0 - slot.y, age, 1.0);
        }
      }
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── Pass 2: FBO + Sobel Edge Detection + Atlas -> Screen ─────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, screenW, screenH);
    gl.useProgram(prog2);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.uniform1i(u2.uSceneTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(u2.uAtlasTex, 1);

    gl.uniform2f(u2.uGridSize, state.cols, state.rows);
    gl.uniform2f(u2.uFboTexel, 1.0 / fboWidth, 1.0 / fboHeight);
    gl.uniform2f(u2.uAtlasDims, ATLAS_SPEC.cols, ATLAS_SPEC.rows);
    gl.uniform1f(u2.uAspect, state.aspect);
    gl.uniform1i(u2.uCharset, CHARSET_INDEX[state.charset]);

    const { paper, ink, muted, accent } = state.theme;
    gl.uniform3f(u2.uPaperColor, paper.r, paper.g, paper.b);
    gl.uniform3f(u2.uInkColor, ink.r, ink.g, ink.b);
    gl.uniform3f(u2.uMutedColor, muted.r, muted.g, muted.b);
    gl.uniform3f(u2.uAccentColor, accent.r, accent.g, accent.b);

    if (state.clearRectUv) {
      gl.uniform4f(
        u2.uClearRect,
        state.clearRectUv[0],
        state.clearRectUv[1],
        state.clearRectUv[2],
        state.clearRectUv[3],
      );
      gl.uniform1f(u2.uHasClearRect, 1.0);
    } else {
      gl.uniform4f(u2.uClearRect, 0.0, 0.0, 0.0, 0.0);
      gl.uniform1f(u2.uHasClearRect, 0.0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  const destroy = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteVertexArray(vao);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(fboTex);
    gl.deleteTexture(atlasTex);
    gl.deleteProgram(prog1);
    gl.deleteProgram(prog2);
  };

  return {
    uploadAtlas,
    resize,
    render,
    destroy,
  };
}

function createCanvas2DBackend(canvas: HTMLCanvasElement): EngineBackend | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let lumaBuf = new Float32Array(0);
  let accentBuf = new Float32Array(0);

  const evalFallbackCell = (
    sceneId: number,
    nx: number,
    ny: number,
    state: RenderState,
  ): [number, number] => {
    const px = (nx * 2 - 1) * state.aspect;
    const py = ny * 2 - 1;
    const ptrPx = (state.pointerX * 2 - 1) * state.aspect;
    const ptrPy = state.pointerY * 2 - 1;
    const t = state.timeSec;

    if (sceneId === 0) {
      // Ferro metaballs 2D field
      let field = 0;
      for (let i = 0; i < 5; i++) {
        const phase = i * 1.2566 + t * (0.55 + i * 0.08);
        const cx = Math.sin(phase * 1.1 + state.orbitYaw) * 0.65;
        const cy = Math.cos(phase * 0.9 + state.orbitPitch) * 0.45;
        const dx = px - cx;
        const dy = py - cy;
        field += 0.12 / (dx * dx + dy * dy + 0.06);
      }
      if (state.pointerActive > 0.01) {
        const dx = px - ptrPx;
        const dy = py - ptrPy;
        field += (0.09 * state.pointerActive) / (dx * dx + dy * dy + 0.05);
      }
      const lum = clamp01((field - 0.55) * 0.75);
      const rim = clamp01(Math.exp(-Math.abs(field - 1.15) * 4.5));
      return [lum, rim];
    }

    if (sceneId === 1) {
      // Topographic contour lines
      const h =
        Math.sin(px * 2.1 + t * 0.45 + state.orbitYaw) *
          Math.cos(py * 2.4 - t * 0.35 + state.orbitPitch) *
          0.5 +
        Math.sin((px + py) * 3.1 - t * 0.25) * 0.25;
      const frac = Math.abs(((h * 5.0) % 1 + 1) % 1 - 0.5);
      const contour = clamp01(1 - frac / 0.14);
      const scan = Math.exp(-Math.pow((((ny - t * 0.18) % 1 + 1) % 1 - 0.5) * 10, 2));
      return [clamp01(0.18 + contour * 0.65 + scan * 0.2), clamp01(contour * 0.6 + scan * 0.75)];
    }

    if (sceneId === 2) {
      // Graticule sphere projection
      const r = 0.76;
      const dist = Math.hypot(px, py);
      if (dist > r) {
        const ring = Math.exp(-Math.pow((Math.hypot(px, py * 1.7) - 1.02) * 18, 2));
        return [ring * 0.55, ring * 0.45];
      }
      const z = Math.sqrt(Math.max(0, r * r - dist * dist));
      const lon = Math.atan2(px, z) + t * 0.4 + state.orbitYaw;
      const lat = Math.asin(clamp01((py / r + 1) * 0.5) * 2 - 1) + state.orbitPitch * 0.5;
      const gLon = Math.abs((((lon / (Math.PI / 6)) % 1) + 1) % 1 - 0.5);
      const gLat = Math.abs((((lat / (Math.PI / 6)) % 1) + 1) % 1 - 0.5);
      const grid = Math.max(gLon < 0.08 ? 1 : 0, gLat < 0.08 ? 1 : 0);
      const scan = Math.exp(-Math.pow(((((lon / (Math.PI * 2) - t * 0.22) % 1) + 1) % 1 - 0.5) * 12, 2));
      return [clamp01(0.2 + grid * 0.62 + scan * 0.25), clamp01(scan * 0.85)];
    }

    // Flow streamlines
    const topFade = clamp01((ny - 0.045) / 0.145);
    const dp = Math.hypot(px - ptrPx, py - ptrPy);
    const wake = Math.exp(-dp * dp * 6.0) * state.pointerActive;
    const wave =
      Math.sin(px * 4.5 + Math.cos(py * 3.2 + t * 0.6) * 1.5 - t * 0.8 + state.orbitYaw) * 0.5 +
      0.5;
    return [
      clamp01(wave * 0.72 + wake * 0.3) * topFade,
      clamp01(wake * 0.85 + Math.pow(wave, 3) * 0.35) * topFade,
    ];
  };

  return {
    uploadAtlas: () => {},
    resize: () => {},
    render: (state: RenderState) => {
      const { cols, rows, theme } = state;
      const w = canvas.width;
      const h = canvas.height;
      const count = cols * rows;
      if (lumaBuf.length !== count) {
        lumaBuf = new Float32Array(count);
        accentBuf = new Float32Array(count);
      }

      for (let row = 0; row < rows; row++) {
        const ny = (row + 0.5) / rows;
        for (let col = 0; col < cols; col++) {
          const nx = (col + 0.5) / cols;
          const idx = row * cols + col;
          let [lum, acc] = evalFallbackCell(state.sceneB, nx, ny, state);
          if (state.sceneA !== state.sceneB && state.sceneBlend < 0.999) {
            const [la, aa] = evalFallbackCell(state.sceneA, nx, ny, state);
            lum = la + (lum - la) * state.sceneBlend;
            acc = aa + (acc - aa) * state.sceneBlend;
          }
          lumaBuf[idx] = lum;
          accentBuf[idx] = acc;
        }
      }

      // Add shockwaves
      for (let s = 0; s < 4; s++) {
        const sw = state.shockwaves[s];
        if (!sw || !sw.active) continue;
        const age = (state.nowMs - sw.startMs) / SHOCKWAVE_DURATION_MS;
        if (age < 0 || age >= 1) continue;
        const radius = age * 0.92;
        const fade = 1 - age;
        for (let row = 0; row < rows; row++) {
          const ny = (row + 0.5) / rows;
          for (let col = 0; col < cols; col++) {
            const nx = (col + 0.5) / cols;
            const d = Math.hypot((nx - sw.x) * state.aspect, ny - sw.y);
            const ring = Math.exp(-Math.pow((d - radius) * 18, 2)) * fade;
            if (ring > 0.02) {
              const idx = row * cols + col;
              lumaBuf[idx] = clamp01((lumaBuf[idx] ?? 0) + ring * 0.45);
              accentBuf[idx] = clamp01((accentBuf[idx] ?? 0) + ring * 0.85);
            }
          }
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

      const ramp = getRampForCharset(state.charset);
      const edges = ATLAS_SPEC.edgeRamp;
      const edgeChars = [
        edges[0] ?? "|",
        edges[1] ?? "/",
        edges[2] ?? "-",
        edges[3] ?? "\\",
      ] as const;

      for (let row = 0; row < rows; row++) {
        const ny = (row + 0.5) / rows;
        for (let col = 0; col < cols; col++) {
          const nx = (col + 0.5) / cols;

          let clearMask = 1;
          if (state.clearRectDom) {
            const [cl, ct, cr, cb] = state.clearRectDom;
            const cx = (cl + cr) * 0.5;
            const cy = (ct + cb) * 0.5;
            const hx = Math.max(0.001, (cr - cl) * 0.5);
            const hy = Math.max(0.001, (cb - ct) * 0.5);
            const dx = (Math.abs(nx - cx) - hx) * state.aspect;
            const dy = Math.abs(ny - cy) - hy;
            const boxDist =
              Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
            clearMask = clamp01((boxDist - 0.015) / 0.145);
          }

          const idx = row * cols + col;
          const lum = clamp01((lumaBuf[idx] ?? 0) * clearMask);
          if (lum < 0.05) continue;

          let ch = ramp[Math.min(ramp.length - 1, Math.floor(lum * ramp.length))] ?? " ";

          if (state.charset === "ascii" && clearMask > 0.35 && col > 0 && col < cols - 1 && row > 0 && row < rows - 1) {
            const gx = (lumaBuf[idx + 1] ?? 0) - (lumaBuf[idx - 1] ?? 0);
            const gy = (lumaBuf[idx - cols] ?? 0) - (lumaBuf[idx + cols] ?? 0);
            const mag = Math.hypot(gx, gy) * clearMask;
            if (mag > 0.24) {
              const angle = ((Math.atan2(gy, gx) % Math.PI) + Math.PI) % Math.PI;
              if (angle < Math.PI * 0.125 || angle >= Math.PI * 0.875) ch = edgeChars[0];
              else if (angle < Math.PI * 0.375) ch = edgeChars[3];
              else if (angle < Math.PI * 0.625) ch = edgeChars[2];
              else ch = edgeChars[1];
            }
          }

          if (ch === " " || ch === "\u2800") continue;

          const acc = clamp01(accentBuf[idx] ?? 0);
          const base = mixRgb(theme.muted, theme.ink, clamp01((lum - 0.24) / 0.58));
          const finalRgb = mixRgb(base, theme.accent, clamp01((acc - 0.32) / 0.56));
          ctx.fillStyle = rgbToCss(finalRgb, clearMask);
          ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
        }
      }
    },
    destroy: () => {
      lumaBuf = new Float32Array(0);
      accentBuf = new Float32Array(0);
    },
  };
}

export function mountHeroAscii(
  canvas: HTMLCanvasElement,
  options: HeroAsciiOptions = {},
): HeroAsciiHandle {
  let destroyed = false;
  let sceneA = SCENE_INDEX[options.initialScene ?? "ferro"];
  let sceneB = sceneA;
  let sceneBlend = 1;
  let currentCharset: AsciiCharset = options.initialCharset ?? "ascii";

  let reducedMotion = isReducedMotionPreferred();
  let isVisible = true;
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;

  let themeColors = resolveThemeColors();
  const atlasCanvas = buildGlyphAtlasCanvas();

  let backend: EngineBackend | null = createWebGL2Backend(canvas, atlasCanvas);
  if (!backend) {
    backend = createCanvas2DBackend(canvas);
  }

  let widthPx = 1;
  let heightPx = 1;
  let cols = 80;
  let rows = 36;
  let aspect = 16 / 9;

  let orbitYaw = 0;
  let orbitPitch = 0;
  let orbitVelX = 0;
  let orbitVelY = 0;

  let pointerX = 0.5;
  let pointerY = 0.5;
  let pointerVelX = 0;
  let pointerVelY = 0;
  let pointerActive = 0;
  let pointerActiveTarget = 0;

  const shockwaves: ShockwaveSlot[] = [
    { x: 0.5, y: 0.5, startMs: 0, active: false },
    { x: 0.5, y: 0.5, startMs: 0, active: false },
    { x: 0.5, y: 0.5, startMs: 0, active: false },
    { x: 0.5, y: 0.5, startMs: 0, active: false },
  ];
  let shockwaveCursor = 0;
  let lastShockMs = -1000;
  let lastShockX = -1;
  let lastShockY = -1;
  let lastDragEndMs = -1000;

  let clearRectUv: [number, number, number, number] | null = null;
  let clearRectDom: [number, number, number, number] | null = null;
  let layoutDirty = true;

  let simTimeSec = reducedMotion ? STATIC_REDUCED_MOTION_TIME_SEC : 0;
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
    aspect = cssW / cssH;

    const pitchX = cssW < 640 ? 10 : 11;
    const pitchY = cssW < 640 ? 16 : 17;
    cols = Math.max(32, Math.min(180, Math.round(cssW / pitchX)));
    rows = Math.max(18, Math.min(90, Math.round(cssH / pitchY)));

    backend?.resize(widthPx, heightPx, cols, rows);
    layoutDirty = true;
  };

  const renderSingleFrame = (nowMs: number) => {
    if (destroyed || !backend) return;
    if (layoutDirty) updateClearRect();

    backend.render({
      timeSec: simTimeSec,
      aspect,
      cols,
      rows,
      sceneA,
      sceneB,
      sceneBlend,
      charset: currentCharset,
      orbitYaw,
      orbitPitch,
      pointerX,
      pointerY,
      pointerVelX,
      pointerVelY,
      pointerActive,
      shockwaves,
      nowMs,
      theme: themeColors,
      clearRectUv,
      clearRectDom,
    });
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

    const dt = lastFrameMs > 0 ? Math.min((nowMs - lastFrameMs) / 1000, 0.05) : 0.016;
    lastFrameMs = nowMs;
    simTimeSec += dt;

    if (sceneBlend < 1) {
      sceneBlend = Math.min(1, sceneBlend + dt / 0.65);
      if (sceneBlend >= 1) {
        sceneA = sceneB;
      }
    }

    // Orbit inertia decay
    orbitYaw += orbitVelX * dt;
    orbitPitch = Math.max(-0.9, Math.min(0.9, orbitPitch + orbitVelY * dt));
    const decay = Math.exp(-dt * 4.5);
    orbitVelX *= decay;
    orbitVelY *= decay;

    // Pointer smoothing
    pointerActive += (pointerActiveTarget - pointerActive) * (1 - Math.exp(-dt * 7.5));
    pointerVelX *= Math.exp(-dt * 9.0);
    pointerVelY *= Math.exp(-dt * 9.0);

    // Expire completed shockwaves
    for (let i = 0; i < 4; i++) {
      const slot = shockwaves[i];
      if (slot && slot.active && nowMs - slot.startMs >= SHOCKWAVE_DURATION_MS) {
        slot.active = false;
      }
    }

    renderSingleFrame(nowMs);
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
      renderSingleFrame(performance.now());
    } else {
      ensureLoopRunning();
    }
  };

  // ── Pointer & Drag-to-Orbit (touch-action: pan-y compliant) ──────
  let activePointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragLastX = 0;
  let dragLastY = 0;
  let dragDistance = 0;
  let isTouchPointer = false;

  const onCanvasPointerDown = (e: PointerEvent) => {
    if (destroyed) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    activePointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    dragDistance = 0;
    isTouchPointer = e.pointerType === "touch";
  };

  const onWindowPointerMove = (e: PointerEvent) => {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (inside || activePointerId === e.pointerId) {
        const nx = clamp01((e.clientX - rect.left) / rect.width);
        const ny = clamp01((e.clientY - rect.top) / rect.height);
        pointerVelX = Math.max(-1.5, Math.min(1.5, (nx - pointerX) * 18));
        pointerVelY = Math.max(-1.5, Math.min(1.5, (ny - pointerY) * 18));
        pointerX = nx;
        pointerY = ny;
        pointerActiveTarget = 1;
      } else {
        pointerActiveTarget = 0;
      }
    }

    if (activePointerId === e.pointerId) {
      const dx = e.clientX - dragLastX;
      const dy = e.clientY - dragLastY;
      dragDistance += Math.hypot(dx, dy);

      // Yield immediately to vertical touch scroll (touch-action: pan-y)
      if (isTouchPointer) {
        const totalDx = Math.abs(e.clientX - dragStartX);
        const totalDy = Math.abs(e.clientY - dragStartY);
        if (totalDy > totalDx * 1.15 && totalDy > 10) {
          activePointerId = null;
          return;
        }
      }

      if (rect.width > 0 && rect.height > 0) {
        const dYaw = (dx / rect.width) * 2.8;
        const dPitch = (dy / rect.height) * 2.2;
        orbitYaw += dYaw;
        orbitPitch = Math.max(-0.9, Math.min(0.9, orbitPitch + dPitch));
        orbitVelX = dYaw * 24;
        orbitVelY = dPitch * 24;
      }
      dragLastX = e.clientX;
      dragLastY = e.clientY;
    }
  };

  const onWindowPointerUp = (e: PointerEvent) => {
    if (activePointerId !== e.pointerId) return;
    const wasTap = e.type === "pointerup" && dragDistance < 6 && e.target === canvas;
    if (!wasTap && dragDistance >= 6) {
      lastDragEndMs = performance.now();
    }
    activePointerId = null;

    if (wasTap) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        triggerShockwave(
          (e.clientX - rect.left) / rect.width,
          (e.clientY - rect.top) / rect.height,
        );
      }
    }
  };

  const onCanvasPointerLeave = () => {
    if (activePointerId === null) {
      pointerActiveTarget = 0;
    }
  };

  canvas.addEventListener("pointerdown", onCanvasPointerDown, { passive: true });
  canvas.addEventListener("pointerleave", onCanvasPointerLeave, { passive: true });
  window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
  window.addEventListener("pointerup", onWindowPointerUp, { passive: true });
  window.addEventListener("pointercancel", onWindowPointerUp, { passive: true });

  // ── WebGL Context Loss Guard ─────────────────────────────────────
  const onContextLost = (e: Event) => {
    e.preventDefault();
    stopLoop();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  // ── Observers (Resize, Intersection, Theme, Motion, Visibility) ──
  const onLayoutChange = () => {
    layoutDirty = true;
    if (reducedMotion) renderSingleFrame(performance.now());
  };
  window.addEventListener("scroll", onLayoutChange, { passive: true });
  window.addEventListener("resize", syncSize, { passive: true });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      syncSize();
      if (reducedMotion) renderSingleFrame(performance.now());
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
      renderSingleFrame(performance.now());
    }
  });

  const stopMotionObserver = observeReducedMotion((nextReduced) => {
    reducedMotion = nextReduced;
    if (reducedMotion) {
      simTimeSec = STATIC_REDUCED_MOTION_TIME_SEC;
      sceneA = sceneB;
      sceneBlend = 1;
      stopLoop();
      renderSingleFrame(performance.now());
    } else {
      ensureLoopRunning();
    }
  });

  // ── Public API Methods ───────────────────────────────────────────
  const setScene = (scene: AsciiScene) => {
    if (destroyed) return;
    const nextIdx = SCENE_INDEX[scene];
    if (nextIdx === undefined) return;
    if (nextIdx === sceneB) return;

    if (reducedMotion) {
      sceneA = nextIdx;
      sceneB = nextIdx;
      sceneBlend = 1;
      renderSingleFrame(performance.now());
    } else {
      if (sceneBlend > 0.5) {
        sceneA = sceneB;
      }
      sceneB = nextIdx;
      sceneBlend = 0;
      ensureLoopRunning();
    }
  };

  const setCharset = (charset: AsciiCharset) => {
    if (destroyed) return;
    currentCharset = charset;
    if (reducedMotion) {
      renderSingleFrame(performance.now());
    }
  };

  const triggerShockwave = (normX: number, normY: number) => {
    if (destroyed) return;
    const now = performance.now();
    if (now - lastDragEndMs < 80) return;

    const nx = clamp01(normX);
    const ny = clamp01(normY);
    if (now - lastShockMs < 60 && Math.hypot(nx - lastShockX, ny - lastShockY) < 0.03) {
      return;
    }
    lastShockMs = now;
    lastShockX = nx;
    lastShockY = ny;

    const slot = shockwaves[shockwaveCursor];
    if (slot) {
      slot.x = nx;
      slot.y = ny;
      slot.startMs = reducedMotion ? now - SHOCKWAVE_DURATION_MS * 0.25 : now;
      slot.active = true;
    }
    shockwaveCursor = (shockwaveCursor + 1) % 4;

    if (reducedMotion) {
      renderSingleFrame(now);
    }
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    stopLoop();

    canvas.removeEventListener("pointerdown", onCanvasPointerDown);
    canvas.removeEventListener("pointerleave", onCanvasPointerLeave);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("pointercancel", onWindowPointerUp);
    window.removeEventListener("scroll", onLayoutChange);
    window.removeEventListener("resize", syncSize);
    document.removeEventListener("visibilitychange", onVisibilityChange);

    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    stopThemeObserver();
    stopMotionObserver();

    backend?.destroy();
    backend = null;
  };

  // Immediate first paint before document.fonts.ready resolves
  syncSize();
  renderSingleFrame(performance.now());
  if (!reducedMotion) {
    ensureLoopRunning();
  }

  // Refresh glyph atlas once Geist Mono finishes loading
  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (destroyed) return;
      buildGlyphAtlasCanvas(atlasCanvas);
      backend?.uploadAtlas(atlasCanvas);
      layoutDirty = true;
      renderSingleFrame(performance.now());
    });
  }

  return {
    setScene,
    setCharset,
    triggerShockwave,
    destroy,
  };
}
