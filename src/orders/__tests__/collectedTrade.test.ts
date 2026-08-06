/**
 * Auto-collected trade record on SL/TP close.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { asCollectedTrade } from '@/orders/collectedTrade';
import { SPEC_EURUSD } from '@/orders/instrumentSpec';
import {
  createInitialState,
  reduceCommand,
  stepEngine,
} from '@/orders/orderEngine';
import type { MarketContext, Order } from '@/orders/orderTypes';
import { projectOrderJournal } from '@/orders/tradeJournal';
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

describe('CollectedTrade auto-collect', () => {
  it('POSITION_CLOSED carries full collected record from chart', () => {
    let state = createInitialState({
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      sessionId: 'collect-1',
      sourceFileId: 'dataset-abc',
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

    state = stepEngine(
      state,
      bar(120, 1.1, 1.108, 1.099, 1.107),
      spec,
      ctx,
    ).state;

    const stepped = stepEngine(
      state,
      bar(180, 1.1, 1.101, 1.094, 1.096),
      spec,
      ctx,
    );
    const closed = stepped.events.find((e) => e.type === 'POSITION_CLOSED');
    assert.ok(closed);
    const collected = asCollectedTrade(closed!.payload.collected);
    assert.ok(collected, 'expected collected payload');
    assert.equal(collected!.sourceFileId, 'dataset-abc');
    assert.equal(collected!.symbol, 'EURUSD');
    assert.equal(collected!.ticker, 'EURUSD');
    assert.equal(collected!.type, 'buy');
    assert.equal(collected!.direction, 'buy');
    assert.equal(collected!.orderType, 'MARKET');
    assert.equal(collected!.status, 'closed');
    assert.equal(collected!.closeType, 'SL');
    assert.ok(collected!.openPrice > 0);
    assert.ok(collected!.closePrice > 0);
    assert.equal(collected!.initial_sl, 1.095);
    assert.equal(collected!.initial_tp, 1.12);
    assert.equal(collected!.quantity, 0.1);
    assert.ok((collected!.originalRiskAmount ?? 0) > 0);
    assert.ok((collected!.rewardToRiskRatio ?? 0) > 0);
    assert.ok(typeof collected!.rMultiple === 'number');
    assert.ok(typeof collected!.netPnL === 'number');
    assert.ok(typeof collected!.holdingTimeHours === 'number');
    assert.ok(collected!.dayOfWeek >= 0 && collected!.dayOfWeek <= 6);
    assert.ok(collected!.mfe_r != null && collected!.mfe_r > 0);
    assert.ok(collected!.mae_r != null && collected!.mae_r > 0);
    assert.equal(collected!.highestPrice, collected!.mfe);
    assert.equal(collected!.lowestPrice, collected!.mae);
    assert.ok(collected!.spread_pips_at_entry != null);
    assert.ok(collected!.commission_at_entry >= 0);
    assert.ok(collected!.pip_value_at_entry != null);
    assert.equal(collected!.preTradeNotes, null);
    assert.deepEqual(collected!.railScreenshots, []);
    assert.equal(collected!.postExitBars, null);
    assert.equal(collected!.bar_mfe_r, null);

    const view = projectOrderJournal({
      sessionId: 'collect-1',
      commands: [],
      bootstrap: {
        symbol: 'EURUSD',
        accountCurrency: 'USD',
        balance: 10_000,
        leverage: 100,
        mode: 'netting',
      },
      entries: [
        {
          seq: 1,
          cursorTime: collected!.openTime,
          type: 'POSITION_OPENED',
          payload: {
            positionId: collected!.tradeId,
            side: 'BUY',
            size: 0.1,
            entryPrice: collected!.entryPrice,
          },
          recordedAtMs: 0,
        },
        {
          seq: closed!.seq,
          cursorTime: closed!.cursorTime,
          type: 'POSITION_CLOSED',
          payload: closed!.payload,
          recordedAtMs: 0,
        },
      ],
    });
    assert.equal(view.trades.length, 1);
    assert.ok(view.trades[0]!.collected);
    assert.equal(view.trades[0]!.collected!.closeType, 'SL');
  });
});
