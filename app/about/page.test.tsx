import { render } from '@testing-library/react'
import { SITE_URL } from '@/lib/content'
import AboutPage, { metadata } from './page'

describe('About page (/about)', () => {
  it('renders the About and stack sections, then the footer', () => {
    const { container } = render(<AboutPage />)
    expect(container.querySelector('main section#lede')).toBeInTheDocument()
    expect(container.querySelector('main section#stack')).toBeInTheDocument()
    expect(container.querySelector('main footer')).toBeInTheDocument()
  })

  it('keeps the experience, projects and writing sections on their own routes', () => {
    const { container } = render(<AboutPage />)
    for (const id of ['dossier', 'projects', 'writing']) {
      expect(container.querySelector(`#${id}`)).toBeNull()
    }
  })

  it('has a page title and a canonical URL for /about', () => {
    expect(metadata.title).toBe('About | Titus Lim')
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/about`)
    expect(typeof metadata.description).toBe('string')
  })
})
