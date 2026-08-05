import { useEffect, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { useAuth } from '@/auth/AuthContext';
import { clearChartBarCache } from '@/datasets/idbChunkGc';
import { fetchHealth } from '@/datasets/remoteApi';

export function AdminSystemPanel() {
  const { user, signOut } = useAuth();
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null);
    void fetchHealth()
      .then((h) => setHealth(h as unknown as Record<string, unknown>))
      .catch((err: unknown) => {
        setHealth(null);
        setError(err instanceof Error ? err.message : 'Health check failed');
      });
  };

  useEffect(() => {
    load();
  }, []);

  const clearCache = () => {
    const ok = window.confirm(
      'Clear chart bar cache in this browser?\n\nKeeps server data and dataset list. Next session re-fetches candles.',
    );
    if (!ok) return;
    setBusy(true);
    setStatus(null);
    void clearChartBarCache()
      .then(() => setStatus('Browser chart cache cleared.'))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Clear failed'),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-4">
      <Card className="bg-surface border border-border">
        <Card.Header className="px-4 sm:px-6 pt-5 pb-2">
          <Card.Title className="text-base">Session</Card.Title>
        </Card.Header>
        <Card.Content className="px-4 sm:px-6 pb-5 space-y-3 text-sm">
          <p>
            <span className="text-muted">Email </span>
            <span className="font-mono break-all">{user?.email ?? '—'}</span>
          </p>
          <p>
            <span className="text-muted">Role </span>
            <span className="font-mono text-accent">{user?.role ?? '—'}</span>
          </p>
          <Button
            variant="secondary"
            className="min-h-11"
            isDisabled={busy}
            onPress={() => void signOut()}
          >
            Sign out
          </Button>
        </Card.Content>
      </Card>

      <Card className="bg-surface border border-border">
        <Card.Header className="px-4 sm:px-6 pt-5 pb-2 flex flex-wrap items-center justify-between gap-2">
          <Card.Title className="text-base">API</Card.Title>
          <Button variant="ghost" size="sm" className="min-h-11" onPress={load}>
            Ping
          </Button>
        </Card.Header>
        <Card.Content className="px-4 sm:px-6 pb-5">
          {error && <p className="text-sm text-danger mb-2">{error}</p>}
          {health ? (
            <pre className="text-xs font-mono text-muted overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-background/50 p-3">
              {JSON.stringify(health, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted">No health payload.</p>
          )}
        </Card.Content>
      </Card>

      <Card className="bg-surface border border-border">
        <Card.Header className="px-4 sm:px-6 pt-5 pb-2">
          <Card.Title className="text-base">This browser</Card.Title>
          <Card.Description className="text-muted text-sm">
            Local IndexedDB chart chunks only — does not delete server datasets.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-4 sm:px-6 pb-5 space-y-2">
          {status && <p className="text-sm text-success">{status}</p>}
          <Button
            variant="secondary"
            className="min-h-11"
            isDisabled={busy}
            onPress={clearCache}
          >
            Clear chart cache
          </Button>
        </Card.Content>
      </Card>
    </div>
  );
}
