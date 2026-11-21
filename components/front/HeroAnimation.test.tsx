import { act, render, waitFor } from '@testing-library/react'
import HeroAnimation, { HERO_LOGO_NAMES } from './HeroAnimation'

/**
 * jsdom has no canvas, no layout and no ResizeObserver, so the animation is driven by hand:
 * a fake 2D context records what is drawn, a fake Image loads when the test says so, and
 * animation frames are queued until the test runs them.
 */

// --- fake 2D context: any method is a jest.fn, properties are stored as set --------------
function makeContext() {
  const store: Record<string, unknown> = { globalAlpha: 1 }
  const calls: Record<string, jest.Mock> = {}
  const ctx = new Proxy(store, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined
      if (prop in target) return target[prop]
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 6 })
      if (!(prop in calls)) calls[prop] = jest.fn()
      return calls[prop]
    },
    set(target, prop, value) {
      target[prop as string] = value
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, store, calls }
}

// --- fake Image: loads on demand, so tests can hold the logos back --------------------
class FakeImage {
  static instances: FakeImage[] = []
  static autoLoad = true
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  complete = false
  naturalWidth = 0
  private _src = ''

  constructor() {
    FakeImage.instances.push(this)
  }

  get src() {
    return this._src
  }

  set src(value: string) {
    this._src = value
    if (FakeImage.autoLoad) queueMicrotask(() => this.load())
  }

  load() {
    this.complete = true
    this.naturalWidth = 24
    this.onload?.()
  }
}

const reducedMotion = (reduce: boolean) =>
  jest.fn((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  })) as unknown as typeof window.matchMedia

function renderInStage(className?: string) {
  return render(
    <section data-hero-stage>
      <HeroAnimation className={className} />
    </section>
  )
}

describe('HeroAnimation', () => {
  let originalMatchMedia: typeof window.matchMedia
  let frames: FrameRequestCallback[]
  let getContext: jest.SpyInstance
  let fake: ReturnType<typeof makeContext>

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    window.matchMedia = reducedMotion(false)
    FakeImage.instances = []
    FakeImage.autoLoad = true
    global.Image = FakeImage as unknown as typeof Image

    // jsdom has no ResizeObserver; the component only observes, so a no-op is enough.
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    // A 800 x 400 stage, so the layout places logos.
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    fake = makeContext()
    getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake.ctx as never)

    frames = []
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    jest.restoreAllMocks()
  })

  /** Runs the queued animation frames once, at a fixed clock. */
  const runFrame = (now = 1000) => {
    const queued = frames
    frames = []
    act(() => queued.forEach((cb) => cb(now)))
  }

  it('mounts as a decorative layer: hidden from assistive tech, with a canvas', () => {
    const { container } = renderInStage('hero-x')
    const layer = container.querySelector('div[aria-hidden="true"]')
    expect(layer).toHaveClass('hero-anim', 'hero-x')
    expect(layer?.querySelector('canvas')).toBeInTheDocument()
  })

  it('does not throw and never marks itself ready when the browser has no 2D canvas', () => {
    getContext.mockReturnValue(null)
    const { container } = renderInStage()
    expect(container.querySelector('.hero-anim')).not.toHaveAttribute('data-ready')
    expect(FakeImage.instances).toHaveLength(0)
  })

  it('waits for the logos before starting, so the text and photo paint first', async () => {
    FakeImage.autoLoad = false
    const { container } = renderInStage()

    expect(container.querySelector('.hero-anim')).not.toHaveAttribute('data-ready')
    expect(frames).toHaveLength(0)
    expect(FakeImage.instances.length).toBeGreaterThan(0)

    act(() => FakeImage.instances.forEach((img) => img.load()))

    await waitFor(() => expect(container.querySelector('.hero-anim')).toHaveAttribute('data-ready', 'true'))
  })

  it('loads an ink and a colour SVG for every logo the animation uses', async () => {
    renderInStage()
    await waitFor(() => expect(FakeImage.instances.length).toBeGreaterThan(0))

    const sources = FakeImage.instances.map((img) => img.src)
    // Two files per logo: the ink version (drifting at rest) and the colour one (assembled).
    expect(sources.filter((s) => s.endsWith('.ink.svg'))).toHaveLength(HERO_LOGO_NAMES.length)
    expect(sources.filter((s) => s.endsWith('.colour.svg'))).toHaveLength(HERO_LOGO_NAMES.length)
    expect(sources.every((s) => s.startsWith('/logos/'))).toBe(true)
  })

  it('draws the first beat on the first animation frame once the logos are loaded', async () => {
    const { container } = renderInStage()
    await waitFor(() => expect(container.querySelector('.hero-anim')).toHaveAttribute('data-ready', 'true'))
    expect(frames.length).toBeGreaterThan(0)

    runFrame()

    expect(fake.calls.clearRect).toHaveBeenCalled()
    // The first beat is the all-logos beat, so every logo is drawn in colour.
    expect(fake.calls.drawImage.mock.calls.length).toBeGreaterThanOrEqual(HERO_LOGO_NAMES.length)
  })

  it('under reduced motion, draws each logo at rest in ink, once, and runs no animation', async () => {
    window.matchMedia = reducedMotion(true)
    const alphas: number[] = []
    const srcs: string[] = []
    fake.calls.drawImage ??= jest.fn()
    fake.calls.drawImage.mockImplementation((img: FakeImage) => {
      alphas.push(fake.store.globalAlpha as number)
      srcs.push(img.src)
    })

    const { container } = renderInStage()
    await waitFor(() => expect(container.querySelector('.hero-anim')).toHaveAttribute('data-ready', 'true'))

    expect(fake.calls.clearRect).toHaveBeenCalled()
    expect(fake.calls.drawImage).toHaveBeenCalledTimes(HERO_LOGO_NAMES.length)
    expect(alphas.every((a) => a === 0.3)).toBe(true)
    expect(srcs.every((s) => s.endsWith('.ink.svg'))).toBe(true)
    expect(frames).toHaveLength(0)
  })

  it('cancels its pending animation frame when it unmounts', async () => {
    const { container, unmount } = renderInStage()
    await waitFor(() => expect(container.querySelector('.hero-anim')).toHaveAttribute('data-ready', 'true'))
    expect(frames.length).toBeGreaterThan(0)

    unmount()

    expect(window.cancelAnimationFrame).toHaveBeenCalled()
  })
})
