import { useContext } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { reveal } from '@/lib/reveal'
import Projector, { DEFAULT_MS, PROJECTOR_PAUSE, ProjectorMotion, type ProjectorFrame } from './Projector'

const frames: ProjectorFrame[] = [
  { node: <p>Slide one</p>, thumb: <span>T1</span>, caption: 'First caption', ms: 1000 },
  { node: <p>Slide two</p>, thumb: <span>T2</span>, caption: 'Second caption' },
  { node: <p>Slide three</p>, thumb: <span>T3</span>, caption: 'Third caption' },
]

// --- IntersectionObserver: the test decides when the projector is on screen. ---
const OriginalIntersectionObserver = global.IntersectionObserver
let reportIntersection: (on: boolean) => void = () => {}

function mockIntersectionObserver() {
  global.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
      reportIntersection = (on) => cb([{ isIntersecting: on } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
}

const onScreen = (on: boolean) => act(() => reportIntersection(on))

// --- matchMedia: the test decides whether the visitor asked for reduced motion. ---
const OriginalMatchMedia = window.matchMedia

function setReducedMotion(on: boolean) {
  window.matchMedia = jest.fn(
    (query: string) =>
      ({
        matches: on,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(() => true),
      }) as unknown as MediaQueryList,
  ) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  mockIntersectionObserver()
  setReducedMotion(false)
})

afterEach(() => {
  global.IntersectionObserver = OriginalIntersectionObserver
  window.matchMedia = OriginalMatchMedia
})

const group = () => screen.getByRole('group', { name: 'Test reel' })
const bar = () => group().querySelector('.projector-bar') as HTMLElement
const endBar = () => fireEvent.animationEnd(bar())
const thumb = (n: number) => screen.getByRole('button', { name: `Frame ${n}: ${frames[n - 1].caption}` })
const pauseButton = () => screen.queryByRole('button', { name: '❚❚ Pause' })
const playButton = () => screen.queryByRole('button', { name: '▶ Play' })
const isVisible = (i: number) => !group().querySelector(`[data-reveal="${i}"]`)!.hasAttribute('hidden')
// The caption row is the only paragraph outside the frames (a frame's own text can be a paragraph too).
const caption = () => Array.from(group().querySelectorAll('p')).find((p) => !p.closest('[data-reveal]')) as HTMLElement
/** jsdom has no PointerEvent, so the pointer type is set by hand for React's onPointerEnter/onPointerLeave. */
const pointer = (type: 'pointerover' | 'pointerout', pointerType: 'mouse' | 'touch') => {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  fireEvent(group(), event)
}

describe('Projector: rendering', () => {
  it('is a labelled projector group, with every frame in place and only the first on screen', () => {
    render(<Projector label="Test reel" frames={frames} />)
    expect(group()).toHaveAttribute('aria-roledescription', 'projector')
    expect(group().querySelectorAll('[data-reveal]')).toHaveLength(frames.length)
    expect(screen.getByText('Slide one')).toBeVisible()
    expect(screen.getByText('Slide two')).not.toBeVisible()
    expect(screen.getByText('Slide three')).not.toBeVisible()
  })

  it('gives each frame a film-strip button named by its number and caption, marking the one on screen', () => {
    render(<Projector label="Test reel" frames={frames} />)
    expect(thumb(1)).toHaveAttribute('aria-current', 'true')
    expect(thumb(2)).not.toHaveAttribute('aria-current')
    expect(thumb(3)).not.toHaveAttribute('aria-current')
    expect(thumb(2)).toHaveTextContent('T2')
  })

  it('shows the count and the caption of the frame on screen, numbered from 01', () => {
    render(<Projector label="Test reel" frames={frames} />)
    expect(caption()).toHaveTextContent('01/03 · First caption')
    fireEvent.click(thumb(2))
    expect(caption()).toHaveTextContent('02/03 · Second caption')
  })

  it('adds the tall screen class for diagrams only when asked', () => {
    const { container, unmount } = render(<Projector label="Test reel" frames={frames} />)
    expect(container.querySelector('.projector-tall')).toBeNull()
    unmount()
    const tall = render(<Projector label="Test reel" frames={frames} tall />)
    expect(tall.container.querySelector('.projector-tall')).toBeInTheDocument()
  })

  it('adds the fit class to the screen only when asked, and never to the strip or the frames', () => {
    const { container, unmount } = render(<Projector label="Test reel" frames={frames} />)
    expect(container.querySelector('.projector-fit')).toBeNull()
    unmount()
    const fitted = render(<Projector label="Test reel" frames={frames} fit />)
    const screen = fitted.container.querySelector('.projector-fit') as HTMLElement
    expect(screen).toBeInTheDocument()
    expect(screen).toHaveClass('relative', 'aspect-video')
    expect(screen.querySelectorAll('[data-reveal]')).toHaveLength(frames.length)
    expect(fitted.container.querySelector('.projector-strip')).not.toHaveClass('projector-fit')
  })

  it('combines tall and fit on the same screen when both are asked for', () => {
    const { container } = render(<Projector label="Test reel" frames={frames} tall fit />)
    const screen = container.querySelector('.relative.aspect-video') as HTMLElement
    expect(screen).toHaveClass('projector-tall', 'projector-fit')
  })

  it('keeps fit separate from tall: fit alone does not make the screen tall', () => {
    const { container } = render(<Projector label="Test reel" frames={frames} fit />)
    expect(container.querySelector('.projector-tall')).toBeNull()
    expect(container.querySelector('.projector-fit')).toBeInTheDocument()
  })
})

describe('Projector: thumbs and Pause', () => {
  it('shows the frame whose thumb is clicked, and pauses', () => {
    render(<Projector label="Test reel" frames={frames} />)
    fireEvent.click(thumb(3))
    expect(thumb(3)).toHaveAttribute('aria-current', 'true')
    expect(thumb(1)).not.toHaveAttribute('aria-current')
    expect(isVisible(2)).toBe(true)
    expect(isVisible(0)).toBe(false)
    expect(playButton()).toBeInTheDocument()
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })
  })

  it('toggles between Pause and Play, and the bar follows', () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    expect(pauseButton()).toBeInTheDocument()
    expect(bar()).toHaveStyle({ animationPlayState: 'running' })

    fireEvent.click(pauseButton()!)
    expect(playButton()).toBeInTheDocument()
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })

    fireEvent.click(playButton()!)
    expect(pauseButton()).toBeInTheDocument()
    expect(bar()).toHaveStyle({ animationPlayState: 'running' })
  })

  it('starts paused for a visitor who asks for reduced motion, and Play starts it', () => {
    setReducedMotion(true)
    render(<Projector label="Test reel" frames={frames} />)
    expect(playButton()).toBeInTheDocument()
    onScreen(true)
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })

    fireEvent.click(playButton()!)
    expect(bar()).toHaveStyle({ animationPlayState: 'running' })
  })

  it('has no Pause button for a single frame, and never plays it', () => {
    render(<Projector label="Test reel" frames={[frames[0]]} />)
    expect(pauseButton()).toBeNull()
    expect(playButton()).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    onScreen(true)
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })
  })
})

