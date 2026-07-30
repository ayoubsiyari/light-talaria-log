import { useState } from 'react';
import { IndicatorSettingsModal } from '@/components/indicators/IndicatorSettingsModal';
import { formatIndicatorLabel, getIndicatorDef } from '@/indicators/defs';
import type { EnabledIndicator, IndicatorId } from '@/types/indicator';

interface OverlayIndicatorsProps {
  enabled: readonly EnabledIndicator[];
  belowVolume: boolean;
  onChange: (next: EnabledIndicator[]) => void;
}

/** Vertical TradingView-style indicator legend under OHLC. */
export function OverlayIndicators({
  enabled,
  belowVolume,
  onChange,
}: OverlayIndicatorsProps) {
  const [settingsId, setSettingsId] = useState<IndicatorId | null>(null);

  if (enabled.length === 0) return null;

  const top = belowVolume ? 'top-12' : 'top-7';
  const settingsItem = settingsId ? enabled.find((e) => e.id === settingsId) : null;

  const patch = (id: IndicatorId, next: Partial<EnabledIndicator>) => {
    onChange(enabled.map((e) => (e.id === id ? { ...e, ...next } : e)));
  };

  const remove = (id: IndicatorId) => {
    onChange(enabled.filter((e) => e.id !== id));
  };

  return (
    <>
      <div
        className={`absolute left-2 ${top} z-20 pointer-events-auto flex flex-col items-start gap-0.5 max-w-[min(18rem,calc(100%-1rem))] max-h-[min(45dvh,20rem)] overflow-y-auto overscroll-contain`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {enabled.map((e) => {
          const def = getIndicatorDef(e.id);
          const visible = e.visible !== false;
          return (
            <LegendRow
              key={e.id}
              label={formatIndicatorLabel(e.id, e.params)}
              title={def.label}
              swatchColor={e.colors?.[0]}
              visible={visible}
              onToggleVisible={() => patch(e.id, { visible: !visible })}
              onSettings={() => setSettingsId(e.id)}
              onRemove={() => remove(e.id)}
            />
          );
        })}
      </div>

      {settingsItem && (
        <IndicatorSettingsModal
          indicator={settingsItem}
          onClose={() => setSettingsId(null)}
          onSave={(next) => {
            onChange(enabled.map((e) => (e.id === next.id ? next : e)));
          }}
        />
      )}
    </>
  );
}

function LegendRow({
  label,
  title,
  swatchColor,
  visible,
  onToggleVisible,
  onSettings,
  onRemove,
}: {
  label: string;
  title: string;
  swatchColor?: string;
  visible: boolean;
  onToggleVisible: () => void;
  onSettings: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={[
        'group flex items-center gap-0.5 pl-0.5 pr-0.5 rounded-md text-[11px] min-h-7',
        // Idle: label only. Hover/focus: chrome + actions (TV-style).
        'bg-transparent border border-transparent shadow-none',
        'hover:bg-surface/95 hover:border-border hover:shadow-sm hover:pl-1.5',
        'focus-within:bg-surface/95 focus-within:border-border focus-within:shadow-sm focus-within:pl-1.5',
        // Touch: no hover — keep controls reachable
        '[@media(hover:none)]:bg-surface/90 [@media(hover:none)]:border-border [@media(hover:none)]:shadow-sm [@media(hover:none)]:pl-1.5',
        visible ? '' : 'opacity-55',
      ].join(' ')}
      title={title}
    >
      <span
        className={['w-2 h-2 rounded-full shrink-0', swatchColor ? '' : 'bg-accent'].join(' ')}
        style={swatchColor ? { backgroundColor: swatchColor } : undefined}
      />

      <span className="font-medium text-foreground truncate max-w-[9.5rem] px-1">{label}</span>

      <div
        className={[
          'flex items-center shrink-0',
          'opacity-0 pointer-events-none w-0 overflow-hidden',
          'group-hover:opacity-100 group-hover:pointer-events-auto group-hover:w-auto group-hover:overflow-visible',
          'group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-focus-within:w-auto group-focus-within:overflow-visible',
          '[@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:w-auto [@media(hover:none)]:overflow-visible',
        ].join(' ')}
      >
        <IconButton title={visible ? 'Hide' : 'Show'} ariaLabel={`${visible ? 'Hide' : 'Show'} ${label}`} onClick={onToggleVisible}>
          {visible ? <IconEye /> : <IconEyeOff />}
        </IconButton>
        <IconButton title="Settings" ariaLabel={`Settings ${label}`} onClick={onSettings}>
          <IconGear />
        </IconButton>
        <IconButton title="Remove" ariaLabel={`Remove ${label}`} onClick={onRemove}>
          <IconTrash />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  title,
  ariaLabel,
  onClick,
  children,
}: {
  title: string;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="min-h-8 min-w-8 sm:min-h-7 sm:min-w-7 rounded flex items-center justify-center text-muted hover:text-foreground hover:bg-background/70"
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function IconEye() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 003.0 3.0" />
      <path d="M9.9 5.1A10.5 10.5 0 0122 12s-1.5 2.6-4.2 4.4" />
      <path d="M6.1 6.1C3.9 7.7 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.6-.6" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c.4.6 1 1 1.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
