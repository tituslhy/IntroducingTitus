import { render, screen, within } from '@testing-library/react'
import { creditRef } from '@/lib/projects'
import { OPEN_SOURCE } from '@/lib/profile'
import CreditsRoll, { type Credit } from './CreditsRoll'

const credits: Credit[] = [
  {
    project: 'LlamaIndex',
    text: 'Integration with Microsoft LLMLingua2 prompt compression',
    href: 'https://github.com/run-llama/llama_index/pull/17531',
    ref: 'run-llama/llama_index · PR #17531',
  },
  { project: 'Chainlit', text: 'Chainlit-LlamaIndex cookbook', href: 'https://github.com/Chainlit/cookbook', ref: null },
]

const section = () => document.querySelector('section#open-source') as HTMLElement
/** The real, announced list of credits (the first dl). */
const realList = () => section().querySelector<HTMLElement>('dl.credits-copy:not([aria-hidden])') as HTMLElement
/** The printed-twice copy that makes the loop seamless (hidden and inert). */
const copyList = () => section().querySelector<HTMLElement>('dl.credits-copy[aria-hidden="true"]') as HTMLElement
const track = () => section().querySelector('.credits-track') as HTMLElement

describe('CreditsRoll: markup', () => {
  it('is the Open source section, named by its heading', () => {
    render(<CreditsRoll credits={credits} />)
    expect(screen.getByRole('region', { name: 'Open source' })).toBe(section())
    expect(screen.getByRole('heading', { level: 3, name: 'Open source' })).toBeInTheDocument()
  })

  it('keeps the heading, the intro line and the window inside the stage', () => {
    render(<CreditsRoll credits={credits} />)
    const stage = section().querySelector('.credits-stage') as HTMLElement
    expect(stage).toBeInTheDocument()
    expect(within(stage).getByRole('heading', { level: 3, name: 'Open source' })).toBeInTheDocument()
    expect(within(stage).getByText('Merged into the frameworks I use.')).toBeInTheDocument()
    expect(stage.querySelector('.credits-window .credits-track')).toBeInTheDocument()
  })

  it('prints the credits twice in the track: the real list first, then the copy', () => {
    render(<CreditsRoll credits={credits} />)
    const lists = track().querySelectorAll(':scope > dl')
    expect(lists).toHaveLength(2)
    expect(lists[0]).toBe(realList())
    expect(lists[1]).toBe(copyList())
  })

  it('lists each project as a term, with its contribution as the definition beside it', () => {
    render(<CreditsRoll credits={credits} />)
    const terms = within(realList()).getAllByRole('term')
    const definitions = within(realList()).getAllByRole('definition')
    expect(terms.map((t) => t.textContent)).toEqual(['LlamaIndex', 'Chainlit'])
    expect(definitions).toHaveLength(2)
  })

  it('wraps each project and its contribution in a contents div', () => {
    render(<CreditsRoll credits={credits} />)
    const groups = Array.from(realList().children)
    expect(groups).toHaveLength(2)
    groups.forEach((g) => {
      expect(g.tagName).toBe('DIV')
      expect(g).toHaveClass('contents')
      expect(g.children[0].tagName).toBe('DT')
      expect(g.children[1].tagName).toBe('DD')
    })
  })

  it('links each contribution to its href, in a new tab, safely', () => {
    render(<CreditsRoll credits={credits} />)
    const links = within(realList()).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(credits.map((c) => c.href))
    links.forEach((l) => {
      expect(l).toHaveAttribute('target', '_blank')
      expect(l).toHaveAttribute('rel', 'noopener noreferrer')
    })
    expect(links[0]).toHaveTextContent('Integration with Microsoft LLMLingua2 prompt compression')
  })

  it('gives each link an accessible name of its text, without the decorative arrow', () => {
    render(<CreditsRoll credits={credits} />)
    expect(screen.getByRole('link', { name: 'Integration with Microsoft LLMLingua2 prompt compression' })).toHaveAttribute(
      'href',
      credits[0].href,
    )
    expect(screen.getByRole('link', { name: 'Chainlit-LlamaIndex cookbook' })).toHaveAttribute('href', credits[1].href)
  })

  it('shows the ref line under a contribution that has one', () => {
    render(<CreditsRoll credits={credits} />)
    const first = within(realList()).getAllByRole('definition')[0]
    expect(within(first).getByText('run-llama/llama_index · PR #17531')).toBeInTheDocument()
  })

  it('shows no ref line under a contribution without one', () => {
    render(<CreditsRoll credits={credits} />)
    const second = within(realList()).getAllByRole('definition')[1]
    expect(second.querySelector('.font-mono')).toBeNull()
    expect(second.textContent).toBe('Chainlit-LlamaIndex cookbook ↗')
  })

  it('shows the ref for every real open-source credit', () => {
    render(<CreditsRoll credits={OPEN_SOURCE.map((o) => ({ ...o, ref: creditRef(o.href) }))} />)
    for (const o of OPEN_SOURCE) {
      expect(within(realList()).getByText(creditRef(o.href)!)).toBeInTheDocument()
    }
  })

  it('says how many contributions there are, with the link note, under the window', () => {
    render(<CreditsRoll credits={credits} />)
    const note = screen.getByText('2 contributions · each links to its pull request or commit')
    expect(note).toBeInTheDocument()
    expect((section().querySelector('.credits-stage') as HTMLElement).contains(note)).toBe(true)
    expect(section().querySelector('.credits-window')!.contains(note)).toBe(false)
  })

  it('renders the footer after the stage, inside the section', () => {
    render(<CreditsRoll credits={credits} footer={<button type="button">Ask about my open source work</button>} />)
    const footer = screen.getByRole('button', { name: 'Ask about my open source work' })
    expect(section().contains(footer)).toBe(true)
    expect(section().querySelector('.credits-stage')!.nextElementSibling).toBe(footer)
  })

  it('renders no footer when none is given', () => {
    render(<CreditsRoll credits={credits} />)
    expect(section().lastElementChild).toBe(section().querySelector('.credits-stage'))
  })
})

