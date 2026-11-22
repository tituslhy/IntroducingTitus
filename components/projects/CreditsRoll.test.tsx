import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { creditRef } from '@/lib/projects'
import { OPEN_SOURCE } from '@/lib/profile'
import CreditsRoll, { type Credit } from './CreditsRoll'

const credits: Credit[] = [
  {
    project: 'LlamaIndex',
    text: 'Integration with Microsoft LLMLingua2 prompt compression',
    href: 'https://github.com/run-llama/llama_index/pull/17531',
    ref: 'run-llama/llama_index · PR #17531',
  },
  { project: 'Chainlit', text: 'Chainlit-LlamaIndex cookbook', href: 'https://github.com/Chainlit/cookbook', ref: null },
]

// --- Layout: the roll is 2000px tall, its stage 500px, its list 1000px; the window top is where the test puts it. ---
const STAGE = 500
const LIST = 1000
const ROLL = 2000
const SPAN = ROLL - STAGE // 1500
const FROM = STAGE * 0.75 // 375: just below the stage
const TO = -(LIST - STAGE * 0.55) // -725: just above it
const STAGE_TOP = 70

let rollTop = STAGE_TOP
const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!
const originalRect = Element.prototype.getBoundingClientRect

const kindOf = (el: Element) => (el.classList.contains('credits-roll') ? 'roll' : el.classList.contains('credits-stage') ? 'stage' : el.classList.contains('credits-list') ? 'list' : '')

// --- requestAnimationFrame: frames wait in a queue until the test runs them; cancelling removes them. ---
let queue = new Map<number, FrameRequestCallback>()
let nextId = 1
const originalRaf = global.requestAnimationFrame
const originalCaf = global.cancelAnimationFrame
const flush = () =>
  act(() => {
    const frames = [...queue.values()]
    queue.clear()
    frames.forEach((cb) => cb(0))
  })

// --- matchMedia and scrollTo ---
const originalMatchMedia = window.matchMedia
const originalScrollTo = window.scrollTo

function setReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn(
    (query: string) => ({ matches: reduce, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn() }) as unknown as MediaQueryList,
  ) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  rollTop = STAGE_TOP
  queue = new Map()
  nextId = 1
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const k = kindOf(this)
      return k === 'roll' ? ROLL : k === 'stage' ? STAGE : k === 'list' ? LIST : 0
    },
  })
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return { top: kindOf(this) === 'roll' ? rollTop : 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect
  }
  global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
    const id = nextId++
    queue.set(id, cb)
    return id
  }) as unknown as typeof requestAnimationFrame
  global.cancelAnimationFrame = jest.fn((id: number) => {
    queue.delete(id)
  }) as unknown as typeof cancelAnimationFrame
  window.scrollTo = jest.fn() as unknown as typeof window.scrollTo
  setReducedMotion(false)
})

afterEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeight)
  Element.prototype.getBoundingClientRect = originalRect
  global.requestAnimationFrame = originalRaf
  global.cancelAnimationFrame = originalCaf
  window.matchMedia = originalMatchMedia
  window.scrollTo = originalScrollTo
})

const section = () => document.querySelector('section#open-source') as HTMLElement
const roll = () => document.querySelector('.credits-roll') as HTMLElement
const list = () => document.querySelector('.credits-list') as HTMLElement
const transform = () => list().style.transform

describe('CreditsRoll: markup', () => {
  it('is the Open source section, named by its heading', () => {
    render(<CreditsRoll credits={credits} />)
    expect(screen.getByRole('region', { name: 'Open source' })).toBe(section())
    expect(screen.getByRole('heading', { level: 3, name: 'Open source' })).toBeInTheDocument()
  })

  it('says what the credits are, and how many there are, with the link note', () => {
    render(<CreditsRoll credits={credits} />)
    expect(screen.getByText('Merged into the frameworks I use.')).toBeInTheDocument()
    expect(screen.getByText('2 contributions · each links to its pull request or commit')).toBeInTheDocument()
  })

  it('lists each project as a term, with its contribution as the definition beside it', () => {
    render(<CreditsRoll credits={credits} />)
    const terms = within(section()).getAllByRole('term')
    const definitions = within(section()).getAllByRole('definition')
    expect(terms.map((t) => t.textContent)).toEqual(['LlamaIndex', 'Chainlit'])
    expect(definitions).toHaveLength(2)
  })

  it('links each contribution to its href, in a new tab, safely', () => {
    render(<CreditsRoll credits={credits} />)
    const links = within(section()).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(credits.map((c) => c.href))
    links.forEach((l) => {
      expect(l).toHaveAttribute('target', '_blank')
      expect(l).toHaveAttribute('rel', 'noopener noreferrer')
    })
    expect(links[0]).toHaveTextContent('Integration with Microsoft LLMLingua2 prompt compression')
  })

  it('shows the ref line under a contribution that has one', () => {
    render(<CreditsRoll credits={credits} />)
    const first = within(section()).getAllByRole('definition')[0]
    expect(within(first).getByText('run-llama/llama_index · PR #17531')).toBeInTheDocument()
  })

  it('shows no ref line under a contribution without one', () => {
    render(<CreditsRoll credits={credits} />)
    const second = within(section()).getAllByRole('definition')[1]
    expect(second.querySelector('.font-mono')).toBeNull()
    expect(second.textContent).toBe('Chainlit-LlamaIndex cookbook ↗')
  })

  it('shows the ref for every real open-source credit', () => {
    render(<CreditsRoll credits={OPEN_SOURCE.map((o) => ({ ...o, ref: creditRef(o.href) }))} />)
    for (const o of OPEN_SOURCE) {
      expect(screen.getByText(creditRef(o.href)!)).toBeInTheDocument()
    }
  })

  it('renders the footer after the credits, inside the section', () => {
    render(<CreditsRoll credits={credits} footer={<button type="button">Ask about my open source work</button>} />)
    const footer = screen.getByRole('button', { name: 'Ask about my open source work' })
    expect(section().contains(footer)).toBe(true)
  })
})

