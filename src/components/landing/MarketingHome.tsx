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
THESIS: A dark editorial portfolio as the Talaria-Log door — full-bleed HLS atmosphere and a floating pill nav instead of a SaaS feature-grid homepage.
OWN-WORLD: Near-black HSL tokens, Inter + italic Instrument Serif, steel-blue accent gradient, hairline strokes, rounded-full chrome, bento project cards.
STORY: Visitor arrives through a 000–100 load, meets the name, scrolls selected work / journal / explorations, and reaches out.
FIRST VIEWPORT: Full-bleed muted video, centered serif name, cycling role line, two pill CTAs; floating top-center pill nav with TL mark; SCROLL indicator at the bottom.
FORM: Brief-pinned recreation of the specified portfolio landing (user-locked). Seed key: brief-pinned.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

/**
 * Marketing home — dark portfolio landing (brief-pinned visual world).
 */
export function MarketingHome({
  onStartFree: _onStartFree,
  onOpenApp: _onOpenApp,
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
    const ids = ['hero', 'work', 'resume'] as const;
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
      <Navbar activeId={activeId} />
      <main>
        <HeroSection ready={!isLoading} />
        <SelectedWorks />
        <JournalSection />
        <Explorations />
        <StatsSection />
      </main>
      <ContactFooter />
    </div>
  );
}
