import {
  computeEma,
  computeRma,
  computeSma,
  computeWma,
  fillForward,
  highest,
  levelFrom,
  lowest,
  nanArray,
  num,
  str,
  trueRange,
  typicalPrice,
  type OhlcBars,
} from '@/indicators/math/helpers';
import type { IndicatorId, IndicatorParams, IndicatorWorkerSeries } from '@/types/indicator';

function line(key: string, values: Float32Array): IndicatorWorkerSeries {
  return { key, style: 'line', values };
}
function hist(key: string, values: Float32Array): IndicatorWorkerSeries {
  return { key, style: 'histogram', values };
}
function band(key: string, values: Float32Array, bandPairKey: string): IndicatorWorkerSeries {
  return { key, style: 'band', values, bandPairKey };
}

function stdev(src: Float32Array, period: number, mean: Float32Array): Float32Array {
  const n = src.length;
  const out = nanArray(n);
  for (let i = period - 1; i < n; i++) {
    const m = mean[i]!;
    if (!Number.isFinite(m)) continue;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = src[j]! - m;
      sumSq += d * d;
    }
    out[i] = Math.sqrt(sumSq / period);
  }
  return out;
}

function computeHma(src: Float32Array, period: number): Float32Array {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtP = Math.max(1, Math.floor(Math.sqrt(period)));
  const wmaHalf = computeWma(src, half);
  const wmaFull = computeWma(src, period);
  const diff = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const a = wmaHalf[i]!;
    const b = wmaFull[i]!;
    diff[i] = Number.isFinite(a) && Number.isFinite(b) ? 2 * a - b : Number.NaN;
  }
  return computeWma(diff, sqrtP);
}

function computeVwma(closes: Float32Array, volumes: Float32Array, period: number): Float32Array {
  const n = closes.length;
  const out = nanArray(n);
  let sumCV = 0;
  let sumV = 0;
  for (let i = 0; i < n; i++) {
    const cv = closes[i]! * volumes[i]!;
    sumCV += cv;
    sumV += volumes[i]!;
    if (i >= period) {
      sumCV -= closes[i - period]! * volumes[i - period]!;
      sumV -= volumes[i - period]!;
    }
    if (i >= period - 1 && sumV > 0) out[i] = sumCV / sumV;
  }
  return out;
}

function computeRsi(closes: Float32Array, period: number): Float32Array {
  const n = closes.length;
  const out = nanArray(n);
  if (n < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const d = closes[i]! - closes[i - 1]!;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function computeMacd(
  closes: Float32Array,
  fast: number,
  slow: number,
  signalPeriod: number,
): { macd: Float32Array; signal: Float32Array; hist: Float32Array } {
  const n = closes.length;
  const macd = nanArray(n);
  const signal = nanArray(n);
  const histArr = nanArray(n);
  const emaFast = computeEma(closes, fast);
  const emaSlow = computeEma(closes, slow);
  for (let i = 0; i < n; i++) {
    const a = emaFast[i]!;
    const b = emaSlow[i]!;
    if (Number.isFinite(a) && Number.isFinite(b)) macd[i] = a - b;
  }
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
      histArr[i] = m - ema;
      primed = true;
      continue;
    }
    ema = m * k + ema * (1 - k);
    signal[i] = ema;
    histArr[i] = m - ema;
  }
  return { macd, signal, hist: histArr };
}

function swingPivots(
  highs: Float32Array,
  lows: Float32Array,
  left: number,
  right: number,
): { highIdx: number[]; lowIdx: number[] } {
  const highIdx: number[] = [];
  const lowIdx: number[] = [];
  const n = highs.length;
  for (let i = left; i < n - right; i++) {
    let isH = true;
    let isL = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (highs[j]! > highs[i]!) isH = false;
      if (lows[j]! < lows[i]!) isL = false;
    }
    if (isH) highIdx.push(i);
    if (isL) lowIdx.push(i);
  }
  return { highIdx, lowIdx };
}