describe('Projector: autoplay', () => {
  it('plays only while at least half of it is on screen', () => {
    render(<Projector label="Test reel" frames={frames} />)
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })

    onScreen(true)
    expect(bar()).toHaveStyle({ animationPlayState: 'running' })

    onScreen(false)
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })
  })

  it('does not play at all when the browser has no IntersectionObserver', () => {
    // @ts-expect-error: simulating a browser without IntersectionObserver
    global.IntersectionObserver = undefined
    render(<Projector label="Test reel" frames={frames} />)
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })
  })

  it('holds still while a mouse is over it, and carries on when it leaves', () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    pointer('pointerover', 'mouse')
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })
    expect(pauseButton()).toBeInTheDocument()

    pointer('pointerout', 'mouse')
    expect(bar()).toHaveStyle({ animationPlayState: 'running' })
  })

  it('does not hold still for a touch', () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    pointer('pointerover', 'touch')
    expect(bar()).toHaveStyle({ animationPlayState: 'running' })
  })

  it('uses each frame’s own time, or the default when it has none', () => {
    render(<Projector label="Test reel" frames={frames} />)
    expect(bar()).toHaveStyle({ animationDuration: '1000ms' })
    fireEvent.click(thumb(2))
    expect(bar()).toHaveStyle({ animationDuration: `${DEFAULT_MS}ms` })
    expect(DEFAULT_MS).toBe(3500)
  })

  it('moves to the next frame when the bar finishes, and loops back to the first', () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    endBar()
    expect(caption()).toHaveTextContent('02/03 · Second caption')
    endBar()
    expect(caption()).toHaveTextContent('03/03 · Third caption')
    endBar()
    expect(caption()).toHaveTextContent('01/03 · First caption')
    expect(isVisible(0)).toBe(true)
  })
})

