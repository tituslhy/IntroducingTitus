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
  // Respect reduced-motion and degrade gracefully where IntersectionObserver is
  // unavailable by computing the initial visibility synchronously, rather than
  // setting state from an effect on mount.
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    return Boolean(prefersReduced) || typeof IntersectionObserver === 'undefined'
  })

  useEffect(() => {
    if (visible) return
    const node = ref.current
    if (!node) return

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
  }, [visible])

  const base = variant === 'fade' ? 'reveal-soft' : 'reveal'
  const classes = [base, visible ? 'is-visible' : '', className].filter(Boolean).join(' ')

  return (
    <div ref={ref} className={classes}>
      {children}
    </div>
  )
}
