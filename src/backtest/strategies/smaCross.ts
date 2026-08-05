/**
 * SMA crossover — emits flip signals; automation engine applies rules.
 * Worker-only.
 */
import { computeSma } from '@/indicators/smaEma';
import { runAutomation, type RawFlipSignal } from '@/backtest/automationEngine';
import type {
  AutomationRules,
  BacktestCostParams,
  BacktestEvent,
  BacktestTrade,
  EquityPoint,
  SmaCrossParams,
} from '@/types/backtest';

export interface SmaCrossInput {
  times: Float64Array;
  highs: Float32Array;
  lows: Float32Array;
  closes: Float32Array;
  sma: SmaCrossParams;
  costs: BacktestCostParams;
  rules: AutomationRules;
}

export interface SmaCrossOutput {
  trades: BacktestTrade[];
  events: BacktestEvent[];
  equity: EquityPoint[];
  finalEquity: number;
  totalPnl: number;
}

export function runSmaCross(input: SmaCrossInput): SmaCrossOutput {
  const { times, highs, lows, closes, sma, costs, rules } = input;
  const n = closes.length;
  const fastN = Math.floor(sma.fastPeriod);
  const slowN = Math.floor(sma.slowPeriod);

  if (n === 0 || fastN < 1 || slowN <= fastN) {
    return { trades: [], events: [], equity: [], finalEquity: 1, totalPnl: 0 };
  }

  const fast = computeSma(closes, fastN);
  const slow = computeSma(closes, slowN);
  const signals: RawFlipSignal[] = [];

  for (let i = 1; i < n; i++) {
    const f0 = fast[i - 1]!;
    const s0 = slow[i - 1]!;
    const f1 = fast[i]!;
    const s1 = slow[i]!;
    if (!Number.isFinite(f0) || !Number.isFinite(s0) || !Number.isFinite(f1) || !Number.isFinite(s1)) {
      continue;
    }
    if (f0 <= s0 && f1 > s1) {
      signals.push({
        i,
        side: 'buy',
        label: `SMA${fastN} crossed above SMA${slowN}`,
      });
    } else if (f0 >= s0 && f1 < s1) {
      signals.push({
        i,
        side: 'sell',
        label: `SMA${fastN} crossed below SMA${slowN}`,
      });
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
    trendPeriod: slowN,
  });
}
