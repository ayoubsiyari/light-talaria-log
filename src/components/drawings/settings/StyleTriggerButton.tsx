import { forwardRef } from 'react';
import type { DrawingStyle, LineStyleKind } from '@/drawings/drawingStyle';

function dashFor(kind: LineStyleKind): string | undefined {
  if (kind === 'dashed') return '4 3';
  if (kind === 'dotted') return '1.5 2.5';
  return undefined;
}

/**
 * Compact TV-style trigger: color chip + line preview.
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
  }
>(function StyleTriggerButton(
  { style, onClick, active = false, disabled = false, title = 'Line style' },
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
        'min-h-11 sm:min-h-9 px-2 rounded-md border flex items-center gap-2 transition-colors',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
        active
          ? 'border-accent bg-accent/10'
          : 'border-border hover:border-accent/60 bg-background/60',
      ].join(' ')}
    >
      <span
        className="w-4 h-4 rounded-[3px] border border-border shrink-0"
        style={{ backgroundColor: style.color, opacity: style.opacity }}
      />
      <svg width="36" height="12" viewBox="0 0 36 12" className="shrink-0">
        <line
          x1="2"
          y1="6"
          x2="34"
          y2="6"
          stroke={style.color}
          strokeWidth={Math.max(1, style.width)}
          strokeLinecap="round"
          strokeDasharray={dashFor(style.lineStyle)}
          opacity={style.opacity}
        />
      </svg>
    </button>
  );
});