describe('CreditsRoll: reduced motion', () => {
  it('is a still list: no rolling, no transform', () => {
    setReducedMotion(true)
    render(<CreditsRoll credits={credits} />)
    expect(roll()).not.toHaveAttribute('data-rolling')
    expect(transform()).toBe('')
  })

  it('does not follow the scroll either', () => {
    setReducedMotion(true)
    render(<CreditsRoll credits={credits} />)
    rollTop = -1000
    fireEvent.scroll(window)
    flush()
    expect(transform()).toBe('')
    expect(queue.size).toBe(0)
  })

  it('is still, too, where matchMedia is missing', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    render(<CreditsRoll credits={credits} />)
    expect(roll()).not.toHaveAttribute('data-rolling')
    expect(transform()).toBe('')
  })
})

describe('CreditsRoll: rolling', () => {
  it('marks the roll as rolling, and places the list just below the stage to begin', () => {
    render(<CreditsRoll credits={credits} />)
    expect(roll()).toHaveAttribute('data-rolling')
    expect(transform()).toBe(`translateY(${FROM}px)`)
  })

  it('moves the list up as the section scrolls through the stage', () => {
    render(<CreditsRoll credits={credits} />)
    rollTop = STAGE_TOP - SPAN / 2
    fireEvent.scroll(window)
    expect(transform()).toBe(`translateY(${FROM}px)`)
    flush()
    expect(transform()).toBe(`translateY(${(FROM + TO) / 2}px)`)
  })

  it('finishes just above the stage once the section has scrolled past, and holds there', () => {
    render(<CreditsRoll credits={credits} />)
    rollTop = STAGE_TOP - SPAN - 500
    fireEvent.scroll(window)
    flush()
    expect(transform()).toBe(`translateY(${TO}px)`)
  })

  it('stays at the start while the section is still below the stage', () => {
    render(<CreditsRoll credits={credits} />)
    rollTop = STAGE_TOP + 300
    fireEvent.scroll(window)
    flush()
    expect(transform()).toBe(`translateY(${FROM}px)`)
  })

  it('updates once per frame, however many scroll events come in before it', () => {
    render(<CreditsRoll credits={credits} />)
    rollTop = STAGE_TOP - SPAN / 2
    fireEvent.scroll(window)
    fireEvent.scroll(window)
    fireEvent.scroll(window)
    expect(queue.size).toBe(1)
  })

  it('also updates on resize', () => {
    render(<CreditsRoll credits={credits} />)
    rollTop = STAGE_TOP - SPAN
    fireEvent(window, new Event('resize'))
    flush()
    expect(transform()).toBe(`translateY(${TO}px)`)
  })

  it('scrolls the page to a credit that gets focus, so it sits mid-stage, once its frame runs', () => {
    render(<CreditsRoll credits={credits} />)
    fireEvent.focusIn(within(section()).getAllByRole('link')[0])
    // Deferred to the next frame, so the browser's own scroll-to-focus has run first.
    expect(window.scrollTo).not.toHaveBeenCalled()
    flush()
    // The credit sits at the list's top (offsetTop 0 in jsdom): it needs the list at half the stage.
    const p = (FROM - STAGE / 2) / (FROM - TO)
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
    expect((window.scrollTo as jest.Mock).mock.calls[0][0].top).toBeCloseTo(SPAN * p, 5)
  })

  it('lets a second focus replace the first one still waiting, so the page scrolls once', () => {
    render(<CreditsRoll credits={credits} />)
    const links = within(section()).getAllByRole('link')
    fireEvent.focusIn(links[0])
    fireEvent.focusIn(links[1])
    expect(queue.size).toBe(1)
    flush()
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending focus frame when it leaves the page, so no scroll happens after', () => {
    const { unmount } = render(<CreditsRoll credits={credits} />)
    fireEvent.focusIn(within(section()).getAllByRole('link')[0])
    expect(queue.size).toBe(1)
    unmount()
    expect(global.cancelAnimationFrame).toHaveBeenCalledWith(1)
    flush()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('leaves the page alone when focus lands outside the list', () => {
    render(<CreditsRoll credits={credits} footer={<button type="button">Ask</button>} />)
    fireEvent.focusIn(screen.getByRole('button', { name: 'Ask' }))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})

describe('CreditsRoll: clean up', () => {
  it('takes the rolling and the transform off when it leaves the page', () => {
    const { unmount } = render(<CreditsRoll credits={credits} />)
    const r = roll()
    const l = list()
    expect(r).toHaveAttribute('data-rolling')
    expect(l.style.transform).not.toBe('')
    unmount()
    expect(r).not.toHaveAttribute('data-rolling')
    expect(l.style.transform).toBe('')
  })

  it('stops listening to scroll, resize and focus once it has gone', () => {
    const { unmount } = render(<CreditsRoll credits={credits} />)
    const link = within(section()).getAllByRole('link')[0]
    unmount()
    fireEvent.scroll(window)
    fireEvent(window, new Event('resize'))
    fireEvent.focusIn(link)
    expect(queue.size).toBe(0)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('cancels a frame that is still waiting when it leaves the page', () => {
    const { unmount } = render(<CreditsRoll credits={credits} />)
    rollTop = STAGE_TOP - SPAN / 2
    fireEvent.scroll(window)
    unmount()
    expect(global.cancelAnimationFrame).toHaveBeenCalledWith(1)
  })
})
