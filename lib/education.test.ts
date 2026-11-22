import { allHonors, educationDoor, educationResults, honorGroups, numberParts, splitHonor, standingKey } from './education'
import { EDUCATION, type Education, type EducationPart } from './profile'
import { techKey } from './tech-key'

const degree = (overrides: Partial<Education> = {}): Education => ({
  slug: 'test',
  years: '2000',
  institution: 'Test Institute',
  short: 'TI',
  degree: 'Test degree',
  dates: '2000 — 2001',
  location: 'Nowhere',
  standing: { figure: '2nd Upper', caption: 'Class Honours' },
  ask: { label: 'Test', question: 'What was the test?' },
  ...overrides,
})

const part = (overrides: Partial<EducationPart> = {}): EducationPart => ({
  institution: 'Away U',
  short: 'Away',
  programme: 'Summer',
  dates: '2014',
  standing: 'First Class with Distinction',
  ask: { label: 'Away', question: 'What was Away like?' },
  ...overrides,
})

/** Every honour a degree carries itself, scholarships then achievements. */
const ownHonors = (e: { scholarships?: string[]; achievements?: string[] }) => [...(e.scholarships ?? []), ...(e.achievements ?? [])]

describe('honorGroups', () => {
  it('returns scholarships, then achievements, in that order', () => {
    expect(honorGroups({ achievements: ['A'], scholarships: ['S'] })).toEqual([
      { name: 'Scholarships', honors: ['S'] },
      { name: 'Achievements', honors: ['A'] },
    ])
  })

  it('leaves out an empty group', () => {
    expect(honorGroups({ scholarships: [], achievements: ['A'] })).toEqual([{ name: 'Achievements', honors: ['A'] }])
    expect(honorGroups({ scholarships: ['S'] })).toEqual([{ name: 'Scholarships', honors: ['S'] }])
  })

  it('returns no groups when there are no honours at all', () => {
    expect(honorGroups({})).toEqual([])
    expect(honorGroups({ scholarships: [], achievements: [] })).toEqual([])
  })

  it('shows both groups for every degree and programme that has both kinds, in the data', () => {
    for (const e of EDUCATION) {
      const names = honorGroups(e).map((g) => g.name)
      expect(names).toEqual([
        ...(e.scholarships?.length ? ['Scholarships'] : []),
        ...(e.achievements?.length ? ['Achievements'] : []),
      ])
    }
  })
})

describe('standingKey', () => {
  it('is techKey of the figure and caption together, the key the hero tile carries', () => {
    expect(standingKey(EDUCATION[0])).toBe(techKey('3.98 GPA out of 4.0'))
    expect(standingKey(degree({ standing: { figure: 'Top Student', caption: 'Award' } }))).toBe('top student award')
  })
})

describe('allHonors', () => {
  it('returns every honour of every degree and every programme, once each', () => {
    const expected = EDUCATION.reduce(
      (n, e) => n + ownHonors(e).length + (e.parts ?? []).reduce((m, p) => m + ownHonors(p).length, 0),
      0,
    )
    expect(allHonors()).toHaveLength(expected)
    expect(expected).toBeGreaterThan(0)
  })

  it('does not list a standing (the figure on the tile) as an honour', () => {
    expect(allHonors().map((h) => h.honor)).not.toContain('First Class with Distinction')
    expect(allHonors().map((h) => h.honor)).not.toContain('3.98 GPA out of 4.0')
  })

  it('tags a degree honour with the degree slug and its short institution name', () => {
    const honor = allHonors().find((h) => h.honor === '1st place, Food Image Classification competition')
    expect(honor).toEqual({ honor: '1st place, Food Image Classification competition', slug: 'smu', short: 'SMU' })
  })

  it('tags a programme honour with the degree slug, but the programme short name', () => {
    const uconn = allHonors().find((h) => h.honor === 'Top of the class in two modules, Process Kinetics and Heat & Mass Transfer')
    expect(uconn).toEqual({
      honor: 'Top of the class in two modules, Process Kinetics and Heat & Mass Transfer',
      slug: 'nus',
      short: 'UConn',
    })
  })

  it('puts scholarships before achievements, and degree honours before programme honours, in data order', () => {
    const nus = allHonors().filter((h) => h.slug === 'nus')
    expect(nus[0].honor).toBe('NUS Undergraduate Scholarship')
    expect(nus.findIndex((h) => h.short === 'UConn')).toBeGreaterThan(nus.findIndex((h) => h.short === 'NUS'))
  })

  it('orders a degree’s scholarships before its achievements, whatever order the fields are written in', () => {
    const honors = allHonors([degree({ achievements: ['A, won it'], scholarships: ['S'] })])
    expect(honors.map((h) => h.honor)).toEqual(['S', 'A, won it'])
  })

  it('returns an empty list when no degree has honours or parts', () => {
    expect(allHonors([degree()])).toEqual([])
    expect(allHonors([])).toEqual([])
  })

  it('reads the education it is given, not the default list', () => {
    expect(allHonors([degree({ scholarships: ['Only one'] })])).toEqual([{ honor: 'Only one', slug: 'test', short: 'TI' }])
  })
})

