import type { ReactNode } from 'react';
import { Button } from '@heroui/react';
import { ThemeToggle } from '@/components/ThemeToggle';

export type AppPageNavId = 'sessions' | 'datasets' | 'journal';

interface AppPageNavProps {
  current: AppPageNavId;
  onGoHome?: () => void;
  onGoSessions: () => void;
  onGoDatasets: () => void;
  onGoJournal?: () => void;
}

const LINK =
  'min-h-11 sm:min-h-8 px-2.5 text-xs sm:text-sm';

/**
 * Shared header actions for Sessions / Datasets / Journal.
 * Mobile: 44px hits; wraps under the page title.
 */
export function AppPageNav({
  current,
  onGoHome,
  onGoSessions,
  onGoDatasets,
  onGoJournal,
}: AppPageNavProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <ThemeToggle />
      {onGoHome && current !== 'sessions' && (
        <Button variant="ghost" size="sm" className={LINK} onPress={onGoHome}>
          Home
        </Button>
      )}
      {current !== 'sessions' && (
        <Button
          variant="secondary"
          size="sm"
          className={LINK}
          onPress={onGoSessions}
        >
          Backtest
        </Button>
      )}
      {current !== 'datasets' && (
        <Button
          variant={current === 'sessions' ? 'secondary' : 'ghost'}
          size="sm"
          className={LINK}
          onPress={onGoDatasets}
        >
          Datasets
        </Button>
      )}
      {onGoJournal && current !== 'journal' && (
        <Button variant="secondary" size="sm" className={LINK} onPress={onGoJournal}>
          Journal
        </Button>
      )}
    </div>
  );
}

interface AppPageHeaderProps {
  title: string;
  description: string;
  current: AppPageNavId;
  onGoHome?: () => void;
  onGoSessions: () => void;
  onGoDatasets: () => void;
  onGoJournal?: () => void;
  /**
   * Inside AppShell: hide brand + top nav (shell owns chrome).
   * Optional `actions` for page-specific links (e.g. Datasets).
   */
  embedded?: boolean;
  actions?: ReactNode;
}

/** Brand wordmark + title + shared nav for app pages outside the chart. */
export function AppPageHeader({
  title,
  description,
  current,
  onGoHome,
  onGoSessions,
  onGoDatasets,
  onGoJournal,
  embedded = false,
  actions,
}: AppPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
      <div className="space-y-1.5 min-w-0">
        {!embedded &&
          (onGoHome ? (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 sm:min-h-8 -ml-2 px-2 text-xs uppercase tracking-[0.2em] text-muted"
              onPress={onGoHome}
            >
              Talaria-Log
            </Button>
          ) : (
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Talaria-Log</p>
          ))}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted max-w-xl">{description}</p>
      </div>
      {embedded ? (
        actions
      ) : (
        <AppPageNav
          current={current}
          onGoHome={onGoHome}
          onGoSessions={onGoSessions}
          onGoDatasets={onGoDatasets}
          onGoJournal={onGoJournal}
        />
      )}
    </header>
  );
}
