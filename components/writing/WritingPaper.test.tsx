import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { openCopilot } from '@/lib/copilot-events'
import type { Correction } from '@/lib/profile'
import type { Desk, Story } from '@/lib/writing-paper'
import WritingPaper, { isLateEdition, paperDate, singaporeHour } from './WritingPaper'

jest.mock('@/lib/copilot-events', () => ({ openCopilot: jest.fn() }))

const DAY = new Date('2026-11-21T04:00:00Z') // 12:00 in Singapore
const LATE = new Date('2026-11-21T12:00:00Z') // 20:00 in Singapore

const img = (id: string) => `https://cdn.example.com/max/1400/${id}.png`

/** A story "headline <id>", filed under a desk, with a standfirst and an opening. */
function story(id: string, date: string, year: string, desk: string | undefined, cover?: Story['cover']): Story {
  return {
    slug: id,
    title: `Headline ${id}`,
    url: `https://medium.com/@tituslhy/${id}`,
    date,
    year,
    ...(desk && { desk }),
    dek: `Standfirst ${id}`,
    opening: `Opening paragraph for ${id}.`,
    ...(cover && { cover }),
  }
}

/**
 * Ten stories: eight in 2026 (lead "one"; rail two–four; row five–seven; in brief eight),
 * one in 2025 and one in 2024. Desks: blockchain 4 (two, five, seven, nine),
 * copilots 5 (one, three, six, eight, ten), rag-applications 1 (four).
 */
const FIXTURE: Story[] = [
  story('one', '2026-10-16', '2026', 'copilots', { src: img('one'), caption: 'A diagram of the loop' }),
  story('two', '2026-09-01', '2026', 'blockchain', { src: img('two') }),
  story('three', '2026-08-01', '2026', 'copilots', { src: img('three') }),
  story('four', '2026-07-01', '2026', 'rag-applications', { src: img('four') }),
  story('five', '2026-06-01', '2026', 'blockchain'),
  story('six', '2026-05-01', '2026', 'copilots', { src: img('six') }),
  story('seven', '2026-04-01', '2026', 'blockchain', { src: img('seven') }),
  story('eight', '2026-03-01', '2026', 'copilots', { src: img('eight') }),
  story('nine', '2025-12-01', '2025', 'blockchain'),
  story('ten', '2024-03-01', '2024', 'copilots', { src: img('ten') }),
]

const DESKS: Desk[] = [
  { id: 'blockchain', name: 'Blockchain', count: 4 },
  { id: 'copilots', name: 'Copilots', count: 5 },
  { id: 'rag-applications', name: 'RAG Applications', count: 1 },
]

const EDITIONS = [
  { year: '2026', count: 8 },
  { year: '2025', count: 1 },
  { year: '2024', count: 1 },
]

const CORRECTION: Correction = {
  text: 'The nav bar now returns on any upward scroll.',
  by: 'this site’s issue agent',
  ref: '#14',
  href: 'https://github.com/tituslhy/IntroducingTitus/pull/14',
}

type Props = React.ComponentProps<typeof WritingPaper>

function renderPaper(over: Partial<Props> = {}) {
  return render(
    <WritingPaper
      stories={FIXTURE}
      desks={DESKS}
      editions={EDITIONS}
      folio="§ 06"
      featuredBy={['Acme Labs', 'Beta Corp']}
      corrections={[]}
      mediumUrl="https://medium.com/@tituslhy"
      {...over}
    />,
  )
}

/** A paragraph whose whole text is `text` (its children may be bold, so getByText alone can't see it). */
const paragraph = (text: string) => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text)
/** A span whose whole text is `text`, e.g. the dateline's "2026 edition · 8 articles". */
const span = (text: string) => screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === text)
/** Every picture on the page, in the order they appear. */
const pictures = (container: HTMLElement) => Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src'))
/** The story headlines (h4 headings whose name starts "Headline"), in page order. */
const storyHeadings = () =>
  screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent).filter((t) => t?.startsWith('Headline'))

const OriginalIO = global.IntersectionObserver

beforeEach(() => {
  jest.useFakeTimers({ now: DAY })
  jest.mocked(openCopilot).mockClear()
})

afterEach(() => {
  jest.useRealTimers()
  global.IntersectionObserver = OriginalIO
})

