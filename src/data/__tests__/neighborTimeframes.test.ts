/**
 * Neighbor TF ladder. Run:
 * node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/data/__tests__/neighborTimeframes.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { neighborTimeframes } from '@/data/timeframeAgg';

describe('neighborTimeframes', () => {
  it('returns finer + coarser for a mid TF', () => {
    assert.deepEqual(neighborTimeframes('5m'), ['1m', '15m']);
    assert.deepEqual(neighborTimeframes('1h'), ['15m', '4h']);
  });

  it('returns only coarser at the fine end', () => {
    assert.deepEqual(neighborTimeframes('1m'), ['5m']);
  });

  it('returns only finer at the coarse end', () => {
    assert.deepEqual(neighborTimeframes('1D'), ['4h']);
  });

  it('respects available catalog subset', () => {
    assert.deepEqual(neighborTimeframes('1m', ['1m', '1h', '1D']), ['1h']);
    assert.deepEqual(neighborTimeframes('1h', ['1m', '1h', '1D']), ['1m', '1D']);
  });
});
