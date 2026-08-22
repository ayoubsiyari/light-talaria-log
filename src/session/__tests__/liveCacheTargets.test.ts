/**
 * Live warmCache key selection. Run: npm run test:session
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectLiveCacheTargets } from '@/session/liveCacheTargets';
import type { PaneConfig } from '@/session/sessionState';

describe('collectLiveCacheTargets', () => {
  it('does not Cartesian-fill every dataset with every pane TF', () => {
    const panes: Record<string, PaneConfig> = {
      'pane-0': {
        datasetId: 'eur',
        tf: '1m',
        selectedTf: '1m',
        pair: 'EUR/USD',
      },
      'pane-1': {
        datasetId: 'gbp',
        tf: '15m',
        selectedTf: '15m',
        pair: 'GBP/USD',
      },
      'pane-2': {
        datasetId: 'nq',
        tf: '5m',
        selectedTf: '5m',
        pair: 'NQ',
      },
    };
    const targets = collectLiveCacheTargets(panes, '1m', ['eur', 'gbp', 'nq', 'jpy']);
    const keys = targets.map((t) => `${t.datasetId}|${t.tf}`).sort();
    // eur: 1m only (base). gbp: 15m + 1m. nq: 5m + 1m. jpy retained: 1m only.
    // Must NOT include gbp|5m, nq|15m, jpy|15m, etc.
    assert.deepEqual(
      keys,
      ['eur|1m', 'gbp|15m', 'gbp|1m', 'jpy|1m', 'nq|5m', 'nq|1m'].sort(),
    );
    assert.equal(keys.includes('gbp|5m'), false);
    assert.equal(keys.includes('nq|15m'), false);
    assert.equal(keys.includes('jpy|15m'), false);
  });

  it('caps unique keys well under Cartesian for 8 mixed panes', () => {
    const panes: Record<string, PaneConfig> = {};
    const tfs = ['1m', '5m', '15m', '1h', '4h', '1D', '5m', '15m'] as const;
    for (let i = 0; i < 8; i++) {
      panes[`pane-${i}`] = {
        datasetId: `ds-${i}`,
        tf: tfs[i]!,
        selectedTf: tfs[i]!,
        pair: `P${i}`,
      };
    }
    const targets = collectLiveCacheTargets(panes, '1m');
    // Cartesian would be 8 datasets × up to 6 TFs = 48. Live targets ≤ 8*2 = 16.
    assert.ok(targets.length <= 16);
    assert.ok(targets.length >= 8);
  });
});
