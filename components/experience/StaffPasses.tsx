'use client'

import type { KeyboardEvent } from 'react'

export type Pass = {
  slug: string
  short: string
  role: string
  from: string
  /** Null while it's the current role. */
  to: string | null
  brand: { color: string; logo: string }
  /** What the bottom of a picked-up pass shows: the role's highlight, or how long it lasted. */
  bottom: { figure: string; caption: string } | null
}

const PASS_W = 220

/** How many logo-and-name repeats each strap carries: enough to run past the top of the desk. */
const PRINTS = 6

/** One side of the lanyard: the company's colour, printed with its logo and short name, over and over. */
function Strap({ pass, side }: { pass: Pass; side: 'left' | 'right' }) {
  return (
    <span
      className={`absolute bottom-0 flex h-[calc(100%+20px)] w-[22px] flex-col-reverse items-center gap-2.5 overflow-hidden rounded-t-[3px] bg-[var(--brand)] pb-5 shadow-[inset_0_0_0_1px_oklch(0_0_0/0.12)] ${
        side === 'left' ? 'right-1/2 origin-bottom-right -rotate-[13deg]' : 'left-1/2 origin-bottom-left rotate-[13deg]'
      }`}
    >
      {Array.from({ length: PRINTS }, (_, i) => (
        <span key={i} className="flex flex-none flex-col items-center gap-2.5">
          <span className="grid h-4 w-4 place-items-center overflow-hidden rounded-[4px] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logos; images are unoptimised site-wide */}
            <img src={`/logos/companies/${pass.brand.logo}`} alt="" className="block max-h-3 max-w-3.5" />
          </span>
          <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.18em] text-paper [writing-mode:vertical-rl]">{pass.short}</span>
        </span>
      ))}
    </span>
  )
}

/** The lanyard a picked-up pass hangs from: two straps in a V, clipped to the pass's slot, fading out above the desk. */
function Lanyard({ pass, height }: { pass: Pass; height: number }) {
  return (
    <span aria-hidden="true" className="lanyard pointer-events-none absolute left-[calc(50%-60px)] z-[4] w-[120px]" style={{ bottom: 'calc(100% - 20px)', height }}>
      <span className="lanyard-straps absolute inset-0">
        <Strap pass={pass} side="left" />
        <Strap pass={pass} side="right" />
      </span>
      <span className="absolute bottom-[-4px] left-1/2 h-[16px] w-[30px] -translate-x-1/2 rounded-[4px] bg-[linear-gradient(180deg,oklch(0.9_0.005_80),oklch(0.66_0.01_80))] shadow-[0_1px_2px_oklch(0_0_0/0.3)]" />
    </span>
  )
}

/** The fan's tilt and drop for pass i of n: the middle pass sits level, the outer ones lean out and down. */
export function fanPose(i: number, n: number): { rot: number; top: number; leftPct: number; leftPx: number } {
  const k = i - (n - 1) / 2
  const t = n > 1 ? i / (n - 1) : 0.5
  return { rot: k * 4.2, top: 40 + Math.abs(k) * k * 1.2 + Math.abs(k) * 6, leftPct: t * 100, leftPx: t * PASS_W }
}

/**
 * Every staff pass I've worn, fanned out oldest-left on a desk. Picking one up lifts it, rings it in its
 * company's colour and swaps its dates for its highlight. Which pass is picked is up to the parent (PassDesk).
 */
