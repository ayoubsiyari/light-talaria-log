import '@fontsource/exo-2/latin-400.css';
import '@fontsource/exo-2/latin-600.css';
import '@fontsource/exo-2/latin-700.css';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ContactFooter } from '@/components/landing/ContactFooter';
import { Explorations } from '@/components/landing/Explorations';
import { HeroSection } from '@/components/landing/HeroSection';
import { JournalSection } from '@/components/landing/JournalSection';
import { LoadingScreen } from '@/components/landing/LoadingScreen';
import { Navbar } from '@/components/landing/Navbar';
import { SelectedWorks } from '@/components/landing/SelectedWorks';

interface MarketingHomeProps {
  /** Sign up (or open app if already signed in). Kept for App.tsx wiring. */
  onStartFree: () => void;
  /** Sign in (or open app if already signed in). Kept for App.tsx wiring. */
  onOpenApp: () => void;
}

const CONTRACT = `<!--
THESIS: The actual Talaria-Log chart is the door — official wing mark, product type, real screens for replay, journal, orders, news, indicators, and strategy.
OWN-WORLD: Near-black surfaces, Helvetica Now / Neue UI + Blauer Nue / Exo 2 display (same as V9 chrome), brand-blue gradient, framed product shots.
STORY: Visitor recognizes the trading tool, sees the chart and journal, and starts free.
FIRST VIEWPORT: 160px wing logo + Talaria-Log wordmark beside the EUR/USD 1m chart screenshot; Start free / See how it works.
FORM: Product-truth editorial shell. Seed key: brief-pinned.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

/**
 * Marketing home — editorial chrome, Talaria-Log product story.
 */
export function MarketingHome({
  onStartFree,
  onOpenApp,
}: MarketingHomeProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState('hero');

  const onLoadComplete = useCallback(() => setIsLoading(false), []);

  useEffect(() => {
    document.documentElement.classList.add('landing-active');
    document.documentElement.classList.toggle('landing-locked', isLoading);
    return () => {
      document.documentElement.classList.remove('landing-active', 'landing-locked');
    };
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;
    const ids = ['hero', 'features', 'journal', 'how', 'contact'] as const;
    const onScroll = () => {
      const marker = 140;
      let current: string = 'hero';
      let bestTop = -Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= marker && top >= bestTop) {
          bestTop = top;
          current = id;
        }
      }
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 16) {
        current = 'contact';
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isLoading]);

  return (
    <div className="landing-page min-h-dvh overflow-x-hidden bg-bg font-body text-text-primary">
      <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: CONTRACT }} />
      <AnimatePresence>
        {isLoading ? <LoadingScreen onComplete={onLoadComplete} /> : null}
      </AnimatePresence>
      <Navbar activeId={activeId} onSignIn={onOpenApp} />
      <main>
        <HeroSection ready={!isLoading} onStartFree={onStartFree} />
        <SelectedWorks onOpen={onStartFree} />
        <JournalSection onOpen={onStartFree} />
        <Explorations onStartFree={onStartFree} />
      </main>
      <ContactFooter onStartFree={onStartFree} onSignIn={onOpenApp} />
    </div>
  );
}
