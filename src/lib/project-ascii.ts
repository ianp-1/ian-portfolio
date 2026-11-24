import {
  ATLAS_SPEC,
  CHARSET_FONT_STACK,
  isReducedMotionPreferred,
  mixRgb,
  observeDataTheme,
  observeReducedMotion,
  resolveThemeColors,
  rgbToCss,
  type ThemeColors,
} from "./ascii-atlas";

export type ProjectSpecimenId = "nadir" | "canopy" | "obscurafy";

export interface ProjectAsciiHandle {
  setProject: (id: ProjectSpecimenId) => void;
  destroy: () => void;
}

export interface HorizonAsciiHandle {
  destroy: () => void;
}

interface CanvasLoopContext {
  widthCss: number;
  heightCss: number;
  dpr: number;
  timeSec: number;
  reducedMotion: boolean;
  theme: ThemeColors;
  pointerX: number;
  pointerY: number;
  pointerActive: number;
}

interface CanvasLoopController {
  requestRedraw: () => void;
  destroy: () => void;
}

const STATIC_SPECIMEN_TIME = 2.4;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function mountCanvasLoop(
  canvas: HTMLCanvasElement,
  draw: (ctx: CanvasRenderingContext2D, state: CanvasLoopContext) => void,
  onTickExtra?: (dt: number) => void,
): CanvasLoopController {
  const ctx = canvas.getContext("2d");
  let destroyed = false;
  let reducedMotion = isReducedMotionPreferred();
  let isVisible = true;
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;
  let theme = resolveThemeColors();

  let widthCss = 320;
  let heightCss = 180;
  let dpr = 1;
  let timeSec = reducedMotion ? STATIC_SPECIMEN_TIME : 0;
  let rafId: number | null = null;
  let lastFrameMs = 0;

  let pointerX = 0.5;
  let pointerY = 0.5;
  let pointerActive = 0;
  let pointerActiveTarget = 0;

  const syncSize = () => {
    const rect = canvas.getBoundingClientRect();
    widthCss = Math.max(1, rect.width || canvas.clientWidth || 320);
    heightCss = Math.max(1, rect.height || canvas.clientHeight || 180);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextW = Math.max(1, Math.round(widthCss * dpr));
    const nextH = Math.max(1, Math.round(heightCss * dpr));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
  };

  const renderNow = () => {
    if (destroyed || !ctx) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, widthCss, heightCss);
    draw(ctx, {
      widthCss,
      heightCss,
      dpr,
      timeSec,
      reducedMotion,
      theme,
      pointerX,
      pointerY,
      pointerActive,
    });
    ctx.restore();
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
    timeSec += dt;
    pointerActive += (pointerActiveTarget - pointerActive) * (1 - Math.exp(-dt * 8));
    onTickExtra?.(dt);
    renderNow();
    rafId = requestAnimationFrame(tick);
  };

  const startOrDrawStatic = () => {
    if (destroyed) return;
    if (reducedMotion || !isVisible || !isPageVisible) {
      stopLoop();
      if (reducedMotion && isVisible) renderNow();
      return;
    }
    if (rafId === null) {
      lastFrameMs = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointerX = clamp01((e.clientX - rect.left) / rect.width);
    pointerY = clamp01((e.clientY - rect.top) / rect.height);
    pointerActiveTarget = 1;
    if (reducedMotion) renderNow();
  };

  const onPointerLeave = () => {
    pointerActiveTarget = 0;
    if (reducedMotion) renderNow();
  };

  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      syncSize();
      renderNow();
    });
    resizeObserver.observe(canvas);
  }
  window.addEventListener("resize", syncSize, { passive: true });

  let intersectionObserver: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== "undefined") {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isVisible = entry.isIntersecting;
        startOrDrawStatic();
      },
      { threshold: 0.01 },
    );
    intersectionObserver.observe(canvas);
  }

  const onVisibility = () => {
    isPageVisible = !document.hidden;
    startOrDrawStatic();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const stopTheme = observeDataTheme(() => {
    theme = resolveThemeColors();
    renderNow();
  });

  const stopMotion = observeReducedMotion((nextReduced) => {
    reducedMotion = nextReduced;
    if (reducedMotion) {
      timeSec = STATIC_SPECIMEN_TIME;
      stopLoop();
      renderNow();
    } else {
      startOrDrawStatic();
    }
  });

  syncSize();
  renderNow();
  startOrDrawStatic();

  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (!destroyed) renderNow();
    });
  }

  return {
    requestRedraw: () => {
      if (!destroyed) renderNow();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", syncSize);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      stopTheme();
      stopMotion();
    },
  };
}

