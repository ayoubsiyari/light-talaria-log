import { isWin } from './compute';
import { filterByPeriod, weekdayName } from './period';
import type {
  BreakdownRow,
  ClosePoint,
  EquityPoint,
  LogbookStats,
  LogbookTrade,
  StatsPeriod,
} from './types';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function closedOf(trades: readonly LogbookTrade[]): LogbookTrade[] {
  return trades
    .filter((t) => t.status === 'closed' && t.netPnl != null)
    .sort((a, b) => (a.closeTime ?? a.openTime) - (b.closeTime ?? b.openTime));
}

function rate(wins: number, n: number): number | null {
  return n > 0 ? wins / n : null;
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function buildBreakdown(
  closed: LogbookTrade[],
  keyOf: (t: LogbookTrade) => string | string[] | null,
): BreakdownRow[] {
  const totalLossAbs = closed.reduce((s, t) => {
    const p = t.netPnl ?? 0;
    return p < 0 ? s + Math.abs(p) : s;
  }, 0);
  const closedN = closed.length;
  const buckets = new Map<
    string,
    { trades: LogbookTrade[] }
  >();
  for (const t of closed) {
    const keys = keyOf(t);
    if (keys == null) continue;
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      const k = key.trim();
      if (!k) continue;
      const cur = buckets.get(k) ?? { trades: [] };
      cur.trades.push(t);
      buckets.set(k, cur);
    }
  }
  const rows: BreakdownRow[] = [];
  for (const [key, { trades }] of buckets) {
    const pnls = trades.map((t) => t.netPnl ?? 0);
    const rs = trades
      .map((t) => t.rMultiple)
      .filter((r): r is number => r != null);
    const wins = trades.filter((t) => isWin(t) === true).length;
    const losses = trades.filter((t) => isWin(t) === false).length;
    const netPnl = pnls.reduce((a, b) => a + b, 0);
    const lossAbs = trades.reduce((s, t) => {
      const p = t.netPnl ?? 0;
      return p < 0 ? s + Math.abs(p) : s;
    }, 0);
    rows.push({
      key,
      count: trades.length,
      wins,
      losses,
      netPnl,
      winRate: rate(wins, trades.length),
      expectancy: avg(pnls),
      avgR: avg(rs),
      lossShare: totalLossAbs > 0 ? lossAbs / totalLossAbs : 0,
      volumeShare: closedN > 0 ? trades.length / closedN : 0,
    });
  }
  return rows.sort((a, b) => (a.expectancy ?? 0) - (b.expectancy ?? 0) || a.netPnl - b.netPnl);
}

const SESSIONS = ['Asia', 'London', 'New York', 'Late'] as const;

function sessionOf(unix: number): (typeof SESSIONS)[number] {
  const h = new Date(unix * 1000).getHours();
  if (h < 7) return 'Asia';
  if (h < 12) return 'London';
  if (h < 17) return 'New York';
  return 'Late';
}

function maxDrawdownOf(equity: readonly EquityPoint[]): number {
  if (equity.length === 0) return 0;
  let peak = equity[0]!.equity;
  let dd = 0;
  for (const p of equity) {
    peak = Math.max(peak, p.equity);
    dd = Math.max(dd, peak - p.equity);
  }
  return dd;
}

function streakOf(closed: LogbookTrade[]): LogbookStats['streak'] {
  if (closed.length === 0) return { kind: 'none', length: 0 };
  let length = 0;
  let kind: 'win' | 'loss' | 'none' = 'none';
  for (let i = closed.length - 1; i >= 0; i--) {
    const w = isWin(closed[i]!);
    if (w == null) continue;
    const cur: 'win' | 'loss' = w ? 'win' : 'loss';
    if (kind === 'none') {
      kind = cur;
      length = 1;
      continue;
    }
    if (cur !== kind) break;
    length += 1;
  }
  return { kind, length };
}

