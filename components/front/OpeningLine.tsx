import DownButton from './DownButton'
import { FRONT_STATS } from '@/lib/front-page'

const n = 'font-normal text-amber'

/** The sentence under the hero. Every number comes from data (lib/front-page.ts). */
export default function OpeningLine() {
  const { yearsWord, articles, repos, contributions } = FRONT_STATS
  return (
    <div className="relative mx-auto max-w-[1280px] px-4 min-[900px]:-mt-4 min-[900px]:px-16">
      <p className="m-0 max-w-[980px] pt-8 min-[900px]:pt-0 font-serif text-[24px] leading-[1.32] tracking-[-0.015em] min-[900px]:text-[34px]">
        {yearsWord} years putting AI into production. <b className={n}>{articles}</b> articles explaining how it works.{' '}
        <b className={n}>{repos}</b> public repos, and <b className={n}>{contributions}</b> contributions back to the
        open-source tools I build with.
      </p>
      <div className="flex max-w-[980px] justify-center">
        <DownButton targetId="on-this-site" />
      </div>
    </div>
  )
}
