/**
 * Intrabar fill resolution (§4). Pure — no clock, no React.
 *
 * Bid/ask convention: stored bars are BID. ask = bid + spread.
 * Limits get the better of level and open; stops get the worse.
 */

import { roundToTick, type InstrumentSpec } from './instrumentSpec';
import type { OrderSide } from './orderTypes';
import type { ChartBar } from '@/types/bar';

export type FillKind =
  | 'BUY_MARKET'
  | 'SELL_MARKET'
  | 'BUY_LIMIT'
  | 'SELL_LIMIT'
  | 'BUY_STOP'
  | 'SELL_STOP'
  | 'LONG_TP'
  | 'LONG_SL'
  | 'SHORT_TP'
  | 'SHORT_SL';

export interface FillResult {
  triggered: boolean;
  fillPrice?: number;
}

export type PathPoint = 'O' | 'H' | 'L' | 'C';

/**
 * Standard path heuristic for non-conflicting single-level triggers:
 * - Bullish (c ≥ o): O → L → H → C
 * - Bearish (c < o): O → H → L → C
 * Not configurable in v1.
 */
export function orderEventsInBarPath(bar: ChartBar): PathPoint[] {
  if (bar.close >= bar.open) return ['O', 'L', 'H', 'C'];
  return ['O', 'H', 'L', 'C'];
}

export function bidAsk(bar: ChartBar, spread: number): { bid: number; ask: number } {
  return { bid: bar.close, ask: bar.close + spread };
}

export function evaluateFill(
  kind: FillKind,
  level: number,
  bar: ChartBar,
  spread: number,
  spec: InstrumentSpec,
): FillResult {
  const s = Math.max(0, spread);
  const o = bar.open;
  const h = bar.high;
  const l = bar.low;
  const askOpen = o + s;

  switch (kind) {
    case 'BUY_MARKET':
      return { triggered: true, fillPrice: roundToTick(askOpen, spec) };
    case 'SELL_MARKET':
      return { triggered: true, fillPrice: roundToTick(o, spec) };

    case 'BUY_LIMIT': {
      // Triggers when l ≤ L − s; fill min(L, o+s)
      if (l > level - s) return { triggered: false };
      return { triggered: true, fillPrice: roundToTick(Math.min(level, askOpen), spec) };
    }
    case 'SELL_LIMIT': {
      // h ≥ L; fill max(L, o)
      if (h < level) return { triggered: false };
      return { triggered: true, fillPrice: roundToTick(Math.max(level, o), spec) };
    }
    case 'BUY_STOP': {
      // h ≥ P − s; fill max(P, o+s)
      if (h < level - s) return { triggered: false };
      return { triggered: true, fillPrice: roundToTick(Math.max(level, askOpen), spec) };
    }
    case 'SELL_STOP': {
      // l ≤ P; fill min(P, o)
      if (l > level) return { triggered: false };
      return { triggered: true, fillPrice: roundToTick(Math.min(level, o), spec) };
    }
    case 'LONG_TP': {
      // h ≥ P; fill max(P, o)
      if (h < level) return { triggered: false };
      return { triggered: true, fillPrice: roundToTick(Math.max(level, o), spec) };
    }
    case 'LONG_SL': {
      // l ≤ P; fill min(P, o)
      if (l > level) return { triggered: false };
      return { triggered: true, fillPrice: roundToTick(Math.min(level, o), spec) };
    }
    case 'SHORT_TP': {
      // l ≤ P − s; fill min(P, o+s)
      if (l > level - s) return { triggered: false };
      return { triggered: true, fillPrice: roundToTick(Math.min(level, askOpen), spec) };
    }
    case 'SHORT_SL': {
      // h ≥ P − s; fill max(P, o+s)
      if (h < level - s) return { triggered: false };
      return { triggered: true, fillPrice: roundToTick(Math.max(level, askOpen), spec) };
    }
    default:
      return { triggered: false };
  }
}

