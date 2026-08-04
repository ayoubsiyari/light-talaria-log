import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import type { TradeStore } from '@/analytics/types';

const ROW_H = 36;
const OVERSCAN = 8;

interface Props {
  store: TradeStore;
  indices: Uint32Array;
  onRowClick?: (tradeIndex: number) => void;
  /** Highlight + scroll this store index into view. */
  focusIndex?: number | null;
}

/**
 * Virtualized trade list — fixed row height, index sort only (§5).
 * Scroll position is rAF-throttled (≤1 React commit per frame).
 */
export function TradeListVirtual({
  store,
  indices,
  onRowClick,
  focusIndex = null,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const rafRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(280);
  const [sortKey, setSortKey] = useState<'time' | 'pnl'>('time');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight || 280);
    });
    ro.observe(el);
    setViewportH(el.clientHeight || 280);
    return () => ro.disconnect();
  }, []);

  const sorted = useMemo(() => {
    const idx = Uint32Array.from(indices);
    idx.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'time') cmp = store.closeTime[a]! - store.closeTime[b]!;
      else cmp = store.netPnl[a]! - store.netPnl[b]!;
      return cmp * sortDir;
    });
    return idx;
  }, [indices, store, sortKey, sortDir]);

  // Scroll focused trade into view when it changes.
  useEffect(() => {
    if (focusIndex == null || !scroller.current) return;
    let row = -1;
    for (let r = 0; r < sorted.length; r++) {
      if (sorted[r] === focusIndex) {
        row = r;
        break;
      }
    }
    if (row < 0) return;
    const top = row * ROW_H;
    const el = scroller.current;
    const viewTop = el.scrollTop;
    const viewBot = viewTop + el.clientHeight;
    if (top < viewTop || top + ROW_H > viewBot) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 3);
      scrollTopRef.current = el.scrollTop;
      setScrollTop(el.scrollTop);
    }
  }, [focusIndex, sorted]);

  const total = sorted.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visible = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
  const end = Math.min(total, start + visible);

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    scrollTopRef.current = e.currentTarget.scrollTop;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setScrollTop(scrollTopRef.current);
    });
  };

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const toggle = (key: 'time' | 'pnl') => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 border border-border rounded-lg overflow-hidden">
      <div className="flex text-[10px] uppercase text-muted border-b border-border bg-surface px-2 min-h-11 items-center gap-2">
        <button type="button" className="min-h-11 px-2" onClick={() => toggle('time')}>
          Time {sortKey === 'time' ? (sortDir > 0 ? '↑' : '↓') : ''}
        </button>
        <span className="flex-1">Symbol</span>
        <button type="button" className="min-h-11 px-2" onClick={() => toggle('pnl')}>
          P&L {sortKey === 'pnl' ? (sortDir > 0 ? '↑' : '↓') : ''}
        </button>
      </div>
      <div
        ref={scroller}
        className="relative overflow-y-auto flex-1 min-h-[200px] max-h-[min(60vh,520px)]"
        onScroll={onScroll}
      >
        <div style={{ height: total * ROW_H, position: 'relative' }}>
          {Array.from({ length: Math.max(0, end - start) }, (_, k) => {
            const row = start + k;
            const i = sorted[row]!;
            const pnl = store.netPnl[i]!;
            const focused = focusIndex === i;
            return (
              <div
                key={store.ids[i]}
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={[
                  'absolute left-0 right-0 flex items-center gap-2 px-2 text-[12px] font-mono border-b border-border/30 min-h-11',
                  focused ? 'bg-accent/20 ring-1 ring-inset ring-accent/50' : 'hover:bg-surface-secondary/60',
                ].join(' ')}
                style={{
                  height: ROW_H,
                  transform: `translateY(${row * ROW_H}px)`,
                }}
                onClick={() => onRowClick?.(i)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') onRowClick?.(i);
                }}
              >
                <span className="text-muted w-28 shrink-0 tabular-nums">
                  {new Date(store.closeTime[i]! * 1000).toISOString().slice(0, 16)}
                </span>
                <span className="flex-1 truncate">
                  {store.symbols[store.symbolId[i]!] ?? '?'}{' '}
                  <span className="text-muted">
                    {store.side[i] === 1 ? 'S' : 'L'}
                  </span>
                </span>
                <span
                  className={[
                    'tabular-nums',
                    pnl > 0 ? 'text-success' : pnl < 0 ? 'text-danger' : '',
                  ].join(' ')}
                >
                  {pnl.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
