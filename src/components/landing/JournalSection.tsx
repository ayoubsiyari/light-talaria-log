import { JOURNAL_ENTRIES } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { SectionHeader } from '@/components/landing/SectionHeader';

export function JournalSection() {
  return (
    <section id="journal" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 lg:px-16">
        <SectionHeader
          eyebrow="Journal"
          heading={
            <>
              Recent <span className="font-display italic">thoughts</span>
            </>
          }
          subtext="Notes on craft, systems, and the slow work of making things feel inevitable."
          action={
            <div className="hidden md:block">
              <GradientHoverRing innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary">
                View all →
              </GradientHoverRing>
            </div>
          }
        />

        <ul className="flex flex-col gap-3">
          {JOURNAL_ENTRIES.map((entry) => (
            <li key={entry.title}>
              <article className="flex flex-col items-stretch gap-4 rounded-[40px] border border-stroke bg-surface/30 p-4 transition-colors duration-300 hover:bg-surface sm:flex-row sm:items-center sm:gap-6 sm:rounded-full">
                <img
                  src={entry.image}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-full object-cover sm:h-20 sm:w-20"
                  loading="lazy"
                />
                <h3 className="min-w-0 flex-1 text-base text-text-primary sm:text-lg">
                  {entry.title}
                </h3>
                <div className="flex shrink-0 items-center justify-between gap-6 px-1 text-xs uppercase tracking-[0.16em] text-muted sm:justify-end sm:px-4">
                  <span>{entry.readTime}</span>
                  <span>{entry.date}</span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
