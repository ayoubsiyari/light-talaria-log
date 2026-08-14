/**
 * Zoom LOD (TV-style selectedTf pin). Run:
 * node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/datasets/__tests__/zoomLod.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickLodTimeframe } from '@/datasets/zoomLod';

describe('pickLodTimeframe (TV-style)', () => {
  const available = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;

  it('keeps 1m when zoomed way out (does not coarsen to 5m)', () => {
    // ~10 days of 1m → far above old LOD_COARSEN threshold
    const windowSec = 10 * 24 * 60 * 60;
    assert.equal(
      pickLodTimeframe({
        windowSec,
        selectedTf: '1m',
        available,
        currentTf: '1m',
      }),
      '1m',
    );
  });

  it('does not stay on a previous LOD coarsen — returns selected floor', () => {
    assert.equal(
      pickLodTimeframe({
        windowSec: 10 * 24 * 60 * 60,
        selectedTf: '1m',
        available,
        currentTf: '5m',
      }),
      '1m',
    );
  });

  it('keeps higher selected TF on zoom-in', () => {
    assert.equal(
      pickLodTimeframe({
        windowSec: 60 * 60,
        selectedTf: '15m',
        available,
        currentTf: '15m',
      }),
      '15m',
    );
  });
});
