import { useState } from 'react';
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

export function AdminPage({ onGoBacktest }: AdminPageProps) {
  const { user } = useAuth();
  const [section, setSection] = useState<AdminSection>('overview');

  return (
    <AppPageFrame
      title="Admin"
      description="Platform management: datasets, users, jobs, and system health."
      nav={
        <div className="jd-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              data-active={section === s.id ? '1' : '0'}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      }
      actions={
        <button type="button" className="jd-btn jd-btn-ghost" onClick={onGoBacktest}>
          Sessions
        </button>
      }
    >
      <p className="jd-muted" style={{ marginBottom: 16 }}>
        Signed in as {user?.email ?? '—'} · admin
      </p>
      <div className="jd-card">
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
      </div>
    </AppPageFrame>
  );
}
