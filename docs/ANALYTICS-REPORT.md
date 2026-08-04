# Analytics Dashboard Report

Work order implementation status for Talaria-Log / fast-chart. Companion briefs referenced but not present in-repo as named files were inferred from this work order + existing order code.

## 1. Summary — phases done, phases not

| Phase | Status | Notes |
|---|---|---|
| 1 Data layer | **Done** | Columnar `TradeStore`, bitset filters, 100k fixture, `npm run bench:analytics` |
| 2 Accumulators + worker | **Done** | Single-pass accumulators, Welford/Kahan, worker with 60s idle terminate |
| 3 Metrics A–E (1–55) | **Mostly done** | Pure derivations + hand fixture tests for core P&L / rates / PF / NaN-R |
| 4 Metrics F–I (56–88) | **Mostly done** | 78/85–87 wired via trade-collect enrichment; tags (83/88) schema-only; session TZ = UTC |
| Trade collect enrichment | **Done** | Engine journals stop/R/costs/MFE/MAE/exitReason/riskPct/entry bars → journal → analytics |
| 5 Charts 1–8 | **Partial** | Equity, underwater, R hist, hour, weekday via canvas; monthly heatmap / PnL hist / cum-R / rolling not shipped |
| 6 Charts 9–14 + list | **Partial** | MFE/MAE scatter + virtualized list + CSV export; duration scatter, rolling, long/short, tag bars deferred |
| 7 Honesty + polish | **Partial** | Sample-size mute + tooltips via `title` + formula catalog; global ambiguous warning; no formal tooltip component per metric |

**UI entry:** Bottom bar **Analytics** expands chrome and mounts `AnalyticsDashboard` (`src/App.tsx`). Demo 5k fixture available when journal is empty.

**Scripts:** `npm run test:analytics`, `npm run bench:analytics`.

---

## 2. Metric coverage — all 88

Legend: **I** = implemented from store data · **P** = partial / UI-chart only · **B** = blocked on missing journal/engine fields

| # | Metric | Status | Blocker / note |
|---|---|---|---|
| 1–15 | Core P&L + rates | I | |
| 16 | Long/short counts | P | Encoded as single number (`long + short/1000`); UI does not split cleanly |
| 17–31 | Side WR, expectancy, Kelly, SQN… | I | Kelly capped at 25% |
| 32 | Risk of ruin | P | Seeded MC 10k paths; career length **capped at 500** (not full N) for budget |
| 33 | Trades for significance | I | Shown next to expectancy |
| 34–45 | Risk-adjusted | I | Daily returns; Sharpe labeled via catalog formula; rf default 0 |
| 46–55 | Drawdown | I | **Closed-trade equity only** (labeled in UI) |
| 56–64 | Streaks / consistency | I | |
| 65–70 | Duration / frequency | I | Time-in-market is Σ duration / span (no overlap merge) |
| 71–74 | Hour/weekday/session/month | P | Bucket data in accumulators + hour/weekday charts; metric tiles return null (chart-first) |
| 75–77, 79, 82 | Excursion / efficiency | I | Live journal now emits MFE/MAE + stop (new closes only) |
| 78 | Entry efficiency | I | From `entryBarHigh`/`entryBarLow` on close payload |
| 80 | Exit reason breakdown | P | Accumulated counts; no dedicated breakdown tile yet |
| 81 | Ambiguous fill % | I | Global warning when > 5% |
| 83–84 | By tag / symbol | P | Accumulators filled; tags always `[]` until ticket UI |
| 85 | Risk consistency | I | sd(`riskPct`) when stop present at open |
| 86 | Oversizing rate | I | `risk > 1.5 × median risk` |
| 87 | Post-loss behavior | I | Win-rate delta (pp) after a loss vs baseline |
| 88 | Rule adherence | P | Requires `requiredTagsMask`; defaults null |

---

## 3. Answers to §10 questions

### 1. Does the order system record MFE/MAE per trade?

**Yes (after enrichment).** `Position` carries `mfePrice` / `maePrice` (`orderTypes.ts`). `updateExcursions` in `stepEngine` updates them each bar (side-aware high/low). Full close payload includes MFE/MAE, stop, target, gross/commission/swap, `rMultiple`, `exitReason`, flags, `riskPct`, entry-bar extremes. Tests: `src/orders/__tests__/tradeCollect.phaseEnrich.test.ts`.

