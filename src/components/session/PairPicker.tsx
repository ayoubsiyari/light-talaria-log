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
 * Compact create-session pair menu — Forex / Futures + small TV badges.
 * Portals above the session modal.
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
    const width = Math.min(Math.max(r.width, 240), 300, window.innerWidth - 16);
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - width);
    }
    const below = r.bottom + 4;
    const maxH = Math.min(320, window.innerHeight * 0.55);
    const spaceBelow = window.innerHeight - below - 8;
    const top =
      spaceBelow < 160 && r.top > spaceBelow
        ? Math.max(8, r.top - 4 - Math.min(maxH, r.top - 8))
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
            data-pair-picker=""
            role="dialog"
            aria-label="Select pair"
            className="fixed flex flex-col overflow-hidden"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 'min(55dvh, 320px)',
              zIndex: 100020,
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
            <div data-pp-search="">
              <ChromeIcon n="search" s={12} cl="var(--text-faint)" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search pairs"
                aria-controls={listId}
              />
            </div>

            <div
              id={listId}
              role="listbox"
              aria-label="Available pairs"
              className="tlr-scroll"
              data-pp-list=""
            >
              {groups.map((group) => (
                <div key={group.id} data-pp-group={group.id.toLowerCase()}>
                  <div data-pp-group-head="">
                    <span>{group.label}</span>
                    <span data-pp-count="">{group.items.length}</span>
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
                        aria-selected={focused}
                        data-pp-row=""
                        data-focus={focused ? '1' : undefined}
                        onMouseEnter={() => setFocusIdx(flatIndex)}
                        onClick={() => pick(pair)}
                      >
                        <span data-pp-flag="" aria-hidden>
                          <ChartSymbolBadge
                            sym={normalizeSymForBadge(pair)}
                            asset={asset}
                            w={16}
                            h={11}
                          />
                        </span>
                        <span data-pp-sym="">{display}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {filtered.length === 0 ? (
                <div data-pp-empty="">
                  {options.length === 0
                    ? 'No pairs available.'
                    : `No match for “${query.trim()}”`}
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
