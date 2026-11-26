import { render, screen } from '@testing-library/react'
import TourProgress from './TourProgress'

const bar = () => screen.getByTestId('tour-progress').firstElementChild as HTMLElement

describe('TourProgress', () => {
  it('is a track hidden from assistive tech, holding one bar', () => {
    render(<TourProgress step={0} ms={4000} paused={false} />)
    const track = screen.getByTestId('tour-progress')
    expect(track).toHaveAttribute('aria-hidden', 'true')
    expect(track.children).toHaveLength(1)
    expect(bar()).toHaveClass('tour-progress')
  })

  it('sets the animation duration to the step length in ms', () => {
    render(<TourProgress step={0} ms={5500} paused={false} />)
    expect(bar().style.animationDuration).toBe('5500ms')
  })

  it('runs the animation while playing', () => {
    render(<TourProgress step={0} ms={4000} paused={false} />)
    expect(bar().style.animationPlayState).toBe('running')
  })

  it('freezes the animation while paused', () => {
    render(<TourProgress step={0} ms={4000} paused />)
    expect(bar().style.animationPlayState).toBe('paused')
  })

  it('pauses and runs again on the same element when only `paused` changes (the fill is kept)', () => {
    const { rerender } = render(<TourProgress step={1} ms={4000} paused={false} />)
    const before = bar()
    rerender(<TourProgress step={1} ms={4000} paused />)
    expect(bar()).toBe(before)
    expect(bar().style.animationPlayState).toBe('paused')
    rerender(<TourProgress step={1} ms={4000} paused={false} />)
    expect(bar()).toBe(before)
    expect(bar().style.animationPlayState).toBe('running')
  })

  it('remounts the bar (a new element, so the fill restarts) when the step changes', () => {
    const { rerender } = render(<TourProgress step={0} ms={4000} paused={false} />)
    const first = bar()
    rerender(<TourProgress step={1} ms={5500} paused={false} />)
    const second = bar()
    expect(second).not.toBe(first)
    expect(first.isConnected).toBe(false)
    expect(second.style.animationDuration).toBe('5500ms')
  })

  it('keeps the same bar when re-rendered for the same step', () => {
    const { rerender } = render(<TourProgress step={2} ms={4000} paused={false} />)
    const first = bar()
    rerender(<TourProgress step={2} ms={4000} paused={false} />)
    expect(bar()).toBe(first)
  })

  it('has no text of its own', () => {
    render(<TourProgress step={0} ms={4000} paused={false} />)
    expect(screen.getByTestId('tour-progress').textContent).toBe('')
  })

  it('takes a string step too, and remounts when it changes (a restarted run on the same step number)', () => {
    const { rerender } = render(<TourProgress step="1-0" ms={4000} paused={false} />)
    const first = bar()
    rerender(<TourProgress step="1-0" ms={4000} paused />)
    expect(bar()).toBe(first)
    rerender(<TourProgress step="2-0" ms={4000} paused={false} />)
    expect(bar()).not.toBe(first)
    expect(first.isConnected).toBe(false)
  })
})
