import RiseIn from '@/components/tiles/RiseIn'

type HeroTileProps = {
  figure: string
  caption: string
  /** A short label in the top-right corner, e.g. "Dean's List". */
  note?: string
  /** Lets a result in the results row ring this tile. */
  dataTech?: string
  /** Lets a result in the results row ring the corner note. */
  noteTech?: string
  /** Indigo is for the Illumina project on Projects only. */
  tone?: 'amber' | 'indigo'
}

/** The dark headline tile: one per item, its figure huge in amber over a slow glow. */
export default function HeroTile({ figure, caption, note, dataTech, noteTech, tone = 'amber' }: HeroTileProps) {
  // Words ("2nd Upper", "Tech lead") run longer than numbers, so they're set a size down.
  const size = /^\D*\d/.test(figure) && figure.length <= 6 ? 'text-[clamp(56px,8vw,104px)]' : 'text-[clamp(44px,6vw,80px)]'
  return (
    <div
      data-tech={dataTech}
      className={`glow-tile ${tone === 'indigo' ? 'glow-tile-indigo ' : ''}flex min-h-[220px] flex-col justify-end rounded-[28px] bg-ink px-10 pb-[34px] pt-10 text-paper max-[820px]:min-h-[180px] max-[820px]:px-6 max-[820px]:pb-6 max-[820px]:pt-7`}
    >
      {note && (
        <span data-tech={noteTech} className="absolute right-7 top-[26px] rounded-full border border-[oklch(1_0_0/0.3)] px-3 py-1.5 font-mono text-[12px] max-[820px]:right-[18px] max-[820px]:top-[18px]">
          {note}
        </span>
      )}
      <span className={`font-serif font-medium leading-[0.95] tracking-[-0.04em] ${tone === 'indigo' ? 'text-[oklch(0.82_0.08_254)]' : 'text-amber-hi'} ${size}`}>
        <RiseIn figure={figure} />
      </span>
      <span className="mt-3 font-serif text-[22px] italic leading-[1.3] text-[oklch(0.88_0.02_78)]">{caption}</span>
    </div>
  )
}
