import { MORE_SURFACES } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';

interface ExplorationsProps {
  onStartFree: () => void;
}

export function Explorations({ onStartFree }: ExplorationsProps) {
  return (
    <section id="how" className="bg-bg py-16 md:py-24">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 lg:px-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-text-primary md:text-5xl">
          More of the terminal
        </h2>
        <p className="mt-4 max-w-md text-sm text-muted md:text-base">
          Orders, news, and indicators sit next to the chart — not in a third-party widget.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {MORE_SURFACES.map((item) => (
            <figure
              key={item.title}
              className="overflow-hidden rounded-2xl border border-stroke bg-surface"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={item.image}
                  alt=""
                  className="landing-shot-pan h-full w-full object-cover object-top"
                  loading="lazy"
                />
              </div>
              <figcaption className="px-4 py-3">
                <p className="font-display text-sm font-semibold text-text-primary">{item.title}</p>
                <p className="mt-1 text-xs text-muted">{item.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10">
          <GradientHoverRing
            onClick={onStartFree}
            innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary"
          >
            Start free
          </GradientHoverRing>
        </div>
      </div>
    </section>
  );
}
