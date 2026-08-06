/**
 * Wires the pure order engine to the session clock.
 * Steps every base-TF bar the cursor passes — never skips, never reads warmCache
 * untruncated windows (caller supplies bars ≤ cursorTime one at a time).
 *
 * Multi-pair: each open symbol is stepped against its own bars + InstrumentSpec
 * on the shared session clock.
 */

import {
  applyCostPolicy,
  defaultSpecForSymbol,
  instrumentSymbolKey,
  type InstrumentSpec,
} from './instrumentSpec';
import {
  appendCommand,
  appendEvents,
  createJournal,
  normalizeJournal,
  persistJournal,
  truncateJournalTo,
  type OrderJournal,
} from './journal';
import {
  createInitialState,
  reduceCommand,
  refreshAccountFromMarks,
  stepEngine,
  type SymbolMark,
} from './orderEngine';
import type {
  EngineCommand,
  EngineEvent,
  MarketContext,
  OrderEngineState,
} from './orderTypes';
import { unrealizedPnL } from './pnl';
import { closedChartOrdersFromJournal } from './tradeJournal';
import type { ChartBar } from '@/types/bar';
import type { ChartOrder } from '@/types/order';

/** Bars for one symbol in (fromExclusive, toInclusive], ≤ cursor. */
export type SymbolBarProvider = (
  symbol: string,
  fromTimeExclusive: number,
  toTimeInclusive: number,
) => ChartBar[];

/** @deprecated Prefer SymbolBarProvider — kept for single-symbol call sites. */
export type BarProvider = (fromTimeExclusive: number, toTimeInclusive: number) => ChartBar[];

export interface OrderSessionBridge {
  getState(): OrderEngineState;
  getJournal(): OrderJournal;
  /** Spec for a symbol (defaults to session primary). */
  getSpec(symbol?: string): InstrumentSpec;
  getLastReject(): string | null;
  /**
   * Advance engine across every base bar in (lastStepped, cursorTime].
   * `getBars(symbol, from, to)` must return that symbol's bars only.
   */
  advanceTo(
    cursorTime: number,
    getBars: SymbolBarProvider,
    ctx?: Partial<MarketContext>,
  ): EngineEvent[];
  submit(cmd: Omit<EngineCommand & { type: 'SUBMIT' }, 'type'>): EngineEvent[];
  cancel(orderId: string, cursorTime: number): EngineEvent[];
  modify(
    cmd: Omit<EngineCommand & { type: 'MODIFY' }, 'type'>,
  ): EngineEvent[];
  /**
   * Replace in-memory journal with a persisted copy (e.g. session load).
   * Does not rebuild engine state — call `rebuildTo` next.
   */
  hydrateJournal(stored: OrderJournal): void;
  /**
   * Reset engine from bootstrap and replay commands + bars up to cursorTime.
   * Truncates journal past the cursor; regenerates event entries.
   */
  rebuildTo(cursorTime: number, getBars: SymbolBarProvider): void;
  /** Backward seek: rebuild book to the new cursor (keeps history ≤ t). */
  onSeekBackward(cursorTime: number, getBars: SymbolBarProvider): void;
  /** Chart overlay projection. */
  toChartOrders(sessionId: string): ChartOrder[];
  subscribe(cb: () => void): () => void;
}

function collectExposureSymbols(state: OrderEngineState): string[] {
  const keys = new Set<string>();
  for (const pos of Object.values(state.positions)) {
    keys.add(instrumentSymbolKey(pos.symbol));
  }
  for (const id of state.workingIds) {
    const o = state.orders[id];
    if (o) keys.add(instrumentSymbolKey(o.symbol));
  }
  return [...keys];
}

