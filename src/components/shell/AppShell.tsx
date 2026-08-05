import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { AppTab } from '@/navigation/appRoute';
import {
  SHELL_ICONS,
  SHELL_NAV_ADMIN,
  SHELL_NAV_BOTTOM,
  SHELL_NAV_MAIN,
} from '@/components/shell/shellNav';

interface AppShellProps {
  tab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onGoHome?: () => void;
  /** Opens New Session on the Backtest tab. */
  onCreateSession?: () => void;
  /** Show Admin rail entry (dataset management). */
  showAdmin?: boolean;
  children: ReactNode;
}

/**
 * In-app shell: labeled left rail (Sessions / Dashboard / …) + Create Session.
 */
export function AppShell({
  tab,
  onTabChange,
  onGoHome,
  onCreateSession,
  showAdmin = false,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const bottomNav = useMemo(
    () => (showAdmin ? [...SHELL_NAV_ADMIN, ...SHELL_NAV_BOTTOM] : [...SHELL_NAV_BOTTOM]),
    [showAdmin],
  );

  const go = (id: AppTab) => {
    onTabChange(id);
    setMobileOpen(false);
  };

  return (
    <div className="h-dvh min-h-0 bg-background text-foreground flex overflow-hidden">
      {/* Desktop rail — labeled, TV-style */}
      <aside
        className={[
          'hidden sm:flex flex-col shrink-0 w-[13.5rem]',
          'border-r border-[color:var(--tv-panel-line)]',
          'bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'pl-[env(safe-area-inset-left)]',
        ].join(' ')}
      >
        <button
          type="button"
          title="Talaria Log"
          aria-label="Talaria Log home"
          onClick={onGoHome}
          className="mx-3 mt-3 mb-2 flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-background/70 text-left"
        >
          <BrandLogo size={22} variant="raster" className="w-[22px] h-[22px] shrink-0" />
          <span className="text-sm font-semibold tracking-tight truncate">Talaria-Log</span>
        </button>

        {onCreateSession && (
          <div className="px-3 mb-3">
            <Button
              variant="primary"
              className="w-full min-h-10 justify-center text-sm font-semibold"
              onPress={onCreateSession}
            >
              + Create Session
            </Button>
          </div>
        )}

        <nav className="flex-1 flex flex-col gap-0.5 px-2 overflow-y-auto" aria-label="App">
          {SHELL_NAV_MAIN.map((item) => (
            <NavRow
              key={item.id}
              id={item.id}
              label={item.label}
              active={tab === item.id}
              onClick={() => go(item.id)}
            />
          ))}
        </nav>

        <div className="flex flex-col gap-0.5 px-2 pb-2 border-t border-[color:var(--tv-panel-line)] pt-2">
          {bottomNav.map((item) => (
            <NavRow
              key={item.id}
              id={item.id}
              label={item.label}
              active={tab === item.id}
              onClick={() => go(item.id)}
            />
          ))}
          <div className="px-1 pt-1">
            <ThemeToggle compact />
          </div>
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
          <div className="ml-auto flex items-center gap-1">
            {onCreateSession && (
              <Button
                variant="primary"
                size="sm"
                className="min-h-9 text-xs font-semibold"
                onPress={onCreateSession}
              >
                + Create
              </Button>
            )}
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
              {onCreateSession && (
                <div className="px-3 mb-2">
                  <Button
                    variant="primary"
                    className="w-full min-h-11 justify-center"
                    onPress={() => {
                      setMobileOpen(false);
                      onCreateSession();
                    }}
                  >
                    + Create Session
                  </Button>
                </div>
              )}
              <nav className="flex-1 flex flex-col gap-0.5 px-2">
                {[...SHELL_NAV_MAIN, ...bottomNav].map((item) => {
                  const Icon = SHELL_ICONS[item.id];
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.id)}
                      className={[
                        'relative flex items-center gap-3 min-h-11 px-3 rounded-md text-sm text-left',
                        active
                          ? 'bg-accent/15 text-accent'
                          : 'text-foreground hover:bg-background/70',
                      ].join(' ')}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent"
                          aria-hidden
                        />
                      )}
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

        <main
          className={[
            'flex-1 min-h-0',
            tab === 'dashboard' ? 'overflow-hidden' : 'overflow-auto',
          ].join(' ')}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function NavRow({
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
        'relative flex items-center gap-2.5 min-h-10 w-full px-2.5 rounded-md text-sm transition-colors text-left',
        active
          ? 'bg-accent/15 text-accent font-semibold'
          : 'text-muted hover:text-foreground hover:bg-background/70',
      ].join(' ')}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent"
          aria-hidden
        />
      )}
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className="truncate">{label}</span>
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
