import { render, screen, within } from '@testing-library/react'
import { ARTICLE_COUNT_NUMBER, YEARS_EXPERIENCE_NUMBER, numberToWords } from '@/lib/content'
import { educationDoor } from '@/lib/education'
import { ASK_FOLIO, EDUCATION, FEATURED_BY, PROJECTS, ROLES } from '@/lib/profile'
import { capitalise, themeCounts } from '@/lib/front-page'
import { experienceResults } from '@/lib/experience'
import { educationResults } from '@/lib/education'
import { DOOR_BOX } from './door-box'
import Doors from './Doors'

const boxClasses = DOOR_BOX.split(' ')

// Lets one test swap what the data functions return, to prove the door renders the data and types no numbers.
// The state lives inside each factory (jest.mock is hoisted above any top-level const), read back via requireMock.
jest.mock('@/lib/front-page', () => {
  const actual = jest.requireActual('@/lib/front-page')
  const state: { experienceDoor?: unknown } = {}
  return {
    ...actual,
    __state: state,
    experienceDoor: (...args: unknown[]) => state.experienceDoor ?? actual.experienceDoor(...args),
  }
})
jest.mock('@/lib/content', () => {
  const actual = jest.requireActual('@/lib/content')
  const state: { articles?: number } = {}
  return {
    ...actual,
    __state: state,
    get ARTICLE_COUNT_NUMBER() {
      return state.articles ?? actual.ARTICLE_COUNT_NUMBER
    },
  }
})

const frontState = (jest.requireMock('@/lib/front-page') as { __state: { experienceDoor?: unknown } }).__state
const contentState = (jest.requireMock('@/lib/content') as { __state: { articles?: number } }).__state

afterEach(() => {
  delete frontState.experienceDoor
  delete contentState.articles
})

const door = (container: HTMLElement, href: string) => {
  const link = container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)
  if (!link) throw new Error(`no door to ${href}`)
  return link
}

