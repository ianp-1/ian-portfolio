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

export interface NanobotHandle {
  destroy: () => void;
}

type AssembleKind = "heading" | "project" | "role" | "stack-col" | "contact";

const POOL_SIZE = 360;
const SPINE_BOT_COUNT = 24;
const SWARM_POOL_COUNT = POOL_SIZE - SPINE_BOT_COUNT; // 336

const MODE_DEAD = 0;
const MODE_FORMING = 1;
const MODE_LOCKED = 2;
const MODE_DISSOLVING = 3;
const MODE_SPINE = 4;

const TONE_MUTED = 0;
const TONE_SECONDARY = 1;
const TONE_INK = 2;
const TONE_ACCENT = 3;
const TONE_COUNT = 4;
const ALPHA_STEPS = 24;

// Crisp Geist Mono glyphs: · : - = + * # / \ | @
const GLYPHS = [
  "\u00b7",
  ":",
  "-",
  "=",
  "+",
  "*",
  "#",
  "/",
  "\\",
  "|",
  "@",
] as const;

const GLYPH_DOT = 0;
const GLYPH_COLON = 1;
const GLYPH_DASH = 2;
const GLYPH_EQ = 3;
const GLYPH_PLUS = 4;
const GLYPH_STAR = 5;
const GLYPH_HASH = 6;
const GLYPH_SLASH = 7;
const GLYPH_BACKSLASH = 8;
const GLYPH_PIPE = 9;
const GLYPH_AT = 10;

const FONT_13 = `500 13px ${CHARSET_FONT_STACK}`;
const FONT_14 = `500 14px ${CHARSET_FONT_STACK}`;
const FONT_15 = `600 15px ${CHARSET_FONT_STACK}`;

const HERO_CLEAR_SCROLL_Y = 24;
const HERO_FADE_RANGE_PX = 40;
const WIDE_SPINE_MIN_WIDTH = 1140;

interface NanobotParticle {
  active: boolean;
  mode: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  normX: number;
  normY: number;
  targetIdx: number;
  subIdx: number;
  age: number;
  life: number;
  progress: number;
  seed: number;
  alpha: number;
  tone: number;
  glyphIdx: number;
  sizeTier: number;
  spinDir: number;
  spineT: number;
}

interface AssembleTarget {
  el: HTMLElement;
  kind: AssembleKind;
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
  spawnBudget: number;
  dissolveBudget: number;
  hasActiveBots: boolean;
  lastAsmMilli: number;
  lastState: string;
  nextState: string;
}

