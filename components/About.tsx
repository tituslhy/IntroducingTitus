import BackToTop from '@/components/BackToTop'
import PeriodicTable from '@/components/about/PeriodicTable'
import AskPill from '@/components/tiles/AskPill'
import GroupLabel from '@/components/tiles/GroupLabel'
import { TOOLS, toolMatcher } from '@/lib/about'
import { ARTICLES } from '@/lib/articles'
import { ARTICLE_COUNT_WORD } from '@/lib/content'
import { pageFolio } from '@/lib/profile'

const articleCountTitle = ARTICLE_COUNT_WORD[0].toUpperCase() + ARTICLE_COUNT_WORD.slice(1)

export const DRIVES = [
  {
    n: 'i.',
    title: 'AI that meets felt needs',
    body: 'Demos answer whether you can build the concept. Production answers whether the app meets the need. I spend my time on both.',
  },
  {
    n: 'ii.',
    title: 'Writing as external memory',
    body: `${articleCountTitle} articles because future-me will forget. That others find them useful is a side effect I’m glad about.`,
  },
  {
    n: 'iii.',
    title: 'Open source as paying rent',
    body: 'LlamaIndex, Unsloth, IBM ACP, Chainlit, Giskard. Use a framework long enough and you find the bug. File the issue. Send the PR.',
  },
  {
    n: 'iv.',
    title: 'Making AI legible',
    body: 'Most AI projects die in the gap between what the system can do and what the organisation believes it can do. I spend as much time on that gap as on the code.',
  },
]

/** How many of my articles mention each tool, in TOOLS order. Runs on the server: ARTICLES holds every body. */
export function toolArticleCounts(): number[] {
  const texts = ARTICLES.map((a) => `${a.title} ${a.body} ${a.keywords.join(' ')}`)
  return TOOLS.map((t) => {
    const re = toolMatcher(t)
    return re ? texts.filter((text) => re.test(text)).length : 0
  })
}

export default function About() {
  return (
    <section id="lede" className="text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(20px,3vw,40px)] pb-[clamp(28px,5vw,72px)] max-[720px]:border-t-0 [@media(max-height:480px)]:border-t-0">
        <header className="mb-6">
          <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            <span className="font-semibold tracking-[0.08em] text-amber">{pageFolio('/about')}</span>
            <span className="font-medium text-ink">About</span>
            <span className="h-px flex-1 self-center bg-rule" />
            <BackToTop />
          </div>
          <h2 className="mt-[22px] max-w-[22ch] font-serif text-[clamp(34px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
            I swore I’d never write <em className="italic text-amber">code</em>.
          </h2>
          <p className="mt-3 max-w-[70ch] font-serif text-[19px] leading-[1.5] text-ink-soft [text-wrap:pretty]">
            I graduated in chemical engineering in 2015. Here’s everything I’ve picked up since, in the order I picked it up.
          </p>
        </header>

        <PeriodicTable articleCounts={toolArticleCounts()} />

        <div className="mt-11">
          <GroupLabel className="mt-0">What drives me</GroupLabel>
          <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[720px]:grid-cols-2 min-[1100px]:grid-cols-4">
            {DRIVES.map((d) => (
              <li key={d.n} className="rounded-[20px] bg-paper-deep px-[22px] py-5 transition-[transform,background-color] duration-200 hover:-translate-y-[3px] hover:bg-paper-band motion-reduce:hover:translate-y-0">
                <span className="font-serif text-[18px] italic text-amber">{d.n}</span>
                <h3 className="m-0 mt-1 font-serif text-[19px] font-medium leading-[1.25]">{d.title}</h3>
                <p className="m-0 mt-2 font-serif text-[15px] leading-[1.5] text-ink-soft">{d.body}</p>
              </li>
            ))}
          </ol>
          <AskPill ask={{ label: 'how I got here', question: 'How did you go from chemical engineering to AI engineering?' }} />
        </div>
      </div>
    </section>
  )
}
