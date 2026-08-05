import { useState } from 'react';
import { Button, Card } from '@heroui/react';
import { useAuth } from '@/auth/AuthContext';
import { AdminCatalogPanel } from '@/components/admin/AdminCatalog';
import { AdminJobsPanel } from '@/components/admin/AdminJobs';
import { AdminOverviewPanel } from '@/components/admin/AdminOverview';
import { AdminSystemPanel } from '@/components/admin/AdminSystem';
import { AdminUsersPanel } from '@/components/admin/AdminUsers';
import { DatasetsPage } from '@/components/dataset/DatasetsPage';
import { AppPageFrame } from '@/components/shell/AppPageFrame';

type AdminSection =
  | 'overview'
  | 'datasets'
  | 'users'
  | 'catalog'
  | 'jobs'
  | 'system';

const SECTIONS: { id: AdminSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'datasets', label: 'Datasets' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'users', label: 'Users' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'system', label: 'System' },
];

interface AdminPageProps {
  onGoBacktest: () => void;
}

/**
 * Admin control plane — only mounted when role === admin (client UX).
 * Mutations (publish, Dukascopy, roles) are enforced server-side with Admin required.
 */
export function AdminPage({ onGoBacktest }: AdminPageProps) {
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>('overview');

  return (
    <AppPageFrame
      eyebrow="Admin"
      title="Control plane"
      description="Platform management: datasets, users, jobs, and system health. Regular traders never see this page."
      actions={
        <Button variant="secondary" className="min-h-11" onPress={onGoBacktest}>
          Backtest
        </Button>
      }
    >
      <Card className="bg-surface border border-border">
        <Card.Content className="px-4 sm:px-6 py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-muted">Signed in as </span>
            <span className="font-medium break-all">{user?.email ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted">Role </span>
            <span className="font-medium text-accent font-mono">admin</span>
          </div>
        </Card.Content>
      </Card>

      <nav
        className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1"
        aria-label="Admin sections"
      >
        {SECTIONS.map((s) => {
          const active = section === s.id;
          return (
            <Button
              key={s.id}
              size="sm"
              variant={active ? 'primary' : 'ghost'}
              className={[
                'min-h-11 shrink-0 rounded-md',
                active ? '' : 'text-muted',
              ].join(' ')}
              onPress={() => setSection(s.id)}
            >
              {s.label}
            </Button>
          );
        })}
      </nav>

      {section === 'overview' && (
        <AdminOverviewPanel onGoSection={setSection} />
      )}
      {section === 'datasets' && (
        <DatasetsPage adminMode bare onGoBacktest={onGoBacktest} />
      )}
      {section === 'catalog' && <AdminCatalogPanel />}
      {section === 'users' && <AdminUsersPanel />}
      {section === 'jobs' && <AdminJobsPanel />}
      {section === 'system' && <AdminSystemPanel />}
    </AppPageFrame>
  );
}
