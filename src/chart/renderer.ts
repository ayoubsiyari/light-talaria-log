import type { ChartBar, VisibleRange } from '@/types/bar';
import {
  indexAtOrBeforeBars,
  timeframeSeconds,
} from '@/data/timeframeAgg';
import type { Drawing } from '@/drawings/drawingStore';
import { getChartColors, type ChartColors } from './chartTheme';
import { formatPrice, formatTime } from './format';
import { drawCrosshair } from './overlays/drawCrosshair';
import { drawDrawingEditChrome, drawDrawings } from './overlays/drawDrawings';
import { drawLastPriceLine } from './overlays/drawLastPrice';
import {
  computePriceScale,
  priceToY,
  indexToX,
  type PlotRect,
  type PriceScale,
} from './scales';
import { drawIndicators } from './series/drawIndicators';
import { drawIndicatorPane } from './series/drawIndicatorPane';
import { drawSeries, drawVolume } from './series/drawSeries';
import {
  nicePriceTicks,
  niceTimeTicks,
  type TimeLatticeSticky,
} from './ticks';
import type { ChartViewOptions, CrosshairPoint } from './types';
import type { IndicatorOverlayResult, IndicatorPaneResult } from '@/types/indicator';
import type { BacktestResult } from '@/types/backtest';
import type { ChartOrder } from '@/types/order';
import { drawBacktest } from './overlays/drawBacktest';
import { drawOrders } from './overlays/drawOrders';

/** Min CSS px between time-axis labels (grid lines still draw). */
const TIME_LABEL_MIN_GAP_PX = 56;

export interface LayoutOptions {
  showVolume?: boolean;
  /** Number of oscillator panes stacked under volume. */
  indicatorPaneCount?: number;
  showPriceScale?: boolean;
  showTimeScale?: boolean;
}

export interface RenderLayout {
  width: number;
  height: number;
  dpr: number;
  /** Main price pane */
  plot: PlotRect;
  /** Volume band under main plot (height 0 when disabled) */
  volumePlot: PlotRect;
  /** Indicator sub-panes (RSI, MACD, …) below volume */
  indicatorPlots: PlotRect[];
  priceAxisWidth: number;
  timeAxisHeight: number;
}

export const PRICE_AXIS_WIDTH = 64;
export const TIME_AXIS_HEIGHT = 28;
const PLOT_PAD_LEFT = 8;
const PLOT_PAD_TOP = 8;
const VOLUME_GAP = 4;
const VOLUME_RATIO = 0.18;
const INDICATOR_PANE_RATIO = 0.14;
const MIN_MAIN_RATIO = 0.32;

/** Bottom of all stacked content (main + volume + indicator panes). */
export function contentBottom(layout: RenderLayout): number {
  const last = layout.indicatorPlots[layout.indicatorPlots.length - 1];
  if (last && last.height > 0) return last.top + last.height;
  if (layout.volumePlot.height > 0) {
    return layout.volumePlot.top + layout.volumePlot.height;
  }
  return layout.plot.top + layout.plot.height;
}

