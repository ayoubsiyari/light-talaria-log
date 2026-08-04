import type { BacktestSession } from '@/types/session';
import { TalariaV8bHost } from '@/components/v8b/TalariaV8bHost';

interface ProfilePageProps {
  onLaunchChart: (session: BacktestSession) => void;
  onGoDatasets?: () => void;
  onTabChange?: (tab: 'strategy' | 'backtest' | 'dashboard' | 'journal' | 'profile') => void;
}

/**
 * Phase 3 module: V8b Profile modal/page.
 */
export function ProfilePage({
  onLaunchChart,
  onGoDatasets,
  onTabChange,
}: ProfilePageProps) {
  return (
    <TalariaV8bHost
      appTab="profile"
      onAppTabChange={onTabChange}
      onLaunchChart={onLaunchChart}
      onGoDatasets={onGoDatasets}
    />
  );
}