export function computeLogbookStats(
  trades: readonly LogbookTrade[],
  period: StatsPeriod = 'all',
  nowSec: number = Math.floor(Date.now() / 1000),
): LogbookStats {
  const scoped = filterByPeriod(trades, period, nowSec);
  const closed = closedOf(scoped);
  const openCount = scoped.filter((t) => t.status === 'open').length;
  const pnls = closed.map((t) => t.netPnl ?? 0);
  const winsList = closed.filter((t) => isWin(t) === true);
  const lossList = closed.filter((t) => isWin(t) === false);
  const scratches = closed.filter((t) => (t.netPnl ?? 0) === 0).length;
  const winPnls = winsList.map((t) => t.netPnl ?? 0);
  const lossPnls = lossList.map((t) => t.netPnl ?? 0);
  const rs = closed
    .map((t) => t.rMultiple)
    .filter((r): r is number => r != null);
  const avgWin = avg(winPnls);
  const avgLoss = avg(lossPnls);
  const grossWin = winPnls.reduce((a, b) => a + b, 0);
  const grossLossAbs = lossPnls.reduce((a, b) => a + Math.abs(b), 0);
  let equityRun = 0;
  const equity: EquityPoint[] = closed.map((t) => {
    equityRun += t.netPnl ?? 0;
    return { time: t.closeTime ?? t.openTime, equity: equityRun };
  });

  const holds = closed
    .map((t) => (t.closeTime != null ? t.closeTime - t.openTime : null))
    .filter((s): s is number => s != null && s >= 0);
  const closes: ClosePoint[] = closed.slice(-16).map((t) => ({
    symbol: t.symbol,
    pnl: t.netPnl ?? 0,
    r: t.rMultiple,
    side: t.side,
  }));
  const lastTrade = closed[closed.length - 1];

  return {
    period,
    openCount,
    closedCount: closed.length,
    wins: winsList.length,
    losses: lossList.length,
    scratches,
    winRate: rate(winsList.length, closed.length),
    netPnl: pnls.reduce((a, b) => a + b, 0),
    avgPnl: avg(pnls),
    avgWin,
    avgLoss,
    payoff:
      avgWin != null && avgLoss != null && avgLoss !== 0
        ? Math.abs(avgWin / avgLoss)
        : null,
    profitFactor: grossLossAbs > 0 ? grossWin / grossLossAbs : null,
    expectancy: avg(pnls),
    avgR: avg(rs),
    bestR: rs.length ? Math.max(...rs) : null,
    worstR: rs.length ? Math.min(...rs) : null,
    streak: streakOf(closed),
    ruleFollowedCount: closed.filter((t) => t.rulesFollowed === true).length,
    ruleBrokenCount: closed.filter((t) => t.rulesFollowed === false).length,
    maxDrawdown: maxDrawdownOf(equity),
    avgHoldSec: avg(holds),
    equity,
    closes,
    bySetup: buildBreakdown(closed, (t) => t.setup),
    byTag: buildBreakdown(closed, (t) => t.tags),
    byWeekday: buildBreakdown(closed, (t) =>
      weekdayName(t.closeTime ?? t.openTime),
    ).sort(
      (a, b) => WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key),
    ),
    byEmotion: buildBreakdown(closed, (t) => t.emotion),
    bySide: buildBreakdown(closed, (t) => (t.side === 'long' ? 'Long' : 'Short')),
    bySession: buildBreakdown(closed, (t) =>
      sessionOf(t.closeTime ?? t.openTime),
    ).sort(
      (a, b) => SESSIONS.indexOf(a.key as (typeof SESSIONS)[number]) - SESSIONS.indexOf(b.key as (typeof SESSIONS)[number]),
    ),
    bestClose: pnls.length ? Math.max(...pnls) : null,
    peakEquity: equity.length ? Math.max(...equity.map((e) => e.equity)) : null,
    lastClose: lastTrade
      ? {
          symbol: lastTrade.symbol,
          pnl: lastTrade.netPnl ?? 0,
          r: lastTrade.rMultiple,
          side: lastTrade.side,
        }
      : null,
  };
}
