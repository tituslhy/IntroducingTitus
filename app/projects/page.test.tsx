import { render } from '@testing-library/react'
import { SITE_URL } from '@/lib/content'
import { EARLIER_PROJECTS, OPEN_SOURCE, PROJECTS } from '@/lib/profile'
import ProjectsPage, { metadata } from './page'

describe('Projects page (/projects)', () => {
  it('renders the Projects section inside main, with one anchor per featured project', () => {
    const { container } = render(<ProjectsPage />)
    expect(container.querySelector('main section#projects')).toBeInTheDocument()
    for (const project of PROJECTS) {
      expect(container.querySelector(`main #project-${project.slug}`)).toBeInTheDocument()
    }
  })

  it('renders the earlier-work and open-source sections', () => {
    const { container } = render(<ProjectsPage />)
    expect(container.querySelector('main section#earlier-work')).toBeInTheDocument()
    expect(container.querySelector('main section#open-source')).toBeInTheDocument()
    expect(container.querySelectorAll('main section#earlier-work [data-reveal]')).toHaveLength(EARLIER_PROJECTS.length)
    expect(container.querySelectorAll('main section#open-source dt')).toHaveLength(OPEN_SOURCE.length)
  })

  it('ends with the footer, after the projects', () => {
    const { container } = render(<ProjectsPage />)
    const footer = container.querySelector('main footer')
    expect(footer).toBeInTheDocument()
    const projects = container.querySelector('main section#projects')!
    expect(projects.compareDocumentPosition(footer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not render the writing section', () => {
    const { container } = render(<ProjectsPage />)
    expect(container.querySelector('#writing')).toBeNull()
  })

  it('has a page title, description and canonical URL for /projects', () => {
    expect(metadata.title).toBe('Projects | Titus Lim')
    expect(metadata.description).toContain('featured projects')
    expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/projects`)
  })
})
