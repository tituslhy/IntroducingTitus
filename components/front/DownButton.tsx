'use client'

/**
 * The round double-chevron under the opening sentence. Scrolls so the target
 * (the "On this site" label) sits 16px under the top of the screen, where the nav was. Without JS it is a plain
 * anchor, and the target's scroll margin does the same job.
 */
export default function DownButton({ targetId }: { targetId: string }) {
  return (
    <a
      href={`#${targetId}`}
      aria-label="Scroll down to what's on this site"
      onClick={(e) => {
        const el = document.getElementById(targetId)
        if (!el) return
        e.preventDefault()
        // Scrolling down hides the nav (components/Navigation.tsx), so the label lands 16px from the
        // top edge; when the nav stays shown (scrolling up to it), 16px under the nav.
        const nav = document.querySelector('nav')
        const goingDown = el.getBoundingClientRect().top > 0
        const top = el.getBoundingClientRect().top + window.scrollY - (goingDown ? 0 : (nav?.offsetHeight ?? 0)) - 16
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
      }}
      className="mt-3 inline-grid h-[46px] w-[46px] place-items-center rounded-full border border-ink text-amber transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
        className="motion-safe:animate-[bob_1.8s_ease-in-out_infinite]"
      >
        <path d="M6 6l6 6 6-6M6 12l6 6 6-6" />
      </svg>
    </a>
  )
}
