import { useMemo, useState } from 'react';
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

/**
 * Obsidian symbol drop — data-tb-drop="symbol" (search, groups, compare stubs).
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
  const label = String(symbol);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.pair.toLowerCase().includes(q) ||
        (o.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  const trading = filtered.filter((o) => (o.role ?? 'trading') === 'trading');
  const supporting = filtered.filter((o) => o.role === 'supporting');
  // If no roles set, show all under Trading
  const tradingRows = supporting.length === 0 && trading.length === 0
    ? filtered
    : trading.length > 0
      ? trading
      : filtered.filter((o) => o.role !== 'supporting');

  const toggleCompare = (pair: string) => {
    setCompare((prev) =>
      prev.includes(pair) ? prev.filter((p) => p !== pair) : [...prev, pair],
    );
  };

  if (options.length <= 1) {
    return (
      <div className="v8b-chrome-btn !font-bold min-w-0 shrink [@media(hover:none)]:min-h-11">
        <span
          data-sym-badge=""
          className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded text-[10px] font-extrabold bg-[color:var(--accent-quiet)] text-[color:var(--accent)]"
        >
          {label.slice(0, 3)}
        </span>
        <span className="truncate max-w-[5.5rem] sm:max-w-[10rem]">{label}</span>
      </div>
    );
  }

  const renderGroup = (title: string, rows: readonly SymbolOption[]) => {
    if (rows.length === 0) return null;
    return (
      <div data-sym-group="" key={title}>
        <div
          data-sym-group-label=""
          className="px-2.5 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]"
        >
          {title}
        </div>
        {rows.map((opt) => {
          const active = opt.pair === symbol;
          const inCompare = compare.includes(opt.pair);
          return (
            <div
              key={opt.pair}
              data-menu-row=""
              data-active={active ? '1' : undefined}
              className="flex items-center gap-1 px-1 min-h-11 sm:min-h-9"
            >
              <button
                type="button"
                className="flex-1 flex items-center gap-2 min-h-11 sm:min-h-8 px-1.5 text-left text-[13px] rounded-md"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text)',
                  background: active ? 'var(--accent-quiet)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                }}
                onClick={() => {
                  onSymbolChange(opt.pair);
                  setOpen(false);
                }}
              >
                <span
                  data-sym-badge=""
                  className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded text-[9px] font-extrabold shrink-0"
                  style={{
                    background: 'var(--surface-sunken)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {opt.pair.slice(0, 3)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{opt.pair}</span>
                  {opt.hint ? (
                    <span className="block truncate text-[10px] text-[color:var(--text-faint)]">
                      {opt.hint}
                    </span>
                  ) : null}
                </span>
                {active ? (
                  <span
                    data-sym-chip=""
                    className="text-[9px] font-bold shrink-0 text-[color:var(--accent)]"
                  >
                    Chart
                  </span>
                ) : (
                  <span
                    data-sym-chip=""
                    className="text-[9px] font-bold shrink-0 text-[color:var(--text-faint)]"
                  >
                    View
                  </span>
                )}
              </button>
              <button
                type="button"
                data-sym-compare=""
                data-on={inCompare ? '1' : undefined}
                title={inCompare ? 'Remove compare' : 'Add compare (stub)'}
                aria-label={inCompare ? `Remove ${opt.pair} compare` : `Compare ${opt.pair}`}
                className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center rounded-md text-[color:var(--text-muted)]"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCompare(opt.pair);
                }}
              >
                <ChromeIcon n={inCompare ? 'x' : 'plus'} s={12} />
              </button>
            </div>
          );
        })}
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
        aria-disabled={disabled || undefined}
        data-tb-item="symbol"
        className={[
          'v8b-chrome-btn !font-bold min-w-0 shrink [@media(hover:none)]:min-h-11',
          disabled ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
      >
        <span
          data-sym-badge=""
          className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded text-[10px] font-extrabold bg-[color:var(--accent-quiet)] text-[color:var(--accent)]"
        >
          {label.slice(0, 3)}
        </span>
        <span className="truncate max-w-[5.5rem] sm:max-w-[12rem]">{label}</span>
        <ChromeIcon n="chevDown" s={10} />
      </Popover.Trigger>
      <Popover.Content placement="bottom start" className="p-0 z-[100]">
        <Popover.Dialog
          data-v9-chrome="1"
          data-sdrop="1"
          data-tb-drop="symbol"
          className="w-[min(18rem,calc(100vw-1.5rem))] max-h-[min(70dvh,420px)] overflow-hidden flex flex-col bg-[color:var(--surface)] border border-[color:var(--line)] rounded-[var(--radius-panel,8px)] shadow-none"
        >
          <div className="px-2 pt-2 pb-1.5 shrink-0">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbol"
              aria-label="Search symbol"
              className="w-full h-9 min-h-11 sm:min-h-9 px-2.5 rounded-md text-[13px] outline-none border border-[color:var(--line)] bg-[color:var(--surface-sunken)] text-[color:var(--text)]"
            />
          </div>
          <div className="tlr-scroll flex-1 min-h-0 overflow-y-auto pb-1">
            {renderGroup('Trading', tradingRows)}
            {renderGroup('Supporting', supporting)}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-[12px] text-[color:var(--text-muted)]">
                No symbols match
              </p>
            ) : null}
          </div>
          {compare.length > 0 ? (
            <p className="px-2.5 py-1.5 text-[10px] text-[color:var(--text-faint)] border-t border-[color:var(--line)]">
              Compare ({compare.length}) — stub until multi-series wire-up
            </p>
          ) : (
            <p className="px-2.5 py-1.5 text-[10px] text-[color:var(--text-muted)] border-t border-[color:var(--line)]">
              Switches the selected chart pane
            </p>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
