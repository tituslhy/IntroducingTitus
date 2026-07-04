'use client'

import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  { id: 'lede', label: 'About', folio: '01' },
  { id: 'stack', label: 'Stack', folio: '02' },
  { id: 'dossier', label: 'Experience', folio: '03' },
  { id: 'projects', label: 'Projects', folio: '04' },
  { id: 'writing', label: 'Writing', folio: '05' },
]

const EMAIL = 'tituslhy@gmail.com'

export default function Navigation() {
  const [active, setActive] = useState('masthead')
  const [hidden, setHidden] = useState(false)

  // Scroll-spy: underline the active section
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id)
        })
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    )
    NAV_ITEMS.forEach((n) => {
      const el = document.getElementById(n.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])

  // Hide on scroll-down, reveal on scroll-up, always visible in top 80px
  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y < 80) setHidden(false)
      else if (y > lastY + 4) setHidden(true)
      else if (y < lastY - 4) setHidden(false)
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const y = el.getBoundingClientRect().top + window.scrollY - 24
    window.scrollTo({ top: y, behavior: 'smooth' })
    if (window.history?.pushState) {
      window.history.pushState(null, '', `#${id}`)
    } else {
      window.location.hash = id
    }
  }

  return (
    <nav
      aria-label="Section navigation"
      style={{ transform: hidden ? 'translateY(-110%)' : 'translateY(0)' }}
      className="sticky top-0 z-50 border-b border-rule bg-[color-mix(in_oklch,var(--paper)_88%,transparent)] backdrop-blur-[10px] backdrop-saturate-[1.4] transition-transform duration-[240ms] ease-[cubic-bezier(.4,0,.2,1)]"
    >
      <div className="mx-auto grid h-14 max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-6 px-[clamp(18px,4vw,56px)]">
        {/* Brand → back to top */}
        <a
          href="#masthead"
          onClick={(e) => {
            e.preventDefault()
            scrollTo('masthead')
          }}
          aria-label="Back to top"
          className="flex items-baseline gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2"
        >
          <span className="font-serif text-[22px] font-semibold italic tracking-[-0.01em] text-ink">
            T<span className="mx-0.5 not-italic text-amber">·</span>L
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft max-[720px]:hidden">
            Titus Lim · Personal site
          </span>
        </a>

        {/* Anchor list with folios + scroll-spy underline */}
        <div className="relative min-w-0">
          <ul className="flex flex-nowrap justify-start gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[1080px]:justify-center">
            {NAV_ITEMS.map((n) => {
              const isActive = active === n.id
              return (
                <li key={n.id}>
                  <a
                    href={`#${n.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      scrollTo(n.id)
                    }}
                    aria-current={isActive ? 'true' : undefined}
                    className={`relative inline-flex items-baseline gap-1.5 px-3 py-2 font-mono text-[12px] tracking-[0.04em] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 ${
                      isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    <span className="text-[10px] text-ink-faint max-[720px]:hidden">{n.folio}</span>
                    <span>{n.label}</span>
                    {isActive && <span className="absolute inset-x-3 bottom-0.5 h-0.5 bg-amber" />}
                  </a>
                </li>
              )
            })}
          </ul>
          {/* Edge fades: cue that the list scrolls horizontally on narrow viewports */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-paper to-transparent min-[1080px]:hidden"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-paper to-transparent min-[1080px]:hidden"
          />
        </div>

        {/* Get in touch CTA */}
        <a
          href={`mailto:${EMAIL}?subject=Resume Request`}
          aria-label="Email Titus"
          className="inline-flex min-h-0 min-w-0 items-center justify-center gap-2 whitespace-nowrap border border-ink px-3.5 py-[7px] font-mono text-[11.5px] uppercase tracking-[0.06em] text-ink transition-colors duration-150 hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 max-[720px]:min-h-11 max-[720px]:min-w-11"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber shadow-[0_0_0_3px_color-mix(in_oklch,var(--amber)_30%,transparent)]" />
          <span className="max-[720px]:hidden">Get in touch</span>
        </a>
      </div>
    </nav>
  )
}
