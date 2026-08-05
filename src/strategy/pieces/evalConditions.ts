/**
 * Per-bar boolean evaluators for all puzzle pieces (Worker-safe).
 * Rising edges become diamond detection marks on the chart.
 */
import { computeSma, computeEma } from '@/indicators/smaEma';
import { computeRsi } from '@/indicators/rsi';
import { computeMacd } from '@/indicators/macd';
import { computeBollinger } from '@/indicators/bollinger';
import { computeWma } from '@/indicators/math/helpers';
import { timeframeSeconds } from '@/data/timeframeAgg';
import type { Timeframe } from '@/types/ui';
import {
  aggregateSeriesToHtf,
  mapHtfFlagsToLtf,
} from '@/strategy/pieces/htfAggregate';
import type {
  CompiledPiece,
  PieceKind,
  PieceParams,
  RiskKind,
} from '@/strategy/graphTypes';
import { isRiskKind } from '@/strategy/graphTypes';
import type { BarSeries, ConditionEval } from '@/strategy/pieces/evalHelpers';
import {
  BUY,
  SELL,
  channelPrior,
  computeAtr,
  empty,
  mark,
  num,
  pushZoneHint,
  sideFromParams,
  str,
  swingHighLow,
  utcDay,
  utcDow,
  utcHour,
} from '@/strategy/pieces/evalHelpers';

export type { BarSeries, ConditionEval } from '@/strategy/pieces/evalHelpers';
export { sideAt } from '@/strategy/pieces/evalHelpers';

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

function maOf(
  closes: Float32Array,
  period: number,
  kind: string,
): Float32Array {
  if (kind === 'ema') return computeEma(closes, period);
  if (kind === 'wma') return computeWma(closes, period);
  if (kind === 'hma') return computeHma(closes, period);
  return computeSma(closes, period);
}

function evalMaCross(
  series: BarSeries,
  params: PieceParams,
  kind: string,
): ConditionEval {
  const n = series.closes.length;
  const fastN = Math.max(2, Math.floor(num(params, 'fastPeriod', 10)));
  const slowN = Math.max(fastN + 1, Math.floor(num(params, 'slowPeriod', 30)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, `${kind.toUpperCase()}${fastN}×${slowN}`);
  const fast = maOf(series.closes, fastN, kind);
  const slow = maOf(series.closes, slowN, kind);
  for (let i = 1; i < n; i++) {
    const f0 = fast[i - 1]!;
    const s0 = slow[i - 1]!;
    const f1 = fast[i]!;
    const s1 = slow[i]!;
    if (![f0, s0, f1, s1].every(Number.isFinite)) continue;
    mark(out, i, f0 <= s0 && f1 > s1, f0 >= s0 && f1 < s1, sideWant);
  }
  return out;
}

function midHL(h: number, l: number): number {
  return (h + l) / 2;
}

function computeStoch(
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
  kPeriod: number,
  dPeriod: number,
): { k: Float32Array; d: Float32Array } {
  const n = closes.length;
  const k = new Float32Array(n);
  const d = new Float32Array(n);
  k.fill(Number.NaN);
  d.fill(Number.NaN);
  for (let i = kPeriod - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, highs[j]!);
      lo = Math.min(lo, lows[j]!);
    }
    const range = hi - lo;
    k[i] = range > 0 ? ((closes[i]! - lo) / range) * 100 : 50;
  }
  for (let i = 0; i < n; i++) {
    if (i < kPeriod - 1 + dPeriod - 1) continue;
    let sum = 0;
    let c = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (Number.isFinite(k[j]!)) {
        sum += k[j]!;
        c++;
      }
    }
    if (c === dPeriod) d[i] = sum / dPeriod;
  }
  return { k, d };
}

function computeCci(
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
  period: number,
): Float32Array {
  const n = closes.length;
  const out = new Float32Array(n);
  out.fill(Number.NaN);
  const tp = new Float32Array(n);
  for (let i = 0; i < n; i++) tp[i] = (highs[i]! + lows[i]! + closes[i]!) / 3;
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tp[j]!;
    const mean = sum / period;
    let mad = 0;
    for (let j = i - period + 1; j <= i; j++) mad += Math.abs(tp[j]! - mean);
    mad /= period;
    out[i] = mad === 0 ? 0 : (tp[i]! - mean) / (0.015 * mad);
  }
  return out;
}

function computeWillR(
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
  period: number,
): Float32Array {
  const n = closes.length;
  const out = new Float32Array(n);
  out.fill(Number.NaN);
  for (let i = period - 1; i < n; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, highs[j]!);
      lo = Math.min(lo, lows[j]!);
    }
    const range = hi - lo;
    out[i] = range > 0 ? ((hi - closes[i]!) / range) * -100 : -50;
  }
  return out;
}

function computeAdx(
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
  period: number,
): Float32Array {
  const n = closes.length;
  const out = new Float32Array(n);
  out.fill(Number.NaN);
  if (n < period * 2) return out;
  const tr = new Float32Array(n);
  const plusDM = new Float32Array(n);
  const minusDM = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const up = highs[i]! - highs[i - 1]!;
    const down = lows[i - 1]! - lows[i]!;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!),
    );
  }
  let atr = 0;
  let pDM = 0;
  let mDM = 0;
  for (let i = 1; i <= period; i++) {
    atr += tr[i]!;
    pDM += plusDM[i]!;
    mDM += minusDM[i]!;
  }
  atr /= period;
  pDM /= period;
  mDM /= period;
  const dx = new Float32Array(n);
  for (let i = period; i < n; i++) {
    if (i > period) {
      atr = (atr * (period - 1) + tr[i]!) / period;
      pDM = (pDM * (period - 1) + plusDM[i]!) / period;
      mDM = (mDM * (period - 1) + minusDM[i]!) / period;
    }
    const pDI = atr > 0 ? (pDM / atr) * 100 : 0;
    const mDI = atr > 0 ? (mDM / atr) * 100 : 0;
    const sum = pDI + mDI;
    dx[i] = sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100;
  }
  let adx = 0;
  for (let i = period; i < period * 2 && i < n; i++) adx += dx[i]!;
  adx /= period;
  if (period * 2 - 1 < n) out[period * 2 - 1] = adx;
  for (let i = period * 2; i < n; i++) {
    adx = (adx * (period - 1) + dx[i]!) / period;
    out[i] = adx;
  }
  return out;
}

function evalDonchian(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(2, Math.floor(num(params, 'period', 20)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, `Donchian ${period}`);
  for (let i = 1; i < n; i++) {
    const ch = channelPrior(series.highs, series.lows, i, period);
    if (!ch) continue;
    mark(out, i, series.highs[i]! > ch.hi, series.lows[i]! < ch.lo, sideWant);
  }
  return out;
}

function evalRsiGate(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(2, Math.floor(num(params, 'period', 14)));
  const level = num(params, 'level', 30);
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, `RSI${period}`);
  const rsi = computeRsi(series.closes, period);
  for (let i = 0; i < n; i++) {
    const r = rsi[i]!;
    if (!Number.isFinite(r)) continue;
    if (sideWant === 'buy' && r <= level) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    } else if (sideWant === 'sell' && r >= level) {
      out.flags[i] = 1;
      out.sides[i] = SELL;
    }
  }
  return out;
}

function evalRsiCross(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(2, Math.floor(num(params, 'period', 14)));
  const level = num(params, 'level', 50);
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, `RSI×${level}`);
  const rsi = computeRsi(series.closes, period);
  for (let i = 1; i < n; i++) {
    const a = rsi[i - 1]!;
    const b = rsi[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    mark(out, i, a <= level && b > level, a >= level && b < level, sideWant);
  }
  return out;
}

function evalMacdCross(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const fast = Math.max(2, Math.floor(num(params, 'fastPeriod', 12)));
  const slow = Math.max(fast + 1, Math.floor(num(params, 'slowPeriod', 26)));
  const sig = Math.max(2, Math.floor(num(params, 'signalPeriod', 9)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'MACD×');
  const m = computeMacd(series.closes, fast, slow, sig);
  for (let i = 1; i < n; i++) {
    const m0 = m.macd[i - 1]!;
    const s0 = m.signal[i - 1]!;
    const m1 = m.macd[i]!;
    const s1 = m.signal[i]!;
    if (![m0, s0, m1, s1].every(Number.isFinite)) continue;
    mark(out, i, m0 <= s0 && m1 > s1, m0 >= s0 && m1 < s1, sideWant);
  }
  return out;
}

function evalMacdHistFlip(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const fast = Math.max(2, Math.floor(num(params, 'fastPeriod', 12)));
  const slow = Math.max(fast + 1, Math.floor(num(params, 'slowPeriod', 26)));
  const sig = Math.max(2, Math.floor(num(params, 'signalPeriod', 9)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'MACDh');
  const m = computeMacd(series.closes, fast, slow, sig);
  for (let i = 1; i < n; i++) {
    const h0 = m.hist[i - 1]!;
    const h1 = m.hist[i]!;
    if (!Number.isFinite(h0) || !Number.isFinite(h1)) continue;
    mark(out, i, h0 <= 0 && h1 > 0, h0 >= 0 && h1 < 0, sideWant);
  }
  return out;
}

function evalBbTouch(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 20)));
  const stdDev = Math.max(0.5, num(params, 'stdDev', 2));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, `BB ${period}`);
  const bb = computeBollinger(series.closes, period, stdDev);
  for (let i = 0; i < n; i++) {
    const c = series.closes[i]!;
    const lo = bb.lower[i]!;
    const hi = bb.upper[i]!;
    if (![c, lo, hi].every(Number.isFinite)) continue;
    mark(out, i, c <= lo, c >= hi, sideWant);
  }
  return out;
}

