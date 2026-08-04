import type { DrawingToolId } from './toolRegistry';

/**
 * Honesty layer for the drawing catalog (D6).
 * - full: Tier 1–2 — place/paint/select/move/settings intended as product-ready
 * - approx: usable sketch; not TV-complete
 * - beta: stub / simplified geometry — shown only under “More”
 */
export type ToolMaturity = 'full' | 'approx' | 'beta';

/** Tier 1 + Tier 2 (D3–D5). */
const FULL_TOOLS: readonly DrawingToolId[] = [
  'hline',
  'horizontalRay',
  'trendLine',
  'ray',
  'vline',
  'extendedLine',
  'rectangle',
  'longPosition',
  'shortPosition',
  'datePriceRange',
  'text',
  'arrow',
  'brush',
  'highlighter',
  'fibRetracement',
  'parallelChannel',
  'callout',
  'priceLabel',
];

/** Simplified but intentional enough to keep reachable without hunting. */
const APPROX_TOOLS: readonly DrawingToolId[] = [
  'infoLine',
  'trendAngle',
  'crossLine',
  'flatTopBottom',
  'disjointChannel',
  'fibExtension',
  'fibChannel',
  'path',
  'circle',
  'ellipse',
  'polyline',
  'triangle',
  'rotatedRectangle',
  'note',
  'priceNote',
  'comment',
  'arrowMarker',
  'arrowUp',
  'arrowDown',
  'priceRange',
  'dateRange',
  'anchoredVwap',
];

const FULL_SET = new Set<DrawingToolId>(FULL_TOOLS);
const APPROX_SET = new Set<DrawingToolId>(APPROX_TOOLS);

export function toolMaturity(id: DrawingToolId): ToolMaturity {
  if (FULL_SET.has(id)) return 'full';
  if (APPROX_SET.has(id)) return 'approx';
  return 'beta';
}

export function isFullTool(id: DrawingToolId): boolean {
  return toolMaturity(id) === 'full';
}

/** Tools shown in the default flyout (full only). */
export function isDefaultFlyoutTool(id: DrawingToolId): boolean {
  return isFullTool(id);
}

export function maturityBadge(id: DrawingToolId): string | null {
  const m = toolMaturity(id);
  if (m === 'approx') return 'approx';
  if (m === 'beta') return 'beta';
  return null;
}

export const SHOW_MORE_TOOLS_KEY = 'talaria.drawings.showMoreTools.v1';

export function readShowMoreTools(): boolean {
  try {
    return localStorage.getItem(SHOW_MORE_TOOLS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeShowMoreTools(on: boolean): void {
  try {
    localStorage.setItem(SHOW_MORE_TOOLS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
