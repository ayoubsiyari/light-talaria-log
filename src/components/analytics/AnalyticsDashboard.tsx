import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Card } from '@heroui/react';
import { METRIC_CATALOG } from '@/analytics/catalog';
import { drawEquityChart } from '@/analytics/charts/drawEquity';
import {
  drawBars,
  drawHistogram,
  drawScatter,
  drawUnderwater,
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
}

export function AnalyticsDashboard({
  liveJournal,
  sessionId,
  onClose,
  onOpenJournal,
}: Props) {
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [store, setStore] = useState<TradeStore | null>(null);
  const [metrics, setMetrics] = useState<MetricResult[]>([]);
  const [equity, setEquity] = useState<{
    t: Float64Array;
    e: Float64Array;
    dd: Float64Array;
  } | null>(null);
  const [charts, setCharts] = useState<{
    rValues: Float64Array;
    maeR: Float64Array;
    mfeR: Float64Array;
    outcome: Uint8Array;
  } | null>(null);
  const [hourBars, setHourBars] = useState<Float64Array | null>(null);
  const [weekdayBars, setWeekdayBars] = useState<Float64Array | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<'journal' | 'demo'>('journal');
  const equityRef = useRef<HTMLCanvasElement>(null);
  const ddRef = useRef<HTMLCanvasElement>(null);
  const rHistRef = useRef<HTMLCanvasElement>(null);
  const scatterRef = useRef<HTMLCanvasElement>(null);
  const hourRef = useRef<HTMLCanvasElement>(null);
  const weekdayRef = useRef<HTMLCanvasElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (source === 'demo') {
      const trades = generateSyntheticTrades({ n: 5_000, seed: 7 });
      setStore(buildTradeStore(trades, { initialBalance: 10_000 }));
      return;
    }
    const view =
      (sessionId ? getOrderJournalView(sessionId, liveJournal) : null) ??
      listOrderJournalViews(liveJournal)[0] ??
      null;
    if (!view || view.trades.length === 0) {
      setStore(null);
      return;
    }
    const closed = orderJournalToClosedTrades(view);
    setStore(
      buildTradeStore(closed, {
        accountCurrency: view.accountCurrency,
        initialBalance: view.startBalance,
      }),
    );
  }, [source, liveJournal, sessionId]);

  useEffect(() => {
    if (!store) {
      setMetrics([]);
      setEquity(null);
      setCharts(null);
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
          setHourBars(Float64Array.from(res.buckets.hour.map((b) => b.netPnl)));
          setWeekdayBars(Float64Array.from(res.buckets.weekday.map((b) => b.netPnl)));
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

  useEffect(() => {
    const c = equityRef.current;
    if (!c || !equity) return;
    drawEquityChart(c, equity.t, equity.e, equity.dd, {
      line: 'var(--accent)',
      dd: 'rgba(243, 18, 96, 0.25)',
      grid: 'var(--border)',
      text: 'var(--muted)',
    });
  }, [equity]);

  useEffect(() => {
    const c = ddRef.current;
    if (!c || !equity) return;
    drawUnderwater(c, equity.dd, {
      fill: 'rgba(243, 18, 96, 0.35)',
      line: 'var(--danger)',
      text: 'var(--muted)',
    });
  }, [equity]);

  useEffect(() => {
    const c = rHistRef.current;
    if (!c || !charts) return;
    drawHistogram(c, charts.rValues, {
      bar: 'var(--accent)',
      text: 'var(--muted)',
      grid: 'var(--border)',
    });
  }, [charts]);

  useEffect(() => {
    const c = scatterRef.current;
    if (!c || !charts) return;
    drawScatter(c, charts.maeR, charts.mfeR, charts.outcome, {
      win: 'var(--success)',
      loss: 'var(--danger)',
      text: 'var(--muted)',
    });
  }, [charts]);

  useEffect(() => {
    const c = hourRef.current;
    if (!c || !hourBars) return;
    drawBars(
      c,
      hourBars,
      Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? String(i) : '')),
      { pos: 'var(--success)', neg: 'var(--danger)', text: 'var(--muted)' },
    );
  }, [hourBars]);

  useEffect(() => {
    const c = weekdayRef.current;
    if (!c || !weekdayBars) return;
    drawBars(c, weekdayBars, ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], {
      pos: 'var(--success)',
      neg: 'var(--danger)',
      text: 'var(--muted)',
    });
  }, [weekdayBars]);

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

  const expectancy = metrics.find((m) => m.id === 25);
  const tradesNeeded = metrics.find((m) => m.id === 33);
  const costDrag = metrics.find((m) => m.id === 9);
  const ambiguous = metrics.find((m) => m.id === 81);

  if (!store) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-muted">
          No closed replay trades yet. Place orders and let them close, or load a demo
          sample.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            className="min-h-11"
            onPress={() => setSource('demo')}
          >
            Load 5k demo trades
          </Button>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Callout
            title="Expectancy (R)"
            value={fmt(expectancy)}
            low={expectancy?.lowSample}
            n={expectancy?.n}
            hint={METRIC_CATALOG[24]?.formula}
          />
          <Callout
            title="Trades needed (sig.)"
            value={fmt(tradesNeeded)}
            low={tradesNeeded?.lowSample}
            n={tradesNeeded?.n}
            hint={METRIC_CATALOG[32]?.formula}
          />
          <Callout
            title="Cost drag %"
            value={fmt(costDrag)}
            low={costDrag?.lowSample}
            n={costDrag?.n}
            hint={METRIC_CATALOG[8]?.formula}
          />
        </div>

        {ambiguous && (ambiguous.value ?? 0) > 5 && (
          <p className="text-[12px] text-danger">
            Ambiguous fills {fmt(ambiguous)} — results depend on intrabar path assumptions.
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ChartCard
            title="Equity (closed-trade balance)"
            desc="Drawdown on closed equity — not mark-to-market with opens"
          >
            <canvas ref={equityRef} className="w-full h-40 block" />
          </ChartCard>
          <ChartCard title="Underwater / drawdown" desc="Always ≤ 0 on closed equity">
            <canvas ref={ddRef} className="w-full h-40 block" />
          </ChartCard>
          <ChartCard title="R-multiple distribution" desc="Histogram of finite R">
            <canvas ref={rHistRef} className="w-full h-40 block" />
          </ChartCard>
          <ChartCard
            title="MFE / MAE scatter"
            desc="x = MAE(R), y = MFE(R) — most diagnostic chart"
          >
            <canvas ref={scatterRef} className="w-full h-48 block" />
          </ChartCard>
          <ChartCard title="Hour-of-day net P&L" desc="UTC buckets (session TZ deferred)">
            <canvas ref={hourRef} className="w-full h-36 block" />
          </ChartCard>
          <ChartCard title="Weekday net P&L" desc="UTC weekday">
            <canvas ref={weekdayRef} className="w-full h-36 block" />
          </ChartCard>
        </div>

        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((g) => {
          const list = byGroup.get(g);
          if (!list?.length) return null;
          return (
            <section key={g} className="space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-muted">
                Group {g}
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
                          blocked={false}
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
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <Card className="bg-surface border border-border">
      <Card.Header className="px-3 pt-3 pb-1">
        <Card.Title className="text-sm">{title}</Card.Title>
        <Card.Description className="text-[11px] text-muted">{desc}</Card.Description>
      </Card.Header>
      <Card.Content className="px-2 pb-3">{children}</Card.Content>
    </Card>
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

function Callout({
  title,
  value,
  low,
  n,
  hint,
}: {
  title: string;
  value: string;
  low?: boolean;
  n?: number;
  hint?: string;
}) {
  return (
    <div
      className={[
        'rounded-lg border border-border px-3 py-3',
        low ? 'opacity-60 italic' : 'bg-surface',
      ].join(' ')}
      title={hint}
    >
      <p className="text-[11px] text-muted">{title}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5">{value}</p>
      <p className="text-[10px] text-muted">
        n={n ?? 0}
        {low ? ' · low sample' : ''}
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  n,
  low,
  title,
  blocked,
}: {
  label: string;
  value: string;
  n: number;
  low?: boolean;
  title: string;
  blocked?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-md border border-border bg-background px-2.5 py-2 min-h-11',
        low || blocked ? 'opacity-55 italic' : '',
      ].join(' ')}
      title={blocked ? `${title} (blocked — missing data)` : title}
    >
      <p className="text-[10px] text-muted leading-tight">{label}</p>
      <p className="text-[13px] font-medium tabular-nums mt-0.5">{value}</p>
      <p className="text-[9px] text-muted">
        n={n}
        {low ? ' · low sample' : ''}
        {blocked ? ' · blocked' : ''}
      </p>
    </div>
  );
}
