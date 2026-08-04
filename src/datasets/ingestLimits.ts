import type { Timeframe } from '@/types/ui';

/**
 * Max calendar span for a download job (client).
 * Dukascopy API still fetches ≤365 days per request; the client splits by year.
 */
export const MAX_DOWNLOAD_SPAN_DAYS = 3650; // ~10 years

/** Per-request cap (must match server/dukascopyPlugin.ts). */
export const MAX_CHUNK_SPAN_DAYS = 365;

/**
 * Estimated row thresholds (upper-bound calendar minutes, not FX sessions).
 * Soft warn → confirm → hard block.
 * Single-request path used HARD_MAX; chunked year-by-year uses CHUNKED hard max.
 */
export const WARN_ESTIMATED_ROWS = 100_000;
export const CONFIRM_ESTIMATED_ROWS = 250_000;
/** Soft ceiling for one Dukascopy HTTP call (~1y 1m). */
export const HARD_MAX_ESTIMATED_ROWS = 550_000;
/** Total bars across all year chunks into one dataset. */
export const HARD_MAX_CHUNKED_ESTIMATED_ROWS = 2_000_000;

/** CSV upload size / rough row estimate caps. */
export const MAX_CSV_UPLOAD_BYTES = 80 * 1024 * 1024; // 80 MB
/** ~50 bytes/line average for timestamp,OHLC[,V] CSV. */
export const CSV_BYTES_PER_ROW_ESTIMATE = 50;
export const HARD_MAX_CSV_ROWS_ESTIMATE = 1_000_000;

/** Downloadable / calendar-estimate TFs only (seconds are client-synthesized). */
const TF_MINUTES: Partial<Record<Timeframe, number>> = {
  '1s': 1 / 60,
  '5s': 5 / 60,
  '10s': 10 / 60,
  '15s': 15 / 60,
  '30s': 30 / 60,
  '45s': 45 / 60,
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1D': 1440,
};

export function timeframeMinutes(tf: Timeframe): number {
  return TF_MINUTES[tf] ?? 1;
}

/** Inclusive calendar span in days (UTC date strings YYYY-MM-DD). */
export function spanDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T23:59:59Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return (end - start) / (24 * 60 * 60 * 1000);
}

/**
 * Upper-bound bar count for a download (24/7 calendar).
 * Real FX/session data is lower; used for caps/warnings only.
 */
export function estimateDownloadRows(
  startDate: string,
  endDate: string,
  timeframe: Timeframe,
): number {
  const days = spanDays(startDate, endDate);
  if (days <= 0) return 0;
  const barsPerDay = (24 * 60) / timeframeMinutes(timeframe);
  return Math.ceil(days * barsPerDay);
}

export function formatRowCount(n: number): string {
  return n.toLocaleString();
}

export type IngestLimitLevel = 'ok' | 'warn' | 'confirm' | 'block';

export interface IngestLimitResult {
  level: IngestLimitLevel;
  estimatedRows: number;
  /** Hard error message when level === 'block'. */
  error: string | null;
  /** Short status for UI when warn/confirm. */
  message: string | null;
}

export function assessDownloadSize(
  startDate: string,
  endDate: string,
  timeframe: Timeframe,
): IngestLimitResult {
  const estimatedRows = estimateDownloadRows(startDate, endDate, timeframe);
  const days = spanDays(startDate, endDate);
  const chunked = days > MAX_CHUNK_SPAN_DAYS;

  if (estimatedRows > HARD_MAX_CHUNKED_ESTIMATED_ROWS) {
    return {
      level: 'block',
      estimatedRows,
      error: `Estimated ~${formatRowCount(estimatedRows)} bars exceeds the chunked limit (${formatRowCount(HARD_MAX_CHUNKED_ESTIMATED_ROWS)}). Shorten the range or use a higher timeframe.`,
      message: null,
    };
  }
  if (estimatedRows >= CONFIRM_ESTIMATED_ROWS || chunked) {
    return {
      level: 'confirm',
      estimatedRows,
      error: null,
      message: chunked
        ? `Multi-year download: ~${formatRowCount(estimatedRows)} bars — fetched year-by-year into one dataset.`
        : `Large download: ~${formatRowCount(estimatedRows)} bars (upper bound). Confirm to continue.`,
    };
  }
  if (estimatedRows >= WARN_ESTIMATED_ROWS) {
    return {
      level: 'warn',
      estimatedRows,
      error: null,
      message: `~${formatRowCount(estimatedRows)} bars estimated — download may take a while.`,
    };
  }
  return {
    level: 'ok',
    estimatedRows,
    error: null,
    message: estimatedRows > 0 ? `~${formatRowCount(estimatedRows)} bars estimated` : null,
  };
}

export function assessCsvUpload(file: File): IngestLimitResult {
  if (file.size > MAX_CSV_UPLOAD_BYTES) {
    const mb = (MAX_CSV_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
    return {
      level: 'block',
      estimatedRows: Math.ceil(file.size / CSV_BYTES_PER_ROW_ESTIMATE),
      error: `CSV is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max upload is ${mb} MB.`,
      message: null,
    };
  }
  const estimatedRows = Math.ceil(file.size / CSV_BYTES_PER_ROW_ESTIMATE);
  if (estimatedRows > HARD_MAX_CSV_ROWS_ESTIMATE) {
    return {
      level: 'block',
      estimatedRows,
      error: `File looks like ~${formatRowCount(estimatedRows)} rows (over ${formatRowCount(HARD_MAX_CSV_ROWS_ESTIMATE)}). Split the CSV or use a shorter range.`,
      message: null,
    };
  }
  if (estimatedRows >= CONFIRM_ESTIMATED_ROWS) {
    return {
      level: 'confirm',
      estimatedRows,
      error: null,
      message: `Large CSV: ~${formatRowCount(estimatedRows)} rows estimated. Confirm to import.`,
    };
  }
  if (estimatedRows >= WARN_ESTIMATED_ROWS) {
    return {
      level: 'warn',
      estimatedRows,
      error: null,
      message: `~${formatRowCount(estimatedRows)} rows estimated from file size.`,
    };
  }
  return {
    level: 'ok',
    estimatedRows,
    error: null,
    message: null,
  };
}
