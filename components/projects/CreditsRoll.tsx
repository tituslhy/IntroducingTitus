'use client'

import { Fragment, useEffect, useRef, type ReactNode } from 'react'

export type Credit = { project: string; text: string; href: string; ref: string | null }

/** Where the stage sticks, below the programme row. */
const STAGE_TOP = 70

/**
 * Open source as a film's closing credits. The dark stage sticks while the section scrolls past, and the
 * credits rise through it with the scroll (never on their own). For reduced motion it is a still list.
 */
export default function CreditsRoll({ credits, footer }: { credits: Credit[]; footer?: ReactNode }) {
  const roll = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const r = roll.current
    const s = stage.current
    const l = list.current
    if (!r || !s || !l || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // From just below the stage to just above it, across the section's scroll.
    const ends = () => ({ from: s.offsetHeight * 0.75, to: -(l.offsetHeight - s.offsetHeight * 0.55), span: r.offsetHeight - s.offsetHeight })
    let frame = 0
    const update = () => {
      frame = 0
      const { from, to, span } = ends()
      const p = span > 0 ? Math.min(1, Math.max(0, (STAGE_TOP - r.getBoundingClientRect().top) / span)) : 1
      l.style.transform = `translateY(${from + (to - from) * p}px)`
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    // Tabbing to a credit scrolls the page until that credit sits mid-stage. It waits a frame, so the
    // browser's own scroll-to-focus (which goes by where the credit was) doesn't undo it.
    let focusFrame = 0
    const onFocus = (e: FocusEvent) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('dd, dt')
      if (!item) return
      cancelAnimationFrame(focusFrame)
      focusFrame = requestAnimationFrame(() => {
        const { from, to, span } = ends()
        const want = s.offsetHeight / 2 - item.offsetTop
        const p = Math.min(1, Math.max(0, (from - want) / (from - to)))
        window.scrollTo({ top: r.getBoundingClientRect().top + window.scrollY - STAGE_TOP + span * p })
        update()
      })
    }

    r.dataset.rolling = ''
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    l.addEventListener('focusin', onFocus)
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      l.removeEventListener('focusin', onFocus)
      delete r.dataset.rolling
      l.style.transform = ''
    }
  }, [])

  return (
    <section id="open-source" aria-labelledby="open-source-title" className="scroll-mt-24 border-t border-rule py-14 max-[820px]:py-10">
      <div ref={roll} className="credits-roll">
        <div ref={stage} className="credits-stage rounded-[20px] bg-[var(--film)] text-center text-paper">
          <div className="credits-window">
            <div ref={list} className="credits-list px-6">
              <h3 id="open-source-title" className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-amber-hi">
                Open source
              </h3>
              <p className="m-0 mt-3 font-serif text-[17px] italic text-[oklch(0.78_0.02_70)]">Merged into the frameworks I use.</p>
              <dl className="mx-auto mt-10 grid max-w-[780px] grid-cols-2 gap-x-7 gap-y-[26px] max-[720px]:grid-cols-1 max-[720px]:gap-y-1">
                {credits.map((c) => (
                  <Fragment key={c.href}>
                    <dt className="text-right font-mono text-[11.5px] font-medium uppercase leading-[1.9] tracking-[0.14em] text-[oklch(0.7_0.02_70)] max-[720px]:mt-[22px] max-[720px]:text-center">
                      {c.project}
                    </dt>
                    <dd className="m-0 text-left max-[720px]:text-center">
                      <a
                        href={c.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-serif text-[19px] leading-[1.3] text-paper transition-colors hover:text-amber-hi focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber"
                      >
                        {c.text}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                      {c.ref && <span className="mt-[5px] block font-mono text-[11.5px] tracking-[0.04em] text-amber-hi">{c.ref}</span>}
                    </dd>
                  </Fragment>
                ))}
              </dl>
              <p className="m-0 mt-14 font-mono text-[12px] text-[oklch(0.6_0.02_70)]">
                {credits.length} contributions · each links to its pull request or commit
              </p>
            </div>
          </div>
        </div>
      </div>
      {footer}
    </section>
  )
}
