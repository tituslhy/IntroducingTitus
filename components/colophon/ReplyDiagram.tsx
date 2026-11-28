'use client'

/**
 * "Anatomy of a reply": the path one question takes, drawn in hairlines with
 * theme tokens only. GPT's prompt carries my record and the library map; two
 * routes to my articles leave the tools box: a per-topic search (concrete and
 * multi-part questions) and read_writing from the library map (broad ones);
 * both end at Jev's section pick. After the drawer, a dashed voice step: a
 * spoken question's reply is also read aloud on the visitor's device (a typed
 * one ends at the drawer). A row on desktop, a column on mobile: two
 * SVGs, one hidden per breakpoint (display:none also drops it from the a11y tree).
 * Thresholds and page size come from lib/search-config.ts, so they can't drift.
 *
 * The colophon's Try it stage lights the diagram as a recorded reply replays:
 * every box and arrow carries a key (see DiagramKey), and `state` says which
 * are running ("lit"), finished ("done") or untouched ("idle"). Without
 * `state`, the diagram draws as a still figure. On the stage (`tone="stage"`)
 * it draws light on dark, a finished box swaps its explanation for what it
 * measured (`measured`), and boxes with recorded spans open them (`onPick`).
 */
import { createContext, useContext, type KeyboardEvent, type MouseEvent } from 'react'
import { MAX_ARTICLES_PER_REPLY, MAX_READING_CALLS, MAX_TOPICS, MIN_SCORE, PAGE_SIZE, RELEVANT, SECTION_BUDGET_CHARS, STAGE2_MAX } from '@/lib/search-config'

const MONO = 'var(--font-ibm-plex-mono), ui-monospace, monospace'

export type DiagramKey =
  | 'record' | 'visitor' | 'guards' | 'gpt' | 'calls' | 'results' | 'tools' | 'show' | 'card' | 'search'
  | 'filter' | 'rank' | 'merge' | 'read' | 'sections' | 'answer' | 'checks' | 'drawer' | 'voice'
export type BoxState = 'lit' | 'done' | 'idle'
type StateOf = (k: DiagramKey) => BoxState | undefined

const StateCtx = createContext<StateOf>(() => undefined)
const TopicsCtx = createContext<readonly string[]>([])

type Pick = {
  measured: Partial<Record<DiagramKey, string>>
  /** Keys that have spans to open, with a label for screen readers. */
  pickable: Partial<Record<DiagramKey, string>>
  selected: DiagramKey | null
  onPick?: (k: DiagramKey, el: Element) => void
}
const PickCtx = createContext<Pick>({ measured: {}, pickable: {}, selected: null })

/** Click and keyboard props for a box or row with spans behind it. */
function usePickable(k: DiagramKey | undefined) {
  const { pickable, selected, onPick } = useContext(PickCtx)
  const label = k ? pickable[k] : undefined
  if (!k || !label || !onPick) return {}
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-pressed': selected === k,
    'data-pick': k,
    onClick: (e: MouseEvent<SVGGElement | SVGTextElement>) => onPick(k, e.currentTarget),
    onKeyDown: (e: KeyboardEvent<SVGGElement | SVGTextElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onPick(k, e.currentTarget)
      }
    },
  }
}

const FADE = 'transition-[fill,stroke,opacity] duration-300 motion-reduce:transition-none'

function boxPaint(st: BoxState | undefined, accent: boolean) {
  if (st === 'lit') return { fill: 'var(--amber-hi)', stroke: 'var(--amber)', strokeWidth: 2, opacity: 1 }
  if (st === 'done') return { fill: 'var(--amber-soft)', stroke: 'var(--amber)', strokeWidth: 1.2, opacity: 1 }
  return {
    fill: accent ? 'var(--amber-soft)' : 'var(--paper)',
    stroke: accent ? 'var(--amber)' : 'var(--ink)',
    strokeWidth: 1,
    opacity: st === 'idle' ? 0.45 : 1,
  }
}

type BoxProps = {
  x: number
  y: number
  w: number
  h?: number
  title: string
  sub?: string
  accent?: boolean
  /** A dashed outline: something fed in (the prompt), or a step only some replies take (the voice). */
  dashed?: boolean
  k?: DiagramKey
}

