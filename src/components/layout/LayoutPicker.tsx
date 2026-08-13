import { useEffect, useMemo, useState } from 'react';
import { Popover } from '@heroui/react';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';
import {
  LAYOUT_LY_LINES,
  LAYOUT_SYNC_HELP,
  LAYOUT_SYNC_ITEMS,
  layoutIdForVariant,
  variantIndexForLayout,
  type LayoutLine,
  type LayoutSyncOptions,
} from '@/types/layout';
import type { ChartLayout } from '@/types/ui';

interface LayoutPickerProps {
  layout: ChartLayout;
  onLayoutChange: (layout: ChartLayout) => void;
  sync: LayoutSyncOptions;
  onSyncChange: (next: LayoutSyncOptions) => void;
  /** Increment to force-open from TopBar utils. */
  openSignal?: number;
}

function LayoutThumb({
  lines,
  active,
  w = 64,
  h = 42,
}: {
  lines: LayoutLine[];
  active: boolean;
  w?: number;
  h?: number;
}) {
  /* Keep glyph weight with peer 18px toolbar icons (less inset on small thumbs). */
  const pad = Math.min(w, h) <= 20 ? 1.25 : 3;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const stroke = active ? 'var(--accent)' : 'var(--line-strong)';
  const fill = active ? 'var(--accent-quiet)' : 'var(--surface-sunken)';
  return (
    <svg
      data-chrome-icon="1"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect
        x={pad}
        y={pad}
        width={iw}
        height={ih}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={active ? 1.5 : 1}
      />
      {(lines || []).map((l, i) => (
        <line
          key={i}
          x1={pad + l.x1 * iw}
          y1={pad + l.y1 * ih}
          x2={pad + l.x2 * iw}
          y2={pad + l.y2 * ih}
          stroke={stroke}
          strokeWidth={active ? 1.4 : 1.1}
          strokeLinecap="square"
        />
      ))}
    </svg>
  );
}

function LayoutGlyph({
  layout,
  size = 18,
}: {
  layout: ChartLayout;
  size?: number;
}) {
  const { n, li } = variantIndexForLayout(layout);
  const lines = LAYOUT_LY_LINES[n - 1]?.[li] ?? [];
  return <LayoutThumb lines={lines} active={false} w={size} h={size} />;
}

function SyncToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className="relative h-[18px] w-[32px] rounded-full shrink-0 transition-colors"
      style={{
        background: checked ? 'var(--accent)' : 'var(--line-strong)',
      }}
    >
      <span
        className="absolute top-[2px] h-[14px] w-[14px] rounded-full transition-transform"
        style={{
          left: checked ? 16 : 2,
          background: checked ? 'var(--cta-fg, var(--foreground))' : 'var(--text-muted)',
        }}
      />
    </button>
  );
}

/**
 * Obsidian Layouts panel — data-layout-v2 grammar (Live parity).
 */
