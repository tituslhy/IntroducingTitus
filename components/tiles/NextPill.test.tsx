import { act, fireEvent, render } from '@testing-library/react'
import NextPill, { nextStop, type Stop } from './NextPill'

const STOPS: Stop[] = [
  { id: 'one', name: 'First' },
  { id: 'two', name: 'Second' },
  { id: 'three', name: 'Third' },
]

const INNER_HEIGHT = 800 // the fold sits at 85% of this: 680px
const SCROLL_HEIGHT = 3000 // the page end is 40px above the bottom of the window
const originalMatchMedia = window.matchMedia

/** Sets the window's scroll position and fires a scroll event, as a real scroll would. */
function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

/** Places the page's sections at the given tops (relative to the window), each with a stubbed scrollIntoView. */
function place(tops: Record<string, number>) {
  for (const [id, top] of Object.entries(tops)) {
    let el = document.getElementById(id)
    if (!el) {
      el = document.createElement('section')
      el.id = id
      document.body.appendChild(el)
    }
    el.getBoundingClientRect = () => ({ top }) as DOMRect
    el.scrollIntoView = jest.fn()
  }
}

const sectionEl = (id: string) => document.getElementById(id) as HTMLElement

const pill = (container: HTMLElement) => container.querySelector('button') as HTMLButtonElement

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: INNER_HEIGHT, configurable: true, writable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: SCROLL_HEIGHT, configurable: true })
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true })
  // Every section starts below the fold, so the pill has a next stop to name.
  place({ one: 100, two: 900, three: 1200 })
})

afterEach(() => {
  document.body.replaceChildren()
  window.matchMedia = originalMatchMedia
})

describe('nextStop', () => {
  it('is the first stop whose top is below the fold', () => {
    const tops: Record<string, number> = { one: 100, two: 700, three: 900 }
    expect(nextStop(STOPS, (id) => tops[id], 680)?.id).toBe('two')
  })

  it('skips a stop that is exactly at the fold', () => {
    const tops: Record<string, number> = { one: 100, two: 680, three: 900 }
    expect(nextStop(STOPS, (id) => tops[id], 680)?.id).toBe('three')
  })

  it('treats a missing element as above the fold, so it is skipped', () => {
    const tops: Record<string, number | undefined> = { one: undefined, two: 700, three: 900 }
    expect(nextStop(STOPS, (id) => tops[id], 680)?.id).toBe('two')
  })

  it('is null when every stop is above the fold', () => {
    const tops: Record<string, number> = { one: 10, two: 20, three: 30 }
    expect(nextStop(STOPS, (id) => tops[id], 680)).toBeNull()
  })

  it('is null when there are no stops', () => {
    expect(nextStop([], () => 999, 680)).toBeNull()
  })

  it('ignores stops below the next one, even when they are further down', () => {
    const tops: Record<string, number> = { one: 900, two: 100, three: 1200 }
    expect(nextStop(STOPS, (id) => tops[id], 680)?.id).toBe('one')
  })
})

