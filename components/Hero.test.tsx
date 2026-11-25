import { fireEvent, render, screen } from '@testing-library/react'
import { COPILOT_TOUR_EVENT } from '@/lib/copilot-events'
import { STARTER_PROMPTS } from '@/lib/starter-prompts'
import { CURRENT_ROLE, SOCIAL, EMAIL } from '@/lib/profile'
import { KEEP_OUT_ATTR } from '@/lib/hero-keepout'
import Hero from './Hero'

// The canvas animation has its own test (components/front/HeroAnimation.test.tsx).
jest.mock('@/components/front/HeroAnimation', () => ({
  __esModule: true,
  default: ({ className }: { className?: string }) => {
    const React = jest.requireActual<typeof import('react')>('react')
    return React.createElement('div', { 'data-testid': 'hero-animation', 'aria-hidden': 'true', className })
  },
}))

describe('Hero', () => {
  it('renders the hero stage section', () => {
    const { container } = render(<Hero />)
    expect(container.querySelector('section[data-hero-stage]')).toBeInTheDocument()
  })

  it('renders the headshot with its alt text and source', () => {
    render(<Hero />)
    const image = screen.getByRole('img', { name: /portrait of titus lim/i })
    expect(image).toHaveAttribute('src', '/headshot.jpeg')
  })

  it('renders the name as the only h1, with "(Titus)" in an italic amber em', () => {
    render(<Hero />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Lim Hsien Yong (Titus)')
    const titus = h1.querySelector('em')
    expect(titus).toHaveTextContent('(Titus)')
    expect(titus).toHaveClass('italic', 'text-amber')
  })

  it('renders the tagline, with the second half in amber', () => {
    render(<Hero />)
    const tagline = screen.getByText(/I build AI systems/)
    expect(tagline).toHaveTextContent('I build AI systems — from architecture to the boardroom.')
    expect(screen.getByText('from architecture to the boardroom.')).toHaveClass('text-amber')
  })

  it('renders the eyebrow from the current role, company and location', () => {
    render(<Hero />)
    expect(screen.getByText(new RegExp(`${CURRENT_ROLE.role} · ${CURRENT_ROLE.company} · ${CURRENT_ROLE.location}`))).toBeInTheDocument()
  })

  it('has a "Show me around" button first, then "View experience" as a link to /experience', () => {
    render(<Hero />)
    const tour = screen.getByRole('button', { name: /show me around/i })
    const experience = screen.getByRole('link', { name: /view experience/i })
    expect(experience).toHaveAttribute('href', '/experience')
    expect(tour.compareDocumentPosition(experience) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('no longer has a "Read the writing" link', () => {
    render(<Hero />)
    expect(screen.queryByRole('link', { name: /read the writing/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/read the writing/i)).not.toBeInTheDocument()
  })

  it('starts the tour when "Show me around" is clicked', () => {
    const heard = jest.fn()
    window.addEventListener(COPILOT_TOUR_EVENT, heard)
    try {
      render(<Hero />)
      fireEvent.click(screen.getByRole('button', { name: /show me around/i }))
      expect(heard).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(COPILOT_TOUR_EVENT, heard)
    }
  })

  it('does not link the CTAs to old in-page anchors', () => {
    render(<Hero />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs.some((h) => h?.startsWith('#'))).toBe(false)
  })

  it('renders "Show me around" as the dark primary button and "View experience" as the outlined one', () => {
    render(<Hero />)
    const tour = screen.getByRole('button', { name: /show me around/i })
    const experience = screen.getByRole('link', { name: /view experience/i })
    expect(tour).toHaveClass('bg-ink', 'text-paper')
    expect(experience).toHaveClass('border', 'border-ink')
    expect(experience).not.toHaveClass('bg-ink')
  })

  it('renders GitHub, LinkedIn and Medium as external links that open in a new tab', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', SOCIAL.github)
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', SOCIAL.linkedin)
    expect(screen.getByRole('link', { name: 'Medium' })).toHaveAttribute('href', SOCIAL.medium)
    for (const name of ['GitHub', 'LinkedIn', 'Medium']) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('uses the LinkedIn URL from lib/profile.ts', () => {
    expect(SOCIAL.linkedin).toBe('https://www.linkedin.com/in/titus-lim-hsien-yong/')
    render(<Hero />)
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/titus-lim-hsien-yong/'
    )
  })

  it('does not show the Coffee link in the hero (it lives in the footer)', () => {
    render(<Hero />)
    expect(screen.queryByRole('link', { name: /coffee/i })).not.toBeInTheDocument()
  })

  it('renders "Resume available on request" as a mailto with a resume subject', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: /resume available on request/i })
    expect(link).toHaveAttribute('href', `mailto:${EMAIL}?subject=Resume Request`)
  })

  it('marks the text, name, buttons, resume line and photo as keep-out for the animation', () => {
    const { container } = render(<Hero />)
    const keepOut = container.querySelectorAll(`[${KEEP_OUT_ATTR}]`)
    // eyebrow, name, tagline, buttons, resume line, photo
    expect(keepOut.length).toBeGreaterThanOrEqual(6)
    expect(container.querySelector(`[${KEEP_OUT_ATTR}="name"]`)?.tagName).toBe('H1')
    expect(container.querySelector(`[${KEEP_OUT_ATTR}="photo"]`)?.tagName).toBe('FIGURE')
  })

  it('renders the animation behind the text, hidden from assistive tech', () => {
    render(<Hero />)
    const animation = screen.getByTestId('hero-animation')
    expect(animation).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not render the old kicker lines or the old sub-tagline', () => {
    render(<Hero />)
    expect(screen.queryByText('Currently')).not.toBeInTheDocument()
    expect(screen.queryByText(/of production ai/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/8\+ years/i)).not.toBeInTheDocument()
  })
})

describe('Hero: the Ask card is gone', () => {
  it('no longer renders the "How it works" Ask Titus card', () => {
    render(<Hero />)
    expect(screen.queryByRole('link', { name: 'How it works' })).not.toBeInTheDocument()
  })

  it('no longer renders starter prompts as buttons under the hero text', () => {
    render(<Hero />)
    for (const prompt of STARTER_PROMPTS) {
      expect(screen.queryByRole('button', { name: prompt })).not.toBeInTheDocument()
    }
  })

  it('keeps the tour button inside the masthead, marked keep-out for the animation', () => {
    const { container } = render(<Hero />)
    const tour = screen.getByRole('button', { name: /show me around/i })
    expect(container.querySelector('section#masthead')).toContainElement(tour)
    expect(tour.closest(`[${KEEP_OUT_ATTR}]`)).not.toBeNull()
  })
})
