/**
 * Namespace localStorage by signed-in user so accounts never mix on one browser.
 *
 * Authenticated users NEVER inherit unscoped/legacy keys — that leaked sessions
 * from a previous account into a newly created one.
 */
let activeUserId: string | null = null;

export function setStorageUserId(userId: string | null): void {
  activeUserId = userId && userId.trim() ? userId.trim() : null;
}

export function getStorageUserId(): string | null {
  return activeUserId;
}

/** Prefixed key for the active account (or anonymous). */
export function scopedKey(base: string): string {
  if (!activeUserId) return `talaria.anon.${base}`;
  return `talaria.u.${activeUserId}.${base}`;
}

/**
 * Read the active account's scoped key.
 * Legacy unscoped keys are only used while anonymous (pre-login), never for a signed-in user.
 */
export function readScopedOrLegacy(
  base: string,
  legacyKeys: string[],
): string | null {
  try {
    const scoped = localStorage.getItem(scopedKey(base));
    if (scoped != null) return scoped;
    // Do not copy browser leftovers into a real account.
    if (activeUserId) return null;
    for (const legacy of legacyKeys) {
      const raw = localStorage.getItem(legacy);
      if (raw != null) {
        localStorage.setItem(scopedKey(base), raw);
        return raw;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function writeScoped(base: string, value: string): void {
  localStorage.setItem(scopedKey(base), value);
}

export function removeScoped(base: string): void {
  try {
    localStorage.removeItem(scopedKey(base));
  } catch {
    /* ignore */
  }
}
