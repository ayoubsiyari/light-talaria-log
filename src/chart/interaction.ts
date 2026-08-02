import type { VisibleRange } from '@/types/bar';
import { VISIBLE_BARS_TARGET } from '@/utils/constants';
import { clientToMedia } from './coords';
import { hitTestZone, type HitZone, type RenderLayout } from './renderer';
import { xToIndex, type PriceScale } from './scales';

export interface InteractionCallbacks {
  getRange: () => VisibleRange;
  setRange: (range: VisibleRange) => void;
  getLayout: () => RenderLayout;
  getBarCount: () => number;
  getPriceScale: () => PriceScale;
  setManualPriceScale: (scale: PriceScale) => void;
  resetPriceScale: () => void;
  resetTimeScale: () => void;
  /** Hover on plot (media coords). null when leave / outside plot. */
  onHover: (x: number | null, y: number | null) => void;
  /** Click on plot without a pan (drawing tools). */
  onPlotClick?: (x: number, y: number) => void;
  /** User started panning/zooming the plot or axes (detach replay camera). */
  onUserGesture?: () => void;
  /**
   * Cursor when pointer is over a drawable (move / resize).
   * Return null to keep plot crosshair cursor.
   */
  getDrawingCursor?: (x: number, y: number) => string | null;
  /**
   * Start move/resize on a drawing. Return true to claim the pointer (no chart pan).
   */
  beginDrawingDrag?: (x: number, y: number) => boolean;
  /** Pointer moved while a drawing drag is active. */
  moveDrawingDrag?: (x: number, y: number) => void;
  /** End drawing drag. */
  endDrawingDrag?: () => void;
  /** Cursor while dragging a drawing (optional override). */
  getDrawingDragCursor?: () => string | null;
  /** Right-click / context menu on the canvas (media coords). */
  onContextMenu?: (x: number, y: number) => void;
}

export interface InteractionHandle {
  dispose: () => void;
}

const MIN_VISIBLE = 10;
const MAX_VISIBLE = VISIBLE_BARS_TARGET;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 12;

type DragMode = 'pan' | 'timeZoom' | 'priceZoom' | 'drawing' | null;

/**
 * TradingView-style zones + hover feed for crosshair.
 * Updates state only; never paints inline.
 */
