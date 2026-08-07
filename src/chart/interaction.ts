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
   * `altKey` — Alt/Option+drag clones the drawing then moves the clone.
   * `additive` — Shift/Ctrl/Meta+click toggles multi-select.
   */
  beginDrawingDrag?: (
    x: number,
    y: number,
    opts?: { altKey?: boolean; additive?: boolean },
  ) => boolean;
  /** Pointer moved while a drawing drag is active. */
  moveDrawingDrag?: (x: number, y: number) => void;
  /** End drawing drag. */
  endDrawingDrag?: () => void;
  /**
   * Brush / highlighter press-drag. Return true to claim pointer (no pan).
   * Tried after drawing-drag miss, before pan.
   */
  beginFreehandStroke?: (x: number, y: number) => boolean;
  moveFreehandStroke?: (x: number, y: number) => void;
  endFreehandStroke?: (x: number, y: number) => void;
  /**
   * Zoom marquee press-drag. Return true to claim pointer (no pan).
   * Tried after freehand miss, before pan.
   */
  beginMarqueeZoom?: (x: number, y: number) => boolean;
  moveMarqueeZoom?: (x: number, y: number) => void;
  endMarqueeZoom?: (x: number, y: number) => void;
  /** Cursor while dragging a drawing (optional override). */
  getDrawingDragCursor?: () => string | null;
  /** Screen (client) coords for context menus. */
  onContextMenu?: (clientX: number, clientY: number) => void;
}

export interface InteractionHandle {
  dispose: () => void;
}

const MIN_VISIBLE = 10;
const MAX_VISIBLE = VISIBLE_BARS_TARGET;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 12;
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_PX = 10;
const PAN_ARM_PX = 3;

type DragMode =
  | 'pan'
  | 'timeZoom'
  | 'priceZoom'
  | 'drawing'
  | 'freehand'
  | 'marquee'
  | 'pinch'
  | null;

interface Ptr {
  id: number;
  x: number;
  y: number;
}

/**
 * TradingView-style zones + hover feed for crosshair.
 * Single-finger pan/zoom + two-finger pinch; long-press opens settings on touch.
 * Updates state only; never paints inline.
 */
