import {
  assertNoLookahead,
  revealedViewport,
} from '@/session/revealedViewport';
import { barsMatchTimeframe } from '@/session/barTfGuard';
import type { PaneView, SessionState } from '@/session/sessionState';
import { warmCache } from '@/session/warmCache';
import { sanitizeChartBars } from '@/data/ohlcGuard';
import {
  tfBucketEnd,
  tfBucketStart,
  timeframeSeconds,
  type AggregateBarsOpts,
} from '@/data/timeframeAgg';
import { formBucketFromClock } from '@/replay/formingBars';
import { rangeRightAnchored } from '@/chart/rangeAnchor';
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

  const rawCandidate = warmCache.get(cfg.datasetId, cfg.tf, s.anchorTime, s.span);
  // Never treat a finer TF placeholder as this pane's series (1m-on-1D sawtooth).
  const raw = barsMatchTimeframe(rawCandidate, cfg.tf) ? rawCandidate : [];
  const basePeek = warmCache.peek(cfg.datasetId, s.baseTf);
  const baseBars =
    basePeek ??
    (cfg.tf === s.baseTf && barsMatchTimeframe(rawCandidate, s.baseTf)
      ? rawCandidate
      : []);

  const bars = sanitizeChartBars(
    truncateAtCursor(
      raw,
      s.cursorTime,
      cfg.tf,
      s.revealMode,
      s.baseTf,
      baseBars,
      { symbol: cfg.pair },
    ),
  );

  if (import.meta.env?.DEV && s.revealMode === 'replay') {
    assertNoLookahead(bars, s.cursorTime, cfg.tf, paneId, cfg.pair);
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

  // Keep perceptual zoom (session.span) even when few bars are revealed —
  // collapsing to 1-bar width freezes the "candles moving" feel at session start.
  return {
    bars,
    range: rangeRightAnchored(bars.length - 1, s.span),
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
      { baseTf: s.baseTf, baseBars, symbol: cfg.pair },
    );
    if (result.bars.length > 0) {
      warmCache.put(cfg.datasetId, cfg.tf, result.bars, s.anchorTime);
    }
    // Must return sanitized bars — put() cleans the cache copy, but result.bars
    // was still the dirty IDB pack (ES low≈0/−14 painted before any engine sanitize).
    const cleaned =
      warmCache.peek(cfg.datasetId, cfg.tf) ?? sanitizeChartBars(result.bars);
    if (import.meta.env?.DEV && s.revealMode === 'replay') {
      assertNoLookahead(cleaned, s.cursorTime, cfg.tf, paneId, cfg.pair);
    }
    return {
      bars: cleaned,
      range:
        cleaned.length > 0
          ? rangeRightAnchored(cleaned.length - 1, s.span)
          : { fromIndex: result.fromIndex, toIndex: result.toIndex },
      timeframe: cfg.tf,
      selectedTf: cfg.selectedTf,
      datasetId: cfg.datasetId,
      pair: cfg.pair,
    };
  }

  return derivePaneSync(s, paneId);
}

/** Load-time / tick reveal: closed buckets + forming tip. Exported for play path. */
export function truncateAtCursor(
  raw: readonly ChartBar[],
  cursorTime: number,
  tf: Timeframe,
  revealMode: SessionState['revealMode'],
  baseTf: Timeframe,
  baseBars: readonly ChartBar[],
  aggOpts?: AggregateBarsOpts,
): ChartBar[] {
  if (revealMode === 'full' || raw.length === 0) return raw.slice() as ChartBar[];

  const period = timeframeSeconds(tf);
  const openBucket = tfBucketStart(cursorTime, tf, aggOpts);
  const bucketEnd = tfBucketEnd(openBucket, tf, aggOpts);
  const closed: ChartBar[] = [];
  for (const b of raw) {
    if (b.time < openBucket) closed.push(b);
    else break;
  }

  let forming: ChartBar | null = null;
  if (timeframeSeconds(tf) > timeframeSeconds(baseTf) && baseBars.length > 0) {
    forming = formBucketFromClock(
      baseBars,
      openBucket,
      period,
      cursorTime,
      bucketEnd,
    );
  } else {
    const inBucket = raw.filter(
      (b) =>
        b.time >= openBucket && b.time <= cursorTime && b.time < bucketEnd,
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
