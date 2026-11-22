import { act, render, screen, within } from '@testing-library/react'
import Programme, { type ProgrammeStop } from './Programme'

// --- IntersectionObserver: the test reports which section is crossing the reading band. ---
const OriginalIntersectionObserver = global.IntersectionObserver
let report: (entries: Array<Partial<IntersectionObserverEntry>>) => void = () => {}
let observe: jest.Mock
let disconnect: jest.Mock

function mockIntersectionObserver() {
  observe = jest.fn()
  disconnect = jest.fn()
  const observeSpy = observe
  const disconnectSpy = disconnect
  global.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      report = (entries) => cb(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
    }
    observe = observeSpy
    unobserve() {}
    disconnect = disconnectSpy
  } as unknown as typeof IntersectionObserver
}

const stops: ProgrammeStop[] = [
  { id: 'one', name: 'First', n: 1 },
  { id: 'two', name: 'Second', n: 2 },
  { id: 'earlier', name: 'Earlier work', count: 8 },
]

/** The stops' sections, rendered beside the programme so the observer has something to find. */
function renderWithSections(list: ProgrammeStop[] = stops) {
  return render(
    <>
      <Programme stops={list} />
      <section id="one" />
      <section id="two" />
      <section id="earlier" />
    </>,
  )
}

const link = (id: string) => screen.getByRole('navigation', { name: 'On this page' }).querySelector(`[data-stop="${id}"]`) as HTMLElement
const crossing = (id: string) => ({ isIntersecting: true, target: document.getElementById(id)! })

beforeEach(() => {
  mockIntersectionObserver()
})

afterEach(() => {
  global.IntersectionObserver = OriginalIntersectionObserver
})

describe('Programme', () => {
  it('is a labelled navigation with one link to each stop’s section', () => {
    renderWithSections()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#one', '#two', '#earlier'])
    expect(links.map((l) => l.getAttribute('data-stop'))).toEqual(['one', 'two', 'earlier'])
  })

  it('shows the number of a numbered stop, and the count of a counted one', () => {
    renderWithSections()
    expect(link('one')).toHaveTextContent('1First')
    expect(link('one').querySelectorAll('b')).toHaveLength(1)
    expect(link('two')).toHaveTextContent('2Second')
    expect(link('earlier')).toHaveTextContent('Earlier work8')
    expect(link('earlier').querySelectorAll('b')).toHaveLength(1)
    expect(link('earlier').querySelector('b')).toHaveTextContent('8')
  })

  it('shows neither a number nor a count for a plain stop', () => {
    renderWithSections([{ id: 'one', name: 'Plain' }])
    expect(link('one')).toHaveTextContent(/^Plain$/)
    expect(link('one').querySelectorAll('b')).toHaveLength(0)
  })

  it('observes every section that exists, and skips a stop with no section on the page', () => {
    renderWithSections([...stops, { id: 'missing', name: 'Gone' }])
    expect(observe.mock.calls.map((c) => (c[0] as Element).id)).toEqual(['one', 'two', 'earlier'])
  })

  it('stops observing when it leaves the page', () => {
    const { unmount } = renderWithSections()
    expect(disconnect).not.toHaveBeenCalled()
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })

  it('marks only the stop whose section is crossing the reading band as current', () => {
    renderWithSections()
    expect(link('one')).not.toHaveAttribute('aria-current')

    act(() => report([crossing('two')]))
    expect(link('two')).toHaveAttribute('aria-current', 'true')
    expect(link('one')).not.toHaveAttribute('aria-current')
    expect(link('earlier')).not.toHaveAttribute('aria-current')
  })

  it('moves the mark on as the reader moves down the page', () => {
    renderWithSections()
    act(() => report([crossing('one')]))
    act(() => report([crossing('earlier')]))
    expect(link('earlier')).toHaveAttribute('aria-current', 'true')
    expect(link('one')).not.toHaveAttribute('aria-current')
  })

  it('ignores a section that has left the band', () => {
    renderWithSections()
    act(() => report([crossing('two')]))
    act(() => report([{ isIntersecting: false, target: document.getElementById('two')! }]))
    expect(link('two')).toHaveAttribute('aria-current', 'true')
  })

  it('keeps the marked stop in view along the row, without scrolling the page', () => {
    const originalScrollTo = Element.prototype.scrollTo
    const scrollTo = jest.fn()
    Element.prototype.scrollTo = scrollTo
    try {
      renderWithSections()
      act(() => report([crossing('earlier')]))
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    } finally {
      Element.prototype.scrollTo = originalScrollTo
    }
  })

  it('still renders, with no mark, where IntersectionObserver is unavailable', () => {
    // @ts-expect-error: simulating a browser without IntersectionObserver
    global.IntersectionObserver = undefined
    renderWithSections()
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeInTheDocument()
    stops.forEach((s) => expect(link(s.id)).not.toHaveAttribute('aria-current'))
  })
})
