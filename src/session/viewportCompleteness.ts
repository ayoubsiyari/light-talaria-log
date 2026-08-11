import { isValidOhlcBar } from '@/data/ohlcGuard';
import { bucketStart, timeframeSeconds } from '@/data/timeframeAgg';
import { barsMatchTimeframe } from '@/session/barTfGuard';
import type { ChartBar, VisibleRange } from '@/types/bar';
import type { Timeframe } from '@/types/ui';

export type CompletenessReason =
  | 'empty'
  | 'tip_only'
  | 'empty_left'
  | 'short_lookback'
  | 'bad_ohlc'
  | 'unsorted'
  | 'misaligned_bucket'
  | 'duplicate_time'
  | 'tf_mismatch'
  | 'ok';

export interface CompletenessInput {
  bars: readonly ChartBar[];
  /** Visible bar-count zoom (session.span / camera span). */
  span: number;
  cursorTime: number;
  tf: Timeframe;
  /** Optional live engine camera — used for empty-left detection. */
  range?: VisibleRange | null;
  /**
   * Optional base-TF bars for cross-TF candle consistency (e.g. 1m vs 5m).
   * When provided with baseTf, closed higher-TF candles are sampled against
   * aggregates of the base series.
   */
  baseBars?: readonly ChartBar[];
  baseTf?: Timeframe;
}

export interface CompletenessResult {
  ok: boolean;
  reason: CompletenessReason;
  /** Minimum revealed bars expected for the current zoom. */
  minBars: number;
  barsLength: number;
  /** Index of first bad bar when integrity fails (else -1). */
  badIndex: number;
}

/** Tip-only threshold used by TF-switch sparse retry and App heal. */
export function minBarsForSpan(span: number): number {
  const spanSafe = Math.max(1, span);
  return Math.min(24, Math.max(8, Math.floor(spanSafe * 0.2)));
}

/** Full-viewport target: enough closed history to fill ~85% of the zoom. */
export function fullViewportMinBars(span: number): number {
  const spanSafe = Math.max(1, span);
  return Math.min(
    400,
    Math.max(minBarsForSpan(spanSafe), Math.floor(spanSafe * 0.85)),
  );
}

function ohlcOk(b: ChartBar): boolean {
  // Strict positive OHLC — empty/holiday zeros must fail integrity.
  return isValidOhlcBar(b);
}

/**
 * Full viewport bar scan — integrity of the revealed series for a TF.
 *
 * Checks sort order, bucket alignment, duplicates, and OHLC validity.
 * Tip (last) bar may be a forming partial; closed bars must sit on bucket starts.
 */
export function scanBarIntegrity(
  bars: readonly ChartBar[],
  tf: Timeframe,
): { ok: boolean; reason: CompletenessReason; badIndex: number } {
  if (bars.length === 0) {
    return { ok: false, reason: 'empty', badIndex: -1 };
  }

  const period = Math.max(1, timeframeSeconds(tf));
  const tip = bars.length - 1;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    if (!Number.isFinite(b.time)) {
      return { ok: false, reason: 'unsorted', badIndex: i };
    }
    if (!ohlcOk(b)) {
      return { ok: false, reason: 'bad_ohlc', badIndex: i };
    }
    // Every candle (incl. forming tip) must sit on a TF bucket start.
    if (b.time !== bucketStart(b.time, period)) {
      return { ok: false, reason: 'misaligned_bucket', badIndex: i };
    }
    if (i > 0) {
      const prev = bars[i - 1]!;
      if (b.time < prev.time) {
        return { ok: false, reason: 'unsorted', badIndex: i };
      }
      if (b.time === prev.time) {
        return { ok: false, reason: 'duplicate_time', badIndex: i };
      }
    }
  }

  // Spacing must look like this TF (rejects 1m sawtooth painted as 1h/1D).
  if (!barsMatchTimeframe(bars, tf)) {
    return { ok: false, reason: 'tf_mismatch', badIndex: tip };
  }

  return { ok: true, reason: 'ok', badIndex: -1 };
}

/**
 * Sample closed higher-TF candles against base-TF aggregates.
 * Returns false when a closed HTF candle disagrees with base OHLC in its bucket.
 */
