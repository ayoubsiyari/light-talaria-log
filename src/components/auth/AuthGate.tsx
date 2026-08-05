import type { ReactNode } from 'react';
import { Spinner } from '@heroui/react';
import { useAuth } from '@/auth/AuthContext';

interface AuthGateProps {
  children: ReactNode;
  /** Shown while session cookie is checked. */
  fallback?: ReactNode;
}

/** Blocks protected UI until auth bootstrap finishes. */
export function AuthGate({ children, fallback }: AuthGateProps) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      fallback ?? (
        <div className="min-h-dvh flex items-center justify-center bg-background text-foreground">
          <div className="flex flex-col items-center gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-muted">Checking session & syncing…</p>
          </div>
        </div>
      )
    );
  }
  return <>{children}</>;
}
