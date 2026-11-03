/**
 * "Anatomy of a reply": the path one question takes, drawn in hairlines with
 * theme tokens only. A row on desktop, a column on mobile: two SVGs, one
 * hidden per breakpoint (display:none also drops it from the a11y tree).
 * Thresholds and page size come from lib/search-config.ts, so they can't drift.
 */
import { MIN_SCORE, PAGE_SIZE, RELEVANT } from '@/lib/search-config'

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

/** GPT box: decides each round whether to call tools or answer. */
function GptBox({ x, y, w }: { x: number; y: number; w: number }) {
  return <Box x={x} y={y} w={w} title="GPT" sub="answer, or call tools?" />
}

/** Tools box listing both tools, with search_writing's row y exposed for the chain. */
function ToolsBox({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={64} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1} />
      <Label x={x + 10} y={y + 16}>TOOLS</Label>
      <text x={x + 10} y={y + 36} fontFamily={MONO} fontSize={12} fill="var(--ink)">show_on_page</text>
      <text x={x + 10} y={y + 54} fontFamily={MONO} fontSize={12} fill="var(--ink)">search_writing</text>
    </g>
  )
}

export default function ReplyDiagram({ articleCount }: { articleCount: number }) {
  const filterSub = `noul × ${articleCount}`
  const filterPass = `pass ≥ ${RELEVANT}`
  const rankPass = `pass ≥ ${MIN_SCORE.toFixed(1)}`
  const page = `${PAGE_SIZE} at a time`
  const description =
    `A visitor's question passes the guards and enters the agent loop. Each round, GPT either answers or calls tools; ` +
    `the tool results go back to GPT for the next round, for at most four rounds. The tools are show_on_page and search_writing. ` +
    `For a new query, search_writing runs a Jev filter (one yes/no per article, ${articleCount} articles), then a Jev rank ` +
    `(a graded score for every survivor), holds that ranking, and returns the text of the best two to the loop. ` +
    `Calling it again with more: true returns the next two from the same ranking without calling Jev, until the ranking runs out. ` +
    `search_writing can be called at most twice per reply: the second call is either the next page or a new query. ` +
    `GPT's answer then passes output checks and streams to the drawer.`

  return (
    <figure className="my-[clamp(20px,3vw,32px)] min-[1120px]:-mx-[100px]">
      {/* Desktop */}
      <svg viewBox="0 0 760 308" role="img" aria-label={description} className="hidden h-auto w-full min-[760px]:block">
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

        {/* search_writing, expanded: a new query runs Jev once and holds the ranking */}
        <path d="M406,206 H448" {...line} markerEnd="url(#reply-arrow-h)" />
        <Box x={450} y={183} w={94} title="Jev filter" sub={filterSub} />
        <Small x={497} y={246} anchor="middle">{filterPass}</Small>
        <path d="M544,206 H558" {...line} markerEnd="url(#reply-arrow-h)" />
        <Box x={560} y={183} w={94} title="Jev rank" sub="score × all" />
        <Small x={607} y={246} anchor="middle">{rankPass}</Small>
        <path d="M654,206 H668" {...line} markerEnd="url(#reply-arrow-h)" />
        <Box x={670} y={183} w={88} title="ranking" sub={page} accent />
        {/* more: true pages the held ranking, skipping Jev */}
        <path d="M406,168 H714 V181" {...line} strokeDasharray="3 3" markerEnd="url(#reply-arrow-h)" />
        <Small x={560} y={162} anchor="middle">{`more: true · next ${PAGE_SIZE}, no Jev call`}</Small>
        {/* Each page of article text returns to the loop */}
        <path d="M714,229 V268 H326 V222" {...line} markerEnd="url(#reply-arrow-h)" />
        <Small x={520} y={284} anchor="middle">{`article text back to GPT, ${page} until the ranking runs out`}</Small>
        <Small x={520} y={300} anchor="middle">≤2 search_writing calls per reply: the next page, or a new query</Small>
      </svg>

      {/* Mobile */}
      <svg viewBox="0 0 340 592" role="img" aria-label={description} className="mx-auto block h-auto w-full max-w-[400px] min-[760px]:hidden">
        <ArrowHead id="reply-arrow-v" />
        <Box x={95} y={0} w={150} title="visitor" />
        <path d="M170,46 V62" {...line} markerEnd="url(#reply-arrow-v)" />
        <Box x={95} y={64} w={150} title="guards" />
        <path d="M170,110 V154" {...line} markerEnd="url(#reply-arrow-v)" />

        <LoopFrame x={0} y={126} w={340} h={324} />
        <GptBox x={95} y={156} w={150} />
        <path d="M140,202 V258" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={132} y={234} anchor="end">calls</Small>
        <path d="M200,258 V204" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={208} y={234}>results</Small>
        <ToolsBox x={95} y={260} w={150} />

        {/* search_writing, expanded below the tools */}
        <path d="M120,324 V334 H52 V344" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={46} y={340} anchor="end">query</Small>
        <Box x={6} y={346} w={92} title="Jev filter" sub={filterSub} />
        <Small x={52} y={406} anchor="middle">{filterPass}</Small>
        <path d="M98,369 H110" {...line} markerEnd="url(#reply-arrow-v)" />
        <Box x={112} y={346} w={92} title="Jev rank" sub="score × all" />
        <Small x={158} y={406} anchor="middle">{rankPass}</Small>
        <path d="M204,369 H216" {...line} markerEnd="url(#reply-arrow-v)" />
        <Box x={218} y={346} w={78} title="ranking" sub={page} accent />
        {/* more: true pages the held ranking, skipping Jev */}
        <path d="M236,324 V344" {...line} strokeDasharray="3 3" markerEnd="url(#reply-arrow-v)" />
        <Small x={242} y={338}>more</Small>
        {/* Each page returns to the loop around the right of the tools */}
        <path d="M296,369 H306 V292 H247" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={170} y={426} anchor="middle">{`article text back to GPT, ${page}`}</Small>
        <Small x={170} y={440} anchor="middle">≤2 calls per reply: next page or new query</Small>

        {/* Answer leaves the loop down the right edge */}
        <path d="M245,179 H318 V497 H247" {...line} markerEnd="url(#reply-arrow-v)" />
        <Small x={282} y={172} anchor="middle">answer</Small>
        <Box x={95} y={474} w={150} title="checks" />
        <path d="M170,520 V542" {...line} markerEnd="url(#reply-arrow-v)" />
        <Box x={95} y={544} w={150} title="drawer" />
      </svg>
    </figure>
  )
}
