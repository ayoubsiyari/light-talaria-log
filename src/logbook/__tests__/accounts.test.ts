import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bestAccount,
  deskBook,
  deskSizing,
  fillMissingDeskFields,
  formatPropRules,
  homeDesks,
  normalizeAccount,
  propProgress,
  propRuleChips,
  snapshotFromAccount,
} from '../accounts';
import type { LogbookTrade } from '../types';

describe('logbook accounts', () => {
  it('keeps prop rules and drops empty live rules', () => {
    const prop = normalizeAccount({
      id: 'a1',
      name: 'FTMO 100k',
      kind: 'prop',
      platform: 'MT5',
      rules: { dailyLossPct: 5, maxLossPct: 10, notes: 'Flat Friday' },
    });
    assert.ok(prop);
    assert.equal(prop.kind, 'prop');
    assert.equal(prop.rules?.dailyLossPct, 5);
    assert.match(formatPropRules(prop.rules), /Daily 5%/);
    assert.deepEqual(
      propRuleChips(prop.rules).map((c) => c.id),
      ['daily', 'dd'],
    );
    assert.equal(snapshotFromAccount(prop).platform, 'MT5');

    const live = normalizeAccount({
      id: 'a2',
      name: 'IC Markets',
      kind: 'live',
      platform: 'cTrader',
      rules: { dailyLossPct: 5 },
    });
    assert.ok(live);
    assert.equal(live.rules, null);
  });

  it('rejects a desk without a name', () => {
    assert.equal(normalizeAccount({ id: 'x', name: '  ', kind: 'demo', platform: 'MT5' }), null);
  });

  it('defaults a missing Home pin to on, and lists only pinned desks', () => {
    const prop = normalizeAccount({
      id: 'a1',
      name: 'FTMO 100k',
      kind: 'prop',
      platform: 'MT5',
    });
    const demo = normalizeAccount({
      id: 'a2',
      name: 'Practice',
      kind: 'demo',
      platform: 'cTrader',
      onHome: false,
    });
    assert.ok(prop);
    assert.ok(demo);
    assert.equal(prop.onHome, true);
    assert.deepEqual(homeDesks([prop, demo]).map((a) => a.id), ['a1']);
  });

  it('fills sample size and unpins the practice desk when still untouched', () => {
    const current = [
      normalizeAccount({ id: 'demo-acct-ftmo', name: 'FTMO 100k', kind: 'prop', platform: 'MT5' }),
      normalizeAccount({
        id: 'demo-acct-demo',
        name: 'OANDA practice',
        kind: 'demo',
        platform: 'cTrader',
      }),
    ].filter((a): a is NonNullable<typeof a> => a !== null);
    const sample = [
      normalizeAccount({
        id: 'demo-acct-ftmo',
        name: 'FTMO 100k',
        kind: 'prop',
        platform: 'MT5',
        balance: 100_000,
        onHome: true,
      }),
      normalizeAccount({
        id: 'demo-acct-demo',
        name: 'OANDA practice',
        kind: 'demo',
        platform: 'cTrader',
        balance: 10_000,
        onHome: false,
      }),
    ].filter((a): a is NonNullable<typeof a> => a !== null);
    const next = fillMissingDeskFields(current, sample);
    assert.ok(next);
    assert.equal(next[0]?.balance, 100_000);
    assert.equal(next[0]?.onHome, true);
    assert.equal(next[1]?.balance, 10_000);
    assert.equal(next[1]?.onHome, false);
  });

  it('sizes a ticket from desk balance and risk cap', () => {
    const prop = normalizeAccount({
      id: 'a1',
      name: 'FTMO 100k',
      kind: 'prop',
      platform: 'MT5',
      balance: 100_000,
      rules: { maxRiskPct: 1 },
    });
    assert.ok(prop);
    assert.equal(prop.balance, 100_000);
    const size = deskSizing(prop);
    assert.ok(size);
    assert.equal(size.equity, 100_000);
    assert.equal(size.riskPct, 1);
    assert.equal(size.cap, 1000);
  });

  it('measures prop target progress from closed P&L', () => {
    const prop = normalizeAccount({
      id: 'a1',
      name: 'FTMO 100k',
      kind: 'prop',
      platform: 'MT5',
      balance: 100_000,
      rules: { profitTargetPct: 10 },
    });
    assert.ok(prop);
    const trades = [
      { accountId: 'a1', status: 'closed', netPnl: 4000 },
      { accountId: 'a1', status: 'open', netPnl: null },
      { accountId: 'a2', status: 'closed', netPnl: 9000 },
    ] as LogbookTrade[];
    const prog = propProgress(prop, trades);
    assert.ok(prog);
    assert.equal(prog.net, 4000);
    assert.equal(prog.target, 10_000);
    assert.equal(prog.pct, 0.4);
    assert.equal(prog.equity, 104_000);
    assert.equal(propProgress({ ...prop, kind: 'live' }, trades), null);
  });

  it('picks the desk with the strongest closed book', () => {
    const ftmo = normalizeAccount({
      id: 'a1',
      name: 'FTMO 100k',
      kind: 'prop',
      platform: 'MT5',
      onHome: true,
    });
    const live = normalizeAccount({
      id: 'a2',
      name: 'OANDA',
      kind: 'live',
      platform: 'cTrader',
      onHome: false,
    });
    assert.ok(ftmo);
    assert.ok(live);
    const trades = [
      { accountId: 'a1', status: 'closed', netPnl: 400 },
      { accountId: 'a2', status: 'closed', netPnl: 1200 },
      { accountId: 'a2', status: 'open', netPnl: null },
    ] as LogbookTrade[];
    assert.equal(bestAccount([ftmo, live], trades)?.id, 'a2');
    assert.equal(bestAccount([ftmo, live], []), null);
  });

  it('counts an untagged book on the Home pin', () => {
    const ftmo = normalizeAccount({
      id: 'a1',
      name: 'FTMO 100k',
      kind: 'prop',
      platform: 'MT5',
      onHome: true,
    });
    const live = normalizeAccount({
      id: 'a2',
      name: 'OANDA',
      kind: 'live',
      platform: 'cTrader',
      onHome: false,
    });
    assert.ok(ftmo);
    assert.ok(live);
    const trades = [
      { status: 'closed', netPnl: 460 },
      { status: 'closed', netPnl: -200 },
    ] as LogbookTrade[];
    assert.equal(bestAccount([ftmo, live], trades)?.id, 'a1');
    assert.equal(deskBook(ftmo, trades).length, 2);
    assert.equal(deskBook(live, trades).length, 2);
  });
});
