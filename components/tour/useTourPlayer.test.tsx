import { act, fireEvent, renderHook } from '@testing-library/react'
import type { Stop, StopTarget } from '@/lib/page-stops'
import { stepDurationAt, stepDurationMs, tourDurationMs, type SiteTour, type TourStep } from '@/lib/site-tour'
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

// Every step has 12 words (4000 ms), or 6000 ms with one target (2000 ms per target).
const PLAIN = 4000
const WITH_TARGETS = 6000
// A closing step of 12 words that shows nothing: 12 / 12 s + 1.2 s = 2200 ms, floored at 2500 ms.
const CLOSING = 2500

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
    const total = tourDurationMs(SIMPLE)
    expect(total).toBe(PLAIN + WITH_TARGETS + CLOSING)
    advance(total - 1)
    expect(result.current.status).toBe('playing')
    advance(1)
    expect(result.current.status).toBe('done')
  })

  it('finishes a closing step that shows nothing sooner than its reading time (stepDurationAt)', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + WITH_TARGETS)
    expect(result.current.index).toBe(2)
    expect(result.current.status).toBe('playing')
    expect(stepDurationAt(SIMPLE, 2)).toBeLessThan(stepDurationMs(SIMPLE.steps[2]))
    advance(CLOSING - 1)
    expect(result.current.status).toBe('playing')
    advance(1)
    expect(result.current.status).toBe('done')
  })

  it('is done (stepDurationMs - stepDurationAt) sooner than before once the closing step begins', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + WITH_TARGETS)
    advance(stepDurationMs(SIMPLE.steps[2]) - 1)
    expect(result.current.status).toBe('done')
  })

  it('keeps a closing step that shows something for its full stepDurationMs', () => {
    const t = tourOf([step(12), step(12), step(12, ['writing'])])
    const { result, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(PLAIN + PLAIN + WITH_TARGETS - 1)
    expect(result.current.status).toBe('playing')
    advance(1)
    expect(result.current.status).toBe('done')
    expect(tourDurationMs(t)).toBe(PLAIN + PLAIN + WITH_TARGETS)
  })

  it('keeps a closing step with example questions for its full stepDurationMs', () => {
    const t = tourOf([step(12), step(12), { say: words(12), targets: [], ask: ['A?', 'B?'] }])
    const { result, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(PLAIN + PLAIN + PLAIN + 2000 - 1)
    expect(result.current.status).toBe('playing')
    advance(1)
    expect(result.current.status).toBe('done')
  })

  it('does not shorten a step that shows nothing in the middle of the tour', () => {
    const t = tourOf([step(12), step(12), step(12)])
    const { result, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(PLAIN - 1)
    expect(result.current.index).toBe(0)
    advance(1)
    expect(result.current.index).toBe(1)
  })

  it('counts the closing step from where it was when paused and resumed (its stepDurationAt, not the reading time)', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + WITH_TARGETS + 1000)
    act(() => result.current.pause())
    advance(60_000)
    expect(result.current.status).toBe('paused')
    act(() => result.current.resume())
    advance(CLOSING - 1000 - 1)
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
    // 3 actions across 10000 ms (4000 + 2000 per target): 3333 ms apart, under the 4000 ms cap.
    advance(3331)
    expect(stopIds(showStop)).toEqual([['role-uob']])
    advance(1)
    expect(stopIds(showStop)).toEqual([['role-uob'], ['role-illumina']])
    advance(3333)
    expect(stopIds(showStop)).toEqual([['role-uob'], ['role-illumina'], ['all-roles']])
  })

  it('hands showStop the stop with its page, path and scroll target', () => {
    const { result, showStop, advance } = setup({ tour: tourOf([step(12, ['edu-smu']), step(12), step(12)]) })
    act(() => result.current.start())
    advance(0)
    expect(showStop).toHaveBeenCalledWith(
      {
        ids: ['edu-smu'],
        path: '/education',
        page: 'Education',
        label: 'SMU, 2022',
        scrollId: 'edu-smu',
      },
      expect.any(AbortSignal)
    )
  })

  it('runs the first target as soon as the step starts', () => {
    const { result, showStop, advance } = setup({ tour: tourOf([step(12, ['writing']), step(12), step(12)]) })
    act(() => result.current.start())
    advance(0)
    expect(showStop).toHaveBeenCalledTimes(1)
  })

  it('caps the gap between two targets at 4 seconds, however long the step', () => {
    const long = tourOf([step(200, ['role-uob', 'role-illumina']), step(12), step(12)]) // 16000 ms
    const { result, showStop, advance } = setup({ tour: long })
    act(() => result.current.start())
    advance(3999)
    expect(showStop).toHaveBeenCalledTimes(1)
    advance(1)
    expect(showStop).toHaveBeenCalledTimes(2)
  })

  it('spaces two targets by half the step when that is under the 4 second cap (a 2 role step of 7000 ms: 3500)', () => {
    const t = tourOf([step(9, ['role-uob', 'role-illumina']), step(12), step(12)]) // 3000 + 4000 = 7000 ms
    const { result, showStop, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(3499)
    expect(showStop).toHaveBeenCalledTimes(1)
    advance(1)
    expect(showStop).toHaveBeenCalledTimes(2)
  })

  it('rings drawer targets without showStop', () => {
    const t = tourOf([step(12, ['ask-button', 'fit-mode']), step(12), step(12)])
    const { result, showStop, ringDrawer, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(4000)
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

describe('useTourPlayer: run', () => {
  it('starts at 0 and goes up by one on every start()', () => {
    const { result } = setup()
    expect(result.current.run).toBe(0)
    act(() => result.current.start())
    expect(result.current.run).toBe(1)
    act(() => result.current.start())
    expect(result.current.run).toBe(2)
  })

  it('does not change as steps advance, or on pause, resume or skip', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + 1)
    act(() => result.current.pause())
    act(() => result.current.resume())
    act(() => result.current.skip())
    expect(result.current.run).toBe(1)
  })

  it('restarts the tour from step 1 on a second start()', () => {
    const { result, advance } = setup()
    act(() => result.current.start())
    advance(PLAIN + 1)
    expect(result.current.index).toBe(1)
    act(() => result.current.start())
    expect(result.current.index).toBe(0)
    expect(result.current.status).toBe('playing')
    advance(PLAIN - 1)
    expect(result.current.index).toBe(0)
    advance(1)
    expect(result.current.index).toBe(1)
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
    ['a scroll key (ArrowDown)', () => fireEvent.keyDown(document.body, { key: 'ArrowDown' })],
    ['pointerdown', () => fireEvent.pointerDown(document.body)],
    ['pointerdown on the window itself', () => fireEvent.pointerDown(window)],
  ])('pauses on %s outside the tour\'s own controls', (_name, act_) => {
    const { result } = setup()
    act(() => result.current.start())
    act(() => void act_())
    expect(result.current.status).toBe('paused')
  })

  describe('keys', () => {
    const press = (key: string, init: KeyboardEventInit = {}, target: Element | Window = document.body) =>
      act(() => void fireEvent.keyDown(target, { key, ...init }))

    it.each(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])('pauses on the scroll key %j', (key) => {
      const { result } = setup()
      act(() => result.current.start())
      press(key)
      expect(result.current.status).toBe('paused')
    })

    it.each(['a', 'Enter', 'Tab', 'Escape', 'Shift', 'Meta', 'F5', 'ArrowLeft', 'ArrowRight'])('does not pause on %j', (key) => {
      const { result } = setup()
      act(() => result.current.start())
      press(key)
      expect(result.current.status).toBe('playing')
    })

    it.each([
      ['Meta', { metaKey: true }],
      ['Ctrl', { ctrlKey: true }],
      ['Alt', { altKey: true }],
    ])('does not pause on a scroll key held with %s', (_name, mod) => {
      const { result } = setup()
      act(() => result.current.start())
      press('ArrowDown', mod)
      press(' ', mod)
      expect(result.current.status).toBe('playing')
    })

    it('does not pause on a screenshot shortcut (Meta+Shift+4)', () => {
      const { result } = setup()
      act(() => result.current.start())
      press('4', { metaKey: true, shiftKey: true })
      press('$', { metaKey: true, shiftKey: true })
      expect(result.current.status).toBe('playing')
    })

    it.each([
      ['an input', () => document.createElement('input')],
      ['a textarea', () => document.createElement('textarea')],
      ['a select', () => document.createElement('select')],
    ])('does not pause on space (or arrows) typed in %s', (_name, make) => {
      const field = make()
      document.body.append(field)
      try {
        const { result } = setup()
        act(() => result.current.start())
        press(' ', {}, field)
        press('ArrowDown', {}, field)
        expect(result.current.status).toBe('playing')
      } finally {
        field.remove()
      }
    })

    it('does not pause on space typed in an editable element (isContentEditable; jsdom does not compute it, so it is set by hand)', () => {
      const editable = document.createElement('div')
      Object.defineProperty(editable, 'isContentEditable', { value: true })
      document.body.append(editable)
      try {
        const { result } = setup()
        act(() => result.current.start())
        press(' ', {}, editable)
        press('ArrowDown', {}, editable)
        expect(result.current.status).toBe('playing')
      } finally {
        editable.remove()
      }
    })

    it('still pauses on space in an element that is not editable', () => {
      const div = document.createElement('div')
      Object.defineProperty(div, 'isContentEditable', { value: false })
      document.body.append(div)
      try {
        const { result } = setup()
        act(() => result.current.start())
        press(' ', {}, div)
        expect(result.current.status).toBe('paused')
      } finally {
        div.remove()
      }
    })

    it('still pauses on space when the focus is on a button or the page', () => {
      const button = document.createElement('button')
      document.body.append(button)
      try {
        const { result } = setup()
        act(() => result.current.start())
        press(' ', {}, button)
        expect(result.current.status).toBe('paused')
      } finally {
        button.remove()
      }
    })

    it('pauses on a scroll key aimed at the window itself', () => {
      const { result } = setup()
      act(() => result.current.start())
      press('PageDown', {}, window)
      expect(result.current.status).toBe('paused')
    })

    it('still pauses on wheel, touchmove and pointerdown outside the tour UI', () => {
      for (const fire of [() => fireEvent.wheel(document.body), () => fireEvent.touchMove(document.body), () => fireEvent.pointerDown(document.body)]) {
        const { result, unmount } = setup()
        act(() => result.current.start())
        act(() => void fire())
        expect(result.current.status).toBe('paused')
        unmount()
      }
    })
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

    it('pauses when the tab goes hidden, and holds the clock while it is away', () => {
      const { result, advance } = setup()
      act(() => result.current.start())
      advance(1000)
      act(() => setVisibility('hidden'))
      expect(result.current.status).toBe('paused')
      advance(60_000)
      expect(result.current.index).toBe(0)
      expect(result.current.status).toBe('paused')
    })

    it('carries on by itself when the tab comes back, with the clock where it stopped', () => {
      const { result, advance } = setup()
      act(() => result.current.start())
      advance(1000)
      act(() => setVisibility('hidden'))
      advance(60_000)
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('playing')
      expect(result.current.index).toBe(0)
      advance(2999) // 4000 - 1000 left
      expect(result.current.index).toBe(0)
      advance(1)
      expect(result.current.index).toBe(1)
    })

    it('does not run a step\'s targets twice across a hide and a return', async () => {
      const t = tourOf([step(12, ['role-uob', 'role-illumina']), step(12), step(12)])
      const { result, showStop, advance } = setup({ tour: t })
      act(() => result.current.start())
      advance(10)
      await act(async () => void (await Promise.resolve())) // the first stop has finished
      act(() => setVisibility('hidden'))
      act(() => setVisibility('visible'))
      advance(5500)
      expect(stopIds(showStop)).toEqual([['role-uob'], ['role-illumina']])
    })

    it('can hide and return more than once in a step', () => {
      const { result, advance } = setup()
      act(() => result.current.start())
      advance(1000)
      act(() => setVisibility('hidden'))
      act(() => setVisibility('visible'))
      advance(1000)
      act(() => setVisibility('hidden'))
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('playing')
      advance(1999)
      expect(result.current.index).toBe(0)
      advance(1)
      expect(result.current.index).toBe(1)
    })

    it('stays paused on return if the visitor paused it first, then the tab went hidden', () => {
      const { result, advance } = setup()
      act(() => result.current.start())
      advance(1000)
      act(() => result.current.pause())
      act(() => setVisibility('hidden'))
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('paused')
      advance(60_000)
      expect(result.current.index).toBe(0)
    })

    it('stays paused on return if the visitor paused it by scrolling, then hid the tab', () => {
      const { result } = setup()
      act(() => result.current.start())
      fireEvent.wheel(document.body)
      expect(result.current.status).toBe('paused')
      act(() => setVisibility('hidden'))
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('paused')
    })

    it('stays paused on return if it was already paused when the tab went hidden (even after a hidden-pause cycle earlier)', () => {
      const { result } = setup()
      act(() => result.current.start())
      act(() => setVisibility('hidden'))
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('playing')
      act(() => result.current.pause())
      act(() => setVisibility('hidden'))
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('paused')
    })

    it('stays paused on return if the visitor resumed and paused again by hand while the tab was away', () => {
      const { result } = setup()
      act(() => result.current.start())
      act(() => setVisibility('hidden'))
      // They press Resume while the tab is "hidden" (e.g. a picture-in-picture window), then pause again.
      act(() => result.current.resume())
      act(() => result.current.pause())
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('paused')
    })

    it('does not resume on return if the visitor skipped meanwhile (a new step starts playing, nothing to resume)', () => {
      const { result, advance } = setup()
      act(() => result.current.start())
      act(() => setVisibility('hidden'))
      act(() => result.current.skip())
      expect(result.current.index).toBe(1)
      expect(result.current.status).toBe('playing')
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('playing')
      advance(WITH_TARGETS - 1)
      expect(result.current.index).toBe(1) // no doubled timer from a second resume
      advance(1)
      expect(result.current.index).toBe(2)
    })

    it('does not resume a tour that was ended while the tab was away', () => {
      const { result } = setup()
      act(() => result.current.start())
      act(() => setVisibility('hidden'))
      act(() => result.current.end())
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('done')
    })

    it('stays paused after an auto-resume is followed by a manual pause', () => {
      const { result } = setup()
      act(() => result.current.start())
      act(() => setVisibility('hidden'))
      act(() => setVisibility('visible'))
      fireEvent.wheel(document.body)
      expect(result.current.status).toBe('paused')
      act(() => setVisibility('visible'))
      expect(result.current.status).toBe('paused')
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

  it('does not run a step\'s targets twice when it is paused and resumed', async () => {
    const t = tourOf([step(12, ['role-uob', 'role-illumina']), step(12), step(12)])
    const { result, showStop, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(10) // first target has run
    await act(async () => void (await Promise.resolve())) // and finished
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

describe('useTourPlayer: a stop cut short', () => {
  const ONE_ROLE = tourOf([step(12), step(12, ['role-uob']), step(12)])
  const signalOf = (showStop: jest.Mock, call = 0) => showStop.mock.calls[call][1] as AbortSignal
  /** Lets promise follow-ups (a stop finishing) run. */
  const flush = () => act(async () => void (await Promise.resolve()))
  /** A showStop whose promise the test settles by hand. */
  function deferredShowStop() {
    const settlers: Array<(ok: boolean) => void> = []
    const showStop = jest.fn(() => new Promise<boolean>((done) => settlers.push(done)))
    return { showStop, settle: (i: number, ok = true) => settlers[i](ok) }
  }

  it('hands showStop an AbortSignal that has not been aborted', () => {
    const { result, showStop, advance } = setup({ tour: ONE_ROLE })
    act(() => result.current.start())
    advance(PLAIN + 1)
    expect(showStop).toHaveBeenCalledTimes(1)
    expect(signalOf(showStop)).toBeInstanceOf(AbortSignal)
    expect(signalOf(showStop).aborted).toBe(false)
  })

  it('aborts the signal on pause, and runs the same stop again on resume with a fresh signal', async () => {
    const { showStop } = deferredShowStop()
    const { result, advance } = setup({ tour: ONE_ROLE, showStop })
    act(() => result.current.start())
    advance(PLAIN + 1)
    expect(showStop).toHaveBeenCalledTimes(1)
    act(() => result.current.pause())
    expect(signalOf(showStop).aborted).toBe(true)
    await flush()
    act(() => result.current.resume())
    advance(1)
    await flush()
    expect(showStop).toHaveBeenCalledTimes(2)
    expect(stopIds(showStop)).toEqual([['role-uob'], ['role-uob']])
    expect(signalOf(showStop, 1)).not.toBe(signalOf(showStop, 0))
    expect(signalOf(showStop, 1).aborted).toBe(false)
  })

  it('runs it again on resume even if the cut-short stop resolved afterwards (its answer is too late to count)', async () => {
    const { showStop, settle } = deferredShowStop()
    const { result, advance } = setup({ tour: ONE_ROLE, showStop })
    act(() => result.current.start())
    advance(PLAIN + 1)
    act(() => result.current.pause())
    settle(0, true)
    await flush()
    act(() => result.current.resume())
    advance(1)
    expect(showStop).toHaveBeenCalledTimes(2)
  })

  it('does not run a stop again on resume when it had finished before the pause', async () => {
    const { result, showStop, advance } = setup({ tour: ONE_ROLE })
    act(() => result.current.start())
    advance(PLAIN + 1)
    await flush()
    act(() => result.current.pause())
    act(() => result.current.resume())
    advance(100)
    await flush()
    expect(showStop).toHaveBeenCalledTimes(1)
  })

  it('counts a stop that resolved false as run (the page never showed it, so there is nothing to retry)', async () => {
    const showStop = jest.fn(async () => false)
    const { result, advance } = setup({ tour: ONE_ROLE, showStop })
    act(() => result.current.start())
    advance(PLAIN + 1)
    await flush()
    act(() => result.current.pause())
    act(() => result.current.resume())
    advance(100)
    expect(showStop).toHaveBeenCalledTimes(1)
  })

  it('counts a ring as run at once: a pause right after it does not ring again on resume, and the stop still runs', async () => {
    const t = tourOf([step(12), step(12, ['fit-mode', 'role-uob']), step(12)])
    const { result, showStop, ringDrawer, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(PLAIN + 1) // the ring fires, the stop is a gap later
    expect(ringDrawer).toHaveBeenCalledTimes(1)
    expect(showStop).not.toHaveBeenCalled()
    act(() => result.current.pause())
    act(() => result.current.resume())
    advance(1)
    await flush()
    expect(ringDrawer).toHaveBeenCalledTimes(1)
    expect(showStop).toHaveBeenCalledTimes(1)
  })

  it('aborts an in-flight stop when the visitor skips, and the next step starts with a fresh signal', () => {
    const t = tourOf([step(12, ['role-uob']), step(12, ['writing']), step(12)])
    const { showStop } = deferredShowStop()
    const { result, advance } = setup({ tour: t, showStop })
    act(() => result.current.start())
    advance(1)
    const first = signalOf(showStop, 0)
    expect(first.aborted).toBe(false)
    act(() => result.current.skip())
    expect(first.aborted).toBe(true)
    advance(1)
    expect(showStop).toHaveBeenCalledTimes(2)
    expect(signalOf(showStop, 1).aborted).toBe(false)
  })

  it('aborts the step\'s signal when the step runs out and the next begins', () => {
    const t = tourOf([step(12, ['role-uob']), step(12), step(12)])
    const { result, showStop, advance } = setup({ tour: t })
    act(() => result.current.start())
    advance(1)
    const sig = signalOf(showStop)
    expect(sig.aborted).toBe(false)
    advance(stepDurationMs(t.steps[0]))
    expect(result.current.index).toBe(1)
    expect(sig.aborted).toBe(true)
  })

  it('aborts it on end', () => {
    const { showStop } = deferredShowStop()
    const { result, advance } = setup({ tour: ONE_ROLE, showStop })
    act(() => result.current.start())
    advance(PLAIN + 1)
    act(() => result.current.end())
    expect(signalOf(showStop).aborted).toBe(true)
  })

  it('aborts it on stop', () => {
    const { showStop } = deferredShowStop()
    const { result, advance } = setup({ tour: ONE_ROLE, showStop })
    act(() => result.current.start())
    advance(PLAIN + 1)
    act(() => result.current.stop())
    expect(signalOf(showStop).aborted).toBe(true)
  })

  it('aborts it on unmount', () => {
    const { showStop } = deferredShowStop()
    const { result, unmount, advance } = setup({ tour: ONE_ROLE, showStop })
    act(() => result.current.start())
    advance(PLAIN + 1)
    unmount()
    expect(signalOf(showStop).aborted).toBe(true)
  })

  it('leaves a stop that has not been cut short alone while the step plays on', () => {
    const { showStop } = deferredShowStop()
    const { result, advance } = setup({ tour: ONE_ROLE, showStop })
    act(() => result.current.start())
    advance(PLAIN + 1)
    advance(2000)
    expect(signalOf(showStop).aborted).toBe(false)
  })
})
