/**
 * Toolbar / chrome icons — TradingView-like visual language:
 * thin 1.5 stroke, round caps, literal tool pictograms, ~2–3px padding in 28×28.
 * Custom paths (not TV’s proprietary assets).
 */

import type { ReactNode } from 'react';

type IconProps = { className?: string };

/** Display size on the drawing rail (~20px). Override in menus. */
const base = 'w-5 h-5 shrink-0';

/** Shared TV-style stroke attrs (28×28 viewBox → reads ~1.5px at 20px). */
const S = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Svg({
  className = base,
  children,
  filled,
}: IconProps & { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 28"
      fill={filled ? 'currentColor' : 'none'}
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function IconCursor({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M7 5.5l1.2 16.2 4.4-5.2 5.8 5.1 2.4-2.5-5.9-4.9L21.5 8.8 7 5.5z" />
    </Svg>
  );
}

/** Trend / line group — diagonal with endpoint dots (TV classic). */
export function IconTrendLine({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M5.5 20.5L22.5 7.5" />
      <circle cx="5.5" cy="20.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="22.5" cy="7.5" r="2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconFib({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M6 22V6h16" />
      <path {...S} d="M6 18.5h14M6 14.5h10M6 10.5h6" />
    </Svg>
  );
}

export function IconShapes({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <rect {...S} x="5" y="5" width="10" height="10" rx="1" />
      <circle {...S} cx="18.5" cy="18.5" r="4.5" />
    </Svg>
  );
}

/** Capital T — matches TV text tool. */
export function IconText({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M7 8h14M14 8v13" strokeWidth={1.75} />
    </Svg>
  );
}

/** Zigzag / pattern (TV “patterns” family). */
export function IconPattern({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M5 20l4.5-12 4 8 4.5-10L23 20" />
    </Svg>
  );
}

/** Ruler — TV measure tool. */
export function IconMeasure({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path
        {...S}
        d="M6.5 21.5L21.5 6.5l1.8 1.8-15 15-1.8-1.8z"
      />
      <path {...S} d="M9.2 18.8l1.4 1.4M12 16l1.4 1.4M14.8 13.2l1.4 1.4M17.6 10.4l1.4 1.4" />
    </Svg>
  );
}

export function IconZoom({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <circle {...S} cx="12" cy="12" r="7" />
      <path {...S} d="M22 22l-5-5M12 9v6M9 12h6" />
    </Svg>
  );
}

export function IconMagnet({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M8 12V8.5A3.5 3.5 0 0111.5 5H13v9H8zM15 14V5h1.5A3.5 3.5 0 0120 8.5V12" />
      <path {...S} d="M8 14a6 6 0 0012 0" />
    </Svg>
  );
}

export function IconTrash({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M6 8h16M10 8V6h8v2M9 8l1 14h8l1-14" />
    </Svg>
  );
}

export function IconEye({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M3.5 14s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S3.5 14 3.5 14z" />
      <circle {...S} cx="14" cy="14" r="2.75" />
    </Svg>
  );
}

export function IconLock({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <rect {...S} x="7" y="12" width="14" height="11" rx="1.5" />
      <path {...S} d="M10 12V9.5a4 4 0 018 0V12" />
    </Svg>
  );
}

export function IconCandles({ className = base }: IconProps) {
  return (
    <Svg className={className} filled>
      <rect x="5" y="10" width="3.5" height="9" rx="0.5" />
      <rect x="6.4" y="5" width="0.7" height="18" />
      <rect x="12.25" y="7" width="3.5" height="12" rx="0.5" />
      <rect x="13.65" y="4" width="0.7" height="20" />
      <rect x="19.5" y="11" width="3.5" height="8" rx="0.5" />
      <rect x="20.9" y="6" width="0.7" height="16" />
    </Svg>
  );
}

export function IconIndicators({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M5 20l4.5-9 4 5 4.5-11L23 17" />
    </Svg>
  );
}

export function IconPlay({ className = base }: IconProps) {
  return (
    <Svg className={className} filled>
      <path d="M9 6.5v15l12-7.5-12-7.5z" />
    </Svg>
  );
}

export function IconPause({ className = base }: IconProps) {
  return (
    <Svg className={className} filled>
      <rect x="7" y="6" width="4.5" height="16" rx="1" />
      <rect x="16.5" y="6" width="4.5" height="16" rx="1" />
    </Svg>
  );
}

export function IconStepBack({ className = base }: IconProps) {
  return (
    <Svg className={className} filled>
      <path d="M13 14l9-6.5v13L13 14zM6 7h2.5v14H6z" />
    </Svg>
  );
}

export function IconStepForward({ className = base }: IconProps) {
  return (
    <Svg className={className} filled>
      <path d="M15 14L6 7.5v13L15 14zM19.5 7H22v14h-2.5z" />
    </Svg>
  );
}

/**
 * Paintbrush — TV-style: handle + ferrule + angled bristles.
 */
export function IconBrush({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path
        {...S}
        d="M16.2 4.8c1.1-1.1 2.9-1.1 4 0s1.1 2.9 0 4L11.5 17.5l-4.2 1.2 1.2-4.2L16.2 4.8z"
      />
      <path {...S} d="M14.8 6.2l5 5" />
      <path {...S} d="M7.3 18.7l-2.5 2.5" />
    </Svg>
  );
}

export function IconPitchfork({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M5 22L14 5M14 5l5 10M14 5l-5 10M9 15h10" />
    </Svg>
  );
}

/** Stay in drawing mode — pencil + lock badge. */
export function IconStayDraw({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M5 18.5L16 7.5l4 4L9 22.5H5v-4z" />
      <rect {...S} x="17" y="16" width="6" height="7" rx="1" />
    </Svg>
  );
}

export function IconEyeOff({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path
        {...S}
        d="M4 4l20 20M12.2 12.5a2.75 2.75 0 003.3 3.3M11 6.4C11.9 6.1 12.9 6 14 6c7.5 0 11.5 8 11.5 8a20 20 0 01-4.8 5.2M7.5 7.5A20 20 0 002.5 14s4 8 11.5 8c1.4 0 2.6-.3 3.8-.7"
      />
    </Svg>
  );
}

/** Object tree — stacked list rows. */
export function IconObjectTree({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M5 7h18M5 14h18M5 21h12" />
      <circle cx="22" cy="21" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconChannel({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M5 17.5l18-8M5 22l18-8" />
      <circle cx="7" cy="16.6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="21" cy="10.4" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconGann({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <rect {...S} x="6" y="6" width="16" height="16" />
      <path {...S} d="M6 22L22 6M14 6v16M6 14h16" />
    </Svg>
  );
}

export function IconChevron({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M11 7l6 7-6 7" strokeWidth={2} />
    </Svg>
  );
}

export function IconPencil({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M16.5 5.5l5 5L10 22H5v-5L16.5 5.5z" />
      <path {...S} d="M14.5 7.5l5 5" />
    </Svg>
  );
}

export function IconSearch({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <circle {...S} cx="12.5" cy="12.5" r="7.5" />
      <path {...S} d="M23 23l-4-4" />
    </Svg>
  );
}

export function IconStar({ className = base, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg className={className} filled={filled}>
      <path
        {...(filled ? { fill: 'currentColor', stroke: 'none' } : S)}
        d="M14 4.5l2.9 5.9 6.5 1-4.7 4.6 1.1 6.5L14 19.4l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-1L14 4.5z"
      />
    </Svg>
  );
}

export function IconSettings({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <circle {...S} cx="14" cy="14" r="3.5" />
      <path
        {...S}
        d="M14 5.5v2.2M14 20.3v2.2M5.5 14h2.2M20.3 14h2.2M7.9 7.9l1.6 1.6M18.5 18.5l1.6 1.6M7.9 20.1l1.6-1.6M18.5 9.5l1.6-1.6"
      />
    </Svg>
  );
}

/** Smiley — TV “icons / stickers” group look. */
export function IconEmoji({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <circle {...S} cx="14" cy="14" r="9" />
      <circle cx="10.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <path {...S} d="M9.5 16.5c1.2 1.6 3 2.4 4.5 2.4s3.3-.8 4.5-2.4" />
    </Svg>
  );
}

/** Highlighter — flat tip for flyout items. */
export function IconHighlighter({ className = base }: IconProps) {
  return (
    <Svg className={className}>
      <path {...S} d="M8 20l10-10 3.5 3.5-7 7H8v-0.5z" />
      <path {...S} d="M16.5 11.5l2.2-4.8 2.6 2.6-4.8 2.2z" />
      <path {...S} d="M7 21h7" />
    </Svg>
  );
}
