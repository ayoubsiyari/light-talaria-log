import { useMemo, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { AppPageFrame } from '@/components/shell/AppPageFrame';
import { PieceLibraryModal } from '@/components/strategy/PieceLibraryModal';
import { StrategyBuilderModal } from '@/components/strategy/StrategyBuilderModal';
import {
  deleteStrategy,
  listStrategies,
  type StrategyRecord,
} from '@/strategy/strategyStore';
import type { Timeframe } from '@/types/ui';

interface StrategyPageProps {
  onGoBacktest?: () => void;
  onRunStrategy?: (strategyId: string) => void;
  chartReady?: boolean;
  chartTimeframe?: Timeframe | null;
}

/**
 * Strategies bank + puzzle builder — persisted strategies (not mock community pool).
 */
export function StrategyPage({
  onGoBacktest,
  onRunStrategy,
  chartReady,
  chartTimeframe,
}: StrategyPageProps) {
  const [tick, setTick] = useState(0);
  const strategies = useMemo(() => listStrategies(), [tick]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [edit, setEdit] = useState<StrategyRecord | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const openNew = () => {
    setEdit(null);
    setBuilderOpen(true);
  };
  const openEdit = (s: StrategyRecord) => {
    setEdit(s);
    setBuilderOpen(true);
  };

  return (
    <AppPageFrame
      eyebrow="App"
      title="Strategies"
      description="Build puzzle strategies from condition and logic pieces. Browse the piece library for how each detection looks on the chart."
      actions={
        <>
          {onGoBacktest && (
            <Button variant="ghost" className="min-h-11" onPress={onGoBacktest}>
              Backtest
            </Button>
          )}
          <Button
            variant="secondary"
            className="min-h-11"
            onPress={() => setLibraryOpen(true)}
          >
            Piece library
          </Button>
          <Button variant="primary" className="min-h-11" onPress={openNew}>
            Build strategy
          </Button>
        </>
      }
    >
      {strategies.length === 0 ? (
        <Card className="bg-surface border border-border">
          <Card.Content className="px-6 py-12 text-center space-y-4">
            <p className="text-sm text-muted">
              No strategies yet. Open the builder and snap pieces together.
            </p>
            <Button variant="primary" className="min-h-11" onPress={openNew}>
              Build strategy
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {strategies.map((s) => (
            <Card key={s.id} className="bg-surface border border-border">
              <Card.Content className="px-4 py-4 space-y-3">
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-xs text-muted line-clamp-2">
                    {s.desc || 'No description'}
                  </p>
                </div>
                <p className="text-[11px] text-muted">
                  {(s.markets || []).join(' · ') || '—'} ·{' '}
                  {(s.timeframes || []).join(', ') || '—'}
                </p>
                <p className="text-[11px] text-muted tabular-nums">
                  {s.nodes?.filter((n) => n.type === 'piece').length ?? 0} pieces ·{' '}
                  {s.edges?.length ?? 0} wires
                </p>
                <div className="flex flex-wrap gap-2">
                  {onRunStrategy && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="min-h-11"
                      onPress={() => onRunStrategy(s.id)}
                    >
                      Run on chart
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="min-h-11"
                    onPress={() => openEdit(s)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11 text-danger"
                    onPress={() => {
                      deleteStrategy(s.id);
                      setTick((n) => n + 1);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>
      )}

      {builderOpen && (
        <StrategyBuilderModal
          edit={edit}
          onClose={() => setBuilderOpen(false)}
          onSaved={() => {
            setTick((n) => n + 1);
            setBuilderOpen(false);
          }}
          onRunOnChart={onRunStrategy}
          chartReady={chartReady}
          chartTimeframe={chartTimeframe}
        />
      )}

      {libraryOpen && (
        <PieceLibraryModal onClose={() => setLibraryOpen(false)} />
      )}
    </AppPageFrame>
  );
}
