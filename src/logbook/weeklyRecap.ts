import { computeLogbookStats } from './logbookStats';
import { filterByPeriod } from './period';
import type { LogbookTrade } from './types';

export interface WeeklyRecap {
  closedCount: number;
  netPnl: number;
  winRate: number | null;
  ruleBreakRate: number | null;
  worked: string | null;
  drop: string | null;
}

export function weeklyRecap(
  trades: readonly LogbookTrade[],
  nowSec: number = Math.floor(Date.now() / 1000),
): WeeklyRecap {
  const week = filterByPeriod(trades, 'week', nowSec);
  const stats = computeLogbookStats(week, 'all', nowSec);
  const ruleN = stats.ruleFollowedCount + stats.ruleBrokenCount;
  const best = stats.bySetup.find((r) => (r.expectancy ?? 0) > 0 && r.count >= 2)
    ?? stats.byTag.find((r) => (r.expectancy ?? 0) > 0 && r.count >= 2);
  const worst = [...stats.bySetup, ...stats.byTag]
    .filter((r) => (r.expectancy ?? 0) < 0 && r.count >= 2)
    .sort((a, b) => (a.expectancy ?? 0) - (b.expectancy ?? 0))[0];
  return {
    closedCount: stats.closedCount,
    netPnl: stats.netPnl,
    winRate: stats.winRate,
    ruleBreakRate: ruleN > 0 ? stats.ruleBrokenCount / ruleN : null,
    worked: best ? `${best.key} (${best.count} tickets)` : null,
    drop: worst ? `${worst.key} (${worst.count} tickets)` : null,
  };
}
