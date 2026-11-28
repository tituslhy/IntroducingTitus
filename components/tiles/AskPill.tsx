'use client'

import type { AskPrompt } from '@/lib/profile'
import { openCopilot } from '@/lib/copilot-events'

/** "Ask about Oxford →": opens the Ask Titus drawer and asks that item's question. `text` replaces the "Ask about {label}" wording. */
export default function AskPill({ ask, tone = 'paper', text }: { ask: AskPrompt; tone?: 'paper' | 'latte'; text?: string }) {
  const colours =
    tone === 'latte'
      ? 'border-latte-accent px-[13px] py-[7px] text-[12px] text-latte-accent hover:bg-latte-accent hover:text-paper'
      : 'border-ink px-4 py-[9px] text-[13px] text-ink hover:bg-ink hover:text-paper'
  return (
    <button
      type="button"
      onClick={() => openCopilot('chat', ask.question)}
      className={`group mt-[18px] inline-flex items-center gap-2 whitespace-nowrap rounded-full border bg-transparent font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${colours}`}
    >
      {text ?? `Ask about ${ask.label}`}
      <span aria-hidden="true" className={tone === 'latte' ? '' : 'font-semibold text-amber group-hover:text-amber-hi'}>
        →
      </span>
    </button>
  )
}
