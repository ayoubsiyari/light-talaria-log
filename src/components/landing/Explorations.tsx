import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SURFACES } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';

gsap.registerPlugin(ScrollTrigger);

interface ExplorationsProps {
  onStartFree: () => void;
}

export function Explorations({ onStartFree }: ExplorationsProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const colLeftRef = useRef<HTMLDivElement>(null);
  const colRightRef = useRef<HTMLDivElement>(null);

  const left = SURFACES.filter((_, i) => i % 2 === 0);
  const right = SURFACES.filter((_, i) => i % 2 === 1);

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    const colLeft = colLeftRef.current;
    const colRight = colRightRef.current;
    if (!section || !content || !colLeft || !colRight) return;

    const desktop = window.matchMedia('(min-width: 768px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    const ctx = gsap.context(() => {
      if (!desktop.matches) return;

      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        pin: content,
        pinSpacing: false,
      });

      if (reduced.matches) return;

      gsap.fromTo(
        colLeft,
        { y: 24 },
        {
          y: -220,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
          },
        },
      );
      gsap.fromTo(
        colRight,
        { y: -12 },
        {
          y: 180,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
          },
        },
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="how" className="relative bg-bg md:min-h-[300vh]">
      <div
        ref={contentRef}
        className="relative z-10 hidden h-screen flex-col items-center justify-center px-6 text-center md:flex"
      >
        <HowHeading onStartFree={onStartFree} />
      </div>

      <div className="px-6 py-16 text-center md:hidden">
        <HowHeading onStartFree={onStartFree} />
        <div className="mx-auto mt-10 grid max-w-sm grid-cols-2 gap-4">
          {SURFACES.map((item) => (
            <SurfaceCard key={item.title} item={item} compact />
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 hidden md:block">
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-[1400px] grid-cols-2 gap-24 px-10 lg:gap-40">
            <div ref={colLeftRef} className="flex flex-col items-start gap-24">
              {left.map((item) => (
                <SurfaceCard key={item.title} item={item} />
              ))}
            </div>
            <div ref={colRightRef} className="mt-16 flex flex-col items-end gap-24">
              {right.map((item) => (
                <SurfaceCard key={item.title} item={item} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowHeading({ onStartFree }: { onStartFree: () => void }) {
  return (
    <>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary md:text-5xl">
        How it works
      </h2>
      <p className="mx-auto mt-4 max-w-md text-sm text-muted md:text-base">
        Load bars, open a session, replay, backtest, and journal — the engine stays a dumb
        viewport renderer.
      </p>
      <GradientHoverRing
        onClick={onStartFree}
        className="mt-8"
        innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary"
      >
        Start free
      </GradientHoverRing>
    </>
  );
}

function SurfaceCard({
  item,
  compact = false,
}: {
  item: (typeof SURFACES)[number];
  compact?: boolean;
}) {
  return (
    <figure
      className={[
        'overflow-hidden rounded-2xl border border-stroke bg-surface text-left shadow-lg shadow-black/30',
        compact ? 'w-full' : 'w-full max-w-[280px] lg:max-w-[320px]',
      ].join(' ')}
      style={{ transform: `rotate(${compact ? item.rotate * 0.4 : item.rotate}deg)` }}
    >
      <div className="aspect-[4/3] overflow-hidden bg-black">
        <img src={item.image} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
      </div>
      <figcaption className="px-3 py-2 text-xs text-text-primary sm:text-sm">{item.title}</figcaption>
    </figure>
  );
}
