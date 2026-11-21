import { allHonors, educationDoor, educationResults, numberParts, splitHonor } from './education'
import { EDUCATION, type Education } from './profile'
import { techKey } from './tech-key'

const degree = (overrides: Partial<Education> = {}): Education => ({
  slug: 'test',
  years: '2000',
  institution: 'Test Institute',
  short: 'TI',
  degree: 'Test degree',
  dates: '2000 — 2001',
  location: 'Nowhere',
  honors: [],
  ...overrides,
})

describe('allHonors', () => {
  it('returns every honour of every degree and every programme, once each', () => {
    const expected = EDUCATION.reduce(
      (n, e) => n + e.honors.length + (e.parts ?? []).reduce((m, p) => m + p.honors.length, 0),
      0
    )
    expect(allHonors()).toHaveLength(expected)
    expect(expected).toBe(24)
  })

  it('tags a degree honour with the degree slug and its short institution name', () => {
    const gpa = allHonors().find((h) => h.honor === 'GPA 3.98 / 4.0')
    expect(gpa).toEqual({ honor: 'GPA 3.98 / 4.0', slug: 'smu', short: 'SMU' })
  })

  it('tags a programme honour with the degree it sits under, but the programme short name', () => {
    const uconn = allHonors().find((h) => h.honor === 'Top of the class in two modules, Process Kinetics and Heat & Mass Transfer')
    expect(uconn).toEqual({ honor: 'Top of the class in two modules, Process Kinetics and Heat & Mass Transfer', slug: 'nus', short: 'UConn' })
    const oxford = allHonors().filter((h) => h.honor === 'First Class with Distinction').map((h) => h.short)
    expect(oxford).toEqual(['UConn', 'Oxford'])
  })

  it('puts degree honours before programme honours, in data order', () => {
    const nus = allHonors().filter((h) => h.slug === 'nus')
    expect(nus[0].honor).toBe('NUS Undergraduate Scholarship')
    expect(nus.findIndex((h) => h.short === 'UConn')).toBeGreaterThan(nus.findIndex((h) => h.short === 'NUS'))
  })

  it('returns an empty list when no degree has honours or parts', () => {
    expect(allHonors([degree({ honors: [] })])).toEqual([])
    expect(allHonors([])).toEqual([])
  })

  it('reads the education it is given, not the default list', () => {
    const honors = allHonors([degree({ honors: ['Only one'] })])
    expect(honors).toEqual([{ honor: 'Only one', slug: 'test', short: 'TI' }])
  })
})

describe('splitHonor', () => {
  it('splits at the first ", " into the result, then its context', () => {
    expect(splitHonor('Platinum Award, Community Involvement Programme')).toEqual([
      'Platinum Award',
      'Community Involvement Programme',
    ])
  })

  it('returns the whole honour as the result, with an empty context, when there is no comma', () => {
    expect(splitHonor('GPA 3.98 / 4.0')).toEqual(['GPA 3.98 / 4.0', ''])
    expect(splitHonor("Dean's List")).toEqual(["Dean's List", ''])
  })

  it('splits only at the first comma, leaving later commas in the context', () => {
    expect(splitHonor('Selected to present, Shell Global Energy, Water & Food Security Roundtable')).toEqual([
      'Selected to present',
      'Shell Global Energy, Water & Food Security Roundtable',
    ])
  })

  it('splits on the first ", " only when the honour has one, so a comma with no space does not split', () => {
    expect(splitHonor('Top 10,in two modules')).toEqual(['Top 10,in two modules', ''])
  })

  it('leaves an empty context after a trailing ", "', () => {
    expect(splitHonor('Result, ')).toEqual(['Result', ''])
  })

  it('returns two empty strings for an empty honour', () => {
    expect(splitHonor('')).toEqual(['', ''])
  })

  it('gives every honour on the default data a non-empty result, and joins back to the original', () => {
    for (const { honor } of allHonors()) {
      const [result, context] = splitHonor(honor)
      expect(result).not.toBe('')
      expect(context ? `${result}, ${context}` : result).toBe(honor)
    }
  })
})

