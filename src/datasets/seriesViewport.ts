import { chunkIndexForTime } from '@/data/barIndex';
import { getBarsInRange, getChunk, getSeriesMeta, openDb, unpackBuffer } from '@/data/idbStore';
import {
  timeRangeFromVisible,
  visibleRangeFromTimeWindow,
} from '@/data/timeframeAgg';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { BUFFER_BARS, MAX_BARS_IN_MEMORY, VISIBLE_BARS_TARGET } from '@/utils/constants';
import { isNearBufferEdge } from '@/utils/viewportEdge';

export interface ViewportLoadResult {
  bars: ChartBar[];
  range: VisibleRange;
  /** Global index of bars[0] */
  windowFrom: number;
  totalBars: number;
  timeStart: number;
  timeEnd: number;
}

export interface PaneBufferSnapshot {
  bars: readonly ChartBar[];
  windowFrom: number;
  totalBars: number;
}

/**
 * True when the wall-clock window sits near a buffer edge (or the pane is empty).
 * Used by App sync reload to skip IDB while the current window still covers pan.
 */
export function paneNeedsViewportPrefetch(
  pane: PaneBufferSnapshot,
  fromTime: number,
  toTime: number,
): boolean {
  const { bars, windowFrom, totalBars } = pane;
  if (bars.length === 0 || totalBars <= 0) return true;

  const range = visibleRangeFromTimeWindow(bars, fromTime, toTime);
  if (
    isNearBufferEdge({
      localFrom: range.fromIndex,
      localTo: range.toIndex,
      bufferLen: bars.length,
      windowFrom,
      totalBars,
    })
  ) {
    return true;
  }
  // Buffer's first candle is already after the requested left edge → need older.
  if (bars[0]!.time > fromTime) return true;
  return false;
}

/** Logical index at-or-before time within a series. */
export async function timeToLogicalIndex(
  datasetId: string,
  timeframe: Timeframe,
  timeSec: number,
): Promise<number> {
  const db = await openDb();
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  if (!meta || meta.rowCount === 0) return 0;

  const cIdx = chunkIndexForTime(meta, timeSec);
  const buffer = await getChunk(db, meta.chunkIds[cIdx]!);
  if (!buffer) return meta.chunkStarts[cIdx] ?? 0;
  const store = unpackBuffer(buffer);
  const chunkStart = meta.chunkStarts[cIdx]!;

  let lo = 0;
  let hi = store.length - 1;
  if (timeSec <= store.time[0]!) return chunkStart;
  if (timeSec >= store.time[hi]!) return chunkStart + hi;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = store.time[mid]!;
    if (t === timeSec) return chunkStart + mid;
    if (t < timeSec) lo = mid + 1;
    else hi = mid - 1;
  }
  return chunkStart + Math.max(0, hi);
}

export interface ViewportLoadOpts {
  /**
   * Fraction of the IDB window placed *ahead* of the anchor (0–0.9).
   * Default 0.05 matches interactive pan (small right pad).
   * Replay fill-ahead should use a higher ratio with a *smaller* windowBars
   * so we gain runway without growing resident memory.
   */
  aheadRatio?: number;
  /** Cap on bars loaded from IDB (≤ MAX_BARS_IN_MEMORY). */
  windowBars?: number;
}

/**
 * Load a chart viewport ending at anchorTime (or series end), ≤ MAX_BARS_IN_MEMORY.
 */
