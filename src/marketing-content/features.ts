export const featuresCopy = {
  h2: "Built for heavy history without freezing the tab.",
  cards: [
    {
      id: "replay",
      title: "Bar-by-bar replay",
      body: "Step through history with the right edge as the cursor. Viewport-only loads keep memory flat.",
      wide: true,
    },
    {
      id: "chart",
      title: "Fast canvas chart",
      body: "Custom Canvas 2D engine — pan, zoom, multi-pane, drawings — no third-party chart lib.",
      wide: false,
    },
    {
      id: "backtest",
      title: "Strategy backtest",
      body: "Run SMA cross off the main thread, then inspect trades and equity in Journal.",
      wide: false,
    },
    {
      id: "datasets",
      title: "Local datasets",
      body: "Download Dukascopy OHLC or import shared API datasets into IndexedDB.",
      wide: false,
    },
    {
      id: "journal",
      title: "Session journal",
      body: "Latest backtest result per session — trades, equity curve, stats. No OHLC reload.",
      wide: false,
    },
  ],
} as const;
