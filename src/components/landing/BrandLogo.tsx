interface BrandLogoProps {
  /** Pixel size when className does not set width/height. */
  size?: number;
  className?: string;
}

/** Official TALARIA-LOG mark (three-bar wing). */
export function BrandLogo({ size = 32, className = '' }: BrandLogoProps) {
  return (
    <img
      src="/logo-07.png"
      alt="TALARIA-LOG"
      width={size}
      height={size}
      className={['inline-block select-none object-contain', className].filter(Boolean).join(' ')}
      draggable={false}
    />
  );
}