function drawNadirSpecimen(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  state: CanvasLoopContext,
  alphaScale: number,
): void {
  const { timeSec, theme, pointerX, pointerY, pointerActive } = state;
  const aspect = (cols * cellW) / Math.max(1, rows * cellH);
  const ramp = ATLAS_SPEC.asciiRamp;
  const braille = ATLAS_SPEC.brailleRamp;

  const yaw = timeSec * 0.45 + (pointerX - 0.5) * pointerActive * 0.8;
  const pitch = 0.28 + (pointerY - 0.5) * pointerActive * 0.45;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const radius = 0.72;
  const scanLon = ((timeSec * 0.32) % 1) * Math.PI * 2 - Math.PI;

  for (let row = 0; row < rows; row++) {
    const ny = (row + 0.5) / rows;
    const py = -(ny * 2 - 1);

    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols;
      const px = (nx * 2 - 1) * aspect;

      // Telemetry corner brackets & equatorial reticle ticks
      const isCornerH = (row === 1 || row === rows - 2) && (col === 2 || col === 3 || col === cols - 4 || col === cols - 3);
      const isCornerV = (row === 2 || row === rows - 3) && (col === 2 || col === cols - 3);
      if (isCornerH || isCornerV) {
        ctx.fillStyle = rgbToCss(theme.muted, 0.7 * alphaScale);
        ctx.fillText(isCornerH ? "-" : "|", (col + 0.5) * cellW, (row + 0.52) * cellH);
        continue;
      }

      const d2 = px * px + py * py;
      if (d2 > radius * radius) {
        // Outer orbital telemetry ring & crosshairs
        const dist = Math.sqrt(d2);
        const onOuterRing = Math.abs(dist - 0.87) < 0.032;
        const onCrosshair =
          (Math.abs(px) < 0.04 && Math.abs(Math.abs(py) - 0.84) < 0.07) ||
          (Math.abs(py) < 0.04 && Math.abs(Math.abs(px) - 0.84) < 0.07);

        if (onCrosshair) {
          ctx.fillStyle = rgbToCss(theme.accent, 0.85 * alphaScale);
          ctx.fillText("+", (col + 0.5) * cellW, (row + 0.52) * cellH);
        } else if (onOuterRing) {
          const ang = Math.atan2(py, px);
          const sweep = Math.exp(-Math.pow(Math.sin((ang - timeSec * 0.9) * 0.5), 2) * 10);
          const colRgb = mixRgb(theme.muted, theme.accent, sweep);
          const ch = braille[Math.min(braille.length - 1, 2 + Math.floor(sweep * 6))] ?? "\u2803";
          ctx.fillStyle = rgbToCss(colRgb, (0.35 + sweep * 0.6) * alphaScale);
          ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
        }
        continue;
      }

      const pz = Math.sqrt(Math.max(0, radius * radius - d2));
      const nx3 = px / radius;
      const ny3 = py / radius;
      const nz3 = pz / radius;

      // Rotate sphere coordinates
      const ry = ny3 * cosP - nz3 * sinP;
      const rz0 = ny3 * sinP + nz3 * cosP;
      const rx = nx3 * Math.cos(yaw) + rz0 * Math.sin(yaw);
      const rz = -nx3 * Math.sin(yaw) + rz0 * Math.cos(yaw);

      const lat = Math.asin(Math.max(-1, Math.min(1, ry)));
      const lon = Math.atan2(rx, rz);

      const latGrid = Math.abs((((lat / (Math.PI / 6)) % 1) + 1) % 1 - 0.5);
      const lonGrid = Math.abs((((lon / (Math.PI / 6)) % 1) + 1) % 1 - 0.5);
      const isGrid = latGrid < 0.09 || lonGrid < 0.09;

      // Subtle continent/terrain relief noise on sphere
      const terrain =
        Math.sin(lon * 3.1 + 0.4) * Math.cos(lat * 3.4 - 0.2) +
        Math.sin(lon * 6.2 - lat * 4.5) * 0.45;
      const isLand = terrain > 0.22;

      // Sweeping nadir beam longitude distance (wrapped cleanly)
      let dLon = Math.abs(lon - scanLon);
      if (dLon > Math.PI) dLon = Math.PI * 2 - dLon;
      const onBeam = Math.exp(-Math.pow(dLon * 3.6, 2));
      const rim = Math.pow(1 - nz3, 2.2);

      // Center nadir crosshair lock
      const isCenterCross = Math.abs(px) < 0.045 && Math.abs(py) < 0.045;
      if (isCenterCross) {
        ctx.fillStyle = rgbToCss(theme.accent, 0.95 * alphaScale);
        ctx.fillText("+", (col + 0.5) * cellW, (row + 0.52) * cellH);
        continue;
      }

      const lum = clamp01(
        0.14 +
          (isGrid ? 0.34 : 0) +
          (isLand ? 0.24 : 0) +
          rim * 0.28 +
          onBeam * 0.45,
      );
      let ch = ramp[Math.min(ramp.length - 1, Math.floor(lum * ramp.length))] ?? ".";
      if (onBeam > 0.65 && !isGrid) {
        ch = braille[Math.min(braille.length - 1, Math.floor(3 + onBeam * 6))] ?? "\u283f";
      } else if (isGrid && !isLand && onBeam < 0.3) {
        ch = Math.abs(lat) < 0.14 ? "=" : ":";
      }

      const accentMix = clamp01(onBeam * 0.9 + (isGrid ? onBeam * 0.3 : 0));
      const base = mixRgb(theme.muted, theme.ink, clamp01(lum * 1.15));
      const color = mixRgb(base, theme.accent, accentMix);
      ctx.fillStyle = rgbToCss(color, (0.42 + lum * 0.58) * alphaScale);
      ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
    }
  }
}

