export const HLS_SRC =
  'https://stream.mux.com/Aa02T7oM1wH5Mk5EEVDYhbZ1ChcdhRsS2m1NYyx4Ua1g.m3u8';

export const CONTACT_EMAIL = 'hello@talaria-log.com';

export const LOADING_WORDS = ['Design', 'Create', 'Inspire'] as const;

export const ROLES = ['Creative', 'Fullstack', 'Founder', 'Scholar'] as const;

export const NAV_LINKS = [
  { id: 'hero', label: 'Home' },
  { id: 'work', label: 'Work' },
  { id: 'resume', label: 'Resume' },
] as const;

export const PROJECTS = [
  {
    title: 'Automotive Motion',
    image: '/landing/work-automotive.jpg',
    span: 'md:col-span-7',
    aspect: 'aspect-[16/10] md:aspect-[16/11]',
  },
  {
    title: 'Urban Architecture',
    image: '/landing/work-architecture.jpg',
    span: 'md:col-span-5',
    aspect: 'aspect-[16/10] md:aspect-[4/5]',
  },
  {
    title: 'Human Perspective',
    image: '/landing/work-human.jpg',
    span: 'md:col-span-5',
    aspect: 'aspect-[16/10] md:aspect-[4/5]',
  },
  {
    title: 'Brand Identity',
    image: '/landing/work-brand.jpg',
    span: 'md:col-span-7',
    aspect: 'aspect-[16/10] md:aspect-[16/11]',
  },
] as const;

export const JOURNAL_ENTRIES = [
  {
    title: 'The quiet power of negative space',
    image: '/landing/journal-1.jpg',
    readTime: '4 min',
    date: 'Mar 12, 2026',
  },
  {
    title: 'Why motion should feel inevitable',
    image: '/landing/journal-2.jpg',
    readTime: '6 min',
    date: 'Feb 28, 2026',
  },
  {
    title: 'Building systems that breathe',
    image: '/landing/journal-3.jpg',
    readTime: '5 min',
    date: 'Feb 14, 2026',
  },
  {
    title: 'Notes on restraint',
    image: '/landing/journal-4.jpg',
    readTime: '3 min',
    date: 'Jan 30, 2026',
  },
] as const;

export const EXPLORATIONS = [
  {
    title: 'Chromatic Dust',
    image: '/landing/explore-1.jpg',
    rotate: -6,
  },
  {
    title: 'Mesh Horizon',
    image: '/landing/explore-2.jpg',
    rotate: 4,
  },
  {
    title: 'Soft Geometry',
    image: '/landing/explore-3.jpg',
    rotate: -3,
  },
  {
    title: 'Liquid Field',
    image: '/landing/explore-4.jpg',
    rotate: 7,
  },
  {
    title: 'Ember Grain',
    image: '/landing/explore-5.jpg',
    rotate: -5,
  },
  {
    title: 'Folded Light',
    image: '/landing/explore-6.jpg',
    rotate: 3,
  },
] as const;

export const STATS = [
  { value: '20+', label: 'Years Experience' },
  { value: '95+', label: 'Projects Done' },
  { value: '200%', label: 'Satisfied Clients' },
] as const;

export const SOCIALS = [
  { label: 'Twitter', href: 'https://twitter.com' },
  { label: 'LinkedIn', href: 'https://linkedin.com' },
  { label: 'Dribbble', href: 'https://dribbble.com' },
  { label: 'GitHub', href: 'https://github.com' },
] as const;

export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
