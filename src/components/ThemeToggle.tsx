import { Button } from '@heroui/react';
import { useTheme } from '@/hooks/useTheme';

interface ThemeToggleProps {
  className?: string;
  /** Compact icon-only control for toolbars. */
  compact?: boolean;
}

export function ThemeToggle({ className = '', compact = false }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="sm"
      onPress={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      data-tb-icon-btn={compact ? '1' : undefined}
      className={[
        compact
          ? 'h-9 min-h-11 w-9 min-w-11 sm:min-h-9 sm:min-w-9 px-0 justify-center'
          : 'min-h-11 sm:min-h-8 gap-1.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isDark ? <IconSun /> : <IconMoon />}
      {!compact && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </Button>
  );
}

function IconSun() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