interface AnchorScratch {
  subIdx: number;
  normX: number;
  normY: number;
  tx: number;
  ty: number;
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

function parseAssembleKind(raw: string | undefined): AssembleKind {
  switch (raw) {
    case "heading":
    case "project":
    case "role":
    case "stack-col":
    case "contact":
      return raw;
    default:
      return "heading";
  }
}

function collectSubElements(el: HTMLElement, kind: AssembleKind): HTMLElement[] {
  if (kind === "heading") {
    const out: HTMLElement[] = [];
    const h2 = el.querySelector<HTMLElement>("h2");
    const meta = el.querySelector<HTMLElement>("span");
    if (h2) out.push(h2);
    if (meta) out.push(meta);
    return out;
  }

  if (kind === "project") {
    const out: HTMLElement[] = [];
    const exhibit = el.querySelector<HTMLElement>(".work-exhibit");
    const h3 = el.querySelector<HTMLElement>("h3");
    const link = el.querySelector<HTMLElement>(".work-code-link, a");
    if (exhibit) out.push(exhibit);
    if (h3) out.push(h3);
    if (link) out.push(link);
    return out;
  }

  if (kind === "role") {
    const out: HTMLElement[] = [];
    const period = el.querySelector<HTMLElement>(".exp-period");
    const h3 = el.querySelector<HTMLElement>("h3");
    const company = el.querySelector<HTMLElement>("[data-exp-company]");
    if (period) out.push(period);
    if (h3) out.push(h3);
    if (company) out.push(company);
    return out;
  }

  if (kind === "stack-col") {
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

  // contact
  const out: HTMLElement[] = [];
  const h2 = el.querySelector<HTMLElement>("h2");
  if (h2) out.push(h2);
  const links = el.querySelectorAll<HTMLElement>("a");
  for (let i = 0; i < links.length; i++) {
    const a = links[i];
    if (a) out.push(a);
  }
  return out;
}

function createEmptyParticle(index: number): NanobotParticle {
  const isSpine = index >= SWARM_POOL_COUNT;
  const spineIdx = index - SWARM_POOL_COUNT;
  const seed = ((index * 0.61803398875) % 1 + 1) % 1;
  return {
    active: isSpine,
    mode: isSpine ? MODE_SPINE : MODE_DEAD,
    x: 26,
    y: 0,
    vx: 0,
    vy: 0,
    tx: 26,
    ty: 0,
    sx: 26,
    sy: 0,
    normX: 0.5,
    normY: 0.5,
    targetIdx: -1,
    subIdx: -1,
    age: seed * 4,
    life: 1,
    progress: 0,
    seed,
    alpha: 0,
    tone: TONE_MUTED,
    glyphIdx: GLYPH_DOT,
    sizeTier: 0,
    spinDir: (index & 1) === 0 ? 1 : -1,
    spineT: isSpine ? (spineIdx + 0.5) / SPINE_BOT_COUNT : 0,
  };
}

function buildColorLut(theme: ThemeColors, out: string[]): void {
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

function velocityGlyphIdx(vx: number, vy: number, speedSq: number): number {
  if (speedSq < 900) return GLYPH_COLON;
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (ax < ay * 0.34) return GLYPH_PIPE;
  if (ay < ax * 0.34) return speedSq > 160000 ? GLYPH_EQ : GLYPH_DASH;
  return vx * vy > 0 ? GLYPH_BACKSLASH : GLYPH_SLASH;
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
  forDissolve: boolean,
  out: AnchorScratch,
): void {
  const subCount = target.subEls.length;
  let subIdx = -1;
  let nx = r2;
  let ny = 0.5;

  switch (target.kind) {
    case "heading": {
      if (forDissolve) {
        if (r1 < 0.45 && subCount > 0) {
          subIdx = 0;
          nx = r2;
          ny = 0.25 + r3 * 0.5;
        } else {
          subIdx = -1;
          nx = r2;
          ny = r1 < 0.72 ? 0.04 : 0.98;
        }
      } else if (r1 < 0.58) {
        subIdx = -1;
        nx = r2;
        ny = 0.99;
      } else if (r1 < 0.8) {
        subIdx = -1;
        if (r3 < 0.5) {
          nx = r2;
          ny = 0.03;
        } else {
          nx = r3 < 0.75 ? 0.005 : 0.995;
          ny = r2;
        }
      } else if (subCount > 0) {
        subIdx = subCount > 1 && r3 > 0.75 ? 1 : 0;
        nx = r2;
        ny = 0.58;
      }
      break;
    }

    case "project": {
      if (subCount > 0 && r1 < 0.62) {
        // Card corners & perimeter edges of .work-exhibit
        subIdx = 0;
        const cornerBand = r3 < 0.52;
        if (cornerBand) {
          const corner = Math.floor(r3 * 7.68) & 3;
          const cx = (corner & 1) === 0 ? 0.005 : 0.995;
          const cy = (corner & 2) === 0 ? 0.008 : 0.992;
          if (r2 < 0.5) {
            const span = r2 * 2 * 0.12;
            nx = cx < 0.5 ? span : 1 - span;
            ny = cy;
          } else {
            const span = (r2 - 0.5) * 2 * 0.16;
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
      } else if (subCount > 1 && r1 < 0.85) {
        subIdx = subCount > 2 && r3 > 0.68 ? 2 : 1;
        nx = r2;
        ny = forDissolve ? 0.35 + r3 * 0.35 : 0.66;
      } else {
        subIdx = -1;
        nx = r2;
        ny = forDissolve ? (r3 < 0.7 ? 0.03 : 0.5) : r3 < 0.5 ? 0.02 : 0.98;
      }
      break;
    }

    case "role": {
      if (r1 < 0.36) {
        // Left vertical rule
        subIdx = -1;
        nx = 0.004;
        ny = 0.12 + r2 * 0.76;
      } else if (subCount > 0 && r1 < 0.6) {
        // Period mono badge
        subIdx = 0;
        nx = r2;
        ny = 0.52;
      } else if (r1 < 0.82) {
        // Bottom/top baseline rule
        subIdx = -1;
        nx = r2;
        ny = forDissolve ? 0.04 : 0.99;
      } else if (subCount > 1) {
        subIdx = subCount > 2 && r3 > 0.5 ? 2 : 1;
        nx = r2;
        ny = 0.55;
      }
      break;
    }

    case "stack-col": {
      if (subCount > 1 && r1 >= 0.16) {
        const itemCount = subCount - 1;
        subIdx = 1 + Math.min(itemCount - 1, Math.floor(r2 * itemCount));
        if (r3 < 0.34) {
          // Left notch tick before item
          nx = -0.04 + r3 * 0.2;
          ny = 0.5;
        } else {
          nx = clamp01((r3 - 0.34) / 0.66);
          ny = 0.52;
        }
      } else if (subCount > 0) {
        subIdx = 0;
        nx = r2;
        ny = 0.52;
      } else {
        subIdx = -1;
        nx = r2;
        ny = forDissolve ? 0.05 : 0.5;
      }
      break;
    }

    case "contact": {
      if (subCount > 1 && r1 >= 0.32 && r1 < 0.74) {
        subIdx = 1; // email link
        nx = r2;
        ny = forDissolve ? 0.35 + r3 * 0.35 : 0.72;
      } else if (subCount > 2 && r1 >= 0.74) {
        const socialCount = subCount - 2;
        subIdx = 2 + Math.min(socialCount - 1, Math.floor(r2 * socialCount));
        nx = r3;
        ny = 0.65;
      } else if (subCount > 0) {
        subIdx = 0; // heading
        nx = r2;
        ny = forDissolve ? 0.25 + r3 * 0.45 : 0.64;
      } else {
        subIdx = -1;
        nx = r2;
        ny = forDissolve ? 0.08 : 0.85;
      }
      break;
    }
  }

  out.subIdx = subIdx;
  out.normX = nx;
  out.normY = ny;
  resolveAnchorViewportCoords(target, subIdx, nx, ny, out);
}

export function mountAsciiNanobots(canvas: HTMLCanvasElement): NanobotHandle {
  const ctx = canvas.getContext("2d");

  const assembleEls = Array.from(
    document.querySelectorAll<HTMLElement>("[data-assemble]"),
  );
  const heroEl = document.getElementById("hero");

  const targets: AssembleTarget[] = assembleEls.map((el) => {
    const kind = parseAssembleKind(el.dataset.assemble);
    const subEls = collectSubElements(el, kind);
    return {
      el,
      kind,
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
      currentP: 1,
      targetP: 1,
      dp: 0,
      lastDir: 1,
      mountedSolidGuard: false,
      spawnBudget: 0,
      dissolveBudget: 0,
      hasActiveBots: false,
      lastAsmMilli: -1,
      lastState: "",
      nextState: "",
    };
  });

  const particles: NanobotParticle[] = new Array(POOL_SIZE);
  for (let i = 0; i < POOL_SIZE; i++) {
    particles[i] = createEmptyParticle(i);
  }

  const colorLut: string[] = new Array(TONE_COUNT * ALPHA_STEPS).fill("rgb(245, 245, 245)");
  let theme = resolveThemeColors();
  buildColorLut(theme, colorLut);

  let destroyed = false;
  let reducedMotion = isReducedMotionPreferred();
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;

  let widthCss = Math.max(1, window.innerWidth || canvas.clientWidth || 1280);
  let heightCss = Math.max(1, window.innerHeight || canvas.clientHeight || 800);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  let prevScrollY = window.scrollY;
  let scrollVel = 0;
  let lastFrameMs = 0;
  let rafId: number | null = null;
  let swarmCursor = 0;
  let rngState = 0x9e3779b9;
  let idleFrames = 0;

  let heroTop = 0;
  let heroHeight = heightCss;
  let heroBottom = heightCss;
  let docScrollHeight = heightCss;

  const anchorScratch: AnchorScratch = {
    subIdx: -1,
    normX: 0.5,
    normY: 0.5,
    tx: 0,
    ty: 0,
  };

  const nextRand = (): number => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    return ((rngState >>> 0) & 0xfffffff) / 0x10000000;
  };

  const writeTargetDom = (t: AssembleTarget, state: string, p: number): void => {
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
      t.currentP = 1;
      t.targetP = 1;
      t.dp = 0;
      t.mountedSolidGuard = false;
      t.spawnBudget = 0;
      t.dissolveBudget = 0;
      writeTargetDom(t, "solid", 1);
    }
  };

  const clearSwarmParticles = (): void => {
    for (let i = 0; i < SWARM_POOL_COUNT; i++) {
      const p = particles[i]!;
      p.active = false;
      p.mode = MODE_DEAD;
      p.alpha = 0;
    }
  };

  const clearCanvas = (): void => {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  const syncCanvasSize = (): void => {
    widthCss = Math.max(1, window.innerWidth || canvas.clientWidth || 1280);
    heightCss = Math.max(1, window.innerHeight || canvas.clientHeight || 800);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextW = Math.max(1, Math.round(widthCss * dpr));
    const nextH = Math.max(1, Math.round(heightCss * dpr));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
  };

  const initializeMountProgress = (): void => {
    if (reducedMotion) {
      setAllTargetsSolid();
      clearSwarmParticles();
      clearCanvas();
      return;
    }

    const vh = heightCss;
    const enterBottom = vh * 1.06;
    const enterBand = Math.max(1, vh * 0.28);

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      const rect = t.el.getBoundingClientRect();
      t.rectLeft = rect.left;
      t.rectTop = rect.top;
      t.rectWidth = rect.width;
      t.rectHeight = rect.height;
      t.rectBottom = rect.bottom;

      if (rect.top <= vh * 0.85) {
        t.currentP = 1;
        t.targetP = 1;
        t.lastDir = 1;
        t.mountedSolidGuard = rect.top > vh * 0.78;
        writeTargetDom(t, "solid", 1);
      } else if (rect.top >= enterBottom) {
        t.currentP = 0;
        t.targetP = 0;
        t.lastDir = 1;
        t.mountedSolidGuard = false;
        writeTargetDom(t, "idle", 0);
      } else {
        const p = clamp01((enterBottom - rect.top) / enterBand);
        const snapped = p <= 0.02 ? 0 : p >= 0.97 ? 1 : p;
        t.currentP = snapped;
        t.targetP = p;
        t.lastDir = 1;
        t.mountedSolidGuard = false;
        const st = snapped >= 0.97 ? "solid" : snapped <= 0.02 ? "idle" : "forming";
        writeTargetDom(t, st, snapped);
      }
    }
  };

  const acquireSwarmSlot = (): NanobotParticle => {
    for (let step = 0; step < SWARM_POOL_COUNT; step++) {
      const idx = (swarmCursor + step) % SWARM_POOL_COUNT;
      const p = particles[idx]!;
      if (!p.active) {
        swarmCursor = (idx + 1) % SWARM_POOL_COUNT;
        return p;
      }
    }
    // Pool saturated: recycle oldest locked or dissolving slot first, else cursor slot.
    let bestIdx = swarmCursor;
    let bestScore = -1;
    for (let i = 0; i < SWARM_POOL_COUNT; i++) {
      const p = particles[i]!;
      const modeBonus = p.mode === MODE_LOCKED ? 10 : p.mode === MODE_DISSOLVING ? 5 : 0;
      const score = modeBonus + p.age;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    swarmCursor = (bestIdx + 1) % SWARM_POOL_COUNT;
    return particles[bestIdx]!;
  };

  const spawnFormingParticle = (
    target: AssembleTarget,
    targetIdx: number,
    scrollY: number,
  ): void => {
    const r1 = nextRand();
    const r2 = nextRand();
    const r3 = nextRand();
    const r4 = nextRand();

    sampleTargetAnchor(target, r1, r2, r3, false, anchorScratch);
    const tx = anchorScratch.tx;
    const ty = anchorScratch.ty;

    let sx = tx;
    let sy = heightCss + 6;
    let vx = 0;
    let vy = -220;

    // On initial scroll off #hero, peel streams off the bottom of #hero / IAN PANG
    const heroPeelBias =
      heroBottom > 48 && scrollY >= HERO_CLEAR_SCROLL_Y && scrollY < heightCss * 1.05
        ? clamp01((heroBottom - 48) / (heightCss * 0.65)) * 0.65
        : 0;

    if (r4 < heroPeelBias) {
      const wordmarkBottom = heroTop + heroHeight * 0.56;
      const peelFloor = Math.min(heightCss - 16, heroBottom - 4);
      const peelCeil = Math.max(40, Math.min(wordmarkBottom, peelFloor));
      sx = widthCss * (0.12 + r2 * 0.76);
      sy = lerp(peelCeil, peelFloor, r3);
      vx = (tx - sx) * 0.75 + (r1 - 0.5) * 90;
      vy = 110 + r4 * 150;
    } else {
      sy = heightCss - 4 + r4 * 24;
      sx = clamp(tx + (r1 - 0.5) * 260, 12, widthCss - 12);
      vx = (r1 - 0.5) * 100;
      vy = -(220 + r3 * 190 + clamp(scrollVel, 0, 2400) * 0.14);
    }

    const p = acquireSwarmSlot();
    p.active = true;
    p.mode = MODE_FORMING;
    p.x = sx;
    p.y = sy;
    p.sx = sx;
    p.sy = sy;
    p.tx = tx;
    p.ty = ty;
    p.vx = vx;
    p.vy = vy;
    p.normX = anchorScratch.normX;
    p.normY = anchorScratch.normY;
    p.targetIdx = targetIdx;
    p.subIdx = anchorScratch.subIdx;
    p.age = 0;
    p.life = 0.27 + r3 * 0.16;
    p.progress = 0;
    p.seed = r1;
    p.alpha = 0.25;
    p.tone = r4 > 0.72 ? TONE_INK : TONE_SECONDARY;
    p.glyphIdx = GLYPH_DOT;
    p.sizeTier = 0;
    p.spinDir = r2 < 0.5 ? -1 : 1;
    target.hasActiveBots = true;
  };

  const spawnDissolvingParticle = (target: AssembleTarget, targetIdx: number): void => {
    const r1 = nextRand();
    const r2 = nextRand();
    const r3 = nextRand();
    const r4 = nextRand();

    sampleTargetAnchor(target, r1, r2, r3, true, anchorScratch);
    const sx = anchorScratch.tx;
    const sy = anchorScratch.ty;

    const upSpeed = 140 + r3 * 220 + clamp(-scrollVel, 0, 2400) * 0.16;
    const p = acquireSwarmSlot();
    p.active = true;
    p.mode = MODE_DISSOLVING;
    p.x = sx;
    p.y = sy;
    p.sx = sx;
    p.sy = sy;
    p.tx = sx;
    p.ty = sy;
    p.vx = (r1 - 0.5) * 190;
    p.vy = -upSpeed;
    p.normX = anchorScratch.normX;
    p.normY = anchorScratch.normY;
    p.targetIdx = targetIdx;
    p.subIdx = anchorScratch.subIdx;
    p.age = 0;
    p.life = 0.42 + r4 * 0.34;
    p.progress = 0;
    p.seed = r2;
    p.alpha = 0.72;
    p.tone = r4 > 0.6 ? TONE_ACCENT : TONE_INK;
    p.glyphIdx = r3 > 0.5 ? GLYPH_STAR : GLYPH_HASH;
    p.sizeTier = r4 > 0.75 ? 1 : 0;
    p.spinDir = r1 < 0.5 ? -1 : 1;
  };

  const kindSpawnDensity = (kind: AssembleKind): number => {
    switch (kind) {
      case "heading":
        return 20;
      case "project":
        return 36;
      case "role":
        return 24;
      case "stack-col":
        return 26;
      case "contact":
        return 28;
    }
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

    const dt = lastFrameMs > 0 ? Math.min((nowMs - lastFrameMs) / 1000, 0.05) : 0.016;
    lastFrameMs = nowMs;

    // ── Phase 1: Batch ALL DOM reads first (zero interleaved writes) ──────
    const scrollY = window.scrollY;
    const dyScroll = scrollY - prevScrollY;
    prevScrollY = scrollY;
    const instantVel = clamp(dyScroll / Math.max(dt, 0.004), -4500, 4500);
    scrollVel += (instantVel - scrollVel) * (1 - Math.exp(-dt * 14));
    if (Math.abs(scrollVel) < 2 && dyScroll === 0) scrollVel = 0;

    const vh = heightCss;
    const showSpine = widthCss >= WIDE_SPINE_MIN_WIDTH && scrollY >= HERO_CLEAR_SCROLL_Y;
    if (showSpine) {
      docScrollHeight = document.documentElement.scrollHeight;
    }

    if (heroEl) {
      const hr = heroEl.getBoundingClientRect();
      heroTop = hr.top;
      heroHeight = Math.max(1, hr.height);
      heroBottom = hr.bottom;
    } else {
      heroTop = -scrollY;
      heroHeight = vh;
      heroBottom = vh - scrollY;
    }

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      const rect = t.el.getBoundingClientRect();
      t.rectLeft = rect.left;
      t.rectTop = rect.top;
      t.rectWidth = rect.width;
      t.rectHeight = rect.height;
      t.rectBottom = rect.bottom;
      t.subMeasured = false;
    }

    // ── Phase 2: Bidirectional progress state & sub-element measurements ──
    const enterTop = vh * 0.78;
    const enterBottom = vh * 1.06;
    const enterBand = Math.max(1, enterBottom - enterTop);
    const largeJump = Math.abs(dyScroll) > vh * 1.5;

    let anyTransitioning = false;
    let activeSectionMidY = vh * 0.45;
    let bestSectionScore = 1e9;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;

      if (t.mountedSolidGuard) {
        if (t.rectTop <= enterTop || t.rectTop > vh * 0.88 || scrollVel < -25) {
          t.mountedSolidGuard = false;
        }
      }

      let targetP: number;
      if (t.mountedSolidGuard || t.rectTop <= enterTop) {
        targetP = 1;
      } else if (t.rectTop >= enterBottom) {
        targetP = 0;
      } else {
        targetP = (enterBottom - t.rectTop) / enterBand;
      }
      t.targetP = targetP;

      const prevP = t.currentP;
      let nextP: number;
      if (largeJump && t.rectBottom < -40) {
        nextP = targetP;
      } else {
        const dampRate = targetP >= prevP ? 11.5 : 13.5;
        nextP = prevP + (targetP - prevP) * (1 - Math.exp(-dt * dampRate));
        if (targetP >= 0.97 && nextP >= 0.97) {
          nextP = 1;
        } else if (targetP <= 0.02 && nextP <= 0.02) {
          nextP = 0;
        }
      }

      const dp = nextP - prevP;
      t.currentP = nextP;
      t.dp = dp;

      let state: string;
      if (nextP >= 0.97) {
        state = "solid";
        t.lastDir = 1;
      } else if (nextP <= 0.02) {
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

      const onScreen = t.rectBottom > -24 && t.rectTop < vh + 80;
      if (onScreen && (Math.abs(dp) > 0.0001 || (nextP > 0.02 && nextP < 0.97))) {
        anyTransitioning = true;
      }

      // Measure sub-element anchors only for on-screen targets that are transitioning or guiding bots
      if (onScreen && (t.hasActiveBots || (nextP > 0.01 && nextP < 0.995) || Math.abs(dp) > 0.0002)) {
        for (let s = 0; s < t.subEls.length; s++) {
          const subEl = t.subEls[s]!;
          const sr = subEl.getBoundingClientRect();
          t.subLeft[s] = sr.left;
          t.subTop[s] = sr.top;
          t.subWidth[s] = sr.width;
          t.subHeight[s] = sr.height;
        }
        t.subMeasured = true;
      }

      // Track active on-screen section center for wide spine bridge
      if (t.rectBottom > 80 && t.rectTop < vh - 40) {
        const midY = clamp((t.rectTop + t.rectBottom) * 0.5, 96, vh - 48);
        const distToFocus = Math.abs(t.rectTop - vh * 0.34);
        if (distToFocus < bestSectionScore) {
          bestSectionScore = distToFocus;
          activeSectionMidY = midY;
        }
      }

      // Spawn forming / dissolving nanobots when scroll >= HERO_CLEAR_SCROLL_Y or leaving/returning
      if (onScreen && scrollY >= HERO_CLEAR_SCROLL_Y) {
        const density = kindSpawnDensity(t.kind);
        if (dp > 0.0004 && nextP < 0.995) {
          t.spawnBudget += dp * density;
          let count = Math.min(6, Math.floor(t.spawnBudget));
          if (count === 0 && prevP <= 0.03 && nextP > 0.03) {
            count = 3;
            t.spawnBudget = 0;
          } else {
            t.spawnBudget -= count;
          }
          for (let c = 0; c < count; c++) {
            spawnFormingParticle(t, i, scrollY);
          }
        } else if (dp < -0.0004 && targetP < 0.97 && nextP > 0.02) {
          t.dissolveBudget += -dp * density;
          let count = Math.min(6, Math.floor(t.dissolveBudget));
          if (count === 0 && prevP >= 0.97 && nextP < 0.97) {
            count = 3;
            t.dissolveBudget = 0;
          } else {
            t.dissolveBudget -= count;
          }
          for (let c = 0; c < count; c++) {
            spawnDissolvingParticle(t, i);
          }
        }
      } else {
        t.spawnBudget = 0;
        t.dissolveBudget = 0;
      }

      t.hasActiveBots = false;
      t.nextState = state;
    }

    // Write DOM updates in a single batch after all reads
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      writeTargetDom(t, t.nextState, t.currentP);
    }

    // ── Phase 3: Particle physics update ──────────────────────────────────
    const masterAlpha =
      scrollY < HERO_CLEAR_SCROLL_Y
        ? 0
        : clamp01((scrollY - HERO_CLEAR_SCROLL_Y) / HERO_FADE_RANGE_PX);

    let aliveSwarmCount = 0;
    const isScrollingUp = scrollVel < -25;
    const heroPullStrength = scrollY < vh * 1.4 ? 0.9 : 0.35;

    for (let i = 0; i < SWARM_POOL_COUNT; i++) {
      const p = particles[i]!;
      if (!p.active) continue;

      if (scrollY < HERO_CLEAR_SCROLL_Y) {
        p.active = false;
        p.mode = MODE_DEAD;
        p.alpha = 0;
        continue;
      }

      p.age += dt;

      if (p.mode === MODE_FORMING) {
        const target = p.targetIdx >= 0 ? targets[p.targetIdx] : undefined;
        if (target) {
          resolveAnchorViewportCoords(target, p.subIdx, p.normX, p.normY, anchorScratch);
          p.tx = anchorScratch.tx;
          p.ty = anchorScratch.ty;
          target.hasActiveBots = true;
        }

        const speedBoost = target && target.currentP >= 0.97 ? 1.55 : 1.0;
        p.progress = Math.min(1, p.progress + (dt / p.life) * speedBoost);
        const tCurve = p.progress;
        const ease = 1 - Math.pow(1 - tCurve, 2.4);

        const dxAll = p.tx - p.sx;
        const dyAll = p.ty - p.sy;
        const distAll = Math.max(1, Math.hypot(dxAll, dyAll));
        const perpX = -dyAll / distAll;
        const perpY = dxAll / distAll;
        const arc = Math.sin(tCurve * Math.PI) * (16 + p.seed * 26) * p.spinDir;

        const nextX = lerp(p.sx, p.tx, ease) + perpX * arc;
        const nextY = lerp(p.sy, p.ty, ease) + perpY * arc;
        p.vx = (nextX - p.x) / Math.max(dt, 0.004);
        p.vy = (nextY - p.y) / Math.max(dt, 0.004);
        p.x = nextX;
        p.y = nextY;

        if (tCurve < 0.28) {
          p.glyphIdx = tCurve < 0.14 ? GLYPH_DOT : GLYPH_COLON;
          p.tone = TONE_MUTED;
          p.alpha = lerp(0.18, 0.56, tCurve / 0.28);
          p.sizeTier = 0;
        } else if (tCurve < 0.85) {
          p.glyphIdx = velocityGlyphIdx(p.vx, p.vy, p.vx * p.vx + p.vy * p.vy);
          p.tone = tCurve > 0.62 ? TONE_INK : TONE_SECONDARY;
          p.alpha = lerp(0.56, 0.84, (tCurve - 0.28) / 0.57);
          p.sizeTier = 0;
        } else {
          p.glyphIdx = p.seed > 0.5 ? GLYPH_STAR : GLYPH_PLUS;
          p.tone = TONE_ACCENT;
          p.alpha = 0.88;
          p.sizeTier = 1;
        }

        if (p.progress >= 1 || Math.hypot(p.tx - p.x, p.ty - p.y) < 3.5) {
          p.x = p.tx;
          p.y = p.ty;
          p.vx = 0;
          p.vy = 0;
          p.mode = MODE_LOCKED;
          p.age = 0;
          p.life = 0.2 + p.seed * 0.12;
          p.glyphIdx = p.seed > 0.72 ? GLYPH_AT : p.seed > 0.3 ? GLYPH_HASH : GLYPH_STAR;
          p.tone = TONE_ACCENT;
          p.sizeTier = 1;
          p.alpha = 0.92;
        }
        aliveSwarmCount++;
      } else if (p.mode === MODE_LOCKED) {
        const target = p.targetIdx >= 0 ? targets[p.targetIdx] : undefined;
        if (target) {
          resolveAnchorViewportCoords(target, p.subIdx, p.normX, p.normY, anchorScratch);
          p.x = anchorScratch.tx;
          p.y = anchorScratch.ty;
          if (target.currentP >= 0.97) {
            p.age += dt * 0.75; // Fade briskly once target is solid so body copy stays clear
          }
        }

        const k = clamp01(p.age / Math.max(0.05, p.life));
        if (k >= 1) {
          p.active = false;
          p.mode = MODE_DEAD;
          p.alpha = 0;
          continue;
        }

        if (k < 0.24) {
          p.glyphIdx = p.seed > 0.75 ? GLYPH_HASH : GLYPH_STAR;
          p.tone = TONE_ACCENT;
          p.sizeTier = 1;
          p.alpha = 0.88;
        } else if (k < 0.58) {
          p.glyphIdx = GLYPH_PLUS;
          p.tone = TONE_INK;
          p.sizeTier = 0;
          p.alpha = lerp(0.75, 0.34, (k - 0.24) / 0.34);
        } else {
          p.glyphIdx = k < 0.8 ? GLYPH_COLON : GLYPH_DOT;
          p.tone = TONE_MUTED;
          p.sizeTier = 0;
          p.alpha = lerp(0.34, 0, (k - 0.58) / 0.42);
        }
        aliveSwarmCount++;
      } else if (p.mode === MODE_DISSOLVING) {
        const k = clamp01(p.age / Math.max(0.1, p.life));
        if (k >= 1 || p.y < -30) {
          p.active = false;
          p.mode = MODE_DEAD;
          p.alpha = 0;
          continue;
        }

        const phase = p.age * 7.2 * p.spinDir + p.seed * 6.283185;
        p.vx += Math.cos(phase) * 260 * dt;
        p.vy += (Math.sin(phase) * 90 - 155) * dt;
        if (isScrollingUp) {
          p.vx += (widthCss * 0.5 - p.x) * heroPullStrength * dt;
          p.vy -= 120 * dt;
        }
        if (p.vy > -28) p.vy = -28;

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (k < 0.16) {
          p.glyphIdx = p.seed > 0.5 ? GLYPH_HASH : GLYPH_STAR;
          p.tone = TONE_ACCENT;
          p.sizeTier = 1;
          p.alpha = 0.82;
        } else if (k < 0.65) {
          p.glyphIdx = velocityGlyphIdx(p.vx, p.vy, p.vx * p.vx + p.vy * p.vy);
          p.tone = TONE_INK;
          p.sizeTier = 0;
          p.alpha = lerp(0.72, 0.28, (k - 0.16) / 0.49);
        } else {
          p.glyphIdx = k < 0.84 ? GLYPH_COLON : GLYPH_DOT;
          p.tone = TONE_MUTED;
          p.sizeTier = 0;
          p.alpha = lerp(0.28, 0, (k - 0.65) / 0.35);
        }
        aliveSwarmCount++;
      }
    }

    // ── Phase 4: Connected Scroll Spine & 24 ambient carrier bots ─────────
    const railX = 26;
    const railTop = 84;
    const railBottom = Math.max(railTop + 80, vh - 36);
    const railLen = Math.max(1, railBottom - railTop);
    const maxScroll = Math.max(1, docScrollHeight - vh);
    const docProgress = clamp01(scrollY / maxScroll);
    const beaconY = railTop + docProgress * railLen;

    if (showSpine) {
      const heroOriginY = clamp(heroBottom, railTop, beaconY);
      const bridgeTop = Math.min(railTop, heroOriginY);
      const bridgeBottom = Math.max(beaconY, clamp(activeSectionMidY, railTop + 24, railBottom));
      const bridgeSpan = Math.max(48, bridgeBottom - bridgeTop);
      const velBias = clamp(scrollVel * 0.00028, -0.55, 0.55);

      for (let s = 0; s < SPINE_BOT_COUNT; s++) {
        const p = particles[SWARM_POOL_COUNT + s]!;
        p.active = true;
        p.mode = MODE_SPINE;
        p.age += dt;

        // Ambient carrier flow: drifts downward with scroll down, pulls toward #hero on scroll up
        const baseFlow = 0.045 + p.seed * 0.04;
        const dirFlow = scrollVel < -20 ? -Math.abs(baseFlow) + velBias : baseFlow + velBias;
        p.spineT = (((p.spineT + dirFlow * dt) % 1) + 1) % 1;

        const targetY = bridgeTop + p.spineT * bridgeSpan;
        const nearActive = Math.exp(-Math.pow((targetY - activeSectionMidY) / 70, 2));
        const sway = Math.sin(p.age * 1.8 + p.seed * 6.283) * 5;
        const bridgeArc = nearActive * (6 + p.seed * 12);
        const targetX = railX + sway + bridgeArc;

        p.vx = (targetX - p.x) / Math.max(dt, 0.004);
        p.vy = (targetY - p.y) / Math.max(dt, 0.004);
        p.x = targetX;
        p.y = targetY;

        const nearBeacon = Math.exp(-Math.pow((p.y - beaconY) / 48, 2));
        p.alpha = (0.14 + nearBeacon * 0.26 + nearActive * 0.1) * masterAlpha;
        p.tone = nearBeacon > 0.55 ? TONE_INK : TONE_MUTED;
        if (Math.abs(scrollVel) > 120) {
          p.glyphIdx = scrollVel < 0 ? GLYPH_PIPE : GLYPH_COLON;
        } else {
          p.glyphIdx = nearBeacon > 0.6 ? GLYPH_PLUS : nearBeacon > 0.25 ? GLYPH_COLON : GLYPH_DOT;
        }
        p.sizeTier = 0;
      }
    }

    // ── Phase 5: Canvas Draw (pure monochrome, zero allocations) ──────────
    if (!ctx) return;

    if (masterAlpha <= 0.001) {
      clearCanvas();
      idleFrames = anyTransitioning ? 0 : idleFrames + 1;
      if (idleFrames < 4 || anyTransitioning) {
        rafId = requestAnimationFrame(stepAndRender);
      }
      return;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, widthCss, heightCss);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let currentTier = -1;
    let currentStyle = "";

    const setDrawState = (tier: number, tone: number, alpha: number): void => {
      if (tier !== currentTier) {
        currentTier = tier;
        ctx.font = tier === 2 ? FONT_15 : tier === 1 ? FONT_14 : FONT_13;
      }
      const bucket = Math.max(
        0,
        Math.min(ALPHA_STEPS - 1, Math.round(clamp01(alpha) * (ALPHA_STEPS - 1))),
      );
      const style = colorLut[tone * ALPHA_STEPS + bucket] ?? colorLut[0]!;
      if (style !== currentStyle) {
        currentStyle = style;
        ctx.fillStyle = style;
      }
    };

    // Draw subtle vertical rail & scroll-head beacon on wide viewports
    if (showSpine) {
      const tickStep = 22;
      for (let ry = railTop; ry <= railBottom; ry += tickStep) {
        const dist = Math.abs(ry - beaconY);
        const proximity = Math.exp(-(dist * dist) / 2800);
        const railAlpha = (0.09 + proximity * 0.24) * masterAlpha;
        if (railAlpha < 0.02) continue;
        const ch = proximity > 0.65 ? "|" : proximity > 0.25 ? ":" : "\u00b7";
        setDrawState(0, proximity > 0.5 ? TONE_SECONDARY : TONE_MUTED, railAlpha);
        ctx.fillText(ch, railX, ry);
      }

      // Flanking beacon ticks
      const speedBoost = clamp01(Math.abs(scrollVel) / 1400);
      const beaconAlpha = (0.58 + speedBoost * 0.34) * masterAlpha;
      setDrawState(0, TONE_SECONDARY, beaconAlpha * 0.65);
      if (beaconY - 12 >= railTop - 4) ctx.fillText(":", railX, beaconY - 12);
      if (beaconY + 12 <= railBottom + 4) ctx.fillText(":", railX, beaconY + 12);

      // Glowing scroll-head beacon glyph
      const beaconGlyph =
        speedBoost > 0.25 ? "@" : Math.sin(nowMs * 0.004) > 0 ? "*" : "+";
      setDrawState(2, TONE_ACCENT, beaconAlpha);
      ctx.fillText(beaconGlyph, railX, beaconY);
    }

    // Draw active swarm & spine carrier bots
    const maxDrawIdx = showSpine ? POOL_SIZE : SWARM_POOL_COUNT;
    for (let i = 0; i < maxDrawIdx; i++) {
      const p = particles[i]!;
      if (!p.active) continue;
      const a = p.mode === MODE_SPINE ? p.alpha : p.alpha * masterAlpha;
      if (a <= 0.025) continue;
      const glyph = GLYPHS[p.glyphIdx] ?? "\u00b7";
      setDrawState(p.sizeTier, p.tone, a);
      ctx.fillText(glyph, p.x, p.y);
    }

    ctx.restore();

    const shouldContinue =
      showSpine || anyTransitioning || aliveSwarmCount > 0 || Math.abs(scrollVel) > 2;
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

  const wakeLoop = (): void => {
    if (destroyed || reducedMotion || !isPageVisible) return;
    idleFrames = 0;
    if (rafId === null) {
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(stepAndRender);
    }
  };

  const onScroll = (): void => {
    wakeLoop();
  };

  const onResize = (): void => {
    syncCanvasSize();
    if (reducedMotion) {
      setAllTargetsSolid();
      clearCanvas();
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
    buildColorLut(theme, colorLut);
    if (!reducedMotion) wakeLoop();
  });

  const stopMotion = observeReducedMotion((nextReduced) => {
    reducedMotion = nextReduced;
    if (reducedMotion) {
      stopLoop();
      setAllTargetsSolid();
      clearSwarmParticles();
      clearCanvas();
    } else {
      prevScrollY = window.scrollY;
      scrollVel = 0;
      initializeMountProgress();
      wakeLoop();
    }
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  syncCanvasSize();
  initializeMountProgress();

  if (!reducedMotion && isPageVisible) {
    lastFrameMs = performance.now();
    rafId = requestAnimationFrame(stepAndRender);
  }

  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (!destroyed && !reducedMotion) {
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
      clearSwarmParticles();
      clearCanvas();
      for (let i = 0; i < targets.length; i++) {
        const el = targets[i]!.el;
        el.style.removeProperty("--asm");
        delete el.dataset.asmState;
      }
    },
  };
}
