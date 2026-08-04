import { createMask, type FilterMask, selectedIndices } from './filterMask';
import { kahanAdd, kahanInit, kahanValue } from './math/kahan';
import { welfordInit, welfordPush, type WelfordState } from './math/welford';
import type { AccumulatorResult, BucketAgg, TradeStore } from './types';

function emptyBucket(): BucketAgg {
  return { n: 0, wins: 0, netPnl: 0, sumR: 0, rCount: 0 };
}

function pushBucket(b: BucketAgg, net: number, r: number): void {
  b.n++;
  if (net > 0) b.wins++;
  b.netPnl += net;
  if (Number.isFinite(r)) {
    b.sumR += r;
    b.rCount++;
  }
}

/** UTC hour / weekday helpers — instrument TZ deferred; document as UTC (§10.6). */
function utcHour(sec: number): number {
  return new Date(sec * 1000).getUTCHours();
}
function utcWeekday(sec: number): number {
  return new Date(sec * 1000).getUTCDay(); // 0=Sun
}
function utcMonthKey(sec: number): string {
  const d = new Date(sec * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Crude session buckets in UTC: Asia 0–7, London 7–12, NY 12–21, overlap 12–16. */
function sessionBucket(hour: number): number {
  if (hour >= 0 && hour < 7) return 0;
  if (hour >= 7 && hour < 12) return 1;
  if (hour >= 12 && hour < 16) return 3; // overlap
  if (hour >= 16 && hour < 21) return 2;
  return 0;
}

function dayKey(sec: number): number {
  return Math.floor(sec / 86400);
}

/**
 * One linear pass over the filter mask → all accumulators (§6.2).
 */
export function accumulate(store: TradeStore, mask: FilterMask): AccumulatorResult {
  const nStore = store.n;
  const selected = selectedIndices(mask, nStore);
  const n = selected.length;

  const kNet = kahanInit();
  const kGP = kahanInit();
  const kGL = kahanInit();
  const kComm = kahanInit();
  const kSwap = kahanInit();
  const kR = kahanInit();
  const kDur = kahanInit();
  const kDurW = kahanInit();
  const kDurL = kahanInit();
  const kMfeR = kahanInit();
  const kMaeR = kahanInit();
  const kEff = kahanInit();
  const kMaeW = kahanInit();
  const kEntryEff = kahanInit();

  let rCount = 0;
  let effCount = 0;
  let maeWCount = 0;
  let entryEffCount = 0;
  let oversize = 0;
  let riskN = 0;
  const riskMoments = welfordInit();
  const riskBuf = new Float64Array(n);
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let long = 0;
  let short = 0;
  let longWins = 0;
  let shortWins = 0;
  const exitReason = [0, 0, 0, 0, 0];
  let ambiguous = 0;
  let approximate = 0;

  let maxPnl = -Infinity;
  let minPnl = Infinity;
  let maxDuration = -Infinity;
  let minDuration = Infinity;

  const rMoments = welfordInit();

  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let cur = 0;
  let sumWinRuns = 0;
  let winRunCount = 0;
  let sumLossRuns = 0;
  let lossRunCount = 0;
  let runLen = 0;

  const hour = Array.from({ length: 24 }, emptyBucket);
  const weekday = Array.from({ length: 7 }, emptyBucket);
  const session = Array.from({ length: 4 }, emptyBucket);
  const month = new Map<string, BucketAgg>();
  const symbol = new Map<number, BucketAgg>();
  const tag = new Map<number, BucketAgg>();

  // Equity / drawdown on closed-trade balanceAfter (sorted by closeTime)
  const order = selected.slice();
  order.sort((a, b) => store.closeTime[a]! - store.closeTime[b]!);

  const curveTime = new Float64Array(Math.max(1, n));
  const curveEquity = new Float64Array(Math.max(1, n));
  const curveDdPct = new Float64Array(Math.max(1, n));

  let peak = store.initialBalance;
  let maxDd = 0;
  let maxDdPct = 0;
  let maxDdDurationSec = 0;
  let ddStart = -1;
  let avgDdSum = 0;
  let ddEpisodes = 0;
  let timeInDdSec = 0;
  let maxRunUp = 0;
  let trough = store.initialBalance;
  let recoverySec: number | null = null;
  let maxDdPeakTime = -1;
  let maxDdTroughTime = -1;
  let longestFlatSec = 0;
  let lastPeakTime = 0;
  let flatStart = -1;

  // Daily aggregation
  const dayMap = new Map<number, number>();

  for (let k = 0; k < n; k++) {
    const i = selected[k]!;
    const net = store.netPnl[i]!;
    const gross = store.grossPnl[i]!;
    const r = store.rMultiple[i]!;
    const closeT = store.closeTime[i]!;
    const openT = store.openTime[i]!;
    const dur = Math.max(0, closeT - openT);
    const isLong = store.side[i] === 0;

    kahanAdd(kNet, net);
    kahanAdd(kComm, store.commission[i]!);
    kahanAdd(kSwap, store.swap[i]!);
    kahanAdd(kDur, dur);
    void gross;

    if (net > 0) {
      wins++;
      kahanAdd(kGP, net);
      kahanAdd(kDurW, dur);
    } else if (net < 0) {
      losses++;
      kahanAdd(kGL, net);
      kahanAdd(kDurL, dur);
    } else {
      breakeven++;
    }

    if (isLong) {
      long++;
      if (net > 0) longWins++;
    } else {
      short++;
      if (net > 0) shortWins++;
    }

    exitReason[store.exitReason[i]!]!++;
    if (store.flags[i]! & 1) ambiguous++;
    if (store.flags[i]! & 2) approximate++;

    if (net > maxPnl) maxPnl = net;
    if (net < minPnl) minPnl = net;
    if (dur > maxDuration) maxDuration = dur;
    if (dur < minDuration) minDuration = dur;

    if (Number.isFinite(r)) {
      kahanAdd(kR, r);
      rCount++;
      welfordPush(rMoments, r);
    }

    const entry = store.entryPrice[i]!;
    const exit = store.exitPrice[i]!;
    const stop = store.initialStop[i]!;
    const mfeP = store.mfe[i]!;
    const maeP = store.mae[i]!;
    const riskPx = Number.isFinite(stop) ? Math.abs(entry - stop) : Number.NaN;
    if (riskPx > 0) {
      const dir = isLong ? 1 : -1;
      const mfeR = Math.max(0, (dir * (mfeP - entry)) / riskPx);
      const maeR = Math.max(0, (dir * (entry - maeP)) / riskPx);
      kahanAdd(kMfeR, mfeR);
      kahanAdd(kMaeR, maeR);
      const fav = dir * (mfeP - entry);
      const captured = dir * (exit - entry);
      if (fav > 0) {
        const eff = Math.min(1, Math.max(0, captured / fav));
        kahanAdd(kEff, eff);
        effCount++;
      }
      if (net > 0) {
        kahanAdd(kMaeW, maeR);
        maeWCount++;
      }
    }

    // Entry efficiency: how close entry was to the bar's best available price (§H78)
    const eh = store.entryBarHigh[i]!;
    const el = store.entryBarLow[i]!;
    if (Number.isFinite(eh) && Number.isFinite(el) && eh > el) {
      let ee: number;
      if (isLong) {
        // Best long entry = bar low; 100% if filled at low
        ee = 1 - (entry - el) / (eh - el);
      } else {
        // Best short entry = bar high
        ee = 1 - (eh - entry) / (eh - el);
      }
      ee = Math.min(1, Math.max(0, ee));
      kahanAdd(kEntryEff, ee);
      entryEffCount++;
    }

    const rp = store.riskPct[i]!;
    if (Number.isFinite(rp) && rp > 0) {
      welfordPush(riskMoments, rp);
      riskBuf[riskN++] = rp;
    }

    const h = utcHour(closeT);
    pushBucket(hour[h]!, net, r);
    pushBucket(weekday[utcWeekday(closeT)]!, net, r);
    pushBucket(session[sessionBucket(h)]!, net, r);
    const mk = utcMonthKey(closeT);
    let mb = month.get(mk);
    if (!mb) {
      mb = emptyBucket();
      month.set(mk, mb);
    }
    pushBucket(mb, net, r);

    const sid = store.symbolId[i]!;
    let sb = symbol.get(sid);
    if (!sb) {
      sb = emptyBucket();
      symbol.set(sid, sb);
    }
    pushBucket(sb, net, r);

    const bits = store.tagBits[i]!;
    for (let b = 0; b < 32; b++) {
      if (bits & (1 << b)) {
        let tb = tag.get(b);
        if (!tb) {
          tb = emptyBucket();
          tag.set(b, tb);
        }
        pushBucket(tb, net, r);
      }
    }

    const dk = dayKey(closeT);
    dayMap.set(dk, (dayMap.get(dk) ?? 0) + net);

    void openT;
  }

  // Oversizing vs median risk (sort only the filled typed prefix)
  if (riskN >= 1) {
    const sorted = riskBuf.subarray(0, riskN);
    sorted.sort();
    const mid = riskN >> 1;
    const median =
      riskN % 2 === 1
        ? sorted[mid]!
        : (sorted[mid - 1]! + sorted[mid]!) / 2;
    const thresh = 1.5 * median;
    for (let k = 0; k < riskN; k++) {
      if (sorted[k]! > thresh) oversize++;
    }
  }

  // Time-ordered pass: equity, drawdown, streaks, post-loss behavior
  let postLossN = 0;
  let postLossWins = 0;
  let postLossRiskSum = 0;
  let postLossRiskN = 0;
  let prevWasLoss = false;

  for (let k = 0; k < n; k++) {
    const i = order[k]!;
    const net = store.netPnl[i]!;
    const eq = store.balanceAfter[i]!;
    const ct = store.closeTime[i]!;
    curveTime[k] = ct;
    curveEquity[k] = eq;

    if (prevWasLoss) {
      postLossN++;
      if (net > 0) postLossWins++;
      const rp = store.riskPct[i]!;
      if (Number.isFinite(rp)) {
        postLossRiskSum += rp;
        postLossRiskN++;
      }
    }
    prevWasLoss = net < 0;

    if (eq >= peak) {
      if (ddStart >= 0) {
        ddEpisodes++;
        avgDdSum += maxDdPct; // rough
        ddStart = -1;
      }
      if (flatStart >= 0) {
        longestFlatSec = Math.max(longestFlatSec, ct - flatStart);
        flatStart = -1;
      }
      peak = eq;
      lastPeakTime = ct;
      trough = eq;
    } else {
      if (flatStart < 0) flatStart = lastPeakTime;
      const dd = peak - eq;
      const ddPct = peak > 0 ? dd / peak : 0;
      if (ddStart < 0) ddStart = ct;
      timeInDdSec += k > 0 ? ct - curveTime[k - 1]! : 0;
      if (dd > maxDd) {
        maxDd = dd;
        maxDdPct = ddPct;
        maxDdPeakTime = lastPeakTime;
        maxDdTroughTime = ct;
        maxDdDurationSec = ct - ddStart;
      }
      if (eq < trough) trough = eq;
      const runUp = eq - trough;
      if (runUp > maxRunUp) maxRunUp = runUp;
    }
    curveDdPct[k] = peak > 0 ? Math.min(0, (eq - peak) / peak) : 0;

    // streaks
    if (net > 0) {
      if (cur >= 0) {
        cur++;
        runLen = cur;
      } else {
        if (runLen > 0) {
          sumLossRuns += runLen;
          lossRunCount++;
        }
        cur = 1;
        runLen = 1;
      }
      if (cur > maxWinStreak) maxWinStreak = cur;
    } else if (net < 0) {
      if (cur <= 0) {
        cur--;
        runLen = -cur;
      } else {
        if (runLen > 0) {
          sumWinRuns += runLen;
          winRunCount++;
        }
        cur = -1;
        runLen = 1;
      }
      if (-cur > maxLossStreak) maxLossStreak = -cur;
    }
  }
  if (maxDdTroughTime >= 0 && maxDdPeakTime >= 0) {
    // recovery: first time equity >= peak after trough
    const peakEq = peak; // may have moved
    void peakEq;
    for (let k = 0; k < n; k++) {
      if (curveTime[k]! < maxDdTroughTime) continue;
      // find peak equity at max dd — approximate recovery when back to prior peak level
      if (curveEquity[k]! >= curveEquity[0]! + (store.initialBalance - store.initialBalance)) {
        /* placeholder */
      }
    }
    // Simpler: unrecovered if final < peak at end of scan
    const finalEq = n > 0 ? curveEquity[n - 1]! : store.initialBalance;
    let peakAtDd = store.initialBalance;
    for (let k = 0; k < n; k++) {
      if (curveTime[k]! <= maxDdTroughTime) {
        peakAtDd = Math.max(peakAtDd, curveEquity[k]!);
      }
    }
    // walk for recovery after trough
    let recovered: number | null = null;
    for (let k = 0; k < n; k++) {
      if (curveTime[k]! < maxDdTroughTime) continue;
      if (curveEquity[k]! >= peakAtDd) {
        recovered = curveTime[k]! - maxDdTroughTime;
        break;
      }
    }
    recoverySec = recovered;
    void finalEq;
  }

  // Daily Welford
  const dailyW = welfordInit();
  const downW = welfordInit();
  let winDays = 0;
  let bestDay = -Infinity;
  let worstDay = Infinity;
  const dayKeys = [...dayMap.keys()].sort((a, b) => a - b);
  const dayPnl = new Float64Array(dayKeys.length);
  const dayTime = new Float64Array(dayKeys.length);
  for (let i = 0; i < dayKeys.length; i++) {
    const pnl = dayMap.get(dayKeys[i]!)!;
    dayPnl[i] = pnl;
    dayTime[i] = dayKeys[i]! * 86400;
    // return approx pnl/balance — use initial for stability
    const ret = pnl / store.initialBalance;
    welfordPush(dailyW, ret);
    if (ret < 0) welfordPush(downW, ret);
    if (pnl > 0) winDays++;
    if (pnl > bestDay) bestDay = pnl;
    if (pnl < worstDay) worstDay = pnl;
  }

  const firstT = n > 0 ? curveTime[0]! : 0;
  const lastT = n > 0 ? curveTime[n - 1]! : 0;
  const baselineWinRate = n > 0 ? wins / n : null;
  const baselineAvgRisk = riskMoments.n > 0 ? riskMoments.mean : null;

  return {
    n,
    sums: {
      netPnl: kahanValue(kNet),
      grossProfit: kahanValue(kGP),
      grossLoss: kahanValue(kGL),
      commission: kahanValue(kComm),
      swap: kahanValue(kSwap),
      r: kahanValue(kR),
      rCount,
      duration: kahanValue(kDur),
      durationWin: kahanValue(kDurW),
      durationLoss: kahanValue(kDurL),
      mfeR: kahanValue(kMfeR),
      maeR: kahanValue(kMaeR),
      efficiency: kahanValue(kEff),
      efficiencyCount: effCount,
      maeWinnersR: kahanValue(kMaeW),
      maeWinnersCount: maeWCount,
      entryEfficiency: kahanValue(kEntryEff),
      entryEfficiencyCount: entryEffCount,
    },
    counts: {
      wins,
      losses,
      breakeven,
      long,
      short,
      longWins,
      shortWins,
      exitReason,
      ambiguous,
      approximate,
      oversize,
      riskN,
    },
    behavior: {
      postLossWinRate: postLossN > 0 ? postLossWins / postLossN : null,
      postLossAvgRisk: postLossRiskN > 0 ? postLossRiskSum / postLossRiskN : null,
      baselineWinRate,
      baselineAvgRisk,
      postLossN,
    },
    riskMoments: {
      mean: riskMoments.mean,
      m2: riskMoments.m2,
      n: riskMoments.n,
    },
    extremes: {
      maxPnl: Number.isFinite(maxPnl) ? maxPnl : 0,
      minPnl: Number.isFinite(minPnl) ? minPnl : 0,
      maxDuration: Number.isFinite(maxDuration) ? maxDuration : 0,
      minDuration: Number.isFinite(minDuration) ? minDuration : 0,
    },
    rMoments: { ...rMoments },
    streaks: {
      maxWin: maxWinStreak,
      maxLoss: maxLossStreak,
      sumWinRuns: sumWinRuns + (cur > 0 ? cur : 0),
      winRunCount: winRunCount + (cur > 0 ? 1 : 0),
      sumLossRuns: sumLossRuns + (cur < 0 ? -cur : 0),
      lossRunCount: lossRunCount + (cur < 0 ? 1 : 0),
      current: cur,
    },
    equity: {
      finalBalance: n > 0 ? curveEquity[n - 1]! : store.initialBalance,
      maxDd,
      maxDdPct,
      maxDdDurationSec,
      currentDdPct: n > 0 ? -curveDdPct[n - 1]! : 0,
      avgDd: ddEpisodes > 0 ? avgDdSum / ddEpisodes : 0,
      ddEpisodes,
      timeInDdSec,
      totalSpanSec: Math.max(0, lastT - firstT),
      maxRunUp,
      recoverySec,
      longestFlatSec,
      curveTime,
      curveEquity,
      curveDdPct,
    },
    daily: {
      days: dayKeys.length,
      meanRet: dailyW.mean,
      m2Ret: dailyW.m2,
      m2Down: downW.m2,
      nDown: downW.n,
      winDays,
      bestDay: Number.isFinite(bestDay) ? bestDay : 0,
      worstDay: Number.isFinite(worstDay) ? worstDay : 0,
      dayPnl,
      dayTime,
    },
    buckets: { hour, weekday, session, month, symbol, tag },
    selectedIndex: selected,
  };
}

export function accumulateAll(store: TradeStore): AccumulatorResult {
  return accumulate(store, createMask(store.n, true));
}

export type { WelfordState };
