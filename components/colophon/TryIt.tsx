'use client'

/**
 * The colophon's "Try it" stage: replays a recorded reply (content/colophon-traces.json,
 * written by `npm run colophon:record`) on one dark stage. The diagram is the trace: boxes
 * light as their spans run and then show what they measured, and the reply streams into
 * the drawer the line ends in. A one-line timeline under it can be scrubbed; "view as a
 * trace" opens the full LangSmith-style waterfall. Any box with spans opens them (input and
 * output). No model is called; every number is from the recording. Never shows the system
 * prompt (the recording doesn't hold it).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ReplyDiagram, { type BoxState, type DiagramKey } from '@/components/colophon/ReplyDiagram'
import type { Recording, ReplaySpan, SpanKind } from '@/lib/colophon-trace'
import { citationUrlTransform, linkCitations, sourceForHref } from '@/lib/citations'
import { groupStops, type StopTarget } from '@/lib/page-stops'
import { MIN_SCORE, RELEVANT } from '@/lib/search-config'

/** Replay speed: one and a half times real time, slow enough to follow. Bars keep their real durations. */
export const SPEED = 1.5
/** The last GPT round, where the answer streams; can play slower than the rest so the reply can be read as it arrives. */
export const ANSWER_SPEED = 1.5
/** How the replay speed reads on the page. */
export const speedLabel = () => (SPEED === ANSWER_SPEED ? `replayed at ${SPEED}×` : `replayed at ${SPEED}×, the answer at ${ANSWER_SPEED}×`)

/** Recorded ms reached after `wall` ms of playback, when the answer starts streaming at recorded ms `cut`. */
export function wallToRecorded(wall: number, cut: number): number {
  const w = Math.max(0, wall)
  return w < cut / SPEED ? w * SPEED : cut + (w - cut / SPEED) * ANSWER_SPEED
}

/** Inverse of wallToRecorded: the playback ms at which recorded ms `t` is reached. */
export function recordedToWall(t: number, cut: number): number {
  const r = Math.max(0, t)
  return r < cut ? r / SPEED : cut / SPEED + (r - cut) / ANSWER_SPEED
}
/** A span shorter than this still lights its boxes for a moment. */
const MIN_LIT_MS = 150

type KV = Record<string, unknown>
const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** The diagram boxes a span exercises. */
export function keysFor(span: ReplaySpan): DiagramKey[] {
  if (span.kind === 'llm') return span.name === 'gpt round 1' ? ['gpt', 'record'] : ['gpt', 'results']
  if (span.name === 'search_writing') return ['tools', 'calls', 'search']
  if (span.name === 'read_writing') return ['tools', 'calls', 'read']
  if (span.name === 'show_on_page') return ['tools', 'calls', 'show']
  if (span.name.startsWith('jev filter')) return ['filter']
  if (span.name.startsWith('jev rank')) return ['rank', 'merge']
  if (span.name.startsWith('jev sections')) return ['sections']
  return []
}

/** Each diagram box's state at recorded time `t` (ms). Running wins over finished. */
export function diagramState(spans: ReplaySpan[], t: number, totalMs: number): Partial<Record<DiagramKey, BoxState>> {
  const state: Partial<Record<DiagramKey, BoxState>> = {}
  if (t <= 0) return state
  state.visitor = 'done'
  state.guards = 'done'
  for (const s of spans) {
    if (s.parent === null || t < s.start) continue
    const running = t < Math.max(s.end, s.start + MIN_LIT_MS) && t < totalMs
    for (const k of keysFor(s)) if (running) state[k] = 'lit'; else if (state[k] !== 'lit') state[k] = 'done'
  }
  if (t >= totalMs) for (const k of ['answer', 'checks', 'drawer'] as DiagramKey[]) state[k] = 'done'
  return state
}

/** Gridline step for an axis covering `totalMs`: at most seven intervals. */
export function axisFor(totalMs: number): { step: number; max: number } {
  const step = [1000, 2000, 5000, 10000, 20000].find((s) => totalMs / s <= 7) ?? 30000
  return { step, max: Math.max(step, Math.ceil(totalMs / step) * step) }
}

/** Retrieval work: the reading tools and Jev's steps (not show_on_page, which can come rounds later). */
export const isRetrieval = (s: ReplaySpan) => s.kind === 'jev' || s.name === 'search_writing' || s.name === 'read_writing'

/** The window the zoom magnifies: the retrieval work, padded a little. */
export function zoomWindow(spans: ReplaySpan[]): { from: number; to: number } | null {
  const work = spans.filter(isRetrieval)
  if (work.length === 0) return null
  const from = Math.min(...work.map((s) => s.start))
  const to = Math.max(...work.map((s) => Math.max(s.end, s.start + 1)))
  const pad = Math.max(20, (to - from) * 0.06)
  return { from: Math.max(0, from - pad), to: to + pad }
}

/** How deep a span sits in the tree (root 0). */
export function depthOf(span: ReplaySpan, spans: ReplaySpan[]): number {
  let d = 0
  let p = span.parent
  while (p !== null && d < 8) {
    d++
    p = spans.find((s) => s.id === p)?.parent ?? null
  }
  return d
}

/** The span running at `t`, latest-started first; ignores the root. */
export function runningSpan(spans: ReplaySpan[], t: number): ReplaySpan | null {
  const live = spans.filter((s) => s.parent !== null && t >= s.start && t < Math.max(s.end, s.start + MIN_LIT_MS))
  return live.sort((a, b) => b.start - a.start)[0] ?? null
}

