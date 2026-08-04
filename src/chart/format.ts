import { timeframeSeconds } from '@/data/timeframeAgg';
import type { Timeframe } from '@/types/ui';

export function formatPrice(price: number): string {
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(1);
  if (abs >= 1) return price.toFixed(4);
  return price.toFixed(5);
}

export interface FormatTimeOpts {
  /** Force seconds on/off. When omitted, inferred from `timeframe`. */
  showSeconds?: boolean;
  /** Pane TF — sub-minute intervals show HH:mm:ss. */
  timeframe?: Timeframe | null;
}

/** True when labels should include seconds (1s…45s panes). */
export function shouldShowSeconds(tf: Timeframe | null | undefined): boolean {
  return tf != null && timeframeSeconds(tf) < 60;
}

export function formatTime(unixSec: number, opts?: FormatTimeOpts): string {
  if (!Number.isFinite(unixSec)) return '—';
  const d = new Date(unixSec * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const showSeconds =
    opts?.showSeconds ?? shouldShowSeconds(opts?.timeframe ?? null);
  if (showSeconds) {
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}:${ss}`;
  }
  return `${mm}-${dd} ${hh}:${mi}`;
}
