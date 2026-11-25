import { fireEvent, render, screen } from '@testing-library/react'
import { COPILOT_TOUR_EVENT } from '@/lib/copilot-events'
import { SITE_TOUR, tourDurationMs } from '@/lib/site-tour'
import TourButton, { TOUR_SECONDS } from './TourButton'

// Whether the tour's tile shows: the tests flip it.
let mockOnSite = true
jest.mock('@/lib/site-tour', () => ({
  ...jest.requireActual<typeof import('@/lib/site-tour')>('@/lib/site-tour'),
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

  describe('TOUR_SECONDS', () => {
    it('is the recording length to the nearest 5 seconds, never under 5', () => {
      const expected = Math.max(5, Math.round(tourDurationMs(SITE_TOUR) / 5000) * 5)
      expect(TOUR_SECONDS).toBe(expected)
      expect(TOUR_SECONDS % 5).toBe(0)
      expect(TOUR_SECONDS).toBeGreaterThanOrEqual(5)
    })

    it('is within 2.5 seconds of the real length', () => {
      expect(Math.abs(TOUR_SECONDS - tourDurationMs(SITE_TOUR) / 1000)).toBeLessThanOrEqual(2.5)
    })
  })

  describe('the tile', () => {
    it('is one button of type "button", with no variants', () => {
      render(<TourButton />)
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveAttribute('type', 'button')
    })

    it('shows the label with the duration, the title, and the line beneath', () => {
      render(<TourButton />)
      const button = screen.getByRole('button')
      expect(button).toHaveTextContent(`Show me around · ${TOUR_SECONDS} s`)
      expect(button).toHaveTextContent('Let my AI copilot give you the tour.')
      expect(button).toHaveTextContent('It opens the pages and talks you through them')
    })

    it('is named by an aria-label that says what it is, with the length: "Show me around: a N-second tour by my AI copilot"', () => {
      render(<TourButton />)
      const button = screen.getByRole('button', { name: `Show me around: a ${TOUR_SECONDS}-second tour by my AI copilot` })
      expect(button).toHaveAttribute('aria-label', `Show me around: a ${TOUR_SECONDS}-second tour by my AI copilot`)
      expect(screen.getByRole('button', { name: /show me around/i })).toBe(button)
    })

    it('keeps its visible text as it was, whatever the accessible name says', () => {
      render(<TourButton />)
      const button = screen.getByRole('button')
      expect(button.textContent).toContain(`Show me around · ${TOUR_SECONDS} s`)
      expect(button.getAttribute('aria-label')).not.toContain(' · ')
    })

    it('is the dark glow tile', () => {
      render(<TourButton />)
      expect(screen.getByRole('button')).toHaveClass('glow-tile', 'bg-ink', 'text-paper')
    })

    it('hides the play icon circle and the arrow from screen readers', () => {
      render(<TourButton />)
      const button = screen.getByRole('button')
      const hidden = Array.from(button.querySelectorAll('[aria-hidden="true"]'))
      expect(hidden.some((el) => el.querySelector('svg'))).toBe(true)
      expect(hidden.some((el) => el.textContent?.trim() === '→')).toBe(true)
    })

    it('starts the tour when clicked', () => {
      render(<TourButton />)
      fireEvent.click(screen.getByRole('button'))
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('does not start the tour on its own', () => {
      render(<TourButton />)
      expect(listener).not.toHaveBeenCalled()
    })

    it('has no paragraph wrapper: the button is the root', () => {
      const { container } = render(<TourButton />)
      expect(container.querySelector('p')).toBeNull()
      expect(container.firstElementChild?.tagName).toBe('BUTTON')
    })
  })

  describe('when the tour is not on the site (the live site, still a draft)', () => {
    it('renders nothing at all', () => {
      mockOnSite = false
      const { container } = render(<TourButton />)
      expect(container).toBeEmptyDOMElement()
    })

    it('cannot be clicked, so no tour starts', () => {
      mockOnSite = false
      render(<TourButton />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
