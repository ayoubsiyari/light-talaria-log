/** Compact SVG icons for chrome toolbars — no extra icon package. */

type IconProps = { className?: string };

/** TV-scale toolbar glyphs (~14px). Pass className to override in menus. */
const base = 'w-3.5 h-3.5 shrink-0';

export function IconCursor({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 4l7 16 2.5-6.5L20 11 4 4z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTrendLine({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 18L20 6" strokeLinecap="round" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" />
      <circle cx="20" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconFib({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 20V4h16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16h12M4 12h8M4 8h4" strokeLinecap="round" />
    </svg>
  );
}

export function IconShapes({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <circle cx="16" cy="16" r="4" />
    </svg>
  );
}

export function IconText({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 6h14M12 6v12M8 18h8" strokeLinecap="round" />
    </svg>
  );
}

export function IconPattern({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 18l4-10 4 6 4-8 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMeasure({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 21L21 3" strokeLinecap="round" />
      <path d="M7 17l2 2M11 13l2 2M15 9l2 2" strokeLinecap="round" />
    </svg>
  );
}

export function IconZoom({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="6" />
      <path d="M20 20l-4.5-4.5M10 7v6M7 10h6" strokeLinecap="round" />
    </svg>
  );
}

export function IconMagnet({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 10V7a2 2 0 012-2h1v7H6zM15 12V5h1a2 2 0 012 2v3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 12a6 6 0 0012 0" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrash({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconEye({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function IconLock({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="11" width="14" height="10" rx="1.5" />
      <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
    </svg>
  );
}

export function IconCandles({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="8" width="3" height="8" rx="0.5" />
      <rect x="5.25" y="4" width="0.5" height="16" />
      <rect x="10.5" y="6" width="3" height="10" rx="0.5" />
      <rect x="11.75" y="3" width="0.5" height="18" />
      <rect x="17" y="9" width="3" height="7" rx="0.5" />
      <rect x="18.25" y="5" width="0.5" height="14" />
    </svg>
  );
}

export function IconIndicators({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 18l4-8 4 4 4-10 4 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPlay({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

export function IconPause({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function IconStepBack({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 12l8-6v12l-8-6zM5 6h2v12H5z" />
    </svg>
  );
}

export function IconStepForward({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 12L5 6v12l8-6zM17 6h2v12h-2z" />
    </svg>
  );
}

export function IconBrush({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 4l6 6-8 8H6v-6l8-8z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPitchfork({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 20L12 4M12 4l4 8M12 4l-4 8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

export function IconStayDraw({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 16l10-10 4 4L8 20H4v-4z" strokeLinejoin="round" />
      <rect x="15" y="14" width="5" height="6" rx="1" />
    </svg>
  );
}

export function IconEyeOff({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3l18 18M10.5 10.7a2.5 2.5 0 003 3M9.4 5.5C10.2 5.2 11.1 5 12 5c6.5 0 10 7 10 7a18 18 0 01-4.2 4.6M6.1 6.1A18 18 0 002 12s3.5 7 10 7c1.2 0 2.3-.2 3.3-.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconChannel({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 16l16-8M4 20l16-8" strokeLinecap="round" />
    </svg>
  );
}

export function IconGann({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="5" width="14" height="14" />
      <path d="M5 19L19 5M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconChevron({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPencil({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        d="M14.5 4.5l5 5L8 21H3v-5L14.5 4.5z"
        strokeLinejoin="round"
      />
      <path d="M12.5 6.5l5 5" strokeLinecap="round" />
    </svg>
  );
}

export function IconSearch({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconStar({ className = base, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8 6.7 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSettings({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c.3.6.9 1 1.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
