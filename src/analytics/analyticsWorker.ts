/**
 * Analytics compute worker — columnar pass + metrics. Transferables in/out.
 */
import { accumulate } from './accumulators';
import { computeFilterMask, hashFilter } from './filterMask';
import { lttbIndices } from './math/lttb';
import { hashStringToSeed } from './math/rng';
import { deriveMetrics, extractRSample } from './metrics';
import { EXIT_REASON_LABEL } from './types';
import type { FilterState, TradeStore } from './types';

export type WorkerRequest =
  | {
      type: 'compute';
      id: number;
      store: TradeStore;
      filter: FilterState;
      riskFreeRate?: number;
      chartPoints?: number;
    }
  | { type: 'ping'; id: number };

export type WorkerResponse =
  | {
      type: 'result';
      id: number;
      metrics: ReturnType<typeof deriveMetrics>;
      equityDownsampled: { t: Float64Array; e: Float64Array; dd: Float64Array };
      selectedCount: number;
      elapsedMs: number;
      buckets: {
        hour: { n: number; wins: number; netPnl: number }[];
        weekday: { n: number; wins: number; netPnl: number }[];
        session: { label: string; n: number; wins: number; netPnl: number }[];
        symbol: { label: string; n: number; wins: number; netPnl: number }[];
        exitReason: { label: string; n: number }[];
      };
      /** Downsampled chart payloads (main thread never scans 100k). */
      charts: {
        rValues: Float64Array;
        maeR: Float64Array;
        mfeR: Float64Array;
        outcome: Uint8Array;
        cumR: Float64Array;
        netPnl: Float64Array;
        rollingWr: Float64Array;
        longPnl: number;
        shortPnl: number;
        longN: number;
        shortN: number;
      };
      ambiguousPct: number;
      approxCount: number;
      warnings: string[];
    }
  | { type: 'pong'; id: number }
  | { type: 'error'; id: number; message: string };

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'ping') {
      const res: WorkerResponse = { type: 'pong', id: msg.id };
      self.postMessage(res);
      return;
    }
    const t0 = performance.now();
    const mask = computeFilterMask(msg.store, msg.filter);
    const acc = accumulate(msg.store, mask);
    const rSample = extractRSample(msg.store, acc.selectedIndex);
    const seed = hashStringToSeed(hashFilter(msg.filter) + String(msg.store.version));
    const metrics = deriveMetrics(acc, msg.store, {
      riskFreeRate: msg.riskFreeRate,
      mcSeed: seed,
      rSample,
    });

    const thr = msg.chartPoints ?? 2000;
    const idx = lttbIndices(acc.equity.curveTime, acc.equity.curveEquity, thr);
    const t = new Float64Array(idx.length);
    const e = new Float64Array(idx.length);
    const dd = new Float64Array(idx.length);
    for (let i = 0; i < idx.length; i++) {
      const j = idx[i]!;
      t[i] = acc.equity.curveTime[j]!;
      e[i] = acc.equity.curveEquity[j]!;
      dd[i] = acc.equity.curveDdPct[j]!;
    }

    const ambiguousPct =
      acc.n > 0 ? (acc.counts.ambiguous / acc.n) * 100 : 0;
    const warnings: string[] = [];
    if (ambiguousPct > 5) {
      warnings.push(
        `Ambiguous fills: ${ambiguousPct.toFixed(1)}% — outcomes depend on intrabar assumptions.`,
      );
    }
    if (acc.counts.approximate > 0) {
      warnings.push(
        `${acc.counts.approximate} trades used approximate FX conversion.`,
      );
    }

    const chartCap = Math.min(acc.selectedIndex.length, 8_000);
    const step = Math.max(1, Math.floor(acc.selectedIndex.length / Math.max(1, chartCap)));
    const rVals: number[] = [];
    const maeR: number[] = [];
    const mfeR: number[] = [];
    const outcome: number[] = [];
    const netPnlSample: number[] = [];
    // Full chronological path for cum-R / rolling WR (cap length).
    const pathCap = Math.min(acc.selectedIndex.length, 4_000);
    const pathStep = Math.max(1, Math.floor(acc.selectedIndex.length / Math.max(1, pathCap)));
    const cumR: number[] = [];
    const rollingWr: number[] = [];
    let runR = 0;
    const winWindow: number[] = [];
    const ROLL = 20;
    let longPnl = 0;
    let shortPnl = 0;
    let longN = 0;
    let shortN = 0;

    for (let k = 0; k < acc.selectedIndex.length; k++) {
      const i = acc.selectedIndex[k]!;
      const pnl = msg.store.netPnl[i]!;
      if (msg.store.side[i] === 1) {
        shortPnl += pnl;
        shortN++;
      } else {
        longPnl += pnl;
        longN++;
      }

      if (k % pathStep === 0) {
        const r = msg.store.rMultiple[i]!;
        if (Number.isFinite(r)) runR += r;
        cumR.push(runR);
        winWindow.push(pnl > 0 ? 1 : 0);
        if (winWindow.length > ROLL) winWindow.shift();
        const wr =
          winWindow.reduce((s, x) => s + x, 0) / Math.max(1, winWindow.length);
        rollingWr.push(wr);
      }

      if (k % step !== 0) continue;
      const r = msg.store.rMultiple[i]!;
      if (Number.isFinite(r)) rVals.push(r);
      netPnlSample.push(pnl);
      const entry = msg.store.entryPrice[i]!;
      const stop = msg.store.initialStop[i]!;
      const risk = Math.abs(entry - stop);
      if (!(risk > 0)) continue;
      const dir = msg.store.side[i] === 1 ? -1 : 1;
      maeR.push(Math.max(0, (dir * (entry - msg.store.mae[i]!)) / risk));
      mfeR.push(Math.max(0, (dir * (msg.store.mfe[i]! - entry)) / risk));
      outcome.push(pnl > 0 ? 1 : 0);
    }

    const charts = {
      rValues: Float64Array.from(rVals),
      maeR: Float64Array.from(maeR),
      mfeR: Float64Array.from(mfeR),
      outcome: Uint8Array.from(outcome),
      cumR: Float64Array.from(cumR),
      netPnl: Float64Array.from(netPnlSample),
      rollingWr: Float64Array.from(rollingWr),
      longPnl,
      shortPnl,
      longN,
      shortN,
    };

    const sessionLabels = ['Asia', 'London', 'NY', 'Overlap'];
    const symbolBuckets = [...acc.buckets.symbol.entries()]
      .map(([id, b]) => ({
        label: msg.store.symbols[id] ?? `#${id}`,
        n: b.n,
        wins: b.wins,
        netPnl: b.netPnl,
      }))
      .sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl))
      .slice(0, 8);

    const res: WorkerResponse = {
      type: 'result',
      id: msg.id,
      metrics,
      equityDownsampled: { t, e, dd },
      selectedCount: acc.n,
      elapsedMs: performance.now() - t0,
      buckets: {
        hour: acc.buckets.hour.map((b) => ({
          n: b.n,
          wins: b.wins,
          netPnl: b.netPnl,
        })),
        weekday: acc.buckets.weekday.map((b) => ({
          n: b.n,
          wins: b.wins,
          netPnl: b.netPnl,
        })),
        session: acc.buckets.session.map((b, i) => ({
          n: b.n,
          wins: b.wins,
          netPnl: b.netPnl,
          label: sessionLabels[i] ?? `S${i}`,
        })),
        symbol: symbolBuckets,
        exitReason: EXIT_REASON_LABEL.map((label, i) => ({
          label,
          n: acc.counts.exitReason[i] ?? 0,
        })),
      },
      charts,
      ambiguousPct,
      approxCount: acc.counts.approximate,
      warnings,
    };
    self.postMessage(res, [
      t.buffer,
      e.buffer,
      dd.buffer,
      charts.rValues.buffer,
      charts.maeR.buffer,
      charts.mfeR.buffer,
      charts.outcome.buffer,
      charts.cumR.buffer,
      charts.netPnl.buffer,
      charts.rollingWr.buffer,
    ]);
  } catch (err) {
    const res: WorkerResponse = {
      type: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(res);
  }
};
