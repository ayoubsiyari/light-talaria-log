import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/landing/BrandLogo';

interface LoadingScreenProps {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(onComplete, reduced ? 200 : 900);
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return (
    <motion.div
      className="landing-overlay landing-page fixed inset-0 z-[9999] flex items-center justify-center"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      role="status"
      aria-live="polite"
      aria-label="Loading Talaria-Log"
    >
      <BrandLogo size={160} className="h-28 w-28 sm:h-40 sm:w-40" />
    </motion.div>
  );
}
