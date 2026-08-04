import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Drawing } from '@/drawings/drawingStore';
import { paintAllDrawings } from '@/drawings/paint/paintDrawing';
import type { Timeframe } from '@/types/ui';
import type { ChartColors } from '../chartTheme';
import type { PlotRect, PriceScale } from '../scales';

/** Paint drawings using time/price anchors (stable across pan/zoom/TF). */
export function drawDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: readonly Drawing[],
  bars: readonly ChartBar[],
  range: VisibleRange,
  plot: PlotRect,
  priceScale: PriceScale,
  _colors: ChartColors,
  draft: Drawing | null,
  selectedId: string | null = null,
  hidden = false,
  hoveredId: string | null = null,
  paneTf: Timeframe | null = null,
): void {
  paintAllDrawings(
    ctx,
    drawings,
    bars,
    range,
    plot,
    priceScale,
    draft,
    selectedId,
    hidden,
    hoveredId,
    _colors,
    paneTf,
  );
}