describe('singaporeHour', () => {
  it('reads the hour in Singapore (UTC+8)', () => {
    expect(singaporeHour(new Date('2026-11-21T04:00:00Z'))).toBe(12)
  })

  it('reads midnight as 0, not 24', () => {
    expect(singaporeHour(new Date('2026-11-20T16:00:00Z'))).toBe(0)
  })

  it('reads 23:59 as 23', () => {
    expect(singaporeHour(new Date('2026-11-21T15:59:00Z'))).toBe(23)
  })

  it('gives the Singapore hour whatever the visitor’s own time zone is', () => {
    const before = process.env.TZ
    try {
      process.env.TZ = 'America/New_York'
      expect(singaporeHour(new Date('2026-11-21T04:00:00Z'))).toBe(12)
      process.env.TZ = 'Pacific/Kiritimati'
      expect(singaporeHour(new Date('2026-11-21T04:00:00Z'))).toBe(12)
    } finally {
      process.env.TZ = before
    }
  })
})

describe('isLateEdition', () => {
  it.each([
    [0, true],
    [4, true],
    [5, false],
    [12, false],
    [18, false],
    [19, true],
    [23, true],
  ])('hour %i is late: %s', (hour, late) => {
    expect(isLateEdition(hour)).toBe(late)
  })
})

describe('paperDate', () => {
  it('writes the date as a day, a month and a year', () => {
    expect(paperDate('2026-10-16')).toBe('16 October 2026')
  })

  it('adds the weekday when asked', () => {
    expect(paperDate('2026-10-16', true)).toBe('Friday, 16 October 2026')
  })

  it('does not shift the date, whatever the time zone', () => {
    const before = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      expect(paperDate('2026-10-16', true)).toBe('Friday, 16 October 2026')
      process.env.TZ = 'Pacific/Kiritimati'
      expect(paperDate('2026-10-16', true)).toBe('Friday, 16 October 2026')
    } finally {
      process.env.TZ = before
    }
  })

  it('handles the first day of a year', () => {
    expect(paperDate('2026-01-01')).toBe('1 January 2026')
  })
})

