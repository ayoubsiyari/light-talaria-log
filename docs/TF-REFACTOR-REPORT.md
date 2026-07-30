# TF switch refactor — implementation report

## 1. Summary

Implemented the session-controller architecture: load-time reveal (`revealedViewport`), per-pane/global epoch guards, warm cache with sync `get`, and App TF switch as a camera capture + `setPaneTimeframe` field change. Replay clock is split into base-TF grid vs focused-pane rate TF, with coalesced rAF advances. Property tests cover the 6×6 TF matrix (1944 cases) and pass. Manual browser matrix and click-to-paint p95 were **not** measured in this agent environment. All six phases are landed in code; repository had no prior commits so a baseline commit precedes six phase-tagged commits.

## 2. Diagnosis confirmed / contradicted

| Mechanism | Predicted? | Finding |
|---|---|---|
| **§2.3 load-time reveal** | Yes | Confirmed need. Pre-refactor `applyPaneTimeframe` loaded full IDB windows and relied on paint-time `maxBarIndex` + `revealRangeAtCursor` (`App.tsx` staged ~769–857). Anchoring past cursor produced empty / one-candle views. Load-time truncate + forming bar is now in `src/session/revealedViewport.ts` / `derivePane.ts`. |
| **§2.4 epoch guard** | Likely | Confirmed gap on TF path: pan LOD had `prefetchGenRef` (`App.tsx` ~364), reveal had `revealGenRef`, but TF switch awaited IDB then wrote panes with no dedicated per-pane epoch. Now `sessionController` `paneEpoch` + `warmCache.epochs` discard stale fills. **No on-demand reproduction** of the 1m→4h→1m stale overwrite in this pass (see §6 Q5). |
| **§2.5 warm cache** | Yes (latency) | Confirmed: every TF click awaited `loadViewportAroundTime`. Warm cache now prefetches on `configure`; sync path reads memory. |
| **§2.6 engine lifetime** | Suspected | **Contradicted as root cause.** `useChart.ts` create effect deps are only `[containerRef]` (line 202). `ChartGrid` keys by `pane.id` (not TF). Engine was already lifetime-stable; symptoms were orchestration/race/camera, not remount. |

## 3. Answers to §6 questions

1. **Does `useChart.ts` recreate the engine when `timeframe` changes?**  
   **No.** Create/destroy effect: `}, [containerRef]);` at `src/hooks/useChart.ts:202` (eslint exhaustive-deps disabled). `timeframe` is not in that array. `ChartPane`/`ChartGrid` use `key={pane.id}` (`ChartGrid.tsx:116`).

2. **Does autoscale compute min/max over masked bars? Was it leaking?**  
   **No leak found.** `computePriceScale` clamps with `maxBarIndex` (`src/chart/scales.ts:17–27`). `paintStaticFrame` passes the same into `drawSeries` / scale (`renderer.ts`). After load-time truncate, the mask is a safety net; DEV warns if mask still trims (`renderer.ts` paint path).

3. **`binaryBar.ts` Float32 or Float64 for OHLC?**  
   **Time = `Float64Array`; OHLC+V = `Float32Array`** (`src/data/binaryBar.ts:7–12`, pack `setFloat64`/`setFloat32` at `:50–60`). ~0.008 ulp issue at 1e5 prices remains a deferred finding.

4. **Does `zoomLod.ts` mutate `pane.timeframe` and fight TopBar?**  
   **Mutates effective `timeframe` only; respects `selectedTf` floor.** `pickLodTimeframe` never goes finer than `selectedTf` (`src/datasets/zoomLod.ts:9–12, 61–66`). App’s `applyTimeWindowToPanes` writes `timeframe` while preserving `selectedTf`, then `syncPaneConfigs` on the session. Explicit TopBar pick updates both `tf` and `selectedTf` via `setPaneTimeframe`. LOD can still change *displayed* TF vs the toolbar label if coarsened — by design, not a fight that overwrites the floor.

5. **Where did the stale-async race manifest? Reproduction?**  
   **Not reproduced on demand.** Structural race existed: TF switch and reveal both did unguarded `await loadViewport…` then `setPanes`. Rapid 1m→4h→1m is the theoretical trigger. Fixed by epochs; no failing before/after capture in this environment.