export interface AmbiguousProtectiveInput {
  side: OrderSide;
  stopLoss: number;
  takeProfit: number;
  bar: ChartBar;
  spread: number;
  spec: InstrumentSpec;
}

export interface AmbiguousProtectiveResult {
  winner: 'stopLoss' | 'takeProfit' | null;
  ambiguous: boolean;
  fillPrice?: number;
}

/**
 * When both SL and TP lie inside the same bar's range: SL always fills (§4.4).
 * Pessimistic and the only defensible choice given unknown intrabar path.
 */
export function resolveAmbiguousProtective(
  input: AmbiguousProtectiveInput,
): AmbiguousProtectiveResult {
  const { side, stopLoss, takeProfit, bar, spread, spec } = input;
  const slKind: FillKind = side === 'BUY' ? 'LONG_SL' : 'SHORT_SL';
  const tpKind: FillKind = side === 'BUY' ? 'LONG_TP' : 'SHORT_TP';
  const sl = evaluateFill(slKind, stopLoss, bar, spread, spec);
  const tp = evaluateFill(tpKind, takeProfit, bar, spread, spec);

  if (sl.triggered && tp.triggered) {
    return {
      winner: 'stopLoss',
      ambiguous: true,
      fillPrice: sl.fillPrice,
    };
  }
  if (sl.triggered) {
    return { winner: 'stopLoss', ambiguous: false, fillPrice: sl.fillPrice };
  }
  if (tp.triggered) {
    return { winner: 'takeProfit', ambiguous: false, fillPrice: tp.fillPrice };
  }
  return { winner: null, ambiguous: false };
}

/** Map a working order to a FillKind for evaluation. */
export function fillKindForOrder(
  side: OrderSide,
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TRAILING_STOP',
  role?: 'entry' | 'stopLoss' | 'takeProfit' | 'stop',
): FillKind | null {
  if (role === 'stopLoss') return side === 'BUY' ? 'LONG_SL' : 'SHORT_SL';
  if (role === 'takeProfit') return side === 'BUY' ? 'LONG_TP' : 'SHORT_TP';

  if (type === 'MARKET') return side === 'BUY' ? 'BUY_MARKET' : 'SELL_MARKET';
  if (type === 'LIMIT') return side === 'BUY' ? 'BUY_LIMIT' : 'SELL_LIMIT';
  if (type === 'STOP' || type === 'TRAILING_STOP') {
    return side === 'BUY' ? 'BUY_STOP' : 'SELL_STOP';
  }
  // STOP_LIMIT: stop leg uses stop rules; limit leg handled after trigger.
  if (type === 'STOP_LIMIT') return side === 'BUY' ? 'BUY_STOP' : 'SELL_STOP';
  return null;
}

/**
 * Slippage against the trader on market/stop fills (§4.7).
 * Limit fills get zero slippage.
 */
export function applySlippage(
  side: OrderSide,
  price: number,
  isLimit: boolean,
  spec: InstrumentSpec,
  volatilityFactor: number,
): number {
  if (isLimit) return price;
  const slip =
    spec.baseSlippage + volatilityFactor * spec.slippagePerAtr;
  if (slip <= 0) return price;
  // Against the trader: buys pay more, sells receive less.
  const signed = side === 'BUY' ? slip : -slip;
  return roundToTick(price + signed, spec);
}

/** Resolve spread with loud DEV warning when falling back to 0. */
export function resolveSpread(
  barSpread: number | undefined,
  spec: InstrumentSpec,
): number {
  if (barSpread != null && Number.isFinite(barSpread) && barSpread >= 0) {
    return barSpread;
  }
  if (spec.typicalSpread > 0) return spec.typicalSpread;
  // Loud fallback: a zero-spread backtest is a fantasy.
  console.warn(
    `[orders] zero spread for ${spec.symbol} — backtest will be unrealistically optimistic`,
  );
  return 0;
}
