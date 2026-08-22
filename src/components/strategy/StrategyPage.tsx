import { useMemo, useRef, useState } from 'react';
import { toast } from '@heroui/react';
import { DeskMore } from '@/components/desk/DeskFrame';
import { AppPageFrame } from '@/components/shell/AppPageFrame';
import { PieceLibraryModal } from '@/components/strategy/PieceLibraryModal';
import { StrategyBuilderModal } from '@/components/strategy/StrategyBuilderModal';
import {
  deleteStrategy,
  exportStrategiesJson,
  importStrategiesJson,
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
  const fileRef = useRef<HTMLInputElement>(null);

  const openNew = () => {
    setEdit(null);
    setBuilderOpen(true);
  };
  const openEdit = (s: StrategyRecord) => {
    setEdit(s);
    setBuilderOpen(true);
  };

  const downloadExport = (ids?: string[]) => {
    const json = exportStrategiesJson(ids);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ids?.length === 1 ? 'talaria-strategy.json' : 'talaria-strategies.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.info('Exported template', { timeout: 3000 });
  };

  const onImportFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const res = importStrategiesJson(text);
    if (res.error) {
      toast.info('Import failed', { description: res.error, timeout: 5000 });
      return;
    }
    setTick((n) => n + 1);
    toast.info('Import done', {
      description: `${res.imported} imported${res.skipped ? ` · ${res.skipped} skipped` : ''}`,
      timeout: 4500,
    });
  };

  return (
    <AppPageFrame
      title="Strategies"
      description="Build puzzle strategies from condition and logic pieces. Browse the piece library for how each detection looks on the chart."
      actions={
        <>
          <button type="button" className="jd-btn jd-btn-ghost" onClick={() => setLibraryOpen(true)}>
            Piece library
          </button>
          <button type="button" className="jd-btn jd-btn-ink" onClick={openNew}>
            Build strategy
          </button>
          <DeskMore>
            {onGoBacktest && (
              <button type="button" onClick={onGoBacktest}>
                Sessions
              </button>
            )}
            <button
              type="button"
              disabled={strategies.length === 0}
              onClick={() => downloadExport()}
            >
              Export all
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              Import
            </button>
          </DeskMore>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onImportFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </>
      }
    >
      {strategies.length === 0 ? (
        <section className="jd-card" style={{ textAlign: 'center' }}>
          <p className="jd-muted">No strategies yet. Open the builder and snap pieces together.</p>
          <button type="button" className="jd-btn jd-btn-ink" style={{ marginTop: 16 }} onClick={openNew}>
            Build strategy
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {strategies.map((s) => (
            <article key={s.id} className="jd-card jd-stack">
              <div>
                <h2 className="truncate">{s.name}</h2>
                <p className="jd-muted" style={{ marginTop: 4 }}>{s.desc || 'No description'}</p>
              </div>
              <p className="jd-muted">
                {(s.markets || []).join(' · ') || '—'} · {(s.timeframes || []).join(', ') || '—'}
              </p>
              <p className="jd-muted tabular-nums">
                {s.nodes?.filter((n) => n.type === 'piece').length ?? 0} pieces · {s.edges?.length ?? 0} wires
              </p>
              <div className="flex flex-wrap gap-2">
                {onRunStrategy && (
                  <button type="button" className="jd-btn jd-btn-ink" onClick={() => onRunStrategy(s.id)}>
                    Run on chart
                  </button>
                )}
                <button type="button" className="jd-btn jd-btn-ghost" onClick={() => openEdit(s)}>
                  Edit
                </button>
                <button type="button" className="jd-btn jd-btn-ghost" onClick={() => downloadExport([s.id])}>
                  Export
                </button>
                <button
                  type="button"
                  className="jd-btn jd-btn-ghost"
                  onClick={() => {
                    if (!window.confirm(`Delete “${s.name}”? This cannot be undone.`)) return;
                    deleteStrategy(s.id);
                    setTick((n) => n + 1);
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
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
