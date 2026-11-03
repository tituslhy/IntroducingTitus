import { ARTICLE_COUNT_WORD, BLOCKCHAIN_ARTICLE_COUNT } from '@/lib/content'
import { FEATURED_ARTICLES as ARTICLES, FEATURED_BY, OPEN_SOURCE, PROJECTS, SOCIAL, type Project } from '@/lib/profile'

function SectionMarker({ folio, kicker, children }: { folio: string; kicker: string; children: React.ReactNode }) {
  return (
    <header className="mb-[clamp(28px,4vw,56px)]">
      <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
        <span className="font-semibold tracking-[0.08em] text-amber">{folio}</span>
        <span className="font-medium text-ink">{kicker}</span>
        <span className="h-px flex-1 self-center bg-rule" />
      </div>
      <h2 className="mt-[22px] max-w-[22ch] font-serif text-[clamp(34px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
        {children}
      </h2>
    </header>
  )
}

function ProjectFeature({ project, index }: { project: Project; index: number }) {
  const flipped = index % 2 === 1
  const accentText = project.accent === 'blue' ? 'text-indigo' : 'text-amber'
  const accentHover =
    project.accent === 'blue'
      ? 'hover:border-indigo hover:text-indigo'
      : 'hover:border-amber hover:text-amber'

  return (
    <article
      id={`project-${project.slug}`}
      className={`relative scroll-mt-24 grid grid-cols-1 items-start gap-[clamp(24px,4vw,56px)] border-b border-rule py-[clamp(28px,5vw,64px)] ${
        flipped
          ? 'min-[881px]:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]'
          : 'min-[881px]:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]'
      }`}
    >
      {/* Big-number figure */}
      <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden border border-rule bg-paper-deep p-7 before:pointer-events-none before:absolute before:inset-0 before:opacity-40 before:content-[''] before:[background-image:repeating-linear-gradient(135deg,transparent_0_22px,color-mix(in_oklch,var(--ink)_5%,transparent)_22px_23px)] min-[881px]:aspect-[4/5]">
        <div className="relative flex flex-col items-center gap-2 text-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
            {project.figure.label}
          </span>
          <span className={`font-serif text-[clamp(80px,12vw,144px)] font-medium italic leading-[0.9] tracking-[-0.04em] ${accentText}`}>
            {project.figure.value}
          </span>
          <span className="my-1.5 block h-px w-9 bg-rule-strong" />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
            {project.secondary.label}
          </span>
          <span className={`font-serif text-[28px] italic leading-none ${accentText}`}>
            {project.secondary.value}
          </span>
        </div>
      </div>

      {/* Text */}
      <div className={flipped ? 'min-[881px]:order-[-1]' : ''}>
        <p className="mb-3.5 flex items-center gap-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">
          <span className={`font-semibold ${accentText}`}>{String(index + 1).padStart(2, '0')}</span>
          <span className="h-px w-6 bg-rule-strong" />
        </p>
        <h3 className="m-0 font-serif text-[clamp(34px,4.4vw,56px)] font-medium leading-[1.02] tracking-[-0.025em] text-ink">
          {project.title}
        </h3>
        <p className="mb-[18px] mt-3.5 font-serif text-[21px] leading-[1.35] text-ink-soft [text-wrap:pretty]">
          <em className="italic">{project.sub}.</em>
        </p>
        <p className="mb-[22px] max-w-[60ch] text-[16.5px] leading-[1.6] text-ink [text-wrap:pretty]">
          {project.body}
        </p>

        {project.marginNote && (
          <dl className="mb-[22px] flex max-w-[60ch] flex-col gap-2 border-l-2 border-rule-strong pl-4">
            {(['constraint', 'decision', 'outcome'] as const).map((key) => (
              <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className={`shrink-0 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] sm:w-[90px] ${accentText}`}>
                  {key}
                </dt>
                <dd className="m-0 font-mono text-[12.5px] leading-[1.55] text-ink-soft">
                  {project.marginNote![key]}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <ul className="mb-[22px] flex flex-wrap gap-1.5">
          {project.tags.map((t) => (
            <li
              key={t}
              className={`border border-rule bg-paper px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] text-ink-soft transition-colors ${accentHover}`}
            >
              {t}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-4">
          {project.github && (
            <a
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex items-center gap-2 border-b border-ink pb-1 font-mono text-[12px] uppercase tracking-[0.06em] text-ink transition-colors ${accentHover}`}
            >
              <span>View source</span>
              <span className="text-[14px] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
            </a>
          )}
          {project.demo && (
            <a
              href={project.demo}
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex items-center gap-2 border-b border-ink pb-1 font-mono text-[12px] uppercase tracking-[0.06em] text-ink transition-colors ${accentHover}`}
            >
              <span>Watch demo</span>
              <span className="text-[14px] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

function Projects() {
  return (
    <section id="projects" className="text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(28px,5vw,72px)] pb-[clamp(28px,5vw,72px)] max-[720px]:border-t-0 [@media(max-height:480px)]:border-t-0">
        <SectionMarker folio="05" kicker="Projects">
          Things I have <em className="italic text-amber">built</em>.
        </SectionMarker>

        <div>
          {PROJECTS.map((p, i) => (
            <ProjectFeature key={p.slug} project={p} index={i} />
          ))}
        </div>

        {/* Open-source contributions */}
        <div id="open-source" className="relative mt-[clamp(40px,5vw,64px)] scroll-mt-24">
          <div className="mb-[18px] flex items-baseline gap-4">
            <span className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-amber">06</span>
            <h3 className="m-0 font-serif text-[28px] font-medium tracking-[-0.015em] text-ink">
              Open-source contributions
            </h3>
            <span className="h-px flex-1 bg-rule" />
          </div>
          <ul>
            {OPEN_SOURCE.map((o) => (
              <li key={o.href} className="border-b border-rule">
                <a
                  href={o.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group grid grid-cols-1 items-baseline gap-1 px-1 py-3.5 transition-colors hover:bg-[color-mix(in_oklch,var(--amber-soft)_30%,transparent)] min-[721px]:grid-cols-[140px_auto_1fr_auto] min-[721px]:gap-3.5"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
                    {o.project}
                  </span>
                  <span aria-hidden="true" className="hidden h-3 self-end border-b border-dotted border-rule-strong min-[721px]:block" />
                  <span className="font-serif text-[16px] text-ink [text-wrap:pretty]">{o.text}</span>
                  <span className="font-mono text-[13px] text-ink-soft transition-colors group-hover:text-amber">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Writing() {
  return (
    <section id="writing" className="bg-paper-deep text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(28px,5vw,72px)] pb-[clamp(28px,5vw,72px)] max-[720px]:border-t-0 [@media(max-height:480px)]:border-t-0">
        <SectionMarker folio="07" kicker="Writing">
          Seven articles, of <em className="italic text-amber">{ARTICLE_COUNT_WORD}</em>.
        </SectionMarker>

        <p className="mb-8 max-w-[60ch] font-serif text-[19px] italic text-ink-soft">
          Featured by{' '}
          {FEATURED_BY.map((f, i) => (
            <span key={f}>
              <em className="italic text-ink">{f}</em>
              {i < FEATURED_BY.length - 1 ? ', ' : '.'}
            </span>
          ))}{' '}
          The full archive lives on Medium, including {BLOCKCHAIN_ARTICLE_COUNT} on blockchain.
        </p>

        <ol className="border-t border-ink">
          {ARTICLES.map((a) => (
            <li key={a.href} className="border-b border-rule">
              <a
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group grid grid-cols-[36px_1fr] items-center gap-[18px] py-[18px] transition-colors hover:bg-[color-mix(in_oklch,var(--amber-soft)_25%,transparent)] min-[721px]:grid-cols-[60px_1fr_auto]"
              >
                <span className="font-serif text-[32px] italic leading-none text-amber">
                  {String(a.n).padStart(2, '0')}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-serif text-[clamp(18px,2vw,22px)] font-medium leading-[1.3] tracking-[-0.01em] text-ink [text-wrap:pretty]">
                    {a.title}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-[11px] tracking-[0.04em] text-ink-soft">
                    <span>{a.venue}</span>
                    <span className="inline-block h-[3px] w-[3px] rounded-full bg-ink-faint" />
                    <span>{a.read}</span>
                  </span>
                </span>
                <span className="hidden self-center whitespace-nowrap font-mono text-[11.5px] uppercase tracking-[0.06em] text-ink-soft transition-colors group-hover:text-amber min-[721px]:inline">
                  Read ↗
                </span>
              </a>
            </li>
          ))}
        </ol>

        <a
          href={SOCIAL.medium}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-[clamp(28px,4vw,44px)] inline-flex items-center gap-3 border border-ink px-[22px] py-3.5 font-mono text-[12px] uppercase tracking-[0.1em] text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          <span>The full archive on Medium</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </div>
    </section>
  )
}

export default function ProjectsWriting() {
  return (
    <>
      <Projects />
      <Writing />
    </>
  )
}
