import { useMemo, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { AppPageFrame } from '@/components/shell/AppPageFrame';
import { StrategyBuilderModal } from '@/components/strategy/StrategyBuilderModal';
import {
  deleteStrategy,
  listStrategies,
  type StrategyRecord,
} from '@/strategy/strategyStore';

interface StrategyPageProps {
  onGoBacktest?: () => void;
}

/**
 * Strategies bank + builder — Hero UI, persisted strategies (not mock community pool).
 */
export function StrategyPage({ onGoBacktest }: StrategyPageProps) {
  const [tick, setTick] = useState(0);
  const strategies = useMemo(() => listStrategies(), [tick]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [edit, setEdit] = useState<StrategyRecord | null>(null);

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
      description="Build visual strategies (General Info → Flow → Tags → Review). Saved in this browser."
      actions={
        <>
          {onGoBacktest && (
            <Button variant="ghost" className="min-h-11" onPress={onGoBacktest}>
              Backtest
            </Button>
          )}
          <Button variant="primary" className="min-h-11" onPress={openNew}>
            Build strategy
          </Button>
        </>
      }
    >
      {strategies.length === 0 ? (
        <Card className="bg-surface border border-border">
          <Card.Content className="px-6 py-12 text-center space-y-4">
            <p className="text-sm text-muted">No strategies yet. Open the builder to create one.</p>
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
                  {s.nodes?.length ?? 0} nodes · {s.edges?.length ?? 0} edges
                </p>
                <div className="flex flex-wrap gap-2">
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
        />
      )}
    </AppPageFrame>
  );
}
