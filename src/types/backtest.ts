import type { OrderSide } from '@/types/order';
import type { Timeframe } from '@/types/ui';
import type { CompiledGraph } from '@/strategy/graphTypes';

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

export type BacktestStrategyId = 'sma_cross' | 'donchian_breakout' | 'graph';

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

export type AutomationDirection = 'both' | 'long' | 'short';

/** Extra gates + exits applied on top of the base strategy signals. */
export interface AutomationRules {
  direction: AutomationDirection;
  rsiEnabled: boolean;
  rsiPeriod: number;
  /** Long only when RSI ≤ this. */
  rsiLongBelow: number;
  /** Short only when RSI ≥ this. */
  rsiShortAbove: number;
  /** Require close above/below trend SMA for long/short. */
  trendFilter: boolean;
  /** Bars to wait after a flat exit before next entry. */
  cooldownBars: number;
  /** Adverse move from entry as fraction (0 = off). */
  stopLossPct: number;
  /** Favorable move from entry as fraction (0 = off). */
  takeProfitPct: number;
}

export interface BacktestParams {
  strategyId: BacktestStrategyId;
  sma: SmaCrossParams;
  donchian: DonchianBreakoutParams;
  costs: BacktestCostParams;
  rules: AutomationRules;
  /** Puzzle graph when strategyId === 'graph'. */
  graph?: CompiledGraph | null;
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

export const DEFAULT_AUTOMATION_RULES: AutomationRules = {
  direction: 'both',
  rsiEnabled: false,
  rsiPeriod: 14,
  rsiLongBelow: 35,
  rsiShortAbove: 65,
  trendFilter: false,
  cooldownBars: 0,
  stopLossPct: 0,
  takeProfitPct: 0,
};

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  strategyId: 'sma_cross',
  sma: { fastPeriod: 10, slowPeriod: 30 },
  donchian: { period: 20 },
  costs: { slippage: 0, spread: 0 },
  rules: { ...DEFAULT_AUTOMATION_RULES },
  graph: null,
};

export const BACKTEST_STRATEGY_LABELS: Record<BacktestStrategyId, string> = {
  sma_cross: 'SMA cross',
  donchian_breakout: 'Donchian breakout',
  graph: 'Puzzle strategy',
};

function normalizeRules(
  raw: Partial<AutomationRules> | null | undefined,
): AutomationRules {
  const base = DEFAULT_AUTOMATION_RULES;
  if (!raw || typeof raw !== 'object') return { ...base };
  const dir = raw.direction;
  return {
    direction: dir === 'long' || dir === 'short' || dir === 'both' ? dir : base.direction,
    rsiEnabled: Boolean(raw.rsiEnabled),
    rsiPeriod: Math.max(2, Number(raw.rsiPeriod) || base.rsiPeriod),
    rsiLongBelow: Number(raw.rsiLongBelow) || base.rsiLongBelow,
    rsiShortAbove: Number(raw.rsiShortAbove) || base.rsiShortAbove,
    trendFilter: Boolean(raw.trendFilter),
    cooldownBars: Math.max(0, Math.floor(Number(raw.cooldownBars) || 0)),
    stopLossPct: Math.max(0, Number(raw.stopLossPct) || 0),
    takeProfitPct: Math.max(0, Number(raw.takeProfitPct) || 0),
  };
}

/** Normalize older saved params that may lack `donchian` / `rules`. */
export function normalizeBacktestParams(
  raw: Partial<BacktestParams> | null | undefined,
): BacktestParams {
  const base = DEFAULT_BACKTEST_PARAMS;
  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      sma: { ...base.sma },
      donchian: { ...base.donchian },
      costs: { ...base.costs },
      rules: { ...base.rules },
    };
  }
  const strategyId: BacktestStrategyId =
    raw.strategyId === 'donchian_breakout'
      ? 'donchian_breakout'
      : raw.strategyId === 'graph'
        ? 'graph'
        : 'sma_cross';
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
    rules: normalizeRules(raw.rules),
    graph:
      strategyId === 'graph' && raw.graph && typeof raw.graph === 'object'
        ? raw.graph
        : null,
  };
}
