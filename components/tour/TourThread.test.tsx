import { render, screen } from '@testing-library/react'
import TourThread from './TourThread'

const steps = [
  { say: 'First line.', targets: [] },
  { say: 'Second line.', targets: ['writing'] },
  { say: 'Third line.', targets: [] },
]

describe('TourThread', () => {
  it('heads the narration "Recorded tour", so it is never mistaken for a live answer', () => {
    render(<TourThread steps={steps} label={<span>name tag</span>} instant />)
    expect(screen.getByText('Recorded tour')).toBeInTheDocument()
  })

  it('shows Ask Titus\'s name tag', () => {
    render(<TourThread steps={steps} label={<span>name tag</span>} instant />)
    expect(screen.getByText('name tag')).toBeInTheDocument()
  })

  it('shows every step so far, in order, newest last', () => {
    const { container } = render(<TourThread steps={steps} label={null} instant />)
    const lines = Array.from(container.querySelectorAll('.border-l p'))
    expect(lines).toHaveLength(3)
    expect(lines[0]).toHaveTextContent('First line.')
    expect(lines[1]).toHaveTextContent('Second line.')
    expect(lines[2]).toHaveTextContent('Third line.')
  })

  it('types only the newest line, which is read from a hidden copy; earlier ones are plain text', () => {
    const { container } = render(<TourThread steps={steps} label={null} instant />)
    const lines = Array.from(container.querySelectorAll('.border-l p'))
    expect(lines[0].querySelector('.sr-only')).toBeNull()
    expect(lines[1].querySelector('.sr-only')).toBeNull()
    expect(lines[2].querySelector('.sr-only')).toHaveTextContent('Third line.')
    expect(lines[0].textContent).toBe('First line.')
  })

  it('has the id the drawer scrolls to', () => {
    const { container } = render(<TourThread steps={steps} label={null} instant />)
    expect(container.firstElementChild).toHaveAttribute('id', 'copilot-tour')
  })

  it('renders the controls it is given', () => {
    render(<TourThread steps={steps} label={null} instant controls={<button>Pause</button>} />)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('renders no controls when none are given (the tour is over)', () => {
    render(<TourThread steps={steps.slice(-1)} label={null} instant />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('is marked as the tour\'s own UI, so using it does not pause the tour', () => {
    const { container } = render(<TourThread steps={steps} label={null} instant />)
    expect(container.firstElementChild).toHaveAttribute('data-tour-ui')
  })

  it('renders nothing but the header for no steps', () => {
    const { container } = render(<TourThread steps={[]} label={null} instant />)
    expect(container.querySelectorAll('.border-l p')).toHaveLength(0)
  })

  it('wraps each line in a step div, one per step', () => {
    const { container } = render(<TourThread steps={steps} label={null} instant />)
    const wrappers = Array.from(container.querySelectorAll('.border-l > div'))
    expect(wrappers).toHaveLength(3)
    wrappers.forEach((w) => expect(w.querySelector(':scope > p')).not.toBeNull())
  })

  describe('extras', () => {
    it('renders what extras returns under each step\'s line, called with the step and its index', () => {
      const extras = jest.fn((step: { say: string }, i: number) => <span data-testid={`extra-${i}`}>{step.say}!</span>)
      const { container } = render(<TourThread steps={steps} label={null} instant extras={extras} />)
      expect(extras).toHaveBeenCalledTimes(3)
      expect(extras).toHaveBeenNthCalledWith(1, steps[0], 0)
      expect(extras).toHaveBeenNthCalledWith(3, steps[2], 2)
      const wrappers = Array.from(container.querySelectorAll('.border-l > div'))
      wrappers.forEach((w, i) => {
        expect(w.children).toHaveLength(2)
        expect(w.children[0].tagName).toBe('P')
        expect(w.children[1]).toBe(screen.getByTestId(`extra-${i}`))
      })
    })

    it('renders nothing extra when none is given or it returns null for a step', () => {
      const { container } = render(
        <TourThread steps={steps} label={null} instant extras={(_s, i) => (i === 1 ? <button>Go</button> : null)} />
      )
      const wrappers = Array.from(container.querySelectorAll('.border-l > div'))
      expect(wrappers[0].children).toHaveLength(1)
      expect(wrappers[1].children).toHaveLength(2)
      expect(wrappers[2].children).toHaveLength(1)
      expect(screen.getAllByRole('button')).toHaveLength(1)
    })
  })
})
