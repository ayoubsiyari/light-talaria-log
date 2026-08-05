/**
 * Shared helpers for puzzle condition evaluators (Worker-safe).
 */
import type { PieceParams } from '@/strategy/graphTypes';
import type { OrderSide } from '@/types/order';

export interface BarSeries {
  times: Float64Array;
  opens: Float32Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
}

export interface ConditionEval {
  flags: Uint8Array;
  /** 0 none, 1 buy, 2 sell */
  sides: Uint8Array;
  side: OrderSide | null;
  label: string;
}

export const BUY = 1;
export const SELL = 2;

export function empty(
  n: number,
  side: OrderSide | null,
  label: string,
): ConditionEval {
  return {
    flags: new Uint8Array(n),
    sides: new Uint8Array(n),
    side,
    label,
  };
}

export function num(params: PieceParams, key: string, fallback: number): number {
  const v = params[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function str(params: PieceParams, key: string, fallback: string): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}

export function sideFromParams(params: PieceParams): OrderSide | null {
  const s = str(params, 'side', 'either');
  if (s === 'buy' || s === 'sell') return s;
  return null;
}

export function mark(
  out: ConditionEval,
  i: number,
  bull: boolean,
  bear: boolean,
  sideWant: OrderSide | null,
): void {
  if (sideWant === 'buy' && bull) {
    out.flags[i] = 1;
    out.sides[i] = BUY;
  } else if (sideWant === 'sell' && bear) {
    out.flags[i] = 1;
    out.sides[i] = SELL;
  } else if (sideWant === null) {
    if (bull) {
      out.flags[i] = 1;
      out.sides[i] = BUY;
    } else if (bear) {
      out.flags[i] = 1;
      out.sides[i] = SELL;
    }
  }
}

export function channelPrior(
  highs: Float32Array,
  lows: Float32Array,
  i: number,
  period: number,
): { hi: number; lo: number } | null {
  if (i < period) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = i - period; j < i; j++) {
    hi = Math.max(hi, highs[j]!);
    lo = Math.min(lo, lows[j]!);
  }
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return { hi, lo };
}

export function utcDay(t: number): number {
  return Math.floor(t / 86400);
}

export function utcHour(t: number): number {
  return Math.floor(((t % 86400) + 86400) % 86400 / 3600);
}

export function utcDow(t: number): number {
  // 0 = Sunday UTC
  return new Date(t * 1000).getUTCDay();
}

export function trueRangeAt(h: number, l: number, prevClose: number): number {
  return Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
}

export function computeAtr(
  highs: Float32Array,
  lows: Float32Array,
  closes: Float32Array,
  period: number,
): Float32Array {
  const n = closes.length;
  const out = new Float32Array(n);
  out.fill(Number.NaN);
  if (n < period + 1 || period < 1) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += trueRangeAt(highs[i]!, lows[i]!, closes[i - 1]!);
  }
  out[period] = sum / period;
  for (let i = period + 1; i < n; i++) {
    const tr = trueRangeAt(highs[i]!, lows[i]!, closes[i - 1]!);
    out[i] = (out[i - 1]! * (period - 1) + tr) / period;
  }
  return out;
}

export function swingHighLow(
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

export function sideAt(ev: ConditionEval, i: number): OrderSide | null {
  const s = ev.sides[i]!;
  if (s === BUY) return 'buy';
  if (s === SELL) return 'sell';
  return ev.side;
}

export function body(o: number, c: number): number {
  return Math.abs(c - o);
}

export function range(h: number, l: number): number {
  return h - l;
}
