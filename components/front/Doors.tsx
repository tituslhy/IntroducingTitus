import Link from 'next/link'
import AskDoor from './AskDoor'
import { DOOR_BOX } from './door-box'
import RiseIn from '@/components/tiles/RiseIn'
import { ARTICLE_COUNT_NUMBER } from '@/lib/content'
import { educationDoor, educationResults } from '@/lib/education'
import { experienceResults } from '@/lib/experience'
import { aboutBio, experienceDoor, projectsDoor, themeCounts, type DoorRow } from '@/lib/front-page'
import { FEATURED_BY, pageFolio } from '@/lib/profile'

const mono = 'font-mono'

function Door({ href, folio, title, deck, children }: { href: string; folio: string; title: string; deck: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`${DOOR_BOX} focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber`}
    >
      <div className={`${mono} text-[11px] tracking-[0.1em] text-ink-faint`}>{folio}</div>
      <h3 className="my-1.5 flex items-baseline gap-3 font-serif text-[30px] font-medium leading-[1.2] tracking-[-0.02em] min-[900px]:text-[34px]">
        {title}
        <span aria-hidden="true" className={`${mono} text-[16px] text-amber transition-transform duration-200 group-hover:translate-x-1.5`}>
          →
        </span>
      </h3>
      <p className="mb-4 mt-0 font-serif text-[19px] italic leading-[1.3] text-ink-soft">{deck}</p>
      {children}
    </Link>
  )
}

/** A door's headline: a small dark tile with the page's lead figure, counting up like the page's own. */
function MiniTile({ figure, label }: { figure: string; label: string }) {
  return (
    <div className="glow-tile mb-4 flex items-baseline gap-4 rounded-[20px] bg-ink px-5 py-4 text-paper">
      <span className="whitespace-nowrap font-serif text-[clamp(34px,3.4vw,44px)] font-medium leading-none tracking-[-0.03em] text-amber-hi">
        <RiseIn figure={figure} />
      </span>
      <span className={`${mono} text-[11.5px] leading-[1.45] text-[oklch(0.85_0.02_78)]`}>{label}</span>
    </div>
  )
}

function Rows({ rows }: { rows: DoorRow[] }) {
  return (
    <ul className="m-0 list-none p-0 font-serif text-[16.5px] leading-[1.35]">
      {rows.map((r) => (
        <li key={r.text} className="grid grid-cols-[52px_1fr_auto] items-baseline gap-3 py-[7px] min-[900px]:grid-cols-[64px_1fr_auto]">
          <span className={`${mono} text-[11.5px] text-ink-faint`}>{r.lead}</span>
          <span>{r.text}</span>
          <span className={`${mono} text-right text-[11px] ${r.current ? 'text-amber' : 'text-ink-soft'}`}>{r.end}</span>
        </li>
      ))}
    </ul>
  )
}

/** "On this site": a door to each page, with a short preview built from the same data the page renders. */
export default function Doors() {
  const exp = experienceDoor()
  const [years] = experienceResults()
  const [eduLead] = educationResults()
  return (
    <section id="ways" aria-labelledby="on-this-site" className="mx-auto max-w-[1280px] px-4 pt-16 min-[900px]:px-16">
      <h2 id="on-this-site" className={`mb-3.5 mt-0 scroll-mt-20 ${mono} text-[11px] font-normal uppercase tracking-[0.16em] text-amber`}>
        On this site
      </h2>
      <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
        <Door href="/experience" folio={pageFolio('/experience')} title="Experience" deck={exp.deck}>
          {years && <MiniTile figure={years.figure} label={years.label} />}
          <Rows rows={exp.rows} />
        </Door>
        <Door href="/education" folio={pageFolio('/education')} title="Education" deck="Degrees, an exchange, a summer and a winter school, with the honours.">
          {eduLead && <MiniTile figure={eduLead.figure} label={eduLead.label} />}
          <Rows rows={educationDoor()} />
        </Door>
        <Door href="/projects" folio={pageFolio('/projects')} title="Projects" deck="Selected projects: at work, in public, and for fun.">
          <Rows rows={projectsDoor()} />
        </Door>
        <Door href="/writing" folio={pageFolio('/writing')} title="Writing" deck="Technical articles on Medium, grouped by theme.">
          <MiniTile figure={String(ARTICLE_COUNT_NUMBER)} label="technical articles on Medium" />
          <div className="flex flex-wrap gap-2">
            {themeCounts().map((t) => (
              <span key={t.id} className={`${mono} rounded-full bg-paper px-3 py-1.5 text-[11.5px] text-ink-soft`}>
                {t.name}
                <b className="ml-1.5 font-medium text-ink">{t.count}</b>
              </span>
            ))}
          </div>
        </Door>
        <Door href="/about" folio={pageFolio('/about')} title="About" deck="Chemical engineer turned AI engineer.">
          <p className="mb-2.5 mt-0 max-w-[520px] font-serif text-[17px] leading-[1.5]">{aboutBio()}</p>
          <div className={`${mono} text-[11px] leading-[1.9] tracking-[0.06em] text-ink-soft`}>
            <b className="mr-2 font-normal uppercase tracking-[0.14em] text-ink-faint">Featured by</b>
            {FEATURED_BY.join(' · ')}
          </div>
        </Door>
        <AskDoor />
      </div>
    </section>
  )
}
