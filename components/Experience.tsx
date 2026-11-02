import { EDUCATION, ROLES, type Role } from '@/lib/profile'

/** Renders a role's deck, turning `deckLink.text` (first occurrence) into a link. */
function Deck({ role }: { role: Role }) {
  const link = role.deckLink
  const at = link ? role.deck.indexOf(link.text) : -1
  if (!link || at === -1) return <>{role.deck}</>
  return (
    <>
      {role.deck.slice(0, at)}
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-amber underline underline-offset-2 transition-colors hover:text-ink"
      >
        {link.text}
        <span aria-hidden="true"> ↗</span>
      </a>
      {role.deck.slice(at + link.text.length)}
    </>
  )
}

function RoleEntry({ role }: { role: Role }) {
  const compact = Boolean(role.compact)
  return (
    <article
      className={`relative grid grid-cols-[110px_1fr] gap-[clamp(20px,3vw,40px)] max-[720px]:grid-cols-1 ${
        compact ? 'py-[clamp(20px,3vw,32px)]' : 'py-[clamp(28px,4vw,44px)]'
      }`}
    >
      {/* Sticky year rail */}
      <div className="sticky top-20 flex flex-col gap-2.5 self-start max-[720px]:static max-[720px]:flex-row max-[720px]:items-baseline max-[720px]:gap-4">
        <span
          className={`font-serif font-normal italic leading-none tracking-[-0.02em] text-ink max-[720px]:text-[28px] ${
            compact ? 'text-[32px]' : 'text-[44px]'
          }`}
        >
          {role.years}
        </span>
        <span className="inline-block h-px w-8 bg-amber" />
      </div>

      {/* Body */}
      <div>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3
              className={`m-0 flex flex-wrap items-baseline gap-3.5 font-serif font-medium leading-[1.1] tracking-[-0.015em] ${
                compact ? 'text-[clamp(20px,2.2vw,26px)]' : 'text-[clamp(24px,2.6vw,32px)]'
              } ${role.incoming ? 'text-ink-soft' : 'text-ink'}`}
            >
              {role.company}
              {role.incoming && (
                <span className="border border-amber px-2 py-[3px] font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
                  Incoming
                </span>
              )}
            </h3>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[12px] tracking-[0.04em] text-ink-soft">
              <span>{role.role}</span>
              <span className="inline-block h-[3px] w-[3px] rounded-full bg-ink-faint" />
              <span>{role.location}</span>
            </p>
          </div>
          <p className="m-0 whitespace-nowrap font-mono text-[11.5px] tracking-[0.08em] text-ink-faint">
            {role.dates}
          </p>
        </div>

        <p
          className={`mb-3 mt-1.5 font-serif leading-[1.45] text-ink [text-wrap:pretty] ${
            compact ? 'text-[16.5px]' : 'text-[19px]'
          }`}
        >
          <Deck role={role} />
        </p>
        {role.body && (
          <p className="mb-4 text-[16px] leading-[1.6] text-ink-soft [text-wrap:pretty]">
            {role.body}
          </p>
        )}

        {role.pullQuote && (
          <blockquote className="my-[18px] flex gap-2.5 border-l-[3px] border-amber bg-paper-deep px-5 py-4">
            <span aria-hidden="true" className="font-serif text-[36px] italic leading-[0.8] text-amber">
              &ldquo;
            </span>
            <p className="m-0 font-serif text-[18px] italic leading-[1.4] text-ink">
              {role.pullQuote}
            </p>
          </blockquote>
        )}

        <div>
          {role.techNote ? (
            <p className="font-mono text-[11.5px] text-ink-faint">
              <em className="italic">{role.techNote}</em>
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1.5 font-mono text-[11.5px] text-ink-soft">
              {role.tech.map((t) => (
                <li
                  key={t}
                  className="relative pl-3.5 before:absolute before:-top-px before:left-1 before:text-amber before:content-['·']"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  )
}

export default function Experience() {
  return (
    <section id="dossier" className="text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(28px,5vw,72px)] pb-[clamp(28px,5vw,72px)] max-[720px]:border-t-0 [@media(max-height:480px)]:border-t-0">
        {/* Section marker */}
        <header className="mb-[clamp(28px,4vw,56px)]">
          <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            <span className="font-semibold tracking-[0.08em] text-amber">03</span>
            <span className="font-medium text-ink">Experience</span>
            <span className="h-px flex-1 self-center bg-rule" />
          </div>
          <h2 className="mt-[22px] max-w-[22ch] font-serif text-[clamp(34px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
            Where I have <em className="italic text-amber">worked</em>, in reverse.
          </h2>
        </header>

        {/* Roles */}
        <div>
          {ROLES.map((r) => (
            <RoleEntry key={r.company} role={r} />
          ))}
        </div>

        {/* Education */}
        <div className="mt-[clamp(40px,5vw,64px)]">
          <div className="mb-5 flex items-baseline gap-4">
            <span className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-amber">04</span>
            <h3 className="m-0 font-serif text-[28px] font-medium tracking-[-0.015em] text-ink">
              Education
            </h3>
            <span className="h-px flex-1 bg-rule" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(16px,2vw,28px)]">
            {EDUCATION.map((e) => (
              <div key={e.institution} className="border border-rule bg-paper p-[22px]">
                <p className="mb-2 font-mono text-[11.5px] tracking-[0.06em] text-ink-faint">{e.dates}</p>
                <h4 className="mb-1.5 font-serif text-[19px] font-semibold tracking-[-0.01em] text-ink">
                  {e.institution}
                </h4>
                <p className="mb-3.5 text-[14.5px] italic text-ink-soft">{e.degree}</p>
                <ul className="flex flex-wrap gap-x-2.5 gap-y-1.5 font-mono text-[11px] text-ink-soft">
                  {e.honors.map((h) => (
                    <li key={h} className="border border-rule bg-paper-deep px-2 py-[3px]">
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
