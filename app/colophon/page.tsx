import type { Metadata } from 'next'
import Link from 'next/link'
import Footer from '@/components/Footer'
import Reveal from '@/components/Reveal'
import ReplyDiagram from '@/components/colophon/ReplyDiagram'
import RecruiterModeButton from '@/components/colophon/RecruiterModeButton'
import { ARTICLE_COUNT_NUMBER, COLOPHON_PATH } from '@/lib/content'
import { loadScorecard, type Scorecard } from '@/lib/eval-results'
import { FIT_LEVEL_LABELS, NOT_ON_FILE_NOTE, type FitBrief } from '@/lib/fit-brief'
import { SOCIAL } from '@/lib/profile'

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
  ['Agent loop', 'GPT reads the question and calls search_writing("guardrails for AI agents"), a query it writes to stand on its own.'],
  ['Jev filter', `One yes-or-no probability per article, judged on its card (title, one-line summary, keywords): ${ARTICLE_COUNT_NUMBER} questions, one request. Most fall away.`],
  ['Jev rank', 'Every survivor is scored 0–3 against a rubric, this time on their outline and opening. The two best are read in full; if they aren’t enough, GPT asks for the next two from the same ranking.'],
  ['Agent loop', 'GPT answers from what the articles say, in my voice, citing them as [1], [2] and onward.'],
  ['Checks', 'Output is capped, and only the numbers the server actually sent can become links.'],
  ['Drawer', 'The reply streams in with superscript footnotes and a Sources row underneath.'],
]

const GUARDRAILS: [guardrail: string, prevents: string][] = [
  ['Page anchors validated server-side', 'Pointing at things that don’t exist'],
  ['Article retrieval: relevance filter, graded rerank, known slugs only, at most four', 'Irrelevant or invented sources'],
  ['“Not on file”', 'Overselling, especially in recruiter mode'],
  ['Job descriptions wrapped as data and not stored upstream', 'Prompt injection; keeping confidential postings'],
  ['Fit briefs re-validated after the model writes them', '“Strong” claims without evidence'],
  ['Origin check, rate limits, output caps, timeouts, tool-call limits', 'Abuse and runaway cost'],
  ['Scope rules', 'Salary, family or weakness talk'],
]

const WONT_DO = [
  'Talk salary, availability or family. Those go to my inbox.',
  'Speculate about my weaknesses, or invent a “balanced” critique to sound objective.',
  'Invent a project, a skill or an article. If it isn’t on file, it says so.',
  'Remember you between visits. The conversation lives in your browser tab and ends with it. Conversations are logged, privately, so I can see where it goes wrong and fix it; they’re never published.',
]

