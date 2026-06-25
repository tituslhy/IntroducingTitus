import { render, screen } from '@testing-library/react'
import RootLayout, { metadata } from './layout'

describe('RootLayout metadata', () => {
  it('should export correct page title', () => {
    expect(metadata.title).toBe('Titus Lim | GenAI Engineer & Architect')
  })

  it('should export correct page description', () => {
    expect(metadata.description).toContain('GenAI engineer and architect')
    expect(metadata.description).toContain('8+ years building production AI systems')
    expect(metadata.description).toContain('50 technical articles')
  })

  it('should export OpenGraph metadata with correct title', () => {
    expect(metadata.openGraph?.title).toBe('Titus Lim | GenAI Engineer & Architect')
  })

  it('should export OpenGraph metadata with correct description', () => {
    expect(metadata.openGraph?.description).toContain('GenAI engineer and architect')
    expect(metadata.openGraph?.description).toContain('8+ years building production AI systems')
  })

  it('should export OpenGraph metadata with correct URL', () => {
    expect(metadata.openGraph?.url).toBe('https://introducing-titus.vercel.app')
  })

  it('should export OpenGraph metadata with siteName', () => {
    expect(metadata.openGraph?.siteName).toBe('Titus Lim')
  })

  it('should export OpenGraph metadata with type website', () => {
    expect((metadata.openGraph as { type?: string } | undefined)?.type).toBe('website')
  })

  it('should export canonical URL in alternates', () => {
    expect(metadata.alternates?.canonical).toBe('https://introducing-titus.vercel.app')
  })

  it('should have all required metadata fields', () => {
    expect(metadata).toHaveProperty('title')
    expect(metadata).toHaveProperty('description')
    expect(metadata).toHaveProperty('openGraph')
    expect(metadata).toHaveProperty('alternates')
  })

  it('should have OpenGraph description matching main description', () => {
    expect(metadata.openGraph?.description).toBe(metadata.description)
  })

  it('should have OpenGraph title matching main title', () => {
    expect(metadata.openGraph?.title).toBe(metadata.title)
  })
})

describe('RootLayout component', () => {
  it('should render the layout with children', () => {
    render(
      <RootLayout>
        <div data-testid="test-children">Test Content</div>
      </RootLayout>
    )
    expect(screen.getByTestId('test-children')).toBeInTheDocument()
  })

  it('should render html element with lang attribute', () => {
    const { container } = render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )
    const html = container.querySelector('html')
    expect(html).toHaveAttribute('lang', 'en')
  })

  it('should render body element with styling classes', () => {
    const { container } = render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )
    const body = container.querySelector('body')
    expect(body).toHaveClass('bg-paper', 'text-ink')
  })

  it('should render head element with font links', () => {
    const { container } = render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )
    const head = container.querySelector('head')
    expect(head).toBeInTheDocument()
    const links = head?.querySelectorAll('link')
    expect(links?.length).toBeGreaterThan(0)
  })

  it('should include favicon link in head', () => {
    const { container } = render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )
    const favicon = container.querySelector('link[rel="icon"]')
    expect(favicon).toHaveAttribute('href', '/headshot.jpeg')
  })

  it('should render children prop correctly', () => {
    render(
      <RootLayout>
        <section id="main-content">Content Here</section>
      </RootLayout>
    )
    const section = screen.getByText('Content Here')
    expect(section).toBeInTheDocument()
  })
})
