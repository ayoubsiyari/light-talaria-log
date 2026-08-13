import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { HERO, HERO_VERBS, scrollToId } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { HlsBackground } from '@/components/landing/HlsBackground';

interface HeroSectionProps {
  ready: boolean;
  onStartFree: () => void;
}

export function HeroSection({ ready, onStartFree }: HeroSectionProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [verbIndex, setVerbIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setVerbIndex((i) => (i + 1) % HERO_VERBS.length);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ready || !rootRef.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.fromTo(
        '.name-reveal',
        { opacity: 0, y: 50 },
        { opacity: 1, y: 0, duration: 1.2, delay: 0.1 },
      );
      tl.fromTo(
        '.blur-in',
        { opacity: 0, filter: 'blur(10px)', y: 20 },
        {
          opacity: 1,
          filter: 'blur(0px)',
          y: 0,
          duration: 1,
          stagger: 0.1,
          delay: 0.3,
        },
        0,
      );
    }, rootRef);

    return () => ctx.revert();
  }, [ready]);

  return (
    <section
      ref={rootRef}
      id="hero"
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6"
    >
      <HlsBackground />

      <div className="relative z-10 mx-auto max-w-4xl pt-24 pb-28 text-center md:pt-28">
        <p className="blur-in mb-8 text-xs uppercase tracking-[0.3em] text-muted">
          {HERO.eyebrow}
        </p>
        <h1 className="name-reveal mb-6 font-display text-5xl leading-[0.9] tracking-tight text-text-primary italic sm:text-6xl md:text-8xl lg:text-9xl">
          Talaria-Log
        </h1>
        <p className="blur-in mb-6 text-base text-muted md:text-lg">
          Built to{' '}
          <span
            key={verbIndex}
            className="animate-role-fade-in inline-block font-display italic text-text-primary"
          >
            {HERO_VERBS[verbIndex]}
          </span>{' '}
          history without freezing the tab.
        </p>
        <p className="blur-in mx-auto mb-12 max-w-xl text-sm text-muted md:text-base">
          {HERO.sub}
        </p>
        <div className="blur-in inline-flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
          <GradientHoverRing
            onClick={onStartFree}
            innerClassName="bg-text-primary px-7 py-3.5 text-sm text-bg transition-colors duration-300 group-hover:bg-bg group-hover:text-text-primary"
          >
            {HERO.primaryCta}
          </GradientHoverRing>
          <GradientHoverRing
            onClick={() => scrollToId('features')}
            innerClassName="border-2 border-stroke bg-bg px-7 py-3.5 text-sm text-text-primary transition-colors duration-300 group-hover:border-transparent"
          >
            {HERO.secondaryCta}
          </GradientHoverRing>
        </div>
        <p className="blur-in mt-4 text-xs text-muted">{HERO.footnote}</p>
      </div>

      <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Scroll</p>
        <div className="relative h-10 w-px overflow-hidden bg-stroke">
          <span className="absolute inset-x-0 h-4 bg-text-primary animate-scroll-down" />
        </div>
      </div>
    </section>
  );
}