/** The plain-English steps, built from the recording so they can't claim anything it didn't do. */
export function storySteps(r: Recording, articleCount: number): { at: number; text: string }[] {
  const steps: { at: number; text: string }[] = [{ at: 0, text: 'Guards check the origin, the rate and the size before any model runs.' }]
  const rounds = r.spans.filter((s) => s.kind === 'llm')
  const first = rounds[0]
  if (first) steps.push({ at: first.start + 1, text: 'GPT reads the question with my record and the library map in its prompt.' })
  const searches = r.spans.filter((s) => s.name === 'search_writing')
  const reads = r.spans.filter((s) => s.name === 'read_writing')
  const shows = r.spans.filter((s) => s.name === 'show_on_page')
  const served = (s: ReplaySpan) => (Array.isArray(s.outputs.articles) ? s.outputs.articles.length : 0)
  const tools = [...searches, ...reads, ...shows].sort((a, b) => a.start - b.start)
  if (tools.length) {
    const parts: string[] = []
    if (searches.length) {
      const topics = searches.flatMap((s) => (Array.isArray(s.inputs.topics) ? (s.inputs.topics as string[]) : []))
      parts.push(`searches my writing for ${topics.map((t) => `“${t}”`).join(' and ')}`)
    }
    if (reads.length) {
      const n = reads.reduce((a, s) => a + served(s), 0)
      parts.push(
        reads.length > 1
          ? `splits the question into ${reads.length} parts and opens ${plural(n, 'article')} from the library map, one call per part`
          : `opens ${plural(n, 'article')} it picked from the library map`
      )
    }
    if (shows.length) {
      const targets = shows.flatMap((s) => (Array.isArray(s.inputs.targets) ? s.inputs.targets : []))
      parts.push(`points at ${plural(targets.length, 'place')} on this site`)
    }
    steps.push({ at: tools[0].start, text: `It ${parts.join(', and ')}.` })
  }
  const jev = r.spans.filter((s) => s.kind === 'jev')
  if (jev.length) {
    const sections = jev.filter((s) => s.name.startsWith('jev sections'))
    const kept = sections.reduce((a, s) => a + (Array.isArray(s.outputs.chosen) ? s.outputs.chosen.length : 0), 0)
    const scored = sections.reduce((a, s) => a + (Array.isArray(s.outputs.scored) ? s.outputs.scored.length : 0), 0)
    const filtered = jev.some((s) => s.name.startsWith('jev filter'))
    const sectionText = sections.length ? `keeps ${kept} of ${plural(scored, 'section')} across ${plural(sections.length, 'article')}` : ''
    steps.push({
      at: Math.min(...jev.map((s) => s.start)),
      text: filtered
        ? `Jev asks one yes-or-no question of all ${articleCount} articles per topic, scores the survivors 0–3${sectionText ? `, and ${sectionText}` : ''}.`
        : `Jev scores every section against each part and ${sectionText}.`,
    })
  }
  const last = rounds[rounds.length - 1]
  if (last && last !== first) {
    steps.push({
      at: last.start,
      text:
        r.sources.length > 1
          ? `GPT writes the answer from my record and the articles, citing them [1]–[${r.sources.length}].`
          : r.sources.length === 1
            ? 'GPT writes the answer from my record and the article, citing it [1].'
            : 'GPT writes the answer from my record.',
    })
  }
  steps.push({
    at: r.totalMs,
    text: r.actions.length
      ? 'Checks rebuild the footnotes from my articles only; the reply offers places on the site to look.'
      : 'Checks rebuild the footnotes from my articles only.',
  })
  return steps
}

// ---------------------------------------------------------------------------

const REDUCED = '(prefers-reduced-motion: reduce)'
const subscribeReduced = (cb: () => void) => {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.(REDUCED) : undefined
  mq?.addEventListener?.('change', cb)
  return () => mq?.removeEventListener?.('change', cb)
}
const getReduced = () => (typeof window !== 'undefined' && window.matchMedia?.(REDUCED)?.matches) || false

/** Whether the visitor asked for less motion; false on the server. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, getReduced, () => false)
}

const KIND_COLOUR: Record<SpanKind, string> = { chain: 'var(--c-root)', llm: 'var(--c-llm)', tool: 'var(--c-tool)', jev: 'var(--c-jev)' }
const KIND_LABEL: Record<SpanKind, string> = { chain: 'chain', llm: 'llm', tool: 'tool', jev: 'jev' }

function SpanRow({
  span,
  depth,
  t,
  total,
  from,
  to,
  compact,
  folded = 0,
  selected,
  onPick,
  onHover,
}: {
  span: ReplaySpan
  depth: number
  /** Jev steps under this span shown only in the zoom: a "+n jev" hint here. */
  folded?: number
  t: number
  /** The recording's length: nothing runs once the replay has ended. */
  total: number
  from: number
  to: number
  compact?: boolean
  selected: boolean
  onPick: (id: number) => void
  onHover: (id: number | null) => void
}) {
  const seen = t > 0 && t >= span.start
  const running = seen && span.parent !== null && t < total && t < Math.max(span.end, span.start + MIN_LIT_MS)
  const range = to - from
  const shown = Math.max(0, Math.min(t - span.start, span.end - span.start))
  const colour = KIND_COLOUR[span.kind]
  const isRoot = span.kind === 'chain'
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(span.id)}
        onMouseEnter={() => onHover(span.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(span.id)}
        onBlur={() => onHover(null)}
        aria-pressed={selected}
        aria-label={`${span.name}, ${secs(span.end - span.start)}`}
        className={`grid w-full grid-cols-1 items-center rounded-md py-1 text-left font-mono transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--c-llm)] min-[641px]:grid-cols-[var(--nm)_1fr] min-[641px]:py-0 ${
          compact ? 'text-[10.5px] min-[641px]:h-[18px]' : 'text-[11.5px] min-[641px]:h-6'
        } ${selected ? 'bg-white/10' : 'hover:bg-white/5'} ${seen || t <= 0 ? '' : 'opacity-25'}`}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 min-[641px]:flex-nowrap min-[641px]:overflow-hidden min-[641px]:whitespace-nowrap" style={{ paddingLeft: depth * 12 }}>
          {depth > 0 && <span aria-hidden="true" className="text-white/20">└</span>}
          <span aria-hidden="true" className="h-2 w-2 flex-none rounded-[2px]" style={{ background: colour }} />
          <span className="min-[641px]:truncate">{span.name}</span>
          <span className="flex-none text-[var(--scr-dim)]">{secs(span.end - span.start)}</span>
          {folded > 0 && <span className="flex-none text-[var(--c-jev)]">+{folded} jev</span>}
        </span>
        <span className="relative h-[16px] min-[641px]:h-full">
          {(seen || t <= 0) && (
            <span
              className={`absolute rounded ${isRoot ? 'top-[9px] h-[5px] opacity-80' : compact ? 'top-[3px] h-[11px]' : 'top-[5px] h-[13px]'} ${running ? 'trace-run' : ''}`}
              style={{
                left: `${((span.start - from) / range) * 100}%`,
                width: `${((t <= 0 ? span.end - span.start : shown) / range) * 100}%`,
                minWidth: 3,
                background: colour,
                color: colour,
                opacity: t <= 0 ? 0.35 : 1,
              }}
            />
          )}
        </span>
      </button>
    </li>
  )
}

