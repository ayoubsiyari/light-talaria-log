import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LOADING_WORDS } from '@/components/landing/landingData';

interface LoadingScreenProps {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [count, setCount] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setCount(100);
      const t = window.setTimeout(onComplete, 200);
      return () => window.clearTimeout(t);
    }

    const duration = 2700;
    const start = performance.now();
    let raf = 0;
    let doneTimer = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setCount(Math.round(t * 100));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        doneTimer = window.setTimeout(onComplete, 400);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(doneTimer);
    };
  }, [onComplete]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setWordIndex((i) => (i + 1) % LOADING_WORDS.length);
    }, 900);
    return () => window.clearInterval(id);
  }, []);

  return (
    <motion.div
      className="landing-overlay landing-page fixed inset-0 z-[9999]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
      role="status"
      aria-live="polite"
      aria-label={`Loading ${count} percent`}
    >
      <motion.p
        className="absolute left-6 top-6 text-xs uppercase tracking-[0.3em] text-muted md:left-10 md:top-10"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
      >
        Talaria
      </motion.p>

      <div className="flex h-full items-center justify-center px-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={LOADING_WORDS[wordIndex]}
            className="font-display text-4xl italic text-text-primary/80 md:text-6xl lg:text-7xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {LOADING_WORDS[wordIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="absolute bottom-16 right-6 font-display text-6xl tabular-nums text-text-primary md:bottom-20 md:right-10 md:text-8xl lg:text-9xl">
        {String(count).padStart(3, '0')}
      </p>

      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-stroke/50">
        <div
          className="accent-gradient h-full origin-left"
          style={{
            transform: `scaleX(${count / 100})`,
            boxShadow: '0 0 8px color-mix(in srgb, var(--lp-grad-from) 35%, transparent)',
          }}
        />
      </div>
    </motion.div>
  );
}
