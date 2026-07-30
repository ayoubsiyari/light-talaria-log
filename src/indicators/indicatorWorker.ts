import { computeIndicatorItem } from '@/indicators/registry';
import type { IndicatorWorkerRequest, IndicatorWorkerResponse } from '@/types/indicator';

self.onmessage = (e: MessageEvent<IndicatorWorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'compute') return;

  try {
    const bars = {
      opens: msg.opens,
      highs: msg.highs,
      lows: msg.lows,
      closes: msg.closes,
      volumes: msg.volumes,
      times: msg.times,
    };
    const items = msg.specs.map((spec) => computeIndicatorItem(bars, spec));
    const transfer: Transferable[] = [];
    for (const item of items) {
      for (const s of item.series) {
        transfer.push(s.values.buffer as ArrayBuffer);
      }
    }
    const res: IndicatorWorkerResponse = {
      type: 'result',
      requestId: msg.requestId,
      items,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res, transfer);
  } catch (err) {
    const res: IndicatorWorkerResponse = {
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : 'Indicator compute failed',
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res);
  }
};