function evalBbSqueeze(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 20)));
  const stdDev = Math.max(0.5, num(params, 'stdDev', 2));
  const lookback = Math.max(5, Math.floor(num(params, 'lookback', 20)));
  const out = empty(n, null, 'BBsq');
  const bb = computeBollinger(series.closes, period, stdDev);
  const bw = new Float32Array(n);
  bw.fill(Number.NaN);
  for (let i = 0; i < n; i++) {
    const mid = bb.mid[i]!;
    if (!Number.isFinite(mid) || mid === 0) continue;
    bw[i] = (bb.upper[i]! - bb.lower[i]!) / mid;
  }
  for (let i = lookback; i < n; i++) {
    let minBw = Infinity;
    for (let j = i - lookback; j < i; j++) {
      if (Number.isFinite(bw[j]!)) minBw = Math.min(minBw, bw[j]!);
    }
    if (!Number.isFinite(minBw) || !Number.isFinite(bw[i]!)) continue;
    // Fire when expanding after sitting at lookback minimum
    if (bw[i - 1]! <= minBw * 1.05 && bw[i]! > bw[i - 1]! * 1.1) {
      out.flags[i] = 1;
      out.sides[i] = series.closes[i]! >= series.opens[i]! ? BUY : SELL;
    }
  }
  return out;
}

function evalBbWalk(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 20)));
  const stdDev = Math.max(0.5, num(params, 'stdDev', 2));
  const bars = Math.max(2, Math.min(5, Math.floor(num(params, 'bars', 2))));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'BBwk');
  const bb = computeBollinger(series.closes, period, stdDev);
  for (let i = bars - 1; i < n; i++) {
    let bull = true;
    let bear = true;
    for (let k = 0; k < bars; k++) {
      const j = i - k;
      if (!(series.closes[j]! >= bb.upper[j]!)) bull = false;
      if (!(series.closes[j]! <= bb.lower[j]!)) bear = false;
    }
    mark(out, i, bull, bear, sideWant);
  }
  return out;
}

function evalKeltner(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 20)));
  const mult = Math.max(0.5, num(params, 'mult', 1.5));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'KC');
  const mid = computeEma(series.closes, period);
  const atr = computeAtr(series.highs, series.lows, series.closes, period);
  for (let i = 1; i < n; i++) {
    const m = mid[i]!;
    const a = atr[i]!;
    if (!Number.isFinite(m) || !Number.isFinite(a)) continue;
    mark(
      out,
      i,
      series.closes[i]! > m + mult * a && series.closes[i - 1]! <= mid[i - 1]! + mult * (atr[i - 1] || a),
      series.closes[i]! < m - mult * a && series.closes[i - 1]! >= mid[i - 1]! - mult * (atr[i - 1] || a),
      sideWant,
    );
  }
  return out;
}

function evalEnvelopes(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 20)));
  const pct = Math.max(0.05, num(params, 'percent', 1)) / 100;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Env');
  const ma = computeSma(series.closes, period);
  for (let i = 0; i < n; i++) {
    const m = ma[i]!;
    if (!Number.isFinite(m)) continue;
    mark(out, i, series.closes[i]! <= m * (1 - pct), series.closes[i]! >= m * (1 + pct), sideWant);
  }
  return out;
}

function evalPriceVsMa(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(2, Math.floor(num(params, 'period', 50)));
  const maType = str(params, 'maType', 'ema');
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, `Px×${maType}${period}`);
  const ma = maOf(series.closes, period, maType);
  for (let i = 1; i < n; i++) {
    const c0 = series.closes[i - 1]!;
    const c1 = series.closes[i]!;
    const m0 = ma[i - 1]!;
    const m1 = ma[i]!;
    if (![c0, c1, m0, m1].every(Number.isFinite)) continue;
    mark(out, i, c0 <= m0 && c1 > m1, c0 >= m0 && c1 < m1, sideWant);
  }
  return out;
}

function evalMaStack(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const fastN = Math.max(2, Math.floor(num(params, 'fastPeriod', 20)));
  const slowN = Math.max(fastN + 1, Math.floor(num(params, 'slowPeriod', 50)));
  const maType = str(params, 'maType', 'ema');
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'Stack');
  const fast = maOf(series.closes, fastN, maType);
  const slow = maOf(series.closes, slowN, maType);
  for (let i = 0; i < n; i++) {
    const c = series.closes[i]!;
    const f = fast[i]!;
    const s = slow[i]!;
    if (![c, f, s].every(Number.isFinite)) continue;
    const bull = c > f && f > s;
    const bear = c < f && f < s;
    mark(out, i, bull, bear, sideWant);
  }
  return out;
}

function evalMaSlope(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(2, Math.floor(num(params, 'period', 20)));
  const slopeBars = Math.max(1, Math.floor(num(params, 'slopeBars', 3)));
  const maType = str(params, 'maType', 'ema');
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Slope');
  const ma = maOf(series.closes, period, maType);
  for (let i = slopeBars; i < n; i++) {
    const a = ma[i]!;
    const b = ma[i - slopeBars]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    mark(out, i, a > b, a < b, sideWant);
  }
  return out;
}

function evalStochCross(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const kPeriod = Math.max(3, Math.floor(num(params, 'kPeriod', 14)));
  const dPeriod = Math.max(1, Math.floor(num(params, 'dPeriod', 3)));
  const ob = num(params, 'obLevel', 80);
  const os = num(params, 'osLevel', 20);
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Stoch×');
  const { k, d } = computeStoch(series.highs, series.lows, series.closes, kPeriod, dPeriod);
  for (let i = 1; i < n; i++) {
    const k0 = k[i - 1]!;
    const d0 = d[i - 1]!;
    const k1 = k[i]!;
    const d1 = d[i]!;
    if (![k0, d0, k1, d1].every(Number.isFinite)) continue;
    mark(
      out,
      i,
      k0 <= d0 && k1 > d1 && k1 <= os + 15,
      k0 >= d0 && k1 < d1 && k1 >= ob - 15,
      sideWant,
    );
  }
  return out;
}

function evalStochGate(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const kPeriod = Math.max(3, Math.floor(num(params, 'kPeriod', 14)));
  const ob = num(params, 'obLevel', 80);
  const os = num(params, 'osLevel', 20);
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'StochG');
  const { k } = computeStoch(series.highs, series.lows, series.closes, kPeriod, 1);
  for (let i = 0; i < n; i++) {
    const v = k[i]!;
    if (!Number.isFinite(v)) continue;
    if (sideWant === 'buy' && v <= os) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    } else if (sideWant === 'sell' && v >= ob) {
      out.flags[i] = 1;
      out.sides[i] = SELL;
    } else if (sideWant === null) {
      mark(out, i, v <= os, v >= ob, null);
    }
  }
  return out;
}

function evalAtrSurge(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 14)));
  const mult = Math.max(1.1, num(params, 'mult', 1.5));
  const out = empty(n, null, `ATR×${mult}`);
  const atr = computeAtr(series.highs, series.lows, series.closes, period);
  const atrMa = computeSma(atr, period);
  for (let i = 1; i < n; i++) {
    const a = atr[i]!;
    const m = atrMa[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(m) || m <= 0) continue;
    if (a >= m * mult) {
      out.flags[i] = 1;
      out.sides[i] = series.closes[i]! >= series.opens[i]! ? BUY : SELL;
    }
  }
  return out;
}

function evalAtrCompress(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 14)));
  const mult = Math.min(1, Math.max(0.1, num(params, 'mult', 0.7)));
  const out = empty(n, null, 'ATR↓');
  const atr = computeAtr(series.highs, series.lows, series.closes, period);
  const atrMa = computeSma(atr, period);
  for (let i = 1; i < n; i++) {
    const a = atr[i]!;
    const m = atrMa[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(m) || m <= 0) continue;
    if (a <= m * mult) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}

function evalMomentum(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(2, Math.floor(num(params, 'period', 10)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, `ROC${period}`);
  for (let i = period + 1; i < n; i++) {
    const prev = series.closes[i - period]!;
    const cur = series.closes[i]!;
    const prev2 = series.closes[i - 1 - period]!;
    const cur2 = series.closes[i - 1]!;
    if (prev === 0 || prev2 === 0) continue;
    const roc0 = (cur2 - prev2) / prev2;
    const roc1 = (cur - prev) / prev;
    mark(out, i, roc0 <= 0 && roc1 > 0, roc0 >= 0 && roc1 < 0, sideWant);
  }
  return out;
}

function evalRocExtreme(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(2, Math.floor(num(params, 'period', 10)));
  const thr = Math.max(0.05, num(params, 'threshold', 1)) / 100;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'ROCx');
  for (let i = period; i < n; i++) {
    const prev = series.closes[i - period]!;
    if (prev === 0) continue;
    const roc = (series.closes[i]! - prev) / prev;
    mark(out, i, roc >= thr, roc <= -thr, sideWant);
  }
  return out;
}

