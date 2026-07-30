/** Pure SMA/EMA — runs in Worker (and tests). Warmup = NaN. */

export function computeSma(closes: Float32Array, period: number): Float32Array {
  const n = closes.length;
  const out = new Float32Array(n);
  out.fill(Number.NaN);
  if (period < 1 || n === 0) return out;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += closes[i]!;
    if (i >= period) sum -= closes[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function computeEma(closes: Float32Array, period: number): Float32Array {
  const n = closes.length;
  const out = new Float32Array(n);
  out.fill(Number.NaN);
  if (period < 1 || n === 0) return out;

  const k = 2 / (period + 1);
  let ema = 0;
  let primed = false;
  for (let i = 0; i < n; i++) {
    const c = closes[i]!;
    if (!primed) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j]!;
      ema = sum / period;
      out[i] = ema;
      primed = true;
      continue;
    }
    ema = c * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}
