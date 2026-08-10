import {
  deleteDatasetCsv,
  deleteSeriesForDataset,
  getDatasetCsv,
  openDb,
  putDatasetCsv,
} from '@/data/idbStore';
import {
  mergeCsvParts,
  splitRangeByYear,
} from '@/datasets/downloadChunks';
import {
  assessDownloadSize,
  HARD_MAX_ESTIMATED_ROWS,
  MAX_DOWNLOAD_SPAN_DAYS,
} from '@/datasets/ingestLimits';
import type {
  DownloadDatasetInput,
  DownloadedDataset,
  DukascopyDownloadResponse,
} from '@/types/dataset';
import { newId } from '@/utils/uuid';
import type { RemoteDatasetMeta } from '@/types/remoteApi';
import { normalizePairSymbol } from '@/symbols/symbolCategory';
import { PAIR_OPTIONS, type PairSymbol } from '@/types/session';
import type { Timeframe } from '@/types/ui';

const STORAGE_KEY = 'fast-chart.datasets.v1';
const MAX_DATASETS = 50;

function readAll(): DownloadedDataset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DownloadedDataset[];
  } catch {
    return [];
  }
}

function writeAll(datasets: DownloadedDataset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datasets.slice(0, MAX_DATASETS)));
}

export function listDatasets(): DownloadedDataset[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getDataset(id: string): DownloadedDataset | null {
  return readAll().find((d) => d.id === id) ?? null;
}

/** Mark a local catalog row as published to the shared server store. */
export function markDatasetServerSynced(id: string): void {
  const all = readAll();
  const idx = all.findIndex((d) => d.id === id);
  if (idx < 0) return;
  const row = all[idx]!;
  all[idx] = { ...row, serverSyncedAt: Date.now() };
  writeAll(all);
}

export function validateDownloadDates(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return 'Start and end dates are required.';
  if (startDate > endDate) return 'Start date must be on or before end date.';
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T23:59:59Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Invalid date.';
  const span = (end - start) / (24 * 60 * 60 * 1000);
  if (span > MAX_DOWNLOAD_SPAN_DAYS) {
    return `Range cannot exceed ${MAX_DOWNLOAD_SPAN_DAYS} days.`;
  }
  return null;
}

/** Map remote API symbol (`EURUSD`, `EUR/USD`, `ES1`, …) to a catalog PairSymbol. */
export function remoteSymbolToPair(symbol: string): PairSymbol {
  const raw = symbol.trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) throw new Error('Empty remote symbol');
  const compact = raw.replace(/[/\-_.]/g, '');
  const match = PAIR_OPTIONS.find((p) => p.id.replace(/\//g, '') === compact);
  if (match) return match.id;
  const normalized = normalizePairSymbol(raw);
  if (!normalized) throw new Error(`Unsupported remote symbol: ${symbol}`);
  return normalized;
}

export function unixToIsoDate(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '1970-01-01';
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

/** Map remote API meta → local catalog shape (does not write storage). */
export function remoteToDownloadedStub(remote: RemoteDatasetMeta): DownloadedDataset {
  const timeframe = (remote.baseTimeframe as Timeframe) || '1m';
  const rowCount =
    remote.rowCounts?.[timeframe] ??
    Object.values(remote.rowCounts ?? {})[0] ??
    0;
  return {
    id: remote.id,
    pair: remoteSymbolToPair(remote.symbol),
    timeframe,
    startDate: unixToIsoDate(remote.timeStart),
    endDate: unixToIsoDate(remote.timeEnd),
    rowCount,
    source: 'remote',
    createdAt: 0,
  };
}

/**
 * Upsert a local catalog entry for a remote API dataset (keeps remote `id`
 * so Create Session / rehydrate can find it).
 */
export function registerRemoteDataset(remote: RemoteDatasetMeta): DownloadedDataset {
  const pair = remoteSymbolToPair(remote.symbol);
  const timeframe = (remote.baseTimeframe as Timeframe) || '1m';
  const rowCount =
    remote.rowCounts?.[timeframe] ??
    Object.values(remote.rowCounts ?? {})[0] ??
    0;

  const existing = readAll().find((d) => d.id === remote.id);
  const dataset: DownloadedDataset = {
    id: remote.id,
    pair,
    timeframe,
    startDate: unixToIsoDate(remote.timeStart),
    endDate: unixToIsoDate(remote.timeEnd),
    rowCount,
    source: 'remote',
    createdAt: existing?.createdAt ?? Date.now(),
  };

  const next = [dataset, ...readAll().filter((d) => d.id !== remote.id)].slice(
    0,
    MAX_DATASETS,
  );
  writeAll(next);
  return dataset;
}

/** Existing Dukascopy catalog row for the same pair + timeframe (for merge). */
export function findSamePairTfDataset(
  pair: PairSymbol,
  timeframe: Timeframe,
): DownloadedDataset | null {
  return (
    readAll().find(
      (d) => d.source === 'dukascopy' && d.pair === pair && d.timeframe === timeframe,
    ) ?? null
  );
}

async function fetchDukascopyYear(opts: {
  pair: PairSymbol;
  timeframe: Timeframe;
  from: string;
  to: string;
}): Promise<{ csv: string; rowCount: number }> {
  // Guard each HTTP call — server also enforces ≤365d / ~550k est.
  const size = assessDownloadSize(opts.from, opts.to, opts.timeframe);
  if (size.estimatedRows > HARD_MAX_ESTIMATED_ROWS) {
    throw new Error(
      `Year chunk ${opts.from}→${opts.to} is too large (~${size.estimatedRows.toLocaleString()} bars). Use a higher timeframe.`,
    );
  }

  const res = await fetch('/api/dukascopy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pair: opts.pair,
      timeframe: opts.timeframe,
      from: opts.from,
      to: opts.to,
    }),
  });

  const raw = await res.text();
  let payload: (DukascopyDownloadResponse & { error?: string }) | null = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as DukascopyDownloadResponse & { error?: string };
    } catch {
      throw new Error(
        'Download API returned a non-JSON response. Run the app with `npm run dev` (or preview after rebuild) so /api/dukascopy is available.',
      );
    }
  }
  if (!res.ok) {
    // Empty weekend year → skip (404); hard errors bubble.
    if (res.status === 404) {
      return { csv: '', rowCount: 0 };
    }
    throw new Error(payload?.error ?? `Download failed (${res.status})`);
  }
  if (!payload?.csv) {
    return { csv: '', rowCount: 0 };
  }
  return { csv: payload.csv, rowCount: payload.rowCount };
}

