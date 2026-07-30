interface WingTickProps {
  size?: number;
  className?: string;
  title?: string;
}

/** Chevron + upward wick — wing, candle, and plotted point in one mark. */
export function WingTick({ size = 16, className = '', title }: WingTickProps) {
  const decorative = !title;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M4.5 15.5 L11.2 8.8 L14.5 12.1 L19.2 4.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.2 4.2 L19.2 9.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="19.2" cy="4.2" r="1.6" fill="currentColor" />
    </svg>
  );
}
