import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { CHART_SHOT, HERO, HERO_VERBS, scrollToId } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';

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
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 1.1, delay: 0.1 },
      );
      tl.fromTo(
        '.blur-in',
        { opacity: 0, filter: 'blur(8px)', y: 16 },
        {
          opacity: 1,
          filter: 'blur(0px)',
          y: 0,
          duration: 0.9,
          stagger: 0.08,
          delay: 0.2,
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
      className="relative flex min-h-dvh items-center overflow-hidden px-6 pt-24 pb-16 md:pt-28"
    >
      <div className="relative z-10 mx-auto grid w-full max-w-[1200px] items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
        <div className="min-w-0 text-center lg:text-left">
          <div className="name-reveal mb-6 flex justify-center lg:justify-start">
            <BrandLogo
              size={160}
              className="h-28 w-28 sm:h-36 sm:w-36 lg:h-40 lg:w-40"
            />
          </div>
          <h1 className="name-reveal mb-4 font-display text-4xl font-semibold leading-[0.95] tracking-tight text-text-primary sm:text-5xl md:text-6xl lg:text-7xl">
            Talaria-Log
          </h1>
          <p className="blur-in mb-4 text-base text-muted md:text-lg">
            Built to{' '}
            <span
              key={verbIndex}
              className="animate-role-fade-in inline-block font-display font-semibold text-text-primary"
            >
              {HERO_VERBS[verbIndex]}
            </span>{' '}
            history without freezing the tab.
          </p>
          <p className="blur-in mx-auto mb-8 max-w-xl text-sm text-muted lg:mx-0 md:text-base">
            {HERO.sub}
          </p>
          <div className="blur-in inline-flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center lg:w-auto">
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

        <div className="blur-in relative min-w-0">
          <div className="overflow-hidden rounded-2xl border border-stroke bg-surface shadow-lg shadow-black/40">
            <img
              src={CHART_SHOT}
              alt="EUR/USD 1-minute candlestick chart in Talaria-Log"
              className="block h-auto w-full object-cover object-left lg:min-h-[28rem]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
