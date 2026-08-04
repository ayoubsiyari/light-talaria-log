# Talaria-Log — Project Plan & Checklist

> High-performance candlestick chart engine with low CPU/memory usage.
> Design system: **Hero UI** (colors, theming, components).
> Chart engine: **custom Canvas 2D** (no third-party chart library).

---

## Vision

Build a trading-grade chart renderer that:

- Loads **1M+ row CSV** files without freezing the browser
- Keeps memory **under ~100 MB** during use
- Maintains **55–60 FPS** while panning and zooming
- Uses **Hero UI** for all UI chrome (buttons, modals, progress, layout)

**First rule (non-negotiable):** every chart/data decision serves low memory, low CPU, fast load + fast redraw.

**Phase 1+ scope (current):** Chart + IDB viewport + multi-pane + replay cursor + drawing overlays. No orders / multi-user backend yet.

---

## Architecture Summary

```
Big CSV → Web Worker parse → IndexedDB chunks → Viewport loader → Custom Canvas engine
              ↓                                        ↓
        No main-thread freeze                   Max ~2500 bars in memory
```

| Layer | Technology |
|---|---|
| Chart engine | Custom Canvas 2D (`src/chart/`) |
| UI / design | Hero UI v3 + Tailwind CSS v4 |
| Build | Vite + React + TypeScript |
| CSV parsing | Web Worker |
| Storage | IndexedDB (binary chunks) |
| In-memory format | TypedArrays (Struct of Arrays) |

Engine is a **dumb viewport renderer** — never owns the full dataset. Primary sync/replay coordinate: **logical bar index** (`VisibleRange`).

---

## Constants (do not change without updating rules)

| Constant | Value | Reason |
|---|---|---|
| `MAX_BARS_IN_MEMORY` | 2500 | Memory cap |
| `VISIBLE_BARS_TARGET` | 1500 | Typical screen width |
| `BUFFER_BARS` | 500 | Smooth pan prefetch |
| `CHUNK_SIZE` | 5000 | IndexedDB write batch |
| `DEBOUNCE_MS` | 50 | Pan/zoom load debounce |
| `LOD_DEBOUNCE_MS` | 120 | Zoom LOD + edge-prefetch sync debounce |
| `MAX_CHART_OBJECTS` | 2500 | Never convert more to JS objects |
| `MAX_BACKTEST_BARS` | 50000 | Cap TypedArrays streamed into backtest Worker |

---

## Step-by-Step Plan

### Phase 0 — Foundation (this session)

- [x] Create `PROJECT.md` (this file)
- [x] Create Cursor rules (`.cursor/rules/`)
- [x] Create folder structure
- [x] Add Hero UI design tokens (`docs/DESIGN.md`)
- [x] Scaffold Vite + React + TypeScript + Hero UI
- [x] Verify `npm install` and `npm run dev` work

### Phase 1 — Basic Chart (Step 1)

**Goal:** Custom Canvas chart renders with fake data at 60 FPS.

- [x] Remove third-party chart lib; own Canvas 2D engine
- [x] Create `src/chart/createChart.ts` (viewport API + lifecycle)
- [x] Create `src/chart/renderer.ts` (dirty + rAF paint)
- [x] Create `src/chart/scales.ts` (logical index ↔ x, price ↔ y)
- [x] Create `src/chart/interaction.ts` (pan / wheel zoom → VisibleRange)
- [x] Map Hero UI colors in `src/chart/chartTheme.ts`
- [x] Build `ChartContainer.tsx` (chart lives outside React re-render cycle)
- [x] Render 500 fake candles
- [ ] Confirm smooth pan/zoom in Chrome DevTools Performance tab

**Done when:** Chart displays, pans smoothly, uses Hero UI dark theme colors.

### Phase 2 — CSV Worker (Step 2)

**Goal:** Parse CSV off main thread without UI freeze.

- [x] Implement `src/data/binaryBar.ts` (TypedArray store)
- [x] Implement `src/data/csvWorker.ts` (chunked line parsing + ingest)
- [x] Implement `src/data/idbStore.ts` (IndexedDB chunk storage)
- [x] Build `CsvUploader.tsx` with Hero UI `Button` + progress
- [x] Show `LoadingProgress.tsx` during import
- [ ] Test with 10k row CSV (manual)

**Done when:** CSV imports with progress bar, no UI freeze, data in IndexedDB.

### Phase 3 — Viewport Loader (Step 3)

**Goal:** Only load visible bars + buffer into chart memory.

- [x] Implement `src/chart/viewportLoader.ts`
- [x] Implement `src/data/barIndex.ts` (time → chunk lookup)
- [x] Subscribe to sync/time-range changes → debounced IDB reload
- [x] Debounce range loads (50ms / 80ms sync)
- [x] Call `setViewportBars(window)` only — never full dataset
- [ ] Test with 100k row CSV (manual / Phase 4)

**Done when:** Memory stays flat as user pans across full dataset.

### Phase 4 — Large Data Stress Test (Step 4)

**Goal:** Prove 1M rows works.

- [x] Provisional stress with Perf overlay (2500-bar viewport path)
- [ ] Test with 500k row CSV (full import timing — optional follow-up)
- [ ] Test with 1M row CSV (blocked by ingest hard cap until raised)
- [ ] Chrome Memory snapshot: heap < 100 MB (needs Chromium `performance.memory`)
- [~] Pan FPS: display-limited ~30 Hz on review machine; Paint tracks rAF
- [x] Document results in this file (see Benchmarks section)

**Done when:** Benchmarks table has numbers + known gaps listed (provisional OK).

### Phase 5 — Zoom LOD / Aggregation (Step 5 → Next Plan Step 10)

**Goal:** Smooth performance when zoomed out.

- [x] Pre-aggregate 5m, 15m, 1h, 1d bars during CSV import (ingest path)
- [x] Switch timeframe based on visible bar spacing (**Step 10**)
- [x] LOD switch keeps ≤ `MAX_BARS_IN_MEMORY` on canvas
- [ ] Test zoom from 1m to daily on 1M dataset (manual)

**Done when:** Zoomed-out view stays on the ≤2500-bar path (FPS verify optional).

### Phase 6 — Polish (Step 6)

**Goal:** Production-ready chart shell.

- [x] Error states (Hero UI `Alert`) — load + backtest
- [x] Empty state (no data loaded / empty viewport)
- [x] Responsive resize (`ResizeObserver` in `useChart`)
- [x] Chart cleanup on unmount (`engine.destroy()`)
- [x] `docs/ARCHITECTURE.md` updated with Phase 11 + Step 13/14 patterns

**Done when:** No memory leaks after mount/unmount cycles.

---

## Scale readiness (do not forget)

**Status (2026-07-29):** Client scale path is solid (IDB + ≤2500 viewport + Step 9/10 pan/LOD + Step 11 local backtest Worker). Next wave: multi-user backend + journal. See **Next Work Plan Steps 12–14**.

