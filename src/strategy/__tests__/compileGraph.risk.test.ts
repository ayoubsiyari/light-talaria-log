/**
 * Risk pieces + compileGraph strip for Worker.
 * Run: npm run test:strategy
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Edge, Node } from 'reactflow';
import { compileGraph } from '@/strategy/compileGraph';
import { rulesFromStrategyNodes } from '@/strategy/riskFromGraph';
import { DEFAULT_AUTOMATION_RULES } from '@/types/backtest';

function piece(
  id: string,
  kind: string,
  params: Record<string, number | string | boolean> = {},
): Node {
  return {
    id,
    type: 'piece',
    position: { x: 0, y: 0 },
    data: { pieceKind: kind, label: kind, params },
  };
}

describe('compileGraph + risk pieces', () => {
  it('compiles SMA → entry and strips risk from Worker graph', () => {
    const nodes: Node[] = [
      {
        id: 'entry',
        type: 'section',
        position: { x: 0, y: 0 },
        data: { kind: 'entry', label: 'Entry' },
      },
      {
        id: 'exit',
        type: 'section',
        position: { x: 0, y: 0 },
        data: { kind: 'exit', label: 'Exit' },
      },
      piece('sma', 'sma_cross', { fastPeriod: 5, slowPeriod: 20, side: 'buy' }),
      piece('sl', 'risk_stop_loss', { stopLossPct: 1 }),
    ];
    // Reachability walks from Entry outward
    const edges: Edge[] = [
      { id: 'e1', source: 'entry', target: 'sma' },
    ];
    const res = compileGraph(nodes, edges);
    assert.equal(res.ok, true, res.issues.map((i) => i.message).join('; '));
    assert.ok(res.graph);
    assert.equal(
      res.graph!.pieces.some((p) => p.kind === 'risk_stop_loss'),
      false,
    );
    assert.equal(
      res.graph!.pieces.some((p) => p.kind === 'sma_cross'),
      true,
    );
  });

  it('maps risk nodes into automation rules (percent → fraction)', () => {
    const nodes: Node[] = [
      piece('sl', 'risk_stop_loss', { stopLossPct: 0.5 }),
      piece('tp', 'risk_take_profit', { takeProfitPct: 1.5 }),
      piece('cd', 'risk_cooldown', { cooldownBars: 7 }),
      piece('dir', 'risk_direction', { direction: 'long' }),
    ];
    const rules = rulesFromStrategyNodes(nodes, DEFAULT_AUTOMATION_RULES);
    assert.ok(Math.abs(rules.stopLossPct - 0.005) < 1e-9);
    assert.ok(Math.abs(rules.takeProfitPct - 0.015) < 1e-9);
    assert.equal(rules.cooldownBars, 7);
    assert.equal(rules.direction, 'long');
  });
});