export function createLayout(
  width: number,
  height: number,
  dpr: number,
  showVolumeOrOpts: boolean | LayoutOptions = true,
): RenderLayout {
  const opts: LayoutOptions =
    typeof showVolumeOrOpts === 'boolean'
      ? { showVolume: showVolumeOrOpts, indicatorPaneCount: 0 }
      : showVolumeOrOpts;
  const showVolume = opts.showVolume ?? true;
  const paneCount = Math.max(0, opts.indicatorPaneCount ?? 0);
  const priceAxisW = opts.showPriceScale === false ? 0 : PRICE_AXIS_WIDTH;
  const timeAxisH = opts.showTimeScale === false ? 0 : TIME_AXIS_HEIGHT;

  const contentH = Math.max(0, height - PLOT_PAD_TOP - timeAxisH);
  const contentW = Math.max(0, width - PLOT_PAD_LEFT - priceAxisW);

  let volumeH = showVolume ? Math.floor(contentH * VOLUME_RATIO) : 0;
  let paneH = paneCount > 0 ? Math.floor(contentH * INDICATOR_PANE_RATIO) : 0;
  // Keep main plot usable on short mobile viewports
  const gaps =
    (showVolume ? VOLUME_GAP : 0) + (paneCount > 0 ? VOLUME_GAP * paneCount : 0);
  let reserved = volumeH + paneH * paneCount + gaps;
  const minMain = Math.floor(contentH * MIN_MAIN_RATIO);
  if (contentH - reserved < minMain && reserved > 0) {
    const scale = Math.max(0, (contentH - minMain - gaps) / Math.max(1, volumeH + paneH * paneCount));
    volumeH = showVolume ? Math.floor(volumeH * scale) : 0;
    paneH = paneCount > 0 ? Math.max(28, Math.floor(paneH * scale)) : 0;
    reserved = volumeH + paneH * paneCount + gaps;
  }
  const mainH = Math.max(0, contentH - reserved);

  const plot: PlotRect = {
    left: PLOT_PAD_LEFT,
    top: PLOT_PAD_TOP,
    width: contentW,
    height: mainH,
  };

  let y = PLOT_PAD_TOP + mainH;
  const volumePlot: PlotRect = {
    left: PLOT_PAD_LEFT,
    top: y + (showVolume && volumeH > 0 ? VOLUME_GAP : 0),
    width: contentW,
    height: volumeH,
  };
  if (showVolume && volumeH > 0) y = volumePlot.top + volumeH;

  const indicatorPlots: PlotRect[] = [];
  for (let i = 0; i < paneCount; i++) {
    y += VOLUME_GAP;
    indicatorPlots.push({
      left: PLOT_PAD_LEFT,
      top: y,
      width: contentW,
      height: paneH,
    });
    y += paneH;
  }

  return {
    width,
    height,
    dpr,
    plot,
    volumePlot,
    indicatorPlots,
    priceAxisWidth: priceAxisW,
    timeAxisHeight: timeAxisH,
  };
}

export type HitZone = 'plot' | 'timeAxis' | 'priceAxis' | 'none';

export function hitTestZone(x: number, y: number, layout: RenderLayout): HitZone {
  const { plot, width, height, priceAxisWidth, timeAxisHeight } = layout;
  const priceLeft = width - priceAxisWidth;
  const timeTop = height - timeAxisHeight;
  const plotBottom = contentBottom(layout);

  if (x >= priceLeft && y >= plot.top && y <= plotBottom) {
    return 'priceAxis';
  }
  if (y >= timeTop && x >= plot.left && x <= plot.left + plot.width) {
    return 'timeAxis';
  }
  if (x >= plot.left && x <= plot.left + plot.width && y >= plot.top && y <= plotBottom) {
    return 'plot';
  }
  return 'none';
}

export interface PaintState {
  bars: readonly ChartBar[];
  range: VisibleRange;
  priceScale: PriceScale;
  options: ChartViewOptions;
  crosshair: CrosshairPoint | null;
  drawings?: readonly Drawing[];
  draftDrawing?: Drawing | null;
  selectedDrawingId?: string | null;
  /** Multi-select (preferred). Falls back to selectedDrawingId. */
  selectedDrawingIds?: readonly string[] | null;
  hoveredDrawingId?: string | null;
  drawingsHidden?: boolean;
  /** Pane TF — filters drawings with per-interval visibility. */
  paneTimeframe?: import('@/types/ui').Timeframe | null;
  /** Per-engine zoom density sticky for the time lattice. */
  timeLatticeSticky?: TimeLatticeSticky;
  replayCursorTime?: number | null;
  indicators?: readonly IndicatorOverlayResult[];
  indicatorPanes?: readonly IndicatorPaneResult[];
  orders?: readonly ChartOrder[];
  selectedOrderId?: string | null;
  /** Strategy backtest markers / equity (outside engine). */
  backtestResult?: BacktestResult | null;
  /** Zoom marquee rubber-band in media coords. */
  marquee?: { x0: number; y0: number; x1: number; y1: number } | null;
}

/**
 * Series scene: grid → series → volume → indicator overlays/panes → last price → axes.
 * Cached; pan/zoom/data invalidate this layer.
 */
