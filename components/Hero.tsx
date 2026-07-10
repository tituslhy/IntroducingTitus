import Image from 'next/image'

const SOCIAL = {
  github: 'https://github.com/tituslhy',
  linkedin: 'https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/',
  medium: 'https://medium.com/@tituslhy',
  coffee: 'https://buymeacoffee.com/tituslhy',
  email: 'tituslhy@gmail.com',
}

const ISSUE_META = {
  role: 'GenAI Engineer & Architect',
  location: 'Singapore',
  status: 'Lead AI Engineer, Mastercard Asia/Pacific',
  year: '2026',
}

// Kicker lines beneath the portrait (COVER_LINES[1..] from the handoff)
const KICKERS = [
  { kicker: '8+ years', text: 'of production AI, shipped solo and in teams' },
  { kicker: '54 articles', text: 'technical articles, featured by IBM, LlamaIndex, Unsloth' },
  { kicker: 'Currently', text: 'Lead AI Engineer at Mastercard Asia/Pacific' },
]

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
  'inline-flex items-center gap-[7px] px-1.5 py-1 transition-[color,transform] duration-150 hover:text-amber hover:-translate-y-px'
const dotSep =
  'inline-block h-[3px] w-[3px] rounded-full bg-ink-faint align-middle'

export default function Hero() {
  return (
    <section
      id="masthead"
      className="mx-auto max-w-[1280px] px-[clamp(18px,4vw,56px)] pt-7 pb-[clamp(32px,4vw,56px)] text-ink"
    >
      {/* Status bar — location · role · year */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 pb-[14px] font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">
        <span className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-amber shadow-[0_0_0_3px_color-mix(in_oklch,var(--amber)_22%,transparent)] motion-safe:animate-[pulse-dot_2.4s_ease-in-out_infinite]"
          />
          <span>{ISSUE_META.location}</span>
          <span className="opacity-50">·</span>
          <span>{ISSUE_META.status}</span>
        </span>
        <span>{ISSUE_META.year}</span>
      </div>

      <div className="mt-[3px] h-px bg-rule-strong" />

      <div className="grid grid-cols-1 gap-[clamp(28px,4vw,72px)] pt-[clamp(28px,4vw,56px)] min-[880px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Portrait + kickers — on mobile this wrapper is display:contents so its
            children (figure, kickers list) can be reordered independently among
            the headline content below; at min-[880px] it reverts to the original
            flex column, restoring the desktop composition unchanged. */}
        <aside className="contents min-[880px]:flex min-[880px]:flex-col min-[880px]:gap-7">
          <figure className="group order-7 m-0 min-[880px]:order-none">
            <div className="relative aspect-[4/3] overflow-hidden border border-rule bg-paper-deep min-[880px]:aspect-[3/4]">
              <Image
                src="/headshot.jpeg"
                alt="Portrait of Titus Lim"
                fill
                priority
                sizes="(max-width: 880px) 100vw, 40vw"
                className="object-cover transition-transform duration-[800ms] ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.02]"
                style={{ objectPosition: '50% 30%', filter: 'saturate(0.85) contrast(1.04)' }}
              />
            </div>
          </figure>

          <ul className="order-8 flex flex-col gap-3 min-[880px]:order-none">
            {KICKERS.map((line) => (
              <li
                key={line.kicker}
                className="grid grid-cols-[100px_1fr] items-baseline gap-4 border-t border-rule py-2.5 last:border-b"
              >
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-amber">
                  {line.kicker}
                </span>
                <span className="font-serif text-[15.5px] leading-[1.35] text-ink">
                  {line.text}
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Name, headline, standfirst — on mobile this wrapper is display:contents
            so name/tagline/CTA content can be interleaved (via order) ahead of
            the portrait and kickers above; at min-[880px] it reverts to the
            original flex column, restoring the desktop composition unchanged. */}
        <div className="contents min-[880px]:flex min-[880px]:flex-col">
          <p className="order-1 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft min-[880px]:order-none min-[880px]:mb-6">
            <span className="inline-block h-px w-9 bg-amber" />
            <span>{ISSUE_META.role}</span>
          </p>

          <h1
            className="order-2 m-0 font-serif font-medium not-italic leading-[0.9] tracking-[-0.035em] text-[clamp(44px,7vw,116px)] text-ink min-[880px]:order-none"
            aria-label="Lim Hsien Yong, also known as Titus"
          >
            <span className="block">Lim</span>
            <span className="block pl-[0.6em] max-[1100px]:pl-0">Hsien&nbsp;Yong</span>
            <span className="flex items-baseline justify-start gap-[0.4em] text-[0.78em] font-normal italic text-ink-soft min-[1100px]:justify-end">
              <em className="italic text-amber">(Titus)</em>
            </span>
          </h1>

          <div className="order-3 h-px bg-rule-strong min-[880px]:order-none min-[880px]:mt-7" />

          <p className="order-4 font-serif text-[clamp(26px,3.2vw,38px)] leading-[1.18] tracking-[-0.012em] text-ink [text-wrap:pretty] min-[880px]:order-none min-[880px]:mt-7">
            <span className="float-left pr-[18px] pt-1.5 font-serif text-[clamp(56px,7.4vw,92px)] font-medium italic leading-[0.82] text-amber">
              I
            </span>
            <span>build AI systems</span>
            <span> — </span>
            <span className="italic text-amber">from architecture to the boardroom.</span>
          </p>

          <p className="order-5 max-w-[56ch] text-[17px] leading-[1.55] text-ink-soft [text-wrap:pretty] min-[880px]:order-none min-[880px]:mt-[22px]">
            8+ years of production AI. 54 technical articles. Currently Lead AI Engineer at Mastercard&apos;s R&D Foundry.
          </p>

          {/* CTA row */}
          <div className="order-6 flex flex-wrap items-center gap-3.5 min-[880px]:order-none min-[880px]:mt-[30px]">
            <a
              href="#dossier"
              className="group inline-flex items-center gap-2.5 border border-ink bg-ink px-[18px] py-[11px] font-mono text-[12px] uppercase tracking-[0.12em] text-paper transition-colors duration-200 hover:border-amber hover:bg-amber hover:text-paper"
            >
              <span>View experience</span>
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </a>
            <a
              href="#writing"
              className="inline-flex items-center border border-ink px-[18px] py-[11px] font-mono text-[12px] uppercase tracking-[0.12em] text-ink transition-colors duration-200 hover:bg-ink hover:text-paper"
            >
              Read writing
            </a>
            <span aria-hidden="true" className="font-serif italic text-ink-faint">/</span>
            <a
              href={`mailto:${SOCIAL.email}?subject=Resume Request`}
              className="border-b border-rule-strong pb-0.5 font-serif text-[14px] italic text-ink-soft transition-colors hover:border-amber hover:text-amber"
            >
              Resume on request
            </a>
          </div>

          {/* Social row */}
          <div className="order-9 flex flex-wrap items-center gap-1 font-mono text-[11.5px] tracking-[0.06em] text-ink-soft min-[880px]:order-none min-[880px]:mt-[26px]">
            <a href={SOCIAL.github} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
              <IconGithub /><span>github</span>
            </a>
            <span className={dotSep} />
            <a href={SOCIAL.linkedin} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
              <IconLinkedin /><span>linkedin</span>
            </a>
            <span className={dotSep} />
            <a href={SOCIAL.medium} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
              <IconMedium /><span>medium</span>
            </a>
            <span className={dotSep} />
            <a href={SOCIAL.coffee} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
              <IconCoffee /><span>coffee</span>
            </a>
            <span className={dotSep} />
            <a href={`mailto:${SOCIAL.email}`} className={socialLinkClass}>
              <IconMail /><span>email</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