### What is solid today
- [x] Engine = dumb viewport renderer (≤ `MAX_BARS_IN_MEMORY` = 2500 on canvas)
- [x] Multi-pane sync by **wall-clock time** (different TFs can align)
- [x] Echo guard so pan stays smooth with multi-chart
- [x] CSV parse off main thread; dataset catalog in localStorage + CSV in IndexedDB
- [x] 1m → higher TF aggregation for chart switching
- [x] **IDB viewport path:** ingest → chunks per TF; no full-series RAM in App
- [x] **Replay:** time cursor outside engines; BottomBar play/pause/step/speed
- [x] **Drawings:** full TV-style catalog (lines/channels/fib/gann/shapes/text/patterns/measure/volume); style panel; flyout toolbar; v2 persistence
- [x] **Indicators:** ~50 classic+ICT via Worker; overlays + sub-panes
- [x] **Mock orders:** entry/SL/TP overlay (local only)

### Gaps before “big data / many users / real backtest”
- [x] Cap download / warn on huge Dukascopy ranges (+ CSV upload size)
- [~] Phase 4 benchmarks (provisional filled; full 1M import still open)
- [x] Per-pane **different tickers/datasets** (multi-pair session + overlap dates; one pane per pair)
- [x] **Pan edge prefetch** — paint from buffer first; refill IDB before user hits empty edge (Step 9)
- [x] **Zoom LOD auto-switch** — pick TF from bar spacing so zoomed-out stays ≤2500 dense bars (Step 10 / Phase 5)
- [x] **Strategy backtest engine** — signals → fills → equity (not mock lines) (Step 11)
- [x] **Backend stub + Import from API** (Step 13) — Postgres / real CDN deferred
- [x] **Journal / analytics** (Step 14 local) — Postgres sync deferred

### Rough memory reality (after A)
| Piece | Cost |
|---|---|
| Full series | IndexedDB chunks only (not main-thread TypedArrays) |
| Each pane canvas buffer | ≤2500 bars |
| 4 panes | 4 × viewport windows; sync reloads from IDB |

### A → B → C (completed this pass)

| Option | Status |
|---|---|
| **A — IDB viewport loader** | Done — worker ingest + `getBarsInRange` + pane reloads |
| **B — Replay engine** | Done — `replayStore` + BottomBar + sync time window |
| **C — Drawing tools** | Done — `drawingStore` + overlay + LeftToolbar |

### Target multi-user architecture (Phase 11 — Steps 12–13)

**Full contract:** `docs/ARCHITECTURE.md` → **Phase 11** (Step 12 locked the sketch).

```
Users → Auth API → Stateless app servers
                      ↓
         Object storage / CDN  (pre-chunked bars per symbol/TF)
                      ↓
         Postgres  (users, sessions, drawings meta, trades, journal)
                      ↓
         Redis / job queue  (ingest + backtest jobs — never in the tab)
                      ↓
         Browser: IDB cache + ≤2500 viewport  (unchanged contracts)
```

| Concern | Rule |
|---|---|
| Shared datasets | Store once on CDN/S3 as chunks; clients fetch ranges, not full CSV |
| Concurrent users | Stateless API + CDN; never stream full series into one process |
| Heavy backtests | Job queue (server Worker), not inside the browser tab for large runs |
| Per-user data | Postgres: auth, sessions, drawings, trades, journal |
| Browser | Same forever: server delivers chunks; canvas ≤2500 bars |

**Postgres = users/metadata/results.** Bar history stays chunked (object storage + client IDB cache). Never put 15y 1m OHLC in Postgres rows for chart paint.

### Target dataset → backtest path

```
1. Dataset ingest     ✅  Worker → IDB (local) / later server chunks
2. Chart session      ✅  pairs + dates + TF + panes
3. Replay cursor      ✅  step through time on chart
4. Strategy engine    ✅  SMA cross Worker + cost stubs (Step 11)
5. Equity / trades    ✅  trade list + sparse equity → chart overlays (Step 11)
6. Journal            ✅  localStorage per session (Step 14)
```

Today: local Worker backtest → trades/equity overlays + Journal page (persisted trades/stats, no OHLC). Remote journal sync still future.

---

## Future Phases (roadmap)

| Phase | Feature | Status / depends on |
|---|---|---|
| 2–3 | CSV worker + **IDB viewport loader** (scale path) | **Done** (manual stress still open) |
| 5 | Zoom LOD / pre-agg (align with TF engine) | **Done** (Step 10 v1 — auto-coarsen + refine to selected floor) |
| 6 | Polish (empty/error/resize/ARCHITECTURE final) | Open — can interleave after Step 10 |
| 7 | Replay engine (bar-by-bar) | **Done** (v1 time cursor) |
| 7b | Drawing tools (overlay) | **Done** |
| 8 | Order overlay on chart | **Done** (mock v1) |
| 9 | Multi-chart sync | **Done** (time-based sync + per-pane TF) |
| 10 | Indicators (Web Worker) | **Done** — 50 indicators (classic + ICT) |
| 10b | Strategy backtest engine (Worker / later server job) | **Step 11** |
| 11 | Backend API + auth + CDN chunks (multi-user) | **Steps 12–13** after client lag path solid |
| 12 | Journal / analytics | **Done** (local; Step 14) |

### Future-phase contracts (do not violate)

Designed from prior chart failures (replay bugs, desync, indicator freezes):

| Feature | Contract |
|---|---|
| Replay | Dataset + cursor live **outside** the engine. Feed `setViewportBars` / last-bar updates only — never rewrite history in the canvas buffer |
| Multi-chart sync | Share one sync store → N engines; sync **wall-clock time range** + crosshair time/price; origin + applyingRemote echo guards; never sync canvas pixels |
| Indicators | Compute in a **Worker** on TypedArrays; registry dispatch; overlays on price scale + sub-panes (RSI/MACD); viewport ≤2500 only |
| Drawings | Model outside engine; paint in overlay pass; store anchors as time+price (not pixel x/y) |
| Freezes | No chart state in React; dirty + single rAF; hard bar cap; no full-series on main thread |
| Big history | Full dataset in **IndexedDB only** (client); later also CDN chunks — never keep 15y 1m as one in-memory TypedArray for the UI session |
| Backtest | Strategy + fills **outside** engine; paint trade markers / equity from results only |
| Backend | Never weaken browser viewport cap; server is delivery + jobs, not a second full-series in the tab |
| Pan | Paint current buffer first; IDB refill async at edges — never block rAF on full-window remap when avoidable |)

---

## Benchmarks (fill in after Phase 4)

| Metric | Target | Actual | Date |
|---|---|---|---|
| CSV rows tested | 1,000,000 | Viewport stress @ 2500 bars (IDB path); full 1M import not run | 2026-07-29 |
| Heap memory (after load) | < 100 MB | n/a (Safari/non-Chromium); Bars capped 2500 × panes | 2026-07-29 |
| FPS while panning | ≥ 55 | Paint ≈ rAF ≈ 30 (display-limited on review device) | 2026-07-29 |
| CPU idle | < 5% | Idle Paint low (good); not profiled in Chrome | 2026-07-29 |
| CSV import time (1M rows) | < 60s | — (hard-capped ~550k est. download / 1M CSV est.) | 2026-07-29 |
| Initial chart render | < 200ms | Feels instant on session open (not timed) | 2026-07-29 |

