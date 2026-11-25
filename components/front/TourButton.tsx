'use client'

import { startTour } from '@/lib/copilot-events'
import { SITE_TOUR, TOUR_ON_SITE, tourDurationMs } from '@/lib/site-tour'

/** How long the tour runs, to the nearest 5 seconds, from the recording itself. */
export const TOUR_SECONDS = Math.max(5, Math.round(tourDurationMs(SITE_TOUR) / 5000) * 5)

/**
 * The front page's one way into Ask Titus's recorded tour: a dark tile in the hero with a big amber play
 * button, in the same family as the stat tiles. Hidden on the live site until a real recording replaces the
 * draft (TOUR_ON_SITE).
 */
export default function TourButton() {
  if (!TOUR_ON_SITE) return null
  return (
    <button
      type="button"
      onClick={startTour}
      aria-label={`Show me around: a ${TOUR_SECONDS}-second tour by my AI copilot`}
      className="glow-tile group flex w-full items-center gap-5 rounded-[20px] bg-ink py-5 pl-5 pr-6 text-left text-paper transition-transform motion-safe:hover:-translate-y-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber min-[900px]:gap-6 min-[900px]:py-6 min-[900px]:pl-6 min-[900px]:pr-[30px]"
    >
      <span
        aria-hidden="true"
        className="grid h-14 w-14 flex-none place-items-center rounded-full bg-amber text-ink shadow-[0_0_0_8px_oklch(0.62_0.155_55/0.25),0_0_0_16px_oklch(0.62_0.155_55/0.1)] transition-colors group-hover:bg-amber-hi min-[900px]:h-[72px] min-[900px]:w-[72px]"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 min-[900px]:h-8 min-[900px]:w-8">
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
        </svg>
      </span>
      <span className="block min-w-0">
        <span className="block font-mono text-[11px] uppercase tracking-[0.16em] text-amber-hi min-[900px]:text-[11.5px]">
          Show me around · {TOUR_SECONDS} s
        </span>
        <span className="mt-1.5 block font-serif text-[clamp(21px,2.4vw,29px)] leading-[1.15]">
          Let my AI copilot give you the tour.
        </span>
        <span className="mt-2 block font-mono text-[12px] leading-[1.5] text-[oklch(0.85_0.02_78)]">
          It opens the pages and talks you through them{' '}
          <span aria-hidden="true" className="inline-block text-amber-hi transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </span>
    </button>
  )
}
