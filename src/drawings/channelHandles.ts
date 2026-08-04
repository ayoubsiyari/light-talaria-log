import { logicalIndexAtTime } from '@/data/timeframeAgg';
import { indexToX, priceToY, xToIndex, yToPrice, type PlotRect, type PriceScale } from '@/chart/scales';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { DrawingPoint } from './drawingStore';
import type { DrawingToolId } from './toolRegistry';

/** Synthetic handle: mid of opposite rail (width control). */
export const CHANNEL_WIDTH_HANDLE = 3;

export function isChannelTool(type: DrawingToolId): boolean {
  return type === 'parallelChannel' || type === 'flatTopBottom';
}

export function isChannelWidthHandle(handleIndex: number): boolean {
  return handleIndex === CHANNEL_WIDTH_HANDLE;
}

export function channelWidthHandleXY(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  flat: boolean,
): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = flat ? 0 : b.y - a.y;
  return { x: c.x + dx / 2, y: c.y + dy / 2 };
}

/**
 * Drag width handle: move point C so the opposite rail passes through the pointer,
 * keeping C's projection along the base line fixed.
 */
export function applyChannelWidthDrag(
  points: readonly DrawingPoint[],
  mediaX: number,
  mediaY: number,
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  flat: boolean,
): DrawingPoint[] {
  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  if (!p0 || !p1 || !p2 || bars.length === 0) return [...points];

  const a = {
    x: indexToX(logicalIndexAtTime(bars, p0.time), range, plot),
    y: priceToY(p0.price, priceScale, plot),
  };
  const b = {
    x: indexToX(logicalIndexAtTime(bars, p1.time), range, plot),
    y: priceToY(p1.price, priceScale, plot),
  };
  const c0 = {
    x: indexToX(logicalIndexAtTime(bars, p2.time), range, plot),
    y: priceToY(p2.price, priceScale, plot),
  };

  const abx = b.x - a.x;
  const aby = flat ? 0 : b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return [...points];

  // Keep C's along-base parameter; set perpendicular distance from pointer.
  const t = ((c0.x - a.x) * abx + (c0.y - a.y) * aby) / len2;
  const len = Math.sqrt(len2);
  const px = flat ? 0 : -aby / len;
  const py = flat ? (mediaY >= a.y ? 1 : -1) : abx / len;
  const dist = flat
    ? mediaY - (a.y + t * aby)
    : (mediaX - a.x) * px + (mediaY - a.y) * py;

  const nx = a.x + t * abx + dist * px;
  const ny = a.y + t * aby + dist * py;
  const idx = xToIndex(nx, range, plot);
  const i0 = Math.max(0, Math.min(bars.length - 1, Math.floor(idx)));
  const i1 = Math.max(0, Math.min(bars.length - 1, Math.ceil(idx)));
  const bar0 = bars[i0]!;
  const bar1 = bars[i1]!;
  const frac = i1 === i0 ? 0 : idx - i0;
  const time = bar0.time + (bar1.time - bar0.time) * frac;
  const price = yToPrice(ny, priceScale, plot);

  return [p0, p1, { time, price }];
}