function Box({ x, y, w, h = 46, title, sub, accent = false, dashed = false, k }: BoxProps) {
  const st = useContext(StateCtx)(k as DiagramKey)
  const { measured } = useContext(PickCtx)
  const pick = usePickable(k)
  const paint = boxPaint(k ? st : undefined, accent)
  const ran = st === 'lit' || st === 'done'
  // What it measured replaces the explanation once the box has run.
  const shownSub = (k && ran && measured[k]) || sub
  const ink = st === 'lit' ? 'var(--dg-lit-ink, var(--ink))' : 'var(--ink)'
  return (
    <g data-k={k} data-state={k ? st : undefined} opacity={paint.opacity} className={FADE} {...pick}>
      <rect x={x} y={y} width={w} height={h} fill={paint.fill} stroke={paint.stroke} strokeWidth={paint.strokeWidth} strokeDasharray={dashed ? '4 3' : undefined} className={FADE} />
      <text
        x={x + w / 2}
        y={shownSub ? y + h / 2 - 4 : y + h / 2 + 4}
        textAnchor="middle"
        fontFamily={MONO}
        fontSize={12.5}
        fontWeight={500}
        fill={ink}
      >
        {title}
      </text>
      {shownSub && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 13}
          textAnchor="middle"
          fontFamily={MONO}
          fontSize={10.5}
          fontWeight={shownSub !== sub ? 500 : 400}
          fill={shownSub !== sub ? (st === 'lit' ? ink : 'var(--dg-measure, var(--amber))') : st === 'lit' ? ink : 'var(--ink-soft)'}
          data-measured={shownSub !== sub ? '' : undefined}
        >
          {shownSub}
        </text>
      )}
    </g>
  )
}

/** A topic box: shows the recorded topic during a replay, "topic n" otherwise. */
function TopicBox({ i, ...rest }: Omit<BoxProps, 'title' | 'k'> & { i: number }) {
  const topics = useContext(TopicsCtx)
  const st = useContext(StateCtx)('search')
  const used = topics.length === 0 || i < topics.length
  return (
    <g opacity={st && !used ? 0.45 : 1}>
      <Box {...rest} title={topics[i] ?? `topic ${i + 1}`} k={used ? 'search' : undefined} />
    </g>
  )
}

function Label({ x, y, children, anchor = 'start' }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={10.5} letterSpacing="0.08em" fill="var(--ink-faint)" className="dg-note">
      {children}
    </text>
  )
}

function ArrowHead({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0,0 L8,4 L0,8" fill="none" stroke="var(--ink-soft)" strokeWidth="1.2" />
      </marker>
    </defs>
  )
}

/** An arrow; turns amber once its key has run. */
function Arrow({ d, k, marker, dashed = false }: { d: string; k?: DiagramKey; marker: string; dashed?: boolean }) {
  const st = useContext(StateCtx)(k as DiagramKey)
  const ran = k && (st === 'lit' || st === 'done')
  return (
    <path
      d={d}
      fill="none"
      stroke={ran ? 'var(--dg-measure, var(--amber))' : 'var(--ink-soft)'}
      strokeWidth={ran ? 1.6 : 1}
      opacity={k && st === 'idle' ? 0.4 : 1}
      markerEnd={`url(#${marker})`}
      strokeDasharray={dashed ? '4 3' : undefined}
      data-k={k}
      className={FADE}
    />
  )
}

function Small({ x, y, children, anchor = 'start' }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={10.5} fill="var(--ink-soft)" className="dg-note">
      {children}
    </text>
  )
}

/** The agent loop: a hairline amber frame around GPT ⇄ tools. */
function LoopFrame({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--amber-soft)" fillOpacity={0.45} stroke="var(--amber)" strokeWidth={1} className="reply-loop" />
      <text x={x + 10} y={y + 17} fontFamily={MONO} fontSize={10.5} fontWeight={600} letterSpacing="0.1em" fill="var(--amber)">
        AGENT LOOP
      </text>
      <text x={x + w - 10} y={y + 17} textAnchor="end" fontFamily={MONO} fontSize={10.5} letterSpacing="0.06em" fill="var(--ink-soft)">
        ≤4 rounds
      </text>
    </g>
  )
}

const TOOLS_H = 82

/** GPT box: decides each round whether to call tools or answer. */
function GptBox({ x, y, w }: { x: number; y: number; w: number }) {
  return <Box x={x} y={y} w={w} title="GPT" sub="answer, or call tools?" k="gpt" />
}

