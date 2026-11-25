export interface HeroGlyphCell {
  /** CSS px relative to #hero-fluid-canvas left */
  x: number;
  /** CSS px relative to #hero-fluid-canvas top */
  y: number;
  cellW: number;
  cellH: number;
  /** 0 = ATLAS_SPEC.rowAscii, 1 = ATLAS_SPEC.rowEdge */
  atlasRow: number;
  glyphIdx: number;
  /** Deterministic peel threshold in [0.02..0.94]; MUST match shader peelOrder */
  peelOrder: number;
  /** Normalized visual weight in [0..1] */
  intensity: number;
}

export interface HeroGlyphSnapshot {
  canvasWidth: number;
  canvasHeight: number;
  cols: number;
  rows: number;
  cells: HeroGlyphCell[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

let currentSnapshot: HeroGlyphSnapshot | null = null;
const listeners = new Set<(snapshot: HeroGlyphSnapshot) => void>();

export function computeHeroScrollDissolve(scrollY: number, viewportH: number): number {
  if (!Number.isFinite(scrollY)) return 0;
  const safeH = Number.isFinite(viewportH) ? viewportH : 0;
  return clamp01((scrollY - 6) / Math.max(180, safeH * 0.44));
}

export function computeHeroPeelOrder(col: number, glRow: number, rows: number): number {
  const safeRows = Math.max(1, rows);
  const cellHash = fract(Math.sin(col * 12.9898 + glRow * 78.233) * 43758.5453);
  const glUvY = (glRow + 0.5) / safeRows;
  return clamp((glUvY - 0.22) * 0.92 + cellHash * 0.34, 0.02, 0.94);
}

export function computeHeroStayMask(peelOrder: number, scrollDissolve: number): number {
  if (scrollDissolve <= 0.001) return 1.0;
  return 1.0 - smoothstep(peelOrder - 0.05, peelOrder + 0.04, scrollDissolve);
}

export function publishHeroSnapshot(snapshot: HeroGlyphSnapshot): void {
  currentSnapshot = snapshot;
  for (const listener of Array.from(listeners)) {
    listener(snapshot);
  }
}

export function getHeroSnapshot(): HeroGlyphSnapshot | null {
  return currentSnapshot;
}

export function subscribeHeroSnapshot(cb: (snapshot: HeroGlyphSnapshot) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
