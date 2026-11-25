import { fireEvent, render, screen, within } from '@testing-library/react'
import { COPILOT_TOUR_EVENT } from '@/lib/copilot-events'
import { ARTICLE_COUNT_NUMBER, YEARS_EXPERIENCE_NUMBER, numberToWords } from '@/lib/content'
import { FRONT_STATS } from '@/lib/front-page'
import { OPEN_SOURCE, SOCIAL } from '@/lib/profile'
import OpeningLine from './OpeningLine'

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

  it('invites a tour under the tiles: "Short on time? Let me show you around"', () => {
    render(<OpeningLine />)
    expect(screen.getByRole('button', { name: /short on time\? let me show you around/i })).toBeInTheDocument()
  })

  it('puts the tour line after the sentence and the tiles, and before the down button', () => {
    const { container } = render(<OpeningLine />)
    const tour = screen.getByRole('button', { name: /short on time/i })
    const grid = container.querySelector('.grid-cols-2')!
    const down = screen.getByRole('link', { name: "Scroll down to what's on this site" })
    expect(grid.compareDocumentPosition(tour) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tour.compareDocumentPosition(down) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('starts the tour when the line is clicked', () => {
    const heard = jest.fn()
    window.addEventListener(COPILOT_TOUR_EVENT, heard)
    try {
      render(<OpeningLine />)
      fireEvent.click(screen.getByRole('button', { name: /short on time/i }))
      expect(heard).toHaveBeenCalledTimes(1)
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
      const figures = Array.from(container.querySelectorAll('a .sr-only'), (el) => el.textContent)
      expect(figures).toEqual([`${FRONT_STATS.years}+`, String(FRONT_STATS.articles), String(FRONT_STATS.repos), String(OPEN_SOURCE.length)])
    })
  })
})
