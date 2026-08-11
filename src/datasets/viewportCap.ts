import { MAX_BARS_IN_MEMORY } from '@/utils/constants';

/** Truncate a bar window to the engine memory cap (same rule as setViewportBars). */
export function truncateViewportBars<T>(
  bars: readonly T[],
  max = MAX_BARS_IN_MEMORY,
): T[] {
  if (bars.length <= max) return bars as T[];
  return bars.slice(0, max) as T[];
}
