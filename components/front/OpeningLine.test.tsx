import { fireEvent, render, screen, within } from '@testing-library/react'
import { COPILOT_TOUR_EVENT } from '@/lib/copilot-events'
import { ARTICLE_COUNT_NUMBER, YEARS_EXPERIENCE_NUMBER, numberToWords } from '@/lib/content'
import { FRONT_STATS } from '@/lib/front-page'
import { OPEN_SOURCE, SOCIAL } from '@/lib/profile'
import OpeningLine from './OpeningLine'

// Whether the tour's buttons are on the site (false on the live site while the tour is still a draft).
let mockOnSite = true
jest.mock('@/lib/site-tour', () => ({
  ...jest.requireActual<typeof import('@/lib/site-tour')>('@/lib/site-tour'),
  get TOUR_ON_SITE() {
    return mockOnSite
  },
}))
afterEach(() => {
  mockOnSite = true
})

/** The four stat tiles, found by their link targets. Each one is a link, so it has a role. */
const tileFor = (href: string) => document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`) as HTMLAnchorElement

describe('OpeningLine', () => {
  it('says the years in words, then the article count', () => {
    const { container } = render(<OpeningLine />)
    const sentence = container.querySelector('p')!
    expect(sentence).toHaveTextContent(`Eight years putting AI into production. ${ARTICLE_COUNT_NUMBER} articles explaining how it works.`)
  })

  it('keeps the sentence plain ink, with no bold or amber numbers in it', () => {
    const { container } = render(<OpeningLine />)
    const sentence = container.querySelector('p')!
    expect(sentence.querySelectorAll('b, strong, em')).toHaveLength(0)
    expect(sentence.querySelectorAll('[class*="text-amber"]')).toHaveLength(0)
    expect(sentence).not.toHaveClass('text-amber')
    expect(sentence.textContent).toContain(String(FRONT_STATS.repos))
    expect(sentence.textContent).toContain(String(FRONT_STATS.contributions))
  })

  it('takes the contribution count from OPEN_SOURCE and the repo count from the GitHub data', () => {
    expect(FRONT_STATS.contributions).toBe(OPEN_SOURCE.length)
    const { container } = render(<OpeningLine />)
    expect(container.querySelector('p')).toHaveTextContent(`${FRONT_STATS.repos} public repos`)
    expect(container.querySelector('p')).toHaveTextContent(`${OPEN_SOURCE.length} contributions back`)
  })

  it('spells out the years from the years constant, not a typed word', () => {
    expect(numberToWords(8)).toBe('eight')
    render(<OpeningLine />)
    expect(screen.getByText(/^Eight years putting AI into production\./)).toBeInTheDocument()
  })

  it('no longer has a "Short on time? Let me show you around" line: the tour lives in the hero', () => {
    const { container } = render(<OpeningLine />)
    expect(screen.queryByText(/short on time/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/show you around/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/short on time/i)
  })

  it('has no tour button, whether or not the tour is on the site', () => {
    for (const onSite of [true, false]) {
      mockOnSite = onSite
      const { unmount } = render(<OpeningLine />)
      expect(screen.queryByRole('button', { name: /show me around|short on time/i })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('has just the sentence as its one paragraph', () => {
    const { container } = render(<OpeningLine />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(screen.getByRole('link', { name: "Scroll down to what's on this site" })).toBeInTheDocument()
  })

  it('does not start a tour from anything in it', () => {
    const heard = jest.fn()
    window.addEventListener(COPILOT_TOUR_EVENT, heard)
    try {
      render(<OpeningLine />)
      screen.getAllByRole('link').forEach((a) => {
        a.addEventListener('click', (e) => e.preventDefault())
        fireEvent.click(a)
      })
      expect(heard).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(COPILOT_TOUR_EVENT, heard)
    }
  })

  it('has the down button beneath the sentence', () => {
    render(<OpeningLine />)
    expect(screen.getByRole('link', { name: "Scroll down to what's on this site" })).toHaveAttribute('href', '#on-this-site')
  })

  describe('stat tiles', () => {
    it('lays out exactly four tiles, all links', () => {
      const { container } = render(<OpeningLine />)
      const grid = container.querySelector<HTMLElement>('.grid-cols-2')!
      expect(within(grid).getAllByRole('link')).toHaveLength(4)
    })

    it('shows the years tile as years+ from FRONT_STATS, linking to /experience', () => {
      render(<OpeningLine />)
      const tile = tileFor('/experience')
      expect(tile).toHaveTextContent(`${FRONT_STATS.years}+`)
      expect(tile).toHaveTextContent('years in production AI')
      expect(tile).not.toHaveAttribute('target')
    })

    it('shows the years figure from the years constant, not a typed number', () => {
      expect(FRONT_STATS.years).toBe(YEARS_EXPERIENCE_NUMBER)
      render(<OpeningLine />)
      expect(tileFor('/experience')).toHaveTextContent(`${YEARS_EXPERIENCE_NUMBER}+`)
    })

    it('shows the article count from data, linking to /writing', () => {
      render(<OpeningLine />)
      const tile = tileFor('/writing')
      expect(tile).toHaveTextContent(String(FRONT_STATS.articles))
      expect(tile).toHaveTextContent('technical articles')
      expect(tile).not.toHaveAttribute('target')
    })

    it('shows the repo count from data, linking out to GitHub in a new tab, with the external arrow', () => {
      render(<OpeningLine />)
      const tile = tileFor(SOCIAL.github)
      expect(tile).toHaveTextContent(String(FRONT_STATS.repos))
      expect(tile).toHaveTextContent('public repos')
      expect(tile).toHaveAttribute('target', '_blank')
      expect(tile.getAttribute('rel')).toContain('noopener')
      expect(tile).toHaveTextContent('↗')
      expect(tile).not.toHaveTextContent('→')
    })

    it('shows the contribution count from data, linking to the open-source section of /projects', () => {
      render(<OpeningLine />)
      const tile = tileFor('/projects#open-source')
      expect(tile).toHaveTextContent(String(OPEN_SOURCE.length))
      expect(tile).toHaveTextContent('open-source contributions')
      expect(tile).not.toHaveAttribute('target')
      expect(tile).toHaveTextContent('→')
    })

    it('points the tiles at the right places, in the order years, articles, repos, contributions', () => {
      render(<OpeningLine />)
      const grid = document.querySelector<HTMLElement>('.grid-cols-2')!
      expect(Array.from(grid.querySelectorAll('a'), (a) => a.getAttribute('href'))).toEqual([
        '/experience',
        '/writing',
        SOCIAL.github,
        '/projects#open-source',
      ])
    })

    it('reads each figure from data, not a typed literal, so the page cannot drift from FRONT_STATS', () => {
      const { container } = render(<OpeningLine />)
      const figures = Array.from(container.querySelectorAll('a [data-phase]'), (el) => el.textContent)
      expect(figures).toEqual([`${FRONT_STATS.years}+`, String(FRONT_STATS.articles), String(FRONT_STATS.repos), String(OPEN_SOURCE.length)])
    })
  })
})
