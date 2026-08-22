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
  type SymbolAssetClass,
} from '@/symbols/symbolCategory';
import type { PairSymbol } from '@/types/session';

type FilterTab = 'all' | SymbolAssetClass;

interface PairPickerProps {
  options: readonly PairSymbol[];
  disabled?: boolean;
  placeholder?: string;
  onPick: (pair: PairSymbol) => void;
}

/**
 * Create-session symbol menu — Obsidian Live grammar + Forex / Futures tabs.
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
  const [tab, setTab] = useState<FilterTab>('all');
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

  const counts = useMemo(() => {
    let forex = 0;
    let futures = 0;
    for (const p of options) {
      if (classifySymbolAsset(p) === 'Futures') futures += 1;
      else forex += 1;
    }
    return { forex, futures, all: options.length };
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((p) => {
      const asset = classifySymbolAsset(p);
      if (tab === 'Forex' && asset !== 'Forex') return false;
      if (tab === 'Futures' && asset !== 'Futures') return false;
      if (!q) return true;
      const display = formatPairDisplay(p).toLowerCase();
      return (
        p.toLowerCase().includes(q) ||
        display.includes(q) ||
        asset.toLowerCase().includes(q) ||
        symbolSubtitle(p).toLowerCase().includes(q)
      );
    });
  }, [options, query, tab]);

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
    const width = Math.min(360, Math.max(r.width, 320), window.innerWidth - 16);
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - 8 - width);
    }
    const below = r.bottom + 6;
    const maxH = Math.min(380, window.innerHeight * 0.62);
    const spaceBelow = window.innerHeight - below - 8;
    const top =
      spaceBelow < 200 && r.top > spaceBelow
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
    setFocusIdx(0);
  }, [tab, query]);

  useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(0, flatRows.length - 1)));
  }, [flatRows.length]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setTab('all');
  };

  const pick = (pair: PairSymbol) => {
    onPick(pair);
    close();
  };

  const tabs: { id: FilterTab; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: counts.all },
    { id: 'Forex', label: 'Forex', n: counts.forex },
    { id: 'Futures', label: 'Futures', n: counts.futures },
  ];

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            className="desk-overlay jd-pairs"
            data-pair-picker=""
            role="dialog"
            aria-label="Select pair"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 100020,
              maxHeight: 'min(62dvh, 380px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
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
            <div className="jd-pairs-head">
              <label className="jd-pairs-search">
                <ChromeIcon n="search" s={14} cl="currentColor" />
                <input
                  ref={searchRef}
                  className="jd-pairs-q"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pair…"
                  aria-label="Search pairs"
                  aria-controls={listId}
                />
              </label>
              <div className="jd-period jd-pairs-tabs" role="tablist" aria-label="Market">
                {tabs.map((t) =>
                  t.n === 0 && t.id !== 'all' ? null : (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      data-on={tab === t.id ? '1' : '0'}
                      onClick={() => setTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div
              id={listId}
              role="listbox"
              aria-label="Available pairs"
              className="tlr-scroll"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                maxHeight: 280,
                padding: '0 0 6px',
              }}
            >
              {groups.map((group) => (
                <div key={group.id} data-sym-group={group.id.toLowerCase()}>
                  {tab === 'all' ? (
                    <div className="jd-pairs-group" data-role={group.id.toLowerCase()}>
                      <div className="jd-pairs-group-top">
                        <span className="jd-pairs-group-name">{group.label}</span>
                        <span className="jd-pairs-group-n">{group.items.length}</span>
                      </div>
                      <p className="jd-pairs-group-hint">{group.hint}</p>
                    </div>
                  ) : null}
                  {group.items.map(({ pair }) => {
                    const display = formatPairDisplay(pair);
                    const asset = classifySymbolAsset(pair);
                    const sub = symbolSubtitle(pair);
                    const showSub =
                      sub.replace(/[\s/·]/g, '') !== display.replace(/[\s/·]/g, '');
                    const flatIndex = flatRows.indexOf(pair);
                    const focused = flatIndex === focusIdx;
                    return (
                      <div
                        key={pair}
                        id={`${listId}-${pair}`}
                        role="option"
                        aria-selected={focused}
                        className="jd-pairs-row"
                        data-menu-row=""
                        data-sym-row="1"
                        data-focus={focused ? '1' : undefined}
                        data-asset={asset.toLowerCase()}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setFocusIdx(flatIndex)}
                        onClick={() => pick(pair)}
                      >
                        <div className="jd-pairs-badge" data-sym-badge="">
                          <ChartSymbolBadge
                            sym={normalizeSymForBadge(pair)}
                            asset={asset}
                            w={22}
                            h={14}
                          />
                        </div>
                        <div className="jd-pairs-meta">
                          <strong>{display}</strong>
                          {showSub ? <span>{sub}</span> : null}
                        </div>
                        <span className="jd-pairs-kind" data-kind={asset.toLowerCase()}>
                          {asset === 'Futures' ? 'Futures' : 'Forex'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {filtered.length === 0 ? (
                <div data-sym-empty="" style={{ padding: '18px 14px' }}>
                  {options.length === 0
                    ? 'No pairs available from server datasets.'
                    : query
                      ? `No symbols match “${query.trim()}”`
                      : 'No symbols in this market.'}
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
        data-open={open ? '1' : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
      >
        <span data-pp-trigger-label="">{placeholder}</span>
        <ChromeIcon n="chevDown" s={11} cl="currentColor" />
      </button>
      {panel}
    </>
  );
}
