'use client'

import { useState, useEffect, useRef } from 'react'
import { EMAIL } from '@/lib/profile'

// No folios here: the nav lists five of the page's seven numbered sections, so
// they'd read 01, 02, 03, 05, 07. The section headings carry the numbers.
const NAV_ITEMS = [
  { id: 'lede', label: 'About' },
  { id: 'stack', label: 'Stack' },
  { id: 'dossier', label: 'Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'writing', label: 'Writing' },
]

export default function Navigation() {
  const [active, setActive] = useState('masthead')
  const [hidden, setHidden] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

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

  // Where the list still scrolls (phones), slide it so the active link stays in view.
  // Sets scrollLeft on the list only, so it can never scroll the page.
  useEffect(() => {
    const list = listRef.current
    const link = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !link || list.scrollWidth <= list.clientWidth) return
    list.scrollLeft = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2
  }, [active])

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
      className="sticky top-0 z-50 border-b border-rule bg-[color-mix(in_oklch,var(--paper)_88%,transparent)] backdrop-blur-[10px] backdrop-saturate-[1.4] transition-transform duration-[240ms] ease-[cubic-bezier(.4,0,.2,1)] max-[880px]:border-b-0"
    >
      {/* Below 720px: two rows. Brand and email on top, all five links on their own row,
          because a sideways-scrolling row hides the links nobody knows to scroll to. */}
      <div className="mx-auto grid h-14 max-w-[1280px] grid-cols-[auto_1fr_auto] items-center gap-6 px-[clamp(18px,4vw,56px)] max-[720px]:h-auto max-[720px]:grid-cols-[1fr_auto] max-[720px]:gap-x-4 max-[720px]:gap-y-0 max-[720px]:pt-1.5 max-[720px]:pb-1">
        {/* Brand → back to top */}
        <a
          href="#masthead"
          onClick={(e) => {
            e.preventDefault()
            scrollTo('masthead')
          }}
          aria-label="Back to top"
          className="flex items-baseline gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 max-[720px]:col-start-1 max-[720px]:row-start-1"
        >
          <span className="font-serif text-[22px] font-semibold italic tracking-[-0.01em] text-ink">
            T<span className="mx-0.5 not-italic text-amber">·</span>L
          </span>
          {/* Below 1080px the tagline gives its room to the section links, so all five fit */}
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft max-[1080px]:hidden">
            Titus Lim · Personal site
          </span>
        </a>

        {/* Anchor list with scroll-spy underline. The negative margin on phones cancels the links'
            padding, so the first label lines up with the brand. One row from 320px up. */}
        <div className="relative min-w-0 max-[720px]:col-span-2 max-[720px]:row-start-2 max-[720px]:-mx-1.5 max-[360px]:-mx-1">
          {/* relative: the list is its links' offsetParent, so offsetLeft ignores its scroll.
              It only scrolls as a fallback (e.g. enlarged text); at normal sizes every link fits. */}
          <ul
            ref={listRef}
            className="relative flex flex-nowrap justify-start gap-1 overflow-x-auto scroll-smooth px-1 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden min-[721px]:[justify-content:safe_center] max-[720px]:flex-wrap max-[720px]:justify-between max-[720px]:gap-0 max-[720px]:px-0"
          >
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
                    className={`relative inline-flex items-baseline gap-1.5 px-3 py-2 font-mono text-[12px] tracking-[0.04em] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 max-[720px]:px-1.5 max-[360px]:px-1 max-[360px]:text-[11px] ${
                      isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'
                    }`}
                  >
                    <span>{n.label}</span>
                    {isActive && <span className="absolute inset-x-3 bottom-0.5 h-0.5 bg-amber max-[720px]:inset-x-1.5 max-[360px]:inset-x-1" />}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Get in touch CTA */}
        <a
          href={`mailto:${EMAIL}?subject=Resume Request`}
          aria-label="Email Titus"
          className="inline-flex min-h-0 min-w-0 items-center justify-center gap-2 whitespace-nowrap border border-ink px-3.5 py-[7px] font-mono text-[11.5px] uppercase tracking-[0.06em] text-ink transition-colors duration-150 hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber focus-visible:outline-offset-2 max-[720px]:col-start-2 max-[720px]:row-start-1 max-[720px]:min-h-11 max-[720px]:min-w-11"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber shadow-[0_0_0_3px_color-mix(in_oklch,var(--amber)_30%,transparent)]" />
          <span className="max-[720px]:hidden">Get in touch</span>
        </a>
      </div>
    </nav>
  )
}
