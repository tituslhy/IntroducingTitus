import { readFileSync } from 'fs'
import { join } from 'path'
import { ARTICLE_COUNT_NUMBER, BLOCKCHAIN_ARTICLE_COUNT } from './content'
import {
  EDUCATION,
  EMAIL,
  FEATURED_ARTICLES,
  OPEN_SOURCE,
  OTHER_CREDENTIALS,
  PROFICIENCY_SEPARATOR,
  PROJECTS,
  ROLES,
  STACK_GROUPS,
  SOCIAL,
  type Role,
} from './profile'
import { buildSystemPrompt, promptTokens } from './copilot-prompt'

// Normalises every dash-with-spaces to the en dash the prose renderer uses
// ("Jul 2026 — Present" → "Jul 2026 – Present"), so assertions compare content
// rather than the typographic dash.
const normaliseDashes = (s: string) => s.replace(/\s*[—–]\s*/g, ' – ')

// The REAL template and its rendered output. The drift guard below runs
// against this, not against a fixture, so it fails the moment the markdown,
// the profile data, or the renderer disagree.
const TEMPLATE_PATH = join(__dirname, '..', 'copilot-system-prompt.md')
const template = readFileSync(TEMPLATE_PATH, 'utf-8')
const rendered = buildSystemPrompt(template)

