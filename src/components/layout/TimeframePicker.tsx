import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Popover } from '@heroui/react';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import { usePinnedTimeframes } from '@/hooks/usePinnedTimeframes';
import type { Timeframe } from '@/types/ui';

/** Engine-backed intervals (must match `Timeframe`). */
export const ALL_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

/** UI interval id — Live uses 1H/1W; engine uses 1h. */
export type IntervalId = string;

const ENGINE_SET = new Set<string>(ALL_TIMEFRAMES);

const TF_DEFAULTS: Record<string, IntervalId[]> = {
  minutes: ['1m', '5m', '15m', '30m'],
  hours: ['1H', '4H', '12H'],
  days: ['1D'],
  weeks: ['1W'],
  months: ['1M'],
};

const CAT_ORDER = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;
const CAT_LABEL: Record<(typeof CAT_ORDER)[number], string> = {
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  weeks: 'Weeks',
  months: 'Months',
};

const UNIT_SHORT: { u: string; lbl: string }[] = [
  { u: 'm', lbl: 'm' },
  { u: 'H', lbl: 'H' },
  { u: 'D', lbl: 'D' },
  { u: 'W', lbl: 'W' },
  { u: 'M', lbl: 'M' },
];

const CUSTOM_MAX: Record<string, number> = { m: 60, H: 24, D: 366, W: 260, M: 120 };
const CUSTOM_KEY = 'talaria.customIntervals.v1';
const PIN_MAX = 8;

/** Normalize Live-style labels ↔ engine Timeframe. Unsupported → null (UI stub). */
export function toEngineTimeframe(id: IntervalId): Timeframe | null {
  const n = id === '1H' ? '1h' : id === '4H' ? '4h' : id;
  if (ENGINE_SET.has(n)) return n as Timeframe;
  return null;
}

/** Display label for pin bar / menu (reference: 1m · 1h · 1d). */
export function formatTfLabel(id: IntervalId): string {
  if (id.endsWith('H')) return `${id.slice(0, -1)}h`;
  if (id.endsWith('D')) return `${id.slice(0, -1)}d`;
  if (id.endsWith('W')) return `${id.slice(0, -1)}w`;
  return id;
}

/** Canonical UI id from engine timeframe. */
function engineToUi(tf: Timeframe): IntervalId {
  if (tf === '1h') return '1H';
  if (tf === '4h') return '4H';
  return tf;
}