export function LayoutPicker({
  layout,
  onLayoutChange,
  sync,
  onSyncChange,
  openSignal = 0,
}: LayoutPickerProps) {
  const [open, setOpen] = useState(false);
  const fromLayout = variantIndexForLayout(layout);
  const [pickN, setPickN] = useState(fromLayout.n);
  const [sel, setSel] = useState(fromLayout);

  useEffect(() => {
    const next = variantIndexForLayout(layout);
    setSel(next);
    if (!open) setPickN(next.n);
  }, [layout, open]);

  useEffect(() => {
    if (openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    const openLayouts = () => setOpen(true);
    window.addEventListener('talaria:open-layouts', openLayouts);
    return () => window.removeEventListener('talaria:open-layouts', openLayouts);
  }, []);

  const syncOnCount = useMemo(
    () => LAYOUT_SYNC_ITEMS.reduce((n, it) => n + (sync[it.key] ? 1 : 0), 0),
    [sync],
  );

  const variants = LAYOUT_LY_LINES[pickN - 1] ?? [];
  const subtitle = `${sel.n} panel${sel.n === 1 ? '' : 's'} · ${
    syncOnCount ? `${syncOnCount} synced` : 'sync off'
  }`;

  const apply = (n: number, li: number) => {
    setPickN(n);
    setSel({ n, li });
    onLayoutChange(layoutIdForVariant(n, li));
  };

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger
        title="Layouts"
        aria-label="Chart layout"
        data-tb-item="layout"
        data-tb-icon-btn="1"
        className="v8b-chrome-btn !h-9 !min-h-11 sm:!min-h-9 !w-9 !min-w-11 sm:!min-w-9 !px-0 justify-center rounded-[var(--radius-control)]"
      >
        <LayoutGlyph layout={layout} size={18} />
      </Popover.Trigger>
      <Popover.Content placement="bottom end" className="p-0 z-[100]">
        <Popover.Dialog
          data-v9-chrome="1"
          data-sdrop="1"
          data-layout-v2="1"
          data-chrome-win="layouts"
          className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[min(78dvh,560px)] overflow-hidden flex flex-col bg-[color:var(--surface)] border border-[color:var(--line)] rounded-[var(--radius-panel,8px)] shadow-none"
        >
          <div data-win-header="">
            <div data-win-icon="">
              <ChromeIcon n="layout" s={16} cl="var(--accent)" />
            </div>
            <div data-layout-win-titles="">
              <span data-win-title="">Layouts</span>
              <span data-layout-current="">{subtitle}</span>
            </div>
            <button
              type="button"
              aria-label="Close"
              data-brand-icon="1"
              className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center"
              onClick={() => setOpen(false)}
            >
              <ChromeIcon n="x" s={16} />
            </button>
          </div>

          <div data-layout-body="" className="tlr-scroll flex-1 min-h-0 overflow-y-auto">
            <div data-layout-h="">Panels</div>
            <div data-layout-counts="" role="group" aria-label="Panel count">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  type="button"
                  key={n}
                  data-active={pickN === n ? '1' : undefined}
                  aria-pressed={pickN === n}
                  className="min-h-11 sm:min-h-[30px]"
                  onClick={() => {
                    if (pickN === n) return;
                    apply(n, 0);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>

            <div data-layout-h="">
              {pickN} panel{pickN === 1 ? '' : 's'} · choose arrangement
            </div>
            <div data-layout-variants="">
              {variants.map((lines, li) => {
                const isAct = sel.n === pickN && sel.li === li;
                return (
                  <button
                    type="button"
                    key={li}
                    data-layout-tile=""
                    data-active={isAct ? '1' : undefined}
                    aria-label={`${pickN}-panel layout variant ${li + 1}`}
                    aria-pressed={isAct}
                    className="min-h-11 sm:min-h-0"
                    onClick={() => apply(pickN, li)}
                  >
                    <LayoutThumb lines={lines} active={isAct} />
                  </button>
                );
              })}
            </div>

            <div data-layout-h="">Sync</div>
            <div data-layout-hint="">{LAYOUT_SYNC_HELP}</div>
            <div data-layout-sync-block="">
              {LAYOUT_SYNC_ITEMS.map((item) => {
                const on = !!sync[item.key];
                const flip = () =>
                  onSyncChange({ ...sync, [item.key]: !sync[item.key] });
                return (
                  <div
                    key={item.key}
                    data-layout-sync-row=""
                    data-on={on ? '1' : undefined}
                    role="switch"
                    aria-checked={on}
                    tabIndex={0}
                    onClick={flip}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        flip();
                      }
                    }}
                  >
                    <div data-layout-sync-meta="">
                      <strong>{item.label}</strong>
                      <em>{item.hint}</em>
                    </div>
                    <SyncToggle
                      checked={on}
                      label={`Sync ${item.label}`}
                      onChange={(v) =>
                        onSyncChange({ ...sync, [item.key]: v })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
