import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ContactFooter } from '@/components/landing/ContactFooter';
import { Explorations } from '@/components/landing/Explorations';
import { HeroSection } from '@/components/landing/HeroSection';
import { JournalSection } from '@/components/landing/JournalSection';
import { LoadingScreen } from '@/components/landing/LoadingScreen';
import { Navbar } from '@/components/landing/Navbar';
import { SelectedWorks } from '@/components/landing/SelectedWorks';
import { StatsSection } from '@/components/landing/StatsSection';

interface MarketingHomeProps {
  /** Sign up (or open app if already signed in). Kept for App.tsx wiring. */
  onStartFree: () => void;
  /** Sign in (or open app if already signed in). Kept for App.tsx wiring. */
  onOpenApp: () => void;
}

const CONTRACT = `<!--
THESIS: A dark editorial door for Talaria-Log — full-bleed atmosphere and a floating pill nav, selling replay, backtest, journal, and a viewport chart.
OWN-WORLD: Near-black HSL tokens, Inter + italic Instrument Serif, steel-blue accent gradient, hairline strokes, rounded-full chrome, bento tape stills.
STORY: Visitor learns this is a trading chart/backtest/journal tool, sees the mechanism, and starts free.
FIRST VIEWPORT: Full-bleed muted video, centered serif Talaria-Log, cycling replay/backtest/journal/chart, Start free + See how it works; floating pill nav with TL + Sign in.
FORM: Brief-pinned editorial chrome, product-truth content. Seed key: brief-pinned.
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
    const ids = ['hero', 'features', 'journal'] as const;
    const onScroll = () => {
      let current: string = 'hero';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
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
        <StatsSection />
      </main>
      <ContactFooter onStartFree={onStartFree} onSignIn={onOpenApp} />
    </div>
  );
}
