import { featuresCopy } from '@landing-content/features';
import { heroCopy } from '@landing-content/hero';
import { journalCopy } from '@landing-content/journal';

export const HERO_VERBS = ['replay', 'backtest', 'journal', 'chart'] as const;

export const NAV_LINKS = [
  { id: 'features', label: 'Chart' },
  { id: 'journal', label: 'Journal' },
  { id: 'how', label: 'Replay' },
] as const;

export const SHOWCASES = [
  {
    id: 'replay',
    title: featuresCopy.cards[0].title,
    body: featuresCopy.cards[0].body,
    image: '/landing/shot-chart.png',
    alt: 'EUR/USD 1-minute candlestick chart in replay',
  },
  {
    id: 'strategy',
    title: featuresCopy.cards[2].title,
    body: featuresCopy.cards[2].body,
    image: '/landing/shot-strategy.png',
    alt: 'Strategy node graph for entries and exits',
  },
] as const;

export const MORE_SURFACES = [
  {
    title: 'Order ticket',
    body: 'Market, limit, and stop with entries, stop, and targets on the same ticket.',
    image: '/landing/shot-order.png',
  },
  {
    title: 'News & calendar',
    body: 'Releases and headlines beside the tape.',
    image: '/landing/shot-news.png',
  },
  {
    title: 'Indicators',
    body: 'SMA, EMA, and the rest — add from the catalog, not a third-party chart lib.',
    image: '/landing/shot-indicators.png',
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

export const FOOTER_LINKS = [
  { label: 'Chart', id: 'features' },
  { label: 'Journal', id: 'journal' },
  { label: 'Replay', id: 'how' },
] as const;

export const HERO = heroCopy;

export const JOURNAL_COPY = journalCopy;

export const CHART_SHOT = '/landing/shot-chart.png';

export const HERO_BG_SHOT = '/landing/shot-hero-bg.png';

export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
