'use client'

import { startTour } from '@/lib/copilot-events'
import { SITE_TOUR } from '@/lib/site-tour'

/**
 * Starts Ask Titus's recorded tour of the site. "primary" is the hero's main button; "line" is the second
 * invitation under the front page's numbers. Hidden on the live site until a real recording replaces the draft.
 */
export default function TourButton({ variant }: { variant: 'primary' | 'line' }) {
  if (SITE_TOUR.draft && process.env.NODE_ENV === 'production') return null
  if (variant === 'primary') {
    return (
      <button type="button" onClick={startTour} className="bg-ink px-4 py-[11px] text-paper transition-colors hover:bg-amber">
        Show me around <b className="font-medium text-amber-line">→</b>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={startTour}
      className="tap group font-serif text-[19px] italic leading-snug text-ink-soft transition-colors hover:text-ink min-[900px]:text-[21px]"
    >
      Short on time? Let me show you around{' '}
      <span aria-hidden="true" className="inline-block not-italic text-amber transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </button>
  )
}
