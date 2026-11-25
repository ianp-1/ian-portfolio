export interface ThemeRgb {
  r: number;
  g: number;
  b: number;
}

export interface ThemeColors {
  paper: ThemeRgb;
  surface: ThemeRgb;
  ink: ThemeRgb;
  muted: ThemeRgb;
  line: ThemeRgb;
  accent: ThemeRgb;
  accentInk: ThemeRgb;
  accentSecondary: ThemeRgb;
  isDark: boolean;
}

export interface AtlasSpec {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  asciiRamp: string;
  edgeRamp: string;
  brailleRamp: string;
  blockRamp: string;
  rowAscii: number;
  rowEdge: number;
  rowBraille: number;
  rowBlock: number;
}

export const ATLAS_SPEC: AtlasSpec = {
  cols: 16,
  rows: 4,
  cellW: 40,
  cellH: 60,
  asciiRamp: " .:-=+*#%@",
  edgeRamp: "|/-\\",
  brailleRamp: " \u2800\u2801\u2803\u2807\u280f\u281f\u283f\u287f\u28ff",
  blockRamp: " \u2591\u2592\u2593\u2588",
  rowAscii: 0,
  rowEdge: 1,
  rowBraille: 2,
  rowBlock: 3,
};

export const CHARSET_FONT_STACK =
  '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const LIGHT_DEFAULTS: Record<keyof Omit<ThemeColors, "isDark">, string> = {
  paper: "rgb(250, 250, 250)",
  surface: "rgb(242, 242, 242)",
  ink: "rgb(10, 10, 10)",
  muted: "rgb(92, 92, 92)",
  line: "rgb(224, 224, 224)",
  accent: "rgb(10, 10, 10)",
  accentInk: "rgb(250, 250, 250)",
  accentSecondary: "rgb(82, 82, 82)",
};

const DARK_DEFAULTS: Record<keyof Omit<ThemeColors, "isDark">, string> = {
  paper: "rgb(8, 8, 8)",
  surface: "rgb(16, 16, 16)",
  ink: "rgb(245, 245, 245)",
  muted: "rgb(138, 138, 138)",
  line: "rgb(34, 34, 34)",
  accent: "rgb(255, 255, 255)",
  accentInk: "rgb(8, 8, 8)",
  accentSecondary: "rgb(176, 176, 176)",
};

let probeCanvas: HTMLCanvasElement | null = null;
let probeCtx: CanvasRenderingContext2D | null = null;

function getProbeContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!probeCanvas) {
    probeCanvas = document.createElement("canvas");
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
  }
  return probeCtx;
}

/**
 * Resolves any CSS color string (including oklch, oklab, color(), rgb, hex)
 * into normalized 0..1 RGB via a 1x1 offscreen 2D canvas.
 */
export function parseCssColorToRgb(colorValue: string, fallbackColor: string): ThemeRgb {
  const ctx = getProbeContext();
  if (!ctx) {
    return parseFallbackRgb(fallbackColor);
  }
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = fallbackColor;
  if (colorValue) {
    ctx.fillStyle = colorValue;
  }
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return {
    r: (data[0] ?? 0) / 255,
    g: (data[1] ?? 0) / 255,
    b: (data[2] ?? 0) / 255,
  };
}

function parseFallbackRgb(rgbStr: string): ThemeRgb {
  const parts = rgbStr.match(/\d+/g);
  if (!parts || parts.length < 3) return { r: 0, g: 0, b: 0 };
  return {
    r: Number(parts[0]) / 255,
    g: Number(parts[1]) / 255,
    b: Number(parts[2]) / 255,
  };
}

