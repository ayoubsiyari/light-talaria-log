# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are discretionary traders and systematic traders who review historical price action, run local or SaaS-backed backtests, and study trade analytics. They work on desktop and mobile browsers, often for long sessions with dense chart chrome (toolbars, panes, overlays).

Secondary audiences (when SaaS paths are used): operators managing datasets, users, and jobs via admin surfaces.

## Product Purpose

Talaria-Log is a high-performance candlestick charting and trading-workflow tool. It exists to let users load large historical CSV / market datasets without freezing the browser, interact with charts at trading-grade responsiveness, and connect that chart to sessions, strategy runs, journal/trades, and analytics.

Success means: large series stay usable (memory and FPS budgets), chart interaction stays fluid on desktop and mobile, and UI chrome stays consistent with the Hero UI system while the custom Canvas engine stays a dumb viewport renderer.

## Positioning

Custom Canvas 2D chart engine that never owns the full dataset — worker parse, IndexedDB chunks, TypedArray viewport windows — instead of loading an entire series into a third-party chart library. Product chrome is Hero UI; the rendering hot path is deliberately out of DOM design tooling.

## Operating Context

Typical loop: create or open a session → load dataset → pan/zoom/replay on the chart → place drawings / indicators → run or review orders/strategy → inspect journal and analytics dashboard. Local Vite stub and optional Docker SaaS stack (Postgres/API/object storage) are both supported paths. Marketing/landing surfaces exist but are not the primary product surface.

## Capabilities and Constraints

Confirmed:
- Custom Canvas 2D engine under `src/chart/` (no TradingView Lightweight Charts or other third-party chart libs)
- Hero UI + Tailwind for all UI chrome; chart colors mapped via `src/chart/chartTheme.ts`
- Worker-based CSV parse; IndexedDB viewport loading; TypedArrays; indicator work off the main thread
- Multi-pane layouts, sync, drawings, replay, orders/journal, strategy, analytics dashboard, auth/admin/datasets surfaces
- Hard performance budgets: e.g. ~2500 bars in memory, ~55–60 FPS pan/zoom target, low browser memory

Constraints / scope:
- Phase discipline in `PROJECT.md`: chart/data decisions must serve low memory, low CPU, fast load + fast redraw
- Do not load full CSV into JS objects or parse/compute indicators on the main thread
- Canvas rendering path (`src/chart/`) is excluded from Impeccable design-detector pressure; design pressure applies to DOM UI

Open / evolving:
- Full SaaS multi-user backend maturity beyond the documented Level 2 path
- Light mode optional later; default theme is dark

## Brand Commitments

- Product name: **Talaria-Log** (repo: fast-chart)
- UI design system: **Hero UI** tokens and components (`docs/DESIGN.md`)
- Default theme: dark
- Voice for product UI: precise, tool-like, scan-friendly — not marketing-first on app surfaces
- Marketing homepage grammar: product-tool landing in the FX Replay / TradingView mold (sticky bar, headline + CTA, full-width product screenshot). Do not copy their copy, logos, or unverified claims.

## Evidence on Hand

- `PROJECT.md` — master plan, budgets, phase checklist, session log
- `docs/DESIGN.md` — Hero UI tokens and chart color mapping
- `docs/ARCHITECTURE.md` — technical architecture
- `docs/SAAS-LEVEL-2.md` — SaaS stack notes
- Runnable app: `npm run dev` (Vite); sample data under `public/`
- Do not fabricate testimonials, customer logos, or unverified benchmarks in UI copy

## Product Principles

1. Performance is product truth — every chart/data choice serves memory, CPU, load, and redraw.
2. Engine stays dumb — viewport renderer only; full series lives in workers / IDB / TypedArrays.
3. Chrome is Hero UI — tokens and components for all DOM UI; no ad-hoc hex in components.
4. Mobile is first-class — touch targets, responsive chrome, chart controls usable with fingers.
5. Design tooling pressures UI, not the canvas hot path.

## Accessibility & Inclusion

Mobile-friendly interaction is a hard project rule (controls ≥44px, pointer/touch, no desktop-only chrome). No separate WCAG certification target is recorded yet; future UI work should not regress keyboard reachability or contrast on product chrome.