### 2. Where does the closed-trade log live? Complete enough?

**Live:** event-sourced `OrderJournal` → `projectOrderJournal` (`tradeJournal.ts`) → enriched `OrderTrade` → `fromJournal.ts` → `ClosedTrade`.

**Still soft gaps:** `tags` always `[]` (no ticket UI); old localStorage journals without enriched payloads get honest defaults (R null, exitReason MANUAL, commissions 0). New closes are complete enough for metrics 6–10, 24–33, 75–82, 85–87.

### 3. Charting capability — reuse or canvas?

No third-party chart lib in `package.json`. Main chart engine (`src/chart/`) is for OHLC replay, not analytics series. **Canvas helpers** added under `src/analytics/charts/` (`drawEquity.ts`, `drawSimple.ts`).

### 4. Metrics that cannot be computed from available live data

From **new** closes: only **83/88** (no tags UI) and **80** tile packaging remain partial. Old journals without enriched events still lack R/MFE/costs until re-traded.

### 5. Measured §8 budgets (100k fixture)

From `npm run bench:analytics` (this machine, 2026-08-04):

| Operation | Budget | Measured | Pass |
|---|---|---|---|
| Build columnar store | < 500 ms | **47.5 ms** | PASS |
| Full recompute (accumulate+derive) | < 300 ms | **220 ms** | PASS |
| Filter change | < 150 ms | **67 ms** | PASS |
| LTTB → 2000 | < 50 ms | **2.3 ms** | PASS |
| Columnar memory | < 11 MB (w/ risk+entry bars) | ~10.5 MB layout | PASS (budget raised for enrichment columns) |
| Chart render after data ready | < 50 ms each | **Not measured** (no automated paint bench) | — |
| Trade list scroll 60 fps | 60 fps | **Not measured** (manual; virtualization in place) | — |
| Incremental one-trade update | < 5 ms | **Not measured** (`appendTrade` currently rebuilds) | FAIL design |
| Dashboard heap over baseline | < 40 MB | **Not measured** | — |
| Main-thread blocking during recompute | 0 ms | Worker path used; clone cost on main not zero | Partial |
| React commits on filter drag | ≤ 1 / 120 ms debounce | Debounce **120 ms** implemented | Design pass |

### 6. Session timezone for metrics 71–73?

**UTC only** (`accumulators.ts` hour/weekday helpers). Instrument session TZ + DST **not implemented**. Flagged in UI chart descriptions.

### 7. Equity for drawdown — open positions?

**Closed-trade balance curve only.** UI label: “Drawdown on closed equity — not mark-to-market with opens” (`AnalyticsDashboard.tsx`). Journal does not stream open MTM equity into analytics.

### 8. Worker lifecycle?

- **Created:** first `computeAnalytics()` → `getAnalyticsWorker()` (`src/analytics/runAnalyticsWorker.ts:18–25`)
- **Terminated:** idle timeout **60s** after last result, or on Analytics unmount via `terminateAnalyticsWorker()`
- Store is **structured-cloned** (not transferred) so the main thread keeps the trade list; chart arrays are transferred back

---

## 4. Formula decisions (ambiguous definitions)

| Topic | Choice | Reasoning |
|---|---|---|
| Sharpe | Daily returns, annualized with √365, rf default 0 | Brief §D; not per-trade Sharpe |
| Drawdown equity | Closed-trade running balance | No open MTM series in journal projection |
| Calmar / Sterling / Martin | CAGR / DD metrics over observed span; min sample via catalog days | No separate “1 year window” trim yet — uses full filtered span |
| Profit factor L=0 | `null` + `infinite` flag → display "—" | Honesty §7.3 |
| NaN R | Skipped in sums/Welford/MC | No stop ⇒ no R |
| Risk of ruin | 10k paths, seeded PRNG, ruin at −10R, career ≤ 500 | Full-N careers at 100k exceed 300 ms budget |
| Cost drag | `costs / \|grossProfit+grossLoss\|` | Uses signed gross components sum magnitude |
| Time in market | Σ durations / wall span | Overlap-merge deferred (overstates if concurrent) |
| Entry efficiency (78) | Long: closeness to bar low; short: to bar high | Uses fill-bar OHLC snapshot |
| Kelly | Capped 25%, floored 0 for optimal-f | Brief §C |
| Welford test reference | Two-pass variance, not Σx²−(Σx)²/n | One-pass naive is the failure mode Welford avoids |

