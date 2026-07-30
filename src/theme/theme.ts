export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'fast-chart.theme';

type Listener = (mode: ThemeMode) => void;

const listeners = new Set<Listener>();

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // ignore
  }
  return 'dark';
}

/** Apply class + data-theme so Hero UI tokens resolve correctly. */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.dataset.theme = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  for (const cb of listeners) cb(mode);
}

export function getTheme(): ThemeMode {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function setTheme(mode: ThemeMode): void {
  applyTheme(mode);
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function subscribeTheme(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Call once before React mount to avoid a light flash (default: dark). */
export function initTheme(): ThemeMode {
  const mode = readStored();
  applyTheme(mode);
  return mode;
}
