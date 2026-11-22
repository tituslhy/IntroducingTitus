'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { countable, countFrame } from '@/lib/count-up'

const DURATION_MS = 1200

/** A figure that counts up from zero the first time it scrolls into view. Screen readers get the figure as is. */
export default function CountUp({ figure }: { figure: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [text, setText] = useState(figure)

  // A layout effect sets the zero frame before the first paint, so the final figure never flashes first.
  useLayoutEffect(() => {
    const c = countable(figure)
    const node = ref.current
    if (!c || !node || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    // Deliberate: the zero frame must land before paint (the server rendered the final figure for no-JS readers).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(countFrame(c, 0))
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        io.disconnect()
        const t0 = performance.now()
        const tick = (t: number) => {
          const k = (t - t0) / DURATION_MS
          setText(countFrame(c, k))
          if (k < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.3 },
    )
    io.observe(node)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [figure])

  return (
    <span ref={ref}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{figure}</span>
    </span>
  )
}
