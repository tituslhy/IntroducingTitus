import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DemoFrame from './DemoFrame'
import { PROJECTOR_PAUSE } from './Projector'

const ID = 'uLtMD3J4U40'
const TITLE = 'TheMarginCall demo'
const PLAY = 'Play TheMarginCall demo'

/** A demo inside a projector frame, as Projects renders it: the frame is `[data-reveal]` and can be hidden. */
function renderInFrame() {
  const result = render(
    <div data-reveal="1" data-testid="frame">
      <DemoFrame youtubeId={ID} title={TITLE} />
    </div>,
  )
  return { ...result, frame: screen.getByTestId('frame') }
}

describe('DemoFrame', () => {
  it('shows the video’s poster, with a play button named for the demo', () => {
    const { container } = render(<DemoFrame youtubeId={ID} title={TITLE} />)
    expect(screen.getByRole('button', { name: PLAY })).toBeInTheDocument()
    const poster = container.querySelector('img')
    expect(poster).toHaveAttribute('src', `https://img.youtube.com/vi/${ID}/maxresdefault.jpg`)
    expect(poster).toHaveAttribute('alt', '')
  })

  it('does not load the video until play is pressed', () => {
    const { container } = render(<DemoFrame youtubeId={ID} title={TITLE} />)
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('tells the projector to pause, with a bubbling event, when play is pressed', () => {
    const onPause = jest.fn()
    const { container } = render(<DemoFrame youtubeId={ID} title={TITLE} />)
    container.addEventListener(PROJECTOR_PAUSE, onPause)
    expect(onPause).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: PLAY }))

    expect(onPause).toHaveBeenCalledTimes(1)
    expect(onPause.mock.calls[0][0].bubbles).toBe(true)
  })

  it('then swaps the poster for the privacy-enhanced video, set to autoplay', () => {
    const { container } = render(<DemoFrame youtubeId={ID} title={TITLE} />)
    fireEvent.click(screen.getByRole('button', { name: PLAY }))

    const frame = container.querySelector('iframe')!
    expect(frame).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`)
    expect(frame).toHaveAttribute('title', TITLE)
    expect(frame.getAttribute('allow')).toContain('autoplay')
    expect(frame).toHaveAttribute('allowfullscreen')
    expect(screen.queryByRole('button', { name: PLAY })).toBeNull()
  })
})

describe('DemoFrame: taking the video down when its frame is hidden', () => {
  it('removes the video and brings the Play button back when the frame becomes hidden', async () => {
    const { container, frame } = renderInFrame()
    fireEvent.click(screen.getByRole('button', { name: PLAY, hidden: true }))
    expect(container.querySelector('iframe')).toBeInTheDocument()

    await act(async () => {
      frame.hidden = true
    })

    await waitFor(() => expect(container.querySelector('iframe')).toBeNull())
    expect(screen.getByRole('button', { name: PLAY, hidden: true })).toBeInTheDocument()
  })

  it('leaves the video alone when the frame is shown again', async () => {
    const { container, frame } = renderInFrame()
    fireEvent.click(screen.getByRole('button', { name: PLAY, hidden: true }))

    await act(async () => {
      frame.hidden = false
    })

    expect(container.querySelector('iframe')).toBeInTheDocument()
  })

  it('can be played again after its frame was hidden and shown', async () => {
    const { container, frame } = renderInFrame()
    fireEvent.click(screen.getByRole('button', { name: PLAY, hidden: true }))
    await act(async () => {
      frame.hidden = true
    })
    await waitFor(() => expect(container.querySelector('iframe')).toBeNull())

    await act(async () => {
      frame.hidden = false
    })
    fireEvent.click(screen.getByRole('button', { name: PLAY, hidden: true }))
    expect(container.querySelector('iframe')).toBeInTheDocument()
  })

  it('does nothing to the video while the poster is showing, even if the frame is hidden', async () => {
    const { frame } = renderInFrame()
    await act(async () => {
      frame.hidden = true
    })
    expect(screen.getByRole('button', { name: PLAY, hidden: true })).toBeInTheDocument()
  })

  it('with no [data-reveal] ancestor: the video plays, and hiding an unrelated element leaves it alone', async () => {
    const { container } = render(<DemoFrame youtubeId={ID} title={TITLE} />)
    fireEvent.click(screen.getByRole('button', { name: PLAY, hidden: true }))

    const wrapper = document.createElement('div')
    document.body.appendChild(wrapper)
    await act(async () => {
      wrapper.hidden = true
    })

    expect(container.querySelector('iframe')).toBeInTheDocument()
    wrapper.remove()
  })
})
