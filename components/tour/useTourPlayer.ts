'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { groupStops, type Stop, type StopTarget } from '@/lib/page-stops'
import { DRAWER_TARGET_IDS, stepDurationMs, type SiteTour, type TourStep } from '@/lib/site-tour'

export type TourStatus = 'idle' | 'playing' | 'paused' | 'done'

/** Most time between two things one step shows (two passes, then "show all"). */
const MAX_ACTION_GAP_MS = 2000

type Action = { kind: 'ring'; id: string } | { kind: 'stop'; stop: Stop }

const isDrawerId = (id: string) => (DRAWER_TARGET_IDS as readonly string[]).includes(id)

/** What a step does, in order: drawer rings first, then the page stops (tool tiles grouped as one). */
function actionsOf(step: TourStep, byId: Map<string, StopTarget>): Action[] {
  const rings: Action[] = step.targets.filter(isDrawerId).map((id) => ({ kind: 'ring', id }))
  const stops: Action[] = groupStops(step.targets.filter((t) => !isDrawerId(t)), byId).map((stop) => ({ kind: 'stop', stop }))
  return [...rings, ...stops]
}

/**
 * Plays a recorded tour: each step's narration stays up for stepDurationMs while its targets run in order.
 * Scrolling, tapping or typing outside the tour's own controls (anything inside `[data-tour-ui]`) pauses it;
 * leaving for a page the step didn't open stops it without a word. After the last step (or ✕) it's "done".
 */
export function useTourPlayer({
  tour,
  showStop,
  ringDrawer,
  pathname,
  targetsById,
}: {
  tour: SiteTour
  /** Shows one stop (opens its page if needed, reveals, scrolls, spotlights); false when it never appeared. */
  showStop: (stop: Stop) => Promise<boolean>
  /** Spotlights a drawer element by id, without scrolling the page. */
  ringDrawer: (id: string) => void
  pathname: string
  targetsById: Map<string, StopTarget>
}) {
  const [status, setStatus] = useState<TourStatus>('idle')
  const [index, setIndex] = useState(0)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const statusRef = useRef<TourStatus>('idle')
  const indexRef = useRef(0)
  // The current step's clock: when it (re)started, how long it had left, and how many of its actions have run.
  const startedAt = useRef(0)
  const remaining = useRef(0)
  const actionsRun = useRef(0)
  // Pages the current step may be on: where it started, and every page it opens.
  const allowedPaths = useRef<Set<string>>(new Set())
  const pathRef = useRef(pathname)

  // Kept in refs so timers always call the latest callbacks.
  const showStopRef = useRef(showStop)
  const ringRef = useRef(ringDrawer)
  const byIdRef = useRef(targetsById)
  useEffect(() => {
    showStopRef.current = showStop
    ringRef.current = ringDrawer
    byIdRef.current = targetsById
  }, [showStop, ringDrawer, targetsById])
  // The next step, called from inside a step's own timer.
  const beginRef = useRef<(i: number) => void>(() => {})

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const set = (s: TourStatus) => {
    statusRef.current = s
    setStatus(s)
  }

  /** Schedules what's left of step `i`: its unrun actions, then the next step. */
  const schedule = useCallback((i: number) => {
    const step = tour.steps[i]
    const actions = actionsOf(step, byIdRef.current)
    const gap = Math.min(MAX_ACTION_GAP_MS, stepDurationMs(step) / Math.max(1, actions.length))
    startedAt.current = Date.now()
    actions.slice(actionsRun.current).forEach((action, k) => {
      timers.current.push(
        setTimeout(() => {
          actionsRun.current += 1
          if (action.kind === 'ring') ringRef.current(action.id)
          else {
            allowedPaths.current.add(action.stop.path)
            void showStopRef.current(action.stop)
          }
        }, k * gap)
      )
    })
    timers.current.push(
      setTimeout(() => {
        clearTimers()
        if (i + 1 >= tour.steps.length) return set('done')
        beginRef.current(i + 1)
      }, remaining.current)
    )
  }, [tour])

  const begin = useCallback(
    (i: number) => {
      clearTimers()
      indexRef.current = i
      setIndex(i)
      actionsRun.current = 0
      remaining.current = stepDurationMs(tour.steps[i])
      allowedPaths.current = new Set([pathRef.current])
      schedule(i)
    },
    [tour, schedule]
  )
  useEffect(() => {
    beginRef.current = begin
  }, [begin])

  const start = useCallback(() => {
    if (tour.steps.length === 0) return
    set('playing')
    begin(0)
  }, [tour, begin])

  const pause = useCallback(() => {
    if (statusRef.current !== 'playing') return
    clearTimers()
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
    set('paused')
  }, [])

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return
    set('playing')
    schedule(indexRef.current)
  }, [schedule])

  const skip = useCallback(() => {
    if (statusRef.current !== 'playing' && statusRef.current !== 'paused') return
    if (indexRef.current + 1 >= tour.steps.length) {
      clearTimers()
      return set('done')
    }
    set('playing')
    begin(indexRef.current + 1)
  }, [tour, begin])

  const end = useCallback(() => {
    if (statusRef.current === 'idle' || statusRef.current === 'done') return
    clearTimers()
    set('done')
  }, [])

  /** Stops without the closing line (the visitor asked a question, or went elsewhere). */
  const stop = useCallback(() => {
    clearTimers()
    set('idle')
  }, [])

  // Leaving for a page the step didn't open (the nav, a link): stop quietly, never snap back.
  useEffect(() => {
    pathRef.current = pathname
    const s = statusRef.current
    if ((s === 'playing' || s === 'paused') && !allowedPaths.current.has(pathname)) stop()
  }, [pathname, stop])

  // The visitor taking over the page pauses the tour.
  useEffect(() => {
    if (status !== 'playing') return
    const onUser = (e: Event) => {
      const target = e.target as Element | null
      if (target?.closest?.('[data-tour-ui]')) return
      pause()
    }
    const types = ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const
    types.forEach((t) => window.addEventListener(t, onUser, { capture: true, passive: true }))
    return () => types.forEach((t) => window.removeEventListener(t, onUser, { capture: true }))
  }, [status, pause])

  useEffect(() => clearTimers, [])

  return {
    status,
    index,
    step: status === 'idle' ? null : (tour.steps[index] ?? null),
    total: tour.steps.length,
    start,
    pause,
    resume,
    skip,
    end,
    stop,
  }
}
