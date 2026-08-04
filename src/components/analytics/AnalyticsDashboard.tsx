import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Button } from '@heroui/react';
import { METRIC_CATALOG } from '@/analytics/catalog';
import {
  runChartAnimation,
  scaleByProgress,
  sliceByProgress,
} from '@/analytics/charts/animateDraw';
import { drawEquityChart, drawUnderwater } from '@/analytics/charts/drawEquity';
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

type ChartPack = {
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
};

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
  const [showNumbers, setShowNumbers] = useState(false);
  const [showTrades, setShowTrades] = useState(false);

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const views = listOrderJournalViews(liveJournal).filter((v) => v.trades.length > 0);
    if (views.length === 0) {
      setStore(null);
      return;
    }
    const closed = views
      .flatMap((v) => orderJournalToClosedTrades(v))
      .sort((a, b) => a.closeTime - b.closeTime);
    let bal = views[0]!.startBalance;
    for (const t of closed) {
      bal += t.netPnl;
      t.balanceAfter = bal;
    }
    setStore(
      buildTradeStore(closed, {
        accountCurrency: views[0]!.accountCurrency,
        initialBalance: views[0]!.startBalance,
      }),
    );
  }, [source, liveJournal, sessionId, allowDemo]);

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
      if (hourRef.current) {
        drawBars(
          hourRef.current,
          progress < 1 ? scaleByProgress(buckets.hour, progress) : buckets.hour,
          Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? String(i) : '')),
        );
      }
      if (weekdayRef.current) {
        drawBars(
          weekdayRef.current,
          progress < 1 ? scaleByProgress(buckets.weekday, progress) : buckets.weekday,
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
  }, [equity, charts, buckets]);

  const indices = useMemo(() => {
    if (!store) return new Uint32Array(0);
    return selectedIndices(computeFilterMask(store, filter), store.n);
  }, [store, filter]);

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
              Open Journal
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
        <span className="text-[11px] text-muted tabular-nums">
          {store.n.toLocaleString()} trades
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
                Journal
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

      <div className="shrink-0 flex flex-wrap gap-3 px-2 sm:px-3 py-1 border-b border-border text-[12px]">
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
      <Kpi label="Net P&L" value={fmt(kpi.netPnl)} animate={immersive} />
      <Kpi label="Win rate" value={fmt(kpi.winRate)} animate={immersive} />
      <Kpi label="Expectancy R" value={fmt(kpi.expectancy)} animate={immersive} />
      <Kpi label="Profit factor" value={fmt(kpi.profitFactor)} animate={immersive} />
      <Kpi label="Max DD" value={fmt(kpi.maxDd)} animate={immersive} />
      <Kpi label="SQN" value={fmt(kpi.sqn)} animate={immersive} />
    </div>
  );

  const canvasFill = 'w-full h-full min-h-0 block';

  const chartBoard = immersive ? (
    <div
      ref={boardRef}
      className={[
        'flex-1 min-h-0 min-w-0 px-2 sm:px-3 pb-2 pt-1.5',
        'grid gap-1.5 sm:gap-2',
        // Mobile: allow vertical scroll. Desktop: lock to viewport.
        'overflow-y-auto sm:overflow-hidden',
        'sm:grid-cols-4 sm:grid-rows-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.95fr)]',
        '[perspective:1600px]',
      ].join(' ')}
    >
      <ChartCard title="Equity curve" desc="Closed-trade balance" className="sm:col-span-2 sm:row-span-1 min-h-[160px] sm:min-h-0" tilt>
        <canvas ref={equityRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Drawdown" desc="Underwater %" className="min-h-[140px] sm:min-h-0" tilt>
        <canvas ref={ddRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Cumulative R" desc="Edge over time" className="min-h-[140px] sm:min-h-0" tilt>
        <canvas ref={cumRRef} className={canvasFill} />
      </ChartCard>

      <ChartCard title="MFE / MAE" desc="Win green · Loss red" className="sm:col-span-2 min-h-[160px] sm:min-h-0" tilt>
        <canvas ref={scatterRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="R distribution" desc="0R centerline" className="min-h-[140px] sm:min-h-0" tilt>
        <canvas ref={rHistRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="P&L distribution" desc="Dollar outcomes" className="min-h-[140px] sm:min-h-0" tilt>
        <canvas ref={pnlHistRef} className={canvasFill} />
      </ChartCard>

      <ChartCard title="Hour (UTC)" desc="Intraday edge" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={hourRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Weekday" desc="UTC" className="min-h-[120px] sm:min-h-0" tilt>
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
      <ChartCard title="Rolling WR (20)" desc="50% baseline" className="min-h-[120px] sm:min-h-0" tilt>
        <canvas ref={rollRef} className={canvasFill} />
      </ChartCard>
      <ChartCard title="Live filters" desc="Toggle Long / Short above" className="min-h-[120px] sm:min-h-0 hidden sm:flex" tilt>
        <div className="h-full flex items-center justify-center text-xs text-muted px-3 text-center">
          Charts re-animate when filters or data change
        </div>
      </ChartCard>
    </div>
  ) : (
    <div ref={boardRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
      {kpiRow}
      <ChartCard title="Equity curve" desc="Closed-trade account balance" wide>
        <canvas ref={equityRef} className="w-full h-52 sm:h-64 block" />
      </ChartCard>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Drawdown" desc="Underwater">
          <canvas ref={ddRef} className="w-full h-44 block" />
        </ChartCard>
        <ChartCard title="Cumulative R" desc="Edge over time">
          <canvas ref={cumRRef} className="w-full h-44 block" />
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
        <ChartCard title="MFE / MAE" desc="Scatter" wide>
          <canvas ref={scatterRef} className="w-full h-56 block" />
        </ChartCard>
        <ChartCard title="Hour" desc="UTC">
          <canvas ref={hourRef} className="w-full h-40 block" />
        </ChartCard>
        <ChartCard title="Weekday" desc="UTC">
          <canvas ref={weekdayRef} className="w-full h-40 block" />
        </ChartCard>
        <ChartCard title="Session" desc="UTC">
          <canvas ref={sessionRef} className="w-full h-40 block" />
        </ChartCard>
        <ChartCard title="By symbol" desc="Net P&L">
          <canvas ref={symbolRef} className="w-full h-44 block" />
        </ChartCard>
        <ChartCard title="Exit reasons" desc="Counts">
          <canvas ref={exitRef} className="w-full h-44 block" />
        </ChartCard>
      </div>
    </div>
  );

  return (
    <div className="relative flex flex-col min-h-0 h-full w-full overflow-hidden bg-background">
      {toolbar}
      {immersive && kpiRow}
      {chartBoard}

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
                <TradeListVirtual store={store} indices={indices} />
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
  animate,
}: {
  label: string;
  value: string;
  animate?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-lg border border-border bg-surface px-2.5 py-2',
        animate ? 'animate-[analyticsKpiIn_0.55s_cubic-bezier(0.22,1,0.36,1)_both]' : '',
      ].join(' ')}
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