function barometricPressure(x: number, y: number, t: number, px: number, py: number, pActive: number): number {
  const c1x = Math.sin(t * 0.38) * 0.52;
  const c1y = Math.cos(t * 0.31) * 0.34;
  const c2x = -0.45 + Math.cos(t * 0.27) * 0.32;
  const c2y = -0.2 + Math.sin(t * 0.34) * 0.32;

  const d1 = Math.hypot(x - c1x, y - c1y);
  const d2 = Math.hypot(x - c2x, y - c2y);

  let p = Math.exp(-d1 * d1 * 2.3) * 1.15 - Math.exp(-d2 * d2 * 2.8) * 0.85;
  p += Math.sin(x * 2.4 + t * 0.3) * Math.cos(y * 2.1 - t * 0.22) * 0.24;

  if (pActive > 0.01) {
    const dp = Math.hypot(x - px, y - py);
    p += Math.exp(-dp * dp * 3.2) * 0.55 * pActive;
  }
  return p;
}

const WIND_ARROWS = ["\u2192", "\u2197", "\u2191", "\u2196", "\u2190", "\u2199", "\u2193", "\u2198"] as const;

function drawCanopySpecimen(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  state: CanvasLoopContext,
  alphaScale: number,
): void {
  const { timeSec, theme, pointerX, pointerY, pointerActive } = state;
  const aspect = (cols * cellW) / Math.max(1, rows * cellH);
  const ptrX = (pointerX * 2 - 1) * aspect;
  const ptrY = -(pointerY * 2 - 1);
  const ramp = ATLAS_SPEC.asciiRamp;

  for (let row = 0; row < rows; row++) {
    const ny = (row + 0.5) / rows;
    const py = -(ny * 2 - 1);

    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols;
      const px = (nx * 2 - 1) * aspect;

      const p = barometricPressure(px, py, timeSec, ptrX, ptrY, pointerActive);
      const eps = 0.06;
      const gx =
        (barometricPressure(px + eps, py, timeSec, ptrX, ptrY, pointerActive) -
          barometricPressure(px - eps, py, timeSec, ptrX, ptrY, pointerActive)) /
        (2 * eps);
      const gy =
        (barometricPressure(px, py + eps, timeSec, ptrX, ptrY, pointerActive) -
          barometricPressure(px, py - eps, timeSec, ptrX, ptrY, pointerActive)) /
        (2 * eps);

      const gradMag = Math.hypot(gx, gy);
      const level = (((p * 4.5) % 1) + 1) % 1;
      const distToContour = Math.abs(level - 0.5);
      const isContour = distToContour < 0.14;
      const isVectorCell = col % 4 === 2 && row % 3 === 1;

      if (isVectorCell && gradMag > 0.18) {
        // Geostrophic flow runs roughly tangent to pressure gradient
        const flowX = -gy + gx * 0.25;
        const flowY = gx + gy * 0.25;
        const angle = Math.atan2(flowY, flowX);
        const octant = ((Math.round((angle / (Math.PI * 2)) * 8) % 8) + 8) % 8;
        const arrow = WIND_ARROWS[octant] ?? "\u2192";
        const stormIntensity = clamp01(gradMag * 0.52);
        const color = mixRgb(theme.ink, theme.accent, clamp01((stormIntensity - 0.35) * 1.4));
        ctx.fillStyle = rgbToCss(color, (0.55 + stormIntensity * 0.45) * alphaScale);
        ctx.fillText(arrow, (col + 0.5) * cellW, (row + 0.52) * cellH);
        continue;
      }

      if (!isContour && gradMag < 0.45) {
        continue;
      }

      const contourStrength = clamp01(1 - distToContour / 0.14);
      const pressurePeak = clamp01(Math.abs(p) * 0.85);
      const lum = clamp01(contourStrength * 0.65 + pressurePeak * 0.3);
      const ch = isContour
        ? ramp[Math.min(ramp.length - 1, 2 + Math.floor(lum * (ramp.length - 3)))] ?? "-"
        : ".";

      const accentMix = clamp01((pressurePeak - 0.42) * 1.6);
      const base = mixRgb(theme.muted, theme.ink, lum);
      const color = mixRgb(base, theme.accent, accentMix);
      ctx.fillStyle = rgbToCss(color, (0.3 + lum * 0.68) * alphaScale);
      ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
    }
  }
}

