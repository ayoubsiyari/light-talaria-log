import {
  assertNoLookahead,
  revealedViewport,
} from '@/session/revealedViewport';
import type { PaneView, SessionState } from '@/session/sessionState';
import { warmCache } from '@/session/warmCache';
import { bucketStart, timeframeSeconds } from '@/data/timeframeAgg';
import { formBucketFromClock } from '@/replay/formingBars';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';

/**
 * Pure-ish derivation: build PaneView from session state + warm cache.
 * Async path (`derivePaneAsync`) uses revealedViewport for correctness.
 * Sync path uses cache + local truncate for zero-await TF switches.
 */
export function derivePaneSync(s: SessionState, paneId: string): PaneView | null {
  const cfg = s.panes[paneId];
  if (!cfg) return null;

  const raw = warmCache.get(cfg.datasetId, cfg.tf, s.anchorTime, s.span);
  const baseBars =
    warmCache.peek(cfg.datasetId, s.baseTf) ??
    (cfg.tf === s.baseTf ? raw : []);

  const bars = truncateAtCursor(
    raw,
    s.cursorTime,
    cfg.tf,
    s.revealMode,
    s.baseTf,
    baseBars,
  );

  if (import.meta.env?.DEV && s.revealMode === 'replay') {
    assertNoLookahead(bars, s.cursorTime, cfg.tf, paneId);
  }

  if (bars.length === 0) {
    return {
      bars: [],
      range: { fromIndex: 0, toIndex: 1 },
      timeframe: cfg.tf,
      selectedTf: cfg.selectedTf,
      datasetId: cfg.datasetId,
      pair: cfg.pair,
    };
  }

  const toIndex = bars.length - 1;
  const useSpan = Math.min(s.span, bars.length);
  const fromIndex = Math.max(0, toIndex - useSpan + 1);

  return {
    bars,
    range: { fromIndex, toIndex },
    timeframe: cfg.tf,
    selectedTf: cfg.selectedTf,
    datasetId: cfg.datasetId,
    pair: cfg.pair,
  };
}

export async function derivePaneAsync(
  s: SessionState,
  paneId: string,
): Promise<PaneView | null> {
  const cfg = s.panes[paneId];
  if (!cfg) return null;

  // Fill cache from IDB (epoch-guarded inside warmCache), then derive sync.
  // revealedViewport remains the explicit load-time API for non-cache callers.
  await warmCache.fill(cfg.datasetId, cfg.tf, s.anchorTime, s.span);
  if (cfg.tf !== s.baseTf) {
    await warmCache.fill(cfg.datasetId, s.baseTf, s.cursorTime, s.span);
  }

  // Optional correctness pass when cache miss left empty (e.g. first paint).
  const peek = warmCache.peek(cfg.datasetId, cfg.tf);
  if (!peek || peek.length === 0) {
    const baseBars = warmCache.peek(cfg.datasetId, s.baseTf) ?? [];
    const result = await revealedViewport(
      cfg.datasetId,
      cfg.tf,
      s.anchorTime,
      s.span,
      s.cursorTime,
      s.revealMode,
      { baseTf: s.baseTf, baseBars },
    );
    if (result.bars.length > 0) {
      warmCache.put(cfg.datasetId, cfg.tf, result.bars, s.anchorTime);
    }
    if (import.meta.env?.DEV && s.revealMode === 'replay') {
      assertNoLookahead(result.bars, s.cursorTime, cfg.tf, paneId);
    }
    return {
      bars: result.bars,
      range: { fromIndex: result.fromIndex, toIndex: result.toIndex },
      timeframe: cfg.tf,
      selectedTf: cfg.selectedTf,
      datasetId: cfg.datasetId,
      pair: cfg.pair,
    };
  }

  return derivePaneSync(s, paneId);
}

function truncateAtCursor(
  raw: readonly ChartBar[],
  cursorTime: number,
  tf: Timeframe,
  revealMode: SessionState['revealMode'],
  baseTf: Timeframe,
  baseBars: readonly ChartBar[],
): ChartBar[] {
  if (revealMode === 'full' || raw.length === 0) return raw.slice() as ChartBar[];

  const period = timeframeSeconds(tf);
  const openBucket = bucketStart(cursorTime, period);
  const closed: ChartBar[] = [];
  for (const b of raw) {
    if (b.time < openBucket) closed.push(b);
    else break;
  }

  let forming: ChartBar | null = null;
  if (timeframeSeconds(tf) > timeframeSeconds(baseTf) && baseBars.length > 0) {
    forming = formBucketFromClock(baseBars, openBucket, period, cursorTime);
  } else {
    const inBucket = raw.filter(
      (b) => b.time >= openBucket && b.time <= cursorTime && b.time < openBucket + period,
    );
    if (inBucket.length > 0) {
      const first = inBucket[0]!;
      let high = first.high;
      let low = first.low;
      let close = first.close;
      let volume = first.volume ?? 0;
      for (let i = 1; i < inBucket.length; i++) {
        const b = inBucket[i]!;
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

  return forming ? [...closed, forming] : closed;
}
