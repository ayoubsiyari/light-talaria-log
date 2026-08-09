/**
 * Edge prefetch triggers. Run:
 * node --experimental-strip-types --import ./scripts/register-alias.mjs --test src/utils/__tests__/viewportEdge.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNearBufferEdge } from '@/utils/viewportEdge';

describe('isNearBufferEdge', () => {
  it('triggers on empty left pad even when windowFrom is 0', () => {
    assert.equal(
      isNearBufferEdge({
        localFrom: -40,
        localTo: 80,
        bufferLen: 200,
        windowFrom: 0,
        totalBars: 200,
      }),
      true,
    );
  });

  it('triggers near buffer start when older series exists', () => {
    assert.equal(
      isNearBufferEdge({
        localFrom: 10,
        localTo: 130,
        bufferLen: 1000,
        windowFrom: 500,
        totalBars: 5000,
      }),
      true,
    );
  });

  it('does not trigger mid-buffer', () => {
    assert.equal(
      isNearBufferEdge({
        localFrom: 400,
        localTo: 520,
        bufferLen: 1000,
        windowFrom: 500,
        totalBars: 5000,
      }),
      false,
    );
  });
});
