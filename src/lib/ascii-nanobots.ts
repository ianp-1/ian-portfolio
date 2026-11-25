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
import {
  computeHeroScrollDissolve,
  getHeroSnapshot,
  subscribeHeroSnapshot,
  type HeroGlyphCell,
  type HeroGlyphSnapshot,
} from "./hero-glyph-bridge";

export interface NanobotHandle {
  destroy: () => void;
}

type AssembleKind =
  | "heading"
  | "project"
  | "role"
  | "stack-col"
  | "contact"
  | "exp-bar";

const DESKTOP_POOL_MAX = 1400;
const MOBILE_POOL_MAX = 750;
const CANVAS2D_POOL_MAX = 520;
const MOBILE_BREAKPOINT_PX = 640;
const MARGIN_ORBIT_MIN_GAP_PX = 64;
const MARGIN_ORBIT_COUNT = 34;

const FLOATS_PER_INSTANCE = 8;

// Particle state machine
const P_HERO_DORMANT = 0;
const P_HERO_PEELING = 1;
const P_FLYING = 2;
const P_LOCKED = 3;
const P_RETURNING_HERO = 4;
const P_MARGIN_ORBIT = 5;

// ATLAS_SPEC.rowAscii (" .:-=+*#%@") indices (0 is space)
const ASCII_DOT = 1;
const ASCII_COLON = 2;
const ASCII_DASH = 3;
const ASCII_EQ = 4;
const ASCII_PLUS = 5;
const ASCII_STAR = 6;
const ASCII_HASH = 7;
const ASCII_AT = 9;

// ATLAS_SPEC.rowEdge ("|/-\\") indices
const EDGE_PIPE = 0;
const EDGE_SLASH = 1;
const EDGE_DASH = 2;
const EDGE_BACKSLASH = 3;

const TONE_COUNT = 4;
const ALPHA_STEPS = 24;

const FONT_12 = `500 12px ${CHARSET_FONT_STACK}`;
const FONT_14 = `500 14px ${CHARSET_FONT_STACK}`;
const FONT_16 = `600 16px ${CHARSET_FONT_STACK}`;

const INSTANCED_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec4 aPosSize;
layout(location = 1) in vec4 aGlyphTone;

uniform vec2 uViewport;
uniform vec2 uAtlasDims;

out vec2 vAtlasUv;
out float vTone;
out float vAlpha;

void main() {
  vec2 unit = vec2(
    float(gl_VertexID & 1),
    float((gl_VertexID >> 1) & 1)
  );
  vec2 corner = unit - 0.5;
  vec2 px = aPosSize.xy + corner * aPosSize.zw;

  vec2 ndc = vec2(
    (px.x / uViewport.x) * 2.0 - 1.0,
    1.0 - (px.y / uViewport.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);

  vec2 inset = mix(vec2(0.03), vec2(0.97), unit);
  vAtlasUv = (vec2(aGlyphTone.x, aGlyphTone.y) + inset) / uAtlasDims;
  vTone = aGlyphTone.z;
  vAlpha = aGlyphTone.w;
}
`;

const INSTANCED_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vAtlasUv;
in float vTone;
in float vAlpha;

uniform sampler2D uAtlasTex;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

out vec4 fragColor;

void main() {
  float glyphAlpha = texture(uAtlasTex, vAtlasUv).a;
  float a = glyphAlpha * vAlpha;
  if (a <= 0.004) discard;

  float t = clamp(vTone, 0.0, 3.0);
  vec3 rgb = mix(uColor0, uColor1, clamp(t, 0.0, 1.0));
  rgb = mix(rgb, uColor2, clamp(t - 1.0, 0.0, 1.0));
  rgb = mix(rgb, uColor3, clamp(t - 2.0, 0.0, 1.0));

  fragColor = vec4(rgb * a, a);
}
`;

interface NanobotParticle {
  state: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  startW: number;
  startH: number;
  tx: number;
  ty: number;
  normX: number;
  normY: number;
  targetIdx: number;
  subIdx: number;
  age: number;
  life: number;
  lockAge: number;
  lockLife: number;
  alpha: number;
  tone: number;
  glyphIdx: number;
  atlasRow: number;
  seed: number;
  seed2: number;
  seed3: number;
  spinDir: number;
  heroX: number;
  heroY: number;
  heroW: number;
  heroH: number;
  heroAtlasRow: number;
  heroGlyphIdx: number;
  heroIntensity: number;
  peelOrder: number;
  fromHero: boolean;
  orbitSide: number;
  orbitPhase: number;
}

interface AssembleTarget {
  el: HTMLElement;
  kind: AssembleKind;
  isAux: boolean;
  subEls: HTMLElement[];
  subLeft: Float32Array;
  subTop: Float32Array;
  subWidth: Float32Array;
  subHeight: Float32Array;
  subMeasured: boolean;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  rectBottom: number;
  currentP: number;
  targetP: number;
  dp: number;
  lastDir: number;
  mountedSolidGuard: boolean;
  idleSettled: boolean;
  lastAsmMilli: number;
  lastState: string;
  nextState: string;
  activeLockedCount: number;
  activeFlyingCount: number;
}

interface AnchorScratch {
  subIdx: number;
  normX: number;
  normY: number;
  tx: number;
  ty: number;
}

interface NanobotRenderer {
  readonly isWebGL2: boolean;
  readonly maxParticles: number;
  uploadAtlas: (atlasCanvas: HTMLCanvasElement) => void;
  updateTheme: (theme: ThemeColors) => void;
  clear: (widthPx: number, heightPx: number) => void;
  render: (
    instanceData: Float32Array,
    count: number,
    widthCss: number,
    heightCss: number,
    widthPx: number,
    heightPx: number,
    theme: ThemeColors,
  ) => void;
  destroy: () => void;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function parseAssembleKind(raw: string | undefined): AssembleKind {
  switch (raw) {
    case "heading":
    case "project":
    case "role":
    case "stack-col":
    case "contact":
    case "exp-bar":
      return raw;
    default:
      return "heading";
  }
}

function collectSubElements(el: HTMLElement, kind: AssembleKind): HTMLElement[] {
  switch (kind) {
    case "heading": {
      const out: HTMLElement[] = [];
      const h2 = el.querySelector<HTMLElement>("h2");
      const meta = el.querySelector<HTMLElement>("span");
      if (h2) out.push(h2);
      if (meta) out.push(meta);
      return out;
    }

    case "project": {
      const out: HTMLElement[] = [];
      const exhibit = el.querySelector<HTMLElement>(".work-exhibit");
      const h3 = el.querySelector<HTMLElement>("h3");
      const paragraphs = el.querySelectorAll<HTMLElement>("p");
      const link = el.querySelector<HTMLElement>(".work-code-link, a");
      if (exhibit) out.push(exhibit);
      if (h3) out.push(h3);
      for (let i = 0; i < paragraphs.length && i < 3; i++) {
        const pEl = paragraphs[i];
        if (pEl) out.push(pEl);
      }
      if (link) out.push(link);
      return out;
    }

    case "exp-bar": {
      const out: HTMLElement[] = [];
      const canvas = el.querySelector<HTMLElement>("#exp-oscilloscope, canvas");
      if (canvas) out.push(canvas);
      return out;
    }

    case "role": {
      const out: HTMLElement[] = [];
      const period = el.querySelector<HTMLElement>(".exp-period");
      const h3 = el.querySelector<HTMLElement>("h3");
      const company = el.querySelector<HTMLElement>("[data-exp-company]");
      const bullets = el.querySelectorAll<HTMLElement>("ul > li");
      if (period) out.push(period);
      if (h3) out.push(h3);
      if (company) out.push(company);
      for (let i = 0; i < bullets.length; i++) {
        const li = bullets[i];
        if (li) out.push(li);
      }
      return out;
    }

    case "stack-col": {
      const out: HTMLElement[] = [];
      const heading = el.querySelector<HTMLElement>("[data-stack-heading], h3");
      if (heading) out.push(heading);
      const items = el.querySelectorAll<HTMLElement>("[data-stack-item]");
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item) out.push(item);
      }
      return out;
    }

    case "contact": {
      const out: HTMLElement[] = [];
      const h2 = el.querySelector<HTMLElement>("h2");
      if (h2) out.push(h2);
      const links = el.querySelectorAll<HTMLElement>("a");
      for (let i = 0; i < links.length; i++) {
        const a = links[i];
        if (a) out.push(a);
      }
      const loc = el.querySelector<HTMLElement>("p");
      if (loc) out.push(loc);
      return out;
    }
  }
}

function createParticle(index: number): NanobotParticle {
  const seed = fract((index + 1) * 0.61803398875);
  const seed2 = fract((index + 1) * 0.75487766625);
  const seed3 = fract((index + 1) * 0.56984029099);

  return {
    state: P_HERO_DORMANT,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    w: 13,
    h: 18,
    startW: 10,
    startH: 15,
    tx: 0,
    ty: 0,
    normX: 0.5,
    normY: 0.5,
    targetIdx: -1,
    subIdx: -1,
    age: 0,
    life: 0.55,
    lockAge: 0,
    lockLife: 0.35,
    alpha: 0,
    tone: 1.5,
    glyphIdx: ASCII_COLON,
    atlasRow: ATLAS_SPEC.rowAscii,
    seed,
    seed2,
    seed3,
    spinDir: (index & 1) === 0 ? 1 : -1,
    heroX: (0.16 + seed * 0.68) * 1280,
    heroY: (0.28 + seed2 * 0.24) * 800,
    heroW: 9.2,
    heroH: 14.5,
    heroAtlasRow: ATLAS_SPEC.rowAscii,
    heroGlyphIdx: ASCII_HASH,
    heroIntensity: 0.75,
    peelOrder: clamp(0.02 + (1 - seed2) * 0.7 + seed * 0.22, 0.02, 0.94),
    fromHero: true,
    orbitSide: (index & 1) === 0 ? -1 : 1,
    orbitPhase: seed * Math.PI * 2,
  };
}

