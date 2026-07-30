import { getDataset, listDatasets } from '@/datasets/datasetStore';
import type { DownloadedDataset } from '@/types/dataset';
import type { BacktestSession, PairSymbol, SessionLeg } from '@/types/session';

/**
 * Prefer a 1m dataset for the pair/dates so higher TFs can be aggregated.
 * Falls back to the leg's own dataset.
 */
export function resolveBaseDatasetForPair(
  pair: PairSymbol,
  datasetId: string,
  startDate: string,
  endDate: string,
): DownloadedDataset | null {
  const owned = getDataset(datasetId);
  const candidates = listDatasets().filter((d) => d.pair === pair);

  const sameDates1m = candidates.find(
    (d) =>
      d.timeframe === '1m' &&
      d.startDate === startDate &&
      d.endDate === endDate,
  );
  if (sameDates1m) return sameDates1m;

  const covering1m = candidates.find(
    (d) =>
      d.timeframe === '1m' &&
      d.startDate <= startDate &&
      d.endDate >= endDate,
  );
  if (covering1m) return covering1m;

  if (owned?.timeframe === '1m') return owned;

  const any1m = candidates.find((d) => d.timeframe === '1m');
  if (any1m) return any1m;

  return owned;
}

/**
 * Prefer a 1m dataset for the session pair/dates so higher TFs can be aggregated.
 * Falls back to the session's own dataset.
 */
export function resolveBaseDataset(session: BacktestSession): DownloadedDataset | null {
  return resolveBaseDatasetForPair(
    session.pair,
    session.datasetId,
    session.startDate,
    session.endDate,
  );
}

/** Resolve a base download for every session leg. */
export function resolveBaseDatasetsForSession(
  session: BacktestSession,
): { leg: SessionLeg; dataset: DownloadedDataset }[] {
  const out: { leg: SessionLeg; dataset: DownloadedDataset }[] = [];
  for (const leg of session.legs) {
    const dataset = resolveBaseDatasetForPair(
      leg.pair,
      leg.datasetId,
      session.startDate,
      session.endDate,
    );
    if (dataset) out.push({ leg, dataset });
  }
  return out;
}
