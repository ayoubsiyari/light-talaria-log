import type { ReactNode } from 'react';
import { Button } from '@heroui/react';
import { ThemeToggle } from '@/components/ThemeToggle';

/** Canonical page ids — matches AppTab glossary. */
export type AppPageNavId = 'backtest' | 'datasets' | 'trades';

interface AppPageNavProps {
  current: AppPageNavId;
  onGoHome?: () => void;
  onGoBacktest: () => void;
  onGoDatasets: () => void;
  onGoTrades?: () => void;
}

const LINK = 'min-h-11 sm:min-h-8 px-2.5 text-xs sm:text-sm';

/**
 * Secondary header actions when a page is outside the shell rail focus.
 * Prefer AppShell rail as primary nav; this is breadcrumb-style only.
 */
export function AppPageNav({
  current,
  onGoHome,
  onGoBacktest,
  onGoDatasets,
  onGoTrades,
}: AppPageNavProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <ThemeToggle />
      {onGoHome && (
        <Button variant="ghost" size="sm" className={LINK} onPress={onGoHome}>
          Home
        </Button>
      )}
      {current !== 'backtest' && (
        <Button variant="secondary" size="sm" className={LINK} onPress={onGoBacktest}>
          Backtest
        </Button>
      )}
      {current !== 'datasets' && (
        <Button
          variant={current === 'backtest' ? 'secondary' : 'ghost'}
          size="sm"
          className={LINK}
          onPress={onGoDatasets}
        >
          Datasets
        </Button>
      )}
      {onGoTrades && current !== 'trades' && (
        <Button variant="ghost" size="sm" className={LINK} onPress={onGoTrades}>
          Trades
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
  onGoBacktest: () => void;
  onGoDatasets: () => void;
  onGoTrades?: () => void;
  /** Inside AppShell: hide brand + top nav (shell owns chrome). */
  embedded?: boolean;
  actions?: ReactNode;
  eyebrow?: string;
}

/** @deprecated Prefer AppPageFrame for new shell pages. Kept for gradual migration. */
export function AppPageHeader({
  title,
  description,
  current,
  onGoHome,
  onGoBacktest,
  onGoDatasets,
  onGoTrades,
  embedded = false,
  actions,
  eyebrow,
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
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              {eyebrow ?? 'Talaria-Log'}
            </p>
          ))}
        {embedded && eyebrow && (
          <p className="text-xs uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
        )}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted max-w-xl">{description}</p>
      </div>
      {embedded ? (
        actions
      ) : (
        <AppPageNav
          current={current}
          onGoHome={onGoHome}
          onGoBacktest={onGoBacktest}
          onGoDatasets={onGoDatasets}
          onGoTrades={onGoTrades}
        />
      )}
    </header>
  );
}
