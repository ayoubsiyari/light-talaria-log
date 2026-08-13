import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { CONTACT_EMAIL, SOCIALS } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { HlsBackground } from '@/components/landing/HlsBackground';

export function ContactFooter() {
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

  const phrase = 'BUILDING THE FUTURE • ';
  const line = phrase.repeat(10);

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
          <p className="mb-6 text-xs uppercase tracking-[0.3em] text-muted">Get in touch</p>
          <GradientHoverRing
            href={`mailto:${CONTACT_EMAIL}`}
            innerClassName="bg-surface px-8 py-3.5 text-base text-text-primary backdrop-blur-md md:text-lg"
          >
            {CONTACT_EMAIL}
          </GradientHoverRing>
        </div>

        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-6 px-6 md:flex-row md:px-10 lg:px-16">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Social">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="min-h-11 inline-flex items-center text-sm text-muted transition-colors hover:text-text-primary"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <p className="flex min-h-11 items-center gap-2 text-sm text-muted">
            <span
              className="inline-block h-2 w-2 rounded-full bg-emerald-400"
              style={{ animation: 'landing-pulse 1.8s ease-in-out infinite' }}
              aria-hidden="true"
            />
            Available for projects
          </p>
        </div>
      </div>
    </footer>
  );
}
