/** Wilder RSI. Warmup = NaN. */

export function computeRsi(closes: Float32Array, period: number): Float32Array {
  const n = closes.length;
  const out = new Float32Array(n);
  out.fill(Number.NaN);
  if (period < 1 || n < period + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;

  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs0);

  for (let i = period + 1; i < n; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) {
      out[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}
