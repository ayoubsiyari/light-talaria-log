import { useState, type FormEvent } from 'react';
import { Button, Card, Label } from '@heroui/react';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { AuthMode } from '@/navigation/appRoute';

const fieldClass =
  'w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent';

interface AuthFormPageProps {
  mode: AuthMode;
  busy: boolean;
  error: string | null;
  onSubmit: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  onSwitchMode: (mode: AuthMode) => void;
  onGoHome: () => void;
}

/**
 * Shared sign-in / sign-up surface — Hero UI, mobile-friendly (≥44px targets).
 */
export function AuthFormPage({
  mode,
  busy,
  error,
  onSubmit,
  onSwitchMode,
  onGoHome,
}: AuthFormPageProps) {
  const isSignup = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError('Email and password are required.');
      return;
    }
    if (isSignup && password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    void onSubmit({
      email: trimmedEmail,
      password,
      displayName: isSignup ? displayName.trim() || undefined : undefined,
    }).catch(() => {
      // Parent surfaces API error via `error` prop
    });
  };

  const shownError = localError ?? error;

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-4 sm:px-6 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          className="flex min-h-11 items-center gap-2 min-w-0"
          onClick={onGoHome}
          aria-label="Talaria-Log home"
        >
          <BrandLogo size={26} />
          <span className="text-sm font-semibold tracking-tight truncate">
            Talaria<span className="text-accent">-</span>Log
          </span>
        </button>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:px-6 sm:py-14">
        <Card className="bg-surface border border-border">
          <Card.Header className="px-6 pt-6 pb-2">
            <Card.Title className="text-xl">
              {isSignup ? 'Create your account' : 'Sign in'}
            </Card.Title>
            <Card.Description className="text-muted text-sm">
              {isSignup
                ? 'Sign up to open sessions, charts, and your journal.'
                : 'Sign in to continue to your sessions and charts.'}
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-6 pb-6">
            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              {isSignup && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-name">Display name</Label>
                  <input
                    id="auth-name"
                    className={fieldClass}
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    disabled={busy}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="auth-email">Email</Label>
                <input
                  id="auth-email"
                  className={fieldClass}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-password">Password</Label>
                <input
                  id="auth-password"
                  className={fieldClass}
                  type="password"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isSignup ? 8 : 1}
                  disabled={busy}
                />
                {isSignup && (
                  <p className="text-xs text-muted">At least 8 characters.</p>
                )}
              </div>

              {shownError && (
                <p className="text-sm text-danger" role="alert">
                  {shownError}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full min-h-11"
                isDisabled={busy}
              >
                {busy
                  ? isSignup
                    ? 'Creating account…'
                    : 'Signing in…'
                  : isSignup
                    ? 'Create account'
                    : 'Sign in'}
              </Button>
            </form>

            <p className="mt-5 text-sm text-muted text-center">
              {isSignup ? 'Already have an account?' : 'Need an account?'}{' '}
              <button
                type="button"
                className="min-h-11 text-accent font-medium underline-offset-2 hover:underline px-1"
                disabled={busy}
                onClick={() => onSwitchMode(isSignup ? 'signin' : 'signup')}
              >
                {isSignup ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </Card.Content>
        </Card>
      </main>
    </div>
  );
}
