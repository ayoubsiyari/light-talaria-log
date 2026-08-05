import type { AppTab } from '@/navigation/appRoute';
import type { ReactNode } from 'react';

export interface ShellNavItem {
  id: AppTab;
  label: string;
  pinBottom?: boolean;
}

/** App left-rail order (Hero shell). Admin is injected for admin users only. */
export const SHELL_NAV_MAIN: readonly ShellNavItem[] = [
  { id: 'backtest', label: 'Sessions' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'trades', label: 'Trade View' },
  { id: 'strategy', label: 'Strategies' },
  { id: 'resources', label: 'Resources' },
];

export const SHELL_NAV_BOTTOM: readonly ShellNavItem[] = [
  { id: 'profile', label: 'Profile', pinBottom: true },
];

export const SHELL_NAV_ADMIN: readonly ShellNavItem[] = [
  { id: 'admin', label: 'Admin', pinBottom: true },
];

export type ShellIcon = (props: { className?: string }) => ReactNode;

const ICON = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Soft fill under strokes — reads clearer on dark rails. */
function Soft({ d, opacity = 0.18 }: { d: string; opacity?: number }) {
  return <path d={d} fill="currentColor" fillOpacity={opacity} stroke="none" />;
}

/** Sessions — chart window with sparkline */
export function ShellIconBacktest({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...ICON}>
      <Soft d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M7 15.5l3-3.5 2.5 2L17 8.5" />
      <circle cx="17" cy="8.5" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Dashboard — analytics tiles */
export function ShellIconDashboard({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...ICON}>
      <Soft d="M4 4h7v7H4V4z" opacity={0.22} />
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="4" rx="1.5" />
      <rect x="13" y="10" width="7" height="10" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
    </svg>
  );
}

/** Trade View — candlesticks */
export function ShellIconTrades({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...ICON}>
      <Soft d="M6.5 9h3v7h-3V9zM14.5 7h3v8h-3V7z" opacity={0.2} />
      <path d="M8 5v3M8 16v3" />
      <rect x="6.5" y="8" width="3" height="8" rx="0.75" />
      <path d="M16 4v3M16 15v5" />
      <rect x="14.5" y="7" width="3" height="8" rx="0.75" />
      <path d="M4 20h16" opacity={0.45} />
    </svg>
  );
}

/** Strategies — branching graph */
export function ShellIconStrategy({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...ICON}>
      <Soft d="M10.5 4.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zM4 16.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0zM15 16.5a2.5 2.5 0 115 0 2.5 2.5 0 01-5 0z" opacity={0.2} />
      <circle cx="13" cy="5.5" r="2.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M13 8v3.5M13 11.5L7.8 15.2M13 11.5l5.2 3.7" />
    </svg>
  );
}

/** Resources — open book */
export function ShellIconResources({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...ICON}>
      <Soft d="M12 6.5c-1.8-1.4-4.2-2-6.5-2H4v13h1.5c2.3 0 4.7.6 6.5 2 1.8-1.4 4.2-2 6.5-2H20v-13h-1.5c-2.3 0-4.7.6-6.5 2z" opacity={0.16} />
      <path d="M12 6.5c-1.8-1.4-4.2-2-6.5-2H4v13h1.5c2.3 0 4.7.6 6.5 2M12 6.5c1.8-1.4 4.2-2 6.5-2H20v13h-1.5c-2.3 0-4.7.6-6.5 2" />
      <path d="M12 6.5v13" opacity={0.55} />
    </svg>
  );
}

/** Profile */
export function ShellIconProfile({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...ICON}>
      <Soft d="M8.5 8a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z" opacity={0.2} />
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.2-3.2 3.8-4.8 7-4.8s5.8 1.6 7 4.8" />
      <path d="M4 20h16" opacity={0.35} />
    </svg>
  );
}

/** Admin — shield */
export function ShellIconAdmin({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden {...ICON}>
      <Soft d="M12 3l7.5 3.2v5.3c0 4.6-3.1 8.1-7.5 9.5C7.6 19.6 4.5 16.1 4.5 11.5V6.2L12 3z" opacity={0.18} />
      <path d="M12 3l7.5 3.2v5.3c0 4.6-3.1 8.1-7.5 9.5C7.6 19.6 4.5 16.1 4.5 11.5V6.2L12 3z" />
      <path d="M9.2 12.1l1.9 1.9 3.7-3.8" />
    </svg>
  );
}

export const SHELL_ICONS: Record<AppTab, ShellIcon> = {
  dashboard: ShellIconDashboard,
  trades: ShellIconTrades,
  backtest: ShellIconBacktest,
  strategy: ShellIconStrategy,
  resources: ShellIconResources,
  profile: ShellIconProfile,
  admin: ShellIconAdmin,
};
