/**
 * Session reload TF resolve + progress. Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  parseStoredTimeframe,
  resolveOpenTimeframe,
} from '@/sessions/sessionTf';
import {
  createSession,
  getSession,
  updateSessionProgress,
  deleteSession,
} from '@/sessions/sessionStore';

before(() => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, String(v));
    },
    removeItem: (k) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size;
    },
  };
});

after(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('resolveOpenTimeframe', () => {
  const available = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;

  it('prefers persisted selectedTf over create timeframe', () => {
    assert.equal(
      resolveOpenTimeframe(
        { timeframe: '1m', selectedTf: '5m' },
        available,
        '1m',
      ),
      '5m',
    );
  });

  it('falls back to create timeframe when selectedTf missing', () => {
    assert.equal(
      resolveOpenTimeframe({ timeframe: '1h' }, available, '1m'),
      '1h',
    );
  });

  it('skips selectedTf not in catalog intersection', () => {
    assert.equal(
      resolveOpenTimeframe(
        { timeframe: '1h', selectedTf: '1m' },
        ['1h', '4h', '1D'],
        '1h',
      ),
      '1h',
    );
  });
});

describe('parseStoredTimeframe', () => {
  it('accepts engine TFs only', () => {
    assert.equal(parseStoredTimeframe('1m'), '1m');
    assert.equal(parseStoredTimeframe('1D'), '1D');
    assert.equal(parseStoredTimeframe('2m'), null);
    assert.equal(parseStoredTimeframe(1), null);
  });
});

describe('updateSessionProgress selectedTf', () => {
  it('persists and reloads last TopBar TF', () => {
    const s = createSession(
      {
        name: 'tf-progress-test',
        timeframe: '1m',
        startDate: '2024-01-01',
        endDate: '2024-02-01',
        legs: [{ pair: 'NQ', datasetId: 'ds-tf-test' }],
      },
      { skipCloud: true },
    );
    try {
      assert.equal(s.selectedTf, '1m');
      const next = updateSessionProgress(
        s.id,
        { selectedTf: '4h', cursorTime: 1_700_000_000, span: 120 },
        { skipCloud: true },
      );
      assert.ok(next);
      assert.equal(next!.selectedTf, '4h');
      const loaded = getSession(s.id);
      assert.ok(loaded);
      assert.equal(loaded!.selectedTf, '4h');
      assert.equal(
        resolveOpenTimeframe(loaded!, ['1m', '5m', '4h', '1D'], '1m'),
        '4h',
      );
    } finally {
      deleteSession(s.id, { skipCloud: true });
    }
  });
});
