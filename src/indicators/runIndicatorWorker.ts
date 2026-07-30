import type { ChartBar } from '@/types/bar';
import type {
  IndicatorInstance,
  IndicatorOverlayResult,
  IndicatorPaneResult,
  IndicatorSeries,
  IndicatorWorkerRequest,
  IndicatorWorkerResponse,
} from '@/types/indicator';

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('@/indicators/indicatorWorker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

/**
 * Compute overlay + pane indicators for the current viewport bars (≤2500).
 * Off main thread; colors applied here from IndicatorInstance.
 */
export function computeIndicators(
  bars: readonly ChartBar[],
  instances: readonly IndicatorInstance[],
): Promise<{ overlays: IndicatorOverlayResult[]; panes: IndicatorPaneResult[] }> {
  const visible = instances.filter((i) => i.visible);
  if (visible.length === 0 || bars.length === 0) {
    return Promise.resolve({ overlays: [], panes: [] });
  }

  const n = bars.length;
  const opens = new Float32Array(n);
  const highs = new Float32Array(n);
  const lows = new Float32Array(n);
  const closes = new Float32Array(n);
  const volumes = new Float32Array(n);
  const times = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    opens[i] = b.open;
    highs[i] = b.high;
    lows[i] = b.low;
    closes[i] = b.close;
    volumes[i] = b.volume ?? 0;
    times[i] = b.time;
  }

  const requestId = nextId++;
  const w = getWorker();
  const colorByKey = new Map(visible.map((i) => [i.key, i.colors] as const));

  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<IndicatorWorkerResponse>) => {
      const msg = e.data;
      if (msg.requestId !== requestId) return;
      w.removeEventListener('message', onMessage);
      if (msg.type === 'error') {
        reject(new Error(msg.message));
        return;
      }

      const overlays: IndicatorOverlayResult[] = [];
      const panes: IndicatorPaneResult[] = [];

      for (const item of msg.items) {
        const colors = colorByKey.get(item.instanceKey) ?? [];
        const series: IndicatorSeries[] = item.series.map((s, idx) => ({
          key: s.key,
          style: s.style,
          color: colors[idx] ?? colors[0] ?? '#006fee',
          values: s.values,
          bandPairKey: s.bandPairKey,
        }));

        if (item.placement === 'overlay') {
          overlays.push({
            instanceKey: item.instanceKey,
            id: item.id,
            label: item.label,
            placement: 'overlay',
            series,
          });
        } else {
          panes.push({
            instanceKey: item.instanceKey,
            id: item.id,
            label: item.label,
            placement: 'pane',
            scaleMode: item.scaleMode,
            fixedMin: item.fixedMin,
            fixedMax: item.fixedMax,
            levels: item.levels,
            series,
          });
        }
      }

      resolve({ overlays, panes });
    };
    w.addEventListener('message', onMessage);

    const req: IndicatorWorkerRequest = {
      type: 'compute',
      requestId,
      opens,
      highs,
      lows,
      closes,
      volumes,
      times,
      specs: visible.map((i) => ({
        key: i.key,
        id: i.id,
        params: i.params,
      })),
    };
    w.postMessage(req, [
      opens.buffer,
      highs.buffer,
      lows.buffer,
      closes.buffer,
      volumes.buffer,
      times.buffer,
    ]);
  });
}
