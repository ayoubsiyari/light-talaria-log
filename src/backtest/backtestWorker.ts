import { runDonchianBreakout } from '@/backtest/strategies/donchianBreakout';
import { runGraphStrategy } from '@/backtest/strategies/runGraph';
import { runSmaCross } from '@/backtest/strategies/smaCross';
import {
  normalizeBacktestParams,
  type BacktestWorkerRequest,
  type BacktestWorkerResponse,
} from '@/types/backtest';

self.onmessage = (e: MessageEvent<BacktestWorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'run') return;

  try {
    const params = normalizeBacktestParams(msg.params);
    const out =
      params.strategyId === 'graph'
        ? (() => {
            if (!params.graph) {
              throw new Error('Puzzle graph missing');
            }
            return runGraphStrategy({
              times: msg.times,
              opens: msg.opens,
              highs: msg.highs,
              lows: msg.lows,
              closes: msg.closes,
              graph: params.graph,
              costs: params.costs,
              rules: params.rules,
            });
          })()
        : params.strategyId === 'donchian_breakout'
          ? runDonchianBreakout({
              times: msg.times,
              highs: msg.highs,
              lows: msg.lows,
              closes: msg.closes,
              donchian: params.donchian,
              costs: params.costs,
              rules: params.rules,
            })
          : runSmaCross({
              times: msg.times,
              highs: msg.highs,
              lows: msg.lows,
              closes: msg.closes,
              sma: params.sma,
              costs: params.costs,
              rules: params.rules,
            });

    const res: BacktestWorkerResponse = {
      type: 'result',
      requestId: msg.requestId,
      trades: out.trades,
      events: out.events,
      zones: 'zones' in out && Array.isArray(out.zones) ? out.zones : [],
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
