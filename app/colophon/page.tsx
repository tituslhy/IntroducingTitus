import { Fragment } from 'react'
import type { Metadata } from 'next'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import ReplyDiagram from '@/components/colophon/ReplyDiagram'
import RecruiterModeButton from '@/components/colophon/RecruiterModeButton'
import TryIt from '@/components/colophon/TryIt'
import { ARTICLES } from '@/lib/articles'
import { loadColophonTraces, titlesFor } from '@/lib/colophon-traces-load'
import { ARTICLE_COUNT_NUMBER, COLOPHON_PATH, numberToWords } from '@/lib/content'
import { loadScorecard, type Scorecard } from '@/lib/eval-results'
import { FIT_LEVEL_LABELS, NOT_ON_FILE_NOTE, type FitBrief } from '@/lib/fit-brief'
import { PAGE_TARGETS, SITE_PAGES, SOCIAL } from '@/lib/profile'
import { MAX_ARTICLES_PER_REPLY, MAX_READING_CALLS, SECTION_BUDGET_CHARS } from '@/lib/search-config'

const TITLE = 'How Ask Titus works | Titus Lim'
const DESCRIPTION =
  'The production note for Ask Titus: a small agent grounded in one source of truth, retrieving my articles with a fast decision model, and fenced in by guardrails.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: COLOPHON_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: COLOPHON_PATH },
  twitter: { title: TITLE, description: DESCRIPTION },
}

const REPO_URL = 'https://github.com/tituslhy/IntroducingTitus'

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const WALKTHROUGH: [stage: string, what: string][] = [
  ['Guards', 'The request clears the origin check, the rate limit and the size limits before any model sees it.'],
  ['Agent loop', 'GPT reads the question and calls search_writing(["guardrails for AI agents"]): one standalone topic per thing the question asks about. “LiteLLM, Helm and Nginx” would be three topics, each searched separately, so none crowds the others out.'],
  ['Jev filter (noul)', `One yes-or-no probability per article, judged on its card (title, one-line summary, keywords): ${ARTICLE_COUNT_NUMBER} questions, one request. Most fall away.`],
  ['Jev rank (score)', 'Every survivor is scored 0–3 against a rubric, this time on their outline and opening. The three best go on; if they aren’t enough, GPT asks for the next three from the same ranking.'],
  ['Jev sections (score)', `Most of my articles run long, so none is handed over whole. Jev scores each section on its heading and a one-line note, and the best sections come back, up to ${SECTION_BUDGET_CHARS.toLocaleString('en-GB')} characters an article, with the full outline so GPT knows what it skipped.`],
  ['Agent loop', 'GPT answers from what the articles say, in my voice, citing them as [1], [2] and onward. An article keeps the same number for the whole conversation, and it says when I wrote it; for a framework article more than six months old, it adds that you should check the project’s current docs.'],
  ['Checks', 'Output is capped, and only the numbers the server actually sent can become links.'],
  ['Drawer', 'The reply streams in with superscript footnotes and a Sources row underneath.'],
]

/** How the agent reaches my articles, by kind of question (the routes in the diagram). */
const QUESTION_KINDS: [question: string, route: string][] = [
  ['What have you written about guardrails?', 'One topic, searched: Jev filters all my articles, ranks the survivors, and picks their best sections.'],
  [
    'How do I use LiteLLM, Helm and Nginx?',
    'search_writing(["LiteLLM", "Helm", "Nginx"]): one call, three searches inside it (one per topic), merged so each topic’s best article comes first.',
  ],
  [
    'How would you build production-ready agents?',
    'No search. GPT splits it into parts (architecture, reliability, deployment), picks the articles for each part from the library map in its prompt, and opens each part with its own read_writing call, all at once. It stops when I have nothing more to add.',
  ],
  [
    'Have you used LangGraph?',
    'My record first: when I picked it up, where, and how much I used it. Then search_writing for what I wrote about it, blended in and cited.',
  ],
]

const GUARDRAILS: [guardrail: string, prevents: string][] = [
  ['Page anchors validated server-side', 'Pointing at things that don’t exist'],
  ['Article retrieval: relevance filter, graded rerank, known slugs only, at most ten articles a reply', 'Irrelevant or invented sources'],
  ['Footnote numbers rebuilt server-side from my articles only', 'Forged or shifting sources'],
  ['“Not on file”', 'Overselling, especially in recruiter mode'],
  ['Job descriptions wrapped as data and not stored upstream', 'Prompt injection; keeping confidential postings'],
  ['Fit briefs re-validated after the model writes them', '“Strong” claims without evidence'],
  ['Origin check, rate limits, output caps, timeouts, tool-call limits', 'Abuse and runaway cost'],
  ['Scope rules', 'Salary, family or weakness talk'],
]