describe('Doors ("On this site")', () => {
  it('renders the amber label as the region heading', () => {
    render(<Doors />)
    expect(screen.getByRole('region', { name: 'On this site' })).toBeInTheDocument()
  })

  it('renders five page doors in nav order, numbered 01 to 05, each linking to its page', () => {
    const { container } = render(<Doors />)
    const pages = ['/experience', '/education', '/projects', '/writing', '/about']
    const links = pages.map((href) => door(container, href))
    expect(links.map((a) => within(a).getByText(/^0\d$/).textContent)).toEqual(['01', '02', '03', '04', '05'])
    expect(links.map((a) => within(a).getByRole('heading', { level: 3 }).textContent?.replace('→', '').trim())).toEqual([
      'Experience',
      'Education',
      'Projects',
      'Writing',
      'About',
    ])
  })

  it('lists the page doors in the same order as the nav', () => {
    const { container } = render(<Doors />)
    const hrefs = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => h !== '/colophon')
    expect(hrefs).toEqual(['/experience', '/education', '/projects', '/writing', '/about'])
  })

  it('ends with the Ask Titus door, numbered 06, after the About door', () => {
    const { container } = render(<Doors />)
    const doors = Array.from(container.querySelectorAll<HTMLElement>('section#ways > div > *'))
    expect(doors).toHaveLength(6)
    expect(doors[5]).toHaveAttribute('id', 'ask')
    expect(doors[5].querySelector('div')).toHaveTextContent(ASK_FOLIO)
    expect(ASK_FOLIO).toBe('06')
  })

  it('puts every door in the same box, with no hairline rules between or around them', () => {
    const { container } = render(<Doors />)
    for (const href of ['/experience', '/education', '/projects', '/writing', '/about']) {
      expect(door(container, href)).toHaveClass(...boxClasses)
    }
    expect(container.querySelector('#ask')).toHaveClass(...boxClasses)
  })

  it('lays the doors out in a two-column grid with a gap between them', () => {
    const { container } = render(<Doors />)
    const grid = container.querySelector('section#ways > div') as HTMLElement
    expect(grid).toHaveClass('grid', 'gap-3')
  })

  describe('01 Experience', () => {
    it('states the number of roles in words, from ROLES', () => {
      render(<Doors />)
      expect(
        screen.getByText(`${capitalise(numberToWords(ROLES.length))} roles, from supply-chain forecasting to leading AI engineering.`)
      ).toBeInTheDocument()
    })

    it('previews the latest three roles, marking the current one as now', () => {
      const { container } = render(<Doors />)
      const rows = within(door(container, '/experience')).getAllByRole('listitem')
      expect(rows.slice(0, 3).map((li) => li.textContent)).toEqual([
        expect.stringContaining(`${ROLES[0].role}, ${ROLES[0].company}`),
        expect.stringContaining(`VP, Generative AI, ${ROLES[1].company}`),
        expect.stringContaining(`${ROLES[2].role}, ${ROLES[2].company}`),
      ])
      expect(rows[0]).toHaveTextContent('now')
      expect(rows[0].querySelector('span:last-child')).toHaveClass('text-amber')
    })

    it('ends the preview with the earlier-roles count and a pointer to the full list', () => {
      const { container } = render(<Doors />)
      const rows = within(door(container, '/experience')).getAllByRole('listitem')
      const earlier = ROLES.length - 3
      expect(rows[3]).toHaveTextContent(`+ ${numberToWords(earlier)} earlier roles`)
      expect(rows[3]).toHaveTextContent('see all →')
    })
  })

  describe('01 Experience headline tile', () => {
    it('shows the years of experience from experienceResults, with its label', () => {
      const [years] = experienceResults()
      const { container } = render(<Doors />)
      const tile = door(container, '/experience')
      expect(within(tile).getByText(years.figure)).toBeInTheDocument()
      expect(within(tile).getByText(years.label)).toBeInTheDocument()
      expect(years).toMatchObject({ figure: `${YEARS_EXPERIENCE_NUMBER}+`, label: 'years building production AI' })
    })
  })

  describe('02 Projects', () => {
    it('has the fixed deck', () => {
      render(<Doors />)
      expect(screen.getByText("Selected projects: at work, in public, and for fun.")).toBeInTheDocument()
    })

    it('previews each project with its key figure and where it lives', () => {
      const { container } = render(<Doors />)
      const rows = within(door(container, '/projects')).getAllByRole('listitem')
      expect(rows).toHaveLength(PROJECTS.length)
      PROJECTS.forEach((project, i) => {
        expect(rows[i]).toHaveTextContent(project.figure.value)
        expect(rows[i]).toHaveTextContent(`${project.title}: ${project.preview}`)
        expect(rows[i]).toHaveTextContent(project.github ? 'GitHub' : 'work')
      })
    })
  })

  describe('02 Education', () => {
    it('has the fixed deck', () => {
      render(<Doors />)
      expect(screen.getByText('Degrees, an exchange, a summer and a winter school, with the honours.')).toBeInTheDocument()
    })

    it('has one row per degree, dated by its year, naming its institution', () => {
      const { container } = render(<Doors />)
      const rows = within(door(container, '/education')).getAllByRole('listitem')
      expect(rows).toHaveLength(EDUCATION.length)
      EDUCATION.forEach((e, i) => {
        expect(rows[i]).toHaveTextContent(e.years)
        expect(rows[i]).toHaveTextContent(e.institution)
      })
    })

    it('shows the lead result from educationResults as a headline tile', () => {
      const [lead] = educationResults()
      const { container } = render(<Doors />)
      const tile = door(container, '/education')
      expect(within(tile).getByText(lead.figure)).toBeInTheDocument()
      expect(within(tile).getByText(lead.label)).toBeInTheDocument()
      expect(lead).toMatchObject({ figure: '3.98', label: 'GPA at SMU' })
    })

    it('gives each degree its own standing as the right-hand note, from the data', () => {
      const { container } = render(<Doors />)
      const rows = within(door(container, '/education')).getAllByRole('listitem')
      expect(rows.map((li) => li.querySelector('span:last-child')?.textContent)).toEqual(
        educationDoor().map((r) => r.end)
      )
      expect(rows.map((li) => li.querySelector('span:last-child')?.textContent)).toEqual([
        'GPA 3.98/4.0',
        '2nd Upper',
        'Top Student',
      ])
    })

    it('puts the level before the institution in each row, e.g. "Master’s, Singapore Management University"', () => {
      const { container } = render(<Doors />)
      const rows = within(door(container, '/education')).getAllByRole('listitem')
      expect(rows.map((li) => li.querySelector('span:nth-child(2)')?.textContent)).toEqual(
        educationDoor().map((r) => r.text)
      )
      expect(rows[0]).toHaveTextContent('Master’s, Singapore Management University')
      expect(rows[1]).toHaveTextContent('Bachelor’s, National University of Singapore')
    })

    it('never notes NUS with a First Class from one of its programmes', () => {
      const { container } = render(<Doors />)
      const nus = within(door(container, '/education')).getByText('Bachelor’s, National University of Singapore').closest('li')
      expect(nus).toHaveTextContent('2nd Upper')
      expect(nus).not.toHaveTextContent('First Class')
    })

    it('reads the education rows from educationDoor, rather than typing them', () => {
      const { container } = render(<Doors />)
      const rows = within(door(container, '/education')).getAllByRole('listitem')
      expect(rows.map((li) => li.querySelector('span:nth-child(2)')?.textContent)).toEqual(
        educationDoor().map((r) => r.text)
      )
    })
  })

  describe('03 Writing', () => {
    it('shows the article count from the canonical number, as a headline tile, with its label', () => {
      const { container } = render(<Doors />)
      const tile = door(container, '/writing')
      expect(within(tile).getByText(String(ARTICLE_COUNT_NUMBER))).toBeInTheDocument()
      expect(within(tile).getByText('technical articles on Medium')).toBeInTheDocument()
    })

    it('has a deck that carries no number, so the count only comes from the data', () => {
      render(<Doors />)
      expect(screen.getByText('Technical articles on Medium, grouped by theme.')).toBeInTheDocument()
      expect(screen.queryByText(new RegExp(`${ARTICLE_COUNT_NUMBER}\\s+technical`))).toBeNull()
    })

    it('shows a chip per theme with its count, from the theme data', () => {
      const { container } = render(<Doors />)
      // Each chip is a span holding its own count in a <b>.
      const chips = Array.from(door(container, '/writing').querySelectorAll<HTMLElement>('span')).filter((s) => s.querySelector('b'))
      const expected = themeCounts()
      expect(chips).toHaveLength(expected.length)
      expected.forEach((theme, i) => {
        expect(chips[i]).toHaveTextContent(theme.name)
        expect(chips[i].querySelector('b')).toHaveTextContent(String(theme.count))
      })
    })
  })

  describe('05 About', () => {
    it('has the fixed deck', () => {
      render(<Doors />)
      expect(screen.getByText('Chemical engineer turned AI engineer.')).toBeInTheDocument()
    })

    it('gives the two-sentence bio and the featured-by list from the profile', () => {
      const { container } = render(<Doors />)
      const aboutDoor = door(container, '/about')
      expect(aboutDoor).toHaveTextContent('NUS chemical engineering, then a Master\'s in AI at SMU')
      expect(within(aboutDoor).getByText('Featured by')).toBeInTheDocument()
      expect(aboutDoor).toHaveTextContent(FEATURED_BY.join(' · '))
    })
  })

  it('renders the numbers the data functions return, rather than typed ones', () => {
    frontState.experienceDoor = {
      deck: 'Nine roles, from a to b.',
      rows: [{ lead: '2099', text: 'Test Role, Test Co', end: 'now', current: true }],
    }
    contentState.articles = 123
    const { container } = render(<Doors />)
    expect(screen.getByText('Nine roles, from a to b.')).toBeInTheDocument()
    expect(within(door(container, '/experience')).getByText('Test Role, Test Co')).toBeInTheDocument()
    expect(within(door(container, '/writing')).getByText('123')).toBeInTheDocument()
  })
})