describe('numberParts', () => {
  it('splits a count out of the text, flagging it as a number', () => {
    expect(numberParts('Top 10 in two PhD modules')).toEqual([
      { text: 'Top ', num: false },
      { text: '10', num: true },
      { text: ' in two PhD modules', num: false },
    ])
  })

  it('keeps an ordinal together with its number', () => {
    expect(numberParts('88th percentile globally')).toEqual([
      { text: '88th', num: true },
      { text: ' percentile globally', num: false },
    ])
  })

  it('keeps a decimal together, including both sides of a slash', () => {
    expect(numberParts('GPA 3.98 / 4.0')).toEqual([
      { text: 'GPA ', num: false },
      { text: '3.98', num: true },
      { text: ' / ', num: false },
      { text: '4.0', num: true },
    ])
  })

  it('flags every number in a result, not just the first', () => {
    expect(numberParts('1 of 3 chemical engineers selected')).toEqual([
      { text: '1', num: true },
      { text: ' of ', num: false },
      { text: '3', num: true },
      { text: ' chemical engineers selected', num: false },
    ])
  })

  it('returns one plain piece for text with no number', () => {
    expect(numberParts("Dean's List")).toEqual([{ text: "Dean's List", num: false }])
  })

  it('returns no pieces for an empty string, and never an empty piece', () => {
    expect(numberParts('')).toEqual([])
    for (const { honor } of allHonors()) {
      for (const part of numberParts(honor)) {
        expect(part.text).not.toBe('')
      }
    }
  })

  it('flags a piece as a number only when it starts with a digit', () => {
    for (const part of numberParts('Top 10 in 88th place, GPA 3.98')) {
      expect(part.num).toBe(/^\d/.test(part.text))
    }
  })

  it('rejoins the pieces to the original text, for every honour and some edge cases', () => {
    const samples = [...allHonors().map((h) => h.honor), '', '10', '3.5', '1st', 'v2.0 released 2024th', 'no numbers here']
    for (const text of samples) {
      expect(numberParts(text).map((p) => p.text).join('')).toBe(text)
    }
  })
})

