import { useMemo } from 'react';
import { Button, Card } from '@heroui/react';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { listJournalEntries } from '@/journal/journalStore';
import type { OrderJournal } from '@/orders/journal';
import { listOrderJournalViews } from '@/orders/tradeJournal';
import { listSessions } from '@/sessions/sessionStore';
import { listStrategies } from '@/strategy/strategyStore';

interface DashboardPageProps {
  liveJournal?: OrderJournal | null;
  onGoBacktest: () => void;
  onGoTrades: () => void;
  onGoStrategy: () => void;
}

/**
 * V8b Dashboard home — Hero UI + real local counts / journal analytics.
 */
export function DashboardPage({
  liveJournal = null,
  onGoBacktest,
  onGoTrades,
  onGoStrategy,
}: DashboardPageProps) {
  const stats = useMemo(() => {
    const sessions = listSessions();
    const runs = listJournalEntries();
    const orderViews = listOrderJournalViews(liveJournal);
    const closedTrades = orderViews.reduce((n, v) => n + v.trades.length, 0);
    return {
      sessions: sessions.length,
      backtestRuns: runs.length,
      closedTrades,
      strategies: listStrategies().length,
    };
  }, [liveJournal]);

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <header className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Overview</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted max-w-xl">
            Same hub role as V8b Dashboard — wired to your sessions, trades, and strategies.
          </p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Sessions" value={stats.sessions} />
          <StatCard label="Strategies" value={stats.strategies} />
          <StatCard label="Backtest runs" value={stats.backtestRuns} />
          <StatCard label="Closed trades" value={stats.closedTrades} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="min-h-11" onPress={onGoBacktest}>
            New backtest
          </Button>
          <Button variant="secondary" className="min-h-11" onPress={onGoTrades}>
            Open trades
          </Button>
          <Button variant="ghost" className="min-h-11" onPress={onGoStrategy}>
            Strategies
          </Button>
        </div>

        <section className="space-y-3 min-h-[420px]">
          <h2 className="text-lg font-semibold tracking-tight">Performance</h2>
          <div className="rounded-lg border border-border bg-surface overflow-hidden min-h-[380px]">
            <AnalyticsDashboard
              liveJournal={liveJournal}
              allowDemo={false}
              onOpenJournal={onGoTrades}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="bg-surface border border-border">
      <Card.Content className="px-4 py-3 space-y-1">
        <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </Card.Content>
    </Card>
  );
}
