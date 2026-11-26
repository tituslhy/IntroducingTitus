'use client'

import type { ReactNode } from 'react'
import type { TourStep } from '@/lib/site-tour'
import TypedText from './TypedText'

/**
 * The tour's narration inside the drawer: every step so far, newest last, under a "Recorded tour" header so
 * it's never mistaken for a live answer. Controls show while it plays; once it's done, only the last line stays.
 */
export default function TourThread({
  steps,
  label,
  instant,
  controls,
  extras,
}: {
  steps: TourStep[]
  /** Ask Titus's name tag (avatar + "Titus"), as on its replies. */
  label: ReactNode
  instant: boolean
  controls?: ReactNode
  /** What goes under a step's line, if anything: a button it tells the visitor to press, example questions. */
  extras?: (step: TourStep, index: number) => ReactNode
}) {
  return (
    <div id="copilot-tour" data-tour-ui className="space-y-2">
      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Recorded tour</p>
      {label}
      <div className="space-y-2.5 border-l border-amber pl-4 font-serif text-[15px] leading-relaxed text-ink">
        {steps.map((s, i) => (
          <div key={i}>
            <p className="m-0">{i === steps.length - 1 ? <TypedText text={s.say} instant={instant} /> : s.say}</p>
            {extras?.(s, i)}
          </div>
        ))}
      </div>
      {controls}
    </div>
  )
}
