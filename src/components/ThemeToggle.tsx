import { useTheme } from '@/hooks/useTheme';

interface ThemeToggleProps {
  className?: string;
  /** Compact icon-only control for toolbars. */
  compact?: boolean;
}

export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={[
        compact
          ? 'w-8 h-8 min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 rounded-[4px] flex items-center justify-center text-muted hover:text-foreground hover:bg-background/70'
          : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-xs font-medium text-muted hover:text-foreground hover:bg-background/70 border border-[color:var(--tv-panel-line)]',
        className,
      ].join(' ')}
    >
      {isDark ? <IconSun /> : <IconMoon />}
      {!compact && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}

function IconSun({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M21 14.5A8.5 8.5 0 1111.5 3a7 7 0 009.5 11.5z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
