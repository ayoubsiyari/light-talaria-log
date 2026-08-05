import type { OrderSide } from '@/types/order';
import type { Timeframe } from '@/types/ui';

/** Closed trade from a strategy run (outside chart engine). */
export interface BacktestTrade {
  id: string;
  side: OrderSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  /** Absolute PnL in price units (exit − entry for buy, inverse for sell). */
  pnl: number;
  /** Return fraction relative to entry price. */
  pnlPct: number;
  /** Why the entry fired (user-facing). */
  entryReason?: string;
  /** Why the exit fired (user-facing). */
  exitReason?: string;
}

/** Sparse chart mark for a strategy condition (entry / exit / signal). */
export interface BacktestEvent {
  id: string;
  time: number;
  price: number;
  kind: 'entry' | 'exit' | 'signal';
  /** Short condition label drawn on the chart. */
  label: string;
  side?: OrderSide;
  /** Links to {@link BacktestTrade.id} when part of a closed trade. */
  tradeId?: string;
}

/** Sparse equity sample (time + equity index, start = 1). */
export interface EquityPoint {
  time: number;
  equity: number;
}

export type BacktestStrategyId = 'sma_cross' | 'donchian_breakout';

export interface SmaCrossParams {
  fastPeriod: number;
  slowPeriod: number;
}

/** Donchian channel breakout — enter on N-bar high break, exit on N-bar low break. */
export interface DonchianBreakoutParams {
  /** Lookback for channel high/low (entry/exit). */
  period: number;
}

/** Cost model hooks — v1 defaults to zero. */
export interface BacktestCostParams {
  /** Fraction of price (e.g. 0.0001 = 1 bp). */
  slippage: number;
  /** Absolute price units added to round-trip (half on each side). */
  spread: number;
}

export interface BacktestParams {
  strategyId: BacktestStrategyId;
  sma: SmaCrossParams;
  donchian: DonchianBreakoutParams;
  costs: BacktestCostParams;
}

export type BacktestStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

/** Session-scoped result kept outside the chart engine. */
export interface BacktestResult {
  /** Unique run id (multi-run journal). Older saves may omit. */
  runId?: string;
  sessionId: string;
  datasetId: string;
  timeframe: Timeframe;
  params: BacktestParams;
  /** Bars actually simulated (after cap / window). */
  barCount: number;
  /** True when series was truncated to MAX_BACKTEST_BARS. */
  truncated: boolean;
  timeStart: number;
  timeEnd: number;
  trades: BacktestTrade[];
  /** Condition marks for chart overlay (may be empty on older saves). */
  events: BacktestEvent[];
  equity: EquityPoint[];
  /** Final equity index (start = 1). */
  finalEquity: number;
  /** Sum of trade pnl (price units). */
  totalPnl: number;
  createdAt: number;
}

export interface BacktestWorkerRequest {
  type: 'run';
  requestId: number;
  times: Float64Array;
  opens: Float32Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  params: BacktestParams;
}

export type BacktestWorkerResponse =
  | {
      type: 'result';
      requestId: number;
      trades: BacktestTrade[];
      events: BacktestEvent[];
      equity: EquityPoint[];
      finalEquity: number;
      totalPnl: number;
    }
  | {
      type: 'error';
      requestId: number;
      message: string;
    };

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  strategyId: 'sma_cross',
  sma: { fastPeriod: 10, slowPeriod: 30 },
  donchian: { period: 20 },
  costs: { slippage: 0, spread: 0 },
};

export const BACKTEST_STRATEGY_LABELS: Record<BacktestStrategyId, string> = {
  sma_cross: 'SMA cross',
  donchian_breakout: 'Donchian breakout',
};

/** Normalize older saved params that may lack `donchian`. */
export function normalizeBacktestParams(
  raw: Partial<BacktestParams> | null | undefined,
): BacktestParams {
  const base = DEFAULT_BACKTEST_PARAMS;
  if (!raw || typeof raw !== 'object') return { ...base, sma: { ...base.sma }, donchian: { ...base.donchian }, costs: { ...base.costs } };
  const strategyId: BacktestStrategyId =
    raw.strategyId === 'donchian_breakout' ? 'donchian_breakout' : 'sma_cross';
  return {
    strategyId,
    sma: {
      fastPeriod: Number(raw.sma?.fastPeriod) || base.sma.fastPeriod,
      slowPeriod: Number(raw.sma?.slowPeriod) || base.sma.slowPeriod,
    },
    donchian: {
      period: Number(raw.donchian?.period) || base.donchian.period,
    },
    costs: {
      slippage: Number(raw.costs?.slippage) || 0,
      spread: Number(raw.costs?.spread) || 0,
    },
  };
}
