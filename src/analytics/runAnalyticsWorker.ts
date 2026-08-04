import type { FilterState, TradeStore } from './types';
import type { WorkerRequest, WorkerResponse } from './analyticsWorker';

type ResultMsg = Extract<WorkerResponse, { type: 'result' }>;

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const IDLE_MS = 60_000;

function touchIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    terminateAnalyticsWorker();
  }, IDLE_MS);
}

export function getAnalyticsWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./analyticsWorker.ts', import.meta.url), {
      type: 'module',
    });
  }
  touchIdle();
  return worker;
}

export function terminateAnalyticsWorker(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

export function computeAnalytics(input: {
  store: TradeStore;
  filter: FilterState;
  riskFreeRate?: number;
  chartPoints?: number;
}): Promise<ResultMsg> {
  const w = getAnalyticsWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMsg = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (msg.id !== id) return;
      w.removeEventListener('message', onMsg);
      touchIdle();
      if (msg.type === 'error') reject(new Error(msg.message));
      else if (msg.type === 'result') resolve(msg);
      else reject(new Error('Unexpected worker response'));
    };
    w.addEventListener('message', onMsg);
    const req: WorkerRequest = {
      type: 'compute',
      id,
      store: input.store,
      filter: input.filter,
      riskFreeRate: input.riskFreeRate,
      chartPoints: input.chartPoints,
    };
    // Note: structured clone of typed arrays (copy). Transfer of whole store
    // would detach — we keep store on main for the trade list.
    w.postMessage(req);
  });
}
