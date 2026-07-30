export interface OhlcBars {
  opens: Float32Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  volumes: Float32Array;
  times: Float64Array;
}

export function nanArray(n: number): Float32Array {
  const out = new Float32Array(n);
  out.fill(Number.NaN);
  return out;
}

export function num(params: Record<string, number | string | boolean>, key: string, fallback: number): number {
  const v = params[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

export function str(params: Record<string, number | string | boolean>, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}

export function bool(params: Record<string, number | string | boolean>, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function computeSma(src: Float32Array, period: number): Float32Array {
  const n = src.length;
  const out = nanArray(n);
  if (period < 1 || n === 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += src[i]!;
    if (i >= period) sum -= src[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function computeEma(src: Float32Array, period: number): Float32Array {
  const n = src.length;
  const out = nanArray(n);
  if (period < 1 || n === 0) return out;
  const k = 2 / (period + 1);
  let ema = 0;
  let primed = false;
  for (let i = 0; i < n; i++) {
    const c = src[i]!;
    if (!primed) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += src[j]!;
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

export function computeRma(src: Float32Array, period: number): Float32Array {
  const n = src.length;
  const out = nanArray(n);
  if (period < 1 || n === 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (i < period) {
      sum += src[i]!;
      if (i === period - 1) out[i] = sum / period;
      continue;
    }
    out[i] = (out[i - 1]! * (period - 1) + src[i]!) / period;
  }
  return out;
}

export function computeWma(src: Float32Array, period: number): Float32Array {
  const n = src.length;
  const out = nanArray(n);
  if (period < 1 || n === 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += src[i - j]! * (period - j);
    out[i] = sum / denom;
  }
  return out;
}

export function trueRange(highs: Float32Array, lows: Float32Array, closes: Float32Array): Float32Array {
  const n = closes.length;
  const out = nanArray(n);
  for (let i = 0; i < n; i++) {
    const h = highs[i]!;
    const l = lows[i]!;
    if (i === 0) {
      out[i] = h - l;
      continue;
    }
    const pc = closes[i - 1]!;
    out[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return out;
}

export function highest(src: Float32Array, period: number): Float32Array {
  const n = src.length;
  const out = nanArray(n);
  for (let i = period - 1; i < n; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.max(m, src[j]!);
    out[i] = m;
  }
  return out;
}

export function lowest(src: Float32Array, period: number): Float32Array {
  const n = src.length;
  const out = nanArray(n);
  for (let i = period - 1; i < n; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) m = Math.min(m, src[j]!);
    out[i] = m;
  }
  return out;
}

export function typicalPrice(highs: Float32Array, lows: Float32Array, closes: Float32Array): Float32Array {
  const n = closes.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (highs[i]! + lows[i]! + closes[i]!) / 3;
  return out;
}

export function fillForward(src: Float32Array): Float32Array {
  const out = new Float32Array(src.length);
  let last = Number.NaN;
  for (let i = 0; i < src.length; i++) {
    const v = src[i]!;
    if (Number.isFinite(v)) last = v;
    out[i] = last;
  }
  return out;
}

/** Horizontal level from index `from` onward. */
export function levelFrom(n: number, from: number, value: number): Float32Array {
  const out = nanArray(n);
  for (let i = Math.max(0, from); i < n; i++) out[i] = value;
  return out;
}
