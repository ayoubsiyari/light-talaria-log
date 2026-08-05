import { useMemo, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { AppPageFrame } from '@/components/shell/AppPageFrame';
import {
  BACKTEST_STRATEGY_LABELS,
  type BacktestTrade,
} from '@/types/backtest';
import type { OrderJournal } from '@/orders/journal';
import {
  clearOrderJournal,
  computeOrderJournalStats,
  getOrderJournalView,
  listOrderJournalViews,
  type OrderJournalView,
  type OrderTrade,
} from '@/orders/tradeJournal';
import { computeJournalStats } from '@/journal/journalStats';
import {
  deleteJournalRun,
  listJournalEntries,
  type JournalEntry,
} from '@/journal/journalStore';
import { getSession } from '@/sessions/sessionStore';

type JournalTab = 'orders' | 'backtests';

export interface JournalChartFocus {
  time: number;
  tradeId?: string | null;
  /** When set, App restores that strategy run onto the chart. */
  runId?: string | null;
}

interface JournalPageProps {
  /** Prefer this session when opening. */
  initialSessionId?: string | null;
  /** Live in-memory journal from the open chart session (may be ahead of localStorage). */
  liveJournal?: OrderJournal | null;
  onGoBacktest: () => void;
  /** @deprecated Use onGoBacktest */
  onGoSessions?: () => void;
  onGoHome?: () => void;
  onOpenChart?: (sessionId: string, focus?: JournalChartFocus) => void;
  /** True when the chart session is still in memory (soft trades navigate). */
  canReturnToChart?: boolean;
  /** Inside AppShell — kept for call-site compat. */
  embedded?: boolean;
}

function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function formatPct(n: number, digits = 2): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function formatMoney(n: number, currency: string): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)} ${currency}`;
}

function formatPricePnl(n: number, digits: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}`;
}

