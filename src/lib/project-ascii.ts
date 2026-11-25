import {
  CHARSET_FONT_STACK,
  isReducedMotionPreferred,
  mixRgb,
  observeDataTheme,
  observeReducedMotion,
  resolveThemeColors,
  rgbToCss,
} from "./ascii-atlas";

export interface DestroyableHandle {
  destroy: () => void;
}

export interface OscilloscopeHandle {
  setRoleIndex: (idx: number) => void;
  setScrollProgress: (norm: number) => void;
  setHoverCallback: (cb: (idx: number) => void) => void;
  destroy: () => void;
}

type ThemeColors = ReturnType<typeof resolveThemeColors>;
type ThemeRgb = ThemeColors["paper"];

interface LoopState {
  widthCss: number;
  heightCss: number;
  dpr: number;
  timeSec: number;
  reducedMotion: boolean;
  theme: ThemeColors;
  pointerX: number;
  pointerY: number;
  pointerActive: number;
  isDragging: boolean;
}

interface LoopHandlers {
  onUpdate?: (dt: number, state: LoopState) => void;
  onPointerDown?: (normX: number, normY: number, pxX: number, pxY: number, state: LoopState) => void;
  onPointerMove?: (
    normX: number,
    normY: number,
    dxPx: number,
    dyPx: number,
    dt: number,
    state: LoopState,
  ) => void;
  onPointerUp?: (
    normX: number,
    normY: number,
    pxX: number,
    pxY: number,
    dragDistPx: number,
    state: LoopState,
  ) => void;
  onPointerLeave?: (state: LoopState) => void;
}

interface LoopController {
  requestRedraw: () => void;
  destroy: () => void;
}

const ASCII_RAMP = " .:-=+*#%@";
const BRAILLE_RAMP = " \u2800\u2801\u2803\u2807\u280f\u281f\u283f\u287f\u28ff";
const BLOCK_RAMP = "\u2591\u2592\u2593\u2588";
const WIND_ARROWS = [
  "\u2192",
  "\u2197",
  "\u2191",
  "\u2196",
  "\u2190",
  "\u2199",
  "\u2193",
  "\u2198",
] as const;

const STATIC_TIME_SEC = 2.6;
const HUD_FONT_PX = 13;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function hash01(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function mountCanvasLoop(
  canvas: HTMLCanvasElement,
  draw: (ctx: CanvasRenderingContext2D, state: LoopState) => void,
  handlers?: LoopHandlers,
): LoopController {
  const ctx = canvas.getContext("2d");
  let destroyed = false;
  let reducedMotion = isReducedMotionPreferred();
  let isVisible = true;
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;
  let theme = resolveThemeColors();

  let widthCss = 320;
  let heightCss = 180;
  let dpr = 1;
  let timeSec = reducedMotion ? STATIC_TIME_SEC : 0;
  let rafId: number | null = null;
  let lastFrameMs = 0;

  let pointerX = 0.5;
  let pointerY = 0.5;
  let pointerActive = 0;
  let pointerActiveTarget = 0;
  let isDragging = false;
  let activePointerId: number | null = null;
  let lastClientX = 0;
  let lastClientY = 0;
  let lastMoveMs = 0;
  let totalDragDist = 0;

  const currentState = (): LoopState => ({
    widthCss,
    heightCss,
    dpr,
    timeSec,
    reducedMotion,
    theme,
    pointerX,
    pointerY,
    pointerActive,
    isDragging,
  });

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
    draw(ctx, currentState());
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
    pointerActive += (pointerActiveTarget - pointerActive) * (1 - Math.exp(-dt * 9));
    const st = currentState();
    handlers?.onUpdate?.(dt, st);
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

  const toCanvasCoords = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const pxX = e.clientX - rect.left;
    const pxY = e.clientY - rect.top;
    return {
      pxX,
      pxY,
      normX: clamp01(pxX / w),
      normY: clamp01(pxY / h),
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (destroyed) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const { pxX, pxY, normX, normY } = toCanvasCoords(e);
    pointerX = normX;
    pointerY = normY;
    pointerActiveTarget = 1;
    pointerActive = 1;
    isDragging = true;
    activePointerId = e.pointerId;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    lastMoveMs = performance.now();
    totalDragDist = 0;

    handlers?.onPointerDown?.(normX, normY, pxX, pxY, currentState());
    if (reducedMotion) renderNow();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (destroyed) return;
    if (isDragging && activePointerId !== null && e.pointerId !== activePointerId) return;
    const { normX, normY } = toCanvasCoords(e);
    const now = performance.now();
    const dt = lastMoveMs > 0 ? Math.max(0.004, Math.min(0.1, (now - lastMoveMs) / 1000)) : 0.016;
    const dxPx = lastMoveMs > 0 ? e.clientX - lastClientX : 0;
    const dyPx = lastMoveMs > 0 ? e.clientY - lastClientY : 0;
    if (isDragging) {
      totalDragDist += Math.hypot(dxPx, dyPx);
    }
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    lastMoveMs = now;
    pointerX = normX;
    pointerY = normY;
    pointerActiveTarget = 1;
    if (reducedMotion) pointerActive = 1;

    handlers?.onPointerMove?.(normX, normY, dxPx, dyPx, dt, currentState());
    if (reducedMotion) renderNow();
  };

  const finishPointer = (e: PointerEvent, cancelled: boolean) => {
    if (destroyed) return;
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    const { pxX, pxY, normX, normY } = toCanvasCoords(e);
    isDragging = false;
    activePointerId = null;
    if (!cancelled) {
      handlers?.onPointerUp?.(normX, normY, pxX, pxY, totalDragDist, currentState());
    }
    if (reducedMotion) renderNow();
  };

  const onPointerUp = (e: PointerEvent) => finishPointer(e, false);
  const onPointerCancel = (e: PointerEvent) => finishPointer(e, true);

  const onPointerLeave = () => {
    if (isDragging) return;
    pointerActiveTarget = 0;
    if (reducedMotion) pointerActive = 0;
    handlers?.onPointerLeave?.(currentState());
    if (reducedMotion) renderNow();
  };

  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerCancel, { passive: true });

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      syncSize();
      renderNow();
    });
    resizeObserver.observe(canvas);
  }
  window.addEventListener("resize", syncSize, { passive: true });

  // Attach directly to the container with content-visibility: auto because
  // contentvisibilityautostatechange does not bubble in some browsers.
  const cvTarget = canvas.closest<HTMLElement>(".work-exhibit");
  const supportsContentVisibility =
    typeof document !== "undefined" &&
    "contentVisibility" in document.documentElement.style &&
    cvTarget !== null;

  let intersectionObserver: IntersectionObserver | null = null;
  let onContentVisibility: ((event: Event) => void) | null = null;

  if (supportsContentVisibility && cvTarget) {
    onContentVisibility = (event: Event) => {
      const cvEvent = event as Event & { skipped?: boolean };
      isVisible = !cvEvent.skipped;
      if (isVisible) {
        syncSize();
        renderNow();
      }
      startOrDrawStatic();
    };
    cvTarget.addEventListener("contentvisibilityautostatechange", onContentVisibility);
  } else if (typeof IntersectionObserver !== "undefined") {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isVisible = entry.isIntersecting;
        startOrDrawStatic();
      },
      { rootMargin: "200px" },
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
      timeSec = STATIC_TIME_SEC;
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
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("resize", syncSize);
      document.removeEventListener("visibilitychange", onVisibility);
      if (cvTarget && onContentVisibility) {
        cvTarget.removeEventListener(
          "contentvisibilityautostatechange",
          onContentVisibility,
        );
      }
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      stopTheme();
      stopMotion();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 1. NADIR EXHIBIT: Spinnable 3D ASCII Earth & Quorum Nodes                   */
/* -------------------------------------------------------------------------- */

