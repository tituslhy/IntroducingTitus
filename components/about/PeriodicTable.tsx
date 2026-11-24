'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CHAPTERS,
  TIMELINE_END,
  TIMELINE_START,
  TOOLS,
  TOOL_CATEGORIES,
  atomicNumbers,
  chapterIndexAt,
  depthLabel,
  formatMonth,
  isDailyAt,
  journeyLine,
  monthsBetween,
  photoAt,
  storyAt,
  tableCells,
  toolTargetId,
} from '@/lib/about'
import { SHOW_EVENT, takePendingShow, type ShowDetail } from '@/lib/reveal'

/** Playing: each chapter's tools light up over `cascade` ms, then it holds for `hold` (`holdPhoto` with a photo). */
export const CHAPTER_MS = { cascade: 1000, hold: 6000, holdPhoto: 8000 }

const MONTHS = monthsBetween(TIMELINE_START, TIMELINE_END)
const LAST = MONTHS.length - 1
/** The month index each chapter stops on. */
const STOPS = CHAPTERS.map((c) => MONTHS.indexOf(c.at))
const holdFor = (chapter: number) => (CHAPTERS[chapter].photo ? CHAPTER_MS.holdPhoto : CHAPTER_MS.hold)

/**
 * Every tool I've used as a periodic table. It plays once, chapter by chapter, when it comes into view: each
 * chapter's logos light up in the order I picked them up, then it holds so its story line (and photo) can be
 * read; hovering the dark tile holds it longer. An amber ring marks what I used every day at that point. The
 * chapter row above jumps to any chapter; the slider scrubs month by month.
 * `articleCounts[i]` is how many of my articles mention TOOLS[i] (counted on the server).
 */
