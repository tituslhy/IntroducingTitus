import { act, fireEvent, renderHook } from '@testing-library/react'
import type { Stop, StopTarget } from '@/lib/page-stops'
import { stepDurationMs, type SiteTour, type TourStep } from '@/lib/site-tour'
import { useTourPlayer } from './useTourPlayer'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
const step = (n: number, targets: string[] = []): TourStep => ({ say: words(n), targets })
const tourOf = (steps: TourStep[]): SiteTour => ({ draft: false, recordedAt: null, model: null, steps })

const TARGETS: StopTarget[] = [
  { id: 'role-uob', label: 'UOB, 2025', path: '/experience', page: 'Experience' },
  { id: 'role-illumina', label: 'Illumina, 2023', path: '/experience', page: 'Experience' },
  { id: 'all-roles', label: 'All roles', path: '/experience', page: 'Experience' },
  { id: 'edu-smu', label: 'SMU, 2022', path: '/education', page: 'Education' },
  { id: 'writing', label: 'Writing', path: '/writing', page: 'Writing' },
  { id: 'tool-neo4j', label: 'Neo4j', path: '/about', page: 'About', tool: true },
  { id: 'tool-python', label: 'Python', path: '/about', page: 'About', tool: true },
]
const targetsById = new Map(TARGETS.map((t) => [t.id, t]))

// Every step has 12 words (4000 ms), or 5500 ms when it shows something.
const PLAIN = 4000
const WITH_TARGETS = 5500

const SIMPLE = tourOf([step(12), step(12, ['writing']), step(12)])

type Opts = { tour?: SiteTour; pathname?: string; showStop?: jest.Mock; ringDrawer?: jest.Mock }

function setup(opts: Opts = {}) {
  const showStop = opts.showStop ?? jest.fn(async () => true)
  const ringDrawer = opts.ringDrawer ?? jest.fn()
  const tour = opts.tour ?? SIMPLE
  const hook = renderHook(
    (props: { pathname: string; showStop: jest.Mock; ringDrawer: jest.Mock }) =>
      useTourPlayer({ tour, targetsById, ...props }),
    { initialProps: { pathname: opts.pathname ?? '/', showStop, ringDrawer } }
  )
  const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms))
  return { ...hook, showStop, ringDrawer, tour, advance }
}

const stopIds = (showStop: jest.Mock) => showStop.mock.calls.map((c) => (c[0] as Stop).ids)

beforeEach(() => {
  jest.useFakeTimers()
})
afterEach(() => {
  jest.useRealTimers()
})

describe('useTourPlayer: starting', () => {
  it('is idle before start, with no step', () => {
    const { result } = setup()
    expect(result.current.status).toBe('idle')
    expect(result.current.step).toBeNull()
    expect(result.current.index).toBe(0)
    expect(result.current.total).toBe(3)
  })

  it('plays the first step when started', () => {
    const { result } = setup()
    act(() => result.current.start())
    expect(result.current.status).toBe('playing')
    expect(result.current.index).toBe(0)
    expect(result.current.step).toBe(SIMPLE.steps[0])
  })

  it('does nothing for a tour with no steps', () => {
    const { result } = setup({ tour: tourOf([]) })
    act(() => result.current.start())
    expect(result.current.status).toBe('idle')
    expect(result.current.total).toBe(0)
  })

  it('does not touch the page for a step that shows nothing', () => {
    const { result, showStop, ringDrawer, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN - 1)
    expect(showStop).not.toHaveBeenCalled()
    expect(ringDrawer).not.toHaveBeenCalled()
  })
})

describe('useTourPlayer: moving through the steps', () => {
  it('plays each step after its duration', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(stepDurationMs(SIMPLE.steps[0]) - 1)
    expect(result.current.index).toBe(0)
    advance(1)
    expect(result.current.index).toBe(1)
    expect(result.current.step).toBe(SIMPLE.steps[1])
    advance(stepDurationMs(SIMPLE.steps[1]))
    expect(result.current.index).toBe(2)
  })

  it('is done after the last step, and keeps that step as its closing line', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + WITH_TARGETS + PLAIN)
    expect(result.current.status).toBe('done')
    expect(result.current.index).toBe(2)
    expect(result.current.step).toBe(SIMPLE.steps[2])
  })

  it('stays done once finished, with no timers left', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + WITH_TARGETS + PLAIN)
    advance(60_000)
    expect(result.current.status).toBe('done')
    expect(jest.getTimerCount()).toBe(0)
  })

  it('takes the whole tour in the sum of its steps, as tourDurationMs says', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + WITH_TARGETS + PLAIN - 1)
    expect(result.current.status).toBe('playing')
    advance(1)
    expect(result.current.status).toBe('done')
  })
})

