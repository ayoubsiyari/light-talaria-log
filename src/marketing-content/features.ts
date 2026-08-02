export const featuresCopy = {
  h2: "Everything a spreadsheet promised and never delivered.",
  cards: [
    {
      id: "replay",
      title: "Bar-by-bar replay",
      body: "Step through history one candle at a time with the right edge hidden. No hindsight, no cheating.",
      wide: true,
    },
    {
      id: "rules",
      title: "Rule builder",
      body: "Define entries, exits, and risk in plain conditions. No Python required.",
      wide: false,
    },
    {
      id: "metrics",
      title: "Metrics that matter",
      body: "Expectancy, profit factor, max drawdown, R-multiple distribution.",
      wide: false,
    },
    {
      id: "tags",
      title: "Tag anything",
      body: "Setup, session, emotion, mistake. Then filter your P&L by any of it.",
      wide: false,
    },
    {
      id: "screenshot",
      title: "Screenshot on entry",
      body: "Paste a chart to a trade. It stays attached forever.",
      wide: false,
    },
  ],
} as const;