export function checkCrossTfCandles(
  higherBars: readonly ChartBar[],
  baseBars: readonly ChartBar[],
  higherTf: Timeframe,
  baseTf: Timeframe,
  cursorTime: number,
): { ok: boolean; badIndex: number } {
  const hPeriod = timeframeSeconds(higherTf);
  const bPeriod = timeframeSeconds(baseTf);
  if (hPeriod <= bPeriod || higherBars.length === 0 || baseBars.length === 0) {
    return { ok: true, badIndex: -1 };
  }

  const openBucket = bucketStart(cursorTime, hPeriod);
  // Skip forming tip; sample up to 24 closed candles from the right.
  const closed = higherBars.filter((b) => b.time < openBucket);
  if (closed.length === 0) return { ok: true, badIndex: -1 };

  const sampleFrom = Math.max(0, closed.length - 24);
  const eps = 1e-8;

  for (let i = sampleFrom; i < closed.length; i++) {
    const hb = closed[i]!;
    const bucket = hb.time;
    const bucketEnd = bucket + hPeriod;
    let open = Number.NaN;
    let high = -Infinity;
    let low = Infinity;
    let close = Number.NaN;
    let n = 0;
    for (const bb of baseBars) {
      if (bb.time < bucket) continue;
      if (bb.time >= bucketEnd) break;
      if (n === 0) open = bb.open;
      if (bb.high > high) high = bb.high;
      if (bb.low < low) low = bb.low;
      close = bb.close;
      n += 1;
    }
    if (n === 0) continue; // base window may not cover this bucket yet
    if (
      Math.abs(hb.open - open) > eps ||
      Math.abs(hb.high - high) > eps ||
      Math.abs(hb.low - low) > eps ||
      Math.abs(hb.close - close) > eps
    ) {
      return { ok: false, badIndex: i };
    }
  }

  return { ok: true, badIndex: -1 };
}

/**
 * Soft viewport completeness + full bar scan.
 *
 * Detects tip-only / empty-left reveals after TF switch and bad candle series
 * (misaligned buckets, unsorted, OHLC, cross-TF mismatch when base provided).
 *
 * Not a full-series load — only the current revealed viewport (≤ MAX_BARS).
 */
export function checkViewportCompleteness(
  input: CompletenessInput,
): CompletenessResult {
  const span = Math.max(1, input.span);
  const minBars = minBarsForSpan(span);
  const barsLength = input.bars.length;

  if (barsLength === 0) {
    return { ok: false, reason: 'empty', minBars, barsLength, badIndex: -1 };
  }

  // Full bar integrity scan (every revealed candle for this TF).
  const integrity = scanBarIntegrity(input.bars, input.tf);
  if (!integrity.ok) {
    return {
      ok: false,
      reason: integrity.reason,
      minBars,
      barsLength,
      badIndex: integrity.badIndex,
    };
  }

  if (barsLength < minBars) {
    return { ok: false, reason: 'tip_only', minBars, barsLength, badIndex: -1 };
  }

  // Right-anchored camera wants ~0.9·span of history. If revealed tip index
  // cannot fill that, the plot is mostly empty left pad.
  const tipIndex = barsLength - 1;
  if (tipIndex < span * 0.55) {
    return { ok: false, reason: 'empty_left', minBars, barsLength, badIndex: -1 };
  }

  // Optional: visible range starts far before bar 0 (empty pad dominating).
  if (input.range && input.range.toIndex > input.range.fromIndex) {
    const from = input.range.fromIndex;
    if (from < -span * 0.35 && tipIndex < span * 0.7) {
      return {
        ok: false,
        reason: 'empty_left',
        minBars,
        barsLength,
        badIndex: -1,
      };
    }
  }

  // Full-viewport lookback: first bar too close to cursor vs expected history.
  const period = Math.max(1, timeframeSeconds(input.tf));
  const first = input.bars[0]!.time;
  const needLookbackSec = span * period * 0.5;
  if (
    Number.isFinite(input.cursorTime) &&
    first > input.cursorTime - needLookbackSec
  ) {
    // Flag when we also lack a full-viewport buffer (early-session exception).
    if (barsLength < fullViewportMinBars(span)) {
      return {
        ok: false,
        reason: 'short_lookback',
        minBars,
        barsLength,
        badIndex: -1,
      };
    }
  }

  // Cross-TF candle consistency when base series is available.
  if (input.baseBars && input.baseTf && input.baseTf !== input.tf) {
    const cross = checkCrossTfCandles(
      input.bars,
      input.baseBars,
      input.tf,
      input.baseTf,
      input.cursorTime,
    );
    if (!cross.ok) {
      return {
        ok: false,
        reason: 'tf_mismatch',
        minBars,
        barsLength,
        badIndex: cross.badIndex,
      };
    }
  }

  return { ok: true, reason: 'ok', minBars, barsLength, badIndex: -1 };
}

/** True when a heal/refill should run. */
export function needsViewportHeal(input: CompletenessInput): boolean {
  return !checkViewportCompleteness(input).ok;
}
