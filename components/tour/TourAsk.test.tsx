import { fireEvent, render, screen } from '@testing-library/react'
import TourAsk from './TourAsk'

const QUESTIONS = ['How would you build production-ready agents?', 'What did you build at Illumina?']

describe('TourAsk', () => {
  it('renders nothing for no questions', () => {
    const { container } = render(<TourAsk questions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is a list labelled "Example questions"', () => {
    render(<TourAsk questions={QUESTIONS} />)
    expect(screen.getByRole('list', { name: 'Example questions' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('has one list item per question, in curly quotes, in order', () => {
    render(<TourAsk questions={QUESTIONS} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent(`“${QUESTIONS[0]}”`)
    expect(items[1]).toHaveTextContent(`“${QUESTIONS[1]}”`)
  })

  it('is read-only: no buttons, links or other controls', () => {
    const { container } = render(<TourAsk questions={QUESTIONS} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelector('button, a, input, [role="button"], [tabindex]')).toBeNull()
  })

  it('does nothing when a question is clicked (nothing to press)', () => {
    const { container } = render(<TourAsk questions={QUESTIONS} />)
    const before = container.innerHTML
    fireEvent.click(screen.getAllByRole('listitem')[0])
    expect(container.innerHTML).toBe(before)
  })

  it('puts each question in one span, with no aria-hidden part (nothing is hidden from a screen reader)', () => {
    const { container } = render(<TourAsk questions={QUESTIONS} />)
    expect(container.querySelector('[aria-hidden]')).toBeNull()
    for (const li of screen.getAllByRole('listitem')) {
      expect(li.children).toHaveLength(1)
      expect(li.children[0].tagName).toBe('SPAN')
    }
  })

  it('keeps the list role explicit, so the list is announced even with list-none styling', () => {
    render(<TourAsk questions={QUESTIONS} />)
    expect(screen.getByRole('list', { name: 'Example questions' })).toHaveAttribute('role', 'list')
  })

  it('wraps long questions rather than cutting them off', () => {
    const { container } = render(<TourAsk questions={QUESTIONS} />)
    expect(container.querySelector('[class*="truncate"], [class*="line-clamp"], [class*="overflow-hidden"]')).toBeNull()
  })
})
