'use client'

import { useRef, type MouseEvent, type ReactNode } from 'react'

/**
 * Hovering (or tapping) a tech tag marks every tag with the same name inside this wrapper with
 * `data-on`, so a visitor can see where else a tool was used. Purely visual; the tags stay plain text.
 */
export default function TechHighlight({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const active = useRef<string | null>(null)

  const set = (key: string | null) => {
    if (key === active.current || !ref.current) return
    active.current = key
    ref.current.querySelectorAll<HTMLElement>('[data-tech]').forEach((el) => {
      if (key !== null && el.dataset.tech === key) el.dataset.on = ''
      else delete el.dataset.on
    })
  }

  const onOver = (e: MouseEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).closest<HTMLElement>('[data-tech]')
    set(tag?.dataset.tech ?? null)
  }

  return (
    <div ref={ref} onMouseOver={onOver} onMouseLeave={() => set(null)}>
      {children}
    </div>
  )
}
