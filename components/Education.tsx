import BackToTop from '@/components/BackToTop'
import Reveal from '@/components/Reveal'
import AskPill from '@/components/tiles/AskPill'
import GroupLabel from '@/components/tiles/GroupLabel'
import HeroTile from '@/components/tiles/HeroTile'
import ResultsRow from '@/components/tiles/ResultsRow'
import { educationResults, honorGroups, numberParts, splitHonor, standingKey } from '@/lib/education'
import { CERTIFICATIONS, EDUCATION, pageFolio, type Education as EducationEntry, type EducationPart, type HonorGroups } from '@/lib/profile'
import { techKey } from '@/lib/tech-key'

type Tone = 'paper' | 'latte'

/** "Top 10 in two PhD modules": numbers in the accent colour. */
function WithNumbers({ text, tone }: { text: string; tone: Tone }) {
  return (
    <>
      {numberParts(text).map((part, i) =>
        part.num ? (
          <span key={i} className={tone === 'latte' ? 'text-latte-accent' : 'text-amber'}>
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  )
}

/** Honours as rounded tiles: the result in serif, its context small beneath. */
function Tiles({ honors, tone }: { honors: string[]; tone: Tone }) {
  const latte = tone === 'latte'
  return (
    <ul className={`m-0 grid list-none p-0 ${latte ? 'grid-cols-1 gap-2' : 'grid-cols-1 gap-3 min-[720px]:grid-cols-2'}`}>
      {honors.map((h) => {
        const [result, context] = splitHonor(h)
        return (
          <li
            key={h}
            data-tech={techKey(h)}
            className={`transition motion-safe:hover:-translate-y-[3px] ${
              latte ? 'rounded-2xl bg-latte-tile px-4 py-3.5 hover:bg-latte-tile-hi' : 'rounded-[20px] bg-paper-deep px-[22px] py-5 hover:bg-paper-band'
            }`}
          >
            <span className={`block font-serif font-medium leading-[1.25] text-ink ${latte ? 'text-[17px]' : 'text-[19px]'}`}>
              <WithNumbers text={result} tone={tone} />
            </span>
            {context && (
              <span className={`mt-1.5 block font-mono text-[11.5px] leading-[1.45] ${latte ? 'text-latte-soft' : 'text-ink-soft'}`}>{context}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Scholarships, then achievements, each under its small label. */
function Groups({ groups, tone }: { groups: HonorGroups; tone: Tone }) {
  return (
    <>
      {honorGroups(groups).map((g) => (
        <div key={g.name}>
          <GroupLabel tone={tone}>{g.name}</GroupLabel>
          <Tiles honors={g.honors} tone={tone} />
        </div>
      ))}
    </>
  )
}

/** A programme taken during a degree, in its latte box. */
function Part({ part }: { part: EducationPart }) {
  return (
    <Reveal className="h-full">
      <div className="h-full rounded-[28px] bg-latte px-[26px] pb-[26px] pt-7 max-[720px]:px-5">
        <div className="font-mono text-[11px] font-medium tracking-[0.1em] text-latte-accent">{part.dates}</div>
        <h4 className="m-0 mt-1.5 font-serif text-[24px] font-medium leading-[1.15] tracking-[-0.015em] text-ink">{part.institution}</h4>
        <p className="m-0 mt-1 font-serif text-[16px] italic leading-[1.35] text-latte-soft">{part.programme}</p>
        <p
          data-tech={techKey(part.standing)}
          className="m-0 mt-5 rounded-lg font-serif text-[clamp(26px,2.6vw,34px)] font-medium leading-[1.05] tracking-[-0.025em] text-latte-accent"
        >
          {part.standing}
        </p>
        <Groups groups={part} tone="latte" />
        <AskPill ask={part.ask} tone="latte" />
      </div>
    </Reveal>
  )
}

/** One school: its name pinned on the left; the dark result tile, honours and programmes on the right. */
function Entry({ entry }: { entry: EducationEntry }) {
  return (
    <article
      id={`edu-${entry.slug}`}
      className="grid scroll-mt-24 grid-cols-[minmax(0,300px)_1fr] gap-12 border-t border-rule py-14 max-[820px]:grid-cols-1 max-[820px]:gap-5 max-[820px]:py-10"
    >
      <div className="sticky top-[90px] self-start max-[820px]:static">
        <p className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-amber">{entry.dates}</p>
        <h3 className="m-0 mt-2.5 font-serif text-[34px] font-medium leading-[1.08] tracking-[-0.02em] text-ink max-[820px]:text-[28px]">
          {entry.institution}
        </h3>
        <p className="m-0 mt-2.5 font-serif text-[19px] leading-[1.3] text-ink">{entry.degree}</p>
        <p className="m-0 mt-2 font-mono text-[12px] text-ink-faint">{entry.location}</p>
      </div>

      <div className="min-w-0">
        <GroupLabel className="mt-0">Results</GroupLabel>
        <Reveal>
          <HeroTile {...entry.standing} dataTech={standingKey(entry)} />
        </Reveal>
        <Groups groups={entry} tone="paper" />
        <AskPill ask={entry.ask} />

        {entry.parts?.length ? (
          <>
            <GroupLabel tone="latte" className="mt-10">
              During {entry.short}
            </GroupLabel>
            <div className="grid grid-cols-1 gap-3 min-[820px]:grid-cols-2">
              {entry.parts.map((p) => (
                <Part key={p.institution} part={p} />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </article>
  )
}

export default function Education() {
  return (
    <section id="education" className="text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(28px,5vw,72px)] pb-[clamp(28px,5vw,72px)] max-[720px]:border-t-0 [@media(max-height:480px)]:border-t-0">
        <header className="mb-[clamp(28px,4vw,48px)]">
          <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            <span className="font-semibold tracking-[0.08em] text-amber">{pageFolio('/education')}</span>
            <span className="font-medium text-ink">Education</span>
            <span className="h-px flex-1 self-center bg-rule" />
            <BackToTop />
          </div>
          <h2 className="mt-[22px] max-w-[22ch] font-serif text-[clamp(34px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
            Where I have <em className="italic text-amber">studied</em>, in reverse.
          </h2>
        </header>

        <ResultsRow results={educationResults()} />

        {EDUCATION.map((e) => (
          <Entry key={e.slug} entry={e} />
        ))}

        <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-12 border-t border-rule pt-14 max-[820px]:grid-cols-1 max-[820px]:gap-5 max-[820px]:pt-10">
          <h3 className="m-0 font-serif text-[34px] font-medium leading-[1.08] tracking-[-0.02em] max-[820px]:text-[28px]">Certifications</h3>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[720px]:grid-cols-2">
            {CERTIFICATIONS.map((c) => (
              <li key={c} className="rounded-[20px] bg-paper-deep px-[22px] py-5 font-serif text-[19px] font-medium text-ink">
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
