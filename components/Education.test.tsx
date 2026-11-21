import { fireEvent, render, screen, within } from '@testing-library/react'
import { allHonors, educationResults, splitHonor } from '@/lib/education'
import { CERTIFICATIONS, EDUCATION, pageFolio } from '@/lib/profile'
import { techKey } from '@/lib/tech-key'
import Education from './Education'

const entry = (container: HTMLElement, slug: string) => container.querySelector<HTMLElement>(`article#edu-${slug}`) as HTMLElement

/** The <li> that renders one honour: its data-tech is the honour's key, and its text is the result then the context. */
const honourItem = (scope: HTMLElement, honor: string): HTMLElement => {
  const text = splitHonor(honor).join('')
  const item = Array.from(scope.querySelectorAll<HTMLElement>('li[data-tech]')).find(
    (li) => li.dataset.tech === techKey(honor) && li.textContent === text
  )
  if (!item) throw new Error(`No honour item for "${honor}"`)
  return item
}

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
      const link = within(marker).getByRole('link', { name: /back to top/i })
      expect(link).toHaveAttribute('href', '#top')
    })

    it('has one h2 with the page heading, with "studied" as the amber emphasis', () => {
      render(<Education />)
      const heading = screen.getByRole('heading', { level: 2 })
      expect(heading).toHaveTextContent('Where I have studied, in reverse.')
      expect(heading.querySelector('em')).toHaveClass('italic', 'text-amber')
      expect(heading.querySelector('em')).toHaveTextContent('studied')
    })

    it('has a single h2 on the page', () => {
      render(<Education />)
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
    })
  })

  describe('results row', () => {
    it('renders the four results from educationResults, as buttons', () => {
      render(<Education />)
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(educationResults().length)
      expect(buttons).toHaveLength(4)
      expect(buttons[0]).toHaveTextContent('3.98')
      expect(buttons[0]).toHaveTextContent('GPA at SMU')
    })
  })

  describe('degrees', () => {
    it('renders one article per degree, with the id edu-{slug}, in data order', () => {
      const { container } = render(<Education />)
      const articles = Array.from(container.querySelectorAll('article'))
      expect(articles.map((a) => a.id)).toEqual(EDUCATION.map((e) => `edu-${e.slug}`))
    })

    it('gives each article a year rail with the degree year, and an amber rule', () => {
      const { container } = render(<Education />)
      for (const e of EDUCATION) {
        const rail = entry(container, e.slug).querySelector('div.sticky') as HTMLElement
        expect(rail).toHaveTextContent(e.years)
        expect(rail.querySelector('span.bg-amber')).toBeInTheDocument()
      }
    })

    it('names each institution as an h3 under the page heading', () => {
      render(<Education />)
      const headings = screen.getAllByRole('heading', { level: 3 })
      const institutions = headings.map((h) => h.textContent)
      for (const e of EDUCATION) {
        expect(institutions).toContain(e.institution)
      }
    })

    it('gives each degree its qualification, location and dates', () => {
      const { container } = render(<Education />)
      for (const e of EDUCATION) {
        const article = entry(container, e.slug)
        expect(within(article).getByText(e.degree)).toBeInTheDocument()
        expect(within(article).getByText(e.location)).toBeInTheDocument()
        expect(within(article).getByText(e.dates)).toBeInTheDocument()
      }
    })

    it('uses the year in the rail as the big figure, separate from the institution', () => {
      const { container } = render(<Education />)
      const rail = entry(container, 'smu').querySelector('div.sticky') as HTMLElement
      expect(rail.querySelector('span')).toHaveTextContent('2021')
    })

    it('renders every degree honour as a list item, with a normalised data-tech key', () => {
      const { container } = render(<Education />)
      for (const e of EDUCATION) {
        const article = entry(container, e.slug)
        for (const honor of e.honors) {
          const item = honourItem(article, honor)
          expect(item.tagName).toBe('LI')
          expect(item).toHaveAttribute('data-tech', techKey(honor))
        }
      }
    })

    it('gives each honour no amber rule, and lights its background and result underline when hovered', () => {
      const { container } = render(<Education />)
      const item = honourItem(entry(container, 'smu'), "Dean's List")
      expect(item).not.toHaveClass('before:bg-amber')
      expect(item).not.toHaveClass('border-l-2')
      expect(item).toHaveClass('data-[on]:bg-paper-deep')
      expect(item.querySelector('span')).toHaveClass('group-data-[on]:underline')
    })

    it('sets the numbers in a result in amber spans, and leaves the words plain', () => {
      const { container } = render(<Education />)
      const item = honourItem(entry(container, 'nus'), '1 of 3 chemical engineers selected, NUS Suzhou winter programme')
      const result = item.querySelector('span') as HTMLElement
      const amber = Array.from(result.querySelectorAll('span.text-amber'), (s) => s.textContent)
      expect(amber).toEqual(['1', '3'])
      expect(result).toHaveTextContent('1 of 3 chemical engineers selected')
    })

    it('sets no amber numbers in a result that has none', () => {
      const { container } = render(<Education />)
      const item = honourItem(entry(container, 'nus'), 'NUS Undergraduate Scholarship')
      expect(item.querySelectorAll('span.text-amber')).toHaveLength(0)
    })

    it('renders an honour as its result and its context in separate elements', () => {
      const { container } = render(<Education />)
      const spans = honourItem(entry(container, 'ajc'), 'Platinum Award, Community Involvement Programme').querySelectorAll('span')
      expect(spans).toHaveLength(2)
      expect(spans[0]).toHaveTextContent(/^Platinum Award$/)
      expect(spans[0]).toHaveClass('font-serif')
      expect(spans[1]).toHaveTextContent(/^Community Involvement Programme$/)
      expect(spans[1]).toHaveClass('font-mono')
    })

    it('renders an honour with no comma as its result alone, with no context element', () => {
      const { container } = render(<Education />)
      const spans = honourItem(entry(container, 'smu'), "Dean's List").querySelectorAll('span')
      expect(spans).toHaveLength(1)
      expect(spans[0]).toHaveTextContent(/^Dean's List$/)
    })

    it('spells out the Community Involvement Programme and never shows CIP', () => {
      const { container } = render(<Education />)
      expect(screen.getByText('Community Involvement Programme')).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bCIP\b/)
    })

    it('renders every honour in the page, and no others', () => {
      const { container } = render(<Education />)
      const tags = container.querySelectorAll('li[data-tech]')
      expect(tags).toHaveLength(allHonors().length)
    })

    it('renders the GPA honour that the results row points to, under SMU', () => {
      const { container } = render(<Education />)
      const gpa = honourItem(entry(container, 'smu'), 'GPA 3.98 / 4.0')
      expect(gpa).toHaveAttribute('data-tech', 'gpa 3.98 / 4.0')
    })
  })

  describe('programmes taken during a degree', () => {
    it('renders each programme under its degree, not as a separate degree', () => {
      const { container } = render(<Education />)
      const nus = entry(container, 'nus')
      expect(within(nus).getByRole('heading', { level: 4, name: /University of Connecticut/ })).toBeInTheDocument()
      expect(within(nus).getByRole('heading', { level: 4, name: /University of Oxford/ })).toBeInTheDocument()
      expect(container.querySelectorAll('article')).toHaveLength(EDUCATION.length)
    })

    it('gives each programme its dates and its programme name', () => {
      const { container } = render(<Education />)
      const nus = entry(container, 'nus')
      expect(within(nus).getByText('2013')).toBeInTheDocument()
      expect(within(nus).getByText('2014')).toBeInTheDocument()
      expect(within(nus).getByText('Exchange, Chemical & Biomolecular Engineering')).toBeInTheDocument()
      expect(within(nus).getByText('IARU Global Summer School, Global Challenges of the 21st Century')).toBeInTheDocument()
    })

    it('renders each programme honour as a tag inside the programme block', () => {
      const { container } = render(<Education />)
      const nus = entry(container, 'nus')
      for (const part of EDUCATION.find((e) => e.slug === 'nus')!.parts!) {
        for (const honor of part.honors) {
          expect(honourItem(nus, honor)).toHaveAttribute('data-tech', techKey(honor))
        }
      }
    })

    it('does not render programmes under SMU or AJC, which have none', () => {
      const { container } = render(<Education />)
      expect(within(entry(container, 'smu')).queryByRole('heading', { level: 4 })).toBeNull()
      expect(within(entry(container, 'ajc')).queryByRole('heading', { level: 4 })).toBeNull()
    })

    it('lights the same distinction in both programmes when hovering one', () => {
      const { container } = render(<Education />)
      const distinctions = Array.from(container.querySelectorAll<HTMLElement>('li[data-tech="first class with distinction"]'))
      expect(distinctions).toHaveLength(2)

      fireEvent.mouseOver(distinctions[0])

      distinctions.forEach((el) => expect(el).toHaveAttribute('data-on'))
    })

    it('does not light other honours when hovering one honour', () => {
      const { container } = render(<Education />)
      const smu = entry(container, 'smu')
      const smuGpa = honourItem(smu, 'GPA 3.98 / 4.0')
      fireEvent.mouseOver(smuGpa.querySelector('span') as HTMLElement)
      expect(smuGpa).toHaveAttribute('data-on')
      expect(honourItem(smu, "Dean's List")).not.toHaveAttribute('data-on')
    })
  })

  describe('certifications', () => {
    it('has a Certifications label', () => {
      render(<Education />)
      expect(screen.getByRole('heading', { level: 3, name: 'Certifications' })).toBeInTheDocument()
    })

    it('lists every certification from the data, joined with a middot', () => {
      render(<Education />)
      expect(screen.getByText(CERTIFICATIONS.join(' · '))).toBeInTheDocument()
      expect(screen.getByText('Certified ScrumMaster')).toBeInTheDocument()
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