describe('NextPill', () => {
  it('names the next section still out of view', () => {
    const { container } = render(<NextPill stops={STOPS} />)
    scrollTo(300)
    expect(container.textContent).toContain('Next')
    expect(container.textContent).toContain('Second')
  })

  it('is a button that is shown when it has a next stop past the top of the page', () => {
    const { container } = render(<NextPill stops={STOPS} />)
    scrollTo(300)
    const button = pill(container)
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('aria-hidden', 'false')
    expect(button).toHaveAttribute('tabindex', '0')
    expect(button).toHaveClass('opacity-100')
    expect(button).not.toHaveClass('pointer-events-none')
  })

  describe('hidden', () => {
    const expectHidden = (button: HTMLButtonElement) => {
      expect(button).toHaveAttribute('aria-hidden', 'true')
      expect(button).toHaveAttribute('tabindex', '-1')
      expect(button).toHaveClass('opacity-0')
      expect(button).toHaveClass('pointer-events-none')
    }

    it('near the top of the page, above 200px', () => {
      const { container } = render(<NextPill stops={STOPS} />)
      expectHidden(pill(container))
      scrollTo(199)
      expectHidden(pill(container))
    })

    it('shows once the reader is 200px down', () => {
      const { container } = render(<NextPill stops={STOPS} />)
      scrollTo(200)
      expect(pill(container)).toHaveAttribute('aria-hidden', 'false')
    })

    it('at the page end, when 40px or less of the page is left below the window', () => {
      const { container } = render(<NextPill stops={STOPS} />)
      scrollTo(2160) // 800 + 2160 = 2960 = 3000 - 40
      expectHidden(pill(container))
    })

    it('not yet at the page end, while more than 40px is still below', () => {
      const { container } = render(<NextPill stops={STOPS} />)
      scrollTo(2159)
      expect(pill(container)).toHaveAttribute('aria-hidden', 'false')
    })

    it('when there is no next stop left to name', () => {
      place({ one: 10, two: 20, three: 30 })
      const { container } = render(<NextPill stops={STOPS} />)
      scrollTo(300)
      expectHidden(pill(container))
      expect(pill(container).textContent).not.toContain('First')
    })

    it('when given no stops at all', () => {
      const { container } = render(<NextPill stops={[]} />)
      scrollTo(300)
      expectHidden(pill(container))
    })
  })

  it('follows the reader: the next stop changes as sections scroll past the fold', () => {
    const { container } = render(<NextPill stops={STOPS} />)
    scrollTo(300)
    expect(pill(container).textContent).toContain('Second')

    // Once the second section has come up past the fold, the third is next.
    place({ one: -500, two: 100, three: 900 })
    scrollTo(800)
    expect(pill(container).textContent).toContain('Third')
  })

  it('updates on resize, since a taller window changes where the fold is', () => {
    const { container } = render(<NextPill stops={STOPS} />)
    scrollTo(300)
    expect(pill(container).textContent).toContain('Second')

    // A taller window moves the fold down to 1700px: the second section is now above it, the third below.
    Object.defineProperty(window, 'innerHeight', { value: 2000, configurable: true, writable: true })
    place({ one: 100, two: 900, three: 1800 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(pill(container).textContent).toContain('Third')
  })

  it('scrolls the next stop into view, smoothly, when clicked', () => {
    const { container } = render(<NextPill stops={STOPS} />)
    scrollTo(300)
    fireEvent.click(pill(container))
    expect(sectionEl('two').scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
    expect(sectionEl('three').scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls without animation when the reader prefers reduced motion', () => {
    window.matchMedia = jest.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      onchange: null,
      dispatchEvent: jest.fn(),
    })) as unknown as typeof window.matchMedia
    const { container } = render(<NextPill stops={STOPS} />)
    scrollTo(300)
    fireEvent.click(pill(container))
    expect(sectionEl('two').scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' })
  })

  it('does nothing when clicked with no next stop', () => {
    place({ one: 10, two: 20, three: 30 })
    const { container } = render(<NextPill stops={STOPS} />)
    scrollTo(300)
    expect(() => fireEvent.click(pill(container))).not.toThrow()
    for (const id of ['one', 'two', 'three']) expect(sectionEl(id).scrollIntoView).not.toHaveBeenCalled()
  })

  it('listens for scroll (passively) and resize, then removes both listeners on unmount', () => {
    const add = jest.spyOn(window, 'addEventListener')
    const remove = jest.spyOn(window, 'removeEventListener')
    const { unmount } = render(<NextPill stops={STOPS} />)

    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    expect(add).toHaveBeenCalledWith('resize', expect.any(Function))

    unmount()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))

    add.mockRestore()
    remove.mockRestore()
  })

  it('stops reacting to scroll after it unmounts', () => {
    const { container, unmount } = render(<NextPill stops={STOPS} />)
    scrollTo(300)
    const button = pill(container)
    expect(button).toHaveAttribute('aria-hidden', 'false')
    unmount()
    // The button is gone; a later scroll must not throw or touch the removed element.
    expect(() => scrollTo(0)).not.toThrow()
    expect(button).toHaveAttribute('aria-hidden', 'false')
  })
})
