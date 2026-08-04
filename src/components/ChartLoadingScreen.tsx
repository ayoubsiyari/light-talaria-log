import { Button, ProgressBar } from '@heroui/react';
import { BrandLogo } from '@/components/landing/BrandLogo';

interface ChartLoadingScreenProps {
  /** 0–1 progress; indeterminate uses a soft pulse when null/undefined and not error. */
  progress?: number | null;
  error?: string | null;
  onBack?: () => void;
}

/**
 * Full-viewport chart open loader: big brand mark + bar + percent only.
 */
export function ChartLoadingScreen({
  progress = 0,
  error = null,
  onBack,
}: ChartLoadingScreenProps) {
  const pct = Math.max(
    0,
    Math.min(100, Math.round((Number.isFinite(progress) ? Number(progress) : 0) * 100)),
  );

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center gap-8 px-6">
      <BrandLogo size={112} variant="raster" className="w-28 h-28 sm:w-32 sm:h-32" />

      {error ? (
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
          {onBack && (
            <Button variant="secondary" className="min-h-11" onPress={onBack}>
              Back to backtest
            </Button>
          )}
        </div>
      ) : (
        <div className="w-full max-w-xs space-y-3">
          <ProgressBar
            aria-label="Loading chart"
            value={pct}
            minValue={0}
            maxValue={100}
          >
            <ProgressBar.Track className="h-1.5 rounded-full bg-surface border border-border overflow-hidden">
              <ProgressBar.Fill className="bg-accent" />
            </ProgressBar.Track>
          </ProgressBar>
          <p className="text-center text-sm font-semibold tabular-nums text-foreground">
            {pct}%
          </p>
        </div>
      )}
    </div>
  );
}
