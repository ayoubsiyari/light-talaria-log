export const faqCopy = {
  items: [
    {
      q: "Do you need my broker password?",
      a: "No. Read-only API keys or a CSV file. We never place orders.",
    },
    {
      q: "Which markets are supported?",
      a: "Futures, forex, equities, and major crypto pairs, on 1-minute through daily bars.",
    },
    {
      q: "Can I export everything?",
      a: "Yes. Full CSV and JSON export of trades, notes, and backtest runs, on every plan including free.",
    },
    {
      q: "Is the historical data included?",
      a: "Yes, up to 15 years depending on plan. No separate data subscription.",
    },
    {
      q: "Do I need to code?",
      a: "No. The rule builder is condition-based. An API is available if you want one.",
    },
    {
      q: "What happens after 100 free trades?",
      a: "Your data stays and stays exportable. You just can't add new trades until you upgrade.",
    },
  ],
} as const;
