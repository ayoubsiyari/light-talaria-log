import { JOURNAL_COPY, JOURNAL_ENTRIES } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { SectionHeader } from '@/components/landing/SectionHeader';

interface JournalSectionProps {
  onOpen: () => void;
}

export function JournalSection({ onOpen }: JournalSectionProps) {
  return (
    <section id="journal" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 lg:px-16">
        <SectionHeader
          heading="Trades, written down"
          subtext={JOURNAL_COPY.sub}
          action={
            <GradientHoverRing
              onClick={onOpen}
              innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary"
            >
              Open journal
            </GradientHoverRing>
          }
        />

        <div className="mb-8 overflow-hidden rounded-2xl border border-stroke bg-surface">
          <img
            src="/landing/shot-journal.png"
            alt="Talaria-Log journal with open, pending, and closed trades"
            className="block h-auto w-full object-cover object-top"
          />
        </div>

        <ul className="flex flex-col gap-3">
          {JOURNAL_ENTRIES.map((entry) => (
            <li key={`${entry.instrument}-${entry.date}`}>
              <article className="flex flex-col items-stretch gap-4 rounded-[40px] border border-stroke bg-surface/30 p-4 transition-colors duration-300 hover:bg-surface sm:flex-row sm:items-center sm:gap-6 sm:rounded-full">
                <div
                  className={[
                    'flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-stroke text-sm font-medium sm:h-20 sm:w-20',
                    entry.positive ? 'text-text-primary' : 'text-muted',
                  ].join(' ')}
                >
                  {entry.instrument}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs uppercase tracking-[0.16em] text-muted">
                    Demonstration
                  </p>
                  <h3 className="text-base text-text-primary sm:text-lg">{entry.note}</h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                    {entry.tags.join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-6 px-1 text-xs uppercase tracking-[0.16em] sm:justify-end sm:px-4">
                  <span className={entry.positive ? 'text-text-primary' : 'text-muted'}>
                    {entry.pnl}
                  </span>
                  <span className="text-muted">{entry.date}</span>
                </div>
              </article>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-xl text-xs leading-relaxed text-muted">
          Sample journal rows — labeled as demonstration. Backtested results are hypothetical
          and not indicative of future performance.
        </p>
      </div>
    </section>
  );
}
