'use client'

import { openCopilot } from '@/lib/copilot-events'

/** Opens the Ask Titus drawer straight into recruiter mode. */
export default function RecruiterModeButton() {
  return (
    <button
      type="button"
      onClick={() => openCopilot('fit')}
      className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2.5 font-mono text-[11.5px] uppercase tracking-[0.1em] text-paper transition-colors hover:border-amber hover:bg-amber"
    >
      Check a role against my record <span aria-hidden="true">→</span>
    </button>
  )
}
