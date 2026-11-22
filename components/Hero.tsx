import Image from 'next/image'
import Link from 'next/link'
import HeroAnimation from '@/components/front/HeroAnimation'
import { KEEP_OUT_ATTR } from '@/lib/hero-keepout'
import { CURRENT_ROLE, SOCIAL } from '@/lib/profile'

const keep = (v = 'true') => ({ [KEEP_OUT_ATTR]: v })

const socialClass = 'text-ink-soft transition-colors hover:text-ink'

/**
 * The front page's hero. The text and photo render on the server; the logo
 * animation draws behind and around them (beside them from 900px, in its own
 * band below the photo on phones) and keeps clear of every KEEP_OUT_ATTR box.
 */
export default function Hero() {
  return (
    <section
      id="masthead"
      data-hero-stage
      className="relative mx-auto max-w-[1280px] overflow-hidden px-4 pt-9 text-ink min-[900px]:h-[600px] min-[900px]:p-0"
    >
      <div className="relative z-[3] min-[900px]:absolute min-[900px]:left-16 min-[900px]:right-[calc(clamp(270px,30vw,390px)+104px)] min-[900px]:top-16">
        <p {...keep()} className="inline-flex items-center font-mono text-[clamp(10.5px,1.5vw,12.5px)] uppercase tracking-[0.16em] text-ink-faint min-[900px]:text-[10.5px]">
          <span aria-hidden="true" className="mr-[9px] inline-block h-1.5 w-1.5 rounded-full bg-amber" />
          {CURRENT_ROLE.role} · {CURRENT_ROLE.company} · {CURRENT_ROLE.location}
        </p>
        <h1
          {...keep('name')}
          className="mb-4 mt-3.5 w-fit font-serif text-[clamp(40px,6.4vw,58px)] font-medium min-[900px]:text-[clamp(40px,5vw,64px)] leading-[0.95] tracking-[-0.035em]"
        >
          Lim Hsien Yong <em className="font-normal italic text-amber">(Titus)</em>
        </h1>
        <p {...keep()} className="w-fit font-serif text-[clamp(20px,3vw,26px)] leading-[1.3] min-[900px]:text-[24px]">
          I build AI systems — <i className="text-amber">from architecture to the boardroom.</i>
        </p>
        <div {...keep()} className="mt-[26px] flex w-fit flex-wrap items-center gap-x-3 gap-y-3 font-mono text-[clamp(12.5px,1.7vw,15px)] min-[900px]:text-[12.5px]">
          <Link href="/experience" className="bg-ink px-4 py-[11px] text-paper transition-colors hover:bg-amber">
            View experience <b className="font-medium text-amber-line">→</b>
          </Link>
          <Link href="/writing" className="border border-ink px-[15px] py-[10px] transition-colors hover:bg-ink hover:text-paper">
            Read the writing <b className="font-medium text-amber">→</b>
          </Link>
          <span className="flex items-center gap-3 min-[900px]:ml-2.5">
            <a href={SOCIAL.github} target="_blank" rel="noopener noreferrer" className={socialClass}>
              GitHub
            </a>
            <a href={SOCIAL.linkedin} target="_blank" rel="noopener noreferrer" className={socialClass}>
              LinkedIn
            </a>
            <a href={SOCIAL.medium} target="_blank" rel="noopener noreferrer" className={socialClass}>
              Medium
            </a>
          </span>
        </div>
        <a
          {...keep()}
          href={`mailto:${SOCIAL.email}?subject=Resume Request`}
          className="mt-3 block w-fit font-mono text-[clamp(11px,1.5vw,13px)] text-ink-faint min-[900px]:text-[11px] transition-colors hover:text-ink"
        >
          Resume available <u className="decoration-amber underline-offset-[3px]">on request</u>
        </a>
      </div>

      <figure
        {...keep('photo')}
        className="relative z-[3] mx-auto mb-0 mt-8 aspect-[3/4] w-[min(75vw,clamp(300px,48vw,420px))] border border-ink bg-paper-deep min-[900px]:absolute min-[900px]:right-12 min-[900px]:top-10 min-[900px]:mt-0 min-[900px]:w-[clamp(270px,30vw,390px)]"
      >
        <Image
          src="/headshot.jpeg"
          alt="Portrait of Titus Lim"
          fill
          priority
          sizes="(max-width: 899px) 300px, 390px"
          className="object-cover"
          style={{ objectPosition: '50% 30%', filter: 'saturate(0.85) contrast(1.04)' }}
        />
      </figure>

      <HeroAnimation className="relative mt-6 h-[380px] min-[900px]:absolute min-[900px]:inset-0 min-[900px]:mt-0 min-[900px]:h-auto" />
    </section>
  )
}
