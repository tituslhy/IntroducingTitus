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
})
