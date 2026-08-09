import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react';
import {
  IconChevron,
  IconPause,
  IconPlay,
  IconSettings,
} from '@/components/icons/ToolIcons';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import type { ReplayState } from '@/replay/replayStore';
import type { BottomTabId } from '@/types/ui';

function buildTabs(counts: {
  all?: number;
  pending?: number;
  open?: number;
  history?: number;
}): {
  id: BottomTabId;
  label: string;
  short: string;
  count?: number;
}[] {
  return [
    { id: 'all', label: 'All', short: 'All', count: counts.all },
    { id: 'pending', label: 'Pending', short: 'Pend', count: counts.pending ?? 0 },
    { id: 'open', label: 'Open', short: 'Open', count: counts.open ?? 0 },
    { id: 'history', label: 'History', short: 'Hist', count: counts.history ?? 0 },
    { id: 'analytics', label: 'Analytics', short: 'Anal' },
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
  /** From last backtest result (equity index, start = 1). */
  equityLabel?: string;
  pnlLabel?: string;
  pnlPositive?: boolean | null;
  tradeCount?: number;
  pendingCount?: number;
  openCount?: number;
  historyCount?: number;
  balanceLabel?: string;
  /** When false, only the compact replay strip is shown. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

function formatClockDate(d: Date): string {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${days[d.getDay()]} ${dd} ${months[d.getMonth()]} '${yy}`;
}

function formatClockTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function toDatetimeLocalValue(unixSec: number): string {
  if (!unixSec) return '';
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

function formatCursorLabel(unixSec: number): string {
  if (!unixSec) return '—';
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SPEED_STEPS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 50, 60, 70, 80, 90, 100] as const;

function nearestSpeedIndex(speed: number): number {
  let best = 0;
  for (let i = 1; i < SPEED_STEPS.length; i++) {
    if (Math.abs(SPEED_STEPS[i] - speed) < Math.abs(SPEED_STEPS[best] - speed)) best = i;
  }
  return best;
}

function ReplayControls({
  replay,
  onToggle,
  onStep,
  onSpeed,
  jumpOpen,
  jumpValue,
  onToggleJump,
  onJumpValueChange,
  onApplyJump,
  onCloseJump,
}: {
  replay: ReplayState;
  onToggle: () => void;
  onStep: (deltaBars: number) => void;
  onSpeed: (speed: number) => void;
  jumpOpen: boolean;
  jumpValue: string;
  onToggleJump: () => void;
  onJumpValueChange: (value: string) => void;
  onApplyJump: () => void;
  onCloseJump: () => void;
}) {
  const si = nearestSpeedIndex(replay.speed);
  const pct = (si / (SPEED_STEPS.length - 1)) * 100;
  const gearRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!jumpOpen) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const el = gearRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(window.innerWidth - 24, 288);
      const left = Math.min(
        Math.max(12, r.left + r.width / 2 - width / 2),
        window.innerWidth - width - 12,
      );
      const top = Math.max(12, r.top - 8);
      setMenuPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [jumpOpen]);

  useEffect(() => {
    if (!jumpOpen) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || gearRef.current?.contains(t)) return;
      onCloseJump();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseJump();
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [jumpOpen, onCloseJump]);

  return (
    <div
      data-v9-replaybar="1"
      className="relative flex items-center h-full justify-center gap-0.5 shrink-0"
    >
      <span className="v8b-sep !mx-1" aria-hidden />
      <button
        ref={gearRef}
        type="button"
        className="v8b-chrome-btn !px-1.5"
        title="Replay settings"
        aria-label="Replay settings"
        aria-expanded={jumpOpen}
        aria-haspopup="dialog"
        data-active={jumpOpen ? 'true' : undefined}
        data-brand-icon="1"
        onClick={onToggleJump}
      >
        <IconSettings className="w-[18px] h-[18px]" />
      </button>
      {jumpOpen &&
        menuPos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Jump to date"
            data-v9-chrome="1"
            data-sdrop="1"
            data-chrome-win="goto"
            className={[
              'v9-flyout fixed z-[100020] w-[min(calc(100vw-1.5rem),18rem)]',
              'rounded-[var(--radius-panel,8px)] border border-[color:var(--line)]',
              'bg-[color:var(--surface-raised)] text-[color:var(--text)]',
              'p-3 space-y-2',
            ].join(' ')}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              transform: 'translateY(-100%)',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Jump to date
            </p>
            <input
              type="datetime-local"
              value={jumpValue}
              onChange={(e) => onJumpValueChange(e.target.value)}
              data-brand-field="1"
              className="w-full min-h-11 rounded-[var(--radius-control,6px)] border border-[color:var(--line)] bg-[color:var(--surface-sunken)] px-2 py-2 text-sm text-foreground outline-none focus:border-[color:var(--accent)]"
              aria-label="Jump to date"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                className="min-h-11 flex-1"
                data-brand-btn="primary"
                onPress={onApplyJump}
              >
                Go
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 px-3"
                data-brand-btn="ghost"
                onPress={onCloseJump}
              >
                Close
              </Button>
            </div>
          </div>,
          document.body,
        )}
      <button
        type="button"
        className="v8b-chrome-btn !px-1.5 relative"
        onClick={onToggle}
        title={replay.playing ? 'Pause replay' : 'Play replay'}
        data-active={replay.playing ? 'true' : undefined}
        data-brand-icon="1"
      >
        {replay.playing ? (
          <IconPause className="w-[18px] h-[18px] text-[color:var(--warn)]" />
        ) : (
          <IconPlay className="w-[18px] h-[18px] text-[color:var(--up)]" />
        )}
      </button>
      <div className="flex items-center gap-1.5 px-1.5 w-[8.5rem] shrink-0">
        <span className="text-[13px] font-extrabold text-[color:var(--accent)] tabular-nums w-7 text-right leading-none">
          {SPEED_STEPS[si]}
          <span className="text-[15px] ml-px">×</span>
        </span>
        <div className="relative flex-1 h-9 flex items-center">
          <div className="absolute inset-x-0 h-[3px] rounded-full bg-[color:var(--line)]">
            <div
              className="h-full rounded-full bg-[color:var(--accent)]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={SPEED_STEPS.length - 1}
            step={1}
            value={si}
            onChange={(e) => onSpeed(SPEED_STEPS[Number(e.target.value)] ?? 1)}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            title="Replay speed"
            aria-label="Replay speed"
          />
        </div>
      </div>
      <button
        type="button"
        className="v8b-chrome-btn !px-1.5"
        onClick={() => onStep(-1)}
        title="Step back"
        data-brand-icon="1"
      >
        <ChromeIcon n="stepBack" s={18} />
      </button>
      <button
        type="button"
        className="v8b-chrome-btn !px-1.5"
        onClick={() => onStep(1)}
        title="Step forward"
        data-brand-icon="1"
      >
        <ChromeIcon n="stepFwd" s={18} />
      </button>
      <span className="v8b-sep !mx-1" aria-hidden />
    </div>
  );
}

/** V9 Obsidian bottom chrome: clock · replay · balance, then trade tabs. */
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
}: BottomBarProps) {
  const [now, setNow] = useState(() => new Date());
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState('');
  const scrubRef = useRef<HTMLInputElement>(null);
  const cursorLabelRef = useRef<HTMLSpanElement>(null);
  const compactLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const span = Math.max(1, replay.endTime - replay.startTime);
  const progress = Math.min(
    1,
    Math.max(0, (replay.cursorTime - replay.startTime) / span),
  );
  const scrubValue = Math.round(progress * 1000);

  const cursorLabel = useMemo(
    () => formatCursorLabel(replay.cursorTime),
    [replay.cursorTime],
  );

  useEffect(() => {
    if (replay.playing) return;
    const scrub = scrubRef.current;
    if (scrub) scrub.value = String(scrubValue);
    const label = cursorLabelRef.current;
    if (label) label.textContent = cursorLabel;
    const compact = compactLabelRef.current;
    if (compact) compact.textContent = cursorLabel;
  }, [replay.playing, scrubValue, cursorLabel, expanded]);

  const tabs = useMemo(
    () =>
      buildTabs({
        all: (openCount ?? 0) + (pendingCount ?? 0) + (historyCount ?? tradeCount ?? 0),
        pending: pendingCount,
        open: openCount,
        history: historyCount ?? tradeCount,
      }),
    [openCount, pendingCount, historyCount, tradeCount],
  );

  const toggleJump = () => {
    if (jumpOpen) {
      setJumpOpen(false);
      return;
    }
    setJumpValue(toDatetimeLocalValue(replay.cursorTime || replay.startTime));
    setJumpOpen(true);
  };

  const closeJump = () => setJumpOpen(false);

  const applyJump = () => {
    const t = fromDatetimeLocalValue(jumpValue);
    if (t == null) return;
    onSeek(t);
    setJumpOpen(false);
  };

  const replayControls = (
    <ReplayControls
      replay={replay}
      onToggle={onToggle}
      onStep={onStep}
      onSpeed={onSpeed}
      jumpOpen={jumpOpen}
      jumpValue={jumpValue}
      onToggleJump={toggleJump}
      onJumpValueChange={setJumpValue}
      onApplyJump={applyJump}
      onCloseJump={closeJump}
    />
  );

  if (!expanded) {
    return (
      <footer
        data-v9-chrome="1"
        data-v9-replaybar="1"
        className={[
          'chrome-bottombar shrink-0 flex items-center justify-between gap-1.5 overflow-visible',
          'h-12 min-h-12 px-2 pb-[env(safe-area-inset-bottom)] text-xs',
          'border-t border-[color:var(--line)]',
        ].join(' ')}
      >
        <button
          type="button"
          className="v8b-chrome-btn !px-2"
          onClick={() => onExpandedChange(true)}
          title="Expand trade panel"
          aria-label="Expand trade panel"
          aria-expanded={false}
          data-brand-icon="1"
        >
          <IconChevron className="w-3.5 h-3.5 -rotate-90" />
        </button>
        <span
          ref={compactLabelRef}
          id="replay-cursor-label"
          className="text-[11px] text-muted tabular-nums truncate min-w-0"
        >
          {cursorLabel}
        </span>
        <div className="flex-1" />
        {replayControls}
      </footer>
    );
  }

  return (
    <footer
      data-v9-chrome="1"
      data-trades-panel="1"
      className={[
        'chrome-bottombar shrink-0 flex flex-col overflow-visible pb-[env(safe-area-inset-bottom)] text-xs',
        'border-t border-[color:var(--line)]',
      ].join(' ')}
    >
      {/* Scrub — thin progress under the chart */}
      <div
        data-v9-replaybar="1"
        className="flex items-center gap-1.5 h-6 px-2 border-b border-[color:var(--line)]"
      >
        <input
          ref={scrubRef}
          id="replay-scrub"
          type="range"
          min={0}
          max={1000}
          defaultValue={scrubValue}
          onChange={(e) => {
            const t = replay.startTime + (Number(e.target.value) / 1000) * span;
            onSeek(t);
          }}
          className="flex-1 min-w-0 h-1 accent-[var(--accent)]"
          title="Scrub replay"
          aria-label="Scrub replay progress"
        />
        <span
          ref={cursorLabelRef}
          className="shrink-0 text-[10px] text-muted tabular-nums"
        >
          {cursorLabel}
        </span>
      </div>

      {/* Status + replay — 3-column grid */}
      <div
        data-v9-replaybar="1"
        className="grid grid-cols-[1fr_auto_1fr] items-center h-12 min-h-12 px-2.5"
      >
        <div className="flex flex-col items-start justify-center gap-1 min-w-0 w-[10.75rem]">
          <span className="text-[9px] font-semibold text-muted tracking-[0.08em] uppercase tabular-nums leading-none whitespace-nowrap">
            {formatClockDate(now)}
          </span>
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[14px] font-bold text-foreground tabular-nums tracking-[0.04em] leading-none">
              {formatClockTime(now)}
            </span>
            <span className="text-[10px] font-semibold text-muted tracking-[0.06em] leading-none">
              UTC
            </span>
          </div>
        </div>

        {replayControls}

        <div className="flex items-center justify-end gap-0 min-w-0">
          <div className="hidden md:grid grid-cols-3 gap-x-4 gap-y-0.5 justify-items-end px-3">
            {(['BALANCE', 'EQUITY', 'P&L'] as const).map((l) => (
              <span
                key={l}
                className="text-[9px] font-semibold text-muted tracking-[0.07em] leading-none"
              >
                {l}
              </span>
            ))}
            <span className="text-[12px] font-bold text-foreground tabular-nums leading-none">
              {balanceLabel ?? '—'}
            </span>
            <span className="text-[12px] font-bold text-foreground tabular-nums leading-none">
              {equityLabel ?? '—'}
            </span>
            <span
              className={[
                'text-[12px] font-bold tabular-nums leading-none',
                pnlPositive === true
                  ? 'text-[color:var(--up)]'
                  : pnlPositive === false
                    ? 'text-[color:var(--down)]'
                    : 'text-foreground',
              ].join(' ')}
            >
              {pnlLabel ?? '—'}
            </span>
          </div>
          <span className="v8b-sep" aria-hidden />
          <button
            type="button"
            className="v8b-chrome-btn !w-11 !min-w-11 !px-0 justify-center"
            onClick={() => onExpandedChange(false)}
            title="Collapse trade panel"
            aria-label="Collapse trade panel"
            aria-expanded={true}
            data-active="true"
            data-brand-icon="1"
          >
            <IconChevron className="w-3 h-3 rotate-90" />
          </button>
        </div>
      </div>

      {/* Trade tabs */}
      <div
        data-trades-tabs="1"
        className="relative flex items-center border-t border-[color:var(--line)] pl-2.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ minHeight: 'var(--tabstrip-h, 36px)' }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-active={active ? 'true' : undefined}
              onClick={() => onTabChange(tab.id)}
              className={[
                'relative shrink-0 px-3 py-[7px] text-[11px] whitespace-nowrap transition-colors',
                'min-h-11 sm:min-h-9',
                active
                  ? 'text-[color:var(--accent)] font-bold'
                  : 'text-muted font-medium hover:text-foreground hover:bg-[color:var(--surface-raised)]',
              ].join(' ')}
            >
              <span className="sm:hidden">{tab.short}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {typeof tab.count === 'number' ? (
                <span
                  className={[
                    'ml-1 font-semibold',
                    active ? 'text-[color:var(--accent)]' : 'text-muted',
                  ].join(' ')}
                >
                  {tab.count}
                </span>
              ) : null}
              {active && (
                <span
                  className="absolute bottom-0 left-[15%] right-[15%] h-0.5 pointer-events-none bg-[color:var(--accent)]"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-9 min-h-11 sm:min-h-9 px-2.5 mr-1 text-[11px] shrink-0"
          data-brand-btn="ghost"
          isDisabled
        >
          ↑ Export
        </Button>
      </div>
    </footer>
  );
}
