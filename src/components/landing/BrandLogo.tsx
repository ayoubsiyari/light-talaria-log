interface BrandLogoProps {
  /** Display size in CSS pixels. */
  size?: number;
  className?: string;
  /**
   * `raster` (default) — official PNG mark (`/logo-07.png`).
   * `vector` — tiny SVG approx for places that must avoid decoding the PNG.
   * Never draw either onto the chart canvas — use text “Talaria Log” there.
   */
  variant?: 'vector' | 'raster';
}

/**
 * Official TALARIA-LOG mark (three-bar wing).
 * Top bar uses the real PNG at a small display size; chart uses text only.
 */
export function BrandLogo({
  size = 28,
  className = '',
  variant = 'raster',
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

  // Lightweight SVG matching logo-07: three diagonals with vertical hooks on the right.
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
        <linearGradient id="talariaMarkGrad" x1="8%" y1="20%" x2="92%" y2="80%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#3730a3" />
        </linearGradient>
      </defs>
      <g fill="url(#talariaMarkGrad)">
        {/* Top bar */}
        <path d="M6 22 L42 4 L50 12 L38 18 L50 18 L50 28 L14 28 Z" />
        {/* Middle bar */}
        <path d="M6 36 L38 20 L46 28 L46 44 L14 44 Z" />
        {/* Bottom bar */}
        <path d="M6 50 L38 34 L46 42 L46 58 L14 58 Z" />
      </g>
    </svg>
  );
}
