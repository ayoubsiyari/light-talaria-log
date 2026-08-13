import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { NAV_LINKS, scrollToId } from '@/components/landing/landingData';

interface NavbarProps {
  activeId: string;
  onSignIn: () => void;
}

export function Navbar({ activeId, onSignIn }: NavbarProps) {
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 100);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="fixed top-0 right-0 left-0 z-50 flex justify-center px-4 pt-4 md:pt-6">
      <nav
        aria-label="Primary"
        className={[
          'inline-flex max-w-full items-center rounded-full border border-white/10 bg-surface px-2 py-2 backdrop-blur-md',
          elevated ? 'shadow-md shadow-black/10' : '',
        ].join(' ')}
      >
        <button
          type="button"
          aria-label="Talaria-Log home"
          onClick={() => scrollToId('hero')}
          className="flex min-h-11 items-center gap-2 rounded-full px-1.5 pr-2"
        >
          <BrandLogo size={32} className="h-8 w-8 shrink-0" />
          <span className="hidden font-display text-sm font-semibold tracking-tight sm:inline">
            Talaria-Log
          </span>
        </button>

        <span className="mx-1 hidden h-5 w-px bg-stroke sm:block" aria-hidden="true" />

        <div className="flex items-center overflow-x-auto">
          {NAV_LINKS.map((link) => {
            const active = activeId === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollToId(link.id)}
                className={[
                  'min-h-11 rounded-full px-3 text-xs sm:px-4 sm:text-sm',
                  active
                    ? 'bg-stroke/50 text-text-primary'
                    : 'text-muted hover:bg-stroke/50 hover:text-text-primary',
                ].join(' ')}
              >
                {link.label}
              </button>
            );
          })}
        </div>

        <span className="mx-1 hidden h-5 w-px bg-stroke sm:block" aria-hidden="true" />

        <button
          type="button"
          onClick={onSignIn}
          className="group relative ml-0.5 inline-flex rounded-full"
        >
          <span
            className="accent-gradient pointer-events-none absolute rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ inset: -2 }}
          />
          <span className="relative z-[1] inline-flex min-h-11 items-center rounded-full bg-surface px-3 text-xs text-muted backdrop-blur-md group-hover:text-text-primary sm:px-4 sm:text-sm">
            Sign in
          </span>
        </button>
      </nav>
    </header>
  );
}
