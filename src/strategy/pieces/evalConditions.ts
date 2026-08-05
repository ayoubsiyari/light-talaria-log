/**
 * Per-bar boolean evaluators for condition pieces (Worker-safe).
 */
import { computeSma } from '@/indicators/smaEma';
import { computeRsi } from '@/indicators/rsi';
import type { CompiledPiece, PieceParams } from '@/strategy/graphTypes';
import type { OrderSide } from '@/types/order';

export interface BarSeries {
  opens: Float32Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
}

export interface ConditionEval {
  /** true at bar i when the condition holds. */
  flags: Uint8Array;
  /** Preferred side when this leaf fires (null = either / unknown). */
  side: OrderSide | null;
  label: string;
}

function num(params: PieceParams, key: string, fallback: number): number {
  const v = params[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(params: PieceParams, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}

function sideFromParams(params: PieceParams): OrderSide | null {
  const s = str(params, 'side', 'either');
  if (s === 'buy' || s === 'sell') return s;
  return null;
}

function channelPrior(
  highs: Float32Array,
  lows: Float32Array,
  i: number,
  period: number,
): { hi: number; lo: number } | null {
  if (i < period) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = i - period; j < i; j++) {
    const h = highs[j]!;
    const l = lows[j]!;
    if (h > hi) hi = h;
    if (l < lo) lo = l;
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return { hi, lo };
}

function evalSmaCross(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const fastN = Math.max(2, Math.floor(num(params, 'fastPeriod', 10)));
  const slowN = Math.max(fastN + 1, Math.floor(num(params, 'slowPeriod', 30)));
  const sideWant = sideFromParams(params);
  const fast = computeSma(series.closes, fastN);
  const slow = computeSma(series.closes, slowN);

  for (let i = 1; i < n; i++) {
    const f0 = fast[i - 1]!;
    const s0 = slow[i - 1]!;
    const f1 = fast[i]!;
    const s1 = slow[i]!;
    if (![f0, s0, f1, s1].every(Number.isFinite)) continue;
    const bull = f0 <= s0 && f1 > s1;
    const bear = f0 >= s0 && f1 < s1;
    if (sideWant === 'buy' && bull) flags[i] = 1;
    else if (sideWant === 'sell' && bear) flags[i] = 1;
    else if (sideWant === null && (bull || bear)) flags[i] = 1;
  }

  return {
    flags,
    side: sideWant,
    label: `SMA${fastN}×SMA${slowN}`,
  };
}

function evalDonchian(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const period = Math.max(2, Math.floor(num(params, 'period', 20)));
  const sideWant = sideFromParams(params);

  for (let i = 1; i < n; i++) {
    const ch = channelPrior(series.highs, series.lows, i, period);
    if (!ch) continue;
    const bull = series.highs[i]! > ch.hi;
    const bear = series.lows[i]! < ch.lo;
    if (sideWant === 'buy' && bull) flags[i] = 1;
    else if (sideWant === 'sell' && bear) flags[i] = 1;
    else if (sideWant === null && (bull || bear)) flags[i] = 1;
  }

  return { flags, side: sideWant, label: `Donchian ${period}` };
}

function evalRsiGate(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const period = Math.max(2, Math.floor(num(params, 'period', 14)));
  const level = num(params, 'level', 30);
  const sideWant = sideFromParams(params) ?? 'buy';
  const rsi = computeRsi(series.closes, period);

  for (let i = 0; i < n; i++) {
    const r = rsi[i]!;
    if (!Number.isFinite(r)) continue;
    if (sideWant === 'buy' && r <= level) flags[i] = 1;
    else if (sideWant === 'sell' && r >= level) flags[i] = 1;
  }

  return {
    flags,
    side: sideWant,
    label: `RSI${period} ${sideWant === 'buy' ? '≤' : '≥'} ${level}`,
  };
}

function evalCandleConfirm(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const bars = Math.max(1, Math.min(5, Math.floor(num(params, 'bars', 2))));
  const ref = str(params, 'ref', 'close');
  const sideWant = sideFromParams(params) ?? 'buy';
  const pick = (i: number): number => {
    if (ref === 'high') return series.highs[i]!;
    if (ref === 'low') return series.lows[i]!;
    return series.closes[i]!;
  };

  for (let i = bars; i < n; i++) {
    let ok = true;
    for (let k = 0; k < bars; k++) {
      const cur = i - k;
      const prev = cur - 1;
      if (prev < 0) {
        ok = false;
        break;
      }
      if (sideWant === 'buy') {
        if (!(pick(cur) > pick(prev))) {
          ok = false;
          break;
        }
      } else if (!(pick(cur) < pick(prev))) {
        ok = false;
        break;
      }
    }
    if (ok) flags[i] = 1;
  }

  return {
    flags,
    side: sideWant,
    label: `${bars}-bar ${ref} confirm`,
  };
}

function evalSessionRangeBreak(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const rangeBars = Math.max(1, Math.floor(num(params, 'rangeBars', 6)));
  const sideWant = sideFromParams(params);

  if (n <= rangeBars) {
    return { flags, side: sideWant, label: `ORB ${rangeBars}` };
  }

  let orHigh = -Infinity;
  let orLow = Infinity;
  for (let i = 0; i < rangeBars; i++) {
    orHigh = Math.max(orHigh, series.highs[i]!);
    orLow = Math.min(orLow, series.lows[i]!);
  }

  for (let i = rangeBars; i < n; i++) {
    const bull = series.closes[i]! > orHigh;
    const bear = series.closes[i]! < orLow;
    if (sideWant === 'buy' && bull) flags[i] = 1;
    else if (sideWant === 'sell' && bear) flags[i] = 1;
    else if (sideWant === null && (bull || bear)) flags[i] = 1;
  }

  return { flags, side: sideWant, label: `Range break ${rangeBars}` };
}

function findBullFvg(
  series: BarSeries,
  i: number,
  lookback: number,
): { top: number; bot: number } | null {
  const from = Math.max(2, i - lookback);
  for (let j = i; j >= from; j--) {
    const c0 = series.highs[j - 2]!;
    const c2 = series.lows[j]!;
    // bullish FVG: candle0 high < candle2 low
    if (Number.isFinite(c0) && Number.isFinite(c2) && c0 < c2) {
      return { bot: c0, top: c2 };
    }
  }
  return null;
}

function findBearFvg(
  series: BarSeries,
  i: number,
  lookback: number,
): { top: number; bot: number } | null {
  const from = Math.max(2, i - lookback);
  for (let j = i; j >= from; j--) {
    const c0 = series.lows[j - 2]!;
    const c2 = series.highs[j]!;
    // bearish FVG: candle0 low > candle2 high
    if (Number.isFinite(c0) && Number.isFinite(c2) && c0 > c2) {
      return { top: c0, bot: c2 };
    }
  }
  return null;
}

function evalFvg(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const lookback = Math.max(3, Math.floor(num(params, 'lookback', 20)));
  const sideWant = sideFromParams(params) ?? 'buy';

  for (let i = 2; i < n; i++) {
    const px = series.closes[i]!;
    if (sideWant === 'buy') {
      const gap = findBullFvg(series, i, lookback);
      if (gap && px >= gap.bot && px <= gap.top) flags[i] = 1;
    } else {
      const gap = findBearFvg(series, i, lookback);
      if (gap && px <= gap.top && px >= gap.bot) flags[i] = 1;
    }
  }

  return { flags, side: sideWant, label: 'FVG' };
}

function evalIfvg(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const lookback = Math.max(3, Math.floor(num(params, 'lookback', 20)));
  const sideWant = sideFromParams(params) ?? 'buy';

  for (let i = 3; i < n; i++) {
    const px = series.closes[i]!;
    if (sideWant === 'buy') {
      // Prior bearish FVG traded through → support
      const gap = findBearFvg(series, i - 1, lookback);
      if (gap && series.closes[i - 1]! < gap.bot && px >= gap.bot && px <= gap.top) {
        flags[i] = 1;
      }
    } else {
      const gap = findBullFvg(series, i - 1, lookback);
      if (gap && series.closes[i - 1]! > gap.top && px <= gap.top && px >= gap.bot) {
        flags[i] = 1;
      }
    }
  }

  return { flags, side: sideWant, label: 'IFVG' };
}

function swingHighLow(
  highs: Float32Array,
  lows: Float32Array,
  i: number,
  lookback: number,
): { hi: number; lo: number } | null {
  if (i < lookback) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = i - lookback; j < i; j++) {
    hi = Math.max(hi, highs[j]!);
    lo = Math.min(lo, lows[j]!);
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return { hi, lo };
}

function evalOteTouch(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const lookback = Math.max(5, Math.floor(num(params, 'swingLookback', 20)));
  const sideWant = sideFromParams(params) ?? 'buy';

  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    const range = sw.hi - sw.lo;
    if (range <= 0) continue;
    const px = series.closes[i]!;
    if (sideWant === 'buy') {
      // Discount OTE on bullish swing: 62–79% retrace from high
      const lo = sw.hi - range * 0.79;
      const hi = sw.hi - range * 0.62;
      if (px >= lo && px <= hi) flags[i] = 1;
    } else {
      const lo = sw.lo + range * 0.62;
      const hi = sw.lo + range * 0.79;
      if (px >= lo && px <= hi) flags[i] = 1;
    }
  }

  return { flags, side: sideWant, label: 'OTE' };
}

function evalBosChoch(series: BarSeries, params: PieceParams): ConditionEval {
  const n = series.closes.length;
  const flags = new Uint8Array(n);
  const lookback = Math.max(3, Math.floor(num(params, 'swingLookback', 10)));
  const sideWant = sideFromParams(params);

  for (let i = lookback; i < n; i++) {
    const sw = swingHighLow(series.highs, series.lows, i, lookback);
    if (!sw) continue;
    const bull = series.closes[i]! > sw.hi && series.closes[i - 1]! <= sw.hi;
    const bear = series.closes[i]! < sw.lo && series.closes[i - 1]! >= sw.lo;
    if (sideWant === 'buy' && bull) flags[i] = 1;
    else if (sideWant === 'sell' && bear) flags[i] = 1;
    else if (sideWant === null && (bull || bear)) flags[i] = 1;
  }

  return { flags, side: sideWant, label: 'BOS' };
}

/** Precompute condition flags for every leaf piece. */
export function evalAllConditions(
  pieces: CompiledPiece[],
  series: BarSeries,
): Map<string, ConditionEval> {
  const out = new Map<string, ConditionEval>();
  for (const p of pieces) {
    switch (p.kind) {
      case 'sma_cross':
        out.set(p.id, evalSmaCross(series, p.params));
        break;
      case 'donchian_break':
        out.set(p.id, evalDonchian(series, p.params));
        break;
      case 'rsi_gate':
        out.set(p.id, evalRsiGate(series, p.params));
        break;
      case 'candle_confirm':
        out.set(p.id, evalCandleConfirm(series, p.params));
        break;
      case 'session_range_break':
        out.set(p.id, evalSessionRangeBreak(series, p.params));
        break;
      case 'fvg':
        out.set(p.id, evalFvg(series, p.params));
        break;
      case 'ifvg':
        out.set(p.id, evalIfvg(series, p.params));
        break;
      case 'ote_touch':
        out.set(p.id, evalOteTouch(series, p.params));
        break;
      case 'bos_choch':
        out.set(p.id, evalBosChoch(series, p.params));
        break;
      default:
        // logic pieces handled in runGraph
        break;
    }
    // Prefer user label on the node
    const ev = out.get(p.id);
    if (ev && p.label) {
      out.set(p.id, { ...ev, label: p.label });
    }
  }
  return out;
}
