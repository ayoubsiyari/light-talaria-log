import { useMemo, useState } from 'react';
import { Label } from '@heroui/react';
import '@/components/logbook/journalDash.css';
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
    <div className="desk-overlay desk-dim fixed inset-0 z-[100020] flex items-center justify-center p-2 sm:p-4">
      <div className="jd-dialog w-full max-w-[1100px] h-[min(90vh,820px)] flex flex-col overflow-hidden">
        <header className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--jd-line)' }}>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Puzzle pieces</p>
            <h2 className="text-lg font-semibold">Piece library</h2>
          </div>
          <p className="text-xs text-muted hidden sm:block ml-2">
            {PIECE_REGISTRY.length} pieces · descriptions + chart look
          </p>
          <button type="button" className="jd-btn jd-btn-ghost ml-auto" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[240px_1fr] lg:grid-cols-[240px_1fr_300px]">
          <aside className="min-h-0 flex flex-col border-b md:border-b-0 md:border-r" style={{ borderColor: 'var(--jd-line)' }}>
            <div className="p-2 space-y-2" style={{ borderBottom: '1px solid var(--jd-line)' }}>
              <input
                className="jd-field"
                placeholder="Search pieces…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="jd-period flex-wrap">
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
                    className="w-full text-left min-h-11 rounded-2xl px-2.5 py-2"
                    style={
                      selected === p.kind
                        ? { background: 'color-mix(in oklab, var(--jd-ink) 8%, transparent)' }
                        : undefined
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{p.label}</span>
                      {p.defaultRequiredTimeframe && (
                        <span className="text-xs font-bold uppercase shrink-0">
                          {p.defaultRequiredTimeframe}
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted truncate">
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

          <section className="min-h-0 overflow-y-auto p-4 space-y-4">
            {active && doc ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted font-semibold">
                    {active.category}
                    {' · '}
                    {getPieceConfidence(active.kind)}
                  </p>
                  <h3 className="text-xl font-semibold">{active.label}</h3>
                  <p className="text-sm text-muted">{active.description}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">How it works</Label>
                  <p className="text-sm leading-relaxed">{doc.howItWorks}</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">On the chart after Run</Label>
                  <p className="text-sm leading-relaxed">{doc.onChart}</p>
                </div>

                <PieceChartPreview visual={doc.visual} title="Chart look (preview)" />

                {onAddPiece && (
                  <button
                    type="button"
                    className="jd-btn jd-btn-ink w-full sm:w-auto"
                    onClick={() => {
                      onAddPiece(active.kind);
                      onClose();
                    }}
                  >
                    Add to puzzle
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Select a piece.</p>
            )}
          </section>

          <aside className="hidden lg:block min-h-0 overflow-y-auto p-4" style={{ borderLeft: '1px solid var(--jd-line)' }}>
            {doc && (
              <PieceChartPreview visual={doc.visual} title="Detection style" />
            )}
            <ul className="mt-4 space-y-2 text-xs text-muted leading-snug">
              <li>
                <span className="font-semibold">Diamond</span> — this piece
                turned true (rising edge).
              </li>
              <li>
                <span className="font-semibold">Up triangle</span> — strategy
                entry from your Entry board.
              </li>
              <li>
                <span className="font-semibold">Down triangle</span> — exit /
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
      data-on={active ? '1' : '0'}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
