import Link from 'next/link'
import CountUp from '@/components/tiles/CountUp'
import DownButton from './DownButton'
import TourButton from './TourButton'
import { FRONT_STATS } from '@/lib/front-page'
import { SOCIAL } from '@/lib/profile'

/** One small dark tile: a figure that counts up, what it counts, and where to see it. */
function StatTile({ figure, label, href, external }: { figure: string; label: string; href: string; external?: boolean }) {
  const cls =
    'glow-tile group flex flex-col justify-between rounded-[20px] bg-ink px-5 pb-4 pt-[18px] text-paper transition-transform motion-safe:hover:-translate-y-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber'
  const body = (
    <>
      <span className="block font-serif text-[clamp(34px,3.4vw,46px)] font-medium leading-none tracking-[-0.03em] text-amber-hi">
        <CountUp figure={figure} />
      </span>
      <span className="mt-3 flex items-end justify-between gap-2 font-mono text-[11.5px] leading-[1.4] text-[oklch(0.85_0.02_78)]">
        {label}
        <span aria-hidden="true" className="text-amber-hi transition-transform group-hover:translate-x-0.5">
          {external ? '↗' : '→'}
        </span>
      </span>
    </>
  )
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  )
}

/** The sentence under the hero, with its numbers pulled out as tiles beside it. Every number comes from data (lib/front-page.ts). */
export default function OpeningLine() {
  const { years, yearsWord, articles, repos, contributions } = FRONT_STATS
  return (
    <div className="relative mx-auto max-w-[1280px] px-4 min-[900px]:-mt-4 min-[900px]:px-16">
      <div className="grid items-center gap-x-12 gap-y-6 pt-8 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,420px)] min-[900px]:pt-0">
        <p className="m-0 font-serif text-[24px] leading-[1.32] tracking-[-0.015em] min-[900px]:text-[34px]">
          {yearsWord} years putting AI into production. {articles} articles explaining how it works. {repos} public repos, and{' '}
          {contributions} contributions back to the open-source tools I build with.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <StatTile figure={`${years}+`} label="years in production AI" href="/experience" />
          <StatTile figure={String(articles)} label="technical articles" href="/writing" />
          <StatTile figure={String(repos)} label="public repos" href={SOCIAL.github} external />
          <StatTile figure={String(contributions)} label="open-source contributions" href="/projects#open-source" />
        </div>
      </div>
      <TourButton variant="line" />
      <div className="flex justify-center">
        <DownButton targetId="on-this-site" />
      </div>
    </div>
  )
}
