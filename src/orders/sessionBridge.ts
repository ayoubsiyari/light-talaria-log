/**
 * Wires the pure order engine to the session clock.
 * Steps every base-TF bar the cursor passes — never skips, never reads warmCache
 * untruncated windows (caller supplies bars ≤ cursorTime one at a time).
 */

import { defaultSpecForSymbol, type InstrumentSpec } from './instrumentSpec';
import {
  appendEvents,
  createJournal,
  persistJournal,
  type OrderJournal,
} from './journal';
import {
  createInitialState,
  reduceCommand,
  stepEngine,
} from './orderEngine';
import type {
  EngineCommand,
  EngineEvent,
  MarketContext,
  OrderEngineState,
} from './orderTypes';
import { unrealizedPnL } from './pnl';
import type { ChartBar } from '@/types/bar';
import type { ChartOrder } from '@/types/order';

export type BarProvider = (fromTimeExclusive: number, toTimeInclusive: number) => ChartBar[];

export interface OrderSessionBridge {
  getState(): OrderEngineState;
  getJournal(): OrderJournal;
  getSpec(): InstrumentSpec;
  getLastReject(): string | null;
  /** Advance engine across every base bar in (lastStepped, cursorTime]. */
  advanceTo(cursorTime: number, getBars: BarProvider, ctx?: Partial<MarketContext>): EngineEvent[];
  submit(cmd: Omit<EngineCommand & { type: 'SUBMIT' }, 'type'>): EngineEvent[];
  cancel(orderId: string, cursorTime: number): EngineEvent[];
  modify(
    cmd: Omit<EngineCommand & { type: 'MODIFY' }, 'type'>,
  ): EngineEvent[];
  /** Backward seek: reset engine (positions cleared). See ORDER-SYSTEM-REPORT §11.5. */
  onSeekBackward(cursorTime: number): void;
  /** Chart overlay projection. */
  toChartOrders(sessionId: string): ChartOrder[];
  subscribe(cb: () => void): () => void;
}

