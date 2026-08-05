import { Card } from '@heroui/react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppPageFrame } from '@/components/shell/AppPageFrame';
import { listSessions } from '@/sessions/sessionStore';
import { listJournalEntries } from '@/journal/journalStore';

/**
 * Hero UI account surface — local-first, real browser storage counts.
 */
export function ProfilePage() {
  const sessions = listSessions().length;
  const runs = listJournalEntries().length;

  return (
    <AppPageFrame
      narrow
      eyebrow="Account"
      title="Profile"
      description="Local-first for now — backtests and trades stay in this browser."
    >
      <Card className="bg-surface border border-border">
        <Card.Header className="px-6 pt-6 pb-2">
          <Card.Title className="text-lg">Account</Card.Title>
          <Card.Description className="text-muted text-sm">
            No sign-in required. Billing hooks land later.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-6 pb-6 space-y-3">
          <Row label="Plan" value="Free (local)" />
          <Row label="Backtests stored" value={String(sessions)} />
          <Row label="Strategy runs" value={String(runs)} />
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-sm text-muted">Theme</span>
            <ThemeToggle />
          </div>
        </Card.Content>
      </Card>
    </AppPageFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2 border-b border-[color:var(--tv-panel-line)] last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-foreground tabular-nums">{value}</span>
    </div>
  );
}