function velocityEdgeGlyph(vx: number, vy: number): { row: number; glyph: number } {
  const speedSq = vx * vx + vy * vy;
  if (speedSq < 3600) {
    return { row: ATLAS_SPEC.rowAscii, glyph: ASCII_COLON };
  }
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (ax < ay * 0.34) {
    return { row: ATLAS_SPEC.rowEdge, glyph: EDGE_PIPE };
  }
  if (ay < ax * 0.34) {
    return speedSq > 220000
      ? { row: ATLAS_SPEC.rowAscii, glyph: ASCII_EQ }
      : { row: ATLAS_SPEC.rowEdge, glyph: EDGE_DASH };
  }
  return vx * vy > 0
    ? { row: ATLAS_SPEC.rowEdge, glyph: EDGE_BACKSLASH }
    : { row: ATLAS_SPEC.rowEdge, glyph: EDGE_SLASH };
}

function resolveAnchorViewportCoords(
  target: AssembleTarget,
  subIdx: number,
  normX: number,
  normY: number,
  out: AnchorScratch,
): void {
  if (
    subIdx >= 0 &&
    subIdx < target.subEls.length &&
    target.subMeasured &&
    (target.subWidth[subIdx] ?? 0) > 0
  ) {
    const left = target.subLeft[subIdx] ?? target.rectLeft;
    const top = target.subTop[subIdx] ?? target.rectTop;
    const w = target.subWidth[subIdx] ?? target.rectWidth;
    const h = target.subHeight[subIdx] ?? target.rectHeight;
    out.tx = left + normX * w;
    out.ty = top + normY * h;
    return;
  }
  out.tx = target.rectLeft + normX * target.rectWidth;
  out.ty = target.rectTop + normY * target.rectHeight;
}

function sampleTargetAnchor(
  target: AssembleTarget,
  r1: number,
  r2: number,
  r3: number,
  timeSec: number,
  out: AnchorScratch,
): void {
  const subCount = target.subEls.length;
  let subIdx = -1;
  let nx = r2;
  let ny = 0.5;

  switch (target.kind) {
    case "heading": {
      if (r1 < 0.52) {
        // Full bottom hairline
        subIdx = -1;
        nx = r2;
        ny = 0.99;
      } else if (subCount > 0 && r1 < 0.9) {
        // Heading h2 typography band (or meta annotation)
        subIdx = subCount > 1 && r3 > 0.78 ? 1 : 0;
        nx = r2;
        ny = 0.32 + r3 * 0.42;
      } else {
        subIdx = -1;
        nx = r2;
        ny = 0.04;
      }
      break;
    }

    case "project": {
      if (subCount > 0 && r1 < 0.52) {
        // .work-exhibit perimeter & highlighted corners
        subIdx = 0;
        if (r3 < 0.46) {
          const corner = Math.floor(r3 * 8.69) & 3;
          const cx = (corner & 1) === 0 ? 0.005 : 0.995;
          const cy = (corner & 2) === 0 ? 0.008 : 0.992;
          if (r2 < 0.5) {
            const span = r2 * 2 * 0.14;
            nx = cx < 0.5 ? span : 1 - span;
            ny = cy;
          } else {
            const span = (r2 - 0.5) * 2 * 0.18;
            nx = cx;
            ny = cy < 0.5 ? span : 1 - span;
          }
        } else {
          const edge = Math.floor(r3 * 4) & 3;
          if (edge === 0) {
            nx = r2;
            ny = 0.008;
          } else if (edge === 1) {
            nx = r2;
            ny = 0.992;
          } else if (edge === 2) {
            nx = 0.005;
            ny = r2;
          } else {
            nx = 0.995;
            ny = r2;
          }
        }
      } else if (subCount > 1 && r1 < 0.68) {
        // Project title h3
        subIdx = 1;
        nx = r2;
        ny = 0.38 + r3 * 0.32;
      } else if (subCount > 2 && r1 < 0.85) {
        // Multi-line description baselines
        subIdx = 2;
        nx = r2 * 0.94;
        const line = Math.floor(r3 * 3);
        ny = line === 0 ? 0.22 : line === 1 ? 0.52 : 0.82;
      } else if (subCount > 3 && r1 < 0.93) {
        // Tags / award baseline
        subIdx = subCount > 5 && r3 > 0.65 ? 4 : 3;
        nx = r2 * 0.9;
        ny = 0.54;
      } else if (subCount > 2) {
        // View code link baseline (last subEl)
        subIdx = subCount - 1;
        nx = r2;
        ny = 0.58;
      } else {
        subIdx = -1;
        nx = r2;
        ny = r3 < 0.5 ? 0.02 : 0.98;
      }
      break;
    }

    case "exp-bar": {
      subIdx = subCount > 0 ? 0 : -1;
      if (r1 < 0.54) {
        // Sticky oscilloscope perimeter outline
        const edge = Math.floor(r3 * 4) & 3;
        if (edge === 0) {
          nx = r2;
          ny = 0.03;
        } else if (edge === 1) {
          nx = r2;
          ny = 0.97;
        } else if (edge === 2) {
          nx = 0.005;
          ny = r2;
        } else {
          nx = 0.995;
          ny = r2;
        }
      } else {
        // Oscilloscope center wave band
        nx = 0.03 + r2 * 0.94;
        const wave = Math.sin(nx * Math.PI * 6 + timeSec * 1.6) * 0.24;
        ny = clamp(0.5 + wave + (r3 - 0.5) * 0.08, 0.14, 0.86);
      }
      break;
    }

    case "role": {
      if (r1 < 0.28) {
        // Left vertical rule + bottom baseline
        subIdx = -1;
        if (r3 < 0.58) {
          nx = 0.004;
          ny = 0.12 + r2 * 0.76;
        } else {
          nx = r2;
          ny = 0.99;
        }
      } else if (subCount > 0 && r1 < 0.42) {
        // Period badge
        subIdx = 0;
        nx = r2;
        ny = 0.52;
      } else if (subCount > 1 && r1 < 0.66) {
        // Role title h3 + company
        subIdx = subCount > 2 && r3 > 0.48 ? 2 : 1;
        nx = r2;
        ny = 0.54;
      } else if (subCount > 3) {
        // Individual bullet lines (ul > li)
        const bulletCount = subCount - 3;
        subIdx = 3 + Math.min(bulletCount - 1, Math.floor(r2 * bulletCount));
        if (r3 < 0.18) {
          nx = 0.01 + r3 * 0.12;
          ny = 0.34;
        } else {
          nx = 0.05 + clamp01((r3 - 0.18) / 0.82) * 0.88;
          ny = r1 > 0.84 ? 0.72 : 0.34;
        }
      } else {
        subIdx = -1;
        nx = r2;
        ny = 0.5;
      }
      break;
    }

    case "stack-col": {
      if (subCount > 1 && r1 >= 0.18) {
        // Every [data-stack-item] row
        const itemCount = subCount - 1;
        subIdx = 1 + Math.min(itemCount - 1, Math.floor(r2 * itemCount));
        if (r3 < 0.28) {
          nx = -0.04 + r3 * 0.22;
          ny = 0.5;
        } else {
          nx = clamp01((r3 - 0.28) / 0.72);
          ny = 0.52;
        }
      } else if (subCount > 0) {
        subIdx = 0;
        nx = r2;
        ny = 0.52;
      } else {
        subIdx = -1;
        nx = r2;
        ny = 0.5;
      }
      break;
    }

    case "contact": {
      if (subCount > 0 && r1 < 0.32) {
        // Display heading
        subIdx = 0;
        nx = r2;
        ny = 0.32 + r3 * 0.38;
      } else if (subCount > 1 && r1 < 0.68) {
        // Primary email link
        subIdx = 1;
        nx = r2;
        ny = 0.42 + r3 * 0.32;
      } else if (subCount > 2) {
        // Social links & location
        const tailCount = subCount - 2;
        subIdx = 2 + Math.min(tailCount - 1, Math.floor(r2 * tailCount));
        nx = r3;
        ny = 0.62;
      } else {
        subIdx = -1;
        nx = r2;
        ny = 0.6;
      }
      break;
    }
  }

  out.subIdx = subIdx;
  out.normX = nx;
  out.normY = ny;
  resolveAnchorViewportCoords(target, subIdx, nx, ny, out);
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
  if (!vs) return null;
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!fs) {
    gl.deleteShader(vs);
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

function createWebGL2Renderer(
  canvas: HTMLCanvasElement,
  initialAtlas: HTMLCanvasElement,
  initialTheme: ThemeColors,
  onRestore: () => void,
): NanobotRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  let prog: WebGLProgram | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let instanceBuf: WebGLBuffer | null = null;
  let atlasTex: WebGLTexture | null = null;
  let uViewportLoc: WebGLUniformLocation | null = null;
  let uAtlasDimsLoc: WebGLUniformLocation | null = null;
  let uAtlasTexLoc: WebGLUniformLocation | null = null;
  let uColor0Loc: WebGLUniformLocation | null = null;
  let uColor1Loc: WebGLUniformLocation | null = null;
  let uColor2Loc: WebGLUniformLocation | null = null;
  let uColor3Loc: WebGLUniformLocation | null = null;

  let currentAtlas = initialAtlas;
  const colorArray = new Float32Array(12);
  let contextLost = gl.isContextLost();
  let destroyed = false;

  const syncColorArray = (theme: ThemeColors) => {
    const secondary = mixRgb(theme.muted, theme.accentSecondary, 0.55);
    colorArray[0] = theme.muted.r;
    colorArray[1] = theme.muted.g;
    colorArray[2] = theme.muted.b;
    colorArray[3] = secondary.r;
    colorArray[4] = secondary.g;
    colorArray[5] = secondary.b;
    colorArray[6] = theme.ink.r;
    colorArray[7] = theme.ink.g;
    colorArray[8] = theme.ink.b;
    colorArray[9] = theme.accent.r;
    colorArray[10] = theme.accent.g;
    colorArray[11] = theme.accent.b;
  };
  syncColorArray(initialTheme);

  const releaseGlResources = () => {
    if (vao) {
      gl.deleteVertexArray(vao);
      vao = null;
    }
    if (instanceBuf) {
      gl.deleteBuffer(instanceBuf);
      instanceBuf = null;
    }
    if (atlasTex) {
      gl.deleteTexture(atlasTex);
      atlasTex = null;
    }
    if (prog) {
      gl.deleteProgram(prog);
      prog = null;
    }
  };

  const initGlResources = (): boolean => {
    if (gl.isContextLost()) return false;
    releaseGlResources();

    prog = linkProgram(gl, INSTANCED_VERTEX_SHADER, INSTANCED_FRAGMENT_SHADER);
    if (!prog) return false;

    vao = gl.createVertexArray();
    instanceBuf = gl.createBuffer();
    atlasTex = gl.createTexture();
    if (!vao || !instanceBuf || !atlasTex) {
      releaseGlResources();
      return false;
    }

    const strideBytes = FLOATS_PER_INSTANCE * 4;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      DESKTOP_POOL_MAX * strideBytes,
      gl.DYNAMIC_DRAW,
    );

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, strideBytes, 0);
    gl.vertexAttribDivisor(0, 1);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, strideBytes, 16);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, currentAtlas);

    uViewportLoc = gl.getUniformLocation(prog, "uViewport");
    uAtlasDimsLoc = gl.getUniformLocation(prog, "uAtlasDims");
    uAtlasTexLoc = gl.getUniformLocation(prog, "uAtlasTex");
    uColor0Loc = gl.getUniformLocation(prog, "uColor0");
    uColor1Loc = gl.getUniformLocation(prog, "uColor1");
    uColor2Loc = gl.getUniformLocation(prog, "uColor2");
    uColor3Loc = gl.getUniformLocation(prog, "uColor3");

    return true;
  };

  if (!initGlResources()) {
    return null;
  }

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
  };

  const onContextRestored = () => {
    if (destroyed) return;
    contextLost = false;
    if (initGlResources()) {
      onRestore();
    }
  };

  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  return {
    isWebGL2: true,
    maxParticles: DESKTOP_POOL_MAX,
    uploadAtlas: (nextAtlas: HTMLCanvasElement) => {
      currentAtlas = nextAtlas;
      if (destroyed || contextLost || gl.isContextLost() || !atlasTex) return;
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, nextAtlas);
    },
    updateTheme: (theme: ThemeColors) => {
      syncColorArray(theme);
    },
    clear: (widthPx: number, heightPx: number) => {
      if (destroyed || contextLost || gl.isContextLost()) return;
      gl.viewport(0, 0, widthPx, heightPx);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    render: (
      instanceData: Float32Array,
      count: number,
      widthCss: number,
      heightCss: number,
      widthPx: number,
      heightPx: number,
      theme: ThemeColors,
    ) => {
      if (destroyed || contextLost || gl.isContextLost() || !prog || !vao || !instanceBuf || !atlasTex) {
        return;
      }

      gl.viewport(0, 0, widthPx, heightPx);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (count <= 0) return;

      syncColorArray(theme);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(prog);
      gl.bindVertexArray(vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(uAtlasTexLoc, 0);
      gl.uniform2f(uViewportLoc, widthCss, heightCss);
      gl.uniform2f(uAtlasDimsLoc, ATLAS_SPEC.cols, ATLAS_SPEC.rows);
      gl.uniform3f(uColor0Loc, colorArray[0] ?? 0.5, colorArray[1] ?? 0.5, colorArray[2] ?? 0.5);
      gl.uniform3f(uColor1Loc, colorArray[3] ?? 0.6, colorArray[4] ?? 0.6, colorArray[5] ?? 0.6);
      gl.uniform3f(uColor2Loc, colorArray[6] ?? 0.9, colorArray[7] ?? 0.9, colorArray[8] ?? 0.9);
      gl.uniform3f(uColor3Loc, colorArray[9] ?? 1.0, colorArray[10] ?? 1.0, colorArray[11] ?? 1.0);

      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        instanceData.subarray(0, count * FLOATS_PER_INSTANCE),
      );

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      releaseGlResources();
    },
  };
}