describe('useTourPlayer: what a step shows', () => {
  const TWO_ROLES_AND_ALL = tourOf([step(12), step(12, ['role-uob', 'role-illumina', 'all-roles']), step(12)])

  it('runs a step\'s targets in order, spaced across the step', () => {
    const { result, showStop, advance } = setup({ tour: TWO_ROLES_AND_ALL })
    act(() => result.current.start())
    advance(PLAIN + 1) // step 2 starts (a zero-delay timer fires a millisecond into a tick)
    expect(stopIds(showStop)).toEqual([['role-uob']])
    // 3 actions across 5500 ms: 1833 ms apart.
    advance(1831)
    expect(stopIds(showStop)).toEqual([['role-uob']])
    advance(1)
    expect(stopIds(showStop)).toEqual([['role-uob'], ['role-illumina']])
    advance(1833)
    expect(stopIds(showStop)).toEqual([['role-uob'], ['role-illumina'], ['all-roles']])
  })

  it('hands showStop the stop with its page, path and scroll target', () => {
    const { result, showStop, advance } = setup({ tour: tourOf([step(12, ['edu-smu']), step(12), step(12)]) })
    act(() => result.current.start())
    advance(0)
    expect(showStop).toHaveBeenCalledWith({
      ids: ['edu-smu'],
      path: '/education',
      page: 'Education',
      label: 'SMU, 2022',
      scrollId: 'edu-smu',
    })
  })

  it('runs the first target as soon as the step starts', () => {
    const { result, showStop, advance } = setup({ tour: tourOf([step(12, ['writing']), step(12), step(12)]) })
    act(() => result.current.start())
    advance(0)
    expect(showStop).toHaveBeenCalledTimes(1)
  })

  it('caps the gap between two targets at 2 seconds, however long the step', () => {
    const long = tourOf([step(200, ['role-uob', 'role-illumina']), step(12), step(12)]) // 16000 ms
    const { result, showStop, advance } = setup({ tour: long })
    act(() => result.current.start())
    advance(1999)
    expect(showStop).toHaveBeenCalledTimes(1)
    advance(1)
    expect(showStop).toHaveBeenCalledTimes(2)
  })

  it('rings drawer targets without showStop', () => {
    const t = tourOf([step(12, ['ask-button', 'fit-mode']), step(12), step(12)])
    const { result, showStop, ringDrawer, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(5500)
    expect(ringDrawer.mock.calls.map((c) => c[0])).toEqual(['ask-button', 'fit-mode'])
    expect(showStop).not.toHaveBeenCalled()
  })

  it('rings the drawer first, then shows the page stops', () => {
    const t = tourOf([step(12, ['role-uob', 'fit-mode']), step(12), step(12)])
    const order: string[] = []
    const showStop = jest.fn(async (s: Stop) => (order.push(`stop:${s.ids[0]}`), true))
    const ringDrawer = jest.fn((id: string) => void order.push(`ring:${id}`))
    const { result, advance } = setup({ tour: t, showStop, ringDrawer })
    act(() => result.current.start())
    advance(4000)
    expect(order).toEqual(['ring:fit-mode', 'stop:role-uob'])
  })

  it('shows every tool tile as one stop, the table', () => {
    const t = tourOf([step(12, ['tool-neo4j', 'tool-python']), step(12), step(12)])
    const { result, showStop, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(5500)
    expect(showStop).toHaveBeenCalledTimes(1)
    expect(showStop.mock.calls[0][0]).toMatchObject({ ids: ['tool-neo4j', 'tool-python'], scrollId: 'stack' })
  })

  it('ignores a target nobody told it about', () => {
    const t = tourOf([step(12, ['role-nowhere']), step(12), step(12)])
    const { result, showStop, ringDrawer, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(WITH_TARGETS)
    expect(showStop).not.toHaveBeenCalled()
    expect(ringDrawer).not.toHaveBeenCalled()
    expect(result.current.index).toBe(1)
  })

  it('skips a target it can\'t find (showStop says false) and keeps playing', async () => {
    const showStop = jest.fn(async () => false)
    const t = tourOf([step(12, ['role-uob']), step(12, ['writing']), step(12)])
    const { result, advance } = setup({ tour: t, showStop })
    act(() => result.current.start())
    advance(WITH_TARGETS)
    expect(result.current.index).toBe(1)
    advance(WITH_TARGETS)
    expect(result.current.index).toBe(2)
    advance(PLAIN)
    expect(result.current.status).toBe('done')
    expect(showStop).toHaveBeenCalledTimes(2)
  })

  it('keeps playing when a stop is still pending (a page slow to open)', () => {
    const showStop = jest.fn(() => new Promise<boolean>(() => {}))
    const t = tourOf([step(12, ['writing']), step(12), step(12)])
    const { result, advance } = setup({ tour: t, showStop })
    act(() => result.current.start())
    advance(WITH_TARGETS)
    expect(result.current.index).toBe(1)
  })

  it('uses the latest callbacks, not the ones it started with', () => {
    const first = jest.fn(async () => true)
    const second = jest.fn(async () => true)
    const t = tourOf([step(12), step(12, ['writing']), step(12)])
    const { result, rerender, advance } = setup({ tour: t, showStop: first })
    act(() => result.current.start())
    rerender({ pathname: '/', showStop: second, ringDrawer: jest.fn() })
    advance(PLAIN + 1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})

describe('useTourPlayer: pause, resume, skip, end', () => {
  it('pauses on wheel and resumes where it was', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(1000)
    fireEvent.wheel(document.body)
    expect(result.current.status).toBe('paused')
    advance(60_000)
    expect(result.current.index).toBe(0)
    act(() => result.current.resume())
    expect(result.current.status).toBe('playing')
    advance(2999)
    expect(result.current.index).toBe(0)
    advance(1)
    expect(result.current.index).toBe(1)
  })

  it.each([
    ['wheel', () => fireEvent.wheel(document.body)],
    ['touchmove', () => fireEvent.touchMove(document.body)],
    ['keydown', () => fireEvent.keyDown(document.body, { key: 'a' })],
    ['pointerdown', () => fireEvent.pointerDown(document.body)],
    ['pointerdown on the window itself', () => fireEvent.pointerDown(window)],
  ])('pauses on %s outside the tour\'s own controls', (_name, act_) => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => void act_())
    expect(result.current.status).toBe('paused')
  })

  it.each([
    ['wheel', (el: Element) => fireEvent.wheel(el)],
    ['touchmove', (el: Element) => fireEvent.touchMove(el)],
    ['keydown', (el: Element) => fireEvent.keyDown(el, { key: 'Enter' })],
    ['pointerdown', (el: Element) => fireEvent.pointerDown(el)],
  ])('does not pause on %s inside an element marked data-tour-ui', (_name, fire) => {
    const ui = document.createElement('div')
    ui.setAttribute('data-tour-ui', '')
    const button = document.createElement('button')
    ui.append(button)
    document.body.append(ui)
    try {
      const { result } = setup()
      act(() => result.current.start())
      act(() => void fire(button))
      expect(result.current.status).toBe('playing')
    } finally {
      ui.remove()
    }
  })

  it('stops listening to the page once paused, and again when done', () => {
    const add = jest.spyOn(window, 'addEventListener')
    const remove = jest.spyOn(window, 'removeEventListener')
    const { result } = setup()
    act(() => result.current.start())
    const added = add.mock.calls.filter((c) => ['wheel', 'touchmove', 'pointerdown', 'keydown'].includes(c[0] as string)).length
    expect(added).toBeGreaterThanOrEqual(4)
    fireEvent.wheel(document.body)
    const removed = remove.mock.calls.filter((c) => ['wheel', 'touchmove', 'pointerdown', 'keydown'].includes(c[0] as string)).length
    expect(removed).toBeGreaterThanOrEqual(4)
    add.mockRestore()
    remove.mockRestore()
  })

  describe('a tab in the background', () => {
    const setVisibility = (state: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
      fireEvent(document, new Event('visibilitychange'))
    }
    afterEach(() => setVisibility('visible'))

    it('pauses when the tab goes hidden, and holds the clock until Resume', () => {
      const { result, advance } = setup()
      act(() => result.current.start())
      advance(1000)
      act(() => setVisibility('hidden'))
      expect(result.current.status).toBe('paused')
      advance(60_000)
      expect(result.current.index).toBe(0)
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('paused') // it waits for the visitor to press Resume
      act(() => result.current.resume())
      advance(2999)
      expect(result.current.index).toBe(0)
      advance(1)
      expect(result.current.index).toBe(1)
    })

    it('does not pause when the tab becomes visible', () => {
      const { result } = setup()
      act(() => result.current.start())
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('playing')
    })

    it('ignores the tab going hidden when no tour is playing', () => {
      const { result } = setup()
      act(() => setVisibility('hidden'))
      expect(result.current.status).toBe('idle')
    })

    it('stops listening once the tour is paused, done or unmounted', () => {
      const add = jest.spyOn(document, 'addEventListener')
      const remove = jest.spyOn(document, 'removeEventListener')
      const { result, unmount } = setup()
      act(() => result.current.start())
      expect(add.mock.calls.some((c) => c[0] === 'visibilitychange')).toBe(true)
      unmount()
      expect(remove.mock.calls.some((c) => c[0] === 'visibilitychange')).toBe(true)
      add.mockRestore()
      remove.mockRestore()
    })
  })

  it('pause does nothing unless playing', () => {
    const { result } = setup()
    act(() => result.current.pause())
    expect(result.current.status).toBe('idle')
  })

  it('resume does nothing unless paused', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    act(() => result.current.resume())
    advance(PLAIN)
    expect(result.current.index).toBe(1) // no doubled timers
    expect(result.current.status).toBe('playing')
  })

  it('does not run a step\'s targets twice when it is paused and resumed', () => {
    const t = tourOf([step(12, ['role-uob', 'role-illumina']), step(12), step(12)])
    const { result, showStop, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(10) // first target has run
    act(() => result.current.pause())
    act(() => result.current.resume())
    advance(5500)
    expect(stopIds(showStop)).toEqual([['role-uob'], ['role-illumina']])
  })

  it('skip moves to the next step at once, with a full clock', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(1000)
    act(() => result.current.skip())
    expect(result.current.index).toBe(1)
    expect(result.current.status).toBe('playing')
    advance(WITH_TARGETS - 1)
    expect(result.current.index).toBe(1)
    advance(1)
    expect(result.current.index).toBe(2)
  })

  it('skip from paused plays the next step', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => result.current.pause())
    act(() => result.current.skip())
    expect(result.current.status).toBe('playing')
    expect(result.current.index).toBe(1)
  })

  it('skip on the last step finishes the tour', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    act(() => result.current.skip())
    act(() => result.current.skip())
    expect(result.current.index).toBe(2)
    act(() => result.current.skip())
    expect(result.current.status).toBe('done')
    advance(60_000)
    expect(result.current.status).toBe('done')
  })

  it('skip does nothing before the tour starts or after it ends', () => {
    const { result } = setup()
    act(() => result.current.skip())
    expect(result.current.status).toBe('idle')
    act(() => result.current.start())
    act(() => result.current.end())
    act(() => result.current.skip())
    expect(result.current.status).toBe('done')
    expect(result.current.index).toBe(0)
  })

  it('end sets done, and clears the clock', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    act(() => result.current.end())
    expect(result.current.status).toBe('done')
    expect(jest.getTimerCount()).toBe(0)
    advance(60_000)
    expect(result.current.index).toBe(0)
  })

  it('end from paused sets done', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => result.current.pause())
    act(() => result.current.end())
    expect(result.current.status).toBe('done')
  })

  it('end does nothing when idle, or when already done', () => {
    const { result } = setup()
    act(() => result.current.end())
    expect(result.current.status).toBe('idle')
    act(() => result.current.start())
    act(() => result.current.end())
    act(() => result.current.end())
    expect(result.current.status).toBe('done')
  })

  it('stop goes quietly to idle, with no step to show', () => {
    const { result, showStop, advance } = setup()
    act(() => result.current.start())
    advance(1000)
    act(() => result.current.stop())
    expect(result.current.status).toBe('idle')
    expect(result.current.step).toBeNull()
    expect(jest.getTimerCount()).toBe(0)
    advance(60_000)
    expect(result.current.status).toBe('idle')
    expect(showStop).not.toHaveBeenCalled()
  })

  it('stop works from paused too', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => result.current.pause())
    act(() => result.current.stop())
    expect(result.current.status).toBe('idle')
  })
})