/** Clearly labelled example: every claim in it is on the page above it. */
const EXAMPLE_BRIEF: FitBrief = {
  roleTitle: 'Staff GenAI Engineer',
  company: 'An example company',
  verdict: 'A strong match on production retrieval and multi-agent platforms; the Rust requirement isn’t on my site, so ask me.',
  requirements: [
    {
      requirement: 'Shipped retrieval-augmented generation to production',
      fit: 'strong',
      evidence: 'At Illumina I solo-built a 16-component agentic RAG system: hybrid search, reranking, and an iterative retrieval loop.',
      targets: [],
    },
    {
      requirement: 'Designed a platform for multiple agents',
      fit: 'strong',
      evidence: 'At UOB I architected BYOA, the enterprise multi-agent platform, for cross-framework interoperability and dynamic tool discovery.',
      targets: [],
    },
    { requirement: 'Production services in Rust', fit: 'not_on_file', evidence: '', targets: [] },
  ],
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

function Section({ folio, title, children }: { folio: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal>
      <section aria-labelledby={`colophon-${folio}`} className="pt-[clamp(36px,5vw,64px)]">
        <h2
          id={`colophon-${folio}`}
          className="mb-[clamp(16px,2vw,22px)] flex items-baseline gap-3.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft"
        >
          <span className="font-semibold tracking-[0.08em] text-amber">{folio}</span>
          <span className="font-medium text-ink">{title}</span>
          <span className="h-px flex-1 self-center bg-rule" />
        </h2>
        {children}
      </section>
    </Reveal>
  )
}

const prose = 'text-[17px] leading-[1.65] text-ink [text-wrap:pretty]'
const percent = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`)

function ScorecardTable({ card }: { card: Scorecard }) {
  const rows: [string, string, string][] = [
    ['Tool-call accuracy', percent(card.toolCallAccuracy), 'Searched for writing questions; stayed out of it for CV questions'],
    ['Recall', percent(card.stage1Recall), 'The right article made the shortlist'],
    ['Precision@2', percent(card.precisionAt2), 'The articles it read were the right ones'],
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
  let folio = 0
  const next = () => String(++folio).padStart(2, '0')

  return (
    <main className="text-ink">
      <div className="mx-auto max-w-[1280px] px-[clamp(18px,4vw,56px)]">
        {/* Top bar: the way home (this page is a satellite, not in the main nav) */}
        <nav aria-label="Site" className="flex items-center justify-between border-b border-rule py-4 font-mono text-[11px] uppercase tracking-[0.12em]">
          <Link href="/" className="font-serif text-[20px] font-medium normal-case tracking-[-0.01em] text-ink transition-colors hover:text-amber">
            T·L
          </Link>
          <Link href="/" className="text-ink-soft transition-colors hover:text-amber">
            <span aria-hidden="true">← </span>Back to the site
          </Link>
        </nav>

        <article className="mx-auto max-w-[68ch] pb-[clamp(32px,5vw,64px)]">
          {/* Masthead */}
          <header className="border-b border-ink pt-[clamp(40px,6vw,88px)] pb-[clamp(24px,3vw,36px)]">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-amber">Colophon</p>
            <h1 className="mt-4 font-serif text-[clamp(40px,6.5vw,72px)] font-medium leading-[1.02] tracking-[-0.025em] [text-wrap:balance]">
              How <em className="italic text-amber">Ask Titus</em> works
            </h1>
            <p className="mt-5 font-serif text-[clamp(18px,2vw,21px)] italic leading-[1.5] text-ink-soft [text-wrap:pretty]">
              A small agent, built the way I’d build one for production: grounded in one source of truth, retrieving
              with a fast decision model, and fenced in by guardrails.
            </p>
          </header>

          <Section folio={next()} title="The short version">
            <p className={prose}>
              <span className="float-left pr-3 pt-1.5 font-serif text-[76px] font-medium italic leading-[0.8] text-amber">
                I
              </span>
              t speaks as me, from the same data that renders this page. Ask about my writing and it reads my articles
              instead of guessing, then cites them. If the answer lives somewhere on this page, it shows you where. And
              when something isn’t on file, it says so rather than making it up.
            </p>
          </Section>

          <Section folio={next()} title="Anatomy of a reply">
            <ReplyDiagram articleCount={ARTICLE_COUNT_NUMBER} />
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              One question: “What have you written about guardrails?”
            </p>
            <ol className="border-t border-rule">
              {WALKTHROUGH.map(([stage, what], i) => (
                <li key={i} className="grid grid-cols-[2.2rem_1fr] border-b border-rule py-2.5 min-[560px]:grid-cols-[2.2rem_8.5rem_1fr]">
                  <span className="font-mono text-[11px] text-amber">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink">{stage}</span>
                  <span className="col-start-2 mt-0.5 text-[15px] leading-snug text-ink-soft min-[560px]:col-start-3 min-[560px]:mt-0">
                    {what}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-[clamp(20px,3vw,28px)] mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              Reading in pages
            </p>
            <p className={prose}>
              I don’t set how many articles it reads; GPT does. A search ranks every article that clears the filter
              and hands over the best two, plus a count of how many are still waiting. If two don’t cover the
              question, GPT asks for the next two with <code className="font-mono text-[14px]">more: true</code>,
              served from the ranking it already holds, so Jev isn’t asked again. It gets two searches per reply, so
              the second is either the next page or a fresh query, which runs Jev again and replaces the ranking.
              When the ranking runs out, the tool says so, and GPT answers from what it has read. That caps a reply
              at four articles.
            </p>
          </Section>

          <Section folio={next()} title="One source of truth">
            <p className={prose}>
              Every role, project, date and link lives once, in <code className="font-mono text-[14px]">lib/profile.ts</code>.
              That file renders this site <em>and</em> fills the assistant’s instructions, so the two can’t drift apart
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
                These numbers come straight from the last run.
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
              No agent framework. Two tools and at most four rounds is one loop, and a loop I can read end to end is one
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
          </Section>
        </article>
      </div>
      <Footer />
    </main>
  )
}