export function attachInteraction(
  canvas: HTMLCanvasElement,
  callbacks: InteractionCallbacks,
): InteractionHandle {
  let dragMode: DragMode = null;
  /** Last pointer in media (layout) coords — must match plot.width units for pan. */
  let lastMediaX = 0;
  let lastMediaY = 0;
  let activePointerId: number | null = null;
  let panArmed = false;
  let drawingMoved = false;

  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const pointerPos = (e: PointerEvent) => {
    const layout = callbacks.getLayout();
    return clientToMedia(e.clientX, e.clientY, canvas, layout.width, layout.height);
  };

  const setCursorForZone = (zone: HitZone, x?: number, y?: number) => {
    if (dragMode === 'drawing') {
      canvas.style.cursor =
        callbacks.getDrawingDragCursor?.() ??
        (x != null && y != null ? callbacks.getDrawingCursor?.(x, y) : null) ??
        'grabbing';
      return;
    }
    if (dragMode === 'timeZoom') {
      canvas.style.cursor = 'ew-resize';
      return;
    }
    if (dragMode === 'priceZoom') {
      canvas.style.cursor = 'ns-resize';
      return;
    }
    switch (zone) {
      case 'priceAxis':
        canvas.style.cursor = 'ns-resize';
        break;
      case 'timeAxis':
        canvas.style.cursor = 'ew-resize';
        break;
      case 'plot': {
        if (x != null && y != null) {
          const drawingCursor = callbacks.getDrawingCursor?.(x, y);
          if (drawingCursor) {
            canvas.style.cursor = drawingCursor;
            break;
          }
        }
        // Hide system cursor — drawn crosshair is the pointer center
        canvas.style.cursor = 'none';
        break;
      }
      default:
        canvas.style.cursor = 'default';
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    // Only primary button pans / draws — right-click opens settings via contextmenu.
    if (e.button !== 0) return;
    if (activePointerId !== null) return;
    const { x, y } = pointerPos(e);
    const layout = callbacks.getLayout();
    const zone = hitTestZone(x, y, layout);

    const now = performance.now();
    const isDoubleTap =
      now - lastTapAt < DOUBLE_TAP_MS &&
      Math.hypot(x - lastTapX, y - lastTapY) < DOUBLE_TAP_PX;

    if (isDoubleTap) {
      if (zone === 'timeAxis' || zone === 'plot') {
        callbacks.resetTimeScale(); // centers live candle + resets price
      } else if (zone === 'priceAxis') {
        callbacks.resetPriceScale();
      }
      lastTapAt = 0;
      e.preventDefault();
      return;
    }

    lastTapAt = now;
    lastTapX = x;
    lastTapY = y;

    if (zone === 'none') return;

    activePointerId = e.pointerId;
    lastMediaX = x;
    lastMediaY = y;
    panArmed = false;
    drawingMoved = false;
    canvas.setPointerCapture(e.pointerId);

    if (zone === 'priceAxis') {
      dragMode = 'priceZoom';
    } else if (zone === 'timeAxis') {
      dragMode = 'timeZoom';
    } else if (zone === 'plot' && callbacks.beginDrawingDrag?.(x, y)) {
      dragMode = 'drawing';
    } else {
      dragMode = 'pan';
    }

    setCursorForZone(zone, x, y);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    const { x, y } = pointerPos(e);
    const layout = callbacks.getLayout();
    const zone = hitTestZone(x, y, layout);

    if (dragMode === null || e.pointerId !== activePointerId) {
      setCursorForZone(zone, x, y);
      if (zone === 'plot') callbacks.onHover(x, y);
      else callbacks.onHover(null, null);
      return;
    }

    const dx = x - lastMediaX;
    const dy = y - lastMediaY;
    lastMediaX = x;
    lastMediaY = y;

    if (dragMode === 'drawing') {
      callbacks.onHover(x, y);
      if (Math.hypot(dx, dy) >= 1) drawingMoved = true;
      callbacks.moveDrawingDrag?.(x, y);
      setCursorForZone(zone, x, y);
      return;
    }

    // Plot drag: horizontal = time pan, vertical = price pan (TradingView)
    if (dragMode === 'pan') {
      callbacks.onHover(x, y);
      // Require a few px before pan so click doesn't jitter the chart
      if (!panArmed) {
        if (Math.hypot(dx, dy) < 3) return;
        panArmed = true;
        canvas.style.cursor = 'grabbing';
        callbacks.onUserGesture?.();
      }
      if (dx === 0 && dy === 0) return;

      if (dx !== 0) {
        const plot = layout.plot;
        const range = callbacks.getRange();
        const span = range.toIndex - range.fromIndex;
        if (plot.width > 0 && span > 0) {
          const dIndex = -(dx / plot.width) * span;
          callbacks.setRange(
            clampRange(
              {
                fromIndex: range.fromIndex + dIndex,
                toIndex: range.toIndex + dIndex,
              },
              callbacks.getBarCount(),
            ),
          );
        }
      }
      if (dy !== 0) {
        panPriceByDrag(callbacks, dy, layout);
      }
      return;
    }

    if (dragMode === 'timeZoom') {
      if (dx === 0) return;
      callbacks.onUserGesture?.();
      zoomTimeByDrag(callbacks, dx);
      return;
    }

    if (dragMode === 'priceZoom') {
      if (dy === 0) return;
      callbacks.onUserGesture?.();
      // Price axis: zoom (pinch scale), not pan
      zoomPriceByDrag(callbacks, dy, layout);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    const wasPan = panArmed;
    const wasMode = dragMode;
    const wasDrawingMoved = drawingMoved;
    dragMode = null;
    activePointerId = null;
    panArmed = false;
    drawingMoved = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    const { x, y } = pointerPos(e);
    const zone = hitTestZone(x, y, callbacks.getLayout());

    if (wasMode === 'drawing') {
      callbacks.endDrawingDrag?.();
      // Click without drag still counts as plot click (select / place)
      if (!wasDrawingMoved) {
        callbacks.onPlotClick?.(x, y);
      }
      setCursorForZone(zone, x, y);
      if (zone === 'plot') callbacks.onHover(x, y);
      return;
    }

    setCursorForZone(zone, x, y);
    if (zone === 'plot') {
      callbacks.onHover(x, y);
      if (!wasPan && wasMode === 'pan') {
        callbacks.onPlotClick?.(x, y);
      }
    }
  };

  const onPointerLeave = () => {
    if (dragMode !== null) return;
    callbacks.onHover(null, null);
  };

  const onDblClick = (e: MouseEvent) => {
    const layout = callbacks.getLayout();
    const { x, y } = clientToMedia(e.clientX, e.clientY, canvas, layout.width, layout.height);
    const zone = hitTestZone(x, y, layout);
    // Plot / time axis: recenter on live candle. Price axis: price scale only.
    if (zone === 'timeAxis' || zone === 'plot') callbacks.resetTimeScale();
    else if (zone === 'priceAxis') callbacks.resetPriceScale();
    e.preventDefault();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const layout = callbacks.getLayout();
    const plot = layout.plot;
    const range = callbacks.getRange();
    const barCount = callbacks.getBarCount();
    if (plot.width <= 0 || barCount === 0) return;

    const { x, y } = clientToMedia(e.clientX, e.clientY, canvas, layout.width, layout.height);
    const zone = hitTestZone(x, y, layout);

    callbacks.onUserGesture?.();

    if (zone === 'priceAxis') {
      const scale = callbacks.getPriceScale();
      const mid = (scale.min + scale.max) / 2;
      const half = (scale.max - scale.min) / 2;
      const factor = e.deltaY > 0 ? 1.08 : 1 / 1.08;
      const nextHalf = Math.max(half * factor, Number.EPSILON * 1000);
      callbacks.setManualPriceScale({ min: mid - nextHalf, max: mid + nextHalf });
      return;
    }

    const anchorIndex = xToIndex(x, range, plot);
    const span = range.toIndex - range.fromIndex;
    const zoomFactor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    let nextSpan = span * zoomFactor;
    nextSpan = Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, nextSpan));

    const leftRatio = span > 0 ? (anchorIndex - range.fromIndex) / span : 0.5;
    const fromIndex = anchorIndex - leftRatio * nextSpan;
    const toIndex = fromIndex + nextSpan;
    callbacks.setRange(clampRange({ fromIndex, toIndex }, barCount));

    if (zone === 'plot') callbacks.onHover(x, y);
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const layout = callbacks.getLayout();
    const { x, y } = clientToMedia(
      e.clientX,
      e.clientY,
      canvas,
      layout.width,
      layout.height,
    );
    callbacks.onContextMenu?.(x, y);
  };

  canvas.style.cursor = 'default';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('dblclick', onDblClick);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    dispose: () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('dblclick', onDblClick);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}

