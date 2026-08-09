import { useEffect, useMemo, useState } from 'react';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import type { InstrumentSpec } from '@/orders/instrumentSpec';
import type { OrderJournal } from '@/orders/journal';
import { unrealizedPnL } from '@/orders/pnl';
import type { Order, OrderEngineState, Position } from '@/orders/orderTypes';
import { getOrderJournalView, type OrderTrade } from '@/orders/tradeJournal';
import type { BottomTabId } from '@/types/ui';

interface TradeDockProps {
  activeTab: BottomTabId;
  state: OrderEngineState | null;
  spec: InstrumentSpec | null;
  bid: number;
  ask: number;
  /**
   * Per-symbol mark + spec for multi-pair books. Without this, every open row
   * uses the active pane's bid (EUR 1.15 on a USD/JPY position → million $ P&L).
   */
  resolveMark?: (symbol: string) => { bid: number; ask: number } | null;
  resolveSpec?: (symbol: string) => InstrumentSpec | null;
  /** Replay cursor — open-row duration must not use wall clock. */
  cursorTime?: number;
  sessionId?: string | null;
  liveJournal?: OrderJournal | null;
  onCancel: (orderId: string) => void;
  onSelectPosition?: (positionId: string) => void;
  onClosePosition?: (positionId: string) => void;
}

type RowStatus = 'open' | 'pending' | 'closed';

type DockRow = {
  id: string;
  displayId: string;
  time: string;
  timeSec: number;
  sym: string;
  side: 'LONG' | 'SHORT';
  status: RowStatus;
  size: number;
  type: string;
  entry: string;
  exit: string;
  pnl: string;
  pnlColor: string;
  dur: string;
  omId: string;
};

const TRADES_COLS = [
  'minmax(48px,0.55fr)', // ID
  'minmax(88px,1.15fr)', // TIME
  'minmax(72px,1.25fr)', // SYMBOL
  'minmax(44px,0.5fr)', // SIDE
  'minmax(54px,0.6fr)', // STATUS
  'minmax(40px,0.5fr)', // SIZE
  'minmax(48px,0.55fr)', // TYPE
  'minmax(62px,0.75fr)', // ENTRY
  'minmax(62px,0.75fr)', // EXIT
  'minmax(62px,0.85fr)', // P&L
  'minmax(46px,0.55fr)', // DUR
  'minmax(96px,1.2fr)', // TAGS
  'minmax(72px,1.55fr)', // NOTES
  'minmax(64px,0.85fr)', // SHOTS
  'minmax(58px,0.7fr)', // ACTION
].join(' ');

const HDRS: { label: string; col: string; sortable?: boolean }[] = [
  { label: 'ID', col: 'id', sortable: true },
  { label: 'TIME', col: 'time', sortable: true },
  { label: 'SYMBOL', col: 'sym', sortable: true },
  { label: 'SIDE', col: 'side', sortable: true },
  { label: 'STATUS', col: 'status', sortable: true },
  { label: 'SIZE', col: 'num', sortable: true },
  { label: 'TYPE', col: 'type', sortable: true },
  { label: 'ENTRY', col: 'num' },
  { label: 'EXIT', col: 'num' },
  { label: 'P&L', col: 'pnl', sortable: true },
  { label: 'DUR', col: 'dur', sortable: true },
  { label: 'TAGS', col: 'tags' },
  { label: 'NOTES', col: 'notes' },
  { label: 'SHOTS', col: 'shots' },
  { label: 'ACTION', col: 'action' },
];

const PRE_DEFS = ['Setup A', 'Setup B', 'News', 'FOMO'];
const POST_DEFS = ['Followed plan', 'Early exit', 'Revenge', 'Good hold'];

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function fmtPnl(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
}

function fmtSym(raw: string): string {
  if (raw.includes('/')) return raw;
  if (raw.length >= 6) return `${raw.slice(0, 3)}/${raw.slice(3, 6)}`;
  return raw;
}

