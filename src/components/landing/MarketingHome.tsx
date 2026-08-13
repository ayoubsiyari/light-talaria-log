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
THESIS: A product homepage for a replay/backtest/journal chart — FX Replay information order, TradingView-scale screenshot, Talaria-Log facts only.
OWN-WORLD: Near-black bar chrome, Helvetica Now + Exo 2, brand-blue CTAs, framed product shots, starfield behind the mark.
STORY: Visitor sees the chart, understands replay + journal, starts free.
FIRST VIEWPORT: Sticky top bar, wing mark, headline, Start free, then a full-width EUR/USD 1m screenshot.
FORM: Category-standard trading-tool homepage. Seed key: canon-fxreplay-tradingview.
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
      <Navbar activeId={activeId} onSignIn={onOpenApp} onStartFree={onStartFree} />
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
