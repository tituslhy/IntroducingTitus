'use client'

import { useState, useSyncExternalStore } from 'react'
import BackToTop from '@/components/BackToTop'
import AskPill from '@/components/tiles/AskPill'
import CountUp from '@/components/tiles/CountUp'
import type { Correction } from '@/lib/profile'
import type { Desk, Story } from '@/lib/writing-paper'

/** From this hour in Singapore (and until LATE_UNTIL) the paper is the late edition. */
const LATE_FROM = 19
const LATE_UNTIL = 5

/** The hour in Singapore, 0–23. */
export function singaporeHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Singapore' }).format(now))
}

export const isLateEdition = (hour: number) => hour >= LATE_FROM || hour < LATE_UNTIL

// The edition is settled once per page view, so there is nothing to subscribe to.
const noSubscribe = () => () => {}
const lateNow = () => isLateEdition(singaporeHour(new Date()))
const dayOnServer = () => false

/** "2026-10-16" → "Friday, 16 October 2026" (or without the weekday). Read as a calendar date, so no time zone can shift it. */
export function paperDate(date: string, weekday = false): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    ...(weekday && { weekday: 'long' }),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const KICKER = 'font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-amber'
/** Headline links underline in amber from left to right on hover. */
const HEADLINE_LINK =
  'bg-[linear-gradient(var(--amber),var(--amber))] bg-[length:0_2px] bg-[position:0_100%] bg-no-repeat transition-[background-size] duration-300 hover:bg-[length:100%_2px] focus-visible:bg-[length:100%_2px] focus-visible:outline-none'

