/**
 * Stream IDB chunks into TypedArrays for the backtest Worker.
 * Never builds ChartBar object arrays — SoA only, then transferred away.
 */
import { chunkIndexForLogical } from '@/data/barIndex';
import { getChunk, getSeriesMeta, openDb, unpackBuffer } from '@/data/idbStore';
import { timeToLogicalIndex } from '@/datasets/seriesViewport';
import type { Timeframe } from '@/types/ui';
import { MAX_BACKTEST_BARS } from '@/utils/constants';

export interface BacktestBarBuffers {
  times: Float64Array;
  opens: Float32Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  count: number;
  /** Global logical from/to actually loaded. */
  fromIndex: number;
  toIndex: number;
  truncated: boolean;
  timeStart: number;
  timeEnd: number;
  totalSeriesBars: number;
}

/**
 * Load bars for [timeStart, timeEnd], capped at MAX_BACKTEST_BARS (newest kept).
 */
export async function loadBarsForBacktest(
  datasetId: string,
  timeframe: Timeframe,
  timeStart: number,
  timeEnd: number,
): Promise<BacktestBarBuffers | null> {
  const db = await openDb();
  const meta = await getSeriesMeta(db, datasetId, timeframe);
  if (!meta || meta.rowCount === 0) return null;

  let fromIndex = await timeToLogicalIndex(datasetId, timeframe, timeStart);
  let toIndex = await timeToLogicalIndex(datasetId, timeframe, timeEnd) + 1;
  fromIndex = Math.max(0, Math.min(fromIndex, meta.rowCount));
  toIndex = Math.max(fromIndex, Math.min(toIndex, meta.rowCount));

  let truncated = false;
  if (toIndex - fromIndex > MAX_BACKTEST_BARS) {
    fromIndex = toIndex - MAX_BACKTEST_BARS;
    truncated = true;
  }

  const count = toIndex - fromIndex;
  if (count <= 0) return null;

  const times = new Float64Array(count);
  const opens = new Float32Array(count);
  const highs = new Float32Array(count);
  const lows = new Float32Array(count);
  const closes = new Float32Array(count);

  let write = 0;
  let chunkIdx = chunkIndexForLogical(meta, fromIndex);

  while (chunkIdx < meta.chunkIds.length && write < count) {
    const chunkStart = meta.chunkStarts[chunkIdx]!;
    const chunkEnd =
      chunkIdx + 1 < meta.chunkStarts.length
        ? meta.chunkStarts[chunkIdx + 1]!
        : meta.rowCount;
    if (chunkStart >= toIndex) break;

    const buffer = await getChunk(db, meta.chunkIds[chunkIdx]!);
    if (!buffer) {
      chunkIdx++;
      continue;
    }
    const store = unpackBuffer(buffer);
    const localFrom = Math.max(0, fromIndex - chunkStart);
    const localTo = Math.min(store.length, toIndex - chunkStart);
    for (let i = localFrom; i < localTo; i++) {
      times[write] = store.time[i]!;
      opens[write] = store.open[i]!;
      highs[write] = store.high[i]!;
      lows[write] = store.low[i]!;
      closes[write] = store.close[i]!;
      write++;
    }
    if (chunkEnd >= toIndex) break;
    chunkIdx++;
  }

  const filled = write;
  return {
    times: filled === count ? times : times.subarray(0, filled),
    opens: filled === count ? opens : opens.subarray(0, filled),
    highs: filled === count ? highs : highs.subarray(0, filled),
    lows: filled === count ? lows : lows.subarray(0, filled),
    closes: filled === count ? closes : closes.subarray(0, filled),
    count: filled,
    fromIndex,
    toIndex: fromIndex + filled,
    truncated,
    timeStart: filled > 0 ? times[0]! : timeStart,
    timeEnd: filled > 0 ? times[filled - 1]! : timeEnd,
    totalSeriesBars: meta.rowCount,
  };
}
