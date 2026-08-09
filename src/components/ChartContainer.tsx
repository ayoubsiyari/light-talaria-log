import { memo, useRef } from 'react';
import { ChartNavControls } from '@/components/layout/ChartNavControls';
import { useChart, type UseChartOptions } from '@/hooks/useChart';

export type ChartContainerProps = UseChartOptions & {
  /** Engine is following the live / replay candle. */
  following?: boolean;
  /** Show » follow control (replay cursor present and camera detached). */
  showFollowControl?: boolean;
  /** Clear React camera-detached so follow can stick. */
  onReattachFollow?: () => void;
};

/**
 * Full-bleed chart host. Memoized so chrome re-renders do not detach the canvas.
 */
export const ChartContainer = memo(function ChartContainer({
  following = false,
  showFollowControl = false,
  onReattachFollow,
  ...chartOptions
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useChart(containerRef, {
    ...chartOptions,
    // Time-axis dbl-click / engine reset → same clear as the Follow / Reset buttons.
    onFollowReattach: onReattachFollow ?? chartOptions.onFollowReattach,
  });

  return (
    <div className="absolute inset-0 w-full h-full">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      <ChartNavControls
        instanceRef={instanceRef}
        following={following}
        showFollow={showFollowControl}
        onReattachFollow={onReattachFollow ?? (() => {})}
      />
    </div>
  );
});
