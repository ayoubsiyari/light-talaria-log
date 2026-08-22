import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchMe,
  loginRemote,
  logoutRemote,
  registerRemote,
} from '@/datasets/remoteApi';
import type { RemoteUser } from '@/types/remoteApi';
import { pullAll, setCloudSyncEnabled } from '@/sync/cloudSync';
import { setStorageUserId } from '@/sync/storageScope';
import { replaceJournalEntries } from '@/journal/journalStore';
import { replaceSessions } from '@/sessions/sessionStore';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: RemoteUser | null;
  /** Last auth/API error (login, register, bootstrap). */
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<RemoteUser>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<RemoteUser>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NEXT_KEY = 'talaria.auth.next';

/** Save intended hash route before redirecting to sign-in. */
export function rememberAuthNext(hashRoute: string): void {
  try {
    sessionStorage.setItem(NEXT_KEY, hashRoute);
  } catch {
    // ignore
  }
}

/** Consume saved post-login route (defaults to Journal). */
export function consumeAuthNext(fallback = '#/app/journal'): string {
  try {
    const v = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    if (v && v.startsWith('#/') && !v.startsWith('#/auth/')) return v;
  } catch {
    // ignore
  }
  return fallback;
}

async function hydrateCloud(user: RemoteUser): Promise<void> {
  setStorageUserId(user.id);
  setCloudSyncEnabled(true);
  // Empty this account's local cache first so we never show another user's
  // leftover sessions while pull runs (or if pull fails).
  replaceSessions([]);
  replaceJournalEntries([]);
  try {
    await pullAll();
  } catch (err) {
    console.warn('[auth] cloud pull failed — starting empty for this account', err);
  }
}

function clearCloudScope(): void {
  setCloudSyncEnabled(false);
  setStorageUserId(null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<RemoteUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      await hydrateCloud(me);
      setUser(me);
      setStatus('authenticated');
      setError(null);
    } catch {
      clearCloudScope();
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const u = await loginRemote(email, password);
      await hydrateCloud(u);
      setUser(u);
      setStatus('authenticated');
      return u;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      setError(msg);
      throw err;
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setError(null);
      try {
        const u = await registerRemote(email, password, displayName);
        await hydrateCloud(u);
        setUser(u);
        setStatus('authenticated');
        return u;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sign up failed';
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await logoutRemote();
    } catch {
      // Clear local auth even if network fails
    }
    clearCloudScope();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      clearError: () => setError(null),
      refresh,
      signIn,
      signUp,
      signOut,
    }),
    [status, user, error, refresh, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
