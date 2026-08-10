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
import type { PairSymbol } from '@/types/session';

interface SymbolOption {
  pair: PairSymbol;
  /** Optional subtitle (e.g. dataset range). */
  hint?: string;
  /** Live role group — Trading vs Supporting. */
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

function pairParts(pair: string): { base: string; quote: string; display: string } {
  const raw = pair.trim();
  if (raw.includes('/')) {
    const [base = raw, quote = ''] = raw.split('/');
    return { base, quote, display: raw };
  }
  if (raw.length >= 6) {
    return {
      base: raw.slice(0, 3),
      quote: raw.slice(3, 6),
      display: `${raw.slice(0, 3)}/${raw.slice(3, 6)}`,
    };
  }
  return { base: raw.slice(0, 3) || raw, quote: '', display: raw };
}

function SymbolBadge({
  pair,
  active,
  supporting,
}: {
  pair: string;
  active?: boolean;
  supporting?: boolean;
}) {
  const { base } = pairParts(pair);
  return (
    <span
      data-sym-badge=""
      aria-hidden
      style={{
        borderRadius: 5,
        border: `1px solid ${
          active
            ? supporting
              ? 'color-mix(in oklab, var(--support, #c9a227) 45%, var(--line))'
              : 'color-mix(in oklab, var(--accent) 45%, var(--line))'
            : 'var(--line)'
        }`,
        background: active
          ? supporting
            ? 'color-mix(in oklab, var(--support, #c9a227) 16%, transparent)'
            : 'var(--accent-quiet)'
          : 'var(--surface-sunken)',
        color: active
          ? supporting
            ? 'var(--support, #c9a227)'
            : 'var(--accent)'
          : 'var(--text-muted)',
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '0.04em',
      }}
    >
      {base.slice(0, 3).toUpperCase()}
    </span>
  );
}

/**
 * Obsidian symbol switcher — Live data-tb-drop="symbol" grammar, elevated craft.
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
  const activeParts = pairParts(label);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const p = pairParts(o.pair);
      return (
        o.pair.toLowerCase().includes(q) ||
        p.display.toLowerCase().includes(q) ||
        p.base.toLowerCase().includes(q) ||
        p.quote.toLowerCase().includes(q) ||
        (o.hint ?? '').toLowerCase().includes(q)
      );
    });
  }, [options, query]);

  const trading = filtered.filter((o) => (o.role ?? 'trading') === 'trading');
  const supporting = filtered.filter((o) => o.role === 'supporting');
  const tradingRows =
    supporting.length === 0 && trading.length === 0
      ? filtered
      : trading.length > 0
        ? trading
        : filtered.filter((o) => o.role !== 'supporting');

  const flatRows = useMemo(
    () => [
      ...tradingRows.map((o) => ({ ...o, role: (o.role ?? 'trading') as 'trading' | 'supporting' })),
      ...supporting.map((o) => ({ ...o, role: 'supporting' as const })),
    ],
    [tradingRows, supporting],
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
      <SymbolBadge pair={label} active />
      <span
        className="truncate max-w-[5.5rem] sm:max-w-[11rem] text-[13px] font-bold tabular-nums"
        style={{ letterSpacing: '-0.01em' }}
      >
        {activeParts.display}
      </span>
      <span data-tb-chevron="" className="opacity-70 inline-flex">
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

  const renderGroup = (
    role: 'trading' | 'supporting',
    title: string,
    hint: string,
    rows: readonly SymbolOption[],
  ) => {
    if (rows.length === 0 && filtered.length > 0 && role === 'supporting') return null;
    if (rows.length === 0 && role === 'trading' && supporting.length > 0) return null;
    return (
      <div data-sym-group={role} key={role}>
        <div data-sym-group-head="" data-role={role}>
          <span data-sym-group-label="">{title}</span>
          <em>{hint}</em>
          <span data-sym-group-count="">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <div data-sym-empty="">
            {role === 'supporting'
              ? 'No supporting symbols in this session.'
              : 'No trading symbols match.'}
          </div>
        ) : (
          rows.map((opt) => {
            const active = opt.pair === symbol;
            const compared = !active && compare.includes(opt.pair);
            const supportingRow = role === 'supporting';
            const parts = pairParts(opt.pair);
            const flatIndex = flatRows.findIndex((r) => r.pair === opt.pair);
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
                data-supporting={supportingRow ? '1' : undefined}
                data-compared={compared ? '1' : undefined}
                data-focus={focused ? '1' : undefined}
                className="min-h-11 sm:min-h-10"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'default',
                  outline: focused
                    ? '1px solid color-mix(in oklab, var(--accent) 55%, var(--line))'
                    : undefined,
                  outlineOffset: -1,
                  background: active
                    ? supportingRow
                      ? 'color-mix(in oklab, var(--support, #c9a227) 12%, transparent)'
                      : 'var(--accent-quiet)'
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
                  if ((e.target as HTMLElement).closest('[data-sym-compare]')) return;
                  pick(opt.pair);
                }}
              >
                <SymbolBadge
                  pair={opt.pair}
                  active={active}
                  supporting={supportingRow}
                />
                <div data-sym-meta="">
                  <strong>{parts.display}</strong>
                  <em>
                    {compared
                      ? 'On chart · compare'
                      : supportingRow
                        ? active
                          ? 'Supporting · on chart'
                          : opt.hint || 'Supporting'
                        : active
                          ? 'On this pane'
                          : opt.hint || (parts.quote ? `${parts.base} · ${parts.quote}` : 'Session symbol')}
                  </em>
                </div>
                {active ? (
                  <span data-sym-chip={supportingRow ? 'support' : 'chart'}>
                    {supportingRow ? 'View' : 'Chart'}
                  </span>
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
                    <ChromeIcon n={compared ? 'x' : 'plus'} s={14} cl="currentColor" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    );
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
          className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[min(72dvh,440px)] overflow-hidden flex flex-col"
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
                placeholder="Search symbol…"
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
            style={{ maxHeight: 320, padding: '0 0 6px' }}
          >
            {renderGroup(
              'trading',
              'Trading',
              'Switch the active pane',
              tradingRows,
            )}
            {renderGroup(
              'supporting',
              'Supporting',
              'Context legs',
              supporting,
            )}
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
