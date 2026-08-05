import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@heroui/react';
import {
  fetchAdminUsers,
  patchAdminUserRole,
  type AdminUserRow,
} from '@/admin/adminApi';
import { useAuth } from '@/auth/AuthContext';

export function AdminUsersPanel() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetchAdminUsers()
      .then(setUsers)
      .catch((err: unknown) => {
        setUsers([]);
        setError(err instanceof Error ? err.message : 'Failed to load users');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setRole = async (u: AdminUserRow, role: 'user' | 'admin') => {
    if (u.role === role) return;
    const label = role === 'admin' ? 'promote to admin' : 'demote to user';
    const ok = window.confirm(
      `${label}?\n\n${u.email}\n\nType-confirm: this changes platform access immediately.`,
    );
    if (!ok) return;
    setBusyId(u.id);
    setError(null);
    try {
      const updated = await patchAdminUserRole(u.id, role);
      setUsers((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-surface border border-border">
        <Card.Header className="px-4 sm:px-6 pt-5 pb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <Card.Title className="text-base">Users</Card.Title>
            <Card.Description className="text-muted text-sm">
              Promote or demote roles. Last admin cannot be demoted.
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
          {loading && users.length === 0 ? (
            <p className="text-sm text-muted py-6">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted py-6">No users found.</p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {users.map((u) => {
                const isSelf = me?.id === u.id;
                return (
                  <li
                    key={u.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 sm:px-4 py-3 bg-background/40 min-h-11"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{u.displayName}</p>
                      <p className="text-xs text-muted font-mono truncate">{u.email}</p>
                      {u.createdAt && (
                        <p className="text-[11px] text-muted font-mono mt-0.5">
                          joined {new Date(u.createdAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span
                      className={[
                        'text-xs font-mono uppercase px-2 py-1 rounded border shrink-0 w-fit',
                        u.role === 'admin'
                          ? 'border-accent text-accent'
                          : 'border-border text-muted',
                      ].join(' ')}
                    >
                      {u.role}
                      {isSelf ? ' · you' : ''}
                    </span>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {u.role === 'user' ? (
                        <Button
                          size="sm"
                          className="min-h-11"
                          isDisabled={busyId != null}
                          onPress={() => void setRole(u, 'admin')}
                        >
                          Make admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="min-h-11"
                          isDisabled={busyId != null || isSelf}
                          onPress={() => void setRole(u, 'user')}
                        >
                          Make user
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
