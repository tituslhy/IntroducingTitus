'use client'

import { useRef } from 'react'
import RiseIn from '@/components/tiles/RiseIn'
import { reveal } from '@/lib/reveal'

const FLASH_MS = 2400

export type RowResult = { figure: string; label: string; key: string }

/**
 * The dark results row at the top of a page. Clicking one scrolls to the tile it came from
 * (every element whose data-tech matches its key) and rings it in amber.
 */
export default function ResultsRow({ results }: { results: RowResult[] }) {
  const fade = useRef<number | undefined>(undefined)

  const ring = (key: string) => {
    const tiles = Array.from(document.querySelectorAll<HTMLElement>(`[data-tech="${CSS.escape(key)}"]`)).filter((el) => !el.closest('[hidden]'))
    if (!tiles.length) return
    document.querySelectorAll<HTMLElement>('.result-flash').forEach((el) => el.classList.remove('result-flash'))
    // Restart the animation even when the same result is clicked twice.
    void tiles[0].offsetWidth
    tiles.forEach((el) => el.classList.add('result-flash'))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    tiles[0].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
    // A new click restarts the fade, so an earlier click's timer can't cut this one short.
    window.clearTimeout(fade.current)
    fade.current = window.setTimeout(() => tiles.forEach((el) => el.classList.remove('result-flash')), FLASH_MS)
  }

  /** Its source may be a role the Experience page is keeping hidden: show that first, then ring it. */
  const show = (key: string) => {
    const first = document.querySelector(`[data-tech="${CSS.escape(key)}"]`)
    if (!first) return
    const shown = reveal(first)
    if (shown) void shown.then(() => ring(key))
    else ring(key)
  }

  return (
    <ul className="m-0 mb-6 grid list-none grid-cols-2 gap-3 p-0 min-[900px]:grid-cols-4">
      {results.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => show(r.key)}
            className="group flex h-full w-full flex-col rounded-[20px] bg-ink px-5 pb-[18px] pt-5 text-left text-paper transition-transform motion-safe:hover:-translate-y-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            <span className="block whitespace-nowrap font-serif text-[clamp(28px,3.2vw,42px)] font-medium leading-none tracking-[-0.03em] text-amber-hi">
              <RiseIn figure={r.figure} />
            </span>
            <span className="mt-3 flex flex-1 items-end justify-between gap-2 font-mono text-[11.5px] leading-[1.45] text-[oklch(0.85_0.02_78)]">
              {r.label}
              <span aria-hidden="true" className="text-amber-hi transition-transform duration-200 group-hover:translate-y-0.5">
                ↓
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
