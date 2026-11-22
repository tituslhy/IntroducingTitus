import { fireEvent, render, screen, within } from '@testing-library/react'
import { EARLIER_PROJECTS, type EarlierProject } from '@/lib/profile'
import EarlierReel from './EarlierReel'

const pad = (n: number) => String(n).padStart(2, '0')
const N = EARLIER_PROJECTS.length

const section = () => document.querySelector('section#earlier-work') as HTMLElement
const writeUp = () => section().querySelector('.earlier-info') as HTMLElement
const pick = (i: number) => fireEvent.click(screen.getByRole('button', { name: `Frame ${i + 1}: ${EARLIER_PROJECTS[i].title}` }))

const solo: EarlierProject = {
  title: 'Solo project',
  topics: ['Robotics', 'Control'],
  blurb: 'The only one.',
  github: 'https://github.com/example/solo',
  image: 'https://example.com/solo.png',
}

describe('EarlierReel', () => {
  it('is the Earlier work section, labelled under a “Before GenAI” label', () => {
    render(<EarlierReel projects={EARLIER_PROJECTS} />)
    expect(screen.getByRole('region', { name: 'Earlier work' })).toBe(section())
    expect(screen.getByText('Before GenAI')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Earlier work' })).toBeInTheDocument()
  })

  it('puts every project on one projector, one frame each', () => {
    render(<EarlierReel projects={EARLIER_PROJECTS} />)
    expect(within(section()).getByRole('group', { name: 'Earlier work' })).toBeInTheDocument()
    expect(section().querySelectorAll('[data-reveal]')).toHaveLength(N)
    expect(within(section()).getAllByRole('button', { name: /^Frame \d+: / })).toHaveLength(N)
  })

  it('writes up the first project beside the projector, numbered out of the total, with its topics', () => {
    render(<EarlierReel projects={EARLIER_PROJECTS} />)
    expect(writeUp()).toHaveTextContent(`Frame 01 of ${pad(N)} · ${EARLIER_PROJECTS[0].topics.join(' · ')}`)
    expect(screen.getByRole('heading', { level: 4, name: EARLIER_PROJECTS[0].title })).toBeInTheDocument()
    expect(within(writeUp()).getByText(EARLIER_PROJECTS[0].blurb)).toBeInTheDocument()
  })

  it('follows the frame on screen, so each project’s write-up appears as its frame is picked', () => {
    render(<EarlierReel projects={EARLIER_PROJECTS} />)
    EARLIER_PROJECTS.forEach((e, i) => {
      pick(i)
      expect(writeUp()).toHaveTextContent(`Frame ${pad(i + 1)} of ${pad(N)}`)
      expect(screen.getByRole('heading', { level: 4, name: e.title })).toBeInTheDocument()
      expect(within(writeUp()).getByText(e.blurb)).toBeInTheDocument()
    })
  })

  it('shows a reported result large, with its label, only while its frame is on screen', () => {
    render(<EarlierReel projects={EARLIER_PROJECTS} />)
    const reported = EARLIER_PROJECTS.findIndex((e) => e.result)
    expect(within(writeUp()).queryByText('84.8%')).toBeNull()

    pick(reported)
    expect(within(writeUp()).getByText('84.8%')).toBeInTheDocument()
    expect(within(writeUp()).getByText('test accuracy')).toBeInTheDocument()

    pick(0)
    expect(within(writeUp()).queryByText('84.8%')).toBeNull()
  })

  it('links GitHub for the project on screen only, named by its project', () => {
    render(<EarlierReel projects={EARLIER_PROJECTS} />)
    EARLIER_PROJECTS.forEach((e, i) => {
      pick(i)
      const links = screen.getAllByRole('link', { name: /on GitHub$/ })
      expect(links).toHaveLength(1)
      expect(links[0]).toHaveAttribute('href', e.github)
      expect(links[0]).toHaveAttribute('aria-label', `${e.title} on GitHub`)
    })
  })

  it('shows a single project as Frame 01 of 01, with no Pause button to press', () => {
    render(<EarlierReel projects={[solo]} />)
    expect(writeUp()).toHaveTextContent('Frame 01 of 01 · Robotics · Control')
    expect(screen.getByRole('heading', { level: 4, name: 'Solo project' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pause|Play/ })).toBeNull()
  })

  it('renders the footer under the projector when one is given', () => {
    render(<EarlierReel projects={EARLIER_PROJECTS} footer={<p>Ask about these</p>} />)
    const footer = screen.getByText('Ask about these')
    expect(section().contains(footer)).toBe(true)
  })
})
