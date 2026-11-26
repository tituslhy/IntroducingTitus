import { fireEvent, render, screen } from '@testing-library/react'
import TourAsk from './TourAsk'

const QUESTIONS = ['How would you build production-ready agents?', 'What did you build at Illumina?']

describe('TourAsk', () => {
  it('renders nothing for no questions', () => {
    const { container } = render(<TourAsk questions={[]} onAsk={jest.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is a list labelled "Example questions"', () => {
    render(<TourAsk questions={QUESTIONS} onAsk={jest.fn()} />)
    expect(screen.getByRole('list', { name: 'Example questions' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('has one button per question, with the question in its text, in order', () => {
    render(<TourAsk questions={QUESTIONS} onAsk={jest.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveTextContent(QUESTIONS[0])
    expect(buttons[1]).toHaveTextContent(QUESTIONS[1])
  })

  it('hides the arrow from assistive tech', () => {
    render(<TourAsk questions={[QUESTIONS[0]]} onAsk={jest.fn()} />)
    const arrow = screen.getByText('→')
    expect(arrow).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: QUESTIONS[0] })).toBeInTheDocument()
  })

  it('calls onAsk with the question that was clicked, once', () => {
    const onAsk = jest.fn()
    render(<TourAsk questions={QUESTIONS} onAsk={onAsk} />)
    fireEvent.click(screen.getByRole('button', { name: QUESTIONS[1] }))
    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk).toHaveBeenCalledWith(QUESTIONS[1])
  })

  it('does not call onAsk until a button is pressed', () => {
    const onAsk = jest.fn()
    render(<TourAsk questions={QUESTIONS} onAsk={onAsk} />)
    expect(onAsk).not.toHaveBeenCalled()
  })

  it('wraps long questions rather than cutting them off', () => {
    const { container } = render(<TourAsk questions={QUESTIONS} onAsk={jest.fn()} />)
    expect(container.querySelector('[class*="truncate"], [class*="line-clamp"], [class*="overflow-hidden"]')).toBeNull()
  })

  it('is enabled by default', () => {
    render(<TourAsk questions={QUESTIONS} onAsk={jest.fn()} />)
    for (const b of screen.getAllByRole('button')) expect(b).toBeEnabled()
  })

  it('disables every button while an answer is coming in, and ignores clicks', () => {
    const onAsk = jest.fn()
    render(<TourAsk questions={QUESTIONS} onAsk={onAsk} disabled />)
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: QUESTIONS[0] }))
    expect(onAsk).not.toHaveBeenCalled()
  })

  it('keeps a 44px touch target on phones', () => {
    render(<TourAsk questions={QUESTIONS} onAsk={jest.fn()} />)
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('max-[640px]:min-h-[44px]')
  })
})
