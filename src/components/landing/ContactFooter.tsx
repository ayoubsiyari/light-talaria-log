import { BrandLogo } from '@/components/landing/BrandLogo';
import { CHART_SHOT, FOOTER_LINKS, scrollToId } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { finalCtaCopy } from '@landing-content/finalCta';
import { footerCopy } from '@landing-content/footer';

interface ContactFooterProps {
  onStartFree: () => void;
  onSignIn: () => void;
}

export function ContactFooter({ onStartFree, onSignIn }: ContactFooterProps) {
  return (
    <footer id="contact" className="relative overflow-hidden bg-bg pt-16 pb-8 md:pt-20 md:pb-12">
      <div className="absolute inset-0" aria-hidden="true">
        <img
          src={CHART_SHOT}
          alt=""
          className="landing-shot-pan h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-bg/80" />
      </div>

      <div className="relative z-10">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center px-6 py-12 text-center md:px-10">
          <BrandLogo size={72} className="mb-6 h-16 w-16 sm:h-[72px] sm:w-[72px]" />
          <h2 className="mb-3 max-w-xl font-display text-2xl font-semibold tracking-tight text-text-primary md:text-4xl">
            {finalCtaCopy.h2}
          </h2>
          <p className="mb-8 max-w-md text-sm text-muted">
            Create a free account to open sessions, replay bars, and journal fills.
          </p>
          <GradientHoverRing
            onClick={onStartFree}
            innerClassName="bg-text-primary px-8 py-3.5 text-base text-bg md:text-lg"
          >
            {finalCtaCopy.button}
          </GradientHoverRing>
          <p className="mt-4 text-xs text-muted">{finalCtaCopy.footnote}</p>
        </div>

        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-6 border-t border-stroke px-6 pt-8 md:flex-row md:px-10 lg:px-16">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer">
            {FOOTER_LINKS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToId(s.id)}
                className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-text-primary"
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-text-primary"
            >
              Sign in
            </button>
          </nav>
          <p className="max-w-md text-center text-xs leading-relaxed text-muted md:text-right">
            {footerCopy.disclaimer}
          </p>
        </div>
      </div>
    </footer>
  );
}
