import { render, screen, within } from '@testing-library/react'
import { SITE_URL } from '@/lib/content'
import { SOCIAL } from '@/lib/profile'
import { desks, editions, stories } from '@/lib/writing-paper'
import WritingPage, { metadata } from './page'

describe('Writing page (/writing)', () => {
  it('renders the Writing paper, then the footer', () => {
    const { container } = render(<WritingPage />)
    expect(container.querySelector('main section#writing')).toBeInTheDocument()
    expect(container.querySelector('main footer')).toBeInTheDocument()
  })

  it('sets the paper nameplate, “The Titus Times”', () => {
    render(<WritingPage />)
    expect(screen.getByRole('heading', { level: 2, name: 'The Titus Times' })).toBeInTheDocument()
  })

  it('leads with the newest real article', () => {
    render(<WritingPage />)
    const newest = stories()[0]
    expect(screen.getByRole('heading', { level: 3, name: newest.title })).toBeInTheDocument()
  })

  it('counts the real articles on the nameplate, with the oldest edition’s year', () => {
    const { container } = render(<WritingPage />)
    const all = stories()
    expect(container.querySelector('.sr-only')).toHaveTextContent(String(all.length))
    const oldest = editions(all).at(-1)?.year
    expect(screen.getByText(`technical articles since ${oldest}`)).toBeInTheDocument()
  })

  it('offers an edition for every year and a desk for every theme in use', () => {
    render(<WritingPage />)
    const all = stories()
    const editionNav = screen.getByRole('navigation', { name: 'Editions' })
    expect(within(editionNav).getAllByRole('button')).toHaveLength(editions(all).length)
    const deskNav = screen.getByRole('navigation', { name: 'Desks' })
    expect(within(deskNav).getAllByRole('button')).toHaveLength(desks(all).length)
  })

  it('links to the full Medium archive, labelled “Every article on Medium”', () => {
    render(<WritingPage />)
    expect(screen.getByRole('link', { name: /every article on medium/i })).toHaveAttribute('href', SOCIAL.medium)
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
