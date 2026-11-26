import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { REVEAL_EVENT } from '@/lib/reveal'
import ResultsRow, { type RowResult } from './ResultsRow'

const FLASH_MS = 2400

/** Stand-ins for tiles elsewhere on the page: one key repeated at two places, and an unrelated tile. */
function Tiles() {
  return (
    <div data-testid="tiles">
      <div data-tech="gpa 3.98 out of 4.0">GPA tile</div>
      <ul>
        <li data-tech="first class with distinction">Distinction, one</li>
        <li data-tech="first class with distinction">Distinction, two</li>
      </ul>
      <p data-tech="python">Python</p>
    </div>
  )
}

const RESULTS: RowResult[] = [
  { figure: '3.98', label: 'GPA at SMU', key: 'gpa 3.98 out of 4.0' },
  { figure: '2×', label: 'First Class with Distinction (UConn, Oxford)', key: 'first class with distinction' },
  { figure: '1st', label: 'Food Image Classification competition, SMU', key: 'no such tile' },
]

const originalMatchMedia = window.matchMedia

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    ...originalMatchMedia(query),
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
  })) as unknown as typeof window.matchMedia
}

const render_ = (results: RowResult[] = RESULTS) =>
  render(
    <>
      <ResultsRow results={results} />
      <Tiles />
    </>,
  )

const button = (label: RegExp) => screen.getByRole('button', { name: label })
const flashed = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('.result-flash'))

/** Clicks a result and lets its async handler (which may wait on a reveal) run to the end. */
const press = async (b: HTMLElement) => {
  await act(async () => {
    fireEvent.click(b)
  })
}

let scrollSpy: jest.SpyInstance
let frameSpy: jest.SpyInstance

beforeEach(() => {
  jest.useFakeTimers()
  scrollSpy = jest.spyOn(Element.prototype, 'scrollIntoView')
  scrollSpy.mockClear()
  setReducedMotion(false)
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  window.matchMedia = originalMatchMedia
})

