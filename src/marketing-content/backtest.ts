export const backtestCopy = {
  h2: "Prove it on ten years before you risk one.",
  tabs: [
    { key: "rules", label: "Rules" },
    { key: "replay", label: "Replay" },
    { key: "results", label: "Results" },
  ],
  rules: [
    { keyword: "IF", rest: " close > ema(20)", value: null },
    { keyword: "AND", rest: " rsi(14) ", value: "< 55" },
    { keyword: "AND", rest: " volume > sma(volume, 20)", value: null },
    { keyword: "THEN", rest: " enter long ", value: "1R risk" },
    { keyword: "EXIT", rest: " trail stop ", value: "1.5× ATR" },
  ],
  metrics: [
    { label: "Win rate", end: 54.2, suffix: "%", decimals: 1 },
    { label: "Profit factor", end: 1.71, suffix: "", decimals: 2 },
    { label: "Max drawdown", end: -8.4, suffix: "%", decimals: 1 },
    { label: "Expectancy", end: 0.42, suffix: "R", decimals: 2 },
    { label: "Sharpe", end: 1.38, suffix: "", decimals: 2 },
    { label: "Trades", end: 1842, suffix: "", decimals: 0 },
  ],
} as const;
