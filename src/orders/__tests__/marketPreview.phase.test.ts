/**
 * Pending MARKET chart preview freezes at submit tip.
 * Run: npm run test:orders (or node --test via package script)
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOrderSessionBridge } from '@/orders/sessionBridge';
import type { ChartBar } from '@/types/bar';

function bar(t: number, c: number): ChartBar {
  return { time: t, open: c, high: c + 0.0002, low: c - 0.0002, close: c, volume: 1 };
}

describe('Pending MARKET chart preview', () => {
  it('freezes entry at submit bid until next-bar fill', () => {
    const bridge = createOrderSessionBridge({
      sessionId: 'mkt-preview',
      symbol: 'EUR/USD',
      balance: 10_000,
    });
    const bars = [bar(60, 1.1), bar(120, 1.105), bar(180, 1.11)];
    const getBars = (_s: string, from: number, to: number) =>
      bars.filter((b) => b.time > from && b.time <= to);

    bridge.submit({
      cursorTime: 60,
      bid: 1.1,
      ask: 1.1002,
      order: {
        id: 'm1',
        symbol: 'EUR/USD',
        side: 'BUY',
        type: 'MARKET',
        size: 0.1,
        tif: 'GTC',
        createdAt: 60,
      },
    });

    // Still working — chart must show frozen tip, not the later mark.
    bridge.advanceTo(60, getBars);
    const pending = bridge.toChartOrders('mkt-preview').find((o) => o.id === 'm1');
    assert.ok(pending?.working);
    assert.equal(pending!.entry, 1.1);

    // Manually bump mark via a no-op-ish path: advance without fill bars past
    // submit still frozen until fill removes the working order.
    const still = bridge.toChartOrders('mkt-preview').find((o) => o.id === 'm1');
    assert.equal(still!.entry, 1.1);

    bridge.advanceTo(120, getBars);
    const after = bridge.toChartOrders('mkt-preview');
    assert.ok(!after.some((o) => o.id === 'm1' && o.working));
    assert.ok(after.some((o) => !o.working && !o.draft && o.entry != null));
  });
});