function buildCanvas2DColorLut(theme: ThemeColors, out: string[]): void {
  const tones = [
    theme.muted,
    mixRgb(theme.muted, theme.accentSecondary, 0.55),
    theme.ink,
    theme.accent,
  ] as const;

  for (let t = 0; t < TONE_COUNT; t++) {
    const rgb = tones[t] ?? theme.muted;
    const base = t * ALPHA_STEPS;
    for (let a = 0; a < ALPHA_STEPS; a++) {
      const alpha = (a + 1) / ALPHA_STEPS;
      out[base + a] = rgbToCss(rgb, alpha);
    }
  }
}

function createCanvas2DRenderer(
  canvas: HTMLCanvasElement,
  initialTheme: ThemeColors,
): NanobotRenderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const colorLut: string[] = new Array(TONE_COUNT * ALPHA_STEPS).fill("rgb(245, 245, 245)");
  buildCanvas2DColorLut(initialTheme, colorLut);

  return {
    isWebGL2: false,
    maxParticles: CANVAS2D_POOL_MAX,
    uploadAtlas: () => {},
    updateTheme: (theme: ThemeColors) => {
      buildCanvas2DColorLut(theme, colorLut);
    },
    clear: (widthPx: number, heightPx: number) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, widthPx, heightPx);
      ctx.restore();
    },
    render: (
      instanceData: Float32Array,
      count: number,
      widthCss: number,
      heightCss: number,
      widthPx: number,
      heightPx: number,
    ) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, widthPx, heightPx);
      if (count <= 0) {
        ctx.restore();
        return;
      }

      const scaleX = widthPx / Math.max(1, widthCss);
      const scaleY = heightPx / Math.max(1, heightCss);
      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      let curTier = -1;
      let curStyle = "";

      const limit = Math.min(count, CANVAS2D_POOL_MAX);
      for (let i = 0; i < limit; i++) {
        const base = i * FLOATS_PER_INSTANCE;
        const x = instanceData[base] ?? 0;
        const y = instanceData[base + 1] ?? 0;
        const h = instanceData[base + 3] ?? 16;
        const glyphIdx = Math.round(instanceData[base + 4] ?? 1);
        const atlasRow = Math.round(instanceData[base + 5] ?? 0);
        const tone = clamp(Math.round(instanceData[base + 6] ?? 1), 0, TONE_COUNT - 1);
        const alpha = clamp01(instanceData[base + 7] ?? 0);
        if (alpha <= 0.015) continue;

        const ramp =
          atlasRow === ATLAS_SPEC.rowEdge ? ATLAS_SPEC.edgeRamp : ATLAS_SPEC.asciiRamp;
        const ch = ramp[glyphIdx];
        if (!ch || ch === " ") continue;

        const tier = h >= 18 ? 2 : h >= 14.5 ? 1 : 0;
        if (tier !== curTier) {
          curTier = tier;
          ctx.font = tier === 2 ? FONT_16 : tier === 1 ? FONT_14 : FONT_12;
        }

        const bucket = clamp(Math.round(alpha * (ALPHA_STEPS - 1)), 0, ALPHA_STEPS - 1);
        const style = colorLut[tone * ALPHA_STEPS + bucket] ?? colorLut[0]!;
        if (style !== curStyle) {
          curStyle = style;
          ctx.fillStyle = style;
        }

        ctx.fillText(ch, x, y);
      }

      ctx.restore();
    },
    destroy: () => {},
  };
}

