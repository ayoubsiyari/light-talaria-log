import {
  bucketStart,
  indexAtOrBeforeBars,
  timeframeSeconds,
} from '@/data/timeframeAgg';
import { formBucketFromClock } from '@/replay/formingBars';
import { loadViewportAroundTime } from '@/datasets/seriesViewport';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import { MAX_BARS_IN_MEMORY } from '@/utils/constants';
import type { RevealMode } from '@/session/sessionState';

export interface RevealedViewportResult {
  bars: ChartBar[];
  /** Always last index of returned bars (right edge). */
  toIndex: number;
  fromIndex: number;
  windowFrom: number;
  totalBars: number;
}

/**
 * Load-time reveal: bars are truncated at the cursor bucket, with forming bar appended.
 * Last element is always the right edge — callers rely on this invariant.
 */
export async function revealedViewport(
  datasetId: string,
  tf: Timeframe,
  anchorTime: number,
  span: number,
  cursorTime: number,
  revealMode: RevealMode,
  opts?: {
    baseTf?: Timeframe;
    baseBars?: readonly ChartBar[];
  },
): Promise<RevealedViewportResult> {
  const safeSpan = Math.max(1, Math.min(span, MAX_BARS_IN_MEMORY));
  const period = timeframeSeconds(tf);

  if (revealMode === 'full') {
    const vp = await loadViewportAroundTime(datasetId, tf, anchorTime, safeSpan);
    if (vp.bars.length === 0) {
      return { bars: [], toIndex: 0, fromIndex: 0, windowFrom: 0, totalBars: 0 };
    }
    const toIndex = vp.bars.length - 1;
    const fromIndex = Math.max(0, toIndex - safeSpan + 1);
    return {
      bars: vp.bars as ChartBar[],
      toIndex,
      fromIndex,
      windowFrom: vp.windowFrom,
      totalBars: vp.totalBars,
    };
  }

  // Containing bucket of cursor — NOT last-closed (would rewind up to a full period).
  const openBucket = bucketStart(cursorTime, period);
  const vp = await loadViewportAroundTime(
    datasetId,
    tf,
    Math.min(anchorTime, cursorTime),
    Math.max(safeSpan + 8, 64),
  );
  if (vp.bars.length === 0) {
    return { bars: [], toIndex: 0, fromIndex: 0, windowFrom: 0, totalBars: 0 };
  }

  // Closed bars strictly before the open bucket.
  const closed: ChartBar[] = [];
  for (const b of vp.bars) {
    if (b.time < openBucket) closed.push(b);
    else if (b.time === openBucket) break;
    else break;
  }

  // Forming bar for the containing bucket from base/clock bars when available.
  const baseTf = opts?.baseTf ?? '1m';
  const baseBars = opts?.baseBars;
  let forming: ChartBar | null = null;
  if (baseBars && baseBars.length > 0 && timeframeSeconds(tf) > timeframeSeconds(baseTf)) {
    forming = formBucketFromClock(baseBars, openBucket, period, cursorTime);
  } else {
    // Same TF as clock / no base buffer: use partial from loaded series or synthesize from last ≤ cursor.
    const idx = indexAtOrBeforeBars(vp.bars, cursorTime);
    const at = vp.bars[idx];
    if (at && at.time === openBucket) {
      forming = { ...at };
    } else if (at && at.time < openBucket) {
      // Open bucket not in IDB window yet — leave forming null until base arrives.
      forming = null;
    } else if (at && at.time === openBucket) {
      forming = { ...at };
    }
    // If IDB already has the full open-bucket bar (pre-agg), still show it as "forming"
    // but truncate display set: prefer building from same-TF bars ≤ cursor inside bucket.
    if (!forming && at) {
      const sameBucket = vp.bars.filter(
        (b) => b.time >= openBucket && b.time <= cursorTime && b.time < openBucket + period,
      );
      if (sameBucket.length > 0) {
        const first = sameBucket[0]!;
        let high = first.high;
        let low = first.low;
        let close = first.close;
        let volume = first.volume ?? 0;
        for (let i = 1; i < sameBucket.length; i++) {
          const b = sameBucket[i]!;
          if (b.high > high) high = b.high;
          if (b.low < low) low = b.low;
          close = b.close;
          volume += b.volume ?? 0;
        }
        forming = {
          time: openBucket,
          open: first.open,
          high,
          low,
          close,
          volume,
        };
      }
    }
  }

  const bars = forming ? [...closed, forming] : closed.slice();
  // Prefer right edge at anchor when still ≤ cursor; else last revealed bar.
  if (bars.length === 0) {
    return {
      bars: [],
      toIndex: 0,
      fromIndex: 0,
      windowFrom: vp.windowFrom,
      totalBars: vp.totalBars,
    };
  }

  const toIndex = bars.length - 1;
  const available = bars.length;
  const useSpan = Math.min(safeSpan, available);
  const fromIndex = Math.max(0, toIndex - useSpan + 1);

  return {
    bars,
    toIndex,
    fromIndex,
    windowFrom: vp.windowFrom,
    totalBars: vp.totalBars,
  };
}

/** Dev assertion helper — last bar must not be past the containing cursor bucket. */
export function assertNoLookahead(
  bars: readonly ChartBar[],
  cursorTime: number,
  tf: Timeframe,
  paneId: string,
): void {
  if (!import.meta.env?.DEV || bars.length === 0) return;
  const last = bars[bars.length - 1]!;
  const open = bucketStart(cursorTime, timeframeSeconds(tf));
  if (last.time > open) {
    console.error('[reveal] lookahead leak', {
      paneId,
      tf,
      cursorTime,
      lastBarTime: last.time,
      openBucket: open,
    });
  }
}