function Playhead({ t, from, to }: { t: number; from: number; to: number }) {
  if (t <= from || t >= to) return null
  const f = (t - from) / (to - from)
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 top-0 w-0 border-l-[1.5px] border-[var(--c-llm)]"
      style={{ left: `calc(var(--nm) + (100% - var(--nm)) * ${f})` }}
    >
      <span className="absolute -left-[5px] -top-1 h-2 w-2 rounded-full bg-[var(--c-llm)] shadow-[0_0_10px_var(--c-llm)]" />
    </span>
  )
}

function Bars({ items, max }: { items: { label: string; value: number; on: boolean }[]; max: number }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {items.map((it, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,1fr)_88px_36px] items-center gap-2">
          <span className={`truncate ${it.on ? 'text-[var(--scr-text)]' : 'text-[var(--scr-dim)]'}`}>{it.label}</span>
          <span className="h-1.5 rounded bg-white/10">
            <span className="block h-full rounded" style={{ width: `${Math.max(0, Math.min(1, it.value / max)) * 100}%`, background: it.on ? 'var(--c-jev)' : 'oklch(1 0 0 / 0.25)' }} />
          </span>
          <span className="text-right tabular-nums text-[var(--scr-dim)]">{it.value.toFixed(2)}</span>
        </li>
      ))}
    </ul>
  )
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
      <span className="text-[var(--scr-dim)]">{k}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function Detail({ span, rec, titleOf, t }: { span: ReplaySpan | null; rec: Recording; titleOf: (slug: string) => string; t: number }) {
  if (!span) {
    return <p className="text-[var(--scr-dim)]">Press Play, or pick any span to read its input and output.</p>
  }
  const i = span.inputs
  const o = span.outputs
  const arts = (v: unknown) => (Array.isArray(v) ? (v as KV[]) : [])
  let body: React.ReactNode = null
  if (span.kind === 'chain') {
    body = (
      <>
        <Field k="input">“{rec.question}”</Field>
        <Field k="output">answer · {rec.sources.length} sources · {rec.actions.length} page stops</Field>
      </>
    )
  } else if (span.kind === 'llm') {
    const calls = arts(o.calls)
    body = (
      <>
        <Field k="model">{rec.models.gpt}</Field>
        <Field k="input">
          {typeof i.question === 'string' ? `“${i.question}” + my record and library map` : `${String(i.toolResults ?? 0)} tool results`}
        </Field>
        <Field k="tools">{Array.isArray(i.tools) ? (i.tools as string[]).join(', ') : '—'}</Field>
        {calls.length > 0 && (
          <Field k="calls">
            {calls.map((c, n) => (
              <span key={n} className="block text-[oklch(0.82_0.1_140)]">
                {String(c.name)}({JSON.stringify(c.arguments)})
              </span>
            ))}
          </Field>
        )}
        {typeof o.text === 'string' && o.text && (
          <Field k="output">{t > 0 && t < span.end ? 'streaming…' : o.text.length > 220 ? `${o.text.slice(0, 220)}…` : o.text}</Field>
        )}
      </>
    )
  } else if (span.name === 'search_writing' || span.name === 'read_writing') {
    body = (
      <>
        {Array.isArray(i.topics) && <Field k="topics">{JSON.stringify(i.topics)}</Field>}
        {typeof i.focus === 'string' && <Field k="focus">{i.focus}</Field>}
        <Field k="served">
          {arts(o.articles).map((a) => (
            <span key={String(a.n)} className="block">
              [{String(a.n)}] {String(a.title)}
            </span>
          ))}
        </Field>
        {typeof o.remaining === 'number' && <Field k="waiting">{o.remaining} more ranked behind these</Field>}
      </>
    )
  } else if (span.name === 'show_on_page') {
    body = <Field k="targets">{Array.isArray(i.targets) ? (i.targets as string[]).join(', ') : '—'}</Field>
  } else if (span.name.startsWith('jev filter')) {
    const list = arts(o.shortlist)
    body = (
      <>
        <Field k="model">{String(o.model ?? rec.models.jev)} · noul</Field>
        <Field k="input">“{String(i.query)}” · {String(i.articles)} articles, one yes-or-no each</Field>
        <Field k="kept">{list.length} with p(yes) ≥ {RELEVANT}</Field>
        <Bars
          max={1}
          items={[
            ...list.map((r) => ({ label: titleOf(String(r.slug)), value: Number(r.relevance ?? 0), on: true })),
            ...arts(o.nearMisses).map((r) => ({ label: titleOf(String(r.slug)), value: Number(r.relevance ?? 0), on: false })),
          ]}
        />
      </>
    )
  } else if (span.name.startsWith('jev rank')) {
    body = (
      <>
        <Field k="model">{rec.models.jev} · score</Field>
        <Field k="input">“{String(i.query)}” · {arts(i.shortlist).length || (Array.isArray(i.shortlist) ? i.shortlist.length : 0)} survivors, scored 0–3</Field>
        <Bars max={3} items={arts(o.ranked).map((r) => ({ label: titleOf(String(r.slug)), value: Number(r.score ?? 0), on: Number(r.score ?? 0) >= MIN_SCORE }))} />
      </>
    )
  } else if (span.name.startsWith('jev sections')) {
    const chosen = new Set(Array.isArray(o.chosen) ? (o.chosen as string[]) : [])
    const scored = arts(o.scored)
    body = (
      <>
        <Field k="article">{titleOf(String(i.slug))}</Field>
        <Field k="focus">{String(i.focus)}</Field>
        <Field k="kept">
          {chosen.size} of {scored.length} sections
        </Field>
        <Bars max={3} items={scored.map((s) => ({ label: String(s.key).replace(/\\/g, ''), value: Number(s.score ?? 0), on: chosen.has(String(s.key)) }))} />
      </>
    )
  }
  return (
    <>
      <div className="mb-1.5 flex items-center gap-2 font-semibold">
        <span className="rounded-full border px-2 py-px text-[9.5px] font-medium uppercase tracking-[0.1em]" style={{ color: KIND_COLOUR[span.kind] }}>
          {KIND_LABEL[span.kind]}
        </span>
        <span className="truncate">{span.name}</span>
        <span className="ml-auto whitespace-nowrap font-normal text-[var(--scr-dim)]">
          {secs(span.start)} → {secs(span.end)}
        </span>
      </div>
      <div className="space-y-1">{body}</div>
    </>
  )
}

