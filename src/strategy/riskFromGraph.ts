/**
 * Extract automation risk rules from free-floating risk puzzle pieces.
 */
import type { Node } from 'reactflow';
import { isPieceData, isRiskKind } from '@/strategy/graphTypes';
import type { AutomationRules } from '@/types/backtest';
import { DEFAULT_AUTOMATION_RULES } from '@/types/backtest';

/** Merge risk nodes into automation rules (does not mutate base). */
export function rulesFromStrategyNodes(
  nodes: Node[],
  base: AutomationRules = DEFAULT_AUTOMATION_RULES,
): AutomationRules {
  const rules: AutomationRules = { ...base };
  let sawExplicitTp = false;
  for (const n of nodes) {
    if (!isPieceData(n.data) || !isRiskKind(n.data.pieceKind)) continue;
    const p = n.data.params;
    switch (n.data.pieceKind) {
      case 'risk_stop_loss': {
        const v = Number(p.stopLossPct);
        if (Number.isFinite(v) && v > 0) rules.stopLossPct = v / 100;
        break;
      }
      case 'risk_take_profit': {
        const v = Number(p.takeProfitPct);
        if (Number.isFinite(v) && v > 0) {
          rules.takeProfitPct = v / 100;
          sawExplicitTp = true;
        }
        break;
      }
      case 'risk_cooldown': {
        const v = Math.floor(Number(p.cooldownBars));
        if (Number.isFinite(v) && v >= 0) rules.cooldownBars = v;
        break;
      }
      case 'risk_direction': {
        const d = String(p.direction ?? 'both');
        if (d === 'long' || d === 'short' || d === 'both') rules.direction = d;
        break;
      }
      case 'risk_rr': {
        const v = Number(p.riskReward);
        if (Number.isFinite(v) && v > 0) rules.riskReward = v;
        break;
      }
    }
  }
  // Derive TP from R:R × SL when RR is set and TP was not explicitly provided.
  if (
    !sawExplicitTp &&
    rules.riskReward > 0 &&
    rules.stopLossPct > 0
  ) {
    rules.takeProfitPct = rules.stopLossPct * rules.riskReward;
  }
  return rules;
}