function Picture({ story, tall, caption }: { story: Story; tall?: boolean; caption?: boolean }) {
  if (!story.cover) return null
  return (
    <figure className="group m-0 mb-3.5">
      <a
        href={story.url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={-1}
        aria-hidden="true"
        className={`block overflow-hidden bg-paper-deep ${tall ? 'aspect-[16/8.5] rounded-[20px]' : 'aspect-[3/2] rounded-2xl'}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Medium's CDN serves the size; images are unoptimised site-wide */}
        <img
          src={story.cover.src}
          alt=""
          loading="lazy"
          className="block h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
        />
      </a>
      {caption && story.cover.caption && (
        <figcaption className="mt-2 border-l-2 border-amber pl-2.5 font-mono text-[11.5px] leading-[1.45] text-ink-soft">
          {story.cover.caption}
        </figcaption>
      )}
    </figure>
  )
}

/** A smaller story: desk, headline, standfirst, date; optionally its picture on top. */
function StoryBlock({ story, deskName, picture }: { story: Story; deskName: string; picture?: boolean }) {
  return (
    <article className="min-w-0">
      {picture && <Picture story={story} />}
      <p className={`m-0 ${KICKER}`}>{deskName}</p>
      <h4 className="m-0 mt-1.5 font-serif text-[23px] font-medium leading-[1.15] tracking-[-0.015em] text-ink">
        <a href={story.url} target="_blank" rel="noopener noreferrer" className={HEADLINE_LINK}>
          {story.title}
        </a>
      </h4>
      <p className="m-0 mt-2 font-serif text-[16px] leading-[1.45] text-[oklch(0.3_0.012_60)]">{story.dek}</p>
      <p className="m-0 mt-2 font-mono text-[11px] text-ink-soft">{paperDate(story.date)}</p>
    </article>
  )
}

type Props = {
  stories: Story[]
  desks: Desk[]
  editions: { year: string; count: number }[]
  folio: string
  featuredBy: string[]
  corrections: Correction[]
  mediumUrl: string
}

/** The Writing page as a newspaper: an edition per year, a desk per theme, the latest story leading. */
export default function WritingPaper({ stories, desks, editions, folio, featuredBy, corrections, mediumUrl }: Props) {
  const [view, setView] = useState<{ year: string; desk: string | null }>({ year: editions[0]?.year ?? '', desk: null })
  // The visitor's clock, read after hydration; the server renders the day edition.
  const late = useSyncExternalStore(noSubscribe, lateNow, dayOnServer)

  const deskName = (s: Story) => desks.find((d) => d.id === s.desk)?.name ?? 'Writing'
  const list = view.desk ? stories.filter((s) => s.desk === view.desk) : stories.filter((s) => s.year === view.year)
  const [lead, ...rest] = list
  const rail = rest.slice(0, 3)
  const row = rest.slice(3, 6)
  const briefs = rest.slice(6)
  const since = editions[editions.length - 1]?.year
  const current = view.desk ? `${desks.find((d) => d.id === view.desk)?.name} desk` : `${view.year} edition`

  return (
    <section id="writing" className={`bg-paper text-ink transition-colors duration-500 ${late ? 'late-edition' : ''}`}>
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(20px,3vw,40px)] pb-[clamp(28px,5vw,72px)] max-[720px]:border-t-0 [@media(max-height:480px)]:border-t-0">
        <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
          <span className="font-semibold tracking-[0.08em] text-amber">{folio}</span>
          <span className="font-medium text-ink">Writing</span>
          <span className="h-px flex-1 self-center bg-rule" />
          <BackToTop />
        </div>

        {/* The nameplate, between a heavy rule and a hairline. */}
        <header className="mt-2.5 grid grid-cols-[230px_1fr_250px] items-center gap-6 border-b border-t-[3px] border-ink pb-3.5 pt-[18px] max-[960px]:grid-cols-1">
          <div className="glow-tile rounded-[20px] bg-ink px-[18px] py-4 text-paper max-[960px]:order-2 max-[960px]:max-w-[300px]">
            <span className="block font-serif text-[40px] font-medium leading-none tracking-[-0.03em] text-amber-hi">
              <CountUp figure={String(stories.length)} />
            </span>
            <span className="mt-1.5 block font-mono text-[11.5px] leading-[1.45] text-[oklch(0.85_0.02_78)]">
              technical articles{since ? ` since ${since}` : ''}
            </span>
          </div>
          <h2 className="m-0 whitespace-nowrap text-center font-serif text-[clamp(40px,7.4vw,112px)] font-medium leading-[0.92] tracking-[-0.035em] max-[960px]:order-1 max-[520px]:whitespace-normal">
            The Titus <em className="italic text-amber">Times</em>
          </h2>
          <div className="text-right font-mono text-[12px] leading-[1.6] text-ink-soft max-[960px]:order-3 max-[960px]:text-left">
            What I have learned,
            <br />
            written down.
            {late && (
              <>
                <br />
                <span className="mt-2 inline-block -rotate-3 border-[1.5px] border-amber px-2 py-1 text-[11px] font-semibold tracking-[0.2em] text-amber">
                  LATE EDITION
                </span>
              </>
            )}
            <br />
            <AskPill ask={{ label: 'what to read first', question: 'Which of your articles should I read first?' }} text="Ask what to read first" />
          </div>
        </header>

        <div className="flex flex-wrap justify-between gap-4 border-b-[3px] border-double border-ink py-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
          <span>Singapore</span>
          <span>{lead ? paperDate(lead.date, true) : ''}</span>
          <span>
            <b className="font-semibold text-ink">{current}</b> · {list.length} article{list.length === 1 ? '' : 's'}
          </span>
        </div>

        <nav aria-label="Editions" className="flex flex-wrap items-center gap-x-[22px] gap-y-1.5 border-b border-rule py-3.5">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">Editions</span>
          {editions.map((e) => (
            <button
              key={e.year}
              type="button"
              aria-pressed={!view.desk && view.year === e.year}
              onClick={() => setView({ year: e.year, desk: null })}
              className="border-b-2 border-transparent bg-transparent py-1 font-serif text-[15px] font-medium text-ink-soft aria-pressed:border-amber aria-pressed:text-ink"
            >
              {e.year}
              <small className="ml-1 font-mono text-[11px] text-ink-faint">{e.count}</small>
            </button>
          ))}
        </nav>

        <nav aria-label="Desks" className="flex flex-wrap items-center gap-2 pt-3.5">
          <span className="pr-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">Desks</span>
          {desks.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={view.desk === d.id}
              onClick={() => setView((v) => ({ ...v, desk: v.desk === d.id ? null : d.id }))}
              className="group rounded-full bg-latte px-[13px] py-[7px] font-mono text-[12.5px] text-latte-soft transition-colors hover:bg-ink hover:text-paper aria-pressed:bg-ink aria-pressed:text-paper"
            >
              {d.name}
              <b className="ml-1 font-semibold text-latte-accent group-hover:text-amber-hi group-aria-pressed:text-amber-hi">{d.count}</b>
            </button>
          ))}
        </nav>

        {lead && (
          <div key={`${view.year}-${view.desk}`} className="paper-turn">
            <div className="mt-7 grid grid-cols-[2fr_1fr] max-[960px]:grid-cols-1">
              <article className="min-w-0 border-r border-rule pr-8 max-[960px]:border-b max-[960px]:border-r-0 max-[960px]:pb-6 max-[960px]:pr-0">
                <p className={`m-0 ${KICKER}`}>Latest story · {deskName(lead)}</p>
                <h3 className="m-0 mt-2.5 font-serif text-[clamp(34px,4.6vw,64px)] font-medium leading-[1.02] tracking-[-0.03em] [text-wrap:balance]">
                  <a href={lead.url} target="_blank" rel="noopener noreferrer" className={HEADLINE_LINK}>
                    {lead.title}
                  </a>
                </h3>
                <p className="m-0 mt-3.5 font-serif text-[22px] italic leading-[1.35] text-[oklch(0.3_0.012_60)]">{lead.dek}</p>
                <div className="mt-[18px]">
                  <Picture story={lead} tall caption />
                </div>
                <p className="m-0 border-t border-rule pt-2.5 font-mono text-[12px] text-ink-soft">
                  By <b className="font-medium text-ink">Titus Lim</b> · {paperDate(lead.date)}
                </p>
                <p className="m-0 mt-4 font-serif text-[19px] leading-[1.6] first-letter:float-left first-letter:pr-2.5 first-letter:pt-1.5 first-letter:text-[4.1em] first-letter:font-medium first-letter:leading-[0.82] first-letter:text-amber">
                  {lead.opening}
                </p>
                <a
                  href={lead.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3.5 inline-block border-b border-amber pb-0.5 font-mono text-[13px] text-ink"
                >
                  Continue reading on Medium ↗
                </a>
                <div>
                  <AskPill ask={{ label: 'this article', question: `Summarise “${lead.title}” for me.` }} />
                </div>
              </article>
              {rail.length > 0 && (
                <aside className="min-w-0 pl-7 max-[960px]:pl-0 max-[960px]:pt-5">
                  {rail.map((s, i) => (
                    <div key={s.slug} className={i > 0 ? 'mt-[18px] border-t border-rule pt-[18px]' : ''}>
                      <StoryBlock story={s} deskName={deskName(s)} picture={i === 0} />
                    </div>
                  ))}
                </aside>
              )}
            </div>

            {row.length > 0 && (
              <div className="mt-7 grid grid-cols-3 gap-x-12 border-t-[3px] border-double border-ink pt-[22px] max-[960px]:grid-cols-1 max-[960px]:gap-y-[18px]">
                {row.map((s, i) => (
                  <div
                    key={s.slug}
                    className={`relative ${i > 0 ? 'before:absolute before:-left-6 before:bottom-0 before:top-0 before:border-l before:border-rule max-[960px]:border-t max-[960px]:border-rule max-[960px]:pt-[18px] max-[960px]:before:hidden' : ''}`}
                  >
                    <StoryBlock story={s} deskName={deskName(s)} picture />
                  </div>
                ))}
              </div>
            )}

            <div className={`mt-[30px] grid gap-8 border-t border-ink pt-[18px] ${briefs.length ? 'grid-cols-[1fr_300px] max-[960px]:grid-cols-1' : 'grid-cols-1'}`}>
              {briefs.length > 0 && (
                <div className="min-w-0">
                  <h4 className="m-0 mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-ink">In brief</h4>
                  <ul className="m-0 list-none p-0" style={{ columns: '3 220px', columnGap: 28, columnRule: '1px solid var(--rule)' }}>
                    {briefs.map((s) => (
                      <li key={s.slug} className="mb-3 break-inside-avoid border-b border-dotted border-rule pb-3">
                        <span className="block font-mono text-[11px] text-ink-soft">
                          {paperDate(s.date)} · {deskName(s)}
                        </span>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className={`font-serif text-[17px] font-medium leading-[1.3] ${HEADLINE_LINK}`}>
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <aside className={`grid content-start gap-3.5 ${briefs.length ? '' : 'grid-cols-2 max-[960px]:grid-cols-1'}`}>
                {corrections.length > 0 && (
                  <div className="rounded-[20px] bg-paper-deep px-5 py-[18px]">
                    <h4 className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">Corrections</h4>
                    {corrections.map((c) => (
                      <div key={c.ref}>
                        <p className="m-0 mt-2.5 font-serif text-[15.5px] leading-[1.5]">{c.text}</p>
                        <p className="m-0 mt-2 font-mono text-[11px] text-ink-soft">
                          Fixed by {c.by} ·{' '}
                          <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-ink-soft underline decoration-amber underline-offset-2">
                            {c.ref}
                          </a>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded-[20px] bg-paper-deep px-5 py-[18px]">
                  <h4 className="m-0 mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">Featured by</h4>
                  <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                    {featuredBy.map((f) => (
                      <li key={f} className="rounded-full bg-paper px-[11px] py-1.5 font-mono text-[12px] text-ink-soft">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        )}

        <a
          href={mediumUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-[clamp(28px,4vw,44px)] inline-flex items-center gap-3 rounded-full border border-ink px-[22px] py-3 font-mono text-[12px] uppercase tracking-[0.1em] text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          <span>Every article on Medium</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </div>
    </section>
  )
}