function evalCciGate(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 20)));
  const level = Math.abs(num(params, 'level', 100));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'CCI');
  const cci = computeCci(series.highs, series.lows, series.closes, period);
  for (let i = 0; i < n; i++) {
    const v = cci[i]!;
    if (!Number.isFinite(v)) continue;
    mark(out, i, v <= -level, v >= level, sideWant);
  }
  return out;
}

function evalCciCross(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 20)));
  const level = num(params, 'level', 0);
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'CCI×');
  const cci = computeCci(series.highs, series.lows, series.closes, period);
  for (let i = 1; i < n; i++) {
    const a = cci[i - 1]!;
    const b = cci[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    mark(out, i, a <= level && b > level, a >= level && b < level, sideWant);
  }
  return out;
}

function evalWillrGate(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 14)));
  const os = num(params, 'osLevel', -80);
  const ob = num(params, 'obLevel', -20);
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, '%R');
  const wr = computeWillR(series.highs, series.lows, series.closes, period);
  for (let i = 0; i < n; i++) {
    const v = wr[i]!;
    if (!Number.isFinite(v)) continue;
    if (sideWant === 'buy' && v <= os) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    } else if (sideWant === 'sell' && v >= ob) {
      out.flags[i] = 1;
      out.sides[i] = SELL;
    } else if (sideWant === null) {
      mark(out, i, v <= os, v >= ob, null);
    }
  }
  return out;
}

function evalAdxTrend(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 14)));
  const level = num(params, 'level', 25);
  const out = empty(n, null, 'ADX');
  const adx = computeAdx(series.highs, series.lows, series.closes, period);
  for (let i = 1; i < n; i++) {
    const a = adx[i]!;
    const b = adx[i - 1]!;
    if (!Number.isFinite(a)) continue;
    // Rising edge into trend
    if (a >= level && !(Number.isFinite(b) && b >= level)) {
      out.flags[i] = 1;
      out.sides[i] = series.closes[i]! >= series.opens[i]! ? BUY : SELL;
    }
  }
  return out;
}

function evalAoCross(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'AO');
  const mid = new Float32Array(n);
  for (let i = 0; i < n; i++) mid[i] = midHL(series.highs[i]!, series.lows[i]!);
  const fast = computeSma(mid, 5);
  const slow = computeSma(mid, 34);
  for (let i = 1; i < n; i++) {
    const a0 = fast[i - 1]! - slow[i - 1]!;
    const a1 = fast[i]! - slow[i]!;
    if (![a0, a1].every(Number.isFinite)) continue;
    mark(out, i, a0 <= 0 && a1 > 0, a0 >= 0 && a1 < 0, sideWant);
  }
  return out;
}

function evalSupertrend(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 10)));
  const mult = Math.max(0.5, num(params, 'mult', 3));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'ST');
  const atr = computeAtr(series.highs, series.lows, series.closes, period);
  let dir = 1;
  let st = Number.NaN;
  for (let i = period; i < n; i++) {
    const hl2 = midHL(series.highs[i]!, series.lows[i]!);
    const a = atr[i]!;
    if (!Number.isFinite(a)) continue;
    const upper = hl2 + mult * a;
    const lower = hl2 - mult * a;
    if (!Number.isFinite(st)) {
      st = lower;
      dir = 1;
      continue;
    }
    const prevDir = dir;
    if (dir === 1) {
      st = Math.max(lower, st);
      if (series.closes[i]! < st) {
        dir = -1;
        st = upper;
      }
    } else {
      st = Math.min(upper, st);
      if (series.closes[i]! > st) {
        dir = 1;
        st = lower;
      }
    }
    if (dir !== prevDir) {
      mark(out, i, dir === 1, dir === -1, sideWant);
    }
  }
  return out;
}

function evalPsar(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const step = Math.max(0.005, num(params, 'step', 0.02));
  const maxAf = Math.max(step, num(params, 'max', 0.2));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'PSAR');
  if (n < 3) return out;
  let bull = series.closes[1]! >= series.closes[0]!;
  let af = step;
  let ep = bull ? series.highs[1]! : series.lows[1]!;
  let sar = bull ? series.lows[0]! : series.highs[0]!;
  for (let i = 2; i < n; i++) {
    const prevBull = bull;
    sar = sar + af * (ep - sar);
    if (bull) {
      sar = Math.min(sar, series.lows[i - 1]!, series.lows[i - 2]!);
      if (series.lows[i]! < sar) {
        bull = false;
        sar = ep;
        ep = series.lows[i]!;
        af = step;
      } else if (series.highs[i]! > ep) {
        ep = series.highs[i]!;
        af = Math.min(maxAf, af + step);
      }
    } else {
      sar = Math.max(sar, series.highs[i - 1]!, series.highs[i - 2]!);
      if (series.highs[i]! > sar) {
        bull = true;
        sar = ep;
        ep = series.highs[i]!;
        af = step;
      } else if (series.lows[i]! < ep) {
        ep = series.lows[i]!;
        af = Math.min(maxAf, af + step);
      }
    }
    if (bull !== prevBull) mark(out, i, bull, !bull, sideWant);
  }
  return out;
}

function donchianMid(highs: Float32Array, lows: Float32Array, i: number, period: number): number {
  let hi = -Infinity;
  let lo = Infinity;
  const from = Math.max(0, i - period + 1);
  for (let j = from; j <= i; j++) {
    hi = Math.max(hi, highs[j]!);
    lo = Math.min(lo, lows[j]!);
  }
  return (hi + lo) / 2;
}

function evalIchimokuTk(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const tenkanN = Math.max(2, Math.floor(num(params, 'tenkan', 9)));
  const kijunN = Math.max(tenkanN + 1, Math.floor(num(params, 'kijun', 26)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'TK×');
  for (let i = kijunN; i < n; i++) {
    const t0 = donchianMid(series.highs, series.lows, i - 1, tenkanN);
    const k0 = donchianMid(series.highs, series.lows, i - 1, kijunN);
    const t1 = donchianMid(series.highs, series.lows, i, tenkanN);
    const k1 = donchianMid(series.highs, series.lows, i, kijunN);
    mark(out, i, t0 <= k0 && t1 > k1, t0 >= k0 && t1 < k1, sideWant);
  }
  return out;
}

function evalIchimokuCloud(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const tenkanN = Math.max(2, Math.floor(num(params, 'tenkan', 9)));
  const kijunN = Math.max(tenkanN + 1, Math.floor(num(params, 'kijun', 26)));
  const senkouN = Math.max(kijunN, Math.floor(num(params, 'senkou', 52)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Cloud');
  for (let i = senkouN + 1; i < n; i++) {
    const spanA = (donchianMid(series.highs, series.lows, i, tenkanN) +
      donchianMid(series.highs, series.lows, i, kijunN)) /
      2;
    const spanB = donchianMid(series.highs, series.lows, i, senkouN);
    const top = Math.max(spanA, spanB);
    const bot = Math.min(spanA, spanB);
    const c0 = series.closes[i - 1]!;
    const c1 = series.closes[i]!;
    mark(out, i, c0 <= top && c1 > top, c0 >= bot && c1 < bot, sideWant);
  }
  return out;
}

function evalTrix(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 15)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'TRIX');
  const e1 = computeEma(series.closes, period);
  const e2 = computeEma(e1, period);
  const e3 = computeEma(e2, period);
  for (let i = 1; i < n; i++) {
    const a = e3[i - 1]!;
    const b = e3[i]!;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) continue;
    const t0 = i >= 2 && Number.isFinite(e3[i - 2]!) && e3[i - 2]! !== 0
      ? (a - e3[i - 2]!) / e3[i - 2]!
      : 0;
    const t1 = (b - a) / a;
    mark(out, i, t0 <= 0 && t1 > 0, t0 >= 0 && t1 < 0, sideWant);
  }
  return out;
}

function evalPpo(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const fast = Math.max(2, Math.floor(num(params, 'fastPeriod', 12)));
  const slow = Math.max(fast + 1, Math.floor(num(params, 'slowPeriod', 26)));
  const sigN = Math.max(2, Math.floor(num(params, 'signalPeriod', 9)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'PPO');
  const ef = computeEma(series.closes, fast);
  const es = computeEma(series.closes, slow);
  const ppo = new Float32Array(n);
  ppo.fill(Number.NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(ef[i]!) && Number.isFinite(es[i]!) && es[i]! !== 0) {
      ppo[i] = ((ef[i]! - es[i]!) / es[i]!) * 100;
    }
  }
  const signal = computeEma(ppo, sigN);
  for (let i = 1; i < n; i++) {
    const p0 = ppo[i - 1]!;
    const s0 = signal[i - 1]!;
    const p1 = ppo[i]!;
    const s1 = signal[i]!;
    if (![p0, s0, p1, s1].every(Number.isFinite)) continue;
    mark(out, i, p0 <= s0 && p1 > s1, p0 >= s0 && p1 < s1, sideWant);
  }
  return out;
}

function evalAroon(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 25)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Aroon');
  for (let i = period; i < n; i++) {
    let hiI = i;
    let loI = i;
    for (let j = i - period; j <= i; j++) {
      if (series.highs[j]! >= series.highs[hiI]!) hiI = j;
      if (series.lows[j]! <= series.lows[loI]!) loI = j;
    }
    const up = ((period - (i - hiI)) / period) * 100;
    const down = ((period - (i - loI)) / period) * 100;
    let up0 = 0;
    let down0 = 0;
    {
      let hiI0 = i - 1;
      let loI0 = i - 1;
      for (let j = i - 1 - period; j <= i - 1; j++) {
        if (j < 0) continue;
        if (series.highs[j]! >= series.highs[hiI0]!) hiI0 = j;
        if (series.lows[j]! <= series.lows[loI0]!) loI0 = j;
      }
      up0 = ((period - (i - 1 - hiI0)) / period) * 100;
      down0 = ((period - (i - 1 - loI0)) / period) * 100;
    }
    mark(out, i, up0 <= down0 && up > down, up0 >= down0 && up < down, sideWant);
  }
  return out;
}

