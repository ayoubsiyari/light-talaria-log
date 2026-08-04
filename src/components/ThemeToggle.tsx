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
      className={[
        compact
          ? 'h-7 min-h-7 w-7 min-w-7 [@media(hover:none)]:min-h-11 [@media(hover:none)]:min-w-11 px-0'
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
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
