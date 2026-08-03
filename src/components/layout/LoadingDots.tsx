/**
 * Compact “…” pulse next to the chart symbol while TF / ticker data loads.
 */
export function LoadingDots({ label = 'Loading chart data' }: { label?: string }) {
  return (
    <span
      className="legend-loading-dots inline-flex items-center gap-[3px] ml-0.5 translate-y-px"
      aria-label={label}
      role="status"
    >
      <span className="legend-loading-dot" />
      <span className="legend-loading-dot" />
      <span className="legend-loading-dot" />
    </span>
  );
}