export async function loadViewportAroundTime(
  datasetId: string,
  timeframe: Timeframe,
  anchorTime: number | null,
  visibleBars = VISIBLE_BARS_TARGET,
  opts?: ViewportLoadOpts,
): Promise<ViewportLoadResult> {
  const db = await openDb();
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  if (!meta || meta.rowCount === 0) {
    return {
      bars: [],
      range: { fromIndex: 0, toIndex: 1 },
      windowFrom: 0,
      totalBars: 0,
      timeStart: 0,
      timeEnd: 0,
    };
  }

  const anchorIdx =
    anchorTime != null
      ? await timeToLogicalIndex(datasetId, timeframe, anchorTime)
      : meta.rowCount - 1;

  const aheadRatio = Math.max(0.02, Math.min(0.9, opts?.aheadRatio ?? 0.05));
  const windowLen = Math.min(
    MAX_BARS_IN_MEMORY,
    Math.max(64, opts?.windowBars ?? MAX_BARS_IN_MEMORY),
    meta.rowCount,
  );
  let toAbs = Math.min(
    meta.rowCount,
    anchorIdx + 1 + Math.floor(windowLen * aheadRatio),
  );
  let fromAbs = Math.max(0, toAbs - windowLen);
  if (toAbs - fromAbs < windowLen && fromAbs === 0) {
    toAbs = Math.min(meta.rowCount, fromAbs + windowLen);
  }

  const bars = await getBarsInRange(db, meta, fromAbs, toAbs);
  const localAnchor = Math.min(bars.length - 1, Math.max(0, anchorIdx - fromAbs));
  const vis = Math.min(visibleBars, bars.length);
  let toIndex = Math.min(bars.length, localAnchor + 1 + Math.floor(vis * 0.1));
  let fromIndex = Math.max(0, toIndex - vis);
  if (toIndex <= fromIndex) {
    fromIndex = Math.max(0, bars.length - vis);
    toIndex = bars.length;
  }

  return {
    bars,
    range: { fromIndex, toIndex },
    windowFrom: fromAbs,
    totalBars: meta.rowCount,
    timeStart: meta.timeStart,
    timeEnd: meta.timeEnd,
  };
}

/**
 * Load viewport covering a wall-clock window (multi-pane sync / pan).
 * TradingView-style: fetch by logical indices for [fromTime, toTime] with
 * BUFFER_BARS padding — not “anchor only at toTime” (that left empty history).
 */
export async function loadViewportForTimeRange(
  datasetId: string,
  timeframe: Timeframe,
  fromTime: number,
  toTime: number,
): Promise<ViewportLoadResult> {
  if (!(toTime > fromTime)) {
    return loadViewportAroundTime(datasetId, timeframe, toTime);
  }

  const fromIdx = await timeToLogicalIndex(datasetId, timeframe, fromTime);
  const toIdx = await timeToLogicalIndex(datasetId, timeframe, toTime);
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx) + 1;
  const vp = await loadViewportByLogical(datasetId, timeframe, lo, hi);
  if (vp.bars.length === 0) return vp;

  // Preserve fractional / negative pad so the camera doesn't snap.
  const range = visibleRangeFromTimeWindow(vp.bars, fromTime, toTime);
  return { ...vp, range };
}

/** Reload bars for logical indices with buffer (pan). Indices are into the local buffer if already loaded — use global series indices. */
export async function loadViewportByLogical(
  datasetId: string,
  timeframe: Timeframe,
  fromIndex: number,
  toIndex: number,
): Promise<ViewportLoadResult> {
  const db = await openDb();
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  if (!meta || meta.rowCount === 0) {
    return {
      bars: [],
      range: { fromIndex: 0, toIndex: 1 },
      windowFrom: 0,
      totalBars: 0,
      timeStart: 0,
      timeEnd: 0,
    };
  }

  let from = Math.max(0, Math.floor(fromIndex) - BUFFER_BARS);
  let to = Math.min(meta.rowCount, Math.ceil(toIndex) + BUFFER_BARS);
  if (to - from > MAX_BARS_IN_MEMORY) {
    const mid = (from + to) / 2;
    from = Math.max(0, Math.floor(mid - MAX_BARS_IN_MEMORY / 2));
    to = Math.min(meta.rowCount, from + MAX_BARS_IN_MEMORY);
    from = Math.max(0, to - MAX_BARS_IN_MEMORY);
  }

  const bars = await getBarsInRange(db, meta, from, to);
  const localFrom = Math.max(0, fromIndex - from);
  const localTo = Math.min(bars.length, toIndex - from);
  const range: VisibleRange = {
    fromIndex: Math.min(localFrom, Math.max(0, bars.length - 1)),
    toIndex: Math.max(localFrom + 1, localTo),
  };

  return {
    bars,
    range,
    windowFrom: from,
    totalBars: meta.rowCount,
    timeStart: meta.timeStart,
    timeEnd: meta.timeEnd,
  };
}

export { timeRangeFromVisible };