function evalChop(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const period = Math.max(5, Math.floor(num(params, 'period', 14)));
  const level = num(params, 'level', 38.2);
  const mode = str(params, 'mode', 'trend');
  const out = empty(n, null, 'Chop');
  const atr = computeAtr(series.highs, series.lows, series.closes, 1);
  for (let i = period; i < n; i++) {
    let sumTr = 0;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      sumTr += Number.isFinite(atr[j]!) ? atr[j]! : series.highs[j]! - series.lows[j]!;
      hi = Math.max(hi, series.highs[j]!);
      lo = Math.min(lo, series.lows[j]!);
    }
    const range = hi - lo;
    if (range <= 0) continue;
    const chop = (100 * Math.log10(sumTr / range)) / Math.log10(period);
    const ok = mode === 'trend' ? chop <= level : chop >= level;
    if (ok) {
      // rising edge only when entering regime
      let prevOk = false;
      if (i > period) {
        let sumTr0 = 0;
        let hi0 = -Infinity;
        let lo0 = Infinity;
        for (let j = i - period; j < i; j++) {
          sumTr0 += Number.isFinite(atr[j]!) ? atr[j]! : series.highs[j]! - series.lows[j]!;
          hi0 = Math.max(hi0, series.highs[j]!);
          lo0 = Math.min(lo0, series.lows[j]!);
        }
        const r0 = hi0 - lo0;
        if (r0 > 0) {
          const chop0 = (100 * Math.log10(sumTr0 / r0)) / Math.log10(period);
          prevOk = mode === 'trend' ? chop0 <= level : chop0 >= level;
        }
      }
      if (!prevOk) {
        out.flags[i] = 1;
        out.sides[i] = BUY;
      }
    }
  }
  return out;
}


// —— Price / candles ——

function evalCandleConfirm(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const bars = Math.max(1, Math.min(5, Math.floor(num(params, 'bars', 2))));
  const ref = str(params, 'ref', 'close');
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, `${bars}-bar`);
  const pick = (i: number) =>
    ref === 'high' ? series.highs[i]! : ref === 'low' ? series.lows[i]! : series.closes[i]!;
  for (let i = bars; i < n; i++) {
    let ok = true;
    for (let k = 0; k < bars; k++) {
      const cur = i - k;
      const prev = cur - 1;
      if (sideWant === 'buy' ? !(pick(cur) > pick(prev)) : !(pick(cur) < pick(prev))) {
        ok = false;
        break;
      }
    }
    if (ok) {
      out.flags[i] = 1;
      out.sides[i] = sideWant === 'sell' ? SELL : BUY;
    }
  }
  return out;
}

function evalEngulfing(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Engulfing');
  for (let i = 1; i < n; i++) {
    const o0 = series.opens[i - 1]!;
    const c0 = series.closes[i - 1]!;
    const o1 = series.opens[i]!;
    const c1 = series.closes[i]!;
    const bull = c1 > o1 && c0 < o0 && c1 >= Math.max(o0, c0) && o1 <= Math.min(o0, c0);
    const bear = c1 < o1 && c0 > o0 && c1 <= Math.min(o0, c0) && o1 >= Math.max(o0, c0);
    mark(out, i, bull, bear, sideWant);
  }
  return out;
}

function evalPinBar(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const ratio = Math.max(1.2, num(params, 'wickRatio', 2));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Pin');
  for (let i = 0; i < n; i++) {
    const o = series.opens[i]!;
    const h = series.highs[i]!;
    const l = series.lows[i]!;
    const c = series.closes[i]!;
    const body = Math.abs(c - o);
    const upper = h - Math.max(o, c);
    const lower = Math.min(o, c) - l;
    mark(out, i, lower >= body * ratio && upper <= body * 0.5, upper >= body * ratio && lower <= body * 0.5, sideWant);
  }
  return out;
}

function evalInsideBar(series: BarSeries): ConditionEval {
  const n = series.closes.length;
  const out = empty(n, null, 'Inside');
  for (let i = 1; i < n; i++) {
    if (series.highs[i]! <= series.highs[i - 1]! && series.lows[i]! >= series.lows[i - 1]!) {
      out.flags[i] = 1;
      out.sides[i] = series.closes[i]! >= series.opens[i]! ? BUY : SELL;
    }
  }
  return out;
}

function evalOutsideBar(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Outside');
  for (let i = 1; i < n; i++) {
    if (series.highs[i]! < series.highs[i - 1]! || series.lows[i]! > series.lows[i - 1]!) continue;
    mark(out, i, series.closes[i]! > series.opens[i]!, series.closes[i]! < series.opens[i]!, sideWant);
  }
  return out;
}

function evalDoji(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const bodyPct = Math.max(1, num(params, 'bodyPct', 10)) / 100;
  const out = empty(n, null, 'Doji');
  for (let i = 0; i < n; i++) {
    const range = series.highs[i]! - series.lows[i]!;
    if (range <= 0) continue;
    if (Math.abs(series.closes[i]! - series.opens[i]!) / range <= bodyPct) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}

function evalGap(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Gap');
  for (let i = 1; i < n; i++) {
    mark(out, i, series.opens[i]! > series.highs[i - 1]!, series.opens[i]! < series.lows[i - 1]!, sideWant);
  }
  return out;
}

function evalBodyDirection(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'Body');
  for (let i = 0; i < n; i++) {
    mark(out, i, series.closes[i]! > series.opens[i]!, series.closes[i]! < series.opens[i]!, sideWant);
  }
  return out;
}