const WONT_DO = [
  'Talk salary, availability or family. Those go to my inbox.',
  'Speculate about my weaknesses, or invent a “balanced” critique to sound objective.',
  'Rate me, or rank me against candidates it can’t see. It shows the evidence and leaves the judging to you.',
  'Invent a project, a skill or an article. If it isn’t on file, it says so.',
  'Tell you what I’d use today instead of what an article says. It says when I wrote it and points you to the project’s current docs.',
  'Remember you between visits. The conversation lives in your browser tab and ends with it. Conversations are logged, privately, so I can see where it goes wrong and fix it; they’re never published.',
]

/** Clearly labelled example: every claim in it is on the page above it. */
const EXAMPLE_BRIEF: FitBrief = {
  roleTitle: 'Staff GenAI Engineer',
  company: 'An example company',
  verdict: 'A strong match on production retrieval and agent platforms; the Rust requirement isn’t on my site, so ask me.',
  requirements: [
    {
      requirement: 'Shipped retrieval-augmented generation to production',
      fit: 'strong',
      evidence: 'At Illumina I solo-built a 16-component agentic RAG system: hybrid search, reranking, and an iterative retrieval loop.',
      targets: [],
    },
    {
      requirement: 'Built a platform for building and serving agents',
      fit: 'strong',
      evidence: 'At Mastercard I am tech lead for the core SDK behind Agent Suite: teams declare agents in YAML, then chat with them in the terminal or serve them as an API.',
      targets: [],
    },
    { requirement: 'Production services in Rust', fit: 'not_on_file', evidence: '', targets: [] },
  ],
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

/**
 * One section in the site's item layout: folio and title pinned in a left column, the text on the right.
 * `full` spans both columns (the Try it panel); `rows` follow it, each label in the left column.
 */
function Section({
  folio,
  title,
  children,
  full,
  rows,
}: {
  folio: string
  title: string
  children: React.ReactNode
  full?: React.ReactNode
  /** Sub-parts after `full`: each label pinned in the left column, its text on the right. */
  rows?: [label: string, body: React.ReactNode][]
}) {
  return (
    <Reveal>
      <section
        aria-labelledby={`colophon-${folio}`}
        className="mt-[clamp(32px,4.5vw,56px)] grid grid-cols-1 gap-y-5 border-t border-rule pt-[clamp(28px,4vw,44px)] min-[900px]:grid-cols-[minmax(0,300px)_minmax(0,1fr)] min-[900px]:gap-x-12"
      >
        <h2 id={`colophon-${folio}`} className="m-0 flex flex-col gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-amber">{folio}</span>
          <span className="font-serif text-[clamp(26px,2.6vw,34px)] font-medium leading-[1.08] tracking-[-0.02em] text-ink [text-wrap:balance]">
            {title}
          </span>
        </h2>
        <div className="min-w-0 [&>p]:max-w-[75ch]">{children}</div>
        {full && <div className="min-w-0 min-[900px]:col-span-2">{full}</div>}
        {rows?.map(([label, body]) => (
          <Fragment key={label}>
            <h3 className="m-0 mt-[clamp(14px,2vw,24px)] font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft min-[900px]:col-start-1 min-[900px]:pt-1.5">
              {label}
            </h3>
            <div className="min-w-0 min-[900px]:mt-[clamp(14px,2vw,24px)] [&>p]:max-w-[75ch]">{body}</div>
          </Fragment>
        ))}
      </section>
    </Reveal>
  )
}

const prose = 'text-[18px] leading-[1.65] text-ink [text-wrap:pretty]'
const percent = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`)

function ScorecardTable({ card }: { card: Scorecard }) {
  const rows: [string, string, string][] = [
    ['Tool-call accuracy', percent(card.toolCallAccuracy), 'Searched for writing questions; stayed out of it for CV questions'],
    ['Recall', percent(card.stage1Recall), 'The right article made the shortlist'],
    // Runs recorded before pageSize existed read pages of 2.
    [`Precision@${card.pageSize ?? 2}`, percent(card.precisionAt2), 'The articles it read were the right ones'],
    ...(card.recordAccuracy !== null
      ? [['Used my record', percent(card.recordAccuracy), 'Experience questions answered with when and where I used it'] as [string, string, string]]
      : []),
    ['Abstain accuracy', percent(card.abstainAccuracy), 'Said “I haven’t written about that” when I hadn’t'],
    ['No invention', percent(card.noInvention), 'Replies with no made-up titles, links or citations'],
  ]
  const runDate = new Date(card.runAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return (
    <>
      <dl className="grid grid-cols-1 border-t border-ink min-[560px]:grid-cols-2">
        {rows.map(([label, value, gloss]) => (
          <div key={label} className="border-b border-rule py-3.5 min-[560px]:odd:border-r min-[560px]:odd:pr-5 min-[560px]:even:pl-5">
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">{label}</dt>
            <dd className="mt-1 font-serif text-[34px] font-medium leading-none tracking-[-0.02em] text-ink">{value}</dd>
            <dd className="mt-1.5 text-[13.5px] leading-snug text-ink-soft">{gloss}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
        {card.questionCount} questions · last run {runDate}
        {card.jevModel && ` · ${card.jevModel}`} · real Jev and GPT calls, no mocks
      </p>
    </>
  )
}

function ExampleBrief({ brief }: { brief: FitBrief }) {
  return (
    <figure className="mt-5 border border-ink bg-paper-deep">
      <figcaption className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
        <span>Example fit brief</span>
        <span>Not a real posting</span>
      </figcaption>
      <div className="px-4 py-4">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">
          {brief.roleTitle} · {brief.company}
        </p>
        <p className="mt-2 font-serif text-[18px] italic leading-snug text-ink">{brief.verdict}</p>
        <ul className="mt-4 border-t border-rule">
          {brief.requirements.map((r) => (
            <li key={r.requirement} className="grid grid-cols-[auto_1fr] gap-x-3 border-b border-rule py-3 last:border-b-0">
              <span
                className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${r.fit === 'strong' ? 'text-amber' : 'text-ink-faint'}`}
              >
                {FIT_LEVEL_LABELS[r.fit]}
              </span>
              <div>
                <p className="text-[14.5px] font-medium leading-snug text-ink">{r.requirement}</p>
                <p className="mt-1 text-[14px] leading-snug text-ink-soft">{r.evidence || NOT_ON_FILE_NOTE}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}