function fmtTime(unixSec: number | undefined): string {
  if (unixSec == null || !(unixSec > 0)) return '—';
  const d = new Date(unixSec * 1000);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()} ${hh}:${mm}`;
}

function fmtDur(fromSec: number, toSec: number | null): string {
  if (!(fromSec > 0)) return '—';
  const end = toSec && toSec > fromSec ? toSec : Math.floor(Date.now() / 1000);
  let sec = Math.max(0, end - fromSec);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 48) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function displayId(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 4) return `#${digits.slice(-4)}`;
  if (digits.length > 0) return `#${digits.padStart(4, '0')}`;
  return `#${id.slice(0, 4)}`;
}

function unrealizedAccount(
  pos: Position,
  bid: number,
  ask: number,
  spec: InstrumentSpec | null,
  accountCurrency: string,
): number {
  if (!spec || bid <= 0) return 0;
  return unrealizedPnL(pos.side, pos.entryPrice, bid, ask, pos.size, spec, {
    accountCurrency,
    instrumentPrice: bid,
  }).amount;
}

type TagMap = Record<string, { pre: string[]; post: string[] }>;
type NotesMap = Record<string, string>;
type ShotsMap = Record<string, string[]>;
type SortKey = 'id' | 'time' | 'sym' | 'side' | 'status' | 'num' | 'type' | 'pnl' | 'dur';