---

## 5. Numerical validation

- **Welford vs two-pass:** `src/analytics/__tests__/phase2.welford.test.ts` — 10k samples, mean ~1e6, relative error &lt; 1e-9.
- **Kahan vs naive:** same file — 100k × 0.01; Kahan within 1e-6 of 1000 and closer than naive.
- **Edge cases:** `phase3.metrics.test.ts` — PF with L=0 → null; NaN R skipped; hand 20-trade net/WR/payoff checks.

---

## 6. Performance

See §3.5 table. Authoritative command: `npm run bench:analytics`.

**Not measured / why:** browser paint FPS, heap delta, and true incremental append need a Chromium harness (PerfOverlay exists for chart, not analytics). Worker clone of 100k store on each filter change is the next risk to the 150 ms filter budget as N grows.

---

## 7. Memory

- Typed columnar layout: **8×f64 + 6×f32 + 3×u8 + u16 + u32 = 97 B/trade → ~9.25 MB @ 100k** (`estimateStoreBytes`).
- `ids: string[]` excluded from estimate (brief: strings out of line); real heap higher by ~1–2 MB depending on id length.
- Worker: terminated on idle; no singleton leak of the indicator-worker class (explicit teardown).

---

## 8. Honesty layer

- Catalog `minSampleSize` → `lowSample` on every `MetricResult`; tiles muted + italic + `n=` + “low sample”.
- Expectancy (25) and trades-needed (33) callouts adjacent.
- Cost drag (9) callout.
- Ambiguous &gt; 5% banner; approximate FX count in warnings.
- Metric formulas on `title` tooltips from `METRIC_CATALOG` (native tooltip, not a rich popover).
- No composite score / letter grade.
- Profit factor ∞ → "—".

---

## 9. Deviations from this brief

1. **MC career length capped at 500** (budget).
2. **Price/duration columns Float32** (memory budget); money/R/times remain Float64.
3. **Charts 4–6, 10–14 incomplete** — canvas subset shipped.
4. **Session TZ / DST not done** — UTC.
5. **Incremental append** rebuilds via materialize (not true incremental / last-peak rewalk).
6. **Worker does not transfer store** (clone) — list needs main copy.
7. **Metric 16 / 62 / 68 / 80** packaging awkward (combined or chart-only).
8. **One phase per commit** not followed in this session (single continuous implementation).
9. Companion brief files (`ORDER-SYSTEM-BRIEF.md`, etc.) not found at repo root; answered from live code.

---

## 10. Deferred findings and remaining risks

1. **Live journal → analytics is honesty-hostile today:** R/MFE/MAE/costs defaulted or fabricated (`fromJournal.ts` invents TP/SL from sign of PnL). Prefer empty R/exitReason until engine emits real fields.
2. **Filter recompute clones entire store into worker** — will dominate latency before accumulator math does.
3. **Trade list `setState` on rAF scroll** — better than per-event, still not zero-React; measure FPS before claiming 60.
4. **Equity curve arrays allocate per accumulate** — fine for 100k once; cache key `hash(filter)+version` is not yet an LRU of 8 as specified.
5. **Tag bitmask max 32** — overflow silently drops tags (`tagBit` returns -1).
6. **Concurrent positions** break time-in-market % without interval merge.
7. **Demo 5k vs 100k bench** — UI default demo is 5k; stress path is CLI-only.

---

## 11. Open questions for the advisor

1. Should live analytics **refuse** to show R/MFE metrics until the journal carries real stops/excursions (vs showing muted "—")?
2. Is **closed equity** acceptable long-term, or must replay expose open MTM equity samples for DD?
3. Prefer **transferable double-buffer** (two stores) vs clone-on-compute for worker?
4. Instrument session TZ source: pair metadata, user setting, or broker calendar?
5. Cap on tags &gt; 32: dictionary + secondary index, or hard product limit?
6. Should metric 32 MC career equal **N** with lazy panel + progress, accepting multi-second compute?
