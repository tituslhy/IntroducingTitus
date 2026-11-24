import { render, act } from '@testing-library/react'
import LoopFrame from './LoopFrame'
import { ProjectorMotion } from './Projector'

const SRC = '/projects/bassoon-bear.mp4'
const POSTER = '/projects/bassoon-bear-poster.webp'
const CAPTION = 'The name: a woodwind instrument I once thought was a bear · video made with Qwen'

type Entry = { isIntersecting: boolean }
type Instance = {
  callback: (entries: Entry[]) => void
  options?: IntersectionObserverInit
  observe: jest.Mock
  disconnect: jest.Mock
}

let instances: Instance[] = []
const RealIO = global.IntersectionObserver
const realMatchMedia = window.matchMedia

class FakeIntersectionObserver {
  observe: jest.Mock
  disconnect: jest.Mock
  unobserve = jest.fn()
  takeRecords = jest.fn(() => [])
  root = null
  rootMargin = ''
  thresholds: number[] = []
  constructor(callback: (entries: Entry[]) => void, options?: IntersectionObserverInit) {
    this.observe = jest.fn()
    this.disconnect = jest.fn()
    instances.push({ callback, options, observe: this.observe, disconnect: this.disconnect })
  }
}

/** Fires the most recent observer's callback as if the video crossed into or out of view. */
function setIntersecting(isIntersecting: boolean) {
  const io = instances[instances.length - 1]
  act(() => io.callback([{ isIntersecting }]))
}

const playMock = jest.fn<Promise<void> | undefined, []>()
const pauseMock = jest.fn<void, []>()
const RealPlay = HTMLMediaElement.prototype.play
const RealPause = HTMLMediaElement.prototype.pause

function setReducedMotion(matches: boolean) {
  window.matchMedia = jest.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  instances = []
  global.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver
  setReducedMotion(false)
  playMock.mockReset().mockResolvedValue(undefined)
  pauseMock.mockReset()
  HTMLMediaElement.prototype.play = playMock as unknown as typeof HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.pause = pauseMock as unknown as typeof HTMLMediaElement.prototype.pause
})

afterEach(() => {
  global.IntersectionObserver = RealIO
  window.matchMedia = realMatchMedia
  HTMLMediaElement.prototype.play = RealPlay
  HTMLMediaElement.prototype.pause = RealPause
})

describe('LoopFrame attributes', () => {
  it('renders a video with the source and poster it was given', () => {
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    const video = container.querySelector('video')!
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('src', SRC)
    expect(video).toHaveAttribute('poster', POSTER)
  })

  it('is muted, looping and inline, so it can autoplay on a phone', () => {
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    const video = container.querySelector('video')!
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video).toHaveAttribute('playsinline')
  })

  it('preloads only metadata', () => {
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(container.querySelector('video')).toHaveAttribute('preload', 'metadata')
  })

  it('names the video with its caption for assistive tech', () => {
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(container.querySelector('video')).toHaveAttribute('aria-label', CAPTION)
  })
})

describe('LoopFrame playback', () => {
  it('observes the video with a 0.25 visibility threshold', () => {
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(instances).toHaveLength(1)
    expect(instances[0].observe).toHaveBeenCalledWith(container.querySelector('video'))
    expect(instances[0].options).toEqual({ threshold: 0.25 })
  })

  it('does not play until the video comes into view', () => {
    render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(playMock).not.toHaveBeenCalled()
  })

  it('plays from the start when it intersects', () => {
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    const video = container.querySelector('video')!
    video.currentTime = 3
    setIntersecting(true)
    expect(video.currentTime).toBe(0)
    expect(playMock).toHaveBeenCalledTimes(1)
  })

  it('restarts from zero each time it comes back into view', () => {
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    const video = container.querySelector('video')!
    setIntersecting(true)
    video.currentTime = 4
    setIntersecting(false)
    setIntersecting(true)
    expect(video.currentTime).toBe(0)
    expect(playMock).toHaveBeenCalledTimes(2)
  })

  it('pauses when it leaves view, and does not play', () => {
    render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    setIntersecting(true)
    setIntersecting(false)
    expect(pauseMock).toHaveBeenCalledTimes(1)
    expect(playMock).toHaveBeenCalledTimes(1)
  })
})