function loadTags(sessionId: string | null | undefined): TagMap {
  if (!sessionId) return {};
  try {
    const raw = localStorage.getItem(`talaria.tradeTags.${sessionId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TagMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveTags(sessionId: string | null | undefined, map: TagMap): void {
  if (!sessionId) return;
  try {
    localStorage.setItem(`talaria.tradeTags.${sessionId}`, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadJsonMap<T>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {} as T;
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

/**
 * V9 Obsidian bottom trade list — Live column grammar + our order engine.
 */
export function TradeDock({
  activeTab,
  state,
  spec,
  bid,
  ask,
  resolveMark,
  resolveSpec,
  cursorTime,
  sessionId,
  liveJournal,
  onCancel,
  onSelectPosition,
  onClosePosition,
}: TradeDockProps) {
  const [tagMap, setTagMap] = useState<TagMap>(() => loadTags(sessionId));
  const [notesMap, setNotesMap] = useState<NotesMap>(() =>
    loadJsonMap(`talaria.tradeNotes.${sessionId ?? 'local'}`),
  );
  const [shotsMap, setShotsMap] = useState<ShotsMap>(() =>
    loadJsonMap(`talaria.tradeShots.${sessionId ?? 'local'}`),
  );
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tagDrop, setTagDrop] = useState<{
    id: string;
    type: 'pre' | 'post';
  } | null>(null);

  useEffect(() => {
    setTagMap(loadTags(sessionId));
    setNotesMap(loadJsonMap(`talaria.tradeNotes.${sessionId ?? 'local'}`));
    setShotsMap(loadJsonMap(`talaria.tradeShots.${sessionId ?? 'local'}`));
  }, [sessionId]);

  useEffect(() => {
    saveTags(sessionId, tagMap);
  }, [sessionId, tagMap]);

  useEffect(() => {
    try {
      localStorage.setItem(
        `talaria.tradeNotes.${sessionId ?? 'local'}`,
        JSON.stringify(notesMap),
      );
    } catch {
      /* ignore */
    }
  }, [sessionId, notesMap]);

  useEffect(() => {
    try {
      localStorage.setItem(
        `talaria.tradeShots.${sessionId ?? 'local'}`,
        JSON.stringify(shotsMap),
      );
    } catch {
      /* ignore */
    }
  }, [sessionId, shotsMap]);

  useEffect(() => {
    if (!tagDrop) return;
    const onPtr = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-trades-tag-menu], [data-trades-tag]')) return;
      setTagDrop(null);
    };
    document.addEventListener('pointerdown', onPtr, true);
    return () => document.removeEventListener('pointerdown', onPtr, true);
  }, [tagDrop]);

  const digits = spec?.digits ?? 5;

  const closedTrades: OrderTrade[] = useMemo(() => {
    if (!sessionId) return [];
    const view = getOrderJournalView(sessionId, liveJournal ?? null);
    return view?.trades.slice().reverse() ?? [];
  }, [sessionId, liveJournal, state]);

  const rows = useMemo(() => {
    const out: DockRow[] = [];
    const currency = state?.account.currency ?? 'USD';
    const openEnd =
      cursorTime != null && cursorTime > 0
        ? cursorTime
        : Math.floor(Date.now() / 1000);

    if (state) {
      for (const p of Object.values(state.positions)) {
        const posSpec = resolveSpec?.(p.symbol) ?? spec;
        const mark = resolveMark?.(p.symbol);
        // Per-symbol mark required in multi-pair. Legacy single-spec callers
        // without resolveMark may use the shared bid — never mix pairs.
        const posBid =
          mark != null && mark.bid > 0
            ? mark.bid
            : resolveMark
              ? 0
              : bid;
        const posAsk =
          mark != null && mark.ask > 0
            ? mark.ask
            : posBid > 0
              ? posBid + (posSpec?.typicalSpread ?? 0)
              : resolveMark
                ? 0
                : ask;
        const upnl = unrealizedAccount(p, posBid, posAsk, posSpec, currency);
        const d = posSpec?.digits ?? digits;
        out.push({
          id: p.id,
          displayId: displayId(p.id),
          time: fmtTime(p.openedAt),
          timeSec: p.openedAt ?? 0,
          sym: fmtSym(p.symbol),
          side: p.side === 'BUY' ? 'LONG' : 'SHORT',
          status: 'open',
          size: p.size,
          type: 'Market',
          entry: fmt(p.entryPrice, d),
          exit: '—',
          pnl: posBid > 0 ? fmtPnl(upnl) : '—',
          pnlColor: upnl >= 0 ? 'var(--up)' : 'var(--down)',
          dur: fmtDur(p.openedAt ?? 0, openEnd),
          omId: p.id,
        });
      }

      const working: Order[] = state.workingIds
        .map((id) => state.orders[id]!)
        .filter((o) => o && !o.role);
      for (const o of working) {
        const oSpec = resolveSpec?.(o.symbol) ?? spec;
        const d = oSpec?.digits ?? digits;
        out.push({
          id: o.id,
          displayId: displayId(o.id),
          time: fmtTime(o.createdAt),
          timeSec: o.createdAt ?? 0,
          sym: fmtSym(o.symbol),
          side: o.side === 'BUY' ? 'LONG' : 'SHORT',
          status: 'pending',
          size: o.size,
          type: o.type,
          entry: o.price != null ? fmt(o.price, d) : 'MKT',
          exit: '—',
          pnl: '—',
          pnlColor: 'var(--text-faint)',
          dur: '—',
          omId: o.id,
        });
      }
    }

    for (const t of closedTrades) {
      const tSpec = resolveSpec?.(t.symbol) ?? spec;
      const d = tSpec?.digits ?? digits;
      out.push({
        id: t.id,
        displayId: displayId(t.id),
        time: fmtTime(t.exitTime || t.entryTime),
        timeSec: t.exitTime || t.entryTime,
        sym: fmtSym(t.symbol),
        side: t.side === 'buy' ? 'LONG' : 'SHORT',
        status: 'closed',
        size: t.size,
        type: 'Market',
        entry: fmt(t.entryPrice, d),
        exit: fmt(t.exitPrice, d),
        pnl: t.ambiguousFill ? 'ambig.' : fmtPnl(t.pnlAccount),
        pnlColor: t.ambiguousFill
          ? 'var(--text-faint)'
          : t.pnlAccount >= 0
            ? 'var(--up)'
            : 'var(--down)',
        dur: fmtDur(t.entryTime, t.exitTime),
        omId: t.id,
      });
    }

    out.sort((a, b) => b.timeSec - a.timeSec);
    return out;
  }, [
    state,
    bid,
    ask,
    spec,
    digits,
    closedTrades,
    resolveMark,
    resolveSpec,
    cursorTime,
  ]);

  if (activeTab === 'analytics') return null;

  const filtered = useMemo(() => {
    const base =
      activeTab === 'all'
        ? rows
        : rows.filter((r) =>
            activeTab === 'pending'
              ? r.status === 'pending'
              : activeTab === 'open'
                ? r.status === 'open'
                : activeTab === 'history'
                  ? r.status === 'closed'
                  : false,
          );
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'id':
          cmp = a.displayId.localeCompare(b.displayId);
          break;
        case 'sym':
          cmp = a.sym.localeCompare(b.sym);
          break;
        case 'side':
          cmp = a.side.localeCompare(b.side);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
        case 'num':
          cmp = a.size - b.size;
          break;
        case 'pnl': {
          const pa = parseFloat(a.pnl.replace(/[^-\d.]/g, '')) || 0;
          const pb = parseFloat(b.pnl.replace(/[^-\d.]/g, '')) || 0;
          cmp = pa - pb;
          break;
        }
        case 'dur':
          cmp = a.dur.localeCompare(b.dur);
          break;
        case 'time':
        default:
          cmp = a.timeSec - b.timeSec;
          break;
      }
      return cmp * mul;
    });
  }, [rows, activeTab, sortKey, sortDir]);

  const empty = filtered.length === 0;
  const detailRow = detailId
    ? filtered.find((r) => r.id === detailId) ?? rows.find((r) => r.id === detailId)
    : null;

  const setTags = (id: string, type: 'pre' | 'post', tags: string[]) => {
    setTagMap((prev) => ({
      ...prev,
      [id]: {
        pre: type === 'pre' ? tags : (prev[id]?.pre ?? []),
        post: type === 'post' ? tags : (prev[id]?.post ?? []),
      },
    }));
  };

  return (
    <div
      data-trades-dock="1"
      data-tc-body=""
      className="flex-1 min-h-0 flex flex-col tlr-scroll"
    >
      <div
        data-trades-table=""
        className="tlr-scroll flex-1 min-h-0"
        style={{ overflowY: 'auto' }}
      >
        <div data-trades-hdr="" style={{ gridTemplateColumns: TRADES_COLS }}>
          {HDRS.map((h) => {
            const key = h.col as SortKey;
            const sorted = h.sortable && sortKey === key;
            return (
              <button
                type="button"
                key={h.label}
                data-col={h.col}
                data-sorted={sorted ? '1' : undefined}
                data-dir={sorted ? sortDir : undefined}
                disabled={!h.sortable}
                className="min-h-11 sm:min-h-0"
                onClick={() => {
                  if (!h.sortable) return;
                  if (sortKey === key) {
                    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortKey(key);
                    setSortDir(key === 'time' ? 'desc' : 'asc');
                  }
                }}
              >
                <span>{h.label}</span>
                {h.sortable ? (
                  <ChromeIcon
                    n={sorted && sortDir === 'asc' ? 'arrowUp' : 'chevDown'}
                    s={9}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {empty ? (
          <div data-trades-empty="">
            <strong>No trades here</strong>
            <em>
              {activeTab === 'pending'
                ? 'No pending orders.'
                : activeTab === 'open'
                  ? 'No open positions.'
                  : activeTab === 'history'
                    ? 'No closed trades yet.'
                    : 'Use + Place Order — SL/TP lines appear on the chart.'}
            </em>
          </div>
        ) : (
          filtered.map((r) => {
            const pre = tagMap[r.id]?.pre ?? [];
            const post = tagMap[r.id]?.post ?? [];
            const isActive = r.status === 'open' || r.status === 'pending';
            return (
              <div
                key={`${r.status}-${r.id}-${r.timeSec}`}
                data-trades-row=""
                data-status={r.status}
                style={{ gridTemplateColumns: TRADES_COLS }}
                onClick={() => {
                  if (r.status === 'open') onSelectPosition?.(r.omId);
                }}
                onDoubleClick={() => setDetailId(r.id)}
              >
                <div data-cell="id" data-col="id">
                  <button
                    type="button"
                    data-trades-id=""
                    data-live={isActive ? '1' : undefined}
                    className="min-h-11 sm:min-h-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailId(r.id);
                    }}
                  >
                    {r.displayId}
                  </button>
                </div>
                <span data-cell="time" data-col="time" title={r.time}>
                  {r.time}
                </span>
                <span data-cell="sym" data-col="sym">
                  {r.sym}
                </span>
                <span data-trade-side={r.side} data-col="side">
                  {r.side === 'LONG' ? 'Long' : 'Short'}
                </span>
                <span data-trade-status={r.status} data-col="status">
                  {r.status}
                </span>
                <span data-cell="num" data-col="num">
                  {r.size}
                </span>
                <span data-cell="muted" data-col="type">
                  {r.type}
                </span>
                <span data-cell="num" data-col="num">
                  {r.entry}
                </span>
                <span
                  data-cell="num"
                  data-col="num"
                  data-empty={r.exit === '—' ? '1' : undefined}
                >
                  {r.exit}
                </span>
                <span
                  data-cell="pnl"
                  data-col="pnl"
                  style={{ color: r.pnlColor }}
                >
                  {r.pnl}
                </span>
                <span
                  data-cell="muted"
                  data-col="dur"
                  data-empty={r.dur === '—' ? '1' : undefined}
                >
                  {r.dur}
                </span>
                <div
                  data-cell="tags"
                  data-col="tags"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(
                    [
                      {
                        type: 'pre' as const,
                        tags: pre,
                        label: 'PRE',
                        canEdit: r.status === 'pending' || r.status === 'open',
                        defs: PRE_DEFS,
                      },
                      {
                        type: 'post' as const,
                        tags: post,
                        label: 'POST',
                        canEdit: r.status === 'closed',
                        defs: POST_DEFS,
                      },
                    ] as const
                  ).map(({ type, tags, label, canEdit, defs }) => {
                    const isOpen =
                      tagDrop?.id === r.id && tagDrop.type === type;
                    const hasTags = tags.length > 0;
                    const clickable =
                      type === 'post'
                        ? canEdit
                        : hasTags || canEdit || defs.length > 0;
                    return (
                      <div key={type} style={{ position: 'relative' }}>
                        <button
                          type="button"
                          data-trades-tag=""
                          data-on={isOpen || hasTags ? '1' : undefined}
                          data-kind={type}
                          data-open={isOpen ? '1' : undefined}
                          disabled={!clickable}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!clickable) return;
                            setTagDrop(isOpen ? null : { id: r.id, type });
                          }}
                        >
                          <span>{label}</span>
                          {hasTags ? (
                            <em data-trades-tag-count="">{tags.length}</em>
                          ) : null}
                          {clickable ? (
                            <ChromeIcon n="chevDown" s={9} />
                          ) : null}
                        </button>
                        {isOpen && clickable ? (
                          <div
                            data-v9-chrome="1"
                            data-sdrop="1"
                            data-trades-tag-menu=""
                            data-kind={type}
                            data-readonly={!canEdit ? '1' : undefined}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: 'absolute',
                              bottom: '100%',
                              left: 0,
                              zIndex: 40,
                              marginBottom: 4,
                              minWidth: 200,
                              maxHeight: 240,
                              overflow: 'auto',
                            }}
                          >
                            <header data-trades-tag-menu-h="">
                              <div data-trades-tag-menu-titles="">
                                <span>
                                  {type === 'pre' ? 'Pre-trade' : 'Post-trade'}
                                </span>
                                <em>
                                  {!canEdit
                                    ? 'View only'
                                    : tags.length
                                      ? `${tags.length} selected`
                                      : 'Select tags'}
                                </em>
                              </div>
                              {canEdit && tags.length > 0 ? (
                                <button
                                  type="button"
                                  data-trades-tag-clear=""
                                  onClick={() => setTags(r.id, type, [])}
                                >
                                  Clear
                                </button>
                              ) : null}
                            </header>
                            <div
                              data-trades-tag-menu-body=""
                              className="tlr-scroll"
                            >
                              {defs.map((opt) => {
                                const active = tags.includes(opt);
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    data-trades-tag-row="multi"
                                    data-on={active ? '1' : undefined}
                                    disabled={!canEdit}
                                    onClick={() => {
                                      if (!canEdit) return;
                                      setTags(
                                        r.id,
                                        type,
                                        active
                                          ? tags.filter((x) => x !== opt)
                                          : [...tags, opt],
                                      );
                                    }}
                                    style={{
                                      display: 'flex',
                                      width: '100%',
                                      alignItems: 'center',
                                      gap: 6,
                                      padding: '6px 10px',
                                      background: active
                                        ? 'var(--accent-quiet)'
                                        : 'transparent',
                                      color: 'var(--text)',
                                      border: 'none',
                                      textAlign: 'left',
                                      fontSize: 12,
                                    }}
                                  >
                                    {active ? (
                                      <ChromeIcon n="check" s={10} />
                                    ) : null}
                                    <span>{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div
                  data-cell="notes"
                  data-col="notes"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="min-h-11 sm:min-h-7 w-full text-left text-[11px] truncate px-0.5"
                    title={notesMap[r.id] || 'Add note'}
                    onClick={() => setDetailId(r.id)}
                  >
                    {notesMap[r.id]?.trim() ? (
                      <span>{notesMap[r.id]}</span>
                    ) : (
                      <em>—</em>
                    )}
                  </button>
                </div>
                <div
                  data-cell="shots"
                  data-col="shots"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="min-h-11 sm:min-h-7 inline-flex items-center gap-1 text-[11px]"
                    onClick={() => setDetailId(r.id)}
                  >
                    {(shotsMap[r.id]?.length ?? 0) > 0 ? (
                      <span>{shotsMap[r.id]!.length} shot{(shotsMap[r.id]!.length === 1 ? '' : 's')}</span>
                    ) : (
                      <em>—</em>
                    )}
                  </button>
                </div>
                <div data-cell="action" data-col="action">
                  {r.status === 'pending' ? (
                    <button
                      type="button"
                      data-trades-act="cancel"
                      className="min-h-11 sm:min-h-[22px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancel(r.omId);
                      }}
                    >
                      Cancel
                    </button>
                  ) : r.status === 'open' && onClosePosition ? (
                    <button
                      type="button"
                      data-trades-act="close"
                      className="min-h-11 sm:min-h-[22px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClosePosition(r.omId);
                      }}
                    >
                      Close
                    </button>
                  ) : (
                    <em>—</em>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {detailRow ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] bg-black/45"
            aria-label="Close trade card"
            onClick={() => setDetailId(null)}
          />
          <div
            data-v9-chrome="1"
            data-chrome-win="trade-card"
            data-win=""
            className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(22rem,calc(100vw-1.5rem))] max-h-[min(80dvh,560px)] flex flex-col rounded-[var(--radius-panel,8px)] border border-[color:var(--line)] bg-[color:var(--surface)] shadow-none overflow-hidden"
            role="dialog"
            aria-label="Trade detail"
          >
            <div data-win-header="">
              <div data-win-icon="">
                <ChromeIcon n="longPos" s={16} cl="var(--accent)" />
              </div>
              <span data-win-title="">
                {detailRow.displayId} · {detailRow.sym}
              </span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                data-brand-icon="1"
                className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center"
                onClick={() => setDetailId(null)}
                aria-label="Close"
              >
                <ChromeIcon n="x" s={16} />
              </button>
            </div>
            <div className="tlr-scroll flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <span className="text-[color:var(--text-muted)]">Side</span>
                <span>{detailRow.side}</span>
                <span className="text-[color:var(--text-muted)]">Status</span>
                <span>{detailRow.status}</span>
                <span className="text-[color:var(--text-muted)]">Entry</span>
                <span className="tabular-nums">{detailRow.entry}</span>
                <span className="text-[color:var(--text-muted)]">P&amp;L</span>
                <span style={{ color: detailRow.pnlColor }}>{detailRow.pnl}</span>
              </div>
              <div>
                <p className="text-[10px] font-extrabold tracking-wide text-[color:var(--text-muted)] mb-1">
                  TAGS
                </p>
                <div className="flex flex-wrap gap-1">
                  {(tagMap[detailRow.id]?.pre ?? []).map((t) => (
                    <span key={`pre-${t}`} data-trades-tag="" data-kind="pre" data-on="1">
                      {t}
                    </span>
                  ))}
                  {(tagMap[detailRow.id]?.post ?? []).map((t) => (
                    <span key={`post-${t}`} data-trades-tag="" data-kind="post" data-on="1">
                      {t}
                    </span>
                  ))}
                  {(tagMap[detailRow.id]?.pre?.length ?? 0) +
                    (tagMap[detailRow.id]?.post?.length ?? 0) ===
                  0 ? (
                    <em className="text-[11px] text-[color:var(--text-faint)]">No tags</em>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-extrabold tracking-wide text-[color:var(--text-muted)] mb-1">
                  NOTES
                </p>
                <textarea
                  value={notesMap[detailRow.id] ?? ''}
                  onChange={(e) =>
                    setNotesMap((prev) => ({
                      ...prev,
                      [detailRow.id]: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full min-h-[88px] rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-2 py-1.5 text-[12px] outline-none"
                  placeholder="Trade notes"
                />
              </div>
              <div>
                <p className="text-[10px] font-extrabold tracking-wide text-[color:var(--text-muted)] mb-1">
                  SHOTS
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(shotsMap[detailRow.id] ?? []).map((src, i) => (
                    <div
                      key={src}
                      className="relative h-14 w-14 rounded-md overflow-hidden border border-[color:var(--line)]"
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute top-0 right-0 min-h-8 min-w-8 bg-black/50 text-white"
                        aria-label="Remove shot"
                        onClick={() =>
                          setShotsMap((prev) => ({
                            ...prev,
                            [detailRow.id]: (prev[detailRow.id] ?? []).filter(
                              (_, j) => j !== i,
                            ),
                          }))
                        }
                      >
                        <ChromeIcon n="x" s={10} />
                      </button>
                    </div>
                  ))}
                  <label className="h-14 w-14 min-h-11 min-w-11 rounded-md border border-dashed border-[color:var(--line)] inline-flex items-center justify-center cursor-pointer">
                    <ChromeIcon n="plus" s={14} />
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = URL.createObjectURL(f);
                        setShotsMap((prev) => ({
                          ...prev,
                          [detailRow.id]: [...(prev[detailRow.id] ?? []), url],
                        }));
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div data-win-foot="" className="flex justify-end gap-2 px-3 py-2 border-t border-[color:var(--line)]">
              <button
                type="button"
                className="min-h-11 sm:min-h-8 px-3 rounded-md text-[12px] font-semibold"
                onClick={() => setDetailId(null)}
              >
                Close
              </button>
              <button
                type="button"
                data-brand-btn="primary"
                className="min-h-11 sm:min-h-8 px-4 rounded-md text-[12px] font-bold"
                onClick={() => setDetailId(null)}
              >
                Save
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function tradeDockCounts(
  state: OrderEngineState | null,
  opts?: { sessionId?: string | null; liveJournal?: OrderJournal | null },
): {
  open: number;
  pending: number;
  history: number;
} {
  if (!state) return { open: 0, pending: 0, history: 0 };
  const pending = state.workingIds.filter((id) => {
    const o = state.orders[id];
    return o && !o.role;
  }).length;
  const sid = opts?.sessionId;
  const history = sid
    ? (getOrderJournalView(sid, opts?.liveJournal ?? null)?.trades.length ?? 0)
    : 0;
  return {
    open: Object.keys(state.positions).length,
    pending,
    history,
  };
}