### Fail / gap list (Step 2)
- Review machine locked at **30 Hz** rAF — re-check in Chromium at 60 Hz display before calling pan “slow”.
- **Heap** needs Chrome (`performance.memory`); Safari shows n/a.
- Full **1M-row** import timing still open; architecture already keeps canvas ≤2500 bars.

### Manual stress script (use with Perf overlay — Step 2)
1. Import or download a known size (start ~10k–100k rows; grow later)  
2. Open session → note **Heap** + **Bars** at idle  
3. Pan hard left/right 15s → note min **FPS**  
4. Wheel zoom in/out 10s → note min **FPS**  
5. Replay Play 30s → note Heap drift (should stay flat)  
6. Switch layout 1 → 4 panes → note Bars (cap) + FPS  
7. Record into the table above + any freezes in Session Log

---

## Hero UI Design Rules

All UI must use Hero UI — never hardcode random colors.

| Element | Hero UI token |
|---|---|
| App background | `--background` |
| Chart panel surface | `--surface` |
| Text | `--foreground`, `--muted` |
| Borders | `--border`, `--separator` |
| Up candle | `--success` |
| Down candle | `--danger` |
| Accent / focus | `--accent` |
| Loading / progress | Hero UI `Progress` + `--accent` |

Chart canvas colors are mapped in `src/chart/chartTheme.ts` from CSS variables.
See `docs/DESIGN.md` for full token reference.

**Default theme:** Dark mode (`class="dark"` on `<html>`).

---

## Coding Rules (summary)

Full rules live in `.cursor/rules/`. Key points:

1. **Never** call `setViewportBars()` with more than 2500 bars
2. **Never** parse CSV on the main thread
3. **Never** store full CSV as JS object array in memory
4. **Never** put chart instance in React state (use `useRef`)
5. **Never** compute indicators on the main thread
6. **Always** use Hero UI components for UI chrome
7. **Always** use TypeScript strict mode
8. **Always** call `engine.destroy()` on component unmount
9. **Always** update this checklist when completing a step

---

## File Map

```
fast-chart/
├── PROJECT.md              ← You are here (plan + checklist)
├── docs/
│   ├── DESIGN.md           ← Hero UI tokens & chart color mapping
│   └── ARCHITECTURE.md     ← Technical deep-dive
├── .cursor/rules/          ← AI coding guardrails
├── src/
│   ├── chart/              ← Custom Canvas 2D engine
│   ├── data/               ← CSV worker, IndexedDB, binary bars
│   ├── components/         ← Hero UI React components
│   ├── hooks/              ← useChart, useCsvImport
│   ├── utils/              ← debounce, constants
│   └── types/              ← Shared TypeScript types
└── public/
    └── sample.csv          ← Small test file
```

---

## Next Work Plan — Review Gates (2026-07-29)

**How we work:** one step at a time. No coding on a step until you approve it. After each step: demo / numbers → you review → then next.

**North star:** no lag, no memory leaks, browser stays light during draw / indicators / orders / long backtests. Engine stays a dumb viewport (≤2500 bars). Indicators/orders compute off the hover path.

### Gate rules
1. You say **“go Step N”** (or approve with changes) before work starts  
2. Step ends with: what changed, how to verify, checklist/benchmark update  
3. You say **pass / fix / skip** before Step N+1  
4. Out of scope until later gates: backend/auth, full order system, multi-user CDN  

---

### Step 1 — Benchmark harness (instrumentation)
**Goal:** Measure heap + FPS so later claims are evidence-based.  
**Status:** **Passed** (2026-07-29).  
**Deliverables:**
- [x] Dev-only `PerfOverlay` (Paint · rAF · heap · bars · panes); toggle with `` ` ``  
- [x] Console: `window.__talariaPerf.log()` / `.sample()`  
- [x] Manual verify script below  

**Verify (Step 1 review):**
1. `npm run dev` → open a session with chart ready  
2. Perf shows **Paint** (chart paints/sec) + **rAF** (display/main-thread Hz) + Heap / Bars / Panes  
3. Idle: Paint can be low (good). Pan hard: Paint should climb toward rAF (~60)  
4. Heap needs **Chromium** (`performance.memory`); Safari/Firefox show `n/a · Chrome`  
5. Console: `__talariaPerf.log()` · toggle with `` ` ``  
6. Bars ≤ 2500 × pane count  

**Out of scope:** Fixing pan FPS regressions (that’s Step 5).

### Step 2 — Phase 4 stress run + fill numbers
**Goal:** Prove scale path under load.  
**Status:** **Passed provisional** (2026-07-29) — full 1M import deferred.  
**Deliverables:**
- [x] Stress via Perf overlay on live session (2500 bars / 1 pane)  
- [x] Fill Benchmarks table + fail/gap list  
- [ ] Optional: timed 500k CSV import in Chromium  
**Done when:** Benchmarks table has numbers + known gaps listed.  
**Depends on:** Step 1.

### Step 3 — Download / ingest caps
**Goal:** Stop accidental huge Dukascopy pulls.  
**Status:** Implemented (2026-07-29).  
**Deliverables:**
- [x] Row estimate from span × timeframe (`ingestLimits.ts`)  
- [x] Warn ≥100k · confirm ≥250k · hard block >550k (client + `/api/dukascopy`)  
- [x] CSV upload: max 80 MB · confirm large · block >1M est. rows  
- [x] Datasets UI shows estimate + disables Download when blocked  
**Done when:** Oversized download is blocked or confirmed with an explicit warning.  
**Depends on:** Step 2 findings (may adjust caps).

### Step 4 — Mobile UX pass
**Goal:** Chart chrome usable at ~390px (project mobile rule).  
**Status:** Implemented (2026-07-29).  
**Deliverables:**
- [x] TopBar two-row + scrollable TFs; series/layout/crosshair via Indicators on xs  
- [x] BottomBar stacked replay (44px) + safe-area; LeftToolbar 44px + scroll  
- [x] ChartNav 44px on touch; floating drawing bar scrollable; panes stack below `sm`  
- [x] `100dvh` + safe-area insets on chrome  
**Done when:** Create session → open chart → draw → replay works on phone-width DevTools.  
**Depends on:** none.

### Step 5 — Drawing layer cache (perf follow-up)
**Goal:** Handle-hover doesn’t rebuild the candle layer.  
**Status:** Implemented (2026-07-29).  
**Deliverables:**
- [x] Third paint layer: series+grid | drawings | crosshair/draft  
- [x] Hover/select/setDrawings → `markDrawingsDirty` only (series cache kept)  
**Done when:** Hovering drawings stays smooth on 2–4 panes with many objects.  
**Depends on:** Step 1–2.