/** A tool's row in the tools box: amber while that tool runs. */
function ToolRow({ x, y, size, k, children }: { x: number; y: number; size: number; k: DiagramKey; children: string }) {
  const st = useContext(StateCtx)(k)
  const pick = usePickable(k)
  return (
    <text
      x={x}
      y={y}
      fontFamily={MONO}
      fontSize={size}
      fontWeight={st === 'lit' ? 600 : 400}
      fill={st === 'lit' || st === 'done' ? 'var(--dg-measure, var(--amber))' : 'var(--ink)'}
      data-k={k}
      data-state={st}
      {...pick}
    >
      {children}
    </text>
  )
}

/** Tools box listing the four tools; search_writing's row lines up with its expanded chain. */
function ToolsBox({ x, y, w }: { x: number; y: number; w: number }) {
  const st = useContext(StateCtx)('tools')
  const paint = boxPaint(st, false)
  return (
    <g data-k="tools" data-state={st} opacity={paint.opacity} className={FADE}>
      <rect x={x} y={y} width={w} height={TOOLS_H} fill={paint.fill} stroke={paint.stroke} strokeWidth={paint.strokeWidth} className={FADE} />
      <Label x={x + 10} y={y + 16}>TOOLS</Label>
      <ToolRow x={x + 10} y={y + 32} size={11} k="show">show_on_page</ToolRow>
      {/* 22 mono chars at 10.5px ≈ 139px: fits the 150px mobile box */}
      <ToolRow x={x + 10} y={y + 47} size={10.5} k="search">search_writing(topics)</ToolRow>
      <ToolRow x={x + 10} y={y + 62} size={10.5} k="read">read_writing(ids)</ToolRow>
      <ToolRow x={x + 10} y={y + 77} size={10.5} k="card">show_card</ToolRow>
    </g>
  )
}

/** Box for what GPT's prompt carries: my record and the library map. */
function RecordBox({ x, y, w, title = 'my record + library map' }: { x: number; y: number; w: number; title?: string }) {
  return <Box x={x} y={y} w={w} h={40} title={title} sub="in the prompt" dashed k="record" />
}

/** Where a reply starts (a filled dot) and ends (a ringed dot), as in a state diagram, with its word beside it. */
function Terminal({ cx, cy, kind, tx, ty, anchor = 'middle' }: { cx: number; cy: number; kind: 'start' | 'end'; tx: number; ty: number; anchor?: 'start' | 'middle' | 'end' }) {
  const c = 'var(--dg-measure, var(--amber))'
  return (
    <g aria-hidden="true" data-terminal={kind}>
      {kind === 'start' ? (
        <circle cx={cx} cy={cy} r={6} fill={c} />
      ) : (
        <>
          <circle cx={cx} cy={cy} r={7.5} fill="none" stroke={c} strokeWidth={1.4} />
          <circle cx={cx} cy={cy} r={4} fill={c} />
        </>
      )}
      <text x={tx} y={ty} textAnchor={anchor} fontFamily={MONO} fontSize={10.5} fontWeight={500} letterSpacing="0.06em" fill={c}>
        {kind}
      </text>
    </g>
  )
}