interface DetectorBox {
  minC: number;
  maxC: number;
  minR: number;
  maxR: number;
}

function drawObscurafySpecimen(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  state: CanvasLoopContext,
  alphaScale: number,
): void {
  const { timeSec, theme, pointerX, pointerY, pointerActive } = state;
  const aspect = (cols * cellW) / Math.max(1, rows * cellH);
  const ramp = ATLAS_SPEC.asciiRamp;
  const blocks = ATLAS_SPEC.blockRamp;
  const braille = ATLAS_SPEC.brailleRamp;

  // Dynamic optical bounding boxes tracking targets
  const boxes: DetectorBox[] = [
    {
      minC: Math.round(cols * (0.16 + Math.sin(timeSec * 0.55) * 0.08)),
      maxC: 0,
      minR: Math.round(rows * (0.2 + Math.cos(timeSec * 0.42) * 0.08)),
      maxR: 0,
    },
    {
      minC: Math.round(
        cols * (pointerActive > 0.2 ? pointerX - 0.14 : 0.54 + Math.cos(timeSec * 0.48) * 0.09),
      ),
      maxC: 0,
      minR: Math.round(
        rows * (pointerActive > 0.2 ? pointerY - 0.16 : 0.36 + Math.sin(timeSec * 0.61) * 0.12),
      ),
      maxR: 0,
    },
  ];

  const boxW0 = Math.max(8, Math.round(cols * 0.26));
  const boxH0 = Math.max(5, Math.round(rows * 0.38));
  const boxW1 = Math.max(7, Math.round(cols * 0.23));
  const boxH1 = Math.max(4, Math.round(rows * 0.34));

  const b0 = boxes[0];
  const b1 = boxes[1];
  if (b0) {
    b0.minC = Math.max(1, Math.min(cols - boxW0 - 2, b0.minC));
    b0.maxC = b0.minC + boxW0;
    b0.minR = Math.max(1, Math.min(rows - boxH0 - 2, b0.minR));
    b0.maxR = b0.minR + boxH0;
  }
  if (b1) {
    b1.minC = Math.max(1, Math.min(cols - boxW1 - 2, b1.minC));
    b1.maxC = b1.minC + boxW1;
    b1.minR = Math.max(1, Math.min(rows - boxH1 - 2, b1.minR));
    b1.maxR = b1.minR + boxH1;
  }

  const scrambleTick = Math.floor(timeSec * 6);

  for (let row = 0; row < rows; row++) {
    const ny = (row + 0.5) / rows;
    const py = -(ny * 2 - 1);

    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols;
      const px = (nx * 2 - 1) * aspect;

      // Check detector boxes first
      let frameGlyph: string | null = null;
      let insideBox = false;
      for (const box of boxes) {
        const onTop = row === box.minR && col >= box.minC && col <= box.maxC;
        const onBot = row === box.maxR && col >= box.minC && col <= box.maxC;
        const onLeft = col === box.minC && row >= box.minR && row <= box.maxR;
        const onRight = col === box.maxC && row >= box.minR && row <= box.maxR;

        if (onTop && onLeft) frameGlyph = "\u250c";
        else if (onTop && onRight) frameGlyph = "\u2510";
        else if (onBot && onLeft) frameGlyph = "\u2514";
        else if (onBot && onRight) frameGlyph = "\u2518";
        else if (onTop || onBot) frameGlyph = "\u2500";
        else if (onLeft || onRight) frameGlyph = "\u2502";
        else if (col > box.minC && col < box.maxC && row > box.minR && row < box.maxR) {
          insideBox = true;
        }
        if (frameGlyph) break;
      }

      if (frameGlyph) {
        ctx.fillStyle = rgbToCss(theme.accent, 0.95 * alphaScale);
        ctx.fillText(frameGlyph, (col + 0.5) * cellW, (row + 0.52) * cellH);
        continue;
      }

      if (insideBox) {
        // Dynamic privacy redaction blocks inside bounding boxes
        const hash = Math.abs(
          Math.sin(col * 12.9898 + row * 78.233 + scrambleTick * 3.17) * 43758.5453,
        ) % 1;
        const blockIdx = Math.min(blocks.length - 1, 1 + Math.floor(hash * (blocks.length - 1)));
        const ch = blocks[blockIdx] ?? "\u2592";
        const colColor = mixRgb(theme.ink, theme.accent, hash > 0.72 ? 0.65 : 0.15);
        ctx.fillStyle = rgbToCss(colColor, (0.55 + hash * 0.4) * alphaScale);
        ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
        continue;
      }

      // Underlying optical scene silhouettes (head-and-document geometric forms + scan waves)
      const silhouetteA = Math.exp(-Math.pow(Math.hypot(px + 0.48, py - 0.1) * 2.2, 2));
      const silhouetteB = Math.exp(-Math.pow(Math.max(Math.abs(px - 0.42), Math.abs(py + 0.08)) * 2.1, 2));
      const scanWave = Math.sin(px * 4.2 + py * 3.1 - timeSec * 1.1) * 0.5 + 0.5;
      const lum = clamp01(Math.max(silhouetteA, silhouetteB) * 0.78 + scanWave * 0.24);
      if (lum < 0.12) continue;

      const ch =
        lum > 0.55
          ? ramp[Math.min(ramp.length - 1, Math.floor(lum * ramp.length))] ?? "#"
          : braille[Math.min(braille.length - 1, Math.floor(lum * 7))] ?? "\u2803";

      const color = mixRgb(theme.muted, theme.ink, lum);
      ctx.fillStyle = rgbToCss(color, (0.28 + lum * 0.62) * alphaScale);
      ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
    }
  }
}

