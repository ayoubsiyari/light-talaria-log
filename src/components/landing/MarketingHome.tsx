import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { BrandLogo } from '@/components/landing/BrandLogo';
import { featuresCopy } from '@landing-content/features';
import { finalCtaCopy } from '@landing-content/finalCta';
import { heroCopy } from '@landing-content/hero';
import { howItWorksCopy } from '@landing-content/howItWorks';
import { trustCopy } from '@landing-content/trust';

interface MarketingHomeProps {
  onStartFree: () => void;
  onSignIn: () => void;
}

const PATH =
  'M28 250 C70 248 95 220 130 210 C170 198 190 240 230 200 C270 160 300 120 340 130 C380 140 400 90 440 70 C480 50 510 95 532 60';

export function MarketingHome({ onStartFree, onSignIn }: MarketingHomeProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="marketing-root min-h-dvh overflow-x-hidden text-[var(--m-parchment)]">
      <header
        className={[
          'fixed inset-x-0 top-0 z-50 transition-[height,background-color] duration-200',
          scrolled
            ? 'h-16 border-b border-[var(--m-hairline)] bg-[color-mix(in_srgb,var(--m-ink-raised)_88%,transparent)] backdrop-blur-md'
            : 'h-20 border-b border-transparent bg-transparent',
        ].join(' ')}
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={scrolled ? 28 : 34} />
            <span className="font-[family-name:var(--font-m-display)] text-[15px] font-semibold tracking-[0.02em]">
              TALARIA
              <span className="text-[var(--m-accent)]">-</span>
              LOG
            </span>
          </div>
          <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
            {[
              ['#features', 'Features'],
              ['#how', 'How it works'],
              ['#final-cta', 'Pricing'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="text-sm text-[var(--m-muted)] transition-colors hover:text-[var(--m-parchment)]"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="min-h-11 rounded-[4px] text-[var(--m-parchment)]"
              onPress={onSignIn}
            >
              Sign in
            </Button>
            <Button
              className="min-h-11 rounded-[4px] bg-[var(--m-accent)] font-medium text-white"
              onPress={onStartFree}
            >
              Start free
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="marketing-grid relative px-5 pb-16 pt-28 lg:px-8 lg:pb-24 lg:pt-36">
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-[52%_48%]">
            <div>
              <motion.div
                className="mb-8 flex items-center gap-5"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <BrandLogo
                  size={168}
                  className="h-[clamp(7.5rem,22vw,11.5rem)] w-[clamp(7.5rem,22vw,11.5rem)] drop-shadow-[0_0_48px_color-mix(in_srgb,var(--m-accent)_45%,transparent)]"
                />
                <div className="hidden min-w-0 sm:block">
                  <p className="font-[family-name:var(--font-m-display)] text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[0.04em]">
                    TALARIA
                    <span className="text-[var(--m-accent)]">-</span>
                    LOG
                  </p>
                  <p className="mt-1 font-[family-name:var(--font-m-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--m-muted)]">
                    Flight log for traders
                  </p>
                </div>
              </motion.div>

              <p className="font-[family-name:var(--font-m-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--m-accent)]">
                {heroCopy.eyebrow}
              </p>
              <h1 className="mt-4 max-w-[16ch] font-[family-name:var(--font-m-display)] text-[clamp(2.5rem,7vw,4.75rem)] font-bold leading-[1.05] tracking-[-0.03em]">
                {heroCopy.h1}
              </h1>
              <p className="mt-6 max-w-[62ch] text-base leading-relaxed text-[var(--m-muted)] lg:text-[17px]">
                {heroCopy.sub}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  className="min-h-11 rounded-[4px] bg-[var(--m-accent)] px-6 font-medium text-white"
                  onPress={onStartFree}
                >
                  {heroCopy.primaryCta}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="min-h-11 rounded-[4px] border-[var(--m-hairline)] text-[var(--m-parchment)]"
                  onPress={onStartFree}
                >
                  <Play size={16} className="mr-2" />
                  {heroCopy.secondaryCta}
                </Button>
              </div>
              <p className="mt-4 font-[family-name:var(--font-m-mono)] text-[13px] text-[var(--m-muted)]">
                {heroCopy.footnote}
              </p>
            </div>

            <div className="relative min-h-[280px] pb-16 sm:pb-10">
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle at 55% 45%, color-mix(in srgb, var(--m-accent) 16%, transparent), transparent 65%)',
                }}
              />
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -right-4 top-0 z-0 opacity-[0.12] sm:right-2 sm:top-2"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 0.12, scale: 1 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                <BrandLogo size={220} className="h-[180px] w-[180px] sm:h-[220px] sm:w-[220px]" />
              </motion.div>
              <svg
                viewBox="0 0 560 360"
                className="relative z-[1] h-auto w-full"
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
                    stroke="var(--m-hairline)"
                    strokeOpacity={0.45}
                  />
                ))}
                <motion.path
                  d={PATH}
                  fill="none"
                  stroke="var(--m-signal)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
                />
                <foreignObject x={28} y={28} width={220} height={72}>
                  <div className="space-y-1 font-[family-name:var(--font-m-mono)] text-[12px] leading-tight">
                    <p className="text-[var(--m-signal)]">{heroCopy.metrics.equity}</p>
                    <p>{heroCopy.metrics.pf}</p>
                    <p className="text-[var(--m-drawdown)]">{heroCopy.metrics.maxDd}</p>
                  </div>
                </foreignObject>
              </svg>
              <motion.div
                className="absolute -bottom-2 -right-1 z-[2] w-[min(100%,240px)] rounded-[6px] border border-[var(--m-hairline)] bg-[var(--m-logbook)] p-4 text-[var(--m-logbook-ink)] shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:-bottom-4 sm:-right-3 sm:w-[260px]"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <p className="font-[family-name:var(--font-m-mono)] text-[12px] font-medium">
                  {heroCopy.journalCard.header}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {heroCopy.journalCard.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-[2px] border border-[color-mix(in_srgb,var(--m-logbook-ink)_14%,transparent)] px-2 py-0.5 font-[family-name:var(--font-m-mono)] text-[11px]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm italic leading-relaxed text-[color-mix(in_srgb,var(--m-logbook-ink)_80%,transparent)]">
                  {heroCopy.journalCard.note}
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--m-hairline)]" aria-label="Supported imports">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-8 lg:px-8">
            <p className="shrink-0 font-[family-name:var(--font-m-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--m-muted)]">
              {trustCopy.label}
            </p>
            <div className="flex min-w-0 flex-wrap gap-x-8 gap-y-2 font-[family-name:var(--font-m-mono)] text-sm text-[var(--m-muted)]">
              {trustCopy.brokers.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="marketing-grid px-5 py-20 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-[1200px]">
            <h2 className="max-w-[18ch] font-[family-name:var(--font-m-display)] text-[clamp(1.75rem,4vw,2.875rem)] font-semibold tracking-[-0.03em]">
              {featuresCopy.h2}
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {featuresCopy.cards.map((card) => (
                <article
                  key={card.id}
                  className={[
                    'rounded-[6px] border border-[var(--m-hairline)] bg-[var(--m-ink-raised)] p-6',
                    card.wide ? 'lg:col-span-2' : '',
                  ].join(' ')}
                >
                  <BrandLogo size={20} />
                  <h3 className="mt-5 font-[family-name:var(--font-m-display)] text-[clamp(1.25rem,2vw,1.625rem)] font-semibold">
                    {card.title}
                  </h3>
                  <p className="mt-3 max-w-[62ch] text-sm text-[var(--m-muted)]">{card.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="marketing-grid px-5 py-20 lg:px-8 lg:py-32">
          <ol className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-3 lg:gap-8">
            {howItWorksCopy.steps.map((step) => (
              <li key={step.num}>
                <p className="font-[family-name:var(--font-m-mono)] text-sm font-semibold text-[var(--m-accent)]">
                  {step.num}
                </p>
                <h3 className="mt-3 font-[family-name:var(--font-m-display)] text-[clamp(1.25rem,2vw,1.625rem)] font-semibold">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-[62ch] text-sm text-[var(--m-muted)]">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="final-cta"
          className="marketing-grid relative overflow-hidden px-5 py-20 lg:px-8 lg:py-32"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]"
          >
            <BrandLogo size={320} className="h-[280px] w-[280px]" />
          </div>
          <div className="relative z-[1] mx-auto max-w-2xl text-center">
            <BrandLogo size={56} className="mx-auto mb-6" />
            <h2 className="font-[family-name:var(--font-m-display)] text-[clamp(1.75rem,4vw,2.875rem)] font-semibold tracking-[-0.03em]">
              {finalCtaCopy.h2}
            </h2>
            <div className="mt-8 flex flex-col overflow-hidden rounded-[6px] border border-[var(--m-hairline)] bg-[var(--m-ink-raised)] sm:flex-row">
              <input
                type="email"
                placeholder={finalCtaCopy.placeholder}
                aria-label="Email address"
                className="min-h-12 flex-1 border-0 bg-transparent px-4 text-[var(--m-parchment)] outline-none placeholder:text-[var(--m-muted)]"
              />
              <Button
                className="min-h-12 rounded-none bg-[var(--m-accent)] px-8 font-medium text-white"
                onPress={onStartFree}
              >
                {finalCtaCopy.button}
              </Button>
            </div>
            <p className="mt-4 font-[family-name:var(--font-m-mono)] text-[13px] text-[var(--m-muted)]">
              {finalCtaCopy.footnote}
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--m-hairline)] px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={22} />
            <span className="font-[family-name:var(--font-m-display)] text-sm font-semibold tracking-[0.02em]">
              TALARIA<span className="text-[var(--m-accent)]">-</span>LOG
            </span>
            <span className="font-[family-name:var(--font-m-mono)] text-xs text-[var(--m-muted)]">
              © 2026 TALARIA-LOG
            </span>
          </div>
          <p className="max-w-[62ch] font-[family-name:var(--font-m-mono)] text-[12px] leading-relaxed text-[var(--m-muted)]">
            Backtested results are hypothetical and not indicative of future performance.
          </p>
        </div>
      </footer>
    </div>
  );
}
