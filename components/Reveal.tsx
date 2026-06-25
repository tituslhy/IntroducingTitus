'use client'

import { useEffect, useRef, useState } from 'react'

type RevealProps = {
  children: React.ReactNode
  /** 'rise' fades + lifts (default). 'fade' is opacity-only — use it for any
   *  subtree containing position: sticky, since a transform would break it. */
  variant?: 'rise' | 'fade'
  /** Extra classes applied to the wrapper. */
  className?: string
}

export default function Reveal({ children, variant = 'rise', className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Respect reduced-motion and degrade gracefully where IntersectionObserver
    // is unavailable: show the content immediately, no animation.
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const base = variant === 'fade' ? 'reveal-soft' : 'reveal'
  const classes = [base, visible ? 'is-visible' : '', className].filter(Boolean).join(' ')

  return (
    <div ref={ref} className={classes}>
      {children}
    </div>
  )
}