function drawSpecimenById(
  id: ProjectSpecimenId,
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  state: CanvasLoopContext,
  alphaScale: number,
): void {
  if (id === "nadir") {
    drawNadirSpecimen(ctx, cols, rows, cellW, cellH, state, alphaScale);
  } else if (id === "canopy") {
    drawCanopySpecimen(ctx, cols, rows, cellW, cellH, state, alphaScale);
  } else {
    drawObscurafySpecimen(ctx, cols, rows, cellW, cellH, state, alphaScale);
  }
}

export function mountProjectAscii(
  canvas: HTMLCanvasElement,
  initialProject: ProjectSpecimenId = "nadir",
): ProjectAsciiHandle {
  let activeProject: ProjectSpecimenId = initialProject;
  let prevProject: ProjectSpecimenId = initialProject;
  let transition = 1;

  const controller = mountCanvasLoop(
    canvas,
    (ctx, state) => {
      const cellW = state.widthCss < 340 ? 9.2 : 10;
      const cellH = state.widthCss < 340 ? 15 : 16;
      const cols = Math.max(20, Math.floor(state.widthCss / cellW));
      const rows = Math.max(10, Math.floor(state.heightCss / cellH));
      const actualCellW = state.widthCss / cols;
      const actualCellH = state.heightCss / rows;

      ctx.font = `500 ${Math.round(actualCellH * 0.84)}px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (prevProject !== activeProject && transition < 0.99) {
        drawSpecimenById(
          prevProject,
          ctx,
          cols,
          rows,
          actualCellW,
          actualCellH,
          state,
          1 - transition,
        );
        drawSpecimenById(
          activeProject,
          ctx,
          cols,
          rows,
          actualCellW,
          actualCellH,
          state,
          transition,
        );
      } else {
        drawSpecimenById(activeProject, ctx, cols, rows, actualCellW, actualCellH, state, 1);
      }
    },
    (dt) => {
      if (transition < 1) {
        transition = Math.min(1, transition + dt / 0.32);
        if (transition >= 1) {
          prevProject = activeProject;
        }
      }
    },
  );

  return {
    setProject: (id: ProjectSpecimenId) => {
      if (id === activeProject) return;
      if (isReducedMotionPreferred()) {
        prevProject = id;
        activeProject = id;
        transition = 1;
        controller.requestRedraw();
      } else {
        prevProject = activeProject;
        activeProject = id;
        transition = 0;
        controller.requestRedraw();
      }
    },
    destroy: () => {
      controller.destroy();
    },
  };
}

export function mountHorizonAscii(canvas: HTMLCanvasElement): HorizonAsciiHandle {
  const controller = mountCanvasLoop(canvas, (ctx, state) => {
    const { widthCss, heightCss, timeSec, theme, pointerX, pointerY, pointerActive } = state;
    const cellW = 10;
    const cellH = Math.max(13, heightCss / 4);
    const cols = Math.max(24, Math.floor(widthCss / cellW));
    const rows = Math.max(3, Math.min(5, Math.round(heightCss / cellH)));
    const actualCellW = widthCss / cols;
    const actualCellH = heightCss / rows;

    ctx.font = `500 ${Math.round(actualCellH * 0.8)}px ${CHARSET_FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const ramp = ATLAS_SPEC.asciiRamp;
    const braille = ATLAS_SPEC.brailleRamp;

    for (let row = 0; row < rows; row++) {
      const ny = (row + 0.5) / rows;
      for (let col = 0; col < cols; col++) {
        const nx = (col + 0.5) / cols;

        // Horizontal envelope so wave tapers smoothly at both edges
        const edgeFade = Math.sin(nx * Math.PI);
        const waveY =
          0.5 +
          Math.sin(nx * 7.5 - timeSec * 0.95) * 0.22 +
          Math.cos(nx * 14.0 + timeSec * 0.65) * 0.11;

        const ptrDistX = Math.abs(nx - pointerX);
        const ptrPull = Math.exp(-ptrDistX * ptrDistX * 36) * pointerActive;
        const localWaveY = waveY + (pointerY - 0.5) * 0.35 * ptrPull;

        const dist = Math.abs(ny - localWaveY);
        const ridge = Math.exp(-dist * dist * 16) * edgeFade;
        const secondary =
          Math.exp(-Math.pow(ny - (0.5 - Math.sin(nx * 5.2 + timeSec * 0.7) * 0.26), 2) * 18) *
          0.48 *
          edgeFade;

        const intensity = clamp01(ridge + secondary + ptrPull * 0.32 * edgeFade);
        if (intensity < 0.08) continue;

        const ch =
          intensity > 0.52
            ? ramp[Math.min(ramp.length - 1, Math.floor(intensity * ramp.length))] ?? "-"
            : braille[Math.min(braille.length - 1, 2 + Math.floor(intensity * 7))] ?? "\u2803";

        const accentMix = clamp01(ptrPull * 0.95 + Math.max(0, ridge - 0.68) * 1.4);
        const base = mixRgb(theme.muted, theme.ink, intensity);
        const color = mixRgb(base, theme.accent, accentMix);
        ctx.fillStyle = rgbToCss(color, 0.28 + intensity * 0.72);
        ctx.fillText(ch, (col + 0.5) * actualCellW, (row + 0.52) * actualCellH);
      }
    }
  });

  return {
    destroy: () => {
      controller.destroy();
    },
  };
}
