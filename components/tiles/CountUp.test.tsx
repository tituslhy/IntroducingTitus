import { act, render, screen } from '@testing-library/react'
import CountUp from './CountUp'

const DURATION_MS = 1200

type Observer = { callback: IntersectionObserverCallback; observe: jest.Mock; disconnect: jest.Mock }

const OriginalIO = global.IntersectionObserver
const originalMatchMedia = window.matchMedia

/** Replaces IntersectionObserver with one the test can fire by hand, and remembers each one made. */
let observers: Observer[]
function installObserver() {
  observers = []
  global.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      const observer = { callback, observe: jest.fn(), disconnect: jest.fn() }
      observers.push(observer)
      return observer as unknown as IntersectionObserver
    }
  } as unknown as typeof IntersectionObserver
}

function scrollIntoView(isIntersecting: boolean) {
  act(() => {
    observers[0].callback([{ isIntersecting } as IntersectionObserverEntry], observers[0] as unknown as IntersectionObserver)
  })
}

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = ((query: string) => ({
    ...originalMatchMedia(query),
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  })) as unknown as typeof window.matchMedia
}

/** The visible, animated text: the part that is aria-hidden. */
const visible = (figure: string | RegExp) => screen.getByText(figure, { selector: 'span[aria-hidden="true"]' })

beforeEach(() => {
  jest.useFakeTimers()
  installObserver()
  setReducedMotion(false)
})

afterEach(() => {
  jest.useRealTimers()
  global.IntersectionObserver = OriginalIO
  window.matchMedia = originalMatchMedia
})

describe('CountUp', () => {
  describe('what screen readers and visitors get', () => {
    it.each(['3.98', '80%', '~25%', '$12M', '10+', '1st', '2×', 'Top Student'])('gives screen readers the full figure "%s"', (figure) => {
      const { container } = render(<CountUp figure={figure} />)
      expect(container.querySelector('.sr-only')).toHaveTextContent(figure)
    })

    it('hides the animated text from screen readers, so the figure is read once', () => {
      const { container } = render(<CountUp figure="3.98" />)
      expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
      expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
    })
  })

  describe('a figure that does not count', () => {
    it.each(['1st', '2×', '8+', '$9M', 'Top Student'])('shows "%s" as it is, and never starts an observer for it', (figure) => {
      render(<CountUp figure={figure} />)
      expect(visible(figure)).toBeInTheDocument()
      expect(observers).toHaveLength(0)
    })
  })

  describe('reduced motion', () => {
    it('shows the final figure, and does not count, when the visitor prefers reduced motion', () => {
      setReducedMotion(true)
      render(<CountUp figure="3.98" />)
      expect(visible('3.98')).toBeInTheDocument()
      expect(observers).toHaveLength(0)
    })

    it('keeps the final figure through time passing, with no frames to play', () => {
      setReducedMotion(true)
      render(<CountUp figure="80%" />)
      act(() => {
        jest.advanceTimersByTime(DURATION_MS)
      })
      expect(visible('80%')).toBeInTheDocument()
    })
  })

  describe('no IntersectionObserver', () => {
    it('shows the final figure straight away when IntersectionObserver is not available', () => {
      // @ts-expect-error: simulate a browser without IntersectionObserver
      delete global.IntersectionObserver
      render(<CountUp figure="3.98" />)
      expect(visible('3.98')).toBeInTheDocument()
    })
  })

  describe('with IntersectionObserver', () => {
    it('starts from zero, in the figure’s own format, until it scrolls into view', () => {
      render(<CountUp figure="3.98" />)
      expect(visible('0.00')).toBeInTheDocument()
      expect(observers[0].observe).toHaveBeenCalledTimes(1)
    })

    it('does not start counting for an entry that is not on screen', () => {
      render(<CountUp figure="3.98" />)
      scrollIntoView(false)
      act(() => {
        jest.advanceTimersByTime(DURATION_MS)
      })
      expect(visible('0.00')).toBeInTheDocument()
    })

    it('counts up on screen, passing through intermediate values, and lands on the exact figure', () => {
      render(<CountUp figure="3.98" />)
      scrollIntoView(true)

      act(() => {
        jest.advanceTimersByTime(DURATION_MS / 2)
      })
      const mid = parseFloat(visible(/^\d\.\d{2}$/).textContent ?? '')
      expect(mid).toBeGreaterThan(0)
      expect(mid).toBeLessThan(3.98)

      act(() => {
        jest.advanceTimersByTime(DURATION_MS)
      })
      expect(visible('3.98')).toBeInTheDocument()
    })

    it('counts a percentage in whole numbers and keeps the % suffix throughout', () => {
      render(<CountUp figure="~25%" />)
      scrollIntoView(true)
      act(() => {
        jest.advanceTimersByTime(DURATION_MS / 3)
      })
      expect(visible(/^~\d+%$/)).toBeInTheDocument()
      act(() => {
        jest.advanceTimersByTime(DURATION_MS)
      })
      expect(visible('~25%')).toBeInTheDocument()
    })

    it('stops observing once it has started, so it counts only the first time', () => {
      render(<CountUp figure="3.98" />)
      scrollIntoView(true)
      expect(observers[0].disconnect).toHaveBeenCalled()
    })

    it('leaves nothing running when it unmounts mid-count', () => {
      const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
      const { unmount } = render(<CountUp figure="3.98" />)
      scrollIntoView(true)
      act(() => {
        jest.advanceTimersByTime(300)
      })
      unmount()
      act(() => {
        jest.advanceTimersByTime(DURATION_MS)
      })
      expect(errors).not.toHaveBeenCalled()
      expect(observers[0].disconnect).toHaveBeenCalled()
      errors.mockRestore()
    })
  })
})
