'use client'

import TypedText from './TypedText'

const buttonClass =
  'tap min-h-[44px] rounded-full px-3.5 font-mono text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber'

/**
 * The tour's narration over the page, when the drawer would cover it (phones, narrow windows): a card pinned
 * above the Ask Titus button. Says plainly that it's a recorded tour.
 */
export default function TourCaption({
  say,
  index,
  total,
  paused,
  instant,
  onPause,
  onResume,
  onSkip,
  onEnd,
}: {
  say: string
  index: number
  total: number
  paused: boolean
  /** Reduced motion: the narration appears whole. */
  instant: boolean
  onPause: () => void
  onResume: () => void
  onSkip: () => void
  onEnd: () => void
}) {
  return (
    <section
      data-tour-ui
      aria-label="Site tour"
      className="w-[min(420px,calc(100vw-32px))] rounded-[20px] border border-ink bg-paper px-4 pb-2 pt-3.5 text-ink shadow-[0_12px_44px_rgba(20,16,10,0.20)]"
    >
      <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-amber" />
        Titus · Recorded tour · {index + 1} of {total}
      </p>
      {/* The drawer (and its live region) is closed while the caption shows, so the caption announces itself. */}
      <p className="sr-only" aria-live="polite">
        {say} (tour, step {index + 1} of {total})
      </p>
      <p className="m-0 mt-1.5 font-serif text-[17px] leading-[1.4]" aria-hidden="true">
        <TypedText key={index} text={say} instant={instant} />
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <button type="button" onClick={paused ? onResume : onPause} className={`${buttonClass} bg-paper-deep hover:bg-paper-band`}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" onClick={onSkip} className={`${buttonClass} hover:bg-paper-deep`}>
          {index + 1 >= total ? 'Finish' : 'Skip'} <span aria-hidden="true" className="text-amber">→</span>
        </button>
        <button type="button" onClick={onEnd} aria-label="End tour" className={`${buttonClass} ml-auto hover:bg-paper-deep`}>
          ✕
        </button>
      </div>
    </section>
  )
}