function loadCustom(): IntervalId[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function writeCustom(list: IntervalId[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function sortTf(items: IntervalId[]): IntervalId[] {
  return [...items].sort((a, b) => {
    const numA = parseInt(a, 10) || 0;
    const numB = parseInt(b, 10) || 0;
    return numA - numB;
  });
}

function sortBar(items: IntervalId[]): IntervalId[] {
  const uO: Record<string, number> = { m: 0, H: 1, h: 1, D: 2, d: 2, W: 3, w: 3, M: 4 };
  return [...items].sort((a, b) => {
    const uA = a.replace(/[0-9]/g, '');
    const uB = b.replace(/[0-9]/g, '');
    if (uO[uA] !== uO[uB]) return (uO[uA] ?? 9) - (uO[uB] ?? 9);
    return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
  });
}

interface TimeframePickerProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  availableTimeframes?: readonly Timeframe[];
}

/**
 * Obsidian Interval picker — Interval trigger · pin bar · drop (Live grammar).
 * Extra / custom intervals are UI-only until aggregator supports them.
 */
export function TimeframePicker({
  timeframe,
  onTimeframeChange,
  availableTimeframes,
}: TimeframePickerProps) {
  const { pinned, isPinned, togglePin } = usePinnedTimeframes();
  const [open, setOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState<string[]>([
    'minutes',
    'hours',
    'days',
    'weeks',
    'months',
  ]);
  const [customItems, setCustomItems] = useState<IntervalId[]>(() => loadCustom());
  const [customVal, setCustomVal] = useState('3');
  const [customUnit, setCustomUnit] = useState('m');
  const [customErr, setCustomErr] = useState('');

  const activeUi = engineToUi(timeframe);

  const isEngineEnabled = (tf: Timeframe) =>
    !availableTimeframes || availableTimeframes.length === 0
      ? true
      : availableTimeframes.includes(tf);

  const categories = useMemo(() => {
    const out: Record<string, { label: string; items: IntervalId[] }> = {};
    for (const catId of CAT_ORDER) {
      const base = TF_DEFAULTS[catId] ?? [];
      const customs = customItems.filter((x) => {
        if (catId === 'minutes') return x.endsWith('m');
        if (catId === 'hours') return x.endsWith('H');
        if (catId === 'days') return x.endsWith('D');
        if (catId === 'weeks') return x.endsWith('W');
        if (catId === 'months') return x.endsWith('M') && !x.endsWith('m');
        return false;
      });
      out[catId] = {
        label: CAT_LABEL[catId],
        items: sortTf([...base, ...customs]),
      };
    }
    return out;
  }, [customItems]);

  const barItems = useMemo(() => {
    const pinnedUi = pinned.map((p) =>
      p === '1h' ? '1H' : p === '4h' ? '4H' : p,
    );
    const items = pinnedUi.includes(activeUi)
      ? [...pinnedUi]
      : [activeUi, ...pinnedUi];
    return sortBar([...new Set(items)]);
  }, [pinned, activeUi]);

  const pinsFull = pinned.length >= PIN_MAX;

  const pickInterval = (id: IntervalId) => {
    const engine = toEngineTimeframe(id);
    if (!engine || !isEngineEnabled(engine)) return;
    onTimeframeChange(engine);
    setOpen(false);
  };

  const addCustom = () => {
    const n = parseInt(customVal, 10);
    const max = CUSTOM_MAX[customUnit] ?? 60;
    if (!n || n < 1) {
      setCustomErr('Enter a value');
      return;
    }
    if (n > max) {
      setCustomErr(`Max ${max}${customUnit}`);
      return;
    }
    const id = `${n}${customUnit}`;
    const allKnown = new Set([
      ...Object.values(TF_DEFAULTS).flat(),
      ...customItems,
    ]);
    if (allKnown.has(id)) {
      setCustomErr('Already exists');
      return;
    }
    const next = [...customItems, id];
    setCustomItems(next);
    writeCustom(next);
    if (!isPinned(id) && !pinsFull) togglePin(id);
    setCustomVal('');
    setCustomErr('');
  };

  useEffect(() => {
    if (!open) setCustomErr('');
  }, [open]);

  return (
    <div className="flex items-center gap-1.5 min-w-0" data-tf-bar="">
      <Popover isOpen={open} onOpenChange={setOpen}>
        <Popover.Trigger
          title="Interval"
          aria-label="Interval"
          aria-expanded={open}
          data-tb-item="tfMenu"
          data-active={open ? '1' : undefined}
          className={[
            'v8b-chrome-btn shrink-0 !h-8 !min-h-11 sm:!min-h-8 !px-2.5 gap-1',
            '[@media(hover:none)]:min-h-11',
            open
              ? '!border !border-[color:var(--accent)] !text-[color:var(--accent)] !bg-[color:var(--accent-quiet)]'
              : '',
          ].join(' ')}
        >
          <span className="text-xs font-semibold hidden sm:inline">
            Interval
          </span>
          <ChromeIcon n="arrowDn" s={11} />
        </Popover.Trigger>
        <Popover.Content
          placement="bottom start"
          className="p-0 z-[100] overflow-hidden w-[min(15.5rem,calc(100vw-1.5rem))]"
          style={
            {
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow:
                '0 10px 28px color-mix(in oklab, var(--background) 55%, transparent)',
              /* Portal is outside [data-v9-app] — bridge chrome tokens */
              ['--line' as string]: 'var(--separator)',
              ['--line-strong' as string]: 'var(--border)',
              ['--surface-sunken' as string]: 'var(--default)',
              ['--surface-raised' as string]: 'var(--default)',
              ['--text' as string]: 'var(--foreground)',
              ['--text-muted' as string]: 'var(--muted)',
              ['--text-faint' as string]: 'var(--muted)',
              ['--accent-quiet' as string]: 'var(--accent-soft)',
              ['--radius-control' as string]: '6px',
              ['--radius-panel' as string]: '8px',
              ['--cta-bg' as string]: 'var(--foreground)',
              ['--cta-fg' as string]: 'var(--background)',
              color: 'var(--foreground)',
            } as CSSProperties
          }
        >
          <Popover.Dialog
            data-v9-chrome="1"
            data-tb-drop="tf"
            className="max-h-[min(70dvh,420px)] overflow-hidden flex flex-col w-full bg-transparent border-0 shadow-none rounded-none outline-none"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="tlr-scroll flex-1 min-h-0 overflow-y-auto py-1.5">
              {CAT_ORDER.map((catId) => {
                const cat = categories[catId];
                const catOpen = catsOpen.includes(catId);
                return (
                  <div
                    key={catId}
                    data-tf-cat=""
                    data-open={catOpen ? '1' : undefined}
                  >
                    <button
                      type="button"
                      data-tf-cat-head=""
                      data-open={catOpen ? '1' : undefined}
                      aria-expanded={catOpen}
                      className="min-h-11 sm:min-h-0"
                      onClick={() => {
                        setCatsOpen((prev) =>
                          prev.includes(catId)
                            ? prev.filter((x) => x !== catId)
                            : [...prev, catId],
                        );
                      }}
                    >
                      <span>{cat.label}</span>
                      <ChromeIcon n="arrowDn" s={11} cl="currentColor" />
                    </button>
                    {catOpen
                      ? cat.items.map((t) => {
                          const pinnedOn =
                            isPinned(t) || isPinned(t.replace('H', 'h'));
                          const isCustom = customItems.includes(t);
                          const isAct =
                            formatTfLabel(t) === formatTfLabel(activeUi) ||
                            t === activeUi;
                          const engine = toEngineTimeframe(t);
                          const enabled = engine
                            ? isEngineEnabled(engine)
                            : false;
                          return (
                            <div
                              key={t}
                              data-menu-row=""
                              data-active={isAct ? '1' : undefined}
                              data-tf-row="1"
                            >
                              <button
                                type="button"
                                data-tf-pick=""
                                disabled={!enabled}
                                className="min-h-11 sm:min-h-0"
                                title={
                                  enabled
                                    ? formatTfLabel(t)
                                    : `${formatTfLabel(t)} — not available yet`
                                }
                                onClick={() => {
                                  if (enabled) pickInterval(t);
                                }}
                              >
                                <strong
                                  style={{
                                    opacity: enabled ? 1 : 0.45,
                                  }}
                                >
                                  {formatTfLabel(t)}
                                </strong>
                              </button>
                              {isCustom ? (
                                <button
                                  type="button"
                                  data-tf-del=""
                                  aria-label={`Remove ${t}`}
                                  className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = customItems.filter(
                                      (x) => x !== t,
                                    );
                                    setCustomItems(next);
                                    writeCustom(next);
                                    if (isPinned(t)) togglePin(t);
                                  }}
                                >
                                  <ChromeIcon n="x" s={10} cl="currentColor" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                data-tf-pin=""
                                data-on={pinnedOn ? '1' : undefined}
                                aria-label={
                                  pinnedOn
                                    ? `Unpin ${t}`
                                    : pinsFull
                                      ? `Pin bar full (${pinned.length}/${PIN_MAX})`
                                      : `Pin ${t}`
                                }
                                disabled={!pinnedOn && pinsFull}
                                className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePin(t);
                                }}
                              >
                                <ChromeIcon
                                  n={pinnedOn ? 'pinFill' : 'pin'}
                                  s={13}
                                  cl="currentColor"
                                />
                              </button>
                            </div>
                          );
                        })
                      : null}
                  </div>
                );
              })}
            </div>

            <div
              data-tf-compose=""
              className="border-t border-border px-2.5 pb-2.5 pt-2"
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={customVal}
                  placeholder="3"
                  aria-label="Custom interval"
                  className="tlr-nospinner h-8 w-11 shrink-0 rounded-md border border-border bg-default px-1.5 text-center text-xs font-bold tabular-nums text-foreground outline-none focus:border-accent"
                  onChange={(e) => {
                    setCustomVal(e.target.value.replace(/[^0-9]/g, ''));
                    setCustomErr('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                />
                <div
                  role="group"
                  aria-label="Unit"
                  className="flex h-8 min-w-0 flex-1 items-center gap-0.5 rounded-md border border-border bg-default p-0.5"
                >
                  {UNIT_SHORT.map(({ u, lbl }) => {
                    const on = customUnit === u;
                    return (
                      <button
                        type="button"
                        key={u}
                        data-on={on ? '1' : undefined}
                        aria-pressed={on}
                        className={[
                          'min-h-11 min-w-0 flex-1 rounded-md text-xs font-bold sm:min-h-0 sm:h-full',
                          on
                            ? 'bg-accent/20 text-accent'
                            : 'bg-transparent text-muted hover:text-foreground',
                        ].join(' ')}
                        onClick={() => {
                          setCustomUnit(u);
                          setCustomErr('');
                        }}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  data-tf-add=""
                  aria-label="Add and pin custom interval"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
                  onClick={addCustom}
                >
                  <ChromeIcon n="plus" s={14} cl="currentColor" />
                </button>
              </div>
              {customErr ? (
                <div className="mt-1.5 text-xs font-semibold text-danger">
                  {customErr}
                </div>
              ) : null}
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

      <div
        data-brand-seg="1"
        role="group"
        aria-label="Timeframes"
        className="flex items-center gap-0 min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {barItems.map((id, i) => {
          const active =
            formatTfLabel(id) === formatTfLabel(activeUi) || id === activeUi;
          const engine = toEngineTimeframe(id);
          const enabled = engine ? isEngineEnabled(engine) : false;
          const ephemeral =
            active &&
            !pinned.some((p) => formatTfLabel(p) === formatTfLabel(id));
          const last = i === barItems.length - 1;
          return (
            <button
              key={id}
              type="button"
              data-tf={id}
              data-brand-seg-item=""
              data-active={active ? '1' : undefined}
              data-ephemeral={ephemeral ? '1' : undefined}
              disabled={!enabled}
              aria-pressed={active}
              title={
                enabled
                  ? formatTfLabel(id)
                  : `${formatTfLabel(id)} needs a finer base (download 1m)`
              }
              onClick={() => {
                if (enabled) pickInterval(id);
              }}
              className={[
                'shrink-0 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 px-2.5 py-1 text-xs tabular-nums',
                'rounded-none',
                last ? '' : 'border-r border-[color:var(--line)]',
                active
                  ? '!text-[color:var(--accent)] !font-bold'
                  : '!text-[color:var(--text)]',
              ].join(' ')}
            >
              {formatTfLabel(id)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
