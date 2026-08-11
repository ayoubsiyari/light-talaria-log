/**
 * CSV parser Web Worker — off main thread.
 * Supports legacy parse modes + ingest (base TF + pre-aggregated TF chunks).
 */
import { CHUNK_SIZE } from '@/utils/constants';
import type { CsvWorkerRequest, CsvWorkerResponse, DatasetMeta } from '@/types/bar';
import type { SeriesMeta } from '@/types/series';
import { chunkKey } from '@/types/series';
import type { Timeframe } from '@/types/ui';
import { createBarStore, packStore, type BinaryBarStore } from './binaryBar';
import { isPositiveOhlc } from './ohlcGuard';
import { aggregatableTimeframes, timeframeSeconds } from './timeframeAgg';

function normalizeTime(raw: number): number {
  if (raw > 1e12) return Math.floor(raw / 1000);
  return raw;
}

function parseLine(
  line: string,
): { time: number; open: number; high: number; low: number; close: number; volume: number } | null {
  const parts = line.trim().split(',');
  if (parts.length < 5) return null;
  const time = normalizeTime(Number(parts[0]));
  const open = Number(parts[1]);
  const high = Number(parts[2]);
  const low = Number(parts[3]);
  const close = Number(parts[4]);
  const volume = parts.length >= 6 ? Number(parts[5]) : 0;
  if ([time, open, high, low, close].some(Number.isNaN) || !Number.isFinite(time)) return null;
  if (Number.isNaN(volume)) return null;
  // Empty CSV cells become 0 — reject (ES/NQ zero prints crush the chart).
  if (!isPositiveOhlc(open, high, low, close)) return null;
  return { time, open, high, low, close, volume };
}

function isHeader(line: string): boolean {
  const lower = line.trim().toLowerCase();
  return lower.startsWith('timestamp') || lower.startsWith('time') || lower.includes('open');
}

function bucketStart(timeSec: number, periodSec: number): number {
  return Math.floor(timeSec / periodSec) * periodSec;
}

function postChunk(
  datasetId: string,
  timeframe: Timeframe,
  chunkIndex: number,
  logicalStart: number,
  store: BinaryBarStore,
): void {
  if (store.length === 0) return;
  const chunkId = chunkKey(datasetId, timeframe, chunkIndex);
  const timeStart = store.time[0]!;
  const timeEnd = store.time[store.length - 1]!;
  const buffer = packStore(store);
  (self as DedicatedWorkerGlobalScope).postMessage(
    {
      type: 'ingestChunk',
      datasetId,
      timeframe,
      chunkId,
      chunkIndex,
      logicalStart,
      timeStart,
      timeEnd,
      barCount: store.length,
      buffer,
    } satisfies CsvWorkerResponse,
    [buffer],
  );
}

