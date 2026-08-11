/**
 * Last-run ingest metrics for debug (I4). No UI — inspect via window.__talariaPipeline.
 */

export type PipelineIngestSource = 'local' | 'remote';

export interface PipelineIngestMetrics {
  datasetId: string;
  source: PipelineIngestSource;
  /** True when IDB was already healthy and worker ingest was skipped */
  skipped: boolean;
  durationMs: number;
  /** Base-TF row count when known */
  rowCount: number;
  at: number;
}

export type TalariaPipelineApi = {
  lastIngest: () => PipelineIngestMetrics | null;
  log: () => void;
};

let lastIngest: PipelineIngestMetrics | null = null;

export function recordIngestMetrics(m: Omit<PipelineIngestMetrics, 'at'>): void {
  lastIngest = { ...m, at: Date.now() };
  if (typeof window !== 'undefined') {
    ensurePipelineDebugApi();
  }
}

export function getLastIngestMetrics(): PipelineIngestMetrics | null {
  return lastIngest;
}

function ensurePipelineDebugApi(): void {
  if (typeof window === 'undefined') return;
  const api: TalariaPipelineApi = {
    lastIngest: () => lastIngest,
    log: () => {
      if (!lastIngest) {
        console.info('[talaria-pipeline] no ingest recorded yet');
        return;
      }
      console.info('[talaria-pipeline]', lastIngest);
    },
  };
  window.__talariaPipeline = api;
}

declare global {
  interface Window {
    __talariaPipeline?: TalariaPipelineApi;
  }
}
