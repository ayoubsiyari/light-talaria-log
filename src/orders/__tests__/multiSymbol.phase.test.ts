/**
 * Multi-pair: open positions on two symbols; each steps on its own bars.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOrderSessionBridge } from '@/orders/sessionBridge';
import type { ChartBar } from '@/types/bar';

function bar(t: number, c: number): ChartBar {
  return { time: t, open: c, high: c + 0.0002, low: c - 0.0002, close: c, volume: 1 };
}

describe('Multi-symbol session bridge', () => {
  it('keeps EUR and GBP positions independent across shared clock', () => {
    const bridge = createOrderSessionBridge({
      sessionId: 'multi-sym',
      symbol: 'EUR/USD',
      symbols: ['EUR/USD', 'GBP/USD'],
      balance: 50_000,
    });

    const eurusd: ChartBar[] = [
      bar(60, 1.1),
      bar(120, 1.101),
      bar(180, 1.102),
      bar(240, 1.103),
    ];
    const gbpusd: ChartBar[] = [
      bar(60, 1.25),
      bar(120, 1.251),
      bar(180, 1.252),
      bar(240, 1.253),
    ];

    const getBars = (symbol: string, from: number, to: number) => {
      const src = symbol.includes('GBP') ? gbpusd : eurusd;
      return src.filter((b) => b.time > from && b.time <= to);
    };

    // Open EUR market at t=60
    bridge.submit({
      cursorTime: 60,
      bid: 1.1,
      ask: 1.10015,
      order: {
        id: 'e1',
        symbol: 'EUR/USD',
        side: 'BUY',
        type: 'MARKET',
        size: 0.1,
        tif: 'GTC',
        createdAt: 60,
      },
    });
    // Open GBP market at t=60
    bridge.submit({
      cursorTime: 60,
      bid: 1.25,
      ask: 1.25015,
      order: {
        id: 'g1',
        symbol: 'GBP/USD',
        side: 'SELL',
        type: 'MARKET',
        size: 0.1,
        tif: 'GTC',
        createdAt: 60,
      },
    });

    bridge.advanceTo(120, getBars);

    const positions = Object.values(bridge.getState().positions);
    assert.equal(positions.length, 2);
    const eur = positions.find((p) => p.symbol.includes('EUR'));
    const gbp = positions.find((p) => p.symbol.includes('GBP'));
    assert.ok(eur);
    assert.ok(gbp);
    assert.equal(eur!.side, 'BUY');
    assert.equal(gbp!.side, 'SELL');
    // Filled at next bar open ± spread — must stay on each instrument's scale
    assert.ok(eur!.entryPrice > 1.09 && eur!.entryPrice < 1.12);
    assert.ok(gbp!.entryPrice > 1.24 && gbp!.entryPrice < 1.26);

    // Marks must stay per-symbol (TradeDock used to price JPY with EUR bid).
    const eurMark = bridge.getMark('EUR/USD');
    const gbpMark = bridge.getMark('GBP/USD');
    assert.ok(eurMark && eurMark.bid > 1.09 && eurMark.bid < 1.12);
    assert.ok(gbpMark && gbpMark.bid > 1.24 && gbpMark.bid < 1.26);
  });
});
