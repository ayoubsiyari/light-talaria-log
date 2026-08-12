import { forwardRef } from 'react';
import type { DrawingStyle, LineStyleKind } from '@/drawings/drawingStyle';

function dashFor(kind: LineStyleKind): string | undefined {
  if (kind === 'dashed') return '7 4';
  if (kind === 'dotted') return '2 4';
  if (kind === 'dashdot') return '7 4 2 4';
  return undefined;
}

/**
 * Compact TV-style trigger: stroke chip (+ optional fill) + line preview + width.
 * Opens the shared LineStylePickerFlyout when clicked.
 */
export const StyleTriggerButton = forwardRef<
  HTMLButtonElement,
  {
    style: Pick<DrawingStyle, 'color' | 'width' | 'lineStyle' | 'opacity'>;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title?: string;
    /** Show fill chip (rectangles / channels / shapes). */
    showFill?: boolean;
    fillColor?: string;
    fillOpacity?: number;
  }
>(function StyleTriggerButton(
  {
    style,
    onClick,
    active = false,
    disabled = false,
    title = 'Style',
    showFill = false,
    fillColor,
    fillOpacity = 0.2,
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        'min-h-11 sm:min-h-8 px-2 rounded-md border flex items-center gap-1.5 transition-colors shrink-0',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
        active
          ? 'border-accent bg-accent/10'
          : 'border-border hover:border-accent/60 bg-background/60',
      ].join(' ')}
    >
      <span
        className="w-4 h-4 rounded-[3px] border border-border shrink-0"
        style={{ backgroundColor: style.color, opacity: style.opacity }}
        title="Stroke"
      />
      {showFill && (
        <span
          className="w-4 h-4 rounded-[3px] border border-border shrink-0"
          style={{
            backgroundColor: fillColor || style.color,
            opacity: Math.max(0.15, fillOpacity),
          }}
          title="Fill"
        />
      )}
      <svg width="28" height="12" viewBox="0 0 28 12" className="shrink-0">
        <line
          x1="2"
          y1="6"
          x2="26"
          y2="6"
          stroke={style.color}
          strokeWidth={Math.max(1, style.width)}
          strokeLinecap="round"
          strokeDasharray={dashFor(style.lineStyle)}
          opacity={style.opacity}
        />
      </svg>
      <span className="text-[11px] tabular-nums text-muted leading-none">
        {style.width}px
      </span>
    </button>
  );
});
