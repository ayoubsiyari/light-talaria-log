import { useMemo, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { AppPageHeader } from '@/components/layout/AppPageNav';
import type { OrderJournal } from '@/orders/journal';
import {
  clearOrderJournal,
  computeOrderJournalStats,
  getOrderJournalView,
  listOrderJournalViews,
  type OrderJournalView,
  type OrderTrade,
} from '@/orders/tradeJournal';
import { getSession } from '@/sessions/sessionStore';

interface JournalPageProps {
  /** Prefer this session when opening. */
  initialSessionId?: string | null;
  /** Live in-memory journal from the open chart session (may be ahead of localStorage). */
  liveJournal?: OrderJournal | null;
  onGoSessions: () => void;
  onGoHome?: () => void;
  onGoDatasets?: () => void;
  onOpenChart?: (sessionId: string) => void;
  /** True when the chart session is still in memory (soft journal navigate). */
  canReturnToChart?: boolean;
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

function TradeRow({
  trade,
  currency,
  digits,
}: {
  trade: OrderTrade;
  currency: string;
  digits: number;
}) {
  const win = trade.pnlAccount > 0;
  const flat = trade.pnlAccount === 0;
  return (
    <li className="rounded-lg border border-border bg-surface px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
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
        <div className="text-right shrink-0">
          <p
            className={[
              'text-sm font-medium tabular-nums',
              flat ? 'text-muted' : win ? 'text-success' : 'text-danger',
            ].join(' ')}
          >
            {formatMoney(trade.pnlAccount, currency)}
          </p>
          <p className="text-[11px] text-muted tabular-nums mt-0.5">
            {trade.exitReason}
            {trade.rMultiple != null ? ` · ${trade.rMultiple.toFixed(2)}R` : ''}
          </p>
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

export function JournalPage({
  initialSessionId = null,
  liveJournal = null,
  onGoSessions,
  onGoHome,
  onGoDatasets,
  onOpenChart,
  canReturnToChart = false,
}: JournalPageProps) {
  const [tick, setTick] = useState(0);
  const views = useMemo(
    () => listOrderJournalViews(liveJournal),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces refresh from storage
    [liveJournal, tick],
  );

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialSessionId && getOrderJournalView(initialSessionId, liveJournal)) {
      return initialSessionId;
    }
    return listOrderJournalViews(liveJournal)[0]?.sessionId ?? initialSessionId ?? null;
  });

  const selected: OrderJournalView | null = useMemo(() => {
    if (!selectedId) return null;
    return (
      views.find((v) => v.sessionId === selectedId) ??
      getOrderJournalView(selectedId, liveJournal)
    );
  }, [views, selectedId, liveJournal]);

  const stats = useMemo(
    () => (selected ? computeOrderJournalStats(selected) : null),
    [selected],
  );

  const refresh = () => setTick((n) => n + 1);

  const handleClear = () => {
    if (!selectedId) return;
    clearOrderJournal(selectedId);
    const next = listOrderJournalViews(liveJournal?.sessionId === selectedId ? null : liveJournal);
    setTick((n) => n + 1);
    setSelectedId(next[0]?.sessionId ?? null);
  };

  const openChart = () => {
    if (!selectedId || !onOpenChart) return;
    if (canReturnToChart || getSession(selectedId)) onOpenChart(selectedId);
  };

  const sessionAlive = !!selectedId && !!getSession(selectedId);
  const canOpenChart =
    !!selectedId && !!onOpenChart && (canReturnToChart || sessionAlive);

  const digits = selected ? digitsForSymbol(selected.symbol) : 5;
  const ccy = selected?.accountCurrency ?? 'USD';

  return (
    <div className="min-h-full bg-background text-foreground overflow-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <AppPageHeader
          current="journal"
          title="Journal"
          description="Your Place Order / replay fills for each session — not strategy backtests."
          onGoHome={onGoHome}
          onGoSessions={onGoSessions}
          onGoDatasets={onGoDatasets ?? onGoSessions}
          onGoJournal={undefined}
        />

        {views.length === 0 ? (
          <Card className="bg-surface border border-border">
            <Card.Content className="px-6 py-10 space-y-4 text-center">
              <p className="text-sm text-muted">
                No closed trades yet. Open a session, place orders, let them fill / hit SL·TP,
                then return here.
              </p>
              <Button variant="primary" className="min-h-11" onPress={onGoSessions}>
                Back to sessions
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
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(e.target.value || null)}
              >
                {views.map((v) => (
                  <option key={v.sessionId} value={v.sessionId}>
                    {v.sessionName} · {v.trades.length} trades
                  </option>
                ))}
              </select>
            </div>

            {selected && stats && (
              <>
                <div className="flex flex-wrap gap-2 items-center">
                  {canOpenChart ? (
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onPress={openChart}
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
                    onPress={handleClear}
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
                      {selected.symbol} · replay orders · start {selected.startBalance.toFixed(2)}{' '}
                      {ccy}
                    </Card.Description>
                  </Card.Header>
                  <Card.Content className="px-4 sm:px-6 pb-5 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <StatCell label="Trades" value={String(stats.tradeCount)} />
                      <StatCell
                        label="Win rate"
                        value={
                          stats.winRate == null
                            ? '—'
                            : `${(stats.winRate * 100).toFixed(1)}%`
                        }
                      />
                      <StatCell
                        label="Net P&L"
                        value={formatMoney(stats.netPnl, ccy)}
                        tone={
                          stats.netPnl > 0 ? 'success' : stats.netPnl < 0 ? 'danger' : null
                        }
                      />
                      <StatCell
                        label="Balance"
                        value={`${stats.finalBalance.toFixed(2)} ${ccy}`}
                        tone={
                          stats.returnPct > 0
                            ? 'success'
                            : stats.returnPct < 0
                              ? 'danger'
                              : null
                        }
                      />
                      <StatCell
                        label="Return"
                        value={formatPct(stats.returnPct)}
                        tone={
                          stats.returnPct > 0
                            ? 'success'
                            : stats.returnPct < 0
                              ? 'danger'
                              : null
                        }
                      />
                      <StatCell
                        label="Payoff R"
                        value={stats.payoffR == null ? '—' : stats.payoffR.toFixed(2)}
                      />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted mb-1">
                        Equity summary
                      </p>
                      <p className="text-xs text-muted tabular-nums mb-2">
                        Min {stats.minEquity.toFixed(2)} · Max {stats.maxEquity.toFixed(2)} ·{' '}
                        {selected.equity.length} samples
                      </p>
                      <EquitySparkline equity={selected.equity} />
                    </div>
                  </Card.Content>
                </Card>

                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
                    Closed trades ({selected.trades.length})
                  </h2>
                  {selected.trades.length === 0 ? (
                    <p className="text-sm text-muted">
                      Orders were placed but none have closed yet (wait for fill + SL/TP or
                      close).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.trades.map((t) => (
                        <TradeRow
                          key={t.id}
                          trade={t}
                          currency={ccy}
                          digits={digits}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
