import { forwardRef } from 'react';
import type { DrawingStyle, LineStyleKind } from '@/drawings/drawingStyle';

function dashFor(kind: LineStyleKind): string | undefined {
  if (kind === 'dashed') return '4 3';
  if (kind === 'dotted') return '1.5 2.5';
  if (kind === 'dashdot') return '4 2.5 1.5 2.5';
  return undefined;
}

/**
 * Icon-sized TV-style trigger: one button with stroke (+ optional fill) preview.
 * Opens LineStylePickerFlyout when clicked.
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
  const strokeW = Math.min(3, Math.max(1.25, style.width));
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={`${title}: ${style.width}px`}
      disabled={disabled}
      onClick={onClick}
      className={[
        'min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 sm:h-8 px-1.5 rounded-md flex items-center justify-center transition-colors shrink-0',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
        active
          ? 'bg-accent/20 text-accent'
          : 'text-muted hover:text-foreground hover:bg-background/80',
      ].join(' ')}
    >
      <span className="relative block w-[18px] h-[18px]" aria-hidden>
        {/* Fill underlay (shapes) */}
        {showFill && (
          <span
            className="absolute inset-[3px] rounded-[2px]"
            style={{
              backgroundColor: fillColor || style.color,
              opacity: Math.max(0.2, fillOpacity),
            }}
          />
        )}
        {/* Stroke swatch */}
        <span
          className="absolute left-0 top-0 w-[10px] h-[10px] rounded-[2px] border border-border/80"
          style={{ backgroundColor: style.color, opacity: style.opacity }}
        />
        {/* Line style preview */}
        <svg
          className="absolute inset-x-0 bottom-[1px]"
          width="18"
          height="6"
          viewBox="0 0 18 6"
        >
          <line
            x1="1"
            y1="3"
            x2="17"
            y2="3"
            stroke={style.color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={dashFor(style.lineStyle)}
            opacity={style.opacity}
          />
        </svg>
      </span>
    </button>
  );
});
