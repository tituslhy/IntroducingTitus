import { act, render } from '@testing-library/react'
import TypedText from './TypedText'

const TEXT = 'One two three four five'
/** One tick of the typer: 12 words a second. */
const TICK = 1000 / 12

/**
 * What has been typed so far: the aria-hidden span's own text. The untyped rest sits after it in an invisible
 * (opacity-0) span, so the box keeps its full size; the accessible name is the outer span's aria-label.
 */
const typed = (container: HTMLElement) => {
  const clone = container.querySelector('[aria-hidden="true"]')!.cloneNode(true) as HTMLElement
  clone.querySelectorAll('.opacity-0').forEach((el) => el.remove())
  return clone.textContent
}
/** The visually hidden full copy that screen readers read, whatever has been typed so far. */
const readAloud = (container: HTMLElement) => container.querySelector('.sr-only')?.textContent ?? null
/** The untyped rest, which is laid out but invisible. */
const untyped = (container: HTMLElement) => container.querySelector('.opacity-0')?.textContent ?? ''

beforeEach(() => {
  jest.useFakeTimers()
})
afterEach(() => {
  jest.useRealTimers()
})

describe('TypedText', () => {
  it('has the full text in a visually hidden copy from the first frame', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    expect(readAloud(container)).toBe(TEXT)
    expect(container.querySelectorAll('.sr-only')).toHaveLength(1)
  })

  it('has no aria-label: the narration is read from its text, once', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    expect(container.querySelector('[aria-label]')).toBeNull()
  })

  it('starts empty and types word by word', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    expect(typed(container)).toBe('')
    act(() => void jest.advanceTimersByTime(TICK))
    expect(typed(container)).toBe('One ')
    act(() => void jest.advanceTimersByTime(TICK))
    expect(typed(container)).toBe('One two ')
  })

  it('types 12 words a second', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    act(() => void jest.advanceTimersByTime(1000))
    // 12 ticks is more than the five words here, so it is whole.
    expect(typed(container)).toBe(TEXT)
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')
    const { container: c2 } = render(<TypedText text={long} instant={false} />)
    act(() => void jest.advanceTimersByTime(1000))
    expect(typed(c2).trim().split(/\s+/)).toHaveLength(12)
  })

  it('lays the untyped rest out invisibly, so the box is its full size from the start and nothing below jumps', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    expect(untyped(container)).toBe(TEXT)
    expect(container.querySelector('.opacity-0')).toHaveTextContent(TEXT)
    act(() => void jest.advanceTimersByTime(TICK))
    expect(typed(container)).toBe('One ')
    expect(untyped(container)).toBe('two three four five')
    // Typed and untyped together are always the whole text.
    expect(typed(container) + untyped(container)).toBe(TEXT)
  })

  it('has nothing left invisible once it has finished, or when instant', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    act(() => void jest.advanceTimersByTime(TICK * 10))
    expect(untyped(container)).toBe('')
    const { container: c2 } = render(<TypedText text={TEXT} instant />)
    expect(untyped(c2)).toBe('')
  })

  it('ends on the whole text, and stays there', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    act(() => void jest.advanceTimersByTime(TICK * 10))
    expect(typed(container)).toBe(TEXT)
    act(() => void jest.advanceTimersByTime(5000))
    expect(typed(container)).toBe(TEXT)
  })

  it('stops its timer when it has finished', () => {
    render(<TypedText text={TEXT} instant={false} />)
    act(() => void jest.advanceTimersByTime(TICK * 10))
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps the whitespace between words, newlines included', () => {
    const { container } = render(<TypedText text={'One\n\ntwo   three'} instant={false} />)
    act(() => void jest.advanceTimersByTime(TICK * 10))
    expect(typed(container)).toBe('One\n\ntwo   three')
  })

  it('shows the whole text at once when instant, with no timer running', () => {
    const { container } = render(<TypedText text={TEXT} instant />)
    expect(typed(container)).toBe(TEXT)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps the full hidden copy when instant too', () => {
    const { container } = render(<TypedText text={TEXT} instant />)
    expect(readAloud(container)).toBe(TEXT)
  })

  it('shows nothing for empty text, and does not throw', () => {
    const { container } = render(<TypedText text="" instant={false} />)
    act(() => void jest.advanceTimersByTime(TICK * 3))
    expect(typed(container)).toBe('')
  })

  it('clears its timer on unmount', () => {
    const { unmount } = render(<TypedText text={TEXT} instant={false} />)
    unmount()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('hides the typed words from screen readers, so they never hear half a sentence, or the sentence twice', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    const visible = container.querySelector('[aria-hidden="true"]')!
    expect(visible).toBeInTheDocument()
    expect(visible.querySelector('.sr-only')).toBeNull()
    expect(container.querySelector('.sr-only')!.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('keeps the hidden copy whole while the visible part types', () => {
    const { container } = render(<TypedText text={TEXT} instant={false} />)
    act(() => void jest.advanceTimersByTime(TICK * 2))
    expect(typed(container)).toBe('One two ')
    expect(readAloud(container)).toBe(TEXT)
  })

  it('types a new text from the start when given a new key', () => {
    const { container, rerender } = render(<TypedText key="a" text={TEXT} instant={false} />)
    act(() => void jest.advanceTimersByTime(TICK * 10))
    expect(typed(container)).toBe(TEXT)
    rerender(<TypedText key="b" text="Six seven eight" instant={false} />)
    expect(typed(container)).toBe('')
    act(() => void jest.advanceTimersByTime(TICK))
    expect(typed(container)).toBe('Six ')
  })
})
