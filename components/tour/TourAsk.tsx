'use client'

/**
 * Example questions under a tour line, to read, not press: pressing anything mid-tour would end it. They're
 * Ask Titus's own starter prompts, so the visitor finds them in the drawer once the tour is over. Wraps on
 * phones; nothing is cut off.
 */
export default function TourAsk({ questions }: { questions: string[] }) {
  if (questions.length === 0) return null
  return (
    <ul role="list" aria-label="Example questions" className="m-0 mt-2 list-none space-y-1.5 p-0">
      {questions.map((q) => (
        <li
          key={q}
          className="rounded-[12px] border border-dashed border-rule px-3 py-2 font-serif text-[14.5px] italic leading-snug text-ink-soft"
        >
          <span>“{q}”</span>
        </li>
      ))}
    </ul>
  )
}
