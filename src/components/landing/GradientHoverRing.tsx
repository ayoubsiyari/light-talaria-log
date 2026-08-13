import type { ReactNode } from 'react';

interface GradientHoverRingProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}

export function GradientHoverRing({
  children,
  className = '',
  innerClassName = '',
  href,
  onClick,
  type = 'button',
  ariaLabel,
}: GradientHoverRingProps) {
  const inner = (
    <>
      <span
        className="accent-gradient pointer-events-none absolute rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ inset: -2 }}
      />
      <span
        className={[
          'relative z-[1] inline-flex min-h-11 items-center justify-center rounded-full',
          innerClassName,
        ].join(' ')}
      >
        {children}
      </span>
    </>
  );

  const shared = [
    'group relative rounded-full outline-none transition-transform duration-300',
    'hover:scale-105 focus-visible:scale-105',
    className.includes('hidden') ? className : `inline-flex ${className}`,
  ].join(' ');

  if (href) {
    return (
      <a href={href} className={shared} aria-label={ariaLabel} onClick={onClick}>
        {inner}
      </a>
    );
  }

  return (
    <button type={type} className={shared} aria-label={ariaLabel} onClick={onClick}>
      {inner}
    </button>
  );
}
