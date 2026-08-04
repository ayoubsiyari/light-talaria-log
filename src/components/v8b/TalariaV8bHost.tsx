import { Suspense, lazy, useCallback, useState } from 'react';
import { Button, toast } from '@heroui/react';
import type { BacktestSession } from '@/types/session';
import type { AppTab } from '@/navigation/appRoute';
import {
  resolveChartSessionFromV8b,
  type V8bSessionLike,
} from '@/components/v8b/v8bSessionBridge';

const TalariaV8b = lazy(() => import('@/v8b/TalariaV8b.jsx'));

export type V8bSessView =
  | 'sessions'
  | 'dashboard'
  | 'trades'
  | 'stratbank'
  | 'journal'
  | 'resources';

export function appTabToV8bView(tab: AppTab): V8bSessView {
  switch (tab) {
    case 'dashboard':
      return 'dashboard';
    case 'backtest':
      return 'sessions';
    case 'journal':
      return 'journal';
    case 'strategy':
      return 'stratbank';
    case 'profile':
      return 'sessions';
    default:
      return 'sessions';
  }
}

export function v8bViewToAppTab(view: string): AppTab {
  switch (view) {
    case 'dashboard':
    case 'trades':
      return 'dashboard';
    case 'stratbank':
      return 'strategy';
    case 'journal':
      return 'journal';
    case 'resources':
      return 'dashboard';
    case 'sessions':
    default:
      return 'backtest';
  }
}

interface TalariaV8bHostProps {
  /** Hash-synced app tab → V8b sessView (profile opens modal). */
  appTab?: AppTab;
  onAppTabChange?: (tab: AppTab) => void;
  onLaunchChart: (session: BacktestSession) => void;
  onGoDatasets?: () => void;
  onGoHome?: () => void;
}

/**
 * Lazy host for the TalariaV8b monolith (sessions, create-session, strategy builder, dashboard).
 * Start/Resume bridges into the real chart via `onLaunchChart`.
 */
export function TalariaV8bHost({
  appTab = 'backtest',
  onAppTabChange,
  onLaunchChart,
  onGoDatasets,
}: TalariaV8bHostProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialSessView = appTabToV8bView(appTab);
  const initialProfileOpen = appTab === 'profile';

  const handleLaunch = useCallback(
    async (v8b: V8bSessionLike | null) => {
      setBusy(true);
      setError(null);
      try {
        const session = await resolveChartSessionFromV8b(v8b);
        onLaunchChart(session);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Could not open chart session';
        setError(msg);
        toast.info('Could not open chart', { description: msg });
      } finally {
        setBusy(false);
      }
    },
    [onLaunchChart],
  );

  return (
    <div className="h-dvh min-h-0 w-full relative bg-background text-foreground">
      {(busy || error) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[100002] flex flex-col items-center gap-2 max-w-lg px-3">
          {busy && (
            <p className="text-xs px-3 py-2 rounded-md bg-surface border border-border text-muted shadow-lg">
              Opening chart session…
            </p>
          )}
          {error && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border shadow-lg">
              <p className="text-xs text-danger">{error}</p>
              {onGoDatasets && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-9"
                  onPress={onGoDatasets}
                >
                  Datasets
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="min-h-9"
                onPress={() => setError(null)}
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center text-sm text-muted">
            Loading Talaria workspace…
          </div>
        }
      >
        <TalariaV8b
          shellOnly
          initialSessView={initialSessView}
          initialProfileOpen={initialProfileOpen}
          onSessViewChange={(view: string) => {
            onAppTabChange?.(v8bViewToAppTab(view));
          }}
          onLaunchSession={(sess: unknown) => {
            void handleLaunch((sess as V8bSessionLike | null) ?? null);
          }}
        />
      </Suspense>
    </div>
  );
}