### Step 6 — Indicators v1 (Worker)
**Goal:** First overlays without main-thread freezes.  
**Status:** Implemented (2026-07-29).  
**Deliverables:**
- [x] Worker computes SMA/EMA (`indicatorWorker` + viewport closes only)  
- [x] Indicators menu: Volume + SMA 20 + EMA 20; legend chips  
- [x] Paint on overlay pass; ≤2500 bars; no full-series in App  
**Done when:** Toggle SMA on session; pan stays on target path.  
**Depends on:** Step 2.

### Step 6b — Indicators v2 (registry + panes)
**Goal:** Own indicator runtime (not Pine): registry, BB overlay, RSI/MACD sub-panes.  
**Status:** Implemented (2026-07-29).  
**Deliverables:**
- [x] `IndicatorDef` / `IndicatorInstance` + `src/indicators/registry.ts`  
- [x] Worker: SMA, EMA, BB, RSI (Wilder), MACD — OHLC TypedArrays in/out  
- [x] `createLayout` stacks volume + N indicator panes; `setIndicatorPanes`  
- [x] TopBar toggles + period inputs; legend chips; theme colors  
**Done when:** Toggle SMA+BB+RSI+MACD; pan stays on target path.  
**Depends on:** Step 6.

### Step 7 — Replay polish
**Goal:** Long backtests feel controlled.  
**Status:** Implemented (2026-07-29).  
**Deliverables:**
- [x] Scrub slider + jump-to-date (`datetime-local`) in BottomBar  
- [x] Seek pauses playback; exit clears `replayBufferRef` + bumps reveal gen  
**Done when:** Scrub/jump works; exit doesn’t retain pane buffers.  
**Depends on:** Step 1 instrumentation.

### Step 8 — Order overlay (read-only v1)
**Goal:** Show entry/SL/TP lines without trading backend.  
**Status:** Implemented (2026-07-29).  
**Deliverables:**
- [x] Local mock orders (`orderStore` + localStorage per session)  
- [x] Paint entry/SL/TP dashed lines + labels; click to select  
- [x] `+ Place Order` creates buy mock at last close (±20/40 pip SL/TP)  
**Done when:** Place mock order → lines on chart, persisted per session.  
**Depends on:** Step 6–7.

---

### Suggested order (gates 1–8)
`1 → 2 → 3 → 4 → 5 (if FPS needs it) → 6 → 7 → 8` — **complete**.

---

## Next Work Plan — Scale / Backtest / Multi-user (Steps 9–14)

**Started:** 2026-07-29  
**How we work:** one step at a time; each step ends with typecheck + verify notes; do not weaken viewport/IDB contracts.  
**North star:** lag-free pan/zoom → real backtest results → many users via CDN+Postgres — browser always ≤2500 bars.

### Gate rules (same as before)
1. Finish one step → verify → mark checklist → only then start next  
2. Prefer small diffs; no drive-by refactors  
3. Out of scope inside Steps 9–11: shipping a production auth server (docs/schema only in Step 12)  
4. If a change risks pan/replay/sync, stop and document — do not “push through”

### Step 9 — Pan edge prefetch (lag-free drag-back)
**Goal:** Dragging left/right does not hitch when the buffer edge is near.  
**Status:** Implemented / Passed (2026-07-29).  
**Priority:** High — first code step of this wave.  
**Deliverables:**
- [x] Detect when visible range approaches buffer edge (use `BUFFER_BARS`)
- [x] Prefetch next IDB window **async** without blocking paint
- [x] Prefer wiring/enhancing `viewportLoader` / edge fetch over remapping all panes on every sync tick when possible
- [x] Keep `setViewportBars` ≤2500; no full-series in App
- [x] Preserve multi-pane time sync + echo guards + replay camera follow
**Done when:** Hard pan across a large session stays smooth; Bars stay capped; typecheck clean.  
**Depends on:** Steps 1–8.  
**Risk:** Over-fetch / sync thrash — debounce + generation tokens required.  
**Notes:** Live path remains App `applyTimeWindowToPanes` (wall-clock sync). Mid-buffer sync ticks skip IDB; only panes near `BUFFER_BARS * 0.35` edge refetch. `viewportLoader` enhanced with same edge helper + gen/pending coalescing (not dual-wired into ChartContainer — would double-fetch). Residual: very fast pan past an unfinished prefetch can briefly show empty pad until the next window lands; Step 10 LOD may further reduce reload pressure when zoomed out.

### Step 10 — Zoom LOD auto-switch (Phase 5)
**Goal:** Zoomed-out views switch to coarser pre-aggregated TF so canvas stays dense-but-capped.  
**Status:** Done (v1).  
**Deliverables:**
- [x] Choose TF from visible bar spacing / target visible count (use ingest pre-agg TFs already in IDB)
- [x] LOD switch keeps ≤ `MAX_BARS_IN_MEMORY`; preserve anchor wall-clock time
- [x] Manual TF pin still wins when user explicitly picks an interval (document UX)
- [ ] Test zoom 1m → daily on a large dataset without freeze (manual)
**Done when:** Zoom out stays on target FPS path; no full-series load.  
**Depends on:** Step 9.  
**UX (pin vs auto LOD):**
- TopBar ★ favorites = toolbar pins only — **not** an LOD lock.
- Explicit TopBar TF pick sets per-pane `selectedTf` (LOD **floor**). TopBar highlights that floor.
- Pane legend shows **effective** TF actually loaded (may be coarser via LOD).
- Auto-LOD **coarsens** on zoom-out when projected visible bars &gt; `LOD_COARSEN_BARS` (1800).
- Auto-LOD **refines** toward `selectedTf` on zoom-in when current TF is sparse (&lt; `LOD_REFINE_BARS` = 700). Never finer than `selectedTf` without another explicit pick.
- Multi-pane: per-pane LOD from that pane’s available TFs + floor; shared wall-clock window unchanged (sync intact).
- Replay play skips LOD (same as edge prefetch — origin replay/session-load ignored).
**Notes:** Lives in `src/datasets/zoomLod.ts` + App `applyTimeWindowToPanes` (debounced `LOD_DEBOUNCE_MS`). Reuses IDB pre-agg series — no main-thread re-aggregate. Gen token shared with Step 9 prefetch. Residual: very fast zoom across many TF steps may briefly show one intermediate TF; hysteresis avoids thrash.

