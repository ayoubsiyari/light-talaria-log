import { useEffect, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { fetchAdminJobs, type AdminJobRow } from '@/admin/adminApi';

function statusClass(status: string): string {
  if (status === 'failed') return 'text-danger';
  if (status === 'completed') return 'text-success';
  if (status === 'running' || status === 'queued') return 'text-accent';
  return 'text-muted';
}

export function AdminJobsPanel() {
  const [jobs, setJobs] = useState<AdminJobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    void fetchAdminJobs()
      .then(setJobs)
      .catch((err: unknown) => {
        setJobs([]);
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Card className="bg-surface border border-border">
      <Card.Header className="px-4 sm:px-6 pt-5 pb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Card.Title className="text-base">Jobs</Card.Title>
          <Card.Description className="text-muted text-sm">
            Ingest / backtest queue (auto-refresh 20s).
          </Card.Description>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11"
          onPress={load}
          isDisabled={loading}
        >
          Refresh
        </Button>
      </Card.Header>
      <Card.Content className="px-4 sm:px-6 pb-5">
        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        {loading && jobs.length === 0 ? (
          <p className="text-sm text-muted py-6">Loading jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted py-6">No jobs yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="px-3 sm:px-4 py-3 space-y-1 bg-background/40"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-between">
                  <p className="text-sm font-mono truncate">{j.id}</p>
                  <span
                    className={`text-xs font-mono uppercase ${statusClass(j.status)}`}
                  >
                    {j.status}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  <span className="font-mono">{j.type}</span>
                  {' · '}
                  user <span className="font-mono">{j.userId.slice(0, 8)}…</span>
                  {' · '}
                  {new Date(j.createdAt).toLocaleString()}
                </p>
                {j.error && (
                  <p className="text-xs text-danger break-words">{j.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
