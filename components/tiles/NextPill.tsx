'use client'

import { useEffect, useState } from 'react'

export type Stop = { id: string; name: string }

/** A stop counts as "next" while its top is below this share of the window. */
const FOLD = 0.85
/** Hidden near the top of the page, where the "On this page" row already shows what's below. */
const TOP_HIDE_PX = 200
/** Hidden this close to the bottom of the page. */
const END_HIDE_PX = 40

/** The first stop whose top is still below the fold, or null. */
export function nextStop(stops: Stop[], topOf: (id: string) => number | undefined, fold: number): Stop | null {
  return stops.find((s) => (topOf(s.id) ?? -Infinity) > fold) ?? null
}

/** A floating "Next: X ↓" pill at the bottom of a long page, naming the next section still out of view. */
export default function NextPill({ stops }: { stops: Stop[] }) {
  const [next, setNext] = useState<Stop | null>(null)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    const update = () => {
      const target = nextStop(stops, (id) => document.getElementById(id)?.getBoundingClientRect().top, window.innerHeight * FOLD)
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - END_HIDE_PX
      setNext(target)
      setHidden(!target || atEnd || window.scrollY < TOP_HIDE_PX)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [stops])

  const go = () => {
    if (!next) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(next.id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <button
      type="button"
      onClick={go}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
      className={`fixed bottom-6 left-1/2 z-[15] inline-flex max-w-[calc(100vw-180px)] -translate-x-1/2 items-center gap-2.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border-0 bg-ink px-[18px] py-[11px] font-mono text-[13px] text-paper transition-[opacity,transform] duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber max-[520px]:bottom-5 max-[520px]:max-w-[calc(100vw-144px)] max-[520px]:text-[12px] ${
        hidden ? 'pointer-events-none translate-y-5 opacity-0' : 'opacity-100'
      }`}
    >
      <span className="text-[oklch(0.7_0.02_78)]">Next</span>
      <span className="overflow-hidden text-ellipsis">{next?.name}</span>
      <span aria-hidden="true" className="text-amber-hi motion-safe:animate-[next-bob_1.8s_ease-in-out_infinite]">
        ↓
      </span>
    </button>
  )
}