export default function PeriodicTable({ articleCounts }: { articleCounts: number[] }) {
  const numbers = useMemo(() => atomicNumbers(TOOLS), [])
  const cells = useMemo(() => tableCells(TOOLS.length), [])
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  // The tools an Ask Titus answer named: outlined, with the rest faded, until the visitor uses the table.
  const [named, setNamed] = useState<number[]>([])
  // Whether this chapter's tools flash amber as they light (playing or jumping), or just appear (scrubbing).
  const [sparkle, setSparkle] = useState(true)
  const [held, setHeld] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)
  // Set once anything has moved the table (Ask Titus pointing at a tool), so playing on first view doesn't override it.
  const startedRef = useRef(false)

  const month = MONTHS[step]
  const litCount = TOOLS.filter((t) => t.since <= month).length
  const photo = photoAt(month)
  const chapter = chapterIndexAt(month)
  const atStop = STOPS.includes(step)
  const chapterFrom = chapter > 0 ? CHAPTERS[chapter - 1].at : ''

  // Play once when the table first comes into view; with reduced motion, jump to the finished table instead.
  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (typeof IntersectionObserver === 'undefined') {
      // Nothing to watch with: show the finished table.
      const id = requestAnimationFrame(() => setStep(LAST))
      return () => cancelAnimationFrame(id)
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        if (startedRef.current) return
        startedRef.current = true
        if (reduce) setStep(LAST)
        else setPlaying(true)
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // While playing: hold on a chapter's stop, otherwise run through its months quickly. Hovering the dark tile holds.
  useEffect(() => {
    if (!playing || held || step >= LAST) return
    const next = MONTHS[step + 1]
    const nextChapter = chapterIndexAt(next)
    const span = STOPS[nextChapter] - (nextChapter > 0 ? STOPS[nextChapter - 1] : -1)
    const delay = STOPS.includes(step) ? holdFor(chapterIndexAt(MONTHS[step])) : Math.max(12, Math.round(CHAPTER_MS.cascade / span))
    const id = window.setTimeout(() => {
      setStep(step + 1)
      setSparkle(true)
      if (step + 1 >= LAST) setPlaying(false)
    }, delay)
    return () => window.clearTimeout(id)
  }, [playing, held, step])

  const togglePlay = useCallback(() => {
    setNamed([])
    if (playing) return setPlaying(false)
    if (step >= LAST) setStep(0)
    setPlaying(true)
  }, [playing, step])

  const scrub = useCallback((value: number) => {
    setNamed([])
    setPlaying(false)
    setSparkle(false)
    setStep(value)
  }, [])

  /** Jump to a chapter: its tools spark as they arrive, and play stops so it can be read. */
  const jump = useCallback((i: number) => {
    setNamed([])
    setPlaying(false)
    setSparkle(true)
    setStep(STOPS[i])
  }, [])

  // Ask Titus pointed at tools: jump to the chapter where the last of them lights up, and show the first one's
  // details. The request can come as an event, or be waiting from just before this page finished mounting.
  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    const toolIndexes = (ids: string[]) => ids.map((id) => TOOLS.findIndex((t) => toolTargetId(t) === id)).filter((i) => i !== -1)
    const show = (ids: string[]) => {
      const found = toolIndexes(ids)
      if (found.length === 0) return
      const latest = found.map((i) => TOOLS[i].since).reduce((a, b) => (b > a ? b : a))
      startedRef.current = true
      setPlaying(false)
      setSparkle(true)
      setStep(STOPS[chapterIndexAt(latest)])
      setPicked(found[0])
      setNamed(found)
    }
    const hasTools = (ids: string[]) => toolIndexes(ids).length > 0
    const onShow = (e: Event) => {
      takePendingShow(hasTools) // handled here, so it isn't replayed when the table mounts again
      show((e as CustomEvent<ShowDetail>).detail?.ids ?? [])
    }
    el.addEventListener(SHOW_EVENT, onShow)
    const waiting = takePendingShow(hasTools)
    if (waiting) show(waiting)
    return () => el.removeEventListener(SHOW_EVENT, onShow)
  }, [])

  const tool = picked === null ? null : TOOLS[picked]
  const playLabel = playing ? 'Pause' : step >= LAST ? 'Replay' : 'Play'

  return (
    // The anchor ("stack") holds the chapter row too, so arriving here shows the chapters and the dark tile.
    <div id="stack" className="scroll-mt-32">
      <nav aria-label="Chapters" className="mb-3">
        <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {CHAPTERS.map((c, i) => {
            const current = i === chapter
            return (
              <li key={c.at}>
                <button
                  type="button"
                  onClick={() => jump(i)}
                  aria-current={current ? 'step' : undefined}
                  className={`relative overflow-hidden rounded-full border px-3 py-1.5 font-mono text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${
                    current ? 'border-ink bg-ink text-paper' : i < chapter ? 'border-rule text-ink' : 'border-rule text-ink-faint hover:text-ink'
                  }`}
                >
                  {c.label}
                  {current && playing && atStop && (
                    <span
                      key={step}
                      aria-hidden="true"
                      className="pt-progress absolute bottom-0 left-0 h-[2px] bg-amber-hi"
                      style={{ animationDuration: `${holdFor(i)}ms`, animationPlayState: held ? 'paused' : 'running' }}
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      <div
        ref={tableRef}
        className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-[5px] max-[820px]:grid-cols-[repeat(10,minmax(0,1fr))] max-[560px]:gap-1"
      >
        {/* The notch: date, story so far, the picked tool, controls and the photo for this stretch */}
        <div
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          className="glow-tile col-[3/13] row-[1/4] mb-2 mx-2 grid grid-cols-[minmax(0,1fr)_auto] gap-[18px] rounded-[22px] bg-ink px-5 py-4 text-paper max-[820px]:col-span-full max-[820px]:row-auto max-[820px]:mx-0 max-[820px]:grid-cols-[minmax(0,1fr)_40%] max-[820px]:gap-x-3 max-[820px]:gap-y-0">
          {/* On phones this wrapper dissolves so the photo can sit beside the date instead of under everything */}
          <div className="min-w-0 max-[820px]:contents">
            <p className="m-0 self-start font-serif text-[clamp(30px,3.4vw,46px)] font-medium leading-none tracking-[-0.03em] text-amber-hi">
              {formatMonth(month)}
            </p>
            <p className="m-0 mt-1.5 self-start font-mono text-[11.5px] text-[oklch(0.8_0.02_78)] max-[820px]:col-start-1">
              {step >= LAST ? journeyLine() : `${litCount} of ${TOOLS.length} tools`}
            </p>
            <p className="m-0 mt-2 min-h-[2.9em] max-w-[46ch] font-serif text-[16px] leading-[1.42] text-paper max-[820px]:col-span-full max-[820px]:mt-3">{storyAt(month)}</p>
            <p aria-live="polite" className="m-0 mt-1.5 min-h-[1.5em] font-mono text-[11.5px] leading-[1.5] text-[oklch(0.85_0.02_78)] max-[820px]:col-span-full">
              {tool && picked !== null && (
                <>
                  <b className="font-medium text-amber-hi">
                    {numbers[picked]} · {tool.name}
                  </b>{' '}
                  — <b className="font-medium text-amber-hi">{depthLabel(tool)}</b> · since {formatMonth(tool.since)} · {tool.where}
                  {articleCounts[picked] > 0 && ` · in ${articleCounts[picked]} article${articleCounts[picked] > 1 ? 's' : ''}`}
                </>
              )}
            </p>
            <div className="mt-2.5 flex items-center gap-3 max-[820px]:col-span-full">
              <button
                type="button"
                onClick={togglePlay}
                className="rounded-full border border-[oklch(1_0_0/0.3)] px-3 py-1.5 font-mono text-[12px] text-paper transition-colors hover:bg-paper hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
              >
                {playLabel}
              </button>
              <input
                type="range"
                min={0}
                max={LAST}
                step={1}
                value={step}
                onChange={(e) => scrub(Number(e.target.value))}
                aria-label="Timeline"
                aria-valuetext={formatMonth(month)}
                className="min-w-0 flex-1 accent-amber"
              />
            </div>
            {/* While a chapter holds by itself, say so and show how long until the next one */}
            <div className="mt-2 flex h-4 items-center gap-2.5 font-mono text-[11px] text-[oklch(0.8_0.02_78)] max-[820px]:col-span-full">
              {playing && atStop && step < LAST && (
                <>
                  <span className="shrink-0">{held ? 'Paused while you read' : `Next: ${CHAPTERS[chapter + 1].label}`}</span>
                  <span aria-hidden="true" className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-[oklch(1_0_0/0.15)]">
                    <span
                      key={step}
                      data-testid="hold-timer"
                      className="pt-progress absolute inset-y-0 left-0 bg-amber-hi"
                      style={{ animationDuration: `${holdFor(chapter)}ms`, animationPlayState: held ? 'paused' : 'running' }}
                    />
                  </span>
                </>
              )}
            </div>
          </div>
          {photo && (
            <figure className="m-0 flex w-[clamp(140px,15vw,220px)] flex-col justify-end max-[820px]:col-start-2 max-[820px]:row-span-2 max-[820px]:row-start-1 max-[820px]:w-full max-[820px]:justify-start">
              {/* eslint-disable-next-line @next/next/no-img-element -- images are unoptimised site-wide */}
              <img
                key={photo.src}
                src={photo.src}
                alt={photo.alt}
                style={{ objectPosition: photo.position }}
                className="pt-photo block aspect-[4/3] w-full rounded object-cover [border:1px_solid_oklch(1_0_0/0.4)] [filter:saturate(0.85)_contrast(1.03)]"
              />
              <figcaption className="mt-1.5 min-h-[2.8em] font-mono text-[10.5px] leading-[1.4] text-[oklch(0.8_0.02_78)]">
                {photo.caption}
                {photo.link && (
                  <>
                    {' · '}
                    <a href={photo.link.href} target="_blank" rel="noopener noreferrer" className="text-amber-hi underline underline-offset-2 hover:text-paper">
                      {photo.link.label} <span aria-hidden="true">↗</span>
                    </a>
                  </>
                )}
              </figcaption>
            </figure>
          )}
        </div>

        {cells.some(([, r]) => r > 6) && (
          <div aria-hidden="true" className="col-span-full row-[7] h-3.5 max-[820px]:hidden" />
        )}

        {TOOLS.map((t, i) => {
          const lit = t.since <= month
          const daily = lit && isDailyAt(t, month)
          const [col, row] = cells[i]
          return (
            <button
              key={t.name}
              id={toolTargetId(t)}
              type="button"
              title={t.name}
              aria-label={`${numbers[i]}, ${t.name}, since ${formatMonth(t.since)}`}
              aria-pressed={picked === i}
              onClick={() => {
                setPicked(i)
                setNamed([])
              }}
              onMouseEnter={() => window.matchMedia?.('(hover: hover)').matches && setPicked(i)}
              style={{ gridColumn: col, gridRow: row, '--cat': TOOL_CATEGORIES[t.category].tint } as React.CSSProperties}
              className={[
                'pt-el relative aspect-square rounded-[10px] border p-0 max-[560px]:rounded-[7px] max-[820px]:![grid-column:auto] max-[820px]:![grid-row:auto]',
                lit ? 'pt-lit border-transparent' : 'border-dashed border-rule bg-transparent',
                daily ? 'pt-daily' : '',
                lit && sparkle && t.since > chapterFrom ? 'pt-spark' : '',
                picked === i || named.includes(i) ? 'outline outline-2 outline-offset-2 outline-ink' : '',
                named.length > 0 && !named.includes(i) ? 'opacity-30' : '',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber',
              ].join(' ')}
            >
              <span className="absolute left-[5px] top-[3px] font-mono text-[8.5px] text-ink-faint max-[560px]:hidden">{numbers[i]}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- small logos, unoptimised site-wide */}
              <img src={t.logo} alt="" loading="lazy" className="absolute inset-[22%] h-[56%] w-[56%] object-contain max-[560px]:inset-[15%] max-[560px]:h-[70%] max-[560px]:w-[70%]" />
            </button>
          )
        })}
      </div>

      <ul className="m-0 mt-3.5 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 font-mono text-[11px] text-ink-soft">
        {Object.values(TOOL_CATEGORIES).map((c) => (
          <li key={c.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: c.tint }} />
            {c.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[3px] [box-shadow:inset_0_0_0_2px_var(--amber)]" />
          Amber ring: what I used every day at that point
        </li>
      </ul>
    </div>
  )
}
