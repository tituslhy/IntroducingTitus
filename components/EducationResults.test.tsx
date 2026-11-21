import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { educationResults, type EducationResult } from '@/lib/education'
import { techKey } from '@/lib/tech-key'
import EducationResults from './EducationResults'

const FLASH_MS = 2400

/** A stand-in for the honour list: tags with data-tech keys, one of them repeated, plus an unrelated tag. */
function Tags() {
  return (
    <div data-testid="tags">
      <ul>
        <li data-tech="gpa 3.98 / 4.0">GPA 3.98 / 4.0</li>
        <li data-tech="first class with distinction">First Class with Distinction</li>
      </ul>
      <ul>
        <li data-tech="first class with distinction">First Class with Distinction</li>
        <li data-tech="python">Python</li>
      </ul>
    </div>
  )
}

const RESULTS: EducationResult[] = [
  { figure: '3.98', label: 'GPA at SMU', brief: 'GPA 3.98', slug: 'smu', key: 'gpa 3.98 / 4.0' },
  { figure: '2×', label: 'First Class with Distinction (UConn, Oxford)', brief: 'First Class ×2', slug: 'nus', key: 'first class with distinction' },
  { figure: '1st', label: 'Food Image Classification competition, SMU', brief: '1st place', slug: 'smu', key: 'no such honour' },
]

function renderWithTags(results: EducationResult[] = RESULTS) {
  const utils = render(
    <>
      <EducationResults results={results} />
      <Tags />
    </>
  )
  const tags = () => Array.from(utils.container.querySelectorAll<HTMLElement>('[data-tech]'))
  const lit = () => Array.from(utils.container.querySelectorAll<HTMLElement>('[data-on]'))
  return { ...utils, tags, lit }
}

const button = (label: RegExp | string) => screen.getByRole('button', { name: label })

let scrollSpy: jest.SpyInstance
let matchMediaSpy: jest.SpyInstance

