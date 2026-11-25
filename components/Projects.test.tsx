import { fireEvent, render, screen, within } from '@testing-library/react'
import { openCopilot } from '@/lib/copilot-events'
import { figureKey, projectResults } from '@/lib/projects'
import { EARLIER_PROJECTS, OPEN_SOURCE, PROJECTS, pageFolio, type Project } from '@/lib/profile'
import Projects from './Projects'

jest.mock('@/lib/copilot-events', () => ({ openCopilot: jest.fn() }))

const bassoon = PROJECTS.find((p) => p.slug === 'fictional-bassoon')!
const illumina = PROJECTS.find((p) => p.slug === 'illumina-rag')!
const marginCall = PROJECTS.find((p) => p.slug === 'margin-call')!

const articleFor = (container: HTMLElement, p: Project) => container.querySelector(`article#project-${p.slug}`) as HTMLElement
/** The pills under a project's "Stack" label: the list right after that heading. */
const stackList = (article: HTMLElement) => {
  const heading = within(article).getByRole('heading', { level: 4, name: 'Stack' })
  return heading.nextElementSibling as HTMLElement
}

const pad = (n: number) => String(n).padStart(2, '0')

beforeEach(() => {
  jest.mocked(openCopilot).mockClear()
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true, writable: true })
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true })
})

describe('Projects header', () => {
  it('sets the page header, with “built” in italics', () => {
    render(<Projects />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent(/^Things I have built, at work and for myself\.$/)
    expect(heading.querySelector('em')).toHaveTextContent('built')
  })

  it('shows the Projects folio from the site pages', () => {
    render(<Projects />)
    expect(screen.getByText(pageFolio('/projects'))).toBeInTheDocument()
  })

  it('has a back-to-top link in the marker row', () => {
    render(<Projects />)
    expect(screen.getByRole('link', { name: /back to top/i })).toHaveAttribute('href', '#top')
  })
})

describe('results row', () => {
  it('shows the four real results, labelled by figure and project', () => {
    render(<Projects />)
    for (const r of projectResults()) {
      expect(screen.getByText(r.label)).toBeInTheDocument()
    }
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent?.includes('containers, fictional-bassoon') || projectResults().some((r) => b.textContent?.includes(r.label)))
    expect(buttons).toHaveLength(4)
  })

  it('rings the project’s highlight tile when its result is clicked', () => {
    const { container } = render(<Projects />)
    fireEvent.click(screen.getByRole('button', { name: /containers, fictional-bassoon/ }))
    expect(container.querySelector('[data-tech="fictional-bassoon figure"]')).toHaveClass('result-flash')
  })

  it('rings the corner note when a secondary result is clicked', () => {
    const { container } = render(<Projects />)
    fireEvent.click(screen.getByRole('button', { name: /test coverage, fictional-bassoon/ }))
    expect(container.querySelector('[data-tech="fictional-bassoon secondary"]')).toHaveClass('result-flash')
  })
})

describe('On this page', () => {
  it('lists the featured projects numbered, then the earlier work and open source, each with its count', () => {
    render(<Projects />)
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      ...PROJECTS.map((p) => `#project-${p.slug}`),
      '#earlier-work',
      '#open-source',
    ])
    PROJECTS.forEach((p, i) => expect(links[i]).toHaveTextContent(`${i + 1}${p.title}`))
    expect(links[PROJECTS.length]).toHaveTextContent(`Earlier work${EARLIER_PROJECTS.length}`)
    expect(links[PROJECTS.length + 1]).toHaveTextContent(`Open source${OPEN_SOURCE.length}`)
  })
})