describe('Projector: outside requests', () => {
  it('shows the frame that lib/reveal asks for, and pauses', async () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    const target = screen.getByText('Slide three')
    await act(async () => {
      await reveal(target)
    })
    expect(isVisible(2)).toBe(true)
    expect(playButton()).toBeInTheDocument()
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })
  })

  it('ignores a request for a frame that does not exist', () => {
    render(<Projector label="Test reel" frames={frames} />)
    const inside = screen.getByText('Slide one')
    fireEvent(inside, new CustomEvent('reveal', { bubbles: true, detail: '7' }))
    fireEvent(inside, new CustomEvent('reveal', { bubbles: true, detail: 'soon' }))
    expect(caption()).toHaveTextContent('01/03 · First caption')
    expect(isVisible(0)).toBe(true)
  })

  it('pauses when something inside a frame says so, such as a demo starting', () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    fireEvent(screen.getByText('Slide one'), new CustomEvent(PROJECTOR_PAUSE, { bubbles: true }))
    expect(playButton()).toBeInTheDocument()
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })
  })

  it('tells onFrame which frame is on screen, starting at the first and on each change', () => {
    const onFrame = jest.fn()
    render(<Projector label="Test reel" frames={frames} onFrame={onFrame} />)
    expect(onFrame).toHaveBeenLastCalledWith(0)
    fireEvent.click(thumb(3))
    expect(onFrame).toHaveBeenLastCalledWith(2)
    onScreen(true)
    fireEvent.click(playButton()!)
    endBar()
    expect(onFrame).toHaveBeenLastCalledWith(0)
  })
})

describe('Projector: the bar only advances while it is running', () => {
  it('does not advance when Pause has been pressed, even if the bar reports an end', () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    fireEvent.click(pauseButton()!)
    endBar()
    expect(caption()).toHaveTextContent('01/03 · First caption')
    expect(isVisible(0)).toBe(true)
  })

  it('does not advance for a reduced-motion visitor who has not pressed Play', () => {
    setReducedMotion(true)
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    endBar()
    expect(caption()).toHaveTextContent('01/03 · First caption')
  })

  it('does not advance while off screen', () => {
    render(<Projector label="Test reel" frames={frames} />)
    endBar()
    expect(caption()).toHaveTextContent('01/03 · First caption')
  })

  it('does not advance while a mouse holds it', () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    pointer('pointerover', 'mouse')
    endBar()
    expect(caption()).toHaveTextContent('01/03 · First caption')
  })

  it('does not advance with a single frame', () => {
    render(<Projector label="Test reel" frames={[frames[0]]} />)
    onScreen(true)
    endBar()
    expect(caption()).toHaveTextContent('01/01 · First caption')
  })

  it('still advances once Play is pressed again while on screen', () => {
    render(<Projector label="Test reel" frames={frames} />)
    onScreen(true)
    fireEvent.click(pauseButton()!)
    endBar()
    expect(caption()).toHaveTextContent('01/03 · First caption')
    fireEvent.click(playButton()!)
    endBar()
    expect(caption()).toHaveTextContent('02/03 · Second caption')
  })
})

describe('Projector: what a moving frame sees (ProjectorMotion)', () => {
  /** Shows the motion value its frame sees, as an attribute, so the DOM tells us what the context holds now. */
  function Probe() {
    return <i data-motion={String(useContext(ProjectorMotion))} />
  }
  const probed: ProjectorFrame[] = [
    { node: <Probe />, thumb: <span>T1</span>, caption: 'First caption' },
    { node: <Probe />, thumb: <span>T2</span>, caption: 'Second caption' },
  ]
  const motionValues = () => Array.from(group().querySelectorAll('[data-motion]')).map((el) => el.getAttribute('data-motion'))

  it('is true to begin with, so a moving frame moves', () => {
    render(<Projector label="Test reel" frames={probed} />)
    expect(motionValues()).toEqual(['true', 'true'])
  })

  it('is false once Pause is pressed, and true again on Play', () => {
    render(<Projector label="Test reel" frames={probed} />)
    onScreen(true)
    fireEvent.click(pauseButton()!)
    expect(motionValues()).toEqual(['false', 'false'])

    fireEvent.click(playButton()!)
    expect(motionValues()).toEqual(['true', 'true'])
  })

  it('ends false after Pause, Play, Pause in a row', () => {
    render(<Projector label="Test reel" frames={probed} />)
    fireEvent.click(pauseButton()!)
    fireEvent.click(playButton()!)
    fireEvent.click(pauseButton()!)
    expect(motionValues()).toEqual(['false', 'false'])
  })

  it('stays true when a frame thumb is picked, so a picked video still plays', () => {
    render(<Projector label="Test reel" frames={probed} />)
    onScreen(true)
    fireEvent.click(thumb(2))
    expect(playButton()).toBeInTheDocument()
    expect(motionValues()).toEqual(['true', 'true'])
  })

  it('stays true while a mouse hovers over the projector', () => {
    render(<Projector label="Test reel" frames={probed} />)
    onScreen(true)
    pointer('pointerover', 'mouse')
    expect(bar()).toHaveStyle({ animationPlayState: 'paused' })
    expect(motionValues()).toEqual(['true', 'true'])
  })

  it('is set to false by Pause even after a thumb was picked', () => {
    render(<Projector label="Test reel" frames={probed} />)
    fireEvent.click(thumb(2))
    fireEvent.click(playButton()!)
    fireEvent.click(pauseButton()!)
    expect(motionValues()).toEqual(['false', 'false'])
  })
})
