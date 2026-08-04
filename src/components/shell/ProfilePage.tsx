import { Card } from '@heroui/react';

/**
 * Placeholder account / billing surface.
 */
export function ProfilePage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Account</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted max-w-xl">
            Local-first for now — settings and billing hooks land later.
          </p>
        </header>

        <Card className="bg-surface border border-border">
          <Card.Header className="px-6 pt-6 pb-2">
            <Card.Title className="text-lg">Account</Card.Title>
            <Card.Description className="text-muted text-sm">
              No sign-in required. Sessions and journals stay in this browser.
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-6 pb-6 space-y-3">
            <Row label="Plan" value="Free (local)" />
            <Row label="Billing" value="—" />
            <Row label="Theme" value="Use the toggle in the shell header" />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 py-2 border-b border-[color:var(--tv-panel-line)] last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