export default function StaffPasses({
  passes,
  name,
  picked,
  onPick,
  footer,
}: {
  passes: Pass[]
  name: { preferred: string; full: string }
  picked: string | null
  onPick: (slug: string) => void
  /** Sits under the desk, on the right: PassDesk's "Show all roles" switch. */
  footer?: React.ReactNode
}) {
  const onKey = (e: KeyboardEvent) => {
    const i = passes.findIndex((p) => p.slug === picked)
    const next = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : -2
    if (next === -2) return
    e.preventDefault()
    if (passes[next]) {
      onPick(passes[next].slug)
      document.getElementById(`pass-${passes[next].slug}`)?.focus()
    }
  }

  return (
    <div className="mb-2 rounded-[28px] bg-paper-deep px-[26px] pb-6 pt-[26px] max-[820px]:px-4">
      <p className="m-0 flex flex-wrap justify-between gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
        <span>
          <b className="font-semibold text-ink">{passes.length} staff passes</b> · oldest on the left
        </span>
        <span>Pick one up to read about it</span>
      </p>
      <div
        role="tablist"
        aria-label="One staff pass per role"
        onKeyDown={onKey}
        className="relative mx-[46px] mt-8 h-[410px] max-[820px]:-mx-4 max-[820px]:flex max-[820px]:h-auto max-[820px]:snap-x max-[820px]:snap-mandatory max-[820px]:gap-3.5 max-[820px]:overflow-x-auto max-[820px]:px-4 max-[820px]:pb-2.5 max-[820px]:pt-16"
      >
        {passes.map((p, i) => {
          const pose = fanPose(i, passes.length)
          const on = picked === p.slug
          return (
            <button
              key={p.slug}
              id={`pass-${p.slug}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`role-${p.slug}`}
              tabIndex={on ? 0 : -1}
              aria-label={`${p.short}, ${p.role}, ${p.from} to ${p.to ?? 'present'}`}
              onClick={() => onPick(p.slug)}
              className="staff-pass absolute h-[320px] w-[220px] border-0 bg-transparent p-0 text-left font-serif focus-visible:outline-none max-[820px]:relative max-[820px]:!left-auto max-[820px]:!top-0 max-[820px]:flex-none max-[820px]:snap-center"
              style={
                {
                  '--rot': on ? '0deg' : `${pose.rot}deg`,
                  '--brand': p.brand.color,
                  left: `calc(${pose.leftPct}% - ${pose.leftPx}px)`,
                  top: pose.top,
                  zIndex: on ? 20 : i + 1,
                } as React.CSSProperties
              }
            >
              {on && <Lanyard pass={p} height={pose.top + 50} />}
              <span className="staff-pass-face absolute inset-0 flex flex-col overflow-hidden rounded-[18px] border-[3px] border-[var(--brand)] bg-paper shadow-[0_1px_0_oklch(0_0_0/0.06),0_10px_26px_oklch(0.3_0.03_60/0.16)]">
                <span aria-hidden="true" className="absolute left-1/2 top-3 z-[2] h-[9px] w-[52px] -translate-x-1/2 rounded-[5px] bg-paper-deep shadow-[inset_0_1px_2px_oklch(0_0_0/0.18)]" />
                {!p.to && (
                  <span className="absolute right-2.5 top-[9px] z-[3] rounded-full bg-paper px-2 py-1 font-mono text-[9.5px] font-semibold tracking-[0.16em] text-amber">CURRENT</span>
                )}
                <span className="flex h-[100px] items-center gap-[9px] bg-[var(--brand)] px-4 pt-3 text-paper">
                  <span className="grid h-[30px] w-[30px] flex-none place-items-center overflow-hidden rounded-lg bg-white shadow-[0_0_0_1.5px_oklch(1_0_0/0.6)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logos; images are unoptimised site-wide */}
                    <img src={`/logos/companies/${p.brand.logo}`} alt="" className="block max-h-[22px] max-w-[26px]" />
                  </span>
                  <span>
                    <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">{p.short}</span>
                    <span className="mt-1 block font-mono text-[10px] tracking-[0.12em] opacity-75">STAFF</span>
                  </span>
                </span>
                <span className="-mt-[22px] flex items-center gap-3 px-4">
                  <span aria-hidden="true" className="grid h-[70px] w-[58px] flex-none place-items-center rounded-lg border-[3px] border-paper bg-ink font-serif text-[24px] font-medium italic text-amber-hi">
                    T·L
                  </span>
                  <span className="mt-[22px] font-serif text-[16px] font-medium leading-[1.2] text-ink">
                    {name.preferred}
                    <span className="mt-[3px] block font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-soft">{name.full}</span>
                  </span>
                </span>
                <span className="mt-3 px-4 font-serif text-[18px] font-medium leading-[1.15] tracking-[-0.01em] text-ink">{p.role}</span>
                {on && p.bottom ? (
                  <span className="mx-2.5 mb-2.5 mt-auto rounded-xl bg-ink px-3 py-2.5 text-paper">
                    <span className={`block font-serif font-medium leading-none tracking-[-0.03em] text-amber-hi ${/^\D*\d/.test(p.bottom.figure) ? 'text-[30px]' : 'text-[22px]'}`}>
                      {p.bottom.figure}
                    </span>
                    <span className="mt-[5px] block font-mono text-[10.5px] leading-[1.35] text-[oklch(0.85_0.02_78)]">{p.bottom.caption}</span>
                  </span>
                ) : (
                  <>
                    <span className="mt-auto px-4 font-mono text-[10.5px] leading-[1.5] tracking-[0.04em] text-ink-soft">
                      Valid from <b className="font-medium text-ink">{p.from}</b>
                      <br />
                      {p.to ? (
                        <>
                          to <b className="font-medium text-ink">{p.to}</b>
                        </>
                      ) : (
                        <b className="font-medium text-ink">to present</b>
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mx-4 mb-3.5 mt-2.5 h-[26px] bg-[repeating-linear-gradient(90deg,var(--ink)_0_2px,transparent_2px_4px,var(--ink)_4px_5px,transparent_5px_8px,var(--ink)_8px_11px,transparent_11px_13px)] opacity-80"
                    />
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 font-mono text-[12px] text-ink-faint max-[820px]:hidden">Click a pass to pick it up. ← → move along.</p>
        {footer}
      </div>
    </div>
  )
}
