import BackToTop from '@/components/BackToTop'
import AskPill from '@/components/tiles/AskPill'
import GroupLabel from '@/components/tiles/GroupLabel'
import HeroTile from '@/components/tiles/HeroTile'
import ResultsRow from '@/components/tiles/ResultsRow'
import CreditsRoll from '@/components/projects/CreditsRoll'
import DemoFrame from '@/components/projects/DemoFrame'
import EarlierReel from '@/components/projects/EarlierReel'
import BassoonArchitectureFrame from '@/components/projects/BassoonArchitecture'
import { IlluminaAnswer, IlluminaReady } from '@/components/projects/IlluminaDiagrams'
import Programme, { type ProgrammeStop } from '@/components/projects/Programme'
import Projector, { type ProjectorFrame } from '@/components/projects/Projector'
import { ITEM, SIDE, SIDE_LABEL, SIDE_TITLE } from '@/components/projects/layout'
import { creditRef, figureKey, hasNumber, projectResults, secondaryKey } from '@/lib/projects'
import { EARLIER_PROJECTS, OPEN_SOURCE, PROJECTS, pageFolio, type Project, type ProjectFrame } from '@/lib/profile'

const LINK_PILL =
  'rounded-full border border-rule px-[13px] py-[7px] font-mono text-[12.5px] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper'
const THUMB_WORDS = 'grid h-full place-items-center p-1 text-center font-mono text-[9.5px] font-medium leading-[1.2] text-paper'

const projectId = (p: Project) => `project-${p.slug}`

const DIAGRAMS = {
  'illumina-ready': <IlluminaReady />,
  'illumina-answer': <IlluminaAnswer />,
  'bassoon-architecture': <BassoonArchitectureFrame />,
}

/** One frame from the project's data, as it shows on the screen and on the strip. */
function toFrame(f: ProjectFrame, p: Project): ProjectorFrame {
  switch (f.kind) {
    case 'image':
      return {
        caption: f.caption,
        ms: f.ms,
        // eslint-disable-next-line @next/next/no-img-element -- images are unoptimised site-wide; the screenshots stay on GitHub
        node: <img src={f.src} alt={f.caption} loading="lazy" className="block h-full w-full bg-black object-contain" />,
        // eslint-disable-next-line @next/next/no-img-element -- as above
        thumb: <img src={f.src} alt="" loading="lazy" className="block h-full w-full object-cover object-top" />,
      }
    case 'demo':
      return {
        caption: f.caption,
        node: <DemoFrame youtubeId={f.youtubeId} title={`${p.title} demo`} />,
        // eslint-disable-next-line @next/next/no-img-element -- YouTube's own poster frame
        thumb: <img src={`https://img.youtube.com/vi/${f.youtubeId}/mqdefault.jpg`} alt="" loading="lazy" className="block h-full w-full object-cover" />,
      }
    case 'diagram':
      return {
        caption: f.caption,
        ms: f.ms,
        node: <div className="dg-screen">{DIAGRAMS[f.diagram]}</div>,
        thumb: <span className={THUMB_WORDS}>{f.label}</span>,
      }
  }
}

/** The projector's frames: the title card (the project's figure) first, then what the project shows. */
function framesOf(p: Project): ProjectorFrame[] {
  const indigo = p.accent === 'blue'
  const title: ProjectorFrame = {
    caption: `${p.figure.value} ${p.caption}`,
    node: (
      <div className="h-full [&>div]:h-full [&>div]:min-h-0 [&>div]:rounded-none">
        <HeroTile
          figure={p.figure.value}
          caption={p.caption}
          note={hasNumber(p.secondary.value) ? `${p.secondary.value} ${p.secondary.label}` : undefined}
          dataTech={figureKey(p)}
          noteTech={secondaryKey(p)}
          tone={indigo ? 'indigo' : 'amber'}
        />
      </div>
    ),
    thumb: <span className={`${THUMB_WORDS} text-[15px] ${indigo ? 'text-[oklch(0.82_0.08_254)]' : 'text-amber-hi'}`}>{p.figure.value}</span>,
  }
  return [title, ...p.frames.map((f) => toFrame(f, p))]
}

/** Name, context, sub-line and links: the left of a project. */
function Side({ project: p, sticky = true }: { project: Project; sticky?: boolean }) {
  const indigo = p.accent === 'blue'
  const links = [p.github && { href: p.github, text: 'GitHub ↗' }, p.demo && { href: p.demo, text: 'Demo video ↗' }].filter(
    (l): l is { href: string; text: string } => !!l,
  )
  return (
    <div className={sticky ? SIDE : undefined}>
      <p className={`${SIDE_LABEL} ${indigo ? 'text-indigo' : 'text-amber'}`}>{p.context}</p>
      <h3 className={SIDE_TITLE}>{p.title}</h3>
      <p className="m-0 mt-2.5 font-serif text-[19px] leading-[1.3] text-ink">{p.sub}</p>
      <div className="mt-[18px] flex flex-wrap gap-2">
        {links.length ? (
          links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={LINK_PILL}>
              {l.text}
            </a>
          ))
        ) : (
          <span className="py-[7px] font-mono text-[12px] text-ink-faint">Private, built at work</span>
        )}
      </div>
    </div>
  )
}

