import { INDICATOR_DEFS, formatIndicatorLabel } from '@/indicators/defs';
import { computeSeries } from '@/indicators/math/allIndicators';
import type { OhlcBars } from '@/indicators/math/helpers';
import type {
  IndicatorId,
  IndicatorParams,
  IndicatorWorkerItem,
  IndicatorWorkerSpec,
} from '@/types/indicator';

export {
  INDICATOR_DEFS,
  INDICATOR_ORDER,
  INDICATOR_CATEGORIES,
  getIndicatorDef,
  formatIndicatorLabel,
} from '@/indicators/defs';

/** Dispatch one indicator compute (Worker-only). */
export function computeIndicatorItem(
  bars: OhlcBars,
  spec: IndicatorWorkerSpec,
): IndicatorWorkerItem {
  const def = INDICATOR_DEFS[spec.id];
  const params: IndicatorParams = { ...def.defaultParams, ...spec.params };
  const series = computeSeries(spec.id, bars, params);
  const label = formatIndicatorLabel(spec.id, params);

  if (def.placement === 'overlay') {
    return {
      instanceKey: spec.key,
      id: spec.id,
      label,
      placement: 'overlay',
      series,
    };
  }

  return {
    instanceKey: spec.key,
    id: spec.id,
    label,
    placement: 'pane',
    scaleMode: def.scaleMode ?? 'auto',
    fixedMin: def.fixedMin,
    fixedMax: def.fixedMax,
    levels: def.levels,
    series,
  };
}

export function isIndicatorId(id: string): id is IndicatorId {
  return id in INDICATOR_DEFS;
}
