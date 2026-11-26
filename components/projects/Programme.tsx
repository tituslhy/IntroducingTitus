'use client'

import { useEffect, useRef, useState } from 'react'

export type ProgrammeStop = { id: string; name: string; count?: number; n?: number }

/**
 * The Projects page's programme: a row of pills that sticks to the top of the window, so any section is
 * one tap away. The pill for the section being read is filled in, and kept in view on narrow screens.
 */
export default function Programme({ stops }: { stops: ProgrammeStop[] }) {
  const [current, setCurrent] = useState<string | null>(null)
  const row = useRef<HTMLElement>(null)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    // A section is "current" while it crosses a band a third of the way down the window.
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setCurrent(e.target.id)),
      { rootMargin: '-30% 0px -60% 0px' },
    )
    stops.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [stops])

  useEffect(() => {
    const r = row.current
    const a = current ? r?.querySelector<HTMLElement>(`[data-stop="${current}"]`) : null
    if (r && a && typeof r.scrollTo === 'function') r.scrollTo({ left: a.offsetLeft - 16, behavior: 'smooth' })
  }, [current])

  return (
    <nav
      ref={row}
      aria-label="On this page"
      className="sticky top-0 z-40 -mx-[clamp(18px,4vw,56px)] mb-2 flex gap-2 overflow-x-auto max-[820px]:flex-wrap max-[820px]:gap-1 max-[820px]:py-2 border-b border-rule bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-[clamp(18px,4vw,56px)] py-2.5 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {stops.map((s) => {
        const on = s.id === current
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            data-stop={s.id}
            aria-current={on ? 'true' : undefined}
            className={`inline-flex shrink-0 items-baseline gap-2 rounded-full px-3.5 py-2 font-mono text-[13px] max-[820px]:gap-1.5 max-[820px]:px-2 max-[820px]:py-1 max-[820px]:text-[11px] transition-colors ${
              on ? 'bg-ink text-paper' : 'bg-paper-deep text-ink hover:bg-ink hover:text-paper'
            }`}
          >
            {s.n !== undefined && <b className={`font-semibold ${on ? 'text-amber-hi' : 'text-amber'}`}>{s.n}</b>}
            {s.name}
            {s.count !== undefined && <b className={`font-semibold ${on ? 'text-amber-hi' : 'text-amber'}`}>{s.count}</b>}
          </a>
        )
      })}
    </nav>
  )
}
