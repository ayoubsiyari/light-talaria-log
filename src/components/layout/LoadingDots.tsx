/**
 * TradingView-style “…” pulse — compact in the legend, larger on the pane veil.
 */
export function LoadingDots({
  label = 'Loading chart data',
  size = 'legend',
}: {
  label?: string;
  size?: 'legend' | 'overlay';
}) {
  const overlay = size === 'overlay';
  return (
    <span
      className={
        overlay
          ? 'inline-flex items-center gap-1.5'
          : 'legend-loading-dots inline-flex items-center gap-[3px] ml-0.5 translate-y-px'
      }
      aria-label={label}
      role="status"
    >
      {(overlay
        ? (['pane-loading-dot', 'pane-loading-dot', 'pane-loading-dot'] as const)
        : (['legend-loading-dot', 'legend-loading-dot', 'legend-loading-dot'] as const)
      ).map((cls, i) => (
        <span
          key={i}
          className={cls}
          style={
            overlay
              ? {
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background:
                    'color-mix(in oklab, var(--foreground) 78%, transparent)',
                  animation: 'legend-dot-pulse 1.05s ease-in-out infinite',
                  animationDelay: `${i * 0.16}s`,
                }
              : undefined
          }
        />
      ))}
    </span>
  );
}
