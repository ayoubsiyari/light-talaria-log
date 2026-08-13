import { motion } from 'framer-motion';
import { FEATURES } from '@/components/landing/landingData';
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
          heading="Chart, replay, backtest"
          subtext="A custom Canvas engine that never owns the full dataset — worker parse, viewport bars, journaled fills. ≤2500 bars in memory; backtests and indicators on a Worker; 1m→1D without a freeze."
          action={
            <GradientHoverRing
              onClick={onOpen}
              innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary"
            >
              Open a session
            </GradientHoverRing>
          }
        />

        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-12 md:gap-6">
          {FEATURES.map((feature) => (
            <motion.div key={feature.id} {...reveal} className={feature.span}>
              <button
                type="button"
                onClick={onOpen}
                className={`relative block w-full overflow-hidden rounded-2xl border border-stroke bg-surface text-left ${feature.aspect}`}
              >
                <img
                  src={feature.image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-5 pt-16 pb-5">
                  <p className="font-display text-lg font-semibold text-text-primary md:text-xl">
                    {feature.title}
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-muted md:text-sm">{feature.body}</p>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
