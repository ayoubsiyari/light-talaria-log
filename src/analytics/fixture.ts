import { mulberry32 } from './math/rng';
import type { ClosedTrade, ExitReason } from './types';

const SYMBOLS = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'XAUUSD'] as const;
const TAGS = ['breakout', 'pullback', 'news', 'scalp', 'swing'] as const;
const EXITS: ExitReason[] = ['TP', 'SL', 'MANUAL', 'STOP_OUT', 'TRAILING'];

export interface FixtureOptions {
  n: number;
  seed?: number;
  startBalance?: number;
  startTime?: number;
}

/**
 * Deterministic synthetic closed-trade log for benchmarks / tests.
 * Slight positive expectancy so equity trends up with drawdowns.
 */
export function generateSyntheticTrades(opts: FixtureOptions): ClosedTrade[] {
  const n = opts.n;
  const rng = mulberry32(opts.seed ?? 0x4a1a_71c5);
  const startBalance = opts.startBalance ?? 10_000;
  let t0 = opts.startTime ?? 1_700_000_000; // ~2023-11
  let balance = startBalance;
  const out: ClosedTrade[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const symbol = SYMBOLS[(rng() * SYMBOLS.length) | 0]!;
    const long = rng() > 0.45;
    const hold = 60 + Math.floor(rng() * 86_400); // 1m–1d
    const openTime = t0;
    const closeTime = t0 + hold;
    t0 = closeTime + Math.floor(rng() * 300);

    const entry =
      symbol === 'USDJPY'
        ? 140 + rng() * 20
        : symbol === 'XAUUSD'
          ? 1900 + rng() * 200
          : 1 + rng() * 0.5;

    // Edge: ~52% win rate, payoff ~1.1
    const win = rng() < 0.52;
    const r = win ? 0.4 + rng() * 2.2 : -(0.5 + rng() * 1.5);
    const stopDist = entry * 0.0015;
    const dir = long ? 1 : -1;
    const exitPrice = entry + dir * r * stopDist;
    const initialStop = entry - dir * stopDist;
    const initialTarget = entry + dir * 2 * stopDist;
    const mfePrice = win
      ? entry + dir * Math.abs(r) * stopDist * (1.05 + rng() * 0.4)
      : entry + dir * stopDist * rng() * 0.5;
    const maePrice = win
      ? entry - dir * stopDist * rng() * 0.9
      : entry - dir * Math.abs(r) * stopDist * (0.9 + rng() * 0.3);

    const notional = 100_000 * 0.1;
    const gross =
      symbol.includes('JPY')
        ? ((exitPrice - entry) * dir * notional) / exitPrice
        : (exitPrice - entry) * dir * notional;
    const commission = 2 + rng() * 2;
    const swap = (rng() - 0.5) * 0.5;
    const netPnl = gross - commission + swap;
    balance += netPnl;

    const exitReason = EXITS[(rng() * EXITS.length) | 0]!;
    const tagCount = (rng() * 3) | 0;
    const tags: string[] = [];
    for (let k = 0; k < tagCount; k++) {
      const tag = TAGS[(rng() * TAGS.length) | 0]!;
      if (!tags.includes(tag)) tags.push(tag);
    }

    out[i] = {
      id: `syn-${i}`,
      symbol,
      side: long ? 'LONG' : 'SHORT',
      openTime,
      closeTime,
      entryPrice: entry,
      exitPrice,
      size: 0.1,
      initialStopPrice: initialStop,
      initialTargetPrice: initialTarget,
      grossPnl: gross,
      commission,
      swap,
      netPnl,
      rMultiple: r,
      mfePrice,
      maePrice,
      exitReason,
      ambiguousFill: rng() < 0.03,
      pnlApproximate: symbol === 'XAUUSD' && rng() < 0.1,
      tags,
      balanceAfter: balance,
      riskPct: 0.005 + rng() * 0.015,
      entryBarHigh: Math.max(entry, exitPrice, mfePrice) + stopDist * 0.1,
      entryBarLow: Math.min(entry, exitPrice, maePrice) - stopDist * 0.1,
    };
  }
  return out;
}

/** Tiny hand-checked fixture for metric unit tests (20 trades). */
export function handFixture20(): ClosedTrade[] {
  // 12 wins @ +100, 8 losses @ -80 → net 1200-640=560, PF=1200/640=1.875, WR=60%
  const trades: ClosedTrade[] = [];
  let bal = 10_000;
  let t = 1_700_000_000;
  for (let i = 0; i < 20; i++) {
    const win = i < 12;
    const net = win ? 100 : -80;
    const gross = net + 5;
    bal += net;
    const open = t;
    t += 3600;
    const close = t;
    t += 600;
    trades.push({
      id: `h${i}`,
      symbol: 'EURUSD',
      side: i % 2 === 0 ? 'LONG' : 'SHORT',
      openTime: open,
      closeTime: close,
      entryPrice: 1.1,
      exitPrice: win ? 1.101 : 1.0992,
      size: 0.1,
      initialStopPrice: 1.099,
      initialTargetPrice: 1.102,
      grossPnl: gross,
      commission: 5,
      swap: 0,
      netPnl: net,
      rMultiple: win ? 1 : -0.8,
      mfePrice: win ? 1.1015 : 1.1002,
      maePrice: win ? 1.0995 : 1.099,
      exitReason: win ? 'TP' : 'SL',
      ambiguousFill: false,
      pnlApproximate: false,
      tags: i < 5 ? ['breakout'] : ['pullback'],
      balanceAfter: bal,
      riskPct: 0.01,
      entryBarHigh: 1.1005,
      entryBarLow: 1.0995,
    });
  }
  return trades;
}