### Step 11 — Strategy backtest engine v1 (client Worker)
**Goal:** Real path beyond mock orders: strategy → fills → equity/trades on chart.  
**Status:** Done (v1).  
**Deliverables:**
- [x] Strategy runs in **Worker** on TypedArrays / chunk stream — never main-thread full series
- [x] Output: trade list + equity points (models outside engine)
- [x] Chart paints markers / equity overlay from results only (`setViewportBars` / overlays unchanged contracts)
- [x] Simple v1 strategy (e.g. MA cross or fixed rules) + session UI to run/cancel
- [x] Slippage/spread hooks stubbed (even if zero)
**Done when:** Run backtest → trades + equity visible; pan still capped; cancel stops Worker.  
**Depends on:** Steps 9–10 preferred (stable viewport).  
**Server job queue:** Step 13 in-memory stub (`POST /api/v1/jobs/backtest`); client Worker remains the interactive path.
**v1 limits:**
- One strategy: **SMA crossover** long/flat (`fast=10`, `slow=30` defaults); costs default 0.
- Loads session wall-clock span from IDB as SoA TypedArrays (no `ChartBar[]` on main thread).
- Hard cap `MAX_BACKTEST_BARS` = **50_000** (newest bars kept if truncated); UI shows “capped”.
- Results in memory (`backtestStore`) for the open session — no journal page yet.
- Cancel = generation bump + Worker `terminate()`.
- Mock **Place Order** unchanged (separate overlay).

### Step 12 — Backend architecture doc + schema (no production server yet)
**Goal:** Lock Phase 11 design so implementation does not fight the client.  
**Status:** Implemented / Passed (2026-07-29).  
**Deliverables:**
- [x] Expand `docs/ARCHITECTURE.md`: multi-user diagram, CDN chunks, Postgres tables, API sketch
- [x] Tables: users, datasets, dataset_chunks meta, sessions, drawings, trades, journal_entries
- [x] Auth approach (session/JWT) + dataset ACL notes
- [x] Contract: browser still IDB-caches ranges; never downloads full series into React state
**Done when:** Doc reviewed; no code that breaks client path required.  
**Depends on:** can start in parallel after Step 9 lands, but prefer after Step 11 shape is clear.

### Step 13 — Backend API scaffolding + CDN chunk delivery
**Goal:** Multi-user dataset delivery without putting full history in Postgres rows.  
**Status:** Done (2026-08-02) — API stub + Datasets “Import from API” + catalog/rehydrate; local Dukascopy/CSV/IDB path unchanged.  
**Deliverables:**
- [x] Auth + dataset list API (dev stub; seeded demo dataset — no upload UI yet)
- [x] Chunked bar files on local disk stub (`data/chunks/…`, gitignored)
- [x] Client fetch-by-range → same IDB ingest/cache path (`ingestRemoteChunksToIdb` / `ingestRemoteDatasetAllTfs`)
- [x] Job queue stub for ingest (+ placeholder server backtest) — in-memory, no Redis
- [x] Datasets UI “Import from API” (health-gated list; import all remote TFs → IDB; catalog `source: 'remote'`)
- [x] `ensureDatasetIngested` rehydrates remote entries without CSV; `deleteDataset` clears IDB chunks + series meta
**Done when:** Second browser can open a shared dataset via API; chart still ≤2500.  
**Notes:** UI always probes `/api/v1/health` (soft error if down); `VITE_REMOTE_DATASETS=1` optional override only. No Postgres/CDN yet — disk stub under `data/chunks/`. Local Dukascopy download + CSV ingest remain the zero-server default.  
**Depends on:** Steps 9–12.

### Step 14 — Journal / analytics (Phase 12)
**Goal:** Persist and review backtest/live trades.  
**Status:** Done (local-only interim).  
**Deliverables:**
- [x] Journal UI (Hero UI) bound to trades from Step 11 — `JournalPage` + `journalStore` (localStorage)
- [x] Basic stats (win rate, net P&L, payoff R, equity sparkline summary)
- [x] Mobile-usable layouts (~390px stack, ≥44px controls)
**Done when:** After a backtest, journal shows trades without reloading full OHLC into memory.  
**Notes:** No Postgres/API journal sync (deferred); latest result per session only; Payoff R = avg win / |avg loss| (no SL-based R). Soft navigate from chart keeps session in memory (“Back to chart”); Sessions exit teardowns. Orphan results show “Session deleted — result kept”.  
**Depends on:** Steps 11 + 13 (or 11 local-only interim).

### Suggested order (this wave)
`9 (prefetch) → 10 (LOD) → 11 (backtest Worker) → 12 (backend doc) → 13 (API/CDN) → 14 (journal)` ✅

### Level 2 SaaS (2026-08-02)
**Full multi-user foundation shipped** — see `docs/SAAS-LEVEL-2.md`.

| Piece | Command / path |
|---|---|
| Compose | `npm run saas:up` (Postgres + Redis + MinIO) |
| API | `npm run saas:install && npm run saas:migrate && npm run saas:seed && npm run saas:api` |
| Vite → API | `npm run saas:dev` (`TALARIA_API_PROXY`) |
| Zero-Docker chart | `npm run dev` (Vite disk stub unchanged) |

Includes: session auth, Postgres schema, S3/MinIO + disk storage, Redis jobs, quotas, Datasets login + Import, launch checklist + cost model.

### Waiting on
- Level-2 local verify (docker + import → chart). Deferred Level-3: SSO, billing, multi-region HA, full 1M stress. Call **fix Step N: …** to rewind.

---

## Session Log

