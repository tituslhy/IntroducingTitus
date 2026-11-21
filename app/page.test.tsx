import { render, screen, within } from '@testing-library/react'
import { ARTICLE_COUNT_NUMBER } from '@/lib/content'
import { CURRENT_ROLE, EMAIL } from '@/lib/profile'
import Home from './page'

describe('Home (front page)', () => {
  it('renders a single main landmark', () => {
    render(<Home />)
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('renders the hero: name, tagline and the current role in the eyebrow', () => {
    render(<Home />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lim Hsien Yong (Titus)')
    expect(screen.getByText(/I build AI systems/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${CURRENT_ROLE.role} · ${CURRENT_ROLE.company}`))).toBeInTheDocument()
  })

  it('renders the opening sentence with the article count from data', () => {
    render(<Home />)
    const opening = screen.getByText(/putting AI into production/).closest('p')
    expect(opening).toHaveTextContent('Eight years putting AI into production.')
    expect(opening).toHaveTextContent(`${ARTICLE_COUNT_NUMBER} articles explaining how it works.`)
  })

  it('renders the "On this site" label that the down button scrolls to', () => {
    render(<Home />)
    const label = screen.getByRole('heading', { name: 'On this site' })
    expect(label).toHaveAttribute('id', 'on-this-site')
  })

  it('renders five page doors, one each to /experience, /education, /projects, /writing and /about', () => {
    render(<Home />)
    const region = screen.getByRole('region', { name: 'On this site' })
    const hrefs = within(region)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/experience', '/education', '/projects', '/writing', '/about']))
  })

  it('renders the Ask Titus door linking to the colophon', () => {
    const { container } = render(<Home />)
    const door = container.querySelector('#ask') as HTMLElement
    expect(door).toBeInTheDocument()
    expect(within(door).getByRole('link', { name: 'Ask Titus' })).toHaveAttribute('href', '/colophon')
  })

  it('no longer renders the dark Ask band as its own section', () => {
    const { container } = render(<Home />)
    expect(container.querySelector('section#ask')).toBeNull()
    expect(screen.queryByRole('region', { name: /^Ask Titus/ })).not.toBeInTheDocument()
  })

  it('renders the footer with the resume contact', () => {
    const { container } = render(<Home />)
    expect(container.querySelector('footer')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: EMAIL }).length).toBeGreaterThan(0)
  })

  it('no longer renders the old long-scroll sections or their anchors', () => {
    const { container } = render(<Home />)
    for (const id of ['lede', 'stack', 'dossier', 'projects', 'writing']) {
      expect(container.querySelector(`#${id}`)).toBeNull()
    }
    expect(screen.queryByRole('heading', { name: /a note on the.*work/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /what i.*work with/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /where i have.*worked/i })).not.toBeInTheDocument()
  })

  it('keeps the front-page sections in order: hero, opening, doors, footer', () => {
    const { container } = render(<Home />)
    const main = container.querySelector('main')!
    const order = Array.from(main.children).map((el) => el.tagName.toLowerCase())
    // Hero (section), OpeningLine (div), Doors (section, which ends with the Ask door), Footer (footer)
    expect(order).toEqual(['section', 'div', 'section', 'footer'])
    expect(main.querySelector('footer')).toBe(main.lastElementChild)
  })
})
