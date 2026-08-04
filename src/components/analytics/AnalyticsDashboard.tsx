import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Card } from '@heroui/react';
import { METRIC_CATALOG } from '@/analytics/catalog';
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
  /** When false, hide demo fixture controls (Dashboard shell). Default true for chart overlay. */
  allowDemo?: boolean;
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
 * Chart-first analytics dashboard. Numbers are secondary; visuals carry the story.
 */
export function AnalyticsDashboard({
  liveJournal,
  sessionId,
  onClose,
  onOpenJournal,
  allowDemo = true,
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

  // Paint all canvases when data arrives (and on resize).
  useEffect(() => {
    const paint = () => {
      if (equity && equityRef.current) {
        drawEquityChart(equityRef.current, equity.t, equity.e, equity.dd);
      }
      if (equity && ddRef.current) drawUnderwater(ddRef.current, equity.dd);
      if (charts?.cumR && cumRRef.current) drawLineSeries(cumRRef.current, charts.cumR);
      if (charts?.rollingWr && rollRef.current) {
        drawRollingLine(rollRef.current, charts.rollingWr, 0.5);
      }
      if (charts?.rValues && rHistRef.current) {
        drawHistogram(rHistRef.current, charts.rValues, undefined, {
          diverging: true,
          bins: 40,
        });
      }
      if (charts?.netPnl && pnlHistRef.current) {
        drawHistogram(pnlHistRef.current, charts.netPnl, undefined, {
          diverging: true,
          bins: 36,
        });
      }
      if (charts && scatterRef.current) {
        drawScatter(scatterRef.current, charts.maeR, charts.mfeR, charts.outcome);
      }
      if (buckets && hourRef.current) {
        drawBars(
          hourRef.current,
          buckets.hour,
          Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? String(i) : '')),
        );
      }
      if (buckets && weekdayRef.current) {
        drawBars(weekdayRef.current, buckets.weekday, [
          'Su',
          'Mo',
          'Tu',
          'We',
          'Th',
          'Fr',
          'Sa',
        ]);
      }
      if (buckets && sessionRef.current) {
        drawBars(sessionRef.current, buckets.session, buckets.sessionLabels);
      }
      if (buckets && symbolRef.current && buckets.symbolValues.length > 0) {
        drawHBars(symbolRef.current, buckets.symbolValues, buckets.symbolLabels);
      }
      if (buckets && exitRef.current) {
        drawHBars(exitRef.current, buckets.exitValues, buckets.exitLabels);
      }
      if (buckets && sideRef.current) {
        drawBars(sideRef.current, buckets.sideValues, [
          `Long (${charts?.longN ?? 0})`,
          `Short (${charts?.shortN ?? 0})`,
        ]);
      }
    };
    paint();
    const ro = new ResizeObserver(() => paint());
    const root = equityRef.current?.parentElement?.parentElement;
    if (root) ro.observe(root);
    window.addEventListener('resize', paint);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', paint);
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
      <div className="p-4 space-y-3">
        <p className="text-sm text-muted">
          {allowDemo
            ? 'No closed replay trades yet. Place orders and let them close, or load a demo sample.'
            : 'No closed trades yet. Open a backtest, place orders, then return here.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {allowDemo && (
            <Button
              variant="primary"
              className="min-h-11"
              onPress={() => setSource('demo')}
            >
              Load 5k demo trades
            </Button>
          )}
          {onOpenJournal && (
            <Button variant="secondary" className="min-h-11" onPress={onOpenJournal}>
              Open Journal
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" className="min-h-11" onPress={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden bg-background">
      <header className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
        <h2 className="text-sm font-semibold">Analytics</h2>
        <span className="text-[11px] text-muted tabular-nums">
          {store.n.toLocaleString()} trades
          {elapsed != null ? ` · ${elapsed.toFixed(0)} ms` : ''}
          {busy ? ' · computing…' : ''}
        </span>
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
            onPress={() => setShowNumbers((v) => !v)}
          >
            {showNumbers ? 'Hide numbers' : 'All numbers'}
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
              Trade log
            </Button>
          )}
          {onClose && (
            <Button size="sm" variant="ghost" className="min-h-11 sm:min-h-8" onPress={onClose}>
              ✕
            </Button>
          )}
        </div>
      </header>

      <div className="shrink-0 flex flex-wrap gap-2 px-3 py-2 border-b border-border text-[12px]">
        <label className="flex items-center gap-1.5 min-h-11">
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
        <label className="flex items-center gap-1.5 min-h-11">
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
        <label className="flex items-center gap-1.5 min-h-11">
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

      {warnings.length > 0 && (
        <div className="px-3 py-2 text-[12px] text-danger border-b border-border space-y-1">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {/* Compact KPI strip — glanceable, not the main story */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Kpi label="Net P&L" value={fmt(kpi.netPnl)} hint={METRIC_CATALOG[0]?.formula} />
          <Kpi label="Win rate" value={fmt(kpi.winRate)} hint={METRIC_CATALOG[14]?.formula} />
          <Kpi label="Expectancy R" value={fmt(kpi.expectancy)} hint={METRIC_CATALOG[24]?.formula} />
          <Kpi label="Profit factor" value={fmt(kpi.profitFactor)} hint={METRIC_CATALOG[3]?.formula} />
          <Kpi label="Max DD" value={fmt(kpi.maxDd)} hint={METRIC_CATALOG[45]?.formula} />
          <Kpi label="SQN" value={fmt(kpi.sqn)} hint={METRIC_CATALOG[27]?.formula} />
        </div>

        {/* Hero equity */}
        <ChartCard
          title="Equity curve"
          desc="Closed-trade account balance over time (not mark-to-market)"
          wide
        >
          <canvas ref={equityRef} className="w-full h-52 sm:h-64 block" />
        </ChartCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ChartCard title="Drawdown (underwater)" desc="How deep and how long below peak equity">
            <canvas ref={ddRef} className="w-full h-44 block" />
          </ChartCard>
          <ChartCard title="Cumulative R" desc="Running sum of R-multiples — edge over time">
            <canvas ref={cumRRef} className="w-full h-44 block" />
          </ChartCard>
          <ChartCard title="Rolling win rate (20)" desc="Dashed line = 50% coin-flip baseline">
            <canvas ref={rollRef} className="w-full h-40 block" />
          </ChartCard>
          <ChartCard title="Long vs Short P&L" desc="Net result by side">
            <canvas ref={sideRef} className="w-full h-40 block" />
          </ChartCard>
          <ChartCard title="R-multiple distribution" desc="Green = winners · Red = losers · line at 0R">
            <canvas ref={rHistRef} className="w-full h-44 block" />
          </ChartCard>
          <ChartCard title="P&L distribution" desc="Dollar outcome histogram">
            <canvas ref={pnlHistRef} className="w-full h-44 block" />
          </ChartCard>
          <ChartCard
            title="MFE / MAE scatter"
            desc="Each dot is a trade — winners green, losers red"
            wide
          >
            <canvas ref={scatterRef} className="w-full h-56 block" />
          </ChartCard>
          <ChartCard title="Hour of day (UTC)" desc="When you make or lose money">
            <canvas ref={hourRef} className="w-full h-40 block" />
          </ChartCard>
          <ChartCard title="Weekday (UTC)" desc="Day-of-week edge">
            <canvas ref={weekdayRef} className="w-full h-40 block" />
          </ChartCard>
          <ChartCard title="Session (UTC)" desc="Asia / London / NY / Overlap">
            <canvas ref={sessionRef} className="w-full h-40 block" />
          </ChartCard>
          <ChartCard title="By symbol" desc="Net P&L ranking">
            <canvas
              ref={symbolRef}
              className="w-full block"
              style={{ height: Math.max(140, (buckets?.symbolLabels.length ?? 1) * 28 + 40) }}
            />
          </ChartCard>
          <ChartCard title="Exit reasons" desc="How trades actually closed">
            <canvas ref={exitRef} className="w-full h-44 block" />
          </ChartCard>
        </div>

        {showNumbers &&
          ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((g) => {
            const list = byGroup.get(g);
            if (!list?.length) return null;
            return (
              <section key={g} className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-wide text-muted">
                  Group {g} — numbers
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {list.map((m) => {
                    const def = METRIC_CATALOG[m.id - 1];
                    if (m.value == null && !m.infinite) {
                      if (m.id >= 71 && m.id <= 74) return null;
                      if (m.id === 80 || m.id === 83 || m.id === 84) {
                        return (
                          <MetricTile
                            key={m.id}
                            label={def?.label ?? m.key}
                            value="—"
                            n={m.n}
                            low
                            title={def?.formula ?? ''}
                          />
                        );
                      }
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

        <section className="space-y-2 min-h-[240px] flex flex-col">
          <h3 className="text-[11px] uppercase tracking-wide text-muted">Trade list</h3>
          <TradeListVirtual store={store} indices={indices} />
        </section>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  desc,
  children,
  wide,
}: {
  title: string;
  desc: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Card
      className={[
        'bg-surface border border-border',
        wide ? 'lg:col-span-2' : '',
      ].join(' ')}
    >
      <Card.Header className="px-3 pt-3 pb-1">
        <Card.Title className="text-sm">{title}</Card.Title>
        <Card.Description className="text-[11px] text-muted">{desc}</Card.Description>
      </Card.Header>
      <Card.Content className="px-2 pb-3">{children}</Card.Content>
    </Card>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-surface px-3 py-2.5"
      title={hint}
    >
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
      <p className="text-base sm:text-lg font-semibold tabular-nums mt-0.5">{value}</p>
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
