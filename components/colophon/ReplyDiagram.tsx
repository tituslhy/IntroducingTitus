/**
 * "Anatomy of a reply": the path one question takes, drawn in hairlines with
 * theme tokens only. Two routes to my articles leave the tools box: a
 * per-topic search (concrete and multi-part questions) and read_writing from
 * the library map (broad ones); both end at Jev's section pick. A row on desktop, a column on mobile: two SVGs, one
 * hidden per breakpoint (display:none also drops it from the a11y tree).
 * Thresholds and page size come from lib/search-config.ts, so they can't drift.
 */
import { MAX_ARTICLES_PER_REPLY, MAX_TOPICS, MIN_SCORE, PAGE_SIZE, RELEVANT, SECTION_BUDGET_CHARS, STAGE2_MAX } from '@/lib/search-config'

const MONO = 'var(--font-ibm-plex-mono), ui-monospace, monospace'

type BoxProps = {
  x: number
  y: number
  w: number
  h?: number
  title: string
  sub?: string
  accent?: boolean
}

function Box({ x, y, w, h = 46, title, sub, accent = false }: BoxProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={accent ? 'var(--amber-soft)' : 'var(--paper)'}
        stroke={accent ? 'var(--amber)' : 'var(--ink)'}
        strokeWidth={1}
      />
      <text
        x={x + w / 2}
        y={sub ? y + h / 2 - 4 : y + h / 2 + 4}
        textAnchor="middle"
        fontFamily={MONO}
        fontSize={12.5}
        fontWeight={500}
        fill="var(--ink)"
      >
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fontFamily={MONO} fontSize={10.5} fill="var(--ink-soft)">
          {sub}
        </text>
      )}
    </g>
  )
}

function Label({ x, y, children, anchor = 'start' }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={10.5} letterSpacing="0.08em" fill="var(--ink-faint)">
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

const line = { stroke: 'var(--ink-soft)', strokeWidth: 1, fill: 'none' } as const

function Small({ x, y, children, anchor = 'start' }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={10.5} fill="var(--ink-soft)">
      {children}
    </text>
  )
}

/** The agent loop: a hairline amber frame around GPT ⇄ tools. */
function LoopFrame({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--amber-soft)" fillOpacity={0.45} stroke="var(--amber)" strokeWidth={1} />
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
  return <Box x={x} y={y} w={w} title="GPT" sub="answer, or call tools?" />
}

/** Tools box listing the three tools; search_writing's row lines up with its expanded chain. */
function ToolsBox({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={TOOLS_H} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1} />
      <Label x={x + 10} y={y + 16}>TOOLS</Label>
      <text x={x + 10} y={y + 36} fontFamily={MONO} fontSize={12} fill="var(--ink)">show_on_page</text>
      {/* 22 mono chars at 10.5px ≈ 139px: fits the 150px mobile box */}
      <text x={x + 10} y={y + 54} fontFamily={MONO} fontSize={10.5} fill="var(--ink)">search_writing(topics)</text>
      <text x={x + 10} y={y + 72} fontFamily={MONO} fontSize={10.5} fill="var(--ink)">read_writing(ids)</text>
    </g>
  )
}

