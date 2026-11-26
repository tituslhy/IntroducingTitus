'use client'

/**
 * Example questions under a tour line ("try one of these"): each is a button that asks Ask Titus that
 * question for real, which ends the tour. Wraps on phones; nothing is cut off.
 */
export default function TourAsk({
  questions,
  onAsk,
  disabled = false,
}: {
  questions: string[]
  onAsk: (q: string) => void
  /** While an answer is still coming in. */
  disabled?: boolean
}) {
  if (questions.length === 0) return null
  return (
    <ul aria-label="Example questions" className="m-0 mt-2 list-none space-y-1.5 p-0">
      {questions.map((q) => (
        <li key={q}>
          <button
            type="button"
            onClick={() => onAsk(q)}
            disabled={disabled}
            className="group flex w-full items-baseline gap-2 rounded-[12px] bg-paper-deep px-3 py-2 text-left font-serif text-[14.5px] leading-snug text-ink transition-colors hover:bg-paper-band disabled:opacity-50 max-[640px]:min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            <span aria-hidden="true" className="font-mono text-[12px] text-amber transition-transform group-hover:translate-x-0.5">
              →
            </span>
            <span>{q}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
