import Link from 'next/link'
import BackToTop from '@/components/BackToTop'
import Reveal from '@/components/Reveal'
import TechHighlight from '@/components/TechHighlight'
import AskPill from '@/components/tiles/AskPill'
import GroupLabel from '@/components/tiles/GroupLabel'
import HeroTile from '@/components/tiles/HeroTile'
import ResultsRow from '@/components/tiles/ResultsRow'
import PassDesk from '@/components/experience/PassDesk'
import type { Pass } from '@/components/experience/StaffPasses'
import { experienceResults, highlightKey, passDates, tenure } from '@/lib/experience'
import { NAME, ROLES, pageFolio, type Role } from '@/lib/profile'
import { techKey } from '@/lib/tech-key'

/** Renders a role's deck, turning `deckLink.text` (first occurrence) into a link. */
function Deck({ role }: { role: Role }) {
  const link = role.deckLink
  const at = link ? role.deck.indexOf(link.text) : -1
  if (!link || at === -1) return <>{role.deck}</>
  return (
    <>
      {role.deck.slice(0, at)}
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-amber underline-offset-[3px] transition-colors hover:text-amber"
      >
        {link.text}
        <span aria-hidden="true"> ↗</span>
      </a>
      {role.deck.slice(at + link.text.length)}
    </>
  )
}

/** Tools as rounded pills. Hovering one lights up the same tool in every role (TechHighlight). */
function Stack({ role }: { role: Role }) {
  if (role.techNote) return <p className="m-0 font-mono text-[11.5px] italic text-ink-faint">{role.techNote}</p>
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {role.tech.map((t) => (
        <li
          key={t}
          data-tech={techKey(t)}
          className="cursor-default rounded-full bg-paper-deep px-[13px] py-[7px] font-mono text-[12.5px] text-ink-soft transition-colors data-[on]:bg-ink data-[on]:text-paper"
        >
          {t}
        </li>
      ))}
    </ul>
  )
}

/** Company and title, pinned on the left while the role scrolls by. */
function Side({ role }: { role: Role }) {
  return (
    <div className="sticky top-[90px] self-start max-[820px]:static">
      <p className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-amber">{role.dates}</p>
      <h3 id={`role-${role.slug}-name`} className="m-0 mt-2.5 flex flex-wrap items-baseline gap-3 font-serif text-[34px] font-medium leading-[1.08] tracking-[-0.02em] text-ink max-[820px]:text-[28px]">
        {role.company}
        {role.incoming && (
          <span className="rounded-full border border-amber px-2.5 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em] text-amber">Incoming</span>
        )}
      </h3>
      <p className="m-0 mt-2.5 font-serif text-[19px] leading-[1.3] text-ink">{role.role}</p>
      <p className="m-0 mt-2 font-mono text-[12px] text-ink-faint">{role.location}</p>
    </div>
  )
}

/** One role, under a thin header in its pass's colour: highlight tile, what I did, stack, and an Ask pill. */
function RoleEntry({ role, n, of }: { role: Role; n: number; of: number }) {
  return (
    <article id={`role-${role.slug}`} aria-labelledby={`role-${role.slug}-name`} className="scroll-mt-24 border-t-[3px] border-ink">
      <p className="m-0 flex items-center gap-3 border-b border-rule py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded" style={{ background: role.brand.color }} />
        Pass {n} of {of} · {role.short} · {role.dates}
      </p>
      <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-12 pb-16 pt-10 max-[820px]:grid-cols-1 max-[820px]:gap-5 max-[820px]:pb-12 max-[820px]:pt-8">
        <Side role={role} />
        <div className="min-w-0">
          {role.highlight && (
            <>
              <GroupLabel className="mt-0">Highlight</GroupLabel>
              <Reveal>
                <HeroTile figure={role.highlight.figure} caption={role.highlight.caption} dataTech={highlightKey(role)} />
              </Reveal>
            </>
          )}
          <GroupLabel className={role.highlight ? undefined : 'mt-0'}>What I did</GroupLabel>
          <div className="rounded-[20px] bg-paper-deep px-[26px] py-6 max-[720px]:px-5">
            <p className="m-0 font-serif text-[21px] leading-[1.35] text-ink [text-wrap:pretty] max-[720px]:text-[19px]">
              <Deck role={role} />
            </p>
            {role.body && <p className="m-0 mt-3 font-serif text-[17px] leading-[1.5] text-ink-soft [text-wrap:pretty]">{role.body}</p>}
          </div>
          <GroupLabel>Stack</GroupLabel>
          <Stack role={role} />
          <AskPill ask={role.ask ?? { label: role.short, question: `Tell me about your time at ${role.company}.` }} />
        </div>
      </div>
    </article>
  )
}

export default function Experience() {
  const oldestFirst = [...ROLES].reverse()
  const passes: Pass[] = oldestFirst.map((r) => {
    const { from, to } = passDates(r)
    const lasted = tenure(r)
    return {
      slug: r.slug,
      short: r.short,
      role: r.role,
      from,
      to,
      brand: r.brand,
      bottom: r.highlight ? { figure: r.highlight.figure, caption: r.highlight.caption } : lasted ? { figure: lasted, caption: 'in the role' } : null,
    }
  })

  return (
    <section id="dossier" className="text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(20px,3vw,40px)] pb-[clamp(28px,5vw,72px)] max-[720px]:border-t-0 [@media(max-height:480px)]:border-t-0">
        <header className="mb-[clamp(28px,4vw,48px)]">
          <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            <span className="font-semibold tracking-[0.08em] text-amber">{pageFolio('/experience')}</span>
            <span className="font-medium text-ink">Experience</span>
            <span className="h-px flex-1 self-center bg-rule" />
            <BackToTop />
          </div>
          <h2 className="mt-[22px] max-w-[22ch] font-serif text-[clamp(34px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
            Where I have <em className="italic text-amber">worked</em>, in reverse.
          </h2>
        </header>

        <ResultsRow results={experienceResults()} />
        <TechHighlight>
          <PassDesk
            passes={passes}
            name={NAME}
            roles={ROLES.map((r, i) => ({ slug: r.slug, entry: <RoleEntry role={r} n={ROLES.length - i} of={ROLES.length} /> }))}
          />
        </TechHighlight>

        <Link
          href="/education"
          className="mt-[clamp(32px,4vw,48px)] inline-flex items-baseline gap-2 font-mono text-[12.5px] text-ink-soft transition-colors hover:text-ink"
        >
          Next: Education <span className="text-amber">→</span>
        </Link>
      </div>
    </section>
  )
}
