import { render, screen } from '@testing-library/react'
import Hero from './Hero'

describe('Hero', () => {
  it('should render the masthead section with correct id', () => {
    render(<Hero />)
    const section = screen.getByRole('heading', { name: /lim hsien yong/i }).closest('section')
    expect(section).toHaveAttribute('id', 'masthead')
  })

  it('should render headshot image with correct alt text', () => {
    render(<Hero />)
    const image = screen.getByRole('img', { name: /portrait of titus lim/i })
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', '/headshot.jpeg')
  })

  it('should render name with three spans (Lim, Hsien Yong, Titus)', () => {
    render(<Hero />)
    expect(screen.getByText(/^Lim$/)).toBeInTheDocument()
    expect(screen.getByText(/Hsien\s+Yong/)).toBeInTheDocument()
    expect(screen.getByText(/\(titus\)/i)).toBeInTheDocument()
  })

  it('should render the main tagline "I build AI systems"', () => {
    render(<Hero />)
    expect(screen.getByText(/build ai systems/i)).toBeInTheDocument()
    expect(screen.getByText(/from architecture to the boardroom/i)).toBeInTheDocument()
  })

  it('should render sub-tagline about production AI and articles', () => {
    render(<Hero />)
    expect(screen.getByText(/eight years of production ai/i)).toBeInTheDocument()
    expect(screen.getByText(/fifty published articles/i)).toBeInTheDocument()
    expect(screen.getAllByText(/mastercard/i).length).toBeGreaterThan(0)
  })

  it('should render status bar with location, role, and year', () => {
    render(<Hero />)
    expect(screen.getByText('Singapore')).toBeInTheDocument()
    expect(screen.getAllByText(/Lead AI Engineer/i).length).toBeGreaterThan(0)
    expect(screen.getByText('2026')).toBeInTheDocument()
  })

  it('should render "View experience" CTA with correct anchor link', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: /view experience/i })
    expect(link).toHaveAttribute('href', '#dossier')
  })

  it('should render "Read writing" CTA with correct anchor link', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: /read writing/i })
    expect(link).toHaveAttribute('href', '#writing')
  })

  it('should render "Resume on request" link as mailto', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: /resume on request/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:tituslhy@gmail.com'))
    expect(link).toHaveAttribute('href', expect.stringContaining('subject=Resume Request'))
  })

  it('should render GitHub social link with correct href', () => {
    render(<Hero />)
    const links = screen.getAllByRole('link')
    const githubLink = links.find((a) =>
      a.getAttribute('href')?.includes('github.com/tituslhy')
    )
    expect(githubLink).toHaveAttribute('href', 'https://github.com/tituslhy')
  })

  it('should render LinkedIn social link with correct href', () => {
    render(<Hero />)
    const links = screen.getAllByRole('link')
    const linkedinLink = links.find((a) =>
      a.getAttribute('href')?.includes('linkedin.com')
    )
    expect(linkedinLink).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/titus-lim-hsien-yong-70223254/'
    )
  })

  it('should render Medium social link with correct href', () => {
    render(<Hero />)
    const links = screen.getAllByRole('link')
    const mediumLink = links.find((a) =>
      a.getAttribute('href')?.includes('medium.com')
    )
    expect(mediumLink).toHaveAttribute('href', 'https://medium.com/@tituslhy')
  })

  it('should render Coffee (Buy Me a Coffee) social link with correct href', () => {
    render(<Hero />)
    const links = screen.getAllByRole('link')
    const coffeeLink = links.find((a) =>
      a.getAttribute('href')?.includes('buymeacoffee.com')
    )
    expect(coffeeLink).toHaveAttribute('href', 'https://buymeacoffee.com/tituslhy')
  })

  it('should render Email social link with mailto href', () => {
    render(<Hero />)
    const links = screen.getAllByRole('link')
    const emailLinks = links.filter((a) => {
      const href = a.getAttribute('href')
      return href?.startsWith('mailto:') && !href.includes('subject=')
    })
    expect(emailLinks.length).toBeGreaterThan(0)
    expect(emailLinks[0]).toHaveAttribute('href', 'mailto:tituslhy@gmail.com')
  })

  it('should render external social links with target="_blank" and rel="noopener noreferrer"', () => {
    render(<Hero />)
    const links = screen.getAllByRole('link')
    const externalLinks = links.filter((a) => {
      const href = a.getAttribute('href')
      return href?.startsWith('https://') && !href?.includes('anchor') && !href?.includes('#')
    })

    // At least some external links (GitHub, LinkedIn, Medium, Coffee)
    const externalWithBlank = externalLinks.filter(
      (a) => a.getAttribute('target') === '_blank'
    )
    expect(externalWithBlank.length).toBeGreaterThanOrEqual(4)
    externalWithBlank.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  it('should render three kicker lines with correct labels', () => {
    render(<Hero />)
    expect(screen.getByText('Ten years')).toBeInTheDocument()
    expect(screen.getByText('Fifty Two')).toBeInTheDocument()
    expect(screen.getByText('Currently')).toBeInTheDocument()
  })

  it('should render kicker text with production AI mention', () => {
    render(<Hero />)
    const kickerTexts = screen.getAllByText(/of production ai/i)
    expect(kickerTexts.length).toBeGreaterThan(0)
  })

  it('should render kicker text with technical articles mention', () => {
    render(<Hero />)
    const elements = screen.getAllByText(/technical articles/i)
    expect(elements.length).toBeGreaterThan(0)
  })

  it('should render kicker text with Mastercard mention', () => {
    render(<Hero />)
    const elements = screen.getAllByText(/mastercard/i)
    expect(elements.length).toBeGreaterThan(0)
  })

  it('should render role label "GenAI Engineer & Architect"', () => {
    render(<Hero />)
    expect(screen.getByText(/genai engineer & architect/i)).toBeInTheDocument()
  })

  it('should have proper heading hierarchy with h1 for name', () => {
    render(<Hero />)
    const h1 = screen.getByRole('heading', { level: 1, name: /lim hsien yong/i })
    expect(h1).toBeInTheDocument()
  })

  it('should render CTA buttons with border and padding classes', () => {
    render(<Hero />)
    const experienceButton = screen.getByRole('link', { name: /view experience/i })
    const writingButton = screen.getByRole('link', { name: /read writing/i })

    // Check for button-like styling with border
    expect(experienceButton).toHaveClass('border')
    expect(writingButton).toHaveClass('border')
    // Check they have px padding (tailwind uses px-[value])
    expect(experienceButton.className).toMatch(/px-\[/)
    expect(writingButton.className).toMatch(/px-\[/)
  })

  it('should render "View experience" CTA with arrow icon', () => {
    render(<Hero />)
    const experienceButton = screen.getByRole('link', { name: /view experience/i })
    expect(experienceButton.textContent).toContain('→')
  })

  it('should render multiple contact/resume links', () => {
    render(<Hero />)
    const emailLinks = screen.getAllByRole('link', { name: /email|resume/i })
    expect(emailLinks.length).toBeGreaterThan(0)
  })

  it('should have correct kicker grid structure with 3 items', () => {
    const { container } = render(<Hero />)
    const kickerList = container.querySelector('ul')
    if (kickerList) {
      const kickerItems = kickerList.querySelectorAll('li')
      expect(kickerItems.length).toBe(3)
    }
  })

  it('should render social links with icon SVGs', () => {
    const { container } = render(<Hero />)
    // Find SVGs within the social links section
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]')
    // Should have multiple SVGs for social icons (GitHub, LinkedIn, Medium, Coffee, Mail)
    expect(svgs.length).toBeGreaterThanOrEqual(5)
  })

  it('should have an aria-label on the h1 identifying name', () => {
    const { container } = render(<Hero />)
    const h1 = container.querySelector('h1')
    expect(h1).toHaveAttribute('aria-label', expect.stringContaining('Titus'))
  })
})