describe('featured projects', () => {
  it.each(PROJECTS.map((p) => [p.slug] as const))('gives %s an anchored article', (slug) => {
    const { container } = render(<Projects />)
    expect(container.querySelector(`article#project-${slug}`)).toBeInTheDocument()
  })

  it('shows each project’s context, title and sub-line', () => {
    const { container } = render(<Projects />)
    for (const p of PROJECTS) {
      const article = articleFor(container, p)
      expect(within(article).getByText(p.context)).toBeInTheDocument()
      expect(within(article).getByRole('heading', { level: 3, name: p.title })).toBeInTheDocument()
      expect(within(article).getByText(p.sub)).toBeInTheDocument()
    }
  })

  it('colours the Illumina context indigo, and the others amber', () => {
    const { container } = render(<Projects />)
    expect(within(articleFor(container, illumina)).getByText(illumina.context)).toHaveClass('text-indigo')
    expect(within(articleFor(container, bassoon)).getByText(bassoon.context)).toHaveClass('text-amber')
    expect(within(articleFor(container, marginCall)).getByText(marginCall.context)).toHaveClass('text-amber')
  })

  it('links GitHub, and the demo video where there is one', () => {
    const { container } = render(<Projects />)
    const bassoonLinks = within(articleFor(container, bassoon)).getByRole('link', { name: 'GitHub ↗' })
    expect(bassoonLinks).toHaveAttribute('href', bassoon.github)
    expect(bassoonLinks).toHaveAttribute('target', '_blank')
    expect(bassoonLinks).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(articleFor(container, bassoon)).queryByRole('link', { name: 'Demo video ↗' })).toBeNull()

    const demo = within(articleFor(container, marginCall)).getByRole('link', { name: 'Demo video ↗' })
    expect(demo).toHaveAttribute('href', marginCall.demo)
    expect(within(articleFor(container, marginCall)).getByRole('link', { name: 'GitHub ↗' })).toHaveAttribute('href', marginCall.github)
  })

  it('says a private project is built at work, with no links', () => {
    const { container } = render(<Projects />)
    const article = articleFor(container, illumina)
    expect(within(article).getByText('Private, built at work')).toBeInTheDocument()
    expect(within(article).queryByRole('link', { name: /GitHub|Demo/ })).toBeNull()
  })

  it('puts the title card first on each projector, then the project’s own frames, in order', () => {
    const { container } = render(<Projects />)
    for (const p of PROJECTS) {
      const article = articleFor(container, p)
      expect(article.querySelectorAll('[data-reveal]')).toHaveLength(p.frames.length + 1)
      expect(within(article).getByRole('button', { name: `Frame 1: ${p.figure.value} ${p.caption}` })).toBeInTheDocument()
      p.frames.forEach((f, i) => {
        expect(within(article).getByRole('button', { name: `Frame ${i + 2}: ${f.caption}` })).toBeInTheDocument()
      })
    }
  })

  it('keys the title card’s figure to its tile, so a result can ring it', () => {
    const { container } = render(<Projects />)
    for (const p of PROJECTS) {
      expect(articleFor(container, p).querySelector(`[data-reveal="0"] [data-tech="${figureKey(p)}"]`)).toBeInTheDocument()
    }
  })

  it('opens the bassoon projector on its bear, the one illustration (the first frame after the title card), as a silent loop', () => {
    const { container } = render(<Projects />)
    const video = articleFor(container, bassoon).querySelector('[data-reveal="1"] video') as HTMLVideoElement
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('src', '/projects/bassoon-bear.mp4')
    expect(video).toHaveAttribute('poster', '/projects/bassoon-bear-poster.webp')
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
  })

  it('gives fictional-bassoon’s projector three thumbs: the title card, the bear, then the Architecture', () => {
    const { container } = render(<Projects />)
    const thumbs = articleFor(container, bassoon).querySelectorAll('.projector-strip button')
    expect(thumbs).toHaveLength(3)
    expect(thumbs).toHaveLength(bassoon.frames.length + 1)
    expect(bassoon.frames.map((f) => f.kind)).toEqual(['video', 'diagram'])
    expect(bassoon.frames[0]).toMatchObject({
      kind: 'video',
      src: '/projects/bassoon-bear.mp4',
      poster: '/projects/bassoon-bear-poster.webp',
    })
    expect(bassoon.frames[1]).toMatchObject({ kind: 'diagram', diagram: 'bassoon-architecture' })
  })

  it('uses the bear’s poster as its strip thumb, so the film strip shows a still', () => {
    const { container } = render(<Projects />)
    const thumb = within(articleFor(container, bassoon)).getByRole('button', {
      name: 'Frame 2: The name: a woodwind instrument I once thought was a bear · video made with Qwen',
    })
    expect(thumb.querySelector('img')).toHaveAttribute('src', '/projects/bassoon-bear-poster.webp')
  })

  it('shows the Architecture as the words “Architecture” on its thumb, the second frame after the bear', () => {
    const { container } = render(<Projects />)
    const thumb = within(articleFor(container, bassoon)).getByRole('button', {
      name: 'Frame 3: The architecture: one chat message, start to finish',
    })
    expect(thumb).toHaveTextContent(/^Architecture$/)
    expect(thumb.querySelector('img')).toBeNull()
  })

  it('fits the bassoon screen to its diagram (projector-fit), but not tall', () => {
    const { container } = render(<Projects />)
    const screen = articleFor(container, bassoon).querySelector('.projector > .relative.aspect-video') as HTMLElement
    expect(screen).toHaveClass('projector-fit')
    expect(screen).not.toHaveClass('projector-tall')
  })

  it('gives Illumina’s screen projector-tall but not projector-fit, since its diagrams run full width', () => {
    const { container } = render(<Projects />)
    const screen = articleFor(container, illumina).querySelector('.projector > .relative.aspect-video') as HTMLElement
    expect(screen).toHaveClass('projector-tall')
    expect(screen).not.toHaveClass('projector-fit')
  })

  it('gives TheMarginCall’s screen neither projector-tall nor projector-fit', () => {
    const { container } = render(<Projects />)
    const screen = articleFor(container, marginCall).querySelector('.projector > .relative.aspect-video') as HTMLElement
    expect(screen).not.toHaveClass('projector-tall')
    expect(screen).not.toHaveClass('projector-fit')
  })

  it('plays Illumina’s two diagrams on its projector, full width under its write-up', () => {
    const { container } = render(<Projects />)
    const article = articleFor(container, illumina)
    expect(article.querySelectorAll('.dg')).toHaveLength(2)
    expect(within(article).getByRole('button', { name: /Frame 2: Getting ready/ })).toBeInTheDocument()
    expect(within(article).getByRole('button', { name: /Frame 3: An answer can be three lines/ })).toBeInTheDocument()
  })

  it('shows the demo video as a play poster on TheMarginCall’s projector', () => {
    const { container } = render(<Projects />)
    expect(within(articleFor(container, marginCall)).getByRole('button', { name: 'Play TheMarginCall demo', hidden: true })).toBeInTheDocument()
  })

  it('shows the highlight: the figure (counted from zero) with its caption, and the figure’s key', () => {
    const { container } = render(<Projects />)
    const tile = articleFor(container, bassoon).querySelector('[data-tech]') as HTMLElement
    expect(tile).toHaveAttribute('data-tech', 'fictional-bassoon figure')
    expect(within(tile).getByText(bassoon.caption)).toBeInTheDocument()
    expect(tile.querySelector('.sr-only')).toHaveTextContent(bassoon.figure.value)
  })

  it('gives the corner note only when the secondary has a number, with its own key', () => {
    const { container } = render(<Projects />)
    const note = within(articleFor(container, bassoon)).getByText(`${bassoon.secondary.value} ${bassoon.secondary.label}`)
    expect(note).toHaveAttribute('data-tech', 'fictional-bassoon secondary')
    expect(screen.queryByText(new RegExp(`${marginCall.secondary.value} ${marginCall.secondary.label}`))).toBeNull()
  })

  it('makes only Illumina’s tile indigo', () => {
    const { container } = render(<Projects />)
    expect(articleFor(container, illumina).querySelector('.glow-tile')).toHaveClass('glow-tile-indigo')
    expect(articleFor(container, bassoon).querySelector('.glow-tile')).not.toHaveClass('glow-tile-indigo')
    expect(articleFor(container, marginCall).querySelector('.glow-tile')).not.toHaveClass('glow-tile-indigo')
  })

  it('shows “What it is” as the lead, then the body', () => {
    const { container } = render(<Projects />)
    for (const p of PROJECTS) {
      const article = articleFor(container, p)
      expect(within(article).getByText('What it is')).toBeInTheDocument()
      expect(within(article).getByText(p.lead)).toBeInTheDocument()
      expect(within(article).getByText(p.body)).toBeInTheDocument()
    }
  })

  it('shows “Why it looks like this” with Constraint, Decision and Outcome, when there is a margin note', () => {
    const { container } = render(<Projects />)
    const article = articleFor(container, illumina)
    expect(within(article).getByText('Why it looks like this')).toBeInTheDocument()
    for (const [label, text] of [
      ['Constraint', illumina.marginNote!.constraint],
      ['Decision', illumina.marginNote!.decision],
      ['Outcome', illumina.marginNote!.outcome],
    ] as const) {
      expect(within(article).getByText(label)).toBeInTheDocument()
      expect(within(article).getByText(text)).toBeInTheDocument()
    }
  })

  it('leaves out “Why it looks like this” for a project with no margin note (TheMarginCall)', () => {
    const { container } = render(<Projects />)
    expect(marginCall.marginNote).toBeUndefined()
    expect(within(articleFor(container, marginCall)).queryByText('Why it looks like this')).toBeNull()
  })

  it('lists the stack as pills', () => {
    const { container } = render(<Projects />)
    // The diagram also names some of these tools (Postgres), so look only in the Stack list.
    const stack = stackList(articleFor(container, bassoon))
    for (const tag of bassoon.tags) {
      expect(within(stack).getByText(tag)).toBeInTheDocument()
    }
  })

  it('closes each project with an Ask pill that asks its question', () => {
    const { container } = render(<Projects />)
    for (const p of PROJECTS) {
      fireEvent.click(within(articleFor(container, p)).getByRole('button', { name: `Ask about ${p.ask.label}` }))
    }
    expect(openCopilot).toHaveBeenCalledTimes(PROJECTS.length)
    expect(openCopilot).toHaveBeenCalledWith('chat', bassoon.ask.question)
    expect(openCopilot).toHaveBeenCalledWith('chat', illumina.ask.question)
  })
})