export default function ReplyDiagram({
  articleCount,
  state,
  topics = [],
  tone = 'paper',
  measured = {},
  pickable = {},
  selected = null,
  onPick,
}: {
  articleCount: number
  /** Replay state per key; omit for a still figure. */
  state?: Partial<Record<DiagramKey, BoxState>> | null
  /** The recorded search topics, shown in the topic boxes during a replay. */
  topics?: readonly string[]
  /** `stage`: light on dark, for the Try it stage (colours come from .reply-stage in globals.css). */
  tone?: 'paper' | 'stage'
  /** What each box measured in the recording, shown in place of its explanation once it has run. */
  measured?: Partial<Record<DiagramKey, string>>
  /** Boxes that open their recorded spans, each with its accessible label. */
  pickable?: Partial<Record<DiagramKey, string>>
  /** The box whose spans are open. */
  selected?: DiagramKey | null
  onPick?: (k: DiagramKey, el: Element) => void
}) {
  const filterSub = `noul × ${articleCount}`
  const filterPass = `p(yes) ≥ ${RELEVANT}`
  const rankPass = `≥ ${MIN_SCORE.toFixed(1)} of 3`
  const rankSub = `score × top ${STAGE2_MAX}`
  const sectionsSub = 'score × each section'
  const keeps = `keeps the best sections, ≤ ${SECTION_BUDGET_CHARS.toLocaleString('en-GB')} chars an article`
  const cap = `≤${MAX_ARTICLES_PER_REPLY} articles a reply`
  const description =
    `A visitor's question passes the guards and enters the agent loop. GPT's prompt carries my record (roles, projects, and every tool with when and where I used it) and the library map. ` +
    `Each round, GPT either answers or calls tools; ` +
    `the tool results go back to GPT for the next round, for at most four rounds. The tools are show_on_page, search_writing, read_writing and show_card (a card under the answer, built by the server from my data as A2UI v1.0). ` +
    `Articles are reached by one of two routes, one route per call: search_writing or read_writing, and a reply can use both. ` +
    `search_writing takes up to ${MAX_TOPICS} topics in one call and searches each topic separately: for each, ` +
    `a Jev filter (noul: one yes/no question per article, ${articleCount} articles, kept at p(yes) ≥ ${RELEVANT}), ` +
    `then a Jev rank (score: a graded 0–3 score for up to ${STAGE2_MAX} survivors, kept at ≥ ${MIN_SCORE.toFixed(1)}). ` +
    `It merges the topics' rankings round-robin, so each topic's best article comes first, and hands over ${PAGE_SIZE} at a time; ` +
    `calling it again with more: true returns the next ${PAGE_SIZE} without calling Jev. ` +
    `read_writing involves no search: for broad questions, GPT splits the question into parts, picks articles for each part from the library map of themes in its prompt, and opens them by id, one call per part, up to 3 articles a call. ` +
    `Both routes end at Jev sections (score again, on each section's heading and one-line note), which keeps each article's best sections, up to ${SECTION_BUDGET_CHARS.toLocaleString('en-GB')} characters an article, ` +
    `and that article text goes back to GPT. Each tool can be called at most ${MAX_READING_CALLS} times per reply, and a reply reads at most ${MAX_ARTICLES_PER_REPLY} articles. ` +
    `GPT's answer then passes output checks and streams to the drawer. ` +
    `If the question was spoken, the reply is also read aloud by a voice made on the visitor's device (Kokoro, in the browser on WebGPU); a typed question ends at the drawer.`

  const stateOf: StateOf = (k) => (state ? (state[k] ?? 'idle') : undefined)

  return (
    <StateCtx.Provider value={stateOf}>
      <TopicsCtx.Provider value={state ? topics : []}>
      <PickCtx.Provider value={{ measured, pickable, selected, onPick }}>
        <figure className={tone === 'stage' ? 'reply-stage m-0' : 'my-[clamp(20px,3vw,32px)] min-[1120px]:-mx-[100px]'}>
          {/* Desktop */}
          <svg viewBox="-46 0 816 568" role="img" aria-label={description} className="hidden h-auto w-full min-[760px]:block">
            <ArrowHead id="reply-arrow-h" />
            <RecordBox x={226} y={0} w={200} />
            <Arrow d="M326,40 V92" k="record" marker="reply-arrow-h" dashed />
            <g transform="translate(0,56)">
              <Terminal kind="start" cx={-22} cy={61} tx={-22} ty={86} />
              <Arrow d="M-15,61 H-2" k="visitor" marker="reply-arrow-h" />
              <Box x={0} y={38} w={84} title="visitor" k="visitor" />
              <Arrow d="M84,61 H106" k="guards" marker="reply-arrow-h" />
              <Box x={108} y={38} w={84} title="guards" k="guards" />
              <Arrow d="M192,61 H244" k="guards" marker="reply-arrow-h" />

              <LoopFrame x={216} y={6} w={220} h={238} />
              <GptBox x={246} y={38} w={160} />
              {/* The cycle: calls down, results back up */}
              <Arrow d="M290,84 V154" k="calls" marker="reply-arrow-h" />
              <Small x={282} y={123} anchor="end">calls</Small>
              <Arrow d="M362,154 V86" k="results" marker="reply-arrow-h" />
              <Small x={370} y={123}>results</Small>
              <ToolsBox x={246} y={156} w={160} />

              {/* Answer leaves the loop */}
              <Arrow d="M406,61 H486" k="answer" marker="reply-arrow-h" />
              <Small x={446} y={53} anchor="middle">answer</Small>
              <Box x={488} y={38} w={84} title="checks" k="checks" />
              <Arrow d="M572,61 H594" k="drawer" marker="reply-arrow-h" />
              <Box x={596} y={38} w={84} title="drawer" k="drawer" />
              {/* Spoken questions only: the reply is also read aloud, on the visitor's device */}
              <Arrow d="M638,84 V104" k="voice" marker="reply-arrow-h" dashed />
              <Box x={548} y={106} w={180} title="voice, on your device" sub="spoken questions only" dashed k="voice" />
              <Arrow d="M728,129 H738" k="voice" marker="reply-arrow-h" />
              <Terminal kind="end" cx={748} cy={129} tx={748} ty={154} />

              {/* Route 1: search_writing splits the question into topics, each searched by Jev, merged round-robin */}
              <Arrow d="M270,238 V262 H50 V278" k="search" marker="reply-arrow-h" />
              <Small x={160} y={257} anchor="middle">search_writing(topics)</Small>
              <TopicBox i={0} x={10} y={280} w={80} h={22} />
              <TopicBox i={1} x={10} y={306} w={80} h={22} />
              <TopicBox i={2} x={10} y={332} w={80} h={22} />
              <Small x={258} y={290} anchor="middle">one call: each topic searched separately</Small>
              <Arrow d="M90,319 H102" k="filter" marker="reply-arrow-h" />
              <Box x={104} y={296} w={90} title="Jev filter" sub={filterSub} k="filter" />
              <Small x={149} y={356} anchor="middle">{filterPass}</Small>
              <Arrow d="M194,319 H204" k="rank" marker="reply-arrow-h" />
              <Box x={206} y={296} w={90} title="Jev rank" sub={rankSub} k="rank" />
              <Small x={251} y={356} anchor="middle">{rankPass}</Small>
              <Arrow d="M296,319 H306" k="merge" marker="reply-arrow-h" />
              <Box x={308} y={296} w={104} title="merge" sub="round-robin" accent k="merge" />
              <Small x={418} y={312}>{`${PAGE_SIZE} at a time`}</Small>
              <Small x={418} y={326}>{`more: next ${PAGE_SIZE}`}</Small>
              <Small x={418} y={340}>no Jev call</Small>
              <Arrow d="M360,342 V402" k="merge" marker="reply-arrow-h" />

              {/* Route 2: read_writing opens articles GPT picked from the library map in its prompt */}
              <Arrow d="M382,238 V262 H605 V286" k="read" marker="reply-arrow-h" />
              <Small x={494} y={257} anchor="middle">read_writing(ids)</Small>
              <Small x={326} y={257} anchor="middle">or</Small>
              <Box x={520} y={288} w={170} title="read_writing" sub="ids from the library map" k="read" />
              <Small x={612} y={350}>no search</Small>
              <Small x={612} y={364}>≤3 ids, one call a part</Small>
              <Arrow d="M605,334 V380 H392 V402" k="read" marker="reply-arrow-h" />

              {/* Both routes: Jev picks each article's best sections; the text goes back to GPT */}
              <Box x={246} y={404} w={160} title="Jev sections" sub={sectionsSub} k="sections" />
              <Arrow d="M406,427 H744 V200 H408" k="results" marker="reply-arrow-h" />
              <Small x={326} y={468} anchor="middle">{keeps}</Small>
              <Small x={326} y={484} anchor="middle">article text back to GPT</Small>
              <Small x={326} y={500} anchor="middle">{`≤${MAX_READING_CALLS} calls of each tool · ${cap}`}</Small>
            </g>
          </svg>

          {/* Mobile */}
          <svg viewBox="0 -40 340 1072" role="img" aria-label={description} className="mx-auto block h-auto w-full max-w-[400px] min-[760px]:hidden">
            <ArrowHead id="reply-arrow-v" />
            <Terminal kind="start" cx={170} cy={-28} tx={182} ty={-24} anchor="start" />
            <Arrow d="M170,-21 V-2" k="visitor" marker="reply-arrow-v" />
            <Box x={95} y={0} w={150} title="visitor" k="visitor" />
            <Arrow d="M170,46 V62" k="guards" marker="reply-arrow-v" />
            <Box x={95} y={64} w={150} title="guards" k="guards" />
            <Arrow d="M170,110 V214" k="guards" marker="reply-arrow-v" />
            <RecordBox x={4} y={124} w={156} title="record + library map" />
            <Arrow d="M50,164 V239 H93" k="record" marker="reply-arrow-v" dashed />

            <g transform="translate(0,60)">
              <LoopFrame x={0} y={126} w={340} h={224} />
              <GptBox x={95} y={156} w={150} />
              <Arrow d="M140,202 V258" k="calls" marker="reply-arrow-v" />
              <Small x={132} y={234} anchor="end">calls</Small>
              <Arrow d="M200,258 V204" k="results" marker="reply-arrow-v" />
              <Small x={208} y={234}>results</Small>
              <ToolsBox x={95} y={260} w={150} />

              {/* Route 1 (left): topics, each through Jev, merged */}
              <Arrow d="M120,342 V362 H80 V374" k="search" marker="reply-arrow-v" />
              <Box x={6} y={376} w={148} h={40} title={topics.length && state ? topics.slice(0, 3).join(' · ') : 'topic 1 · 2 · 3'} sub={`1 call, ≤${MAX_TOPICS} searches`} k="search" />
              <Arrow d="M80,416 V428" k="filter" marker="reply-arrow-v" />
              <Box x={6} y={430} w={148} title="Jev filter" sub={filterSub} k="filter" />
              <Arrow d="M80,476 V490" k="rank" marker="reply-arrow-v" />
              <Small x={86} y={487}>{filterPass}</Small>
              <Box x={6} y={492} w={148} title="Jev rank" sub={rankSub} k="rank" />
              <Arrow d="M80,538 V552" k="merge" marker="reply-arrow-v" />
              <Small x={86} y={549}>{rankPass}</Small>
              <Box x={6} y={554} w={148} title="merge" sub="round-robin" accent k="merge" />
              <Small x={158} y={581}>{`${PAGE_SIZE} at a time`}</Small>
              <Arrow d="M80,600 V612 H140 V622" k="merge" marker="reply-arrow-v" />

              {/* Route 2 (right): ids from the library map, no search */}
              <Arrow d="M220,342 V362 H236 V374" k="read" marker="reply-arrow-v" />
              <Small x={170} y={366} anchor="middle">or</Small>
              <Box x={166} y={376} w={140} title="read_writing" sub="from the library map" k="read" />
              <Small x={172} y={440}>no search</Small>
              <Small x={172} y={454}>≤3 ids a call</Small>
              <Arrow d="M236,422 V612 H200 V622" k="read" marker="reply-arrow-v" />

              {/* Both routes meet at Jev sections; the text returns to the tools up the left edge */}
              <Box x={90} y={624} w={160} title="Jev sections" sub={sectionsSub} k="sections" />
              <Arrow d="M90,647 H2 V300 H93" k="results" marker="reply-arrow-v" />
              <Small x={170} y={688} anchor="middle">{'keeps the best sections, '}</Small>
              <Small x={170} y={702} anchor="middle">{`≤ ${SECTION_BUDGET_CHARS.toLocaleString('en-GB')} chars an article`}</Small>
              <Small x={170} y={720} anchor="middle">article text back to GPT</Small>
              <Small x={170} y={734} anchor="middle">{`${cap} · ≤${MAX_READING_CALLS} calls a tool`}</Small>

              {/* Answer leaves the loop down the right edge */}
              <Arrow d="M245,179 H318 V771 H247" k="answer" marker="reply-arrow-v" />
              <Small x={282} y={172} anchor="middle">answer</Small>
              <Box x={95} y={748} w={150} title="checks" k="checks" />
              <Arrow d="M170,794 V814" k="drawer" marker="reply-arrow-v" />
              <Box x={95} y={816} w={150} title="drawer" k="drawer" />
              {/* Spoken questions only: the reply is also read aloud, on the visitor's device */}
              <Arrow d="M170,862 V882" k="voice" marker="reply-arrow-v" dashed />
              <Box x={80} y={884} w={180} title="voice, on your device" sub="spoken questions only" dashed k="voice" />
              <Arrow d="M170,930 V946" k="voice" marker="reply-arrow-v" />
              <Terminal kind="end" cx={170} cy={956} tx={184} ty={960} anchor="start" />
            </g>
          </svg>
        </figure>
      </PickCtx.Provider>
      </TopicsCtx.Provider>
    </StateCtx.Provider>
  )
}
