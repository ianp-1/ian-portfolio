import {
  CHARSET_FONT_STACK,
  isReducedMotionPreferred,
  observeDataTheme,
  observeReducedMotion,
  resolveThemeColors,
  rgbToCss,
  type ThemeColors,
} from "./ascii-atlas";
import { playXray } from "./synth-audio";

export interface XrayHandle {
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => boolean;
  destroy: () => void;
}

interface TargetSpec {
  selector: string;
  label: string;
  primaryAccent?: boolean;
  compact?: boolean;
}

interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TARGET_SPECS: readonly TargetSpec[] = [
  { selector: "nav", label: "nav" },
  { selector: "#hero-horizon", label: "#hero-horizon" },
  { selector: ".ascii-dock", label: ".ascii-dock", primaryAccent: true },
  { selector: ".work-exhibit", label: ".work-exhibit", primaryAccent: true },
  { selector: ".exp-row", label: ".exp-row" },
  { selector: ".skill-item", label: ".skill-item", compact: true },
  { selector: "#contact h2", label: "#contact h2" },
];

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type?.toLowerCase() ?? "text";
    return type !== "radio" && type !== "checkbox" && type !== "button" && type !== "submit";
  }
  return (el as HTMLElement).isContentEditable === true;
}

function rectsOverlap(a: RectBox, b: RectBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function mountXrayMode(
  canvas: HTMLCanvasElement,
  onChange?: (enabled: boolean) => void,
): XrayHandle {
  const ctx = canvas.getContext("2d");
  let destroyed = false;
  let latched = false;
  let altPeeking = false;
  let currentActive = false;

  let reducedMotion = isReducedMotionPreferred();
  let isPageVisible = typeof document !== "undefined" ? !document.hidden : true;
  let theme: ThemeColors = resolveThemeColors();

  let vw = 1;
  let vh = 1;
  let dpr = 1;

  let rafId: number | null = null;

  const isEnabled = (): boolean => currentActive;

  const syncCanvasSize = () => {
    vw = Math.max(1, window.innerWidth || canvas.clientWidth || 1);
    vh = Math.max(1, window.innerHeight || canvas.clientHeight || 1);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(vw * dpr));
    const targetH = Math.max(1, Math.round(vh * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  };

  const clearCanvas = () => {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  const stopLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const renderFrame = () => {
    if (destroyed || !ctx || !currentActive) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    const placedLabels: RectBox[] = [];
    ctx.font = `500 13px ${CHARSET_FONT_STACK}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // Quiet Swiss typographic layout hairlines + plain dimension labels
    for (const spec of TARGET_SPECS) {
      const els = document.querySelectorAll(spec.selector);
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          rect.width < 6 ||
          rect.height < 6 ||
          rect.bottom < 0 ||
          rect.top > vh ||
          rect.right < 0 ||
          rect.left > vw
        ) {
          continue;
        }

        const x = Math.round(rect.left) + 0.5;
        const y = Math.round(rect.top) + 0.5;
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);

        const isActiveRow =
          spec.selector === ".exp-row" && el.getAttribute("data-exp-active") === "true";
        const usePrimary = Boolean(spec.primaryAccent) || isActiveRow;

        ctx.strokeStyle = usePrimary
          ? rgbToCss(theme.ink, 0.28)
          : rgbToCss(theme.muted, 0.22);
        ctx.lineWidth = 1;
        ctx.setLineDash(spec.compact ? [2, 3] : [4, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        if (spec.compact) continue;

        const dimText = `${w}×${h}`;
        const textW = Math.ceil(ctx.measureText(dimText).width);
        const labelH = 18;
        let lx = x + 6;
        let ly = y - labelH - 2;
        if (spec.selector === ".ascii-dock") {
          lx = x + w - textW - 6;
          ly = Math.max(4, y - labelH - 2);
        } else if (spec.selector === "nav" || ly < 4) {
          lx = x + 6;
          ly = Math.min(vh - labelH - 4, y + h + 2);
        }
        lx = Math.max(4, Math.min(vw - textW - 4, lx));
        ly = Math.max(4, Math.min(vh - labelH - 4, ly));

        const candidate: RectBox = { x: lx - 2, y: ly - 1, w: textW + 4, h: labelH + 2 };
        if (placedLabels.some((b) => rectsOverlap(candidate, b))) continue;
        placedLabels.push(candidate);

        ctx.fillStyle = rgbToCss(theme.muted, 0.85);
        ctx.fillText(dimText, lx, ly + labelH * 0.5);
      }
    }

    ctx.restore();
  };

  const tick = () => {
    rafId = null;
    if (destroyed || !currentActive || !isPageVisible || reducedMotion) return;
    renderFrame();
    rafId = requestAnimationFrame(tick);
  };

  const startLoopOrStatic = () => {
    if (destroyed || !currentActive) return;
    syncCanvasSize();
    theme = resolveThemeColors();
    if (reducedMotion || !isPageVisible) {
      stopLoop();
      renderFrame();
    } else if (rafId === null) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const applyEffectiveState = (next: boolean, playFeedback: boolean) => {
    if (destroyed) return;
    if (next === currentActive) return;
    currentActive = next;

    if (currentActive) {
      document.documentElement.setAttribute("data-xray", "on");
      startLoopOrStatic();
    } else {
      document.documentElement.removeAttribute("data-xray");
      stopLoop();
      clearCanvas();
    }

    if (playFeedback) {
      playXray(currentActive);
    }
    onChange?.(currentActive);
  };

  const setEnabled = (enabled: boolean) => {
    latched = enabled;
    altPeeking = false;
    applyEffectiveState(enabled, true);
  };

  const toggle = (): boolean => {
    const next = !isEnabled();
    setEnabled(next);
    return isEnabled();
  };

  // Keyboard shortcuts: Backtick (`) toggles; holding Alt performs temporary peek
  const onKeyDown = (e: KeyboardEvent) => {
    if (destroyed) return;
    const target = (e.target as Element | null) ?? document.activeElement;

    if ((e.key === "`" || e.code === "Backquote") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.repeat || isEditableElement(target)) return;
      e.preventDefault();
      toggle();
      return;
    }

    if (e.key === "Alt" && !e.repeat && !e.ctrlKey && !e.metaKey) {
      if (!latched && !altPeeking) {
        altPeeking = true;
        applyEffectiveState(true, true);
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (destroyed) return;
    if (e.key === "Alt" && altPeeking) {
      altPeeking = false;
      if (!latched) {
        applyEffectiveState(false, true);
      }
    }
  };

  const onWindowBlur = () => {
    if (destroyed) return;
    if (altPeeking) {
      altPeeking = false;
      if (!latched) {
        applyEffectiveState(false, false);
      }
    }
  };

  const onResizeOrScroll = () => {
    if (destroyed || !currentActive) return;
    syncCanvasSize();
    if (reducedMotion) {
      renderFrame();
    }
  };

  const onVisibilityChange = () => {
    isPageVisible = !document.hidden;
    if (!currentActive) return;
    if (isPageVisible) {
      startLoopOrStatic();
    } else {
      stopLoop();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("resize", onResizeOrScroll, { passive: true });
  window.addEventListener("scroll", onResizeOrScroll, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);

  const stopThemeObserver = observeDataTheme(() => {
    theme = resolveThemeColors();
    if (currentActive) {
      renderFrame();
    }
  });

  const stopMotionObserver = observeReducedMotion((nextReduced) => {
    reducedMotion = nextReduced;
    if (currentActive) {
      startLoopOrStatic();
    }
  });

  // Ensure initial state has zero rAF ticks and clean canvas
  syncCanvasSize();
  clearCanvas();

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    latched = false;
    altPeeking = false;
    currentActive = false;
    stopLoop();
    document.documentElement.removeAttribute("data-xray");
    clearCanvas();

    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    window.removeEventListener("resize", onResizeOrScroll);
    window.removeEventListener("scroll", onResizeOrScroll);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    stopThemeObserver();
    stopMotionObserver();
  };

  return {
    isEnabled,
    setEnabled,
    toggle,
    destroy,
  };
}
