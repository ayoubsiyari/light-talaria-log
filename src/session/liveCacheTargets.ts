import type { PaneConfig, SessionState } from '@/session/sessionState';
import type { Timeframe } from '@/types/ui';

export type CacheTarget = { datasetId: string; tf: Timeframe };

/**
 * Unique warmCache keys needed for the live multi-pane session.
 * Per pane: pane TF (+ selectedTf if different) + base TF when HTF.
 * Retained legs: base TF only (orders) — never Cartesian datasets×all pane TFs.
 */
export function collectLiveCacheTargets(
  panes: Record<string, PaneConfig>,
  baseTf: Timeframe,
  retainedDatasets: readonly string[] = [],
): CacheTarget[] {
  const out: CacheTarget[] = [];
  const seen = new Set<string>();
  const add = (datasetId: string, tf: Timeframe) => {
    const k = `${datasetId}|${tf}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ datasetId, tf });
  };

  for (const p of Object.values(panes)) {
    add(p.datasetId, p.tf);
    if (p.selectedTf && p.selectedTf !== p.tf) {
      add(p.datasetId, p.selectedTf);
    }
    if (p.tf !== baseTf) {
      add(p.datasetId, baseTf);
    }
  }
  for (const ds of retainedDatasets) {
    add(ds, baseTf);
  }
  return out;
}

export function collectLiveCacheTargetsFromState(s: SessionState): CacheTarget[] {
  return collectLiveCacheTargets(s.panes, s.baseTf, s.retainedDatasets);
}
