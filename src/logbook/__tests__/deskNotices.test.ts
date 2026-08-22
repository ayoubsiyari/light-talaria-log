import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deskNotices } from '../deskNotices';
import type { LogbookAccount, LogbookTrade } from '../types';

function desk(partial: Partial<LogbookAccount> & Pick<LogbookAccount, 'id' | 'name'>): LogbookAccount {
  return {
    kind: 'prop',
    platform: 'MT5',
    firm: 'FTMO',
    balance: 100_000,
    onHome: true,
    rules: {
      dailyLossPct: 5,
      maxLossPct: 10,
      profitTargetPct: 10,
      maxRiskPct: 1,
      minTradingDays: 4,
      newsTrading: false,
      weekendHold: false,
      notes: '',
    },
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

function trade(partial: Partial<LogbookTrade> & Pick<LogbookTrade, 'id'>): LogbookTrade {
  return {
    source: 'manual',
    status: 'open',
    symbol: 'EURUSD',
    side: 'long',
    openTime: 1_700_000_000,
    closeTime: null,
    entryPrice: 1.1,
    exitPrice: null,
    size: 1,
    stopPrice: null,
    targetPrice: null,
    commission: 0,
    netPnl: null,
    rMultiple: null,
    setup: null,
    tags: [],
    grade: null,
    emotion: null,
    rulesFollowed: null,
    plan: '',
    review: '',
    accountId: 'a1',
    accountName: 'FTMO 100k',
    accountKind: 'prop',
    platform: 'MT5',
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe('deskNotices', () => {
  it('asks for a desk when the book is empty', () => {
    const notes = deskNotices([], []);
    assert.equal(notes[0]?.id, 'no-desk');
  });

  it('asks to pin when nothing is on Home and nothing is open', () => {
    const notes = deskNotices([desk({ id: 'a1', name: 'FTMO 100k', onHome: false })], []);
    assert.ok(notes.some((n) => n.id === 'no-pin'));
  });

  it('lists standing rules on a pinned desk', () => {
    const notes = deskNotices([desk({ id: 'a1', name: 'FTMO 100k' })], []);
    const stand = notes.find((n) => n.id === 'stand-a1');
    assert.ok(stand);
    assert.match(stand.text, /no news/);
    assert.match(stand.text, /flat weekend/);
  });

  it('warns when a no-weekend desk still has an open ticket on Friday afternoon', () => {
    const friday = new Date(2026, 7, 21, 16, 0, 0).getTime();
    const notes = deskNotices(
      [desk({ id: 'a1', name: 'FTMO 100k' })],
      [trade({ id: 't1' })],
      friday,
    );
    assert.ok(notes.some((n) => n.id === 'wknd-open-a1'));
  });

  it('warns when today is through the daily loss', () => {
    const monday = new Date(2026, 7, 17, 15, 0, 0);
    const close = Math.floor(monday.getTime() / 1000);
    const notes = deskNotices(
      [desk({ id: 'a1', name: 'FTMO 100k' })],
      [
        trade({
          id: 't1',
          status: 'closed',
          closeTime: close,
          netPnl: -5500,
        }),
      ],
      monday.getTime(),
    );
    assert.ok(notes.some((n) => n.id === 'daily-hit-a1'));
  });
});