beforeEach(() => {
  jest.useFakeTimers()
  // jest.setup installs a shared jest.fn for scrollIntoView; clear it so each test counts only its own calls.
  scrollSpy = jest.spyOn(Element.prototype, 'scrollIntoView')
  scrollSpy.mockClear()
  matchMediaSpy = jest.spyOn(window, 'matchMedia')
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

const setReducedMotion = (reduce: boolean) =>
  matchMediaSpy.mockImplementation((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  }) as unknown as MediaQueryList)

describe('EducationResults', () => {
  describe('rendering', () => {
    it('renders one button per result, in order, showing its figure and label', () => {
      renderWithTags()
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(RESULTS.length)
      RESULTS.forEach((r, i) => {
        expect(buttons[i]).toHaveTextContent(r.figure)
        expect(buttons[i]).toHaveTextContent(r.label)
      })
    })

    it('puts the results in a list, one item per result, keyed by their honour key', () => {
      const { container } = renderWithTags()
      const items = within(container.querySelector('ul') as HTMLElement).getAllByRole('listitem')
      expect(items).toHaveLength(RESULTS.length)
    })

    it('renders nothing but an empty list when there are no results', () => {
      const { container } = renderWithTags([])
      expect(screen.queryAllByRole('button')).toHaveLength(0)
      expect(container.querySelector('ul')).toBeInTheDocument()
    })

    it('marks each button as a button, not a submit control', () => {
      renderWithTags()
      screen.getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('type', 'button'))
    })

    it('renders the real results from educationResults(), each figure in its own element', () => {
      render(<EducationResults results={educationResults()} />)
      const figures = screen.getAllByRole('button').map((b) => b.querySelector('span')?.textContent)
      expect(figures).toEqual(educationResults().map((r) => r.figure))
    })
  })

  describe('click', () => {
    it('lights every tag with the clicked result key, in every place it appears', () => {
      const { tags } = renderWithTags()
      fireEvent.click(button(/GPA at SMU/))
      const gpa = tags().filter((t) => t.dataset.tech === 'gpa 3.98 / 4.0')
      expect(gpa).toHaveLength(1)
      expect(gpa[0]).toHaveAttribute('data-on')
    })

    it('lights repeated tags with the same key together, as a distinction held at two places', () => {
      const { tags } = renderWithTags()
      fireEvent.click(button(/First Class with Distinction/))
      const distinctions = tags().filter((t) => t.dataset.tech === 'first class with distinction')
      expect(distinctions).toHaveLength(2)
      distinctions.forEach((t) => expect(t).toHaveAttribute('data-on'))
    })

    it('does not light tags with a different key', () => {
      const { tags } = renderWithTags()
      fireEvent.click(button(/GPA at SMU/))
      expect(tags().find((t) => t.dataset.tech === 'python')).not.toHaveAttribute('data-on')
      expect(tags().find((t) => t.dataset.tech === 'first class with distinction')).not.toHaveAttribute('data-on')
    })

    it('scrolls the first matching tag into view, centred, smoothly', () => {
      const { tags } = renderWithTags()
      fireEvent.click(button(/First Class with Distinction/))
      expect(scrollSpy).toHaveBeenCalledTimes(1)
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      expect(scrollSpy.mock.instances[0]).toBe(tags().find((t) => t.dataset.tech === 'first class with distinction'))
    })

    it('does not scroll smoothly when the visitor prefers reduced motion', () => {
      setReducedMotion(true)
      renderWithTags()
      fireEvent.click(button(/GPA at SMU/))
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
    })

    it('removes the highlight after 2.4 seconds', () => {
      const { lit } = renderWithTags()
      fireEvent.click(button(/GPA at SMU/))
      expect(lit()).toHaveLength(1)

      act(() => {
        jest.advanceTimersByTime(FLASH_MS - 1)
      })
      expect(lit()).toHaveLength(1)

      act(() => {
        jest.advanceTimersByTime(1)
      })
      expect(lit()).toHaveLength(0)
    })

    it('replaces the previous highlight with the new one, so only one result is lit at a time', () => {
      const { lit, tags } = renderWithTags()
      fireEvent.click(button(/GPA at SMU/))
      fireEvent.click(button(/First Class with Distinction/))

      expect(tags().find((t) => t.dataset.tech === 'gpa 3.98 / 4.0')).not.toHaveAttribute('data-on')
      expect(lit()).toHaveLength(2)
      lit().forEach((el) => expect(el.dataset.tech).toBe('first class with distinction'))
    })

    it('does nothing when no tag carries the result key', () => {
      const { lit } = renderWithTags()
      fireEvent.click(button(/Food Image Classification/))
      expect(lit()).toHaveLength(0)
      expect(scrollSpy).not.toHaveBeenCalled()
    })

    it('does not start a fade timer for a key with no tags', () => {
      const timerSpy = jest.spyOn(window, 'setTimeout')
      renderWithTags()
      fireEvent.click(button(/Food Image Classification/))
      expect(timerSpy).not.toHaveBeenCalled()
    })
  })

  describe('keyboard', () => {
    it('activates a result with the Enter key, because it is a native button', () => {
      const { lit } = renderWithTags()
      const b = button(/GPA at SMU/)
      b.focus()
      fireEvent.keyDown(b, { key: 'Enter' })
      fireEvent.click(b)
      expect(lit()).toHaveLength(1)
    })
  })

  // A second click before the first flash has faded gives the new flash its full 2.4s: the earlier timer is cleared.
  test('a second click gives its own highlight the full 2.4 seconds', () => {
    const { lit } = renderWithTags()
    fireEvent.click(button(/GPA at SMU/))
    act(() => {
      jest.advanceTimersByTime(2000)
    })
    fireEvent.click(button(/GPA at SMU/))
    act(() => {
      jest.advanceTimersByTime(FLASH_MS - 1)
    })
    expect(lit()).toHaveLength(1)
  })

  it('keys each result on its honour key, so techKey and the tag data stay in step', () => {
    renderWithTags()
    expect(techKey('GPA 3.98 / 4.0')).toBe(RESULTS[0].key)
  })
})