function evalHhLl(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(2, Math.floor(num(params, 'lookback', 5)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'HH/LL');
  for (let i = lookback; i < n; i++) {
    let maxH = -Infinity;
    let minL = Infinity;
    for (let j = i - lookback; j < i; j++) {
      maxH = Math.max(maxH, series.highs[j]!);
      minL = Math.min(minL, series.lows[j]!);
    }
    mark(out, i, series.highs[i]! > maxH, series.lows[i]! < minL, sideWant);
  }
  return out;
}

function evalHlLh(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(2, Math.floor(num(params, 'lookback', 5)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'HL/LH');
  for (let i = lookback; i < n; i++) {
    let maxL = -Infinity;
    let minH = Infinity;
    for (let j = i - lookback; j < i; j++) {
      maxL = Math.max(maxL, series.lows[j]!);
      minH = Math.min(minH, series.highs[j]!);
    }
    mark(out, i, series.lows[i]! > maxL, series.highs[i]! < minH, sideWant);
  }
  return out;
}

function evalSessionRangeBreak(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const rangeBars = Math.max(1, Math.floor(num(params, 'rangeBars', 6)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, `ORB ${rangeBars}`);
  let day = n > 0 ? utcDay(series.times[0]!) : 0;
  let dayStart = 0;
  let orHigh = -Infinity;
  let orLow = Infinity;
  let ready = false;
  let zoneEmitted = false;
  for (let i = 0; i < n; i++) {
    const d = utcDay(series.times[i]!);
    if (d !== day) {
      day = d;
      dayStart = i;
      orHigh = -Infinity;
      orLow = Infinity;
      ready = false;
      zoneEmitted = false;
    }
    const idx = i - dayStart;
    if (idx < rangeBars) {
      orHigh = Math.max(orHigh, series.highs[i]!);
      orLow = Math.min(orLow, series.lows[i]!);
      if (idx === rangeBars - 1) {
        ready = true;
        if (Number.isFinite(orHigh) && Number.isFinite(orLow) && orHigh > orLow) {
          pushZoneHint(out, {
            startIdx: dayStart,
            endIdx: Math.min(n - 1, dayStart + rangeBars + 48),
            priceHigh: orHigh,
            priceLow: orLow,
            kind: 'orb',
          });
          zoneEmitted = true;
        }
      }
      continue;
    }
    if (!ready) continue;
    mark(out, i, series.closes[i]! > orHigh, series.closes[i]! < orLow, sideWant);
    void zoneEmitted;
  }
  return out;
}

function evalMorningStar(series: BarSeries): ConditionEval {
  const n = series.closes.length;
  const out = empty(n, 'buy', 'MStar');
  for (let i = 2; i < n; i++) {
    const b0 = series.closes[i - 2]! < series.opens[i - 2]!;
    const small = Math.abs(series.closes[i - 1]! - series.opens[i - 1]!) <
      Math.abs(series.closes[i - 2]! - series.opens[i - 2]!) * 0.5;
    const b2 = series.closes[i]! > series.opens[i]!;
    const deep = series.closes[i]! > (series.opens[i - 2]! + series.closes[i - 2]!) / 2;
    if (b0 && small && b2 && deep) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}

function evalEveningStar(series: BarSeries): ConditionEval {
  const n = series.closes.length;
  const out = empty(n, 'sell', 'EStar');
  for (let i = 2; i < n; i++) {
    const b0 = series.closes[i - 2]! > series.opens[i - 2]!;
    const small = Math.abs(series.closes[i - 1]! - series.opens[i - 1]!) <
      Math.abs(series.closes[i - 2]! - series.opens[i - 2]!) * 0.5;
    const b2 = series.closes[i]! < series.opens[i]!;
    const deep = series.closes[i]! < (series.opens[i - 2]! + series.closes[i - 2]!) / 2;
    if (b0 && small && b2 && deep) {
      out.flags[i] = 1;
      out.sides[i] = SELL;
    }
  }
  return out;
}

function evalThreeSoldiers(series: BarSeries): ConditionEval {
  const n = series.closes.length;
  const out = empty(n, 'buy', 'Soldiers');
  for (let i = 2; i < n; i++) {
    let ok = true;
    for (let k = 0; k < 3; k++) {
      const j = i - 2 + k;
      if (!(series.closes[j]! > series.opens[j]!)) ok = false;
      if (k > 0 && !(series.closes[j]! > series.closes[j - 1]!)) ok = false;
    }
    if (ok) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}

function evalThreeCrows(series: BarSeries): ConditionEval {
  const n = series.closes.length;
  const out = empty(n, 'sell', 'Crows');
  for (let i = 2; i < n; i++) {
    let ok = true;
    for (let k = 0; k < 3; k++) {
      const j = i - 2 + k;
      if (!(series.closes[j]! < series.opens[j]!)) ok = false;
      if (k > 0 && !(series.closes[j]! < series.closes[j - 1]!)) ok = false;
    }
    if (ok) {
      out.flags[i] = 1;
      out.sides[i] = SELL;
    }
  }
  return out;
}

function evalHarami(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Harami');
  for (let i = 1; i < n; i++) {
    const o0 = series.opens[i - 1]!;
    const c0 = series.closes[i - 1]!;
    const o1 = series.opens[i]!;
    const c1 = series.closes[i]!;
    const hi0 = Math.max(o0, c0);
    const lo0 = Math.min(o0, c0);
    const hi1 = Math.max(o1, c1);
    const lo1 = Math.min(o1, c1);
    const inside = hi1 < hi0 && lo1 > lo0;
    mark(out, i, inside && c0 < o0 && c1 > o1, inside && c0 > o0 && c1 < o1, sideWant);
  }
  return out;
}

function evalPiercingDark(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Pierce');
  for (let i = 1; i < n; i++) {
    const o0 = series.opens[i - 1]!;
    const c0 = series.closes[i - 1]!;
    const o1 = series.opens[i]!;
    const c1 = series.closes[i]!;
    const mid = (o0 + c0) / 2;
    const pierce = c0 < o0 && o1 < c0 && c1 > mid && c1 < o0;
    const dark = c0 > o0 && o1 > c0 && c1 < mid && c1 > o0;
    mark(out, i, pierce, dark, sideWant);
  }
  return out;
}

function evalMarubozu(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Maru');
  for (let i = 0; i < n; i++) {
    const o = series.opens[i]!;
    const h = series.highs[i]!;
    const l = series.lows[i]!;
    const c = series.closes[i]!;
    const range = h - l;
    if (range <= 0) continue;
    const body = Math.abs(c - o);
    if (body / range < 0.9) continue;
    mark(out, i, c > o, c < o, sideWant);
  }
  return out;
}

function evalSpinningTop(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const bodyPct = Math.max(5, num(params, 'bodyPct', 30)) / 100;
  const out = empty(n, null, 'Spin');
  for (let i = 0; i < n; i++) {
    const o = series.opens[i]!;
    const h = series.highs[i]!;
    const l = series.lows[i]!;
    const c = series.closes[i]!;
    const range = h - l;
    if (range <= 0) continue;
    const body = Math.abs(c - o);
    const upper = h - Math.max(o, c);
    const lower = Math.min(o, c) - l;
    if (body / range <= bodyPct && upper > body && lower > body) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}

function evalTweezer(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const tol = Math.max(0.01, num(params, 'tolerancePct', 0.05)) / 100;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Tweezer');
  for (let i = 1; i < n; i++) {
    const eqh = Math.abs(series.highs[i]! - series.highs[i - 1]!) <= series.highs[i]! * tol;
    const eql = Math.abs(series.lows[i]! - series.lows[i - 1]!) <= series.lows[i]! * tol;
    mark(out, i, eql && series.closes[i]! > series.opens[i]!, eqh && series.closes[i]! < series.opens[i]!, sideWant);
  }
  return out;
}

function evalNrBar(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(4, Math.floor(num(params, 'lookback', 7)));
  const out = empty(n, null, 'NR');
  for (let i = lookback - 1; i < n; i++) {
    const r = series.highs[i]! - series.lows[i]!;
    let isMin = true;
    for (let j = i - lookback + 1; j < i; j++) {
      if (series.highs[j]! - series.lows[j]! <= r) {
        isMin = false;
        break;
      }
    }
    if (isMin) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}

function evalWideRange(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'lookback', 14)));
  const mult = Math.max(1.2, num(params, 'mult', 2));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'WRB');
  for (let i = lookback; i < n; i++) {
    let avg = 0;
    for (let j = i - lookback; j < i; j++) avg += series.highs[j]! - series.lows[j]!;
    avg /= lookback;
    const r = series.highs[i]! - series.lows[i]!;
    if (avg > 0 && r >= avg * mult) {
      mark(out, i, series.closes[i]! > series.opens[i]!, series.closes[i]! < series.opens[i]!, sideWant);
    }
  }
  return out;
}

function evalCloseInRange(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const pct = Math.max(5, num(params, 'pct', 25)) / 100;
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'ClRng');
  for (let i = 0; i < n; i++) {
    const h = series.highs[i]!;
    const l = series.lows[i]!;
    const c = series.closes[i]!;
    const range = h - l;
    if (range <= 0) continue;
    const pos = (c - l) / range;
    mark(out, i, pos >= 1 - pct, pos <= pct, sideWant);
  }
  return out;
}

function evalRejectionWick(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const wickPct = Math.max(40, num(params, 'wickPct', 60)) / 100;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Reject');
  for (let i = 0; i < n; i++) {
    const o = series.opens[i]!;
    const h = series.highs[i]!;
    const l = series.lows[i]!;
    const c = series.closes[i]!;
    const range = h - l;
    if (range <= 0) continue;
    const upper = h - Math.max(o, c);
    const lower = Math.min(o, c) - l;
    mark(out, i, lower / range >= wickPct, upper / range >= wickPct, sideWant);
  }
  return out;
}

function evalTwoBarReversal(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, '2BR');
  for (let i = 1; i < n; i++) {
    const bull =
      series.closes[i - 1]! < series.opens[i - 1]! &&
      series.closes[i]! > series.opens[i]! &&
      series.closes[i]! > series.highs[i - 1]!;
    const bear =
      series.closes[i - 1]! > series.opens[i - 1]! &&
      series.closes[i]! < series.opens[i]! &&
      series.closes[i]! < series.lows[i - 1]!;
    mark(out, i, bull, bear, sideWant);
  }
  return out;
}

// —— Structure ——

function findBullFvg(series: BarSeries, i: number, lookback: number): { top: number; bot: number } | null {
  const from = Math.max(2, i - lookback);
  for (let j = i; j >= from; j--) {
    const c0 = series.highs[j - 2]!;
    const c2 = series.lows[j]!;
    if (c0 < c2) return { bot: c0, top: c2 };
  }
  return null;
}

function findBearFvg(series: BarSeries, i: number, lookback: number): { top: number; bot: number } | null {
  const from = Math.max(2, i - lookback);
  for (let j = i; j >= from; j--) {
    const c0 = series.lows[j - 2]!;
    const c2 = series.highs[j]!;
    if (c0 > c2) return { top: c0, bot: c2 };
  }
  return null;
}

function evalFvg(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(3, Math.floor(num(params, 'lookback', 20)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant ?? 'buy', 'FVG');
  for (let i = 2; i < n; i++) {
    const px = series.closes[i]!;
    let gapTop = 0;
    let gapBot = 0;
    let hitSide: 0 | 1 | 2 = 0;
    if (sideWant === 'buy' || sideWant === null) {
      const gap = findBullFvg(series, i, lookback);
      if (gap && px >= gap.bot && px <= gap.top) {
        out.flags[i] = 1;
        out.sides[i] = BUY;
        gapTop = gap.top;
        gapBot = gap.bot;
        hitSide = BUY;
      }
    }
    if ((sideWant === 'sell' || sideWant === null) && !out.flags[i]) {
      const gap = findBearFvg(series, i, lookback);
      if (gap && px <= gap.top && px >= gap.bot) {
        out.flags[i] = 1;
        out.sides[i] = SELL;
        gapTop = gap.top;
        gapBot = gap.bot;
        hitSide = SELL;
      }
    }
    if (out.flags[i] === 1 && (i === 2 || out.flags[i - 1] !== 1) && hitSide) {
      pushZoneHint(out, {
        startIdx: Math.max(0, i - 2),
        endIdx: Math.min(n - 1, i + 16),
        priceHigh: Math.max(gapTop, gapBot),
        priceLow: Math.min(gapTop, gapBot),
        kind: 'fvg',
        side: hitSide === SELL ? 'sell' : 'buy',
      });
    }
  }
  return out;
}

function evalIfvg(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(3, Math.floor(num(params, 'lookback', 20)));
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'IFVG');
  for (let i = 3; i < n; i++) {
    const px = series.closes[i]!;
    if (sideWant === 'buy') {
      const gap = findBearFvg(series, i - 1, lookback);
      if (gap && series.closes[i - 1]! < gap.bot && px >= gap.bot && px <= gap.top) {
        out.flags[i] = 1;
        out.sides[i] = BUY;
      }
    } else {
      const gap = findBullFvg(series, i - 1, lookback);
      if (gap && series.closes[i - 1]! > gap.top && px <= gap.top && px >= gap.bot) {
        out.flags[i] = 1;
        out.sides[i] = SELL;
      }
    }
  }
  return out;
}

function evalOte(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'swingLookback', 20)));
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'OTE');
  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    const range = sw.hi - sw.lo;
    if (range <= 0) continue;
    const px = series.closes[i]!;
    let zLo = 0;
    let zHi = 0;
    let hit = false;
    if (sideWant === 'buy') {
      zLo = sw.hi - range * 0.79;
      zHi = sw.hi - range * 0.62;
      if (px >= zLo && px <= zHi) {
        out.flags[i] = 1;
        out.sides[i] = BUY;
        hit = true;
      }
    } else {
      zLo = sw.lo + range * 0.62;
      zHi = sw.lo + range * 0.79;
      if (px >= zLo && px <= zHi) {
        out.flags[i] = 1;
        out.sides[i] = SELL;
        hit = true;
      }
    }
    if (hit && out.flags[i - 1] !== 1) {
      pushZoneHint(out, {
        startIdx: Math.max(0, i - lookback),
        endIdx: Math.min(n - 1, i + 12),
        priceHigh: Math.max(zHi, zLo),
        priceLow: Math.min(zHi, zLo),
        kind: 'fib',
        side: sideWant === 'sell' ? 'sell' : 'buy',
      });
    }
  }
  return out;
}