// ---------------------------------------------------------------------------
// The stage's own helpers (exported for tests)
// ---------------------------------------------------------------------------

/** The spans behind each clickable box, in the order they ran. */
export function spansByKey(r: Recording): Partial<Record<DiagramKey, ReplaySpan[]>> {
  const of = (test: (s: ReplaySpan) => boolean) => r.spans.filter(test).sort((a, b) => a.start - b.start)
  const root = r.spans.filter((s) => s.parent === null)
  const map: Partial<Record<DiagramKey, ReplaySpan[]>> = {
    gpt: of((s) => s.kind === 'llm'),
    show: of((s) => s.name === 'show_on_page'),
    search: of((s) => s.name === 'search_writing'),
    merge: of((s) => s.name === 'search_writing'),
    read: of((s) => s.name === 'read_writing'),
    filter: of((s) => s.name.startsWith('jev filter')),
    rank: of((s) => s.name.startsWith('jev rank')),
    sections: of((s) => s.name.startsWith('jev sections')),
    checks: root,
    drawer: root,
  }
  for (const k of Object.keys(map) as DiagramKey[]) if (!map[k]?.length) delete map[k]
  return map
}

/** What each box measured by recorded time `t`: shown on the box, in place of its explanation, once it has run. */
export function measuredAt(r: Recording, t: number): Partial<Record<DiagramKey, string>> {
  const m: Partial<Record<DiagramKey, string>> = {}
  if (t <= 0) return m
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  const ended = (test: (s: ReplaySpan) => boolean) => r.spans.filter((s) => test(s) && t >= s.end)
  m.guards = 'passed'

  const rounds = r.spans.filter((s) => s.kind === 'llm' && t >= s.start).sort((a, b) => a.start - b.start)
  const live = rounds.find((s) => t < s.end && t < r.totalMs)
  if (live) m.gpt = `round ${rounds.indexOf(live) + 1} · ${secs(t - live.start)}`
  else if (rounds.length) {
    const last = rounds[rounds.length - 1]
    m.gpt = t >= r.totalMs
      ? `${plural(rounds.length, 'round')} · ${secs(rounds.reduce((a, s) => a + s.end - s.start, 0))}`
      : `round ${rounds.length} · ${secs(last.end - last.start)}`
  }

  const filters = ended((s) => s.name.startsWith('jev filter'))
  if (filters.length) m.filter = `kept ${filters.map((s) => arr(s.outputs.shortlist).length).join(' · ')}`
  const ranks = ended((s) => s.name.startsWith('jev rank'))
  if (ranks.length)
    m.rank = `kept ${ranks.map((s) => arr(s.outputs.ranked).filter((x) => Number((x as KV).score ?? 0) >= MIN_SCORE).length).join(' · ')}`
  const searches = ended((s) => s.name === 'search_writing')
  if (searches.length) m.merge = `served ${searches.reduce((a, s) => a + arr(s.outputs.articles).length, 0)}`
  const reads = ended((s) => s.name === 'read_writing')
  if (reads.length) m.read = `${plural(reads.reduce((a, s) => a + arr(s.outputs.articles).length, 0), 'article')} · ${plural(reads.length, 'call')}`
  const sections = ended((s) => s.name.startsWith('jev sections'))
  if (sections.length) {
    const kept = sections.reduce((a, s) => a + arr(s.outputs.chosen).length, 0)
    const of = sections.reduce((a, s) => a + arr(s.outputs.scored).length, 0)
    m.sections = `kept ${kept} of ${plural(of, 'section')}`
  }
  if (t >= r.totalMs) {
    m.checks = r.sources.length ? plural(r.sources.length, 'source') : 'passed'
    m.drawer = r.actions.length ? plural(r.actions.length, 'page stop') : 'streamed'
  }
  return m
}

/** A tab label for one of several spans behind the same box. */
export function spanTab(s: ReplaySpan, i: number): string {
  if (s.kind === 'llm') return `round ${i + 1}`
  if (typeof s.inputs.query === 'string') return s.inputs.query
  if (s.name.startsWith('jev sections') || s.name === 'read_writing') return `${s.name.startsWith('jev') ? 'article' : 'part'} ${i + 1}`
  return `${i + 1}`
}

