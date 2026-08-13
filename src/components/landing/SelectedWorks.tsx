import { motion } from 'framer-motion';
import { PROJECTS } from '@/components/landing/landingData';
import { GradientHoverRing } from '@/components/landing/GradientHoverRing';
import { SectionHeader } from '@/components/landing/SectionHeader';

const reveal = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-100px' as const },
  transition: { duration: 1, ease: [0.25, 0.1, 0.25, 1] as const },
};

export function SelectedWorks() {
  return (
    <section id="work" className="bg-bg py-12 md:py-16">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 lg:px-16">
        <SectionHeader
          eyebrow="Selected Work"
          heading={
            <>
              Featured <span className="font-display italic">projects</span>
            </>
          }
          subtext="A selection of projects I've worked on, from concept to launch."
          action={
            <div className="hidden md:block">
              <GradientHoverRing innerClassName="border border-stroke bg-bg px-5 py-2.5 text-sm text-text-primary">
                View all work →
              </GradientHoverRing>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-12 md:gap-6">
          {PROJECTS.map((project) => (
            <motion.article
              key={project.title}
              {...reveal}
              className={`group relative overflow-hidden rounded-3xl border border-stroke bg-surface ${project.span}`}
            >
              <div className={`relative ${project.aspect}`}>
                <img
                  src={project.image}
                  alt={project.title}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
                <div
                  className="pointer-events-none absolute inset-0 opacity-20 mix-blend-multiply"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, #000 1px, transparent 1px)',
                    backgroundSize: '4px 4px',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-bg/70 opacity-0 backdrop-blur-lg transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100">
                  <span className="relative inline-flex rounded-full">
                    <span
                      className="landing-gradient-border pointer-events-none absolute rounded-full"
                      style={{ inset: -2 }}
                    />
                    <span className="relative z-[1] rounded-full bg-white px-5 py-2.5 text-sm text-bg">
                      View — <span className="font-display italic">{project.title}</span>
                    </span>
                  </span>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