function evalBos(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(3, Math.floor(num(params, 'swingLookback', 10)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'BOS');
  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    mark(
      out,
      i,
      series.closes[i]! > sw.hi && series.closes[i - 1]! <= sw.hi,
      series.closes[i]! < sw.lo && series.closes[i - 1]! >= sw.lo,
      sideWant,
    );
  }
  return out;
}

function evalSweep(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(3, Math.floor(num(params, 'lookback', 10)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Sweep');
  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    mark(
      out,
      i,
      series.lows[i]! < sw.lo && series.closes[i]! > sw.lo,
      series.highs[i]! > sw.hi && series.closes[i]! < sw.hi,
      sideWant,
    );
  }
  return out;
}

function evalEqualHL(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'lookback', 20)));
  const tolPct = Math.max(0.01, num(params, 'tolerancePct', 0.05)) / 100;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'EQH/L');
  for (let i = lookback; i < n; i++) {
    const hi = series.highs[i]!;
    const lo = series.lows[i]!;
    let eqh = false;
    let eql = false;
    for (let j = i - lookback; j < i - 1; j++) {
      if (Math.abs(hi - series.highs[j]!) <= hi * tolPct) eqh = true;
      if (Math.abs(lo - series.lows[j]!) <= lo * tolPct) eql = true;
    }
    mark(out, i, eql, eqh, sideWant);
    if (out.flags[i] === 1 && out.flags[i - 1] !== 1) {
      const lvl = eqh ? hi : lo;
      const pad = Math.max(Math.abs(lvl) * 0.00015, (hi - lo) * 0.05);
      pushZoneHint(out, {
        startIdx: Math.max(0, i - lookback),
        endIdx: Math.min(n - 1, i + 8),
        priceHigh: lvl + pad,
        priceLow: lvl - pad,
        kind: 'equal',
        side: out.sides[i] === SELL ? 'sell' : 'buy',
      });
    }
  }
  return out;
}

function evalOrderBlock(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'lookback', 20)));
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'OB');
  for (let i = lookback; i < n; i++) {
    let avg = 0;
    for (let j = i - lookback; j < i; j++) avg += series.highs[j]! - series.lows[j]!;
    avg /= lookback;
    if (avg <= 0) continue;
    let dispIdx = -1;
    for (let j = i - 1; j >= i - lookback + 2; j--) {
      const range = series.highs[j]! - series.lows[j]!;
      const bullish = series.closes[j]! > series.opens[j]!;
      if (range >= avg * 1.8) {
        if (sideWant === 'buy' && bullish) {
          dispIdx = j;
          break;
        }
        if (sideWant === 'sell' && !bullish) {
          dispIdx = j;
          break;
        }
      }
    }
    if (dispIdx < 2) continue;
    const obI = dispIdx - 1;
    const px = series.closes[i]!;
    if (px >= series.lows[obI]! && px <= series.highs[obI]!) {
      out.flags[i] = 1;
      out.sides[i] = sideWant === 'sell' ? SELL : BUY;
      if (i === lookback || out.flags[i - 1] !== 1) {
        pushZoneHint(out, {
          startIdx: obI,
          endIdx: Math.min(n - 1, i + 12),
          priceHigh: series.highs[obI]!,
          priceLow: series.lows[obI]!,
          kind: 'ob',
          side: sideWant === 'sell' ? 'sell' : 'buy',
        });
      }
    }
  }
  return out;
}

function evalDisplacement(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'lookback', 14)));
  const mult = Math.max(1.2, num(params, 'mult', 2));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Disp');
  for (let i = lookback; i < n; i++) {
    let avg = 0;
    for (let j = i - lookback; j < i; j++) avg += series.highs[j]! - series.lows[j]!;
    avg /= lookback;
    const range = series.highs[i]! - series.lows[i]!;
    if (avg <= 0 || range < avg * mult) continue;
    mark(out, i, series.closes[i]! > series.opens[i]!, series.closes[i]! < series.opens[i]!, sideWant);
  }
  return out;
}

function evalBreaker(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'lookback', 20)));
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'BRK');
  // Simplified: prior swing broken then price returns to broken zone
  for (let i = lookback + 2; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i - 2, lookback);
    if (!sw) continue;
    if (sideWant === 'buy') {
      const broke = series.closes[i - 2]! < sw.lo;
      const back = series.closes[i]! >= sw.lo && series.closes[i]! <= sw.lo + (sw.hi - sw.lo) * 0.25;
      if (broke && back) {
        out.flags[i] = 1;
        out.sides[i] = BUY;
      }
    } else {
      const broke = series.closes[i - 2]! > sw.hi;
      const back = series.closes[i]! <= sw.hi && series.closes[i]! >= sw.hi - (sw.hi - sw.lo) * 0.25;
      if (broke && back) {
        out.flags[i] = 1;
        out.sides[i] = SELL;
      }
    }
  }
  return out;
}

function evalPremiumDiscount(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'swingLookback', 20)));
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, 'P/D');
  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    const mid = (sw.hi + sw.lo) / 2;
    const px = series.closes[i]!;
    mark(out, i, px < mid, px > mid, sideWant);
  }
  return out;
}

function evalFibTouch(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'swingLookback', 20)));
  const levelStr = str(params, 'level', '61.8');
  const fib = Number(levelStr) / 100;
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(n, sideWant, `Fib ${levelStr}`);
  const tol = 0.002;
  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    const range = sw.hi - sw.lo;
    if (range <= 0) continue;
    const px = series.closes[i]!;
    let lvl = 0;
    let hit = false;
    if (sideWant === 'buy') {
      lvl = sw.hi - range * fib;
      if (Math.abs(px - lvl) <= range * tol || (series.lows[i]! <= lvl && series.highs[i]! >= lvl)) {
        out.flags[i] = 1;
        out.sides[i] = BUY;
        hit = true;
      }
    } else {
      lvl = sw.lo + range * fib;
      if (Math.abs(px - lvl) <= range * tol || (series.lows[i]! <= lvl && series.highs[i]! >= lvl)) {
        out.flags[i] = 1;
        out.sides[i] = SELL;
        hit = true;
      }
    }
    if (hit && out.flags[i - 1] !== 1) {
      const band = Math.max(range * 0.02, Math.abs(lvl) * 0.0002);
      pushZoneHint(out, {
        startIdx: Math.max(0, i - lookback),
        endIdx: Math.min(n - 1, i + 10),
        priceHigh: lvl + band,
        priceLow: lvl - band,
        kind: 'fib',
        side: sideWant === 'sell' ? 'sell' : 'buy',
      });
    }
  }
  return out;
}

function evalRetestBreak(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'lookback', 10)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Retest');
  for (let i = lookback + 2; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i - 2, lookback);
    if (!sw) continue;
    const brokeUp = series.closes[i - 2]! > sw.hi;
    const brokeDn = series.closes[i - 2]! < sw.lo;
    const retestUp =
      brokeUp &&
      series.lows[i]! <= sw.hi &&
      series.closes[i]! > sw.hi;
    const retestDn =
      brokeDn &&
      series.highs[i]! >= sw.lo &&
      series.closes[i]! < sw.lo;
    mark(out, i, retestUp, retestDn, sideWant);
  }
  return out;
}

function evalSwingFailure(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(5, Math.floor(num(params, 'lookback', 10)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'SFP');
  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    // Same as liquidity sweep — wick beyond, close inside
    mark(
      out,
      i,
      series.lows[i]! < sw.lo && series.closes[i]! > sw.lo,
      series.highs[i]! > sw.hi && series.closes[i]! < sw.hi,
      sideWant,
    );
  }
  return out;
}

