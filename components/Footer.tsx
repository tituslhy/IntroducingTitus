import { EMAIL, SOCIAL } from '@/lib/profile'
import { COLOPHON_PATH } from '@/lib/content'


function IconGithub() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function IconLinkedin() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

function IconMedium() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="currentColor">
      <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z" />
    </svg>
  )
}

function IconCoffee() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path className="bmc-steam-a" d="M9 4 C7.6 4.8 10.4 5.8 9 6.8" />
      <path className="bmc-steam-b" d="M13 4 C11.6 4.8 14.4 5.8 13 6.8" />
      <path d="M4 10 H17 V15.5 a3.5 3.5 0 0 1 -3.5 3.5 H7.5 a3.5 3.5 0 0 1 -3.5 -3.5 z" />
      <path d="M17 11.5 h1.5 a2.5 2.5 0 0 1 0 5 H17" />
      <path d="M3 21 H18" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 7 l9 6 l9 -6" />
    </svg>
  )
}

const socialLinkClass =
  'inline-flex items-center gap-[7px] px-2.5 py-1.5 transition-colors hover:text-amber'

export default function Footer() {
  return (
    <footer
      id="colophon"
      className="mx-auto max-w-[1280px] px-[clamp(18px,4vw,56px)] pt-[clamp(48px,6vw,80px)] pb-[clamp(28px,3vw,40px)] text-ink"
    >
      <div className="mb-[clamp(28px,3vw,40px)] h-px bg-ink" />

      <div className="grid grid-cols-1 items-center gap-[clamp(24px,4vw,56px)] text-center min-[880px]:grid-cols-[auto_1fr_auto] min-[880px]:text-left">
        {/* Brand */}
        <div className="flex flex-col items-center gap-1 min-[880px]:items-start">
          <p className="font-serif text-[28px] font-medium leading-none tracking-[-0.015em]">
            Titus Lim
          </p>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
            GenAI Engineer &amp; Architect
          </p>
        </div>

        {/* Social row */}
        <nav
          aria-label="Footer"
          className="flex flex-wrap justify-center gap-x-1.5 gap-y-1 font-mono text-[11.5px] tracking-[0.04em] text-ink-soft"
        >
          <a href={SOCIAL.github} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
            <IconGithub />
            <span>github</span>
          </a>
          <a href={SOCIAL.linkedin} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
            <IconLinkedin />
            <span>linkedin</span>
          </a>
          <a href={SOCIAL.medium} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
            <IconMedium />
            <span>medium</span>
          </a>
          <a href={SOCIAL.coffee} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
            <IconCoffee />
            <span>coffee</span>
          </a>
          <a href={`mailto:${EMAIL}`} className={socialLinkClass}>
            <IconMail />
            <span>email</span>
          </a>
        </nav>

        {/* Resume line */}
        <p className="font-serif text-[14px] italic text-ink-soft text-center min-[880px]:text-right">
          <span className="text-ink">Resume on request</span>{' '}
          —{' '}
          <a
            href={`mailto:${EMAIL}?subject=Resume Request`}
            className="not-italic border-b border-rule-strong pb-px transition-colors hover:border-amber hover:text-amber"
          >
            {EMAIL}
          </a>
        </p>
      </div>

      {/* Meta row */}
      <div className="mt-[clamp(24px,3vw,36px)] flex flex-wrap items-center justify-center gap-1 border-t border-rule pt-3.5 font-mono text-[10.5px] tracking-[0.06em] text-ink-faint">
        <span>© 2026 Lim Hsien Yong (Titus)</span>
        <span className="mx-2 inline-block h-[3px] w-[3px] rounded-full bg-ink-faint align-middle" />
        <span>Singapore</span>
        <span className="mx-2 inline-block h-[3px] w-[3px] rounded-full bg-ink-faint align-middle" />
        <a href={COLOPHON_PATH} className="transition-colors hover:text-amber">
          How the assistant works <span aria-hidden="true">→</span>
        </a>
      </div>
    </footer>
  )
}