/** Compute series for one indicator id. */
export function computeSeries(
  id: IndicatorId,
  bars: OhlcBars,
  params: IndicatorParams,
): IndicatorWorkerSeries[] {
  const { opens, highs, lows, closes, volumes, times } = bars;
  const n = closes.length;
  const period = Math.max(1, Math.floor(num(params, 'period', 14)));

  switch (id) {
    case 'sma':
      return [line('sma', computeSma(closes, period))];
    case 'ema':
      return [line('ema', computeEma(closes, period))];
    case 'wma':
      return [line('wma', computeWma(closes, period))];
    case 'hma':
      return [line('hma', computeHma(closes, period))];
    case 'vwma':
      return [line('vwma', computeVwma(closes, volumes, period))];
    case 'dema': {
      const e1 = computeEma(closes, period);
      const e2 = computeEma(e1, period);
      const out = nanArray(n);
      for (let i = 0; i < n; i++) {
        const a = e1[i]!;
        const b = e2[i]!;
        if (Number.isFinite(a) && Number.isFinite(b)) out[i] = 2 * a - b;
      }
      return [line('dema', out)];
    }
    case 'tema': {
      const e1 = computeEma(closes, period);
      const e2 = computeEma(e1, period);
      const e3 = computeEma(e2, period);
      const out = nanArray(n);
      for (let i = 0; i < n; i++) {
        const a = e1[i]!;
        const b = e2[i]!;
        const c = e3[i]!;
        if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) out[i] = 3 * a - 3 * b + c;
      }
      return [line('tema', out)];
    }
    case 'rma':
      return [line('rma', computeRma(closes, period))];
    case 'bb': {
      const mult = num(params, 'stdDev', 2);
      const mid = computeSma(closes, period);
      const sd = stdev(closes, period, mid);
      const upper = nanArray(n);
      const lower = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(mid[i]!) || !Number.isFinite(sd[i]!)) continue;
        upper[i] = mid[i]! + mult * sd[i]!;
        lower[i] = mid[i]! - mult * sd[i]!;
      }
      return [band('upper', upper, 'lower'), line('mid', mid), band('lower', lower, 'upper')];
    }
    case 'keltner': {
      const mult = num(params, 'multiplier', 2);
      const mid = computeEma(closes, period);
      const atr = computeRma(trueRange(highs, lows, closes), Math.max(1, Math.floor(num(params, 'atrPeriod', 10))));
      const upper = nanArray(n);
      const lower = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(mid[i]!) || !Number.isFinite(atr[i]!)) continue;
        upper[i] = mid[i]! + mult * atr[i]!;
        lower[i] = mid[i]! - mult * atr[i]!;
      }
      return [band('upper', upper, 'lower'), line('mid', mid), band('lower', lower, 'upper')];
    }
    case 'donchian': {
      const hi = highest(highs, period);
      const lo = lowest(lows, period);
      const mid = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(hi[i]!) && Number.isFinite(lo[i]!)) mid[i] = (hi[i]! + lo[i]!) / 2;
      }
      return [band('upper', hi, 'lower'), line('mid', mid), band('lower', lo, 'upper')];
    }
    case 'envelopes': {
      const pct = num(params, 'percent', 0.5) / 100;
      const mid = computeSma(closes, period);
      const upper = nanArray(n);
      const lower = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(mid[i]!)) continue;
        upper[i] = mid[i]! * (1 + pct);
        lower[i] = mid[i]! * (1 - pct);
      }
      return [band('upper', upper, 'lower'), line('mid', mid), band('lower', lower, 'upper')];
    }
    case 'supertrend': {
      const mult = num(params, 'multiplier', 3);
      const atr = computeRma(trueRange(highs, lows, closes), period);
      const st = nanArray(n);
      const dir = nanArray(n);
      let prevSt = Number.NaN;
      let prevDir = 1;
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(atr[i]!)) continue;
        const hl2 = (highs[i]! + lows[i]!) / 2;
        let basicUpper = hl2 + mult * atr[i]!;
        let basicLower = hl2 - mult * atr[i]!;
        if (Number.isFinite(prevSt)) {
          if (basicLower > prevSt || closes[i - 1]! < prevSt) {
            /* keep */
          } else basicLower = prevSt;
          if (basicUpper < prevSt || closes[i - 1]! > prevSt) {
            /* keep */
          } else basicUpper = prevSt;
        }
        let d = prevDir;
        if (Number.isFinite(prevSt)) {
          if (prevDir === 1 && closes[i]! < basicLower) d = -1;
          else if (prevDir === -1 && closes[i]! > basicUpper) d = 1;
        }
        const v = d === 1 ? basicLower : basicUpper;
        st[i] = v;
        dir[i] = d;
        prevSt = v;
        prevDir = d;
      }
      return [line('supertrend', st), line('dir', dir)];
    }
    case 'psar': {
      const step = num(params, 'step', 0.02);
      const maxStep = num(params, 'max', 0.2);
      const out = nanArray(n);
      if (n < 2) return [line('psar', out)];
      let bull = true;
      let af = step;
      let ep = highs[0]!;
      let sar = lows[0]!;
      out[0] = sar;
      for (let i = 1; i < n; i++) {
        sar = sar + af * (ep - sar);
        if (bull) {
          sar = Math.min(sar, lows[i - 1]!, i >= 2 ? lows[i - 2]! : lows[i - 1]!);
          if (lows[i]! < sar) {
            bull = false;
            sar = ep;
            ep = lows[i]!;
            af = step;
          } else if (highs[i]! > ep) {
            ep = highs[i]!;
            af = Math.min(maxStep, af + step);
          }
        } else {
          sar = Math.max(sar, highs[i - 1]!, i >= 2 ? highs[i - 2]! : highs[i - 1]!);
          if (highs[i]! > sar) {
            bull = true;
            sar = ep;
            ep = highs[i]!;
            af = step;
          } else if (lows[i]! < ep) {
            ep = lows[i]!;
            af = Math.min(maxStep, af + step);
          }
        }
        out[i] = sar;
      }
      return [line('psar', out)];
    }
    case 'ichimoku': {
      const tenkanP = Math.max(1, Math.floor(num(params, 'tenkan', 9)));
      const kijunP = Math.max(1, Math.floor(num(params, 'kijun', 26)));
      const senkouP = Math.max(1, Math.floor(num(params, 'senkou', 52)));
      const tenkan = nanArray(n);
      const kijun = nanArray(n);
      const spanA = nanArray(n);
      const spanB = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (i >= tenkanP - 1) {
          let hi = -Infinity;
          let lo = Infinity;
          for (let j = i - tenkanP + 1; j <= i; j++) {
            hi = Math.max(hi, highs[j]!);
            lo = Math.min(lo, lows[j]!);
          }
          tenkan[i] = (hi + lo) / 2;
        }
        if (i >= kijunP - 1) {
          let hi = -Infinity;
          let lo = Infinity;
          for (let j = i - kijunP + 1; j <= i; j++) {
            hi = Math.max(hi, highs[j]!);
            lo = Math.min(lo, lows[j]!);
          }
          kijun[i] = (hi + lo) / 2;
        }
        if (Number.isFinite(tenkan[i]!) && Number.isFinite(kijun[i]!)) {
          const a = (tenkan[i]! + kijun[i]!) / 2;
          const shift = i + kijunP;
          if (shift < n) spanA[shift] = a;
        }
        if (i >= senkouP - 1) {
          let hi = -Infinity;
          let lo = Infinity;
          for (let j = i - senkouP + 1; j <= i; j++) {
            hi = Math.max(hi, highs[j]!);
            lo = Math.min(lo, lows[j]!);
          }
          const b = (hi + lo) / 2;
          const shift = i + kijunP;
          if (shift < n) spanB[shift] = b;
        }
      }
      return [
        band('spanA', spanA, 'spanB'),
        band('spanB', spanB, 'spanA'),
        line('tenkan', tenkan),
        line('kijun', kijun),
      ];
    }
    case 'vwap': {
      const out = nanArray(n);
      let cumPV = 0;
      let cumV = 0;
      let day = -1;
      const resetDaily = str(params, 'anchor', 'session') !== 'all';
      for (let i = 0; i < n; i++) {
        const t = times[i]!;
        const d = Math.floor(t / 86400);
        if (resetDaily && d !== day) {
          cumPV = 0;
          cumV = 0;
          day = d;
        }
        const tp = (highs[i]! + lows[i]! + closes[i]!) / 3;
        const v = volumes[i]! || 1;
        cumPV += tp * v;
        cumV += v;
        out[i] = cumV > 0 ? cumPV / cumV : Number.NaN;
      }
      return [line('vwap', out)];
    }
    case 'linearreg': {
      const out = nanArray(n);
      for (let i = period - 1; i < n; i++) {
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;
        for (let j = 0; j < period; j++) {
          const x = j;
          const y = closes[i - period + 1 + j]!;
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumXX += x * x;
        }
        const den = period * sumXX - sumX * sumX;
        if (den === 0) continue;
        const slope = (period * sumXY - sumX * sumY) / den;
        const intercept = (sumY - slope * sumX) / period;
        out[i] = intercept + slope * (period - 1);
      }
      return [line('linreg', out)];
    }
    case 'pivot': {
      // Classic floor pivots from prior lookback window
      const lookback = Math.max(period, 2);
      const pp = nanArray(n);
      const r1 = nanArray(n);
      const s1 = nanArray(n);
      const r2 = nanArray(n);
      const s2 = nanArray(n);
      for (let i = lookback; i < n; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - lookback; j < i; j++) {
          hi = Math.max(hi, highs[j]!);
          lo = Math.min(lo, lows[j]!);
        }
        const c = closes[i - 1]!;
        const p = (hi + lo + c) / 3;
        pp[i] = p;
        r1[i] = 2 * p - lo;
        s1[i] = 2 * p - hi;
        r2[i] = p + (hi - lo);
        s2[i] = p - (hi - lo);
      }
      return [line('pp', fillForward(pp)), line('r1', fillForward(r1)), line('s1', fillForward(s1)), line('r2', fillForward(r2)), line('s2', fillForward(s2))];
    }
    case 'atrBands': {
      const mult = num(params, 'multiplier', 2);
      const mid = computeEma(closes, period);
      const atr = computeRma(trueRange(highs, lows, closes), period);
      const upper = nanArray(n);
      const lower = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(mid[i]!) || !Number.isFinite(atr[i]!)) continue;
        upper[i] = mid[i]! + mult * atr[i]!;
        lower[i] = mid[i]! - mult * atr[i]!;
      }
      return [band('upper', upper, 'lower'), line('mid', mid), band('lower', lower, 'upper')];
    }
    case 'rsi':
      return [line('rsi', computeRsi(closes, period))];
    case 'stoch': {
      const kP = period;
      const dP = Math.max(1, Math.floor(num(params, 'smoothD', 3)));
      const smoothK = Math.max(1, Math.floor(num(params, 'smoothK', 3)));
      const rawK = nanArray(n);
      for (let i = kP - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - kP + 1; j <= i; j++) {
          hi = Math.max(hi, highs[j]!);
          lo = Math.min(lo, lows[j]!);
        }
        rawK[i] = hi === lo ? 50 : ((closes[i]! - lo) / (hi - lo)) * 100;
      }
      const k = computeSma(rawK, smoothK);
      const d = computeSma(k, dP);
      return [line('k', k), line('d', d)];
    }
    case 'stochrsi': {
      const rsi = computeRsi(closes, period);
      const kP = Math.max(1, Math.floor(num(params, 'stochPeriod', 14)));
      const out = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (i < kP - 1 || !Number.isFinite(rsi[i]!)) continue;
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - kP + 1; j <= i; j++) {
          if (!Number.isFinite(rsi[j]!)) continue;
          hi = Math.max(hi, rsi[j]!);
          lo = Math.min(lo, rsi[j]!);
        }
        out[i] = hi === lo ? 50 : ((rsi[i]! - lo) / (hi - lo)) * 100;
      }
      const d = computeSma(out, Math.max(1, Math.floor(num(params, 'smoothD', 3))));
      return [line('k', out), line('d', d)];
    }
    case 'cci': {
      const tp = typicalPrice(highs, lows, closes);
      const sma = computeSma(tp, period);
      const out = nanArray(n);
      for (let i = period - 1; i < n; i++) {
        let mad = 0;
        for (let j = i - period + 1; j <= i; j++) mad += Math.abs(tp[j]! - sma[i]!);
        mad /= period;
        out[i] = mad === 0 ? 0 : (tp[i]! - sma[i]!) / (0.015 * mad);
      }
      return [line('cci', out)];
    }
    case 'willr': {
      const out = nanArray(n);
      for (let i = period - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - period + 1; j <= i; j++) {
          hi = Math.max(hi, highs[j]!);
          lo = Math.min(lo, lows[j]!);
        }
        out[i] = hi === lo ? -50 : ((hi - closes[i]!) / (hi - lo)) * -100;
      }
      return [line('willr', out)];
    }
    case 'momentum': {
      const out = nanArray(n);
      for (let i = period; i < n; i++) out[i] = closes[i]! - closes[i - period]!;
      return [line('mom', out)];
    }
    case 'roc': {
      const out = nanArray(n);
      for (let i = period; i < n; i++) {
        const prev = closes[i - period]!;
        out[i] = prev === 0 ? 0 : ((closes[i]! - prev) / prev) * 100;
      }
      return [line('roc', out)];
    }
    case 'macd': {
      const fast = Math.max(1, Math.floor(num(params, 'fast', 12)));
      const slow = Math.max(1, Math.floor(num(params, 'slow', 26)));
      const signal = Math.max(1, Math.floor(num(params, 'signal', 9)));
      const { macd, signal: sig, hist: h } = computeMacd(closes, fast, slow, signal);
      return [hist('hist', h), line('macd', macd), line('signal', sig)];
    }
    case 'ppo': {
      const fast = Math.max(1, Math.floor(num(params, 'fast', 12)));
      const slow = Math.max(1, Math.floor(num(params, 'slow', 26)));
      const signalP = Math.max(1, Math.floor(num(params, 'signal', 9)));
      const ef = computeEma(closes, fast);
      const es = computeEma(closes, slow);
      const ppo = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(ef[i]!) && Number.isFinite(es[i]!) && es[i] !== 0) {
          ppo[i] = ((ef[i]! - es[i]!) / es[i]!) * 100;
        }
      }
      const sig = computeEma(ppo, signalP);
      const h = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(ppo[i]!) && Number.isFinite(sig[i]!)) h[i] = ppo[i]! - sig[i]!;
      }
      return [hist('hist', h), line('ppo', ppo), line('signal', sig)];
    }
    case 'trix': {
      const e1 = computeEma(closes, period);
      const e2 = computeEma(e1, period);
      const e3 = computeEma(e2, period);
      const out = nanArray(n);
      for (let i = 1; i < n; i++) {
        if (Number.isFinite(e3[i]!) && Number.isFinite(e3[i - 1]!) && e3[i - 1] !== 0) {
          out[i] = ((e3[i]! - e3[i - 1]!) / e3[i - 1]!) * 100;
        }
      }
      return [line('trix', out)];
    }
    case 'adx': {
      const tr = trueRange(highs, lows, closes);
      const plusDM = nanArray(n);
      const minusDM = nanArray(n);
      for (let i = 1; i < n; i++) {
        const up = highs[i]! - highs[i - 1]!;
        const down = lows[i - 1]! - lows[i]!;
        plusDM[i] = up > down && up > 0 ? up : 0;
        minusDM[i] = down > up && down > 0 ? down : 0;
      }
      const atr = computeRma(tr, period);
      const pdi = nanArray(n);
      const mdi = nanArray(n);
      const smoothP = computeRma(plusDM, period);
      const smoothM = computeRma(minusDM, period);
      const dx = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(atr[i]!) || atr[i] === 0) continue;
        pdi[i] = (100 * smoothP[i]!) / atr[i]!;
        mdi[i] = (100 * smoothM[i]!) / atr[i]!;
        const sum = pdi[i]! + mdi[i]!;
        dx[i] = sum === 0 ? 0 : (100 * Math.abs(pdi[i]! - mdi[i]!)) / sum;
      }
      const adx = computeRma(dx, period);
      return [line('adx', adx), line('plusDI', pdi), line('minusDI', mdi)];
    }
    case 'aroon': {
      const up = nanArray(n);
      const down = nanArray(n);
      for (let i = period; i < n; i++) {
        let hiI = i;
        let loI = i;
        for (let j = i - period; j <= i; j++) {
          if (highs[j]! >= highs[hiI]!) hiI = j;
          if (lows[j]! <= lows[loI]!) loI = j;
        }
        up[i] = ((period - (i - hiI)) / period) * 100;
        down[i] = ((period - (i - loI)) / period) * 100;
      }
      return [line('aroonUp', up), line('aroonDown', down)];
    }
    case 'ao': {
      const mid = new Float32Array(n);
      for (let i = 0; i < n; i++) mid[i] = (highs[i]! + lows[i]!) / 2;
      const s5 = computeSma(mid, 5);
      const s34 = computeSma(mid, 34);
      const out = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (Number.isFinite(s5[i]!) && Number.isFinite(s34[i]!)) out[i] = s5[i]! - s34[i]!;
      }
      return [hist('ao', out)];
    }
    case 'ultimate': {
      const p1 = Math.max(1, Math.floor(num(params, 'period1', 7)));
      const p2 = Math.max(1, Math.floor(num(params, 'period2', 14)));
      const p3 = Math.max(1, Math.floor(num(params, 'period3', 28)));
      const bp = nanArray(n);
      const tr = trueRange(highs, lows, closes);
      for (let i = 0; i < n; i++) {
        const prev = i === 0 ? closes[0]! : closes[i - 1]!;
        bp[i] = closes[i]! - Math.min(lows[i]!, prev);
      }
      const avg = (len: number, i: number, src: Float32Array) => {
        let s = 0;
        for (let j = i - len + 1; j <= i; j++) s += src[j]!;
        return s;
      };
      const out = nanArray(n);
      const maxP = Math.max(p1, p2, p3);
      for (let i = maxP - 1; i < n; i++) {
        const a1 = avg(p1, i, bp) / avg(p1, i, tr);
        const a2 = avg(p2, i, bp) / avg(p2, i, tr);
        const a3 = avg(p3, i, bp) / avg(p3, i, tr);
        out[i] = 100 * ((4 * a1 + 2 * a2 + a3) / 7);
      }
      return [line('uo', out)];
    }
    case 'vortex': {
      const plus = nanArray(n);
      const minus = nanArray(n);
      const tr = trueRange(highs, lows, closes);
      for (let i = period; i < n; i++) {
        let vp = 0;
        let vm = 0;
        let trSum = 0;
        for (let j = i - period + 1; j <= i; j++) {
          vp += Math.abs(highs[j]! - lows[j - 1]!);
          vm += Math.abs(lows[j]! - highs[j - 1]!);
          trSum += tr[j]!;
        }
        if (trSum > 0) {
          plus[i] = vp / trSum;
          minus[i] = vm / trSum;
        }
      }
      return [line('viPlus', plus), line('viMinus', minus)];
    }
    case 'chop': {
      const out = nanArray(n);
      const tr = trueRange(highs, lows, closes);
      for (let i = period - 1; i < n; i++) {
        let trSum = 0;
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - period + 1; j <= i; j++) {
          trSum += tr[j]!;
          hi = Math.max(hi, highs[j]!);
          lo = Math.min(lo, lows[j]!);
        }
        const range = hi - lo;
        out[i] = range <= 0 ? 50 : (100 * Math.log10(trSum / range)) / Math.log10(period);
      }
      return [line('chop', out)];
    }
    case 'mfi': {
      const tp = typicalPrice(highs, lows, closes);
      const out = nanArray(n);
      for (let i = period; i < n; i++) {
        let pos = 0;
        let neg = 0;
        for (let j = i - period + 1; j <= i; j++) {
          const raw = tp[j]! * volumes[j]!;
          if (tp[j]! > tp[j - 1]!) pos += raw;
          else if (tp[j]! < tp[j - 1]!) neg += raw;
        }
        out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
      }
      return [line('mfi', out)];
    }
    case 'obv': {
      const out = nanArray(n);
      let v = 0;
      out[0] = 0;
      for (let i = 1; i < n; i++) {
        if (closes[i]! > closes[i - 1]!) v += volumes[i]!;
        else if (closes[i]! < closes[i - 1]!) v -= volumes[i]!;
        out[i] = v;
      }
      return [line('obv', out)];
    }
    case 'adline': {
      const out = nanArray(n);
      let ad = 0;
      for (let i = 0; i < n; i++) {
        const h = highs[i]!;
        const l = lows[i]!;
        const c = closes[i]!;
        const mfm = h === l ? 0 : (c - l - (h - c)) / (h - l);
        ad += mfm * volumes[i]!;
        out[i] = ad;
      }
      return [line('ad', out)];
    }
    case 'cmf': {
      const out = nanArray(n);
      for (let i = period - 1; i < n; i++) {
        let mfv = 0;
        let vol = 0;
        for (let j = i - period + 1; j <= i; j++) {
          const h = highs[j]!;
          const l = lows[j]!;
          const c = closes[j]!;
          const mfm = h === l ? 0 : (c - l - (h - c)) / (h - l);
          mfv += mfm * volumes[j]!;
          vol += volumes[j]!;
        }
        out[i] = vol === 0 ? 0 : mfv / vol;
      }
      return [line('cmf', out)];
    }
    case 'atr':
      return [line('atr', computeRma(trueRange(highs, lows, closes), period))];
    case 'stddev': {
      const mid = computeSma(closes, period);
      return [line('stddev', stdev(closes, period, mid))];
    }
    case 'fisher': {
      const out = nanArray(n);
      const trigger = nanArray(n);
      let prev = 0;
      for (let i = period - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - period + 1; j <= i; j++) {
          hi = Math.max(hi, highs[j]!);
          lo = Math.min(lo, lows[j]!);
        }
        let value = hi === lo ? 0 : 2 * ((closes[i]! - lo) / (hi - lo) - 0.5);
        value = Math.max(-0.999, Math.min(0.999, value));
        const fish = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * prev;
        out[i] = fish;
        trigger[i] = prev;
        prev = fish;
      }
      return [line('fisher', out), line('trigger', trigger)];
    }
    case 'elderRay': {
      const ema = computeEma(closes, period);
      const bull = nanArray(n);
      const bear = nanArray(n);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(ema[i]!)) continue;
        bull[i] = highs[i]! - ema[i]!;
        bear[i] = lows[i]! - ema[i]!;
      }
      return [hist('bullPower', bull), hist('bearPower', bear)];
    }

    // —— ICT-style structural overlays (viewport heuristics, not Pine) ——
    case 'fvg': {
      const upper = nanArray(n);
      const lower = nanArray(n);
      const look = Math.max(1, Math.floor(num(params, 'lookback', 50)));
      const start = Math.max(2, n - look);
      for (let i = start; i < n; i++) {
        // Bullish FVG: low[i] > high[i-2]
        if (lows[i]! > highs[i - 2]!) {
          for (let j = i; j < n; j++) {
            upper[j] = lows[i]!;
            lower[j] = highs[i - 2]!;
          }
        }
        // Bearish FVG: high[i] < low[i-2]
        if (highs[i]! < lows[i - 2]!) {
          for (let j = i; j < n; j++) {
            upper[j] = lows[i - 2]!;
            lower[j] = highs[i]!;
          }
        }
      }
      return [band('fvgTop', upper, 'fvgBot'), band('fvgBot', lower, 'fvgTop')];
    }
    case 'orderBlock': {
      const left = Math.max(1, Math.floor(num(params, 'swing', 3)));
      const { highIdx, lowIdx } = swingPivots(highs, lows, left, left);
      const lastLow = lowIdx[lowIdx.length - 1];
      const lastHigh = highIdx[highIdx.length - 1];
      const series: IndicatorWorkerSeries[] = [];
      if (lastLow != null) {
        const i = Math.max(0, lastLow - 1);
        const top = Math.max(opens[i]!, closes[i]!);
        const bot = Math.min(opens[i]!, closes[i]!);
        series.push(
          band('obBullTop', levelFrom(n, i, top), 'obBullBot'),
          band('obBullBot', levelFrom(n, i, bot), 'obBullTop'),
        );
      }
      if (lastHigh != null) {
        const hi = Math.max(0, lastHigh - 1);
        const t = Math.max(opens[hi]!, closes[hi]!);
        const b = Math.min(opens[hi]!, closes[hi]!);
        series.push(
          band('obBearTop', levelFrom(n, hi, t), 'obBearBot'),
          band('obBearBot', levelFrom(n, hi, b), 'obBearTop'),
        );
      }
      return series.length ? series : [line('ob', nanArray(n))];
    }
    case 'liquidity': {
      const left = Math.max(1, Math.floor(num(params, 'swing', 5)));
      const { highIdx, lowIdx } = swingPivots(highs, lows, left, left);
      const buySide = nanArray(n);
      const sellSide = nanArray(n);
      for (const i of highIdx) {
        const v = highs[i]!;
        for (let j = i; j < n; j++) buySide[j] = v;
      }
      for (const i of lowIdx) {
        const v = lows[i]!;
        for (let j = i; j < n; j++) sellSide[j] = v;
      }
      return [line('bsl', buySide), line('ssl', sellSide)];
    }
    case 'premiumDiscount': {
      const left = Math.max(1, Math.floor(num(params, 'swing', 10)));
      const { highIdx, lowIdx } = swingPivots(highs, lows, left, left);
      const hiI = highIdx[highIdx.length - 1];
      const loI = lowIdx[lowIdx.length - 1];
      if (hiI == null || loI == null) return [line('eq', nanArray(n))];
      const hi = highs[hiI]!;
      const lo = lows[loI]!;
      const eq = (hi + lo) / 2;
      const from = Math.min(hiI, loI);
      const premiumTop = levelFrom(n, from, hi);
      const premiumBot = levelFrom(n, from, eq);
      const discountTop = levelFrom(n, from, eq);
      const discountBot = levelFrom(n, from, lo);
      return [
        band('premiumTop', premiumTop, 'premiumBot'),
        band('premiumBot', premiumBot, 'premiumTop'),
        line('eq', levelFrom(n, from, eq)),
        band('discountTop', discountTop, 'discountBot'),
        band('discountBot', discountBot, 'discountTop'),
      ];
    }
    case 'killzone': {
      // Mark bars inside London (7–10 UTC) / NY (12–15 UTC) as mid price band
      const londonStart = Math.floor(num(params, 'londonStart', 7));
      const londonEnd = Math.floor(num(params, 'londonEnd', 10));
      const nyStart = Math.floor(num(params, 'nyStart', 12));
      const nyEnd = Math.floor(num(params, 'nyEnd', 15));
      const upper = nanArray(n);
      const lower = nanArray(n);
      for (let i = 0; i < n; i++) {
        const hour = new Date(times[i]! * 1000).getUTCHours();
        const inKz =
          (hour >= londonStart && hour < londonEnd) || (hour >= nyStart && hour < nyEnd);
        if (inKz) {
          upper[i] = highs[i]!;
          lower[i] = lows[i]!;
        }
      }
      return [band('kzTop', upper, 'kzBot'), band('kzBot', lower, 'kzTop')];
    }
    case 'bosChoch': {
      const left = Math.max(1, Math.floor(num(params, 'swing', 5)));
      const { highIdx, lowIdx } = swingPivots(highs, lows, left, left);
      const level = nanArray(n);
      let lastSwingHigh = Number.NaN;
      let lastSwingLow = Number.NaN;
      let trend = 0;
      const events = new Set([...highIdx, ...lowIdx].sort((a, b) => a - b));
      for (let i = 0; i < n; i++) {
        if (highIdx.includes(i)) lastSwingHigh = highs[i]!;
        if (lowIdx.includes(i)) lastSwingLow = lows[i]!;
        if (Number.isFinite(lastSwingHigh) && closes[i]! > lastSwingHigh && trend <= 0) {
          trend = 1;
          for (let j = i; j < n; j++) level[j] = lastSwingHigh;
        } else if (Number.isFinite(lastSwingLow) && closes[i]! < lastSwingLow && trend >= 0) {
          trend = -1;
          for (let j = i; j < n; j++) level[j] = lastSwingLow;
        }
      }
      void events;
      return [line('structure', level)];
    }
    case 'ote': {
      // OTE zone = 61.8%–79% retracement of last impulse swing
      const left = Math.max(1, Math.floor(num(params, 'swing', 8)));
      const lowFib = num(params, 'fibLow', 0.618);
      const highFib = num(params, 'fibHigh', 0.79);
      const { highIdx, lowIdx } = swingPivots(highs, lows, left, left);
      const hiI = highIdx[highIdx.length - 1];
      const loI = lowIdx[lowIdx.length - 1];
      if (hiI == null || loI == null) return [line('ote', nanArray(n))];
      const bullish = loI < hiI;
      const start = bullish ? lows[loI]! : highs[hiI]!;
      const end = bullish ? highs[hiI]! : lows[loI]!;
      const range = end - start;
      const from = Math.max(hiI, loI);
      const top = bullish ? end - range * lowFib : start + range * highFib;
      const bot = bullish ? end - range * highFib : start + range * lowFib;
      const hiLvl = Math.max(top, bot);
      const loLvl = Math.min(top, bot);
      return [
        band('oteTop', levelFrom(n, from, hiLvl), 'oteBot'),
        band('oteBot', levelFrom(n, from, loLvl), 'oteTop'),
      ];
    }
    default: {
      const _e: never = id;
      throw new Error(`Unknown indicator ${_e}`);
    }
  }
}