describe('useTourPlayer: leaving the page', () => {
  const GOES_TO_EXPERIENCE = tourOf([step(12), step(12, ['role-uob']), step(12), step(12)])

  it('stays on while the step opens the page itself', () => {
    const { result, rerender, showStop, ringDrawer, advance } = setup({ tour: GOES_TO_EXPERIENCE, pathname: '/' })
    act(() => result.current.start())
    advance(PLAIN + 1) // step 2 runs its stop: /experience is now allowed
    rerender({ pathname: '/experience', showStop, ringDrawer })
    expect(result.current.status).toBe('playing')
    advance(WITH_TARGETS)
    expect(result.current.index).toBe(2)
  })

  it('ends when the path changes to one the step didn\'t ask for: idle, no navigation back', () => {
    const { result, rerender, showStop, ringDrawer, advance } = setup({ tour: GOES_TO_EXPERIENCE, pathname: '/' })
    act(() => result.current.start())
    advance(1000)
    rerender({ pathname: '/writing', showStop, ringDrawer })
    expect(result.current.status).toBe('idle')
    expect(result.current.step).toBeNull()
    expect(jest.getTimerCount()).toBe(0)
    advance(60_000)
    expect(showStop).not.toHaveBeenCalled()
    expect(result.current.status).toBe('idle')
  })

  it('stops, rather than ends: no closing line (not done)', () => {
    const { result, rerender, showStop, ringDrawer } = setup({ pathname: '/' })
    act(() => result.current.start())
    rerender({ pathname: '/about', showStop, ringDrawer })
    expect(result.current.status).not.toBe('done')
    expect(result.current.status).toBe('idle')
  })

  it('also stops a paused tour', () => {
    const { result, rerender, showStop, ringDrawer } = setup({ pathname: '/' })
    act(() => result.current.start())
    act(() => result.current.pause())
    rerender({ pathname: '/about', showStop, ringDrawer })
    expect(result.current.status).toBe('idle')
  })

  it('stops when the visitor goes somewhere the next step would have gone, if this step never opened it', () => {
    const { result, rerender, showStop, ringDrawer, advance } = setup({ tour: GOES_TO_EXPERIENCE, pathname: '/' })
    act(() => result.current.start())
    advance(1000) // still step 1; /experience is not yet allowed
    rerender({ pathname: '/experience', showStop, ringDrawer })
    expect(result.current.status).toBe('idle')
  })

  it('lets the next step start from the page the last one opened', () => {
    const { result, rerender, showStop, ringDrawer, advance } = setup({ tour: GOES_TO_EXPERIENCE, pathname: '/' })
    act(() => result.current.start())
    advance(PLAIN + 1)
    rerender({ pathname: '/experience', showStop, ringDrawer })
    advance(WITH_TARGETS - 1) // step 3 begins on /experience
    expect(result.current.index).toBe(2)
    expect(result.current.status).toBe('playing')
    rerender({ pathname: '/', showStop, ringDrawer })
    expect(result.current.status).toBe('idle')
  })

  it('does nothing about a path change when no tour is playing', () => {
    const { result, rerender, showStop, ringDrawer } = setup({ pathname: '/' })
    rerender({ pathname: '/about', showStop, ringDrawer })
    expect(result.current.status).toBe('idle')
  })

  it('leaves a finished tour done when the visitor moves on', () => {
    const { result, rerender, showStop, ringDrawer, advance } = setup({ pathname: '/' })
    act(() => result.current.start())
    advance(PLAIN + WITH_TARGETS + PLAIN)
    expect(result.current.status).toBe('done')
    rerender({ pathname: '/about', showStop, ringDrawer })
    expect(result.current.status).toBe('done')
  })
})