const BOX_NAME: Partial<Record<DiagramKey, string>> = {
  gpt: 'GPT',
  show: 'show_on_page',
  search: 'search_writing',
  merge: 'merge',
  read: 'read_writing',
  filter: 'Jev filter',
  rank: 'Jev rank',
  sections: 'Jev sections',
  checks: 'checks',
  drawer: 'drawer',
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** The waterfall folded into one line: top-level spans as segments, Jev's calls as ticks above. Click or drag to seek. */
function Timeline({ rec, t, onSeek }: { rec: Recording; t: number; onSeek: (t: number) => void }) {
  const total = rec.totalMs
  const axis = axisFor(total)
  const root = rec.spans.find((s) => s.parent === null)
  const top = rec.spans.filter((s) => s.parent === root?.id && s.kind !== 'jev' && s.end > s.start)
  const jev = rec.spans.filter((s) => s.kind === 'jev')
  const pct = (ms: number) => `${(ms / axis.max) * 100}%`
  const track = useRef<HTMLDivElement>(null)
  const seekAt = (clientX: number) => {
    const r = track.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    onSeek(Math.max(0, Math.min(total, ((clientX - r.left) / r.width) * axis.max)))
  }
  const colour = (s: ReplaySpan) => (s.kind === 'llm' ? 'var(--amber)' : 'oklch(0.94 0.02 78 / 0.75)')
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Replay position"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(t)}
      aria-valuetext={`${secs(t)} of ${secs(total)}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => e.buttons === 1 && seekAt(e.clientX)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek(Math.min(total, t + 500))
        else if (e.key === 'ArrowLeft') onSeek(Math.max(0, t - 500))
        else if (e.key === 'Home') onSeek(0)
        else if (e.key === 'End') onSeek(total)
        else return
        e.preventDefault()
      }}
      className="relative h-[44px] cursor-pointer touch-none rounded-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-hi"
    >
      {jev.map((s) => (
        <span
          key={s.id}
          aria-hidden="true"
          className="absolute top-0 h-[8px] w-[2px] rounded-[1px] transition-opacity"
          style={{ left: pct(s.start), background: 'oklch(0.78 0.11 160)', opacity: t >= s.start && t > 0 ? 1 : 0.25 }}
        />
      ))}
      {top.map((s) => (
        <span key={s.id} aria-hidden="true" className="absolute top-[13px] h-[10px] overflow-hidden rounded-[3px]" style={{ left: pct(s.start), width: `calc(${pct(s.end - s.start)} - 2px)`, minWidth: 3, background: 'oklch(0.94 0.02 78 / 0.1)' }}>
          <span className="block h-full" style={{ width: `${Math.max(0, Math.min(1, (t - s.start) / (s.end - s.start))) * 100}%`, background: colour(s) }} />
        </span>
      ))}
      {Array.from({ length: axis.max / axis.step + 1 }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`absolute top-[28px] font-mono text-[10px] text-[var(--stage-faint)] ${i === 0 ? '' : i === axis.max / axis.step ? '-translate-x-full' : '-translate-x-1/2'}`}
          style={{ left: pct(i * axis.step) }}
        >
          {(i * axis.step) / 1000}s
        </span>
      ))}
      {t > 0 && (
        <span aria-hidden="true" className="pointer-events-none absolute -top-0.5 bottom-[18px] w-[2px] bg-amber-hi shadow-[0_0_10px_var(--amber)]" style={{ left: pct(Math.min(t, total)) }}>
          <span className="absolute -left-[4px] -top-1 h-[10px] w-[10px] rounded-full bg-amber-hi" />
        </span>
      )}
    </div>
  )
}

/** The drawer at the end of the line: the copilot's own face, on paper, with the reply streaming in. */
function Drawer({
  rec,
  t,
  reduced,
  stops,
  onPlay,
}: {
  rec: Recording
  t: number
  reduced: boolean
  stops: ReturnType<typeof groupStops>
  /** Starts the replay from the drawer's empty state. */
  onPlay?: () => void
}) {
  const total = rec.totalMs
  const done = t >= total
  const lastRound = [...rec.spans].filter((s) => s.kind === 'llm').sort((a, b) => b.start - a.start)[0]
  const fraction = reduced || !lastRound
    ? done ? 1 : 0
    : Math.max(0, Math.min(1, (t - lastRound.start) / Math.max(1, total - lastRound.start)))
  const shown = rec.answer.slice(0, Math.floor(rec.answer.length * fraction))
  const shownStops = rec.spans.some((s) => s.name === 'show_on_page' && t >= s.end && t > 0)
  return (
    <aside aria-label="The drawer" className="flex min-h-[300px] flex-col overflow-hidden rounded-[20px] bg-paper text-ink shadow-[0_0_0_1px_oklch(0.94_0.02_78/0.15),0_30px_60px_-30px_oklch(0.62_0.155_55/0.6)] min-[1100px]:min-h-[480px]">
      <div className="flex items-baseline justify-between border-b border-rule px-[18px] py-3.5">
        <span className="font-serif text-[19px] font-medium">
          Ask <em className="italic text-amber">Titus</em>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">the drawer</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-[18px] pb-[18px] pt-4">
        {t <= 0 ? (
          <div className="m-auto flex max-w-[30ch] flex-col items-center gap-3 py-6 text-center">
            {onPlay && (
              <button
                type="button"
                onClick={onPlay}
                className="rounded-full bg-amber px-6 py-3 font-mono text-[14.5px] font-medium text-white shadow-[0_10px_24px_-12px_var(--amber)] transition-colors hover:bg-[oklch(0.56_0.155_55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
              >
                ▶ Watch a real reply
              </button>
            )}
            <p className="font-serif text-[15.5px] italic leading-snug text-ink-soft">
              {secs(rec.totalMs)} of real work, {speedLabel()}. The reply lands here, the way it did in the real drawer.
            </p>
            <p className="font-mono text-[11px] leading-relaxed text-ink-faint">Any box in the diagram opens what went in and what came out, before or after you watch.</p>
          </div>
        ) : (
          <>
            <p className="max-w-[90%] self-end rounded-[16px_16px_4px_16px] bg-ink px-3.5 py-2 font-serif text-[15px] leading-snug text-paper">{rec.question}</p>
            {shownStops && stops.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-ink-soft">
                <span>showing you on the page:</span>
                {stops.map((s) => (
                  <a key={s.ids.join(' ')} href={`${s.path}#${s.scrollId}`} className="rounded-full border border-rule bg-paper-deep px-2 py-[3px] text-ink transition-colors hover:border-amber">
                    {s.label}
                  </a>
                ))}
              </div>
            )}
            {shown ? (
              <div className="font-serif text-[15.5px] leading-[1.58] text-ink">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  urlTransform={citationUrlTransform}
                  components={{
                    p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="mb-2.5 list-disc space-y-1 pl-5">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-2.5 list-decimal space-y-1 pl-5">{children}</ol>,
                    a: ({ href, children }) => {
                      const source = sourceForHref(href, rec.sources)
                      if (!source) return <>{children}</>
                      return (
                        <sup className="ml-[2px] font-mono text-[10px] leading-none [sup+&]:ml-0 [sup+&]:before:text-ink-faint [sup+&]:before:content-[',']">
                          <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.title} className="text-amber no-underline hover:underline">
                            {source.n}
                          </a>
                        </sup>
                      )
                    },
                  }}
                >
                  {linkCitations(shown)}
                </ReactMarkdown>
                {!done && <span aria-hidden="true" className="trace-caret ml-0.5 inline-block h-4 w-2 translate-y-0.5 bg-amber" />}
              </div>
            ) : (
              !done && (
                <span aria-label="Writing" className="stage-dots flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <i key={i} className="h-1.5 w-1.5 rounded-full bg-amber" />
                  ))}
                </span>
              )
            )}
            {done && rec.sources.length > 0 && (
              <ol aria-label="Sources" className="mt-auto border-t border-rule pt-2.5 font-mono text-[11px] leading-[1.6] text-ink-soft">
                {rec.sources.map((s) => (
                  <li key={s.n}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                      <b className="mr-1.5 font-semibold text-amber">{s.n}</b>
                      {s.title}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

/** One box's recorded spans, opened beside the box. */
function Inspector({
  spans,
  boxKey,
  pos,
  rec,
  titleOf,
  t,
  onClose,
}: {
  spans: ReplaySpan[]
  boxKey: DiagramKey
  pos: { x: number; y: number; w: number }
  rec: Recording
  titleOf: (slug: string) => string
  t: number
  onClose: () => void
}) {
  const [i, setI] = useState(0)
  const span = spans[Math.min(i, spans.length - 1)]
  return (
    <div
      role="dialog"
      aria-label={`${BOX_NAME[boxKey] ?? boxKey}: what went in and what came out`}
      data-inspector
      className="trace-screen absolute z-20 max-h-[420px] overflow-y-auto overscroll-contain rounded-[14px] border border-[oklch(0.8_0.12_65/0.5)] px-4 py-3 font-mono text-[11.5px] leading-[1.6] shadow-[0_20px_40px_-10px_#000a]"
      style={{ left: pos.x, top: pos.y, width: pos.w }}
    >
      <div className="mb-2 flex items-center gap-2">
        {spans.length > 1 && (
          <div role="tablist" aria-label="Recorded spans" className="flex flex-wrap gap-1">
            {spans.map((s, n) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={n === i}
                onClick={() => setI(n)}
                className={`rounded-full border px-2 py-[1px] text-[10.5px] ${n === i ? 'border-amber-hi text-amber-hi' : 'border-[var(--scr-line)] text-[var(--scr-dim)] hover:text-[var(--scr-text)]'}`}
              >
                {spanTab(s, n)}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded px-1.5 text-[14px] text-[var(--scr-dim)] hover:text-[var(--scr-text)]">
          ×
        </button>
      </div>
      <Detail span={span} rec={rec} titleOf={titleOf} t={t} />
      {span.kind === 'llm' && <p className="mt-2 text-[10.5px] text-[var(--scr-dim)]">The system prompt isn’t recorded, so it isn’t shown.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function TryIt({
  recordings,
  articleCount,
  titles,
  targets,
}: {
  recordings: Recording[]
  articleCount: number
  /** Article slug → title, for the slugs the recordings mention. */
  titles: Record<string, string>
  targets: StopTarget[]
}) {
  const [which, setWhich] = useState(0)
  const rec = recordings[which]
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [open, setOpen] = useState<{ key: DiagramKey; pos: { x: number; y: number; w: number } } | null>(null)
  const [traceOpen, setTraceOpen] = useState(false)
  const reduced = usePrefersReducedMotion()
  const raf = useRef<number | null>(null)
  const board = useRef<HTMLDivElement>(null)

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    setPlaying(false)
  }, [])
  useEffect(() => stop, [stop])

  const total = rec.totalMs
  // Where the answer starts streaming: the last GPT round.
  const answerFrom = useMemo(() => Math.max(0, ...rec.spans.filter((s) => s.kind === 'llm').map((s) => s.start)), [rec])
  const milestones = useMemo(
    () => Array.from(new Set([...rec.spans.filter((s) => s.parent !== null).flatMap((s) => [s.start + 1, s.end]), total])).sort((a, b) => a - b),
    [rec, total]
  )

  /** Plays from `from` (ms of the recording) to the end. */
  const run = useCallback(
    (from: number) => {
      stop()
      if (reduced) {
        setT(milestones.find((m) => m > from) ?? total)
        return
      }
      setPlaying(true)
      const t0 = performance.now() - recordedToWall(from, answerFrom)
      const tick = (now: number) => {
        const next = wallToRecorded(now - t0, answerFrom)
        setT(Math.min(next, total))
        if (next < total) raf.current = requestAnimationFrame(tick)
        else {
          raf.current = null
          setPlaying(false)
        }
      }
      raf.current = requestAnimationFrame(tick)
    },
    [stop, reduced, milestones, total, answerFrom]
  )

  const onPlayButton = () => {
    if (playing) return stop()
    setOpen(null)
    run(t > 0 && t < total ? t : 0)
  }

  const seek = (ms: number) => {
    stop()
    setT(ms)
  }

  const choose = (i: number) => {
    stop()
    setWhich(i)
    setT(0)
    setPicked(null)
    setOpen(null)
  }

  const stepBy = (dir: 1 | -1) => {
    const next = dir === 1 ? milestones.find((m) => m > t) ?? total : [...milestones].reverse().find((m) => m < t) ?? 0
    setT(next)
  }

  // Close the inspector with Escape or a click elsewhere.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null
      if (el?.closest?.('[data-inspector], [data-pick]')) return
      setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const byKey = useMemo(() => spansByKey(rec), [rec])
  const pickable = useMemo(() => {
    const p: Partial<Record<DiagramKey, string>> = {}
    for (const [k, list] of Object.entries(byKey) as [DiagramKey, ReplaySpan[]][])
      p[k] = `${BOX_NAME[k] ?? k}: open ${plural(list.length, 'recorded span')}`
    return p
  }, [byKey])

  const onPick = (k: DiagramKey, el: Element) => {
    if (open?.key === k) return setOpen(null)
    const b = board.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (!b) return
    const w = Math.min(360, b.width)
    let x = r.right - b.left + 10
    let y = r.top - b.top
    if (x + w > b.width) x = r.left - b.left - w - 10
    if (x < 0) {
      x = Math.max(0, Math.min(b.width - w, r.left - b.left))
      y = r.bottom - b.top + 8
    }
    setOpen({ key: k, pos: { x, y: Math.max(0, y), w } })
  }

  const depth = useMemo(() => new Map(rec.spans.map((s) => [s.id, depthOf(s, rec.spans)])), [rec])
  const axis = axisFor(total)
  const zoom = zoomWindow(rec.spans)
  // Retrieval spans, plus any other tool call that happened inside the window (show_on_page alongside them).
  const zoomSpans = zoom
    ? rec.spans.filter((s) => isRetrieval(s) || (s.kind === 'tool' && s.start >= zoom.from && s.end <= zoom.to))
    : []
  const state = useMemo(() => {
    const h = rec.spans.find((s) => s.id === (hovered ?? picked))
    // Before play the diagram stands as a full-strength still, to be explored.
    if (t <= 0 && !h) return null
    const base = diagramState(rec.spans, t, total)
    if (h) for (const k of keysFor(h)) base[k] = 'lit'
    return base
  }, [rec, t, total, hovered, picked])
  const measured = useMemo(() => measuredAt(rec, t), [rec, t])
  const topics = useMemo(
    () => rec.spans.filter((s) => s.name === 'search_writing').flatMap((s) => (Array.isArray(s.inputs.topics) ? (s.inputs.topics as string[]) : [])),
    [rec]
  )

  const running = t > 0 && t < total ? runningSpan(rec.spans, t) : null
  const detailSpan = rec.spans.find((s) => s.id === (picked ?? hovered)) ?? running ?? (t >= total ? rec.spans[0] : null)
  const seen = rec.spans.filter((s) => t > 0 && t >= s.start).length
  const calls = rec.spans.filter((s) => (s.kind === 'llm' || s.kind === 'jev') && t > 0 && t >= s.start).length
  const steps = useMemo(() => storySteps(rec, articleCount), [rec, articleCount])
  const step = t > 0 ? [...steps].reverse().find((s) => t >= s.at) : null
  const done = t >= total
  const byId = useMemo(() => new Map(targets.map((x) => [x.id, x])), [targets])
  const stops = groupStops(rec.actions, byId)
  const titleOf = (slug: string) => titles[slug] ?? slug
  const recorded = new Date(rec.recordedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
  const pad = 'px-[clamp(16px,2.2vw,28px)]'

  return (
    <section aria-label="Try it: a recorded reply, replayed" className="colophon-stage not-prose overflow-hidden rounded-[28px]">
      {/* Controls */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2.5 pt-[clamp(16px,2vw,22px)] ${pad}`}>
        <button
          type="button"
          onClick={onPlayButton}
          className="whitespace-nowrap rounded-full bg-amber px-[18px] py-2.5 font-mono text-[13px] font-medium text-white transition-colors hover:bg-[oklch(0.68_0.155_55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-hi"
        >
          {playing ? '❚❚ Pause' : done ? '↻ Replay' : t > 0 ? '▶ Resume' : '▶ Play'}
        </button>
        {reduced && t > 0 && (
          <span className="flex gap-2">
            <button type="button" onClick={() => stepBy(-1)} className="rounded-full border border-[var(--stage-line)] px-3 py-2 font-mono text-[12px] text-[var(--stage-text)]">
              ◂ Back
            </button>
            <button type="button" onClick={() => stepBy(1)} disabled={done} className="rounded-full border border-[var(--stage-line)] px-3 py-2 font-mono text-[12px] text-[var(--stage-text)] disabled:opacity-50">
              Next step ▸
            </button>
          </span>
        )}
        {recordings.map((r, i) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={i === which}
            onClick={() => i !== which && choose(i)}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-left font-mono text-[12.5px] leading-snug transition-colors ${
              i === which
                ? 'border-amber-hi bg-[oklch(0.62_0.155_55/0.18)] text-[var(--stage-text)]'
                : 'border-[oklch(0.94_0.02_78/0.32)] text-[oklch(0.94_0.02_78/0.88)] hover:border-[oklch(0.94_0.02_78/0.65)] hover:bg-[oklch(0.94_0.02_78/0.05)] hover:text-[var(--stage-text)]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 flex-none rounded-full ${i === which ? 'bg-amber-hi shadow-[0_0_8px_var(--amber)]' : 'border border-[oklch(0.94_0.02_78/0.5)]'}`}
            />
            {r.question}
          </button>
        ))}
        <span className="font-mono text-[11px] tracking-[0.03em] text-[var(--stage-faint)] min-[1100px]:ml-auto">
          recorded {recorded} · real GPT and Jev calls · {speedLabel()}
        </span>
      </div>

      {/* What's happening, in words */}
      <p aria-live="polite" className={`mt-3 min-h-[1.5em] font-serif text-[16px] italic leading-snug text-[var(--stage-dim)] ${pad}`}>
        {step?.text ?? 'Explore the diagram (any box opens what it did in this reply), or watch the reply move through it.'}
      </p>

      {/* The diagram and the drawer it ends in */}
      <div className={`relative mt-2 grid gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px] ${pad}`}>
        <div ref={board} className="relative min-w-0">
          <ReplyDiagram
            articleCount={articleCount}
            state={state}
            topics={topics}
            tone="stage"
            measured={measured}
            pickable={pickable}
            selected={open?.key ?? null}
            onPick={onPick}
          />
          {open && byKey[open.key] && (
            <Inspector
              key={`${rec.id}-${open.key}`}
              spans={byKey[open.key]!}
              boxKey={open.key}
              pos={open.pos}
              rec={rec}
              titleOf={titleOf}
              t={t}
              onClose={() => setOpen(null)}
            />
          )}
        </div>
        <Drawer rec={rec} t={t} reduced={reduced} stops={stops} onPlay={playing ? undefined : onPlayButton} />

      </div>

      {/* The timeline */}
      <div className={`mt-5 grid items-center gap-x-7 gap-y-3 border-t border-[var(--stage-line)] pb-5 pt-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] ${pad}`}>
        <Timeline rec={rec} t={t} onSeek={seek} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] tracking-[0.03em] text-[var(--stage-dim)]">
          <span>
            <b className={`block text-[17px] font-medium tracking-normal ${t > 0 && !done ? 'text-amber-hi' : 'text-[var(--stage-text)]'}`}>{secs(Math.min(t, total))}</b>
            of {secs(total)}
          </span>
          <span>
            <b className="block text-[17px] font-medium tracking-normal text-[var(--stage-text)]">
              {seen} / {rec.spans.length}
            </b>
            spans
          </span>
          <span>
            <b className="block text-[17px] font-medium tracking-normal text-[var(--stage-text)]">{calls}</b>
            model calls
          </span>
          <button
            type="button"
            aria-expanded={traceOpen}
            aria-controls="colophon-trace"
            onClick={() => setTraceOpen((o) => !o)}
            className="tap border-b border-[oklch(0.8_0.12_65/0.4)] text-[11.5px] text-amber-hi hover:border-amber-hi"
          >
            {traceOpen ? 'hide the trace ▴' : 'view as a trace ▾'}
          </button>
        </div>
      </div>

      {/* The full trace, for anyone who reads waterfalls for a living */}
      {traceOpen && (
        <div id="colophon-trace" className={`pb-5 ${pad}`}>
          <div className="trace-screen overflow-hidden rounded-[18px] border border-[var(--stage-line)]">
            <div className="relative px-4 pb-1.5 pt-3">
              <div className="grid grid-cols-[var(--nm)_1fr] font-mono text-[10px] text-[var(--scr-dim)]">
                <span />
                <span className="flex justify-between">
                  {Array.from({ length: axis.max / axis.step + 1 }, (_, i) => (
                    <span key={i}>{(i * axis.step) / 1000}s</span>
                  ))}
                </span>
              </div>
              <div className="relative mt-1">
                <span
                  aria-hidden="true"
                  className="trace-grid pointer-events-none absolute inset-y-0 right-0"
                  style={{ left: 'var(--nm)', ['--tick' as string]: `${100 / (axis.max / axis.step)}%` }}
                />
                <ul aria-label="Spans in this reply">
                  {rec.spans.filter((s) => !(zoom && s.kind === 'jev')).map((s) => (
                    <SpanRow
                      key={s.id}
                      span={s}
                      depth={depth.get(s.id) ?? 0}
                      folded={zoom ? rec.spans.filter((c) => c.parent === s.id && c.kind === 'jev').length : 0}
                      t={t}
                      total={total}
                      from={0}
                      to={axis.max}
                      selected={picked === s.id}
                      onPick={(id) => setPicked((p) => (p === id ? null : id))}
                      onHover={setHovered}
                    />
                  ))}
                </ul>
                <Playhead t={t} from={0} to={axis.max} />
              </div>
            </div>
            {zoom && (
              <div className="mx-4 mt-1.5 rounded-xl bg-[var(--scr-2)] px-3 pb-2 pt-2.5">
                <p className="mb-1.5 flex justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--c-jev)]">
                  Zoom · retrieval
                  <span className="font-normal normal-case tracking-[0.04em] text-[var(--scr-dim)]">
                    {secs(zoom.from)} → {secs(zoom.to)} · ×{Math.round(axis.max / (zoom.to - zoom.from))}
                  </span>
                </p>
                <div className="relative">
                  <ul aria-label="Retrieval spans, magnified">
                    {zoomSpans.map((s) => (
                      <SpanRow
                        key={s.id}
                        span={s}
                        depth={Math.max(0, (depth.get(s.id) ?? 1) - 1)}
                        t={t}
                        total={total}
                        from={zoom.from}
                        to={zoom.to}
                        compact
                        selected={picked === s.id}
                        onPick={(id) => setPicked((p) => (p === id ? null : id))}
                        onHover={setHovered}
                      />
                    ))}
                  </ul>
                  <Playhead t={t} from={zoom.from} to={zoom.to} />
                </div>
              </div>
            )}
            <div aria-live="polite" tabIndex={0} aria-label="Span detail" className="mx-4 mb-3 mt-2.5 h-[236px] overflow-y-auto overscroll-contain rounded-xl border border-[var(--scr-line)] px-3.5 py-3 font-mono text-[11.5px] leading-[1.6]">
              <Detail span={detailSpan} rec={rec} titleOf={titleOf} t={t} />
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 px-4 pb-3.5 font-mono text-[10px] text-[var(--scr-dim)]">
              {(['llm', 'tool', 'jev'] as SpanKind[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-[2px]" style={{ background: KIND_COLOUR[k] }} />
                  {k === 'llm' ? 'LLM' : k === 'tool' ? 'tool' : 'Jev (decision model)'}
                </span>
              ))}
              <span className="ml-auto">pick a span to read it</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