function evalUntapped(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const lookback = Math.max(10, Math.floor(num(params, 'lookback', 30)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Untap');
  for (let i = lookback; i < n; i++) {
    let maxH = -Infinity;
    let minL = Infinity;
    let maxIdx = i - lookback;
    let minIdx = i - lookback;
    for (let j = i - lookback; j < i; j++) {
      if (series.highs[j]! >= maxH) {
        maxH = series.highs[j]!;
        maxIdx = j;
      }
      if (series.lows[j]! <= minL) {
        minL = series.lows[j]!;
        minIdx = j;
      }
    }
    let hiTapped = false;
    let loTapped = false;
    for (let j = maxIdx + 1; j < i; j++) {
      if (series.highs[j]! >= maxH) hiTapped = true;
    }
    for (let j = minIdx + 1; j < i; j++) {
      if (series.lows[j]! <= minL) loTapped = true;
    }
    // Fire when price approaches untapped extreme
    const nearLo = !loTapped && series.lows[i]! <= minL + (maxH - minL) * 0.05;
    const nearHi = !hiTapped && series.highs[i]! >= maxH - (maxH - minL) * 0.05;
    mark(out, i, nearLo, nearHi, sideWant);
  }
  return out;
}

function evalMss(series: BarSeries, params: PieceParams): ConditionEval {
  // Stronger BOS: break with body beyond swing
  const n = series.closes.length;
  const lookback = Math.max(3, Math.floor(num(params, 'swingLookback', 12)));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'MSS');
  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    const bull =
      series.opens[i]! > sw.hi &&
      series.closes[i]! > sw.hi &&
      series.closes[i - 1]! <= sw.hi;
    const bear =
      series.opens[i]! < sw.lo &&
      series.closes[i]! < sw.lo &&
      series.closes[i - 1]! >= sw.lo;
    mark(out, i, bull, bear, sideWant);
  }
  return out;
}

// —— Session ——

function killzoneHours(zone: string): [number, number][] {
  switch (zone) {
    case 'ny':
      return [[12, 15]];
    case 'london_ny':
      return [
        [7, 10],
        [12, 15],
      ];
    case 'asia':
      return [[0, 5]];
    default:
      return [[7, 10]];
  }
}

function evalKillzone(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const zone = str(params, 'zone', 'london');
  const windows = killzoneHours(zone);
  const out = empty(n, null, `KZ ${zone}`);
  for (let i = 0; i < n; i++) {
    const h = utcHour(series.times[i]!);
    if (windows.some(([a, b]) => h >= a && h < b)) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}

function evalAsianRangeBreak(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Asia break');
  let day = n > 0 ? utcDay(series.times[0]!) : 0;
  let asiaHi = -Infinity;
  let asiaLo = Infinity;
  let done = false;
  for (let i = 0; i < n; i++) {
    const t = series.times[i]!;
    const d = utcDay(t);
    const h = utcHour(t);
    if (d !== day) {
      day = d;
      asiaHi = -Infinity;
      asiaLo = Infinity;
      done = false;
    }
    if (h < 8) {
      asiaHi = Math.max(asiaHi, series.highs[i]!);
      asiaLo = Math.min(asiaLo, series.lows[i]!);
      done = Number.isFinite(asiaHi);
      continue;
    }
    if (!done) continue;
    mark(out, i, series.closes[i]! > asiaHi, series.closes[i]! < asiaLo, sideWant);
  }
  return out;
}

function evalSessionOpenBreak(
  series: BarSeries,
  params: PieceParams,
  openHour: number,
  label: string,
): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, label);
  let day = n > 0 ? utcDay(series.times[0]!) : 0;
  let orHigh = -Infinity;
  let orLow = Infinity;
  let building = false;
  let ready = false;
  for (let i = 0; i < n; i++) {
    const d = utcDay(series.times[i]!);
    const h = utcHour(series.times[i]!);
    if (d !== day) {
      day = d;
      orHigh = -Infinity;
      orLow = Infinity;
      building = false;
      ready = false;
    }
    if (h === openHour) {
      building = true;
      orHigh = Math.max(orHigh, series.highs[i]!);
      orLow = Math.min(orLow, series.lows[i]!);
      continue;
    }
    if (building && h > openHour) {
      ready = true;
      building = false;
    }
    if (!ready) continue;
    mark(out, i, series.closes[i]! > orHigh, series.closes[i]! < orLow, sideWant);
  }
  return out;
}

function evalPrevDayHl(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'PDH/L');
  let day = n > 0 ? utcDay(series.times[0]!) : 0;
  let curHi = -Infinity;
  let curLo = Infinity;
  let prevHi = Number.NaN;
  let prevLo = Number.NaN;
  for (let i = 0; i < n; i++) {
    const d = utcDay(series.times[i]!);
    if (d !== day) {
      prevHi = curHi;
      prevLo = curLo;
      day = d;
      curHi = -Infinity;
      curLo = Infinity;
    }
    curHi = Math.max(curHi, series.highs[i]!);
    curLo = Math.min(curLo, series.lows[i]!);
    if (!Number.isFinite(prevHi)) continue;
    mark(
      out,
      i,
      series.closes[i]! > prevHi && series.closes[i - 1]! <= prevHi,
      series.closes[i]! < prevLo && series.closes[i - 1]! >= prevLo,
      sideWant,
    );
  }
  return out;
}

function evalPrevWeekHl(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'PWH/L');
  let week = n > 0 ? Math.floor(utcDay(series.times[0]!) / 7) : 0;
  let curHi = -Infinity;
  let curLo = Infinity;
  let prevHi = Number.NaN;
  let prevLo = Number.NaN;
  for (let i = 0; i < n; i++) {
    const w = Math.floor(utcDay(series.times[i]!) / 7);
    if (w !== week) {
      prevHi = curHi;
      prevLo = curLo;
      week = w;
      curHi = -Infinity;
      curLo = Infinity;
    }
    curHi = Math.max(curHi, series.highs[i]!);
    curLo = Math.min(curLo, series.lows[i]!);
    if (!Number.isFinite(prevHi) || i === 0) continue;
    mark(
      out,
      i,
      series.closes[i]! > prevHi && series.closes[i - 1]! <= prevHi,
      series.closes[i]! < prevLo && series.closes[i - 1]! >= prevLo,
      sideWant,
    );
  }
  return out;
}

function evalWeekOpenBreak(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'WOpen');
  let week = n > 0 ? Math.floor(utcDay(series.times[0]!) / 7) : 0;
  let openPx = Number.NaN;
  for (let i = 0; i < n; i++) {
    const w = Math.floor(utcDay(series.times[i]!) / 7);
    const dow = utcDow(series.times[i]!);
    if (w !== week) {
      week = w;
      openPx = Number.NaN;
    }
    if (!Number.isFinite(openPx) && dow === 1) {
      openPx = series.opens[i]!;
    }
    if (!Number.isFinite(openPx) || i === 0) continue;
    mark(
      out,
      i,
      series.closes[i]! > openPx && series.closes[i - 1]! <= openPx,
      series.closes[i]! < openPx && series.closes[i - 1]! >= openPx,
      sideWant,
    );
  }
  return out;
}

function evalRoundNumber(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const step = Math.max(1e-8, num(params, 'step', 0.01));
  const sideWant = sideFromParams(params);
  const out = empty(n, sideWant, 'Round');
  for (let i = 1; i < n; i++) {
    const lvl = Math.round(series.closes[i]! / step) * step;
    const touched =
      series.lows[i]! <= lvl && series.highs[i]! >= lvl;
    if (!touched) continue;
    // Direction from approach
    mark(
      out,
      i,
      series.closes[i - 1]! < lvl && series.closes[i]! >= lvl,
      series.closes[i - 1]! > lvl && series.closes[i]! <= lvl,
      sideWant,
    );
  }
  return out;
}

function evalDayOfWeek(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const day = Math.floor(num(params, 'day', 1));
  const out = empty(n, null, `DOW${day}`);
  for (let i = 0; i < n; i++) {
    if (utcDow(series.times[i]!) === day) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}

function evalHourWindow(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const fromH = Math.max(0, Math.min(23, Math.floor(num(params, 'fromHour', 7))));
  const toH = Math.max(1, Math.min(24, Math.floor(num(params, 'toHour', 10))));
  const out = empty(n, null, `H${fromH}-${toH}`);
  for (let i = 0; i < n; i++) {
    const h = utcHour(series.times[i]!);
    const ok = fromH < toH ? h >= fromH && h < toH : h >= fromH || h < toH;
    if (ok) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    }
  }
  return out;
}


function evalHtfMaBias(series: BarSeries, params: PieceParams): ConditionEval {
  const htf = str(params, 'htf', '1h') as Timeframe;
  const period = Math.max(5, Math.floor(num(params, 'period', 50)));
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(series.closes.length, sideWant, `HTF MA ${htf}`);
  const agg = aggregateSeriesToHtf(series, htf);
  if (agg.closes.length < period + 2) return out;
  const ema = computeEma(agg.closes, period);
  const hFlags = new Uint8Array(agg.closes.length);
  const hSides = new Uint8Array(agg.closes.length);
  for (let i = 0; i < agg.closes.length; i++) {
    const m = ema[i]!;
    if (!Number.isFinite(m)) continue;
    const bull = agg.closes[i]! > m;
    const bear = agg.closes[i]! < m;
    if (sideWant === 'buy' && bull) {
      hFlags[i] = 1;
      hSides[i] = BUY;
    } else if (sideWant === 'sell' && bear) {
      hFlags[i] = 1;
      hSides[i] = SELL;
    } else if (sideWant === null) {
      if (bull) {
        hFlags[i] = 1;
        hSides[i] = BUY;
      } else if (bear) {
        hFlags[i] = 1;
        hSides[i] = SELL;
      }
    }
  }
  const mapped = mapHtfFlagsToLtf(
    series.times,
    agg.times,
    hFlags,
    hSides,
    timeframeSeconds(htf),
  );
  out.flags = mapped.flags;
  out.sides = mapped.sides;
  return out;
}

