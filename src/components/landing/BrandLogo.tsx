interface BrandLogoProps {
  /** Display size in CSS pixels. */
  size?: number;
  className?: string;
  /**
   * `vector` (default) — tiny inline SVG, safe for chrome / repeated use.
   * `raster` — full PNG mark for marketing pages only (heavier decode).
   */
  variant?: 'vector' | 'raster';
}

/**
 * TALARIA-LOG mark (three-bar wing).
 * Prefer `vector` everywhere except large marketing heroes — never draw the
 * PNG onto the chart canvas (keeps chart memory low).
 */
export function BrandLogo({
  size = 28,
  className = '',
  variant = 'vector',
}: BrandLogoProps) {
  if (variant === 'raster') {
    return (
      <img
        src="/logo-07.png"
        alt="TALARIA-LOG"
        width={size}
        height={size}
        className={['inline-block select-none object-contain', className]
          .filter(Boolean)
          .join(' ')}
        draggable={false}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={['inline-block select-none shrink-0', className]
        .filter(Boolean)
        .join(' ')}
      aria-label="TALARIA-LOG"
      role="img"
    >
      <defs>
        <linearGradient id="talariaMarkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      {/* Three-bar wing — approximate of logo-07 mark */}
      <path
        fill="url(#talariaMarkGrad)"
        d="M8 18 L40 6 L48 14 L16 26 Z"
      />
      <path
        fill="url(#talariaMarkGrad)"
        d="M8 32 L36 20 L44 28 L44 40 L36 40 L16 40 Z"
      />
      <path
        fill="url(#talariaMarkGrad)"
        d="M8 46 L36 34 L44 42 L44 56 L36 56 L16 54 Z"
      />
    </svg>
  );
}