interface DisasterNode {
  id: string;
  label: string;
  lat: number;
  lon: number;
  wx: number;
  wy: number;
  wz: number;
  status: string;
}

function makeSpherePoint(lat: number, lon: number): { wx: number; wy: number; wz: number } {
  const cosLat = Math.cos(lat);
  return {
    wx: cosLat * Math.sin(lon),
    wy: Math.sin(lat),
    wz: cosLat * Math.cos(lon),
  };
}

const CONTINENT_LOBES: ReadonlyArray<{
  wx: number;
  wy: number;
  wz: number;
  width: number;
  weight: number;
}> = [
  { ...makeSpherePoint(0.76, -1.75), width: 0.27, weight: 0.95 }, // North America
  { ...makeSpherePoint(0.36, -1.56), width: 0.06, weight: 0.72 }, // Mesoamerica
  { ...makeSpherePoint(-0.26, -1.1), width: 0.19, weight: 0.96 }, // South America
  { ...makeSpherePoint(-0.62, -1.18), width: 0.09, weight: 0.78 }, // Southern Cone / Andes
  { ...makeSpherePoint(0.86, 0.28), width: 0.14, weight: 0.88 }, // Europe
  { ...makeSpherePoint(0.14, 0.34), width: 0.23, weight: 0.96 }, // Africa
  { ...makeSpherePoint(-0.32, 0.42), width: 0.1, weight: 0.82 }, // Southern Africa
  { ...makeSpherePoint(0.82, 1.48), width: 0.34, weight: 0.98 }, // Eurasia
  { ...makeSpherePoint(0.42, 1.38), width: 0.12, weight: 0.85 }, // South Asia
  { ...makeSpherePoint(0.58, 2.08), width: 0.14, weight: 0.86 }, // East Asia
  { ...makeSpherePoint(-0.44, 2.34), width: 0.11, weight: 0.9 }, // Australia
  { ...makeSpherePoint(1.22, -0.72), width: 0.07, weight: 0.86 }, // Greenland
];

const NADIR_NODES: ReadonlyArray<DisasterNode> = [
  {
    id: "pacific",
    label: "Pacific",
    lat: 0.28,
    lon: 2.66,
    ...makeSpherePoint(0.28, 2.66),
    status: "Pacific · 14/15 consensus · 94.2%",
  },
  {
    id: "andes",
    label: "Andes",
    lat: -0.26,
    lon: -1.18,
    ...makeSpherePoint(-0.26, -1.18),
    status: "Andes · 11/12 consensus · +4.8σ",
  },
  {
    id: "med",
    label: "Mediterranean",
    lat: 0.63,
    lon: 0.32,
    ...makeSpherePoint(0.63, 0.32),
    status: "Mediterranean · 16/16 consensus · 97.6%",
  },
];

function sampleEarthTerrain(wx: number, wy: number, wz: number, lat: number, lon: number): number {
  let mass = 0;
  for (const lobe of CONTINENT_LOBES) {
    const dot = wx * lobe.wx + wy * lobe.wy + wz * lobe.wz;
    if (dot > 0.2) {
      mass += lobe.weight * Math.exp(-(1 - dot) / lobe.width);
    }
  }
  const polarCap = Math.abs(lat) > 1.24 ? (Math.abs(lat) - 1.24) * 2.2 : 0;
  const coastNoise =
    0.16 * Math.sin(lon * 5.2 + lat * 3.1) +
    0.1 * Math.cos(lon * 9.4 - lat * 7.2) +
    0.06 * Math.sin(lat * 13.0 + lon * 4.5);
  return mass + polarCap + coastNoise;
}

function projectWorldToView(
  wx: number,
  wy: number,
  wz: number,
  sinY: number,
  cosY: number,
  sinP: number,
  cosP: number,
): { vx: number; vy: number; vz: number } {
  const x1 = wx * cosY + wz * sinY;
  const z1 = -wx * sinY + wz * cosY;
  const vy = wy * cosP - z1 * sinP;
  const vz = wy * sinP + z1 * cosP;
  return { vx: x1, vy, vz };
}

