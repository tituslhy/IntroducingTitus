import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { COPILOT_OPEN_EVENT, type CopilotOpenDetail } from '@/lib/copilot-events'
import { allHonors, educationResults, splitHonor, standingKey } from '@/lib/education'
import { CERTIFICATIONS, EDUCATION, pageFolio, type Education as EducationEntry, type EducationPart } from '@/lib/profile'
import { techKey } from '@/lib/tech-key'
import Education from './Education'

const FLASH_MS = 2400

const entry = (container: HTMLElement, slug: string) => container.querySelector<HTMLElement>(`article#edu-${slug}`) as HTMLElement

/** The <li> that renders one honour: its data-tech is the honour's key, and its text is the result then the context. */
const honourItem = (scope: HTMLElement, honor: string): HTMLElement => {
  const text = splitHonor(honor).join('')
  const item = Array.from(scope.querySelectorAll<HTMLElement>('li[data-tech]')).find(
    (li) => li.dataset.tech === techKey(honor) && li.textContent === text,
  )
  if (!item) throw new Error(`No honour item for "${honor}"`)
  return item
}

/** The dark results-row button for a result, by its label. */
const resultButton = (label: RegExp | string) => screen.getByRole('button', { name: new RegExp(label instanceof RegExp ? label.source : label) })

const ownHonors = (e: { scholarships?: string[]; achievements?: string[] }) => [...(e.scholarships ?? []), ...(e.achievements ?? [])]

const SMU = EDUCATION.find((e) => e.slug === 'smu') as EducationEntry
const NUS = EDUCATION.find((e) => e.slug === 'nus') as EducationEntry
const AJC = EDUCATION.find((e) => e.slug === 'ajc') as EducationEntry

let scrollSpy: jest.SpyInstance

