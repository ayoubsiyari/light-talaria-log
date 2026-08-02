/**
 * Phase 3 — positions, brackets, OCO, trailing stops.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SPEC_EURUSD } from '@/orders/instrumentSpec';
import {
  createInitialState,
  reduceCommand,
  stepEngine,
} from '@/orders/orderEngine';
import type { MarketContext, Order } from '@/orders/orderTypes';
import type { ChartBar } from '@/types/bar';

const spec = { ...SPEC_EURUSD, stopLevel: 0, commissionPerLot: 0 };
const ctx: MarketContext = { spread: 0.0002, accountCurrency: 'USD' };

function bar(t: number, o: number, h: number, l: number, c: number): ChartBar {
  return { time: t, open: o, high: h, low: l, close: c };
}

function submit(
  state: ReturnType<typeof createInitialState>,
  order: Omit<Order, 'status' | 'revision' | 'updatedAt' | 'filledAt' | 'fillPrice' | 'rejectReason'>,
  cursorTime: number,
  bid: number,
  ask: number,
) {
  return reduceCommand(
    state,
    { type: 'SUBMIT', order, cursorTime, bid, ask },
    spec,
  ).state;
}

describe('Phase 3 — partial close', () => {
  it('leaves correct remaining size and splits realized PnL', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'p3-partial',
    });

    state = submit(
      state,
      {
        id: 'entry',
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'MARKET',
        size: 1,
        tif: 'GTC',
        createdAt: 60,
      },
      60,
      1.1,
      1.1002,
    );
    state = stepEngine(state, bar(120, 1.1, 1.101, 1.099, 1.1), spec, ctx).state;
    const pos = Object.values(state.positions)[0]!;
    assert.equal(pos.size, 1);

    // Partial close 0.4 via market sell
    state = submit(
      state,
      {
        id: 'close-part',
        symbol: 'EURUSD',
        side: 'SELL',
        type: 'MARKET',
        size: 0.4,
        tif: 'GTC',
        createdAt: 180,
      },
      180,
      1.105,
      1.1052,
    );
    state = stepEngine(state, bar(240, 1.105, 1.106, 1.104, 1.105), spec, ctx).state;

    const left = Object.values(state.positions)[0]!;
    assert.ok(Math.abs(left.size - 0.6) < 1e-9);
    assert.ok(left.realizedPnLAccount !== 0);
  });
});

describe('Phase 3 — OCO bracket', () => {
  it('filling TP cancels SL sibling in the same step', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'p3-oco',
    });

    state = submit(
      state,
      {
        id: 'br',
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'MARKET',
        size: 0.1,
        tif: 'GTC',
        createdAt: 60,
        stopLoss: 1.09,
        takeProfit: 1.12,
      },
      60,
      1.1,
      1.1002,
    );
    state = stepEngine(state, bar(120, 1.1, 1.101, 1.099, 1.1), spec, ctx).state;
    assert.ok(state.orders['br-sl']?.status === 'WORKING');
    assert.ok(state.orders['br-tp']?.status === 'WORKING');

    // Bar hits TP (and not SL)
    const stepped = stepEngine(
      state,
      bar(180, 1.11, 1.121, 1.109, 1.12),
      spec,
      ctx,
    );
    state = stepped.state;
    assert.equal(state.orders['br-tp']?.status, 'FILLED');
    assert.equal(state.orders['br-sl']?.status, 'CANCELLED');
    assert.equal(Object.keys(state.positions).length, 0);
  });
});

describe('Phase 3 — trailing stop never retreats', () => {
  it('sell trailing stop only ratchets up', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'p3-trail',
    });

    // Open long
    state = submit(
      state,
      {
        id: 'e',
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'MARKET',
        size: 0.1,
        tif: 'GTC',
        createdAt: 60,
      },
      60,
      1.1,
      1.1002,
    );
    state = stepEngine(state, bar(120, 1.1, 1.101, 1.099, 1.1), spec, ctx).state;
    const pos = Object.values(state.positions)[0]!;

    state = submit(
      state,
      {
        id: 'trail',
        symbol: 'EURUSD',
        side: 'SELL',
        type: 'TRAILING_STOP',
        size: 0.1,
        price: 1.095,
        trailDistance: 0.005,
        trailHighWater: 1.1,
        tif: 'GTC',
        createdAt: 180,
        positionId: pos.id,
        role: 'stopLoss',
      },
      180,
      1.1,
      1.1002,
    );

    // Price rallies — trail should rise
    state = stepEngine(state, bar(240, 1.11, 1.12, 1.109, 1.115), spec, ctx).state;
    const afterUp = state.orders.trail!.price!;
    assert.ok(afterUp >= 1.115 - 0.005 - spec.tickSize);

    // Price drops but not through stop — trail must not retreat
    state = stepEngine(state, bar(300, 1.114, 1.115, 1.11, 1.111), spec, ctx).state;
    const afterDown = state.orders.trail!.price!;
    assert.ok(afterDown >= afterUp - spec.tickSize);
  });
});
