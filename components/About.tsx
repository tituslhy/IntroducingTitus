import Passions from '@/components/Passions'
import { ARTICLE_COUNT_WORD } from '@/lib/content'

export default function About() {
  return (
    <section id="lede" className="text-ink">
      <div className="mx-auto max-w-[1280px] border-t border-rule px-[clamp(18px,4vw,56px)] pt-[clamp(40px,5vw,72px)] pb-[clamp(40px,5vw,72px)] max-[720px]:border-t-0">
        {/* Section marker */}
        <header className="mb-[clamp(28px,4vw,56px)]">
          <div className="flex items-baseline gap-3.5 pb-[18px] font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            <span className="font-semibold tracking-[0.08em] text-amber">01</span>
            <span className="font-medium text-ink">About</span>
            <span className="h-px flex-1 self-center bg-rule" />
          </div>
          <h2 className="mt-[22px] max-w-[22ch] font-serif text-[clamp(34px,5vw,68px)] font-medium leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
            A note on the <em className="italic text-amber">work</em> I take on.
          </h2>
        </header>

        {/* Body + passions */}
        <div className="grid grid-cols-1 gap-[clamp(28px,4vw,72px)] min-[880px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div>
            <p className="mb-[18px] text-[19px] leading-[1.62] text-ink [text-wrap:pretty]">
              <span className="float-left pr-3.5 pt-2 font-serif text-[92px] font-medium italic leading-[0.82] text-amber">
                M
              </span>
              ore than eight years building AI systems in banking, biotech, and public
              sector. The interesting problems aren’t just the AI models — they’re the
              latency budgets, the stakeholder who doesn’t trust a stochastic
              system, and the seam between research and production.
            </p>
            <p className="text-[19px] leading-[1.62] text-ink [text-wrap:pretty]">
              I publish what I build. {ARTICLE_COUNT_WORD[0].toUpperCase() + ARTICLE_COUNT_WORD.slice(1)} articles,
              because if I can’t explain it clearly, I don’t understand it yet.
            </p>
          </div>

          <Passions />
        </div>
      </div>
    </section>
  )
}
