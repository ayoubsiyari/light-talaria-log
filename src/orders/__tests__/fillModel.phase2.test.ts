/**
 * Phase 2 — §4.3 fill model as a table-driven fixture (written before implementation).
 * Run: npm run test:orders
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SPEC_EURUSD } from '@/orders/instrumentSpec';
import {
  evaluateFill,
  orderEventsInBarPath,
  resolveAmbiguousProtective,
  type FillKind,
} from '@/orders/fillModel';
import type { ChartBar } from '@/types/bar';

const s = 0.0002; // spread for table
const spec = { ...SPEC_EURUSD, typicalSpread: s };

interface Row {
  name: string;
  kind: FillKind;
  level: number;
  bar: ChartBar;
  expectTrigger: boolean;
  expectPrice?: number;
  gap?: boolean;
}

/**
 * §4.3 table — every row, both sides, plus a gap case for each order family.
 * Bar OHLC are BID prices.
 */
const TABLE: Row[] = [
  // --- Buy limit @ L: triggers when l ≤ L − s; fill min(L, o+s)
  {
    name: 'Buy limit triggers inside range',
    kind: 'BUY_LIMIT',
    level: 1.1,
    bar: { time: 1, open: 1.101, high: 1.102, low: 1.0995, close: 1.1005 },
    // l=1.0995 ≤ 1.1-0.0002=1.0998 → trigger; fill min(1.1, 1.101+0.0002)=min(1.1,1.1012)=1.1
    expectTrigger: true,
    expectPrice: 1.1,
  },
  {
    name: 'Buy limit gap helps (open below level)',
    kind: 'BUY_LIMIT',
    level: 1.1,
    bar: { time: 2, open: 1.098, high: 1.099, low: 1.097, close: 1.0985 },
    // l ≤ L-s; fill min(1.1, 1.098+0.0002)=1.0982
    expectTrigger: true,
    expectPrice: 1.0982,
    gap: true,
  },
  {
    name: 'Buy limit no trigger',
    kind: 'BUY_LIMIT',
    level: 1.1,
    bar: { time: 3, open: 1.102, high: 1.104, low: 1.101, close: 1.103 },
    expectTrigger: false,
  },

  // --- Sell limit @ L: h ≥ L; fill max(L, o)
  {
    name: 'Sell limit triggers',
    kind: 'SELL_LIMIT',
    level: 1.1,
    bar: { time: 4, open: 1.099, high: 1.101, low: 1.098, close: 1.1005 },
    expectTrigger: true,
    expectPrice: 1.1,
  },
  {
    name: 'Sell limit gap helps',
    kind: 'SELL_LIMIT',
    level: 1.1,
    bar: { time: 5, open: 1.102, high: 1.103, low: 1.1015, close: 1.1025 },
    expectTrigger: true,
    expectPrice: 1.102,
    gap: true,
  },

  // --- Buy stop @ P: h ≥ P − s; fill max(P, o+s) — gap hurts
  {
    name: 'Buy stop triggers',
    kind: 'BUY_STOP',
    level: 1.1,
    bar: { time: 6, open: 1.099, high: 1.1005, low: 1.0985, close: 1.1 },
    // h ≥ 1.0998; fill max(1.1, 1.0992)=1.1
    expectTrigger: true,
    expectPrice: 1.1,
  },
  {
    name: 'Buy stop gap hurts',
    kind: 'BUY_STOP',
    level: 1.1,
    bar: { time: 7, open: 1.102, high: 1.103, low: 1.1015, close: 1.1025 },
    // fill max(1.1, 1.1022)=1.1022
    expectTrigger: true,
    expectPrice: 1.1022,
    gap: true,
  },

  // --- Sell stop @ P: l ≤ P; fill min(P, o) — gap hurts
  {
    name: 'Sell stop triggers',
    kind: 'SELL_STOP',
    level: 1.1,
    bar: { time: 8, open: 1.101, high: 1.102, low: 1.0995, close: 1.1 },
    expectTrigger: true,
    expectPrice: 1.1,
  },
  {
    name: 'Sell stop gap hurts',
    kind: 'SELL_STOP',
    level: 1.1,
    bar: { time: 9, open: 1.098, high: 1.099, low: 1.097, close: 1.0985 },
    expectTrigger: true,
    expectPrice: 1.098,
    gap: true,
  },

  // --- Long TP @ P: h ≥ P; fill max(P, o)
  {
    name: 'Long TP',
    kind: 'LONG_TP',
    level: 1.1,
    bar: { time: 10, open: 1.099, high: 1.101, low: 1.098, close: 1.1005 },
    expectTrigger: true,
    expectPrice: 1.1,
  },
  {
    name: 'Long TP gap',
    kind: 'LONG_TP',
    level: 1.1,
    bar: { time: 11, open: 1.102, high: 1.103, low: 1.101, close: 1.1025 },
    expectTrigger: true,
    expectPrice: 1.102,
    gap: true,
  },

  // --- Long SL @ P: l ≤ P; fill min(P, o)
  {
    name: 'Long SL',
    kind: 'LONG_SL',
    level: 1.1,
    bar: { time: 12, open: 1.101, high: 1.102, low: 1.099, close: 1.1 },
    expectTrigger: true,
    expectPrice: 1.1,
  },
  {
    name: 'Long SL gap hurts',
    kind: 'LONG_SL',
    level: 1.1,
    bar: { time: 13, open: 1.098, high: 1.099, low: 1.097, close: 1.0985 },
    expectTrigger: true,
    expectPrice: 1.098,
    gap: true,
  },

  // --- Short TP @ P: l ≤ P − s; fill min(P, o+s)
  {
    name: 'Short TP',
    kind: 'SHORT_TP',
    level: 1.1,
    bar: { time: 14, open: 1.101, high: 1.102, low: 1.0995, close: 1.1 },
    // l ≤ 1.0998; fill min(1.1, 1.1012)=1.1
    expectTrigger: true,
    expectPrice: 1.1,
  },
  {
    name: 'Short TP gap helps',
    kind: 'SHORT_TP',
    level: 1.1,
    bar: { time: 15, open: 1.098, high: 1.099, low: 1.097, close: 1.0985 },
    expectTrigger: true,
    expectPrice: 1.0982,
    gap: true,
  },

  // --- Short SL @ P: h ≥ P − s; fill max(P, o+s)
  {
    name: 'Short SL',
    kind: 'SHORT_SL',
    level: 1.1,
    bar: { time: 16, open: 1.099, high: 1.1005, low: 1.0985, close: 1.1 },
    expectTrigger: true,
    expectPrice: 1.1,
  },
  {
    name: 'Short SL gap hurts',
    kind: 'SHORT_SL',
    level: 1.1,
    bar: { time: 17, open: 1.102, high: 1.103, low: 1.1015, close: 1.1025 },
    expectTrigger: true,
    expectPrice: 1.1022,
    gap: true,
  },

  // --- Market fills at next bar open (+spread for buys)
  {
    name: 'Buy market at next open+s',
    kind: 'BUY_MARKET',
    level: 0,
    bar: { time: 18, open: 1.1, high: 1.101, low: 1.099, close: 1.1005 },
    expectTrigger: true,
    expectPrice: 1.1002,
  },
  {
    name: 'Sell market at next open',
    kind: 'SELL_MARKET',
    level: 0,
    bar: { time: 19, open: 1.1, high: 1.101, low: 1.099, close: 1.1005 },
    expectTrigger: true,
    expectPrice: 1.1,
  },
];

