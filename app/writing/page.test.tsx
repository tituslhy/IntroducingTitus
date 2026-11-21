import { render } from '@testing-library/react'
import { SITE_URL } from '@/lib/content'
import WritingPage, { metadata } from './page'

describe('Writing page (/writing)', () => {
  it('renders the writing section, then the footer', () => {
    const { container } = render(<WritingPage />)
    expect(container.querySelector('main section#writing')).toBeInTheDocument()
    expect(container.querySelector('main footer')).toBeInTheDocument()
  })

  it('links to the full Medium archive', () => {
    const { getByRole } = render(<WritingPage />)
    expect(getByRole('link', { name: /the full archive on medium/i })).toHaveAttribute('href', 'https://medium.com/@tituslhy')
  })

  it('does not render the projects section', () => {
    const { container } = render(<WritingPage />)
    expect(container.querySelector('#projects')).toBeNull()
  })

  it('has a page title and a canonical URL for /writing', () => {
    expect(metadata.title).toBe('Writing | Titus Lim')
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/writing`)
  })
})
