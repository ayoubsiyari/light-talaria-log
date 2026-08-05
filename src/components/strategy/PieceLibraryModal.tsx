import { useMemo, useState } from 'react';
import { Button, Label } from '@heroui/react';
import { PieceChartPreview } from '@/components/strategy/PieceChartPreview';
import { getPieceDoc } from '@/strategy/pieceDocs';
import { getPieceConfidence } from '@/strategy/pieceRegistry';
import {
  PIECE_CATEGORIES,
  PIECE_REGISTRY,
  type PieceDefinition,
} from '@/strategy/pieceRegistry';
import type { PieceCategory, PieceKind } from '@/strategy/graphTypes';

interface PieceLibraryModalProps {
  onClose: () => void;
  onAddPiece?: (kind: PieceKind) => void;
  initialKind?: PieceKind | null;
}

export function PieceLibraryModal({
  onClose,
  onAddPiece,
  initialKind = null,
}: PieceLibraryModalProps) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<PieceCategory | 'all'>('all');
  const [selected, setSelected] = useState<PieceKind | null>(
    initialKind ?? PIECE_REGISTRY[0]?.kind ?? null,
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return PIECE_REGISTRY.filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (!query) return true;
      const doc = getPieceDoc(p.kind);
      return (
        p.label.toLowerCase().includes(query) ||
        p.kind.includes(query) ||
        p.description.toLowerCase().includes(query) ||
        doc.howItWorks.toLowerCase().includes(query)
      );
    });
  }, [q, cat]);

  const active: PieceDefinition | null =
    PIECE_REGISTRY.find((p) => p.kind === selected) ?? filtered[0] ?? null;
  const doc = active ? getPieceDoc(active.kind) : null;

  return (
    <div className="fixed inset-0 z-[100020] flex items-center justify-center bg-background/80 p-2 sm:p-4">
      <div className="w-full max-w-[1100px] h-[min(90vh,820px)] flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        <header className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[color:var(--tv-panel-line)]">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Puzzle pieces</p>
            <h2 className="text-lg font-semibold">Piece library</h2>
          </div>
          <p className="text-xs text-muted hidden sm:block ml-2">
            {PIECE_REGISTRY.length} pieces · descriptions + chart look
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 sm:min-h-8 ml-auto"
            onPress={onClose}
          >
            Close
          </Button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[240px_1fr_300px]">
          {/* List */}
          <aside className="min-h-0 flex flex-col border-b md:border-b-0 md:border-r border-[color:var(--tv-panel-line)]">
            <div className="p-2 space-y-2 border-b border-[color:var(--tv-panel-line)]">
              <input
                className="w-full min-h-11 rounded-md border border-border bg-background px-3 text-sm"
                placeholder="Search pieces…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                <CatChip
                  active={cat === 'all'}
                  label="All"
                  onClick={() => setCat('all')}
                />
                {PIECE_CATEGORIES.map((c) => (
                  <CatChip
                    key={c.id}
                    active={cat === c.id}
                    label={c.label}
                    onClick={() => setCat(c.id)}
                  />
                ))}
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {filtered.map((p) => (
                <li key={p.kind}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.kind)}
                    className={[
                      'w-full text-left min-h-11 rounded-md px-2.5 py-2 border',
                      selected === p.kind
                        ? 'bg-accent/15 border-accent/40 text-foreground'
                        : 'border-transparent hover:bg-background text-muted hover:text-foreground',
                    ].join(' ')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{p.label}</span>
                      {p.defaultRequiredTimeframe && (
                        <span className="text-[9px] font-bold text-accent uppercase shrink-0">
                          {p.defaultRequiredTimeframe}
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] text-muted truncate">
                      {p.shortLabel} · {p.category} ·{' '}
                      {getPieceConfidence(p.kind)}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="text-xs text-muted px-2 py-4">No pieces match.</li>
              )}
            </ul>
          </aside>

          {/* Detail */}
          <section className="min-h-0 overflow-y-auto p-4 space-y-4">
            {active && doc ? (
              <>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">
                    {active.category}
                    {' · '}
                    {getPieceConfidence(active.kind)}
                  </p>
                  <h3 className="text-xl font-semibold">{active.label}</h3>
                  <p className="text-sm text-muted">{active.description}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">How it works</Label>
                  <p className="text-sm leading-relaxed text-foreground">{doc.howItWorks}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">On the chart after Run</Label>
                  <p className="text-sm leading-relaxed text-foreground">{doc.onChart}</p>
                </div>

                <PieceChartPreview visual={doc.visual} title="Chart look (preview)" />

                {onAddPiece && (
                  <Button
                    variant="primary"
                    className="min-h-11 w-full sm:w-auto"
                    onPress={() => {
                      onAddPiece(active.kind);
                      onClose();
                    }}
                  >
                    Add to puzzle
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Select a piece.</p>
            )}
          </section>

          {/* Sticky preview on large screens */}
          <aside className="hidden lg:block min-h-0 overflow-y-auto p-4 border-l border-[color:var(--tv-panel-line)] bg-background/40">
            {doc && (
              <PieceChartPreview visual={doc.visual} title="Detection style" />
            )}
            <ul className="mt-4 space-y-2 text-[11px] text-muted leading-snug">
              <li>
                <span className="text-accent font-semibold">Diamond</span> — this piece
                turned true (rising edge).
              </li>
              <li>
                <span className="text-success font-semibold">Up triangle</span> — strategy
                entry from your Entry board.
              </li>
              <li>
                <span className="text-danger font-semibold">Down triangle</span> — exit /
                short mark.
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CatChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'min-h-8 px-2 rounded-md text-[10px] border',
        active
          ? 'bg-accent/15 text-accent border-accent/40'
          : 'bg-background text-muted border-border',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
