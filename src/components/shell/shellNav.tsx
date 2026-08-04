import type { AppTab } from '@/navigation/appRoute';
import type { ReactNode } from 'react';

export interface ShellNavItem {
  id: AppTab;
  label: string;
  /** Pin to bottom of the rail (Profile). */
  pinBottom?: boolean;
}

export const SHELL_NAV_MAIN: readonly ShellNavItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'journal', label: 'Journal' },
  { id: 'strategy', label: 'Strategy' },
];

export const SHELL_NAV_BOTTOM: readonly ShellNavItem[] = [
  { id: 'profile', label: 'Profile', pinBottom: true },
];

export type ShellIcon = (props: { className?: string }) => ReactNode;

export function ShellIconDashboard({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
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

export function ShellIconJournal({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M6 4h10a2 2 0 012 2v14H8a2 2 0 01-2-2V4z" strokeLinejoin="round" />
      <path d="M8 4v14a2 2 0 002 2h8" strokeLinecap="round" />
      <path d="M10 9h6M10 13h4" strokeLinecap="round" />
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

export function ShellIconProfile({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" strokeLinecap="round" />
    </svg>
  );
}

export const SHELL_ICONS: Record<AppTab, ShellIcon> = {
  dashboard: ShellIconDashboard,
  backtest: ShellIconBacktest,
  journal: ShellIconJournal,
  strategy: ShellIconStrategy,
  profile: ShellIconProfile,
};