6. **Is `cursorTime` on base TF or active pane TF? Rounding on TF change?**  
   **Previously:** clock TF = `smallestTimeframe(pane TFs)` via `syncReplayClockTf` + `setActiveTf` (staged `App.tsx` ~321–329) — so cursor snapped to the finest *pane* TF, and changing a pane could retick the clock. **Now:** `setBaseTf(catalog.baseTf)` always; `setRateTf(focused selectedTf)` for speed only (`replayStore.ts`, `App.tsx` `syncReplayClockTf`). Session `setCursorTime` snaps with `bucketStart` on `baseTf`.

7. **Does `finalizeAgg` mark trailing partial buckets?**  
   **No partial mark.** `finalizeAgg` pushes the open bucket via `pushCompletedBar` then clears `hasBucket` (`src/data/csvWorker.ts:174–178`) — trailing incomplete buckets are stored as normal bars.

8. **Bars decoded when viewport straddles a chunk?**  
   `loadViewportAroundTime` requests ≤ `MAX_BARS_IN_MEMORY` (2500) logical bars (`seriesViewport.ts:107–114`). `getBarsInRange` unpacks each touched chunk’s TypedArray (`CHUNK_SIZE` 5000) then copies only the index slice to `ChartBar[]` (`idbStore.ts:124–160`). Straddle ⇒ **up to two chunks unpacked (≤10k SoA rows)**, **≤2500 `ChartBar` objects** returned.

## 4. Changes by file

| File | Change | Lines ± | Notes |
|---|---|---|---|
| `src/session/sessionState.ts` | **create** | +46 | Canonical `SessionState` / `PaneConfig` / `PaneView` |
| `src/session/revealedViewport.ts` | **create** | +171 | Load-time reveal + DEV assert helper |
| `src/session/warmCache.ts` | **create** | +135 | Sync get, prefetch, epoch fill, `put` |
| `src/session/derivePane.ts` | **create** | +160 | Sync/async pane derivation |
| `src/session/sessionController.ts` | **create** | +262 | Plain TS controller (no React) |
| `src/session/index.ts` | **create** | +12 | Re-exports |
| `src/session/__tests__/tfSwitch.property.test.ts` | **create** | ~220 | Property matrix |
| `scripts/register-alias.mjs` / `resolve-alias.mjs` | **create** | ~50 | node:test `@/` resolver |
| `src/App.tsx` | **heavy** | 1477 → 1451 (−26 net; large rewrite of TF/replay paths) | Session wire; `applyPaneTimeframe` = camera + field change |
| `src/hooks/useChart.ts` | audit only | 0 | No remount fix needed |
| `src/chart/renderer.ts` | light | +~15 | DEV paint-mask fallback warning |
| `src/chart/series/drawSeries.ts` | none | 0 | Already respects `maxBarIndex` |
| `src/replay/replayStore.ts` | heavy | rewrite | `setBaseTf` / `setRateTf`, coalesce ticks, frame-budget warn |
| `src/datasets/seriesViewport.ts` | none | 0 | Still used by warmCache/revealedViewport |
| `package.json` | light | +1 script | `test:session` |
| `docs/TF-REFACTOR-REPORT.md` | **create** | this file | |

## 5. Deviations from the brief

1. **`maxBarIndex` paint path kept** (not removed) as safety net; DEV warns when it still trims. Demotion is assertion/warn, not deletion — safer for one release.
2. **`derivePaneAsync` prefers warmCache fill → `derivePaneSync`** rather than always calling `revealedViewport` (avoids double IDB; `revealedViewport` used on empty cache). Same contract for callers of `revealedViewport` directly.
3. **Legacy `replayBufferRef` / `clockBufferRef` retained** for LOD/pan path and buffer clear on teardown; reveal/TF no longer own them. Not deleted in the same change set that added session (per §7).
4. **Pan/zoom LOD path** still imperative in App (`applyTimeWindowToPanes`); syncs configs via `syncPaneConfigs` without full rederive so LOD bars aren’t clobbered.
5. **Shared rAF for all chart panes** not introduced — engines keep their own paint scheduling; replay uses one rAF for the clock (coalesced). Full §2.8 multi-pane dirty-flag loop not built.
6. **Zero-allocation draw path** not audited/changed (out of scope / renderer rewrite forbidden).
7. **Manual matrix + p95 latency** not run in-browser here.
8. **Repo had zero commits** — added a baseline commit then phase-tagged commits. **Phase 4 (warmCache) was committed before Phase 3 (controller)** because the controller imports the cache; git history order is P1→P2→P4→P3→P5→P6.

