/**
 * Analytics compute worker — columnar pass + metrics. Transferables in/out.
 */
import { accumulate } from './accumulators';
import { computeFilterMask, hashFilter } from './filterMask';
import { lttbIndices } from './math/lttb';
import { hashStringToSeed } from './math/rng';
import { deriveMetrics, extractRSample } from './metrics';
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
      };
      /** Downsampled chart payloads (main thread never scans 100k). */
      charts: {
        rValues: Float64Array;
        maeR: Float64Array;
        mfeR: Float64Array;
        outcome: Uint8Array;
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
    for (let k = 0; k < acc.selectedIndex.length; k += step) {
      const i = acc.selectedIndex[k]!;
      const r = msg.store.rMultiple[i]!;
      if (Number.isFinite(r)) rVals.push(r);
      const entry = msg.store.entryPrice[i]!;
      const stop = msg.store.initialStop[i]!;
      const risk = Math.abs(entry - stop);
      if (!(risk > 0)) continue;
      const dir = msg.store.side[i] === 1 ? -1 : 1;
      maeR.push(Math.max(0, (dir * (entry - msg.store.mae[i]!)) / risk));
      mfeR.push(Math.max(0, (dir * (msg.store.mfe[i]! - entry)) / risk));
      outcome.push(msg.store.netPnl[i]! > 0 ? 1 : 0);
    }

    const charts = {
      rValues: Float64Array.from(rVals),
      maeR: Float64Array.from(maeR),
      mfeR: Float64Array.from(mfeR),
      outcome: Uint8Array.from(outcome),
    };

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
