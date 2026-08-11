import type { Timeframe } from '@/types/ui';

/**
 * Instrument id — FX (`EUR/USD`) or futures root (`ES`, `NQ1`, …).
 * Open string so remote FirstRate / API catalogs are not truncated.
 */
export type PairSymbol = string;

/** Dukascopy download presets (FX). Server catalogs may include more. */
export const PAIR_OPTIONS: { id: PairSymbol; label: string }[] = [
  { id: 'EUR/USD', label: 'EUR/USD' },
  { id: 'GBP/USD', label: 'GBP/USD' },
  { id: 'USD/JPY', label: 'USD/JPY' },
  { id: 'USD/CHF', label: 'USD/CHF' },
  { id: 'AUD/USD', label: 'AUD/USD' },
  { id: 'USD/CAD', label: 'USD/CAD' },
  { id: 'NZD/USD', label: 'NZD/USD' },
  { id: 'EUR/JPY', label: 'EUR/JPY' },
  { id: 'GBP/JPY', label: 'GBP/JPY' },
  { id: 'XAU/USD', label: 'XAU/USD (Gold)' },
];

export const TIMEFRAME_OPTIONS: { id: Timeframe; label: string }[] = [
  { id: '1m', label: '1 Minute' },
  { id: '5m', label: '5 Minutes' },
  { id: '15m', label: '15 Minutes' },
  { id: '1h', label: '1 Hour' },
  { id: '4h', label: '4 Hours' },
  { id: '1D', label: '1 Day' },
];

/** One pair + dataset in a (possibly multi-pair) session. */
export interface SessionLeg {
  pair: PairSymbol;
  datasetId: string;
}

/** Backtest session config — supports one or more pairs sharing an overlap date window. */
export interface BacktestSession {
  id: string;
  name: string;
  /** Primary pair (first leg) — kept for older UI / labels. */
  pair: PairSymbol;
  /** Chart ticker / bar timeframe at session create. */
  timeframe: Timeframe;
  /**
   * Last explicit TopBar timeframe pick. Restored on reload so refresh resumes
   * on 5m/1h/… even when create TF was different. Falls back to `timeframe`.
   */
  selectedTf?: Timeframe;
  /** ISO date YYYY-MM-DD (UTC day) — session window inside overlap */
  startDate: string;
  /** ISO date YYYY-MM-DD (UTC day) */
  endDate: string;
  /** Primary dataset (first leg). */
  datasetId: string;
  /** All pairs in this session (length ≥ 1). */
  legs: SessionLeg[];
  createdAt: number;
  /**
   * Last replay cursor (unix seconds). Restored when reopening the session
   * so refresh / exit → reopen continues from the last candle.
   */
  cursorTime?: number;
  /** Last bar-count zoom (session.span). Optional camera restore. */
  span?: number;
  /** Starting account balance for the order engine (USD). */
  startingBalance?: number;
  /** Linked strategy from the strategy bank (optional). */
  strategyId?: string;
  strategyName?: string;
  /** Free-form notes for this run. */
  description?: string;
}

export interface CreateSessionInput {
  name: string;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  legs: SessionLeg[];
  startingBalance?: number;
  strategyId?: string;
  strategyName?: string;
  description?: string;
}

export function sessionPairs(session: BacktestSession): PairSymbol[] {
  return session.legs.map((l) => l.pair);
}
