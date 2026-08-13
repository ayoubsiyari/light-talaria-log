import { featuresCopy } from '@landing-content/features';
import { heroCopy } from '@landing-content/hero';
import { howItWorksCopy } from '@landing-content/howItWorks';
import { journalCopy } from '@landing-content/journal';

export const HLS_SRC =
  'https://stream.mux.com/Aa02T7oM1wH5Mk5EEVDYhbZ1ChcdhRsS2m1NYyx4Ua1g.m3u8';

export const LOADING_WORDS = ['Replay', 'Backtest', 'Journal'] as const;

export const HERO_VERBS = ['replay', 'backtest', 'journal', 'chart'] as const;

export const NAV_LINKS = [
  { id: 'hero', label: 'Home' },
  { id: 'features', label: 'Chart' },
  { id: 'journal', label: 'Journal' },
] as const;

export const FEATURES = [
  {
    id: featuresCopy.cards[0].id,
    title: featuresCopy.cards[0].title,
    body: featuresCopy.cards[0].body,
    variant: 'replay' as const,
    span: 'md:col-span-7',
    aspect: 'aspect-[16/10] md:aspect-[16/11]',
  },
  {
    id: featuresCopy.cards[1].id,
    title: featuresCopy.cards[1].title,
    body: featuresCopy.cards[1].body,
    variant: 'candles' as const,
    span: 'md:col-span-5',
    aspect: 'aspect-[16/10] md:aspect-[4/5]',
  },
  {
    id: featuresCopy.cards[2].id,
    title: featuresCopy.cards[2].title,
    body: featuresCopy.cards[2].body,
    variant: 'equity' as const,
    span: 'md:col-span-5',
    aspect: 'aspect-[16/10] md:aspect-[4/5]',
  },
  {
    id: featuresCopy.cards[4].id,
    title: featuresCopy.cards[4].title,
    body: featuresCopy.cards[4].body,
    variant: 'journal' as const,
    span: 'md:col-span-7',
    aspect: 'aspect-[16/10] md:aspect-[16/11]',
  },
] as const;

export const JOURNAL_ENTRIES = journalCopy.entries.map((entry) => ({
  instrument: entry.instrument,
  note: entry.note,
  pnl: entry.pnl,
  positive: entry.positive,
  date: entry.date,
  tags: entry.tags,
}));

export const SURFACES = [
  {
    title: howItWorksCopy.steps[0].title,
    body: howItWorksCopy.steps[0].body,
    variant: 'candles' as const,
    rotate: -6,
  },
  {
    title: howItWorksCopy.steps[1].title,
    body: howItWorksCopy.steps[1].body,
    variant: 'panes' as const,
    rotate: 4,
  },
  {
    title: howItWorksCopy.steps[2].title,
    body: howItWorksCopy.steps[2].body,
    variant: 'equity' as const,
    rotate: -3,
  },
  {
    title: 'Bar-by-bar replay',
    body: 'Step the right edge as the cursor. Viewport-only loads keep memory flat.',
    variant: 'replay' as const,
    rotate: 7,
  },
  {
    title: 'Drawings on the tape',
    body: 'Trend, fib, and levels live on the chart — not in a separate notebook.',
    variant: 'drawings' as const,
    rotate: -5,
  },
  {
    title: 'Session journal',
    body: journalCopy.sub,
    variant: 'journal' as const,
    rotate: 3,
  },
] as const;

/** Product facts (engine budgets), not customer claims. */
export const STATS = [
  { value: '≤2500', label: 'bars in viewport memory' },
  { value: 'Worker', label: 'backtests & indicators' },
  { value: '1m→1D', label: 'LOD without a freeze' },
] as const;

export const FOOTER_LINKS = [
  { label: 'Chart', id: 'features' },
  { label: 'Journal', id: 'journal' },
] as const;

export const HERO = heroCopy;

export const JOURNAL_COPY = journalCopy;

export const MARQUEE = 'REPLAY THE MARKET • KEEP THE RECEIPTS • ';

export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
