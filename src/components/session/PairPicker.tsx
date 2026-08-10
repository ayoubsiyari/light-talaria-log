import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ChartSymbolBadge,
  normalizeSymForBadge,
} from '@/v9/chartSymbolBadge.jsx';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import {
  classifySymbolAsset,
  formatPairDisplay,
  groupSymbolsByAsset,
  symbolSubtitle,
} from '@/symbols/symbolCategory';
import type { PairSymbol } from '@/types/session';

interface PairPickerProps {
  options: readonly PairSymbol[];
  disabled?: boolean;
  placeholder?: string;
  onPick: (pair: PairSymbol) => void;
}

/**
 * Create-session pair add — Forex / Futures + TV badges.
 * Portals above the session modal (z-index > modal overlay).
 */
export function PairPicker({
  options,
  disabled = false,
  placeholder = 'Add pair…',
  onPick,
}: PairPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...options];
    return options.filter((p) => {
      const display = formatPairDisplay(p).toLowerCase();
      const ac = classifySymbolAsset(p).toLowerCase();
      return (
        p.toLowerCase().includes(q) ||
        display.includes(q) ||
        ac.includes(q) ||
        symbolSubtitle(p).toLowerCase().includes(q)
      );
    });
  }, [options, query]);

  const groups = useMemo(
    () => groupSymbolsByAsset(filtered.map((pair) => ({ pair }))),
    [filtered],
  );

  const flatRows = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => i.pair)),
    [groups],
  );

  const placePanel = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - width);
    }
    const below = r.bottom + 6;
    const maxH = Math.min(420, window.innerHeight * 0.7);
    const spaceBelow = window.innerHeight - below - 8;
    const top =
      spaceBelow < 180 && r.top > spaceBelow
        ? Math.max(8, r.top - 6 - Math.min(maxH, r.top - 8))
        : below;
    setPos({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    placePanel();
    setFocusIdx(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onReposition = () => placePanel();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('touchstart', onPointer);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(0, flatRows.length - 1)));
  }, [flatRows.length]);

  const pick = (pair: PairSymbol) => {
    onPick(pair);
    setOpen(false);
    setQuery('');
  };

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            data-v9-chrome="1"
            data-tb-drop="symbol"
            data-pair-picker=""
            role="dialog"
            aria-label="Select pair"
            className="fixed flex flex-col overflow-hidden"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 'min(70dvh, 420px)',
              zIndex: 100020,
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            }}
            onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusIdx((i) =>
                  Math.min(i + 1, Math.max(0, flatRows.length - 1)),
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && flatRows[focusIdx]) {
                e.preventDefault();
                pick(flatRows[focusIdx]!);
              }
            }}
          >
            <div data-tb-drop-search="">
              <div data-menu-head="" style={{ padding: '10px 12px 4px' }}>
                Pairs · Forex & Futures
              </div>
              <div
                data-win-search=""
                style={{ margin: '0 10px 10px', height: 36 }}
                onClick={() => searchRef.current?.focus()}
              >
                <ChromeIcon n="search" s={13} cl="var(--text-faint)" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Forex or Futures…"
                  aria-label="Search pairs"
                  aria-controls={listId}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text)',
                    fontSize: 13,
                    padding: 0,
                    minWidth: 0,
                  }}
                />
              </div>
            </div>

            <div
              id={listId}
              role="listbox"
              aria-label="Available pairs"
              className="tlr-scroll flex-1 min-h-0 overflow-y-auto"
              style={{ maxHeight: 300, padding: '0 0 6px' }}
            >
              {groups.map((group) => (
                <div key={group.id} data-sym-group={group.id.toLowerCase()}>
                  <div
                    data-sym-group-head=""
                    data-role={group.id.toLowerCase()}
                  >
                    <span data-sym-group-label="">{group.label}</span>
                    <em>{group.hint}</em>
                    <span data-sym-group-count="">{group.items.length}</span>
                  </div>
                  {group.items.map(({ pair }) => {
                    const display = formatPairDisplay(pair);
                    const asset = classifySymbolAsset(pair);
                    const flatIndex = flatRows.indexOf(pair);
                    const focused = flatIndex === focusIdx;
                    return (
                      <button
                        key={pair}
                        type="button"
                        id={`${listId}-${pair}`}
                        role="option"
                        data-menu-row=""
                        data-sym-row="1"
                        data-focus={focused ? '1' : undefined}
                        data-asset={asset.toLowerCase()}
                        className="w-full min-h-11 sm:min-h-10 text-left"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          background: focused
                            ? 'var(--accent-quiet)'
                            : undefined,
                          color: focused ? 'var(--accent)' : 'var(--text)',
                          outline: focused
                            ? '1px solid color-mix(in oklab, var(--accent) 55%, var(--line))'
                            : undefined,
                          outlineOffset: -1,
                        }}
                        onMouseEnter={() => setFocusIdx(flatIndex)}
                        onClick={() => pick(pair)}
                      >
                        <span
                          data-sym-badge=""
                          className="inline-flex shrink-0 items-center"
                        >
                          <ChartSymbolBadge
                            sym={normalizeSymForBadge(pair)}
                            asset={asset}
                            w={22}
                            h={14}
                          />
                        </span>
                        <span data-sym-meta="" className="min-w-0 flex-1">
                          <strong>{display}</strong>
                          <em>{symbolSubtitle(pair)}</em>
                        </span>
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide shrink-0"
                          style={{ color: 'var(--text-faint)' }}
                        >
                          {asset}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {filtered.length === 0 ? (
                <div data-sym-empty="" style={{ padding: '16px 14px' }}>
                  {options.length === 0
                    ? 'No pairs available from server datasets.'
                    : `No pairs match “${query.trim()}”`}
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        data-pair-picker-trigger=""
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={[
          'w-full min-h-11 sm:min-h-10 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-left outline-none',
          'focus-visible:border-accent',
          disabled ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        <span className="flex-1 min-w-0 truncate text-muted">{placeholder}</span>
        <ChromeIcon n="chevDown" s={12} cl="var(--text-muted)" />
      </button>
      {panel}
    </>
  );
}
