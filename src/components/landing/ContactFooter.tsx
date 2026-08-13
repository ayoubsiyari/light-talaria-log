import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { FOOTER_LINKS, MARQUEE, scrollToId } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { HlsBackground } from '@/components/landing/HlsBackground';
import { finalCtaCopy } from '@landing-content/finalCta';
import { footerCopy } from '@landing-content/footer';

interface ContactFooterProps {
  onStartFree: () => void;
  onSignIn: () => void;
}

export function ContactFooter({ onStartFree, onSignIn }: ContactFooterProps) {
  const marqueeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = marqueeRef.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      gsap.to(el, {
        xPercent: -50,
        duration: 40,
        ease: 'none',
        repeat: -1,
      });
    }, el);

    return () => ctx.revert();
  }, []);

  const line = MARQUEE.repeat(10);

  return (
    <footer id="contact" className="relative overflow-hidden bg-bg pt-16 pb-8 md:pt-20 md:pb-12">
      <HlsBackground flipped overlayClassName="bg-black/60" />

      <div className="relative z-10">
        <div className="overflow-hidden py-6">
          <div
            ref={marqueeRef}
            className="flex w-max font-display text-4xl tracking-tight text-text-primary/80 italic whitespace-nowrap md:text-6xl lg:text-7xl"
          >
            <span>{line}</span>
            <span>{line}</span>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1200px] flex-col items-center px-6 py-12 text-center md:px-10">
          <h2 className="mb-6 max-w-xl text-2xl text-text-primary md:text-4xl">
            Open a session and run your first{' '}
            <span className="font-display italic">backtest</span>.
          </h2>
          <GradientHoverRing
            onClick={onStartFree}
            innerClassName="bg-surface px-8 py-3.5 text-base text-text-primary backdrop-blur-md md:text-lg"
          >
            {finalCtaCopy.button}
          </GradientHoverRing>
          <p className="mt-4 text-xs text-muted">{finalCtaCopy.footnote}</p>
        </div>

        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-6 px-6 md:flex-row md:px-10 lg:px-16">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer">
            {FOOTER_LINKS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToId(s.id)}
                className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-text-primary"
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-text-primary"
            >
              Sign in
            </button>
          </nav>
          <p className="max-w-md text-center text-xs leading-relaxed text-muted md:text-right">
            {footerCopy.disclaimer}
          </p>
        </div>
      </div>
    </footer>
  );
}