describe('LoopFrame reduced motion', () => {
  it('sets up no observer when reduced motion is requested, so it never plays', () => {
    setReducedMotion(true)
    render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(instances).toHaveLength(0)
    expect(playMock).not.toHaveBeenCalled()
  })

  it('still renders the poster and video element under reduced motion', () => {
    setReducedMotion(true)
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(container.querySelector('video')).toHaveAttribute('poster', POSTER)
  })
})

describe('LoopFrame without IntersectionObserver', () => {
  it('renders without crashing and never plays', () => {
    global.IntersectionObserver = undefined as unknown as typeof IntersectionObserver
    const { container } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(container.querySelector('video')).toHaveAttribute('poster', POSTER)
    expect(playMock).not.toHaveBeenCalled()
  })
})

describe('LoopFrame play rejections', () => {
  it('swallows a rejected play() promise (e.g. autoplay blocked) without throwing', async () => {
    playMock.mockReturnValue(Promise.reject(new Error('NotAllowedError')))
    render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(() => setIntersecting(true)).not.toThrow()
    expect(playMock).toHaveBeenCalledTimes(1)
    // Let the rejection settle; an unhandled rejection would fail the test run.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  })

  it('copes with play() returning nothing', () => {
    playMock.mockReturnValue(undefined)
    render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(() => setIntersecting(true)).not.toThrow()
  })
})

describe('LoopFrame cleanup', () => {
  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />)
    expect(instances[0].disconnect).not.toHaveBeenCalled()
    unmount()
    expect(instances[0].disconnect).toHaveBeenCalledTimes(1)
  })
})

/** Renders a LoopFrame inside a projector's motion context, the way Projector wraps each frame. */
function renderIn(moving: boolean) {
  const ui = (value: boolean) => (
    <ProjectorMotion.Provider value={value}>
      <LoopFrame src={SRC} poster={POSTER} caption={CAPTION} />
    </ProjectorMotion.Provider>
  )
  const result = render(ui(moving))
  return { ...result, setMotion: (value: boolean) => result.rerender(ui(value)) }
}

describe('LoopFrame in a projector that has been paused', () => {
  it('pauses on mount and never plays', () => {
    renderIn(false)
    expect(pauseMock).toHaveBeenCalled()
    expect(playMock).not.toHaveBeenCalled()
  })

  it('does not play when it intersects', () => {
    renderIn(false)
    setIntersecting(true)
    expect(playMock).not.toHaveBeenCalled()
  })

  it('stays paused through a scroll into view and back out', () => {
    renderIn(false)
    setIntersecting(true)
    setIntersecting(false)
    setIntersecting(true)
    expect(playMock).not.toHaveBeenCalled()
  })
})

describe('LoopFrame when its projector pauses and plays again', () => {
  it('pauses when the projector switches from playing to paused, while on screen', () => {
    const { setMotion } = renderIn(true)
    setIntersecting(true)
    expect(playMock).toHaveBeenCalledTimes(1)
    expect(pauseMock).not.toHaveBeenCalled()

    setMotion(false)
    expect(pauseMock).toHaveBeenCalledTimes(1)
  })

  it('plays when the projector switches from paused to playing, while on screen', () => {
    const { setMotion } = renderIn(false)
    setIntersecting(true)
    expect(playMock).not.toHaveBeenCalled()

    setMotion(true)
    expect(playMock).toHaveBeenCalledTimes(1)
  })

  it('does not play on switching to playing while off screen, but plays on the next intersect', () => {
    const { setMotion } = renderIn(false)
    setMotion(true)
    expect(playMock).not.toHaveBeenCalled()

    setIntersecting(true)
    expect(playMock).toHaveBeenCalledTimes(1)
  })

  it('picks up where it stopped on Play, without restarting from zero', () => {
    const { container, setMotion } = renderIn(true)
    const video = container.querySelector('video')!
    setIntersecting(true)
    video.currentTime = 2
    setMotion(false)
    setMotion(true)
    expect(video.currentTime).toBe(2)
    expect(playMock).toHaveBeenCalledTimes(2)
  })

  it('never plays under reduced motion, even when the projector is playing', () => {
    setReducedMotion(true)
    const { setMotion } = renderIn(false)
    setMotion(true)
    expect(playMock).not.toHaveBeenCalled()
  })
})