describe('ResultsRow', () => {
  describe('rendering', () => {
    it('renders one button per result, in order, showing its figure and label', () => {
      render_()
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(RESULTS.length)
      RESULTS.forEach((r, i) => {
        expect(buttons[i]).toHaveTextContent(r.figure)
        expect(buttons[i]).toHaveTextContent(r.label)
      })
    })

    it('makes each result a native button, not a submit control', () => {
      render_()
      screen.getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('type', 'button'))
    })

    it('puts the results in a list, one item per result', () => {
      const { container } = render_()
      const list = container.querySelector('ul') as HTMLElement
      expect(within(list).getAllByRole('listitem')).toHaveLength(RESULTS.length)
    })

    it('renders an empty list and no buttons when there are no results', () => {
      render_([])
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })
  })

  describe('click', () => {
    it('scrolls the first matching tile into view, centred and smoothly', async () => {
      const { container } = render_()
      await press(button(/First Class with Distinction/))
      expect(scrollSpy).toHaveBeenCalledTimes(1)
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      expect(scrollSpy.mock.instances[0]).toBe(container.querySelectorAll('[data-tech="first class with distinction"]')[0])
    })

    it('does not scroll smoothly when the visitor prefers reduced motion', async () => {
      setReducedMotion(true)
      render_()
      await press(button(/GPA at SMU/))
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
    })

    it('flashes every tile with the clicked key, in every place it appears', async () => {
      const { container } = render_()
      await press(button(/First Class with Distinction/))
      const tiles = container.querySelectorAll<HTMLElement>('[data-tech="first class with distinction"]')
      expect(tiles).toHaveLength(2)
      tiles.forEach((t) => expect(t).toHaveClass('result-flash'))
    })

    it('does not flash tiles with a different key', async () => {
      const { container } = render_()
      await press(button(/GPA at SMU/))
      expect(flashed(container)).toHaveLength(1)
      expect(container.querySelector('[data-tech="python"]')).not.toHaveClass('result-flash')
      expect(container.querySelector('[data-tech="first class with distinction"]')).not.toHaveClass('result-flash')
    })

    it('removes the flash after 2.4 seconds, and not before', async () => {
      const { container } = render_()
      await press(button(/GPA at SMU/))
      expect(flashed(container)).toHaveLength(1)

      act(() => {
        jest.advanceTimersByTime(FLASH_MS - 1)
      })
      expect(flashed(container)).toHaveLength(1)

      act(() => {
        jest.advanceTimersByTime(1)
      })
      expect(flashed(container)).toHaveLength(0)
    })

    it('replaces the previous flash with the new one, so only one result is lit at a time', async () => {
      const { container } = render_()
      await press(button(/GPA at SMU/))
      await press(button(/First Class with Distinction/))

      expect(container.querySelector('[data-tech="gpa 3.98 out of 4.0"]')).not.toHaveClass('result-flash')
      expect(flashed(container)).toHaveLength(2)
      flashed(container).forEach((el) => expect(el.dataset.tech).toBe('first class with distinction'))
    })

    it('does nothing when no tile carries the result key', async () => {
      const { container } = render_()
      await press(button(/Food Image Classification/))
      expect(flashed(container)).toHaveLength(0)
      expect(scrollSpy).not.toHaveBeenCalled()
    })

    it('does not start a fade timer for a key with no tiles', async () => {
      const timerSpy = jest.spyOn(window, 'setTimeout')
      render_()
      await press(button(/Food Image Classification/))
      expect(timerSpy).not.toHaveBeenCalled()
      timerSpy.mockRestore()
    })

    it('gives a second click on the same result its own full 2.4 seconds', async () => {
      const { container } = render_()
      await press(button(/GPA at SMU/))
      act(() => {
        jest.advanceTimersByTime(2000)
      })
      await press(button(/GPA at SMU/))
      act(() => {
        jest.advanceTimersByTime(FLASH_MS - 1)
      })
      expect(flashed(container)).toHaveLength(1)
      act(() => {
        jest.advanceTimersByTime(1)
      })
      expect(flashed(container)).toHaveLength(0)
    })

    it('restarts the flash on a repeated click, even when the tile is already lit', async () => {
      const { container } = render_()
      await press(button(/GPA at SMU/))
      const tile = container.querySelector('[data-tech="gpa 3.98 out of 4.0"]')
      act(() => {
        jest.advanceTimersByTime(FLASH_MS - 100)
      })
      await press(button(/GPA at SMU/))
      expect(tile).toHaveClass('result-flash')
      expect(scrollSpy).toHaveBeenCalledTimes(2)
    })
  })

  it('activates a result from the keyboard, because it is a native button', async () => {
    const { container } = render_()
    const b = button(/GPA at SMU/)
    b.focus()
    expect(b).toHaveFocus()
    await press(b)
    expect(flashed(container)).toHaveLength(1)
  })

  describe('reveal before ringing', () => {
    /** A tile whose source is a role the page keeps hidden until asked for, like Experience's. */
    function HiddenRole({ hidden = true }: { hidden?: boolean }) {
      return (
        <div data-reveal="role-hidden" hidden={hidden}>
          <p data-tech="hidden key">Tile in a hidden role</p>
        </div>
      )
    }

    const HIDDEN_RESULT: RowResult[] = [{ figure: '9M', label: 'Hidden role result', key: 'hidden key' }]

    /** Plays PassDesk's part: on a reveal event for the box, un-hide it. Records each reveal. */
    function ownerThatUnhides(box: HTMLElement) {
      const revealed = jest.fn()
      const onReveal = (e: Event) => {
        revealed((e as CustomEvent).detail)
        box.hidden = false
      }
      document.addEventListener(REVEAL_EVENT, onReveal)
      return { revealed, stop: () => document.removeEventListener(REVEAL_EVENT, onReveal) }
    }

    beforeEach(() => {
      // Each animation frame runs at once, so the two frames a reveal waits for cost no time here.
      frameSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        cb(0)
        return 0
      })
    })

    it('shows the hidden source first, then rings and scrolls to its tile', async () => {
      const { container } = render(
        <>
          <ResultsRow results={HIDDEN_RESULT} />
          <HiddenRole />
        </>,
      )
      const box = container.querySelector<HTMLElement>('[data-reveal="role-hidden"]')!
      const owner = ownerThatUnhides(box)
      await press(button(/Hidden role result/))

      expect(owner.revealed).toHaveBeenCalledWith('role-hidden')
      expect(box.hidden).toBe(false)
      expect(container.querySelector('[data-tech="hidden key"]')).toHaveClass('result-flash')
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      expect(scrollSpy.mock.instances[0]).toBe(container.querySelector('[data-tech="hidden key"]'))
      owner.stop()
    })

    it('waits for the reveal to land before it scrolls', async () => {
      const order: string[] = []
      scrollSpy.mockImplementation(() => order.push('scroll'))
      const { container } = render(
        <>
          <ResultsRow results={HIDDEN_RESULT} />
          <HiddenRole />
        </>,
      )
      const box = container.querySelector<HTMLElement>('[data-reveal="role-hidden"]')!
      const onReveal = () => {
        order.push('reveal')
        box.hidden = false
      }
      document.addEventListener(REVEAL_EVENT, onReveal)
      await press(button(/Hidden role result/))
      document.removeEventListener(REVEAL_EVENT, onReveal)

      expect(order).toEqual(['reveal', 'scroll'])
    })

    it('rings and scrolls nothing when the hidden source stays hidden after the reveal', async () => {
      const { container } = render(
        <>
          <ResultsRow results={HIDDEN_RESULT} />
          <HiddenRole />
        </>,
      )
      await press(button(/Hidden role result/))
      expect(container.querySelector('[data-tech="hidden key"]')).not.toHaveClass('result-flash')
      expect(scrollSpy).not.toHaveBeenCalled()
    })

    it('does not reveal anything when the first matching tile is already showing', async () => {
      const { container } = render(
        <>
          <ResultsRow results={RESULTS} />
          <Tiles />
        </>,
      )
      const listener = jest.fn()
      document.addEventListener(REVEAL_EVENT, listener)
      await press(button(/GPA at SMU/))
      document.removeEventListener(REVEAL_EVENT, listener)

      expect(listener).not.toHaveBeenCalled()
      expect(container.querySelector('[data-tech="gpa 3.98 out of 4.0"]')).toHaveClass('result-flash')
    })

    it('rings only the matches that are showing: a hidden copy of the same key is skipped', async () => {
      const { container } = render(
        <>
          <ResultsRow results={[{ figure: '2×', label: 'Mixed visibility', key: 'mixed key' }]} />
          <div data-tech="mixed key" data-testid="visible-copy">Visible copy</div>
          <div data-reveal="role-x" hidden>
            <p data-tech="mixed key" data-testid="hidden-copy">Hidden copy</p>
          </div>
        </>,
      )
      await press(button(/Mixed visibility/))

      expect(screen.getByTestId('visible-copy')).toHaveClass('result-flash')
      expect(screen.getByTestId('hidden-copy')).not.toHaveClass('result-flash')
      expect(flashed(container)).toHaveLength(1)
    })

    it('does not ring a hidden copy even when the first match is the visible one', async () => {
      const { container } = render(
        <>
          <ResultsRow results={[{ figure: '2×', label: 'Visible first', key: 'order key' }]} />
          <div data-tech="order key">First, visible</div>
          <div data-reveal="role-y" hidden>
            <p data-tech="order key">Second, hidden</p>
          </div>
        </>,
      )
      await press(button(/Visible first/))
      expect(flashed(container).map((el) => el.textContent)).toEqual(['First, visible'])
    })

    it('does nothing with a hidden key that has no tile on the page at all', async () => {
      const listener = jest.fn()
      document.addEventListener(REVEAL_EVENT, listener)
      render(<ResultsRow results={[{ figure: '0', label: 'Ghost', key: 'no such key' }]} />)
      await press(button(/Ghost/))
      document.removeEventListener(REVEAL_EVENT, listener)
      expect(listener).not.toHaveBeenCalled()
      expect(scrollSpy).not.toHaveBeenCalled()
    })
  })
})
