import {
  deleteDatasetCsv,
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

  const payload = (await res.json()) as DukascopyDownloadResponse & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error ?? `Download failed (${res.status})`);
  }
  if (!payload.csv) {
    throw new Error('Download returned empty CSV.');
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
  } catch {
    // Catalog already updated; CSV cleanup is best-effort
  }
}

export function datasetLabel(d: DownloadedDataset): string {
  return `${d.pair} · ${d.timeframe} · ${d.startDate} → ${d.endDate}`;
}
