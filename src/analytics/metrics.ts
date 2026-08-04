import { METRIC_CATALOG } from './catalog';
import { welfordKurtosis, welfordSkew, welfordStd } from './math/welford';
import { riskOfRuinPercent } from './monteCarlo';
import type { AccumulatorResult, MetricResult, TradeStore } from './types';

function m(
  id: number,
  value: number | null,
  n: number,
  extra?: Partial<MetricResult>,
): MetricResult {
  const def = METRIC_CATALOG[id - 1]!;
  const min = def.minSampleSize;
  return {
    id,
    key: def.key,
    value,
    n,
    minSampleSize: min,
    lowSample: n < min,
    unit: def.unit,
    ...extra,
  };
}

function div(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

export interface DeriveOptions {
  riskFreeRate?: number;
  /** Seed for Monte Carlo (filter hash). */
  mcSeed?: number;
  /** Pre-extracted finite R values for MC (optional). */
  rSample?: Float64Array;
  requiredTagsMask?: number;
}

/** Derive all 88 metrics from one accumulator result (§6.2). */
export function deriveMetrics(
  acc: AccumulatorResult,
  store: TradeStore,
  opts: DeriveOptions = {},
): MetricResult[] {
  const N = acc.n;
  const W = acc.counts.wins;
  const L = acc.counts.losses;
  const net = acc.sums.netPnl;
  const gp = acc.sums.grossProfit;
  const gl = acc.sums.grossLoss; // negative
  const absGl = Math.abs(gl);
  const comm = acc.sums.commission;
  const swap = acc.sums.swap;
  const costs = comm + Math.abs(swap);
  const grossAll = gp + gl; // net of wins+losses before? use gp+gl
  const bal0 = store.initialBalance;
  const rf = opts.riskFreeRate ?? 0;

  const avgWin = W > 0 ? gp / W : null;
  const avgLoss = L > 0 ? absGl / L : null;
  const payoff = avgWin != null && avgLoss != null && avgLoss > 0 ? avgWin / avgLoss : null;
  const wr = N > 0 ? W / N : null;
  const meanR = acc.sums.rCount > 0 ? acc.sums.r / acc.sums.rCount : null;
  const sdR = welfordStd(acc.rMoments);
  const days = acc.daily.days;
  const ppy = days > 0 ? (days / Math.max(1, acc.equity.totalSpanSec / 86400)) * 365 : 252;
  // Use actual span for periods/year
  const spanDays = Math.max(1, acc.equity.totalSpanSec / 86400);
  const periodsPerYear = 365; // daily returns annualization
  void ppy;

  const sdDaily = days >= 2 ? Math.sqrt(acc.daily.m2Ret / (days - 1)) : 0;
  const downDev =
    acc.daily.nDown >= 2 ? Math.sqrt(acc.daily.m2Down / (acc.daily.nDown - 1)) : 0;
  const meanDaily = acc.daily.meanRet;

  const endBal = acc.equity.finalBalance;
  const cagr =
    spanDays >= 1 && bal0 > 0 && endBal > 0
      ? Math.pow(endBal / bal0, 365 / spanDays) - 1
      : null;

  // Ulcer from curve
  let ulcerSum = 0;
  const cn = acc.equity.curveDdPct.length;
  for (let i = 0; i < cn; i++) {
    const d = acc.equity.curveDdPct[i]!;
    ulcerSum += d * d;
  }
  const ulcer = cn > 0 ? Math.sqrt(ulcerSum / cn) : 0;

  const pf =
    L === 0 ? null : absGl > 0 ? gp / absGl : null;

  const kelly =
    wr != null && payoff != null && payoff > 0 ? wr - (1 - wr) / payoff : null;
  const optimalF =
    kelly == null ? null : Math.min(0.25, Math.max(0, kelly));

  const sqn =
    meanR != null && sdR > 0 && acc.sums.rCount > 0
      ? Math.sqrt(acc.sums.rCount) * meanR / sdR
      : null;

  const tradesForSig =
    meanR != null && meanR !== 0 && sdR > 0
      ? Math.pow((sdR * 1.96) / meanR, 2)
      : null;

  let riskOfRuin: number | null = null;
  if (opts.rSample && opts.rSample.length >= 50) {
    riskOfRuin = riskOfRuinPercent(opts.rSample, opts.mcSeed ?? 1);
  }

  // Monthly stats
  const months = [...acc.buckets.month.values()];
  const monthRets = months.map((b) => b.netPnl / bal0);
  let monthM2 = 0;
  let monthMean = 0;
  for (let i = 0; i < monthRets.length; i++) {
    const x = monthRets[i]!;
    const d = x - monthMean;
    monthMean += d / (i + 1);
    monthM2 += d * (x - monthMean);
  }
  const monthStd =
    monthRets.length >= 2 ? Math.sqrt(monthM2 / (monthRets.length - 1)) : null;
  const profitableMonths =
    months.length > 0
      ? (months.filter((b) => b.netPnl > 0).length / months.length) * 100
      : null;

  const out: MetricResult[] = [];
  out.push(m(1, net, N));
  out.push(m(2, gp, N));
  out.push(m(3, gl, N));
  out.push(m(4, pf, N, { infinite: L === 0 && gp > 0 }));
  out.push(m(5, bal0 > 0 ? (net / bal0) * 100 : null, N));
  out.push(m(6, comm, N));
  out.push(m(7, swap, N));
  out.push(m(8, costs, N));
  out.push(
    m(9, Math.abs(grossAll) > 0 ? (costs / Math.abs(grossAll)) * 100 : null, N),
  );
  out.push(m(10, div(net, grossAll !== 0 ? grossAll : gp || net), N));
  out.push(m(11, N, N));
  out.push(m(12, W, N));
  out.push(m(13, L, N));
  out.push(m(14, acc.counts.breakeven, N));
  out.push(m(15, wr != null ? wr * 100 : null, N));
  out.push(m(16, acc.counts.long + acc.counts.short / 1000, N)); // encoded; UI splits
  out.push(
    m(
      17,
      acc.counts.long >= 1 ? (acc.counts.longWins / acc.counts.long) * 100 : null,
      acc.counts.long,
    ),
  );
  out.push(
    m(
      18,
      acc.counts.short >= 1
        ? (acc.counts.shortWins / acc.counts.short) * 100
        : null,
      acc.counts.short,
    ),
  );
  out.push(m(19, avgWin, W));
  out.push(m(20, avgLoss, L));
  out.push(m(21, payoff, N));
  out.push(m(22, acc.extremes.maxPnl, N));
  out.push(m(23, acc.extremes.minPnl, N));
  out.push(m(24, acc.sums.rCount > 0 ? acc.sums.r : null, acc.sums.rCount));
  out.push(m(25, meanR, acc.sums.rCount));
  out.push(m(26, N > 0 ? net / N : null, N));
  out.push(m(27, acc.sums.rCount >= 2 ? sdR : null, acc.sums.rCount));
  out.push(m(28, sqn, acc.sums.rCount));
  out.push(m(29, meanR, acc.sums.rCount));
  out.push(m(30, kelly != null ? kelly * 100 : null, N));
  out.push(m(31, optimalF != null ? optimalF * 100 : null, N));
  out.push(m(32, riskOfRuin, acc.sums.rCount));
  out.push(m(33, tradesForSig, acc.sums.rCount));
  out.push(m(34, days >= 2 ? sdDaily : null, days));
  out.push(m(35, acc.daily.nDown >= 2 ? downDev : null, days));
  out.push(
    m(
      36,
      sdDaily > 0
        ? ((meanDaily - rf / periodsPerYear) / sdDaily) * Math.sqrt(periodsPerYear)
        : null,
      days,
    ),
  );
  out.push(
    m(
      37,
      downDev > 0 ? (meanDaily / downDev) * Math.sqrt(periodsPerYear) : null,
      days,
    ),
  );
  out.push(
    m(
      38,
      cagr != null && acc.equity.maxDdPct > 0 ? cagr / acc.equity.maxDdPct : null,
      days,
    ),
  );
  out.push(
    m(
      39,
      cagr != null && acc.equity.avgDd > 0 ? cagr / acc.equity.avgDd : null,
      days,
    ),
  );
  out.push(
    m(40, acc.equity.maxDd > 0 ? net / acc.equity.maxDd : null, N),
  );
  out.push(m(41, ulcer, N));
  out.push(m(42, cagr != null && ulcer > 0 ? cagr / ulcer : null, days));
  out.push(m(43, cagr != null ? cagr * 100 : null, days));
  out.push(m(44, welfordSkew(acc.rMoments), acc.rMoments.n));
  out.push(m(45, welfordKurtosis(acc.rMoments), acc.rMoments.n));
  out.push(m(46, acc.equity.maxDd, N));
  out.push(m(47, acc.equity.maxDdPct * 100, N));
  out.push(m(48, acc.equity.maxDdDurationSec / 86400, N));
  out.push(m(49, acc.equity.currentDdPct * 100, N));
  out.push(m(50, acc.equity.avgDd, acc.equity.ddEpisodes));
  out.push(m(51, acc.equity.ddEpisodes, N));
  out.push(
    m(
      52,
      acc.equity.totalSpanSec > 0
        ? (acc.equity.timeInDdSec / acc.equity.totalSpanSec) * 100
        : null,
      days,
    ),
  );
  out.push(m(53, acc.equity.maxRunUp, N));
  out.push(
    m(
      54,
      acc.equity.recoverySec != null ? acc.equity.recoverySec / 86400 : null,
      N,
    ),
  );
  out.push(m(55, acc.equity.longestFlatSec / 86400, days));
  out.push(m(56, acc.streaks.maxWin, N));
  out.push(m(57, acc.streaks.maxLoss, N));
  out.push(
    m(
      58,
      acc.streaks.winRunCount > 0
        ? acc.streaks.sumWinRuns / acc.streaks.winRunCount
        : null,
      N,
    ),
  );
  out.push(
    m(
      59,
      acc.streaks.lossRunCount > 0
        ? acc.streaks.sumLossRuns / acc.streaks.lossRunCount
        : null,
      N,
    ),
  );
  out.push(m(60, acc.streaks.current, N));
  out.push(
    m(61, days > 0 ? (acc.daily.winDays / days) * 100 : null, days),
  );
  out.push(m(62, acc.daily.bestDay, days)); // UI shows best/worst pair
  out.push(m(63, monthStd, months.length));
  out.push(m(64, profitableMonths, months.length));
  out.push(m(65, N > 0 ? acc.sums.duration / N : null, N));
  out.push(m(66, W > 0 ? acc.sums.durationWin / W : null, W));
  out.push(m(67, L > 0 ? acc.sums.durationLoss / L : null, L));
  out.push(m(68, acc.extremes.maxDuration, N));
  out.push(m(69, days > 0 ? N / days : null, N));
  out.push(
    m(
      70,
      acc.equity.totalSpanSec > 0
        ? (acc.sums.duration / acc.equity.totalSpanSec) * 100
        : null,
      N,
    ),
  );
  out.push(m(71, null, N)); // bucket charts
  out.push(m(72, null, N));
  out.push(m(73, null, N));
  out.push(m(74, null, N));
  out.push(m(75, N > 0 ? acc.sums.mfeR / N : null, N));
  out.push(m(76, N > 0 ? acc.sums.maeR / N : null, N));
  out.push(
    m(
      77,
      acc.sums.efficiencyCount > 0
        ? (acc.sums.efficiency / acc.sums.efficiencyCount) * 100
        : null,
      acc.sums.efficiencyCount,
    ),
  );
  out.push(
    m(
      78,
      acc.sums.entryEfficiencyCount > 0
        ? (acc.sums.entryEfficiency / acc.sums.entryEfficiencyCount) * 100
        : null,
      acc.sums.entryEfficiencyCount,
    ),
  );
  out.push(
    m(
      79,
      acc.sums.efficiencyCount > 0
        ? (acc.sums.efficiency / acc.sums.efficiencyCount) * 100
        : null,
      acc.sums.efficiencyCount,
    ),
  );
  out.push(m(80, null, N)); // breakdown in UI / buckets.exitReason
  out.push(m(81, N > 0 ? (acc.counts.ambiguous / N) * 100 : null, N));
  out.push(
    m(
      82,
      acc.sums.maeWinnersCount > 0
        ? acc.sums.maeWinnersR / acc.sums.maeWinnersCount
        : null,
      acc.sums.maeWinnersCount,
    ),
  );
  out.push(m(83, null, N));
  out.push(m(84, null, N));
  const riskSd =
    acc.riskMoments.n >= 2
      ? Math.sqrt(acc.riskMoments.m2 / (acc.riskMoments.n - 1))
      : null;
  out.push(m(85, riskSd, acc.counts.riskN));
  out.push(
    m(86, acc.counts.riskN > 0 ? (acc.counts.oversize / acc.counts.riskN) * 100 : null, acc.counts.riskN),
  );
  // Post-loss: report win-rate delta vs baseline (percentage points)
  const postDelta =
    acc.behavior.postLossWinRate != null && acc.behavior.baselineWinRate != null
      ? (acc.behavior.postLossWinRate - acc.behavior.baselineWinRate) * 100
      : null;
  out.push(m(87, postDelta, acc.behavior.postLossN));
  const req = opts.requiredTagsMask ?? 0;
  let adherence: number | null = null;
  if (req !== 0 && N > 0) {
    let ok = 0;
    for (let k = 0; k < acc.selectedIndex.length; k++) {
      const i = acc.selectedIndex[k]!;
      if ((store.tagBits[i]! & req) === req) ok++;
    }
    adherence = (ok / N) * 100;
  }
  out.push(m(88, adherence, N));

  return out;
}

/** Extract finite R sample for Monte Carlo from store + selection. */
export function extractRSample(
  store: TradeStore,
  selected: Uint32Array,
): Float64Array {
  const tmp: number[] = [];
  for (let k = 0; k < selected.length; k++) {
    const r = store.rMultiple[selected[k]!]!;
    if (Number.isFinite(r)) tmp.push(r);
  }
  return Float64Array.from(tmp);
}
