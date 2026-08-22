/**
 * Local-first manual journal. Separate IndexedDB from chart bar chunks.
 * Falls back to in-memory when IndexedDB is missing (Node tests).
 */
import { getStorageUserId } from '@/sync/storageScope';
import { newId } from '@/utils/uuid';
import { fillMissingDeskFields, normalizeAccount } from './accounts';
import { draftToTrade, normalizeTrade, validateDraft } from './compute';
import { buildExampleLogbook } from './exampleLogbook';
import { csvToDrafts, tradesToCsv } from './logbookCsv';
import type { LogbookAccount, LogbookDraft, LogbookTrade } from './types';

const DB_VERSION = 1;
const STORE_TRADES = 'trades';
const STORE_META = 'meta';
const PLAYBOOK_KEY = 'playbook';
const ACCOUNTS_KEY = 'accounts';
const EXAMPLE_KEY = 'exampleSeeded';

type Listener = () => void;

let cache: LogbookTrade[] = [];
let setups: string[] = [];
let accounts: LogbookAccount[] = [];
let hydratedFor: string | null = null;
let hydratePromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function scopeId(): string {
  return getStorageUserId() ?? 'anon';
}

function dbName(): string {
  return `talaria-logbook.${scopeId()}`;
}

function notify(): void {
  for (const fn of listeners) fn();
}

