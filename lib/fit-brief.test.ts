import {
  FIT_TEXT_MAX_CHARS,
  MAX_REQUIREMENTS,
  fitBriefMailto,
  fitBriefSchema,
  fitBriefToText,
  roleLine,
  sanitizeFitBrief,
  type FitBrief,
} from './fit-brief'

const TARGETS = new Set(['role-illumina', 'role-uob', 'stack'])

function raw(requirements: unknown[], extra: Record<string, unknown> = {}) {
  return {
    role_title: 'Staff GenAI Engineer',
    company: 'Acme',
    verdict: 'Strongest on production retrieval.',
    requirements,
    ...extra,
  }
}

describe('sanitizeFitBrief', () => {
  it('maps snake_case output to a FitBrief', () => {
    const brief = sanitizeFitBrief(
      raw([{ requirement: 'Production RAG', fit: 'strong', evidence: 'I built it.', targets: ['role-illumina'] }]),
      TARGETS
    )
    expect(brief).toEqual({
      roleTitle: 'Staff GenAI Engineer',
      company: 'Acme',
      verdict: 'Strongest on production retrieval.',
      requirements: [{ requirement: 'Production RAG', fit: 'strong', evidence: 'I built it.', targets: ['role-illumina'] }],
    })
  })

  it('drops unknown targets, dedupes, and keeps at most two', () => {
    const brief = sanitizeFitBrief(
      raw([
        {
          requirement: 'Platforms',
          fit: 'strong',
          evidence: 'BYOA.',
          targets: ['role-nasa', 'role-uob', 'role-uob', 'stack', 'role-illumina'],
        },
      ]),
      TARGETS
    )
    expect(brief?.requirements[0].targets).toEqual(['role-uob', 'stack'])
  })

  it('downgrades a claimed fit with no evidence to not_on_file', () => {
    const brief = sanitizeFitBrief(
      raw([{ requirement: 'LLM evaluation', fit: 'strong', evidence: '   ', targets: ['role-illumina'] }]),
      TARGETS
    )
    expect(brief?.requirements[0]).toEqual({
      requirement: 'LLM evaluation',
      fit: 'not_on_file',
      evidence: '',
      targets: [],
    })
  })

  it('strips evidence and targets the model attached to not_on_file', () => {
    const brief = sanitizeFitBrief(
      raw([{ requirement: 'Rust', fit: 'not_on_file', evidence: 'Probably could learn it fast', targets: ['stack'] }]),
      TARGETS
    )
    expect(brief?.requirements[0].evidence).toBe('')
    expect(brief?.requirements[0].targets).toEqual([])
  })

  it('skips malformed requirements and unknown fit levels', () => {
    const brief = sanitizeFitBrief(
      raw([
        null,
        'nope',
        { requirement: '', fit: 'strong', evidence: 'x', targets: [] },
        { requirement: 'Vibes', fit: 'excellent', evidence: 'x', targets: [] },
        { requirement: 'SQL', fit: 'partial', evidence: 'I use it daily.', targets: 'stack' },
      ]),
      TARGETS
    )
    expect(brief?.requirements).toEqual([{ requirement: 'SQL', fit: 'partial', evidence: 'I use it daily.', targets: [] }])
  })

  it(`keeps at most ${MAX_REQUIREMENTS} requirements`, () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ requirement: `R${i}`, fit: 'strong', evidence: 'e', targets: [] }))
    expect(sanitizeFitBrief(raw(many), TARGETS)?.requirements).toHaveLength(MAX_REQUIREMENTS)
  })

  it('collapses whitespace and truncates overlong strings', () => {
    const brief = sanitizeFitBrief(
      raw([{ requirement: 'A\n\n  B', fit: 'strong', evidence: 'x'.repeat(1000), targets: [] }]),
      TARGETS
    )
    expect(brief?.requirements[0].requirement).toBe('A B')
    expect(brief?.requirements[0].evidence.length).toBeLessThanOrEqual(400)
    expect(brief?.requirements[0].evidence.endsWith('…')).toBe(true)
  })

  it.each([
    ['null', null],
    ['a string', 'brief'],
    ['no verdict', raw([{ requirement: 'R', fit: 'strong', evidence: 'e', targets: [] }], { verdict: '' })],
    ['no requirements array', raw([], { requirements: 'lots' })],
    ['no usable requirements', raw([{ requirement: 'R', fit: 'great', evidence: 'e', targets: [] }])],
  ])('returns null for %s', (_label, input) => {
    expect(sanitizeFitBrief(input, TARGETS)).toBeNull()
  })

  it('treats missing title and company as empty strings', () => {
    const brief = sanitizeFitBrief(
      raw([{ requirement: 'R', fit: 'strong', evidence: 'e', targets: [] }], { role_title: 7, company: undefined }),
      TARGETS
    )
    expect(brief?.roleTitle).toBe('')
    expect(brief?.company).toBe('')
  })
})

