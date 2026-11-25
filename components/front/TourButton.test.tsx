import { fireEvent, render, screen } from '@testing-library/react'
import { COPILOT_TOUR_EVENT } from '@/lib/copilot-events'
import TourButton from './TourButton'

// A tour the tests can flip between draft and recorded.
const mockTour = { draft: true }
jest.mock('@/lib/site-tour', () => ({
  __esModule: true,
  get SITE_TOUR() {
    return mockTour
  },
}))

const env = process.env as Record<string, string | undefined>
const originalEnv = env.NODE_ENV

afterEach(() => {
  env.NODE_ENV = originalEnv
  mockTour.draft = true
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

  describe('while the tour is still a draft', () => {
    it('renders nothing, for either variant, in production', () => {
      env.NODE_ENV = 'production'
      mockTour.draft = true
      const { container: a } = render(<TourButton variant="primary" />)
      const { container: b } = render(<TourButton variant="line" />)
      expect(a).toBeEmptyDOMElement()
      expect(b).toBeEmptyDOMElement()
    })

    it('shows in development, so Titus can try it', () => {
      env.NODE_ENV = 'development'
      render(<TourButton variant="primary" />)
      expect(screen.getByRole('button', { name: /show me around/i })).toBeInTheDocument()
    })

    it('shows in test', () => {
      env.NODE_ENV = 'test'
      render(<TourButton variant="line" />)
      expect(screen.getByRole('button', { name: /short on time/i })).toBeInTheDocument()
    })
  })

  describe('once a real recording replaces the draft', () => {
    it('shows both variants in production', () => {
      env.NODE_ENV = 'production'
      mockTour.draft = false
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