| Date | Work done | Next up |
|---|---|---|
| 2026-07-28 | Created plan, rules, structure, Hero UI scaffold | Phase 1: basic chart |
| 2026-07-28 | Custom Canvas engine (renderer, scales, pan/zoom, Hero theme); removed LW Charts; future-phase contracts documented | Verify `npm run dev` + Chrome pan/zoom FPS; Phase 2 CSV worker |
| 2026-07-28 | TradingView-style axis drag (time zoom / price zoom), double-click reset, nice ticks + moving grid | Phase 2 CSV worker |
| 2026-07-28 | TradingView-style chrome: top bar, left tools, bottom bar (UI shell; no drawing/replay/orders yet) | Phase 2 CSV worker |
| 2026-07-28 | Full chart window: crosshair modes, live OHLC, series types, volume pane, last-price line; chart modules organized | Phase 2 CSV worker |
| 2026-07-28 | Multi-chart sync (logical VisibleRange + crosshair store, layouts 1/2H/2V/4); volume legend under OHLC | Phase 2 CSV worker |
| 2026-07-28 | Session page: create backtest (pair, ticker, start/end dates), recent sessions, open chart | Phase 2 CSV / wire session dates to data |
| 2026-07-28 | Datasets page: Dukascopy download via Vite `/api/dukascopy`, catalog + IDB CSV; sessions pick datasets | Wire CSV into viewport loader / chart |
| 2026-07-28 | Session start loads Dukascopy CSV → chart (worker parseForChart); TF buttons switch available datasets | Full viewport loader / pan across entire series |
| 2026-07-28 | Removed crosshair bar highlight; 1m→TF aggregation engine; TF switch keeps anchor time | Viewport loader for full-series pan |
| 2026-07-28 | Time grid: equal logical spacing (not wall-clock) so vertical lines stay even across weekend gaps | — |
| 2026-07-28 | Multi-chart: per-pane TF + selection; sync by wall-clock time across TFs | Viewport loader for pan beyond in-memory window |
| 2026-07-28 | Documented scale readiness gaps + next fork (IDB loader vs replay vs drawings) in PROJECT.md | Pick A/B/C; prefer IDB viewport before heavy replay |
| 2026-07-28 | **A→B→C:** IDB ingest/chunks + viewport panes; replay cursor; drawings (trend/hline/fib); typecheck clean | Phase 4 stress; download caps; remaining toolbar stubs |
| 2026-07-29 | Fix replay pan snap-left: engine-owned camera follow; stop sync trailing-window apply; bars-only reveal | Verify drag during play stays put; Play re-attaches follow |
| 2026-07-29 | Smooth pan: fractional time sync, rAF multi-pane publish, no stale-range re-apply, wheel detaches follow | Verify 1/2/4 pane pan feels continuous |
| 2026-07-29 | Full drawing system: tool registry + flyouts, painters, style panel (TV palette), select/handles, magnet/lock/hide | Manual place/select/style per category |
| 2026-07-29 | TV floating drawing toolbar + settings modal (Style/Text/Coordinates/Visibility) | Polish per-tool settings fields |
| 2026-07-29 | Dark/light theme toggle (Hero tokens + chart repaint); chrome, tools, settings follow | — |
| 2026-07-29 | TV chart nav: zoom ±, pan ⟨⟩, reset scale, » follow replay when camera detached | — |
| 2026-07-29 | Volume off by default; toggle via TopBar Indicators menu (legend only when on) | — |
| 2026-07-29 | Multi-pair sessions: select up to 4 pairs; date picker limited to overlap; one pane per pair | — |
| 2026-07-29 | Shared drawing settings shell (Style/Inputs/Text/Coords/Visibility); per-tool Inputs via toolSettings | — |
| 2026-07-29 | Drawing pointer UX: move/resize cursors; drag body to move, handles to resize (no chart pan) | — |
| 2026-07-29 | Perf: layered paint (static+overlay), rAF crosshair sync, engine placement draft, scale/hit caches | Keep lean under drawings/indicators/orders/long replay |
| 2026-07-29 | Renamed product branding from Fast Chart → Talaria-Log (title, UI, docs) | — |
| 2026-07-29 | Next Work Plan with review gates (Steps 1–8) in PROJECT.md | Approve **go Step 1** (benchmark harness) |
| 2026-07-29 | Step 1: PerfOverlay + `__talariaPerf` (Paint/rAF/heap/bars) | **Passed** |
| 2026-07-29 | Step 2: provisional Benchmarks + fail list (30 Hz display) | Optional Chromium 500k import later |
| 2026-07-29 | Step 3: ingestLimits warn/confirm/block + CSV size caps | — |
| 2026-07-29 | Step 4: mobile chrome (~390px) — Top/Bottom/Left/nav/safe-area | — |
| 2026-07-29 | Step 5: 3-layer paint (series / drawings / overlay) | — |
| 2026-07-29 | Step 6: SMA/EMA Worker overlays + Indicators menu | — |
| 2026-07-29 | Step 7: replay scrub + jump-to-date + exit buffer clear | — |
| 2026-07-29 | Step 8: mock order overlay (entry/SL/TP) + Place Order | Review gates 1–8 complete |
| 2026-07-29 | TV chrome pass: L-frame `--separator` dividers, compact top/left/bottom | Verify light+dark vs TV screenshot |
| 2026-07-29 | TV layout picker: grid icons (1–4 panes) + Sync toggles | Try 3r/3b/4 layouts + sync interval |
| 2026-07-29 | Layout on right; TF pin/favorites (★) + dropdown | Pin/unpin intervals via ▾ menu |
| 2026-07-29 | TV symbol pill: switch session pairs on active pane | Multi-leg session → pick EUR/USD ↔ GBP/USD |
| 2026-07-29 | Indicators v2: registry, BB overlay, RSI/MACD panes, Worker OHLC, period inputs | — |
| 2026-07-29 | Indicators catalog: 50 classic+ICT, settings modal (full inputs), search menu, caps | — |
| 2026-07-29 | Fix left tools flyout: overflow clip — menu outside scroll column | Click ▾ groups → dropdown opens |
| 2026-07-29 | Fix all chrome dropdowns: float toolbar portal flyouts; Popover triggers (no nested button); z-index | Indicators / TF / layout / symbol / volume / drawing style menus |
| 2026-07-29 | Active pane soft blue inset border (multi-pane) | Click panes in 2/4 layout → accent frame |
| 2026-07-29 | Multi-TF replay: clock = smallest pane TF; higher TF forming candles tick-by-tick until close | Play 1m+5m+1h → all advance on 1m |
| 2026-07-29 | TV pane chrome: legend read-only; pair/TF only via TopBar on selected pane | Select pane → change symbol/TF in top bar |
| 2026-07-29 | Multi-pair opens 1 pane; TF switch keeps candle count + right-edge time | Open 2 pairs → 1 chart; switch 1m↔1h stays put |
| 2026-07-29 | Fix TF jump: read live camera from chart registry; atomic bars+range; no setViewportBars recenter | Pan then switch TF → same place/scale |
| 2026-07-30 | Fix TF switch under replay mask: anchor to cursor (revealRangeAtCursor), refresh buffers | 1m→4h→1m no empty/one-candle view |
| 2026-07-29 | Roadmap: Steps 9–14 (prefetch, LOD, backtest Worker, backend doc/API, journal) + multi-user architecture in plan | Step 9 pan edge prefetch |
| 2026-07-29 | Step 9: pan edge prefetch — skip mid-buffer IDB remaps; async edge refill + gen tokens; `viewportEdge` helper | Step 10 zoom LOD |
| 2026-07-29 | Step 10: zoom LOD auto-coarsen/refine via ingest pre-agg TFs; `selectedTf` floor; wall-clock preserved | Step 11 backtest Worker |
| 2026-07-29 | Step 11: SMA-cross backtest Worker; IDB→TypedArrays; trades+equity overlays; Run/Cancel; 50k bar cap | Step 12 backend architecture doc |
| 2026-07-29 | Marketing landing page scaffolded in `landing/` (Next.js 15 + HeroUI v2 + TW 3.4) | `cd landing && npm run dev` |
| 2026-07-29 | App home = marketing landing; Start free → backtest sessions | Refresh Vite root `/` |
| 2026-07-29 | `landing/` migrated Next.js → Vite + vite-react-ssg (single-page) | `cd landing && npm run dev` |
| 2026-07-29 | Step 12: Phase 11 backend architecture + schema sketch in ARCHITECTURE.md (CDN chunks, Postgres meta, API, ACL) | Step 13 API/CDN scaffolding |
| 2026-07-29 | Step 13: Vite `/api/v1` stub + disk chunks + job queue + `ingestRemoteChunksToIdb` (local path default) | Step 14 journal or remote UI |
| 2026-07-29 | Step 14: Journal page + localStorage per session; stats/trades/equity sparkline; nav from sessions + BottomBar | Optional remote journal / Import-from-API UI |
| 2026-07-30 | TF switch refactor: session controller, load-time reveal, warm cache, base-TF clock split; see `docs/TF-REFACTOR-REPORT.md` | Manual §8 matrix + p95 latency in browser |
| 2026-07-30 | Perf addendum: resourceLedger, warmCache LRU, no React commits on replay tick; report §§10–14 | Chrome §8 heap/Profiler baselines by operator |
| 2026-08-02 | Chart settings (right-click): Symbol/Canvas/Layout/Scales — candles, grid, bg, chrome colors; persist localStorage | Optional status-line tab / TopBar entry |
| 2026-08-02 | Full chart settings: Symbol/Status/Scales/Canvas/Layout — series, volume, legend, axes, watermark, chrome show/color, theme; live + persist v2 | — |
| 2026-08-02 | Replay TF/pair switch keeps tip candle position + bar-count zoom (`cameraPreserveRef`); load-time truncate; no lookahead | Manual check play/pause multi-pane TF+pair |
| 2026-08-02 | Step 13 wiring: Datasets Import from API, all-TF remote→IDB, catalog `source:'remote'`, rehydrate + delete chunks | Manual import → Create Session; Postgres/CDN later |
| 2026-08-02 | Fix pass: backtest pane filter + dense markers + cancel abort; empty chart (no fake bars); soft journal nav; Phase 6 polish; play-pan prefetch | Manual: multi-pane backtest, Cancel mid-run, Import API, Journal↔chart |
| 2026-08-02 | Persist replay `cursorTime`/`span` on session (pause/seek/exit/unload); reopen resumes last candle | Optional “Restart from start” control |
| 2026-08-02 | Fix play chrome fight (uncontrolled scrub/label) + multi-pane stuck (fill around cursor on layout) | Manual 3-pane play at 4x |
| 2026-08-02 | Multi-chart replay: armPlay warms all pane caches; extendReveal fill-ahead + keep tip on gap | Verify 3-pair Play advances all panes |
| 2026-08-02 | Play/Pause camera jump: follow uses right-anchored (same as pause), preserve engine span | Toggle Play/Pause — tip stays put |
| 2026-08-03 | Play/Pause time-grid jump: keep wall-clock window on pause; follow recenters only on new tip | Toggle Play/Pause — labels stable |
| 2026-08-03 | Fix 1D play sawtooth: no finer-TF cache fallback; rebuild reveal from matching TF each tick | Play 1D — candles match pause |
| 2026-08-03 | TF/ticker switch: await fill before paint; never blank last candles on cache miss | Switch 1m↔1D and pairs mid-replay |
| 2026-08-03 | Legend 3-dot loader beside symbol while TF/ticker warms | — |
| 2026-08-02 | Level-2 SaaS full: `docs/SAAS-LEVEL-2.md`, Docker (PG/Redis/MinIO), Fastify API, auth, jobs, Datasets login | `npm run saas:up` → migrate/seed/api → `saas:dev` |
| 2026-08-02 | Order system Phases 1–7: pure engine, §4.3 fills, margin/swap, journal determinism, drag overlay, order UI — `docs/ORDER-SYSTEM-REPORT.md` | Measure drag Profiler/p95; journal rebuild on reload |
| 2026-08-02 | TV-style order UX: floating ticket, bottom TradeDock tabs, draft+live SL/TP chart levels | Place Order → drag SL/TP on chart |
| 2026-08-02 | Order ticket docks (chart shrinks → price axis visible); default Market @ live bid/ask; drag draft entry/SL/TP → ticket | Place Order → drag levels |
| 2026-08-03 | Open levels persist until SL/TP; live unrealized P&L on entry chip + BottomBar during replay | Place → Play → watch P&L / levels to hit |
| 2026-08-04 | Fix SL-on-bid (pips not ticks), USDJPY margin UI, reject keeps ticket; drag entry → LIMIT/STOP; pending market shows entry | Place / drag / Set → levels survive Play |
| 2026-08-04 | Live LIMIT/STOP helper while dragging entry (`inferPendingType` + drag readout / line label) | Drag draft entry above/below ask |
| 2026-08-04 | Clarify freeze-level reject; entry defaults on last price; SL/TP sit on entry until drag/pips (TV) | Open ticket → drag SL/TP off entry |
| 2026-08-04 | Fix Play wiping orders: no fill on bars ≤ createdAt; anchor lastStepped on submit; keep pending market on chart | Set Market → Play → levels stay until SL/TP |
| 2026-08-04 | TradeDock row P&L uses account-ccy `unrealizedPnL` (USDJPY was showing raw JPY) | Open USDJPY position — row ≈ bottom P&L |
| 2026-08-04 | Journal page shows Place Order / replay closed trades (order event journal), not SMA backtest | Place → close via SL/TP → Journal |
| 2026-08-03 | Chart style templates in settings (Sapphire, Obsidian, Zenith, Pearl, Olive, Willow, Marine, Blue Ash) | Optional FVG/IFVG zone colors later |
| 2026-08-03 | Fix multi-pane 1m replay stall: forward warm-cache bias, fill-ahead chain, rAF harden, tip re-anchor | Verify 4-pane 21× long run |
| 2026-08-03 | Memory-safe replay runway: compact ~900-bar forward fills, MAX_ENTRIES=16 + ~3.6MB byte cap, pin active panes | Heap check on 4-pane 21× |
| 2026-08-03 | Collapse bottom trade chrome by default — compact replay strip + arrow to expand TradeDock | — |
| 2026-08-03 | TV-style drawing settings for all tools: shell/tabs/flyout/templates, live preview, rename, fillColor/text align | Manual: trend/rect/fib/text settings |
| 2026-08-03 | Multi-pane independence: scoped camera sync, preserve sibling ranges, dateRange-gated pan; sync defaults off | Verify 4-pane pan/TF with sync off |
| 2026-08-03 | TV-style Indicators modal: sidebar, search, All/Overlays/Panes pills, favorites, table rows | — |
| 2026-08-03 | Small Talaria logo top-left in TopBar; “Talaria Log” brand text bottom-left on chart | — |
| 2026-08-03 | TV-scale brand: 28px vector logo in TopBar; 14px chart text; PNG never drawn on canvas | — |
| 2026-08-03 | Remote import syncs missing TFs (5m…1D) when only 1m was in IDB; FirstRate pairs packed with all TFs on VPS | Hard-refresh → Sync timeframes / reopen session |
| 2026-08-03 | Drawing settings: draggable modal; wire Inputs/Style toggles into painters (angle, midline, fib, VP, VWAP, RR, etc.) | Spot-check remaining tools in UI |
| 2026-08-03 | TV Fib Inputs tab: editable level coeffs/colors/styles, add/remove, show prices, extend L/R; all level tools wired | Manual fib/fan/timezone check |
| 2026-08-03 | Touch/responsive plan Steps T1–T5: pinch+long-press, fat hits, 44px chrome, order sheet, safe-area, multi-pane focus | Device QA checklist in PROJECT T5 |
| 2026-08-03 | Indicator replay: no flicker (length-tolerant paint + buffer align); tip sync via trailing 320-bar Worker window | Verify SMA/RSI during play |
| 2026-08-04 | Left tools: TV hover arrow on groups; arrow opens categorized flyout; icon click uses last tool | Hard-refresh → hover tool groups |
| 2026-08-04 | Tool icons restyled: thin 1.5 stroke, 28×28, TV-like brush/T/ruler/smiley pictograms | Hard-refresh → compare left rail |
| 2026-08-04 | Tool-group arrow: shared hover chip + side chevron (no overlay tab on icon) | Hard-refresh → hover groups |
| 2026-08-04 | Chart templates menu (TopBar): Color Mix + full looks (candles/grid/volume/chrome); settings link | Try Color Mix / Classic / Aurora |
| 2026-08-04 | Templates drive `--accent` too (Place Order, TF chip, tool selection); Layout tab Accent picker | Switch Ember → orange buttons |
| 2026-08-04 | “Talaria Log” brand watermark only on primary (first) pane in multi-chart | Verify 2×2 layout |
| 2026-08-04 | Nav path close-the-loop: TopBar Sessions/Exit + Backtest→journal; honest landing; shared AppPageNav; Datasets Create session CTA; soft #/404 | Manual: Exit chart, run BT → Journal, unknown hash |
| 2026-08-04 | Landing + chrome fully on Hero UI (removed `--m-*` marketing palette); ThemeToggle/logo use Hero Button | Hard-refresh landing — tokens follow dark/light |
| 2026-08-04 | Analytics dashboard v1: columnar store, worker metrics (88), canvas charts subset, virtual list, honesty gating; report in `docs/ANALYTICS-REPORT.md` | Bottom Analytics tab; Demo 5k; `npm run test:analytics` / `bench:analytics` |
| 2026-08-04 | Trade collect enrichment: MFE/MAE, stop/R/costs/exitReason/riskPct/entry bars on POSITION_CLOSED → journal → analytics | Place+SL → Play → Analytics shows R, SL, commission |
| 2026-08-04 | Server publish: Dukascopy → IDB → PUT meta/series/chunks to `/api/v1`; Datasets auto-publish + Save to server; Import from API on other browsers | Download → confirm Import list → open in 2nd browser |
| 2026-08-04 | Server-first sessions: Create Session lists remote catalog; fetch chunks by date on Start (`ensureSessionDataFromServer`); range IDB meta fix | Publish from Datasets → new session with dates → chart loads |