describe('buildSystemPrompt', () => {
  it('replaces known tokens with their values', () => {
    const out = buildSystemPrompt(`Mail {{EMAIL}} or read {{ARTICLE_COUNT}} articles.`)
    expect(out).toBe(`Mail ${EMAIL} or read ${ARTICLE_COUNT_NUMBER} articles.`)
  })

  it('replaces repeated occurrences of the same token', () => {
    const out = buildSystemPrompt('{{EMAIL}} and again {{EMAIL}}')
    expect(out).toBe(`${EMAIL} and again ${EMAIL}`)
  })

  it('leaves a token-free template unchanged', () => {
    const plain = '# Heading\n\nPlain prose with {single} braces, *markdown*, and a [link](https://example.com).'
    expect(buildSystemPrompt(plain)).toBe(plain)
  })

  it('returns an empty string for an empty template', () => {
    expect(buildSystemPrompt('')).toBe('')
  })

  it('strips a single-line HTML comment', () => {
    expect(buildSystemPrompt('<!-- maintainer note -->Hello')).toBe('Hello')
  })

  it('strips a multi-line HTML comment', () => {
    const template = ['<!--', '  note line one', '  note line two', '-->', 'Body'].join('\n')
    expect(buildSystemPrompt(template)).toBe('Body')
  })

  it('strips HTML comments that contain {{TOKENS}} without substituting or throwing', () => {
    const template = '<!-- uses {{EMAIL}} and {{NOT_A_REAL_TOKEN}} -->Visible {{EMAIL}}'
    const out = buildSystemPrompt(template)
    expect(out).toBe(`Visible ${EMAIL}`)
    expect(out).not.toContain('NOT_A_REAL_TOKEN')
  })

  it('strips every comment in a template, not just the first', () => {
    const out = buildSystemPrompt('<!-- one -->A<!-- two -->\nB')
    expect(out).not.toContain('<!--')
    expect(out).toContain('A')
    expect(out).toContain('B')
  })

  it('throws an error that names every unknown token', () => {
    expect(() => buildSystemPrompt('{{EXPERINECE}} then {{NOPE_ONE}} and {{EMAIL}}')).toThrow(
      /EXPERINECE, NOPE_ONE/
    )
  })

  it('names each unknown token once even when it repeats', () => {
    let message = ''
    try {
      buildSystemPrompt('{{TYPO}} {{TYPO}} {{TYPO}}')
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('TYPO')
    expect(message.match(/TYPO/g)).toHaveLength(1)
  })

  it('does not name known tokens in the unknown-token error', () => {
    let message = ''
    try {
      buildSystemPrompt('{{EMAIL}} {{MISSING_ONE}}')
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('MISSING_ONE')
    expect(message).not.toContain('EMAIL')
  })

  it('exposes a value for every token the real template uses', () => {
    const tokens = promptTokens()
    // Maintainer comments are stripped before substitution (and mention
    // "{{TOKENS}}" literally), so scan only what the model will see.
    const body = template.replace(/<!--[\s\S]*?-->/g, '')
    const used = Array.from(body.matchAll(/\{\{([A-Z0-9_]+)\}\}/g), (m) => m[1])
    for (const name of new Set(used)) {
      expect(Object.keys(tokens)).toContain(name)
    }
  })
})

describe('copilot-system-prompt.md (drift guard, rendered from the real template)', () => {
  it('has no unrendered {{ tokens }} left over', () => {
    expect(rendered).not.toContain('{{')
    expect(rendered).not.toContain('}}')
  })

  it('contains no HTML comment markers', () => {
    expect(rendered).not.toContain('<!--')
    expect(rendered).not.toContain('-->')
  })

  it(`uses the canonical article count (${ARTICLE_COUNT_NUMBER}) and blockchain count`, () => {
    expect(rendered).toContain(`${ARTICLE_COUNT_NUMBER} published technical articles`)
    expect(rendered).toContain(`${ARTICLE_COUNT_NUMBER} articles on Medium`)
    expect(rendered).toContain(`${BLOCKCHAIN_ARTICLE_COUNT} of them on blockchain`)
  })

  it('does not contain stale article counts', () => {
    expect(rendered).not.toMatch(/61 published/)
    expect(rendered).not.toMatch(/50 technical/)
  })

  it('every article-count mention in the prompt matches the canonical count', () => {
    const mentions = Array.from(
      rendered.matchAll(/(\d+)\+?\s+(?:published\s+)?(?:technical\s+)?articles?\b/gi),
      (m) => Number(m[1])
    )
    expect(mentions.length).toBeGreaterThan(0)
    for (const n of mentions) {
      expect(n).toBe(ARTICLE_COUNT_NUMBER)
    }
  })

  describe('experience', () => {
    it.each(ROLES.map((r) => [r.company, r] as const))('includes %s with its role and dates', (_company, role: Role) => {
      const header = `### ${role.company} — ${role.role} (${role.dates}, ${role.location})`
      expect(normaliseDashes(rendered)).toContain(normaliseDashes(header))
      expect(rendered).toContain(role.company)
      expect(rendered).toContain(role.role)
      expect(normaliseDashes(rendered)).toContain(normaliseDashes(role.dates))
    })

    it('includes every role copilot narrative verbatim', () => {
      for (const role of ROLES.filter((r) => r.copilot)) {
        expect(rendered).toContain(role.copilot)
      }
    })

    it('includes the Mastercard Agent Suite link inline in the deck', () => {
      const deckLink = ROLES[0].deckLink
      expect(deckLink).toBeDefined()
      expect(rendered).toContain(`${deckLink!.text} (${deckLink!.href})`)
    })
  })

  describe('projects', () => {
    it.each(PROJECTS.map((p) => [p.title, p] as const))('includes project %s', (title) => {
      expect(rendered).toContain(title)
    })

    it('includes every project copilot narrative verbatim', () => {
      for (const project of PROJECTS.filter((p) => p.copilot)) {
        expect(rendered).toContain(project.copilot)
      }
    })
  })

  describe('open source, writing, and contact', () => {
    it.each(OPEN_SOURCE.map((o) => [o.href] as const))('includes open-source link %s', (href) => {
      expect(rendered).toContain(href)
    })

    it.each(FEATURED_ARTICLES.map((a) => [a.n, a.href] as const))('includes featured article %s', (_n, href) => {
      expect(rendered).toContain(href)
    })

    it('includes the contact email', () => {
      expect(rendered).toContain(EMAIL)
    })

    it('includes every social link', () => {
      for (const href of Object.values(SOCIAL)) {
        if (href.startsWith('http')) expect(rendered).toContain(href)
      }
    })
  })

  describe('education and credentials', () => {
    it('includes every education institution and its degree', () => {
      for (const e of EDUCATION) {
        expect(rendered).toContain(e.institution)
        expect(rendered).toContain(e.degree)
      }
    })

    it('includes copilot-only honours that are not on the page', () => {
      for (const e of EDUCATION) {
        for (const honor of e.copilotHonors ?? []) {
          expect(rendered).toContain(honor)
        }
      }
    })

    it('includes the other credentials', () => {
      for (const credential of OTHER_CREDENTIALS) {
        expect(rendered).toContain(credential)
      }
    })
  })

  describe('tech stack', () => {
    it('includes copilot-only stack items such as TigerGraph and UiPath', () => {
      expect(rendered).toContain('TigerGraph')
      expect(rendered).toContain('UiPath')
    })

    it('includes every item of every stack group, including copilot-only groups', () => {
      for (const group of STACK_GROUPS) {
        expect(rendered).toContain(`${group.label}:`)
        for (const item of [...group.items, ...(group.more ?? [])]) {
          const name = item.split(PROFICIENCY_SEPARATOR)[0]
          expect(rendered).toContain(name)
        }
      }
    })

    it('formats proficiency as "Name (level)" in lower case', () => {
      expect(rendered).toContain('Python (expert)')
      expect(rendered).toContain('SQL (expert)')
      expect(rendered).toContain('Java (proficient)')
    })

    it('never renders the ◆ separator', () => {
      expect(rendered).not.toContain('◆')
    })
  })

  describe('voice', () => {
    it('never describes Titus in the third person with "Titus thought"', () => {
      expect(rendered).not.toContain('Titus thought')
    })

    it('does not use other third-person narration verbs for Titus', () => {
      expect(rendered).not.toMatch(/\bTitus (?:thought|was|has|did|says|writes)\b/)
    })
  })
})
