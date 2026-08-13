import { featuresCopy } from '@landing-content/features';
import { heroCopy } from '@landing-content/hero';
import { journalCopy } from '@landing-content/journal';

export const HERO_VERBS = ['replay', 'backtest', 'journal', 'chart'] as const;

export const NAV_LINKS = [
  { id: 'hero', label: 'Home' },
  { id: 'features', label: 'Chart' },
  { id: 'journal', label: 'Journal' },
  { id: 'how', label: 'How' },
] as const;

export const FEATURES = [
  {
    id: 'chart',
    title: featuresCopy.cards[1].title,
    body: featuresCopy.cards[1].body,
    image: '/landing/shot-chart.png',
    span: 'md:col-span-7',
    aspect: 'aspect-[16/10]',
  },
  {
    id: 'journal',
    title: featuresCopy.cards[4].title,
    body: featuresCopy.cards[4].body,
    image: '/landing/shot-journal.png',
    span: 'md:col-span-5',
    aspect: 'aspect-[4/5]',
  },
  {
    id: 'order',
    title: 'Order ticket',
    body: 'Market, limit, and stop with entries, stop, and targets on the same ticket.',
    image: '/landing/shot-order.png',
    span: 'md:col-span-5',
    aspect: 'aspect-[4/5]',
  },
  {
    id: 'strategy',
    title: featuresCopy.cards[2].title,
    body: featuresCopy.cards[2].body,
    image: '/landing/shot-strategy.png',
    span: 'md:col-span-7',
    aspect: 'aspect-[16/10]',
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
    title: 'Fast canvas chart',
    body: featuresCopy.cards[1].body,
    image: '/landing/shot-chart.png',
    rotate: -5,
  },
  {
    title: 'Session journal',
    body: featuresCopy.cards[4].body,
    image: '/landing/shot-journal.png',
    rotate: 4,
  },
  {
    title: 'Order ticket',
    body: 'Place, manage, and journal from one ticket.',
    image: '/landing/shot-order.png',
    rotate: -3,
  },
  {
    title: 'News & calendar',
    body: 'Releases and headlines beside the tape.',
    image: '/landing/shot-news.png',
    rotate: 6,
  },
  {
    title: 'Indicators',
    body: 'SMA, EMA, and the rest — add from the catalog, not a third-party chart lib.',
    image: '/landing/shot-indicators.png',
    rotate: -4,
  },
  {
    title: 'Strategy builder',
    body: 'Node graph for entries, exits, and structure — then backtest it.',
    image: '/landing/shot-strategy.png',
    rotate: 3,
  },
] as const;

export const FOOTER_LINKS = [
  { label: 'Chart', id: 'features' },
  { label: 'Journal', id: 'journal' },
  { label: 'How', id: 'how' },
] as const;

export const HERO = heroCopy;

export const JOURNAL_COPY = journalCopy;

export const CHART_SHOT = '/landing/shot-chart.png';

export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
