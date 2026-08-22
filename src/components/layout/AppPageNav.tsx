import type { ReactNode } from 'react';
import { Button } from '@heroui/react';
import { ThemeToggle } from '@/components/ThemeToggle';

/** Canonical page ids — matches AppTab glossary. */
export type AppPageNavId = 'backtest' | 'trades';

interface AppPageNavProps {
  current: AppPageNavId;
  onGoHome?: () => void;
  onGoBacktest: () => void;
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
      {onGoTrades && current !== 'trades' && (
        <Button variant="ghost" size="sm" className={LINK} onPress={onGoTrades}>
          Chart trades
        </Button>
      )}
    </div>
  );
}

interface AppPageHeaderProps {
  title: string;
  subtitle?: string;
  current: AppPageNavId;
  onGoHome?: () => void;
  onGoBacktest: () => void;
  onGoTrades?: () => void;
  children?: ReactNode;
}

/** Shared page chrome: title + AppPageNav (unused by shell pages; kept for legacy). */
export function AppPageHeader({
  title,
  subtitle,
  current,
  onGoHome,
  onGoBacktest,
  onGoTrades,
  children,
}: AppPageHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border bg-surface px-4 sm:px-6 py-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
        </div>
        <AppPageNav
          current={current}
          onGoHome={onGoHome}
          onGoBacktest={onGoBacktest}
          onGoTrades={onGoTrades}
        />
      </div>
      {children}
    </header>
  );
}
