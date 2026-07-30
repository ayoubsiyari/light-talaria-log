import { useMemo, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { computeJournalStats } from '@/journal/journalStats';
import {
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
  type JournalEntry,
} from '@/journal/journalStore';
import type { BacktestTrade, EquityPoint } from '@/types/backtest';
import { getSession } from '@/sessions/sessionStore';

interface JournalPageProps {
  /** Prefer this session's entry when opening. */
  initialSessionId?: string | null;
  onGoSessions: () => void;
  onOpenChart?: (sessionId: string) => void;
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

function formatPnl(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(5)}`;
}

function EquitySparkline({ equity }: { equity: readonly EquityPoint[] }) {
  if (equity.length < 2) {
    return (
      <p className="text-xs text-muted py-6 text-center">Not enough equity samples for a curve.</p>
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
      className="w-full h-[72px] text-success"
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

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const win = trade.pnl > 0;
  const flat = trade.pnl === 0;
  return (
    <li className="rounded-lg border border-border bg-surface px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <span className={trade.side === 'buy' ? 'text-success' : 'text-danger'}>
              {trade.side.toUpperCase()}
            </span>
            <span className="text-muted font-normal ml-2 text-xs tabular-nums">
              {formatTime(trade.entryTime)} → {formatTime(trade.exitTime)}
            </span>
          </p>
          <p className="text-xs text-muted tabular-nums mt-1">
            {trade.entryPrice.toFixed(5)} → {trade.exitPrice.toFixed(5)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p
            className={[
              'text-sm font-medium tabular-nums',
              flat ? 'text-muted' : win ? 'text-success' : 'text-danger',
            ].join(' ')}
          >
            {formatPnl(trade.pnl)}
          </p>
          <p className="text-xs text-muted tabular-nums">{formatPct(trade.pnlPct * 100)}</p>
        </div>
      </div>
    </li>
  );
}

export function JournalPage({
  initialSessionId = null,
  onGoSessions,
  onOpenChart,
}: JournalPageProps) {
  const [entries, setEntries] = useState(() => listJournalEntries());
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (initialSessionId && getJournalEntry(initialSessionId)) return initialSessionId;
    return listJournalEntries()[0]?.sessionId ?? null;
  });

  const selected: JournalEntry | null = useMemo(() => {
    if (!selectedId) return null;
    return entries.find((e) => e.sessionId === selectedId) ?? null;
  }, [entries, selectedId]);

  const stats = useMemo(
    () => (selected ? computeJournalStats(selected.result) : null),
    [selected],
  );

  const refresh = () => setEntries(listJournalEntries());

  const handleClear = () => {
    if (!selectedId) return;
    deleteJournalEntry(selectedId);
    const next = listJournalEntries();
    setEntries(next);
    setSelectedId(next[0]?.sessionId ?? null);
  };

  const openChart = () => {
    if (!selectedId || !onOpenChart) return;
    const session = getSession(selectedId);
    if (session) onOpenChart(selectedId);
  };

  const canOpenChart = !!selectedId && !!onOpenChart && !!getSession(selectedId);

  return (
    <div className="min-h-full bg-background text-foreground overflow-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Talaria-Log</p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Journal</h1>
            <p className="text-sm text-muted max-w-xl">
              Review the latest backtest trades and equity for a session. No OHLC history is loaded
              here.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ThemeToggle />
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11 sm:min-h-8"
              onPress={onGoSessions}
            >
              Sessions
            </Button>
          </div>
        </header>

        {entries.length === 0 ? (
          <Card className="bg-surface border border-border">
            <Card.Content className="px-6 py-10 space-y-4 text-center">
              <p className="text-sm text-muted">
                No backtest results yet. Open a session, run Backtest, then return here.
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
                {entries.map((e) => (
                  <option key={e.sessionId} value={e.sessionId}>
                    {e.sessionName} · {e.result.trades.length} trades
                  </option>
                ))}
              </select>
            </div>

            {selected && stats && (
              <>
                <div className="flex flex-wrap gap-2">
                  {canOpenChart && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-11 sm:min-h-8"
                      onPress={openChart}
                    >
                      Open chart
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 sm:min-h-8"
                    onPress={handleClear}
                  >
                    Clear result
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
                      {selected.result.timeframe} · SMA cross ·{' '}
                      {selected.result.barCount.toLocaleString()} bars
                      {selected.result.truncated ? ' · capped' : ''}
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
                        value={formatPnl(stats.netPnl)}
                        tone={
                          stats.netPnl > 0 ? 'success' : stats.netPnl < 0 ? 'danger' : null
                        }
                      />
                      <StatCell
                        label="Equity"
                        value={stats.finalEquity.toFixed(4)}
                        tone={
                          stats.equityReturnPct > 0
                            ? 'success'
                            : stats.equityReturnPct < 0
                              ? 'danger'
                              : null
                        }
                      />
                      <StatCell
                        label="Return"
                        value={formatPct(stats.equityReturnPct)}
                        tone={
                          stats.equityReturnPct > 0
                            ? 'success'
                            : stats.equityReturnPct < 0
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
                        Min {stats.minEquity.toFixed(4)} · Max {stats.maxEquity.toFixed(4)} ·{' '}
                        {selected.result.equity.length} samples
                      </p>
                      <EquitySparkline equity={selected.result.equity} />
                    </div>
                  </Card.Content>
                </Card>

                <section className="space-y-3">
                  <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
                    Trades ({selected.result.trades.length})
                  </h2>
                  {selected.result.trades.length === 0 ? (
                    <p className="text-sm text-muted">
                      Backtest finished with no closed trades.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {selected.result.trades.map((t) => (
                        <TradeRow key={t.id} trade={t} />
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
