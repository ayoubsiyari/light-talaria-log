/**
 * Document replay dirty-path contract (cursor-only vs tip morph).
 * Full engine paint flags are integration-level; here we lock the tip-equality helper shape.
 * Run: npm run test:chart
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Mirror of createChart syncReplayReveal tip compare (pre-mutation snapshot). */
function tipBarChanged(
  prevTip: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null,
  nextTip: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null,
  didReplace: boolean,
  prevLen: number,
  nextLen: number,
): boolean {
  if (didReplace) return true;
  if (nextLen !== prevLen) return true;
  if (!prevTip || !nextTip || prevLen === 0) return true;
  return (
    prevTip.time !== nextTip.time ||
    prevTip.open !== nextTip.open ||
    prevTip.high !== nextTip.high ||
    prevTip.low !== nextTip.low ||
    prevTip.close !== nextTip.close ||
    prevTip.volume !== nextTip.volume
  );
}

describe('replay dirty path tip compare', () => {
  const tip = {
    time: 100,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 10,
  };

  it('same tip + same length → drawings-only candidate', () => {
    assert.equal(tipBarChanged(tip, { ...tip }, false, 50, 50), false);
  });

  it('forming tip OHLC change → series dirty', () => {
    assert.equal(
      tipBarChanged(tip, { ...tip, close: 1.6 }, false, 50, 50),
      true,
    );
  });

  it('append bar → series dirty', () => {
    assert.equal(tipBarChanged(tip, tip, false, 50, 51), true);
  });
});
