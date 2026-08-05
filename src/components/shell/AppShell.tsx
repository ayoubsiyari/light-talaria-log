import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { AppTab } from '@/navigation/appRoute';
import {
  SHELL_ICONS,
  SHELL_NAV_BOTTOM,
  SHELL_NAV_MAIN,
} from '@/components/shell/shellNav';

interface AppShellProps {
  tab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onGoHome?: () => void;
  children: ReactNode;
}

/**
 * In-app shell: left rail (Dashboard / Trades / Backtest / Strategies / Resources / Profile)
 * + main content. Datasets is a shell tab linked from Backtest, not the rail.
 */
export function AppShell({ tab, onTabChange, onGoHome, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const go = (id: AppTab) => {
    onTabChange(id);
    setMobileOpen(false);
  };

  return (
    <div className="h-dvh min-h-0 bg-background text-foreground flex overflow-hidden">
      {/* Desktop rail */}
      <aside
        className={[
          'hidden sm:flex flex-col shrink-0 w-16 border-r border-[color:var(--tv-panel-line)]',
          'bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'pl-[env(safe-area-inset-left)]',
        ].join(' ')}
      >
        <button
          type="button"
          title="Talaria Log"
          aria-label="Talaria Log home"
          onClick={onGoHome}
          className="mx-auto mt-2 mb-3 h-10 w-10 rounded-md flex items-center justify-center hover:bg-background/70"
        >
          <BrandLogo size={22} variant="raster" className="w-[22px] h-[22px]" />
        </button>

        <nav className="flex-1 flex flex-col items-center gap-1 px-1.5" aria-label="App">
          {SHELL_NAV_MAIN.map((item) => (
            <NavButton
              key={item.id}
              id={item.id}
              label={item.label}
              active={tab === item.id}
              onClick={() => go(item.id)}
            />
          ))}
        </nav>

        <div className="flex flex-col items-center gap-1 px-1.5 pb-2">
          {SHELL_NAV_BOTTOM.map((item) => (
            <NavButton
              key={item.id}
              id={item.id}
              label={item.label}
              active={tab === item.id}
              onClick={() => go(item.id)}
            />
          ))}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Mobile top bar */}
        <header
          className={[
            'sm:hidden shrink-0 flex items-center gap-2 px-2',
            'h-12 min-h-12 pt-[env(safe-area-inset-top)]',
            'border-b border-[color:var(--tv-panel-line)] bg-surface',
          ].join(' ')}
        >
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 px-2"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onPress={() => setMobileOpen((v) => !v)}
          >
            <MenuIcon open={mobileOpen} />
          </Button>
          <button
            type="button"
            className="flex items-center gap-2 min-w-0"
            onClick={onGoHome}
          >
            <BrandLogo size={20} variant="raster" className="w-5 h-5 shrink-0" />
            <span className="text-sm font-semibold truncate">Talaria-Log</span>
          </button>
          <div className="ml-auto">
            <ThemeToggle compact />
          </div>
        </header>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="sm:hidden fixed inset-0 z-50 flex">
            <button
              type="button"
              className="absolute inset-0 bg-background/70"
              aria-label="Dismiss menu"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative z-10 w-[min(16rem,85vw)] h-full bg-surface border-r border-[color:var(--tv-panel-line)] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
              <p className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Menu
              </p>
              <nav className="flex-1 flex flex-col gap-0.5 px-2">
                {[...SHELL_NAV_MAIN, ...SHELL_NAV_BOTTOM].map((item) => {
                  const Icon = SHELL_ICONS[item.id];
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.id)}
                      className={[
                        'flex items-center gap-3 min-h-11 px-3 rounded-md text-sm text-left',
                        active
                          ? 'bg-accent/15 text-accent'
                          : 'text-foreground hover:bg-background/70',
                      ].join(' ')}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="px-3 py-3 border-t border-[color:var(--tv-panel-line)]">
                <ThemeToggle />
              </div>
            </aside>
          </div>
        )}

        {/* Desktop header strip — hide on Dashboard for full-bleed analytics */}
        {tab !== 'dashboard' && (
          <div className="hidden sm:flex shrink-0 h-10 items-center justify-end gap-2 px-3 border-b border-[color:var(--tv-panel-line)] bg-surface">
            <ThemeToggle compact />
          </div>
        )}

        <main
          className={[
            'flex-1 min-h-0',
            // Dashboard is a full-bleed no-scroll analytics board.
            tab === 'dashboard' ? 'overflow-hidden' : 'overflow-auto',
          ].join(' ')}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function NavButton({
  id,
  label,
  active,
  onClick,
}: {
  id: AppTab;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = SHELL_ICONS[id];
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={[
        'h-11 w-11 rounded-md flex items-center justify-center transition-colors',
        active
          ? 'bg-accent/15 text-accent'
          : 'text-muted hover:text-foreground hover:bg-background/70',
      ].join(' ')}
    >
      <Icon />
    </button>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
      )}
    </svg>
  );
}