export function attachInteraction(
  canvas: HTMLCanvasElement,
  callbacks: InteractionCallbacks,
): InteractionHandle {
  let dragMode: DragMode = null;
  /** Primary pointer for single-finger gestures. */
  let activePointerId: number | null = null;
  /** Last media coords for the active single-finger drag. */
  let lastMediaX = 0;
  let lastMediaY = 0;
  let panArmed = false;
  let drawingMoved = false;

  /** Active pointers (max 2 used for pinch). */
  const pointers = new Map<number, Ptr>();
  let pinchPrevDist = 0;
  let pinchPrevMidX = 0;
  let pinchPrevMidY = 0;

  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressX = 0;
  let longPressY = 0;
  let longPressFired = false;

  const pointerPos = (e: PointerEvent) => {
    const layout = callbacks.getLayout();
    return clientToMedia(e.clientX, e.clientY, canvas, layout.width, layout.height);
  };

  const cancelLongPress = () => {
    if (longPressTimer != null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  let longPressClientX = 0;
  let longPressClientY = 0;

  const startLongPress = (
    x: number,
    y: number,
    pointerType: string,
    clientX: number,
    clientY: number,
  ) => {
    cancelLongPress();
    longPressFired = false;
    if (pointerType !== 'touch' && pointerType !== 'pen') return;
    longPressX = x;
    longPressY = y;
    longPressClientX = clientX;
    longPressClientY = clientY;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressFired = true;
      // Cancel pending pan — settings owns this gesture
      dragMode = null;
      panArmed = false;
      try {
        if (activePointerId != null) {
          canvas.releasePointerCapture(activePointerId);
        }
      } catch {
        // already released
      }
      activePointerId = null;
      callbacks.onContextMenu?.(longPressClientX, longPressClientY);
      try {
        navigator.vibrate?.(12);
      } catch {
        // unsupported
      }
    }, LONG_PRESS_MS);
  };

  const pinchMetrics = (): { dist: number; midX: number; midY: number } | null => {
    if (pointers.size < 2) return null;
    const [a, b] = [...pointers.values()];
    if (!a || !b) return null;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    return { dist: Math.max(1, dist), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  };

  const beginPinch = () => {
    cancelLongPress();
    if (dragMode === 'drawing') {
      callbacks.endDrawingDrag?.();
    }
    const m = pinchMetrics();
    if (!m) return;
    dragMode = 'pinch';
    panArmed = true;
    pinchPrevDist = m.dist;
    pinchPrevMidX = m.midX;
    pinchPrevMidY = m.midY;
    canvas.style.cursor = 'grabbing';
    callbacks.onUserGesture?.();
  };

  const applyPinch = () => {
    const m = pinchMetrics();
    if (!m || pinchPrevDist <= 0) return;
    const layout = callbacks.getLayout();
    const plot = layout.plot;
    const range = callbacks.getRange();
    const barCount = callbacks.getBarCount();
    if (plot.width <= 0 || barCount === 0) return;

    // Fingers apart → zoom in (fewer bars); closer → zoom out
    const zoomFactor = pinchPrevDist / m.dist;
    const span = range.toIndex - range.fromIndex;
    let nextSpan = span * zoomFactor;
    nextSpan = Math.max(MIN_VISIBLE, Math.min(MAX_VISIBLE, nextSpan));

    const anchorIndex = xToIndex(m.midX, range, plot);
    const leftRatio = span > 0 ? (anchorIndex - range.fromIndex) / span : 0.5;
    let fromIndex = anchorIndex - leftRatio * nextSpan;
    let toIndex = fromIndex + nextSpan;

    // Two-finger pan from midpoint drift
    const dMidX = m.midX - pinchPrevMidX;
    const dMidY = m.midY - pinchPrevMidY;
    if (dMidX !== 0 && nextSpan > 0 && plot.width > 0) {
      const dIndex = -(dMidX / plot.width) * nextSpan;
      fromIndex += dIndex;
      toIndex += dIndex;
    }

    callbacks.setRange(clampRange({ fromIndex, toIndex }, barCount));

    if (dMidY !== 0) {
      panPriceByDrag(callbacks, dMidY, layout);
    }

    pinchPrevDist = m.dist;
    pinchPrevMidX = m.midX;
    pinchPrevMidY = m.midY;
    callbacks.onHover(m.midX, m.midY);
  };

  const setCursorForZone = (zone: HitZone, x?: number, y?: number) => {
    if (dragMode === 'drawing') {
      canvas.style.cursor =
        callbacks.getDrawingDragCursor?.() ??
        (x != null && y != null ? callbacks.getDrawingCursor?.(x, y) : null) ??
        'grabbing';
      return;
    }
    if (dragMode === 'freehand') {
      canvas.style.cursor = 'crosshair';
      return;
    }
    if (dragMode === 'marquee') {
      canvas.style.cursor = 'crosshair';
      return;
    }
    if (dragMode === 'pinch') {
      canvas.style.cursor = 'grabbing';
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

    const { x, y } = pointerPos(e);
    pointers.set(e.pointerId, { id: e.pointerId, x, y });

    // Second finger → pinch (even if first was panning)
    if (pointers.size >= 2) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      beginPinch();
      e.preventDefault();
      return;
    }

    if (activePointerId !== null) return;

    const layout = callbacks.getLayout();
    const zone = hitTestZone(x, y, layout);

    const now = performance.now();
    const isDoubleTap =
      now - lastTapAt < DOUBLE_TAP_MS &&
      Math.hypot(x - lastTapX, y - lastTapY) < DOUBLE_TAP_PX;

    if (isDoubleTap) {
      cancelLongPress();
      if (zone === 'timeAxis' || zone === 'plot') {
        callbacks.resetTimeScale();
      } else if (zone === 'priceAxis') {
        callbacks.resetPriceScale();
      }
      lastTapAt = 0;
      pointers.delete(e.pointerId);
      e.preventDefault();
      return;
    }

    lastTapAt = now;
    lastTapX = x;
    lastTapY = y;

    if (zone === 'none') {
      pointers.delete(e.pointerId);
      return;
    }

    activePointerId = e.pointerId;
    lastMediaX = x;
    lastMediaY = y;
    panArmed = false;
    drawingMoved = false;
    longPressFired = false;
    canvas.setPointerCapture(e.pointerId);

    if (zone === 'priceAxis') {
      dragMode = 'priceZoom';
    } else if (zone === 'timeAxis') {
      dragMode = 'timeZoom';
    } else if (
      zone === 'plot' &&
      callbacks.beginDrawingDrag?.(x, y, {
        altKey: e.altKey,
        additive: e.shiftKey || e.ctrlKey || e.metaKey,
      })
    ) {
      dragMode = 'drawing';
    } else if (zone === 'plot' && callbacks.beginFreehandStroke?.(x, y)) {
      dragMode = 'freehand';
      cancelLongPress();
    } else if (zone === 'plot' && callbacks.beginMarqueeZoom?.(x, y)) {
      dragMode = 'marquee';
      cancelLongPress();
    } else {
      dragMode = 'pan';
      // Long-press settings only on plot (not axes / drawing handles)
      if (zone === 'plot') startLongPress(x, y, e.pointerType, e.clientX, e.clientY);
    }

    setCursorForZone(zone, x, y);
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    const { x, y } = pointerPos(e);
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { id: e.pointerId, x, y });
    }

    if (dragMode === 'pinch') {
      applyPinch();
      e.preventDefault();
      return;
    }

    const layout = callbacks.getLayout();
    const zone = hitTestZone(x, y, layout);

    if (dragMode === null || e.pointerId !== activePointerId) {
      setCursorForZone(zone, x, y);
      if (zone === 'plot') callbacks.onHover(x, y);
      else if (e.pointerType !== 'touch') callbacks.onHover(null, null);
      return;
    }

    const dx = x - lastMediaX;
    const dy = y - lastMediaY;
    lastMediaX = x;
    lastMediaY = y;

    // Cancel long-press once the finger moves
    if (longPressTimer != null) {
      if (Math.hypot(x - longPressX, y - longPressY) >= LONG_PRESS_MOVE_PX) {
        cancelLongPress();
      }
    }
    if (longPressFired) return;

    if (dragMode === 'drawing') {
      callbacks.onHover(x, y);
      if (Math.hypot(dx, dy) >= 1) drawingMoved = true;
      callbacks.moveDrawingDrag?.(x, y);
      setCursorForZone(zone, x, y);
      return;
    }

    if (dragMode === 'freehand') {
      callbacks.onHover(x, y);
      if (Math.hypot(dx, dy) >= 1) drawingMoved = true;
      callbacks.moveFreehandStroke?.(x, y);
      setCursorForZone(zone, x, y);
      return;
    }

    if (dragMode === 'marquee') {
      if (Math.hypot(dx, dy) >= 1) drawingMoved = true;
      callbacks.moveMarqueeZoom?.(x, y);
      setCursorForZone(zone, x, y);
      return;
    }

    if (dragMode === 'pan') {
      callbacks.onHover(x, y);
      if (!panArmed) {
        if (Math.hypot(dx, dy) < PAN_ARM_PX) return;
        panArmed = true;
        cancelLongPress();
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
      zoomPriceByDrag(callbacks, dy, layout);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);

    // Still pinching with one finger left → drop to idle (don't resume pan mid-gesture)
    if (dragMode === 'pinch') {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (pointers.size >= 2) {
        beginPinch();
        return;
      }
      dragMode = null;
      activePointerId = null;
      panArmed = false;
      const rem = pointers.values().next().value as Ptr | undefined;
      if (rem) {
        // Leave second finger tracking but idle until lift
        activePointerId = rem.id;
        lastMediaX = rem.x;
        lastMediaY = rem.y;
        dragMode = null;
      }
      const layout = callbacks.getLayout();
      const pos = rem ?? pointerPos(e);
      const zone = hitTestZone(pos.x, pos.y, layout);
      setCursorForZone(zone, pos.x, pos.y);
      if (zone === 'plot') callbacks.onHover(pos.x, pos.y);
      return;
    }

    if (e.pointerId !== activePointerId) return;

    const wasPan = panArmed;
    const wasMode = dragMode;
    const wasDrawingMoved = drawingMoved;
    const wasLongPress = longPressFired;
    cancelLongPress();
    dragMode = null;
    activePointerId = null;
    panArmed = false;
    drawingMoved = false;
    longPressFired = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    const { x, y } = pointerPos(e);
    const zone = hitTestZone(x, y, callbacks.getLayout());

    if (wasLongPress) {
      // Settings already opened — don't place/select
      if (zone === 'plot') callbacks.onHover(x, y);
      return;
    }

    if (wasMode === 'drawing') {
      callbacks.endDrawingDrag?.();
      if (!wasDrawingMoved) {
        callbacks.onPlotClick?.(x, y);
      }
      setCursorForZone(zone, x, y);
      if (zone === 'plot') callbacks.onHover(x, y);
      return;
    }

    if (wasMode === 'freehand') {
      callbacks.endFreehandStroke?.(x, y);
      setCursorForZone(zone, x, y);
      if (zone === 'plot') callbacks.onHover(x, y);
      return;
    }

    if (wasMode === 'marquee') {
      callbacks.endMarqueeZoom?.(x, y);
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

  const onPointerLeave = (e: PointerEvent) => {
    if (dragMode !== null) return;
    // Touch leave is often synthetic after finger-up — keep crosshair sticky
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    callbacks.onHover(null, null);
  };

  const onDblClick = (e: MouseEvent) => {
    const layout = callbacks.getLayout();
    const { x, y } = clientToMedia(e.clientX, e.clientY, canvas, layout.width, layout.height);
    const zone = hitTestZone(x, y, layout);
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
    // Avoid double-open when long-press already fired settings
    if (longPressFired) return;
    callbacks.onContextMenu?.(e.clientX, e.clientY);
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
      cancelLongPress();
      pointers.clear();
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
