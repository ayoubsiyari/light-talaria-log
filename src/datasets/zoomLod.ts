/**
 * Zoom LOD helpers — wall-clock density math kept for tests / future use.
 *
 * Live path (TV-style): TopBar `selectedTf` is the only TF. Zoom never
 * auto-coarsens to 5m/15m/…; the IDB viewport window stays ≤ MAX_BARS_IN_MEMORY.
 */
import { timeframeSeconds } from '@/data/timeframeAgg';
import type { Timeframe } from '@/types/ui';
import { VISIBLE_BARS_TARGET } from '@/utils/constants';

/** @deprecated Live path no longer auto-coarsens; kept for density helpers/tests. */
export const LOD_COARSEN_BARS = 1800;
/** @deprecated Live path no longer auto-refines via zoom; kept for tests. */
export const LOD_REFINE_BARS = 700;

const TF_ORDER: readonly Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

/** Approximate visible bar count for a wall-clock span at `tf`. */
export function projectedVisibleBars(windowSec: number, tf: Timeframe): number {
  const period = timeframeSeconds(tf);
  if (period <= 0 || !(windowSec > 0)) return 0;
  return windowSec / period;
}

/**
 * Finest available TF (≥ selected floor) whose projected bars fit the target.
 * Falls back to coarsest candidate when even that is too dense.
 * Not used by live zoom anymore (TV pins selectedTf); kept for density checks.
 */
export function idealLodTimeframe(
  windowSec: number,
  selectedTf: Timeframe,
  available: readonly Timeframe[],
): Timeframe {
  const selectedSec = timeframeSeconds(selectedTf);
  const candidates = TF_ORDER.filter(
    (tf) => available.includes(tf) && timeframeSeconds(tf) >= selectedSec,
  );
  if (candidates.length === 0) {
    return available.includes(selectedTf) ? selectedTf : (available[0] ?? selectedTf);
  }

  let ideal = candidates[candidates.length - 1]!;
  for (const tf of candidates) {
    if (projectedVisibleBars(windowSec, tf) <= VISIBLE_BARS_TARGET) {
      ideal = tf;
      break;
    }
  }
  return ideal;
}

/**
 * Effective pane TF for the current wall-clock window.
 * TV-style: always the user's TopBar pick (`selectedTf`). Zoom in/out must not
 * swap candles to another interval.
 */
export function pickLodTimeframe(opts: {
  windowSec: number;
  selectedTf: Timeframe;
  available: readonly Timeframe[];
  currentTf: Timeframe;
}): Timeframe {
  void opts.windowSec;
  void opts.currentTf;
  const { selectedTf, available } = opts;
  if (available.length === 0) return selectedTf;
  if (available.includes(selectedTf)) return selectedTf;

  // Catalog missing the pick — nearest available at or coarser than selected.
  const selectedSec = timeframeSeconds(selectedTf);
  const coarserOrEqual = TF_ORDER.filter(
    (tf) => available.includes(tf) && timeframeSeconds(tf) >= selectedSec,
  );
  return coarserOrEqual[0] ?? available[0] ?? selectedTf;
}
