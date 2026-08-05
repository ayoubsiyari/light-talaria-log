import { Card } from '@heroui/react';
import { useAuth } from '@/auth/AuthContext';
import { DatasetsPage } from '@/components/dataset/DatasetsPage';

interface AdminPageProps {
  onGoBacktest: () => void;
}

/**
 * Admin-only control plane: dataset download, import, publish, cache, delete.
 * Regular users never see this — they only consume published datasets at Create Session.
 */
export function AdminPage({ onGoBacktest }: AdminPageProps) {
  const { user } = useAuth();

  return (
    <DatasetsPage
      adminMode
      onGoBacktest={onGoBacktest}
      adminBanner={
        <Card className="bg-surface border border-border">
          <Card.Content className="px-6 py-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted">Signed in as </span>
              <span className="font-medium text-foreground break-all">
                {user?.email ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-muted">Role </span>
              <span className="font-medium text-accent">admin</span>
            </div>
            <p className="w-full text-xs text-muted">
              Dataset download, publish, import, and cache controls are admin-only.
            </p>
          </Card.Content>
        </Card>
      }
    />
  );
}