describe('CreditsRoll: the hidden copy', () => {
  it('is aria-hidden and inert', () => {
    render(<CreditsRoll credits={credits} />)
    expect(copyList()).toHaveAttribute('aria-hidden', 'true')
    expect(copyList()).toHaveAttribute('inert')
  })

  it('is neither aria-hidden nor inert on the real list', () => {
    render(<CreditsRoll credits={credits} />)
    expect(realList()).not.toHaveAttribute('aria-hidden')
    expect(realList()).not.toHaveAttribute('inert')
  })

  it('takes its links out of the tab order', () => {
    render(<CreditsRoll credits={credits} />)
    const copyLinks = Array.from(copyList().querySelectorAll('a'))
    expect(copyLinks).toHaveLength(credits.length)
    copyLinks.forEach((l) => expect(l.tabIndex).toBe(-1))
  })

  it('keeps the real links in the tab order', () => {
    render(<CreditsRoll credits={credits} />)
    const realLinks = Array.from(realList().querySelectorAll('a'))
    expect(realLinks).toHaveLength(credits.length)
    realLinks.forEach((l) => expect(l.tabIndex).toBe(0))
  })

  it('repeats the real list exactly, text and links, so the loop looks the same', () => {
    render(<CreditsRoll credits={credits} />)
    expect(copyList().textContent).toBe(realList().textContent)
    expect(Array.from(copyList().querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(
      Array.from(realList().querySelectorAll('a')).map((a) => a.getAttribute('href')),
    )
  })
})

describe('CreditsRoll: accessible queries see each credit once', () => {
  it('finds one link per contribution across the whole page', () => {
    render(<CreditsRoll credits={credits} />)
    expect(screen.getAllByRole('link')).toHaveLength(credits.length)
  })

  it('finds one term and one definition per contribution across the whole page', () => {
    render(<CreditsRoll credits={credits} />)
    expect(screen.getAllByRole('term')).toHaveLength(credits.length)
    expect(screen.getAllByRole('definition')).toHaveLength(credits.length)
  })

  it('finds a single link by its name', () => {
    render(<CreditsRoll credits={credits} />)
    expect(screen.getByRole('link', { name: 'Chainlit-LlamaIndex cookbook' })).toBeInTheDocument()
  })

  it('finds a ref line only once, in the real list, when the copy is left out', () => {
    render(<CreditsRoll credits={credits} />)
    // getByText does not skip aria-hidden nodes, so both printings match; the ref lives in the real list.
    expect(screen.getAllByText('run-llama/llama_index · PR #17531')).toHaveLength(2)
    expect(within(realList()).getByText('run-llama/llama_index · PR #17531')).toBeInTheDocument()
  })

  it('counts both printings of each link only when hidden nodes are asked for', () => {
    render(<CreditsRoll credits={credits} />)
    expect(screen.getAllByRole('link', { hidden: true })).toHaveLength(credits.length * 2)
  })
})

describe('CreditsRoll: roll duration', () => {
  it('sets the roll to five seconds per credit', () => {
    render(<CreditsRoll credits={credits} />)
    expect(track().style.getPropertyValue('--roll')).toBe('10s')
  })

  it('scales the roll with the number of credits', () => {
    render(<CreditsRoll credits={OPEN_SOURCE.map((o) => ({ ...o, ref: null }))} />)
    expect(track().style.getPropertyValue('--roll')).toBe(`${OPEN_SOURCE.length * 5}s`)
  })

  it('gives a single credit a five-second roll', () => {
    render(<CreditsRoll credits={[credits[0]]} />)
    expect(track().style.getPropertyValue('--roll')).toBe('5s')
  })

  it('renders with an empty list and no links, when there are no credits', () => {
    render(<CreditsRoll credits={[]} />)
    expect(track().style.getPropertyValue('--roll')).toBe('0s')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText('0 contributions · each links to its pull request or commit')).toBeInTheDocument()
  })
})
