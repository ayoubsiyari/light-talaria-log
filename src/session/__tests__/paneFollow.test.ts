/**
 * Per-pane Play follow / span helpers. Run: npm run test:session
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paneFollowsTip, paneSpanOrDefault } from '@/session/paneFollow';

describe('paneFollowsTip', () => {
  it('keeps siblings following when one pane is detached', () => {
    const detached = new Set(['pane-1']);
    assert.equal(paneFollowsTip('pane-0', true, detached), true);
    assert.equal(paneFollowsTip('pane-1', true, detached), false);
    assert.equal(paneFollowsTip('pane-2', true, detached), true);
  });

  it('respects defaultFollow=false for everyone', () => {
    assert.equal(paneFollowsTip('pane-0', false, new Set()), false);
  });
});

describe('paneSpanOrDefault', () => {
  it('uses per-pane span when present', () => {
    assert.equal(
      paneSpanOrDefault('pane-0', 120, { 'pane-0': 80, 'pane-1': 200 }),
      80,
    );
  });

  it('falls back to session span', () => {
    assert.equal(paneSpanOrDefault('pane-3', 120, { 'pane-0': 80 }), 120);
  });
});
