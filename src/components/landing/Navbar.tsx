import { useEffect, useState } from 'react';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { NAV_LINKS, scrollToId } from '@/components/landing/landingData';

interface NavbarProps {
  activeId: string;
  onSignIn: () => void;
  onStartFree: () => void;
}

export function Navbar({ activeId, onSignIn, onStartFree }: NavbarProps) {
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={[
        'fixed top-0 right-0 left-0 z-50 border-b bg-bg/90 backdrop-blur-md',
        elevated ? 'border-stroke shadow-md shadow-black/20' : 'border-transparent',
      ].join(' ')}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 md:h-16 md:px-10 lg:px-16"
      >
        <button
          type="button"
          aria-label="Talaria-Log home"
          onClick={() => scrollToId('hero')}
          className="flex min-h-11 shrink-0 items-center gap-2"
        >
          <BrandLogo size={28} className="h-7 w-7 shrink-0" />
          <span className="hidden font-display text-sm font-semibold tracking-tight sm:inline">
            Talaria-Log
          </span>
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center overflow-x-auto">
          {NAV_LINKS.map((link) => {
            const active = activeId === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => scrollToId(link.id)}
                className={[
                  'min-h-11 shrink-0 rounded-lg px-3 text-sm',
                  active ? 'text-text-primary' : 'text-muted hover:text-text-primary',
                ].join(' ')}
              >
                {link.label}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={onSignIn}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted hover:text-text-primary"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={onStartFree}
            className="inline-flex min-h-11 items-center rounded-lg bg-text-primary px-4 text-sm text-bg"
          >
            Start free
          </button>
        </div>
      </nav>
    </header>
  );
}