describe('splitHonor', () => {
  it('splits at the first ", " into the result, then its context', () => {
    expect(splitHonor('Platinum Award, Community Involvement Programme')).toEqual(['Platinum Award', 'Community Involvement Programme'])
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
      for (const piece of numberParts(honor)) {
        expect(piece.text).not.toBe('')
      }
    }
  })

  it('flags a piece as a number only when it starts with a digit', () => {
    for (const piece of numberParts('Top 10 in 88th place, GPA 3.98')) {
      expect(piece.num).toBe(/^\d/.test(piece.text))
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

    it('gives the GPA result its figure, label and short brief, from the degree’s standing', () => {
      expect(results[0]).toEqual({
        figure: '3.98',
        label: 'GPA at SMU',
        brief: 'GPA 3.98',
        slug: 'smu',
        key: techKey('3.98 GPA out of 4.0'),
      })
    })

    it('gives the Top Student result its label from the AJC standing', () => {
      expect(results[1]).toEqual({
        figure: 'Top Student',
        label: 'Award at AJC',
        brief: 'Top Student',
        slug: 'ajc',
        key: 'top student award',
      })
    })

    it('gives the 1st place result the competition name, without the place prefix, and the school', () => {
      expect(results[2]).toEqual({
        figure: '1st',
        label: 'Food Image Classification competition, SMU',
        brief: '1st place',
        slug: 'smu',
        key: techKey('1st place, Food Image Classification competition'),
      })
    })

    it('counts the distinctions across the programmes, naming where each was earned', () => {
      expect(results[3]).toEqual({
        figure: '2×',
        label: 'First Class with Distinction (UConn, Oxford)',
        brief: 'First Class ×2',
        slug: 'nus',
        key: 'first class with distinction',
      })
    })

    it('gives every result a key that matches at least one tag tile on the page', () => {
      const keys = new Set([...allHonors().map((h) => techKey(h.honor)), ...EDUCATION.map(standingKey), techKey('First Class with Distinction')])
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

  describe('GPA, from the standing caption', () => {
    it('omits the GPA result when no degree’s caption starts with GPA', () => {
      expect(educationResults([degree({ standing: { figure: '2nd Upper', caption: 'Class Honours' } })])).toEqual([])
    })

    it('omits the GPA result when GPA is not the first word of the caption', () => {
      expect(educationResults([degree({ standing: { figure: '3.5', caption: 'Average GPA' } })])).toEqual([])
    })

    it('reads the GPA from the caption, not from an honour that mentions it', () => {
      expect(educationResults([degree({ achievements: ['GPA 3.5 / 4.0'] })])).toEqual([])
    })
  })

  describe('Top Student, from the standing figure', () => {
    it('omits the Top Student result unless the figure is exactly "Top Student"', () => {
      expect(educationResults([degree({ standing: { figure: 'Top Student Award', caption: 'Award' } })])).toEqual([])
      expect(educationResults([degree({ standing: { figure: 'Top student', caption: 'Award' } })])).toEqual([])
      expect(educationResults([degree({ standing: { figure: 'Top Student', caption: 'Award' } })])).toHaveLength(1)
    })
  })

  describe('1st place, from the achievements', () => {
    it('omits the 1st place result when no achievement starts with "1st place, "', () => {
      expect(educationResults([degree({ achievements: ['1st class honours'] })])).toEqual([])
      expect(educationResults([degree({ achievements: ['3rd place, Recommender Systems'] })])).toEqual([])
    })

    it('needs the comma, so a bare "1st place" is not a result', () => {
      expect(educationResults([degree({ achievements: ['1st place'] })])).toEqual([])
    })

    it('finds a 1st place in a programme, labelled with the programme short name', () => {
      const [first] = educationResults([degree({ slug: 'n', parts: [part({ short: 'Oxford', achievements: ['1st place, Essay prize'] })] })])
      expect(first).toEqual({
        figure: '1st',
        label: 'Essay prize, Oxford',
        brief: '1st place',
        slug: 'n',
        key: techKey('1st place, Essay prize'),
      })
    })
  })

  describe('distinctions, from the programmes', () => {
    it('omits the distinction result when no programme is a First Class with Distinction', () => {
      expect(educationResults([degree({ parts: [part({ standing: '1 of 3 chemical engineers selected' })] })])).toEqual([])
    })

    it('does not count a distinction on the degree itself, only on its programmes', () => {
      expect(educationResults([degree({ standing: { figure: 'First Class with Distinction', caption: 'Honours' } })])).toEqual([])
    })
  })

  it('returns no results at all when nothing is present', () => {
    expect(educationResults([degree()])).toEqual([])
    expect(educationResults([])).toEqual([])
  })

  it('keeps the results that are present, in order, when others are missing', () => {
    const results = educationResults([
      degree({ slug: 'a', standing: { figure: '4.5', caption: 'GPA out of 5.0' } }),
      degree({ slug: 'b', parts: [part()] }),
    ])
    expect(results.map((r) => r.figure)).toEqual(['4.5', '1×'])
  })

  describe('distinction counting', () => {
    it('shows a single distinction as ×1 and names its one place', () => {
      const [only] = educationResults([degree({ short: 'UCL', parts: [part({ short: 'UCL' })] })])
      expect(only).toMatchObject({ figure: '1×', brief: 'First Class ×1', label: 'First Class with Distinction (UCL)' })
    })

    it('counts every programme with a distinction, under the degree that took them', () => {
      const [only] = educationResults([degree({ short: 'Home', parts: [part({ short: 'Home' }), part({ short: 'Away' })] })])
      expect(only.figure).toBe('2×')
      expect(only.label).toBe('First Class with Distinction (Home, Away)')
    })

    it('links the distinction result to the first degree that earned one', () => {
      const [distinction] = educationResults([
        degree({ slug: 'first' }),
        degree({ slug: 'second', parts: [part()] }),
        degree({ slug: 'third', parts: [part()] }),
      ])
      expect(distinction.slug).toBe('second')
    })
  })

  it('does not change the education it is given', () => {
    const input = [degree({ standing: { figure: '3.5', caption: 'GPA out of 4.0' }, parts: [part()] })]
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
    expect(educationDoor([degree()])).toEqual([{ lead: '2000', text: 'Test Institute', end: '' }])
  })

  it('uses the first result a degree earns when it earns several, not the last', () => {
    const rows = educationDoor([
      degree({
        slug: 'x',
        standing: { figure: 'Top Student', caption: 'Award' },
        achievements: ['1st place, Something'],
      }),
    ])
    // Top Student comes before 1st place in the results row, so it is the note.
    expect(rows[0].end).toBe('Top Student')
  })

  it('returns no rows for no degrees', () => {
    expect(educationDoor([])).toEqual([])
  })
})
