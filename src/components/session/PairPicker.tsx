import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Popover } from '@heroui/react';
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
 * Create-session pair add control — Forex / Futures groups + TV-style badges.
 * Native &lt;select&gt; cannot render flags; this popover list can.
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

  useEffect(() => {
    if (!open) return;
    setFocusIdx(0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(0, flatRows.length - 1)));
  }, [flatRows.length]);

  const pick = (pair: PairSymbol) => {
    onPick(pair);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      isOpen={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <Popover.Trigger
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-disabled={disabled || undefined}
        data-pair-picker-trigger=""
        className={[
          'w-full min-h-11 sm:min-h-10 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-left outline-none',
          'focus-visible:border-accent',
          disabled ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
      >
        <span className="flex-1 min-w-0 truncate text-muted">{placeholder}</span>
        <ChromeIcon n="chevDown" s={12} cl="var(--text-muted)" />
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="p-0 z-[120]">
        <Popover.Dialog
          data-v9-chrome="1"
          data-tb-drop="symbol"
          data-pair-picker=""
          className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(70dvh,420px)] overflow-hidden flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 8,
          }}
        >
          <div
            className="flex flex-col min-h-0 flex-1 overflow-hidden"
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
                Pairs
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
                  No pairs match “{query.trim()}”
                </div>
              ) : null}
            </div>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
