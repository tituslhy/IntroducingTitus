'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import StaffPasses, { type Pass } from '@/components/experience/StaffPasses'
import { REVEAL_EVENT } from '@/lib/reveal'

/**
 * The staff passes and the roles under them. One role shows at a time, the picked pass's, right under
 * the desk; "Show all roles" lists every one (newest first), and picking a pass then jumps to it.
 * Hidden roles stay in the page (`hidden`), so the results row and Ask Titus can still find them.
 */
export default function PassDesk({
  passes,
  name,
  roles,
}: {
  /** Oldest first, as they lie on the desk. */
  passes: Pass[]
  name: { preferred: string; full: string }
  /** Newest first, as they're listed. */
  roles: { slug: string; entry: ReactNode }[]
}) {
  const [picked, setPicked] = useState<string | null>(passes.at(-1)?.slug ?? null)
  const [all, setAll] = useState(false)
  const list = useRef<HTMLDivElement>(null)

  // Something scrolling to a hidden role (lib/reveal) asks for it: show that role instead.
  useEffect(() => {
    const el = list.current
    if (!el) return
    const onReveal = (e: Event) => {
      const slug = (e as CustomEvent<string>).detail
      if (slug) setPicked(slug)
    }
    el.addEventListener(REVEAL_EVENT, onReveal)
    return () => el.removeEventListener(REVEAL_EVENT, onReveal)
  }, [])

  const pick = (slug: string) => {
    setPicked(slug)
    if (!all) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`role-${slug}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const toggle = (
    <button
      type="button"
      aria-pressed={all}
      onClick={() => setAll((on) => !on)}
      className="ml-auto rounded-full bg-ink px-4 py-2 font-mono text-[12px] text-paper transition-transform motion-safe:hover:-translate-y-[2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
    >
      {all ? 'Show one at a time' : `Show all ${roles.length} roles ↓`}
    </button>
  )

  return (
    <>
      <StaffPasses passes={passes} name={name} picked={picked} onPick={pick} footer={toggle} />
      <div ref={list} className="mt-10">
        {roles.map((r) => (
          <div key={r.slug} data-reveal={r.slug} hidden={!all && r.slug !== picked}>
            {r.entry}
          </div>
        ))}
      </div>
    </>
  )
}