export function createOrderSessionBridge(input: {
  sessionId: string;
  symbol: string;
  accountCurrency?: string;
  balance?: number;
  leverage?: number;
  spec?: InstrumentSpec;
}): OrderSessionBridge {
  const spec = input.spec ?? defaultSpecForSymbol(input.symbol);
  let state = createInitialState({
    symbol: input.symbol.replace('/', '').toUpperCase(),
    accountCurrency: input.accountCurrency ?? 'USD',
    balance: input.balance ?? 10_000,
    leverage: input.leverage ?? spec.leverage,
    sessionId: input.sessionId,
  });
  let journal = createJournal(input.sessionId, {
    symbol: state.symbol,
    accountCurrency: state.account.currency,
    balance: state.account.balance,
    leverage: state.account.leverage,
    mode: state.mode,
  });
  let lastSteppedTime: number | null = null;
  /** Last mark used for equity / chart P&L (bid = bar.close). */
  let lastBid = 0;
  let lastAsk = 0;
  let lastReject: string | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const cb of listeners) cb();
  };

  const commit = (events: EngineEvent[]) => {
    if (events.length === 0) return;
    journal = appendEvents(journal, events);
    persistJournal(journal);
    const rej = events.find((e) => e.type === 'ORDER_REJECTED');
    if (rej) {
      lastReject = String(rej.payload.reason ?? 'REJECTED');
    }
    notify();
  };

  const defaultCtx = (partial?: Partial<MarketContext>): MarketContext => ({
    spread: spec.typicalSpread,
    accountCurrency: state.account.currency,
    marketOpen: true,
    ...partial,
  });

  return {
    getState: () => state,
    getJournal: () => journal,
    getSpec: () => spec,
    getLastReject: () => lastReject,

    advanceTo(cursorTime, getBars, ctxPartial) {
      const ctx = defaultCtx(ctxPartial);
      const from = lastSteppedTime ?? Number.NEGATIVE_INFINITY;
      if (cursorTime <= from) return [];

      const bars = getBars(from, cursorTime);
      // Guard: never accept a bar ahead of cursor
      const events: EngineEvent[] = [];
      for (const bar of bars) {
        if (bar.time <= from) continue;
        if (bar.time > cursorTime) {
          console.error(
            '[orders] CRITICAL: bar.time > cursorTime handed to bridge — dropping',
            bar.time,
            cursorTime,
          );
          break;
        }
        // Pass a shallow copy so DEV freeze cannot poison the provider's array
        const copy: ChartBar = {
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        };
        const stepped = stepEngine(state, copy, spec, ctx);
        state = stepped.state;
        events.push(...stepped.events);
        lastSteppedTime = bar.time;
        lastBid = copy.close;
        lastAsk = copy.close + ctx.spread;
      }
      commit(events);
      return events;
    },

    submit(cmd) {
      lastReject = null;
      if (cmd.bid > 0) {
        lastBid = cmd.bid;
        lastAsk = cmd.ask > 0 ? cmd.ask : cmd.bid + spec.typicalSpread;
      }
      const result = reduceCommand(state, { type: 'SUBMIT', ...cmd }, spec);
      state = result.state;
      commit(result.events);
      return result.events;
    },

    cancel(orderId, cursorTime) {
      const result = reduceCommand(state, { type: 'CANCEL', orderId, cursorTime }, spec);
      state = result.state;
      commit(result.events);
      return result.events;
    },

    modify(cmd) {
      lastReject = null;
      if (cmd.bid > 0) {
        lastBid = cmd.bid;
        lastAsk = cmd.ask > 0 ? cmd.ask : cmd.bid + spec.typicalSpread;
      }
      const result = reduceCommand(state, { type: 'MODIFY', ...cmd }, spec);
      state = result.state;
      commit(result.events);
      return result.events;
    },

    onSeekBackward(cursorTime) {
      // v1 policy: reset engine (forbid carrying open positions into the past).
      state = createInitialState({
        symbol: state.symbol,
        accountCurrency: state.account.currency,
        balance: journal.bootstrap.balance,
        leverage: journal.bootstrap.leverage,
        sessionId: input.sessionId,
        mode: journal.bootstrap.mode,
      });
      lastSteppedTime = null;
      lastBid = 0;
      lastAsk = 0;
      journal = createJournal(input.sessionId, journal.bootstrap);
      persistJournal(journal);
      lastReject = null;
      void cursorTime;
      notify();
    },

    toChartOrders(sessionId) {
      const out: ChartOrder[] = [];
      const bid = lastBid;
      const ask = lastAsk > 0 ? lastAsk : lastBid + spec.typicalSpread;

      // Open positions keep entry + protective levels until SL/TP (or close) fills.
      for (const pos of Object.values(state.positions)) {
        let sl: number | null = null;
        let tp: number | null = null;
        for (const id of state.workingIds) {
          const o = state.orders[id];
          if (!o || o.positionId !== pos.id) continue;
          if (o.role === 'stopLoss' && o.price != null) sl = o.price;
          if (o.role === 'takeProfit' && o.price != null) tp = o.price;
        }
        let uPnL: number | null = null;
        if (bid > 0) {
          uPnL = unrealizedPnL(
            pos.side,
            pos.entryPrice,
            bid,
            ask,
            pos.size,
            spec,
            {
              accountCurrency: state.account.currency,
              instrumentPrice: bid,
            },
          ).amount;
        }
        out.push({
          id: pos.id,
          sessionId,
          pair: pos.symbol,
          side: pos.side === 'BUY' ? 'buy' : 'sell',
          entry: pos.entryPrice,
          stopLoss: sl,
          takeProfit: tp,
          createdAt: pos.openedAt,
          enginePositionId: pos.id,
          ambiguousFill: pos.ambiguousFill,
          size: pos.size,
          unrealizedPnL: uPnL,
        });
      }
      // Working entry orders (limits/stops/markets awaiting next-bar fill)
      for (const id of state.workingIds) {
        const o = state.orders[id];
        if (!o || o.role === 'stopLoss' || o.role === 'takeProfit') continue;
        if (o.type !== 'MARKET' && o.price == null) continue;
        if (
          o.type === 'MARKET' &&
          o.stopLoss == null &&
          o.takeProfit == null
        ) {
          continue;
        }
        out.push({
          id: o.id,
          sessionId,
          pair: o.symbol,
          side: o.side === 'BUY' ? 'buy' : 'sell',
          entry: o.type === 'MARKET' ? null : (o.price ?? null),
          stopLoss: o.stopLoss ?? null,
          takeProfit: o.takeProfit ?? null,
          createdAt: o.createdAt,
          engineOrderId: o.id,
          working: true,
          size: o.size,
          unrealizedPnL: null,
        });
      }
      return out;
    },

    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
