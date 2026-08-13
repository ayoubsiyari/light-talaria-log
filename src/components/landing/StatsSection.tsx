import { motion } from 'framer-motion';
import { STATS } from '@/components/landing/landingData';

export function StatsSection() {
  return (
    <section id="engine" className="bg-bg py-16 md:py-24">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-6 md:grid-cols-3 md:gap-8 md:px-10 lg:px-16">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="text-center"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, delay: i * 0.12, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <p className="font-display text-5xl italic text-text-primary md:text-6xl lg:text-7xl">
              {stat.value}
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
