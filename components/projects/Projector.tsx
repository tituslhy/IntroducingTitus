'use client'

import { createContext, Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { REVEAL_EVENT } from '@/lib/reveal'

export type ProjectorFrame = {
  /** What shows on the screen. */
  node: ReactNode
  /** The small picture or words on the film strip under the screen. */
  thumb: ReactNode
  caption: string
  /** How long it stays up while playing, in ms. */
  ms?: number
}

/** Anything inside a frame (the demo video, say) can stop the projector by dispatching this. */
export const PROJECTOR_PAUSE = 'projector-pause'
export const DEFAULT_MS = 3500

/**
 * False once the visitor presses Pause, until they press Play. A moving frame (LoopFrame) stops with it.
 * Hovering or picking a frame only stops the projector moving on, so a picked video still plays.
 */
export const ProjectorMotion = createContext(true)

const REDUCE = '(prefers-reduced-motion: reduce)'
const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
const subscribeReduce = (cb: () => void) => {
  if (!canMatch()) return () => {}
  const m = window.matchMedia(REDUCE)
  m.addEventListener?.('change', cb)
  return () => m.removeEventListener?.('change', cb)
}
const prefersReduce = () => canMatch() && window.matchMedia(REDUCE).matches

/**
 * A screen over a strip of film. While at least half of it is on screen it plays its frames by itself,
 * one after another, and loops; hovering with a mouse holds the frame, and picking a frame or pressing
 * Pause stops it. It starts paused for people who ask for reduced motion.
 * Frames off screen are `hidden`, so the results row and Ask Titus can ask for one through lib/reveal.
 */
export default function Projector({
  label,
  frames,
  tall = false,
  fit = false,
  onFrame,
}: {
  /** Names the projector for screen readers, e.g. "fictional-bassoon". */
  label: string
  frames: ProjectorFrame[]
  /** A taller screen on phones, for diagrams that run top to bottom there. */
  tall?: boolean
  /** More height when the projector is narrow, for a diagram that stacks there (fictional-bassoon's architecture). */
  fit?: boolean
  onFrame?: (i: number) => void
}) {
  const [at, setAt] = useState(0)
  // Plays unless the visitor asked for less motion (paused on the server), until they say otherwise.
  const reduce = useSyncExternalStore(subscribeReduce, prefersReduce, () => true)
  const [choice, setChoice] = useState<boolean | null>(null)
  const playing = choice ?? !reduce
  const setPlaying = (on: boolean) => setChoice(on)
  const [seen, setSeen] = useState(false)
  const [held, setHeld] = useState(false)
  const [halted, setHalted] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)

  // Only plays while it's on screen.
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // A frame asked for from outside (lib/reveal), or a pause from inside a frame.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const onReveal = (e: Event) => {
      const i = Number((e as CustomEvent<string>).detail)
      if (Number.isInteger(i) && i >= 0 && i < frames.length) {
        setPlaying(false)
        setAt(i)
      }
    }
    const onPause = () => setPlaying(false)
    el.addEventListener(REVEAL_EVENT, onReveal)
    el.addEventListener(PROJECTOR_PAUSE, onPause)
    return () => {
      el.removeEventListener(REVEAL_EVENT, onReveal)
      el.removeEventListener(PROJECTOR_PAUSE, onPause)
    }
  }, [frames.length])

  // Keep the current frame's thumbnail in view on the strip, without scrolling the page.
  useEffect(() => {
    onFrame?.(at)
    const s = strip.current
    const th = s?.children[at] as HTMLElement | undefined
    if (s && th && typeof s.scrollTo === 'function') s.scrollTo({ left: th.offsetLeft - s.clientWidth / 2 + th.clientWidth / 2, behavior: 'smooth' })
  }, [at, onFrame])

  const pick = (i: number) => {
    setPlaying(false)
    setAt(i)
  }
  const running = playing && seen && !held && frames.length > 1
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div
      ref={root}
      role="group"
      aria-roledescription="projector"
      aria-label={label}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      className="projector rounded-[20px] bg-[var(--film-edge)] px-3 pt-3"
    >
      <div
        className={`projector-screen relative aspect-video overflow-hidden rounded-xl bg-black ${tall ? 'projector-tall' : ''} ${fit ? 'projector-fit' : ''}`}
      >
        {frames.map((f, i) => (
          <div key={i} data-reveal={i} hidden={i !== at} className="projector-frame absolute inset-0">
            <ProjectorMotion.Provider value={!halted}>{f.node}</ProjectorMotion.Provider>
          </div>
        ))}
      </div>

      <div ref={strip} className="projector-strip">
        {frames.map((f, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Frame ${i + 1}: ${f.caption}`}
            aria-current={i === at ? 'true' : undefined}
            onClick={() => pick(i)}
            className="projector-thumb"
          >
            {/* Keyed: a thumb made on the server sits beside the bar, and React checks keys on it. */}
            <Fragment key="thumb">{f.thumb}</Fragment>
            {i === at && (
              <span
                key={at}
                className="projector-bar"
                style={{ animationDuration: `${f.ms ?? DEFAULT_MS}ms`, animationPlayState: running ? 'running' : 'paused' }}
                onAnimationEnd={() => running && setAt((n) => (n + 1) % frames.length)}
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 px-1 pb-3.5 font-mono text-[12px] leading-[1.4] text-[oklch(0.78_0.02_70)]">
        <p className="m-0 flex-1">
          <b className="font-medium text-amber-hi">
            {pad(at + 1)}/{pad(frames.length)}
          </b>{' '}
          · {frames[at].caption}
        </p>
        {frames.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setPlaying(!playing)
              setHalted(playing)
            }}
            className="shrink-0 rounded-full border border-[oklch(0.5_0.02_70)] px-3 py-[5px] font-mono text-[12px] text-paper transition-colors hover:border-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
        )}
      </div>
    </div>
  )
}
