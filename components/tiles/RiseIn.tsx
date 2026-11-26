'use client'

import { useLayoutEffect, useRef, useState } from 'react'

export const RISE_MS = 600

/**
 * A headline figure that fades and rises into place the first time it scrolls into view.
 * It never shows anything but the real figure: a count-up showed "1.03" on its way to "3.98".
 */
export default function RiseIn({ figure }: { figure: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  // 'shown' on the server and without JS; 'waiting' (hidden, lowered) until the figure is on screen.
  const [phase, setPhase] = useState<'shown' | 'waiting' | 'rising'>('shown')

  // A layout effect hides the figure before the first paint, so it never flashes in place first.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // Deliberate: the hidden frame must land before paint (the server rendered the figure for no-JS readers).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('waiting')
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        io.disconnect()
        setPhase('rising')
      },
      { threshold: 0.3 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [figure])

  return (
    <span
      ref={ref}
      data-phase={phase}
      className="inline-block"
      style={
        phase === 'shown'
          ? undefined
          : phase === 'waiting'
            ? // Hidden at once (no transition), so it never visibly fades out before rising.
              { opacity: 0, transform: 'translateY(0.3em)' }
            : {
                opacity: 1,
                transform: 'none',
                transition: `opacity ${RISE_MS}ms ease-out, transform ${RISE_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)`,
              }
      }
    >
      {figure}
    </span>
  )
}
