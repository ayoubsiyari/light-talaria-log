/**
 * Scoped order-journal discovery for Journal / Analytics pages.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  createJournal,
  listPersistedJournalSessionIds,
  persistJournal,
} from '@/orders/journal';
import { setStorageUserId } from '@/sync/storageScope';

describe('listPersistedJournalSessionIds', () => {
  const mem = new Map<string, string>();

  beforeEach(() => {
    mem.clear();
    setStorageUserId(null);
    // Minimal localStorage stub for node tests.
    (globalThis as { localStorage?: Storage }).localStorage = {
      get length() {
        return mem.size;
      },
      clear() {
        mem.clear();
      },
      getItem(k: string) {
        return mem.has(k) ? mem.get(k)! : null;
      },
      setItem(k: string, v: string) {
        mem.set(k, v);
      },
      removeItem(k: string) {
        mem.delete(k);
      },
      key(i: number) {
        return [...mem.keys()][i] ?? null;
      },
    };
  });

  afterEach(() => {
    setStorageUserId(null);
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('finds anon scoped journals (not only legacy unscoped keys)', () => {
    const j = createJournal('sess-a', {
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      mode: 'netting',
    });
    persistJournal(j, { skipCloud: true });

    const ids = listPersistedJournalSessionIds();
    assert.ok(ids.includes('sess-a'), `expected sess-a in ${ids.join(',')}`);
  });

  it('finds per-user scoped journals when signed in', () => {
    setStorageUserId('user-42');
    const j = createJournal('sess-u', {
      symbol: 'USDJPY',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      mode: 'netting',
    });
    persistJournal(j, { skipCloud: true });

    const ids = listPersistedJournalSessionIds();
    assert.ok(ids.includes('sess-u'));
    // Must not require legacy talaria.orderJournal.v1: prefix.
    assert.equal(
      mem.has('talaria.orderJournal.v1:sess-u'),
      false,
    );
    assert.ok(
      [...mem.keys()].some((k) => k.includes('talaria.u.user-42.orderJournal.v1:')),
    );
  });
});
