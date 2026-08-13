import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface SectionHeaderProps {
  heading: ReactNode;
  subtext: string;
  action?: ReactNode;
}

export function SectionHeader({ heading, subtext, action }: SectionHeaderProps) {
  return (
    <motion.div
      className="mb-10 flex flex-col gap-6 md:mb-14 md:flex-row md:items-end md:justify-between"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="max-w-xl">
        <h2 className="text-3xl leading-tight tracking-tight text-text-primary font-display font-semibold md:text-5xl">
          {heading}
        </h2>
        <p className="mt-4 max-w-md text-sm text-muted md:text-base">{subtext}</p>
      </div>
      {action}
    </motion.div>
  );
}
