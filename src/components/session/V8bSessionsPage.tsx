import type { BacktestSession } from '@/types/session';
import { TalariaV8bHost } from '@/components/v8b/TalariaV8bHost';

interface V8bSessionsPageProps {
  onLaunchChart: (session: BacktestSession) => void;
  onGoDatasets?: () => void;
  onTabChange?: (tab: 'strategy' | 'backtest' | 'dashboard' | 'journal' | 'profile') => void;
}

/**
 * Phase 3 module: V8b sessions list + Create Session modal.
 * (Legacy CreateSessionPage remains for Datasets-driven server-first flow.)
 */
export function V8bSessionsPage({
  onLaunchChart,
  onGoDatasets,
  onTabChange,
}: V8bSessionsPageProps) {
  return (
    <TalariaV8bHost
      appTab="backtest"
      onAppTabChange={onTabChange}
      onLaunchChart={onLaunchChart}
      onGoDatasets={onGoDatasets}
    />
  );
}