describe('WritingPaper', () => {
  describe('nameplate', () => {
    it('shows “The Titus Times” as the page heading, with Times in italics', () => {
      renderPaper()
      const heading = screen.getByRole('heading', { level: 2, name: 'The Titus Times' })
      expect(heading.querySelector('em')).toHaveTextContent('Times')
    })

    it('keeps the real article count for screen readers, and counts up on screen', () => {
      const { container } = renderPaper()
      expect(container.querySelector('.sr-only')).toHaveTextContent('10')
      expect(screen.getByText('0', { selector: 'span[aria-hidden="true"]' })).toBeInTheDocument()
    })

    it('reaches the full count once it scrolls into view', () => {
      let onScreen: IntersectionObserverCallback = () => {}
      global.IntersectionObserver = class {
        constructor(cb: IntersectionObserverCallback) {
          onScreen = cb
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof IntersectionObserver
      renderPaper()
      act(() => {
        onScreen([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      })
      act(() => {
        jest.advanceTimersByTime(1500)
      })
      expect(screen.getByText('10', { selector: 'span[aria-hidden="true"]' })).toBeInTheDocument()
    })

    it('says how long the paper has run, from the oldest edition', () => {
      renderPaper()
      expect(screen.getByText('technical articles since 2024')).toBeInTheDocument()
    })

    it('offers “Ask what to read first”, which asks Ask Titus which article to read first', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: 'Ask what to read first' }))
      expect(openCopilot).toHaveBeenCalledWith('chat', 'Which of your articles should I read first?')
    })
  })

  describe('dateline', () => {
    it('shows the newest story’s date, with the weekday', () => {
      renderPaper()
      expect(span('Friday, 16 October 2026')).toBeInTheDocument()
    })

    it('shows the edition and how many articles it holds', () => {
      renderPaper()
      expect(span('2026 edition · 8 articles')).toBeInTheDocument()
    })
  })

  describe('editions', () => {
    it('opens on the newest edition', () => {
      renderPaper()
      expect(screen.getByRole('button', { name: /^2026/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /^2025/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /^2024/ })).toHaveAttribute('aria-pressed', 'false')
    })

    it('switches the front page to the chosen year when its button is pressed', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^2025/ }))

      expect(screen.getByRole('button', { name: /^2025/ })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: /^2026/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('heading', { level: 3, name: 'Headline nine' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Headline one' })).not.toBeInTheDocument()
      expect(span('2025 edition · 1 article')).toBeInTheDocument()
    })

    it('goes back to an earlier edition’s lead when its button is pressed again', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^2025/ }))
      fireEvent.click(screen.getByRole('button', { name: /^2026/ }))
      expect(screen.getByRole('heading', { level: 3, name: 'Headline one' })).toBeInTheDocument()
    })

    it('says “1 article” (singular) for an edition of one story, and “N articles” otherwise', () => {
      renderPaper()
      expect(span('2026 edition · 8 articles')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /^2024/ }))
      expect(span('2024 edition · 1 article')).toBeInTheDocument()
    })

    it('shows an edition with one story as the lead alone, with no rail, row or brief', () => {
      const { container } = renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^2024/ }))
      expect(screen.getByRole('heading', { level: 3, name: 'Headline ten' })).toBeInTheDocument()
      expect(storyHeadings()).toEqual([])
      expect(screen.queryByText('In brief')).not.toBeInTheDocument()
      expect(pictures(container)).toEqual([img('ten')])
    })
  })

  describe('desks', () => {
    it('offers a button for each desk, with its count, and none is pressed at first', () => {
      renderPaper()
      expect(screen.getByRole('button', { name: /^Blockchain/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /^Copilots/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /^RAG Applications/ })).toHaveAttribute('aria-pressed', 'false')
      expect(within(screen.getByRole('button', { name: /^Copilots/ })).getByText('5')).toBeInTheDocument()
    })

    it('filters across all years to the chosen desk, and says so in the dateline', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^Blockchain/ }))

      expect(screen.getByRole('button', { name: /^Blockchain/ })).toHaveAttribute('aria-pressed', 'true')
      expect(span('Blockchain desk · 4 articles')).toBeInTheDocument()
      // The 2025 story is on the desk too.
      expect(screen.getByRole('heading', { level: 4, name: 'Headline nine' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Headline two' })).toBeInTheDocument()
      // A Copilots story is not on the Blockchain desk.
      expect(screen.queryByRole('heading', { name: 'Headline three' })).not.toBeInTheDocument()
    })

    it('leads the desk with its newest story, and labels the kicker with the desk', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^Blockchain/ }))
      expect(paragraph('Latest story · Blockchain')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 3, name: 'Headline two' })).toBeInTheDocument()
    })

    it('un-presses the year buttons while a desk is chosen', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^Blockchain/ }))
      expect(screen.getByRole('button', { name: /^2026/ })).toHaveAttribute('aria-pressed', 'false')
    })

    it('clears the desk when it is pressed again, back to the edition', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^Blockchain/ }))
      fireEvent.click(screen.getByRole('button', { name: /^Blockchain/ }))

      expect(screen.getByRole('button', { name: /^Blockchain/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /^2026/ })).toHaveAttribute('aria-pressed', 'true')
      expect(span('2026 edition · 8 articles')).toBeInTheDocument()
    })

    it('picks a desk across years, so an earlier edition’s story can lead', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^2025/ }))
      fireEvent.click(screen.getByRole('button', { name: /^Copilots/ }))
      expect(screen.getByRole('heading', { level: 3, name: 'Headline one' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 4, name: 'Headline ten' })).toBeInTheDocument()
    })

    it('leaves the desk when an edition is pressed', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: /^Copilots/ }))
      fireEvent.click(screen.getByRole('button', { name: /^2026/ }))
      expect(screen.getByRole('button', { name: /^Copilots/ })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /^2026/ })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('latest story', () => {
    it('has a kicker with “Latest story” and the desk name', () => {
      renderPaper()
      expect(paragraph('Latest story · Copilots')).toBeInTheDocument()
    })

    it('says “Writing” in the kicker when the story has no desk', () => {
      renderPaper({ stories: [story('loose', '2026-10-16', '2026', undefined)], editions: [{ year: '2026', count: 1 }] })
      expect(paragraph('Latest story · Writing')).toBeInTheDocument()
    })

    it('links the headline to the article, in a new tab, safely', () => {
      renderPaper()
      const link = within(screen.getByRole('heading', { level: 3, name: 'Headline one' })).getByRole('link', { name: 'Headline one' })
      expect(link).toHaveAttribute('href', 'https://medium.com/@tituslhy/one')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('shows the standfirst', () => {
      renderPaper()
      expect(screen.getByText('Standfirst one')).toBeInTheDocument()
    })

    it('carries a byline with the date', () => {
      renderPaper()
      expect(paragraph('By Titus Lim · 16 October 2026')).toBeInTheDocument()
    })

    it('opens with its opening paragraph', () => {
      renderPaper()
      expect(screen.getByText('Opening paragraph for one.')).toBeInTheDocument()
    })

    it('offers “Continue reading on Medium” to the article', () => {
      renderPaper()
      const link = screen.getByRole('link', { name: 'Continue reading on Medium ↗' })
      expect(link).toHaveAttribute('href', 'https://medium.com/@tituslhy/one')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('has an Ask pill that asks Ask Titus to summarise it', () => {
      renderPaper()
      fireEvent.click(screen.getByRole('button', { name: 'Ask about this article' }))
      expect(openCopilot).toHaveBeenCalledWith('chat', 'Summarise “Headline one” for me.')
    })
  })

  describe('pictures', () => {
    it('shows a picture for the lead, the first rail story, and each row story that has one', () => {
      const { container } = renderPaper()
      // one (lead), two (rail, first), six and seven (row). Five has no cover; three and four have no picture in the rail.
      expect(pictures(container)).toEqual([img('one'), img('two'), img('six'), img('seven')])
    })

    it('gives every picture empty alt text, since the headline beside it says the same', () => {
      const { container } = renderPaper()
      container.querySelectorAll('img').forEach((i) => expect(i).toHaveAttribute('alt', ''))
    })

    it('renders no picture for a story whose cover is missing', () => {
      renderPaper()
      const five = screen.getByRole('heading', { level: 4, name: 'Headline five' }).closest('article')
      expect(five?.querySelector('img')).toBeNull()
    })

    it('shows the caption only on the latest story, and only when its cover has one', () => {
      const { container } = renderPaper()
      expect(container.querySelectorAll('figcaption')).toHaveLength(1)
      expect(screen.getByText('A diagram of the loop')).toBeInTheDocument()
    })

    it('shows no caption when the latest story’s cover has none', () => {
      const { container } = renderPaper({
        stories: [story('one', '2026-10-16', '2026', 'copilots', { src: img('one') }), ...FIXTURE.slice(1)],
      })
      expect(container.querySelectorAll('figcaption')).toHaveLength(0)
    })

    it('never shows a caption on a rail or row picture', () => {
      const { container } = renderPaper({
        stories: [FIXTURE[0], story('two', '2026-09-01', '2026', 'blockchain', { src: img('two'), caption: 'Rail caption' }), ...FIXTURE.slice(2)],
      })
      expect(screen.queryByText('Rail caption')).not.toBeInTheDocument()
      expect(container.querySelectorAll('figcaption')).toHaveLength(1)
    })

    it('shows no picture for a briefly listed story, even one with a cover', () => {
      const { container } = renderPaper()
      const eight = screen.getByRole('link', { name: 'Headline eight' }).closest('li')
      expect(eight?.querySelector('img')).toBeNull()
      expect(pictures(container)).not.toContain(img('eight'))
    })
  })

  describe('rail, row and in brief', () => {
    it('runs the next three stories down the rail, in order', () => {
      renderPaper()
      expect(storyHeadings().slice(0, 3)).toEqual(['Headline two', 'Headline three', 'Headline four'])
    })

    it('runs the next three stories as a row beneath, in order', () => {
      renderPaper()
      expect(storyHeadings().slice(3, 6)).toEqual(['Headline five', 'Headline six', 'Headline seven'])
    })

    it('lists the rest in brief, with a date and desk and a link', () => {
      renderPaper()
      expect(screen.getByRole('heading', { level: 4, name: 'In brief' })).toBeInTheDocument()
      const eight = screen.getByRole('link', { name: 'Headline eight' })
      expect(eight).toHaveAttribute('href', 'https://medium.com/@tituslhy/eight')
      expect(span('1 March 2026 · Copilots')).toBeInTheDocument()
    })

    it('shows no “In brief” list when the edition has only seven stories, all placed above it', () => {
      renderPaper({ stories: FIXTURE.slice(0, 7), editions: [{ year: '2026', count: 7 }, ...EDITIONS.slice(1)] })
      expect(screen.queryByText('In brief')).not.toBeInTheDocument()
      expect(storyHeadings()).toEqual(['Headline two', 'Headline three', 'Headline four', 'Headline five', 'Headline six', 'Headline seven'])
    })

    it('shows no row and no brief for a short edition: the rail alone', () => {
      renderPaper({ stories: FIXTURE.slice(0, 4), editions: [{ year: '2026', count: 4 }, ...EDITIONS.slice(1)] })
      expect(storyHeadings()).toEqual(['Headline two', 'Headline three', 'Headline four'])
      expect(screen.queryByText('In brief')).not.toBeInTheDocument()
    })

    it('shows neither rail nor row for a lone story', () => {
      renderPaper({ stories: [FIXTURE[0]], editions: [{ year: '2026', count: 1 }] })
      expect(storyHeadings()).toEqual([])
      expect(screen.queryByText('In brief')).not.toBeInTheDocument()
    })
  })

  describe('late edition', () => {
    it('is the day edition at 12:00 in Singapore', () => {
      const { container } = renderPaper()
      expect(container.querySelector('section#writing')).not.toHaveClass('late-edition')
      expect(screen.queryByText('LATE EDITION')).not.toBeInTheDocument()
    })

    it.each([
      ['19:00 Singapore time, when the late edition starts', '2026-11-21T11:00:00Z'],
      ['20:00 Singapore time', '2026-11-21T12:00:00Z'],
      ['04:59 Singapore time, before the day edition', '2026-11-20T20:59:00Z'],
      ['00:00 Singapore time', '2026-11-20T16:00:00Z'],
    ])('is the late edition at %s', (_, when) => {
      jest.setSystemTime(new Date(when))
      const { container } = renderPaper()
      expect(container.querySelector('section#writing')).toHaveClass('late-edition')
      expect(screen.getByText('LATE EDITION')).toBeInTheDocument()
    })

    it.each([
      ['18:59 Singapore time, just before the late edition', '2026-11-21T10:59:00Z'],
      ['05:00 Singapore time, when the day edition starts', '2026-11-20T21:00:00Z'],
    ])('is still the day edition at %s', (_, when) => {
      jest.setSystemTime(new Date(when))
      const { container } = renderPaper()
      expect(container.querySelector('section#writing')).not.toHaveClass('late-edition')
    })

    it('renders the day edition on the server, whatever the hour, so hydration matches', () => {
      jest.setSystemTime(LATE)
      const html = renderToString(
        <WritingPaper
          stories={FIXTURE}
          desks={DESKS}
          editions={EDITIONS}
          folio="§ 06"
          featuredBy={[]}
          corrections={[]}
          mediumUrl="https://medium.com/@tituslhy"
        />,
      )
      expect(html).not.toContain('late-edition')
      expect(html).not.toContain('LATE EDITION')
    })
  })

  describe('corrections', () => {
    it('is absent when there are no corrections', () => {
      renderPaper({ corrections: [] })
      expect(screen.queryByRole('heading', { name: 'Corrections' })).not.toBeInTheDocument()
    })

    it('lists each correction with its text, who fixed it, and a link to the reference', () => {
      renderPaper({ corrections: [CORRECTION] })
      expect(screen.getByRole('heading', { name: 'Corrections' })).toBeInTheDocument()
      expect(screen.getByText('The nav bar now returns on any upward scroll.')).toBeInTheDocument()
      expect(paragraph('Fixed by this site’s issue agent · #14')).toBeInTheDocument()
      const link = screen.getByRole('link', { name: '#14' })
      expect(link).toHaveAttribute('href', CORRECTION.href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('lists every correction given', () => {
      const second: Correction = { text: 'A second fix.', by: 'Titus', ref: '#20', href: 'https://github.com/tituslhy/IntroducingTitus/pull/20' }
      renderPaper({ corrections: [CORRECTION, second] })
      expect(screen.getByText('A second fix.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '#20' })).toHaveAttribute('href', second.href)
      expect(screen.getByRole('link', { name: '#14' })).toHaveAttribute('href', CORRECTION.href)
    })
  })

  describe('featured by', () => {
    it('lists the names that featured the writing', () => {
      renderPaper()
      expect(screen.getByRole('heading', { name: 'Featured by' })).toBeInTheDocument()
      expect(screen.getByText('Acme Labs')).toBeInTheDocument()
      expect(screen.getByText('Beta Corp')).toBeInTheDocument()
    })
  })

  describe('archive link', () => {
    it('links “Every article on Medium” to the Medium profile', () => {
      renderPaper()
      expect(screen.getByRole('link', { name: /Every article on Medium/ })).toHaveAttribute('href', 'https://medium.com/@tituslhy')
    })
  })

  describe('an archive with no articles', () => {
    it('renders the nameplate and the archive link, with no lead story', () => {
      renderPaper({ stories: [], desks: [], editions: [] })
      expect(screen.getByRole('heading', { level: 2, name: 'The Titus Times' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Every article on Medium/ })).toBeInTheDocument()
    })

    it('says “technical articles” with no “since” when there are no editions', () => {
      renderPaper({ stories: [], desks: [], editions: [] })
      expect(screen.getByText('technical articles')).toBeInTheDocument()
      expect(screen.queryByText(/since/)).not.toBeInTheDocument()
    })
  })
})
