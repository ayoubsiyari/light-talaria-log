import { chunkIndexForTime } from '@/data/barIndex';
import {
  getBarsInRange,
  getChunk,
  getSeriesMeta,
  getStoreInTimeRange,
  openDb,
  unpackBuffer,
} from '@/data/idbStore';
import {
  indexAtOrBeforeBars,
  isSecondTimeframe,
  timeRangeFromVisible,
  timeframeSeconds,
  visibleRangeFromTimeWindow,
} from '@/data/timeframeAgg';
import {
  asSecondTimeframe,
  estimatedSyntheticRowCount,
  synthesizeFromMinutes,
  synthesisSourceTf,
} from '@/data/synthesizeSeconds';
import { toChartBars } from '@/data/binaryBar';
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
  const secondTf = asSecondTimeframe(timeframe);
  if (secondTf) {
    const db = await openDb();
    const srcTf = synthesisSourceTf(secondTf);
    const meta = await getSeriesMeta(db, datasetId, srcTf);
    if (!meta || meta.rowCount === 0) return 0;
    // Approximate: each 1m bar expands to (60 / period) synthetic bars.
    const perMin = Math.max(1, Math.floor(60 / timeframeSeconds(secondTf)));
    const cIdx = chunkIndexForTime(meta, timeSec);
    const buffer = await getChunk(db, meta.chunkIds[cIdx]!);
    if (!buffer) return Math.min(meta.rowCount - 1, cIdx) * perMin;
    const store = unpackBuffer(buffer);
    const chunkStart = meta.chunkStarts[cIdx]!;
    let lo = 0;
    let hi = store.length - 1;
    let local = 0;
    if (timeSec <= store.time[0]!) local = 0;
    else if (timeSec >= store.time[hi]!) local = hi;
    else {
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const t = store.time[mid]!;
        if (t === timeSec) {
          local = mid;
          break;
        }
        if (t < timeSec) lo = mid + 1;
        else hi = mid - 1;
        local = Math.max(0, hi);
      }
    }
    const minuteIdx = chunkStart + local;
    const minuteT = store.time[local]!;
    const period = timeframeSeconds(secondTf);
    const offset = Math.max(
      0,
      Math.min(perMin - 1, Math.floor((timeSec - minuteT) / period)),
    );
    return minuteIdx * perMin + offset;
  }

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

function emptyViewport(): ViewportLoadResult {
  return {
    bars: [],
    range: { fromIndex: 0, toIndex: 1 },
    windowFrom: 0,
    totalBars: 0,
    timeStart: 0,
    timeEnd: 0,
  };
}

/**
 * Synthetic second-TF viewport from 1m IDB chunks (no full-series materialization).
 */
