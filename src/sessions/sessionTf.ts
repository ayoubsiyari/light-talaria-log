import { TIMEFRAME_OPTIONS, type BacktestSession } from '@/types/session';
import type { Timeframe } from '@/types/ui';

const TF_SET = new Set<string>(TIMEFRAME_OPTIONS.map((t) => t.id));

/** Parse a stored TF string; reject unknown values. */
export function parseStoredTimeframe(raw: unknown): Timeframe | null {
  if (typeof raw !== 'string' || !TF_SET.has(raw)) return null;
  return raw as Timeframe;
}

/**
 * TF to open on session reload: last TopBar pick when persisted, else create TF.
 * Must be in the intersection of available catalog TFs.
 */
export function resolveOpenTimeframe(
  session: Pick<BacktestSession, 'timeframe' | 'selectedTf'>,
  available: readonly Timeframe[],
  fallback: Timeframe,
): Timeframe {
  const preferred = session.selectedTf ?? session.timeframe;
  if (available.includes(preferred)) return preferred;
  if (available.includes(session.timeframe)) return session.timeframe;
  return available[0] ?? fallback;
}
