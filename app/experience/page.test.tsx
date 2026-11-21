import { render } from '@testing-library/react'
import { SITE_URL } from '@/lib/content'
import { ROLES } from '@/lib/profile'
import ExperiencePage, { metadata } from './page'

describe('Experience page (/experience)', () => {
  it('renders the experience section with one anchor per role', () => {
    const { container } = render(<ExperiencePage />)
    expect(container.querySelector('main section#dossier')).toBeInTheDocument()
    for (const role of ROLES) {
      expect(container.querySelector(`#role-${role.slug}`)).toBeInTheDocument()
    }
  })

  it('leaves education to its own page, linked from the end of the section', () => {
    const { container } = render(<ExperiencePage />)
    expect(container.querySelector('#education')).toBeNull()
    expect(container.querySelector('main section#dossier a[href="/education"]')).toBeInTheDocument()
  })

  it('ends with the footer', () => {
    const { container } = render(<ExperiencePage />)
    expect(container.querySelector('main footer')).toBeInTheDocument()
  })

  it('does not render the About, Projects or Education sections', () => {
    const { container } = render(<ExperiencePage />)
    for (const id of ['lede', 'stack', 'projects', 'writing', 'education']) {
      expect(container.querySelector(`#${id}`)).toBeNull()
    }
  })

  it('has a page title and a canonical URL for /experience', () => {
    expect(metadata.title).toBe('Experience | Titus Lim')
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/experience`)
  })
})
