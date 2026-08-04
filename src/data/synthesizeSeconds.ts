/**
 * Synthesize sub-minute OHLCV from 1m bars (viewport-only; never invents tick truth).
 * Deterministic per minute open-time so the same 1m bar always expands the same way.
 */
import type { Timeframe } from '@/types/ui';
import { createBarStore, type BinaryBarStore } from './binaryBar';
import {
  aggregateBars,
  isSecondTimeframe,
  timeframeSeconds,
} from './timeframeAgg';

export const SECOND_TIMEFRAMES = ['1s', '5s', '10s', '15s', '30s', '45s'] as const;
export type SecondTimeframe = (typeof SECOND_TIMEFRAMES)[number];

export { isSecondTimeframe };

/** 1m (or any ≤60s base) can feed synthetic second TFs. */
export function canSynthesizeSecondsFrom(baseTf: Timeframe): boolean {
  return timeframeSeconds(baseTf) === 60;
}

/** IDB / server series used as the synthesis source. */
export function synthesisSourceTf(_target: SecondTimeframe): Timeframe {
  return '1m';
}

/** Estimated bar count for a synthetic TF given 1m row count. */
export function estimatedSyntheticRowCount(
  m1RowCount: number,
  tf: SecondTimeframe,
): number {
  if (m1RowCount <= 0) return 0;
  const period = timeframeSeconds(tf);
  return Math.max(1, Math.floor((m1RowCount * 60) / period));
}

export function asSecondTimeframe(tf: Timeframe): SecondTimeframe | null {
  return isSecondTimeframe(tf) ? (tf as SecondTimeframe) : null;
}

/** Mulberry32 — fast deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

/**
 * Expand one 1m OHLC into 60 one-second bars.
 * Guarantees: first open = O, last close = C, path touches H and L, volume sums to V.
 */
export function expandMinuteTo1s(
  t0: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  out: BinaryBarStore,
): void {
  const n = 60;
  const lo = Math.min(low, high, open, close);
  const hi = Math.max(high, low, open, close);
  const o = clamp(open, lo, hi);
  const c = clamp(close, lo, hi);

  // Flat / zero-range minute — emit flat seconds.
  if (!(hi > lo) || !Number.isFinite(hi) || !Number.isFinite(lo)) {
    const volEach = volume / n;
    for (let i = 0; i < n; i++) {
      const idx = out.length;
      out.time[idx] = t0 + i;
      out.open[idx] = o;
      out.high[idx] = o;
      out.low[idx] = o;
      out.close[idx] = o;
      out.volume[idx] = volEach;
      out.length++;
    }
    return;
  }

  const rnd = mulberry32((Math.floor(t0) * 2654435761) >>> 0);
  const bullish = c >= o;

  // Two distinct interior keypoints for extremes (open→ext1→ext2→close).
  let i1 = 1 + Math.floor(rnd() * (n - 3)); // 1 .. n-3
  let i2 = i1 + 1 + Math.floor(rnd() * Math.max(1, n - 2 - i1)); // > i1 .. n-2
  if (i2 >= n - 1) i2 = n - 2;
  if (i1 >= i2) {
    i1 = Math.max(1, Math.floor((n - 1) / 3));
    i2 = Math.max(i1 + 1, Math.floor((2 * (n - 1)) / 3));
  }

  const iLow = bullish ? i1 : i2;
  const iHigh = bullish ? i2 : i1;

  const closes = new Float64Array(n);
  closes[0] = o;
  closes[n - 1] = c;
  closes[iLow] = lo;
  closes[iHigh] = hi;

  const keypoints = [
    { i: 0, p: o },
    { i: i1, p: bullish ? lo : hi },
    { i: i2, p: bullish ? hi : lo },
    { i: n - 1, p: c },
  ];

  for (let s = 0; s < keypoints.length - 1; s++) {
    const a = keypoints[s]!;
    const b = keypoints[s + 1]!;
    const span = b.i - a.i;
    if (span <= 0) continue;
    for (let k = 1; k < span; k++) {
      const t = k / span;
      const lin = a.p + (b.p - a.p) * t;
      // Small noise; stay inside [lo, hi]. Shrink near segment ends.
      const edge = Math.min(k, span - k) / span;
      const noiseAmp = (hi - lo) * 0.08 * edge;
      const noise = (rnd() * 2 - 1) * noiseAmp;
      closes[a.i + k] = clamp(lin + noise, lo, hi);
    }
  }
  closes[iLow] = lo;
  closes[iHigh] = hi;
  closes[0] = o;
  closes[n - 1] = c;

  let volLeft = volume;
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? o : closes[i - 1]!;
    const cur = closes[i]!;
    let bh = Math.max(prev, cur);
    let bl = Math.min(prev, cur);
    // Micro-wicks (still inside minute range).
    const wick = (hi - lo) * 0.02 * rnd();
    bh = clamp(bh + wick, lo, hi);
    bl = clamp(bl - wick, lo, hi);
    if (i === iHigh) bh = hi;
    if (i === iLow) bl = lo;
    // Keep open/close inside bar high/low.
    const bo = prev;
    const bc = cur;
    bh = Math.max(bh, bo, bc);
    bl = Math.min(bl, bo, bc);

    const idx = out.length;
    const vol =
      i === n - 1 ? volLeft : volume / n + (rnd() - 0.5) * (volume / n) * 0.2;
    const v = i === n - 1 ? volLeft : Math.max(0, Math.min(volLeft, vol));
    volLeft -= v;

    out.time[idx] = t0 + i;
    out.open[idx] = clamp(bo, lo, hi);
    out.high[idx] = clamp(Math.max(bh, bo, bc), lo, hi);
    out.low[idx] = clamp(Math.min(bl, bo, bc), lo, hi);
    out.close[idx] = clamp(bc, lo, hi);
    out.volume[idx] = v;
    out.length++;
  }
}

/** Expand a 1m BinaryBarStore into 1s bars (capacity = m1.length * 60). */
export function synthesize1sFromMinutes(m1: BinaryBarStore): BinaryBarStore {
  const out = createBarStore(m1.length * 60);
  for (let i = 0; i < m1.length; i++) {
    expandMinuteTo1s(
      m1.time[i]!,
      m1.open[i]!,
      m1.high[i]!,
      m1.low[i]!,
      m1.close[i]!,
      m1.volume[i]!,
      out,
    );
  }
  return out;
}

/**
 * Build target second TF from 1m bars: 1s path first, then aggregate when needed.
 */
export function synthesizeFromMinutes(
  m1: BinaryBarStore,
  targetTf: SecondTimeframe,
): BinaryBarStore {
  const ones = synthesize1sFromMinutes(m1);
  if (targetTf === '1s') return ones;
  return aggregateBars(ones, targetTf);
}
