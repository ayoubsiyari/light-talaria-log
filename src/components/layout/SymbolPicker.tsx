import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Popover } from '@heroui/react';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import {
  ChartSymbolBadge,
  normalizeSymForBadge,
} from '@/v9/chartSymbolBadge.jsx';
import type { PairSymbol } from '@/types/session';
import {
  classifySymbolAsset,
  formatPairDisplay,
  groupSymbolsByAsset,
  symbolSubtitle,
  type SymbolAssetClass,
} from '@/symbols/symbolCategory';

interface SymbolOption {
  pair: PairSymbol;
  /** Optional subtitle (e.g. dataset range). */
  hint?: string;
  /** Live role group — Trading vs Supporting (secondary). */
  role?: 'trading' | 'supporting';
}

interface SymbolPickerProps {
  /** Active pane's pair. */
  symbol: PairSymbol | string;
  /** Session legs available to switch between. */
  options: readonly SymbolOption[];
  onSymbolChange: (pair: PairSymbol) => void;
  disabled?: boolean;
}

function categoryTone(ac: SymbolAssetClass): string {
  if (ac === 'Futures') return 'var(--warn, #e0b040)';
  return 'var(--accent)';
}

/**
 * Obsidian symbol switcher — Forex / Futures categories + TV-style flags.
 */
