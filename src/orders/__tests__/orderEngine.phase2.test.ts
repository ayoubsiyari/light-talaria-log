/**
 * Phase 2 — market/limit engine integration (netting, no margin).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SPEC_EURUSD } from '@/orders/instrumentSpec';
import {
  createInitialState,
  reduceCommand,
  stepEngine,
} from '@/orders/orderEngine';
import type { MarketContext } from '@/orders/orderTypes';
import type { ChartBar } from '@/types/bar';

const spec = { ...SPEC_EURUSD, stopLevel: 0 };
const ctx: MarketContext = { spread: 0.0002, accountCurrency: 'USD' };

function bar(t: number, o: number, h: number, l: number, c: number): ChartBar {
  return { time: t, open: o, high: h, low: l, close: c, volume: 1 };
}

describe('Phase 2 — market fills at next bar open', () => {
  it('buy market does not fill on submit bar; fills at next open+spread', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'test-mkt',
    });

    // Submit while sitting on bar 60 — must NOT use this close
    const sub = reduceCommand(
      state,
      {
        type: 'SUBMIT',
        cursorTime: 60,
        bid: 1.1005,
        ask: 1.1007,
        order: {
          id: 'm1',
          symbol: 'EURUSD',
          side: 'BUY',
          type: 'MARKET',
          size: 0.1,
          tif: 'GTC',
          createdAt: 60,
        },
      },
      spec,
    );
    state = sub.state;
    assert.equal(state.orders.m1?.status, 'WORKING');
    assert.equal(Object.keys(state.positions).length, 0);

    // Advance to next bar — fill at open+spread
    const next = bar(120, 1.101, 1.102, 1.1, 1.1015);
    const stepped = stepEngine(state, next, spec, ctx);
    state = stepped.state;
    assert.equal(state.orders.m1?.status, 'FILLED');
    const pos = Object.values(state.positions)[0];
    assert.ok(pos);
    assert.ok(Math.abs(pos!.entryPrice - (1.101 + 0.0002)) < spec.tickSize);
  });

  it('market submitted at T ignores history bars ≤ T (Play must not fill on bar 0)', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'test-mkt-hist',
    });
    state = reduceCommand(
      state,
      {
        type: 'SUBMIT',
        cursorTime: 300,
        bid: 1.1,
        ask: 1.1002,
        order: {
          id: 'm-hist',
          symbol: 'EURUSD',
          side: 'BUY',
          type: 'MARKET',
          size: 0.1,
          tif: 'GTC',
          createdAt: 300,
        },
      },
      spec,
    ).state;

    // Simulate a bad Play feed that re-walks history before the submit bar
    for (const t of [60, 120, 180, 240, 300] as const) {
      state = stepEngine(
        state,
        bar(t, 1.09, 1.11, 1.08, 1.1),
        spec,
        ctx,
      ).state;
      assert.equal(
        state.orders['m-hist']?.status,
        'WORKING',
        `must still be working after bar ${t}`,
      );
      assert.equal(Object.keys(state.positions).length, 0);
    }

    // First bar strictly after submit fills
    state = stepEngine(state, bar(360, 1.101, 1.102, 1.1, 1.1015), spec, ctx).state;
    assert.equal(state.orders['m-hist']?.status, 'FILLED');
    assert.equal(Object.keys(state.positions).length, 1);
  });
});

describe('Phase 2 — limit fill', () => {
  it('buy limit fills when low reaches level', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'test-lim',
    });
    const sub = reduceCommand(
      state,
      {
        type: 'SUBMIT',
        cursorTime: 60,
        bid: 1.105,
        ask: 1.1052,
        order: {
          id: 'l1',
          symbol: 'EURUSD',
          side: 'BUY',
          type: 'LIMIT',
          size: 0.1,
          price: 1.1,
          tif: 'GTC',
          createdAt: 60,
        },
      },
      spec,
    );
    state = sub.state;

    // First step at submit time does not fill (price above)
    state = stepEngine(state, bar(60, 1.105, 1.106, 1.104, 1.105), spec, ctx).state;
    assert.equal(state.orders.l1?.status, 'WORKING');

    state = stepEngine(state, bar(120, 1.101, 1.102, 1.0995, 1.1005), spec, ctx).state;
    assert.equal(state.orders.l1?.status, 'FILLED');
  });
});
