import { useEffect, useState } from 'react';
import { Button, Card } from '@heroui/react';
import {
  fetchAdminOverview,
  type AdminOverview as Overview,
} from '@/admin/adminApi';
import { fetchHealth } from '@/datasets/remoteApi';

type AdminSection = 'overview' | 'datasets' | 'users' | 'catalog' | 'jobs' | 'system';

interface AdminOverviewProps {
  onGoSection: (section: AdminSection) => void;
}

export function AdminOverviewPanel({ onGoSection }: AdminOverviewProps) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<string>('…');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    void Promise.all([fetchAdminOverview(), fetchHealth()])
      .then(([ov, h]) => {
        setOverview(ov);
        setHealth(h.ok ? `${h.service}${h.mode ? ` · ${h.mode}` : ''}` : 'degraded');
      })
      .catch((err: unknown) => {
        setOverview(null);
        setError(err instanceof Error ? err.message : 'Failed to load overview');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const tiles = overview
    ? [
        { label: 'Users', value: overview.usersTotal, hint: `${overview.admins} admin · ${overview.traders} trader`, go: 'users' as const },
        { label: 'Datasets', value: overview.datasetsReady, hint: `${overview.datasetsTotal} total on server`, go: 'datasets' as const },
        { label: 'Jobs running', value: overview.jobsRunning, hint: `${overview.jobsFailed} failed · ${overview.jobsTotal} total`, go: 'jobs' as const },
        { label: 'Storage', value: overview.storage, hint: overview.service, go: 'system' as const },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card className="bg-surface border border-border">
        <Card.Content className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">API health</p>
            <p className="text-xs text-muted font-mono mt-0.5 break-all">{health}</p>
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
        </Card.Content>
      </Card>

      {error && (
        <Card className="bg-surface border border-danger">
          <Card.Content className="px-4 sm:px-6 py-4 text-sm text-danger">
            {error}
          </Card.Content>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading && !overview
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="bg-surface border border-border">
                <Card.Content className="px-4 py-5 h-24 animate-pulse bg-surface-secondary/40 rounded-lg" />
              </Card>
            ))
          : tiles.map((t) => (
              <Card key={t.label} className="bg-surface border border-border">
                <Card.Content className="px-4 sm:px-5 py-4 space-y-2">
                  <p className="text-xs uppercase tracking-wider text-muted">{t.label}</p>
                  <p className="text-2xl font-semibold font-mono tabular-nums truncate">
                    {t.value}
                  </p>
                  <p className="text-xs text-muted">{t.hint}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 px-0 text-accent"
                    onPress={() => onGoSection(t.go)}
                  >
                    Open →
                  </Button>
                </Card.Content>
              </Card>
            ))}
      </div>

      <Card className="bg-surface border border-border">
        <Card.Header className="px-4 sm:px-6 pt-5 pb-2">
          <Card.Title className="text-base">Quick actions</Card.Title>
        </Card.Header>
        <Card.Content className="px-4 sm:px-6 pb-5 flex flex-wrap gap-2">
          <Button className="min-h-11" onPress={() => onGoSection('datasets')}>
            Manage datasets
          </Button>
          <Button
            variant="secondary"
            className="min-h-11"
            onPress={() => onGoSection('users')}
          >
            Users & roles
          </Button>
          <Button
            variant="secondary"
            className="min-h-11"
            onPress={() => onGoSection('catalog')}
          >
            Server catalog
          </Button>
          <Button
            variant="ghost"
            className="min-h-11"
            onPress={() => onGoSection('jobs')}
          >
            Jobs
          </Button>
        </Card.Content>
      </Card>
    </div>
  );
}