---

## Next Work Plan — Touch / Responsive (Steps T1–T5)

**Started:** 2026-08-03  
**How we work:** one phase at a time; typecheck + verify notes after each; do not weaken viewport/IDB contracts.  
**North star:** Full chart function on phones, tablets (portrait/landscape), and desktop — finger-first gestures + ≥44px chrome.

**Context:** Step 4 covered chrome at ~390px. Chart gestures remain single-finger / desktop-oriented (no pinch, unreliable settings entry on iOS).

### Step T1 — Chart multi-touch & settings entry (P0)
**Goal:** Plot usable with fingers.  
**Status:** Implemented (2026-08-03).  
**Deliverables:**
- [x] Multi-pointer model (1–2 fingers) in `interaction.ts`
- [x] Pinch zoom around midpoint (same span rules as wheel)
- [x] Two-finger pan
- [x] Long-press (~500ms) → chart settings (`talaria:open-chart-settings`); keep desktop right-click
- [x] Crosshair not cleared on synthetic `pointerleave` after touch-up
- [x] ChartNav remains backup zoom/pan  
**Done when:** iPhone/iPad Safari — pinch, pan, long-press Settings; desktop mouse unchanged.  
**Files:** `src/chart/interaction.ts`, `createChart.ts` if needed.

### Step T2 — Finger hit testing (P0)
**Goal:** Select drawings/orders with a thumb.  
**Status:** Implemented (2026-08-03).  
**Deliverables:**
- [x] Coarse-pointer hit slop (~24px handles, ~16–20px lines) in `hitTest.ts`
- [x] Larger order line hit zone in `drawOrders.ts`
- [x] Slightly larger painted handles on touch (`touchTarget.ts`)  
**Done when:** Place/select/move/resize trend + fib with thumb without missing.

