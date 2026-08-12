import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  getAppearance,
  patchAppearance,
  subscribeAppearance,
} from '@/chart/appearanceStore';
import {
  CHART_TIMEZONES,
  convertToTimezoneDate,
  formatZonedClockHms,
  formatZonedDateIso,
  timezoneOption,
} from '@/chart/timezone';
import type { ChartTimezoneId } from '@/types/chartAppearance';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import { formatV9HudDateLineTitle } from '@/v9/chromeTheme.js';
import type { ReplayState } from '@/replay/replayStore';
import type { BottomTabId } from '@/types/ui';
import {
  buildGotoTimestampMs,
  loadGotoState,
  resolveGotoTimestampMs,
  saveGotoState,
  type GotoItem,
} from '@/v9/gotoMenuHelpers.js';

function buildTabs(counts: {
  all?: number;
  pending?: number;
  open?: number;
  history?: number;
}): { id: BottomTabId; label: string; count?: number | null }[] {
  return [
    { id: 'all', label: 'All', count: counts.all ?? 0 },
    { id: 'pending', label: 'Pending', count: counts.pending ?? 0 },
    { id: 'open', label: 'Open', count: counts.open ?? 0 },
    { id: 'history', label: 'History', count: counts.history ?? 0 },
    { id: 'analytics', label: 'Analytics', count: null },
  ];
}

interface BottomBarProps {
  activeTab: BottomTabId;
  onTabChange: (tab: BottomTabId) => void;
  replay: ReplayState;
  onPlay: () => void;
  onPause: () => void;
  onToggle: () => void;
  onStep: (deltaBars: number) => void;
  onSpeed: (speed: number) => void;
  onSeek: (time: number) => void;
  equityLabel?: string;
  pnlLabel?: string;
  pnlPositive?: boolean | null;
  tradeCount?: number;
  pendingCount?: number;
  openCount?: number;
  historyCount?: number;
  balanceLabel?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Active chart TF label for step-interval control (e.g. "1m"). */
  stepLabel?: string;
  /** TradeDock / Analytics body when expanded. */
  children?: ReactNode;
  /** Optional CSV export (History / All). */
  onExportTrades?: () => void;
}

const SPEED_STEPS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 50, 60, 70, 80, 90, 100] as const;

function nearestSpeedIndex(speed: number): number {
  let best = 0;
  for (let i = 1; i < SPEED_STEPS.length; i++) {
    if (Math.abs(SPEED_STEPS[i]! - speed) < Math.abs(SPEED_STEPS[best]! - speed)) {
      best = i;
    }
  }
  return best;
}

type GotoTab = 'pinned' | 'preset' | 'create';

