import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EXPLORATIONS } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';

gsap.registerPlugin(ScrollTrigger);

export function Explorations() {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const colLeftRef = useRef<HTMLDivElement>(null);
  const colRightRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<(typeof EXPLORATIONS)[number] | null>(null);

  const left = EXPLORATIONS.filter((_, i) => i % 2 === 0);
  const right = EXPLORATIONS.filter((_, i) => i % 2 === 1);

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    const colLeft = colLeftRef.current;
    const colRight = colRightRef.current;
    if (!section || !content || !colLeft || !colRight) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        pin: content,
        pinSpacing: false,
      });

      if (!reduced) {
        gsap.fromTo(
          colLeft,
          { y: 160 },
          {
            y: -280,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          },
        );
        gsap.fromTo(
          colRight,
          { y: -80 },
          {
            y: 220,
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          },
        );
      }
    }, section);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [lightbox]);

  return (
    <section
      ref={sectionRef}
      id="explorations"
      className="relative min-h-[300vh] overflow-hidden bg-bg"
    >
      <div
        ref={contentRef}
        className="relative z-10 flex h-screen flex-col items-center justify-center px-6 text-center"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="h-px w-8 bg-stroke" aria-hidden="true" />
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Explorations</p>
        </div>
        <h2 className="text-3xl tracking-tight text-text-primary md:text-5xl">
          Visual <span className="font-display italic">playground</span>
        </h2>
        <p className="mt-4 max-w-md text-sm text-muted md:text-base">
          Loose studies, motion tests, and images that never needed a brief.
        </p>
        <GradientHoverRing
          href="https://dribbble.com"
          className="mt-8"
          innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary"
        >
          Dribbble ↗
        </GradientHoverRing>
      </div>

      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="mx-auto grid h-full max-w-[1400px] grid-cols-2 items-center gap-12 px-4 md:gap-40 md:px-10">
          <div ref={colLeftRef} className="flex flex-col items-start gap-16 md:gap-28">
            {left.map((item) => (
              <ExploreCard key={item.title} item={item} onOpen={setLightbox} />
            ))}
          </div>
          <div ref={colRightRef} className="mt-24 flex flex-col items-end gap-16 md:mt-40 md:gap-28">
            {right.map((item) => (
              <ExploreCard key={item.title} item={item} onOpen={setLightbox} />
            ))}
          </div>
        </div>
      </div>

      {lightbox ? (
        <button
          type="button"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(null)}
          aria-label="Close image"
        >
          <img
            src={lightbox.image}
            alt={lightbox.title}
            className="max-h-[80vh] max-w-full rounded-2xl object-contain"
          />
        </button>
      ) : null}
    </section>
  );
}

function ExploreCard({
  item,
  onOpen,
}: {
  item: (typeof EXPLORATIONS)[number];
  onOpen: (item: (typeof EXPLORATIONS)[number]) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="pointer-events-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl border border-stroke bg-surface shadow-lg shadow-black/30"
      style={{ transform: `rotate(${item.rotate}deg)` }}
      aria-label={`Open ${item.title}`}
    >
      <img src={item.image} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
    </button>
  );
}