describe('earlier work', () => {
  const section = () => document.querySelector('section#earlier-work') as HTMLElement
  const writeUp = () => section().querySelector('.earlier-info') as HTMLElement
  const pick = (i: number) => fireEvent.click(screen.getByRole('button', { name: `Frame ${i + 1}: ${EARLIER_PROJECTS[i].title}` }))

  it('is a section with one projector, one frame per earlier project', () => {
    render(<Projects />)
    expect(section()).toBeInTheDocument()
    expect(within(section()).getByRole('group', { name: 'Earlier work' })).toBeInTheDocument()
    expect(section().querySelectorAll('[data-reveal]')).toHaveLength(EARLIER_PROJECTS.length)
    expect(section().querySelectorAll('.projector-strip button')).toHaveLength(EARLIER_PROJECTS.length)
  })

  it('shows each picture as a labelled frame, with an empty-alt film-strip thumb from the repo', () => {
    render(<Projects />)
    const frameImgs = Array.from(section().querySelectorAll<HTMLImageElement>('[data-reveal] img'))
    expect(frameImgs.map((i) => i.getAttribute('src'))).toEqual(EARLIER_PROJECTS.map((e) => e.image))
    expect(frameImgs.map((i) => i.getAttribute('alt'))).toEqual(EARLIER_PROJECTS.map((e) => e.title))

    const thumbImgs = Array.from(section().querySelectorAll<HTMLImageElement>('.projector-strip img'))
    expect(thumbImgs.map((i) => i.getAttribute('src'))).toEqual(EARLIER_PROJECTS.map((e) => e.image))
    thumbImgs.forEach((i) => expect(i).toHaveAttribute('alt', ''))
  })

  it('shows contained pictures whole on white, and the rest on black', () => {
    render(<Projects />)
    for (const e of EARLIER_PROJECTS) {
      const img = section().querySelector(`[data-reveal] img[src="${e.image}"]`) as HTMLImageElement
      expect(img).toHaveClass('object-contain')
      if (e.fit === 'contain') {
        expect(img).toHaveClass('bg-white')
      } else {
        expect(img).toHaveClass('bg-black')
        expect(img).not.toHaveClass('bg-white')
      }
    }
  })

  it('writes up the frame on screen, starting with the first project', () => {
    render(<Projects />)
    const first = EARLIER_PROJECTS[0]
    expect(writeUp()).toHaveTextContent(`Frame 01 of ${pad(EARLIER_PROJECTS.length)} · ${first.topics.join(' · ')}`)
    expect(screen.getByRole('heading', { level: 4, name: first.title })).toBeInTheDocument()
    expect(within(writeUp()).getByText(first.blurb)).toBeInTheDocument()
  })

  it('follows the frame picked on the strip, with its number, topics, title and blurb', () => {
    render(<Projects />)
    EARLIER_PROJECTS.forEach((e, i) => {
      pick(i)
      expect(writeUp()).toHaveTextContent(`Frame ${pad(i + 1)} of ${pad(EARLIER_PROJECTS.length)} · ${e.topics.join(' · ')}`)
      expect(screen.getByRole('heading', { level: 4, name: e.title })).toBeInTheDocument()
      expect(within(writeUp()).getByText(e.blurb)).toBeInTheDocument()
    })
  })

  it('shows the one reported result only while its frame is on screen, with its label', () => {
    render(<Projects />)
    const reported = EARLIER_PROJECTS.findIndex((e) => e.result)
    expect(within(writeUp()).queryByText('84.8%')).toBeNull()

    pick(reported)
    expect(within(writeUp()).getByText('84.8%')).toBeInTheDocument()
    expect(within(writeUp()).getByText('test accuracy')).toBeInTheDocument()

    pick(0)
    expect(within(writeUp()).queryByText('84.8%')).toBeNull()
  })

  it('links GitHub for the frame on screen only, named by its project', () => {
    render(<Projects />)
    EARLIER_PROJECTS.forEach((e, i) => {
      pick(i)
      const links = screen.queryAllByRole('link', { name: /on GitHub$/ })
      if (!e.github) {
        expect(links).toHaveLength(0)
        return
      }
      expect(links).toHaveLength(1)
      expect(links[0]).toHaveAttribute('aria-label', `${e.title} on GitHub`)
      expect(links[0]).toHaveAttribute('href', e.github)
      expect(links[0]).toHaveAttribute('target', '_blank')
      expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
      expect(links[0]).toHaveTextContent('GitHub ↗')
    })
  })

  it('closes with an Ask pill about earlier projects', () => {
    render(<Projects />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask about my earlier projects' }))
    expect(openCopilot).toHaveBeenCalledWith('chat', 'Tell me about your projects from before GenAI.')
  })
})

describe('open source', () => {
  it('is a section with one link per contribution', () => {
    const { container } = render(<Projects />)
    const section = container.querySelector('section#open-source') as HTMLElement
    const links = within(section).getAllByRole('link')
    expect(links).toHaveLength(OPEN_SOURCE.length)
    OPEN_SOURCE.forEach((o, i) => {
      expect(links[i]).toHaveAttribute('href', o.href)
      expect(links[i]).toHaveTextContent(o.text)
    })
  })

  it('credits each project as a term, with its contribution as the definition beside it', () => {
    const { container } = render(<Projects />)
    const section = container.querySelector('section#open-source') as HTMLElement
    const terms = within(section).getAllByRole('term')
    const definitions = within(section).getAllByRole('definition')
    expect(terms.map((t) => t.textContent)).toEqual(OPEN_SOURCE.map((o) => o.project))
    OPEN_SOURCE.forEach((o, i) => {
      expect(within(definitions[i]).getByRole('link')).toHaveAttribute('href', o.href)
    })
  })

  it('opens each contribution in a new tab, safely', () => {
    const { container } = render(<Projects />)
    const links = container.querySelectorAll('section#open-source a')
    links.forEach((l) => {
      expect(l).toHaveAttribute('target', '_blank')
      expect(l).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })

  it('shows each contribution’s receipt: its repository with the pull request or commit', () => {
    const { container } = render(<Projects />)
    // The copy that makes the loop is printed a second time, aria-hidden; the receipts are checked on the real list.
    const realList = container.querySelector('section#open-source dl.credits-copy:not([aria-hidden])') as HTMLElement
    expect(within(realList).getByText('run-llama/llama_index · PR #17531')).toBeInTheDocument()
    expect(within(realList).getByText('run-llama/llama_index · commit d5c0fe1')).toBeInTheDocument()
    expect(within(realList).getByText('Chainlit/cookbook · PR #138')).toBeInTheDocument()
  })

  it('closes with an Ask pill about open source work', () => {
    render(<Projects />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask about my open source work' }))
    expect(openCopilot).toHaveBeenCalledWith('chat', 'What have you contributed to open source?')
  })
})

describe('retired navigation', () => {
  it('does not render the old floating next pill under the projects section', () => {
    const { container } = render(<Projects />)
    expect(container.querySelector('section#projects > button')).toBeNull()
  })
})