export function mountNadirExhibit(
  canvas: HTMLCanvasElement,
): DestroyableHandle {
  let yaw = 0.42;
  let pitch = 0.27;
  let velYaw = 0;
  let velPitch = 0;
  let autoSpinPause = 0;

  let lockedNode: DisasterNode | null = null;
  let hoveredNode: DisasterNode | null = null;
  let quorumAge = 99;
  let quorumOrigin: DisasterNode | null = null;

  const globeRadius = 0.72;

  const projectNodeToCss = (
    node: DisasterNode,
    widthCss: number,
    heightCss: number,
  ): { x: number; y: number; vz: number } => {
    const aspect = widthCss / Math.max(1, heightCss);
    const { vx, vy, vz } = projectWorldToView(
      node.wx,
      node.wy,
      node.wz,
      Math.sin(yaw),
      Math.cos(yaw),
      Math.sin(pitch),
      Math.cos(pitch),
    );
    const nx = ((vx * globeRadius) / aspect + 1) * 0.5;
    const ny = (1 - vy * globeRadius) * 0.5;
    return { x: nx * widthCss, y: ny * heightCss, vz };
  };

  const findNearestVisibleNode = (
    pxX: number,
    pxY: number,
    widthCss: number,
    heightCss: number,
    maxRadiusPx: number,
  ): DisasterNode | null => {
    let best: DisasterNode | null = null;
    let bestDist = maxRadiusPx;
    for (const node of NADIR_NODES) {
      const p = projectNodeToCss(node, widthCss, heightCss);
      if (p.vz <= 0.06) continue;
      const dist = Math.hypot(p.x - pxX, p.y - pxY);
      if (dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    return best;
  };

  const controller = mountCanvasLoop(
    canvas,
    (ctx, state) => {
      const { widthCss, heightCss, timeSec, theme } = state;
      const targetCellW = widthCss < 380 ? 8.8 : 10;
      const targetCellH = widthCss < 380 ? 15 : 16;
      const cols = Math.max(24, Math.floor(widthCss / targetCellW));
      const rows = Math.max(12, Math.floor(heightCss / targetCellH));
      const cellW = widthCss / cols;
      const cellH = heightCss / rows;
      const aspect = widthCss / Math.max(1, heightCss);

      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const sinP = Math.sin(pitch);
      const cosP = Math.cos(pitch);
      const scanLon = (((timeSec * 0.34) % 1) + 1) % 1 * Math.PI * 2 - Math.PI;
      const quorumRingAng = quorumAge * 2.15;
      const quorumActive = quorumOrigin !== null && quorumAge < 1.35;

      const fontPx = Math.max(HUD_FONT_PX, Math.round(cellH * 0.84));
      ctx.font = `500 ${fontPx}px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let row = 0; row < rows; row++) {
        const ny = (row + 0.5) / rows;
        const py = -(ny * 2 - 1);

        for (let col = 0; col < cols; col++) {
          const nx = (col + 0.5) / cols;
          const px = (nx * 2 - 1) * aspect;

          const d2 = px * px + py * py;
          if (d2 > globeRadius * globeRadius) {
            // Subtle starfield + inclined satellite orbit ring outside sphere
            const dist = Math.sqrt(d2);
            const orbitDist = Math.abs(dist - 0.88);
            const ang = Math.atan2(py, px);
            if (orbitDist < 0.036) {
              const sat = Math.exp(-Math.pow(Math.sin((ang - timeSec * 0.95) * 0.5), 2) * 14);
              const colRgb = mixRgb(theme.muted, theme.accentSecondary, sat);
              const ch = sat > 0.65 ? "\u28ff" : sat > 0.25 ? "\u281f" : "\u2803";
              ctx.fillStyle = rgbToCss(colRgb, 0.28 + sat * 0.68);
              ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
            } else {
              const starSeed = hash01(col * 31 + row * 97);
              if (starSeed > 0.972) {
                const twinkle = 0.28 + 0.32 * Math.sin(timeSec * 1.9 + starSeed * 40);
                ctx.fillStyle = rgbToCss(theme.muted, twinkle);
                ctx.fillText(starSeed > 0.99 ? "+" : ".", (col + 0.5) * cellW, (row + 0.52) * cellH);
              }
            }
            continue;
          }

          const pz = Math.sqrt(Math.max(0, globeRadius * globeRadius - d2));
          const nx3 = px / globeRadius;
          const ny3 = py / globeRadius;
          const nz3 = pz / globeRadius;

          // Inverse pitch then inverse yaw
          const y1 = ny3 * cosP + nz3 * sinP;
          const z1 = -ny3 * sinP + nz3 * cosP;
          const wx = nx3 * cosY - z1 * sinY;
          const wy = y1;
          const wz = nx3 * sinY + z1 * cosY;

          const lat = Math.asin(clamp(wy, -1, 1));
          const lon = Math.atan2(wx, wz);

          const latCell = Math.abs((((lat / (Math.PI / 6)) % 1) + 1) % 1 - 0.5);
          const lonCell = Math.abs((((lon / (Math.PI / 6)) % 1) + 1) % 1 - 0.5);
          const isGrid = latCell < 0.075 || lonCell < 0.075;

          const terrain = sampleEarthTerrain(wx, wy, wz, lat, lon);
          const isLand = terrain > 0.56;
          const isHighland = terrain > 0.78;

          // Sweeping nadir orbital beam
          let dLon = Math.abs(lon - scanLon);
          if (dLon > Math.PI) dLon = Math.PI * 2 - dLon;
          const onBeam = Math.exp(-Math.pow(dLon * 3.8, 2));

          // Expanding geodesic quorum verification ring from clicked node
          let quorumWave = 0;
          if (quorumActive && quorumOrigin) {
            const angDist = Math.acos(
              clamp(wx * quorumOrigin.wx + wy * quorumOrigin.wy + wz * quorumOrigin.wz, -1, 1),
            );
            const ringDelta = Math.abs(angDist - quorumRingAng);
            if (ringDelta < 0.18) {
              quorumWave = (1 - ringDelta / 0.18) * (1 - quorumAge / 1.35);
            }
          }

          const rim = Math.pow(1 - nz3, 2.2);
          const lightDir = clamp01(0.35 + wx * 0.28 + wy * 0.25 + nz3 * 0.42);
          const lum = clamp01(
            0.1 +
              (isLand ? 0.34 * lightDir : 0) +
              (isHighland ? 0.16 : 0) +
              (isGrid ? 0.22 : 0) +
              rim * 0.28 +
              onBeam * 0.38 +
              quorumWave * 0.55,
          );

          let ch = ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.floor(lum * ASCII_RAMP.length))] ?? ".";
          if (quorumWave > 0.38) {
            ch = quorumWave > 0.68 ? "#" : "*";
          } else if (onBeam > 0.62 && !isLand) {
            ch = BRAILLE_RAMP[Math.min(BRAILLE_RAMP.length - 1, Math.floor(3 + onBeam * 6))] ?? "\u283f";
          } else if (isGrid && !isLand && onBeam < 0.3) {
            ch = Math.abs(lat) < 0.13 ? "=" : ":";
          } else if (!isLand && !isGrid && rim < 0.28) {
            ch = ".";
          }

          let color = mixRgb(theme.muted, theme.ink, clamp01(lum * 1.1));
          if (onBeam > 0.15) {
            color = mixRgb(color, theme.accentSecondary, onBeam * 0.85);
          }
          if (quorumWave > 0.1) {
            color = mixRgb(color, theme.accent, clamp01(quorumWave * 1.25));
          }

          ctx.fillStyle = rgbToCss(color, clamp01(0.32 + lum * 0.68));
          ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
        }
      }

      // Render glowing disaster beacon nodes & callout labels on front hemisphere
      for (const node of NADIR_NODES) {
        const proj = projectNodeToCss(node, widthCss, heightCss);
        if (proj.vz <= 0.06) continue;

        const isLocked = lockedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const pulse = (timeSec * 1.35 + (node.lon + 3) * 0.5) % 1;

        ctx.save();
        // Concentric pulsing radar rings
        const ringCount = isLocked ? 3 : 2;
        for (let rIdx = 0; rIdx < ringCount; rIdx++) {
          const phase = (pulse + rIdx / ringCount) % 1;
          const rPx = 7 + phase * (isLocked ? 28 : 20);
          const alpha = (1 - phase) * (isLocked ? 0.92 : 0.72) * clamp01((proj.vz - 0.06) * 2.5);
          ctx.strokeStyle = rgbToCss(theme.accent, alpha);
          ctx.lineWidth = isLocked ? 1.75 : 1.25;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, rPx, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Core node beacon
        ctx.fillStyle = rgbToCss(theme.accent, 0.98);
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, isLocked || isHovered ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = rgbToCss(theme.paper, 0.95);
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // Quiet plain mono label beside visible beacon dot
        const label = node.label;
        const labelOnLeft = proj.x > widthCss * 0.58;
        ctx.font = `500 ${HUD_FONT_PX}px ${CHARSET_FONT_STACK}`;
        ctx.textAlign = labelOnLeft ? "right" : "left";
        ctx.textBaseline = "middle";
        const labelX = labelOnLeft ? proj.x - 10 : proj.x + 10;
        const labelY = clamp(proj.y, 14, heightCss - 14);
        ctx.lineWidth = 3;
        ctx.strokeStyle = rgbToCss(theme.paper, 0.92);
        ctx.strokeText(label, labelX, labelY);
        ctx.fillStyle = rgbToCss(isLocked || isHovered ? theme.accent : theme.ink, isLocked || isHovered ? 0.98 : 0.78);
        ctx.fillText(label, labelX, labelY);
        ctx.restore();
      }
    },
    {
      onUpdate: (dt, state) => {
        if (quorumAge < 2) quorumAge += dt;
        if (autoSpinPause > 0) autoSpinPause = Math.max(0, autoSpinPause - dt);
        if (!state.isDragging) {
          yaw += velYaw * dt;
          pitch = clamp(pitch + velPitch * dt, -0.85, 0.85);
          const decay = Math.exp(-dt * 4.2);
          velYaw *= decay;
          velPitch *= decay;
          if (autoSpinPause <= 0 && Math.abs(velYaw) < 0.04) {
            yaw += 0.16 * dt;
          }
        }
      },
      onPointerDown: () => {
        velYaw = 0;
        velPitch = 0;
      },
      onPointerMove: (_nx, _ny, dxPx, dyPx, dt, state) => {
        if (state.isDragging) {
          const sensX = (dxPx / Math.max(180, state.widthCss)) * 4.2;
          const sensY = (dyPx / Math.max(140, state.heightCss)) * 3.1;
          yaw += sensX;
          pitch = clamp(pitch - sensY, -0.85, 0.85);
          velYaw = clamp(sensX / dt, -4.5, 4.5);
          velPitch = clamp(-sensY / dt, -3.5, 3.5);
          autoSpinPause = 1.4;
          hoveredNode = null;
        } else {
          const pxX = state.pointerX * state.widthCss;
          const pxY = state.pointerY * state.heightCss;
          hoveredNode = findNearestVisibleNode(pxX, pxY, state.widthCss, state.heightCss, 44);
        }
      },
      onPointerUp: (_nx, _ny, pxX, pxY, dragDistPx, state) => {
        if (dragDistPx >= 10) return;
        const hit = findNearestVisibleNode(pxX, pxY, state.widthCss, state.heightCss, 50);
        if (hit) {
          lockedNode = hit;
          quorumOrigin = hit;
          quorumAge = state.reducedMotion ? 0.28 : 0;
          autoSpinPause = 2.6;
        }
      },
      onPointerLeave: () => {
        hoveredNode = null;
      },
    },
  );

  return {
    destroy: () => {
      controller.destroy();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 2. CANOPY EXHIBIT: Barometric Storm Radar & XRPL Escrow Trigger            */
/* -------------------------------------------------------------------------- */

interface PayoutWave {
  x: number;
  y: number;
  age: number;
}

export function mountCanopyExhibit(
  canvas: HTMLCanvasElement,
): DestroyableHandle {
  let eyeX = 0.56;
  let eyeY = 0.48;
  let stormIntensity = 0.12; // 1012 - 0.12*64 = 1004 hPa
  let escrowTriggered = false;
  let lastWaveMs = 0;
  const payoutWaves: PayoutWave[] = [];

  const getPressureHpa = (intensity: number): number =>
    Math.round(1012 - clamp01(intensity) * 64);

  const syncWaves = () => {
    const hpa = getPressureHpa(stormIntensity);
    if (hpa < 980) {
      if (!escrowTriggered) {
        escrowTriggered = true;
        lastWaveMs = performance.now();
        payoutWaves.push({ x: eyeX, y: eyeY, age: isReducedMotionPreferred() ? 0.34 : 0 });
      }
    } else if (escrowTriggered && hpa >= 984) {
      escrowTriggered = false;
    }
  };

  const samplePressure = (
    px: number,
    py: number,
    ex: number,
    ey: number,
    intensity: number,
    t: number,
  ): number => {
    const dx = px - ex;
    const dy = py - ey;
    const r = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const spiral = Math.sin(angle * 2 - r * 7.5 + t * (1.5 + intensity * 2.4)) * 0.11 * intensity;
    const cycloneDepth = 0.65 + intensity * 1.45;
    const eyeWell = -Math.exp(-r * r * (2.6 + intensity * 2.2)) * cycloneDepth;
    const sx = px + 0.65;
    const sy = py - 0.35;
    const synoptic =
      Math.sin(px * 2.1 + t * 0.25) * Math.cos(py * 1.9 - t * 0.2) * 0.22 +
      Math.exp(-(sx * sx + sy * sy) * 1.8) * 0.35;
    return eyeWell + synoptic + spiral;
  };

  const controller = mountCanvasLoop(
    canvas,
    (ctx, state) => {
      const { widthCss, heightCss, timeSec, theme } = state;
      const targetCellW = widthCss < 380 ? 8.8 : 10;
      const targetCellH = widthCss < 380 ? 15 : 16;
      const cols = Math.max(24, Math.floor(widthCss / targetCellW));
      const rows = Math.max(12, Math.floor(heightCss / targetCellH));
      const cellW = widthCss / cols;
      const cellH = heightCss / rows;
      const aspect = widthCss / Math.max(1, heightCss);

      const ex = (eyeX * 2 - 1) * aspect;
      const ey = -(eyeY * 2 - 1);
      const hpa = getPressureHpa(stormIntensity);

      const fontPx = Math.max(HUD_FONT_PX, Math.round(cellH * 0.84));
      ctx.font = `500 ${fontPx}px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let row = 0; row < rows; row++) {
        const ny = (row + 0.5) / rows;
        const py = -(ny * 2 - 1);

        for (let col = 0; col < cols; col++) {
          const nx = (col + 0.5) / cols;
          const px = (nx * 2 - 1) * aspect;

          // Payout shockwave energy across ASCII cells
          let pulseEnergy = 0;
          for (const wave of payoutWaves) {
            const wx = (wave.x * 2 - 1) * aspect;
            const wy = -(wave.y * 2 - 1);
            const distToWave = Math.hypot(px - wx, py - wy);
            const ringR = wave.age * 1.85;
            const dRing = Math.abs(distToWave - ringR);
            if (dRing < 0.16) {
              pulseEnergy = Math.max(
                pulseEnergy,
                (1 - dRing / 0.16) * Math.max(0, 1 - wave.age / 1.45),
              );
            }
          }

          const distEye = Math.hypot(px - ex, py - ey);
          const p = samplePressure(px, py, ex, ey, stormIntensity, timeSec);
          const eps = 0.055;
          const gx =
            (samplePressure(px + eps, py, ex, ey, stormIntensity, timeSec) -
              samplePressure(px - eps, py, ex, ey, stormIntensity, timeSec)) /
            (2 * eps);
          const gy =
            (samplePressure(px, py + eps, ex, ey, stormIntensity, timeSec) -
              samplePressure(px, py - eps, ex, ey, stormIntensity, timeSec)) /
            (2 * eps);
          const gradMag = Math.hypot(gx, gy);

          // Storm eye marker right at low-pressure core
          if (distEye < 0.055 && stormIntensity > 0.25) {
            ctx.fillStyle = rgbToCss(
              hpa < 980 ? theme.accent : theme.accentSecondary,
              0.98,
            );
            ctx.fillText(hpa < 980 ? "\u25ce" : "+", (col + 0.5) * cellW, (row + 0.52) * cellH);
            continue;
          }

          if (pulseEnergy > 0.28) {
            const ch = pulseEnergy > 0.65 ? "\u2588" : pulseEnergy > 0.42 ? "#" : "*";
            ctx.fillStyle = rgbToCss(theme.accent, clamp01(0.5 + pulseEnergy * 0.5));
            ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
            continue;
          }

          // Grid of directional wind vector arrows
          const isVectorCell = col % 4 === 2 && row % 2 === 1;
          if (isVectorCell && gradMag > 0.16) {
            // Cyclonic geostrophic flow (counter-clockwise around low pressure + slight inward spiral)
            const flowX = -gy - gx * 0.22;
            const flowY = gx - gy * 0.22;
            const angle = Math.atan2(flowY, flowX);
            const octant = ((Math.round((angle / (Math.PI * 2)) * 8) % 8) + 8) % 8;
            const arrow = WIND_ARROWS[octant] ?? "\u2192";
            const strength = clamp01(gradMag * 0.48 + stormIntensity * 0.25);
            const arrowRgb =
              hpa < 980 && strength > 0.55
                ? mixRgb(theme.accentSecondary, theme.accent, clamp01((strength - 0.55) * 2.2))
                : mixRgb(theme.ink, theme.accentSecondary, clamp01((strength - 0.35) * 1.4));
            ctx.fillStyle = rgbToCss(arrowRgb, 0.55 + strength * 0.45);
            ctx.fillText(arrow, (col + 0.5) * cellW, (row + 0.52) * cellH);
            continue;
          }

          // Isobar contour lines & Braille rain streaks
          const level = (((p * 4.4) % 1) + 1) % 1;
          const distToContour = Math.abs(level - 0.5);
          const isContour = distToContour < 0.13;
          const rainBand = clamp01(
            Math.exp(-distEye * distEye * 2.2) * stormIntensity * 1.15 - (distEye < 0.1 ? 0.5 : 0),
          );

          if (!isContour && rainBand < 0.22) continue;

          if (rainBand > 0.34 && !isContour) {
            const streakPhase = Math.sin(px * 9 + py * 9 - timeSec * 5 + Math.atan2(py - ey, px - ex) * 3);
            if (streakPhase > 0.1) {
              const bIdx = Math.min(
                BRAILLE_RAMP.length - 1,
                2 + Math.floor(rainBand * (BRAILLE_RAMP.length - 3)),
              );
              const ch = BRAILLE_RAMP[bIdx] ?? "\u283f";
              const rainColor = mixRgb(theme.accentSecondary, theme.accent, hpa < 980 ? rainBand * 0.65 : 0);
              ctx.fillStyle = rgbToCss(rainColor, 0.3 + rainBand * 0.62);
              ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
              continue;
            }
          }

          if (isContour) {
            const contourStrength = clamp01(1 - distToContour / 0.13);
            const intensityBoost = clamp01(Math.abs(p) * 0.72 + stormIntensity * 0.28);
            const lum = clamp01(contourStrength * 0.62 + intensityBoost * 0.35);
            const ch =
              ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, 2 + Math.floor(lum * (ASCII_RAMP.length - 3)))] ??
              "-";
            const base = mixRgb(theme.muted, theme.ink, lum);
            const accentMix = hpa < 980 ? clamp01((intensityBoost - 0.5) * 1.6) : 0;
            const color = mixRgb(base, theme.accent, accentMix);
            ctx.fillStyle = rgbToCss(color, 0.28 + lum * 0.68);
            ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
          }
        }
      }

      // Subtle monochrome range ring when below threshold
      ctx.save();
      const centerPxX = eyeX * widthCss;
      const centerPxY = eyeY * heightCss;
      if (hpa < 980) {
        ctx.strokeStyle = rgbToCss(theme.accent, 0.38);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(centerPxX, centerPxY, Math.min(widthCss, heightCss) * 0.18, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
    {
      onUpdate: (dt, state) => {
        for (let i = payoutWaves.length - 1; i >= 0; i--) {
          const wave = payoutWaves[i];
          if (!wave) continue;
          wave.age += dt;
          if (wave.age > 1.5) {
            payoutWaves.splice(i, 1);
          }
        }

        if (state.pointerActive > 0.12 || state.isDragging) {
          const k = 1 - Math.exp(-dt * 6.5);
          eyeX += (state.pointerX - eyeX) * k;
          eyeY += (state.pointerY - eyeY) * k;
          if (state.isDragging) {
            stormIntensity = clamp01(stormIntensity + dt * 0.72);
          }
        } else {
          // Gentle ambient drift and gradual pressure recovery when pointer leaves
          const idleX = 0.52 + Math.sin(state.timeSec * 0.35) * 0.14;
          const idleY = 0.48 + Math.cos(state.timeSec * 0.28) * 0.12;
          const k = 1 - Math.exp(-dt * 1.4);
          eyeX += (idleX - eyeX) * k;
          eyeY += (idleY - eyeY) * k;
          stormIntensity += (0.12 - stormIntensity) * (1 - Math.exp(-dt * 0.26));
        }

        syncWaves();
      },
      onPointerDown: (normX, normY) => {
        eyeX = normX;
        eyeY = normY;
        stormIntensity = Math.max(stormIntensity, 0.76);
        const now = performance.now();
        if (escrowTriggered && now - lastWaveMs > 450) {
          lastWaveMs = now;
          payoutWaves.push({ x: eyeX, y: eyeY, age: 0 });
        }
        syncWaves();
      },
      onPointerMove: (normX, normY, dxPx, dyPx, _dt, state) => {
        const movePx = Math.hypot(dxPx, dyPx);
        eyeX += (normX - eyeX) * 0.35;
        eyeY += (normY - eyeY) * 0.35;
        const boost = state.isDragging ? 0.045 + movePx * 0.004 : 0.015 + movePx * 0.0032;
        stormIntensity = clamp01(stormIntensity + Math.min(0.14, boost));
        syncWaves();
      },
    },
  );

  return {
    destroy: () => controller.destroy(),
  };
}

/* -------------------------------------------------------------------------- */
/* 3. OBSCURAFY EXHIBIT: Optical YOLO Scan & Dynamic Block Redaction          */
/* -------------------------------------------------------------------------- */

interface SensitiveTarget {
  id: string;
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  kind: "face" | "card" | "doc" | "key";
}

const OBSCURAFY_TARGETS: ReadonlyArray<SensitiveTarget> = [
  { id: "pii", label: "pii", cx: 0.25, cy: 0.31, w: 0.24, h: 0.26, kind: "face" },
  { id: "card", label: "card", cx: 0.74, cy: 0.3, w: 0.25, h: 0.24, kind: "card" },
  { id: "doc", label: "doc", cx: 0.27, cy: 0.72, w: 0.26, h: 0.25, kind: "doc" },
  { id: "key", label: "key", cx: 0.73, cy: 0.71, w: 0.24, h: 0.25, kind: "key" },
];

const CARD_ROWS = ["+----------+", "|4532 8819 |", "|EXP 09/28 |", "+----------+"] as const;
const DOC_ROWS = ["NAME: J.DOE", "ID#: 842-09", "TAX: W2-2026", "AUTH: SIGNED"] as const;
const KEY_ROWS = ["sk_live_9f2a", "c4e8d10b73aa", "0x7f4c..91e2", "HMAC-SHA256 "] as const;

function sampleDisguisedGlyph(
  kind: SensitiveTarget["kind"],
  relCol: number,
  relRow: number,
  boxW: number,
  boxH: number,
): string {
  if (kind === "face") {
    const nx = ((relCol + 0.5) / Math.max(1, boxW)) * 2 - 1;
    const ny = ((relRow + 0.5) / Math.max(1, boxH)) * 2 - 1;
    const headDist = Math.hypot(nx * 1.15, ny + 0.22);
    const shoulder = ny > 0.28 && Math.abs(nx) < 0.72 - (ny - 0.28) * 0.45;
    if (headDist < 0.42) {
      if (Math.abs(ny + 0.26) < 0.12 && Math.abs(Math.abs(nx) - 0.16) < 0.08) return "o";
      return headDist > 0.3 ? "@" : ":";
    }
    if (shoulder) return ny > 0.52 ? "#" : "=";
    return ".";
  }

  const lines = kind === "card" ? CARD_ROWS : kind === "doc" ? DOC_ROWS : KEY_ROWS;
  const lineIdx = clamp(Math.floor((relRow / Math.max(1, boxH)) * lines.length), 0, lines.length - 1);
  const line = lines[lineIdx] ?? "";
  if (line.length === 0) return ".";
  const charIdx = Math.min(line.length - 1, Math.floor((relCol / Math.max(1, boxW)) * line.length));
  return line[charIdx] ?? ".";
}

export function mountObscurafyExhibit(
  canvas: HTMLCanvasElement,
): DestroyableHandle {
  let autoRedact = false;
  let apertureX = 0.5;
  let apertureY = 0.5;
  let hasUserAimed = false;
  let lockedIds = new Set<string>();

  const computeLockedTargets = (
    ax: number,
    ay: number,
    fullAuto: boolean,
  ): Set<string> => {
    const next = new Set<string>();
    for (const target of OBSCURAFY_TARGETS) {
      if (
        fullAuto ||
        (Math.abs(ax - target.cx) < target.w * 0.72 &&
          Math.abs(ay - target.cy) < target.h * 0.76)
      ) {
        next.add(target.id);
      }
    }
    return next;
  };

  const updateLocks = () => {
    lockedIds = computeLockedTargets(apertureX, apertureY, autoRedact);
  };

  const controller = mountCanvasLoop(
    canvas,
    (ctx, state) => {
      const { widthCss, heightCss, timeSec, theme, reducedMotion } = state;
      const targetCellW = widthCss < 380 ? 8.8 : 10;
      const targetCellH = widthCss < 380 ? 15 : 16;
      const cols = Math.max(26, Math.floor(widthCss / targetCellW));
      const rows = Math.max(14, Math.floor(heightCss / targetCellH));
      const cellW = widthCss / cols;
      const cellH = heightCss / rows;

      if (reducedMotion && !hasUserAimed && !autoRedact) {
        apertureX = OBSCURAFY_TARGETS[0]?.cx ?? 0.25;
        apertureY = OBSCURAFY_TARGETS[0]?.cy ?? 0.31;
      }

      const activeTargets = computeLockedTargets(apertureX, apertureY, autoRedact);
      const scrambleTick = reducedMotion ? 3 : Math.floor(timeSec * 7);

      // Compute grid bounds for each target zone
      const targetBoxes = OBSCURAFY_TARGETS.map((t) => {
        const halfC = Math.max(4, Math.round((t.w * cols) * 0.5));
        const halfR = Math.max(2, Math.round((t.h * rows) * 0.5));
        const cCenter = Math.round(t.cx * (cols - 1));
        const rCenter = Math.round(t.cy * (rows - 1));
        const minC = clamp(cCenter - halfC, 1, Math.max(1, cols - halfC * 2 - 2));
        const maxC = Math.min(cols - 2, minC + halfC * 2);
        const minR = clamp(rCenter - halfR, 1, Math.max(1, rows - halfR * 2 - 2));
        const maxR = Math.min(rows - 2, minR + halfR * 2);
        return { target: t, minC, maxC, minR, maxR, locked: activeTargets.has(t.id) };
      });

      // Compute optical YOLO scan aperture bounds
      const apHalfC = Math.max(5, Math.round(cols * 0.14));
      const apHalfR = Math.max(3, Math.round(rows * 0.16));
      const apCenterC = Math.round(apertureX * (cols - 1));
      const apCenterR = Math.round(apertureY * (rows - 1));
      const apMinC = clamp(apCenterC - apHalfC, 0, Math.max(0, cols - apHalfC * 2 - 1));
      const apMaxC = Math.min(cols - 1, apMinC + apHalfC * 2);
      const apMinR = clamp(apCenterR - apHalfR, 0, Math.max(0, rows - apHalfR * 2 - 1));
      const apMaxR = Math.min(rows - 1, apMinR + apHalfR * 2);

      const fontPx = Math.max(HUD_FONT_PX, Math.round(cellH * 0.84));
      ctx.font = `500 ${fontPx}px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let row = 0; row < rows; row++) {
        const ny = (row + 0.5) / rows;
        for (let col = 0; col < cols; col++) {
          const nx = (col + 0.5) / cols;

          let handled = false;
          for (const box of targetBoxes) {
            if (col < box.minC || col > box.maxC || row < box.minR || row > box.maxR) continue;
            const onBorder =
              col === box.minC || col === box.maxC || row === box.minR || row === box.maxR;

            if (box.locked) {
              if (onBorder) {
                let borderChar = "\u2500";
                if (row === box.minR && col === box.minC) borderChar = "\u250c";
                else if (row === box.minR && col === box.maxC) borderChar = "\u2510";
                else if (row === box.maxR && col === box.minC) borderChar = "\u2514";
                else if (row === box.maxR && col === box.maxC) borderChar = "\u2518";
                else if (col === box.minC || col === box.maxC) borderChar = "\u2502";

                ctx.fillStyle = rgbToCss(theme.accent, 0.98);
                ctx.fillText(borderChar, (col + 0.5) * cellW, (row + 0.52) * cellH);
              } else {
                // Shifting block redaction interior (▓█░▒)
                const h = hash01(col * 17.3 + row * 53.1 + scrambleTick * 7.7);
                const blkIdx = Math.min(BLOCK_RAMP.length - 1, Math.floor(h * BLOCK_RAMP.length));
                const ch = BLOCK_RAMP[blkIdx] ?? "\u2593";
                const blkColor = mixRgb(theme.ink, theme.accent, h > 0.68 ? 0.7 : 0.14);
                ctx.fillStyle = rgbToCss(blkColor, 0.72 + h * 0.28);
                ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
              }
            } else {
              // Disguised raw sensitive payload inside ambient ASCII scenery
              const ch = sampleDisguisedGlyph(
                box.target.kind,
                col - box.minC,
                row - box.minR,
                box.maxC - box.minC + 1,
                box.maxR - box.minR + 1,
              );
              const scanShimmer = 0.55 + 0.25 * Math.sin(nx * 8 - ny * 5 + timeSec * 1.4);
              ctx.fillStyle = rgbToCss(mixRgb(theme.muted, theme.ink, 0.45), scanShimmer);
              ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
            }
            handled = true;
            break;
          }

          if (handled) continue;

          // Optical YOLO scan aperture brackets (+---   ---+)
          const onApTop = row === apMinR && col >= apMinC && col <= apMaxC;
          const onApBot = row === apMaxR && col >= apMinC && col <= apMaxC;
          const onApLeft = col === apMinC && row >= apMinR && row <= apMaxR;
          const onApRight = col === apMaxC && row >= apMinR && row <= apMaxR;
          const isApCorner = (onApTop || onApBot) && (onApLeft || onApRight);
          const isApHorizLeg =
            (onApTop || onApBot) && (col - apMinC <= 3 || apMaxC - col <= 3);
          const isApVertLeg =
            (onApLeft || onApRight) && (row - apMinR <= 1 || apMaxR - row <= 1);
          const isApCenter = col === apCenterC && row === apCenterR;

          if (!autoRedact && (isApCorner || isApHorizLeg || isApVertLeg || isApCenter)) {
            const apColor = activeTargets.size > 0 ? theme.accent : theme.accentSecondary;
            let apCh = "+";
            if (isApCenter) apCh = "+";
            else if (isApCorner) apCh = "+";
            else if (isApHorizLeg) apCh = "-";
            else apCh = "|";

            ctx.fillStyle = rgbToCss(apColor, 0.94);
            ctx.fillText(apCh, (col + 0.5) * cellW, (row + 0.52) * cellH);
            continue;
          }

          // Ambient camera / photo-library ASCII grain & sweep line
          const sweep = Math.exp(-Math.pow((ny - ((timeSec * 0.22) % 1)) * 9, 2));
          const tex =
            0.2 +
            0.16 * Math.sin(nx * 18 + ny * 9) +
            0.12 * Math.cos(nx * 7 - ny * 14 + timeSec * 0.5) +
            sweep * 0.24;
          if (tex < 0.22) continue;

          const bIdx = Math.min(BRAILLE_RAMP.length - 1, Math.floor(tex * 7));
          const ch = sweep > 0.45 ? "-" : BRAILLE_RAMP[bIdx] ?? "\u2803";
          const bgRgb = sweep > 0.35 ? mixRgb(theme.muted, theme.accentSecondary, 0.45) : theme.muted;
          ctx.fillStyle = rgbToCss(bgRgb, 0.22 + tex * 0.34);
          ctx.fillText(ch, (col + 0.5) * cellW, (row + 0.52) * cellH);
        }
      }

      // Minimal plain mono labels above redacted zones
      ctx.save();
      ctx.font = `500 ${HUD_FONT_PX}px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      for (const box of targetBoxes) {
        if (!box.locked) continue;
        const pxX = clamp(box.minC * cellW, 8, widthCss - 64);
        const pxY = Math.max(18, box.minR * cellH - 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = rgbToCss(theme.paper, 0.9);
        ctx.strokeText(box.target.label, pxX, pxY);
        ctx.fillStyle = rgbToCss(theme.accent, 0.95);
        ctx.fillText(box.target.label, pxX, pxY);
      }
      ctx.restore();
    },
    {
      onUpdate: (_dt, state) => {
        if (autoRedact) return;
        if (state.pointerActive > 0.1 || hasUserAimed) {
          apertureX += (state.pointerX - apertureX) * 0.35;
          apertureY += (state.pointerY - apertureY) * 0.35;
          updateLocks();
        } else {
          // Gentle patrol sweep when idle
          apertureX = 0.5 + Math.cos(state.timeSec * 0.65) * 0.28;
          apertureY = 0.5 + Math.sin(state.timeSec * 0.88) * 0.24;
          updateLocks();
        }
      },
      onPointerMove: (normX, normY) => {
        hasUserAimed = true;
        apertureX = normX;
        apertureY = normY;
        updateLocks();
      },
      onPointerUp: (normX, normY, _pxX, _pxY, dragDistPx) => {
        if (dragDistPx >= 12) return;
        hasUserAimed = true;
        apertureX = normX;
        apertureY = normY;
        autoRedact = !autoRedact;
        updateLocks();
      },
      onPointerLeave: () => {
        hasUserAimed = false;
      },
    },
  );

  return {
    destroy: () => {
      controller.destroy();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 4. EXPERIENCE OSCILLOSCOPE: Minimal Dual-Trace Harmonic Analyzer           */
/* -------------------------------------------------------------------------- */

const BRAILLE_LEFT_BITS = [0x01, 0x02, 0x04, 0x40] as const;
const BRAILLE_RIGHT_BITS = [0x08, 0x10, 0x20, 0x80] as const;

function evalRoleSignal(idx: number, u: number, t: number): { y1: number; y2: number } {
  const k = ((idx % 6) + 6) % 6;
  switch (k) {
    case 0: {
      // AWS EBS: high-throughput block square/pulse burst
      const burstGate = Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI * 5 - t * 2.1), 1.8);
      const square = Math.tanh(Math.sin(u * Math.PI * 22 - t * 6.5) * 4.5);
      const y1 = square * (0.28 + 0.72 * burstGate);
      const y2 = Math.sin(u * Math.PI * 10 - t * 2.8) * 0.45 * burstGate;
      return { y1, y2 };
    }
    case 1: {
      // AmFam: multi-endpoint API telemetry carrier + latency spikes
      const carrier = Math.sin(u * Math.PI * 12 - t * 3.1) * 0.56;
      const spikePos = (((u * 3 - t * 0.45) % 1) + 1) % 1;
      const spike = Math.exp(-Math.pow((spikePos - 0.5) * 14, 2)) * 0.45;
      const y1 = clamp(carrier + spike * Math.cos(u * 40), -1, 1);
      const y2 = Math.cos(u * Math.PI * 6 - t * 1.9) * 0.52;
      return { y1, y2 };
    }
    case 2: {
      // FedEx: batched routing optimization packet wavelets
      const env = 0.5 + 0.5 * Math.sin(u * Math.PI * 4 + t * 1.6);
      const y1 = Math.sin(u * Math.PI * 18 - t * 4.2) * (0.22 + 0.74 * env * env);
      const y2 = Math.sin(u * Math.PI * 4 + t * 1.6) * 0.58;
      return { y1, y2 };
    }
    case 3: {
      // Zhan Lab: 120 FPS microfluidic droplet pulse train
      const phase = (((u * 5 - t * 0.9) % 1) + 1) % 1;
      const pulse = Math.exp(-phase * 5.2) * Math.sin(phase * Math.PI * 6);
      const y1 = clamp(pulse * 1.35, -1, 1);
      const y2 = Math.sin(u * Math.PI * 10 - t * 5.2) * 0.36;
      return { y1, y2 };
    }
    case 4: {
      // Suga 2025: harmonic audio DSP & 13ms WebSocket synth wave
      const y1 =
        Math.sin(u * Math.PI * 8 - t * 3.4) * 0.55 +
        Math.sin(u * Math.PI * 16 - t * 6.8) * 0.28 +
        Math.cos(u * Math.PI * 24 - t * 3.4) * 0.14;
      const y2 = Math.sin(u * Math.PI * 8 - t * 3.4 + 0.7) * 0.5;
      return { y1: clamp(y1, -1, 1), y2 };
    }
    case 5:
    default: {
      // Suga 2024: Jetson YOLO vision frame-sync saw/triangle trace
      const saw = 2 * ((((u * 7 - t * 0.8) % 1) + 1) % 1) - 1;
      const y1 = saw * 0.72 + Math.sin(u * Math.PI * 21 - t * 4) * 0.22;
      const y2 = Math.tanh(Math.sin(u * Math.PI * 7 - t * 2.5) * 2.5) * 0.48;
      return { y1: clamp(y1, -1, 1), y2 };
    }
  }
}

export function mountExperienceOscilloscope(
  canvas: HTMLCanvasElement,
  roleCount: number,
  labels?: string[],
  periods?: string[],
): OscilloscopeHandle {
  const safeCount = Math.max(1, Math.floor(roleCount || 1));
  let activeIdx = 0;
  let prevIdx = 0;
  let morph = 1;
  let cursorNorm = 0.5 / safeCount;
  let cursorTargetNorm = 0.5 / safeCount;
  let scrollProgressNorm: number | null = null;
  let isPointerHovering = false;
  let hoverCallback: ((idx: number) => void) | null = null;

  const setActiveSlot = (nextIdx: number, notifyHover: boolean) => {
    const clamped = clamp(nextIdx, 0, safeCount - 1);
    if (clamped !== activeIdx) {
      prevIdx = activeIdx;
      activeIdx = clamped;
      morph = isReducedMotionPreferred() ? 1 : 0;
      if (notifyHover) {
        hoverCallback?.(activeIdx);
      }
    }
  };

  const restoreScanCursor = (reducedMotion: boolean) => {
    isPointerHovering = false;
    if (scrollProgressNorm !== null) {
      cursorTargetNorm = scrollProgressNorm;
      const scrollSlot = clamp(Math.floor(scrollProgressNorm * safeCount), 0, safeCount - 1);
      setActiveSlot(scrollSlot, true);
    } else {
      cursorTargetNorm = (activeIdx + 0.5) / safeCount;
    }
    if (reducedMotion) cursorNorm = cursorTargetNorm;
  };

  const plotBrailleTrace = (
    ctx: CanvasRenderingContext2D,
    cols: number,
    waveRows: number,
    cellW: number,
    cellH: number,
    padX: number,
    waveTop: number,
    timeSec: number,
    useSecondary: boolean,
    colorForCol: (nx: number) => { rgb: ThemeRgb; alpha: number },
  ) => {
    const totalSubY = waveRows * 4;
    const sampleY = (nx: number): number => {
      const a = evalRoleSignal(prevIdx, nx, timeSec);
      const b = evalRoleSignal(activeIdx, nx, timeSec);
      const val = useSecondary
        ? a.y2 + (b.y2 - a.y2) * morph
        : a.y1 + (b.y1 - a.y1) * morph;
      return clamp(Math.round((0.5 - val * 0.44) * (totalSubY - 1)), 0, totalSubY - 1);
    };

    const masks = new Uint8Array(cols * waveRows);
    for (let col = 0; col < cols; col++) {
      for (let sub = 0; sub < 2; sub++) {
        const nx0 = clamp01((col * 2 + sub) / Math.max(1, cols * 2 - 1));
        const nx1 = clamp01((col * 2 + sub + 1) / Math.max(1, cols * 2 - 1));
        const sy0 = sampleY(nx0);
        const sy1 = sampleY(nx1);
        const minSy = Math.min(sy0, sy1);
        const maxSy = Math.max(sy0, sy1);

        for (let sy = minSy; sy <= maxSy; sy++) {
          const r = Math.floor(sy / 4);
          const bitRow = sy % 4;
          const bit = sub === 0 ? (BRAILLE_LEFT_BITS[bitRow] ?? 0) : (BRAILLE_RIGHT_BITS[bitRow] ?? 0);
          const cellIdx = r * cols + col;
          masks[cellIdx] = (masks[cellIdx] ?? 0) | bit;
        }
      }
    }

    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols;
      const styled = colorForCol(nx);
      ctx.fillStyle = rgbToCss(styled.rgb, styled.alpha);
      for (let r = 0; r < waveRows; r++) {
        const mask = masks[r * cols + col] ?? 0;
        if (mask === 0) continue;
        const ch = String.fromCharCode(0x2800 + mask);
        ctx.fillText(ch, padX + (col + 0.5) * cellW, waveTop + (r + 0.52) * cellH);
      }
    }
  };

  const controller = mountCanvasLoop(
    canvas,
    (ctx, state) => {
      const { widthCss, heightCss, timeSec, theme } = state;
      const padX = 14;
      const usableW = Math.max(60, widthCss - padX * 2);
      const cellW = widthCss < 440 ? 8 : 9;
      const cols = Math.max(24, Math.floor(usableW / cellW));
      const actualCellW = usableW / cols;

      const headerY = 12;
      const waveTop = 21;
      const ruleY = Math.max(waveTop + 26, heightCss - 20);
      const waveHeight = Math.max(24, ruleY - waveTop - 3);
      const waveRows = Math.max(2, Math.min(4, Math.round(waveHeight / 12)));
      const waveCellH = waveHeight / waveRows;
      const yearY = Math.min(heightCss - 8, ruleY + 11);

      const slotW = usableW / safeCount;

      // Horizontal baseline zero-crossing & bottom timeline rule
      ctx.strokeStyle = rgbToCss(theme.muted, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, waveTop + waveHeight * 0.5);
      ctx.lineTo(widthCss - padX, waveTop + waveHeight * 0.5);
      ctx.moveTo(padX, ruleY);
      ctx.lineTo(widthCss - padX, ruleY);
      ctx.stroke();

      for (let i = 0; i <= safeCount; i++) {
        const tx = padX + i * slotW;
        ctx.strokeStyle = rgbToCss(theme.muted, 0.24);
        ctx.beginPath();
        ctx.moveTo(tx, ruleY - 3);
        ctx.lineTo(tx, ruleY + 3);
        ctx.stroke();
      }

      // Draw dual-trace Braille waveforms
      const fontPx = Math.max(HUD_FONT_PX, Math.round(waveCellH * 1.04));
      ctx.font = `500 ${fontPx}px ${CHARSET_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      plotBrailleTrace(
        ctx,
        cols,
        waveRows,
        actualCellW,
        waveCellH,
        padX,
        waveTop,
        timeSec,
        true,
        (nx) => {
          const proximity = Math.exp(-Math.pow((nx - cursorNorm) * 4.5, 2));
          return {
            rgb: theme.muted,
            alpha: 0.28 + proximity * 0.35,
          };
        },
      );

      plotBrailleTrace(
        ctx,
        cols,
        waveRows,
        actualCellW,
        waveCellH,
        padX,
        waveTop,
        timeSec,
        false,
        (nx) => {
          const slotGlow = Math.exp(-Math.pow((nx - cursorNorm) * 5.2, 2));
          return {
            rgb: mixRgb(theme.ink, theme.accent, clamp01(slotGlow)),
            alpha: 0.58 + slotGlow * 0.42,
          };
        },
      );

      // Minimal razor-thin vertical scan-head hairline marker
      const cursorX = padX + clamp01(cursorNorm) * usableW;
      const alignedCursorX = Math.round(cursorX) + 0.5;
      ctx.strokeStyle = rgbToCss(theme.accent, 0.78);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(alignedCursorX, waveTop - 1);
      ctx.lineTo(alignedCursorX, ruleY + 3);
      ctx.stroke();
      ctx.fillStyle = rgbToCss(theme.accent, 0.92);
      ctx.fillRect(Math.round(cursorX) - 1, ruleY - 1, 3, 3);

      // Top strip: active company on left, active period on right (>= 440px)
      const rawRoleName = labels?.[activeIdx] ?? "";
      const showPeriod = widthCss >= 440;
      const rawPeriod = showPeriod ? (periods?.[activeIdx] ?? "").trim() : "";

      ctx.font = `500 ${HUD_FONT_PX}px ${CHARSET_FONT_STACK}`;
      ctx.textBaseline = "middle";

      let periodReserveW = 0;
      if (rawPeriod.length > 0) {
        periodReserveW = ctx.measureText(rawPeriod).width + 16;
        ctx.textAlign = "right";
        ctx.fillStyle = rgbToCss(theme.muted, 0.88);
        ctx.fillText(rawPeriod, widthCss - padX, headerY);
      }

      const maxLabelW = Math.max(64, usableW - periodReserveW);
      let roleName = rawRoleName;
      if (roleName.length > 0 && ctx.measureText(roleName).width > maxLabelW) {
        while (roleName.length > 3 && ctx.measureText(`${roleName}...`).width > maxLabelW) {
          roleName = roleName.slice(0, -1).trimEnd();
        }
        roleName = `${roleName}...`;
      }
      ctx.textAlign = "left";
      ctx.fillStyle = rgbToCss(theme.ink, 0.92);
      ctx.fillText(roleName, padX, headerY);

      // Bottom rule crisp year ticks (2026 -> 2025 -> 2024 aligned with newest-first slots)
      const yearTicks: ReadonlyArray<{ year: string; norm: number; align: CanvasTextAlign }> = [
        { year: "2026", norm: 0.08, align: "left" },
        { year: "2025", norm: 0.5, align: "center" },
        { year: "2024", norm: 0.92, align: "right" },
      ];
      ctx.font = `500 ${HUD_FONT_PX}px ${CHARSET_FONT_STACK}`;
      ctx.textBaseline = "middle";
      for (const tick of yearTicks) {
        const tx =
          tick.align === "left"
            ? padX
            : tick.align === "right"
              ? widthCss - padX
              : padX + tick.norm * usableW;
        const near = Math.abs(cursorNorm - tick.norm) < 0.22;
        ctx.textAlign = tick.align;
        ctx.fillStyle = rgbToCss(near ? theme.ink : theme.muted, near ? 0.98 : 0.85);
        ctx.fillText(tick.year, tx, yearY);
      }
    },
    {
      onUpdate: (dt) => {
        if (morph < 1) {
          morph = Math.min(1, morph + dt / 0.22);
        }
        cursorNorm += (cursorTargetNorm - cursorNorm) * (1 - Math.exp(-dt * 14));
      },
      onPointerDown: (normX, _ny, _px, _py, state) => {
        isPointerHovering = true;
        cursorTargetNorm = normX;
        if (state.reducedMotion) cursorNorm = normX;
        const idx = Math.floor(clamp01(normX) * safeCount);
        setActiveSlot(idx, true);
      },
      onPointerMove: (normX, _ny, _dx, _dy, _dt, state) => {
        isPointerHovering = true;
        cursorTargetNorm = normX;
        if (state.reducedMotion) cursorNorm = normX;
        const idx = Math.floor(clamp01(normX) * safeCount);
        setActiveSlot(idx, true);
      },
      onPointerUp: (normX, normY, _px, _py, _dragDistPx, state) => {
        if (normX <= 0 || normX >= 1 || normY <= 0 || normY >= 1) {
          restoreScanCursor(state.reducedMotion);
        }
      },
      onPointerLeave: (state) => {
        restoreScanCursor(state.reducedMotion);
      },
    },
  );

  return {
    setRoleIndex: (idx: number) => {
      const clamped = clamp(Math.round(idx), 0, safeCount - 1);
      if (!isPointerHovering) {
        cursorTargetNorm = (clamped + 0.5) / safeCount;
        if (isReducedMotionPreferred()) {
          cursorNorm = cursorTargetNorm;
        }
      }
      setActiveSlot(clamped, false);
      controller.requestRedraw();
    },
    setScrollProgress: (norm: number) => {
      const clampedNorm = clamp01(norm);
      scrollProgressNorm = clampedNorm;
      if (!isPointerHovering) {
        cursorTargetNorm = clampedNorm;
        if (isReducedMotionPreferred()) {
          cursorNorm = cursorTargetNorm;
          controller.requestRedraw();
        }
      }
    },
    setHoverCallback: (cb: (idx: number) => void) => {
      hoverCallback = cb;
    },
    destroy: () => {
      controller.destroy();
    },
  };
}
