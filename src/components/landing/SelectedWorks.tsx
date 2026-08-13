import { motion } from 'framer-motion';
import { FEATURES } from '@/components/landing/landingData';
import { ChartStill } from '@/components/landing/ChartStill';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { SectionHeader } from '@/components/landing/SectionHeader';

const reveal = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-100px' as const },
  transition: { duration: 1, ease: [0.25, 0.1, 0.25, 1] as const },
};

interface SelectedWorksProps {
  onOpen: () => void;
}

export function SelectedWorks({ onOpen }: SelectedWorksProps) {
  return (
    <section id="features" className="bg-bg py-12 md:py-16">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 lg:px-16">
        <SectionHeader
          eyebrow="The tape"
          heading={
            <>
              Chart, replay, <span className="font-display italic">backtest</span>
            </>
          }
          subtext="A custom Canvas engine that never owns the full dataset — worker parse, viewport bars, journaled fills."
          action={
            <div className="hidden md:block">
              <GradientHoverRing
                onClick={onOpen}
                innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary"
              >
                Open a session →
              </GradientHoverRing>
            </div>
          }
        />

        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-12 md:gap-6">
          {FEATURES.map((feature) => (
            <motion.div key={feature.id} {...reveal} className={feature.span}>
              <button
                type="button"
                onClick={onOpen}
                className={`group relative block w-full overflow-hidden rounded-3xl border border-stroke bg-surface text-left ${feature.aspect}`}
              >
                <div className="absolute inset-0">
                  <ChartStill variant={feature.variant} />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pt-16 pb-5">
                  <p className="font-display text-lg italic text-text-primary md:text-xl">
                    {feature.title}
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted md:text-sm">{feature.body}</p>
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-bg/70 opacity-0 backdrop-blur-lg transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <span className="relative inline-flex rounded-full">
                    <span
                      className="landing-gradient-border pointer-events-none absolute rounded-full"
                      style={{ inset: -2 }}
                    />
                    <span className="relative z-[1] rounded-full bg-white px-5 py-2.5 text-sm text-bg">
                      Open — <span className="font-display italic">{feature.title}</span>
                    </span>
                  </span>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