function zoomTimeByDrag(callbacks: InteractionCallbacks, dx: number): void {
  const range = callbacks.getRange();
  const barCount = callbacks.getBarCount();
  const span = range.toIndex - range.fromIndex;
  const mid = (range.fromIndex + range.toIndex) / 2;
  const factor = dx > 0 ? 1.02 : 1 / 1.02;
  let nextSpan = span * factor;
  nextSpan = Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, nextSpan));
  callbacks.setRange(
    clampRange({ fromIndex: mid - nextSpan / 2, toIndex: mid + nextSpan / 2 }, barCount),
  );
}

function zoomPriceByDrag(
  callbacks: InteractionCallbacks,
  dy: number,
  layout: RenderLayout,
): void {
  const scale = callbacks.getPriceScale();
  const mid = (scale.min + scale.max) / 2;
  const half = (scale.max - scale.min) / 2;
  const factor = dy > 0 ? 1.02 : 1 / 1.02;
  const nextHalf = Math.max(half * factor, Number.EPSILON * 1000);
  void layout;
  callbacks.setManualPriceScale({ min: mid - nextHalf, max: mid + nextHalf });
}

function panPriceByDrag(
  callbacks: InteractionCallbacks,
  dy: number,
  layout: RenderLayout,
): void {
  const scale = callbacks.getPriceScale();
  const plotH = layout.plot.height;
  if (plotH <= 0) return;
  const span = scale.max - scale.min;
  const dPrice = (dy / plotH) * span;
  callbacks.setManualPriceScale({
    min: scale.min + dPrice,
    max: scale.max + dPrice,
  });
}

function clampRange(range: VisibleRange, barCount: number): VisibleRange {
  if (barCount <= 0) return { fromIndex: 0, toIndex: 1 };

  let span = range.toIndex - range.fromIndex;
  span = Math.max(MIN_VISIBLE, Math.min(span, MAX_VISIBLE));

  let fromIndex = range.fromIndex;
  let toIndex = fromIndex + span;

  // Allow left empty space (replay right-align) and light right overscroll for pan
  const minFrom = -(span - MIN_VISIBLE);
  const maxTo = barCount + (span - MIN_VISIBLE);

  if (toIndex > maxTo) {
    toIndex = maxTo;
    fromIndex = toIndex - span;
  }
  if (fromIndex < minFrom) {
    fromIndex = minFrom;
    toIndex = fromIndex + span;
  }

  return { fromIndex, toIndex };
}

export const DEFAULT_VISIBLE_BARS = 120;