### Step T3 — Chrome 44px + mobile sheets (P1)
**Goal:** Every primary control tappable on phone.  
**Status:** Implemented (2026-08-03).  
**Deliverables:**
- [x] TopBar triggers ≥44px on touch (Layout/Theme/Symbol/TF/Indicators/Sessions)
- [x] Volume + OverlayIndicators buttons ≥44px on touch
- [x] Backdrop dismiss via `pointerdown` (not mouse-only)
- [x] Order ticket → bottom sheet + dimmer on `<sm`
- [x] Drawing floating toolbar scrolls horizontally if overflow  
**Done when:** At 390×844 every primary control works; order form usable.

### Step T4 — Layout density & safe areas (P1/P2)
**Goal:** All sizes without cramped plots or edge clipping.  
**Status:** Implemented (2026-08-03).  
**Deliverables:**
- [x] Root `overflow-x: clip`
- [x] `safe-area-inset-left/right` on chrome bars + toolbar
- [x] Multi-pane phone strategy: 3+ panes → focus active + tab strip
- [x] Left toolbar 52px on `hover:none`
- [x] Settings modal already sheet-friendly (landscape OK)  
**Done when:** iPhone SE / 390 / iPad P+L — no horizontal scroll; plot usable.

### Step T5 — QA matrix & docs (P2)
**Goal:** Confidence + checklist sync.  
**Status:** Implemented (2026-08-03) — operator verifies on device.  
**Deliverables:**
- [x] Manual matrix documented below
- [x] Full-function checklist below
- [x] Sync `docs/SAAS-LEVEL-2.md` mobile gate; session log  
**Done when:** Checklist signed off in PROJECT.md.

#### T5 verify checklist (operator)
- [ ] Phone ~390px: pan, pinch zoom, long-press Settings, double-tap reset
- [ ] Crosshair + OHLC stick after finger lift
- [ ] Drawings: place / select / move / resize with thumb
- [ ] Order ticket opens as bottom sheet; Place Order works
- [ ] TopBar / TF / Indicators all ≥44px taps
- [ ] 3–4 pane layout: pane tabs switch; plot full height
- [ ] iPad portrait + landscape: no horizontal page scroll
- [ ] Desktop mouse: pan / wheel zoom / right-click Settings unchanged

### Suggested order
`T1 → T2 → T3 → T4 → T5` — work one step at a time.

---

## How to Update This File

When you complete a task:

1. Change `[ ]` to `[x]` in the checklist
2. Add benchmark numbers if applicable
3. Add a row to Session Log
4. Do **not** remove or reorder phases without discussion
