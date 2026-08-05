/**
 * Risk:reward derivation from puzzle risk pieces.
 * Run: npm run test:strategy
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Node } from 'reactflow';
import { rulesFromStrategyNodes } from '@/strategy/riskFromGraph';
import { DEFAULT_AUTOMATION_RULES } from '@/types/backtest';

function piece(
  id: string,
  kind: string,
  params: Record<string, number | string | boolean>,
): Node {
  return {
    id,
    type: 'piece',
    position: { x: 0, y: 0 },
    data: { pieceKind: kind, label: kind, params },
  };
}

describe('risk_rr derivation', () => {
  it('sets TP = SL × R:R when TP piece absent', () => {
    const rules = rulesFromStrategyNodes(
      [
        piece('sl', 'risk_stop_loss', { stopLossPct: 1 }),
        piece('rr', 'risk_rr', { riskReward: 2 }),
      ],
      DEFAULT_AUTOMATION_RULES,
    );
    assert.ok(Math.abs(rules.stopLossPct - 0.01) < 1e-9);
    assert.ok(Math.abs(rules.takeProfitPct - 0.02) < 1e-9);
    assert.equal(rules.riskReward, 2);
  });

  it('keeps explicit TP when Take profit % is present', () => {
    const rules = rulesFromStrategyNodes(
      [
        piece('sl', 'risk_stop_loss', { stopLossPct: 1 }),
        piece('tp', 'risk_take_profit', { takeProfitPct: 3 }),
        piece('rr', 'risk_rr', { riskReward: 2 }),
      ],
      DEFAULT_AUTOMATION_RULES,
    );
    assert.ok(Math.abs(rules.takeProfitPct - 0.03) < 1e-9);
  });
});
