import { timeframeSeconds } from '@/data/timeframeAgg';
import type { Timeframe } from '@/types/ui';
import { VISIBLE_BARS_TARGET } from '@/utils/constants';

/**
 * Zoom LOD (Step 10) — pick a pre-aggregated TF so the wall-clock window
 * stays near VISIBLE_BARS_TARGET and never denser than LOD_COARSEN_BARS.
 *
 * UX: `selectedTf` is the user's last explicit TopBar pick (floor).
 * Auto-LOD may coarsen above it on zoom-out and refine back toward it on
 * zoom-in. Never goes finer than `selectedTf` without another explicit pick.
 * Toolbar ★ favorites are unrelated to this floor.
 */

/** Coarsen when current TF would pack more bars than this into the window. */
export const LOD_COARSEN_BARS = 1800;
/** Refine toward selected TF only when current TF is this sparse (hysteresis). */
export const LOD_REFINE_BARS = 700;

const TF_ORDER: readonly Timeframe[] = [
  '1s',
  '5s',
  '10s',
  '15s',
  '30s',
  '45s',
  '1m',
  '5m',
  '15m',
  '1h',
  '4h',
  '1D',
];

/** Approximate visible bar count for a wall-clock span at `tf`. */
export function projectedVisibleBars(windowSec: number, tf: Timeframe): number {
  const period = timeframeSeconds(tf);
  if (period <= 0 || !(windowSec > 0)) return 0;
  return windowSec / period;
}

/**
 * Finest available TF (≥ selected floor) whose projected bars fit the target.
 * Falls back to coarsest candidate when even that is too dense.
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

  // Prefer finest that stays ≤ target; else coarsest available.
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
 * Choose effective pane TF for the current wall-clock window.
 * Hysteresis avoids TF thrash while the user is still zooming.
 */
export function pickLodTimeframe(opts: {
  windowSec: number;
  selectedTf: Timeframe;
  available: readonly Timeframe[];
  currentTf: Timeframe;
}): Timeframe {
  const { windowSec, selectedTf, available, currentTf } = opts;
  const ideal = idealLodTimeframe(windowSec, selectedTf, available);
  if (ideal === currentTf) return currentTf;

  const selectedSec = timeframeSeconds(selectedTf);
  const candidates = TF_ORDER.filter(
    (tf) => available.includes(tf) && timeframeSeconds(tf) >= selectedSec,
  );
  const currentOk = candidates.includes(currentTf);
  if (!currentOk) return ideal;

  const currentSec = timeframeSeconds(currentTf);
  const idealSec = timeframeSeconds(ideal);
  const curProj = projectedVisibleBars(windowSec, currentTf);

  if (idealSec > currentSec) {
    // Zoomed out — coarsen only past density threshold.
    return curProj > LOD_COARSEN_BARS ? ideal : currentTf;
  }
  if (idealSec < currentSec) {
    // Zoomed in — refine toward selected only when current is sparse.
    return curProj < LOD_REFINE_BARS ? ideal : currentTf;
  }
  return ideal;
}
