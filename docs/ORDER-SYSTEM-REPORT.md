# Order & Position System — implementation report

## 1. Summary — phases completed, phases not

| Phase | Status | Notes |
|---|---|---|
| 1 Instrument + money math | **Done** | `instrumentSpec.ts`, `pnl.ts`, `sizing.ts` + hand-computed tests |
| 2 Engine core + §4.3 fill model | **Done** | Table-driven fill tests (all rows), market/limit, next-bar market |
| 3 Positions, brackets, OCO, trails | **Done** | Partial close, OCO cancel-in-step, trailing ratchet |
| 4 Margin, stop-out, costs | **Done** | Margin call/stop-out, swap (triple Wed, weekend skip) |
| 5 Journal + determinism | **Done** | Hash-equality replay test; `npm run check:orders-determinism` |
| 6 Chart overlay + drag | **Done** | Overlay bands/lines; module-scoped drag; DOM readout |
| 7 Order UI | **Done** | Ticket + working/open/history; reject messages |

**Not measured in this agent environment:** React Profiler commits during a 5s drag, frame-time p95 during drag, engine step p50/p95 in-browser (see §7).

---

## 2. Answers to §11 questions

1. **Are Dukascopy bars bid, ask, or mid?**  
   **Bid.** `server/dukascopyPlugin.ts:203` passes `priceType: 'bid'` into `getHistoricalRates`. CSV header is `timestamp,open,high,low,close,volume` with no ask/mid columns (`:114–118`). §4.2 convention stands: `ask = bid + spread`.

2. **Per-bar spread column?**  
   **No.** OHLCV only. Fallback: `InstrumentSpec.typicalSpread`, then 0 with a console warning in `resolveSpread` (`src/orders/fillModel.ts`).

3. **Does `ChartBar` need `spread`? Does packing change?**  
   **Optional field only — packing unchanged.** `ChartBar` remains 28-byte OHLC packing (`src/data/binaryBar.ts:2–3`, time f64 + 5×f32). Engine reads `(bar as {spread?: number}).spread` if present; otherwise spec/ctx. Coordinating a format bump with the Float32 finding was **not** done (out of scope / forbidden ingest change).

4. **Where does `stepEngine` get called? Every base bar on FF/scrub?**  
   `OrderSessionBridge.advanceTo` → `stepEngine` (`src/orders/sessionBridge.ts`). App calls it from `applyReplayReveal` via `stepOrderEngineRef` on every cursor update (`src/App.tsx`). Bars come from `warmCache.peek(datasetId, baseTf)` filtered to `(lastStepped, cursorTime]` with an explicit `bar.time > cursorTime` drop guard. Fast-forward: replay notifies once per coalesced advance; bridge walks **all** intervening base bars in that window (no skip). Scrub forward: same. Scrub backward: engine reset (below).

5. **Open positions on backward seek?**  
   **Rebuild from command log** (`onSeekBackward` → `rebuildTo` in `sessionBridge.ts`). Truncates commands/entries with `cursorTime > t`, then replays commands + bars to the new cursor. History ≤ t is kept; the open book matches that point in time.

6. **Where does account state persist?**  
   Event journal + **command log** in `localStorage` key `orderJournal.v1:{sessionId}` (`journal.ts`, scoped). Engine state is in-memory; on session load App hydrates the journal and calls `rebuildTo(cursor)` so open positions/working orders are restored.

7. **Do indicator/backtest workers need order state?**  
   **No.** Workers must not see order state (lookahead risk). Orders stay on the main-thread pure engine driven by the session clock.

8. **Measured perf (§11.8)?**  
   **Not measured** in this environment (no interactive browser Profiler session). Design intent: drag path uses module-scoped `levelDrag` + `markOverlayDirty` only — no React `setState` during move. Claims of 0 commits / p95 &lt; 8 ms are **unverified**.

---

## 3. Fill model conformance — §4.3

Implemented in `src/orders/fillModel.ts`; fixture in `src/orders/__tests__/fillModel.phase2.test.ts`.

| Family | Implemented | Tests |
|---|---|---|
| Buy/Sell market (next open ± spread) | Yes | Pass |
| Buy/Sell limit (+ gap) | Yes | Pass |
| Buy/Sell stop (+ gap) | Yes | Pass |
| Long/Short TP/SL (+ gap) | Yes | Pass |
| Ambiguous SL+TP → SL wins | Yes | Pass |
| Bar path O-L-H-C / O-H-L-C | Yes | Pass |

`npm run test:orders` — **45/45 pass** (includes phases 1–5).

---

## 4. Determinism