export function mountAsciiNanobots(canvas: HTMLCanvasElement): NanobotHandle {
  const assembleEls = Array.from(
    document.querySelectorAll<HTMLElement>("[data-assemble]"),
  );
  const expBarEl = document.querySelector<HTMLElement>(
    '[data-assemble-target="exp-bar"]',
  );
  const heroCanvasEl =
    document.getElementById("hero-fluid-canvas") ?? document.getElementById("hero");

  const makeTarget = (el: HTMLElement, kind: AssembleKind, isAux: boolean): AssembleTarget => {
    const subEls = collectSubElements(el, kind);
    return {
      el,
      kind,
      isAux,
      subEls,
      subLeft: new Float32Array(subEls.length),
      subTop: new Float32Array(subEls.length),
      subWidth: new Float32Array(subEls.length),
      subHeight: new Float32Array(subEls.length),
      subMeasured: false,
      rectLeft: 0,
      rectTop: 0,
      rectWidth: 0,
      rectHeight: 0,
      rectBottom: 0,
      currentP: isAux ? 0 : 1,
      targetP: isAux ? 0 : 1,
      dp: 0,
      lastDir: 1,
      mountedSolidGuard: false,
      idleSettled: false,
      lastAsmMilli: -1,
      lastState: "",
      nextState: "",
      activeLockedCount: 0,
      activeFlyingCount: 0,
    };
  };

  const targets: AssembleTarget[] = assembleEls.map((el) =>
    makeTarget(el, parseAssembleKind(el.dataset.assemble), false),
  );
  let expBarTargetIdx = -1;
  if (expBarEl) {
    expBarTargetIdx = targets.length;
    targets.push(makeTarget(expBarEl, "exp-bar", true));
  }

  const particles: NanobotParticle[] = new Array(DESKTOP_POOL_MAX);
  for (let i = 0; i < DESKTOP_POOL_MAX; i++) {
    particles[i] = createParticle(i);
  }
  const instanceData = new Float32Array(DESKTOP_POOL_MAX * FLOATS_PER_INSTANCE);

  const downPool: number[] = [];
  const upPool: number[] = [];

  let theme = resolveThemeColors();
  const atlasCanvas = buildGlyphAtlasCanvas();

  let destroyed = false;
  let reducedMotion = isReducedMotionPreferred();
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;

  let widthCss = Math.max(1, window.innerWidth || canvas.clientWidth || 1280);
  let heightCss = Math.max(1, window.innerHeight || canvas.clientHeight || 800);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let widthPx = Math.max(1, Math.round(widthCss * dpr));
  let heightPx = Math.max(1, Math.round(heightCss * dpr));

  let rafId: number | null = null;
  let lastFrameMs = 0;
  let simTimeSec = 0;
  let prevScrollY = window.scrollY;
  let scrollVel = 0;
  let lastScrollMoveMs = performance.now();
  let idleFrames = 0;
  let hasLiveSnapshot = false;

  let heroLeft = 0;
  let heroTop = 0;
  let heroWidth = widthCss;
  let contentLeft = Math.max(0, (widthCss - 1024) * 0.5);
  let contentRight = Math.min(widthCss, contentLeft + 1024);

  const anchorScratch: AnchorScratch = {
    subIdx: -1,
    normX: 0.5,
    normY: 0.5,
    tx: 0,
    ty: 0,
  };

  const wakeLoop = () => {
    if (destroyed || reducedMotion || !isPageVisible) return;
    idleFrames = 0;
    if (rafId === null) {
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(stepAndRender);
    }
  };

  const renderer: NanobotRenderer | null =
    createWebGL2Renderer(canvas, atlasCanvas, theme, wakeLoop) ??
    createCanvas2DRenderer(canvas, theme);

  const getActivePoolCap = (): number => {
    const deviceCap = widthCss < MOBILE_BREAKPOINT_PX ? MOBILE_POOL_MAX : DESKTOP_POOL_MAX;
    if (!renderer) return 0;
    return Math.min(deviceCap, renderer.maxParticles);
  };

  const applyHeroSnapshot = (snapshot: HeroGlyphSnapshot) => {
    const cells: HeroGlyphCell[] = snapshot.cells;
    if (cells.length === 0) return;
    hasLiveSnapshot = true;

    const count = cells.length;
    for (let i = 0; i < DESKTOP_POOL_MAX; i++) {
      const p = particles[i]!;
      const cell = cells[i % count]!;
      const dupTier = Math.floor(i / count);
      const jitterX = dupTier === 0 ? 0 : (p.seed - 0.5) * cell.cellW * 0.55;
      const jitterY = dupTier === 0 ? 0 : (p.seed2 - 0.5) * cell.cellH * 0.45;

      p.heroX = cell.x + jitterX;
      p.heroY = cell.y + jitterY;
      p.heroW = cell.cellW;
      p.heroH = cell.cellH;
      p.heroAtlasRow = cell.atlasRow;
      p.heroGlyphIdx = cell.glyphIdx;
      p.heroIntensity = cell.intensity;
      p.peelOrder =
        dupTier === 0 ? cell.peelOrder : clamp(cell.peelOrder + dupTier * 0.015, 0.02, 0.94);

      if (p.state === P_HERO_DORMANT) {
        p.x = heroLeft + p.heroX;
        p.y = heroTop + p.heroY;
      }
    }
  };

  const writeTargetDom = (t: AssembleTarget, state: string, p: number): void => {
    if (t.isAux) return;
    const milli = p >= 0.999 ? 1000 : p <= 0.001 ? 0 : Math.round(p * 1000);
    if (milli !== t.lastAsmMilli) {
      t.lastAsmMilli = milli;
      if (milli === 1000) {
        t.el.style.setProperty("--asm", "1");
      } else if (milli === 0) {
        t.el.style.setProperty("--asm", "0");
      } else {
        t.el.style.setProperty("--asm", p.toFixed(3));
      }
    }
    if (state !== t.lastState) {
      t.lastState = state;
      t.el.dataset.asmState = state;
    }
  };

  const setAllTargetsSolid = (): void => {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (t.isAux) continue;
      t.currentP = 1;
      t.targetP = 1;
      t.dp = 0;
      t.mountedSolidGuard = false;
      t.idleSettled = false;
      writeTargetDom(t, "solid", 1);
    }
  };

  const resetAllParticlesDormant = (): void => {
    for (let i = 0; i < DESKTOP_POOL_MAX; i++) {
      const p = particles[i]!;
      p.state = P_HERO_DORMANT;
      p.alpha = 0;
      p.targetIdx = -1;
      p.subIdx = -1;
      p.age = 0;
      p.lockAge = 0;
    }
  };

  const syncCanvasSize = (): void => {
    widthCss = Math.max(1, window.innerWidth || canvas.clientWidth || 1280);
    heightCss = Math.max(1, window.innerHeight || canvas.clientHeight || 800);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    widthPx = Math.max(1, Math.round(widthCss * dpr));
    heightPx = Math.max(1, Math.round(heightCss * dpr));
    if (canvas.width !== widthPx || canvas.height !== heightPx) {
      canvas.width = widthPx;
      canvas.height = heightPx;
    }
    if (!hasLiveSnapshot) {
      for (let i = 0; i < DESKTOP_POOL_MAX; i++) {
        const p = particles[i]!;
        p.heroX = (0.16 + p.seed * 0.68) * widthCss;
        p.heroY = (0.28 + p.seed2 * 0.24) * heightCss;
      }
    }
  };

  const measureHeroAndTargets = (): void => {
    if (heroCanvasEl) {
      const hr = heroCanvasEl.getBoundingClientRect();
      heroLeft = hr.left;
      heroTop = hr.top;
      heroWidth = Math.max(1, hr.width);
    } else {
      heroLeft = 0;
      heroTop = -window.scrollY;
      heroWidth = widthCss;
    }

    let minL = widthCss;
    let maxR = 0;
    let measuredContent = false;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      const rect = t.el.getBoundingClientRect();
      t.rectLeft = rect.left;
      t.rectTop = rect.top;
      t.rectWidth = rect.width;
      t.rectHeight = rect.height;
      t.rectBottom = rect.bottom;
      t.subMeasured = false;
      t.activeLockedCount = 0;
      t.activeFlyingCount = 0;

      if (!t.isAux && rect.width > 0) {
        if (rect.left < minL) minL = rect.left;
        if (rect.right > maxR) maxR = rect.right;
        measuredContent = true;
      }
    }

    if (measuredContent && maxR > minL) {
      contentLeft = minL;
      contentRight = maxR;
    } else {
      contentLeft = Math.max(0, (widthCss - 1024) * 0.5);
      contentRight = Math.min(widthCss, contentLeft + 1024);
    }
  };

  const measureSubElsIfNeeded = (t: AssembleTarget): void => {
    if (t.subMeasured || t.subEls.length === 0) return;
    for (let s = 0; s < t.subEls.length; s++) {
      const subEl = t.subEls[s]!;
      const sr = subEl.getBoundingClientRect();
      t.subLeft[s] = sr.left;
      t.subTop[s] = sr.top;
      t.subWidth[s] = sr.width;
      t.subHeight[s] = sr.height;
    }
    t.subMeasured = true;
  };

  const assignTargetAnchorToParticle = (p: NanobotParticle, targetIdx: number): void => {
    const target = targets[targetIdx];
    if (!target) return;
    measureSubElsIfNeeded(target);
    sampleTargetAnchor(target, p.seed, p.seed2, p.seed3, simTimeSec, anchorScratch);
    p.targetIdx = targetIdx;
    p.subIdx = anchorScratch.subIdx;
    p.normX = anchorScratch.normX;
    p.normY = anchorScratch.normY;
    p.tx = anchorScratch.tx;
    p.ty = anchorScratch.ty;
  };

  const initializeMountState = (): void => {
    if (reducedMotion) {
      setAllTargetsSolid();
      resetAllParticlesDormant();
      renderer?.clear(widthPx, heightPx);
      return;
    }

    measureHeroAndTargets();

    const vh = heightCss;
    const enterBottom = vh * 0.98;
    const enterTop = vh * 0.48;
    const enterBand = Math.max(1, enterBottom - enterTop);
    const solidIndices: number[] = [];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (t.isAux) {
        t.currentP = 0;
        t.targetP = 0;
        continue;
      }

      if (t.rectTop <= vh * 0.85) {
        t.currentP = 1;
        t.targetP = 1;
        t.lastDir = 1;
        t.mountedSolidGuard = t.rectTop > enterTop;
        t.idleSettled = false;
        writeTargetDom(t, "solid", 1);
        solidIndices.push(i);
      } else if (t.rectTop >= enterBottom) {
        t.currentP = 0;
        t.targetP = 0;
        t.lastDir = 1;
        t.mountedSolidGuard = false;
        t.idleSettled = false;
        writeTargetDom(t, "idle", 0);
      } else {
        const pVal = clamp01((enterBottom - t.rectTop) / enterBand);
        const snapped = pVal <= 0.015 ? 0 : pVal >= 0.96 ? 1 : pVal;
        t.currentP = snapped;
        t.targetP = pVal;
        t.lastDir = 1;
        t.mountedSolidGuard = false;
        t.idleSettled = false;
        const st = snapped >= 0.96 ? "solid" : snapped <= 0.015 ? "idle" : "forming";
        writeTargetDom(t, st, snapped);
        if (snapped >= 0.96) solidIndices.push(i);
      }
    }

    const scrollDissolve0 = computeHeroScrollDissolve(window.scrollY, vh);
    resetAllParticlesDormant();

    // If deep-linked mid-page, silently park already-peeled particles on solid/above targets
    if (scrollDissolve0 > 0.001 && solidIndices.length > 0) {
      const poolCap = getActivePoolCap();
      for (let i = 0; i < poolCap; i++) {
        const p = particles[i]!;
        if (scrollDissolve0 >= p.peelOrder) {
          const targetIdx = solidIndices[i % solidIndices.length]!;
          assignTargetAnchorToParticle(p, targetIdx);
          p.state = P_LOCKED;
          p.x = p.tx;
          p.y = p.ty;
          p.vx = 0;
          p.vy = 0;
          p.lockAge = 10;
          p.lockLife = 0.35;
          p.alpha = 0;
          p.fromHero = false;
        }
      }
    }
  };

  const launchToTarget = (
    p: NanobotParticle,
    targetIdx: number,
    sx: number,
    sy: number,
    initVx: number,
    initVy: number,
    fromHero: boolean,
  ): void => {
    p.state = P_FLYING;
    p.x = sx;
    p.y = sy;
    p.vx = initVx;
    p.vy = initVy;
    p.fromHero = fromHero;
    if (fromHero) {
      p.startW = clamp(p.heroW, 8, 16);
      p.startH = clamp(p.heroH, 11, 22);
      p.w = p.startW;
      p.h = p.startH;
      p.atlasRow = p.heroAtlasRow;
      p.glyphIdx = p.heroGlyphIdx;
    } else {
      p.startW = widthCss < MOBILE_BREAKPOINT_PX ? 10 : 13;
      p.startH = widthCss < MOBILE_BREAKPOINT_PX ? 14 : 18;
      p.w = p.startW;
      p.h = p.startH;
    }
    p.age = 0;
    p.life = 0.42 + p.seed3 * 0.36;
    p.lockAge = 0;
    p.alpha = Math.max(p.alpha, 0.58);
    assignTargetAnchorToParticle(p, targetIdx);
    const target = targets[targetIdx];
    if (target) target.activeFlyingCount++;
  };

  const launchReturnHome = (
    p: NanobotParticle,
    sx: number,
    sy: number,
    initVx: number,
    initVy: number,
  ): void => {
    p.state = P_RETURNING_HERO;
    p.x = sx;
    p.y = sy;
    p.vx = initVx;
    p.vy = initVy;
    p.startW = widthCss < MOBILE_BREAKPOINT_PX ? 10 : 13;
    p.startH = widthCss < MOBILE_BREAKPOINT_PX ? 14 : 18;
    p.age = 0;
    p.life = 0.32 + p.seed2 * 0.24;
    p.alpha = Math.max(p.alpha, 0.65);
    p.targetIdx = -1;
    p.subIdx = -1;
  };

  const launchUpperSweep = (
    p: NanobotParticle,
    sx: number,
    sy: number,
    initVx: number,
    initVy: number,
  ): void => {
    p.state = P_FLYING;
    p.x = sx;
    p.y = sy;
    p.vx = initVx;
    p.vy = initVy;
    p.fromHero = false;
    p.startW = widthCss < MOBILE_BREAKPOINT_PX ? 10 : 13;
    p.startH = widthCss < MOBILE_BREAKPOINT_PX ? 14 : 18;
    p.w = p.startW;
    p.h = p.startH;
    p.age = 0;
    p.life = 0.48 + p.seed3 * 0.34;
    p.lockAge = 0;
    p.alpha = Math.max(p.alpha, 0.72);
    p.targetIdx = -2;
    p.subIdx = -1;
    p.tx = lerp(contentLeft, contentRight, p.seed);
    p.ty = heightCss * (0.09 + p.seed2 * 0.28);
  };

  const stopLoop = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const stepAndRender = (nowMs: number): void => {
    rafId = null;
    if (destroyed || reducedMotion || !isPageVisible) return;

    const dt = lastFrameMs > 0 ? Math.min((nowMs - lastFrameMs) / 1000, 0.04) : 0.016;
    lastFrameMs = nowMs;
    simTimeSec += dt;

    // ── Phase 1: Batch DOM reads ────────────────────────────────────────
    const scrollY = window.scrollY;
    const dyScroll = scrollY - prevScrollY;
    prevScrollY = scrollY;
    if (Math.abs(dyScroll) > 0.5) {
      lastScrollMoveMs = nowMs;
    }
    const idleMs = nowMs - lastScrollMoveMs;

    const instantVel = clamp(dyScroll / Math.max(dt, 0.004), -4800, 4800);
    scrollVel += (instantVel - scrollVel) * (1 - Math.exp(-dt * 14));
    if (Math.abs(scrollVel) < 2 && dyScroll === 0) scrollVel = 0;

    const vh = heightCss;
    const scrollDissolve = computeHeroScrollDissolve(scrollY, vh);

    measureHeroAndTargets();

    // ── Phase 2: Mid-screen assembly progress & idle settle ─────────────
    const enterBottom = vh * 0.98;
    const enterTop = vh * 0.48;
    const enterBand = Math.max(1, enterBottom - enterTop);
    const largeJump = Math.abs(dyScroll) > vh * 1.5;
    const isScrollingUp = scrollVel < -18 || dyScroll < -1.5;
    const isScrollingDown = scrollVel > 12 || dyScroll > 1;
    const canIdleSettle = idleMs > 380;

    let anyForming = false;
    let anyDissolving = false;
    let anyTransitioning = false;
    let expBarActive = false;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (t.isAux) continue;

      if (t.mountedSolidGuard) {
        if (t.rectTop <= enterTop || t.rectTop > vh * 0.92 || isScrollingUp) {
          t.mountedSolidGuard = false;
        }
      }

      if (isScrollingUp && t.rectTop > enterTop) {
        t.idleSettled = false;
      } else if (t.rectTop >= vh + 40) {
        t.idleSettled = false;
      } else if (canIdleSettle && t.rectTop < vh * 0.92 && t.rectBottom > 0) {
        t.idleSettled = true;
      }

      let targetP: number;
      if (t.mountedSolidGuard || t.idleSettled || t.rectTop <= enterTop) {
        targetP = 1;
      } else if (t.rectTop >= enterBottom) {
        targetP = 0;
      } else {
        targetP = clamp01((enterBottom - t.rectTop) / enterBand);
      }
      t.targetP = targetP;

      const prevP = t.currentP;
      let nextP: number;
      if (largeJump && (t.rectBottom < -40 || t.rectTop > vh + 80)) {
        nextP = targetP;
      } else {
        const dampRate = targetP >= prevP ? 11.5 : 13.5;
        nextP = prevP + (targetP - prevP) * (1 - Math.exp(-dt * dampRate));
        if (targetP >= 0.96 && nextP >= 0.96) {
          nextP = 1;
        } else if (targetP <= 0.015 && nextP <= 0.015) {
          nextP = 0;
        }
      }

      const dp = nextP - prevP;
      t.currentP = nextP;
      t.dp = dp;

      let state: string;
      if (nextP >= 0.96) {
        state = "solid";
        t.lastDir = 1;
      } else if (nextP <= 0.015) {
        state = "idle";
        t.lastDir = -1;
      } else if (dp > 0.00001) {
        state = "forming";
        t.lastDir = 1;
      } else if (dp < -0.00001) {
        state = "dissolving";
        t.lastDir = -1;
      } else {
        state = t.lastDir >= 0 ? "forming" : "dissolving";
      }

      const onScreen = t.rectBottom > -40 && t.rectTop < vh + 120;
      if (onScreen && (Math.abs(dp) > 0.0001 || (nextP > 0.015 && nextP < 0.96))) {
        anyTransitioning = true;
        if (state === "forming") anyForming = true;
        if (state === "dissolving") anyDissolving = true;
      }
      if (onScreen && (t.kind === "role" || (t.kind === "heading" && t.el.closest("#experience")))) {
        if (nextP < 0.96 || Math.abs(scrollVel) > 60) expBarActive = true;
      }

      if (onScreen || (nextP > 0.01 && nextP < 0.98)) {
        measureSubElsIfNeeded(t);
      }

      t.nextState = state;
    }

    if (expBarTargetIdx >= 0) {
      const bar = targets[expBarTargetIdx]!;
      const barVisible = bar.rectBottom > 60 && bar.rectTop < vh * 0.98;
      if (barVisible && expBarActive) {
        bar.targetP = 1;
        bar.currentP = 0.55;
        measureSubElsIfNeeded(bar);
      } else {
        bar.targetP = 0;
        bar.currentP = 0;
      }
    }

    // Batch DOM writes after all reads
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      writeTargetDom(t, t.nextState, t.currentP);
    }

    // ── Phase 3: Build Target Dispatch Pools ────────────────────────────
    downPool.length = 0;
    upPool.length = 0;
    let fallbackBottomIdx = -1;
    let bestFallbackScore = -1e9;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (t.isAux) {
        if (t.targetP > 0.5) {
          downPool.push(i);
          downPool.push(i);
        }
        if (t.rectBottom > 60 && t.rectTop < vh * 0.52) {
          upPool.push(i);
        }
        continue;
      }

      // Actively forming mid-screen targets get heavy priority
      if (t.currentP < 0.96 && t.rectTop < vh * 1.12 && t.rectBottom > vh * 0.12) {
        const w = t.kind === "project" ? 5 : t.kind === "role" || t.kind === "stack-col" ? 4 : 3;
        for (let k = 0; k < w; k++) downPool.push(i);
      } else if (t.rectTop >= vh * 0.98 && t.rectTop < vh * 1.85) {
        // Staging targets just below viewport horizon
        downPool.push(i);
      }

      if (t.rectTop < vh * 0.5 && t.rectBottom > 24) {
        upPool.push(i);
      }

      if (t.rectBottom > vh * 0.25 && t.rectTop < vh * 0.98) {
        const score = t.rectTop;
        if (score > bestFallbackScore) {
          bestFallbackScore = score;
          fallbackBottomIdx = i;
        }
      }
    }

    if (downPool.length === 0 && fallbackBottomIdx >= 0) {
      downPool.push(fallbackBottomIdx);
    }

    const poolCap = getActivePoolCap();
    const isSettledAtRest =
      canIdleSettle &&
      Math.abs(scrollVel) < 8 &&
      !anyForming &&
      !anyDissolving;
    const allowMarginOrbiters =
      contentLeft >= MARGIN_ORBIT_MIN_GAP_PX &&
      scrollY >= 24 &&
      scrollDissolve > 0.02;

    // ── Phase 4: Conservation & Relay Physics ───────────────────────────
    const heroReforming = scrollDissolve < 0.97;
    const perDissolveCap = widthCss < MOBILE_BREAKPOINT_PX ? 150 : 260;
    let downCursor = 0;
    let upCursor = 0;
    let relayPerFrameBudget =
      downPool.length > 0 && (isScrollingDown || anyForming)
        ? Math.min(96, Math.max(18, Math.round(18 + Math.abs(scrollVel) * 0.045)))
        : 0;
    let dissolveBurstBudget =
      anyDissolving || isScrollingUp
        ? Math.min(180, Math.max(48, Math.round(48 + Math.abs(scrollVel) * 0.08)))
        : 0;

    // Pre-identify any freshly dissolving targets needing an eruption burst
    const dissolvingTargets: number[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (
        !t.isAux &&
        (t.nextState === "dissolving" || (isScrollingUp && t.currentP < 0.96)) &&
        t.rectTop < vh &&
        t.rectBottom > 0
      ) {
        dissolvingTargets.push(i);
      }
    }
    let dissolveTargetCursor = 0;

    let activeDrawCount = 0;
    let anyAirborne = false;

    for (let i = 0; i < poolCap; i++) {
      const p = particles[i]!;
      const hx = heroLeft + p.heroX;
      const hy = heroTop + p.heroY;
      const shouldReturnHero =
        scrollDissolve <= 0.001 ||
        (heroReforming && scrollDissolve < p.peelOrder + 0.03);

      // 1) Check return-to-hero trigger for active off-hero particles
      if (
        shouldReturnHero &&
        (p.state === P_FLYING || p.state === P_LOCKED || p.state === P_MARGIN_ORBIT)
      ) {
        const sx = clamp(p.x, -16, widthCss + 16);
        const launchY = clamp(p.y, -16, heightCss + 18);
        launchReturnHome(
          p,
          sx,
          launchY,
          (p.seed - 0.5) * 240 + p.spinDir * 80,
          -(180 + p.seed2 * 200),
        );
      }

      // 2) Dormant & pre-peel Hero cells
      if (p.state === P_HERO_DORMANT || p.state === P_HERO_PEELING) {
        if (scrollDissolve <= 0.001 || scrollDissolve < p.peelOrder - 0.03) {
          p.state = P_HERO_DORMANT;
          p.x = hx;
          p.y = hy;
          p.alpha = 0;
          continue;
        }

        if (scrollDissolve < p.peelOrder) {
          p.state = P_HERO_PEELING;
          const tPre = clamp01((scrollDissolve - (p.peelOrder - 0.03)) / 0.03);
          p.x = hx + Math.sin(simTimeSec * 14 + p.seed * 20) * 1.4 * tPre;
          p.y = hy + Math.cos(simTimeSec * 12 + p.seed2 * 20) * 1.2 * tPre;
          p.w = p.heroW;
          p.h = p.heroH;
          p.atlasRow = p.heroAtlasRow;
          p.glyphIdx = p.heroGlyphIdx;
          p.tone = 1.4 + p.heroIntensity * 1.4;
          p.alpha = tPre * 0.68 * (0.4 + p.heroIntensity * 0.6);
        } else if (downPool.length > 0) {
          const targetIdx = downPool[downCursor % downPool.length]!;
          downCursor++;
          const spreadX = (p.heroX / Math.max(1, heroWidth) - 0.5) * 260;
          const initVx = spreadX + (p.seed - 0.5) * 220 + p.spinDir * 90;
          const initVy = 160 + p.seed2 * 230 + clamp(scrollVel, 0, 2600) * 0.26;
          launchToTarget(p, targetIdx, hx, hy, initVx, initVy, true);
        }
      }

      // 3) Margin orbiters on wide desktop viewports
      if (p.state === P_MARGIN_ORBIT) {
        if (!allowMarginOrbiters || !isSettledAtRest) {
          if (downPool.length > 0 && isScrollingDown) {
            const targetIdx = downPool[downCursor % downPool.length]!;
            downCursor++;
            launchToTarget(
              p,
              targetIdx,
              p.x,
              p.y,
              -p.orbitSide * (140 + p.seed * 120),
              180 + p.seed2 * 160,
              false,
            );
          } else if ((isScrollingUp || anyDissolving) && dissolvingTargets.length > 0) {
            const dIdx = dissolvingTargets[dissolveTargetCursor % dissolvingTargets.length]!;
            dissolveTargetCursor++;
            const dTarget = targets[dIdx]!;
            measureSubElsIfNeeded(dTarget);
            sampleTargetAnchor(dTarget, p.seed, p.seed2, p.seed3, simTimeSec, anchorScratch);
            const initVx = (p.seed - 0.5) * 300 + p.spinDir * 130;
            const initVy = -(230 + p.seed2 * 260 + clamp(-scrollVel, 0, 2400) * 0.24);
            dTarget.activeFlyingCount++;
            if (upPool.length > 0 && p.seed3 < 0.55) {
              const upIdx = upPool[upCursor % upPool.length]!;
              upCursor++;
              launchToTarget(p, upIdx, anchorScratch.tx, anchorScratch.ty, initVx, initVy, false);
            } else {
              launchUpperSweep(p, anchorScratch.tx, anchorScratch.ty, initVx, initVy);
            }
          } else {
            p.state = P_LOCKED;
            p.lockAge = 0.35;
            p.alpha = 0;
          }
        } else {
          const marginWidth = Math.max(24, contentLeft - 28);
          const laneX =
            p.orbitSide < 0
              ? 16 + p.seed * (marginWidth - 20)
              : contentRight + 28 + p.seed * (marginWidth - 20);
          const orbitY =
            vh * (0.14 + p.seed2 * 0.78) +
            Math.sin(simTimeSec * 0.65 + p.orbitPhase) * 26;
          const orbitX = laneX + Math.cos(simTimeSec * 0.8 + p.orbitPhase) * 8;
          p.x += (orbitX - p.x) * (1 - Math.exp(-dt * 3.5));
          p.y += (orbitY - p.y) * (1 - Math.exp(-dt * 3.5));
          p.w = 11;
          p.h = 15;
          p.atlasRow = ATLAS_SPEC.rowAscii;
          p.glyphIdx = p.seed3 > 0.6 ? ASCII_COLON : ASCII_DOT;
          p.tone = 0.4 + p.seed * 0.8;
          p.alpha = lerp(p.alpha, 0.16 + p.seed2 * 0.16, 1 - Math.exp(-dt * 4));
        }
      }

      // 4) Returning home straight into IAN PANG
      if (p.state === P_RETURNING_HERO) {
        if (!shouldReturnHero && downPool.length > 0 && isScrollingDown) {
          const targetIdx = downPool[downCursor % downPool.length]!;
          downCursor++;
          launchToTarget(p, targetIdx, p.x, p.y, p.vx * 0.35, 160 + p.seed * 180, false);
        } else {
          p.age += dt;
          const tProg = clamp01(p.age / Math.max(0.18, p.life));
          const dx = hx - p.x;
          const dy = hy - p.y;
          const dist = Math.hypot(dx, dy);
          const safeDist = Math.max(1, dist);
          const perpX = -dy / safeDist;
          const perpY = dx / safeDist;

          const stiffness = 28 + tProg * tProg * 145;
          const drag = 5.5 + tProg * 6.5;
          const curlAmp = Math.sin(tProg * Math.PI) * (1 - clamp01(1 - dist / 90)) * 220;
          const swirl =
            Math.sin(p.x * 0.008 + p.y * 0.008 + simTimeSec * 2.2 + p.seed * 6.28) * 0.6 +
            0.4 * p.spinDir;

          const ax = dx * stiffness + perpX * curlAmp * swirl - p.vx * drag;
          const ay = dy * stiffness + perpY * curlAmp * swirl - p.vy * drag;
          p.vx += ax * dt;
          p.vy += ay * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;

          // Smooth pull-in near end so fast jumps still land crisply on (hx, hy)
          if (tProg > 0.72) {
            const snapMix = clamp01((tProg - 0.72) / 0.28);
            p.x = lerp(p.x, hx, snapMix * 0.35);
            p.y = lerp(p.y, hy, snapMix * 0.35);
          }

          const morphHero = clamp01((tProg - 0.52) / 0.48);
          p.w = lerp(p.startW, p.heroW, morphHero);
          p.h = lerp(p.startH, p.heroH, morphHero);

          if (dist < 42 || morphHero > 0.55) {
            p.atlasRow = p.heroAtlasRow;
            p.glyphIdx = p.heroGlyphIdx;
            p.tone = 1.6 + p.heroIntensity * 1.4;
          } else {
            const shard = velocityEdgeGlyph(p.vx, p.vy);
            p.atlasRow = shard.row;
            p.glyphIdx = shard.glyph;
            p.tone = 1.8 + p.seed * 1.0;
          }
          p.alpha = lerp(0.84, 0.55, morphHero);
          anyAirborne = true;

          if ((dist < 4.5 && tProg > 0.32) || tProg >= 1.05) {
            p.x = hx;
            p.y = hy;
            p.vx = 0;
            p.vy = 0;
            if (scrollDissolve <= 0.001 || scrollDissolve < p.peelOrder - 0.03) {
              p.state = P_HERO_DORMANT;
              p.alpha = 0;
              continue;
            }
            p.state = P_HERO_PEELING;
          }
        }
      }

      // 5) Locked onto target anchor (and Conservation Relay / Dissolve triggers)
      if (p.state === P_LOCKED) {
        const target = p.targetIdx >= 0 ? targets[p.targetIdx] : undefined;
        if (target) {
          resolveAnchorViewportCoords(target, p.subIdx, p.normX, p.normY, anchorScratch);
          p.tx = anchorScratch.tx;
          p.ty = anchorScratch.ty;
          p.x = p.tx;
          p.y = p.ty;
          target.activeLockedCount++;
        }

        // 5a) Dissolve eruption when target scrolls downward out of mid-screen
        let launchedUp = false;
        if (
          target &&
          !target.isAux &&
          (target.dp < -0.0005 ||
            (target.currentP < 0.96 && isScrollingUp) ||
            (target.rectTop > vh * 0.52 && isScrollingUp))
        ) {
          const initVx = (p.seed - 0.5) * 320 + p.spinDir * 140;
          const initVy = -(230 + p.seed2 * 260 + clamp(-scrollVel, 0, 2400) * 0.25);
          if (shouldReturnHero) {
            launchReturnHome(p, p.x, p.y, initVx, initVy);
            launchedUp = true;
          } else if (upPool.length > 0 && p.seed3 < 0.55) {
            const upTargetIdx = upPool[upCursor % upPool.length]!;
            upCursor++;
            launchToTarget(p, upTargetIdx, p.x, p.y, initVx, initVy, false);
            launchedUp = true;
          } else {
            launchUpperSweep(p, p.x, p.y, initVx, initVy);
            launchedUp = true;
          }
        }

        // 5b) Recruit idle/offscreen/settled locked particles to erupt off dissolving targets
        const recruitableLocked =
          (!target && p.lockAge > 0.18) ||
          (target !== undefined &&
            (target.rectBottom < 0 ||
              target.rectTop > vh ||
              (target.currentP >= 0.97 && p.alpha <= 0.14)));
        if (
          !launchedUp &&
          dissolveBurstBudget > 0 &&
          dissolvingTargets.length > 0 &&
          recruitableLocked
        ) {
          const dIdx = dissolvingTargets[dissolveTargetCursor % dissolvingTargets.length]!;
          dissolveTargetCursor++;
          const dTarget = targets[dIdx]!;
          if (dTarget.activeFlyingCount + dTarget.activeLockedCount < perDissolveCap) {
            dissolveBurstBudget--;
            measureSubElsIfNeeded(dTarget);
            sampleTargetAnchor(dTarget, p.seed, p.seed2, p.seed3, simTimeSec, anchorScratch);
            const initVx = (p.seed - 0.5) * 300 + p.spinDir * 130;
            const initVy = -(220 + p.seed2 * 260 + clamp(-scrollVel, 0, 2400) * 0.24);
            dTarget.activeFlyingCount++;
            if (shouldReturnHero) {
              launchReturnHome(p, anchorScratch.tx, anchorScratch.ty, initVx, initVy);
            } else if (upPool.length > 0 && p.seed3 < 0.55) {
              const upIdx = upPool[upCursor % upPool.length]!;
              upCursor++;
              launchToTarget(
                p,
                upIdx,
                anchorScratch.tx,
                anchorScratch.ty,
                initVx,
                initVy,
                false,
              );
            } else {
              launchUpperSweep(p, anchorScratch.tx, anchorScratch.ty, initVx, initVy);
            }
            launchedUp = true;
          }
        }

        // 5c) Scroll-DOWN relay from exiting elements (rectBottom < vh * 0.28) or solid above
        if (!launchedUp && downPool.length > 0 && (isScrollingDown || anyForming)) {
          const exitingTop =
            !target || target.rectBottom < vh * 0.28 || p.ty < vh * 0.26;
          const solidFinished =
            target &&
            !target.isAux &&
            target.currentP >= 0.97 &&
            p.lockAge > 0.32;

          if (
            (exitingTop && (p.ty > -40 || relayPerFrameBudget > 0)) ||
            (solidFinished && relayPerFrameBudget > 0)
          ) {
            const targetIdx = downPool[downCursor % downPool.length]!;
            const nextT = targets[targetIdx]!;
            if (targetIdx !== p.targetIdx && (!target || nextT.rectTop > target.rectTop - 40)) {
              if (p.ty <= -40 || solidFinished) relayPerFrameBudget--;
              downCursor++;
              const launchX = clamp(p.tx, 16, widthCss - 16);
              const launchY = p.ty < 4 ? 4 + p.seed2 * (vh * 0.2) : p.ty;
              const initVx = p.spinDir * (130 + p.seed * 170) + (p.seed3 - 0.5) * 140;
              const initVy = 170 + p.seed2 * 230 + clamp(scrollVel, 0, 2600) * 0.24;
              launchToTarget(p, targetIdx, launchX, launchY, initVx, initVy, false);
            }
          }
        }

        if (p.state === P_LOCKED) {
          p.lockAge += dt;
          const k = clamp01(p.lockAge / Math.max(0.12, p.lockLife));
          const targetForming = target && !target.isAux && target.currentP < 0.95;

          if (k < 0.28) {
            p.atlasRow = ATLAS_SPEC.rowAscii;
            p.glyphIdx =
              p.seed > 0.72
                ? ASCII_AT
                : p.seed > 0.42
                  ? ASCII_HASH
                  : p.seed > 0.18
                    ? ASCII_STAR
                    : ASCII_PLUS;
            p.tone = 3.0;
            p.w = widthCss < MOBILE_BREAKPOINT_PX ? 12 : 15.5;
            p.h = widthCss < MOBILE_BREAKPOINT_PX ? 16 : 21;
            p.alpha = 0.92;
          } else if (k < 0.68) {
            p.atlasRow = ATLAS_SPEC.rowAscii;
            p.glyphIdx = p.seed2 > 0.5 ? ASCII_PLUS : ASCII_EQ;
            p.tone = lerp(2.8, 1.3, (k - 0.28) / 0.4);
            p.w = widthCss < MOBILE_BREAKPOINT_PX ? 10 : 13;
            p.h = widthCss < MOBILE_BREAKPOINT_PX ? 14 : 18;
            p.alpha = lerp(0.74, targetForming ? 0.48 : 0.32, (k - 0.28) / 0.4);
          } else if (targetForming) {
            // Keep crisp architectural silhouette alive while target HTML is still veiled
            p.atlasRow = ATLAS_SPEC.rowAscii;
            p.glyphIdx = p.seed > 0.5 ? ASCII_COLON : ASCII_DASH;
            p.tone = 1.4;
            p.w = widthCss < MOBILE_BREAKPOINT_PX ? 10 : 12.5;
            p.h = widthCss < MOBILE_BREAKPOINT_PX ? 14 : 17;
            p.alpha = 0.36 + 0.14 * Math.sin(simTimeSec * 4 + p.seed * 6.28);
          } else {
            // Solid target: fade smoothly so copy is 100% razor-sharp
            const fadeRate = isSettledAtRest ? 5.5 : 3.2;
            p.alpha = Math.max(0, p.alpha - dt * fadeRate);
            p.atlasRow = ATLAS_SPEC.rowAscii;
            p.glyphIdx = ASCII_DOT;
            p.tone = 0.6;
          }

          if (
            allowMarginOrbiters &&
            isSettledAtRest &&
            i % Math.max(1, Math.floor(poolCap / MARGIN_ORBIT_COUNT)) === 0
          ) {
            p.state = P_MARGIN_ORBIT;
            p.alpha = 0.05;
          }
        }
      }

      // 6) Airborne cross-screen flight (spring + perpendicular curl swirl)
      if (p.state === P_FLYING) {
        if (p.targetIdx === -2) {
          if (isScrollingDown && downPool.length > 0) {
            const nextIdx = downPool[downCursor % downPool.length]!;
            downCursor++;
            assignTargetAnchorToParticle(p, nextIdx);
          } else {
            p.tx = lerp(contentLeft, contentRight, p.seed);
            p.ty = vh * (0.09 + p.seed2 * 0.28);
          }
        }

        const target = p.targetIdx >= 0 ? targets[p.targetIdx] : undefined;
        if (target) {
          // Dynamic re-route on scroll-down if target exited top
          if (
            isScrollingDown &&
            target.rectBottom < vh * 0.2 &&
            downPool.length > 0
          ) {
            const nextIdx = downPool[downCursor % downPool.length]!;
            if (nextIdx !== p.targetIdx) {
              downCursor++;
              assignTargetAnchorToParticle(p, nextIdx);
            }
          } else if (isScrollingUp && target.rectTop > vh * 0.95) {
            // Dynamic re-route on scroll-up if target dropped below viewport bottom
            if (upPool.length > 0 && p.seed3 < 0.55) {
              const upIdx = upPool[upCursor % upPool.length]!;
              if (upIdx !== p.targetIdx) {
                upCursor++;
                assignTargetAnchorToParticle(p, upIdx);
                p.vy = -Math.abs(p.vy) - 180;
              }
            } else {
              p.targetIdx = -2;
              p.subIdx = -1;
              p.tx = lerp(contentLeft, contentRight, p.seed);
              p.ty = vh * (0.09 + p.seed2 * 0.28);
              p.vy = -Math.abs(p.vy) - 180;
            }
          }
          const activeTarget = p.targetIdx >= 0 ? targets[p.targetIdx] : undefined;
          if (activeTarget) {
            resolveAnchorViewportCoords(
              activeTarget,
              p.subIdx,
              p.normX,
              p.normY,
              anchorScratch,
            );
            p.tx = anchorScratch.tx;
            p.ty = anchorScratch.ty;
            activeTarget.activeFlyingCount++;
          }
        }

        p.age += dt;
        const tProg = clamp01(p.age / Math.max(0.2, p.life));
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy);
        const safeDist = Math.max(1, dist);
        const perpX = -dy / safeDist;
        const perpY = dx / safeDist;

        const stiffness = 20 + tProg * tProg * 130;
        const drag = 4.2 + tProg * 7.8;
        const curlFade = clamp01(dist / 65);
        const curlAmp = Math.sin(tProg * Math.PI) * curlFade * (210 + p.seed * 170);
        const swirl =
          Math.sin(p.x * 0.0082 + p.y * 0.0074 + simTimeSec * 2.5 + p.seed * 6.283) * 0.62 +
          0.38 * p.spinDir;

        const ax = dx * stiffness + perpX * curlAmp * swirl - p.vx * drag;
        const ay = dy * stiffness + perpY * curlAmp * swirl - p.vy * drag;
        p.vx += ax * dt;
        p.vy += ay * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (tProg > 0.78) {
          const pull = clamp01((tProg - 0.78) / 0.22);
          p.x = lerp(p.x, p.tx, pull * 0.38);
          p.y = lerp(p.y, p.ty, pull * 0.38);
        }

        const targetW = widthCss < MOBILE_BREAKPOINT_PX ? 10.5 : 13.5;
        const targetH = widthCss < MOBILE_BREAKPOINT_PX ? 14.5 : 18.5;
        const sizeBlend = clamp01(p.age / 0.18);
        p.w = lerp(p.startW, targetW, sizeBlend);
        p.h = lerp(p.startH, targetH, sizeBlend);

        if (p.fromHero && p.age < 0.075) {
          p.atlasRow = p.heroAtlasRow;
          p.glyphIdx = p.heroGlyphIdx;
          p.tone = 1.8 + p.heroIntensity * 1.1;
          p.alpha = 0.78 + p.heroIntensity * 0.16;
        } else if (dist < 32 || tProg > 0.86) {
          p.atlasRow = ATLAS_SPEC.rowAscii;
          p.glyphIdx = p.seed > 0.5 ? ASCII_STAR : ASCII_PLUS;
          p.tone = lerp(2.1, 3.0, tProg);
          p.alpha = 0.9;
        } else {
          const shard = velocityEdgeGlyph(p.vx, p.vy);
          p.atlasRow = shard.row;
          p.glyphIdx = shard.glyph;
          p.tone = 1.2 + clamp01(Math.hypot(p.vx, p.vy) / 700) * 1.6;
          p.alpha = lerp(0.62, 0.88, tProg);
        }

        anyAirborne = true;

        if ((dist < 5.5 && tProg > 0.28) || tProg >= 1.06) {
          p.x = p.tx;
          p.y = p.ty;
          p.vx = 0;
          p.vy = 0;
          p.state = P_LOCKED;
          p.lockAge = 0;
          p.lockLife = 0.26 + p.seed * 0.22;
        }
      }

      // 7) Suppress alpha inside reading column when settled at rest
      let drawAlpha = p.alpha;
      if (
        isSettledAtRest &&
        p.state !== P_MARGIN_ORBIT &&
        p.x >= contentLeft - 24 &&
        p.x <= contentRight + 24
      ) {
        const settleFade = clamp01(1 - (idleMs - 380) / 220);
        drawAlpha *= settleFade;
        if (settleFade <= 0.01) {
          p.alpha = 0;
          continue;
        }
      }

      if (drawAlpha <= 0.015) continue;
      if (p.atlasRow === ATLAS_SPEC.rowAscii && p.glyphIdx <= 0) continue;
      if (
        p.x < -36 ||
        p.x > widthCss + 36 ||
        p.y < -36 ||
        p.y > heightCss + 36
      ) {
        continue;
      }

      const outBase = activeDrawCount * FLOATS_PER_INSTANCE;
      instanceData[outBase] = p.x;
      instanceData[outBase + 1] = p.y;
      instanceData[outBase + 2] = p.w;
      instanceData[outBase + 3] = p.h;
      instanceData[outBase + 4] = p.glyphIdx;
      instanceData[outBase + 5] = p.atlasRow;
      instanceData[outBase + 6] = p.tone;
      instanceData[outBase + 7] = drawAlpha;
      activeDrawCount++;
    }

    // ── Phase 5: Render & rAF Sleep Management ──────────────────────────
    renderer?.render(
      instanceData,
      activeDrawCount,
      widthCss,
      heightCss,
      widthPx,
      heightPx,
      theme,
    );

    const shouldContinue =
      anyTransitioning ||
      anyAirborne ||
      activeDrawCount > 0 ||
      Math.abs(scrollVel) > 2 ||
      Math.abs(dyScroll) > 0.5 ||
      idleMs <= 650;

    if (shouldContinue) {
      idleFrames = 0;
      rafId = requestAnimationFrame(stepAndRender);
    } else {
      idleFrames++;
      if (idleFrames < 3) {
        rafId = requestAnimationFrame(stepAndRender);
      }
    }
  };

  const onScroll = (): void => {
    lastScrollMoveMs = performance.now();
    wakeLoop();
  };

  const onResize = (): void => {
    syncCanvasSize();
    if (reducedMotion) {
      setAllTargetsSolid();
      renderer?.clear(widthPx, heightPx);
    } else {
      wakeLoop();
    }
  };

  const onVisibilityChange = (): void => {
    isPageVisible = !document.hidden;
    if (!isPageVisible) {
      stopLoop();
    } else {
      lastFrameMs = performance.now();
      wakeLoop();
    }
  };

  const stopTheme = observeDataTheme(() => {
    theme = resolveThemeColors();
    renderer?.updateTheme(theme);
    if (!reducedMotion) wakeLoop();
  });

  const stopMotion = observeReducedMotion((nextReduced) => {
    reducedMotion = nextReduced;
    if (reducedMotion) {
      stopLoop();
      setAllTargetsSolid();
      resetAllParticlesDormant();
      renderer?.clear(widthPx, heightPx);
    } else {
      prevScrollY = window.scrollY;
      scrollVel = 0;
      lastScrollMoveMs = performance.now();
      initializeMountState();
      wakeLoop();
    }
  });

  const stopHeroSnapshot = subscribeHeroSnapshot((snapshot) => {
    applyHeroSnapshot(snapshot);
    if (!reducedMotion && window.scrollY > 6) {
      wakeLoop();
    }
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  syncCanvasSize();
  const initialSnapshot = getHeroSnapshot();
  if (initialSnapshot) {
    applyHeroSnapshot(initialSnapshot);
  }
  initializeMountState();

  if (!reducedMotion && isPageVisible) {
    lastFrameMs = performance.now();
    rafId = requestAnimationFrame(stepAndRender);
  }

  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (destroyed) return;
      buildGlyphAtlasCanvas(atlasCanvas);
      renderer?.uploadAtlas(atlasCanvas);
      if (!reducedMotion) {
        wakeLoop();
      }
    });
  }

  return {
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopTheme();
      stopMotion();
      stopHeroSnapshot();
      resetAllParticlesDormant();
      renderer?.clear(widthPx, heightPx);
      renderer?.destroy();
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        if (t.isAux) continue;
        t.el.style.removeProperty("--asm");
        delete t.el.dataset.asmState;
      }
    },
  };
}