function EquitySparkline({
  equity,
}: {
  equity: readonly { time: number; equity: number }[];
}) {
  if (equity.length < 2) {
    return (
      <p className="text-xs text-muted py-6 text-center">
        Not enough closed trades for an equity curve.
      </p>
    );
  }

  const w = 320;
  const h = 72;
  const pad = 4;
  let min = Infinity;
  let max = -Infinity;
  for (const p of equity) {
    if (p.equity < min) min = p.equity;
    if (p.equity > max) max = p.equity;
  }
  const span = Math.max(1e-9, max - min);
  const pts = equity.map((p, i) => {
    const x = pad + (i / (equity.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.equity - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = equity[equity.length - 1]!.equity >= equity[0]!.equity;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-[72px]"
      role="img"
      aria-label="Equity curve"
    >
      <polyline
        fill="none"
        stroke={up ? 'var(--success)' : 'var(--danger)'}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(' ')}
      />
    </svg>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger' | null;
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-danger'
        : 'text-foreground';
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3 min-h-11">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`text-sm font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function OrderTradeRow({
  trade,
  currency,
  digits,
  canOpenChart,
  onViewOnChart,
}: {
  trade: OrderTrade;
  currency: string;
  digits: number;
  canOpenChart: boolean;
  onViewOnChart?: (trade: OrderTrade) => void;
}) {
  const win = trade.pnlAccount > 0;
  const flat = trade.pnlAccount === 0;
  return (
    <li className="rounded-lg border border-border bg-surface px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <span className={trade.side === 'buy' ? 'text-success' : 'text-danger'}>
              {trade.side.toUpperCase()}
            </span>
            <span className="text-muted font-normal ml-2 text-xs">{trade.symbol}</span>
            <span className="text-muted font-normal ml-2 text-xs tabular-nums">
              {trade.size} lots
            </span>
          </p>
          <p className="text-xs text-muted tabular-nums mt-1">
            {formatTime(trade.entryTime)} → {formatTime(trade.exitTime)}
          </p>
          <p className="text-xs text-muted tabular-nums mt-0.5">
            {trade.entryPrice.toFixed(digits)} → {trade.exitPrice.toFixed(digits)}
          </p>
        </div>
        <div className="text-right shrink-0 space-y-2">
          <p
            className={[
              'text-sm font-medium tabular-nums',
              flat ? 'text-muted' : win ? 'text-success' : 'text-danger',
            ].join(' ')}
          >
            {formatMoney(trade.pnlAccount, currency)}
          </p>
          <p className="text-[11px] text-muted tabular-nums">
            {trade.exitReason}
            {trade.rMultiple != null ? ` · ${trade.rMultiple.toFixed(2)}R` : ''}
          </p>
          {canOpenChart && onViewOnChart && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11 sm:min-h-8 w-full sm:w-auto"
              onPress={() => onViewOnChart(trade)}
              aria-label={`View ${trade.symbol} trade on chart at entry`}
            >
              View on chart
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function BacktestTradeRow({
  trade,
  digits,
  canOpenChart,
  onViewOnChart,
}: {
  trade: BacktestTrade;
  digits: number;
  canOpenChart: boolean;
  onViewOnChart?: (trade: BacktestTrade) => void;
}) {
  const win = trade.pnl > 0;
  const flat = trade.pnl === 0;
  return (
    <li className="rounded-lg border border-border bg-surface px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <span className={trade.side === 'buy' ? 'text-success' : 'text-danger'}>
              {trade.side.toUpperCase()}
            </span>
          </p>
          <p className="text-xs text-muted tabular-nums mt-1">
            {formatTime(trade.entryTime)} → {formatTime(trade.exitTime)}
          </p>
          <p className="text-xs text-muted tabular-nums mt-0.5">
            {trade.entryPrice.toFixed(digits)} → {trade.exitPrice.toFixed(digits)}
          </p>
          {(trade.entryReason || trade.exitReason) && (
            <p className="text-[11px] text-muted mt-1 leading-snug">
              {trade.entryReason ?? 'Entry'}
              {trade.exitReason ? ` · ${trade.exitReason}` : ''}
            </p>
          )}
        </div>
        <div className="text-right shrink-0 space-y-2">
          <p
            className={[
              'text-sm font-medium tabular-nums',
              flat ? 'text-muted' : win ? 'text-success' : 'text-danger',
            ].join(' ')}
          >
            {formatPricePnl(trade.pnl, digits)}{' '}
            <span className="text-xs text-muted">({formatPct(trade.pnlPct * 100)})</span>
          </p>
          {canOpenChart && onViewOnChart && (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11 sm:min-h-8 w-full sm:w-auto"
              onPress={() => onViewOnChart(trade)}
              aria-label="View backtest trade on chart at entry"
            >
              View on chart
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function digitsForSymbol(symbol: string): number {
  const s = symbol.replace('/', '').toUpperCase();
  if (s.includes('JPY')) return 3;
  if (s.startsWith('XAU')) return 2;
  return 5;
}

function strategyLabel(entry: JournalEntry): string {
  const id = entry.result.params.strategyId;
  return BACKTEST_STRATEGY_LABELS[id] ?? id;
}

function runOptionLabel(entry: JournalEntry): string {
  const stats = computeJournalStats(entry.result);
  const when = formatTime(entry.savedAt / 1000);
  return `${entry.sessionName} · ${strategyLabel(entry)} · ${stats.tradeCount}t · ${when}`;
}

export function JournalPage({
  initialSessionId = null,
  liveJournal = null,
  onGoBacktest,
  onGoSessions,
  onOpenChart,
  canReturnToChart = false,
}: JournalPageProps) {
  const goBacktest = onGoBacktest ?? onGoSessions!;
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<JournalTab>('orders');

  const orderViews = useMemo(
    () => listOrderJournalViews(liveJournal),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces refresh from storage
    [liveJournal, tick],
  );

  const backtestRuns = useMemo(
    () => listJournalEntries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces refresh from storage
    [tick],
  );

  const [selectedOrderSessionId, setSelectedOrderSessionId] = useState<string | null>(() => {
    if (initialSessionId && getOrderJournalView(initialSessionId, liveJournal)) {
      return initialSessionId;
    }
    return listOrderJournalViews(liveJournal)[0]?.sessionId ?? initialSessionId ?? null;
  });

  const [selectedRunId, setSelectedRunId] = useState<string | null>(() => {
    const runs = listJournalEntries();
    if (initialSessionId) {
      const match = runs.find((r) => r.sessionId === initialSessionId);
      if (match) return match.id;
    }
    return runs[0]?.id ?? null;
  });

  const selectedOrder: OrderJournalView | null = useMemo(() => {
    if (!selectedOrderSessionId) return null;
    return (
      orderViews.find((v) => v.sessionId === selectedOrderSessionId) ??
      getOrderJournalView(selectedOrderSessionId, liveJournal)
    );
  }, [orderViews, selectedOrderSessionId, liveJournal]);

  const selectedRun: JournalEntry | null = useMemo(() => {
    if (!selectedRunId) return null;
    return backtestRuns.find((r) => r.id === selectedRunId) ?? null;
  }, [backtestRuns, selectedRunId]);

  const orderStats = useMemo(
    () => (selectedOrder ? computeOrderJournalStats(selectedOrder) : null),
    [selectedOrder],
  );

  const backtestStats = useMemo(
    () => (selectedRun ? computeJournalStats(selectedRun.result) : null),
    [selectedRun],
  );

  const refresh = () => setTick((n) => n + 1);

  const handleClearOrders = () => {
    if (!selectedOrderSessionId) return;
    clearOrderJournal(selectedOrderSessionId);
    const next = listOrderJournalViews(
      liveJournal?.sessionId === selectedOrderSessionId ? null : liveJournal,
    );
    setTick((n) => n + 1);
    setSelectedOrderSessionId(next[0]?.sessionId ?? null);
  };

  const handleDeleteRun = () => {
    if (!selectedRunId) return;
    deleteJournalRun(selectedRunId);
    const next = listJournalEntries();
    setTick((n) => n + 1);
    setSelectedRunId(next[0]?.id ?? null);
  };

  const openOrderChart = () => {
    if (!selectedOrderSessionId || !onOpenChart) return;
    if (canReturnToChart || getSession(selectedOrderSessionId)) {
      onOpenChart(selectedOrderSessionId);
    }
  };

  const viewOrderTradeOnChart = (trade: OrderTrade) => {
    if (!selectedOrderSessionId || !onOpenChart) return;
    if (!(canReturnToChart || getSession(selectedOrderSessionId))) return;
    onOpenChart(selectedOrderSessionId, { time: trade.entryTime, tradeId: trade.id });
  };

  const openBacktestChart = () => {
    if (!selectedRun || !onOpenChart) return;
    if (!(canReturnToChart || getSession(selectedRun.sessionId))) return;
    onOpenChart(selectedRun.sessionId, { time: selectedRun.result.timeStart, runId: selectedRun.id });
  };

  const viewBacktestTradeOnChart = (trade: BacktestTrade) => {
    if (!selectedRun || !onOpenChart) return;
    if (!(canReturnToChart || getSession(selectedRun.sessionId))) return;
    onOpenChart(selectedRun.sessionId, {
      time: trade.entryTime,
      tradeId: trade.id,
      runId: selectedRun.id,
    });
  };

  const orderSessionAlive =
    !!selectedOrderSessionId && !!getSession(selectedOrderSessionId);
  const canOpenOrderChart =
    !!selectedOrderSessionId && !!onOpenChart && (canReturnToChart || orderSessionAlive);

  const runSessionAlive = !!selectedRun && !!getSession(selectedRun.sessionId);
  const canOpenRunChart =
    !!selectedRun && !!onOpenChart && (canReturnToChart || runSessionAlive);

  const orderDigits = selectedOrder ? digitsForSymbol(selectedOrder.symbol) : 5;
  const orderCcy = selectedOrder?.accountCurrency ?? 'USD';
  const runDigits = 5;

  const emptyOrders = orderViews.length === 0;
  const emptyRuns = backtestRuns.length === 0;

  return (
    <AppPageFrame
      narrow
      eyebrow="App"
      title="Trades"
      description="Order fills and strategy runs — jump to any trade on the chart."
      actions={undefined}
    >
        <div
          className="flex rounded-lg border border-border bg-surface p-1 gap-1"
          role="tablist"
          aria-label="Trades source"
        >
          <Button
            variant={tab === 'orders' ? 'primary' : 'ghost'}
            size="sm"
            className="flex-1 min-h-11"
            onPress={() => setTab('orders')}
            aria-selected={tab === 'orders'}
          >
            Orders{emptyOrders ? '' : ` (${orderViews.reduce((n, v) => n + v.trades.length, 0)})`}
          </Button>
          <Button
            variant={tab === 'backtests' ? 'primary' : 'ghost'}
            size="sm"
            className="flex-1 min-h-11"
            onPress={() => setTab('backtests')}
            aria-selected={tab === 'backtests'}
          >
            Strategy runs{emptyRuns ? '' : ` (${backtestRuns.length})`}
          </Button>
        </div>

        {tab === 'orders' &&
          (emptyOrders ? (
            <Card className="bg-surface border border-border">
              <Card.Content className="px-6 py-10 space-y-4 text-center">
                <p className="text-sm text-muted">
                  No closed trades yet. Open a session, place orders, let them fill / hit SL·TP,
                  then return here.
                </p>
                <Button variant="primary" className="min-h-11" onPress={goBacktest}>
                  New backtest
                </Button>
              </Card.Content>
            </Card>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="journal-session" className="text-xs text-muted">
                  Session
                </label>
                <select
                  id="journal-session"
                  className="w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  value={selectedOrderSessionId ?? ''}
                  onChange={(e) => setSelectedOrderSessionId(e.target.value || null)}
                >
                  {orderViews.map((v) => (
                    <option key={v.sessionId} value={v.sessionId}>
                      {v.sessionName} · {v.trades.length} trades
                    </option>
                  ))}
                </select>
              </div>

              {selectedOrder && orderStats && (
                <>
                  <div className="flex flex-wrap gap-2 items-center">
                    {canOpenOrderChart ? (
                      <Button
                        variant="primary"
                        size="sm"
                        className="min-h-11 sm:min-h-8"
                        onPress={openOrderChart}
                      >
                        {canReturnToChart ? 'Back to chart' : 'Open chart'}
                      </Button>
                    ) : (
                      <p className="text-xs text-muted min-h-11 flex items-center">
                        Session deleted — journal kept. Clear to remove.
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onPress={handleClearOrders}
                    >
                      Clear journal
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onPress={refresh}
                    >
                      Refresh
                    </Button>
                  </div>

                  <Card className="bg-surface border border-border">
                    <Card.Header className="px-4 sm:px-6 pt-5 pb-2">
                      <Card.Title className="text-lg">Stats</Card.Title>
                      <Card.Description className="text-muted text-sm">
                        {selectedOrder.symbol} · replay orders · start{' '}
                        {selectedOrder.startBalance.toFixed(2)} {orderCcy}
                      </Card.Description>
                    </Card.Header>
                    <Card.Content className="px-4 sm:px-6 pb-5 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <StatCell label="Trades" value={String(orderStats.tradeCount)} />
                        <StatCell
                          label="Win rate"
                          value={
                            orderStats.winRate == null
                              ? '—'
                              : `${(orderStats.winRate * 100).toFixed(1)}%`
                          }
                        />
                        <StatCell
                          label="Net P&L"
                          value={formatMoney(orderStats.netPnl, orderCcy)}
                          tone={
                            orderStats.netPnl > 0
                              ? 'success'
                              : orderStats.netPnl < 0
                                ? 'danger'
                                : null
                          }
                        />
                        <StatCell
                          label="Balance"
                          value={`${orderStats.finalBalance.toFixed(2)} ${orderCcy}`}
                          tone={
                            orderStats.returnPct > 0
                              ? 'success'
                              : orderStats.returnPct < 0
                                ? 'danger'
                                : null
                          }
                        />
                        <StatCell
                          label="Return"
                          value={formatPct(orderStats.returnPct)}
                          tone={
                            orderStats.returnPct > 0
                              ? 'success'
                              : orderStats.returnPct < 0
                                ? 'danger'
                                : null
                          }
                        />
                        <StatCell
                          label="Payoff R"
                          value={orderStats.payoffR == null ? '—' : orderStats.payoffR.toFixed(2)}
                        />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted mb-1">
                          Equity summary
                        </p>
                        <p className="text-xs text-muted tabular-nums mb-2">
                          Min {orderStats.minEquity.toFixed(2)} · Max{' '}
                          {orderStats.maxEquity.toFixed(2)} · {selectedOrder.equity.length}{' '}
                          samples
                        </p>
                        <EquitySparkline equity={selectedOrder.equity} />
                      </div>
                    </Card.Content>
                  </Card>

                  <section className="space-y-3">
                    <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
                      Closed trades ({selectedOrder.trades.length})
                    </h2>
                    {selectedOrder.trades.length === 0 ? (
                      <p className="text-sm text-muted">
                        Orders were placed but none have closed yet (wait for fill + SL/TP or
                        close).
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {selectedOrder.trades.map((t) => (
                          <OrderTradeRow
                            key={t.id}
                            trade={t}
                            currency={orderCcy}
                            digits={orderDigits}
                            canOpenChart={canOpenOrderChart}
                            onViewOnChart={viewOrderTradeOnChart}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </>
          ))}

        {tab === 'backtests' &&
          (emptyRuns ? (
            <Card className="bg-surface border border-border">
              <Card.Content className="px-6 py-10 space-y-4 text-center">
                <p className="text-sm text-muted">
                  No strategy runs yet. Open a session, tap Strategy, choose a strategy, and Run.
                  Each run is kept here.
                </p>
                <Button variant="primary" className="min-h-11" onPress={goBacktest}>
                  New backtest
                </Button>
              </Card.Content>
            </Card>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="journal-run" className="text-xs text-muted">
                  Run
                </label>
                <select
                  id="journal-run"
                  className="w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  value={selectedRunId ?? ''}
                  onChange={(e) => setSelectedRunId(e.target.value || null)}
                >
                  {backtestRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {runOptionLabel(r)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedRun && backtestStats && (
                <>
                  <div className="flex flex-wrap gap-2 items-center">
                    {canOpenRunChart ? (
                      <Button
                        variant="primary"
                        size="sm"
                        className="min-h-11 sm:min-h-8"
                        onPress={openBacktestChart}
                      >
                        {canReturnToChart &&
                        selectedRun.sessionId === (initialSessionId ?? selectedRun.sessionId)
                          ? 'Back to chart'
                          : 'Open chart'}
                      </Button>
                    ) : (
                      <p className="text-xs text-muted min-h-11 flex items-center">
                        Session deleted — run kept. Delete to remove.
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onPress={handleDeleteRun}
                    >
                      Delete run
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onPress={refresh}
                    >
                      Refresh
                    </Button>
                  </div>

                  <Card className="bg-surface border border-border">
                    <Card.Header className="px-4 sm:px-6 pt-5 pb-2">
                      <Card.Title className="text-lg">Stats</Card.Title>
                      <Card.Description className="text-muted text-sm">
                        {strategyLabel(selectedRun)} · {selectedRun.result.timeframe} ·{' '}
                        {selectedRun.result.barCount.toLocaleString()} bars
                        {selectedRun.result.truncated ? ' (capped)' : ''}
                      </Card.Description>
                    </Card.Header>
                    <Card.Content className="px-4 sm:px-6 pb-5 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <StatCell label="Trades" value={String(backtestStats.tradeCount)} />
                        <StatCell
                          label="Win rate"
                          value={
                            backtestStats.winRate == null
                              ? '—'
                              : `${(backtestStats.winRate * 100).toFixed(1)}%`
                          }
                        />
                        <StatCell
                          label="Net P&L"
                          value={formatPricePnl(backtestStats.netPnl, runDigits)}
                          tone={
                            backtestStats.netPnl > 0
                              ? 'success'
                              : backtestStats.netPnl < 0
                                ? 'danger'
                                : null
                          }
                        />
                        <StatCell
                          label="Equity"
                          value={backtestStats.finalEquity.toFixed(4)}
                          tone={
                            backtestStats.equityReturnPct > 0
                              ? 'success'
                              : backtestStats.equityReturnPct < 0
                                ? 'danger'
                                : null
                          }
                        />
                        <StatCell
                          label="Return"
                          value={formatPct(backtestStats.equityReturnPct)}
                          tone={
                            backtestStats.equityReturnPct > 0
                              ? 'success'
                              : backtestStats.equityReturnPct < 0
                                ? 'danger'
                                : null
                          }
                        />
                        <StatCell
                          label="Payoff R"
                          value={
                            backtestStats.payoffR == null
                              ? '—'
                              : backtestStats.payoffR.toFixed(2)
                          }
                        />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted mb-1">
                          Equity curve
                        </p>
                        <EquitySparkline equity={selectedRun.result.equity} />
                      </div>
                    </Card.Content>
                  </Card>

                  <section className="space-y-3">
                    <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
                      Closed trades ({selectedRun.result.trades.length})
                    </h2>
                    {selectedRun.result.trades.length === 0 ? (
                      <p className="text-sm text-muted">
                        This run produced no closed trades (try longer window or different
                        params).
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {selectedRun.result.trades.map((t) => (
                          <BacktestTradeRow
                            key={t.id}
                            trade={t}
                            digits={runDigits}
                            canOpenChart={canOpenRunChart}
                            onViewOnChart={viewBacktestTradeOnChart}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
            </>
          ))}
    </AppPageFrame>
  );
}
