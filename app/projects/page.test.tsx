import { render } from '@testing-library/react'
import { SITE_URL } from '@/lib/content'
import { PROJECTS } from '@/lib/profile'
import ProjectsPage, { metadata } from './page'

describe('Projects page (/projects)', () => {
  it('renders the projects section with one anchor per project, and open source', () => {
    const { container } = render(<ProjectsPage />)
    expect(container.querySelector('main section#projects')).toBeInTheDocument()
    for (const project of PROJECTS) {
      expect(container.querySelector(`#project-${project.slug}`)).toBeInTheDocument()
    }
    expect(container.querySelector('#open-source')).toBeInTheDocument()
  })

  it('ends with the footer', () => {
    const { container } = render(<ProjectsPage />)
    expect(container.querySelector('main footer')).toBeInTheDocument()
  })

  it('does not render the writing section', () => {
    const { container } = render(<ProjectsPage />)
    expect(container.querySelector('#writing')).toBeNull()
  })

  it('has a page title and a canonical URL for /projects', () => {
    expect(metadata.title).toBe('Projects | Titus Lim')
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/projects`)
  })
})