interface TfAggState {
  tf: Timeframe;
  period: number;
  store: BinaryBarStore;
  chunkIndex: number;
  logicalCount: number;
  chunkStarts: number[];
  chunkIds: string[];
  chunkTimeStarts: number[];
  chunkTimeEnds: number[];
  // open bucket
  hasBucket: boolean;
  bucketTime: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function createAgg(tf: Timeframe, chunkSize: number): TfAggState {
  return {
    tf,
    period: timeframeSeconds(tf),
    store: createBarStore(chunkSize),
    chunkIndex: 0,
    logicalCount: 0,
    chunkStarts: [],
    chunkIds: [],
    chunkTimeStarts: [],
    chunkTimeEnds: [],
    hasBucket: false,
    bucketTime: 0,
    o: 0,
    h: 0,
    l: 0,
    c: 0,
    v: 0,
  };
}

function flushStore(datasetId: string, agg: TfAggState): void {
  if (agg.store.length === 0) return;
  const logicalStart = agg.logicalCount - agg.store.length;
  const chunkId = chunkKey(datasetId, agg.tf, agg.chunkIndex);
  agg.chunkIds.push(chunkId);
  agg.chunkStarts.push(logicalStart);
  agg.chunkTimeStarts.push(agg.store.time[0]!);
  agg.chunkTimeEnds.push(agg.store.time[agg.store.length - 1]!);
  postChunk(datasetId, agg.tf, agg.chunkIndex, logicalStart, agg.store);
  agg.store.length = 0;
  agg.chunkIndex++;
}

function pushCompletedBar(datasetId: string, agg: TfAggState, chunkSize: number): void {
  const idx = agg.store.length;
  agg.store.time[idx] = agg.bucketTime;
  agg.store.open[idx] = agg.o;
  agg.store.high[idx] = agg.h;
  agg.store.low[idx] = agg.l;
  agg.store.close[idx] = agg.c;
  agg.store.volume[idx] = agg.v;
  agg.store.length++;
  agg.logicalCount++;
  if (agg.store.length >= chunkSize) {
    flushStore(datasetId, agg);
  }
}

function feedAgg(
  datasetId: string,
  agg: TfAggState,
  bar: { time: number; open: number; high: number; low: number; close: number; volume: number },
  chunkSize: number,
): void {
  const b = bucketStart(bar.time, agg.period);
  if (!agg.hasBucket) {
    agg.hasBucket = true;
    agg.bucketTime = b;
    agg.o = bar.open;
    agg.h = bar.high;
    agg.l = bar.low;
    agg.c = bar.close;
    agg.v = bar.volume;
    return;
  }
  if (b !== agg.bucketTime) {
    pushCompletedBar(datasetId, agg, chunkSize);
    agg.bucketTime = b;
    agg.o = bar.open;
    agg.h = bar.high;
    agg.l = bar.low;
    agg.c = bar.close;
    agg.v = bar.volume;
  } else {
    if (bar.high > agg.h) agg.h = bar.high;
    if (bar.low < agg.l) agg.l = bar.low;
    agg.c = bar.close;
    agg.v += bar.volume;
  }
}

function finalizeAgg(datasetId: string, agg: TfAggState, chunkSize: number): SeriesMeta {
  if (agg.hasBucket) {
    pushCompletedBar(datasetId, agg, chunkSize);
    agg.hasBucket = false;
  }
  flushStore(datasetId, agg);
  return {
    datasetId,
    timeframe: agg.tf,
    rowCount: agg.logicalCount,
    timeStart: agg.chunkTimeStarts[0] ?? 0,
    timeEnd: agg.chunkTimeEnds[agg.chunkTimeEnds.length - 1] ?? 0,
    chunkIds: agg.chunkIds,
    chunkStarts: agg.chunkStarts,
    chunkTimeStarts: agg.chunkTimeStarts,
    chunkTimeEnds: agg.chunkTimeEnds,
  };
}

function handleIngest(msg: Extract<CsvWorkerRequest, { type: 'ingest' }>): void {
  const { csvText, datasetId, baseTf, chunkSize } = msg;
  const lines = csvText.split('\n');
  const targets = aggregatableTimeframes(baseTf);
  const aggs = new Map<Timeframe, TfAggState>();
  for (const tf of targets) {
    aggs.set(tf, createAgg(tf, chunkSize));
  }

  // Base series written bar-by-bar (same TF as source CSV)
  const base = createAgg(baseTf, chunkSize);
  let rows = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || (i === 0 && isHeader(line))) continue;
    const bar = parseLine(line);
    if (!bar) continue;

    // Base TF: treat each CSV row as one bar of baseTf
    const bAgg = base;
    const idx = bAgg.store.length;
    bAgg.store.time[idx] = bar.time;
    bAgg.store.open[idx] = bar.open;
    bAgg.store.high[idx] = bar.high;
    bAgg.store.low[idx] = bar.low;
    bAgg.store.close[idx] = bar.close;
    bAgg.store.volume[idx] = bar.volume;
    bAgg.store.length++;
    bAgg.logicalCount++;
    if (bAgg.store.length >= chunkSize) {
      flushStore(datasetId, bAgg);
    }

    for (const tf of targets) {
      if (tf === baseTf) continue;
      feedAgg(datasetId, aggs.get(tf)!, bar, chunkSize);
    }

    rows++;
    if (rows % 20000 === 0) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: 'progress',
        percent: Math.min(0.99, i / Math.max(1, lines.length)),
        rowsParsed: rows,
      } satisfies CsvWorkerResponse);
    }
  }

  if (rows === 0) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      message: 'No valid OHLC rows in CSV.',
    } satisfies CsvWorkerResponse);
    return;
  }

  const metas: SeriesMeta[] = [];
  // Finalize base
  flushStore(datasetId, base);
  metas.push({
    datasetId,
    timeframe: baseTf,
    rowCount: base.logicalCount,
    timeStart: base.chunkTimeStarts[0] ?? 0,
    timeEnd: base.chunkTimeEnds[base.chunkTimeEnds.length - 1] ?? 0,
    chunkIds: base.chunkIds,
    chunkStarts: base.chunkStarts,
    chunkTimeStarts: base.chunkTimeStarts,
    chunkTimeEnds: base.chunkTimeEnds,
  });

  for (const tf of targets) {
    if (tf === baseTf) continue;
    metas.push(finalizeAgg(datasetId, aggs.get(tf)!, chunkSize));
  }

  (self as DedicatedWorkerGlobalScope).postMessage({
    type: 'ingestDone',
    metas,
  } satisfies CsvWorkerResponse);
}