beforeEach(() => {
  jest.useFakeTimers()
  // jest.setup installs a shared jest.fn for scrollIntoView; clear it so each test counts only its own calls.
  scrollSpy = jest.spyOn(Element.prototype, 'scrollIntoView')
  scrollSpy.mockClear()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('Education (the /education page)', () => {
  describe('section and header', () => {
    it('is the education section, with the id the nav and the copilot target', () => {
      const { container } = render(<Education />)
      const section = container.querySelector('section#education')
      expect(section).toBeInTheDocument()
      expect(section).toHaveClass('text-ink')
    })

    it('shows the folio from pageFolio, 02, and the kicker Education in the section marker', () => {
      const { container } = render(<Education />)
      const marker = container.querySelector('section#education header > div') as HTMLElement
      expect(within(marker).getByText(pageFolio('/education'))).toBeInTheDocument()
      expect(pageFolio('/education')).toBe('02')
      expect(within(marker).getByText('Education')).toBeInTheDocument()
    })

    it('puts a back-to-top link in the marker row, pointing at #top', () => {
      const { container } = render(<Education />)
      const marker = container.querySelector('section#education header > div') as HTMLElement
      expect(within(marker).getByRole('link', { name: /back to top/i })).toHaveAttribute('href', '#top')
    })

    it('has one h2 with the page heading, with "studied" as the amber emphasis', () => {
      render(<Education />)
      const heading = screen.getByRole('heading', { level: 2 })
      expect(heading).toHaveTextContent('Where I have studied, in reverse.')
      expect(heading.querySelector('em')).toHaveClass('italic', 'text-amber')
      expect(heading.querySelector('em')).toHaveTextContent('studied')
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
    })
  })

  describe('results row', () => {
    const resultButtons = () => screen.getAllByRole('button', { name: (name) => !name.startsWith('Ask about') })

    it('renders the four results from educationResults, in order, each with its figure and label', () => {
      render(<Education />)
      const results = educationResults()
      const buttons = resultButtons()
      expect(buttons).toHaveLength(4)
      results.forEach((r, i) => {
        expect(buttons[i]).toHaveTextContent(r.figure)
        expect(buttons[i]).toHaveTextContent(r.label)
      })
    })

    it('makes each result a native button, not a submit control', () => {
      render(<Education />)
      resultButtons().forEach((b) => expect(b).toHaveAttribute('type', 'button'))
    })

    it('scrolls to the GPA tile under SMU when the GPA result is clicked', () => {
      const { container } = render(<Education />)
      fireEvent.click(resultButton(/GPA at SMU/))
      const gpaTile = entry(container, 'smu').querySelector(`[data-tech="${standingKey(SMU)}"]`)
      expect(scrollSpy).toHaveBeenCalledTimes(1)
      expect(scrollSpy.mock.instances[0]).toBe(gpaTile)
    })

    it('flashes the honour under AJC when the Top Student result is clicked', () => {
      const { container } = render(<Education />)
      fireEvent.click(resultButton(/Award at AJC/))
      const tile = entry(container, 'ajc').querySelector(`[data-tech="${standingKey(AJC)}"]`)
      expect(tile).toHaveClass('result-flash')
    })

    it('flashes the 1st place honour under SMU when the 1st place result is clicked', () => {
      const { container } = render(<Education />)
      fireEvent.click(resultButton(/Food Image Classification competition, SMU/))
      const honour = honourItem(entry(container, 'smu'), '1st place, Food Image Classification competition')
      expect(honour).toHaveClass('result-flash')
    })

    it('flashes both programme standings when the distinction result is clicked, and no other tile', () => {
      const { container } = render(<Education />)
      fireEvent.click(resultButton(/First Class with Distinction \(UConn/))
      const standings = Array.from(container.querySelectorAll<HTMLElement>('[data-tech="first class with distinction"]'))
      expect(standings).toHaveLength(2)
      standings.forEach((el) => expect(el).toHaveClass('result-flash'))
      expect(container.querySelectorAll('.result-flash')).toHaveLength(2)
    })

    it('removes the flash after 2.4 seconds', () => {
      const { container } = render(<Education />)
      fireEvent.click(resultButton(/GPA at SMU/))
      const tile = entry(container, 'smu').querySelector(`[data-tech="${standingKey(SMU)}"]`)
      act(() => {
        jest.advanceTimersByTime(FLASH_MS - 1)
      })
      expect(tile).toHaveClass('result-flash')
      act(() => {
        jest.advanceTimersByTime(1)
      })
      expect(tile).not.toHaveClass('result-flash')
    })
  })

  describe('degrees', () => {
    it('renders one article per degree, with the id edu-{slug}, in data order', () => {
      const { container } = render(<Education />)
      expect(Array.from(container.querySelectorAll('article'), (a) => a.id)).toEqual(EDUCATION.map((e) => `edu-${e.slug}`))
    })

    it('shows each degree’s dates in its rail, beside the institution, degree and location', () => {
      const { container } = render(<Education />)
      for (const e of EDUCATION) {
        const rail = entry(container, e.slug).querySelector('div.sticky') as HTMLElement
        expect(within(rail).getByText(e.dates)).toBeInTheDocument()
        expect(within(rail).getByRole('heading', { level: 3, name: e.institution })).toBeInTheDocument()
        expect(within(rail).getByText(e.degree)).toBeInTheDocument()
        expect(within(rail).getByText(e.location)).toBeInTheDocument()
      }
    })

    it('names each institution as an h3 on the page', () => {
      render(<Education />)
      const institutions = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
      for (const e of EDUCATION) {
        expect(institutions).toContain(e.institution)
      }
    })

    it('gives each degree a dark results tile with its figure and caption, keyed for the results row', () => {
      const { container } = render(<Education />)
      for (const e of EDUCATION) {
        const tile = entry(container, e.slug).querySelector<HTMLElement>(`[data-tech="${standingKey(e)}"]`)
        expect(tile).toBeInTheDocument()
        expect(within(tile as HTMLElement).getByText(e.standing.caption)).toBeInTheDocument()
        // The full figure is always available to screen readers, even while it counts up.
        expect(within(tile as HTMLElement).getByText(e.standing.figure, { selector: '.sr-only' })).toBeInTheDocument()
      }
    })

    it("shows a degree's corner note on its results tile, as in SMU's Dean's List", () => {
      const { container } = render(<Education />)
      expect(within(entry(container, 'smu')).getByText("Dean's List")).toBeInTheDocument()
      expect(within(entry(container, 'nus')).queryByText("Dean's List")).toBeNull()
    })

    it('renders every honour as a list item, with a normalised data-tech key', () => {
      const { container } = render(<Education />)
      for (const e of EDUCATION) {
        for (const honor of ownHonors(e)) {
          const item = honourItem(entry(container, e.slug), honor)
          expect(item.tagName).toBe('LI')
          expect(item).toHaveAttribute('data-tech', techKey(honor))
        }
      }
    })

    it('renders every honour on the page exactly once, and no others', () => {
      const { container } = render(<Education />)
      expect(container.querySelectorAll('li[data-tech]')).toHaveLength(allHonors().length)
    })

    it('shows scholarships before achievements, under their own labels, and only the groups that have honours', () => {
      const { container } = render(<Education />)
      const labels = (e: EducationEntry) =>
        Array.from(entry(container, e.slug).querySelectorAll('h4'), (h) => h.textContent).filter((t) => t === 'Scholarships' || t === 'Achievements')
      expect(labels(SMU)).toEqual(['Scholarships', 'Achievements'])
      expect(labels(AJC)).toEqual(['Achievements'])
    })

    it('renders an honour as its result and its context in separate elements', () => {
      const { container } = render(<Education />)
      const spans = honourItem(entry(container, 'ajc'), 'Platinum Award, Community Involvement Programme').querySelectorAll('span')
      expect(spans).toHaveLength(2)
      expect(spans[0]).toHaveTextContent(/^Platinum Award$/)
      expect(spans[1]).toHaveTextContent(/^Community Involvement Programme$/)
    })

    it('renders an honour with no comma as its result alone, with no context element', () => {
      const { container } = render(<Education />)
      const spans = honourItem(entry(container, 'smu'), 'MITB Scholarship').querySelectorAll('span')
      expect(spans).toHaveLength(1)
      expect(spans[0]).toHaveTextContent(/^MITB Scholarship$/)
    })

    it('sets the numbers in a result as their own elements, and leaves the words plain', () => {
      const { container } = render(<Education />)
      const oxford = NUS.parts?.find((p) => p.short === 'Oxford') as EducationPart
      const item = honourItem(entry(container, 'nus'), oxford.achievements?.[0] as string)
      const result = item.querySelector('span') as HTMLElement
      expect(Array.from(result.querySelectorAll('span'), (s) => s.textContent)).toEqual(['1', '14'])
      expect(result).toHaveTextContent('1 of 14 selected worldwide')
    })

    it('sets no numbers apart in a result that has none', () => {
      const { container } = render(<Education />)
      const item = honourItem(entry(container, 'nus'), 'NUS Undergraduate Scholarship')
      expect(item.querySelectorAll('span')).toHaveLength(1)
    })

    it('spells out the Community Involvement Programme and never shows CIP', () => {
      const { container } = render(<Education />)
      expect(screen.getByText('Community Involvement Programme')).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bCIP\b/)
    })
  })

  describe('programmes taken during a degree (NUS)', () => {
    it('renders each programme under NUS as a heading, not as a separate degree', () => {
      const { container } = render(<Education />)
      const nus = entry(container, 'nus')
      expect(within(nus).getByRole('heading', { level: 4, name: 'University of Connecticut' })).toBeInTheDocument()
      expect(within(nus).getByRole('heading', { level: 4, name: 'University of Oxford' })).toBeInTheDocument()
      expect(within(nus).getByRole('heading', { level: 4, name: 'NUS Suzhou Research Institute' })).toBeInTheDocument()
      expect(container.querySelectorAll('article')).toHaveLength(EDUCATION.length)
    })

    it('labels the programmes "During NUS", in the order they are listed in the data', () => {
      const { container } = render(<Education />)
      const nus = entry(container, 'nus')
      expect(within(nus).getByRole('heading', { level: 4, name: 'During NUS' })).toBeInTheDocument()
      const names = Array.from(nus.querySelectorAll('h4'), (h) => h.textContent).filter((t) => NUS.parts?.some((p) => p.institution === t))
      expect(names).toEqual(NUS.parts?.map((p) => p.institution))
    })

    it('gives each programme its dates, its programme name and its standing', () => {
      const { container } = render(<Education />)
      const nus = entry(container, 'nus')
      for (const p of NUS.parts ?? []) {
        expect(within(nus).getAllByText(p.dates).length).toBeGreaterThan(0)
        expect(within(nus).getByText(p.programme)).toBeInTheDocument()
        expect(within(nus).getAllByText(p.standing).length).toBeGreaterThan(0)
      }
      expect(within(nus).getAllByText('2014')).toHaveLength(2)
    })

    it('renders each programme honour as a tag inside its programme box', () => {
      const { container } = render(<Education />)
      const nus = entry(container, 'nus')
      for (const part of NUS.parts ?? []) {
        for (const honor of ownHonors(part)) {
          expect(honourItem(nus, honor)).toHaveAttribute('data-tech', techKey(honor))
        }
      }
    })

    it('keys each programme standing for the results row, so both distinctions share one key', () => {
      const { container } = render(<Education />)
      const standings = Array.from(container.querySelectorAll<HTMLElement>('[data-tech="first class with distinction"]'))
      expect(standings).toHaveLength(2)
      expect(standings.map((s) => s.textContent)).toEqual(['First Class with Distinction', 'First Class with Distinction'])
    })

    it('does not render a programme block under SMU or AJC, which have none', () => {
      const { container } = render(<Education />)
      expect(within(entry(container, 'smu')).queryByText(/^During /)).toBeNull()
      expect(within(entry(container, 'ajc')).queryByText(/^During /)).toBeNull()
    })
  })

  describe('Ask pills', () => {
    const askPills = (scope: HTMLElement) => within(scope).queryAllByRole('button', { name: /^Ask about / })

    it('gives each degree an Ask pill naming its label', () => {
      const { container } = render(<Education />)
      for (const e of EDUCATION) {
        expect(within(entry(container, e.slug)).getByRole('button', { name: `Ask about ${e.ask.label}` })).toBeInTheDocument()
      }
    })

    it('gives each programme box its own Ask pill, inside the degree it belongs to', () => {
      const { container } = render(<Education />)
      const nus = entry(container, 'nus')
      for (const p of NUS.parts ?? []) {
        expect(within(nus).getByRole('button', { name: `Ask about ${p.ask.label}` })).toBeInTheDocument()
      }
      // NUS's own pill, plus one per programme.
      expect(askPills(nus)).toHaveLength(1 + (NUS.parts?.length ?? 0))
    })

    it('sends the question to Ask Titus, in chat mode, when a degree pill is clicked', () => {
      const { container } = render(<Education />)
      const listener = jest.fn()
      window.addEventListener(COPILOT_OPEN_EVENT, listener)
      fireEvent.click(within(entry(container, 'smu')).getByRole('button', { name: /Ask about my/ }))
      window.removeEventListener(COPILOT_OPEN_EVENT, listener)

      expect(listener).toHaveBeenCalledTimes(1)
      expect((listener.mock.calls[0][0] as CustomEvent<CopilotOpenDetail>).detail).toEqual({ mode: 'chat', prompt: SMU.ask.question })
    })

    it('sends the programme’s own question when its pill is clicked', () => {
      const { container } = render(<Education />)
      const listener = jest.fn()
      window.addEventListener(COPILOT_OPEN_EVENT, listener)
      fireEvent.click(within(entry(container, 'nus')).getByRole('button', { name: 'Ask about UConn' }))
      window.removeEventListener(COPILOT_OPEN_EVENT, listener)

      const uconn = NUS.parts?.find((p) => p.short === 'UConn')
      expect((listener.mock.calls[0][0] as CustomEvent<CopilotOpenDetail>).detail).toEqual({ mode: 'chat', prompt: uconn?.ask.question })
    })
  })

  describe('certifications', () => {
    it('has a Certifications heading', () => {
      render(<Education />)
      expect(screen.getByRole('heading', { level: 3, name: 'Certifications' })).toBeInTheDocument()
    })

    it('lists every certification from the data, one per item', () => {
      const { container } = render(<Education />)
      const items = Array.from(container.querySelectorAll('section#education li')).filter((li) => CERTIFICATIONS.includes(li.textContent ?? ''))
      expect(items.map((li) => li.textContent)).toEqual(CERTIFICATIONS)
    })

    it('puts the certifications after the last degree', () => {
      const { container } = render(<Education />)
      const label = screen.getByRole('heading', { level: 3, name: 'Certifications' })
      const lastArticle = entry(container, EDUCATION[EDUCATION.length - 1].slug)
      expect(lastArticle.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('ids', () => {
    it('gives every element id on the page exactly once', () => {
      const { container } = render(<Education />)
      const ids = Array.from(container.querySelectorAll('[id]'), (el) => el.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('uses the ids the copilot may point at: education, and one per degree', () => {
      const { container } = render(<Education />)
      const ids = Array.from(container.querySelectorAll('[id]'), (el) => el.id)
      expect(ids).toEqual(['education', ...EDUCATION.map((e) => `edu-${e.slug}`)])
    })
  })
})
