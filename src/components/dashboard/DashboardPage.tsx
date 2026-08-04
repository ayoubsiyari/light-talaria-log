import { useMemo } from 'react';
import { Button, Card } from '@heroui/react';
import { listJournalEntries } from '@/journal/journalStore';
import { listOrderJournalViews } from '@/orders/tradeJournal';
import { listSessions } from '@/sessions/sessionStore';

interface DashboardPageProps {
  onGoBacktest: () => void;
  onGoJournal: () => void;
  onGoStrategy: () => void;
}

/**
 * Light overview home inside the app shell.
 * Counts only — no V8b analytics port.
 */
export function DashboardPage({
  onGoBacktest,
  onGoJournal,
  onGoStrategy,
}: DashboardPageProps) {
  const stats = useMemo(() => {
    const sessions = listSessions();
    const runs = listJournalEntries();
    const orderViews = listOrderJournalViews();
    const closedTrades = orderViews.reduce((n, v) => n + v.trades.length, 0);
    return {
      sessions: sessions.length,
      backtestRuns: runs.length,
      closedTrades,
    };
  }, []);

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <header className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Overview</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted max-w-xl">
            Jump into a backtest, review your journal, or open strategy when ready.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="Sessions" value={stats.sessions} />
          <StatCard label="Backtest runs" value={stats.backtestRuns} />
          <StatCard label="Closed trades" value={stats.closedTrades} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="min-h-11" onPress={onGoBacktest}>
            New backtest
          </Button>
          <Button variant="secondary" className="min-h-11" onPress={onGoJournal}>
            Open journal
          </Button>
          <Button variant="ghost" className="min-h-11" onPress={onGoStrategy}>
            Strategy
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="bg-surface border border-border">
      <Card.Content className="px-5 py-4 space-y-1">
        <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </Card.Content>
    </Card>
  );
}