## 6. Test results

- **Property test:** **pass.** `npm run test:session` — 1 suite, 1 test, **1944** configure×switch cases (6×6 TFs × 9 cursors × 3 spans × 2 reveal modes). Duration ~12s. Failures: 0.
- **Manual matrix (§8):** **not executed** (no interactive browser session in this agent run). Cells left blank intentionally — do not treat as verified.

| From → To | Paused | Playing | Rapid triple-click | At dataset start | At dataset end |
|---|---|---|---|---|---|
| 1m → 4h | — | — | — | — | — |
| 4h → 1m | — | — | — | — | — |
| 1m → 1D | — | — | — | — | — |
| 1D → 5m | — | — | — | — | — |
| 15m → 1h | — | — | — | — | — |
| 1h → 15m | — | — | — | — | — |

Multi-pane mid-playback TF change: covered by clock-split unit semantics + property tests; **not** manually verified.

- **Typecheck:** `npm run typecheck` clean after changes.
- **Lint:** no separate lint script in `package.json`; not run.
- **TF switch p95 click-to-paint:** **not measured.** Sync path is designed for 0 `await` after prefetch; claim under 16ms is **unverified**. Recommend PerfOverlay / `performance.now()` around `applyPaneTimeframe` → first paint in Chrome.

## 7. Deferred findings

Ranked by severity:

1. **High — Manual / latency verification missing.** Orchestration rewrite without browser sign-off on the §8 matrix.
2. **High — `finalizeAgg` writes trailing partial as complete bar** (`csvWorker.ts:174–178`). Coarse series can show a “closed” last candle that is not. Forming-bar path partially masks this during replay only.
3. **Medium — Float32 OHLC** at large absolute prices (BTC/index CFDs).
4. **Medium — UTC bucket anchoring** not reviewed; `bucketStart` uses epoch-second floor — DST/session open semantics untouched.
5. **Medium — Pan LOD still a parallel imperative path** that can drift from session-derived bars until next cursor/TF event.
6. **Medium — localStorage drawings vs IDB series split-brain** on dataset delete (orphans) — noted, not fixed.
7. **Low — Warm cache placeholder** may briefly show a coarser TF’s bars on cold miss (intentional) — visual glitch possible before async fill.
8. **Low — `App.tsx` still ~1450 lines**; further shrink possible once LOD/pan moves into the controller.

## 8. Remaining risks

- **Subscribe + explicit `commitSessionViews` double `setState`** on some paths — usually idempotent, but can amplify React work under high replay speed.
- **Session dispose/recreate** during `loadSessionData` can race with an in-flight subscribe effect for one frame.
- **Warm cache key has no cursor truncation** — stores full IDB windows; reveal is applied at derive time. Correct, but a bug in `truncateAtCursor` would reintroduce lookahead globally.
- **Follow mode + `anchorTime` clamp on TF switch** still min(anchor, cursor) in replay — correct for no-lookahead but can shift perceived pan position vs brief’s “anchor unchanged” when the user was scrolled into the future mask region.
- **No single shared chart rAF** — at max speed, N panes still paint independently; frame-budget warn only covers the replay clock tick callback.

## 9. Open questions for the advisor

1. Should zoom LOD be folded into `SessionState` (effective `tf` vs `selectedTf`) in a follow-up so App loses `applyTimeWindowToPanes` entirely?
2. Is a brief flash of coarser-TF placeholder bars on cold cache miss acceptable, or should we keep the previous pane’s bars until the target TF fill commits?
3. Confirm product intent: preserve **bar count** across TF (implemented) vs any remaining desire to preserve wall-clock window for small TF steps only?
4. Priority for fixing `finalizeAgg` partial-bucket marking vs float64 OHLC vs dataset-delete orphans?
5. OK to delete `replayBufferRef` / paint `maxBarIndex` after one release of field soak?
