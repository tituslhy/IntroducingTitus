import { act, render, screen } from '@testing-library/react'
import RiseIn, { RISE_MS } from './RiseIn'

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

/** The one span that carries the figure. */
const figureSpan = (figure: string | RegExp) => screen.getByText(figure, { selector: 'span' })

beforeEach(() => {
  installObserver()
  setReducedMotion(false)
})

afterEach(() => {
  global.IntersectionObserver = OriginalIO
  window.matchMedia = originalMatchMedia
})

describe('RiseIn', () => {
  describe('the text is always the real figure', () => {
    const FIGURES = ['3.98', '80%', '~25%', '$12M', '10+', '1st', '2×', '8+', 'Top Student']

    it.each(FIGURES)('renders "%s" as plain text in a single span, with no hidden copy', (figure) => {
      const { container } = render(<RiseIn figure={figure} />)
      expect(container.querySelectorAll('span')).toHaveLength(1)
      expect(figureSpan(figure)).toHaveTextContent(figure)
      expect(container.querySelector('[aria-hidden]')).toBeNull()
      expect(container.querySelector('.sr-only')).toBeNull()
    })

    it.each(FIGURES)('keeps "%s" as the text in the waiting phase', (figure) => {
      render(<RiseIn figure={figure} />)
      expect(figureSpan(figure)).toHaveAttribute('data-phase', 'waiting')
      expect(figureSpan(figure)).toHaveTextContent(figure)
    })

    it.each(FIGURES)('keeps "%s" as the text once it is rising', (figure) => {
      render(<RiseIn figure={figure} />)
      scrollIntoView(true)
      expect(figureSpan(figure)).toHaveAttribute('data-phase', 'rising')
      expect(figureSpan(figure)).toHaveTextContent(figure)
    })

    it('never shows anything but the figure while it rises, for a figure with decimals', () => {
      render(<RiseIn figure="3.98" />)
      scrollIntoView(true)
      expect(screen.queryByText(/^\d\.\d{2}$/, { selector: 'span' })).toHaveTextContent('3.98')
      expect(screen.queryByText('0.00')).toBeNull()
      expect(screen.queryByText('0')).toBeNull()
    })
  })

  describe('phases', () => {
    it('is shown with no inline style on the server or before any effect runs', () => {
      // No IntersectionObserver: the layout effect has nothing to do, so it stays as the server rendered it.
      // @ts-expect-error: simulate a browser without IntersectionObserver
      delete global.IntersectionObserver
      render(<RiseIn figure="3.98" />)
      expect(figureSpan('3.98')).toHaveAttribute('data-phase', 'shown')
      expect(figureSpan('3.98')).not.toHaveAttribute('style')
    })

    it('moves from waiting to rising when the figure intersects', () => {
      render(<RiseIn figure="3.98" />)
      expect(figureSpan('3.98')).toHaveAttribute('data-phase', 'waiting')
      expect(observers[0].observe).toHaveBeenCalledTimes(1)
      scrollIntoView(true)
      expect(figureSpan('3.98')).toHaveAttribute('data-phase', 'rising')
    })

    it('is hidden and lowered while waiting', () => {
      render(<RiseIn figure="3.98" />)
      const style = figureSpan('3.98').style
      expect(style.opacity).toBe('0')
      expect(style.transform).toBe('translateY(0.3em)')
    })

    it('has no transition while waiting, so it never fades out before rising', () => {
      render(<RiseIn figure="3.98" />)
      expect(figureSpan('3.98').style.transition).toBe('')
    })

    it('is fully visible and level once rising', () => {
      render(<RiseIn figure="3.98" />)
      scrollIntoView(true)
      const style = figureSpan('3.98').style
      expect(style.opacity).toBe('1')
      expect(style.transform).toBe('none')
    })

    it('transitions opacity and transform over RISE_MS once rising', () => {
      render(<RiseIn figure="3.98" />)
      scrollIntoView(true)
      const transition = figureSpan('3.98').style.transition
      expect(transition).toContain(`opacity ${RISE_MS}ms`)
      expect(transition).toContain(`transform ${RISE_MS}ms`)
    })
  })

  describe('when the figure is not on screen', () => {
    it('stays waiting when the observer reports it is not intersecting', () => {
      render(<RiseIn figure="3.98" />)
      scrollIntoView(false)
      expect(figureSpan('3.98')).toHaveAttribute('data-phase', 'waiting')
    })

    it('does not disconnect until the figure has actually intersected', () => {
      render(<RiseIn figure="3.98" />)
      scrollIntoView(false)
      expect(observers[0].disconnect).not.toHaveBeenCalled()
    })
  })

  describe('reduced motion', () => {
    it('stays shown with no inline style, and never starts an observer', () => {
      setReducedMotion(true)
      render(<RiseIn figure="3.98" />)
      expect(figureSpan('3.98')).toHaveAttribute('data-phase', 'shown')
      expect(figureSpan('3.98')).not.toHaveAttribute('style')
      expect(observers).toHaveLength(0)
    })
  })

  describe('no IntersectionObserver', () => {
    it('stays shown with no inline style when IntersectionObserver is not available', () => {
      // @ts-expect-error: simulate a browser without IntersectionObserver
      delete global.IntersectionObserver
      render(<RiseIn figure="3.98" />)
      expect(figureSpan('3.98')).toHaveAttribute('data-phase', 'shown')
      expect(figureSpan('3.98')).not.toHaveAttribute('style')
    })
  })

  describe('observer lifecycle', () => {
    it('disconnects on the first intersection, so it rises only once', () => {
      render(<RiseIn figure="3.98" />)
      scrollIntoView(true)
      expect(observers[0].disconnect).toHaveBeenCalled()
    })

    it('disconnects on unmount when the figure never came into view', () => {
      const { unmount } = render(<RiseIn figure="3.98" />)
      unmount()
      expect(observers[0].disconnect).toHaveBeenCalled()
    })

    it('leaves no console errors behind when it unmounts after rising', () => {
      const errors = jest.spyOn(console, 'error').mockImplementation(() => {})
      const { unmount } = render(<RiseIn figure="3.98" />)
      scrollIntoView(true)
      unmount()
      expect(errors).not.toHaveBeenCalled()
      errors.mockRestore()
    })
  })
})
