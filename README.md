# Talaria-Log

High-performance custom candlestick chart engine — low CPU/memory, Hero UI design.

## Docs

- **[PROJECT.md](./PROJECT.md)** — Master plan, step-by-step checklist, benchmarks
- **[docs/DESIGN.md](./docs/DESIGN.md)** — Hero UI tokens & chart colors
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Technical architecture

## Quick start

```bash
cd ~/Projects/fast-chart
npm install
npm run dev
```

## Structure

```
fast-chart/
├── PROJECT.md                 # Plan + checklist (update as you go)
├── docs/
│   ├── DESIGN.md              # Hero UI design system
│   └── ARCHITECTURE.md        # Data flow & modules
├── .cursor/rules/             # AI guardrails (do not weaken)
├── public/
│   └── sample.csv
└── src/
    ├── chart/                 # Custom Canvas 2D engine + Hero UI theme
    ├── data/                  # Worker, IndexedDB, binary bars
    ├── components/            # Hero UI React components
    ├── hooks/                 # useChart, useCsvImport
    ├── utils/                 # constants, debounce
    └── types/                 # Shared TypeScript types
```

## Current phase

**Phase 1** — Custom Canvas chart with fake data (see PROJECT.md)