export default function ReplyDiagram({ articleCount }: { articleCount: number }) {
  const filterSub = `noul × ${articleCount}`
  const filterPass = `p(yes) ≥ ${RELEVANT}`
  const rankPass = `≥ ${MIN_SCORE.toFixed(1)} of 3`
  const rankSub = `score × top ${STAGE2_MAX}`
  const sectionsSub = 'score × each section'
  const keeps = `keeps the best sections, ≤ ${SECTION_BUDGET_CHARS.toLocaleString('en-GB')} chars an article`
  const cap = `≤${MAX_ARTICLES_PER_REPLY} articles a reply`
  const description =
    `A visitor's question passes the guards and enters the agent loop. Each round, GPT either answers or calls tools; ` +
    `the tool results go back to GPT for the next round, for at most four rounds. The tools are show_on_page, search_writing and read_writing. ` +
    `Articles are reached by one of two routes, one route per call: search_writing or read_writing, and a reply can use both. ` +
    `search_writing takes up to ${MAX_TOPICS} topics in one call and searches each topic separately: for each, ` +
    `a Jev filter (noul: one yes/no question per article, ${articleCount} articles, kept at p(yes) ≥ ${RELEVANT}), ` +
    `then a Jev rank (score: a graded 0–3 score for up to ${STAGE2_MAX} survivors, kept at ≥ ${MIN_SCORE.toFixed(1)}). ` +
    `It merges the topics' rankings round-robin, so each topic's best article comes first, and hands over ${PAGE_SIZE} at a time; ` +
    `calling it again with more: true returns the next ${PAGE_SIZE} without calling Jev. ` +
    `read_writing involves no search: for broad questions, GPT reads the library map of themes in its prompt, picks up to 3 articles, and opens them by id. ` +
    `Both routes end at Jev sections (score again, on each section's heading and one-line note), which keeps each article's best sections, up to ${SECTION_BUDGET_CHARS.toLocaleString('en-GB')} characters an article, ` +
    `and that article text goes back to GPT. Each tool can be called at most twice per reply, and a reply reads at most ${MAX_ARTICLES_PER_REPLY} articles. ` +
    `GPT's answer then passes output checks and streams to the drawer.`

  return (
    <figure className="my-[clamp(20px,3vw,32px)] min-[1120px]:-mx-[100px]">
      {/* Desktop */}
      <svg viewBox="0 0 760 512" role="img" aria-label={description} className="hidden h-auto w-full min-[760px]:block">
        <ArrowHead id="reply-arrow-h" />
        <Box x={0} y={38} w={84} title="visitor" />
        <path d="M84,61 H106" {...line} markerEnd="url(#reply-arrow-h)" />
        <Box x={108} y={38} w={84} title="guards" />
        <path d="M192,61 H244" {...line} markerEnd="url(#reply-arrow-h)" />

        <LoopFrame x={216} y={6} w={220} h={238} />
        <GptBox x={246} y={38} w={160} />
        {/* The cycle: calls down, results back up */}
        <path d="M290,84 V154" {...line} markerEnd="url(#reply-arrow-h)" />
        <Small x={282} y={123} anchor="end">calls</Small>
        <path d="M362,154 V86" {...line} markerEnd="url(#reply-arrow-h)" />
        <Small x={370} y={123}>results</Small>
        <ToolsBox x={246} y={156} w={160} />

        {/* Answer leaves the loop */}
        <path d="M406,61 H486" {...line} markerEnd="url(#reply-arrow-h)" />
        <Small x={462} y={53} anchor="middle">answer</Small>
        <Box x={488} y={38} w={84} title="checks" />
        <path d="M572,61 H594" {...line} markerEnd="url(#reply-arrow-h)" />
        <Box x={596} y={38} w={84} title="drawer" />

        {/* Route 1: search_writing splits the question into topics, each searched by Jev, merged round-robin */}
        <path d="M270,238 V262 H50 V278" {...line} markerEnd="url(#reply-arrow-h)" />
        <Small x={160} y={257} anchor="middle">search_writing(topics)</Small>
        <Box x={10} y={280} w={80} h={22} title="topic 1" />
        <Box x={10} y={306} w={80} h={22} title="topic 2" />
        <Box x={10} y={332} w={80} h={22} title="topic 3" />
        <Small x={258} y={290} anchor="middle">one call: each topic searched separately</Small>
        <path d="M90,319 H102" {...line} markerEnd="url(#reply-arrow-h)" />
        <Box x={104} y={296} w={90} title="Jev filter" sub={filterSub} />
        <Small x={149} y={356} anchor="middle">{filterPass}</Small>
        <path d="M194,319 H204" {...line} markerEnd="url(#reply-arrow-h)" />
        <Box x={206} y={296} w={90} title="Jev rank" sub={rankSub} />
        <Small x={251} y={356} anchor="middle">{rankPass}</Small>
        <path d="M296,319 H306" {...line} markerEnd="url(#reply-arrow-h)" />
        <Box x={308} y={296} w={104} title="merge" sub="round-robin" accent />
        <Small x={418} y={312}>{`${PAGE_SIZE} at a time`}</Small>
        <Small x={418} y={326}>{`more: next ${PAGE_SIZE}`}</Small>
        <Small x={418} y={340}>no Jev call</Small>
        <path d="M360,342 V402" {...line} markerEnd="url(#reply-arrow-h)" />

        {/* Route 2: read_writing opens articles GPT picked from the library map in its prompt */}
        <path d="M382,238 V262 H605 V286" {...line} markerEnd="url(#reply-arrow-h)" />
        <Small x={494} y={257} anchor="middle">read_writing(ids)</Small>
        <Small x={326} y={257} anchor="middle">or</Small>
        <Box x={520} y={288} w={170} title="read_writing" sub="ids from the library map" />
        <Small x={612} y={350}>no search</Small>
        <Small x={612} y={364}>up to 3 ids</Small>
        <path d="M605,334 V380 H392 V402" {...line} markerEnd="url(#reply-arrow-h)" />

        {/* Both routes: Jev picks each article's best sections; the text goes back to GPT */}
        <Box x={246} y={404} w={160} title="Jev sections" sub={sectionsSub} />
        <path d="M406,427 H744 V200 H408" {...line} markerEnd="url(#reply-arrow-h)" />
        <Small x={326} y={468} anchor="middle">{keeps}</Small>
        <Small x={326} y={484} anchor="middle">article text back to GPT</Small>
        <Small x={326} y={500} anchor="middle">{`≤2 calls of each tool · ${cap}`}</Small>
      </svg>

      {/* Mobile */}
      <svg viewBox="0 0 340 860" role="img" aria-label={description} className="mx-auto block h-auto w-full max-w-[400px] min-[760px]:hidden">
        <ArrowHead id="reply-arrow-v" />
        <Box x={95} y={0} w={150} title="visitor" />
        <path d="M170,46 V62" {...line} markerEnd="url(#reply-arrow-v)" />
        <Box x={95} y={64} w={150} title="guards" />
        <path d="M170,110 V154" {...line} markerEnd="url(#reply-arrow-v)" />

        <LoopFrame x={0} y={126} w={340} h={224} />
        <GptBox x={95} y={156} w={150} />
        <path d="M140,202 V258" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={132} y={234} anchor="end">calls</Small>
        <path d="M200,258 V204" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={208} y={234}>results</Small>
        <ToolsBox x={95} y={260} w={150} />

        {/* Route 1 (left): topics, each through Jev, merged */}
        <path d="M120,342 V362 H80 V374" {...line} markerEnd="url(#reply-arrow-v)" />
        <Box x={6} y={376} w={148} h={40} title="topic 1 · 2 · 3" sub={`1 call, ≤${MAX_TOPICS} searches`} />
        <path d="M80,416 V428" {...line} markerEnd="url(#reply-arrow-v)" />
        <Box x={6} y={430} w={148} title="Jev filter" sub={filterSub} />
        <path d="M80,476 V490" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={86} y={487}>{filterPass}</Small>
        <Box x={6} y={492} w={148} title="Jev rank" sub={rankSub} />
        <path d="M80,538 V552" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={86} y={549}>{rankPass}</Small>
        <Box x={6} y={554} w={148} title="merge" sub="round-robin" accent />
        <Small x={158} y={581}>{`${PAGE_SIZE} at a time`}</Small>
        <path d="M80,600 V612 H140 V622" {...line} markerEnd="url(#reply-arrow-v)" />

        {/* Route 2 (right): ids from the library map, no search */}
        <path d="M220,342 V362 H236 V374" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={170} y={366} anchor="middle">or</Small>
        <Box x={166} y={376} w={140} title="read_writing" sub="from the library map" />
        <Small x={172} y={440}>no search</Small>
        <Small x={172} y={454}>≤3 ids</Small>
        <path d="M236,422 V612 H200 V622" {...line} markerEnd="url(#reply-arrow-v)" />

        {/* Both routes meet at Jev sections; the text returns to the tools up the left edge */}
        <Box x={90} y={624} w={160} title="Jev sections" sub={sectionsSub} />
        <path d="M90,647 H2 V300 H93" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={170} y={688} anchor="middle">{'keeps the best sections, '}</Small>
        <Small x={170} y={702} anchor="middle">{`≤ ${SECTION_BUDGET_CHARS.toLocaleString('en-GB')} chars an article`}</Small>
        <Small x={170} y={720} anchor="middle">article text back to GPT</Small>
        <Small x={170} y={734} anchor="middle">{`${cap} · ≤2 calls a tool`}</Small>

        {/* Answer leaves the loop down the right edge */}
        <path d="M245,179 H318 V771 H247" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={282} y={172} anchor="middle">answer</Small>
        <Box x={95} y={748} w={150} title="checks" />
        <path d="M170,794 V814" {...line} markerEnd="url(#reply-arrow-v)" />
        <Box x={95} y={816} w={150} title="drawer" />
      </svg>
    </figure>
  )
}
