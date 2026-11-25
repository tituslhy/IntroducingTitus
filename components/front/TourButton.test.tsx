import { fireEvent, render, screen } from '@testing-library/react'
import { COPILOT_TOUR_EVENT } from '@/lib/copilot-events'
import TourButton from './TourButton'

// Whether the buttons show: the tests flip it.
let mockOnSite = true
jest.mock('@/lib/site-tour', () => ({
  __esModule: true,
  get TOUR_ON_SITE() {
    return mockOnSite
  },
}))

afterEach(() => {
  mockOnSite = true
})

describe('TourButton', () => {
  let listener: jest.Mock
  beforeEach(() => {
    listener = jest.fn()
    window.addEventListener(COPILOT_TOUR_EVENT, listener)
  })
  afterEach(() => {
    window.removeEventListener(COPILOT_TOUR_EVENT, listener)
  })

  describe('primary', () => {
    it('is a button reading "Show me around" with an amber arrow', () => {
      render(<TourButton variant="primary" />)
      const button = screen.getByRole('button', { name: /show me around/i })
      expect(button).toHaveAttribute('type', 'button')
      expect(button).toHaveTextContent('Show me around →')
      expect(button.querySelector('b')).toHaveTextContent('→')
    })

    it('is the dark hero button, in the same classes as the old "View experience" link', () => {
      render(<TourButton variant="primary" />)
      const button = screen.getByRole('button', { name: /show me around/i })
      expect(button).toHaveClass('bg-ink', 'text-paper', 'hover:bg-amber')
    })

    it('starts the tour when clicked', () => {
      render(<TourButton variant="primary" />)
      fireEvent.click(screen.getByRole('button', { name: /show me around/i }))
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('does not start the tour on its own', () => {
      render(<TourButton variant="primary" />)
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('line', () => {
    it('is a button reading "Short on time? Let me show you around"', () => {
      render(<TourButton variant="line" />)
      const button = screen.getByRole('button', { name: /short on time\? let me show you around/i })
      expect(button).toHaveAttribute('type', 'button')
    })

    it('is serif italic, a tap target, with the arrow in amber and hidden from screen readers', () => {
      render(<TourButton variant="line" />)
      const button = screen.getByRole('button', { name: /short on time/i })
      expect(button).toHaveClass('tap', 'font-serif', 'italic')
      const arrow = button.querySelector('span')!
      expect(arrow).toHaveTextContent('→')
      expect(arrow).toHaveClass('text-amber')
      expect(arrow).toHaveAttribute('aria-hidden', 'true')
    })

    it('starts the tour when clicked', () => {
      render(<TourButton variant="line" />)
      fireEvent.click(screen.getByRole('button', { name: /short on time/i }))
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('the line variant owns its paragraph', () => {
    it('wraps its button in a p, so there is nothing left behind when it is hidden', () => {
      const { container } = render(<TourButton variant="line" />)
      const p = container.querySelector('p')!
      expect(container.firstElementChild).toBe(p)
      expect(p).toContainElement(screen.getByRole('button', { name: /short on time/i }))
      expect(p).toHaveClass('m-0', 'mt-6')
    })

    it('does not wrap the primary button in a paragraph', () => {
      const { container } = render(<TourButton variant="primary" />)
      expect(container.querySelector('p')).toBeNull()
      expect(container.firstElementChild?.tagName).toBe('BUTTON')
    })
  })

  describe('when the tour is not on the site (the live site, still a draft)', () => {
    beforeEach(() => {
      mockOnSite = false
    })

    it('renders nothing for the primary variant', () => {
      const { container } = render(<TourButton variant="primary" />)
      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing for the line variant, not even its paragraph', () => {
      const { container } = render(<TourButton variant="line" />)
      expect(container).toBeEmptyDOMElement()
    })
  })

  describe('when the tour is on the site (local builds, previews, or a real recording)', () => {
    it('shows both variants', () => {
      mockOnSite = true
      render(
        <>
          <TourButton variant="primary" />
          <TourButton variant="line" />
        </>
      )
      expect(screen.getByRole('button', { name: /show me around/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /short on time/i })).toBeInTheDocument()
    })
  })
})
