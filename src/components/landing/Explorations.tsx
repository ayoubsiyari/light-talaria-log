import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SURFACES } from '@/components/landing/landingData';
import { ChartStill, type ChartStillVariant } from '@/components/landing/ChartStill';
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
  const [open, setOpen] = useState<(typeof SURFACES)[number] | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

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
            <SurfaceCard key={item.title} item={item} onOpen={setOpen} compact />
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 hidden md:block">
        <div className="sticky top-0 flex h-screen items-center">
          <div className="mx-auto grid w-full max-w-[1400px] grid-cols-2 gap-24 px-10 lg:gap-40">
            <div ref={colLeftRef} className="flex flex-col items-start gap-24">
              {left.map((item) => (
                <SurfaceCard key={item.title} item={item} onOpen={setOpen} />
              ))}
            </div>
            <div ref={colRightRef} className="mt-16 flex flex-col items-end gap-24">
              {right.map((item) => (
                <SurfaceCard key={item.title} item={item} onOpen={setOpen} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpen(null)}
          aria-label="Close"
        >
          <div className="w-full max-w-lg rounded-3xl border border-stroke bg-surface p-4 text-left">
            <div className="aspect-[16/10] overflow-hidden rounded-2xl">
              <ChartStill variant={open.variant} />
            </div>
            <p className="mt-4 font-display text-2xl italic text-text-primary">{open.title}</p>
            <p className="mt-2 text-sm text-muted">{open.body}</p>
          </div>
        </button>
      ) : null}
    </section>
  );
}

function HowHeading({ onStartFree }: { onStartFree: () => void }) {
  return (
    <>
      <div className="mb-5 flex items-center justify-center gap-3">
        <span className="h-px w-8 bg-stroke" aria-hidden="true" />
        <p className="text-xs uppercase tracking-[0.3em] text-muted">Workflow</p>
      </div>
      <h2 className="text-3xl tracking-tight text-text-primary md:text-5xl">
        How it <span className="font-display italic">works</span>
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
  onOpen,
  compact = false,
}: {
  item: (typeof SURFACES)[number];
  onOpen: (item: (typeof SURFACES)[number]) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={[
        'pointer-events-auto overflow-hidden rounded-2xl border border-stroke bg-surface text-left shadow-lg shadow-black/30',
        compact ? 'w-full' : 'w-full max-w-[280px] lg:max-w-[320px]',
      ].join(' ')}
      style={{ transform: `rotate(${compact ? item.rotate * 0.4 : item.rotate}deg)` }}
    >
      <div className="aspect-square">
        <ChartStill variant={item.variant as ChartStillVariant} />
      </div>
      <p className="px-3 py-2 text-xs text-text-primary sm:text-sm">{item.title}</p>
    </button>
  );
}