export function subscribeLogbook(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function sortTrades(list: LogbookTrade[]): LogbookTrade[] {
  return [...list].sort((a, b) => {
    const ta = a.closeTime ?? a.openTime;
    const tb = b.closeTime ?? b.openTime;
    return tb - ta;
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(), DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TRADES)) {
        db.createObjectStore(STORE_TRADES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
  });
}

async function idbLoad(): Promise<{
  trades: LogbookTrade[];
  setups: string[];
  accounts: LogbookAccount[];
}> {
  const db = await openDb();
  try {
    const trades = await new Promise<LogbookTrade[]>((resolve, reject) => {
      const tx = db.transaction(STORE_TRADES, 'readonly');
      const req = tx.objectStore(STORE_TRADES).getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        resolve(
          rows
            .map(normalizeTrade)
            .filter((t): t is LogbookTrade => t !== null),
        );
      };
      req.onerror = () => reject(req.error);
    });
    const rawSetups = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(PLAYBOOK_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const nextSetups = Array.isArray(rawSetups)
      ? rawSetups
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim())
      : [];
    const rawAccounts = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(ACCOUNTS_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const nextAccounts = Array.isArray(rawAccounts)
      ? rawAccounts.map(normalizeAccount).filter((a): a is LogbookAccount => a !== null)
      : [];
    return { trades: sortTrades(trades), setups: nextSetups, accounts: nextAccounts };
  } finally {
    db.close();
  }
}

async function idbPutTrade(trade: LogbookTrade): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TRADES, 'readwrite');
      tx.objectStore(STORE_TRADES).put(trade);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDeleteTrade(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_TRADES, 'readwrite');
      tx.objectStore(STORE_TRADES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbPutMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGetMeta(key: string): Promise<unknown> {
  const db = await openDb();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPutSetups(next: string[]): Promise<void> {
  await idbPutMeta(PLAYBOOK_KEY, next);
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function hydrateLogbook(): Promise<void> {
  const scope = scopeId();
  if (hydratedFor === scope && hydratePromise == null) return;
  if (hydratePromise && hydratedFor === scope) return hydratePromise;
  hydratedFor = scope;
  hydratePromise = (async () => {
    if (!hasIndexedDb()) {
      cache = sortTrades(cache);
      return;
    }
    const loaded = await idbLoad();
    cache = loaded.trades;
    setups = loaded.setups;
    accounts = loaded.accounts;
  })().finally(() => {
    hydratePromise = null;
  });
  await hydratePromise;
  notify();
}

/** Test helper — replace in-memory ledger without IDB. */
export function replaceLogbookForTests(
  trades: LogbookTrade[],
  playbook: string[] = [],
  desks: LogbookAccount[] = [],
): void {
  cache = sortTrades(trades.map(normalizeTrade).filter((t): t is LogbookTrade => t !== null));
  setups = [...playbook];
  accounts = desks.map(normalizeAccount).filter((a): a is LogbookAccount => a !== null);
  hydratedFor = scopeId();
  notify();
}

export function listLogbookTrades(): LogbookTrade[] {
  return cache;
}

export function getLogbookTrade(id: string): LogbookTrade | null {
  return cache.find((t) => t.id === id) ?? null;
}

export function listPlaybookSetups(): string[] {
  return [...setups];
}

export function listLogbookAccounts(): LogbookAccount[] {
  return [...accounts];
}

export function getLogbookAccount(id: string): LogbookAccount | null {
  return accounts.find((a) => a.id === id) ?? null;
}

async function persistAccounts(): Promise<void> {
  if (hasIndexedDb()) await idbPutMeta(ACCOUNTS_KEY, accounts);
}

export async function upsertLogbookAccount(input: {
  id?: string;
  name: string;
  kind: LogbookAccount['kind'];
  platform: string;
  firm?: string | null;
  balance?: number | null;
  onHome?: boolean;
  rules?: LogbookAccount['rules'];
}): Promise<LogbookAccount> {
  await hydrateLogbook();
  const now = Date.now();
  const id = input.id?.trim() || newId();
  const existing = accounts.find((a) => a.id === id) ?? null;
  const next = normalizeAccount({
    ...existing,
    ...input,
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  if (!next) throw new Error('Name the account and pick Prop, Live, or Demo.');
  accounts = [...accounts.filter((a) => a.id !== next.id), next].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  await persistAccounts();
  notify();
  return next;
}

export async function setLogbookAccountOnHome(id: string, onHome: boolean): Promise<void> {
  const existing = getLogbookAccount(id);
  if (!existing) return;
  await upsertLogbookAccount({ ...existing, onHome });
}

export async function removeLogbookAccount(id: string): Promise<void> {
  await hydrateLogbook();
  accounts = accounts.filter((a) => a.id !== id);
  await persistAccounts();
  notify();
}

export async function upsertLogbookTrade(
  draft: LogbookDraft,
  opts: { addSetup?: boolean } = {},
): Promise<LogbookTrade> {
  const err = validateDraft(draft);
  if (err) throw new Error(err);
  await hydrateLogbook();
  const existing = draft.id ? getLogbookTrade(draft.id) : null;
  const trade = draftToTrade(
    { ...draft, id: existing?.id ?? draft.id ?? newId() },
    Date.now(),
    existing,
  );
  if (!trade.id) trade.id = newId();
  cache = sortTrades([...cache.filter((t) => t.id !== trade.id), trade]);
  if (opts.addSetup && trade.setup) {
    await addPlaybookSetup(trade.setup);
  }
  if (hasIndexedDb()) await idbPutTrade(trade);
  notify();
  return trade;
}

export async function deleteLogbookTrade(id: string): Promise<LogbookTrade | null> {
  await hydrateLogbook();
  const existing = cache.find((t) => t.id === id) ?? null;
  cache = cache.filter((t) => t.id !== id);
  if (hasIndexedDb()) await idbDeleteTrade(id);
  notify();
  return existing;
}

export async function restoreLogbookTrade(trade: LogbookTrade): Promise<void> {
  const next = normalizeTrade(trade);
  if (!next) throw new Error('Cannot restore that trade.');
  await hydrateLogbook();
  cache = sortTrades([...cache.filter((t) => t.id !== next.id), next]);
  if (hasIndexedDb()) await idbPutTrade(next);
  notify();
}

export function exportLogbookCsv(): string {
  return tradesToCsv(cache);
}

export async function importLogbookCsv(text: string): Promise<{
  imported: number;
  skipped: number;
  errors: string[];
}> {
  const { drafts, errors } = csvToDrafts(text);
  let imported = 0;
  let skipped = 0;
  for (const draft of drafts) {
    try {
      await upsertLogbookTrade(draft);
      imported += 1;
    } catch {
      skipped += 1;
    }
  }
  return { imported, skipped, errors };
}

/**
 * First empty book in this browser scope gets a sample week of tickets.
 * Never overwrites a ledger that already has rows. Tests (no IDB) skip it.
 * Demo-only books pick up newer sample ids (older week/month tickets) without
 * rewriting tickets the trader already has.
 */
export async function ensureExampleLogbook(): Promise<void> {
  if (!hasIndexedDb()) return;
  await hydrateLogbook();
  const sample = buildExampleLogbook();
  if (cache.length === 0) {
    try {
      if (await idbGetMeta(EXAMPLE_KEY)) return;
    } catch {
      return;
    }
    cache = sortTrades(sample.trades);
    setups = [...sample.setups];
    accounts = [...sample.accounts];
    for (const trade of cache) {
      await idbPutTrade(trade);
    }
    await idbPutSetups(setups);
    await persistAccounts();
    await idbPutMeta(EXAMPLE_KEY, 1);
    notify();
    return;
  }
  if (!cache.every((t) => t.id.startsWith('demo-'))) return;
  const have = new Set(cache.map((t) => t.id));
  const missing = sample.trades.filter((t) => !have.has(t.id));
  if (missing.length === 0 && accounts.length > 0) {
    const patched = fillMissingDeskFields(accounts, sample.accounts);
    if (patched) {
      accounts = patched;
      await persistAccounts();
      notify();
    }
    return;
  }
  if (missing.length > 0) {
    cache = sortTrades([...cache, ...missing]);
    for (const trade of missing) {
      await idbPutTrade(trade);
    }
  }
  if (accounts.length === 0 && sample.accounts.length > 0) {
    accounts = [...sample.accounts];
    await persistAccounts();
    const sampleById = new Map(sample.trades.map((t) => [t.id, t]));
    const next: LogbookTrade[] = [];
    for (const trade of cache) {
      if (trade.accountId) {
        next.push(trade);
        continue;
      }
      const src = sampleById.get(trade.id);
      if (!src?.accountId) {
        next.push(trade);
        continue;
      }
      const patched: LogbookTrade = {
        ...trade,
        accountId: src.accountId,
        accountName: src.accountName,
        accountKind: src.accountKind,
        platform: src.platform,
      };
      next.push(patched);
      await idbPutTrade(patched);
    }
    cache = sortTrades(next);
  }
  notify();
}

export async function addPlaybookSetup(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  await hydrateLogbook();
  if (setups.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return trimmed;
  setups = [...setups, trimmed];
  if (hasIndexedDb()) await idbPutSetups(setups);
  notify();
  return trimmed;
}

export async function removePlaybookSetup(name: string): Promise<void> {
  await hydrateLogbook();
  setups = setups.filter((s) => s !== name);
  if (hasIndexedDb()) await idbPutSetups(setups);
  notify();
}