/**
 * Download from Dukascopy year-by-year, merge into one CSV + one catalog entry.
 * If a Dukascopy dataset already exists for the same pair/TF, extends it (same id).
 */
export async function downloadAndStoreDataset(
  input: DownloadDatasetInput,
): Promise<DownloadedDataset> {
  const dateError = validateDownloadDates(input.startDate, input.endDate);
  if (dateError) throw new Error(dateError);

  const size = assessDownloadSize(input.startDate, input.endDate, input.timeframe);
  if (size.level === 'block' && size.error) throw new Error(size.error);

  const chunks = splitRangeByYear(input.startDate, input.endDate);
  if (chunks.length === 0) throw new Error('Invalid date range.');

  const merge = input.mergeIntoSamePairTf !== false;
  const existing = merge
    ? findSamePairTfDataset(input.pair, input.timeframe)
    : null;

  const csvParts: string[] = [];
  if (existing) {
    const db = await openDb();
    const prev = await getDatasetCsv(db, existing.id);
    if (prev) csvParts.push(prev);
  }

  let rowsSoFar = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const { csv, rowCount } = await fetchDukascopyYear({
      pair: input.pair,
      timeframe: input.timeframe,
      from: chunk.from,
      to: chunk.to,
    });
    if (csv) csvParts.push(csv);
    rowsSoFar += rowCount;
    input.onProgress?.({
      chunkIndex: i,
      chunkTotal: chunks.length,
      from: chunk.from,
      to: chunk.to,
      label: chunk.label,
      rowsInChunk: rowCount,
      rowsSoFar,
    });
  }

  const { csv, rowCount } = mergeCsvParts(csvParts);
  if (rowCount === 0) {
    throw new Error(
      'No market data for this range (weekend/holiday, or market closed). Try weekdays or a wider range.',
    );
  }

  const startDate = existing
    ? existing.startDate < input.startDate
      ? existing.startDate
      : input.startDate
    : input.startDate;
  const endDate = existing
    ? existing.endDate > input.endDate
      ? existing.endDate
      : input.endDate
    : input.endDate;

  const dataset: DownloadedDataset = {
    id: existing?.id ?? newId(),
    pair: input.pair,
    timeframe: input.timeframe,
    startDate,
    endDate,
    rowCount,
    source: 'dukascopy',
    createdAt: existing?.createdAt ?? Date.now(),
    // CSV changed — must re-publish before other browsers see updates.
    serverSyncedAt: undefined,
  };

  const db = await openDb();
  await putDatasetCsv(db, dataset.id, csv);
  // Force re-ingest of bar chunks on next session open (CSV changed).
  await deleteSeriesForDataset(db, dataset.id);

  const next = [dataset, ...readAll().filter((d) => d.id !== dataset.id)].slice(
    0,
    MAX_DATASETS,
  );
  writeAll(next);
  return dataset;
}

export async function deleteDataset(id: string): Promise<void> {
  writeAll(readAll().filter((d) => d.id !== id));
  try {
    const db = await openDb();
    await deleteDatasetCsv(db, id);
    await deleteSeriesForDataset(db, id);
  } catch {
    // Catalog already updated; IDB cleanup is best-effort
  }
}

export function datasetLabel(d: DownloadedDataset): string {
  return `${d.pair} · ${d.timeframe} · ${d.startDate} → ${d.endDate}`;
}
