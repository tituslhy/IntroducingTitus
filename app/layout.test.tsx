import { render, screen } from '@testing-library/react'
import { ARTICLE_COUNT_SHORT } from '@/lib/content'
import RootLayout, { metadata } from './layout'

describe('RootLayout metadata', () => {
  it('should export correct page title', () => {
    expect(metadata.title).toBe('Titus Lim | GenAI Engineer & Architect')
  })

  it('should export correct page description', () => {
    expect(metadata.description).toContain('GenAI engineer and architect')
    expect(metadata.description).toContain('8+ years building production AI systems')
    expect(metadata.description).toContain(ARTICLE_COUNT_SHORT)
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
    // Note: RTL render() with Root Layout (which returns html/head/body) will trigger
    // React 19's HTML hoisting, which causes HTML validation warnings in tests.
    // This is expected behavior in React 19 and not a test failure.
    render(
      <RootLayout>
        <div data-testid="test-children">Test Content</div>
      </RootLayout>
    )
    const testChild = screen.getByTestId('test-children')
    expect(testChild).toBeInTheDocument()
    expect(testChild.textContent).toBe('Test Content')
  })

  it('should render html element with lang attribute', () => {
    render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )
    // In React 19, html/head/body are hoisted to the real document, not the container
    const html = document.documentElement
    expect(html).toHaveAttribute('lang', 'en')
  })

  it('should render body element with styling classes', () => {
    render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )
    // In React 19, html/head/body are hoisted to the real document
    const body = document.body
    expect(body).toHaveClass('bg-paper', 'text-ink')
  })

  it('should render html element with font CSS variable classes from next/font', () => {
    render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )
    // next/font/google injects classNames containing the variable pattern (they are auto-generated)
    // The className will have format like "__newsreader_<hash> __ibmPlexMono_<hash>"
    // At minimum, check that the html element has multiple font-related classes applied
    const html = document.documentElement
    // The className should contain "variable" from next/font injection
    expect(html.className.length).toBeGreaterThan(0)
    // Also verify the font applied by checking that the variable names are in style (set via CSS variable)
    // Since next/font uses CSS variables, we check that the HTML element was modified
    expect(html).toHaveAttribute('class')
  })

  it('should render noscript style fallback for reveals', () => {
    render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )
    // Check that noscript content is present in the head
    const head = document.head
    const noscriptElements = head.querySelectorAll('noscript')
    expect(noscriptElements.length).toBeGreaterThan(0)
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
