import { forwardRef } from 'react';

/**
 * Icon-sized fill color chip for the floating drawing toolbar.
 * Opens SettColorSwatch / ObsidianColorPanel via parent-managed picker,
 * or acts as the swatch trigger itself when used with SettColorSwatch.
 */
export const FillTriggerButton = forwardRef<
  HTMLButtonElement,
  {
    color: string;
    opacity?: number;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title?: string;
  }
>(function FillTriggerButton(
  {
    color,
    opacity = 1,
    onClick,
    active = false,
    disabled = false,
    title = 'Fill',
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={title}
      aria-label={title}
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
      <span
        className="relative block w-[16px] h-[16px] rounded-[3px] border border-border overflow-hidden"
        aria-hidden
      >
        {/* Checker so low-opacity fills stay visible */}
        <span
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-conic-gradient(var(--surface-raised, #141416) 0% 25%, var(--line) 0% 50%)',
            backgroundSize: '6px 6px',
          }}
        />
        <span
          className="absolute inset-0"
          style={{ backgroundColor: color, opacity }}
        />
      </span>
    </button>
  );
});
