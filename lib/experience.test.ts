import { ILLUMINA_SAVINGS_FIGURE, YEARS_EXPERIENCE_NUMBER } from './content'
import { experienceResults, highlightKey, passDates, tenure } from './experience'
import { ROLES, type Role } from './profile'
import { techKey } from './tech-key'

const role = (overrides: Partial<Role> = {}): Role => ({
  slug: 'test-co',
  years: '2020',
  company: 'Test Co',
  short: 'Test',
  brand: { color: 'oklch(0.5 0.1 100)', logo: 'uob.png' },
  location: 'Nowhere',
  role: 'Engineer',
  dates: 'Jan 2020 — Jan 2021',
  deck: 'Did a thing.',
  tech: ['Python'],
  ...overrides,
})

const byslug = (slug: string) => ROLES.find((r) => r.slug === slug) as Role

describe('highlightKey', () => {
  it('is the lower-cased slug followed by "highlight", the same key the tile carries', () => {
    expect(highlightKey(role({ slug: 'uob' }))).toBe('uob highlight')
    expect(highlightKey(role({ slug: 'Toyota-Tsusho' }))).toBe('toyota-tsusho highlight')
  })

  it('is techKey of the slug and the word, so it cannot collide with a tech tag on its own', () => {
    expect(highlightKey(role({ slug: 'uob' }))).toBe(techKey('uob highlight'))
  })

  it('gives every role in the data a distinct key', () => {
    const keys = ROLES.map(highlightKey)
    expect(new Set(keys).size).toBe(ROLES.length)
  })
})