export function rgbToCss(rgb: ThemeRgb, alpha = 1): string {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  if (alpha >= 0.999) {
    return `rgb(${r}, ${g}, ${b})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

export function mixRgb(a: ThemeRgb, b: ThemeRgb, t: number): ThemeRgb {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

export function resolveThemeColors(): ThemeColors {
  const root = document.documentElement;
  const themeAttr = root.getAttribute("data-theme");
  const isDark = themeAttr === "dark" || themeAttr === null;
  const defaults = isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS;
  const styles = getComputedStyle(root);

  const readToken = (varName: string, fallback: string): ThemeRgb => {
    const raw = styles.getPropertyValue(varName).trim();
    return parseCssColorToRgb(raw, fallback);
  };

  return {
    paper: readToken("--paper", defaults.paper),
    surface: readToken("--surface", defaults.surface),
    ink: readToken("--ink", defaults.ink),
    muted: readToken("--muted", defaults.muted),
    line: readToken("--line", defaults.line),
    accent: readToken("--accent", defaults.accent),
    accentInk: readToken("--accent-ink", defaults.accentInk),
    accentSecondary: readToken("--accent-secondary", defaults.accentSecondary),
    isDark,
  };
}

export function isReducedMotionPreferred(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function observeReducedMotion(onChange: (reduced: boolean) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = () => onChange(mq.matches);
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

export function observeDataTheme(onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined") {
    return () => {};
  }
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === "data-theme") {
        onChange();
        break;
      }
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function drawBrailleFallback(
  ctx: CanvasRenderingContext2D,
  codePoint: number,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): void {
  const mask = codePoint - 0x2800;
  if (mask <= 0) return;

  const dotBits: ReadonlyArray<readonly [number, number, number]> = [
    [0x01, 0, 0],
    [0x02, 0, 1],
    [0x04, 0, 2],
    [0x08, 1, 0],
    [0x10, 1, 1],
    [0x20, 1, 2],
    [0x40, 0, 3],
    [0x80, 1, 3],
  ];

  const radius = Math.max(2, Math.min(cellW, cellH) * 0.085);
  const padX = cellW * 0.31;
  const padY = cellH * 0.19;
  const stepX = cellW - padX * 2;
  const stepY = (cellH - padY * 2) / 3;

  ctx.fillStyle = "#ffffff";
  for (const [bit, col, row] of dotBits) {
    if ((mask & bit) === 0) continue;
    const cx = cellX + padX + col * stepX;
    const cy = cellY + padY + row * stepY;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBlockFallback(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): void {
  const padX = Math.floor(cellW * 0.08);
  const padY = Math.floor(cellH * 0.08);
  const w = cellW - padX * 2;
  const h = cellH - padY * 2;
  const x0 = cellX + padX;
  const y0 = cellY + padY;

  let density = 1.0;
  if (glyph === "\u2591") density = 0.25;
  else if (glyph === "\u2592") density = 0.5;
  else if (glyph === "\u2593") density = 0.78;
  else if (glyph === "\u2588") density = 1.0;
  else return;

  ctx.fillStyle = "#ffffff";
  if (density >= 0.99) {
    ctx.fillRect(x0, y0, w, h);
    return;
  }

  const step = 8;
  const dotSize = density > 0.6 ? 5 : 4;
  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      const col = Math.floor(px / step);
      const row = Math.floor(py / step);
      if (density < 0.35 && ((col + row) & 1) !== 0) continue;
      if (density >= 0.35 && density < 0.65 && (col & 1) !== (row & 1)) continue;
      ctx.fillRect(x0 + px, y0 + py, dotSize, dotSize);
    }
  }
}

function cellHasDrawnPixels(
  ctx: CanvasRenderingContext2D,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
): boolean {
  const data = ctx.getImageData(cellX, cellY, cellW, cellH).data;
  for (let i = 3; i < data.length; i += 16) {
    if ((data[i] ?? 0) > 10) return true;
  }
  return false;
}

/**
 * Renders the 4-band glyph texture atlas onto a 2D canvas:
 *  - Row 0: ASCII luminance ramp (" .:-=+*#%@")
 *  - Row 1: Directional edge glyphs ("|/-\\")
 *  - Row 2: Unicode Braille ramp
 *  - Row 3: Block elements ramp (" ░▒▓█")
 */
export function buildGlyphAtlasCanvas(existing?: HTMLCanvasElement): HTMLCanvasElement {
  const { cols, rows, cellW, cellH, asciiRamp, edgeRamp, brailleRamp, blockRamp } = ATLAS_SPEC;
  const canvas = existing ?? document.createElement("canvas");
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";

  const drawBand = (chars: string, row: number, fontSizePx: number, isBlock = false) => {
    ctx.font = `500 ${fontSizePx}px ${CHARSET_FONT_STACK}`;
    for (let col = 0; col < chars.length; col++) {
      const ch = chars[col] ?? " ";
      if (ch === " " || ch === "\u2800") continue;

      const x = col * cellW;
      const y = row * cellH;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cellW, cellH);
      ctx.clip();

      ctx.fillText(ch, x + cellW * 0.5, y + cellH * 0.52);
      if (!cellHasDrawnPixels(ctx, x, y, cellW, cellH)) {
        if (isBlock) {
          drawBlockFallback(ctx, ch, x, y, cellW, cellH);
        } else {
          const code = ch.charCodeAt(0);
          if (code >= 0x2800 && code <= 0x28ff) {
            drawBrailleFallback(ctx, code, x, y, cellW, cellH);
          }
        }
      }

      ctx.restore();
    }
  };

  drawBand(asciiRamp, ATLAS_SPEC.rowAscii, 42);
  drawBand(edgeRamp, ATLAS_SPEC.rowEdge, 44);
  drawBand(brailleRamp, ATLAS_SPEC.rowBraille, 44);
  drawBand(blockRamp, ATLAS_SPEC.rowBlock, 44, true);

  return canvas;
}
