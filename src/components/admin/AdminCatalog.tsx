import { useEffect, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { listRemoteDatasets } from '@/datasets/remoteApi';
import type { RemoteDatasetMeta } from '@/types/remoteApi';

function fmtRange(d: RemoteDatasetMeta): string {
  if (!d.timeStart || !d.timeEnd) return '—';
  const a = new Date(d.timeStart * 1000).toISOString().slice(0, 10);
  const b = new Date(d.timeEnd * 1000).toISOString().slice(0, 10);
  return `${a} → ${b}`;
}

export function AdminCatalogPanel() {
  const [datasets, setDatasets] = useState<RemoteDatasetMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    void listRemoteDatasets()
      .then(setDatasets)
      .catch((err: unknown) => {
        setDatasets([]);
        setError(err instanceof Error ? err.message : 'Failed to load catalog');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card className="bg-surface border border-border">
      <Card.Header className="px-4 sm:px-6 pt-5 pb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Card.Title className="text-base">Server catalog</Card.Title>
          <Card.Description className="text-muted text-sm">
            Datasets published for Create Session. Manage publish from Datasets.
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
        {loading && datasets.length === 0 ? (
          <p className="text-sm text-muted py-6">Loading catalog…</p>
        ) : datasets.length === 0 ? (
          <p className="text-sm text-muted py-6">
            No server datasets yet. Download and Save to server from Datasets.
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {datasets.map((d) => (
              <li
                key={d.id}
                className="px-3 sm:px-4 py-3 space-y-1 bg-background/40"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <span className="text-xs font-mono text-muted uppercase">
                    {d.status} · {d.visibility}
                  </span>
                </div>
                <p className="text-xs text-muted font-mono">
                  {d.symbol} · {d.baseTimeframe} · {d.timeframes?.join(', ') ?? '—'}
                </p>
                <p className="text-xs text-muted font-mono">{fmtRange(d)}</p>
                <p className="text-[11px] text-muted font-mono truncate">{d.id}</p>
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