export function paintBaseFrame(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  state: PaintState,
  colors: ChartColors = getChartColors(),
): void {
  const { width, height, dpr, plot } = layout;
  const { bars, range, priceScale, options, replayCursorTime, indicators, indicatorPanes } =
    state;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  if (bars.length === 0 || range.toIndex <= range.fromIndex || plot.width <= 0 || plot.height <= 0) {
    return;
  }

  // Load-time reveal should truncate; maxBarIndex remains a safety net + DEV assert.
  const maxBarIndex =
    replayCursorTime != null ? indexAtOrBeforeBars(bars, replayCursorTime) : null;
  if (
    import.meta.env?.DEV &&
    replayCursorTime != null &&
    maxBarIndex != null &&
    maxBarIndex < bars.length - 1
  ) {
    console.warn('[reveal] paint-mask fallback active', {
      bars: bars.length,
      maxBarIndex,
      lastTime: bars[bars.length - 1]?.time,
      cursorTime: replayCursorTime,
    });
  }
  const scale =
    priceScale.min < priceScale.max
      ? priceScale
      : computePriceScale(bars, range, maxBarIndex);

  const priceTicks = nicePriceTicks(scale.min, scale.max, 6);
  const barPeriod =
    state.paneTimeframe != null
      ? timeframeSeconds(state.paneTimeframe)
      : undefined;
  const timeTicks = niceTimeTicks(range, bars, 8, {
    barPeriod,
    sticky: state.timeLatticeSticky,
  });

  drawGrid(ctx, layout, scale, range, priceTicks, timeTicks, colors);
  drawWatermark(ctx, layout, colors, options.showBrandWatermark !== false);
  drawSeries(ctx, bars, range, plot, scale, colors, options.seriesType, maxBarIndex);

  if (indicators?.length) {
    drawIndicators(ctx, indicators, bars, range, plot, scale, maxBarIndex);
  }

  if (options.showVolume && layout.volumePlot.height > 0) {
    drawVolume(
      ctx,
      bars,
      range,
      layout.volumePlot,
      colors,
      options.volumeOpacity,
      maxBarIndex,
    );
  }

  if (indicatorPanes?.length) {
    const count = Math.min(indicatorPanes.length, layout.indicatorPlots.length);
    for (let i = 0; i < count; i++) {
      const panePlot = layout.indicatorPlots[i]!;
      drawIndicatorPane(
        ctx,
        indicatorPanes[i]!,
        panePlot,
        bars,
        range,
        maxBarIndex,
        colors,
      );
    }
  }

  if (layout.priceAxisWidth > 0) {
    drawPriceAxis(ctx, layout, scale, priceTicks, colors);
  }
  if (layout.timeAxisHeight > 0) {
    drawTimeAxis(ctx, layout, range, timeTicks, colors);
  }

  // Last-price chip must paint AFTER the axis fill or it is covered.
  if (options.showLastPrice && colors.showLastPrice) {
    const lastIdx = maxBarIndex ?? bars.length - 1;
    const last = lastIdx >= 0 ? bars[lastIdx] : undefined;
    if (last) drawLastPriceLine(ctx, layout, last, scale, colors);
  }
}

/**
 * Committed drawing bodies + orders/backtest.
 * Handles / badges live on the overlay so hover never rebuilds this cache.
 */
export function paintDrawingsFrame(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  state: PaintState,
  colors: ChartColors = getChartColors(),
  opts: { clear?: boolean } = {},
): void {
  const { width, height, dpr, plot } = layout;
  const {
    bars,
    range,
    priceScale,
    drawings,
    drawingsHidden,
    paneTimeframe,
    replayCursorTime,
    orders,
    selectedOrderId,
    backtestResult,
  } = state;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (opts.clear !== false) {
    ctx.clearRect(0, 0, width, height);
  }

  if (bars.length === 0 || range.toIndex <= range.fromIndex || plot.width <= 0 || plot.height <= 0) {
    return;
  }

  const maxBarIndex =
    replayCursorTime != null ? indexAtOrBeforeBars(bars, replayCursorTime) : null;
  const scale =
    priceScale.min < priceScale.max
      ? priceScale
      : computePriceScale(bars, range, maxBarIndex);

  if (!drawingsHidden && drawings?.length) {
    drawDrawings(
      ctx,
      drawings,
      bars,
      range,
      plot,
      scale,
      colors,
      null,
      null,
      false,
      null,
      paneTimeframe ?? null,
      null,
      'bodies',
    );
  }

  // Orders / backtest: cached with drawings so crosshair moves stay overlay-cheap.
  if (backtestResult) {
    drawBacktest(
      ctx,
      backtestResult,
      bars,
      range,
      plot,
      scale,
      colors,
      selectedOrderId ?? null,
      replayCursorTime ?? null,
    );
  }

  if (orders?.length) {
    drawOrders(ctx, orders, plot, scale, colors, selectedOrderId ?? null, {
      bars,
      range,
      width: layout.width,
      priceAxisWidth: layout.priceAxisWidth,
    });
  }
}

