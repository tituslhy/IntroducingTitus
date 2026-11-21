'use client'

import { useRef } from 'react'
import type { EducationResult } from '@/lib/education'

const FLASH_MS = 2400

/**
 * The results row at the top of the Education page. Clicking one scrolls to its honour and lights up
 * every matching tag (the same `data-on` that hovering a tag sets), then lets it fade.
 */
export default function EducationResults({ results }: { results: EducationResult[] }) {
  const fade = useRef<number | undefined>(undefined)

  const show = (key: string) => {
    const tags = Array.from(document.querySelectorAll<HTMLElement>(`[data-tech="${CSS.escape(key)}"]`))
    if (!tags.length) return
    document.querySelectorAll<HTMLElement>('[data-on]').forEach((el) => delete el.dataset.on)
    tags.forEach((el) => (el.dataset.on = ''))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    tags[0].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    // A new click restarts the fade, so an earlier click's timer can't cut this highlight short.
    window.clearTimeout(fade.current)
    fade.current = window.setTimeout(() => tags.forEach((el) => delete el.dataset.on), FLASH_MS)
  }

  return (
    <ul className="m-0 grid list-none grid-cols-2 border-y border-ink p-0 min-[900px]:grid-cols-4">
      {results.map((r, i) => (
        <li
          key={r.key}
          className={`border-rule ${i % 2 ? 'border-l' : ''} ${i >= 2 ? 'border-t min-[900px]:border-t-0' : ''} ${
            i > 0 ? 'min-[900px]:border-l' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => show(r.key)}
            className="group block h-full w-full px-4 py-5 text-left transition-colors hover:bg-paper-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber min-[900px]:px-6"
          >
            <span className="block whitespace-nowrap font-serif text-[clamp(26px,3.2vw,44px)] font-medium leading-none tracking-[-0.025em] text-ink">
              {r.figure}
            </span>
            <span className="mt-2.5 flex items-baseline justify-between gap-2 font-mono text-[11.5px] leading-[1.45] text-ink-soft">
              {r.label}
              <span aria-hidden="true" className="text-amber transition-transform duration-200 group-hover:translate-y-0.5">
                ↓
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
