import { useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import {
  IconPause,
  IconPlay,
  IconStepBack,
  IconStepForward,
} from '@/components/icons/ToolIcons';
import type { ReplayState } from '@/replay/replayStore';
import type { BottomTabId } from '@/types/ui';

function buildTabs(tradeCount: number | undefined): {
  id: BottomTabId;
  label: string;
  short: string;
  count?: number;
}[] {
  return [
    { id: 'all', label: 'All Trade', short: 'All', count: tradeCount ?? 0 },
    { id: 'pending', label: 'Pending', short: 'Pend', count: 0 },
    { id: 'open', label: 'Open Positions', short: 'Open', count: 0 },
    { id: 'history', label: 'History', short: 'Hist', count: tradeCount ?? 0 },
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
}

function formatClock(d: Date): string {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${days[d.getDay()]} ${dd} ${months[d.getMonth()]} '${yy}, ${hh}:${mm}:${ss}`;
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

const replayBtn =
  'h-8 w-8 [@media(hover:none)]:h-11 [@media(hover:none)]:w-11 rounded-[4px] flex items-center justify-center text-muted hover:text-foreground hover:bg-background/70';

/** TradingView-style bottom strip: tabs · scrub · replay · account. */
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
}: BottomBarProps) {
  const [now, setNow] = useState(() => new Date());
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const span = Math.max(1, replay.endTime - replay.startTime);
  const progress = Math.min(
    1,
    Math.max(0, (replay.cursorTime - replay.startTime) / span),
  );

  const cursorLabel = useMemo(
    () => formatCursorLabel(replay.cursorTime),
    [replay.cursorTime],
  );

  const tabs = useMemo(() => buildTabs(tradeCount), [tradeCount]);

  const openJump = () => {
    setJumpValue(toDatetimeLocalValue(replay.cursorTime || replay.startTime));
    setJumpOpen(true);
  };

  const applyJump = () => {
    const t = fromDatetimeLocalValue(jumpValue);
    if (t == null) return;
    onSeek(t);
    setJumpOpen(false);
  };

  return (
    <footer className="tv-panel-t shrink-0 bg-surface flex flex-col pb-[env(safe-area-inset-bottom)] text-xs">
      {/* Scrub track — thin TV-style progress under the chart */}
      <div className="flex items-center gap-2 h-7 px-2 border-b border-[color:var(--tv-panel-line)]">
        <button
          type="button"
          className="shrink-0 h-6 px-1.5 rounded text-[11px] text-muted hover:text-foreground hover:bg-background/70 tabular-nums"
          title="Jump to date"
          onClick={openJump}
        >
          {cursorLabel}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            const t = replay.startTime + (Number(e.target.value) / 1000) * span;
            onSeek(t);
          }}
          className="flex-1 min-w-0 h-1 accent-[var(--accent)]"
          title="Scrub replay"
          aria-label="Scrub replay progress"
        />
        {jumpOpen && (
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="datetime-local"
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              className="h-7 rounded border border-[color:var(--tv-panel-line)] bg-background px-1.5 text-foreground outline-none"
              aria-label="Jump to date"
            />
            <Button variant="primary" size="sm" className="h-7 min-h-7 px-2" onPress={applyJump}>
              Go
            </Button>
            <Button variant="ghost" size="sm" className="h-7 min-h-7 px-2" onPress={() => setJumpOpen(false)}>
              ✕
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 h-9 sm:h-[38px] px-2">
        <div className="hidden lg:block text-muted tabular-nums text-[11px] min-w-[10.5rem] shrink-0">
          {formatClock(now)}
        </div>

        <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto overscroll-x-contain flex-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={[
                  'h-7 px-2.5 rounded whitespace-nowrap transition-colors shrink-0 text-[12px]',
                  '[@media(hover:none)]:min-h-11 [@media(hover:none)]:px-3',
                  active
                    ? 'text-foreground font-medium bg-background/70'
                    : 'text-muted hover:text-foreground',
                ].join(' ')}
              >
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {typeof tab.count === 'number' ? ` ${tab.count}` : ''}
              </button>
            );
          })}
        </div>

        <span className="tv-divider-y h-4 hidden md:block" aria-hidden />

        <div className="flex items-center gap-1 text-muted shrink-0">
          <span className="tabular-nums w-7 text-right text-[11px]">{replay.speed}x</span>
          <input
            type="range"
            min={1}
            max={100}
            value={replay.speed}
            onChange={(e) => onSpeed(Number(e.target.value))}
            className="w-16 sm:w-20 h-1 accent-[var(--accent)]"
            title="Replay speed (bars/sec)"
          />
          <button type="button" className={replayBtn} onClick={() => onStep(-1)} title="Step back">
            <IconStepBack className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className={replayBtn}
            onClick={onToggle}
            title={replay.playing ? 'Pause replay' : 'Play replay'}
          >
            {replay.playing ? (
              <IconPause className="w-3.5 h-3.5" />
            ) : (
              <IconPlay className="w-3.5 h-3.5" />
            )}
          </button>
          <button type="button" className={replayBtn} onClick={() => onStep(1)} title="Step forward">
            <IconStepForward className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="tv-divider-y h-4 hidden md:block" aria-hidden />

        <div className="hidden md:flex items-center gap-3 shrink-0 tabular-nums text-[11px]">
          <div>
            <span className="text-muted mr-1">BALANCE</span>
            <span>1.00</span>
          </div>
          <div>
            <span className="text-muted mr-1">EQUITY</span>
            <span>{equityLabel ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted mr-1">P&L</span>
            <span
              className={
                pnlPositive === true
                  ? 'text-success'
                  : pnlPositive === false
                    ? 'text-danger'
                    : undefined
              }
            >
              {pnlLabel ?? '—'}
            </span>
          </div>
          <Button variant="outline" size="sm" className="h-7 min-h-7 px-2 text-[12px]" isDisabled>
            Export
          </Button>
        </div>
      </div>
    </footer>
  );
}
