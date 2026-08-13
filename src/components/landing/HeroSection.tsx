import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { Starfield } from '@/components/landing/Starfield';
import { HERO, HERO_BG_SHOT, HERO_VERBS, scrollToId } from '@/components/landing/landingData';
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
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.9, delay: 0.08 },
      );
      tl.fromTo(
        '.blur-in',
        { opacity: 0, filter: 'blur(8px)', y: 12 },
        {
          opacity: 1,
          filter: 'blur(0px)',
          y: 0,
          duration: 0.8,
          stagger: 0.07,
        },
        0.15,
      );
      gsap.to('.hero-logo', {
        y: 8,
        duration: 3.2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }, rootRef);

    return () => ctx.revert();
  }, [ready]);

  return (
    <section
      ref={rootRef}
      id="hero"
      className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-20 pb-12 md:pt-24 md:pb-16"
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <img
          src={HERO_BG_SHOT}
          alt=""
          className="hero-bg-shot absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="hero-bg-veil absolute inset-0" />
      </div>
      <Starfield />
      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center">
        <div className="flex max-w-2xl flex-col items-center text-center">
          <div className="name-reveal mb-6">
            <BrandLogo
              size={140}
              className="hero-logo h-24 w-24 sm:h-32 sm:w-32 lg:h-36 lg:w-36"
            />
          </div>
          <h1 className="name-reveal mb-4 font-display text-4xl font-semibold leading-[0.95] tracking-tight text-text-primary sm:text-5xl md:text-6xl">
            {HERO.h1}
          </h1>
          <p className="blur-in mb-3 text-base text-muted md:text-lg">
            Built to{' '}
            <span
              key={verbIndex}
              className="animate-role-fade-in inline-block font-display font-semibold text-text-primary"
            >
              {HERO_VERBS[verbIndex]}
            </span>{' '}
            history without freezing the tab.
          </p>
          <p className="blur-in mb-8 max-w-xl text-sm text-muted md:text-base">{HERO.sub}</p>
          <div className="blur-in flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:justify-center">
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
      </div>
    </section>
  );
}
