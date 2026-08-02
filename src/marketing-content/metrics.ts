export const metricsCopy = {
  stats: [
    { value: "2.4M", label: "bars replayed daily", numeric: 2.4, decimals: 1, suffix: "M" },
    { value: "140+", label: "metrics per strategy", numeric: 140, decimals: 0, suffix: "+" },
    { value: "<40ms", label: "replay step latency", numeric: 40, decimals: 0, prefix: "<", suffix: "ms" },
    { value: "100%", label: "of your data, exportable", numeric: 100, decimals: 0, suffix: "%" },
  ],
} as const;
