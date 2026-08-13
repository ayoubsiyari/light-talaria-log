import { motion } from 'framer-motion';
import { SHOWCASES } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { SectionHeader } from '@/components/landing/SectionHeader';

interface SelectedWorksProps {
  onOpen: () => void;
}

export function SelectedWorks({ onOpen }: SelectedWorksProps) {
  return (
    <section id="features" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 lg:px-16">
        <SectionHeader
          heading="Chart, replay, backtest"
          subtext="A custom Canvas engine that never owns the full dataset — worker parse, viewport bars, journaled fills."
          action={
            <GradientHoverRing
              onClick={onOpen}
              innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary"
            >
              Open a session
            </GradientHoverRing>
          }
        />

        <div className="flex flex-col gap-16 md:gap-24">
          {SHOWCASES.map((item, i) => {
            const reverse = i % 2 === 1;
            return (
              <motion.article
                key={item.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
                className={[
                  'grid items-center gap-8 md:grid-cols-2 md:gap-12',
                  reverse ? 'md:[&>div:first-child]:order-2' : '',
                ].join(' ')}
              >
                <div>
                  <h3 className="font-display text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
                    {item.title}
                  </h3>
                  <p className="mt-3 max-w-md text-sm text-muted md:text-base">{item.body}</p>
                  <GradientHoverRing
                    onClick={onOpen}
                    className="mt-6"
                    innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary"
                  >
                    Start free
                  </GradientHoverRing>
                </div>
                <div className="overflow-hidden rounded-2xl border border-stroke bg-surface">
                  <div className="relative aspect-[16/10]">
                    <img
                      src={item.image}
                      alt={item.alt}
                      className="landing-shot-pan absolute inset-0 h-full w-full object-cover object-top"
                      loading="lazy"
                    />
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