export function createOrderSessionBridge(input: {
  sessionId: string;
  symbol: string;
  /** All session legs — specs pre-seeded so any pair can trade. */
  symbols?: readonly string[];
  accountCurrency?: string;
  balance?: number;
  leverage?: number;
  spec?: InstrumentSpec;
  /** Dataset id stamped onto auto-collected trades. */
  sourceFileId?: string | null;
}): OrderSessionBridge {
  const primaryKey = instrumentSymbolKey(input.symbol);
  const specs = new Map<string, InstrumentSpec>();
  const seedSymbols = new Set<string>([
    primaryKey,
    ...(input.symbols ?? []).map(instrumentSymbolKey),
  ]);
  for (const key of seedSymbols) {
    specs.set(
      key,
      applyCostPolicy(
        key === primaryKey && input.spec
          ? input.spec
          : defaultSpecForSymbol(key),
      ),
    );
  }

  const specFor = (symbol: string): InstrumentSpec => {
    const key = instrumentSymbolKey(symbol);
    let s = specs.get(key);
    if (!s) {
      s = defaultSpecForSymbol(key);
      specs.set(key, s);
    }
    return s;
  };

  let state = createInitialState({
    symbol: primaryKey,
    accountCurrency: input.accountCurrency ?? 'USD',
    balance: input.balance ?? 10_000,
    leverage: input.leverage ?? specFor(primaryKey).leverage,
    sessionId: input.sessionId,
    sourceFileId: input.sourceFileId ?? null,
  });
  let journal = createJournal(input.sessionId, {
    symbol: state.symbol,
    accountCurrency: state.account.currency,
    balance: state.account.balance,
    leverage: state.account.leverage,
    mode: state.mode,
    sourceFileId: input.sourceFileId ?? null,
  });
  let lastSteppedTime: number | null = null;
  /** Last mark per symbol (bid = bar.close). */
  const marks = new Map<string, SymbolMark>();
  /**
   * Frozen chart preview for pending MARKET entries (submit bid/ask).
   * Without this, Play updates the line to every new tip close before fill,
   * so the order appears to jump away from where the user placed it.
   */
  const marketPreviewEntry = new Map<string, number>();
  let lastReject: string | null = null;
  const listeners = new Set<() => void>();
  /** When true, advance/command paths do not persist or append commands. */
  let replaying = false;

  const notify = () => {
    for (const cb of listeners) cb();
  };

  const commit = (events: EngineEvent[]) => {
    if (events.length === 0) return;
    journal = appendEvents(journal, events);
    if (!replaying) {
      persistJournal(journal);
    }
    const rej = events.find((e) => e.type === 'ORDER_REJECTED');
    if (rej) {
      lastReject = String(rej.payload.reason ?? 'REJECTED');
    }
    if (!replaying) notify();
  };

  const recordCommand = (command: EngineCommand) => {
    if (replaying) return;
    journal = appendCommand(journal, command);
  };

  const defaultCtx = (partial?: Partial<MarketContext>): MarketContext => ({
    spread: 0,
    accountCurrency: state.account.currency,
    marketOpen: true,
    ...partial,
  });

  const barAtTime = (bars: readonly ChartBar[], t: number): ChartBar | null => {
    // Bars are ascending; exact match on base TF clock.
    let lo = 0;
    let hi = bars.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const bt = bars[mid]!.time;
      if (bt === t) return bars[mid]!;
      if (bt < t) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  };

  const resetEngineFromBootstrap = () => {
    state = createInitialState({
      symbol: journal.bootstrap.symbol || primaryKey,
      accountCurrency: journal.bootstrap.accountCurrency,
      balance: journal.bootstrap.balance,
      leverage: journal.bootstrap.leverage,
      sessionId: input.sessionId,
      mode: journal.bootstrap.mode,
      sourceFileId:
        journal.bootstrap.sourceFileId ?? input.sourceFileId ?? null,
    });
    lastSteppedTime = null;
    marks.clear();
    marketPreviewEntry.clear();
    lastReject = null;
  };

  const advanceToInner = (
    cursorTime: number,
    getBars: SymbolBarProvider,
    ctxPartial?: Partial<MarketContext>,
  ): EngineEvent[] => {
    const from = lastSteppedTime ?? Number.NEGATIVE_INFINITY;
    if (cursorTime <= from) return [];

    const exposure = collectExposureSymbols(state);
    const clockKey = primaryKey;
    // Always walk the primary clock so lastStepped advances even when flat.
    const stepKeys = new Set<string>([clockKey, ...exposure]);

    const series = new Map<string, ChartBar[]>();
    const timeSet = new Set<number>();
    for (const key of stepKeys) {
      const raw = getBars(key, from, cursorTime);
      const copy: ChartBar[] = [];
      for (const bar of raw) {
        if (bar.time <= from) continue;
        if (bar.time > cursorTime) break;
        copy.push({
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        });
        timeSet.add(bar.time);
      }
      series.set(key, copy);
    }

    const times = [...timeSet].sort((a, b) => a - b);
    const events: EngineEvent[] = [];
    const multi = stepKeys.size > 1 || exposure.some((k) => k !== clockKey);

    for (const t of times) {
      for (const key of stepKeys) {
        const bars = series.get(key) ?? [];
        const bar = barAtTime(bars, t);
        if (!bar) continue;
        const spec = specFor(key);
        const ctx = defaultCtx({
          ...ctxPartial,
          spread: spec.typicalSpread,
        });
        const stepped = stepEngine(state, bar, spec, ctx, {
          onlySymbol: key,
          deferAccount: multi,
        });
        state = stepped.state;
        events.push(...stepped.events);
        marks.set(key, {
          bid: bar.close,
          ask: bar.close + spec.typicalSpread,
        });
      }

      if (multi) {
        const refreshed = refreshAccountFromMarks(
          state,
          marks,
          specFor,
          defaultCtx(ctxPartial),
        );
        state = refreshed.state;
      }
      lastSteppedTime = t;
    }

    commit(events);
    return events;
  };

  const applySubmit = (
    cmd: Omit<EngineCommand & { type: 'SUBMIT' }, 'type'>,
  ): EngineEvent[] => {
    lastReject = null;
    const orderSym = cmd.order.symbol || state.symbol;
    const spec = specFor(orderSym);
    const bid = cmd.bid > 0 ? cmd.bid : 0;
    const ask = cmd.ask > 0 ? cmd.ask : bid > 0 ? bid + spec.typicalSpread : 0;
    if (bid > 0) {
      const key = instrumentSymbolKey(orderSym);
      marks.set(key, { bid, ask });
    }
    // Freeze expected fill for chart: BUY→ask, SELL→bid (matches §4.3 side).
    if (cmd.order.type === 'MARKET' && (bid > 0 || ask > 0)) {
      const preview =
        cmd.order.side === 'BUY'
          ? ask > 0
            ? ask
            : bid
          : bid > 0
            ? bid
            : ask;
      if (preview > 0) marketPreviewEntry.set(cmd.order.id, preview);
    }
    const fullCmd: EngineCommand = {
      type: 'SUBMIT',
      ...cmd,
      order: {
        ...cmd.order,
        symbol: instrumentSymbolKey(orderSym),
      },
    };
    const result = reduceCommand(state, fullCmd, spec);
    state = result.state;
    // Drop preview if submit was rejected.
    if (!state.workingIds.includes(cmd.order.id)) {
      marketPreviewEntry.delete(cmd.order.id);
    }
    // Anchor the step cursor at submit time so Play cannot re-feed history
    // before this bar (which would fill a market on the first dataset bar).
    if (lastSteppedTime == null || cmd.cursorTime > lastSteppedTime) {
      lastSteppedTime = cmd.cursorTime;
    }
    recordCommand(fullCmd);
    commit(result.events);
    return result.events;
  };

  const applyCancel = (orderId: string, cursorTime: number): EngineEvent[] => {
    const order = state.orders[orderId];
    const spec = specFor(order?.symbol ?? state.symbol);
    const fullCmd: EngineCommand = { type: 'CANCEL', orderId, cursorTime };
    const result = reduceCommand(state, fullCmd, spec);
    state = result.state;
    marketPreviewEntry.delete(orderId);
    recordCommand(fullCmd);
    commit(result.events);
    return result.events;
  };

  const applyModify = (
    cmd: Omit<EngineCommand & { type: 'MODIFY' }, 'type'>,
  ): EngineEvent[] => {
    lastReject = null;
    const order = state.orders[cmd.orderId];
    const spec = specFor(order?.symbol ?? state.symbol);
    if (cmd.bid > 0 && order) {
      const key = instrumentSymbolKey(order.symbol);
      marks.set(key, {
        bid: cmd.bid,
        ask: cmd.ask > 0 ? cmd.ask : cmd.bid + spec.typicalSpread,
      });
    }
    const fullCmd: EngineCommand = { type: 'MODIFY', ...cmd };
    const result = reduceCommand(state, fullCmd, spec);
    state = result.state;
    recordCommand(fullCmd);
    commit(result.events);
    return result.events;
  };

  const rebuildTo = (cursorTime: number, getBars: SymbolBarProvider): void => {
    const truncated = truncateJournalTo(normalizeJournal(journal), cursorTime);
    const commands = truncated.commands.slice();
    const bootstrap = truncated.bootstrap;

    // Legacy journals (no command log): keep event entries for analytics, but
    // the open book cannot be reconstructed — reset engine only.
    if (commands.length === 0) {
      journal = truncated;
      resetEngineFromBootstrap();
      persistJournal(journal);
      notify();
      return;
    }

    replaying = true;
    try {
      journal = {
        sessionId: input.sessionId,
        bootstrap,
        commands: commands.slice(),
        entries: [],
      };
      resetEngineFromBootstrap();

      for (const cmd of commands) {
        if (cmd.cursorTime > cursorTime) break;
        advanceToInner(cmd.cursorTime, getBars);
        if (cmd.type === 'SUBMIT') {
          applySubmit({
            cursorTime: cmd.cursorTime,
            bid: cmd.bid,
            ask: cmd.ask,
            order: cmd.order,
          });
        } else if (cmd.type === 'CANCEL') {
          applyCancel(cmd.orderId, cmd.cursorTime);
        } else if (cmd.type === 'MODIFY') {
          applyModify({
            orderId: cmd.orderId,
            cursorTime: cmd.cursorTime,
            price: cmd.price,
            stopPrice: cmd.stopPrice,
            stopLoss: cmd.stopLoss,
            takeProfit: cmd.takeProfit,
            size: cmd.size,
            trailDistance: cmd.trailDistance,
            bid: cmd.bid,
            ask: cmd.ask,
          });
        }
      }
      advanceToInner(cursorTime, getBars);

      // Silent apply must not grow the command log — restore truncated list.
      journal = {
        ...journal,
        commands,
      };
    } finally {
      replaying = false;
    }

    persistJournal(journal);
    notify();
  };

  return {
    getState: () => state,
    getJournal: () => journal,
    getSpec: (symbol) => specFor(symbol ?? state.symbol),
    getLastReject: () => lastReject,

    advanceTo(cursorTime, getBars, ctxPartial) {
      return advanceToInner(cursorTime, getBars, ctxPartial);
    },

    submit(cmd) {
      return applySubmit(cmd);
    },

    cancel(orderId, cursorTime) {
      return applyCancel(orderId, cursorTime);
    },

    modify(cmd) {
      return applyModify(cmd);
    },

    hydrateJournal(stored) {
      const normalized = normalizeJournal(stored);
      if (normalized.sessionId !== input.sessionId) {
        journal = {
          ...normalized,
          sessionId: input.sessionId,
        };
      } else {
        journal = normalized;
      }
      // Prefer stored bootstrap balance/leverage for rebuild.
      resetEngineFromBootstrap();
    },

    rebuildTo,

    onSeekBackward(cursorTime, getBars) {
      rebuildTo(cursorTime, getBars);
    },

    toChartOrders(sessionId) {
      const out: ChartOrder[] = [];
      // Drop previews for orders that are no longer working (filled/cancelled).
      for (const id of [...marketPreviewEntry.keys()]) {
        if (!state.workingIds.includes(id)) marketPreviewEntry.delete(id);
      }

      // Open positions keep entry + protective levels until SL/TP (or close) fills.
      const openPositions = Object.values(state.positions);
      let seq = 0;
      for (const pos of openPositions) {
        seq += 1;
        let sl: number | null = null;
        let tp: number | null = null;
        for (const id of state.workingIds) {
          const o = state.orders[id];
          if (!o || o.positionId !== pos.id) continue;
          if (o.role === 'stopLoss' && o.price != null) sl = o.price;
          if (o.role === 'takeProfit' && o.price != null) tp = o.price;
        }
        // Fallback: brackets from the fill (if working children were cleared).
        if (sl == null && pos.initialStopPrice != null) sl = pos.initialStopPrice;
        if (tp == null && pos.initialTargetPrice != null) {
          tp = pos.initialTargetPrice;
        }
        const key = instrumentSymbolKey(pos.symbol);
        const spec = specFor(pos.symbol);
        const mark = marks.get(key);
        const bid = mark?.bid ?? 0;
        const ask =
          mark?.ask && mark.ask > 0 ? mark.ask : bid + spec.typicalSpread;
        const fx = {
          accountCurrency: state.account.currency,
          instrumentPrice: bid > 0 ? bid : pos.entryPrice,
        };
        let uPnL: number | null = null;
        if (bid > 0) {
          uPnL = unrealizedPnL(
            pos.side,
            pos.entryPrice,
            bid,
            ask,
            pos.size,
            spec,
            fx,
          ).amount;
        }
        const pnlAt = (level: number | null): number | null => {
          if (level == null || !(level > 0)) return null;
          return unrealizedPnL(
            pos.side,
            pos.entryPrice,
            level,
            level,
            pos.size,
            spec,
            { ...fx, instrumentPrice: level },
          ).amount;
        };
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
          stopLossPnL: pnlAt(sl),
          takeProfitPnL: pnlAt(tp),
          seqLabel: seq,
        });
      }
      // Working entry orders (limits/stops/markets awaiting next-bar fill)
      for (const id of state.workingIds) {
        const o = state.orders[id];
        if (!o || o.role === 'stopLoss' || o.role === 'takeProfit') continue;
        if (o.type !== 'MARKET' && o.price == null) continue;
        const isMarket = o.type === 'MARKET';
        const key = instrumentSymbolKey(o.symbol);
        const spec = specFor(o.symbol);
        const mark = marks.get(key);
        const bid = mark?.bid ?? 0;
        const ask =
          mark?.ask && mark.ask > 0 ? mark.ask : bid + spec.typicalSpread;
        // Pending market: glue chart entry to the tip (bid = last-price line).
        // Using ask for BUY made a visible ~spread jump above the tip after Place.
        // Engine still fills BUY at next open+ask; LIMIT/STOP keep fixed price.
        const expectedEntry = isMarket
          ? bid > 0
            ? bid
            : ask > 0
              ? ask
              : null
          : (o.price ?? null);
        out.push({
          id: o.id,
          sessionId,
          pair: o.symbol,
          side: o.side === 'BUY' ? 'buy' : 'sell',
          entry: expectedEntry,
          stopLoss: o.stopLoss ?? null,
          takeProfit: o.takeProfit ?? null,
          createdAt: o.createdAt,
          engineOrderId: o.id,
          working: true,
          size: o.size,
          unrealizedPnL: null,
          entryLocked: isMarket,
        });
      }
      // Closed trades stay on chart as entry/exit marks after TP/SL fills.
      out.push(...closedChartOrdersFromJournal(journal, sessionId));
      return out;
    },

    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
