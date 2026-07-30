import { computeEma } from '@/indicators/smaEma';

export interface MacdResult {
  macd: Float32Array;
  signal: Float32Array;
  hist: Float32Array;
}

/** MACD = EMA(fast) − EMA(slow); signal = EMA(macd); hist = macd − signal. */
export function computeMacd(
  closes: Float32Array,
  fast: number,
  slow: number,
  signalPeriod: number,
): MacdResult {
  const n = closes.length;
  const macd = new Float32Array(n);
  const signal = new Float32Array(n);
  const hist = new Float32Array(n);
  macd.fill(Number.NaN);
  signal.fill(Number.NaN);
  hist.fill(Number.NaN);

  if (n === 0 || fast < 1 || slow < 1 || signalPeriod < 1) {
    return { macd, signal, hist };
  }

  const emaFast = computeEma(closes, fast);
  const emaSlow = computeEma(closes, slow);
  for (let i = 0; i < n; i++) {
    const a = emaFast[i]!;
    const b = emaSlow[i]!;
    if (Number.isFinite(a) && Number.isFinite(b)) macd[i] = a - b;
  }

  // Signal EMA over macd line — seed with SMA of first signalPeriod finite macd values
  const k = 2 / (signalPeriod + 1);
  let primed = false;
  let ema = 0;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < n; i++) {
    const m = macd[i]!;
    if (!Number.isFinite(m)) continue;
    if (!primed) {
      seedSum += m;
      seedCount++;
      if (seedCount < signalPeriod) continue;
      ema = seedSum / signalPeriod;
      signal[i] = ema;
      hist[i] = m - ema;
      primed = true;
      continue;
    }
    ema = m * k + ema * (1 - k);
    signal[i] = ema;
    hist[i] = m - ema;
  }

  return { macd, signal, hist };
}