export function SymbolPicker({
  symbol,
  options,
  onSymbolChange,
  disabled = false,
}: SymbolPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [compare, setCompare] = useState<string[]>([]);
  const [focusIdx, setFocusIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const label = String(symbol);
  const activeDisplay = formatPairDisplay(label);
  const activeAsset = classifySymbolAsset(label);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...options];
    return options.filter((o) => {
      const display = formatPairDisplay(o.pair).toLowerCase();
      const ac = classifySymbolAsset(o.pair).toLowerCase();
      return (
        o.pair.toLowerCase().includes(q) ||
        display.includes(q) ||
        ac.includes(q) ||
        (o.hint ?? '').toLowerCase().includes(q)
      );
    });
  }, [options, query]);

  const groups = useMemo(() => groupSymbolsByAsset(filtered), [filtered]);

  const flatRows = useMemo(
    () => groups.flatMap((g) => g.items),
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
    onSymbolChange(pair);
    setOpen(false);
    setQuery('');
  };

  const toggleCompare = (pair: string) => {
    setCompare((prev) =>
      prev.includes(pair) ? prev.filter((p) => p !== pair) : [...prev, pair],
    );
  };

  const triggerInner = (
    <>
      <span data-sym-badge="" className="inline-flex shrink-0">
        <ChartSymbolBadge
          sym={normalizeSymForBadge(label)}
          asset={activeAsset}
          w={22}
          h={14}
        />
      </span>
      <span
        className="truncate max-w-[5.5rem] sm:max-w-[11rem] text-[13px] font-bold tabular-nums leading-none"
        style={{ letterSpacing: '-0.01em' }}
      >
        {activeDisplay}
      </span>
      <span data-tb-chevron="" className="opacity-70 inline-flex items-center leading-none">
        <ChromeIcon n="chevDown" s={10} />
      </span>
    </>
  );

  if (options.length <= 1) {
    return (
      <div
        data-tb-item="symbol"
        data-tb-trigger="1"
        className="v8b-chrome-btn !font-bold min-w-0 shrink [@media(hover:none)]:min-h-11 gap-1.5"
        style={{
          background: 'var(--accent-quiet)',
          color: 'var(--accent)',
          borderRadius: 8,
        }}
      >
        {triggerInner}
      </div>
    );
  }

  return (
    <Popover
      isOpen={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <Popover.Trigger
        title="Change symbol"
        aria-label="Change symbol"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-disabled={disabled || undefined}
        data-tb-item="symbol"
        data-tb-trigger="1"
        data-open={open ? '1' : undefined}
        className={[
          'v8b-chrome-btn !font-bold min-w-0 shrink gap-1.5 [@media(hover:none)]:min-h-11',
          disabled ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
        style={{
          background: 'var(--accent-quiet)',
          color: 'var(--accent)',
          borderRadius: 8,
          boxShadow: open
            ? 'inset 0 0 0 1px color-mix(in oklab, var(--accent) 40%, var(--line))'
            : undefined,
        }}
      >
        {triggerInner}
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="p-0 z-[100]">
        <Popover.Dialog
          data-v9-chrome="1"
          data-sdrop="1"
          data-tb-drop="symbol"
          className="w-[min(20.5rem,calc(100vw-1.5rem))] max-h-[min(72dvh,460px)] overflow-hidden flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: 'none',
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
                pick(flatRows[focusIdx]!.pair);
              }
            }}
          >
            <div data-tb-drop-search="">
              <div data-menu-head="" style={{ padding: '10px 12px 4px' }}>
                Symbols
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
                  aria-label="Search symbol"
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
                {query ? (
                  <button
                    type="button"
                    data-brand-icon="1"
                    aria-label="Clear search"
                    className="min-h-8 min-w-8 inline-flex items-center justify-center"
                    onClick={() => setQuery('')}
                  >
                    <ChromeIcon n="x" s={12} cl="var(--text-faint)" />
                  </button>
                ) : null}
              </div>
            </div>

            <div
              id={listId}
              role="listbox"
              aria-label="Session symbols"
              className="tlr-scroll flex-1 min-h-0 overflow-y-auto"
              style={{ maxHeight: 340, padding: '0 0 6px' }}
            >
              {groups.map((group) => (
                <div
                  key={group.id}
                  data-sym-group={group.id.toLowerCase()}
                >
                  <div
                    data-sym-group-head=""
                    data-role={group.id.toLowerCase()}
                  >
                    <span
                      data-sym-group-label=""
                      style={{ color: categoryTone(group.id) }}
                    >
                      {group.label}
                    </span>
                    <em>{group.hint}</em>
                    <span data-sym-group-count="">{group.items.length}</span>
                  </div>
                  {group.items.map((opt) => {
                    const active = opt.pair === symbol;
                    const compared = !active && compare.includes(opt.pair);
                    const display = formatPairDisplay(opt.pair);
                    const asset = classifySymbolAsset(opt.pair);
                    const flatIndex = flatRows.findIndex(
                      (r) => r.pair === opt.pair,
                    );
                    const focused = flatIndex === focusIdx;
                    return (
                      <div
                        key={opt.pair}
                        id={`${listId}-${opt.pair}`}
                        role="option"
                        aria-selected={active}
                        data-menu-row=""
                        data-sym-row="1"
                        data-active={active ? '1' : undefined}
                        data-compared={compared ? '1' : undefined}
                        data-asset={asset.toLowerCase()}
                        data-focus={focused ? '1' : undefined}
                        className="min-h-11 sm:min-h-10"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 10px',
                          cursor: 'default',
                          outline: focused
                            ? '1px solid color-mix(in oklab, var(--accent) 55%, var(--line))'
                            : undefined,
                          outlineOffset: -1,
                          background: active
                            ? 'var(--accent-quiet)'
                            : compared
                              ? 'color-mix(in oklab, var(--down) 8%, transparent)'
                              : focused
                                ? 'var(--surface-raised)'
                                : undefined,
                          boxShadow: active
                            ? 'inset 2px 0 0 var(--accent)'
                            : undefined,
                        }}
                        onMouseEnter={() => setFocusIdx(flatIndex)}
                        onClick={(e) => {
                          if (
                            (e.target as HTMLElement).closest(
                              '[data-sym-compare]',
                            )
                          ) {
                            return;
                          }
                          pick(opt.pair);
                        }}
                      >
                        <span data-sym-badge="" className="inline-flex shrink-0">
                          <ChartSymbolBadge
                            sym={normalizeSymForBadge(opt.pair)}
                            asset={asset}
                            w={22}
                            h={14}
                          />
                        </span>
                        <div data-sym-meta="">
                          <strong>{display}</strong>
                          <em>
                            {compared
                              ? 'On chart · compare'
                              : active
                                ? `On this pane · ${asset}`
                                : opt.hint || symbolSubtitle(opt.pair)}
                          </em>
                        </div>
                        {active ? (
                          <span data-sym-chip="chart">Chart</span>
                        ) : (
                          <button
                            type="button"
                            data-sym-compare=""
                            data-on={compared ? '1' : undefined}
                            data-icon="1"
                            title={
                              compared
                                ? 'Remove compare (stub)'
                                : 'Add compare (stub)'
                            }
                            aria-label={
                              compared
                                ? `Remove ${opt.pair} from compare`
                                : `Add ${opt.pair} to compare`
                            }
                            className="min-h-11 min-w-11 sm:min-h-7 sm:min-w-7"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleCompare(opt.pair);
                            }}
                          >
                            <ChromeIcon
                              n={compared ? 'x' : 'plus'}
                              s={14}
                              cl="currentColor"
                            />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {filtered.length === 0 ? (
                <div data-sym-empty="" style={{ padding: '16px 14px' }}>
                  No symbols match “{query.trim()}”
                </div>
              ) : null}
            </div>

            {compare.length > 0 ? (
              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: 'var(--text-faint)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--down)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  Compare · {compare.length} overlay
                  {compare.length === 1 ? '' : 's'} (stub)
                </span>
                <button
                  type="button"
                  className="min-h-11 sm:min-h-7 px-2 text-[11px] font-bold text-[color:var(--text-muted)]"
                  onClick={() => setCompare([])}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
