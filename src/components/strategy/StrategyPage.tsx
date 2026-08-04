import type { BacktestSession } from '@/types/session';
import { TalariaV8bHost } from '@/components/v8b/TalariaV8bHost';

interface StrategyPageProps {
  onLaunchChart: (session: BacktestSession) => void;
  onGoDatasets?: () => void;
  onTabChange?: (tab: 'strategy' | 'backtest' | 'dashboard' | 'journal' | 'profile') => void;
}

/**
 * Phase 3 module: Strategy bank + Strategy Builder (ReactFlow wizard inside V8b).
 */
export function StrategyPage({
  onLaunchChart,
  onGoDatasets,
  onTabChange,
}: StrategyPageProps) {
  return (
    <TalariaV8bHost
      appTab="strategy"
      onAppTabChange={onTabChange}
      onLaunchChart={onLaunchChart}
      onGoDatasets={onGoDatasets}
    />
  );
}
