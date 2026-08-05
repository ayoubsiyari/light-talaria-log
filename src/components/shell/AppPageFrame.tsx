import type { ReactNode } from 'react';

interface AppPageFrameProps {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Optional actions aligned with the title row. */
  actions?: ReactNode;
  children: ReactNode;
  /** Narrower content column (forms). Default max-w-5xl. */
  narrow?: boolean;
}

/**
 * Shared chrome for AppShell tabs — one spacing / typography language.
 * Dashboard immersive board does not use this (full-bleed).
 */
export function AppPageFrame({
  eyebrow,
  title,
  description,
  actions,
  children,
  narrow = false,
}: AppPageFrameProps) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div
        className={[
          'mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8',
          'pl-[max(1rem,env(safe-area-inset-left))]',
          'pr-[max(1rem,env(safe-area-inset-right))]',
          'pb-[max(2.5rem,env(safe-area-inset-bottom))]',
          narrow ? 'max-w-3xl' : 'max-w-5xl',
        ].join(' ')}
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            {eyebrow && (
              <p className="text-xs uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
            )}
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-sm text-muted max-w-2xl">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