describe('educationResults', () => {
  describe('from the default data', () => {
    const results = educationResults()

    it('returns four results, in this order: GPA, Top Student, 1st place, First Class with Distinction', () => {
      expect(results.map((r) => r.figure)).toEqual(['3.98', 'Top Student', '1st', '2×'])
    })

    it('gives the GPA result its figure, label and short brief', () => {
      expect(results[0]).toEqual({
        figure: '3.98',
        label: 'GPA at SMU',
        brief: 'GPA 3.98',
        slug: 'smu',
        key: techKey('GPA 3.98 / 4.0'),
      })
    })

    it('gives the Top Student result its label from the AJC honour', () => {
      expect(results[1]).toEqual({
        figure: 'Top Student',
        label: 'Award at AJC',
        brief: 'Top Student',
        slug: 'ajc',
        key: 'top student award',
      })
    })

    it('gives the 1st place result the competition name, without the place prefix', () => {
      expect(results[2]).toEqual({
        figure: '1st',
        label: 'Food Image Classification competition, SMU',
        brief: '1st place',
        slug: 'smu',
        key: '1st place, food image classification',
      })
    })

    it('counts the distinctions across the degree and its programmes, naming where each was earned', () => {
      expect(results[3]).toEqual({
        figure: '2×',
        label: 'First Class with Distinction (UConn, Oxford)',
        brief: 'First Class ×2',
        slug: 'nus',
        key: 'first class with distinction',
      })
    })

    it('gives every result a key that matches at least one honour tag on the page', () => {
      const keys = new Set(allHonors().map((h) => techKey(h.honor)))
      for (const r of results) {
        expect(keys.has(r.key)).toBe(true)
      }
    })

    it('gives every result a slug that names a real degree', () => {
      const slugs = new Set(EDUCATION.map((e) => e.slug))
      for (const r of results) {
        expect(slugs.has(r.slug)).toBe(true)
      }
    })

    it('gives every result a non-empty figure, label and brief', () => {
      for (const r of results) {
        expect(r.figure).not.toBe('')
        expect(r.label).not.toBe('')
        expect(r.brief).not.toBe('')
      }
    })
  })

  describe('when an honour is missing, it is left out', () => {
    it('omits the GPA result when no honour starts with GPA', () => {
      const results = educationResults([degree({ honors: ["Dean's List"] })])
      expect(results.find((r) => r.brief.startsWith('GPA'))).toBeUndefined()
    })

    it('omits the GPA result when the GPA honour has no number in it', () => {
      expect(educationResults([degree({ honors: ['GPA'] })])).toEqual([])
    })

    it('omits the Top Student result unless the honour is exactly "Top Student Award"', () => {
      expect(educationResults([degree({ honors: ['Top Student'] })])).toEqual([])
      expect(educationResults([degree({ honors: ['Top Student Award'] })])).toHaveLength(1)
    })

    it('omits the 1st place result when no honour starts with "1st place, "', () => {
      expect(educationResults([degree({ honors: ['1st class honours'] })])).toEqual([])
      expect(educationResults([degree({ honors: ['3rd place, Recommender Systems'] })])).toEqual([])
    })

    it('omits the distinction result when no First Class with Distinction is listed', () => {
      expect(educationResults([degree({ honors: ['First Class'] })])).toEqual([])
    })

    it('returns no results at all when no degree has any honour', () => {
      expect(educationResults([degree({ honors: [] })])).toEqual([])
      expect(educationResults([])).toEqual([])
    })

    it('keeps the results that are present, in order, when others are missing', () => {
      const results = educationResults([
        degree({ slug: 'a', honors: ['GPA 4.5 / 5.0'] }),
        degree({ slug: 'b', honors: ['First Class with Distinction'] }),
      ])
      expect(results.map((r) => r.figure)).toEqual(['4.5', '1×'])
    })
  })

  describe('distinction counting', () => {
    it('shows a single distinction as ×1 and names its one place', () => {
      const [only] = educationResults([degree({ short: 'UCL', honors: ['First Class with Distinction'] })])
      expect(only).toMatchObject({ figure: '1×', brief: 'First Class ×1', label: 'First Class with Distinction (UCL)' })
    })

    it('counts a distinction in a programme as well as on the degree itself', () => {
      const [only] = educationResults([
        degree({
          short: 'Home',
          honors: ['First Class with Distinction'],
          parts: [{ institution: 'Away U', short: 'Away', programme: 'Summer', dates: '2014', honors: ['First Class with Distinction'] }],
        }),
      ])
      expect(only.figure).toBe('2×')
      expect(only.label).toBe('First Class with Distinction (Home, Away)')
    })

    it('links the distinction result to the first degree that earned one', () => {
      const [distinction] = educationResults([
        degree({ slug: 'first', honors: ['Something'] }),
        degree({ slug: 'second', honors: ['First Class with Distinction'] }),
        degree({ slug: 'third', honors: ['First Class with Distinction'] }),
      ])
      expect(distinction.slug).toBe('second')
    })
  })

  it('does not change the education it is given', () => {
    const input = [degree({ honors: ['GPA 3.5 / 4.0'] })]
    const before = JSON.stringify(input)
    educationResults(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('educationDoor', () => {
  it('gives one row per degree, in data order, with its year and institution', () => {
    const rows = educationDoor()
    expect(rows.map((r) => r.lead)).toEqual(EDUCATION.map((e) => e.years))
    expect(rows.map((r) => r.text)).toEqual(EDUCATION.map((e) => e.institution))
  })

  it('gives each degree its first result as the note: GPA, First Class ×2, Top Student', () => {
    expect(educationDoor()).toEqual([
      { lead: '2021', text: 'Singapore Management University', end: 'GPA 3.98' },
      { lead: '2011', text: 'National University of Singapore', end: 'First Class ×2' },
      { lead: '2007', text: 'Anderson Junior College', end: 'Top Student' },
    ])
  })

  it('leaves the note empty for a degree with no result', () => {
    const rows = educationDoor([degree({ honors: ['Dean\'s List'] })])
    expect(rows).toEqual([{ lead: '2000', text: 'Test Institute', end: '' }])
  })

  it('uses the first result a degree earns when it earns several, not the last', () => {
    const rows = educationDoor([
      degree({ slug: 'x', honors: ['Top Student Award', 'GPA 3.1 / 4.0'] }),
    ])
    // GPA is listed first among the results, so it is the note even though the award is listed first on the degree.
    expect(rows[0].end).toBe('GPA 3.1')
  })

  it('returns no rows for no degrees', () => {
    expect(educationDoor([])).toEqual([])
  })
})