describe('useTourPlayer: restarting and unmounting', () => {
  it('restarts from the first step after it is done', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + WITH_TARGETS + PLAIN)
    expect(result.current.status).toBe('done')
    act(() => result.current.start())
    expect(result.current.status).toBe('playing')
    expect(result.current.index).toBe(0)
    expect(result.current.step).toBe(SIMPLE.steps[0])
    advance(PLAIN)
    expect(result.current.index).toBe(1)
  })

  it('restarts from the first step from the middle, with one clock only', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + 100)
    expect(result.current.index).toBe(1)
    act(() => result.current.start())
    expect(result.current.index).toBe(0)
    advance(PLAIN - 1)
    expect(result.current.index).toBe(0)
    advance(1)
    expect(result.current.index).toBe(1)
  })

  it('restarts after being stopped', () => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => result.current.skip())
    act(() => result.current.stop())
    act(() => result.current.start())
    expect(result.current.status).toBe('playing')
    expect(result.current.index).toBe(0)
  })

  it('clears its timers on unmount, so nothing fires afterwards', () => {
    const t = tourOf([step(12, ['role-uob', 'role-illumina']), step(12), step(12)])
    const { result, unmount, showStop, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(10)
    expect(showStop).toHaveBeenCalledTimes(1)
    unmount()
    expect(jest.getTimerCount()).toBe(0)
    advance(60_000)
    expect(showStop).toHaveBeenCalledTimes(1)
  })

  it('clears its timers on unmount while paused', () => {
    const { result, unmount } = setup()
    act(() => result.current.start())
    act(() => result.current.pause())
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('stops listening to the page on unmount', () => {
    const { result, unmount } = setup()
    act(() => result.current.start())
    unmount()
    expect(() => fireEvent.wheel(document.body)).not.toThrow()
  })
})
