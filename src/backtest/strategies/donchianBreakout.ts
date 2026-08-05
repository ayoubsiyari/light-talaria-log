/**
 * Donchian breakout — emits flip signals; automation engine applies rules.
 * Worker-only.
 */
import { runAutomation, type RawFlipSignal } from '@/backtest/automationEngine';
import type {
  AutomationRules,
  BacktestCostParams,
  BacktestEvent,
  BacktestTrade,
  DonchianBreakoutParams,
  EquityPoint,
} from '@/types/backtest';

export interface DonchianInput {
  times: Float64Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  donchian: DonchianBreakoutParams;
  costs: BacktestCostParams;
  rules: AutomationRules;
}

export interface DonchianOutput {
  trades: BacktestTrade[];
  events: BacktestEvent[];
  equity: EquityPoint[];
  finalEquity: number;
  totalPnl: number;
}

function channelAt(
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

export function runDonchianBreakout(input: DonchianInput): DonchianOutput {
  const { times, highs, lows, closes, donchian, costs, rules } = input;
  const n = closes.length;
  const period = Math.floor(donchian.period);

  if (n === 0 || period < 2) {
    return { trades: [], events: [], equity: [], finalEquity: 1, totalPnl: 0 };
  }

  const signals: RawFlipSignal[] = [];
  for (let i = 1; i < n; i++) {
    const ch = channelAt(highs, lows, i, period);
    if (!ch) continue;
    const hi = highs[i]!;
    const lo = lows[i]!;
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) continue;
    if (hi > ch.hi) {
      signals.push({ i, side: 'buy', label: `Broke ${period}-bar high` });
    } else if (lo < ch.lo) {
      signals.push({ i, side: 'sell', label: `Broke ${period}-bar low` });
    }
  }

  return runAutomation({
    times,
    highs,
    lows,
    closes,
    signals,
    costs,
    rules,
    trendPeriod: period,
  });
}
