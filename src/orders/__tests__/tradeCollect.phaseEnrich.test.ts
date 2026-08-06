/**
 * Trade-collection enrichment — close payload, exitReason, MFE/MAE, riskPct.
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

const spec = { ...SPEC_EURUSD, stopLevel: 0, commissionPerLot: 7 };
const ctx: MarketContext = { spread: 0.0002, accountCurrency: 'USD' };

function bar(t: number, o: number, h: number, l: number, c: number): ChartBar {
  return { time: t, open: o, high: h, low: l, close: c };
}

function submit(
  state: ReturnType<typeof createInitialState>,
  order: Omit<
    Order,
    'status' | 'revision' | 'updatedAt' | 'filledAt' | 'fillPrice' | 'rejectReason'
  >,
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

describe('Trade collect enrichment', () => {
  it('SL close journals stop, costs, R, exitReason, and excursions', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'enrich-sl',
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
        stopLoss: 1.095,
        takeProfit: 1.12,
      },
      60,
      1.1,
      1.1002,
    );

    // Fill market + favorable then adverse path
    let stepped = stepEngine(
      state,
      bar(120, 1.1, 1.108, 1.099, 1.107),
      spec,
      ctx,
    );
    state = stepped.state;
    const openEv = stepped.events.find((e) => e.type === 'POSITION_OPENED');
    assert.ok(openEv);
    assert.equal(openEv!.payload.initialStopPrice, 1.095);
    assert.equal(openEv!.payload.initialTargetPrice, 1.12);
    assert.ok((openEv!.payload.entryCommissionAccount as number) > 0);
    assert.ok((openEv!.payload.riskPct as number) > 0);

    const pos = Object.values(state.positions)[0]!;
    assert.ok(pos.mfePrice >= 1.108 - spec.tickSize);
    assert.ok(pos.maePrice <= 1.099 + spec.tickSize);

    // Hit SL (low through stop; avoid TP)
    stepped = stepEngine(
      state,
      bar(180, 1.1, 1.101, 1.094, 1.096),
      spec,
      ctx,
    );
    state = stepped.state;
    const closed = stepped.events.find((e) => e.type === 'POSITION_CLOSED');
    assert.ok(closed, 'expected POSITION_CLOSED');
    const p = closed!.payload;
    assert.equal(p.exitReason, 'SL');
    assert.equal(p.initialStopPrice, 1.095);
    assert.equal(p.initialTargetPrice, 1.12);
    assert.ok((p.commissionAccount as number) > 0);
    assert.ok(typeof p.grossPnLAccount === 'number');
    assert.ok(typeof p.swapAccount === 'number');
    assert.ok(typeof p.rMultiple === 'number' && (p.rMultiple as number) < 0);
    assert.ok((p.mfePrice as number) >= 1.108 - spec.tickSize);
    assert.ok((p.maePrice as number) <= 1.094 + spec.tickSize);
    assert.equal(Object.keys(state.positions).length, 0);
    const collected = p.collected as Record<string, unknown> | undefined;
    assert.ok(collected);
    assert.equal(collected!.closeType, 'SL');
    assert.equal(collected!.orderType, 'MARKET');
    assert.ok(typeof collected!.holdingTimeHours === 'number');
    assert.ok(typeof collected!.mfe_r === 'number');
  });

  it('TP close sets exitReason TP', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'enrich-tp',
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
    const stepped = stepEngine(
      state,
      bar(180, 1.11, 1.121, 1.109, 1.12),
      spec,
      ctx,
    );
    const closed = stepped.events.find((e) => e.type === 'POSITION_CLOSED');
    assert.equal(closed?.payload.exitReason, 'TP');
  });
});
