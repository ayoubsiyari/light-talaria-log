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
  return isNearBufferEdge({
    localFrom: range.fromIndex,
    localTo: range.toIndex,
    bufferLen: bars.length,
    windowFrom,
    totalBars,
  });
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

/**
 * Load a chart viewport ending at anchorTime (or series end), ≤ MAX_BARS_IN_MEMORY.
 */
export async function loadViewportAroundTime(
  datasetId: string,
  timeframe: Timeframe,
  anchorTime: number | null,
  visibleBars = VISIBLE_BARS_TARGET,
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

  const windowLen = Math.min(MAX_BARS_IN_MEMORY, meta.rowCount);
  let toAbs = Math.min(meta.rowCount, anchorIdx + 1 + Math.floor(windowLen * 0.05));
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

/** Load viewport covering a wall-clock window (multi-pane sync). */
export async function loadViewportForTimeRange(
  datasetId: string,
  timeframe: Timeframe,
  fromTime: number,
  toTime: number,
): Promise<ViewportLoadResult> {
  const around = await loadViewportAroundTime(datasetId, timeframe, toTime);
  if (around.bars.length === 0) return around;
  const range = visibleRangeFromTimeWindow(around.bars, fromTime, toTime);
  return { ...around, range };
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