- **Hash equality:** `journal.phase5.test.ts` — live run vs `replaySteps` → identical `hashState`. **Pass.**
- **Grep check:** `npm run check:orders-determinism` bans `Math.random` / `Date.now` / `new Date` under `src/orders/` except `journal.ts` (display `recordedAtMs`). UTC day math uses integer day index (no `Date`). **OK.**

---

## 5. Lookahead audit

| Touch point | Proof ≤ cursorTime |
|---|---|
| `stepEngine(bar)` | Assert `bar.time > lastBarTime`; DEV `Object.freeze(bar)` |
| `sessionBridge.advanceTo` | Drops `bar.time > cursorTime`; copies bar before step |
| App bar provider | Filters warmCache to `≤ cursorTime` |
| Market fill | Fills on **next** stepped bar open, not submit-bar close |
| Trailing stop | Trigger evaluated before water-mark update |

Engine never holds a bar array — only the single bar argument.

---

## 6. Currency conversion coverage (§5.3)

| Case | Status |
|---|---|
| Same currency | Via `quote === account` → rate 1 |
| Quote = account (EURUSD/USD) | Implemented, tested |
| Base = account (USDJPY/USD) | `1/price`, tested |
| Cross (EURGBP/USD) | Requires `conversionRateToAccount`; flagged `approximate: true` |

Silent `1.0` for crosses is not used for “known good” paths; missing cross rate → approximate flag.

---

## 7. Performance

| Metric | Result |
|---|---|
| React commits during 5s drag | **Not measured** |
| Frame time p95 during drag | **Not measured** |
| Engine step p50/p95 | **Not measured** (unit tests only; no allocation profiling) |

Design controls: overlay-only dirty during drag; no React on move; engine emits events array only.

---

## 8. Deviations from the brief

1. **Hedging mode** — types allow it; runtime paths are netting-first. Full hedging lifecycle deferred.
2. **Partial fills** — not implemented (all-or-nothing default).
3. **Journal rebuild on session reload** — **Done.** Command log + `rebuildTo` on load (legacy journals without `commands[]` keep analytics entries but cannot restore the open book).
4. **Backward seek** — **Done.** Rebuilds via command log + bars (no full wipe).
5. **Shift+snap to swings** — not implemented in v1 drag.
6. **IOC/FOK/DAY expiry** — TIF stored; DAY session-close expiry not fully wired (TODO on `sessionCloseUtc`).
7. **Companion briefs** `TF-SWITCH-REFACTOR-BRIEF.md` / `PERF-MEMORY-GUARDRAILS.md` were not in-repo; followed this work order + `docs/TF-REFACTOR-REPORT.md`.
8. **React Profiler / frame p95** — not captured here.
9. **`binaryBar` / spread column** — left unchanged (28-byte pack).
10. **CollectedTrade** — on full close, `POSITION_CLOSED.payload.collected` is a full auto record (identity, prices, risk, PnL, UTC timing, MFE/MAE + R, costs, closeType, partialCloses). Journal projection exposes `OrderTrade.collected`; cloud sync stores it in `trades.meta`. Notes/screenshots/`bar_*_r`/post-exit bars stay null until ticket UI / bar sampler.

---

## 9. Deferred findings and remaining risks

1. ~~**High — no auto journal replay on reload.**~~ **Fixed** — `commands[]` + `rebuildTo` on session load / backward seek (`ensureOrderBars` preloads IDB coverage).
2. ~~**High — warmCache window may not cover long seeks.**~~ **Mitigated** — App `onSeek` / load await `ensureOrderBars` before advance/rebuild; play still relies on fill-ahead (gap risk if fill-ahead lags remains Low).
3. **Medium — stop-out fill uses current bar close bid/ask**, not a dedicated next-open market (acceptable for force-close; document vs live brokers).
4. **Medium — margin estimate at submit** is approximate (base/quote heuristic); fill-time margin reject still possible.
5. **Medium — R in history list** currently passes `netPnL=0` placeholder in the UI row (engine has full net on close events — UI should read closed-trade journal payloads).
6. **Low — Float32 OHLC** still applies to all price math inputs from the dataset.
7. **Low — drag Shift-snap / past-cursor drag clamp** incomplete.
8. **Low — legacy journals** (no `commands[]`) cannot restore the open book after reload; closed-trade analytics from `entries` still work.

---

## 10. Open questions for the advisor

1. ~~Should backward seek replay the journal + bars?~~ **Done** (command-log rebuild).
2. Should account bootstrap (balance/leverage) be per-session UI settings beyond `startingBalance`?
3. Is adding an optional `spread` float32 to the 28-byte pack worth a coordinated format bump with the Float64 OHLC fix?
4. Confirm stop-out should flatten at **same-bar mark** (current) vs **next-bar open**.
5. For multi-pair layouts: one engine per symbol, or one netting book per account across symbols?