describe('Phase 2 — §4.3 fill table', () => {
  for (const row of TABLE) {
    it(row.name, () => {
      const result = evaluateFill(row.kind, row.level, row.bar, s, spec);
      assert.equal(result.triggered, row.expectTrigger, 'trigger mismatch');
      if (row.expectTrigger && row.expectPrice != null) {
        assert.ok(
          Math.abs(result.fillPrice! - row.expectPrice) < spec.tickSize,
          `price ${result.fillPrice} != ${row.expectPrice}`,
        );
      }
    });
  }
});

describe('Phase 2 — bar path heuristic', () => {
  it('bullish bar path O→L→H→C', () => {
    const bar: ChartBar = { time: 1, open: 1.1, high: 1.12, low: 1.08, close: 1.11 };
    assert.deepEqual(orderEventsInBarPath(bar), ['O', 'L', 'H', 'C']);
  });

  it('bearish bar path O→H→L→C', () => {
    const bar: ChartBar = { time: 1, open: 1.1, high: 1.12, low: 1.08, close: 1.09 };
    assert.deepEqual(orderEventsInBarPath(bar), ['O', 'H', 'L', 'C']);
  });
});

describe('Phase 2 — ambiguous SL/TP in same bar', () => {
  it('stop-loss always wins and marks ambiguous', () => {
    const bar: ChartBar = { time: 1, open: 1.1, high: 1.12, low: 1.08, close: 1.11 };
    const r = resolveAmbiguousProtective({
      side: 'BUY',
      stopLoss: 1.09,
      takeProfit: 1.11,
      bar,
      spread: s,
      spec,
    });
    assert.equal(r.winner, 'stopLoss');
    assert.equal(r.ambiguous, true);
    assert.ok(r.fillPrice != null);
  });

  it('short: SL wins when both in range', () => {
    const bar: ChartBar = { time: 1, open: 1.1, high: 1.12, low: 1.08, close: 1.09 };
    const r = resolveAmbiguousProtective({
      side: 'SELL',
      stopLoss: 1.11,
      takeProfit: 1.09,
      bar,
      spread: s,
      spec,
    });
    assert.equal(r.winner, 'stopLoss');
    assert.equal(r.ambiguous, true);
  });
});
