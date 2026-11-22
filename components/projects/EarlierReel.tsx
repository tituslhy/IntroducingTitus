'use client'

import { useState, type ReactNode } from 'react'
import Projector from '@/components/projects/Projector'
import { ITEM, SIDE_LABEL, SIDE_TITLE } from '@/components/projects/layout'
import type { EarlierProject } from '@/lib/profile'

const pad = (n: number) => String(n).padStart(2, '0')

/** Earlier work on one projector: its pictures play by themselves, and the one on screen is written up beside it. */
export default function EarlierReel({ projects, footer }: { projects: EarlierProject[]; footer?: ReactNode }) {
  const [at, setAt] = useState(0)
  const e = projects[at]
  const frames = projects.map((p) => ({
    caption: p.title,
    node: (
      // eslint-disable-next-line @next/next/no-img-element -- images are unoptimised site-wide; these stay on GitHub
      <img src={p.image} alt={p.title} loading="lazy" className={`block h-full w-full object-contain ${p.fit === 'contain' ? 'bg-white' : 'bg-black'}`} />
    ),
    thumb: (
      // eslint-disable-next-line @next/next/no-img-element -- as above
      <img src={p.image} alt="" loading="lazy" className="block h-full w-full object-cover" />
    ),
  }))

  return (
    // Name, then the write-up, on the left; the projector on the right. On phones: name, projector, write-up.
    <section id="earlier-work" aria-labelledby="earlier-work-title" className={`${ITEM} grid-rows-[auto_1fr] gap-y-6`}>
      <div className="col-start-1 row-start-1">
        <p className={`${SIDE_LABEL} text-latte-accent`}>Before GenAI</p>
        <h3 id="earlier-work-title" className={SIDE_TITLE}>
          Earlier work
        </h3>
      </div>
      <div className="col-start-1 row-start-2 max-[820px]:row-start-3">
        <div key={at} className="earlier-info border-t border-rule pt-5">
          <p className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-latte-accent">
            Frame {pad(at + 1)} of {pad(projects.length)} · {e.topics.join(' · ')}
          </p>
          <h4 className="m-0 mt-2 font-serif text-[24px] font-medium leading-[1.15] tracking-[-0.015em] text-ink">{e.title}</h4>
          {e.result && (
            <p className="m-0 mt-3 font-serif text-[30px] font-medium leading-none tracking-[-0.025em] text-latte-accent">
              {e.result.value}
              <small className="ml-2 font-mono text-[11.5px] tracking-normal text-latte-soft">{e.result.label}</small>
            </p>
          )}
          <p className="m-0 mt-2.5 font-serif text-[17px] leading-[1.45] text-ink">{e.blurb}</p>
          <a
            href={e.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${e.title} on GitHub`}
            className="mt-4 inline-block rounded-full border border-latte-accent px-3 py-1.5 font-mono text-[12px] text-latte-accent transition-colors hover:bg-latte-accent hover:text-paper"
          >
            GitHub ↗
          </a>
        </div>
      </div>
      <div className="col-start-2 row-span-2 row-start-1 min-w-0 max-[820px]:col-start-1 max-[820px]:row-span-1 max-[820px]:row-start-2">
        <Projector label="Earlier work" frames={frames} onFrame={setAt} />
        {footer}
      </div>
    </section>
  )
}