describe('experienceResults', () => {
  describe('from the default data', () => {
    const results = experienceResults()

    it('returns the years figure first, then one result per role that has a brief, in role order', () => {
      expect(results.map((r) => r.figure)).toEqual([`${YEARS_EXPERIENCE_NUMBER}+`, '80%', ILLUMINA_SAVINGS_FIGURE, '~25%'])
    })

    it('gives the years result its label and points it at the current role', () => {
      expect(results[0]).toEqual({
        figure: '8+',
        label: 'years building production AI',
        key: highlightKey(ROLES[0]),
      })
    })

    it('uses each role brief as the label of its result, with its key', () => {
      expect(results[1]).toEqual({ figure: '80%', label: 'fewer false positives, UOB', key: 'uob highlight' })
      expect(results[2]).toEqual({ figure: ILLUMINA_SAVINGS_FIGURE, label: 'anticipated savings, Illumina', key: 'illumina highlight' })
      expect(results[3]).toEqual({ figure: '~25%', label: 'better forecast accuracy, Toyota Tsusho', key: 'toyota-tsusho highlight' })
    })

    it('has no brief-based result for the current role, whose highlight carries no brief', () => {
      expect(ROLES[0].highlight?.brief).toBeUndefined()
      expect(results.filter((r) => r.key === highlightKey(ROLES[0]))).toHaveLength(1)
    })

    it('gives every result a key that some role’s highlight carries on the page', () => {
      const keys = new Set(ROLES.filter((r) => r.highlight).map(highlightKey))
      for (const r of results) expect(keys.has(r.key)).toBe(true)
    })

    it('gives every result a non-empty figure and label', () => {
      for (const r of results) {
        expect(r.figure).not.toBe('')
        expect(r.label).not.toBe('')
      }
    })
  })

  it('returns no results at all when there are no roles', () => {
    expect(experienceResults([])).toEqual([])
  })

  it('returns only the years result when no role has a highlight brief', () => {
    const results = experienceResults([role({ highlight: { figure: 'Tech lead', caption: 'and more' } })])
    expect(results).toEqual([{ figure: '8+', label: 'years building production AI', key: 'test-co highlight' }])
  })

  it('leaves out a role whose highlight has no brief, and keeps the others in order', () => {
    const results = experienceResults([
      role({ slug: 'a', highlight: { figure: '2×', caption: 'faster', brief: 'faster, A' } }),
      role({ slug: 'b', highlight: { figure: 'Lead', caption: 'of things' } }),
      role({ slug: 'c', highlight: { figure: '40%', caption: 'cheaper', brief: 'cheaper, C' } }),
    ])
    expect(results.map((r) => r.key)).toEqual(['a highlight', 'a highlight', 'c highlight'])
    expect(results.map((r) => r.figure)).toEqual(['8+', '2×', '40%'])
  })

  it('does not change the roles it is given', () => {
    const input = [role({ highlight: { figure: '2×', caption: 'faster', brief: 'faster, A' } })]
    const before = JSON.stringify(input)
    experienceResults(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('passDates', () => {
  it('splits a finished role into its start and end months', () => {
    expect(passDates(role({ dates: 'Jun 2015 — Apr 2017' }))).toEqual({ from: 'Jun 2015', to: 'Apr 2017' })
  })

  it('gives a current role no end date', () => {
    expect(passDates(role({ dates: 'Jul 2026 — Present' }))).toEqual({ from: 'Jul 2026', to: null })
  })

  it('treats "present" as current whatever its case', () => {
    expect(passDates(role({ dates: 'Jul 2026 — present' })).to).toBeNull()
  })

  it('gives no end date when the dates have no end part at all', () => {
    expect(passDates(role({ dates: 'Jan 2020' }))).toEqual({ from: 'Jan 2020', to: null })
  })

  it('gives no end date when the end part is blank', () => {
    expect(passDates(role({ dates: 'Jan 2020 —' }))).toEqual({ from: 'Jan 2020', to: null })
  })

  it('trims the spaces around the dash', () => {
    expect(passDates(role({ dates: '   Mar 2019   —    Aug 2020  ' }))).toEqual({ from: 'Mar 2019', to: 'Aug 2020' })
  })

  it('returns the real data as month-year pairs, with the current role as the only one without an end', () => {
    for (const r of ROLES) {
      const { from, to } = passDates(r)
      expect(from).toMatch(/^[A-Z][a-z]{2} \d{4}$/)
      if (r.slug === 'mastercard') expect(to).toBeNull()
      else expect(to).toMatch(/^[A-Z][a-z]{2} \d{4}$/)
    }
  })
})

describe('tenure', () => {
  describe('the real data', () => {
    it('gives EMA, Apr 2018 to Aug 2022, as 4 yrs 4 mos', () => {
      expect(tenure(byslug('ema'))).toBe('4 yrs 4 mos')
    })

    it('gives JobTech, Apr to Aug 2017, as 4 mos', () => {
      expect(tenure(byslug('jobtech'))).toBe('4 mos')
    })

    it('gives no tenure for the current role', () => {
      expect(tenure(byslug('mastercard'))).toBeNull()
    })
  })

  describe('the format', () => {
    it.each([
      ['Jan 2020 — Jan 2021', '1 yr'],
      ['Jan 2020 — Feb 2021', '1 yr 1 mo'],
      ['Jan 2020 — Jan 2022', '2 yrs'],
      ['Jan 2020 — Mar 2023', '3 yrs 2 mos'],
      ['Jan 2020 — Jan 2020', '1 mo'],
      ['Jan 2020 — Feb 2020', '1 mo'],
      ['Dec 2019 — Jan 2020', '1 mo'],
      ['Sep 2022 — Jan 2023', '4 mos'],
      ['Mar 2020 — Mar 2020', '1 mo'],
    ])('formats %s as %s', (dates, expected) => {
      expect(tenure(role({ dates }))).toBe(expected)
    })

    it('reads full month names as well as the three-letter ones', () => {
      expect(tenure(role({ dates: 'September 2020 — January 2021' }))).toBe('4 mos')
    })

    it('uses the singular for exactly one year, the plural for more', () => {
      expect(tenure(role({ dates: 'Jan 2020 — Jan 2021' }))).toBe('1 yr')
      expect(tenure(role({ dates: 'Jan 2020 — Jan 2022' }))).toBe('2 yrs')
    })

    it('uses the singular for exactly one month, the plural for more', () => {
      expect(tenure(role({ dates: 'Jan 2020 — Feb 2020' }))).toBe('1 mo')
      expect(tenure(role({ dates: 'Jan 2020 — Mar 2020' }))).toBe('2 mos')
    })
  })

  describe('where there is no tenure to give', () => {
    it('is null for a current role', () => {
      expect(tenure(role({ dates: 'Jul 2026 — Present' }))).toBeNull()
    })

    it('is null when the end is missing, since it reads as still going', () => {
      expect(tenure(role({ dates: 'Jan 2020' }))).toBeNull()
    })

    it('is null when the start is not a month and year', () => {
      expect(tenure(role({ dates: 'Spring 2020 — Aug 2021' }))).toBeNull()
      expect(tenure(role({ dates: 'Jan 20 — Aug 2021' }))).toBeNull()
    })

    it('is null when the end is not a month and year', () => {
      expect(tenure(role({ dates: 'Jan 2020 — Someday' }))).toBeNull()
    })

    it('is null when the month name is not a real month', () => {
      expect(tenure(role({ dates: 'Foo 2020 — Aug 2021' }))).toBeNull()
    })

    it('is null when the end comes before the start', () => {
      expect(tenure(role({ dates: 'Aug 2022 — Apr 2018' }))).toBeNull()
      expect(tenure(role({ dates: 'Jan 2021 — Dec 2020' }))).toBeNull()
    })

    it('is null for empty dates', () => {
      expect(tenure(role({ dates: '' }))).toBeNull()
    })
  })
})
