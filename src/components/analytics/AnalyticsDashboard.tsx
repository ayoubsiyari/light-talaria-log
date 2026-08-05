import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Button } from '@heroui/react';
import type { WorkerResponse } from '@/analytics/analyticsWorker';
import { METRIC_CATALOG } from '@/analytics/catalog';
import {
  runChartAnimation,
  scaleByProgress,
  sliceByProgress,
} from '@/analytics/charts/animateDraw';
import {
  hitBarIndex,
  hitScatterNearest,
  hitSeriesIndex,
  type TooltipState,
} from '@/analytics/charts/chartInteract';
import { drawEquityChart, drawUnderwater } from '@/analytics/charts/drawEquity';
import {
  drawHoldCompare,
  drawMonthHeatmap,
  drawStreakStrip,
  hitMonthCell,
  type MonthCell,
} from '@/analytics/charts/drawHeatmap';
import {
  drawBars,
  drawHBars,
  drawHistogram,
  drawLineSeries,
  drawRollingLine,
  drawScatter,
} from '@/analytics/charts/drawSimple';
import { computeFilterMask, selectedIndices } from '@/analytics/filterMask';
import { exportFilteredCsv } from '@/analytics/exportCsv';
import { generateSyntheticTrades } from '@/analytics/fixture';
import { orderJournalToClosedTrades } from '@/analytics/fromJournal';
import { computeAnalytics, terminateAnalyticsWorker } from '@/analytics/runAnalyticsWorker';
import { buildTradeStore } from '@/analytics/tradeStore';
import {
  EMPTY_FILTER,
  type FilterState,
  type MetricResult,
  type TradeStore,
} from '@/analytics/types';
import type { OrderJournal } from '@/orders/journal';
import {
  getOrderJournalView,
  listOrderJournalViews,
} from '@/orders/tradeJournal';
import { TradeListVirtual } from './TradeListVirtual';

interface Props {
  liveJournal?: OrderJournal | null;
  sessionId?: string | null;
  onClose?: () => void;
  onOpenJournal?: () => void;
  allowDemo?: boolean;
  /** Full-bleed board: no page scroll, dense animated grid. */
  immersive?: boolean;
}

type AnalyticsResult = Extract<WorkerResponse, { type: 'result' }>;
type ChartPack = AnalyticsResult['charts'];

type BucketPack = {
  hour: Float64Array;
  weekday: Float64Array;
  session: Float64Array;
  sessionLabels: string[];
  symbolValues: Float64Array;
  symbolLabels: string[];
  exitValues: Float64Array;
  exitLabels: string[];
  sideValues: Float64Array;
  month: MonthCell[];
};

function localHourBars(store: TradeStore, indices: Uint32Array): Float64Array {
  const bars = new Float64Array(24);
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k]!;
    const h = new Date(store.closeTime[i]! * 1000).getHours();
    bars[h]! += store.netPnl[i]!;
  }
  return bars;
}

function localWeekdayBars(store: TradeStore, indices: Uint32Array): Float64Array {
  const bars = new Float64Array(7);
  for (let k = 0; k < indices.length; k++) {
    const i = indices[k]!;
    const d = new Date(store.closeTime[i]! * 1000).getDay();
    bars[d]! += store.netPnl[i]!;
  }
  return bars;
}

