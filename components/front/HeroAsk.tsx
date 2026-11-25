'use client'

import Link from 'next/link'
import { COLOPHON_PATH } from '@/lib/content'
import { openCopilot } from '@/lib/copilot-events'
import { STARTER_PROMPTS } from '@/lib/starter-prompts'

/**
 * Phones only: Ask Titus in the hero, under the buttons. On a phone the front page's Ask Titus door sits six
 * screens down, past where most visitors stop; this puts two of its questions on the first screen.
 * Hidden from 900px, where the door is close enough and the hero has the logo animation beside it.
 */
export default function HeroAsk() {
  return (
    <div className="mt-7 rounded-[20px] bg-paper-deep px-4 pb-4 pt-3.5 min-[900px]:hidden">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 flex items-center font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink">
          <span aria-hidden="true" className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber" />
          Ask Titus
        </p>
        <Link href={COLOPHON_PATH} className="tap font-mono text-[11px] text-ink-soft underline decoration-dotted underline-offset-[3px]">
          How it works
        </Link>
      </div>
      <p className="mb-3 mt-1.5 font-serif text-[17px] italic leading-[1.35] text-ink-soft">
        Ask me anything about my work. Answers come from this site and my articles, with sources.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 font-serif text-[16px] leading-[1.35]">
        {STARTER_PROMPTS.slice(0, 2).map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => openCopilot('chat', p)}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-2.5 text-left italic transition-colors hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              {p}
              <span aria-hidden="true" className="shrink-0 font-mono text-[11px] not-italic text-amber">
                ask →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
