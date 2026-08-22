import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import '@/components/logbook/journalDash.css';

interface DeskFrameProps {
  brand: string;
  nav?: ReactNode;
  actions?: ReactNode;
  /** Pass false to hide the greeting. */
  hello?: string | false;
  subtitle?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function firstNameOf(user: { displayName?: string; email?: string } | null): string {
  const raw = user?.displayName?.trim() || user?.email?.split('@')[0] || 'trader';
  return raw.split(/\s+/)[0] ?? 'trader';
}

export function DeskFrame({
  brand,
  nav,
  actions,
  hello,
  subtitle,
  fill = false,
  children,
}: DeskFrameProps) {
  const { user } = useAuth();
  const heading =
    hello === false ? null : hello ?? `${greet()}, ${firstNameOf(user)}`;

  return (
    <div className={fill ? 'desk desk-fill' : 'desk'}>
      <div className="jd-shell">
        <header className="jd-top">
          <p className="jd-brand">{brand}</p>
          <div className="jd-nav-wrap">{nav}</div>
          {actions ? <div className="jd-actions">{actions}</div> : null}
        </header>
        {heading ? <h1 className="jd-hello">{heading}</h1> : null}
        {subtitle}
        {children}
      </div>
    </div>
  );
}

/** Overflow ⋯ for cream page headers (Dashboard, Strategies). */
export function DeskMore({
  children,
  label = 'More',
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        className="jd-icon-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className="jd-menu absolute right-0 top-full z-20 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}