async function loadSynthesizedViewportAroundTime(
  datasetId: string,
  timeframe: Timeframe,
  anchorTime: number | null,
  visibleBars: number,
  opts?: ViewportLoadOpts,
): Promise<ViewportLoadResult> {
  const secondTf = asSecondTimeframe(timeframe);
  if (!secondTf) return emptyViewport();

  const db = await openDb();
  // Prefer a real stored series if present (future real 1s packs).
  const direct = await getSeriesMeta(db, datasetId, timeframe);
  if (direct && direct.rowCount > 0) {
    return loadStoredViewportAroundTime(
      datasetId,
      timeframe,
      anchorTime,
      visibleBars,
      opts,
    );
  }

  const srcTf = synthesisSourceTf(secondTf);
  const meta = await getSeriesMeta(db, datasetId, srcTf);
  if (!meta || meta.rowCount === 0) return emptyViewport();

  const period = timeframeSeconds(secondTf);
  const aheadRatio = Math.max(0.02, Math.min(0.9, opts?.aheadRatio ?? 0.05));
  const windowLen = Math.min(
    MAX_BARS_IN_MEMORY,
    Math.max(64, opts?.windowBars ?? MAX_BARS_IN_MEMORY),
  );
  const totalBars = estimatedSyntheticRowCount(meta.rowCount, secondTf);
  const anchor = anchorTime ?? meta.timeEnd;

  // Wall-clock span that covers the target window (+1m pads for path edges).
  const spanSec = windowLen * period;
  const fromTime = anchor - spanSec * (1 - aheadRatio) - 60;
  const toTime = anchor + spanSec * aheadRatio + 120;

  const m1 = await getStoreInTimeRange(db, meta, fromTime, toTime);
  if (m1.length === 0) return emptyViewport();

  const synth = synthesizeFromMinutes(m1, secondTf);
  if (synth.length === 0) return emptyViewport();

  const allBars = toChartBars(synth, 0, synth.length);
  const anchorIdx = indexAtOrBeforeBars(allBars, anchor);

  let toAbs = Math.min(
    allBars.length,
    anchorIdx + 1 + Math.floor(windowLen * aheadRatio),
  );
  let fromAbs = Math.max(0, toAbs - windowLen);
  if (toAbs - fromAbs < windowLen && fromAbs === 0) {
    toAbs = Math.min(allBars.length, fromAbs + windowLen);
  }

  const bars = allBars.slice(fromAbs, toAbs);
  const localAnchor = Math.min(bars.length - 1, Math.max(0, anchorIdx - fromAbs));
  const vis = Math.min(visibleBars, bars.length);
  let toIndex = Math.min(bars.length, localAnchor + 1 + Math.floor(vis * 0.1));
  let fromIndex = Math.max(0, toIndex - vis);
  if (toIndex <= fromIndex) {
    fromIndex = Math.max(0, bars.length - vis);
    toIndex = bars.length;
  }

  // Approximate global windowFrom from 1m index × expansion.
  const perMin = Math.max(1, Math.floor(60 / period));
  const firstMinuteApprox = Math.max(
    0,
    Math.floor((bars[0]!.time - meta.timeStart) / 60),
  );
  const windowFrom = Math.min(totalBars, firstMinuteApprox * perMin);

  return {
    bars,
    range: { fromIndex, toIndex },
    windowFrom,
    totalBars,
    timeStart: meta.timeStart,
    timeEnd: meta.timeEnd,
  };
}

async function loadStoredViewportAroundTime(
  datasetId: string,
  timeframe: Timeframe,
  anchorTime: number | null,
  visibleBars: number,
  opts?: ViewportLoadOpts,
): Promise<ViewportLoadResult> {
  const db = await openDb();
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  if (!meta || meta.rowCount === 0) return emptyViewport();

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
 * Load a chart viewport ending at anchorTime (or series end), ≤ MAX_BARS_IN_MEMORY.
 */
export async function loadViewportAroundTime(
  datasetId: string,
  timeframe: Timeframe,
  anchorTime: number | null,
  visibleBars = VISIBLE_BARS_TARGET,
  opts?: ViewportLoadOpts,
): Promise<ViewportLoadResult> {
  if (isSecondTimeframe(timeframe)) {
    return loadSynthesizedViewportAroundTime(
      datasetId,
      timeframe,
      anchorTime,
      visibleBars,
      opts,
    );
  }
  return loadStoredViewportAroundTime(
    datasetId,
    timeframe,
    anchorTime,
    visibleBars,
    opts,
  );
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
  if (isSecondTimeframe(timeframe)) {
    // Map logical window → wall-clock via estimated period, then synthesize.
    const db = await openDb();
    const secondTf = asSecondTimeframe(timeframe)!;
    const meta = await getSeriesMeta(db, datasetId, synthesisSourceTf(secondTf));
    if (!meta || meta.rowCount === 0) return emptyViewport();
    const period = timeframeSeconds(secondTf);
    const mid = (fromIndex + toIndex) / 2;
    const anchorTime = meta.timeStart + mid * period;
    return loadSynthesizedViewportAroundTime(
      datasetId,
      timeframe,
      anchorTime,
      VISIBLE_BARS_TARGET,
    );
  }

  const db = await openDb();
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  if (!meta || meta.rowCount === 0) return emptyViewport();

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