// ---------------------------------------------------------------------------

export default function ColophonPage() {
  const scorecard = loadScorecard()
  const traces = loadColophonTraces()
  let folio = 0
  const next = () => String(++folio).padStart(2, '0')

  return (
    <main className="text-ink">
      <div className="mx-auto max-w-[1280px] px-[clamp(18px,4vw,56px)]">
        <article className="pb-[clamp(32px,5vw,64px)]">
          {/* Masthead: the title on the left, the short version beside it as plain text */}
          <header className="grid gap-x-14 gap-y-7 pt-[clamp(28px,4vw,56px)] min-[1024px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] min-[1024px]:items-end">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-amber">Colophon</p>
              <h1 className="mt-3 font-serif text-[clamp(44px,4.6vw,64px)] font-medium leading-[1.02] tracking-[-0.025em] [text-wrap:balance]">
                How <em className="italic text-amber">Ask Titus</em> works
              </h1>
              <p className="mt-4 max-w-[52ch] font-serif text-[clamp(18px,1.7vw,20px)] italic leading-[1.5] text-ink-soft [text-wrap:pretty]">
                A small agent, built the way I’d build one for production: grounded in one source of truth, retrieving
                with a fast decision model, and fenced in by guardrails.
              </p>
            </div>
            <Reveal>
              <section aria-labelledby="colophon-01" className="min-[1024px]:border-l min-[1024px]:border-rule min-[1024px]:pl-7">
                {(() => {
                  const f = next()
                  return (
                    <h2 id={`colophon-${f}`} className="m-0 mb-2 flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
                      <span className="font-semibold tracking-[0.08em] text-amber">{f}</span>
                      <span className="font-medium text-ink">The short version</span>
                    </h2>
                  )
                })()}
                <p className="text-[17.5px] leading-[1.6] text-ink [text-wrap:pretty]">
                  It speaks as me, from the same data that renders this page. Ask about my writing and it reads my
                  articles instead of guessing, then cites them. If the answer lives somewhere on this page, it shows you
                  where. And when something isn’t on file, it says so rather than making it up.
                </p>
              </section>
            </Reveal>
          </header>

          {traces && (
            <div className="mt-[clamp(24px,3vw,36px)]">
              <TryIt
                recordings={traces}
                articleCount={ARTICLE_COUNT_NUMBER}
                titles={titlesFor(traces, ARTICLES)}
                targets={PAGE_TARGETS.map(({ id, label, path, tool }) => ({
                  id,
                  label,
                  path,
                  page: SITE_PAGES.find((p) => p.path === path)?.label,
                  ...(tool && { tool }),
                }))}
              />
            </div>
          )}

          <Section
            folio={next()}
            title="Anatomy of a reply"
            full={
              traces ? undefined : (
                <div className="mx-auto max-w-[900px] [&_figure]:!mx-0">
                  <ReplyDiagram articleCount={ARTICLE_COUNT_NUMBER} />
                  <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                    One question: “What have you written about guardrails?”
                  </p>
                  <ol className="border-t border-rule">
                    {WALKTHROUGH.map(([stage, what], i) => (
                      <li key={i} className="grid grid-cols-[2.2rem_1fr] border-b border-rule py-2.5 min-[560px]:grid-cols-[2.2rem_11rem_1fr]">
                        <span className="font-mono text-[11px] text-amber">{String(i + 1).padStart(2, '0')}</span>
                        <span className="font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink">{stage}</span>
                        <span className="col-start-2 mt-0.5 text-[15px] leading-snug text-ink-soft min-[560px]:col-start-3 min-[560px]:mt-0">
                          {what}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )
            }
            rows={[
              [
                'Four kinds of question',
                <>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-ink font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">
                      <th scope="col" className="w-2/5 py-2 pr-4 font-medium">Question</th>
                      <th scope="col" className="py-2 font-medium">Route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {QUESTION_KINDS.map(([q, route]) => (
                      <tr key={q} className="border-b border-rule align-top">
                        <td className="py-2.5 pr-4 font-serif text-[15px] italic leading-snug text-ink">{q}</td>
                        <td className="py-2.5 text-[14.5px] leading-snug text-ink-soft">{route}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>,
              ],
              [
                'Reading in pages',
                <>
                <p className={prose}>
                  I don’t set how many articles it reads; GPT does. A search runs once per topic, merges the rankings so
                  each topic’s best article comes first, and hands them over three at a time, plus a count of how many
                  are still waiting. If three don’t cover the question, GPT asks for the next three with{' '}
                  <code className="font-mono text-[14px]">more: true</code>, served from the ranking it already holds,
                  so Jev isn’t asked again. It gets {numberToWords(MAX_READING_CALLS)} searches per reply, so each one after the first is either the next
                  page or a fresh search, which runs Jev again and replaces the ranking. When the ranking runs out, the tool
                  says so, and GPT answers from what it has read. A reply reads at most{' '}
                  {numberToWords(MAX_ARTICLES_PER_REPLY)} articles, however it found them.
                </p>
                </>,
              ],
              [
                'Reading by theme',
                <>
                <p className={prose}>
                  Search answers concrete questions well and broad ones badly. Ask “how would you build production-ready
                  agents?” and every article is a little relevant, so none stands out. For those, GPT doesn’t search. Its
                  prompt carries a map of my library: a handful of themes, each article listed under its theme with a
                  one-line summary, and an article that does two jobs listed under both. GPT splits the question into its
                  parts, picks the articles each part needs from the map, and opens every part with its own{' '}
                  <code className="font-mono text-[14px]">read_writing</code> call, all in the same step. Jev then picks
                  each article’s sections for its part, as it does for search. If a part is still thin, GPT reads more; it
                  stops when I have nothing more to add. The map is only for choosing what to read: GPT cites what it
                  read, never a summary. The themes are drafted by a model when I publish, and I review them before they
                  ship.
                </p>
                </>,
              ],
              [
                'Long conversations',
                <>
                <p className={prose}>
                  It sees the last 20 messages, always starting on one of yours. When a long conversation outgrows its
                  budget, the oldest exchanges drop off first rather than the conversation being cut short. Articles cited
                  earlier keep their numbers: the drawer sends back what it has cited, and the server checks each link
                  against my articles before the model sees it.
                </p>
                </>,
              ],
              [
                'The guided tour',
                <>
                <p className={prose}>
                  When an answer draws on something on this site (a role, a project, a tool in the periodic table), GPT
                  names those places with <code className="font-mono text-[14px]">show_on_page</code>, in the order the
                  answer mentions them, and the server drops any it doesn’t recognise. On a wide screen the drawer moves
                  the page once, to the first of them, and never while you’re scrolling. The rest sit under the answer as
                  See on page pills: ↓ for this page, → for another.
                </p>
                </>,
              ],
            ]}
          >
            {traces ? (
              <p className={prose}>
                The stage above replays a real reply, recorded from the live system. Each box lights up as its part
                runs, then shows what it measured; the reply streams into the drawer at the end of the line; and every
                box opens to show what went in and what came out. Nothing there calls a model. Here is the same path, in
                words.
              </p>
            ) : (
              <p className={prose}>The path one question takes, from the guards to the drawer.</p>
            )}
          </Section>

          <Section folio={next()} title="One source of truth">
            <p className={prose}>
              Every role, project, date and link lives once, in <code className="font-mono text-[14px]">lib/profile.ts</code>,
              and every tool I’ve used, with when and where, in <code className="font-mono text-[14px]">lib/about.ts</code>.
              Those files render this site <em>and</em> fill the assistant’s instructions, so the two can’t drift apart
              quietly. A drift test checks the two against each other, so a mismatch fails a test before it can mislead
              a visitor.
            </p>
          </Section>

          <Section folio={next()} title="Guardrails">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-ink font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-soft">
                  <th scope="col" className="w-1/2 py-2 pr-4 font-medium">Guardrail</th>
                  <th scope="col" className="py-2 font-medium">What it prevents</th>
                </tr>
              </thead>
              <tbody>
                {GUARDRAILS.map(([g, p]) => (
                  <tr key={g} className="border-b border-rule align-top">
                    <td className="py-2.5 pr-4 text-[14.5px] leading-snug text-ink">{g}</td>
                    <td className="py-2.5 text-[14.5px] leading-snug text-ink-soft">{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section folio={next()} title="Recruiter mode">
            <p className={prose}>
              Paste a job description and it writes a fit brief: each requirement checked against my record, with the
              evidence and where it lives on the page. Anything my record can’t back is marked “not on file”, never
              stretched into a fit. The posting is treated as data, and isn’t stored upstream.
            </p>
            <ExampleBrief brief={EXAMPLE_BRIEF} />
            <div className="mt-5">
              <RecruiterModeButton />
            </div>
          </Section>

          {scorecard && (
            <Section folio={next()} title="How it’s tested">
              <p className={`${prose} mb-5`}>
                A golden set of questions, each with the article it should find, or none, run against the real models.
                These numbers come straight from the last run. Scripted conversations are replayed through the same
                loop too: a visitor switching between career and writing questions and back, correcting it, or asking
                it to rank me against other candidates. Each replay checks that footnotes keep their numbers, that
                career questions aren’t searched, and that it never rates me.
              </p>
              <ScorecardTable card={scorecard} />
            </Section>
          )}

          <Section folio={next()} title="What it won’t do">
            <ul className="border-t border-rule">
              {WONT_DO.map((item) => (
                <li key={item} className="flex gap-3 border-b border-rule py-2.5 text-[15.5px] leading-snug text-ink">
                  <span aria-hidden="true" className="font-mono text-amber">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section folio={next()} title="Stack">
            <p className="font-mono text-[12.5px] leading-relaxed tracking-[0.02em] text-ink">
              Next.js · a ~70-line tool loop on the OpenAI Responses API · Jev (TypeSafe AI) · Vercel
            </p>
            <p className={`${prose} mt-3`}>
              No agent framework. Three tools and at most four rounds is one loop, and a loop I can read end to end is one
              I can debug at 2am. The source is on{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-amber underline underline-offset-2">
                GitHub
              </a>
              , and I write about how I build things on{' '}
              <a href={SOCIAL.medium} target="_blank" rel="noopener noreferrer" className="text-amber underline underline-offset-2">
                Medium
              </a>
              .
            </p>
            <p className="mt-4 font-mono text-[11px] leading-relaxed tracking-[0.02em] text-ink-faint">
              Tool logos are trademarks of their owners, shown to indicate tools I&apos;ve used.
            </p>
          </Section>
        </article>
      </div>
      <Footer />
    </main>
  )
}
