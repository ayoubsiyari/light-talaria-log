import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { ensureExampleAnalyticsSession } from '@/analytics/exampleSession';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { DeskFrame, DeskMore } from '@/components/desk/DeskFrame';
import { useTheme } from '@/hooks/useTheme';
import { listJournalEntries } from '@/journal/journalStore';
import type { OrderJournal } from '@/orders/journal';
import { listOrderJournalViews } from '@/orders/tradeJournal';
import { listSessions } from '@/sessions/sessionStore';
import { listStrategies } from '@/strategy/strategyStore';

interface DashboardPageProps {
  liveJournal?: OrderJournal | null;
  onGoBacktest: () => void;
  onGoTrades: () => void;
  onGoJournal: () => void;
  onGoStrategy: () => void;
}

export function DashboardPage({
  liveJournal = null,
  onGoBacktest,
  onGoTrades,
  onGoJournal,
  onGoStrategy,
}: DashboardPageProps) {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [dataTick, setDataTick] = useState(0);

  useEffect(() => {
    ensureExampleAnalyticsSession();
    setDataTick((n) => n + 1);
  }, [user?.id]);

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
    <DeskFrame
      fill
      brand="Dashboard"
      actions={
        <>
          <button type="button" className="jd-btn jd-btn-ghost" onClick={onGoJournal}>
            Journal
          </button>
          <button type="button" className="jd-btn jd-btn-ghost" onClick={onGoTrades}>
            Chart trades
          </button>
          <button type="button" className="jd-btn jd-btn-ink" onClick={onGoBacktest}>
            New session
          </button>
          <DeskMore>
            <button type="button" onClick={onGoStrategy}>
              Strategies
            </button>
            <button
              type="button"
              onClick={() => {
                ensureExampleAnalyticsSession({ force: true });
                setDataTick((n) => n + 1);
              }}
            >
              Reset example
            </button>
            <button type="button" onClick={toggleTheme}>
              {isDark ? 'Light theme' : 'Dark theme'}
            </button>
          </DeskMore>
        </>
      }
    >
      <div className="jd-kpis" style={{ marginBottom: 20 }}>
        <div>
          <div className="jd-kpi-n">{stats.closedTrades}</div>
          <div className="jd-kpi-l">Chart fills</div>
        </div>
        <div>
          <div className="jd-kpi-n">{stats.sessions}</div>
          <div className="jd-kpi-l">Sessions</div>
        </div>
        <div>
          <div className="jd-kpi-n">{stats.strategies}</div>
          <div className="jd-kpi-l">Strategies</div>
        </div>
        <div>
          <div className="jd-kpi-n">{stats.backtestRuns}</div>
          <div className="jd-kpi-l">Runs</div>
        </div>
      </div>
      <section className="jd-card jd-analytics">
        <AnalyticsDashboard
          key={dataTick}
          liveJournal={liveJournal}
          allowDemo
          immersive
          onOpenJournal={onGoTrades}
        />
      </section>
    </DeskFrame>
  );
}
