import { useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { ensureExampleAnalyticsSession } from '@/analytics/exampleSession';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { ThemeToggle } from '@/components/ThemeToggle';
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
 * Full-viewport Dashboard — analytics board fills the shell (no page scroll).
 */
export function DashboardPage({
  liveJournal = null,
  onGoBacktest,
  onGoTrades,
  onGoStrategy,
}: DashboardPageProps) {
  const [dataTick, setDataTick] = useState(0);

  useEffect(() => {
    ensureExampleAnalyticsSession();
    setDataTick((n) => n + 1);
  }, []);

  const stats = useMemo(() => {
    void dataTick;
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
  }, [liveJournal, dataTick]);

  return (
    <div className="h-full min-h-0 w-full flex flex-col overflow-hidden bg-background text-foreground">
      <header
        className={[
          'shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2',
          'px-3 sm:px-4 py-2 border-b border-border',
          'bg-surface/80 backdrop-blur-sm',
          'pt-[max(0.5rem,env(safe-area-inset-top))]',
        ].join(' ')}
      >
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight leading-tight">
            Analytics
          </h1>
          <p className="text-[11px] text-muted tabular-nums truncate">
            {stats.closedTrades} trades · {stats.sessions} sessions ·{' '}
            {stats.strategies} strategies
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          <Button
            size="sm"
            variant="primary"
            className="min-h-11 sm:min-h-9"
            onPress={onGoBacktest}
          >
            New backtest
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="min-h-11 sm:min-h-9"
            onPress={onGoTrades}
          >
            Trades
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 sm:min-h-9"
            onPress={onGoStrategy}
          >
            Strategies
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 sm:min-h-9"
            onPress={() => {
              ensureExampleAnalyticsSession({ force: true });
              setDataTick((n) => n + 1);
            }}
          >
            Reset example
          </Button>
          <ThemeToggle compact />
        </div>
      </header>

      <div className="flex-1 min-h-0 min-w-0 w-full">
        <AnalyticsDashboard
          key={dataTick}
          liveJournal={liveJournal}
          allowDemo
          immersive
          onOpenJournal={onGoTrades}
        />
      </div>
    </div>
  );
}
