/**
 * Phase 5 — event journal determinism (§7.1).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SPEC_EURUSD } from '@/orders/instrumentSpec';
import {
  createInitialState,
  hashState,
  reduceCommand,
  stepEngine,
} from '@/orders/orderEngine';
import { replaySteps, type ReplayableStep } from '@/orders/journal';
import type { MarketContext } from '@/orders/orderTypes';
import type { ChartBar } from '@/types/bar';

const spec = { ...SPEC_EURUSD, stopLevel: 0, commissionPerLot: 0 };
const ctx: MarketContext = { spread: 0.0002, accountCurrency: 'USD' };

function bar(t: number, o: number, h: number, l: number, c: number): ChartBar {
  return { time: t, open: o, high: h, low: l, close: c };
}

describe('Phase 5 — journal hash equality', () => {
  it('replaying the same steps yields an identical state hash', () => {
    const bootstrap = {
      symbol: 'EURUSD',
      accountCurrency: 'USD',
      balance: 10_000,
      leverage: 100,
      mode: 'netting' as const,
    };
    const sessionId = 'det-session-1';

    const steps: ReplayableStep[] = [
      {
        kind: 'command',
        command: {
          type: 'SUBMIT',
          cursorTime: 60,
          bid: 1.1,
          ask: 1.1002,
          order: {
            id: 'm1',
            symbol: 'EURUSD',
            side: 'BUY',
            type: 'MARKET',
            size: 0.5,
            tif: 'GTC',
            createdAt: 60,
            stopLoss: 1.09,
            takeProfit: 1.12,
          },
        },
      },
      { kind: 'bar', bar: bar(120, 1.1, 1.101, 1.099, 1.1), ctx },
      { kind: 'bar', bar: bar(180, 1.105, 1.11, 1.104, 1.108), ctx },
      { kind: 'bar', bar: bar(240, 1.108, 1.121, 1.107, 1.12), ctx },
    ];

    // Live run
    let live = createInitialState({ ...bootstrap, sessionId });
    for (const step of steps) {
      if (step.kind === 'command') {
        live = reduceCommand(live, step.command, spec).state;
      } else {
        live = stepEngine(live, step.bar, spec, step.ctx).state;
      }
    }
    const liveHash = hashState(live);

    // Replay into fresh engine
    const replayed = replaySteps(bootstrap, sessionId, steps, spec);
    const replayHash = hashState(replayed);

    assert.equal(replayHash, liveHash);
    assert.equal(replayed.seq, live.seq);
  });
});
