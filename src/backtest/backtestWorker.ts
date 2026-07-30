import { runSmaCross } from '@/backtest/strategies/smaCross';
import type { BacktestWorkerRequest, BacktestWorkerResponse } from '@/types/backtest';

self.onmessage = (e: MessageEvent<BacktestWorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'run') return;

  try {
    if (msg.params.strategyId !== 'sma_cross') {
      throw new Error(`Unknown strategy: ${msg.params.strategyId}`);
    }
    const out = runSmaCross({
      times: msg.times,
      closes: msg.closes,
      sma: msg.params.sma,
      costs: msg.params.costs,
    });
    const res: BacktestWorkerResponse = {
      type: 'result',
      requestId: msg.requestId,
      trades: out.trades,
      equity: out.equity,
      finalEquity: out.finalEquity,
      totalPnl: out.totalPnl,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res);
  } catch (err) {
    const res: BacktestWorkerResponse = {
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : 'Backtest failed',
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res);
  }
};
