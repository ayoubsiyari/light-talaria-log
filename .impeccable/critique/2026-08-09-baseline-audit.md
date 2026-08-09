# Impeccable Audit — Baseline (DOM UI)

**Date:** 2026-08-09  
**Scope:** Product chrome under `src/components/` (+ `index.html`, `src/index.css`).  
**Excluded:** `src/chart/` (detector ignore — canvas hot path).  
**Surface type:** Product / Operate (tool), not marketing-first.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Solid ARIA on BottomBar replay/trades; dense trading chrome still has uneven labeling elsewhere |
| 2 | Performance | 3 | Chart/data path is the real budget; DOM UI is mostly fine — watch heavy Dashboard canvas boards |
| 3 | Responsive Design | 3 | Safe-area + min-h-11 patterns present; some `size="sm"` / dense controls remain on desktop-first sheets |
| 4 | Theming | 2 | Hero tokens dominate, but hard-coded hex/rgba remain in OrderTicket, templates, fib defaults, brand SVG |
| 5 | Implementation Integrity | 3 | One verified detector finding (side-tab); otherwise coherent Hero/Obsidian product chrome |
| **Total** | | **14/20** | **Good** |

## Implementation Integrity Verdict

**Pass (with one slop tell).** The app reads as a specific trading tool (Hero + Obsidian chrome, tokenized dark UI), not a generic SaaS template. Detector found one AI-slop pattern: thick left accent border on the Datasets summary card.

## Executive Summary

- Audit Health Score: **14/20** (Good)
- Issues: **0 P0**, **2 P1**, **3 P2**, **1 P3**
- Top issues: hard-coded colors drifting from tokens; Datasets side-tab accent; dense small controls in order/settings chrome
- Next: `/impeccable document` (record incumbent world at root DESIGN.md if desired), then scoped `/impeccable polish` / `/impeccable quieter` on Datasets + OrderTicket — keep canvas out of scope

## Detailed Findings

### [P1] Hard-coded colors in product chrome
- **Location:** `OrderTicket.tsx`, `ChartTemplatesMenu.tsx`, `FibLevelsEditor.tsx`, `BrandLogo.tsx`, `LayoutPicker.tsx`, `BottomBar.tsx`
- **Category:** Theming
- **Impact:** Theme/template switches leave pockets of non-token color; harder to keep dark/light and chart templates coherent
- **Recommendation:** Map interactive chrome to Hero / `--tv-*` / semantic tokens; keep palette pickers as the only intentional hex inputs
- **Suggested command:** `/impeccable polish` (OrderTicket + chrome) or `/impeccable colorize` only where strategic accent is missing

### [P1] Side-tab accent border (detector)
- **Location:** `src/components/dataset/DatasetsPage.tsx:292` — `border-l-4 border-l-accent`
- **Category:** Implementation Integrity
- **Impact:** Strong AI-slop tell on an otherwise tokenized card
- **Recommendation:** Drop the left accent bar; use spacing, typography, or a quieter accent (underline / icon)
- **Suggested command:** `/impeccable quieter` Datasets summary card

### [P2] Dense / sub-44px controls in order & settings chrome
- **Location:** `OrderTicket.tsx` (h-5 toggles, 10–11px labels), some settings `size="sm"` without `min-h-11` on desktop
- **Category:** Responsive / Accessibility
- **Impact:** Fine on desktop mouse; thumb use on phone is harder in nested ticket/settings
- **Recommendation:** Keep `min-h-11` on touch; ensure sheet mode never relies on 20px hit targets
- **Suggested command:** `/impeccable adapt` OrderTicket + drawing settings

### [P2] Analytics Dashboard is canvas-heavy UI
- **Location:** `src/components/analytics/AnalyticsDashboard.tsx` (+ `src/analytics/charts/`)
- **Category:** Performance / Accessibility
- **Impact:** Charts are canvas (not in `src/chart/` ignore). Good for FPS, but a11y/tooltips/keyboard are custom — re-audit when polishing Dashboard
- **Recommendation:** Treat as product Operate surface; don’t apply marketing craft rules; keep detector focused on surrounding DOM chrome
- **Suggested command:** `/impeccable audit` Dashboard (follow-up)

### [P2] Incumbent design authority split
- **Location:** `docs/DESIGN.md` (Hero tokens) vs missing root `DESIGN.md` for Impeccable
- **Category:** Implementation Integrity
- **Impact:** Init correctly left visual world alone; later commands may under-read the incumbent system
- **Recommendation:** `/impeccable document` when you want a root DESIGN.md that encodes Hero + Obsidian chrome without redesigning
- **Suggested command:** `/impeccable document`

### [P3] Marketing / brand SVG hard-coded stops
- **Location:** `BrandLogo.tsx`
- **Category:** Theming
- **Impact:** Low on app Operate surfaces; more relevant if landing and app brand must share one token path
- **Suggested command:** `/impeccable polish` landing only if marketing is in scope

## Patterns & Systemic Issues

- Token usage is the house style; hex leaks cluster in TV-parity chrome (orders, fib, template previews).
- Mobile 44px discipline is real on primary chrome, weaker inside dense trading panels.
- Canvas engines (`src/chart/`, analytics drawers) should stay out of design-detector / craft pressure.

## Positive Findings

- Hero UI components + semantic Tailwind tokens on shell/dashboard pages
- BottomBar replay/trades: meaningful `aria-*`, roles, and expand/collapse labels
- Safe-area and `min-h-11` patterns on sheets/modals
- Explicit product constraint: chart hot path ignored by Impeccable detector
- `PRODUCT.md` captures performance-as-product and Operate positioning

## Recommended Actions

1. **[P1] `/impeccable quieter`**: Datasets summary card — remove side-tab accent
2. **[P1] `/impeccable polish`**: OrderTicket / chrome hard-coded colors → tokens (skip canvas)
3. **[P2] `/impeccable adapt`**: Order ticket + settings hit targets on ~390px
4. **[P2] `/impeccable document`**: Capture incumbent Hero/Obsidian system for later commands
5. **[P2] `/impeccable audit`**: Re-run focused on Dashboard when iterating analytics UI
6. **[P3] `/impeccable polish`**: Final pass after the above

Detector command for CI: `npx impeccable detect --json .` (respects `.impeccable/config.json` ignores).
