import { useEffect, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { featuresCopy } from '@landing-content/features';
import { finalCtaCopy } from '@landing-content/finalCta';
import { heroCopy } from '@landing-content/hero';
import { howItWorksCopy } from '@landing-content/howItWorks';
import { trustCopy } from '@landing-content/trust';

interface MarketingHomeProps {
  onStartFree: () => void;
  /** Open the app (sessions). No auth in Phase 1. */
  onOpenApp: () => void;
}

const PATH =
  'M28 250 C70 248 95 220 130 210 C170 198 190 240 230 200 C270 160 300 120 340 130 C380 140 400 90 440 70 C480 50 510 95 532 60';

/**
 * Marketing home — Hero UI surfaces, buttons, cards, and semantic tokens only.
 */
export function MarketingHome({ onStartFree, onOpenApp }: MarketingHomeProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToHow = () => {
    document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <header
        className={[
          'fixed inset-x-0 top-0 z-50 transition-[height,background-color,border-color] duration-200',
          scrolled
            ? 'h-14 border-b border-border bg-surface/90 backdrop-blur-md'
            : 'h-16 border-b border-transparent bg-transparent',
        ].join(' ')}
      >
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <BrandLogo size={scrolled ? 26 : 30} />
            <span className="text-sm font-semibold tracking-tight truncate">
              Talaria<span className="text-accent">-</span>Log
            </span>
          </div>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {[
              ['#features', 'Features'],
              ['#how', 'How it works'],
              ['#final-cta', 'Get started'],
            ].map(([href, label]) => (
              <Button
                key={href}
                variant="ghost"
                size="sm"
                className="min-h-11"
                onPress={() => {
                  document
                    .getElementById(href!.slice(1))
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                {label}
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <Button
              variant="secondary"
              className="min-h-11 hidden sm:inline-flex"
              onPress={onOpenApp}
            >
              Open app
            </Button>
            <Button variant="primary" className="min-h-11" onPress={onStartFree}>
              Start free
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 sm:px-6 pb-16 pt-24 sm:pt-28 lg:pb-24">
          <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="min-w-0">
              <div className="mb-6 flex items-center gap-4">
                <BrandLogo
                  size={96}
                  className="h-20 w-20 sm:h-24 sm:w-24 shrink-0"
                />
                <div className="min-w-0 hidden sm:block">
                  <p className="text-xl font-semibold tracking-tight">
                    Talaria<span className="text-accent">-</span>Log
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                    Flight log for traders
                  </p>
                </div>
              </div>

              <p className="text-xs uppercase tracking-[0.16em] text-accent font-medium">
                {heroCopy.eyebrow}
              </p>
              <h1 className="mt-3 max-w-[18ch] text-[clamp(2rem,6vw,3.25rem)] font-semibold leading-[1.1] tracking-tight">
                {heroCopy.h1}
              </h1>
              <p className="mt-5 max-w-xl text-sm sm:text-base leading-relaxed text-muted">
                {heroCopy.sub}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  variant="primary"
                  size="lg"
                  className="min-h-11 px-6"
                  onPress={onStartFree}
                >
                  {heroCopy.primaryCta}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="min-h-11 px-6"
                  onPress={scrollToHow}
                >
                  {heroCopy.secondaryCta}
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted">{heroCopy.footnote}</p>
            </div>

            <div className="relative min-h-[260px]">
              <Card className="bg-surface border border-border overflow-hidden">
                <Card.Content className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap gap-3 text-xs font-medium tabular-nums">
                    <span className="text-success">{heroCopy.metrics.equity}</span>
                    <span className="text-foreground">{heroCopy.metrics.pf}</span>
                    <span className="text-danger">{heroCopy.metrics.maxDd}</span>
                  </div>
                  <svg
                    viewBox="0 0 560 360"
                    className="h-auto w-full"
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label="Sample equity curve"
                  >
                    <title>Sample backtest equity curve</title>
                    {[80, 160, 240, 320, 400, 480].map((x) => (
                      <line
                        key={x}
                        x1={x}
                        y1={24}
                        x2={x}
                        y2={320}
                        stroke="var(--border)"
                        strokeOpacity={0.7}
                      />
                    ))}
                    <path
                      d={PATH}
                      fill="none"
                      stroke="var(--success)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="rounded-md border border-border bg-background px-3 py-3">
                    <p className="text-xs font-medium">{heroCopy.journalCard.header}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {heroCopy.journalCard.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-muted italic leading-relaxed">
                      {heroCopy.journalCard.note}
                    </p>
                  </div>
                </Card.Content>
              </Card>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface/40" aria-label="Supported imports">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 sm:px-6 py-5 sm:flex-row sm:items-center sm:gap-8">
            <p className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted">
              {trustCopy.label}
            </p>
            <div className="flex min-w-0 flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {trustCopy.brokers.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="px-4 sm:px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="max-w-[22ch] text-2xl sm:text-3xl font-semibold tracking-tight">
              {featuresCopy.h2}
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
              {featuresCopy.cards.map((card) => (
                <Card
                  key={card.id}
                  className={[
                    'bg-surface border border-border',
                    card.wide ? 'lg:col-span-2' : '',
                  ].join(' ')}
                >
                  <Card.Content className="p-5 sm:p-6">
                    <BrandLogo size={20} />
                    <h3 className="mt-4 text-lg font-semibold tracking-tight">{card.title}</h3>
                    <p className="mt-2 text-sm text-muted leading-relaxed">{card.body}</p>
                  </Card.Content>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="px-4 sm:px-6 py-16 sm:py-20 border-t border-border">
          <ol className="mx-auto grid max-w-5xl gap-6 sm:gap-8 lg:grid-cols-3">
            {howItWorksCopy.steps.map((step) => (
              <li key={step.num}>
                <Card className="bg-surface border border-border h-full">
                  <Card.Content className="p-5 sm:p-6">
                    <p className="text-sm font-semibold text-accent">{step.num}</p>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-2 text-sm text-muted leading-relaxed">{step.body}</p>
                  </Card.Content>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section id="final-cta" className="px-4 sm:px-6 py-16 sm:py-20 border-t border-border">
          <Card className="mx-auto max-w-2xl bg-surface border border-border">
            <Card.Content className="px-6 py-10 sm:px-10 text-center space-y-5">
              <BrandLogo size={48} className="mx-auto" />
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                {finalCtaCopy.h2}
              </h2>
              <Button
                variant="primary"
                size="lg"
                className="min-h-12 px-10"
                onPress={onStartFree}
              >
                {finalCtaCopy.button}
              </Button>
              <p className="text-xs text-muted">{finalCtaCopy.footnote}</p>
            </Card.Content>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border px-4 sm:px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <BrandLogo size={22} />
            <span className="text-sm font-semibold tracking-tight">
              Talaria<span className="text-accent">-</span>Log
            </span>
            <span className="text-xs text-muted">© 2026</span>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-muted">
            Backtested results are hypothetical and not indicative of future performance.
          </p>
        </div>
      </footer>
    </div>
  );
}