/**
 * Edit chrome + draft + marquee + crosshair — cheap path for pointer moves.
 */
export function paintOverlayFrame(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  state: PaintState,
  colors: ChartColors = getChartColors(),
): void {
  const { plot, dpr } = layout;
  const {
    bars,
    range,
    priceScale,
    options,
    crosshair,
    draftDrawing,
    drawings,
    selectedDrawingId,
    selectedDrawingIds,
    hoveredDrawingId,
    drawingsHidden,
    paneTimeframe,
    replayCursorTime,
    marquee,
  } = state;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (bars.length === 0 || range.toIndex <= range.fromIndex || plot.width <= 0 || plot.height <= 0) {
    return;
  }

  const maxBarIndex =
    replayCursorTime != null ? indexAtOrBeforeBars(bars, replayCursorTime) : null;
  const scale =
    priceScale.min < priceScale.max
      ? priceScale
      : computePriceScale(bars, range, maxBarIndex);

  const ids =
    selectedDrawingIds && selectedDrawingIds.length > 0
      ? selectedDrawingIds
      : selectedDrawingId
        ? [selectedDrawingId]
        : [];

  if (!drawingsHidden && drawings?.length) {
    drawDrawingEditChrome(
      ctx,
      drawings,
      bars,
      range,
      plot,
      scale,
      colors,
      ids,
      hoveredDrawingId ?? null,
      paneTimeframe ?? null,
      {
        width: layout.width,
        height: layout.height,
        priceAxisWidth: layout.priceAxisWidth,
        timeAxisHeight: layout.timeAxisHeight,
      },
    );
  }

  if (draftDrawing) {
    drawDrawings(
      ctx,
      [],
      bars,
      range,
      plot,
      scale,
      colors,
      draftDrawing,
      null,
      false,
      null,
      null,
      null,
      'all',
    );
  }

  if (marquee) {
    const left = Math.min(marquee.x0, marquee.x1);
    const top = Math.min(marquee.y0, marquee.y1);
    const w = Math.abs(marquee.x1 - marquee.x0);
    const h = Math.abs(marquee.y1 - marquee.y0);
    ctx.save();
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(left, top, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (crosshair && options.crosshairMode !== 'hidden') {
    drawCrosshair(ctx, layout, crosshair, colors);
  }
}

/** Full paint (tests / fallback) — series → drawings → overlay. */
export function paintFrame(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  state: PaintState,
  colors: ChartColors = getChartColors(),
): void {
  paintBaseFrame(ctx, layout, state, colors);
  paintDrawingsFrame(ctx, layout, state, colors, { clear: false });
  paintOverlayFrame(ctx, layout, state, colors);
}

export { computePriceScale };

function dashFor(style: ChartColors['gridHStyle']): number[] {
  if (style === 'dashed') return [5, 4];
  if (style === 'dotted') return [1.5, 3];
  return [];
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  priceScale: PriceScale,
  range: VisibleRange,
  priceTicks: number[],
  timeTicks: { index: number; alpha?: number }[],
  colors: ChartColors,
): void {
  const { plot } = layout;
  ctx.lineWidth = 1;
  const gridBottom = contentBottom(layout);

  if (colors.showGridH) {
    ctx.strokeStyle = colors.gridHorizontal;
    ctx.setLineDash(dashFor(colors.gridHStyle));
    for (const price of priceTicks) {
      const y = Math.round(priceToY(price, priceScale, plot)) + 0.5;
      if (y < plot.top || y > plot.top + plot.height) continue;
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.left + plot.width, y);
      ctx.stroke();
    }
  }

  if (colors.showGridV) {
    ctx.strokeStyle = colors.gridVertical;
    ctx.setLineDash(dashFor(colors.gridVStyle));
    // Paint faint minors first, then majors on top.
    const ordered = timeTicks
      .map((t, i) => ({ t, i, a: t.alpha ?? 1 }))
      .filter((x) => x.a >= 0.02)
      .sort((u, v) => u.a - v.a || u.i - v.i);
    for (const { t, a } of ordered) {
      // Same X as candle center (no Math.round — that snapped 1px while zooming).
      const x = indexToX(t.index, range, plot) + 0.5;
      if (x < plot.left || x > plot.left + plot.width) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, gridBottom);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.setLineDash([]);
}

function drawPriceAxis(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  priceScale: PriceScale,
  priceTicks: number[],
  colors: ChartColors,
): void {
  const { plot, width, priceAxisWidth } = layout;
  const axisX = width - priceAxisWidth;

  ctx.fillStyle = colors.background;
  ctx.fillRect(axisX, 0, priceAxisWidth, layout.height);

  ctx.strokeStyle = colors.border;
  ctx.beginPath();
  ctx.moveTo(axisX + 0.5, plot.top);
  ctx.lineTo(axisX + 0.5, plot.top + plot.height);
  ctx.stroke();

  ctx.fillStyle = colors.axisText;
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (const price of priceTicks) {
    const y = priceToY(price, priceScale, plot);
    if (y < plot.top - 4 || y > plot.top + plot.height + 4) continue;
    ctx.fillText(formatPrice(price), axisX + 6, y);
  }
}

function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  range: VisibleRange,
  timeTicks: { index: number; time: number; alpha?: number; label?: boolean }[],
  colors: ChartColors,
): void {
  const { plot, height, timeAxisHeight, width } = layout;
  const axisY = height - timeAxisHeight;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, axisY, width, timeAxisHeight);

  ctx.strokeStyle = colors.border;
  ctx.beginPath();
  ctx.moveTo(plot.left, axisY + 0.5);
  ctx.lineTo(plot.left + plot.width, axisY + 0.5);
  ctx.stroke();

  ctx.fillStyle = colors.axisText;
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let lastLabel = '';
  let lastLabelX = Number.NEGATIVE_INFINITY;
  for (const tick of timeTicks) {
    // Solid (at-or-coarser) ticks only — fading denser lines must not steal labels.
    if (tick.label === false) continue;
    if ((tick.alpha ?? 1) < 0.95) continue;
    const x = indexToX(tick.index, range, plot);
    if (x < plot.left || x > plot.left + plot.width) continue;
    if (x - lastLabelX < TIME_LABEL_MIN_GAP_PX) continue;
    const label = formatTime(tick.time);
    if (label === lastLabel) continue;
    lastLabel = label;
    lastLabelX = x;
    ctx.fillText(label, x, axisY + 8);
  }
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  layout: RenderLayout,
  colors: ChartColors,
  showBrand: boolean,
): void {
  const { plot } = layout;
  if (plot.width < 40 || plot.height < 24) return;

  ctx.save();

  // Always-on brand — primary pane only (multi-chart: top-left / first pane).
  // Canvas text only — never decode/draw the logo PNG here.
  if (showBrand) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = colors.muted;
    ctx.font = '700 28px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Talaria Log', plot.left + 14, plot.top + plot.height - 12);
  }

  // Optional custom watermark (settings) — primary pane only, centered.
  if (showBrand && colors.watermarkEnabled) {
    const text = colors.watermarkText.trim();
    if (text) {
      ctx.globalAlpha = colors.watermarkOpacity;
      ctx.fillStyle = colors.watermarkColor;
      ctx.font = `600 ${colors.watermarkFontSize}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, plot.left + plot.width / 2, plot.top + plot.height / 2);
    }
  }

  ctx.restore();
}
