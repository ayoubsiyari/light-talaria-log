/**
 * Journal rebuild + backward seek — command log restores the open book.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOrderSessionBridge } from '@/orders/sessionBridge';
import {
  createJournal,
  hashState,
  normalizeJournal,
  truncateJournalTo,
  type OrderJournal,
} from '@/orders/journal';
import type { ChartBar } from '@/types/bar';

function bar(t: number, o: number, h: number, l: number, c: number): ChartBar {
  return { time: t, open: o, high: h, low: l, close: c, volume: 1 };
}

const bars: ChartBar[] = [
  bar(60, 1.1, 1.101, 1.099, 1.1),
  bar(120, 1.1, 1.101, 1.099, 1.1005),
  bar(180, 1.1005, 1.102, 1.1, 1.101),
  bar(240, 1.101, 1.103, 1.1005, 1.102),
  bar(300, 1.102, 1.104, 1.101, 1.103),
];

function getBars(
  _symbol: string,
  fromExclusive: number,
  toInclusive: number,
): ChartBar[] {
  return bars.filter((b) => b.time > fromExclusive && b.time <= toInclusive);
}

describe('Order journal rebuild', () => {
  it('rebuildTo at same cursor restores positions and state hash', () => {
    const bridge = createOrderSessionBridge({
      sessionId: 'rebuild-1',
      symbol: 'EUR/USD',
      balance: 10_000,
    });

    bridge.submit({
      cursorTime: 60,
      bid: 1.1,
      ask: 1.1002,
      order: {
        id: 'm1',
        symbol: 'EUR/USD',
        side: 'BUY',
        type: 'MARKET',
        size: 0.5,
        tif: 'GTC',
        createdAt: 60,
        stopLoss: 1.09,
        takeProfit: 1.12,
      },
    });
    bridge.advanceTo(180, getBars);

    const liveHash = hashState(bridge.getState());
    const livePositions = Object.keys(bridge.getState().positions).length;
    assert.ok(livePositions >= 1, 'expected an open position after fill');
    assert.ok(bridge.getJournal().commands.length >= 1);

    bridge.rebuildTo(180, getBars);

    assert.equal(hashState(bridge.getState()), liveHash);
    assert.equal(
      Object.keys(bridge.getState().positions).length,
      livePositions,
    );
    assert.equal(bridge.getJournal().commands.length, 1);
  });

  it('onSeekBackward truncates later fills and restores earlier book', () => {
    const bridge = createOrderSessionBridge({
      sessionId: 'rebuild-seek',
      symbol: 'EUR/USD',
      balance: 10_000,
    });

    bridge.submit({
      cursorTime: 60,
      bid: 1.1,
      ask: 1.1002,
      order: {
        id: 'm1',
        symbol: 'EUR/USD',
        side: 'BUY',
        type: 'MARKET',
        size: 0.2,
        tif: 'GTC',
        createdAt: 60,
      },
    });
    bridge.advanceTo(180, getBars);
    assert.ok(Object.keys(bridge.getState().positions).length >= 1);

    // Second entry later in the session
    bridge.submit({
      cursorTime: 240,
      bid: 1.101,
      ask: 1.1012,
      order: {
        id: 'm2',
        symbol: 'EUR/USD',
        side: 'BUY',
        type: 'MARKET',
        size: 0.1,
        tif: 'GTC',
        createdAt: 240,
      },
    });
    bridge.advanceTo(300, getBars);
    assert.equal(bridge.getJournal().commands.length, 2);

    // Rewind to before the second submit — only first command remains.
    bridge.onSeekBackward(180, getBars);

    assert.equal(bridge.getJournal().commands.length, 1);
    assert.ok(
      bridge.getJournal().commands.every((c) => c.cursorTime <= 180),
    );
    assert.ok(
      bridge.getJournal().entries.every((e) => e.cursorTime <= 180),
    );
    assert.ok(Object.keys(bridge.getState().positions).length >= 1);
    // Second market order must not be working after rewind.
    assert.equal(bridge.getState().orders['m2']?.status, undefined);
  });

  it('legacy journal without commands does not wipe entries on rebuild', () => {
    const bridge = createOrderSessionBridge({
      sessionId: 'legacy-j',
      symbol: 'EUR/USD',
      balance: 10_000,
    });

    const legacy: OrderJournal = normalizeJournal({
      sessionId: 'legacy-j',
      entries: [
        {
          seq: 1,
          cursorTime: 120,
          type: 'POSITION_CLOSED',
          payload: { positionId: 'p1', fillPrice: 1.1, size: 0.1, netPnLAccount: 5 },
          recordedAtMs: 0,
        },
      ],
      // simulate pre-command-log JSON
      commands: undefined as unknown as OrderJournal['commands'],
      bootstrap: {
        symbol: 'EURUSD',
        accountCurrency: 'USD',
        balance: 10_000,
        leverage: 100,
        mode: 'netting',
      },
    });

    bridge.hydrateJournal(legacy);
    assert.equal(bridge.getJournal().entries.length, 1);

    bridge.rebuildTo(180, getBars);

    // Entries preserved for analytics; open book stays empty.
    assert.equal(bridge.getJournal().entries.length, 1);
    assert.equal(Object.keys(bridge.getState().positions).length, 0);
    assert.equal(bridge.getJournal().commands.length, 0);
  });

  it('truncateJournalTo drops commands and entries past cursor', () => {
    const j = createJournal('t1', {
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      mode: 'netting',
    });
    const withStuff: OrderJournal = {
      ...j,
      commands: [
        {
          type: 'SUBMIT',
          cursorTime: 60,
          bid: 1,
          ask: 1.0002,
          order: {
            id: 'a',
            symbol: 'EURUSD',
            side: 'BUY',
            type: 'MARKET',
            size: 0.1,
            tif: 'GTC',
            createdAt: 60,
          },
        },
        {
          type: 'CANCEL',
          orderId: 'a',
          cursorTime: 200,
        },
      ],
      entries: [
        { seq: 1, cursorTime: 60, type: 'ORDER_ACCEPTED', payload: {}, recordedAtMs: 0 },
        { seq: 2, cursorTime: 200, type: 'ORDER_CANCELLED', payload: {}, recordedAtMs: 0 },
      ],
    };
    const cut = truncateJournalTo(withStuff, 100);
    assert.equal(cut.commands.length, 1);
    assert.equal(cut.entries.length, 1);
    assert.equal(cut.commands[0]!.cursorTime, 60);
  });
});
