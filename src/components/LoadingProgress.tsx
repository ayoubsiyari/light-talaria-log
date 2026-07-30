import { ProgressBar } from '@heroui/react';
import type { ImportState } from '@/hooks/useCsvImport';

interface LoadingProgressProps {
  state: ImportState;
}

export function LoadingProgress({ state }: LoadingProgressProps) {
  if (state.status !== 'importing') return null;

  const value = Math.round(state.progress * 100);

  return (
    <div className="w-full max-w-md space-y-2">
      <p className="text-sm text-muted">
        Importing… {state.rowsParsed.toLocaleString()} rows ({value}%)
      </p>
      <ProgressBar aria-label="CSV import progress" value={value} minValue={0} maxValue={100}>
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
    </div>
  );
}
