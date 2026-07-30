import { computeSma } from '@/indicators/smaEma';

export interface BollingerResult {
  mid: Float32Array;
  upper: Float32Array;
  lower: Float32Array;
}

/** Bollinger Bands: SMA ± stdDev * population stdev over period. Warmup = NaN. */
export function computeBollinger(
  closes: Float32Array,
  period: number,
  stdDev: number,
): BollingerResult {
  const n = closes.length;
  const mid = computeSma(closes, period);
  const upper = new Float32Array(n);
  const lower = new Float32Array(n);
  upper.fill(Number.NaN);
  lower.fill(Number.NaN);
  if (period < 1 || n === 0) return { mid, upper, lower };

  for (let i = period - 1; i < n; i++) {
    const m = mid[i]!;
    if (!Number.isFinite(m)) continue;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j]! - m;
      sumSq += d * d;
    }
    const sd = Math.sqrt(sumSq / period) * stdDev;
    upper[i] = m + sd;
    lower[i] = m - sd;
  }
  return { mid, upper, lower };
}
