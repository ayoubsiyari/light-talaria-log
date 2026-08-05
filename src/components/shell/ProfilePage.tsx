import { useState } from 'react';
import { Button, Card } from '@heroui/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppPageFrame } from '@/components/shell/AppPageFrame';
import { useAuth } from '@/auth/AuthContext';
import { listSessions } from '@/sessions/sessionStore';
import { listJournalEntries } from '@/journal/journalStore';

interface ProfilePageProps {
  onSignedOut?: () => void;
}

/**
 * Hero UI account surface — signed-in user + local browser storage counts.
 */
export function ProfilePage({ onSignedOut }: ProfilePageProps) {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const sessions = listSessions().length;
  const runs = listJournalEntries().length;

  return (
    <AppPageFrame
      narrow
      eyebrow="Account"
      title="Profile"
      description="Your account and local backtest data on this browser."
    >
      <Card className="bg-surface border border-border">
        <Card.Header className="px-6 pt-6 pb-2">
          <Card.Title className="text-lg">Account</Card.Title>
          <Card.Description className="text-muted text-sm">
            Signed in with a secure HttpOnly session cookie.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-6 pb-6 space-y-3">
          <Row label="Email" value={user?.email ?? '—'} />
          <Row label="Display name" value={user?.displayName ?? '—'} />
          <Row
            label="Role"
            value={user?.role === 'admin' ? 'Admin' : 'User'}
          />
          <Row label="Plan" value="Free" />
          <Row label="Backtests stored" value={String(sessions)} />
          <Row label="Strategy runs" value={String(runs)} />
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm text-muted">Theme</span>
            <ThemeToggle />
          </div>
          <Button
            variant="secondary"
            className="w-full min-h-11 sm:w-auto"
            isDisabled={busy}
            onPress={() => {
              setBusy(true);
              void signOut()
                .then(() => onSignedOut?.())
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </Button>
        </Card.Content>
      </Card>
    </AppPageFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2 border-b border-[color:var(--tv-panel-line)] last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-foreground tabular-nums break-all text-right">
        {value}
      </span>
    </div>
  );
}
