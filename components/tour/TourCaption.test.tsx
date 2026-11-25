import { fireEvent, render, screen } from '@testing-library/react'
import TourCaption from './TourCaption'

const SAY = 'Pick up any pass and that role opens below: here is UOB, and Illumina. Or see every role at once.'

function baseProps(over: Partial<React.ComponentProps<typeof TourCaption>> = {}): React.ComponentProps<typeof TourCaption> {
  return {
    say: SAY,
    index: 2,
    total: 10,
    paused: false,
    stepMs: 4000,
    instant: true,
    onPause: jest.fn(),
    onResume: jest.fn(),
    onSkip: jest.fn(),
    onEnd: jest.fn(),
    ...over,
  }
}

function setup(over: Partial<React.ComponentProps<typeof TourCaption>> = {}) {
  const props = baseProps(over)
  render(<TourCaption {...props} />)
  return props
}

describe('TourCaption', () => {
  it('is a labelled region, "Site tour", marked as the tour\'s own UI so tapping it does not pause', () => {
    setup()
    const region = screen.getByRole('region', { name: 'Site tour' })
    expect(region).toHaveAttribute('data-tour-ui')
  })

  it('says plainly it is a recorded tour, with the step counts: "Titus · Recorded tour · 3 of 10"', () => {
    setup({ index: 2, total: 10 })
    expect(screen.getByText('Titus · Recorded tour · 3 of 10')).toBeInTheDocument()
  })

  it('counts from 1, not 0', () => {
    setup({ index: 0, total: 10 })
    expect(screen.getByText(/Recorded tour · 1 of 10/)).toBeInTheDocument()
  })

  it('shows the whole narration, with no truncation classes anywhere', () => {
    setup()
    const container = screen.getByRole('region', { name: 'Site tour' })
    expect(container.textContent).toContain(SAY)
    // The progress track clips its own bar, so it is the one place overflow-hidden is allowed; the text has none.
    const clipped = Array.from(container.querySelectorAll('[class*="truncate"], [class*="line-clamp"], [class*="text-ellipsis"], [class*="overflow-hidden"]'))
    expect(clipped.filter((el) => !el.matches('[data-testid="tour-progress"]'))).toEqual([])
  })

  it('announces each step itself in a polite live region: "{say} (tour, step n of total)"', () => {
    setup({ index: 2, total: 10 })
    const live = screen.getByText(`${SAY} (tour, step 3 of 10)`)
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveClass('sr-only')
  })

  it('hides the visible narration from screen readers, so the live line is the only thing announced', () => {
    setup()
    const visible = screen.getByRole('region', { name: 'Site tour' }).querySelector('p.font-serif')!
    expect(visible).toHaveAttribute('aria-hidden', 'true')
    expect(visible).toHaveTextContent(SAY)
  })

  it('is capped to the screen width so it can sit above the Ask Titus button', () => {
    setup()
    expect(screen.getByRole('region', { name: 'Site tour' }).className).toContain('w-[min(420px,calc(100vw-32px))]')
  })

  describe('Pause and Resume', () => {
    it('reads Pause while playing, and calls onPause', () => {
      const props = setup({ paused: false })
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
      expect(props.onPause).toHaveBeenCalledTimes(1)
      expect(props.onResume).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument()
    })

    it('reads Resume when paused, and calls onResume', () => {
      const props = setup({ paused: true })
      expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
      expect(props.onResume).toHaveBeenCalledTimes(1)
      expect(props.onPause).not.toHaveBeenCalled()
    })
  })

  describe('the progress bar', () => {
    const bar = () => screen.getByTestId('tour-progress').firstElementChild as HTMLElement

    it('is there, hidden from assistive tech, with the step length as its duration', () => {
      setup({ stepMs: 5500 })
      expect(screen.getByTestId('tour-progress')).toHaveAttribute('aria-hidden', 'true')
      expect(bar().style.animationDuration).toBe('5500ms')
    })

    it('runs while playing and freezes while paused', () => {
      const { unmount } = render(<TourCaption {...baseProps()} paused={false} />)
      expect(bar().style.animationPlayState).toBe('running')
      unmount()
      render(<TourCaption {...baseProps()} paused />)
      expect(bar().style.animationPlayState).toBe('paused')
    })

    it('restarts for each step (a new bar element)', () => {
      const { rerender } = render(<TourCaption {...baseProps()} index={2} />)
      const first = bar()
      rerender(<TourCaption {...baseProps()} index={3} stepMs={6000} />)
      expect(bar()).not.toBe(first)
      expect(bar().style.animationDuration).toBe('6000ms')
    })

    it('sits inside the card, as part of the tour UI', () => {
      setup()
      expect(screen.getByRole('region', { name: 'Site tour' })).toContainElement(screen.getByTestId('tour-progress'))
    })
  })

  describe('the paused state', () => {
    it('says "Paused · press Resume to carry on" and turns the button into "Resume", in ink', () => {
      setup({ paused: true })
      expect(screen.getByText('Paused · press Resume to carry on')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Paused · press Resume to carry on')
      const resume = screen.getByRole('button', { name: 'Resume' })
      expect(resume).toHaveClass('tour-resume', 'bg-ink', 'text-paper')
    })

    it('announces the pause as a status, in ink with a small amber dot that screen readers skip', () => {
      setup({ paused: true })
      const status = screen.getByRole('status')
      expect(status).toHaveClass('text-ink')
      const dot = status.querySelector('span')!
      expect(dot).toHaveAttribute('aria-hidden', 'true')
      expect(dot).toHaveClass('bg-amber')
    })

    it('hides the ▶ on the Resume button from screen readers, so its name is just "Resume"', () => {
      setup({ paused: true })
      const resume = screen.getByRole('button', { name: 'Resume' })
      expect(resume).toHaveTextContent('▶ Resume')
      expect(resume.querySelector('span[aria-hidden="true"]')).toHaveTextContent('▶')
    })

    it('has no status while playing', () => {
      setup({ paused: false })
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('shows neither the paused text nor the resume styling while playing', () => {
      setup({ paused: false })
      expect(screen.queryByText(/Paused/)).not.toBeInTheDocument()
      const pause = screen.getByRole('button', { name: 'Pause' })
      expect(pause).toHaveTextContent(/^Pause$/)
      expect(pause).not.toHaveClass('tour-resume')
      expect(pause).not.toHaveClass('bg-ink')
    })

    it('keeps Skip and End tour while paused', () => {
      setup({ paused: true })
      expect(screen.getByRole('button', { name: /^Skip/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'End tour' })).toBeInTheDocument()
    })
  })

  describe('Skip', () => {
    it('reads "Skip →" and calls onSkip', () => {
      const props = setup({ index: 2, total: 10 })
      const skip = screen.getByRole('button', { name: /^Skip/ })
      expect(skip).toHaveTextContent('Skip →')
      fireEvent.click(skip)
      expect(props.onSkip).toHaveBeenCalledTimes(1)
    })

    it('reads "Finish →" on the last step, and still calls onSkip', () => {
      const props = setup({ index: 9, total: 10 })
      expect(screen.queryByRole('button', { name: /^Skip/ })).not.toBeInTheDocument()
      const finish = screen.getByRole('button', { name: /^Finish/ })
      expect(finish).toHaveTextContent('Finish →')
      fireEvent.click(finish)
      expect(props.onSkip).toHaveBeenCalledTimes(1)
    })

    it('hides the arrow from screen readers', () => {
      setup()
      expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    })
  })

  describe('End tour', () => {
    it('is a ✕ with the accessible name "End tour", and calls onEnd', () => {
      const props = setup()
      const end = screen.getByRole('button', { name: 'End tour' })
      expect(end).toHaveTextContent('✕')
      fireEvent.click(end)
      expect(props.onEnd).toHaveBeenCalledTimes(1)
    })
  })

  it('makes every button a 44px tap target', () => {
    setup()
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('tap', 'min-h-[44px]')
    }
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('wraps its buttons rather than running them off the side on a narrow phone', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Pause' }).parentElement).toHaveClass('flex-wrap')
  })

  it('types the narration in when not instant: the rest is laid out but invisible, and the live line is whole', () => {
    jest.useFakeTimers()
    try {
      const { container } = render(<TourCaption say={SAY} index={0} total={4} paused={false} stepMs={4000} instant={false} onPause={jest.fn()} onResume={jest.fn()} onSkip={jest.fn()} onEnd={jest.fn()} />)
      expect(screen.getByText(`${SAY} (tour, step 1 of 4)`)).toBeInTheDocument()
      expect(container.querySelector('.opacity-0')).toHaveTextContent(SAY)
    } finally {
      jest.useRealTimers()
    }
  })
})
