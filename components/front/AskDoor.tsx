'use client'

import Link from 'next/link'
import { COLOPHON_PATH } from '@/lib/content'
import { openCopilot } from '@/lib/copilot-events'
import { ASK_FOLIO } from '@/lib/profile'
import { STARTER_PROMPTS } from '@/lib/starter-prompts'
import { DOOR_BOX } from './door-box'

/**
 * The last door on the front page. The heading goes to the colophon (how Ask Titus works);
 * each prompt opens the drawer and asks that question. Not one big link, because it holds buttons.
 */
export default function AskDoor() {
  return (
    <div
      id="ask"
      className={DOOR_BOX}
    >
      <div className="font-mono text-[11px] tracking-[0.1em] text-ink-faint">{ASK_FOLIO}</div>
      <Link
        href={COLOPHON_PATH}
        className="group inline-block focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        <h3 id="ask-heading" className="my-1.5 flex items-baseline gap-3 font-serif text-[30px] font-medium leading-[1.2] tracking-[-0.02em] min-[900px]:text-[34px]">
          Ask Titus
          <span aria-hidden="true" className="font-mono text-[16px] text-amber transition-transform duration-200 group-hover:translate-x-1.5">
            →
          </span>
        </h3>
      </Link>
      <p className="mb-3 mt-0 font-serif text-[19px] italic leading-[1.3] text-ink-soft">
        Ask me anything about my work. Answers come from this site and my articles, with sources.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 font-serif text-[16.5px] leading-[1.35]">
        {STARTER_PROMPTS.slice(0, 3).map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => openCopilot('chat', p)}
              className="flex w-full items-baseline justify-between gap-3 rounded-2xl bg-paper px-4 py-3 text-left italic transition-colors hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
            >
              {p}
              <span aria-hidden="true" className="font-mono text-[11px] not-italic text-amber">
                ask →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
