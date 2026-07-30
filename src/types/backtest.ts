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
}

/** Sparse equity sample (time + equity index, start = 1). */
export interface EquityPoint {
  time: number;
  equity: number;
}

export type BacktestStrategyId = 'sma_cross';

export interface SmaCrossParams {
  fastPeriod: number;
  slowPeriod: number;
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
  costs: BacktestCostParams;
}

export type BacktestStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error';

/** Session-scoped result kept outside the chart engine. */
export interface BacktestResult {
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
  costs: { slippage: 0, spread: 0 },
};
