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

export function ShellIconDashboard({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function ShellIconTrades({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 16V10M12 16V7M16 16v-3" strokeLinecap="round" />
    </svg>
  );
}

export function ShellIconBacktest({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 15l3-4 3 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShellIconStrategy({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <circle cx="8" cy="18" r="2.5" />
      <path d="M8.2 7.8l7.2 3.2M16.2 13.5L10 16.5" strokeLinecap="round" />
    </svg>
  );
}

export function ShellIconResources({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 5h16v14H4z" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h6" strokeLinecap="round" />
    </svg>
  );
}

export function ShellIconProfile({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" strokeLinecap="round" />
    </svg>
  );
}

export function ShellIconAdmin({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9.5C7.5 20.5 4 17 4 12V7l8-4z" strokeLinejoin="round" />
      <path d="M9.5 12l1.5 1.5L14.5 10" strokeLinecap="round" strokeLinejoin="round" />
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