function unixToDateInput(sec: number | null): string {
  if (sec == null) return '';
  const d = new Date(sec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInputToUnixStart(s: string): number | null {
  if (!s) return null;
  const parts = s.split('-').map(Number);
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (y == null || mo == null || d == null) return null;
  return Math.floor(new Date(y, mo - 1, d).getTime() / 1000);
}

function dateInputToUnixEnd(s: string): number | null {
  if (!s) return null;
  const parts = s.split('-').map(Number);
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (y == null || mo == null || d == null) return null;
  return Math.floor(new Date(y, mo - 1, d, 23, 59, 59).getTime() / 1000);
}

function monthKeyToRange(key: string): { fromTime: number; toTime: number } {
  const [ys, ms] = key.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const fromTime = Math.floor(new Date(y, m - 1, 1).getTime() / 1000);
  const toTime = Math.floor(new Date(y, m, 0, 23, 59, 59).getTime() / 1000);
  return { fromTime, toTime };
}

function fmtTime(sec: number): string {
  return new Date(sec * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtMoney(v: number, ccy: string): string {
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 2 : 3;
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)} ${ccy}`;
}

/**
 * Chart-first analytics. Immersive mode = full width, no scroll, animated reveal.
 */
export function AnalyticsDashboard({
  liveJournal,
  sessionId,
  onClose,
  onOpenJournal,
  allowDemo = true,
  immersive = false,
}: Props) {
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [store, setStore] = useState<TradeStore | null>(null);
  const [metrics, setMetrics] = useState<MetricResult[]>([]);
  const [equity, setEquity] = useState<{
    t: Float64Array;
    e: Float64Array;
    dd: Float64Array;
  } | null>(null);
  const [charts, setCharts] = useState<ChartPack | null>(null);
  const [buckets, setBuckets] = useState<BucketPack | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<'journal' | 'demo'>('journal');
  const [selectedJournalId, setSelectedJournalId] = useState<string | 'all'>('all');
  const [useLocalTz, setUseLocalTz] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [showTrades, setShowTrades] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const equityRef = useRef<HTMLCanvasElement>(null);
  const ddRef = useRef<HTMLCanvasElement>(null);
  const cumRRef = useRef<HTMLCanvasElement>(null);
  const rollRef = useRef<HTMLCanvasElement>(null);
  const rHistRef = useRef<HTMLCanvasElement>(null);
  const pnlHistRef = useRef<HTMLCanvasElement>(null);
  const scatterRef = useRef<HTMLCanvasElement>(null);
  const hourRef = useRef<HTMLCanvasElement>(null);
  const weekdayRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<HTMLCanvasElement>(null);
  const symbolRef = useRef<HTMLCanvasElement>(null);
  const exitRef = useRef<HTMLCanvasElement>(null);
  const sideRef = useRef<HTMLCanvasElement>(null);
  const monthRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const streakRef = useRef<HTMLCanvasElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const journalViews = useMemo(
    () => listOrderJournalViews(liveJournal).filter((v) => v.trades.length > 0),
    [liveJournal],
  );

  useEffect(() => {
    if (!allowDemo && source === 'demo') setSource('journal');
  }, [allowDemo, source]);

  useEffect(() => {
    if (source === 'demo') {
      if (!allowDemo) return;
      const trades = generateSyntheticTrades({ n: 5_000, seed: 7 });
      setStore(buildTradeStore(trades, { initialBalance: 10_000 }));
      return;
    }
    if (sessionId) {
      const view = getOrderJournalView(sessionId, liveJournal);
      if (!view || view.trades.length === 0) {
        setStore(null);
        return;
      }
      setStore(
        buildTradeStore(orderJournalToClosedTrades(view), {
          accountCurrency: view.accountCurrency,
          initialBalance: view.startBalance,
        }),
      );
      return;
    }
    if (journalViews.length === 0) {
      setStore(null);
      return;
    }
    if (selectedJournalId !== 'all') {
      const view =
        journalViews.find((v) => v.sessionId === selectedJournalId) ??
        getOrderJournalView(selectedJournalId, liveJournal);
      if (!view || view.trades.length === 0) {
        setStore(null);
        return;
      }
      setStore(
        buildTradeStore(orderJournalToClosedTrades(view), {
          accountCurrency: view.accountCurrency,
          initialBalance: view.startBalance,
        }),
      );
      return;
    }
    const closed = journalViews
      .flatMap((v) => orderJournalToClosedTrades(v))
      .sort((a, b) => a.closeTime - b.closeTime);
    let bal = journalViews[0]!.startBalance;
    for (const t of closed) {
      bal += t.netPnl;
      t.balanceAfter = bal;
    }
    setStore(
      buildTradeStore(closed, {
        accountCurrency: journalViews[0]!.accountCurrency,
        initialBalance: journalViews[0]!.startBalance,
      }),
    );
  }, [source, liveJournal, sessionId, allowDemo, selectedJournalId, journalViews]);

  useEffect(() => {
    if (!store) {
      setMetrics([]);
      setEquity(null);
      setCharts(null);
      setBuckets(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBusy(true);
      void computeAnalytics({ store, filter, chartPoints: 1500 })
        .then((res) => {
          setMetrics(res.metrics);
          setEquity(res.equityDownsampled);
          setCharts(res.charts);
          setBuckets({
            hour: Float64Array.from(res.buckets.hour.map((b) => b.netPnl)),
            weekday: Float64Array.from(res.buckets.weekday.map((b) => b.netPnl)),
            session: Float64Array.from(res.buckets.session.map((b) => b.netPnl)),
            sessionLabels: res.buckets.session.map((b) => b.label),
            symbolValues: Float64Array.from(res.buckets.symbol.map((b) => b.netPnl)),
            symbolLabels: res.buckets.symbol.map((b) => b.label),
            exitValues: Float64Array.from(res.buckets.exitReason.map((b) => b.n)),
            exitLabels: res.buckets.exitReason.map((b) => b.label),
            sideValues: Float64Array.from([res.charts.longPnl, res.charts.shortPnl]),
            month: res.buckets.month.map((b) => ({
              key: b.key,
              n: b.n,
              wins: b.wins,
              netPnl: b.netPnl,
            })),
          });
          setWarnings(res.warnings);
          setElapsed(res.elapsedMs);
        })
        .catch((err) => {
          console.error('[analytics]', err);
          setWarnings([String(err)]);
        })
        .finally(() => setBusy(false));
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [store, filter]);

  useEffect(() => () => terminateAnalyticsWorker(), []);

  const indices = useMemo(() => {
    if (!store) return new Uint32Array(0);
    return selectedIndices(computeFilterMask(store, filter), store.n);
  }, [store, filter]);

  const hourBars = useMemo(() => {
    if (!store) return new Float64Array(24);
    return useLocalTz ? localHourBars(store, indices) : (buckets?.hour ?? new Float64Array(24));
  }, [store, indices, useLocalTz, buckets?.hour]);

  const weekdayBars = useMemo(() => {
    if (!store) return new Float64Array(7);
    return useLocalTz
      ? localWeekdayBars(store, indices)
      : (buckets?.weekday ?? new Float64Array(7));
  }, [store, indices, useLocalTz, buckets?.weekday]);

  // Animated paint + resize (instant at progress=1).
  useEffect(() => {
    if (!equity || !charts || !buckets) return;

    const paintAt = (progress: number) => {
      const eT = sliceByProgress(equity.t, progress);
      const eE = sliceByProgress(equity.e, progress);
      const eDd = sliceByProgress(equity.dd, progress);
      if (equityRef.current) drawEquityChart(equityRef.current, eT, eE, eDd);
      if (ddRef.current) drawUnderwater(ddRef.current, eDd);
      if (cumRRef.current) {
        drawLineSeries(cumRRef.current, sliceByProgress(charts.cumR, progress));
      }
      if (rollRef.current) {
        drawRollingLine(rollRef.current, sliceByProgress(charts.rollingWr, progress), 0.5);
      }
      if (rHistRef.current) {
        drawHistogram(
          rHistRef.current,
          progress < 1 ? scaleByProgress(charts.rValues, progress) : charts.rValues,
          undefined,
          { diverging: true, bins: 40 },
        );
      }
      if (pnlHistRef.current) {
        drawHistogram(
          pnlHistRef.current,
          progress < 1 ? scaleByProgress(charts.netPnl, progress) : charts.netPnl,
          undefined,
          { diverging: true, bins: 36 },
        );
      }
      if (scatterRef.current) {
        const n = Math.max(1, Math.ceil(charts.maeR.length * Math.max(0.02, progress)));
        drawScatter(
          scatterRef.current,
          charts.maeR.subarray(0, n),
          charts.mfeR.subarray(0, n),
          charts.outcome.subarray(0, n),
        );
      }
      const hourData =
        progress < 1 ? scaleByProgress(hourBars, progress) : hourBars;
      const weekdayData =
        progress < 1 ? scaleByProgress(weekdayBars, progress) : weekdayBars;
      if (hourRef.current) {
        drawBars(
          hourRef.current,
          hourData,
          Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? String(i) : '')),
        );
      }
      if (weekdayRef.current) {
        drawBars(
          weekdayRef.current,
          weekdayData,
          ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
        );
      }
      if (sessionRef.current) {
        drawBars(
          sessionRef.current,
          progress < 1 ? scaleByProgress(buckets.session, progress) : buckets.session,
          buckets.sessionLabels,
        );
      }
      if (symbolRef.current && buckets.symbolValues.length > 0) {
        drawHBars(
          symbolRef.current,
          progress < 1
            ? scaleByProgress(buckets.symbolValues, progress)
            : buckets.symbolValues,
          buckets.symbolLabels,
        );
      }
      if (exitRef.current) {
        drawHBars(
          exitRef.current,
          progress < 1 ? scaleByProgress(buckets.exitValues, progress) : buckets.exitValues,
          buckets.exitLabels,
        );
      }
      if (sideRef.current) {
        drawBars(
          sideRef.current,
          progress < 1 ? scaleByProgress(buckets.sideValues, progress) : buckets.sideValues,
          [`Long (${charts.longN})`, `Short (${charts.shortN})`],
        );
      }
      if (monthRef.current) {
        const monthCount = Math.max(1, Math.ceil(buckets.month.length * progress));
        drawMonthHeatmap(monthRef.current, buckets.month.slice(0, monthCount));
      }
      if (holdRef.current) {
        const winN = Math.max(1, Math.ceil(charts.holdWinSec.length * progress));
        const lossN = Math.max(1, Math.ceil(charts.holdLossSec.length * progress));
        drawHoldCompare(
          holdRef.current,
          charts.holdWinSec.subarray(0, winN),
          charts.holdLossSec.subarray(0, lossN),
        );
      }
      if (streakRef.current) {
        const runN = Math.max(1, Math.ceil(charts.streakRuns.length * progress));
        drawStreakStrip(
          streakRef.current,
          charts.streakRuns.subarray(0, runN),
          charts.streaks,
        );
      }
    };

    const cancelAnim = runChartAnimation(paintAt, { durationMs: 1100 });
    const onResize = () => paintAt(1);
    const ro = new ResizeObserver(onResize);
    if (boardRef.current) ro.observe(boardRef.current);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnim();
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [equity, charts, buckets, hourBars, weekdayBars]);

  const byGroup = useMemo(() => {
    const g = new Map<string, MetricResult[]>();
    for (const m of metrics) {
      const def = METRIC_CATALOG[m.id - 1];
      const key = def?.group ?? '?';
      const list = g.get(key) ?? [];
      list.push(m);
      g.set(key, list);
    }
    return g;
  }, [metrics]);

  const kpi = useMemo(() => {
    const get = (id: number) => metrics.find((m) => m.id === id);
    return {
      netPnl: get(1),
      winRate: get(15),
      expectancy: get(25),
      profitFactor: get(4),
      maxDd: get(46),
      sqn: get(28),
    };
  }, [metrics]);

  const clearTooltip = useCallback(() => setTooltip(null), []);

  const openTradeAt = useCallback((tradeIndex: number) => {
    setFocusIndex(tradeIndex);
    setShowTrades(true);
    setShowNumbers(false);
  }, []);

  const onEquityMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!equity || !store) return;
      const canvas = equityRef.current;
      if (!canvas) return;
      const idx = hitSeriesIndex(canvas, e.clientX, e.clientY, equity.t.length);
      if (idx == null) {
        clearTooltip();
        return;
      }
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        lines: [
          fmtTime(equity.t[idx]!),
          fmtMoney(equity.e[idx]!, store.accountCurrency),
          `DD ${equity.dd[idx]!.toFixed(2)}%`,
        ],
      });
    },
    [equity, store, clearTooltip],
  );

  const onEquityClick = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!equity || !charts) return;
      const canvas = equityRef.current;
      if (!canvas) return;
      const idx = hitSeriesIndex(canvas, e.clientX, e.clientY, equity.t.length);
      if (idx == null) return;
      const pathLen = charts.pathTradeIndex.length;
      if (pathLen === 0) return;
      const pathIdx = Math.min(pathLen - 1, Math.round((idx / Math.max(1, equity.t.length - 1)) * (pathLen - 1)));
      openTradeAt(charts.pathTradeIndex[pathIdx]!);
    },
    [equity, charts, openTradeAt],
  );

  const onCumRMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!charts || !store) return;
      const canvas = cumRRef.current;
      if (!canvas) return;
      const idx = hitSeriesIndex(canvas, e.clientX, e.clientY, charts.cumR.length);
      if (idx == null) {
        clearTooltip();
        return;
      }
      const ti = charts.pathTradeIndex[idx];
      const lines = [`Cum R ${charts.cumR[idx]!.toFixed(2)}`];
      if (ti != null) {
        lines.push(
          fmtMoney(store.netPnl[ti]!, store.accountCurrency),
          store.symbols[store.symbolId[ti]!] ?? '—',
        );
      }
      setTooltip({ x: e.clientX, y: e.clientY, lines });
    },
    [charts, store, clearTooltip],
  );

  const onCumRClick = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!charts) return;
      const canvas = cumRRef.current;
      if (!canvas) return;
      const idx = hitSeriesIndex(canvas, e.clientX, e.clientY, charts.cumR.length);
      if (idx == null) return;
      openTradeAt(charts.pathTradeIndex[idx]!);
    },
    [charts, openTradeAt],
  );

  const onScatterMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!charts || !store) return;
      const canvas = scatterRef.current;
      if (!canvas) return;
      const idx = hitScatterNearest(
        canvas,
        e.clientX,
        e.clientY,
        charts.maeR,
        charts.mfeR,
      );
      if (idx == null) {
        clearTooltip();
        return;
      }
      const ti = charts.scatterTradeIndex[idx]!;
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        lines: [
          `MAE ${charts.maeR[idx]!.toFixed(2)}R · MFE ${charts.mfeR[idx]!.toFixed(2)}R`,
          fmtMoney(store.netPnl[ti]!, store.accountCurrency),
          store.symbols[store.symbolId[ti]!] ?? '—',
        ],
      });
    },
    [charts, store, clearTooltip],
  );

  const onScatterClick = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!charts) return;
      const canvas = scatterRef.current;
      if (!canvas) return;
      const idx = hitScatterNearest(
        canvas,
        e.clientX,
        e.clientY,
        charts.maeR,
        charts.mfeR,
      );
      if (idx == null) return;
      openTradeAt(charts.scatterTradeIndex[idx]!);
    },
    [charts, openTradeAt],
  );

  const onHourMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = hourRef.current;
      if (!canvas) return;
      const idx = hitBarIndex(canvas, e.clientX, e.clientY, 24);
      if (idx == null) {
        clearTooltip();
        return;
      }
      const label = useLocalTz ? `Hour ${idx} (local)` : `Hour ${idx} UTC`;
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        lines: [label, `Net P&L ${hourBars[idx]!.toFixed(2)}`],
      });
    },
    [hourBars, useLocalTz, clearTooltip],
  );

  const onMonthMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!buckets) return;
      const canvas = monthRef.current;
      if (!canvas) return;
      const cell = hitMonthCell(canvas, buckets.month, e.clientX, e.clientY);
      if (!cell) {
        clearTooltip();
        return;
      }
      const wr = cell.n > 0 ? ((cell.wins / cell.n) * 100).toFixed(1) : '—';
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        lines: [
          cell.key,
          `Net ${cell.netPnl.toFixed(2)} · n=${cell.n}`,
          `Win rate ${wr}%`,
        ],
      });
    },
    [buckets, clearTooltip],
  );

  const onMonthClick = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!buckets) return;
      const canvas = monthRef.current;
      if (!canvas) return;
      const cell = hitMonthCell(canvas, buckets.month, e.clientX, e.clientY);
      if (!cell) return;
      const { fromTime, toTime } = monthKeyToRange(cell.key);
      setFilter((f) => ({ ...f, fromTime, toTime }));
    },
    [buckets],
  );

  const toggleSymbol = useCallback(
    (sym: string) => {
      if (!store) return;
      setFilter((f) => {
        const all = store.symbols;
        if (f.symbols == null) {
          const next = new Set(all);
          next.delete(sym);
          return { ...f, symbols: next.size === 0 ? null : next };
        }
        const next = new Set(f.symbols);
        if (next.has(sym)) next.delete(sym);
        else next.add(sym);
        if (next.size === 0 || next.size === all.length) {
          return { ...f, symbols: null };
        }
        return { ...f, symbols: next };
      });
    },
    [store],
  );

  const symbolActive = useCallback(
    (sym: string) => filter.symbols == null || filter.symbols.has(sym),
    [filter.symbols],
  );

  if (!store) {
    return (
      <div className="p-4 space-y-3 h-full">
        <p className="text-sm text-muted">
          {allowDemo
            ? 'No closed replay trades yet. Place orders and let them close, or load a demo sample.'
            : 'No closed trades yet. Open a backtest, place orders, then return here.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {allowDemo && (
            <Button variant="primary" className="min-h-11" onPress={() => setSource('demo')}>
              Load 5k demo trades
            </Button>
          )}
          {onOpenJournal && (
            <Button variant="secondary" className="min-h-11" onPress={onOpenJournal}>
              Open Trades
            </Button>
          )}
        </div>
      </div>
    );
  }

  const toolbar = (
    <>
      <header className="shrink-0 flex flex-wrap items-center gap-2 px-2 sm:px-3 py-1.5 border-b border-border">
        {!immersive && <h2 className="text-sm font-semibold">Analytics</h2>}
        {!sessionId && source === 'journal' && journalViews.length > 1 && (
          <select
            className="min-h-9 text-[12px] rounded-md border border-border bg-surface px-2 py-1 max-w-[min(100%,220px)]"
            value={selectedJournalId}
            onChange={(e) =>
              setSelectedJournalId(
                e.target.value === 'all' ? 'all' : e.target.value,
              )
            }
            aria-label="Trades session"
          >
            <option value="all">All sessions</option>
            {journalViews.map((v) => (
              <option key={v.sessionId} value={v.sessionId}>
                {v.sessionName} · {v.symbol} ({v.trades.length})
              </option>
            ))}
          </select>
        )}
        <span className="text-[11px] text-muted tabular-nums">
          {indices.length.toLocaleString()} / {store.n.toLocaleString()} trades
          {elapsed != null ? ` · ${elapsed.toFixed(0)} ms` : ''}
          {busy ? ' · computing…' : ''}
        </span>
        {warnings[0] && (
          <span className="text-[11px] text-danger truncate max-w-[40vw]" title={warnings[0]}>
            {warnings[0]}
          </span>
        )}
        <div className="flex flex-wrap gap-1 ml-auto">
          {allowDemo && (
            <>
              <Button
                size="sm"
                variant={source === 'journal' ? 'primary' : 'ghost'}
                className="min-h-11 sm:min-h-8"
                onPress={() => setSource('journal')}
              >
                Saved
              </Button>
              <Button
                size="sm"
                variant={source === 'demo' ? 'primary' : 'ghost'}
                className="min-h-11 sm:min-h-8"
                onPress={() => setSource('demo')}
              >
                Demo 5k
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={showNumbers ? 'primary' : 'ghost'}
            className="min-h-11 sm:min-h-8"
            onPress={() => {
              setShowNumbers((v) => !v);
              setShowTrades(false);
            }}
          >
            Numbers
          </Button>
          <Button
            size="sm"
            variant={showTrades ? 'primary' : 'ghost'}
            className="min-h-11 sm:min-h-8"
            onPress={() => {
              setShowTrades((v) => !v);
              setShowNumbers(false);
            }}
          >
            Trades
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 sm:min-h-8"
            onPress={() => void exportFilteredCsv(store, indices)}
          >
            CSV
          </Button>
          {onOpenJournal && (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 sm:min-h-8"
              onPress={onOpenJournal}
              aria-label="Open Trades"
            >
              Log
            </Button>
          )}
          {onClose && (
            <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onPress={onClose}>
              ✕
            </Button>
          )}
        </div>
      </header>

      <div className="shrink-0 flex flex-wrap gap-x-3 gap-y-1.5 px-2 sm:px-3 py-1.5 border-b border-border text-[12px]">
        <label className="flex items-center gap-1.5 min-h-9">
          <input
            type="checkbox"
            checked={filter.sides.long}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                sides: { ...f.sides, long: e.target.checked },
              }))
            }
          />
          Long
        </label>
        <label className="flex items-center gap-1.5 min-h-9">
          <input
            type="checkbox"
            checked={filter.sides.short}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                sides: { ...f.sides, short: e.target.checked },
              }))
            }
          />
          Short
        </label>
        <label className="flex items-center gap-1.5 min-h-9">
          <input
            type="checkbox"
            checked={filter.hideAmbiguous}
            onChange={(e) =>
              setFilter((f) => ({ ...f, hideAmbiguous: e.target.checked }))
            }
          />
          Hide ambiguous
        </label>
        <label className="flex items-center gap-1.5 min-h-9">
          <input
            type="checkbox"
            checked={useLocalTz}
            onChange={(e) => setUseLocalTz(e.target.checked)}
          />
          Local TZ
        </label>
        <label className="flex items-center gap-1.5 min-h-9">
          <span className="text-muted">From</span>
          <input
            type="date"
            className="min-h-9 rounded border border-border bg-surface px-1.5"
            value={unixToDateInput(filter.fromTime)}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                fromTime: dateInputToUnixStart(e.target.value),
              }))
            }
          />
        </label>
        <label className="flex items-center gap-1.5 min-h-9">
          <span className="text-muted">To</span>
          <input
            type="date"
            className="min-h-9 rounded border border-border bg-surface px-1.5"
            value={unixToDateInput(filter.toTime)}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                toTime: dateInputToUnixEnd(e.target.value),
              }))
            }
          />
        </label>
        {(filter.fromTime != null || filter.toTime != null) && (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-9"
            onPress={() =>
              setFilter((f) => ({ ...f, fromTime: null, toTime: null }))
            }
          >
            Clear dates
          </Button>
        )}
        {store.symbols.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto">
            <span className="text-muted mr-0.5">Symbols</span>
            {store.symbols.map((sym) => (
              <button
                key={sym}
                type="button"
                className={[
                  'min-h-9 px-2.5 rounded-full border text-[11px] transition-colors',
                  symbolActive(sym)
                    ? 'border-accent bg-accent/15 text-foreground'
                    : 'border-border bg-surface text-muted',
                ].join(' ')}
                onClick={() => toggleSymbol(sym)}
              >
                {sym}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const kpiRow = (
    <div
      className={[
        'grid gap-1.5 sm:gap-2',
        immersive
          ? 'grid-cols-3 sm:grid-cols-6 shrink-0 px-2 sm:px-3 pt-2'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
      ].join(' ')}
    >
      <Kpi
        label="Net P&L"
        value={fmt(kpi.netPnl)}
        low={kpi.netPnl?.lowSample}
        title={kpi.netPnl ? `min N=${kpi.netPnl.minSampleSize}` : undefined}
        animate={immersive}
      />
      <Kpi
        label="Win rate"
        value={fmt(kpi.winRate)}
        low={kpi.winRate?.lowSample}
        title={kpi.winRate ? `min N=${kpi.winRate.minSampleSize}` : undefined}
        animate={immersive}
      />
      <Kpi
        label="Expectancy R"
        value={fmt(kpi.expectancy)}
        low={kpi.expectancy?.lowSample}
        title={kpi.expectancy ? `min N=${kpi.expectancy.minSampleSize}` : undefined}
        animate={immersive}
      />
      <Kpi
        label="Profit factor"
        value={fmt(kpi.profitFactor)}
        low={kpi.profitFactor?.lowSample}
        title={kpi.profitFactor ? `min N=${kpi.profitFactor.minSampleSize}` : undefined}
        animate={immersive}
      />
      <Kpi
        label="Max DD"
        value={fmt(kpi.maxDd)}
        low={kpi.maxDd?.lowSample}
        title={kpi.maxDd ? `min N=${kpi.maxDd.minSampleSize}` : undefined}
        animate={immersive}
      />
      <Kpi
        label="SQN"
        value={fmt(kpi.sqn)}
        low={kpi.sqn?.lowSample}
        title={kpi.sqn ? `min N=${kpi.sqn.minSampleSize}` : undefined}
        animate={immersive}
      />
    </div>
  );

  const canvasFill = 'w-full h-full min-h-0 block touch-none';

  const chartBoard = immersive ? (
    <div
      ref={boardRef}
      className={[
        'flex-1 min-h-0 min-w-0 px-2 sm:px-3 pb-2 pt-1.5',
        'grid gap-1.5 sm:gap-2',
        'overflow-y-auto sm:overflow-hidden',
        'sm:grid-cols-4',
        'sm:grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.85fr)]',
        '[perspective:1600px]',
      ].join(' ')}
    >
      <ChartCard title="Equity curve" desc="Closed-trade balance · click trade" className="sm:col-span-2 sm:row-span-1 min-h-[160px] sm:min-h-0" tilt>
        <canvas
          ref={equityRef}
          className={canvasFill}
          onPointerMove={onEquityMove}
          onPointerLeave={clearTooltip}
          onClick={onEquityClick}
        />
      </ChartCard>
      <ChartCard title="Drawdown" desc="Underwater %" className="min-h-[140px] sm:min-h-0" tilt>
        <canvas ref={ddRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Cumulative R" desc="Edge over time · click trade" className="min-h-[140px] sm:min-h-0" tilt>
        <canvas
          ref={cumRRef}
          className={canvasFill}
          onPointerMove={onCumRMove}
          onPointerLeave={clearTooltip}
          onClick={onCumRClick}
        />
      </ChartCard>

      <ChartCard title="MFE / MAE" desc="Win green · Loss red · click trade" className="sm:col-span-2 min-h-[160px] sm:min-h-0" tilt>
        <canvas
          ref={scatterRef}
          className={canvasFill}
          onPointerMove={onScatterMove}
          onPointerLeave={clearTooltip}
          onClick={onScatterClick}
        />
      </ChartCard>
      <ChartCard title="R distribution" desc="0R centerline" className="min-h-[140px] sm:min-h-0" tilt>
        <canvas ref={rHistRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="P&L distribution" desc="Dollar outcomes" className="min-h-[140px] sm:min-h-0" tilt>
        <canvas ref={pnlHistRef} className={canvasFill} />
      </ChartCard>

      <ChartCard title={useLocalTz ? 'Hour (local)' : 'Hour (UTC)'} desc="Intraday edge" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas
          ref={hourRef}
          className={canvasFill}
          onPointerMove={onHourMove}
          onPointerLeave={clearTooltip}
        />
      </ChartCard>
      <ChartCard title={useLocalTz ? 'Weekday (local)' : 'Weekday (UTC)'} desc="Day-of-week edge" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={weekdayRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Session" desc="Asia · Lon · NY" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={sessionRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Long vs Short" desc="Net by side" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={sideRef} className={canvasFill} />
      </ChartCard>

      <ChartCard title="By symbol" desc="Net P&L" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={symbolRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Exit reasons" desc="How trades closed" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={exitRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Monthly P&L" desc="Click month to filter" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas
          ref={monthRef}
          className={canvasFill}
          onPointerMove={onMonthMove}
          onPointerLeave={clearTooltip}
          onClick={onMonthClick}
        />
      </ChartCard>
      <ChartCard title="Hold time" desc="Win vs loss duration" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={holdRef} className={canvasFill} />
      </ChartCard>

      <ChartCard title="Streak runs" desc="Win/loss sequences" className="sm:col-span-2 min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={streakRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Rolling WR (20)" desc="50% baseline" className="sm:col-span-2 min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={rollRef} className={canvasFill} />
      </ChartCard>
    </div>
  ) : (
    <div ref={boardRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
      {kpiRow}
      <ChartCard title="Equity curve" desc="Closed-trade account balance · click trade" wide>
        <canvas
          ref={equityRef}
          className="w-full h-52 sm:h-64 block touch-none"
          onPointerMove={onEquityMove}
          onPointerLeave={clearTooltip}
          onClick={onEquityClick}
        />
      </ChartCard>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Drawdown" desc="Underwater">
          <canvas ref={ddRef} className="w-full h-44 block" />
        </ChartCard>
        <ChartCard title="Cumulative R" desc="Edge over time · click trade">
          <canvas
            ref={cumRRef}
            className="w-full h-44 block touch-none"
            onPointerMove={onCumRMove}
            onPointerLeave={clearTooltip}
            onClick={onCumRClick}
          />
        </ChartCard>
        <ChartCard title="Rolling win rate" desc="20-trade window">
          <canvas ref={rollRef} className="w-full h-40 block" />
        </ChartCard>
        <ChartCard title="Long vs Short" desc="Net by side">
          <canvas ref={sideRef} className="w-full h-40 block" />
        </ChartCard>
        <ChartCard title="R distribution" desc="Histogram">
          <canvas ref={rHistRef} className="w-full h-44 block" />
        </ChartCard>
        <ChartCard title="P&L distribution" desc="Dollar outcomes">
          <canvas ref={pnlHistRef} className="w-full h-44 block" />
        </ChartCard>
        <ChartCard title="MFE / MAE" desc="Scatter · click trade" wide>
          <canvas
            ref={scatterRef}
            className="w-full h-56 block touch-none"
            onPointerMove={onScatterMove}
            onPointerLeave={clearTooltip}
            onClick={onScatterClick}
          />
        </ChartCard>
        <ChartCard title={useLocalTz ? 'Hour (local)' : 'Hour (UTC)'} desc="Intraday">
          <canvas
            ref={hourRef}
            className="w-full h-40 block touch-none"
            onPointerMove={onHourMove}
            onPointerLeave={clearTooltip}
          />
        </ChartCard>
        <ChartCard title={useLocalTz ? 'Weekday (local)' : 'Weekday (UTC)'} desc="Day-of-week">
          <canvas ref={weekdayRef} className="w-full h-40 block" />
        </ChartCard>
        <ChartCard title="Session" desc="UTC buckets">
          <canvas ref={sessionRef} className="w-full h-40 block" />
        </ChartCard>
        <ChartCard title="By symbol" desc="Net P&L">
          <canvas ref={symbolRef} className="w-full h-44 block" />
        </ChartCard>
        <ChartCard title="Exit reasons" desc="Counts">
          <canvas ref={exitRef} className="w-full h-44 block" />
        </ChartCard>
        <ChartCard title="Monthly P&L" desc="Click month to filter">
          <canvas
            ref={monthRef}
            className="w-full h-44 block touch-none"
            onPointerMove={onMonthMove}
            onPointerLeave={clearTooltip}
            onClick={onMonthClick}
          />
        </ChartCard>
        <ChartCard title="Hold time" desc="Win vs loss">
          <canvas ref={holdRef} className="w-full h-44 block" />
        </ChartCard>
        <ChartCard title="Streak runs" desc="Sequences">
          <canvas ref={streakRef} className="w-full h-40 block" />
        </ChartCard>
      </div>
    </div>
  );

  return (
    <div className="relative flex flex-col min-h-0 h-full w-full overflow-hidden bg-background">
      {toolbar}
      {immersive && kpiRow}
      {chartBoard}

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-surface/95 px-2.5 py-1.5 text-[11px] shadow-lg tabular-nums"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          {tooltip.lines.map((line) => (
            <p key={line} className="leading-snug whitespace-nowrap">
              {line}
            </p>
          ))}
        </div>
      )}

      {(showNumbers || showTrades) && (
        <div className="absolute inset-0 z-20 flex flex-col bg-background/95 backdrop-blur-sm">
          <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border">
            <p className="text-sm font-semibold">
              {showNumbers ? 'All metrics' : 'Trade list'}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 sm:min-h-8"
              onPress={() => {
                setShowNumbers(false);
                setShowTrades(false);
                setFocusIndex(null);
              }}
            >
              Back to charts
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
            {showNumbers &&
              ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((g) => {
                const list = byGroup.get(g);
                if (!list?.length) return null;
                return (
                  <section key={g} className="space-y-2">
                    <h3 className="text-[11px] uppercase tracking-wide text-muted">
                      Group {g}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                      {list.map((m) => {
                        const def = METRIC_CATALOG[m.id - 1];
                        if (m.value == null && !m.infinite && m.id >= 71 && m.id <= 74) {
                          return null;
                        }
                        return (
                          <MetricTile
                            key={m.id}
                            label={def?.label ?? m.key}
                            value={m.infinite ? '—' : fmt(m)}
                            n={m.n}
                            low={m.lowSample}
                            title={`${def?.formula ?? ''}\nmin N=${m.minSampleSize}`}
                          />
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            {showTrades && (
              <div className="min-h-[320px] flex flex-col">
                <TradeListVirtual
                  store={store}
                  indices={indices}
                  focusIndex={focusIndex}
                  onRowClick={(ti) => setFocusIndex(ti)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  desc,
  children,
  wide,
  className = '',
  tilt = false,
}: {
  title: string;
  desc: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  tilt?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  const onMove = (e: ReactPointerEvent) => {
    if (!tilt || !ref.current) return;
    if (window.matchMedia('(hover: none)').matches) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setStyle({
      transform: `rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateZ(0)`,
      transition: 'transform 80ms linear',
    });
  };

  const onLeave = () => {
    setStyle({
      transform: 'rotateX(0deg) rotateY(0deg)',
      transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
    });
  };

  return (
    <div
      ref={ref}
      className={[
        'min-h-0 min-w-0 flex flex-col rounded-xl border border-border',
        'bg-surface/90 shadow-[0_8px_28px_rgba(0,0,0,0.35)]',
        'origin-center will-change-transform',
        wide ? 'lg:col-span-2' : '',
        className,
      ].join(' ')}
      style={tilt ? style : undefined}
      onPointerMove={tilt ? onMove : undefined}
      onPointerLeave={tilt ? onLeave : undefined}
    >
      <div className="shrink-0 px-2.5 pt-2 pb-0.5">
        <p className="text-[12px] font-semibold leading-tight">{title}</p>
        <p className="text-[10px] text-muted truncate">{desc}</p>
      </div>
      <div className="flex-1 min-h-0 px-1.5 pb-1.5">{children}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  low,
  title,
  animate,
}: {
  label: string;
  value: string;
  low?: boolean;
  title?: string;
  animate?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-lg border border-border bg-surface px-2.5 py-2',
        low ? 'opacity-55 italic' : '',
        animate ? 'animate-[analyticsKpiIn_0.55s_cubic-bezier(0.22,1,0.36,1)_both]' : '',
      ].join(' ')}
      title={title}
    >
      <p className="text-[9px] sm:text-[10px] text-muted uppercase tracking-wide">{label}</p>
      <p className="text-sm sm:text-base font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function fmt(m?: MetricResult): string {
  if (!m) return '—';
  if (m.infinite) return '—';
  if (m.value == null || !Number.isFinite(m.value)) return '—';
  const abs = Math.abs(m.value);
  if (m.unit === '%') return `${m.value.toFixed(2)}%`;
  if (abs >= 1000) return m.value.toFixed(0);
  if (abs >= 10) return m.value.toFixed(2);
  return m.value.toFixed(3);
}

function MetricTile({
  label,
  value,
  n,
  low,
  title,
}: {
  label: string;
  value: string;
  n: number;
  low?: boolean;
  title: string;
}) {
  return (
    <div
      className={[
        'rounded-md border border-border bg-background px-2.5 py-2 min-h-11',
        low ? 'opacity-55 italic' : '',
      ].join(' ')}
      title={title}
    >
      <p className="text-[10px] text-muted leading-tight">{label}</p>
      <p className="text-[13px] font-medium tabular-nums mt-0.5">{value}</p>
      <p className="text-[9px] text-muted">
        n={n}
        {low ? ' · low sample' : ''}
      </p>
    </div>
  );
}
