/**
 * Analytics dashboard types — ClosedTrade + columnar TradeStore (§2).
 */

export type TradeSide = 'LONG' | 'SHORT';

export type ExitReason = 'TP' | 'SL' | 'MANUAL' | 'STOP_OUT' | 'TRAILING';

export const EXIT_REASON_INDEX: Record<ExitReason, number> = {
  TP: 0,
  SL: 1,
  MANUAL: 2,
  STOP_OUT: 3,
  TRAILING: 4,
};

export const EXIT_REASON_LABEL: ExitReason[] = [
  'TP',
  'SL',
  'MANUAL',
  'STOP_OUT',
  'TRAILING',
];

/** One closed position — journal / engine projection. */
export interface ClosedTrade {
  id: string;
  symbol: string;
  side: TradeSide;
  openTime: number;
  closeTime: number;
  entryPrice: number;
  exitPrice: number;
  size: number;
  initialStopPrice: number | null;
  initialTargetPrice: number | null;
  grossPnl: number;
  commission: number;
  swap: number;
  netPnl: number;
  rMultiple: number | null;
  mfePrice: number;
  maePrice: number;
  exitReason: ExitReason;
  ambiguousFill: boolean;
  pnlApproximate: boolean;
  tags: string[];
  balanceAfter: number;
  /** Risk as fraction of equity at entry; null if no stop. */
  riskPct: number | null;
  /** Fill-bar extremes for entry efficiency; null if unknown. */
  entryBarHigh: number | null;
  entryBarLow: number | null;
}

/**
 * Struct-of-arrays store. Built once; filters are bitmasks over indices.
 * Money / R / times are Float64; enums packed into Uint8/16.
 */
export interface TradeStore {
  n: number;
  openTime: Float64Array;
  closeTime: Float64Array;
  /** Prices as Float32 to stay under the 10 MB / 100k budget (§8). */
  entryPrice: Float32Array;
  exitPrice: Float32Array;
  initialStop: Float32Array; // NaN if null
  netPnl: Float64Array;
  grossPnl: Float64Array;
  commission: Float64Array;
  swap: Float64Array;
  rMultiple: Float64Array;
  mfe: Float32Array;
  mae: Float32Array;
  balanceAfter: Float64Array;
  /** Duration derived at accumulate from close−open; not stored (memory). */
  riskPct: Float32Array; // NaN if null
  entryBarHigh: Float32Array; // NaN if null
  entryBarLow: Float32Array; // NaN if null
  side: Uint8Array;
  exitReason: Uint8Array;
  /** bit0 ambiguous, bit1 pnlApproximate */
  flags: Uint8Array;
  symbolId: Uint16Array;
  tagBits: Uint32Array;
  ids: string[];
  symbols: string[];
  tags: string[];
  /** Account currency for display. */
  accountCurrency: string;
  initialBalance: number;
  version: number;
}

export interface FilterState {
  fromTime: number | null;
  toTime: number | null;
  sides: { long: boolean; short: boolean };
  symbols: Set<string> | null;
  tags: Set<string> | null;
  exitReasons: Set<ExitReason> | null;
  hideAmbiguous: boolean;
  hideApproximate: boolean;
}

export interface MetricResult {
  id: number;
  key: string;
  value: number | null;
  n: number;
  minSampleSize: number;
  lowSample: boolean;
  unit?: string;
  infinite?: boolean;
}

export interface AccumulatorResult {
  n: number;
  sums: {
    netPnl: number;
    grossProfit: number;
    grossLoss: number;
    commission: number;
    swap: number;
    r: number;
    rCount: number;
    duration: number;
    durationWin: number;
    durationLoss: number;
    mfeR: number;
    maeR: number;
    efficiency: number;
    efficiencyCount: number;
    maeWinnersR: number;
    maeWinnersCount: number;
    entryEfficiency: number;
    entryEfficiencyCount: number;
  };
  counts: {
    wins: number;
    losses: number;
    breakeven: number;
    long: number;
    short: number;
    longWins: number;
    shortWins: number;
    exitReason: number[];
    ambiguous: number;
    approximate: number;
    oversize: number;
    riskN: number;
  };
  behavior: {
    /** Win rate on trade immediately after a loss (null if none). */
    postLossWinRate: number | null;
    postLossAvgRisk: number | null;
    baselineWinRate: number | null;
    baselineAvgRisk: number | null;
    postLossN: number;
  };
  riskMoments: { mean: number; m2: number; n: number };
  extremes: {
    maxPnl: number;
    minPnl: number;
    maxDuration: number;
    minDuration: number;
  };
  rMoments: { mean: number; m2: number; m3: number; m4: number; n: number };
  streaks: {
    maxWin: number;
    maxLoss: number;
    sumWinRuns: number;
    winRunCount: number;
    sumLossRuns: number;
    lossRunCount: number;
    current: number;
  };
  equity: {
    finalBalance: number;
    maxDd: number;
    maxDdPct: number;
    maxDdDurationSec: number;
    currentDdPct: number;
    avgDd: number;
    ddEpisodes: number;
    timeInDdSec: number;
    totalSpanSec: number;
    maxRunUp: number;
    recoverySec: number | null;
    longestFlatSec: number;
    curveTime: Float64Array;
    curveEquity: Float64Array;
    curveDdPct: Float64Array;
  };
  daily: {
    days: number;
    meanRet: number;
    m2Ret: number;
    m2Down: number;
    nDown: number;
    winDays: number;
    bestDay: number;
    worstDay: number;
    dayPnl: Float64Array;
    dayTime: Float64Array;
  };
  buckets: {
    hour: BucketAgg[];
    weekday: BucketAgg[];
    session: BucketAgg[];
    month: Map<string, BucketAgg>;
    symbol: Map<number, BucketAgg>;
    tag: Map<number, BucketAgg>;
  };
  /** Sorted indices of selected trades (for list / export). */
  selectedIndex: Uint32Array;
}

export interface BucketAgg {
  n: number;
  wins: number;
  netPnl: number;
  sumR: number;
  rCount: number;
}

export const EMPTY_FILTER: FilterState = {
  fromTime: null,
  toTime: null,
  sides: { long: true, short: true },
  symbols: null,
  tags: null,
  exitReasons: null,
  hideAmbiguous: false,
  hideApproximate: false,
};