/** V9 Obsidian bottom chrome: replay-v2 bar · trades-v2 toolbar · dock body. */
export function BottomBar({
  activeTab,
  onTabChange,
  replay,
  onToggle,
  onStep,
  onSpeed,
  onSeek,
  equityLabel,
  pnlLabel,
  pnlPositive = null,
  tradeCount,
  pendingCount,
  openCount,
  historyCount,
  balanceLabel,
  expanded,
  onExpandedChange,
  stepLabel = '1m',
  children,
  onExportTrades,
}: BottomBarProps) {
  const [balVis, setBalVis] = useState(true);
  const [stepMenuOpen, setStepMenuOpen] = useState(false);
  const [stepInterval, setStepInterval] = useState(stepLabel);
  const stepBtnRef = useRef<HTMLButtonElement>(null);
  const [stepMenuPos, setStepMenuPos] = useState<{
    bottom: number;
    left: number;
  } | null>(null);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoTab, setGotoTab] = useState<GotoTab>('pinned');
  const [gotoQuery, setGotoQuery] = useState('');
  const [gotoItems, setGotoItems] = useState(() => loadGotoState().pinned);
  const [gotoPresets] = useState(() => loadGotoState().presets);
  const [createDate, setCreateDate] = useState('');
  const [createTime, setCreateTime] = useState('09:00');
  const [createName, setCreateName] = useState('');
  const [panelH, setPanelH] = useState(() => {
    try {
      const n = Number(localStorage.getItem('talaria.tradeChrome.height'));
      if (Number.isFinite(n) && n >= 120) return Math.min(n, 520);
    } catch {
      /* ignore */
    }
    return 220;
  });
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, startH: 0, curH: 0 });
  const gotoBtnRef = useRef<HTMLButtonElement>(null);
  const gotoPanelRef = useRef<HTMLDivElement>(null);
  const [gotoPos, setGotoPos] = useState<{
    bottom: number;
    left: number;
    maxH: number;
  } | null>(null);

  const appearance = useSyncExternalStore(
    subscribeAppearance,
    getAppearance,
    getAppearance,
  );
  const tzId = appearance.timezone;
  const tzShort = timezoneOption(tzId).short;
  const [tzMenuOpen, setTzMenuOpen] = useState(false);
  const tzBtnRef = useRef<HTMLButtonElement>(null);

  const si = nearestSpeedIndex(replay.speed);
  const speedPct = (si / (SPEED_STEPS.length - 1)) * 100;
  const cursorMs = replay.cursorTime > 0 ? replay.cursorTime * 1000 : Date.now();
  const dateLine = formatV9HudDateLineTitle(cursorMs, (ms) =>
    convertToTimezoneDate(ms, tzId),
  );
  const clock = formatZonedClockHms(
    replay.cursorTime > 0 ? replay.cursorTime : Date.now() / 1000,
    tzId,
  );

  useEffect(() => {
    if (!tzMenuOpen) return;
    const onPtr = (e: PointerEvent) => {
      const t = e.target as Node;
      if (tzBtnRef.current?.contains(t)) return;
      const menu = document.getElementById('talaria-tz-menu');
      if (menu?.contains(t)) return;
      setTzMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPtr);
    return () => window.removeEventListener('pointerdown', onPtr);
  }, [tzMenuOpen]);

  const tabs = useMemo(
    () =>
      buildTabs({
        all:
          (openCount ?? 0) +
          (pendingCount ?? 0) +
          (historyCount ?? tradeCount ?? 0),
        pending: pendingCount,
        open: openCount,
        history: historyCount ?? tradeCount,
      }),
    [openCount, pendingCount, historyCount, tradeCount],
  );

  useEffect(() => {
    saveGotoState(gotoItems, gotoPresets);
  }, [gotoItems, gotoPresets]);

  useEffect(() => {
    setStepInterval(stepLabel);
  }, [stepLabel]);

  useLayoutEffect(() => {
    if (!stepMenuOpen) {
      setStepMenuPos(null);
      return;
    }
    const place = () => {
      const r = stepBtnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 72;
      const pad = 8;
      let left = r.left;
      left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      const bottom = Math.max(pad, window.innerHeight - r.top + 6);
      setStepMenuPos({ bottom, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [stepMenuOpen]);

  useEffect(() => {
    if (!stepMenuOpen) return;
    const onPtr = (e: PointerEvent) => {
      const t = e.target as Node;
      if (stepBtnRef.current?.contains(t)) return;
      setStepMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPtr);
    return () => window.removeEventListener('pointerdown', onPtr);
  }, [stepMenuOpen]);

  useLayoutEffect(() => {
    if (!gotoOpen) {
      setGotoPos(null);
      return;
    }
    const place = () => {
      const btn = gotoBtnRef.current;
      const r = btn?.getBoundingClientRect();
      if (!r) return;
      const w = 300;
      const pad = 8;
      const gap = 6;
      const maxH = Math.max(200, Math.min(420, r.top - pad - gap));
      let left = r.right - w;
      left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
      const bottom = Math.max(pad, window.innerHeight - r.top + gap);
      setGotoPos({ bottom, left, maxH });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [gotoOpen]);

  useEffect(() => {
    if (!gotoOpen) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (gotoPanelRef.current?.contains(t) || gotoBtnRef.current?.contains(t)) {
        return;
      }
      setGotoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGotoOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [gotoOpen]);

  const seekFromItem = (item: GotoItem) => {
    if (item.type === 'price') return;
    const playheadMs =
      replay.cursorTime > 0 ? replay.cursorTime * 1000 : Date.now();
    const ms = resolveGotoTimestampMs(item, {
      fallbackDateIso: formatZonedDateIso(replay.cursorTime, tzId),
      playheadMs,
    });
    if (ms == null || !Number.isFinite(ms)) return;
    onSeek(Math.floor(ms / 1000));
    setGotoOpen(false);
  };

  const q = gotoQuery.trim().toLowerCase();
  const matchQ = (label?: string, time?: string) => {
    if (!q) return true;
    return `${label || ''} ${time || ''}`.toLowerCase().includes(q);
  };
  const pinnedList = gotoItems.filter((x) => x.pinned);
  const filteredPinned = pinnedList.filter((item) =>
    matchQ(item.label, item.time),
  );
  const filteredPresets = gotoPresets.filter((s) => matchQ(s.label, s.time));

  const mask = (v: string | undefined) => {
    if (balVis) return v ?? '—';
    if (!v || v === '—') return '—';
    return '••••';
  };

  const openGoto = () => {
    setGotoTab('pinned');
    setGotoQuery('');
    setCreateDate(
      formatZonedDateIso(replay.cursorTime || replay.startTime, tzId),
    );
    setCreateTime(
      replay.cursorTime > 0
        ? formatZonedClockHms(replay.cursorTime, tzId).slice(0, 5)
        : '09:00',
    );
    setGotoOpen((o) => !o);
  };

  return (
    <div className="shrink-0 flex flex-col overflow-visible pb-[env(safe-area-inset-bottom)]">
      {/* ── Replay bar ── */}
      <div
        data-v9-chrome="1"
        data-v9-replaybar="1"
        data-replay-v2="1"
        data-sdrop="1"
        className="flex items-center min-w-0 overflow-hidden"
        style={{ height: 44, flexShrink: 0 }}
      >
        <div
          data-rp-zone="date"
          className="flex flex-col items-start justify-center h-full flex-shrink-0 box-border"
        >
          <span data-rp-date="">{dateLine}</span>
          <div className="relative flex items-baseline gap-1.5 whitespace-nowrap max-w-full">
            <span data-rp-clock="">{clock}</span>
            <button
              ref={tzBtnRef}
              type="button"
              data-rp-tz=""
              className="h-auto min-h-0 min-w-0 px-0.5 py-0 text-left underline-offset-2 hover:underline"
              aria-label="Chart timezone"
              aria-haspopup="listbox"
              aria-expanded={tzMenuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setTzMenuOpen((o) => !o);
                setGotoOpen(false);
                setStepMenuOpen(false);
              }}
            >
              {tzShort}
            </button>
            {tzMenuOpen &&
              createPortal(
                <div
                  id="talaria-tz-menu"
                  role="listbox"
                  aria-label="Timezone"
                  className="fixed z-[80] min-w-[200px] max-h-[min(60vh,360px)] overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
                  style={{
                    bottom: Math.max(
                      8,
                      window.innerHeight -
                        (tzBtnRef.current?.getBoundingClientRect().top ?? 0) +
                        6,
                    ),
                    left: Math.max(
                      8,
                      tzBtnRef.current?.getBoundingClientRect().left ?? 8,
                    ),
                  }}
                >
                  {CHART_TIMEZONES.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      role="option"
                      aria-selected={z.id === tzId}
                      className={`flex w-full min-h-11 items-center px-3 text-left text-sm ${
                        z.id === tzId
                          ? 'bg-accent/15 text-foreground'
                          : 'text-foreground hover:bg-muted/40'
                      }`}
                      onClick={() => {
                        patchAppearance({
                          timezone: z.id as ChartTimezoneId,
                        });
                        setTzMenuOpen(false);
                      }}
                    >
                      <span className="w-10 shrink-0 text-xs text-muted-foreground">
                        {z.short}
                      </span>
                      <span>{z.label}</span>
                    </button>
                  ))}
                </div>,
                document.body,
              )}
          </div>
        </div>

        <div
          data-rp-zone="controls"
          className="flex-1 min-w-0 h-full flex items-center justify-center overflow-x-auto overflow-y-hidden"
        >
          <div data-rp-cluster="" data-rp-transport="1">
            <div className="relative" data-replay-mode-root="1">
              <button
                ref={stepBtnRef}
                type="button"
                data-rp-btn=""
                data-rp-step=""
                data-active={stepMenuOpen ? '1' : undefined}
                aria-label="Step interval"
                aria-haspopup="listbox"
                aria-expanded={stepMenuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setGotoOpen(false);
                  setStepMenuOpen((o) => !o);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <ChromeIcon n="stepSize" s={18} />
                <span data-rp-step-label="">{stepInterval}</span>
              </button>
              {stepMenuOpen && stepMenuPos
                ? createPortal(
                    <div
                      data-v9-chrome="1"
                      data-sdrop="1"
                      data-chrome-win="replay-step"
                      data-rp-menu="1"
                      data-rp-step-menu="1"
                      role="listbox"
                      aria-label="Step interval"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        position: 'fixed',
                        bottom: stepMenuPos.bottom,
                        left: stepMenuPos.left,
                        width: 72,
                        maxHeight: 280,
                        zIndex: 11000,
                        overflowY: 'auto',
                      }}
                    >
                      <div data-rp-menu-sec="">Step</div>
                      {(
                        [
                          stepLabel,
                          '1m',
                          '5m',
                          '15m',
                          '1h',
                          '4h',
                          '1D',
                        ] as const
                      )
                        .filter((t, i, a) => a.indexOf(t) === i)
                        .map((t) => (
                          <button
                            type="button"
                            key={t}
                            role="option"
                            aria-selected={stepInterval === t}
                            data-rp-menu-item=""
                            data-on={stepInterval === t ? '1' : undefined}
                            onClick={() => {
                              setStepInterval(t);
                              setStepMenuOpen(false);
                            }}
                          >
                            <span>{t}</span>
                          </button>
                        ))}
                    </div>,
                    document.body,
                  )
                : null}
            </div>

            <i data-rp-sep="" aria-hidden />

            <button
              type="button"
              data-rp-btn=""
              data-rp-play=""
              data-tone={replay.playing ? 'pause' : 'play'}
              data-active={replay.playing ? '1' : undefined}
              aria-label={replay.playing ? 'Pause' : 'Play'}
              onClick={onToggle}
            >
              <ChromeIcon n={replay.playing ? 'pause' : 'play'} s={18} />
            </button>

            <i data-rp-sep="" aria-hidden />

            <div data-rp-speed="" data-no-tip="1">
              <span data-rp-speed-val="">{SPEED_STEPS[si]}×</span>
              <div data-rp-speed-track="">
                <div data-rp-speed-rail="">
                  <i style={{ width: `${speedPct}%` }} />
                </div>
                <b
                  data-rp-speed-thumb=""
                  style={{ left: `calc(${speedPct}% - 5px)` }}
                />
                <input
                  type="range"
                  min={0}
                  max={SPEED_STEPS.length - 1}
                  step={1}
                  value={si}
                  aria-label="Replay speed"
                  onChange={(e) =>
                    onSpeed(SPEED_STEPS[Number(e.target.value)] ?? 1)
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <button
              type="button"
              data-rp-btn=""
              aria-label="Next step"
              onClick={() => onStep(1)}
            >
              <ChromeIcon n="stepFwd" s={18} />
            </button>
            <button
              type="button"
              data-rp-btn=""
              aria-label="Rollback"
              onClick={() => onStep(-1)}
            >
              <ChromeIcon n="rollback" s={18} />
            </button>

            <div className="relative" data-rp-goto-root="1">
              <button
                ref={gotoBtnRef}
                type="button"
                data-rp-btn=""
                data-active={gotoOpen ? '1' : undefined}
                aria-label="Go to"
                aria-expanded={gotoOpen}
                onClick={() => {
                  setStepMenuOpen(false);
                  openGoto();
                }}
              >
                <ChromeIcon n="goto" s={18} />
              </button>
            </div>
          </div>
        </div>

        <div
          data-rp-zone="account"
          className="flex items-center justify-end flex-shrink-0 min-w-0"
          style={{
            borderLeft: '1px solid var(--line)',
            paddingLeft: 8,
            background: 'var(--surface)',
            position: 'relative',
            zIndex: 2,
            maxWidth: '48%',
          }}
        >
          <div className="flex items-center gap-2 px-2 min-w-0 overflow-hidden">
            <button
              type="button"
              data-balance-toggle="1"
              aria-label={balVis ? 'Hide balance' : 'Show balance'}
              aria-pressed={balVis}
              onClick={() => setBalVis((v) => !v)}
              className="w-8 h-8 inline-flex items-center justify-center rounded-md relative"
              style={{ color: balVis ? 'var(--text-muted)' : 'var(--warn)' }}
            >
              <ChromeIcon n={balVis ? 'eye' : 'eyeHide'} s={16} />
            </button>
            <div className="flex items-end gap-3.5 min-w-0 overflow-hidden">
              <div data-rp-metric="bal">
                <span>Balance</span>
                <span>{mask(balanceLabel)}</span>
              </div>
              <div data-rp-metric="eq">
                <span>Equity</span>
                <span>{mask(equityLabel)}</span>
              </div>
              <div data-rp-metric="pnl">
                <span>P&L</span>
                <span
                  style={{
                    color: !balVis
                      ? 'var(--text-faint)'
                      : pnlPositive === true
                        ? 'var(--up)'
                        : pnlPositive === false
                          ? 'var(--down)'
                          : 'var(--text-muted)',
                  }}
                >
                  {mask(pnlLabel)}
                </span>
              </div>
            </div>
          </div>
          <div
            className="w-px h-5 bg-[color:var(--line)] flex-shrink-0"
            aria-hidden
          />
          <button
            type="button"
            data-rp-panel-tog=""
            data-active={expanded ? '1' : undefined}
            aria-label={expanded ? 'Collapse trade panel' : 'Expand trade panel'}
            aria-expanded={expanded}
            onClick={() => onExpandedChange(!expanded)}
            className="w-[30px] h-[30px] inline-flex items-center justify-center"
          >
            <span
              style={{
                transform: expanded ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform var(--motion)',
                lineHeight: 0,
              }}
            >
              <svg width={10} height={6} viewBox="0 0 10 6" aria-hidden>
                <path
                  d="M1,1 L5,5 L9,1"
                  stroke={expanded ? 'var(--accent)' : 'var(--text-muted)'}
                  strokeWidth={1.8}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>

      {/* ── Trades strip ── */}
      <div
        data-v9-chrome="1"
        data-v9-tabstrip="1"
        data-trades-v2="1"
        className="relative flex-shrink-0 bg-[color:var(--surface)] border-t border-[color:var(--line)]"
        style={{ minHeight: 40 }}
      >
        <div
          data-trades-resize=""
          aria-label={
            expanded
              ? 'Drag to resize trades panel'
              : 'Drag up or double-click to expand trades panel'
          }
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onExpandedChange(!expanded);
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const startY = e.clientY;
            const startH = expanded ? panelH : 0;
            const maxH = Math.floor(window.innerHeight / 2 - 36);
            dragRef.current = { startY, startH, curH: startH };
            setResizing(true);
            if (!expanded) onExpandedChange(true);
            if (panelRef.current) {
              panelRef.current.style.height = `${startH}px`;
              panelRef.current.style.transition = 'none';
            }
            const onMove = (ev: PointerEvent) => {
              const delta = startY - ev.clientY;
              const newH = Math.max(0, Math.min(maxH, startH + delta));
              dragRef.current.curH = newH;
              if (panelRef.current) {
                panelRef.current.style.height = `${newH}px`;
              }
            };
            const onUp = () => {
              const finalH = dragRef.current.curH;
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
              if (finalH < 40) {
                onExpandedChange(false);
                setResizing(false);
                if (panelRef.current) panelRef.current.style.height = '0px';
                return;
              }
              setPanelH(finalH);
              onExpandedChange(true);
              setResizing(false);
              try {
                localStorage.setItem(
                  'talaria.tradeChrome.height',
                  String(finalH),
                );
              } catch {
                /* ignore */
              }
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        >
          <i />
        </div>

        <div
          data-trades-toolbar=""
          role="tablist"
          aria-label="Trades"
          onClick={(e) => {
            if (expanded) return;
            if ((e.target as HTMLElement).closest('button')) return;
            onExpandedChange(true);
          }}
        >
          <div data-trades-tabs="">
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-btmtab={tab.id}
                  data-active={active ? '1' : undefined}
                  className="min-h-11 sm:min-h-7"
                  onClick={() => {
                    onTabChange(tab.id);
                    if (!expanded) onExpandedChange(true);
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.count != null ? <em>{tab.count}</em> : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            data-trades-export=""
            aria-label="Export trades"
            className="min-h-11 sm:min-h-7"
            disabled={!onExportTrades}
            onClick={(e) => {
              e.stopPropagation();
              onExportTrades?.();
            }}
          >
            <ChromeIcon n="download" s={13} />
            Export
          </button>
        </div>

        <div
          ref={panelRef}
          className="flex flex-col min-h-0 overflow-hidden"
          style={{
            height: resizing
              ? dragRef.current.curH
              : expanded
                ? panelH
                : 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {expanded || resizing ? children : null}
        </div>
      </div>

      {/* ── Go To portal ── */}
      {gotoOpen &&
        gotoPos &&
        createPortal(
          <div
            ref={gotoPanelRef}
            data-v9-chrome="1"
            data-sdrop="1"
            data-chrome-win="goto"
            data-goto-v2="1"
            data-goto-pop="1"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              bottom: gotoPos.bottom,
              left: gotoPos.left,
              width: 300,
              maxHeight: gotoPos.maxH,
              zIndex: 11000,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div data-win-header="">
              <div data-win-icon="">
                <ChromeIcon n="goto" s={16} />
              </div>
              <span data-win-title="">Go To</span>
              <button
                type="button"
                data-brand-icon="1"
                aria-label="Close"
                className="ml-auto"
                onClick={() => setGotoOpen(false)}
              >
                <ChromeIcon n="x" s={16} />
              </button>
            </div>

            {gotoTab !== 'create' ? (
              <label data-goto-search="">
                <input
                  value={gotoQuery}
                  onChange={(e) => setGotoQuery(e.target.value)}
                  placeholder="Search pins…"
                  aria-label="Search Go To"
                />
              </label>
            ) : null}

            <div data-goto-body="" className="flex-1 min-h-0 overflow-y-auto">
              {gotoTab === 'pinned' &&
                (filteredPinned.length === 0 ? (
                  <div data-goto-empty="">
                    <em>No pinned times. Create one or pin a preset.</em>
                  </div>
                ) : (
                  filteredPinned.map((item) => (
                    <button
                      key={String(item.id)}
                      type="button"
                      data-goto-row=""
                      onClick={() => seekFromItem(item)}
                    >
                      <span
                        data-goto-dot=""
                        style={{ background: item.color || 'var(--accent)' }}
                      />
                      <span data-goto-row-main="">
                        <strong>{item.label || '—'}</strong>
                        {item.time ? <em>{item.time}</em> : null}
                      </span>
                      <span data-goto-row-acts="">
                        <button
                          type="button"
                          data-gotoact=""
                          data-pin="1"
                          aria-label="Unpin"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGotoItems((prev) =>
                              prev.map((x) =>
                                x.id === item.id
                                  ? { ...x, pinned: false }
                                  : x,
                              ),
                            );
                          }}
                        >
                          <ChromeIcon n="pin" s={12} />
                        </button>
                      </span>
                    </button>
                  ))
                ))}

              {gotoTab === 'preset' &&
                (filteredPresets.length === 0 ? (
                  <div data-goto-empty="">
                    <em>No presets match.</em>
                  </div>
                ) : (
                  filteredPresets.map((item) => (
                    <button
                      key={String(item.id)}
                      type="button"
                      data-goto-row=""
                      onClick={() => {
                        seekFromItem(item as GotoItem);
                      }}
                    >
                      <span
                        data-goto-dot=""
                        style={{ background: item.color || 'var(--accent)' }}
                      />
                      <span data-goto-row-main="">
                        <strong>{item.label || '—'}</strong>
                        {item.time ? <em>{item.time}</em> : null}
                      </span>
                      <span data-goto-row-acts="">
                        <button
                          type="button"
                          data-gotoact=""
                          aria-label="Pin"
                          onClick={(e) => {
                            e.stopPropagation();
                            const id = Date.now() + Math.random();
                            setGotoItems((prev) => [
                              {
                                ...item,
                                id,
                                pinned: true,
                                type: item.type || 'session',
                              } as GotoItem,
                              ...prev,
                            ]);
                          }}
                        >
                          <ChromeIcon n="pin" s={12} />
                        </button>
                      </span>
                    </button>
                  ))
                ))}

              {gotoTab === 'create' ? (
                <div data-goto-create="" className="p-3 space-y-2">
                  <label data-brand-field="1" className="block">
                    <span className="text-[10px] text-[color:var(--text-faint)] uppercase tracking-wide">
                      Date
                    </span>
                    <input
                      type="date"
                      value={createDate}
                      onChange={(e) => setCreateDate(e.target.value)}
                      className="w-full mt-1 h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-2 text-[13px] text-[color:var(--text)]"
                    />
                  </label>
                  <label data-brand-field="1" className="block">
                    <span className="text-[10px] text-[color:var(--text-faint)] uppercase tracking-wide">
                      Time (UTC)
                    </span>
                    <input
                      type="time"
                      value={createTime}
                      onChange={(e) => setCreateTime(e.target.value)}
                      className="w-full mt-1 h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-2 text-[13px] text-[color:var(--text)]"
                    />
                  </label>
                  <label data-brand-field="1" className="block">
                    <span className="text-[10px] text-[color:var(--text-faint)] uppercase tracking-wide">
                      Name
                    </span>
                    <input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Optional label"
                      className="w-full mt-1 h-9 rounded-md border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-2 text-[13px] text-[color:var(--text)]"
                    />
                  </label>
                  <div data-goto-actions="" className="flex gap-2 pt-1">
                    <button
                      type="button"
                      data-kind="add"
                      data-brand-btn="secondary"
                      className="flex-1 h-9 rounded-md text-[12px] font-semibold"
                      onClick={() => {
                        if (!createDate) return;
                        const id = Date.now();
                        const label =
                          createName.trim() ||
                          `${createDate} ${createTime || '00:00'}`;
                        setGotoItems((prev) => [
                          {
                            id,
                            type: 'datetime',
                            label,
                            time: createTime || '00:00',
                            dateIso: createDate,
                            repeat: 'none',
                            pinned: true,
                            color: '#3090FF',
                          },
                          ...prev,
                        ]);
                        setGotoTab('pinned');
                      }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      data-kind="go"
                      data-brand-btn="primary"
                      className="flex-1 h-9 rounded-md text-[12px] font-semibold"
                      onClick={() => {
                        if (!createDate) return;
                        const ms = buildGotoTimestampMs(
                          createDate,
                          createTime || '00:00',
                        );
                        if (ms == null) return;
                        onSeek(Math.floor(ms / 1000));
                        setGotoOpen(false);
                      }}
                    >
                      Go
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <p data-goto-foot-hint="">
              {gotoTab === 'create'
                ? 'Add saves a pin · Go jumps now'
                : 'Click a row to jump'}
            </p>
            <div data-goto-tabs="" role="tablist" aria-label="Go To">
              {(
                [
                  ['pinned', 'Pinned', pinnedList.length],
                  ['preset', 'Preset', gotoPresets.length],
                  ['create', 'Create', null],
                ] as const
              ).map(([id, label, cnt]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={gotoTab === id}
                  data-active={gotoTab === id ? '1' : undefined}
                  onClick={() => {
                    setGotoTab(id);
                    setGotoQuery('');
                  }}
                >
                  <span>{label}</span>
                  {cnt != null ? <em>{cnt}</em> : null}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