function evalHtfBosBias(series: BarSeries, params: PieceParams): ConditionEval {
  const htf = str(params, 'htf', '1h') as Timeframe;
  const lookback = Math.max(3, Math.floor(num(params, 'swingLookback', 8)));
  const sideWant = sideFromParams(params);
  const out = empty(series.closes.length, sideWant, `HTF BOS ${htf}`);
  const agg = aggregateSeriesToHtf(series, htf);
  const hFlags = new Uint8Array(agg.closes.length);
  const hSides = new Uint8Array(agg.closes.length);
  for (let i = lookback; i < agg.closes.length; i++) {
    const sw = swingHighLow(agg.highs, agg.lows, i, lookback);
    if (!sw) continue;
    const bull = agg.closes[i]! > sw.hi && agg.closes[i - 1]! <= sw.hi;
    const bear = agg.closes[i]! < sw.lo && agg.closes[i - 1]! >= sw.lo;
    if (sideWant === 'buy' && bull) {
      hFlags[i] = 1;
      hSides[i] = BUY;
    } else if (sideWant === 'sell' && bear) {
      hFlags[i] = 1;
      hSides[i] = SELL;
    } else if (sideWant === null) {
      if (bull) {
        hFlags[i] = 1;
        hSides[i] = BUY;
      } else if (bear) {
        hFlags[i] = 1;
        hSides[i] = SELL;
      }
    }
  }
  // Forward-fill last BOS direction as bias until opposite
  let last = 0;
  let lastSide = 0;
  for (let i = 0; i < hFlags.length; i++) {
    if (hFlags[i]) {
      last = 1;
      lastSide = hSides[i]!;
    } else if (last) {
      hFlags[i] = 1;
      hSides[i] = lastSide;
    }
  }
  const mapped = mapHtfFlagsToLtf(
    series.times,
    agg.times,
    hFlags,
    hSides,
    timeframeSeconds(htf),
  );
  out.flags = mapped.flags;
  out.sides = mapped.sides;
  return out;
}

function evalHtfRsiBias(series: BarSeries, params: PieceParams): ConditionEval {
  const htf = str(params, 'htf', '1h') as Timeframe;
  const period = Math.max(2, Math.floor(num(params, 'period', 14)));
  const level = num(params, 'level', 50);
  const sideWant = sideFromParams(params) ?? 'buy';
  const out = empty(series.closes.length, sideWant, `HTF RSI ${htf}`);
  const agg = aggregateSeriesToHtf(series, htf);
  const rsi = computeRsi(agg.closes, period);
  const hFlags = new Uint8Array(agg.closes.length);
  const hSides = new Uint8Array(agg.closes.length);
  for (let i = 0; i < agg.closes.length; i++) {
    const r = rsi[i]!;
    if (!Number.isFinite(r)) continue;
    if (sideWant === 'buy' && r <= level) {
      hFlags[i] = 1;
      hSides[i] = BUY;
    } else if (sideWant === 'sell' && r >= level) {
      hFlags[i] = 1;
      hSides[i] = SELL;
    }
  }
  const mapped = mapHtfFlagsToLtf(
    series.times,
    agg.times,
    hFlags,
    hSides,
    timeframeSeconds(htf),
  );
  out.flags = mapped.flags;
  out.sides = mapped.sides;
  return out;
}


const EVALUATORS: Record<
  Exclude<PieceKind, 'and' | 'or' | 'not' | 'xor' | RiskKind>,
  (s: BarSeries, p: PieceParams) => ConditionEval
> = {
  sma_cross: (s, p) => evalMaCross(s, p, 'sma'),
  ema_cross: (s, p) => evalMaCross(s, p, 'ema'),
  wma_cross: (s, p) => evalMaCross(s, p, 'wma'),
  hma_cross: (s, p) => evalMaCross(s, p, 'hma'),
  donchian_break: evalDonchian,
  rsi_gate: evalRsiGate,
  rsi_cross: evalRsiCross,
  macd_cross: evalMacdCross,
  macd_hist_flip: evalMacdHistFlip,
  bb_touch: evalBbTouch,
  bb_squeeze: evalBbSqueeze,
  bb_walk: evalBbWalk,
  keltner_break: evalKeltner,
  envelopes_touch: evalEnvelopes,
  price_vs_ma: evalPriceVsMa,
  ma_stack: evalMaStack,
  ma_slope: evalMaSlope,
  stoch_cross: evalStochCross,
  stoch_gate: evalStochGate,
  atr_surge: evalAtrSurge,
  atr_compress: evalAtrCompress,
  momentum: evalMomentum,
  roc_extreme: evalRocExtreme,
  cci_gate: evalCciGate,
  cci_cross: evalCciCross,
  willr_gate: evalWillrGate,
  adx_trend: evalAdxTrend,
  ao_cross: evalAoCross,
  supertrend_flip: evalSupertrend,
  psar_flip: evalPsar,
  ichimoku_tk_cross: evalIchimokuTk,
  ichimoku_cloud: evalIchimokuCloud,
  trix_cross: evalTrix,
  ppo_cross: evalPpo,
  aroon_cross: evalAroon,
  chop_filter: evalChop,
  candle_confirm: evalCandleConfirm,
  engulfing: evalEngulfing,
  pin_bar: evalPinBar,
  inside_bar: (s) => evalInsideBar(s),
  outside_bar: evalOutsideBar,
  doji: evalDoji,
  gap: evalGap,
  body_direction: evalBodyDirection,
  hh_ll: evalHhLl,
  hl_lh: evalHlLh,
  session_range_break: evalSessionRangeBreak,
  morning_star: (s) => evalMorningStar(s),
  evening_star: (s) => evalEveningStar(s),
  three_soldiers: (s) => evalThreeSoldiers(s),
  three_crows: (s) => evalThreeCrows(s),
  harami: evalHarami,
  piercing_dark: evalPiercingDark,
  marubozu: evalMarubozu,
  spinning_top: evalSpinningTop,
  tweezer: evalTweezer,
  nr_bar: evalNrBar,
  wide_range_bar: evalWideRange,
  close_in_range: evalCloseInRange,
  rejection_wick: evalRejectionWick,
  two_bar_reversal: evalTwoBarReversal,
  fvg: evalFvg,
  ifvg: evalIfvg,
  ote_touch: evalOte,
  bos_choch: evalBos,
  liquidity_sweep: evalSweep,
  equal_highs_lows: evalEqualHL,
  order_block: evalOrderBlock,
  displacement: evalDisplacement,
  breaker_block: evalBreaker,
  premium_discount: evalPremiumDiscount,
  fib_touch: evalFibTouch,
  retest_break: evalRetestBreak,
  swing_failure: evalSwingFailure,
  untapped_extreme: evalUntapped,
  mss: evalMss,
  killzone: evalKillzone,
  asian_range_break: evalAsianRangeBreak,
  london_open_break: (s, p) => evalSessionOpenBreak(s, p, 7, 'Ldn'),
  ny_open_break: (s, p) => evalSessionOpenBreak(s, p, 12, 'NY'),
  prev_day_hl: evalPrevDayHl,
  prev_week_hl: evalPrevWeekHl,
  week_open_break: evalWeekOpenBreak,
  round_number: evalRoundNumber,
  day_of_week: evalDayOfWeek,
  hour_window: evalHourWindow,
  htf_ma_bias: evalHtfMaBias,
  htf_bos_bias: evalHtfBosBias,
  htf_rsi_bias: evalHtfRsiBias,
};

/** Precompute condition flags for every leaf piece. */
export function evalAllConditions(
  pieces: CompiledPiece[],
  series: BarSeries,
): Map<string, ConditionEval> {
  const out = new Map<string, ConditionEval>();
  for (const p of pieces) {
    if (
      p.kind === 'and' ||
      p.kind === 'or' ||
      p.kind === 'not' ||
      p.kind === 'xor' ||
      isRiskKind(p.kind)
    ) {
      continue;
    }
    const fn = EVALUATORS[p.kind];
    const ev = fn(series, p.params);
    if (p.label) ev.label = p.label;
    out.set(p.id, ev);
  }
  return out;
}

/** Evaluate a single condition kind (tests / diagnostics). */
export function evaluateCondition(
  kind: Exclude<PieceKind, 'and' | 'or' | 'not' | 'xor' | RiskKind>,
  series: BarSeries,
  params: PieceParams = {},
): ConditionEval {
  return EVALUATORS[kind](series, params);
}

/** Runtime completeness: every registry condition kind must have an evaluator. */
export function missingEvaluators(kinds: PieceKind[]): PieceKind[] {
  return kinds.filter((k) => {
    if (k === 'and' || k === 'or' || k === 'not' || k === 'xor' || isRiskKind(k)) {
      return false;
    }
    return !(k in EVALUATORS);
  });
}