/** @deprecated Legacy single-TF chunk keys (`symbol_chunk_N`). Prefer `ingest`. */
function handleParse(msg: Extract<CsvWorkerRequest, { type: 'parse' }>): void {
  const lines = msg.csvText.split('\n');
  const totalLines = Math.max(1, lines.length - 1);
  const store = createBarStore(msg.chunkSize);
  const chunkIds: string[] = [];
  let rowCount = 0;
  let chunkIndex = 0;
  let timeStart = 0;
  let timeEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || (i === 0 && isHeader(line))) continue;
    const bar = parseLine(line);
    if (!bar) continue;
    if (rowCount === 0) timeStart = bar.time;
    timeEnd = bar.time;
    const idx = store.length;
    store.time[idx] = bar.time;
    store.open[idx] = bar.open;
    store.high[idx] = bar.high;
    store.low[idx] = bar.low;
    store.close[idx] = bar.close;
    store.volume[idx] = bar.volume;
    store.length++;
    if (store.length >= msg.chunkSize) {
      const chunkId = `${msg.symbol}_chunk_${chunkIndex}`;
      const buffer = packStore(store);
      chunkIds.push(chunkId);
      (self as DedicatedWorkerGlobalScope).postMessage(
        { type: 'chunkStored', chunkId, buffer, rowCount: store.length } satisfies CsvWorkerResponse,
        [buffer],
      );
      store.length = 0;
      chunkIndex++;
    }
    rowCount++;
    if (rowCount % 10000 === 0) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: 'progress',
        percent: rowCount / totalLines,
        rowsParsed: rowCount,
      } satisfies CsvWorkerResponse);
    }
  }
  if (store.length > 0) {
    const chunkId = `${msg.symbol}_chunk_${chunkIndex}`;
    const buffer = packStore(store);
    chunkIds.push(chunkId);
    (self as DedicatedWorkerGlobalScope).postMessage(
      { type: 'chunkStored', chunkId, buffer, rowCount: store.length } satisfies CsvWorkerResponse,
      [buffer],
    );
  }
  const meta: DatasetMeta = {
    symbol: msg.symbol,
    rowCount,
    timeStart,
    timeEnd,
    chunkIds,
  };
  (self as DedicatedWorkerGlobalScope).postMessage({ type: 'done', meta } satisfies CsvWorkerResponse);
}

/** @deprecated Quarantined — do not use for session charts; use IDB viewport. */
function handleParseForChart(msg: Extract<CsvWorkerRequest, { type: 'parseForChart' }>): void {
  const maxBars = Math.max(1, msg.maxBars);
  const ring = createBarStore(maxBars);
  let totalRows = 0;
  let write = 0;
  const lines = msg.csvText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || (i === 0 && isHeader(line))) continue;
    const bar = parseLine(line);
    if (!bar) continue;
    const idx = write % maxBars;
    ring.time[idx] = bar.time;
    ring.open[idx] = bar.open;
    ring.high[idx] = bar.high;
    ring.low[idx] = bar.low;
    ring.close[idx] = bar.close;
    ring.volume[idx] = bar.volume;
    write++;
    totalRows++;
  }
  if (totalRows === 0) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      message: 'No valid OHLC rows in CSV.',
    } satisfies CsvWorkerResponse);
    return;
  }
  const barCount = Math.min(totalRows, maxBars);
  const out = createBarStore(barCount);
  const start = totalRows <= maxBars ? 0 : write % maxBars;
  for (let i = 0; i < barCount; i++) {
    const src = totalRows <= maxBars ? i : (start + i) % maxBars;
    out.time[i] = ring.time[src];
    out.open[i] = ring.open[src];
    out.high[i] = ring.high[src];
    out.low[i] = ring.low[src];
    out.close[i] = ring.close[src];
    out.volume[i] = ring.volume[src];
  }
  out.length = barCount;
  const buffer = packStore(out);
  (self as DedicatedWorkerGlobalScope).postMessage(
    { type: 'chartBars', buffer, barCount, totalRows } satisfies CsvWorkerResponse,
    [buffer],
  );
}

/** @deprecated Quarantined — materializes full series; use `ingest` + viewport. */
function handleParseAll(msg: Extract<CsvWorkerRequest, { type: 'parseAll' }>): void {
  const lines = msg.csvText.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || (i === 0 && isHeader(line))) continue;
    if (parseLine(line)) count++;
  }
  if (count === 0) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      message: 'No valid OHLC rows in CSV.',
    } satisfies CsvWorkerResponse);
    return;
  }
  const store = createBarStore(count);
  let row = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || (i === 0 && isHeader(line))) continue;
    const bar = parseLine(line);
    if (!bar) continue;
    store.time[row] = bar.time;
    store.open[row] = bar.open;
    store.high[row] = bar.high;
    store.low[row] = bar.low;
    store.close[row] = bar.close;
    store.volume[row] = bar.volume;
    row++;
  }
  store.length = row;
  const buffer = packStore(store);
  (self as DedicatedWorkerGlobalScope).postMessage(
    { type: 'allBars', buffer, barCount: row } satisfies CsvWorkerResponse,
    [buffer],
  );
}

self.onmessage = (e: MessageEvent<CsvWorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'cancel') return;
  try {
    if (msg.type === 'parse') handleParse(msg);
    else if (msg.type === 'parseForChart') handleParseForChart(msg);
    else if (msg.type === 'parseAll') handleParseAll(msg);
    else if (msg.type === 'ingest') handleIngest(msg);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Parse failed',
    } satisfies CsvWorkerResponse);
  }
};

export default CHUNK_SIZE;