describe('fitBriefSchema', () => {
  it('constrains targets to the given anchor ids and requires every field (strict mode)', () => {
    const schema = fitBriefSchema(['a', 'b'])
    const item = schema.properties.requirements.items
    expect(item.properties.targets.items.enum).toEqual(['a', 'b'])
    expect(item.properties.fit.enum).toEqual(['strong', 'partial', 'not_on_file'])
    expect(item.required).toEqual(Object.keys(item.properties))
    expect(schema.required).toEqual(Object.keys(schema.properties))
    expect(schema.additionalProperties).toBe(false)
    expect(item.additionalProperties).toBe(false)
  })
})

const BRIEF: FitBrief = {
  roleTitle: 'Staff GenAI Engineer',
  company: 'Acme',
  verdict: 'Strongest on production retrieval.',
  requirements: [
    { requirement: 'Production RAG', fit: 'strong', evidence: 'I built it.', targets: ['role-illumina'] },
    { requirement: 'Rust', fit: 'not_on_file', evidence: '', targets: [] },
  ],
}

describe('roleLine', () => {
  it.each([
    [{ roleTitle: 'Engineer', company: 'Acme' }, 'Engineer at Acme'],
    [{ roleTitle: 'Engineer', company: '' }, 'Engineer'],
    [{ roleTitle: '', company: 'Acme' }, 'a role at Acme'],
    [{ roleTitle: '', company: '' }, 'this role'],
  ])('%o → %s', (parts, expected) => {
    expect(roleLine({ ...BRIEF, ...parts })).toBe(expected)
  })
})

describe('fitBriefToText', () => {
  it('summarises the brief for copy and chat history', () => {
    expect(fitBriefToText(BRIEF)).toBe(
      [
        'Fit brief — Staff GenAI Engineer at Acme',
        'Strongest on production retrieval.',
        '1 of 2 requirements evidenced:',
        '- Production RAG — Strong: I built it.',
        '- Rust — Not on file',
      ].join('\n')
    )
  })

  it('stays under the cap so it fits the chat route per-message limit', () => {
    const big: FitBrief = {
      ...BRIEF,
      requirements: Array.from({ length: 10 }, (_, i) => ({
        requirement: `Requirement ${i} `.repeat(8),
        fit: 'strong' as const,
        evidence: 'e'.repeat(400),
        targets: [],
      })),
    }
    expect(fitBriefToText(big).length).toBeLessThanOrEqual(FIT_TEXT_MAX_CHARS)
  })
})

describe('fitBriefMailto', () => {
  it('pre-fills an encoded subject and body', () => {
    const href = fitBriefMailto(BRIEF, 'me@example.com')
    const url = new URL(href)
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('me@example.com')
    expect(url.searchParams.get('subject')).toBe('Role: Staff GenAI Engineer at Acme')
    expect(url.searchParams.get('body')).toContain('I ran your fit check for Staff GenAI Engineer at Acme')
  })
})
