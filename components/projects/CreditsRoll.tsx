import type { CSSProperties, ReactNode } from 'react'

export type Credit = { project: string; text: string; href: string; ref: string | null }

/** Seconds per credit for one full pass of the roll. */
const SECONDS_EACH = 5

/** One printing of the credits. The roll prints it twice so the loop has no seam; the copy is hidden and inert. */
function CreditList({ credits, copy = false }: { credits: Credit[]; copy?: boolean }) {
  return (
    <dl
      aria-hidden={copy || undefined}
      inert={copy || undefined}
      className="credits-copy m-0 mx-auto grid max-w-[780px] grid-cols-2 gap-x-7 gap-y-[26px] max-[720px]:grid-cols-1 max-[720px]:gap-y-1"
    >
      {credits.map((c) => (
        <div key={c.href} className="contents">
          <dt className="text-right font-mono text-[11.5px] font-medium uppercase leading-[1.9] tracking-[0.14em] text-[oklch(0.7_0.02_70)] max-[720px]:mt-[22px] max-[720px]:text-center">
            {c.project}
          </dt>
          <dd className="m-0 text-left max-[720px]:text-center">
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={copy ? -1 : undefined}
              className="font-serif text-[19px] leading-[1.3] text-paper transition-colors hover:text-amber-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber"
            >
              {c.text}
              <span aria-hidden="true"> ↗</span>
            </a>
            {c.ref && <span className="mt-[5px] block font-mono text-[11.5px] tracking-[0.04em] text-amber-hi">{c.ref}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Open source as a film's closing credits: the heading stays put and the credits stream up beneath it by
 * themselves, looping. Hovering holds them; tabbing to one stops the roll. For reduced motion it is a still list.
 */
export default function CreditsRoll({ credits, footer }: { credits: Credit[]; footer?: ReactNode }) {
  return (
    <section id="open-source" aria-labelledby="open-source-title" className="scroll-mt-24 border-t border-rule py-14 max-[820px]:py-10">
      <div className="credits-stage rounded-[20px] bg-[var(--film)] px-6 pb-9 pt-12 text-center text-paper">
        <h3 id="open-source-title" className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-amber-hi">
          Open source
        </h3>
        <p className="m-0 mt-3 font-serif text-[17px] italic text-[oklch(0.78_0.02_70)]">Merged into the frameworks I use.</p>
        <div className="credits-window mt-6">
          <div className="credits-track" style={{ '--roll': `${credits.length * SECONDS_EACH}s` } as CSSProperties}>
            <CreditList credits={credits} />
            <CreditList credits={credits} copy />
          </div>
        </div>
        <p className="m-0 mt-6 font-mono text-[12px] text-[oklch(0.6_0.02_70)]">
          {credits.length} contributions · each links to its pull request or commit
        </p>
      </div>
      {footer}
    </section>
  )
}
