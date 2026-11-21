import BackToTop from '@/components/BackToTop'
import EducationResults from '@/components/EducationResults'
import TechHighlight from '@/components/TechHighlight'
import { educationResults, numberParts, splitHonor } from '@/lib/education'
import { CERTIFICATIONS, EDUCATION, pageFolio, type Education as EducationEntry } from '@/lib/profile'
import { techKey } from '@/lib/tech-key'

/**
 * Honours read as results, not as tags: the result large in serif, its context small beneath,
 * with its numbers in amber, as in the front page's opening line. Hovering one (or clicking its result above) lights up every match.
 */
function Honors({ honors }: { honors: string[] }) {
  return (
    <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-x-8 gap-y-5 p-0 min-[720px]:grid-cols-2">
      {honors.map((h) => {
        const [result, context] = splitHonor(h)
        return (
          <li
            key={h}
            data-tech={techKey(h)}
            className="group cursor-default transition-colors data-[on]:bg-paper-deep"
          >
            <span className="block font-serif text-[clamp(18px,1.7vw,21px)] font-medium leading-[1.25] tracking-[-0.01em] text-ink decoration-amber underline-offset-4 group-data-[on]:underline">
              {numberParts(result).map((part, i) =>
                part.num ? (
                  <span key={i} className="text-amber">
                    {part.text}
                  </span>
                ) : (
                  part.text
                ),
              )}
            </span>
            {context && <span className="mt-1 block font-mono text-[11.5px] leading-[1.45] text-ink-soft">{context}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** One degree, laid out like a role on Experience: year rail, institution, qualification, honours. */
function Entry({ entry }: { entry: EducationEntry }) {
  return (
    <article
      id={`edu-${entry.slug}`}
      className="relative grid scroll-mt-24 grid-cols-[110px_1fr] gap-[clamp(20px,3vw,40px)] py-[clamp(28px,4vw,44px)] max-[720px]:grid-cols-1"
    >
      <div className="sticky top-20 flex flex-col gap-2.5 self-start max-[720px]:static max-[720px]:flex-row max-[720px]:items-baseline max-[720px]:gap-4">
        <span className="font-serif text-[44px] font-normal italic leading-none tracking-[-0.02em] text-ink max-[720px]:text-[28px]">
          {entry.years}
        </span>
        <span className="inline-block h-px w-8 bg-amber" />
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="m-0 font-serif text-[clamp(24px,2.6vw,32px)] font-medium leading-[1.1] tracking-[-0.015em] text-ink">
              {entry.institution}
            </h3>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="font-serif text-[clamp(17px,1.6vw,20px)] leading-[1.2] tracking-[-0.01em] text-ink">{entry.degree}</span>
              <span className="inline-block h-[3px] w-[3px] self-center rounded-full bg-ink-faint" />
              <span className="font-mono text-[12px] tracking-[0.04em] text-ink-soft">{entry.location}</span>
            </p>
          </div>
          <p className="m-0 whitespace-nowrap font-mono text-[11.5px] tracking-[0.08em] text-ink-faint">{entry.dates}</p>
        </div>

        <Honors honors={entry.honors} />

        {entry.parts?.map((p) => (
          <div key={p.institution} className="mt-12">
            <h4 className="m-0 flex flex-wrap items-baseline gap-x-3 font-serif text-[clamp(20px,2vw,24px)] font-medium tracking-[-0.01em] text-ink">
              {p.institution}
              <span className="font-mono text-[11.5px] font-normal tracking-[0.08em] text-ink-faint">{p.dates}</span>
            </h4>
            <p className="mb-0 mt-1 font-serif text-[17px] italic leading-[1.4] text-ink-soft">{p.programme}</p>
            <Honors honors={p.honors} />
          </div>
        ))}
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

        <EducationResults results={educationResults()} />

        <TechHighlight>
          {EDUCATION.map((e) => (
            <Entry key={e.slug} entry={e} />
          ))}
        </TechHighlight>

        <div className="mt-[clamp(28px,4vw,48px)]">
          <h3 className="m-0 flex items-center gap-4 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-soft">
            Certifications
            <span aria-hidden="true" className="h-px flex-1 bg-rule" />
          </h3>
          <p className="mb-0 mt-4 font-serif text-[18px] text-ink">{CERTIFICATIONS.join(' · ')}</p>
        </div>
      </div>
    </section>
  )
}
