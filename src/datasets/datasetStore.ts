import {
  deleteDatasetCsv,
  deleteSeriesForDataset,
  openDb,
  putDatasetCsv,
} from '@/data/idbStore';
import {
  assessDownloadSize,
  MAX_DOWNLOAD_SPAN_DAYS,
} from '@/datasets/ingestLimits';
import type {
  DownloadDatasetInput,
  DownloadedDataset,
  DukascopyDownloadResponse,
} from '@/types/dataset';
import type { RemoteDatasetMeta } from '@/types/remoteApi';
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

/** Map remote API symbol (`EURUSD` or `EUR/USD`) to a catalog PairSymbol. */
export function remoteSymbolToPair(symbol: string): PairSymbol {
  const raw = symbol.trim().toUpperCase().replace(/\s+/g, '');
  const compact = raw.replace(/\//g, '');
  const match = PAIR_OPTIONS.find((p) => p.id.replace(/\//g, '') === compact);
  if (match) return match.id;
  throw new Error(`Unsupported remote symbol: ${symbol}`);
}

function unixToIsoDate(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '1970-01-01';
  return new Date(sec * 1000).toISOString().slice(0, 10);
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

/** Download from Vite /api/dukascopy, persist catalog + CSV blob. */
export async function downloadAndStoreDataset(
  input: DownloadDatasetInput,
): Promise<DownloadedDataset> {
  const dateError = validateDownloadDates(input.startDate, input.endDate);
  if (dateError) throw new Error(dateError);

  const size = assessDownloadSize(input.startDate, input.endDate, input.timeframe);
  if (size.level === 'block' && size.error) throw new Error(size.error);

  const res = await fetch('/api/dukascopy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pair: input.pair,
      timeframe: input.timeframe,
      from: input.startDate,
      to: input.endDate,
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
    throw new Error(payload?.error ?? `Download failed (${res.status})`);
  }
  if (!payload?.csv) {
    throw new Error(
      payload?.error ??
        'Download returned empty CSV. Confirm `npm run dev` is running and the date range has market data.',
    );
  }

  const dataset: DownloadedDataset = {
    id: crypto.randomUUID(),
    pair: input.pair,
    timeframe: input.timeframe,
    startDate: input.startDate,
    endDate: input.endDate,
    rowCount: payload.rowCount,
    source: 'dukascopy',
    createdAt: Date.now(),
  };

  const db = await openDb();
  await putDatasetCsv(db, dataset.id, payload.csv);

  const next = [dataset, ...readAll()].slice(0, MAX_DATASETS);
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
