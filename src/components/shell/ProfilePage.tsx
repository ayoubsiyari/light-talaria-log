import { useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppPageFrame } from '@/components/shell/AppPageFrame';
import { useAuth } from '@/auth/AuthContext';
import { listSessions } from '@/sessions/sessionStore';
import { listJournalEntries } from '@/journal/journalStore';

interface ProfilePageProps {
  onSignedOut?: () => void;
}

export function ProfilePage({ onSignedOut }: ProfilePageProps) {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const sessions = listSessions().length;
  const runs = listJournalEntries().length;

  return (
    <AppPageFrame
      title="Profile"
      description="Your account and local backtest data on this browser."
    >
      <section className="jd-card jd-stack">
        <h2>Account</h2>
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Display name" value={user?.displayName ?? '—'} />
        <Row label="Role" value={user?.role === 'admin' ? 'Admin' : 'User'} />
        <Row label="Plan" value="Free" />
        <Row label="Backtests stored" value={String(sessions)} />
        <Row label="Strategy runs" value={String(runs)} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="jd-muted">Theme</span>
          <ThemeToggle />
        </div>
        <button
          type="button"
          className="jd-btn jd-btn-ink"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signOut()
              .then(() => onSignedOut?.())
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </AppPageFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="jd-dl-row">
      <dt>{label}</dt>
      <dd className="tabular-nums break-all text-right">{value}</dd>
    </div>
  );
}
