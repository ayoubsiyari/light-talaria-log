import type {
  BacktestParams,
  BacktestResult,
  BacktestWorkerRequest,
  BacktestWorkerResponse,
} from '@/types/backtest';
import type { Timeframe } from '@/types/ui';
import { newId } from '@/utils/uuid';
import { loadBarsForBacktest } from './loadBarsForBacktest';

let worker: Worker | null = null;
let nextId = 1;
/** Bumped on cancel / terminate so stale responses are ignored. */
let generation = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('@/backtest/backtestWorker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

function killWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/** Cancel any in-flight backtest (abandons Worker run). */
export function cancelBacktest(): void {
  generation += 1;
  killWorker();
}

export interface RunBacktestInput {
  sessionId: string;
  datasetId: string;
  timeframe: Timeframe;
  timeStart: number;
  timeEnd: number;
  params: BacktestParams;
}

/**
 * Stream IDB → TypedArrays → Worker strategy. Cancel via {@link cancelBacktest}.
 */
export async function runBacktest(input: RunBacktestInput): Promise<BacktestResult> {
  const gen = ++generation;

  const buffers = await loadBarsForBacktest(
    input.datasetId,
    input.timeframe,
    input.timeStart,
    input.timeEnd,
    { isCancelled: () => gen !== generation },
  );
  if (gen !== generation) {
    throw new DOMException('Backtest cancelled', 'AbortError');
  }
  if (!buffers || buffers.count === 0) {
    throw new Error('No bars available for backtest window');
  }

  // Copy into fresh buffers we can transfer (subarray may share a larger buffer)
  const times = new Float64Array(buffers.times);
  const opens = new Float32Array(buffers.opens);
  const highs = new Float32Array(buffers.highs);
  const lows = new Float32Array(buffers.lows);
  const closes = new Float32Array(buffers.closes);

  const requestId = nextId++;
  const w = getWorker();

  return new Promise<BacktestResult>((resolve, reject) => {
    if (gen !== generation) {
      reject(new DOMException('Backtest cancelled', 'AbortError'));
      return;
    }

    const onMessage = (e: MessageEvent<BacktestWorkerResponse>) => {
      const msg = e.data;
      if (msg.requestId !== requestId) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);

      if (gen !== generation) {
        reject(new DOMException('Backtest cancelled', 'AbortError'));
        return;
      }
      if (msg.type === 'error') {
        reject(new Error(msg.message));
        return;
      }

      resolve({
        runId: newId(),
        sessionId: input.sessionId,
        datasetId: input.datasetId,
        timeframe: input.timeframe,
        params: input.params,
        barCount: buffers.count,
        truncated: buffers.truncated,
        timeStart: buffers.timeStart,
        timeEnd: buffers.timeEnd,
        trades: msg.trades,
        events: Array.isArray(msg.events) ? msg.events : [],
        equity: msg.equity,
        finalEquity: msg.finalEquity,
        totalPnl: msg.totalPnl,
        createdAt: Date.now(),
      });
    };

    const onError = (err: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (gen !== generation) {
        reject(new DOMException('Backtest cancelled', 'AbortError'));
        return;
      }
      reject(err.error instanceof Error ? err.error : new Error(err.message || 'Worker error'));
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);

    const req: BacktestWorkerRequest = {
      type: 'run',
      requestId,
      times,
      opens,
      highs,
      lows,
      closes,
      params: input.params,
    };
    w.postMessage(req, [
      times.buffer,
      opens.buffer,
      highs.buffer,
      lows.buffer,
      closes.buffer,
    ]);
  });
}