function WhatItIs({ project: p, first = false }: { project: Project; first?: boolean }) {
  return (
    <>
      <GroupLabel className={first ? 'mt-0' : undefined}>What it is</GroupLabel>
      <div className="rounded-[20px] bg-paper-deep px-[26px] py-6">
        <p className="m-0 font-serif text-[21px] leading-[1.35] text-ink [text-wrap:pretty]">{p.lead}</p>
        <p className="m-0 mt-3 font-serif text-[17px] leading-[1.5] text-ink-soft [text-wrap:pretty]">{p.body}</p>
      </div>
    </>
  )
}

/** Why it looks like this, the stack, and an Ask pill. */
function Details({ project: p }: { project: Project }) {
  const indigo = p.accent === 'blue'
  const why = p.marginNote && [
    { k: 'Constraint', text: p.marginNote.constraint },
    { k: 'Decision', text: p.marginNote.decision },
    { k: 'Outcome', text: p.marginNote.outcome },
  ]
  return (
    <>
      {why && (
        <>
          <GroupLabel>Why it looks like this</GroupLabel>
          <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0 max-[1100px]:grid-cols-1">
            {why.map((w) => (
              <li key={w.k} className="rounded-[20px] bg-paper-deep px-[22px] py-5 transition motion-safe:hover:-translate-y-[3px] hover:bg-paper-band">
                <span className={`block font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] ${indigo ? 'text-indigo' : 'text-amber'}`}>{w.k}</span>
                <span className="mt-2 block font-serif text-[17px] leading-[1.4] text-ink">{w.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <GroupLabel>Stack</GroupLabel>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {p.tags.map((t) => (
          <li key={t} className="rounded-full bg-paper-deep px-[13px] py-[7px] font-mono text-[12.5px] text-ink-soft">
            {t}
          </li>
        ))}
      </ul>
      <AskPill ask={p.ask} />
    </>
  )
}

/**
 * One featured project. Its projector plays the title card, then the project's stills or demo.
 * A project shown as a diagram (Illumina, built at work) gets the full width for it, under its write-up.
 */
function Featured({ project: p }: { project: Project }) {
  // A diagram needs a taller screen on narrow projectors: very tall for the full-width diagrams, fitted otherwise.
  const diagram = p.frames.some((f) => f.kind === 'diagram')
  const projector = <Projector label={p.title} frames={framesOf(p)} tall={!!p.wide} fit={diagram && !p.wide} />
  if (p.wide) {
    return (
      <article id={projectId(p)} className="scroll-mt-24 border-t border-rule py-14 max-[820px]:py-10">
        <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-12 max-[820px]:grid-cols-1 max-[820px]:gap-5">
          <Side project={p} sticky={false} />
          <div className="min-w-0">
            <WhatItIs project={p} first />
          </div>
        </div>
        <div className="mt-8 max-[820px]:mt-5">{projector}</div>
        <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-12 max-[820px]:grid-cols-1">
          <div className="max-[820px]:hidden" />
          <div className="min-w-0">
            <Details project={p} />
          </div>
        </div>
      </article>
    )
  }
  return (
    <article id={projectId(p)} className={ITEM}>
      <Side project={p} />
      <div className="min-w-0">
        {projector}
        <WhatItIs project={p} />
        <Details project={p} />
      </div>
    </article>
  )
}

export default function Projects() {
  const stops: ProgrammeStop[] = [
    ...PROJECTS.map((p, i) => ({ id: projectId(p), name: p.title, n: i + 1 })),
    { id: 'earlier-work', name: 'Earlier work', count: EARLIER_PROJECTS.length },
    { id: 'open-source', name: 'Open source', count: OPEN_SOURCE.length },
  ]

  return (
    <section id="projects" className="text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(28px,5vw,72px)] pb-[clamp(28px,5vw,72px)] max-[720px]:border-t-0 [@media(max-height:480px)]:border-t-0">
        <header className="mb-[clamp(28px,4vw,48px)]">
          <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            <span className="font-semibold tracking-[0.08em] text-amber">{pageFolio('/projects')}</span>
            <span className="font-medium text-ink">Projects</span>
            <span className="h-px flex-1 self-center bg-rule" />
            <BackToTop />
          </div>
          <h2 className="mt-[22px] max-w-[22ch] font-serif text-[clamp(34px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
            Things I have <em className="italic text-amber">built</em>, at work and for myself.
          </h2>
        </header>

        <ResultsRow results={projectResults()} />
        <Programme stops={stops} />

        {PROJECTS.map((p) => (
          <Featured key={p.slug} project={p} />
        ))}

        <EarlierReel
          projects={EARLIER_PROJECTS}
          footer={<AskPill ask={{ label: 'my earlier projects', question: 'Tell me about your projects from before GenAI.' }} />}
        />

        <CreditsRoll
          credits={OPEN_SOURCE.map((o) => ({ ...o, ref: creditRef(o.href) }))}
          footer={<AskPill ask={{ label: 'my open source work', question: 'What have you contributed to open source?' }} />}
        />
      </div>
    </section>
  )
}
