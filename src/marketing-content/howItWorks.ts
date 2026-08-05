export const howItWorksCopy = {
  steps: [
    {
      num: "01",
      title: "Download bars",
      body: "Pull OHLC from Dukascopy (or the shared API) into a local dataset. Prefer 1m — higher TFs aggregate on the chart.",
    },
    {
      num: "02",
      title: "Open a session",
      body: "Pick pairs, date overlap, and start the chart. Pan, zoom, and replay without loading the full series into memory.",
    },
    {
      num: "03",
      title: "Backtest & trades",
      body: "Run the built-in SMA cross strategy, then review fills and equity under Trades.",
    },
  ],
} as const;
